// ============================================================
// تهيئة قاعدة البيانات: إعدادات المنصة + حساب إداري + الجامعات السعودية الحقيقية.
// ⚠️ لا يُدخل أي بيانات وهمية: لا طلاب/مدرسون/دورات/طلبات/عروض/مدفوعات/مراجعات.
// ============================================================
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// الجامعات السعودية الحقيقية الحكومية والأهلية المعروفة (قد تضاف من الإدارة المزيد)
const SAUDI_UNIVERSITIES: Array<{ name: string; city?: string }> = [
  { name: "جامعة الملك سعود", city: "الرياض" },
  { name: "جامعة الإمام محمد بن سعود الإسلامية", city: "الرياض" },
  { name: "جامعة الملك سعود بن عبد العزيز للعلوم الصحية", city: "الرياض" },
  { name: "جامعة الأميرة نورة بنت عبد الرحمن", city: "الرياض" },
  { name: "جامعة الملك فهد الأهلية", city: "الرياض" },
  { name: "جامعة الأمير سلطان", city: "الرياض" },
  { name: "الجامعة السعودية الإلكترونية", city: "الرياض" },
  { name: "جامعة سلمان بن عبد العزيز", city: "الخرج" },
  { name: "جامعة شقراء", city: "شقراء" },
  { name: "جامعة المجمعة", city: "المجمعة" },
  { name: "جامعة الملك عبد العزيز", city: "جدة" },
  { name: "جامعة أم القرى", city: "مكة المكرمة" },
  { name: "جامعة الطائف", city: "الطائف" },
  { name: "جامعة الملك فهد للبترول والمعادن", city: "الظهران" },
  { name: "جامعة الإمام عبد الرحمن بن فيصل", city: "الدمام" },
  { name: "جامعة الأمير محمد بن فهد", city: "الخبر" },
  { name: "جامعة الأمير محمد بن سلمان", city: "الجبيل" },
  { name: "جامعة الملك فيصل", city: "الأحساء" },
  { name: "جامعة الملك خالد", city: "أبها" },
  { name: "جامعة الأمير فهد بن سلطان", city: "خميس مشيط" },
  { name: "جامعة القصيم", city: "بريدة" },
  { name: "جامعة حائل", city: "حائل" },
  { name: "جامعة طيبة", city: "المدينة المنورة" },
  { name: "جامعة تبوك", city: "تبوك" },
  { name: "جامعة الجوف", city: "سكاكا" },
  { name: "جامعة القريات", city: "القريات" },
  { name: "جامعة الحدود الشمالية", city: "عرعر" },
  { name: "جامعة نجران", city: "نجران" },
  { name: "جامعة جازان", city: "جازان" },
  { name: "جامعة الباحة", city: "الباحة" },
  { name: "جامعة دار الحكمة", city: "جدة" },
  { name: "جامعة عرار", city: "الخبر" },
];

interface SeedSetting {
  key: string;
  value: string;
}

const DEFAULT_SETTINGS: SeedSetting[] = [
  { key: "telegram_link", value: process.env.TELEGRAM_LINK || "https://t.me/Siraj1Academy" },
  { key: "whatsapp_numbers", value: JSON.stringify(["966549604202", "966579769007"]) },
  {
    key: "payment_instructions",
    value:
      "حوّل المبلغ إلى الحساب البنكي الموضح في صفحة الطلب، ثم ارفع صورة السند من نفس الصفحة. تُراجع الإدارة السند خلال ساعات العمل، ولا يُعد الدفع مكتملًا إلا بعد الاعتماد.",
  },
  { key: "iban", value: "" },
  { key: "bank_name", value: "" },
  { key: "commission_rate", value: "0.15" },
  { key: "platform_name_ar", value: "أكاديمية سراج التعليمية" },
  { key: "platform_name_en", value: "Siraj Educational Academy" },
  {
    key: "faq",
    value: JSON.stringify([
      { q: "كيف أستفيد من شروحات المدرسين؟", a: "تصفح جامعتك ثم مقررك، اختر دورة مفعّلة، حجزها، ثم ارفع سند الحوالة وانتظر اعتماد الإدارة." },
      { q: "كيف أطلب شرحًا لمقرر؟", a: "من حسابك الطلابي أنشئ طلب شرحًا؛ بعد موافقة الإدارة يُنشر ويُقدّم المدرسون المفعّلون عروضهم." },
      { q: "متى يظهر حساب المدرس؟", a: "بعد مراجعة الإدارة واعتماده؛ لا يظهر محتوى أي مدرس قبل الاعتماد." },
      { q: "هل الدفع تلقائي؟", a: "لا — الدفع تحويل بنكي يدوي، ولا يُعد مكتملًا إلا بعد اعتماد السند من الإدارة." },
    ]),
  },
  {
    key: "service_intro",
    value:
      "خدمات شرح وتدريب أكاديمي ضمن لوائح النزاهة: تدريب وشرح وتوجيه — لا تسليم أعمال جاهزة تُقدَّم بدل الطالب.",
  },
];

async function main(): Promise<void> {
  await prisma.$connect();
  console.log("[seed] متصل بقاعدة البيانات");

  // 1) الإعدادات (لا تتضمن override للقيم المدخلة مسبقًا)
  for (const s of DEFAULT_SETTINGS) {
    await prisma.setting.upsert({ where: { key: s.key }, update: {}, create: { key: s.key, value: s.value } });
  }
  console.log(`[seed] الإعدادات: ${DEFAULT_SETTINGS.length} مفتاح مُهيّأ`);

  // 2) الحساب الإداري الافتراضي
  const adminEmail = "admin@siraj.sa";
  const adminPassword = "Siraj@2026Admin";
  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!existingAdmin) {
    await prisma.user.create({
      data: {
        fullName: "إدارة أكاديمية سراج",
        username: "siraj_admin",
        email: adminEmail,
        passwordHash: await bcrypt.hash(adminPassword, 10),
        role: "ADMIN",
        status: "ACTIVE",
        emailVerified: true,
      },
    });
    console.log("[seed] أنشئ الحساب الإداري: admin@siraj.sa / Siraj@2026Admin");
  } else {
    console.log("[seed] الحساب الإداري موجود مسبقًا");
  }

  // 3) الجامعات السعودية الحقيقية (بدون تبعيات وهمية)
  let createdU = 0;
  let skippedU = 0;
  for (let i = 0; i < SAUDI_UNIVERSITIES.length; i++) {
    const uni = SAUDI_UNIVERSITIES[i];
    const slug = (() => {
      const base = uni.name
        .trim()
        .replace(/[\s/\\]+/g, "-")
        .replace(/[^\p{L}\p{N}\-]/gu, "")
        .replace(/-{2,}/g, "-")
        .replace(/^-+|-+$/g, "");
      return base || `university-${i + 1}`;
    })();
    const exists = await prisma.university.findUnique({ where: { slug }, select: { id: true } });
    if (exists) {
      skippedU++;
      continue;
    }
    await prisma.university.create({
      data: { name: uni.name, city: uni.city, slug, order: i, isVisible: true },
    });
    createdU++;
  }
  console.log(`[seed] الجامعات: أُنشئ ${createdU} وتجاوز ${skippedU} موجودة مسبقًا`);

  console.log("[seed] اكتملت التهيئة — بقي كل المحتوى الحقيقي (لا بيانات وهمية).");
}

main()
  .catch((err: unknown) => {
    console.error("\n[seed] فشلت التهيئة:");
    const message = err instanceof Error ? err.message : String(err);
    if (/Can't reach database server|P1001|ECONNREFUSED/i.test(message)) {
      console.error("[seed] لا يمكن الاتصال بقاعدة البيانات PostgreSQL.");
      console.error("[seed] شغّل قاعدة البيانات أولًا:  docker compose up -d  (من جذر المشروع)");
      console.error("[seed] ثم أعد المحاولة:  npm run seed");
    } else {
      console.error(message);
    }
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
