// ============================================================
// إثبات تسليم بريد استعادة كلمة المرور عبر جلسة SMTP حقيقية (TCP) بدل المحاكاة.
//
// يقوم بـ:
//  1) تشغيل مستقبل SMTP محلي (خادم SMTP فعلي يفهم EHLO/MAIL/RCPT/DATA).
//  2) تشغيل الـAPI داخل العملية نفسها مع SMTP مضبوطًا على هذا المستقبل.
//  3) تسجيل مستخدم جديد، ثم طلب استعادة كلمة المرور عبر /auth/forgot-password.
//  4) انتظار وصول الرسالة فعليًا إلى المستقبل، وفك ترميزها، واستخراج الرابط.
//  5) استخدام الرابط لتعيين كلمة مرور جديدة، ثم الدخول بها بنجاح.
//
// التشغيل: npm run test:mail
// لا يحتاج إلى أي بيانات اعتماد خارجية ولا يرسل بريدًا حقيقيًا لأي شخص.
// ============================================================
import net from "net";
import type { Server } from "net";

interface ReceivedMessage {
  from: string;
  to: string[];
  raw: string;
}

/** مستقبل SMTP بسيط لكنه بروتوكول حقيقي: EHLO / MAIL / RCPT / DATA / QUIT */
function startSmtpSink(port: number): Promise<{ messages: ReceivedMessage[]; close: () => Promise<void> }> {
  const messages: ReceivedMessage[] = [];
  let open = true;

  const server: Server = net.createServer((socket) => {
    let buffer = "";
    let inData = false;
    let current: ReceivedMessage = { from: "", to: [], raw: "" };

    socket.write("220 localhost ESMTP Siraj Test Sink\r\n");

    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let idx = buffer.indexOf("\r\n");

      while (idx >= 0) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);

        if (inData) {
          if (line === ".") {
            inData = false;
            messages.push({ ...current, to: [...current.to] });
            current = { from: "", to: [], raw: "" };
            socket.write("250 2.0.0 Ok: queued as TEST-SINK\r\n");
          } else {
            // فك إزالة التكرار النقطي (dot-stuffing)
            current.raw += (line.startsWith("..") ? line.slice(1) : line) + "\r\n";
          }
        } else {
          const verb = line.slice(0, 4).toUpperCase();
          if (verb === "EHLO" || verb === "HELO") {
            socket.write("250-localhost\r\n250-SIZE 10485760\r\n250 8BITMIME\r\n");
          } else if (verb === "MAIL") {
            current.from = line;
            socket.write("250 2.1.0 Ok\r\n");
          } else if (verb === "RCPT") {
            current.to.push(line);
            socket.write("250 2.1.5 Ok\r\n");
          } else if (verb === "DATA") {
            inData = true;
            socket.write("354 End data with <CR><LF>.<CR><LF>\r\n");
          } else if (verb === "RSET") {
            current = { from: "", to: [], raw: "" };
            socket.write("250 2.0.0 Ok\r\n");
          } else if (verb === "QUIT") {
            socket.write("221 2.0.0 Bye\r\n");
            socket.end();
          } else {
            socket.write("250 2.0.0 Ok\r\n");
          }
        }

        idx = buffer.indexOf("\r\n");
      }
    });

    socket.on("error", () => {
      /* العميل أغلق الاتصال */
    });
  });

  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      resolve({
        messages,
        close: () =>
          new Promise<void>((done) => {
            if (!open) return done();
            open = false;
            server.close(() => done());
          }),
      });
    });
  });
}

/** فك ترميز جسم الرسالة (quoted-printable أو base64) إلى نص UTF-8 */
function decodeBody(raw: string): string {
  const split = raw.indexOf("\r\n\r\n");
  const headers = split >= 0 ? raw.slice(0, split) : "";
  const body = split >= 0 ? raw.slice(split + 4) : raw;

  if (/content-transfer-encoding:\s*base64/i.test(headers)) {
    return Buffer.from(body.replace(/\r?\n/g, ""), "base64").toString("utf8");
  }

  // quoted-printable: نبني بايتات ثم نحوّلها كـ UTF-8
  const bytes: number[] = [];
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === "=") {
      const next = body.slice(i + 1, i + 3);
      if (/^[0-9A-Fa-f]{2}$/.test(next)) {
        bytes.push(parseInt(next, 16));
        i += 2;
        continue;
      }
      if (body.slice(i + 1, i + 3) === "\r\n") {
        i += 2; // فاصل لين
        continue;
      }
    }
    bytes.push(ch.charCodeAt(0));
  }
  return Buffer.from(bytes).toString("utf8");
}

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
  console.log("اختبار تسليم بريد استعادة كلمة المرور عبر SMTP حقيقي");
  console.log("====================================================\n");

  const SMTP_PORT = 2526;
  const API_PORT = 4321;
  const sink = await startSmtpSink(SMTP_PORT);

  // إعدادات البريد تُضبط قبل تحميل التطبيق
  process.env.SMTP_HOST = "127.0.0.1";
  process.env.SMTP_PORT = String(SMTP_PORT);
  process.env.SMTP_SECURE = "false";
  process.env.SMTP_USER = "";
  process.env.SMTP_PASS = "";
  process.env.SMTP_FROM = "أكاديمية سراج <no-reply@siraj.test>";
  process.env.AUTH_RATE_LIMIT = "500";
  process.env.PASSWORD_RESET_RATE_LIMIT = "100";

  const { prisma } = await import("../src/lib/prisma");
  const { verifyMailTransport } = await import("../src/lib/mail");
  const { createApp } = await import("../src/app");

  const status = await verifyMailTransport();
  check("اتصال SMTP حقيقي ناجح (EHLO/NOOP)", status.ok && status.configured, `${status.host}:${status.port}`);

  const app = createApp();
  const server = app.listen(API_PORT);
  await new Promise<void>((r) => server.once("listening", () => r()));

  const api = (path: string, init?: RequestInit) =>
    fetch(`http://127.0.0.1:${API_PORT}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    });

  const stamp = `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
  const username = `mailtest_${stamp}`;
  const email = `mailtest_${stamp}@example.com`;
  const initialPassword = "MailTest2026";
  const newPassword = "MailReset2026";

  const reg = await api("/api/v1/auth/register/student", {
    method: "POST",
    body: JSON.stringify({
      fullName: "مختبر البريد",
      username,
      email,
      password: initialPassword,
      confirmPassword: initialPassword,
    }),
  });
  check("تسجيل مستخدم للاختبار", reg.status === 201, `HTTP ${reg.status}`);

  // تسجيل مستخدم يرسل بريد تفعيل + إشعار إدارة: ننتظر استقراره ثم نفرّغ المستقبل
  await sleep(700);
  sink.messages.length = 0;

  const forgot = await api("/api/v1/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
  const forgotBody = (await forgot.json()) as { data?: { message?: string } };
  check("طلب استعادة كلمة المرور", forgot.status === 200, `HTTP ${forgot.status}`);
  check(
    "الاستجابة لا تكشف وجود البريد",
    (forgotBody.data?.message ?? "").includes("إذا كان البريد مسجلًا"),
  );

  // انتظار وصول الرسالة إلى مستقبل SMTP
  let message: ReceivedMessage | undefined;
  for (let i = 0; i < 40 && !message; i++) {
    await sleep(250);
    message = sink.messages.find((m) => m.to.some((t) => t.includes(email)));
  }

  check("وصلت الرسالة فعليًا عبر جلسة SMTP", !!message);
  if (!message) {
    await new Promise<void>((r) => server.close(() => r()));
    await sink.close();
    await prisma.$disconnect();
    process.exitCode = 1;
    return;
  }

  const body = decodeBody(message.raw);
  const linkMatch = /(https?:\/\/[^\s]*\/reset-password\?token=([a-f0-9]{64}))/.exec(body);
  check("الرسالة تحتوي رابط استعادة مع رمز", !!linkMatch);
  check("رابط الاستعادة يشير إلى APP_BASE_URL (localhost)", (linkMatch?.[1] ?? "").includes("localhost:5173"));
  check("الرسالة لا تحتوي أي كلمة مرور", !body.includes(initialPassword) && !body.includes(newPassword));

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
  check("الدخول بكلمة المرور الجديدة بعد الاستعادة", login.status === 200, `HTTP ${login.status}`);

  const reused = await api("/api/v1/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, password: "MailReset2027", confirmPassword: "MailReset2027" }),
  });
  check("رفض إعادة استخدام الرابط بعد نجاحه", reused.status === 400, `HTTP ${reused.status}`);

  // سجل البريد: SENT مع معرّف المزود، ودون الرمز
  const log = await prisma.emailLog.findFirst({
    where: { recipient: email, type: "GENERAL", status: "SENT" },
    orderBy: { createdAt: "desc" },
  });
  const meta = (log?.metadata ?? {}) as Record<string, unknown>;
  check("تسجيل الرسالة كـ SENT في قاعدة البيانات", !!log, log?.status);
  check("حفظ معرّف الرسالة لدى المزود", typeof meta.messageId === "string" && String(meta.messageId).length > 0);
  check("سجل البريد لا يحتوي رمز الاستعادة", !JSON.stringify(meta).includes(token));

  await new Promise<void>((r) => server.close(() => r()));
  await sink.close();
  await prisma.$disconnect();

  const failed = results.filter((r) => !r.ok);
  console.log(`\nالنتيجة: ${results.length - failed.length}/${results.length} ناجح`);
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
