// ============================================================
// إثبات وصول رسالة استعادة كلمة المرور فعليًا إلى صندوق وارد حقيقي.
//
// ماذا يفعل؟
//  1) ينشئ صندوق بريد اختباري مستضاف على Ethereal (SMTP حقيقي على smtp.ethereal.email، TLS + اعتماد).
//  2) يشغّل الـAPI داخل العملية نفسها مع SMTP مضبوطًا على هذا الصندوق.
//  3) يسجّل مستخدمًا، ثم يطلب استعادة كلمة المرور عبر /auth/forgot-password (نفس مسار الموقع).
//  4) ينتظر قبول المزود للرسالة، ثم يقرأ الرسالة من صندوق الوارد عبر رابط المعاينة ويستخرج الرابط.
//  5) يفتح رابط الاستعادة من الرسالة، يعيّن كلمة مرور جديدة، ويسجّل الدخول بها.
//
// التشغيل: npm run mail:inbox
// لا يحتاج إلى بيانات اعتماد مسبقة ولا يرسل بريدًا إلى أي شخص آخر.
// ملاحظة: Ethereal صندوق اختبار — ليس بديلًا عن مزود إنتاج مثل Gmail أو Brevo.
// ============================================================
import nodemailer from "nodemailer";
import { PrismaClient } from "@prisma/client";

const API_PORT = 4323;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const results: Array<{ name: string; ok: boolean; detail?: string }> = [];
  const check = (name: string, ok: boolean, detail?: string) => {
    results.push({ name, ok, detail });
    console.log(`${ok ? "PASS" : "FAIL"} — ${name}${detail ? ` (${detail})` : ""}`);
  };

  console.log("====================================================");
  console.log("اختبار وصول بريد استعادة كلمة المرور إلى صندوق وارد");
  console.log("====================================================\n");

  console.log("— إنشاء صندوق بريد اختباري مستضاف (Ethereal) —");
  const account = await nodemailer.createTestAccount();

  // نضبط البيئة قبل تحميل التطبيق حتى يقرأ mail.ts هذه القيم
  process.env.SMTP_HOST = account.smtp.host;
  process.env.SMTP_PORT = String(account.smtp.port);
  process.env.SMTP_SECURE = String(account.smtp.secure);
  process.env.SMTP_USER = account.user;
  process.env.SMTP_PASS = account.pass;
  process.env.SMTP_FROM = `أكاديمية سراج <${account.user}>`;
  process.env.PASSWORD_RESET_RATE_LIMIT = "100";
  process.env.AUTH_RATE_LIMIT = "500";

  const { prisma } = (await import("../src/lib/prisma")) as unknown as { prisma: PrismaClient };
  const { verifyMailTransport } = await import("../src/lib/mail");
  const { createApp } = await import("../src/app");

  const smtp = await verifyMailTransport();
  check("اتصال SMTP حقيقي بالصندوق المستضاف", smtp.ok && smtp.configured, `${smtp.host}:${smtp.port}`);
  if (!smtp.ok) {
    console.error(`  تعذر الاتصال: ${smtp.error}`);
    process.exitCode = 1;
    await prisma.$disconnect();
    return;
  }

  const app = createApp();
  const server = app.listen(API_PORT);
  await new Promise<void>((r) => server.once("listening", () => r()));

  const api = (path: string, init?: RequestInit) =>
    fetch(`http://127.0.0.1:${API_PORT}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    });

  const stamp = `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
  const username = `inbox_${stamp}`;
  const email = account.user;
  const initialPassword = "InboxTest2026";
  const newPassword = "InboxReset2026";

  const reg = await api("/api/v1/auth/register/student", {
    method: "POST",
    body: JSON.stringify({
      fullName: "مستلم البريد",
      username,
      email,
      password: initialPassword,
      confirmPassword: initialPassword,
    }),
  });
  check("تسجيل مستخدم مرتبط بالصندوق", reg.status === 201, `HTTP ${reg.status}`);

  const forgot = await api("/api/v1/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
  check("طلب استعادة كلمة المرور من مسار الموقع", forgot.status === 200, `HTTP ${forgot.status}`);

  // ننتظر سجل الإرسال الناجح مع رابط صندوق الوارد
  type LogRow = { status: string; subject: string; metadata: unknown };
  let log: LogRow | undefined;
  for (let i = 0; i < 40 && !log; i++) {
    await sleep(250);
    const row = await prisma.emailLog.findFirst({
      where: { recipient: email, subject: "إعادة تعيين كلمة المرور — أكاديمية سراج" },
      orderBy: { createdAt: "desc" },
    });
    if (row?.status === "SENT") log = { status: row.status, subject: row.subject, metadata: row.metadata };
  }

  check("قبل المزود رسالة الاستعادة (SENT)", !!log, log?.status);
  const meta = (log?.metadata ?? {}) as Record<string, unknown>;
  const previewUrl = typeof meta.previewUrl === "string" ? meta.previewUrl : "";
  check("الرسالة موجودة في صندوق الوارد برابط معاينة", !!previewUrl);

  if (!previewUrl) {
    await new Promise<void>((r) => server.close(() => r()));
    await prisma.$disconnect();
    process.exitCode = 1;
    return;
  }

  // قراءة الرسالة من صندوق الوارد نفسه
  const page = await fetch(previewUrl);
  const html = await page.text();
  check("فتح الرسالة من صندوق الوارد", page.ok, `HTTP ${page.status}`);
  check("صندوق الوارد يعرض موضوع الرسالة", html.includes("إعادة تعيين كلمة المرور"));

  const linkMatch = /(https?:\/\/[^\s"'<>]+\/reset-password\?token=([a-f0-9]{64}))/.exec(
    html.replace(/&#x3D;/g, "=").replace(/&amp;/g, "&"),
  );
  check("الرسالة تحتوي رابط استعادة صالحًا", !!linkMatch);
  check("الرابط يشير إلى واجهة الموقع الحالية", (linkMatch?.[1] ?? "").includes("/reset-password?token="));

  const token = linkMatch?.[2] ?? "";
  const reset = await api("/api/v1/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, password: newPassword, confirmPassword: newPassword }),
  });
  check("تعيين كلمة المرور من الرابط المستلم", reset.status === 200, `HTTP ${reset.status}`);

  const login = await api("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ identifier: email, password: newPassword }),
  });
  check("الدخول بكلمة المرور الجديدة", login.status === 200, `HTTP ${login.status}`);

  const reused = await api("/api/v1/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, password: "InboxReset2027", confirmPassword: "InboxReset2027" }),
  });
  check("رفض إعادة استخدام الرابط", reused.status === 400, `HTTP ${reused.status}`);

  check("الرسالة لا تحتوي كلمة المرور", !html.includes(initialPassword) && !html.includes(newPassword));

  await new Promise<void>((r) => server.close(() => r()));
  await prisma.$disconnect();

  const failed = results.filter((r) => !r.ok);
  console.log(`\nالنتيجة: ${results.length - failed.length}/${results.length} ناجح`);
  console.log(`\nصندوق الوارد: ${previewUrl}`);
  console.log(`بريد الصندوق: ${email}`);
  if (failed.length) {
    console.log("\nفشل:");
    failed.forEach((f) => console.log(` - ${f.name}${f.detail ? ` (${f.detail})` : ""}`));
  }
  process.exitCode = failed.length ? 1 : 0;
}

void main().catch((err) => {
  console.error("\n[FATAL]", err);
  process.exitCode = 1;
});
