import { z } from "zod";
import { emailRule, fullNameRule, passwordRule, phoneRule, usernameRule } from "./auth";

// ============================================================
// تحقق إعدادات الحساب — يُطبَّق على الخادم فقط (لا اعتماد على الواجهة).
// ============================================================

export const updateProfileSchema = z
  .object({
    fullName: fullNameRule.optional(),
    whatsapp: phoneRule.nullish(),
    universityId: z.string().min(1).nullish(),
    majorId: z.string().min(1).nullish(),
    level: z.string().trim().max(100).nullish(),
  })
  .strict();

export const updateUsernameSchema = z.object({ username: usernameRule }).strict();

export const changeEmailSchema = z
  .object({
    newEmail: emailRule,
    currentPassword: z.string().min(1, "أدخل كلمة المرور الحالية لتأكيد التغيير"),
  })
  .strict();

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "أدخل كلمة المرور الحالية"),
    newPassword: passwordRule,
    confirmPassword: z.string().min(1, "أكّد كلمة المرور الجديدة"),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.newPassword !== data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "تأكيد كلمة المرور غير مطابق",
      });
    }
    if (data.currentPassword === data.newPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["newPassword"],
        message: "كلمة المرور الجديدة يجب أن تختلف عن الحالية",
      });
    }
  });

export const confirmEmailChangeSchema = z
  .object({ token: z.string().trim().min(20, "رابط تأكيد البريد غير صالح") })
  .strict();

export const sessionIdSchema = z.object({ id: z.string().min(1) });
