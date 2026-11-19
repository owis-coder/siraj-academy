// ============================================================
// توطين رسائل الخادم (عربي/إنجليزي) حسب ترويسة Accept-Language.
// الرسائل تُكتب في المسارات بالعربية (المصدر)، وتُترجم هنا مركزيًا
// حتى لا تتكرر الترجمة في كل مسار. أي رسالة غير موجودة تبقى كما هي.
// ============================================================
import type { NextFunction, Request, Response } from "express";

export type Lang = "ar" | "en";

export function requestLang(req: Request): Lang {
  const header = (req.headers["accept-language"] || "").toString().toLowerCase();
  return header.startsWith("en") || header.includes(",en") ? "en" : "ar";
}

const EN: Record<string, string> = {
  // ---------- عام ----------
  "الوصول يتطلب تسجيل الدخول": "Please sign in to continue.",
  "ليست لديك صلاحية لهذا الإجراء": "You do not have permission to do this.",
  "العنصر المطلوب غير موجود": "The requested item was not found.",
  "المستخدم غير موجود": "User not found.",
  "تحقق من صحة البيانات المُرسلة": "Please check the submitted data.",
  "معاملات الاستعلام غير صحيحة": "Invalid query parameters.",
  "حدث خطأ غير متوقع على الخادم": "Something went wrong on our side. Please try again.",
  "حجم الملف يتجاوز الحد المسموح": "The file is larger than the allowed limit.",
  "صيغة الملف غير مدعومة": "This file type is not supported.",
  "أرفق صورة في الحقل avatar": "Please attach an image in the avatar field.",
  "الجلسة غير موجودة": "Session not found.",
  "غير مصرح": "Not authorized.",

  // ---------- التحقق ----------
  "الاسم الكامل يجب أن يكون 3 أحرف على الأقل": "Full name must be at least 3 characters.",
  "الاسم الكامل طويل جدًا": "Full name is too long.",
  "الاسم الكامل يقبل الحروف العربية والإنجليزية والمسافات فقط": "Full name may contain Arabic or English letters and spaces only.",
  "اسم المستخدم يجب أن يكون 3 أحرف على الأقل": "Username must be at least 3 characters.",
  "اسم المستخدم يجب ألا يتجاوز 30 حرفًا": "Username must not exceed 30 characters.",
  "اسم المستخدم يقبل الأحرف الإنجليزية والأرقام والشرطة السفلية فقط (بدون مسافات أو رموز أو حروف عربية)":
    "Username may contain English letters, digits, and underscores only.",
  "كلمة المرور يجب ألا تتجاوز 72 حرفًا": "Password must not exceed 72 characters.",
  "كلمة المرور يجب أن تكون 9 خانات على الأقل": "Password must be at least 9 characters.",
  "كلمة المرور يجب أن تحتوي حرفًا إنجليزيًا كبيرًا واحدًا على الأقل (A-Z)": "Password must contain at least one uppercase letter (A-Z).",
  "كلمة المرور يجب أن تحتوي حرفًا إنجليزيًا صغيرًا واحدًا على الأقل (a-z)": "Password must contain at least one lowercase letter (a-z).",
  "كلمة المرور يجب أن تحتوي رقمًا واحدًا على الأقل (0-9)": "Password must contain at least one digit (0-9).",
  "كلمة المرور تقبل الأحرف الإنجليزية والأرقام فقط — لا رموز ولا مسافات ولا حروف عربية":
    "Password may contain English letters and digits only — no symbols, spaces, or Arabic letters.",
  "رقم الجوال غير صحيح (مثال: 0512345678 أو 9665XXXXXXXX)": "Invalid mobile number (example: 0512345678).",
  "البريد الإلكتروني غير صحيح": "Invalid email address.",
  "أدخل بريدًا إلكترونيًا صحيحًا": "Enter a valid email address.",
  "أكّد كلمة المرور": "Please confirm your password.",
  "تأكيد كلمة المرور غير مطابق لكلمة المرور": "Password confirmation does not match.",
  "أكّد كلمة المرور الجديدة": "Please confirm the new password.",
  "أدخل البريد أو اسم المستخدم": "Enter your email or username.",
  "أدخل كلمة المرور": "Enter your password.",
  "رمز التحقق غير صحيح": "Invalid verification token.",
  "رابط الاستعادة غير صالح": "Invalid reset link.",
  "اذكر المؤهل العلمي": "Please state your academic qualification.",
  "نبذة المدرس 20 حرفًا على الأقل": "Your bio must be at least 20 characters.",
  "أضف تخصصًا واحدًا على الأقل": "Add at least one specialty.",
  "الرابط طويل جدًا": "The link is too long.",
  "أدخل رابطًا يبدأ بـhttps، أو ارفع ملف المستندات من صفحة ملفك المهني": "Enter an https link, or upload your documents from your professional profile.",

  // ---------- المصادقة ----------
  "اسم المستخدم مستخدم مسبقًا — اختر اسمًا آخر": "This username is already taken. Please choose another one.",
  "البريد الإلكتروني مسجل مسبقًا": "This email address is already registered.",
  "بيانات الدخول غير صحيحة": "Incorrect sign-in details.",
  "تم تعليق حسابك، راجع الإدارة": "Your account is suspended. Please contact support.",
  "البريد مفعّل مسبقًا": "Your email is already verified.",
  "تفعيل حسابك في أكاديمية سراج": "Verify your Siraj Academy account",
  "تم إنشاء الحساب. راجع بريدك لتفعيله (يمكنك استخدام الموقع قبل التفعيل).":
    "Account created. Check your inbox to verify your email (you can use the site before verifying).",
  "تم إنشاء حساب المدرس، وسيُفعّل بعد مراجعة الإدارة.": "Teacher account created; it will be activated after admin review.",
  "تم تسجيل الدخول بنجاح": "Signed in successfully.",
  "تم تسجيل الخروج": "Signed out.",
  "تم تفعيل البريد الإلكتروني بنجاح": "Your email has been verified.",
  "تم إرسال رمز التفعيل إلى بريدك": "A verification link has been sent to your email.",
  "إذا كان البريد مسجلًا في المنصة فسيصلك رابط لإعادة تعيين كلمة المرور خلال دقائق. تحقق أيضًا من مجلد الرسائل غير المرغوبة.":
    "If this email is registered, you will receive a password reset link within minutes. Check your spam folder too.",
  "رابط الاستعادة غير صالح أو منتهي الصلاحية. اطلب رابطًا جديدًا.":
    "This reset link is invalid or has expired. Please request a new one.",
  "تم تعيين كلمة المرور الجديدة. يمكنك تسجيل الدخول الآن.": "Your new password has been set. You can sign in now.",
  "رابط تأكيد البريد غير صالح أو منتهي الصلاحية. اطلب تغييرًا جديدًا.":
    "This email confirmation link is invalid or has expired. Please start again.",
  "رابط تأكيد البريد غير صالح أو منتهي الصلاحية.": "This email confirmation link is invalid or has expired.",
  "البريد الإلكتروني الجديد مستخدم من حساب آخر": "This email address is already used by another account.",
  "تم تأكيد بريدك الإلكتروني الجديد. سجّل الدخول من جديد بالبريد الجديد.":
    "Your new email has been confirmed. Please sign in again with it.",
  "رمز التحقق غير صحيح أو مستخدم مسبقًا": "This verification link is invalid or has already been used.",
  "رابط التوثيق غير صالح أو منتهي الصلاحية. اطلب رابطًا جديدًا.":
    "This verification link is invalid or has expired. Please request a new one.",
  "البريد الإلكتروني موثّق بالفعل": "Your email is already verified.",
  "تم إرسال رابط التوثيق إلى بريدك الإلكتروني. يرجى التحقق من صندوق الوارد أو الرسائل غير المرغوب فيها.":
    "A verification link has been sent to your email. Please check your inbox or spam folder.",
  "يرجى الانتظار قبل طلب رابط جديد.": "Please wait before requesting another link.",

  // ---------- الحساب ----------
  "تم حفظ التعديلات": "Changes saved.",
  "لا يمكنك تعديل بيانات حساب آخر": "You cannot edit another account's details.",
  "اسم المستخدم لم يتغير": "Username unchanged.",
  "تم تحديث اسم المستخدم": "Username updated.",
  "كلمة المرور الحالية غير صحيحة": "Current password is incorrect.",
  "البريد الجديد مطابق لبريدك الحالي": "The new email matches your current one.",
  "البريد الإلكتروني مستخدم مسبقًا": "This email address is already in use.",
  "أرسلنا رابط تأكيد إلى البريد الجديد. لن يتغير بريدك إلا بعد فتح الرابط خلال 30 دقيقة.":
    "We sent a confirmation link to the new email. Your email changes only after the link is opened within 30 minutes.",
  "تم تغيير كلمة المرور، وأُنهيت الجلسات الأخرى.": "Password changed; other sessions were signed out.",
  "تم تحديث الصورة الشخصية": "Profile photo updated.",
  "تمت إزالة الصورة والعودة للصورة الافتراضية": "Photo removed; default avatar restored.",
  "تم تسجيل الخروج من جميع الأجهزة. سجّل الدخول من جديد.": "Signed out from all devices. Please sign in again.",

  // ---------- الطلبات والخدمات ----------
  "الطلب غير موجود": "Request not found.",
  "ليس لديك صلاحية لعرض هذا الطلب": "You do not have permission to view this request.",
  "تم إنشاء الطلب بنجاح": "Request created successfully.",
  "تم إرسال عرضك على الطلب": "Your offer was submitted.",
  "تم إغلاق الطلب": "Request closed.",
  "تم إرسال طلبك وسيتواصل معك الفريق": "Your request was submitted; our team will contact you.",
  "هذه الخدمة غير متاحة حاليًا": "This service is currently unavailable.",
};

/** يترجم نصًا عربيًا إلى الإنجليزية إن وُجد في القاموس */
export function translateMessage(text: string, lang: Lang): string {
  if (lang === "ar") return text;
  return EN[text] ?? text;
}

function localizeValue(value: unknown, lang: Lang): unknown {
  if (typeof value === "string") return translateMessage(value, lang);
  if (Array.isArray(value)) return value.map((item) => localizeValue(item, lang));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      out[key] = localizeValue(inner, lang);
    }
    return out;
  }
  return value;
}

/**
 * يوطّن رسائل الاستجابة (message / data.message / تفاصيل التحقق)
 * دون تغيير أي بيانات أخرى. لا يمسّ القيم التي يكتبها المستخدمون.
 */
export function localizeResponses(req: Request, res: Response, next: NextFunction): void {
  const lang = requestLang(req);
  if (lang === "ar") {
    next();
    return;
  }

  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    const localized =
      body && typeof body === "object" && !Array.isArray(body)
        ? { ...(body as Record<string, unknown>) }
        : body;

    if (localized && typeof localized === "object") {
      const obj = localized as Record<string, unknown>;
      if (typeof obj.message === "string") obj.message = translateMessage(obj.message, lang);
      if (obj.error && typeof obj.error === "object") {
        const error = obj.error as Record<string, unknown>;
        if (typeof error.message === "string") error.message = translateMessage(error.message, lang);
      }
      // رسائل التحقق الميدانية
      if (obj.details && typeof obj.details === "object") {
        obj.details = localizeValue(obj.details, lang);
      }
      const data = obj.data;
      if (data && typeof data === "object" && !Array.isArray(data) && typeof (data as { message?: unknown }).message === "string") {
        (data as Record<string, unknown>).message = translateMessage(
          (data as { message: string }).message,
          lang,
        );
      }
    }

    return originalJson(localized);
  }) as Response["json"];

  next();
}
