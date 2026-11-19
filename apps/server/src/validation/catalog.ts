import { z } from "zod";
import { paginationSchema } from "./common";

export const universityListSchema = paginationSchema;

export const collegeListSchema = z.object({
  universityId: z.string().min(1, "حدد الجامعة").optional(),
});

export const majorListSchema = z.object({
  universityId: z.string().min(1).optional(),
  collegeId: z.string().min(1).optional(),
});

export const courseListSchema = z.object({
  universityId: z.string().min(1).optional(),
  collegeId: z.string().min(1).optional(),
  majorId: z.string().min(1).optional(),
  level: z.string().trim().max(40).optional(),
  q: z.string().trim().max(120).optional().default(""),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const teacherListSchema = z.object({
  university: z.string().trim().max(120).optional(), // اسم جامعة أو معرّف
  q: z.string().trim().max(120).optional().default(""),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const serviceListSchema = z.object({
  category: z.string().trim().max(40).optional(),
  q: z.string().trim().max(120).optional().default(""),
});

export const searchSchema = z.object({
  q: z.string().trim().min(1, "أدخل كلمة للبحث").max(120),
});

export const favoriteToggleSchema = z.object({
  targetType: z.enum(["SERVICE", "OFFERING", "TEACHER"]),
});

export const serviceOrderSchema = z.object({
  slug: z.string().trim().min(1, "حدد الخدمة"),
  providerId: z.string().min(1).optional(),
  notes: z.string().trim().max(1000).optional(),
});
