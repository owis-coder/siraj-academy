import { z } from "zod";
import { paginationSchema } from "./common";

export const createRequestSchema = z.object({
  universityId: z.string().min(1).optional(),
  collegeId: z.string().min(1).optional(),
  majorId: z.string().min(1).optional(),
  courseTitle: z.string().trim().min(3, "عنوان المقرر قصير جدًا").max(200),
  details: z.string().trim().min(10, "اشترِ طلبك بصورة أوضح (10 أحرف على الأقل)").max(4000),
  type: z.enum(["ONLINE", "IN_PERSON", "BOTH"]).default("ONLINE"),
  urgency: z.enum(["NOW", "DAY", "WEEK", "TERM"]).default("WEEK"),
  budget: z.coerce.number().positive("الميزانية يجب أن تكون رقمًا موجبًا").max(100000).optional(),
  deadline: z.string().trim().max(120).optional(),
  attachments: z.array(z.string().trim().min(1).max(400)).max(10).optional(),
  linkUrl: z.string().url("رابط غير صحيح").max(400).optional(),
});

export const requestListSchema = paginationSchema.extend({
  university: z.string().trim().max(120).optional(),
  status: z.enum(["OPEN", "TEACHER_SELECTED", "CLOSED"]).optional(),
  mine: z.preprocess((v) => v === "true" || v === true, z.boolean()).optional(),
});

export const createOfferSchema = z.object({
  price: z.coerce
    .number()
    .min(5, "أقل سعر للعرض 5 ريال")
    .max(10000, "أقصى سعر للعرض 10000 ريال"),
  message: z.string().trim().max(1000).optional(),
  timelineDays: z.coerce.number().int().min(1).max(90).optional(),
});
