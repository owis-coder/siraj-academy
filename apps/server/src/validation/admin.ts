import { z } from "zod";
import { paginationSchema } from "./common";

// ---------- الجامعات/الكليات/التخصصات/المقررات ----------

export const adminUniversityCreate = z.object({
  name: z.string().trim().min(2, "اسم الجامعة قصير").max(150),
  slug: z.string().trim().max(150).optional().nullable(),
  city: z.string().trim().max(100).optional().nullable(),
  logoUrl: z.string().trim().max(500).optional().nullable(),
  isVisible: z.boolean().default(true),
  order: z.coerce.number().int().min(0).max(999).default(0),
});

export const adminUniversityUpdate = adminUniversityCreate.partial();

export const adminCollegeCreate = z.object({
  universityId: z.string().min(1, "حدد الجامعة"),
  name: z.string().trim().min(2, "اسم الكلية قصير").max(150),
});

export const adminCollegeUpdate = adminCollegeCreate.partial();

export const adminMajorCreate = z.object({
  universityId: z.string().min(1, "حدد الجامعة"),
  collegeId: z.string().min(1).optional().nullable(),
  name: z.string().trim().min(2, "اسم التخصص قصير").max(150),
});

export const adminMajorUpdate = adminMajorCreate.partial();

export const adminCourseCreate = z.object({
  universityId: z.string().min(1, "حدد الجامعة"),
  collegeId: z.string().min(1).optional().nullable(),
  majorId: z.string().min(1).optional().nullable(),
  title: z.string().trim().min(2, "عنوان المقرر قصير").max(200),
  code: z.string().trim().max(40).optional().nullable(),
  level: z.string().trim().max(40).optional().nullable(),
  description: z.string().trim().max(3000).optional().nullable(),
  isVisible: z.boolean().default(true),
  coverUrl: z.string().trim().max(500).optional().nullable(),
});

export const adminCourseUpdate = adminCourseCreate.partial();

export const adminCourseListSchema = paginationSchema.extend({
  universityId: z.string().min(1).optional(),
  collegeId: z.string().min(1).optional(),
  majorId: z.string().min(1).optional(),
});

// ---------- الخدمات ----------

export const adminServiceCreate = z.object({
  title: z.string().trim().min(2, "عنوان الخدمة قصير").max(150),
  slug: z.string().trim().max(100).optional().nullable(),
  category: z.enum([
    "PRIVATE_EXPLAIN",
    "LIVE_EXPLAIN",
    "SUMMARY",
    "TRANSLATION",
    "PPT",
    "PROGRAMMING_PROJECT",
    "RESEARCH_REVIEW",
    "PROOFREADING",
    "ACADEMIC_FORMAT",
    "HOMEWORK_TRAINING",
    "ACADEMIC_CONSULT",
    "CUSTOM",
  ]),
  description: z.string().trim().min(1, "أدخل وصف الخدمة").max(3000),
  basePrice: z.coerce.number().min(0).max(100000).optional().nullable(),
  durationDays: z.coerce.number().int().min(1).max(365).optional().nullable(),
  providerId: z.string().min(1).optional().nullable(),
  isActive: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
});

export const adminServiceUpdate = adminServiceCreate.partial();

// ---------- دورات المدرسين ----------

export const adminOfferingListSchema = paginationSchema.extend({
  status: z.enum(["DRAFT", "PENDING_REVIEW", "NEEDS_REVISION", "PUBLISHED", "HIDDEN", "REJECTED"]).optional(),
  q: z.string().trim().max(200).optional(),
});

export const adminOfferingUpdate = z.object({
  status: z.enum(["DRAFT", "PENDING_REVIEW", "NEEDS_REVISION", "PUBLISHED", "HIDDEN", "REJECTED"]),
  adminNote: z.string().trim().max(1000).optional(),
});

// مراجعة روابط الفيديو على مستوى الدورة والدرس
export const adminOfferingMediaReview = z
  .object({
    trialVideoStatus: z.enum(["PENDING_REVIEW", "APPROVED", "NEEDS_REVISION", "REJECTED"]).optional(),
    approveAllYoutube: z.boolean().optional(),
    approvedYoutubeUrls: z.array(z.string().url().max(400)).max(30).optional(),
    note: z.string().trim().max(1000).optional(),
  })
  .strict();

export const adminLessonMediaReview = z
  .object({
    reviewStatus: z.enum(["PENDING_REVIEW", "APPROVED", "NEEDS_REVISION", "REJECTED"]),
    note: z.string().trim().max(1000).optional(),
  })
  .strict();

export const adminModerationDecision = z
  .object({
    status: z.enum(["APPROVED", "REJECTED"]),
    note: z.string().trim().max(1000).optional(),
  })
  .strict();

// ---------- المدرسون/المستخدمون ----------

export const adminTeacherListSchema = paginationSchema.extend({
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "SUSPENDED"]).optional(),
});

export const adminUserListSchema = paginationSchema.extend({
  role: z.enum(["STUDENT", "TEACHER", "ADMIN"]).optional(),
});

export const adminUserUpdate = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED"]),
});

// ---------- الطلبات/الدفع/الإعلانات/البلاغات ----------

export const adminPaymentsListSchema = paginationSchema.extend({
  status: z.enum(["UNDER_REVIEW", "APPROVED", "REJECTED"]).optional(),
});

export const adminOrdersListSchema = paginationSchema.extend({
  status: z.enum(["AWAITING_PAYMENT", "AWAITING_REVIEW", "REJECTED", "PAID", "CANCELLED"]).optional(),
});

export const adminAdsListSchema = paginationSchema.extend({
  status: z.enum(["DRAFT", "PENDING_REVIEW", "APPROVED", "REJECTED", "HIDDEN", "EXPIRED"]).optional(),
});

export const adminRequestsListSchema = paginationSchema.extend({
  status: z.enum(["PENDING_REVIEW", "OPEN", "TEACHER_SELECTED", "CLOSED", "REJECTED"]).optional(),
});

export const adminReportsListSchema = paginationSchema.extend({
  status: z.enum(["NEW", "RESOLVED"]).optional(),
});

export const adminReportResolve = z.object({ status: z.enum(["NEW", "RESOLVED"]) });

// ---------- الإعدادات ----------

export const SETTING_KEY_LIST = [
  "telegram_link",
  "whatsapp_numbers",
  "payment_instructions",
  "iban",
  "bank_name",
  "commission_rate",
  "platform_name_ar",
  "platform_name_en",
  "faq",
  "service_intro",
] as const;

export const adminSettingsUpdate = z
  .object(
    Object.fromEntries(
      SETTING_KEY_LIST.map((k) => [k, z.string().max(4000).optional()]),
    ) as Record<(typeof SETTING_KEY_LIST)[number], z.ZodOptional<z.ZodString>>,
  )
  .refine((d) => Object.values(d).some((v) => v !== undefined && v !== ""), {
    message: "أرسل مفتاحًا واحدًا على الأقل لتحديث الإعدادات",
  });

// ---------- بث الإشعارات ----------

export const adminBroadcastSchema = z.object({
  role: z.enum(["STUDENT", "TEACHER", "ADMIN"]).optional(),
  title: z.string().trim().min(3, "عنوان الإشعار قصير").max(150),
  body: z.string().trim().max(2000).optional(),
  link: z.string().trim().max(400).optional(),
});
