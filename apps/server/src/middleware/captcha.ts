// ============================================================
// وسيط التحقق البشري من الطلبات (reCAPTCHA Verification Middleware)
// ============================================================
import type { Request, Response, NextFunction } from "express";
import { recaptchaService } from "../lib/recaptcha";
import { getTrustedClientIp } from "../lib/ipShield";
import { getSecuritySettings } from "../lib/securitySettings";

export function requireCaptcha(expectedAction: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const isProduction = process.env.NODE_ENV === "production";
    const settings = await getSecuritySettings();

    // في الإنتاج، يجب ألا يتم تجاوز reCAPTCHA حتى لو كانت الإعدادات متوقفة إن لم يقرر المشرف صراحة
    // وفي التطوير، إذا كانت recaptchaEnabled=false ولا يوجد رمز، نمرر للسهولة
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
      res.status(400).json({
        message: result.error || "فشل التحقق الأمني من الرمز. يُرجى إعادة المحاولة.",
        error: { code: "CAPTCHA_FAILED" },
        details: { action: expectedAction, score: result.score, reasons: result.reasons },
      });
      return;
    }

    next();
  };
}
