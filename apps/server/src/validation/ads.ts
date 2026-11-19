import { z } from "zod";

export const createAdSchema = z.object({
  title: z.string().trim().min(5, "عنوان الإعلان قصير").max(150),
  body: z.string().trim().min(20, "نص الإعلان 20 حرفًا على الأقل").max(3000),
  imageUrl: z.string().url("رابط الصورة غير صحيح").max(400).optional(),
  linkUrl: z.string().url("الرابط غير صحيح").max(400).optional(),
});

export const updateAdSchema = createAdSchema.partial();

export const adDecisionSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED", "HIDDEN", "EXPIRED"]),
  note: z.string().trim().max(1000).optional(),
});
