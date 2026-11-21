import { z } from "zod";
import { paginationSchema } from "./common";

export const createOfferingSchema = z.object({
  courseId: z.string().optional(),
  courseTitle: z.string().trim().min(2, "اسم المقرر يجب ألا يقل عن حرفين").optional(),
  title: z.string().trim().max(200).optional(),
  summary: z.string().trim().min(1, "وصف الدورة مطلوب").max(2000),
  price: z.coerce.number().min(0, "السعر لا يمكن أن يكون سالبًا").max(100000),
  trialVideoUrl: z.string().url("رابط الفيديو الترويجي غير صحيح").max(400).optional(),
  youtubeUrls: z.array(z.string().url().max(400)).max(30).optional(),
}).refine((d) => Boolean(d.courseId || d.courseTitle), {
  message: "اختر مقررًا أو اكتب اسم المقرر يدويًا",
  path: ["courseId"],
});

export const updateOfferingSchema = z.object({
  courseId: z.string().optional(),
  courseTitle: z.string().trim().min(2).optional(),
  title: z.string().trim().max(200).optional(),
  summary: z.string().trim().min(1).max(2000).optional(),
  price: z.coerce.number().min(0).max(100000).optional(),
  trialVideoUrl: z.string().url().max(400).nullable().optional(),
  youtubeUrls: z.array(z.string().url().max(400)).max(30).nullable().optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "HIDDEN"]).optional(),
});

export const lessonCreateSchema = z.object({
  title: z.string().trim().min(3, "عنوان الدرس قصير").max(200),
  videoUrl: z.string().url("رابط يوتيوب غير صحيح").max(400),
  access: z.enum(["TRIAL", "PAID"]).default("PAID"),
  order: z.coerce.number().int().min(0).default(0),
});

export const lessonUpdateSchema = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  videoUrl: z.string().url().max(400).optional(),
  access: z.enum(["TRIAL", "PAID"]).optional(),
  order: z.coerce.number().int().min(0).optional(),
});

export const liveSessionCreateSchema = z.object({
  offeringId: z.string().min(1).optional(),
  title: z.string().trim().min(3, "عنوان الجلسة قصير").max(200),
  startsAt: z.coerce.date({ invalid_type_error: "تاريخ البدء غير صحيح" }),
  durationMin: z.coerce.number().int().min(15).max(480).default(60),
  price: z.coerce.number().min(0).max(100000).optional(),
  capacity: z.coerce.number().int().min(1).max(500).optional(),
});

export const offeringListQuerySchema = paginationSchema.extend({
  status: z.enum(["DRAFT", "PUBLISHED", "HIDDEN", "REJECTED"]).optional(),
  universityId: z.string().min(1).optional(),
  courseId: z.string().min(1).optional(),
});
