// ============================================================
// محرك تقييد معدل الطلبات المتقدم (Sliding Window Rate Limiter)
// يعمل عبر Redis كـ Shared Store ويدعم الذاكرة المحلية كبديل فوري،
// مع دعم وضع الطوارئ والحدود المستقلة ومكافحة الإساءة التلقائية.
// ============================================================
import type { Request, Response, NextFunction, RequestHandler } from "express";
import crypto from "crypto";
import { securityCache } from "./redis";
import { getTrustedClientIp, getSubnetIdentifier } from "./ipShield";
import { ipBanService } from "./ipBan";
import { getSecuritySettings } from "./securitySettings";
import { verifyToken, COOKIE_NAME } from "./jwt";

export interface RateLimitOptions {
  name: string;
  windowMs: number;
  max: number;
  message?: string;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: Request) => string;
}

/**
 * فحص خفيف واستخراج سريع لهوية المستخدم من الكوكي المشفر والموقع
 * دون استعلام قاعدة البيانات لتفادي الضغط وتأخير الطلبات
 */
function extractAuthUserIdLight(req: Request): string | null {
  // 1) إذا كان محقونًا مسبقًا في req.user
  if ((req as any).user?.id) return (req as any).user.id;

  // 2) استخراج فوري من كوكي الجلسة
  const cookie = req.cookies?.[COOKIE_NAME];
  if (cookie && typeof cookie === "string") {
    const payload = verifyToken(cookie);
    if (payload && payload.tokenType !== "mfa_pending") {
      return payload.sub;
    }
  }

  return null;
}

export function createAdvancedRateLimiter(options: RateLimitOptions): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const settings = await getSecuritySettings();
      if (!settings.rateLimitEnabled) {
        return next();
      }

      const clientIp = getTrustedClientIp(req);
      const subnet = getSubnetIdentifier(clientIp);

      // استخراج هوية الحساب الآمنة إن وجدت
      const authUserId = extractAuthUserIdLight(req);
      const customKey = options.keyGenerator ? options.keyGenerator(req) : null;
      const targetIdentifier = customKey || (authUserId ? `u:${authUserId}` : `ip:${subnet}`);

      const fullKey = `rl:${options.name}:${targetIdentifier}`;
      const now = Date.now();
      const windowStart = now - options.windowMs;

      // تعديل الحد في وضع الطوارئ (Emergency Mode)
      let effectiveMax = options.max;
      if (settings.emergencyMode) {
        effectiveMax = Math.max(1, Math.floor(effectiveMax / 2));
      }

      // 1) تنظيف الطلبات القديمة خارج النافذة الزمنية
      await securityCache.zremrangebyscore(fullKey, 0, windowStart);

      // 2) حساب عدد الطلبات الحالية داخل النافذة
      const currentCount = await securityCache.zcard(fullKey);

      const remaining = Math.max(0, effectiveMax - currentCount);
      const resetTimeSec = Math.ceil(options.windowMs / 1000);

      // إضافة ترويسات RateLimit القياسية
      res.setHeader("RateLimit-Limit", effectiveMax);
      res.setHeader("RateLimit-Remaining", remaining);
      res.setHeader("RateLimit-Reset", resetTimeSec);

      if (currentCount >= effectiveMax) {
        const retryAfterSec = Math.ceil(options.windowMs / 1000);
        res.setHeader("Retry-After", retryAfterSec);

        // تسجيل إساءة استخدام قد تؤدي لحظر تلقائي مؤقت
        void ipBanService.recordAbuse(clientIp, 1);

        res.status(429).json({
          message:
            options.message ||
            (settings.emergencyMode
              ? "وضع الحماية المشددة نشط — تم تجاوز معدل الطلبات المسموح. انتظر لحظات."
              : "تجاوزت الحد المسموح من الطلبات. يرجى الانتظار والمحاولة لاحقًا."),
          error: { code: "RATE_LIMITED" },
          details: {
            retryAfterSec,
            limit: effectiveMax,
            scope: options.name,
            emergencyMode: settings.emergencyMode,
          },
        });
        return;
      }

      // 3) إضافة الطلب الحالي إلى السجل مع مدة صلاحية (TTL)
      const member = `${now}_${crypto.randomBytes(4).toString("hex")}`;
      await securityCache.zadd(fullKey, now, member);
      await securityCache.expire(fullKey, Math.ceil(options.windowMs / 1000) * 2);

      next();
    } catch (err) {
      // في حال حدوث خطأ غير متوقع في محرك التقييد لا نمنع المستخدم
      next();
    }
  };
}

// حدود جاهزة مخصصة حسب طبيعة كل عملية
export const rateLimiters = {
  /** تسجيل الدخول: 5 محاولات / 5 دقائق لكل IP أو حساب */
  login: createAdvancedRateLimiter({
    name: "auth_login",
    windowMs: 5 * 60 * 1000,
    max: 5,
    message: "محاولات دخول متكررة؛ انتظر 5 دقائق للحماية من محاولات التخمين.",
  }),

  /** التحقق من رمز المصادقة الثنائية (MFA): 5 محاولات / 5 دقائق */
  mfaVerify: createAdvancedRateLimiter({
    name: "auth_mfa_verify",
    windowMs: 5 * 60 * 1000,
    max: 5,
    message: "محاولات تحقق ثنائي متكررة؛ انتظر 5 دقائق للحماية من التخمين.",
    keyGenerator: (req) => {
      // ربط الحد بتذكرة MFA وهوية الحساب المشفرة داخلها إن وجدت
      const ticket = (req.body && typeof req.body === "object" ? req.body.mfaTicket : undefined);
      if (ticket && typeof ticket === "string") {
        const payload = verifyToken(ticket);
        if (payload?.sub) {
          return `mfa_user:${payload.sub}`;
        }
      }
      return `ip:${getSubnetIdentifier(getTrustedClientIp(req))}`;
    },
  }),

  /** إنشاء الحسابات: 3 حسابات / ساعة لكل IP */
  register: createAdvancedRateLimiter({
    name: "auth_register",
    windowMs: 60 * 60 * 1000,
    max: 3,
    message: "تم إنشاء عدة حسابات من هذا العنوان مؤخرًا. انتظر قليلًا ثم أعد المحاولة.",
  }),

  /** استعادة كلمة المرور: 3 طلبات / 15 دقيقة */
  forgotPassword: createAdvancedRateLimiter({
    name: "auth_forgot",
    windowMs: 15 * 60 * 1000,
    max: 3,
    message: "طلبات استعادة كثيرة لهذا الحساب أو العنوان؛ انتظر 15 دقيقة للحماية من الإغراق.",
  }),

  /** توثيق البريد الإلكتروني: 5 طلبات / ساعة */
  verifyEmail: createAdvancedRateLimiter({
    name: "auth_verify_email",
    windowMs: 60 * 60 * 1000,
    max: 5,
    message: "طلبات توثيق كثيرة للبريد. يرجى الانتظار قبل طلب رابط جديد.",
  }),

  /** إرسال طلبات الشرح والخدمات: 10 طلبات / 10 دقائق */
  submitRequests: createAdvancedRateLimiter({
    name: "requests_submit",
    windowMs: 10 * 60 * 1000,
    max: 10,
    message: "أرسلت عدة طلبات في وقت قصير. تمهل قليلًا لمراجعتها.",
  }),

  /** رفع الملفات: 20 ملف / 15 دقيقة */
  upload: createAdvancedRateLimiter({
    name: "upload_files",
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: "عمليات رفع متتابعة كثيرة؛ انتظر لحظات ثم استكمل الرفع.",
  }),

  /** فحص توفر اسم المستخدم: 120 طلب / دقيقة لضمان سلاسة وسرعة الكتابة للمستخدم */
  usernameCheck: createAdvancedRateLimiter({
    name: "username_check",
    windowMs: 60 * 1000,
    max: 120,
    message: "فحوصات كثيرة لاسم المستخدم. انتظر لحظة ثم أعد المحاولة.",
  }),

  /** لوحة الإدارة: 150 طلب / دقيقة */
  admin: createAdvancedRateLimiter({
    name: "admin_dashboard",
    windowMs: 60 * 1000,
    max: 150,
  }),

  /** الـ API العام: 250 طلب / دقيقة */
  apiGeneral: createAdvancedRateLimiter({
    name: "api_general",
    windowMs: 60 * 1000,
    max: 250,
  }),
};
