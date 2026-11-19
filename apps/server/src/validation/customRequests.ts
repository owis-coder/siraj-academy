import { z } from "zod";
import { paginationSchema } from "./common";

export const CUSTOM_REQUEST_TYPES = [
  "COURSE_EXPLAIN",      // شرح مقرر
  "TOPIC_EXPLAIN",       // شرح موضوع
  "TRANSLATION",         // ترجمة
  "SUMMARY",             // تلخيص
  "PPT",                 // عرض PowerPoint
  "PROGRAMMING_PROJECT", // مشروع برمجي تعليمي
  "OTHER",               // خدمة أخرى
] as const;

export const CUSTOM_REQUEST_STATUSES = [
  "NEW",               // جديد
  "UNDER_REVIEW",      // قيد المراجعة
  "AWAITING_RESPONSE", // بانتظار الرد
  "ACCEPTED",          // قُبل
  "REJECTED",          // رُفض
  "IN_PROGRESS",       // قيد التنفيذ
  "COMPLETED",         // مكتمل
] as const;

export const createCustomRequestSchema = z.object({
  requestType: z.enum(CUSTOM_REQUEST_TYPES, {
    errorMap: () => ({ message: "نوع الطلب غير صحيح" }),
  }),
  title: z
    .string()
    .trim()
    .min(3, "اسم المقرر أو الخدمة لا يقل عن 3 أحرف")
    .max(200, "اسم المقرر أو الخدمة طويل جدًا"),
  description: z
    .string()
    .trim()
    .min(10, "الوصف التفصيلي لا يقل عن 10 أحرف")
    .max(5000, "الوصف طويل جدًا"),
  universityName: z.string().trim().max(150).optional(),
  majorName: z.string().trim().max(150).optional(),
  academicLevel: z.string().trim().max(100).optional(),
  deadline: z.string().trim().max(150).optional(),
  budget: z.number().min(0).max(100000).optional(),
  attachments: z
    .array(
      z.object({
        name: z.string().trim().max(200),
        url: z.string().trim().max(500),
        size: z.number().optional(),
        type: z.string().optional(),
      }),
    )
    .max(10, "الحد الأقصى للمرفقات 10 ملفات")
    .optional(),
});

export const updateCustomRequestStatusSchema = z.object({
  status: z.enum(CUSTOM_REQUEST_STATUSES, {
    errorMap: () => ({ message: "حالة الطلب غير صحيحة" }),
  }),
  adminNotes: z.string().trim().max(3000).optional(),
  notifyUser: z.boolean().default(true),
});

export const listCustomRequestsQuerySchema = paginationSchema.extend({
  status: z.enum(CUSTOM_REQUEST_STATUSES).optional(),
  requestType: z.enum(CUSTOM_REQUEST_TYPES).optional(),
  q: z.string().trim().optional(),
});
