import { z } from "zod";

// ============================================================
// قواعد التحقق المشتركة بين الواجهة والخادم (المرجع: الخادم دائمًا).
// ============================================================

/** الاسم الكامل: حروف عربية أو إنجليزية ومسافات فقط (مع شرطة/فاصلة عليا للأسماء المركّبة) */
export const fullNameRule = z
  .string()
  .trim()
  .min(3, "الاسم الكامل يجب أن يكون 3 أحرف على الأقل")
  .max(120, "الاسم الكامل طويل جدًا")
  .regex(
    /^[\u0621-\u064Aa-zA-Z\s'’\u0640-]+$/,
    "الاسم الكامل يقبل الحروف العربية والإنجليزية والمسافات فقط",
  );

/**
 * اسم المستخدم: أحرف إنجليزية وأرقام وشرطة سفلية فقط، من 3 إلى 30.
 * ممنوع: العربية، الصينية، الرموز، المسافات.
 */
export const usernameRule = z
  .string()
  .trim()
  .min(3, "اسم المستخدم يجب أن يكون 3 أحرف على الأقل")
  .max(30, "اسم المستخدم يجب ألا يتجاوز 30 حرفًا")
  .regex(
    /^[a-zA-Z0-9_]+$/,
    "اسم المستخدم يقبل الأحرف الإنجليزية والأرقام والشرطة السفلية فقط (بدون مسافات أو رموز أو حروف عربية)",
  );

/**
 * كلمة المرور: 9 خانات على الأقل، حرف كبير + حرف صغير + رقم،
 * أحرف إنجليزية وأرقام فقط (بلا رموز أو مسافات أو حروف عربية).
 */
export const passwordRule = z
  .string()
  .max(72, "كلمة المرور يجب ألا تتجاوز 72 حرفًا")
  .refine((v) => v.length >= 9, "كلمة المرور يجب أن تكون 9 خانات على الأقل")
  .refine((v) => /[A-Z]/.test(v), "كلمة المرور يجب أن تحتوي حرفًا إنجليزيًا كبيرًا واحدًا على الأقل (A-Z)")
  .refine((v) => /[a-z]/.test(v), "كلمة المرور يجب أن تحتوي حرفًا إنجليزيًا صغيرًا واحدًا على الأقل (a-z)")
  .refine((v) => /[0-9]/.test(v), "كلمة المرور يجب أن تحتوي رقمًا واحدًا على الأقل (0-9)")
  .refine(
    (v) => /^[A-Za-z0-9]+$/.test(v),
    "كلمة المرور تقبل الأحرف الإنجليزية والأرقام فقط — لا رموز ولا مسافات ولا حروف عربية",
  );

/** رقم الجوال (اختياري في التسجيل): سعودي بصيغة 05XXXXXXXX أو 9665XXXXXXXX */
export const phoneRule = z
  .string()
  .trim()
  .regex(/^(?:\+?9665\d{8}|05\d{8})$/, "رقم الجوال غير صحيح (مثال: 0512345678 أو 9665XXXXXXXX)");

export const emailRule = z.string().trim().toLowerCase().email("البريد الإلكتروني غير صحيح").max(160);

// رابط وثائق التحقق: رابط خارجي https، أو ملف رُفع داخليًا عبر /uploads
// (يُخدم لاحقًا بعد تفويض: صاحب الملف والإدارة فقط)
export const docsUrlRule = z
  .string()
  .trim()
  .max(400, "الرابط طويل جدًا")
  .refine(
    (v) => /^https:\/\/[^\s]+$/i.test(v) || /^\/uploads\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(v),
    "أدخل رابطًا يبدأ بـhttps، أو ارفع ملف المستندات من صفحة ملفك المهني",
  );

/** الحقول الأساسية الخمسة للتسجيل + تأكيد كلمة المرور (يُطبَّق على الخادم) */
const baseRegisterObject = z.object({
  fullName: fullNameRule,
  username: usernameRule,
  email: emailRule,
  password: passwordRule,
  confirmPassword: z.string().min(1, "أكّد كلمة المرور"),
  // حقول اختيارية تُستكمل لاحقًا من الملف الشخصي
  whatsapp: phoneRule.optional(),
  universityId: z.string().min(1).optional(),
  majorId: z.string().min(1).optional(),
  level: z.string().trim().max(100).optional(),
  captchaToken: z.string().optional(),
});

const confirmPasswordRule = <T extends { password: string; confirmPassword: string }>(
  data: T,
  ctx: z.RefinementCtx,
) => {
  if (data.password !== data.confirmPassword) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["confirmPassword"],
      message: "تأكيد كلمة المرور غير مطابق لكلمة المرور",
    });
  }
};

export const studentRegisterSchema = baseRegisterObject.superRefine(confirmPasswordRule);

export const teacherRegisterSchema = baseRegisterObject
  .extend({
    // حقول وظيفية لازمة لمراجعة اعتماد المدرس (لا علاقة لها بالبيانات الشخصية الاختيارية)
    degree: z.string().trim().min(2, "اذكر المؤهل العلمي").max(120),
    bio: z.string().trim().min(20, "نبذة المدرس 20 حرفًا على الأقل").max(2000),
    specialties: z.preprocess(
      (val) => (typeof val === "string" ? val.split(/[,،\n]+/).map((s) => s.trim()).filter(Boolean) : val),
      z.array(z.string().trim().min(2).max(80)).min(1, "أضف تخصصًا واحدًا على الأقل").max(10),
    ),
    universitiesText: z.string().trim().max(500).optional(),
    docsUrl: docsUrlRule.optional(),
  })
  .superRefine(confirmPasswordRule);

export const loginSchema = z.object({
  identifier: z.string().trim().min(3, "أدخل البريد أو اسم المستخدم"),
  password: z.string().min(1, "أدخل كلمة المرور"),
  captchaToken: z.string().optional(),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(10, "رمز التحقق غير صحيح"),
});

/* ===================== استعادة كلمة المرور ===================== */

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email("أدخل بريدًا إلكترونيًا صحيحًا"),
  captchaToken: z.string().optional(),
});

export const resetPasswordSchema = z
  .object({
    token: z.string().trim().min(20, "رابط الاستعادة غير صالح"),
    password: passwordRule,
    confirmPassword: z.string().min(1, "أكّد كلمة المرور الجديدة"),
  })
  .superRefine(confirmPasswordRule);

/* ===================== استكمال تسجيل Google OAuth ===================== */
export const completeOAuthSchema = z
  .object({
    registrationTicket: z.string().min(20, "تذكرة التسجيل مفقودة أو غير صالحة"),
    fullName: fullNameRule,
    username: usernameRule,
    password: passwordRule,
    confirmPassword: z.string().min(1, "أكّد كلمة المرور"),
    role: z.enum(["STUDENT", "TEACHER"]).default("STUDENT"),
    whatsapp: phoneRule.optional(),
    universityId: z.string().min(1).optional(),
    majorId: z.string().min(1).optional(),
    level: z.string().trim().max(100).optional(),
    degree: z.string().trim().max(120).optional(),
    bio: z.string().trim().max(2000).optional(),
    specialties: z
      .preprocess(
        (val) => (typeof val === "string" ? val.split(/[,،\n]+/).map((s) => s.trim()).filter(Boolean) : val),
        z.array(z.string().trim().min(2).max(80)).optional(),
      ),
    captchaToken: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "تأكيد كلمة المرور غير مطابق لكلمة المرور",
      });
    }
    if (data.role === "TEACHER") {
      if (!data.degree || data.degree.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["degree"],
          message: "المؤهل العلمي مطلوب لتسجيل حساب مدرّس",
        });
      }
    }
  });

export type CompleteOAuthInput = z.infer<typeof completeOAuthSchema>;
export type StudentRegisterInput = z.infer<typeof studentRegisterSchema>;
export type TeacherRegisterInput = z.infer<typeof teacherRegisterSchema>;
