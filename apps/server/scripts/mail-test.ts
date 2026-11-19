// ============================================================
// فحص إعدادات البريد وإرسال رسالة اختبار حقيقية إلى صندوق وارد.
// التشغيل:  npm run mail:test -- you@example.com
//
// - يطبع ملخص الاتصال (المضيف/المنفذ/التشفير/المرسل) دون أي كلمة مرور.
// - يتحقق من الاتصال والاعتماد ثم يرسل رسالة، ويطبع معرّف الرسالة لدى المزود.
// - يعيد رمز خروج غير صفري عند أي فشل.
// ============================================================
import { prisma } from "../src/lib/prisma";
import { sendMail, verifyMailTransport } from "../src/lib/mail";

async function main() {
  const to = process.argv[2]?.trim();
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    console.error("الاستخدام: npm run mail:test -- you@example.com");
    process.exitCode = 1;
    return;
  }

  console.log("— فحص اتصال SMTP —");
  const status = await verifyMailTransport();

  if (!status.configured) {
    console.error("✗ البريد غير مُهيأ (وضع المحاكاة).");
    console.error("  أضف إلى apps/server/.env: SMTP_HOST و SMTP_PORT و SMTP_USER و SMTP_PASS و SMTP_FROM");
    console.error("  ثم أعد تشغيل الخادم وشغّل هذا الفحص مجددًا.");
    process.exitCode = 1;
    return;
  }

  console.log(`  المضيف: ${status.host}:${status.port} | التشفير المباشر: ${status.secure ? "نعم (SMTPS)" : "لا (STARTTLS إن أُعلن)"}`);
  console.log(`  المرسل: ${status.from}`);
  if (!status.ok) {
    console.error(`✗ فشل الاتصال أو الاعتماد: ${status.error}`);
    console.error("  تحقق من صحة المضيف/المنفذ/بيانات الاعتماد، وأن المرسل موثّق لدى المزود.");
    process.exitCode = 1;
    return;
  }
  console.log("✓ الاتصال والاعتماد ناجحان.");

  console.log(`\n— إرسال رسالة اختبار إلى ${to} —`);
  const stamp = new Date().toISOString();
  const result = await sendMail({
    to,
    subject: "رسالة اختبار من أكاديمية سراج",
    text:
      `هذه رسالة اختبار للتأكد من إعدادات البريد في منصة سراج.\n\n` +
      `الوقت: ${stamp}\n` +
      `إذا وصلتك هذه الرسالة فإن روابط تفعيل الحساب واستعادة كلمة المرور ستعمل عبر البريد الحقيقي.\n\n` +
      `أكاديمية سراج التعليمية`,
    type: "GENERAL",
  });

  if (result.delivered) {
    console.log("✓ قبل المزود الرسالة.");
    if (result.messageId) console.log(`  معرّف الرسالة: ${result.messageId}`);
    if (result.response) console.log(`  رد المزود: ${result.response}`);
    console.log("  تحقق الآن من صندوق الوارد (ومجلد الرسائل غير المرغوبة).");
  } else if (result.simulated) {
    console.error("✗ لم تُرسل الرسالة: الإعدادات غير مكتملة (وضع المحاكاة).");
    process.exitCode = 1;
  } else {
    console.error(`✗ فشل الإرسال: ${result.error}`);
    process.exitCode = 1;
  }

  const log = await prisma.emailLog.findFirst({
    where: { recipient: to, subject: "رسالة اختبار من أكاديمية سراج" },
    orderBy: { createdAt: "desc" },
  });
  if (log) console.log(`  حالة السجل في قاعدة البيانات: ${log.status}`);
  await prisma.$disconnect();
}

void main().catch(async (err) => {
  console.error("[mail:test] خطأ غير متوقع:", (err as Error)?.message ?? err);
  await prisma.$disconnect();
  process.exitCode = 1;
});
