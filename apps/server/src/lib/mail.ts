// خدمة إرسال البريد الإلكتروني — SMTP فعلي (Gmail / Brevo / Resend / Mailgun / أي مزود SMTP)
// مع وضع محاكاة آمن عند غياب الإعدادات، ومحاولات إعادة، وفحص اتصال صريح.
//
// ملاحظات نزاهة:
// - عند غياب SMTP_HOST لا يُدّعى أي إرسال: تُسجَّل الرسالة كـ SIMULATED فقط.
// - لا تُطبع أي بيانات اعتماد (اسم المستخدم/كلمة المرور) في السجلات.
// - لا يُسجَّل رمز الاستعادة أو محتوى الرسالة في قاعدة البيانات.
import nodemailer from "nodemailer";
import type { SendMailOptions, Transporter } from "nodemailer";
import { prisma } from "./prisma";

export interface MailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  type?: "REGISTRATION" | "CUSTOM_REQUEST" | "STATUS_UPDATE" | "GENERAL";
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
  forceResend?: boolean;
}

export interface MailResult {
  delivered: boolean;
  simulated?: boolean;
  error?: string;
  /** معرّف الرسالة لدى مزود البريد — دليل قبول المزود، وليس سرًا */
  messageId?: string;
  /** رد المزود المختصر (250 Ok …) */
  response?: string;
  /** رابط معاينة الرسالة في صندوق بريد اختباري (Ethereal فقط) — للتشخيص وليس سرًا */
  previewUrl?: string;
}

export interface SmtpStatus {
  configured: boolean;
  ok: boolean;
  host?: string;
  port?: number;
  secure?: boolean;
  from?: string;
  error?: string;
}

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
}

/** يقرأ إعدادات SMTP من البيئة في وقت التشغيل (قابل للتغيير دون إعادة بناء) */
function getSmtpConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST?.trim();
  if (!host) return null;

  const port = Number(process.env.SMTP_PORT || 587);
  // secure=true لمنفذ 465 افتراضيًا، ويمكن تجاوزه صراحة بـ SMTP_SECURE
  const secure = process.env.SMTP_SECURE
    ? process.env.SMTP_SECURE === "true"
    : port === 465;
  const user = process.env.SMTP_USER?.trim() || undefined;
  const pass = process.env.SMTP_PASS || undefined;
  const from = (process.env.SMTP_FROM || "أكاديمية سراج <no-reply@siraj.sa>").trim();

  return {
    host,
    port: Number.isFinite(port) ? port : 587,
    secure,
    user,
    pass,
    from,
  };
}

function createTransport(cfg: SmtpConfig): Transporter {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    // مهلات صريحة: لا نترك الخادم معلّقًا إذا كان المزود لا يستجيب
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    auth: cfg.user && cfg.pass ? { user: cfg.user, pass: cfg.pass } : undefined,
  });
}

/** فحص الاتصال والاعتماد مع مزود SMTP دون إرسال أي رسالة */
export async function verifyMailTransport(): Promise<SmtpStatus> {
  const cfg = getSmtpConfig();
  if (!cfg) {
    return {
      configured: false,
      ok: false,
      error: "SMTP غير مُهيأ: عيّن SMTP_HOST وSMTP_PORT وبيانات الاعتماد في .env",
    };
  }

  const transport = createTransport(cfg);
  try {
    await transport.verify();
    return { configured: true, ok: true, host: cfg.host, port: cfg.port, secure: cfg.secure, from: cfg.from };
  } catch (err) {
    return {
      configured: true,
      ok: false,
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      from: cfg.from,
      // رسالة المزود قد تحوي اسم المستخدم؛ نُبقيها عامة
      error: (err as Error)?.message?.slice(0, 300) || "تعذّر الاتصال بمزود البريد",
    };
  } finally {
    transport.close();
  }
}

function cleanHeader(val: string): string {
  // منع حقن ترويسات البريد الإلكتروني (CRLF injection)
  return val.replace(/[\r\n]+/g, " ").trim();
}

const PREVIEW_TOKEN = /MSGID=([A-Za-z0-9.\-_]+)/;

/**
 * صندوق Ethereal الاختباري يعيد معرّف الرسالة داخل رد SMTP (MSGID=...) ويمكن قراءة الرسالة عبر رابط.
 * نستخرج الرابط فقط للمضيف الاختباري؛ المزودون الحقيقيون لا يكشفون رسائلهم برابط عام.
 */
function buildPreviewUrl(cfg: SmtpConfig, response: unknown): string | undefined {
  if (!/ethereal\.email/i.test(cfg.host)) return undefined;
  const match = PREVIEW_TOKEN.exec(String(response ?? ""));
  return match ? `https://ethereal.email/message/${match[1]}` : undefined;
}

/** هل المزود رفض كل المستقبلين؟ (يُعد فشلًا وإن عاد الطلب بلا استثناء) */
function allRecipientsRejected(info: { accepted?: unknown[]; rejected?: unknown[] }): boolean {
  const accepted = Array.isArray(info.accepted) ? info.accepted.length : 0;
  const rejected = Array.isArray(info.rejected) ? info.rejected.length : 0;
  return accepted === 0 && rejected > 0;
}

export async function sendMail(input: MailInput): Promise<MailResult> {
  const to = cleanHeader(input.to);
  const subject = cleanHeader(input.subject);
  const type = input.type || "GENERAL";

  // فحص منع التكرار (Idempotency) إذا تم توفير مفتاح ولم يُطلب فرض الإرسال
  if (input.idempotencyKey && !input.forceResend) {
    try {
      const existing = await prisma.emailLog.findFirst({
        where: {
          type,
          recipient: to,
          status: "SENT",
          metadata: {
            path: ["idempotencyKey"],
            equals: input.idempotencyKey,
          },
        },
      });
      if (existing) {
        console.log(`[MAIL] تجاوز إرسال مكرر للمفتاح: ${input.idempotencyKey}`);
        return { delivered: true };
      }
    } catch {
      // إذا فشل فحص السجل نتابع الإرسال بأمان
    }
  }

  const cfg = getSmtpConfig();
  const transport = cfg ? createTransport(cfg) : null;

  if (!cfg || !transport) {
    // وضع التطوير والاختبار المحلي: لا يتم إدعاء الإرسال الحقيقي بل يُسجل كـ SIMULATED
    console.log(`\n================== [MAIL:TEST_MODE] ==================`);
    console.log(`إلى: ${to}`);
    console.log(`الموضوع: ${subject}`);
    console.log(`النوع: ${type}`);
    console.log(`المحتوى النصي:\n${input.text}`);
    console.log(`=====================================================\n`);

    try {
      await prisma.emailLog.create({
        data: {
          type,
          recipient: to,
          subject,
          status: "SIMULATED",
          metadata: input.metadata ? (input.metadata as never) : undefined,
        },
      });
    } catch (e) {
      console.error("[MAIL] تعذر تسجيل الإرسال في قاعدة البيانات:", e);
    }

    return { delivered: false, simulated: true };
  }

  const sender = cleanHeader(cfg.from);
  const maxAttempts = 3;
  let lastError: Error | null = null;

  const payload: SendMailOptions = {
    from: sender,
    to,
    subject,
    text: input.text,
    ...(input.html ? { html: input.html } : {}),
    ...(input.replyTo ? { replyTo: cleanHeader(input.replyTo) } : {}),
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const info = await transport.sendMail(payload);

      if (allRecipientsRejected(info)) {
        throw new Error(`رفض المزود كل المستقبلين (${String(info.response ?? "").slice(0, 200)})`);
      }

      console.log(`[MAIL:sent] قبل المزود الرسالة إلى: ${to} (المحاولة ${attempt})`);

      const previewUrl = buildPreviewUrl(cfg, info.response);

      try {
        await prisma.emailLog.create({
          data: {
            type,
            recipient: to,
            subject,
            status: "SENT",
            metadata: {
              ...(input.metadata ?? {}),
              // معرّف المزود فقط — لا يحتوي رمزًا سريًا
              ...(info.messageId ? { messageId: String(info.messageId) } : {}),
              ...(previewUrl ? { previewUrl } : {}),
              ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
            } as never,
          },
        });
      } catch (logErr) {
        console.error("[MAIL] تعذر تسجيل نجاح الإرسال في قاعدة البيانات:", logErr);
      }

      transport.close();
      return {
        delivered: true,
        messageId: info.messageId ? String(info.messageId) : undefined,
        response: info.response ? String(info.response).slice(0, 200) : undefined,
        previewUrl,
      };
    } catch (err) {
      lastError = err as Error;
      console.warn(
        `[MAIL:retry] فشلت المحاولة ${attempt}/${maxAttempts} لإرسال البريد إلى ${to}:`,
        (err as Error)?.message || err,
      );
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, attempt * 1000));
      }
    }
  }

  const errorMessage = lastError?.message || "Unknown error";
  console.error(`[MAIL:failed] تعذر إرسال البريد بعد ${maxAttempts} محاولات:`, errorMessage);
  transport.close();

  try {
    await prisma.emailLog.create({
      data: {
        type,
        recipient: to,
        subject,
        status: "FAILED",
        error: errorMessage.slice(0, 500),
        metadata: input.metadata ? (input.metadata as never) : undefined,
      },
    });
  } catch (logErr) {
    console.error("[MAIL] تعذر تسجيل فشل الإرسال في قاعدة البيانات:", logErr);
  }

  return { delivered: false, error: errorMessage };
}
