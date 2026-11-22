// قراءة/كتابة إعدادات المنصة (key/value) + المساعدات الافتراضية
import { prisma } from "./prisma";

// المفاتيح المعتمدة في لوحة الإدارة
export const SETTING_KEYS = [
  "telegram_link",
  "whatsapp_numbers", // JSON array أو قائمة مفصولة بفواصل
  "payment_instructions",
  "iban",
  "bank_name",
  "commission_rate",
  "platform_name_ar",
  "platform_name_en",
  "faq", // JSON array [{q, a}]
  "service_intro",
  "admin_notification_email",
  "max_file_size_mb", // حد حجم الملف الواحد في التخزين المركزي
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number];

export const DEFAULT_SETTINGS: Record<SettingKey, string> = {
  telegram_link: process.env.TELEGRAM_LINK || "https://t.me/Siraj1Academy",
  whatsapp_numbers: JSON.stringify(["966549604202", "966579769007"]),
  payment_instructions:
    "حوّل المبلغ إلى الحساب البنكي الموضح، ثم ارفع صورة السند من صفحة الطلب. تُراجع الإدارة الطلب خلال ساعات العمل. لا يُعد الدفع مكتملًا إلا بعد اعتماد السند.",
  iban: "",
  bank_name: "",
  commission_rate: "0.15",
  platform_name_ar: "أكاديمية سراج التعليمية",
  platform_name_en: "Siraj Educational Academy",
  faq: JSON.stringify([
    { q: "كيف أستفيد من شروحات المدرسين؟", a: "تصفح المقررات، اختر دورة المدرس، واحجزها ثم ارفع سند الحوالة وينتظر اعتماد الإدارة." },
    { q: "كيف أطلب شرحًا لمقرر؟", a: "أنشئ طلب شرحًا من حسابك الطلابي وسيقترح عليه المدرس المفعّلون عروضهم." },
    { q: "متى يظهر حساب المدرس؟", a: "بعد مراجعة الإدارة واعتماد ملف المدرس (status = APPROVED)." },
  ]),
  service_intro: "خدمات تدريبية وشرح أكاديمي تقدم ضمن لوائح النزاهة الأكاديمية: شرح وتدريب وتوجيه، وليس إنجاز أعمال جاهزة للمناقشة بدل الطالب.",
  admin_notification_email: process.env.ADMIN_NOTIFICATION_EMAIL || "owisowis821@gmail.com",
  max_file_size_mb: String(process.env.MAX_FILE_SIZE_MB || "100"),
};

export async function getSettings(): Promise<Record<string, string>> {
  const rows = await prisma.setting.findMany();
  const map: Record<string, string> = { ...DEFAULT_SETTINGS };
  for (const row of rows) map[row.key] = row.value;
  return map;
}

export async function getSetting(key: SettingKey | string): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key } });
  if (row) return row.value;
  return (DEFAULT_SETTINGS as Record<string, string>)[key] ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
}

export async function setSettings(values: Record<string, string>): Promise<void> {
  await prisma.$transaction(
    Object.entries(values).map(([key, value]) =>
      prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } }),
    ),
  );
}

// نسبة العمولة كرقم (0..1) مع قيمة أمانة
export async function getCommissionRate(): Promise<number> {
  const raw = await getSetting("commission_rate");
  const rate = Number(raw);
  if (Number.isFinite(rate) && rate >= 0 && rate < 1) return rate;
  return 0.15;
}

// أرقام الواتساب كقائمة
export async function getWhatsappNumbers(): Promise<string[]> {
  const raw = await getSetting("whatsapp_numbers");
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    // ليست JSON — نفصل بالفواصل
  }
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}
