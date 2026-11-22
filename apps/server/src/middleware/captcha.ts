// ============================================================
// وسيط التحقق البشري من الطلبات (reCAPTCHA Verification Middleware)
// ============================================================
import type { Request, Response, NextFunction } from "express";
import { recaptchaService } from "../lib/recaptcha";
import { getTrustedClientIp } from "../lib/ipShield";
import { getSecuritySettings } from "../lib/securitySettings";

export function requireCaptcha(expectedAction: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const isProduction = process.env.NODE_ENV === "production";
      const settings = await getSecuritySettings();

      // في بيئة التطوير والاختبار المحلي: إذا كانت recaptcha غير مفعلة ولا يوجد رمز مرسل، نمرر
      if (!settings.recaptchaEnabled && !isProduction && !(req.headers["x-captcha-token"] || (req.body && req.body.captchaToken))) {
        return next();
      }

      const token =
        (req.headers["x-captcha-token"] as string | undefined) ||
        (req.body && typeof req.body === "object" ? req.body.captchaToken : undefined);

      if (!token && (isProduction || settings.recaptchaEnabled)) {
        res.status(400).json({
          message: "رمز التحقق البشري (reCAPTCHA) إلزامي لإتمام هذا الطلب.",
          error: { code: "CAPTCHA_REQUIRED" },
          details: { action: expectedAction },
        });
        return;
      }

      const clientIp = getTrustedClientIp(req);
      const result = await recaptchaService.verifyToken(token, expectedAction, clientIp);

      if (!result.success) {
        const reasons = result.reasons || [];

        // في حال عدم ضبط المفاتيح في بيئة الإنتاج: نرجع 503 واضح
        if (reasons.includes("SECRET_KEY_MISSING_PROD") || reasons.includes("RECAPTCHA_SECRET_KEY_MISSING")) {
          res.status(503).json({
            message: "خدمة التحقق الأمني غير مهيأة بالشكل الصحيح على الخادم. يُرجى مراجعة إدارة المنصة.",
            error: { code: "CAPTCHA_CONFIGURATION_ERROR" },
            details: { action: expectedAction },
          });
          return;
        }

        // في حال انقطاع خدمة Google أو انتهاء مهلة الاتصال
        if (reasons.includes("GOOGLE_SERVICE_UNAVAILABLE")) {
          res.status(503).json({
            message: "تعذر الاتصال بخدمة التحقق الأمني من Google (مهلة الاتصال انتهت). يُرجى إعادة المحاولة.",
            error: { code: "CAPTCHA_SERVICE_UNAVAILABLE" },
            details: { action: expectedAction },
          });
          return;
        }

        // في حال كان النشاط عالي المخاطر (Low Score)
        if (reasons.includes("LOW_SCORE")) {
          res.status(403).json({
            message: "تم تصنيف هذا الطلب كنشاط آلي أو عالي المخاطر من قِبل نظام الحماية.",
            error: { code: "CAPTCHA_LOW_SCORE" },
            details: { action: expectedAction, score: result.score },
          });
          return;
        }

        // الحالات العامة للرمز غير الصالح أو المعاد استخدامه
        res.status(400).json({
          message: result.error || "فشل التحقق الأمني من رمز reCAPTCHA. يُرجى إعادة المحاولة.",
          error: { code: "CAPTCHA_FAILED" },
          details: { action: expectedAction, score: result.score, reasons },
        });
        return;
      }

      next();
    } catch (err) {
      console.error("[AUTH:CAPTCHA] خطأ أثناء معالجة التحقق البشري:", (err as Error)?.message || String(err));
      res.status(503).json({
        message: "خدمة التحقق الأمني غير متاحة مؤقتًا، يُرجى إعادة المحاولة.",
        error: { code: "CAPTCHA_UNAVAILABLE" },
      });
    }
  };
}
