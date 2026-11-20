import { Router } from "express";
import { getSettings, getWhatsappNumbers } from "../lib/settings";
import { getSecuritySettings } from "../lib/securitySettings";
import { asyncHandler } from "../middleware/errorHandler";

const router = Router();

// تسميات فئات الخدمات بالعربية (مرجع للواجهة)
export const SERVICE_CATEGORY_LABELS: Record<string, string> = {
  PRIVATE_EXPLAIN: "شرح خاص",
  LIVE_EXPLAIN: "شرح مباشر",
  SUMMARY: "تلخيص وتدريب",
  TRANSLATION: "ترجمة وتدريب",
  PPT: "عروض تقديمية (تدريب)",
  PROGRAMMING_PROJECT: "مشاريع برمجية (تدريب)",
  RESEARCH_REVIEW: "مراجعة بحث (توجيه)",
  PROOFREADING: "تدقيق لغوي (تدريب)",
  ACADEMIC_FORMAT: "تنسيق أكاديمي (تدريب)",
  HOMEWORK_TRAINING: "تدريب على الواجبات",
  ACADEMIC_CONSULT: "استشارة أكاديمية",
  CUSTOM: "خدمة مخصصة",
};

// معلومات المنصة للواجهة العامة (/platform/info و(/platform/public) كمرادف)
async function platformInfoHandler(_req: unknown, res: import("express").Response) {
  const settings = await getSettings();
  const whatsapp = await getWhatsappNumbers();

  let faq: Array<{ q: string; a: string }> = [];
  try {
    const parsedFaq = JSON.parse(settings.faq || "[]");
    if (Array.isArray(parsedFaq)) faq = parsedFaq;
  } catch {
    faq = [];
  }

  let categories: Array<{ value: string; label: string }> = [];
  try {
    const parsedCats = JSON.parse(settings.service_categories_json || "[]");
    if (Array.isArray(parsedCats)) categories = parsedCats;
  } catch {
    categories = [];
  }

  res.json({
    data: {
      name: {
        ar: settings.platform_name_ar || "أكاديمية سراج التعليمية",
        en: settings.platform_name_en || "Siraj Educational Academy",
      },
      telegram_link: settings.telegram_link,
      whatsapp_numbers: whatsapp,
      payment_instructions_preview: settings.payment_instructions,
      commission_note: "تستخدم المنصة تحويلًا بنكيًا يدويًا، ولا يُعد الدفع مكتملًا إلا بعد مراجعة الإدارة.",
      service_intro: settings.service_intro,
      service_categories: categories.length > 0
        ? categories
        : Object.entries(SERVICE_CATEGORY_LABELS).map(([value, label]) => ({ value, label })),
      faq,
      recaptcha: {
        enabled: process.env.NODE_ENV === "production" || (await getSecuritySettings()).recaptchaEnabled,
        siteKey: process.env.RECAPTCHA_SITE_KEY || "",
        mode: (await getSecuritySettings()).recaptchaMode || "v2",
      },
      oauth: {
        googleEnabled: Boolean(process.env.GOOGLE_CLIENT_ID),
        googleClientId: process.env.GOOGLE_CLIENT_ID || "",
      },
    },
  });
}

router.get("/info", asyncHandler(platformInfoHandler));
router.get("/public", asyncHandler(platformInfoHandler));

export default router;
