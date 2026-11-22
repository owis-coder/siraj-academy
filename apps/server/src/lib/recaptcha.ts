// ============================================================
// خدمة التحقق من Google reCAPTCHA v3 و reCAPTCHA Enterprise
// تتحقق من الرمز في Backend حصريًا، وتفحص النتيجة والـ Action واسم النطاق،
// وتمنع إعادة استخدام الرموز (Replay Attack) مع آلية آمنة لتفادي تعطل الخدمة.
// ============================================================
import crypto from "crypto";
import { securityCache } from "./redis";
import { getSecuritySettings } from "./securitySettings";
import { ipBanService } from "./ipBan";

export interface RecaptchaVerifyResult {
  success: boolean;
  score?: number;
  action?: string;
  hostname?: string;
  error?: string;
  reasons?: string[];
  simulated?: boolean;
}

export const recaptchaService = {
  /**
   * التحقق الأمني من رمز reCAPTCHA
   */
  async verifyToken(
    token: string | undefined | null,
    expectedAction: string,
    clientIp?: string,
  ): Promise<RecaptchaVerifyResult> {
    const settings = await getSecuritySettings();

    // 1) في حال كانت الخدمة غير مفعلة ولا يوجد رمز مرسل
    if (!settings.recaptchaEnabled && !token) {
      return { success: true, score: 1.0, action: expectedAction, simulated: true };
    }

    if (!token || typeof token !== "string" || token.trim().length < 10) {
      if (clientIp) void ipBanService.recordAbuse(clientIp, 1);
      return { success: false, error: "رمز التحقق البشري مفقود أو غير صالح", reasons: ["MISSING_OR_INVALID_TOKEN"] };
    }

    const trimmed = token.trim();

    // 2) دعم الرموز الاختبارية المعتمدة في بيئة الفحص والتطوير (ممنوع في الإنتاج)
    const isProduction = process.env.NODE_ENV === "production";

    if (trimmed.startsWith("test_captcha_invalid_") || trimmed === "invalid_token") {
      if (isProduction) {
        return { success: false, error: "رموز المحاكاة والاختبار محظورة تمامًا في بيئة الإنتاج.", reasons: ["MOCK_FORBIDDEN_IN_PROD"] };
      }
      return { success: false, error: "رمز التحقق البشري غير صالح أو مزور", reasons: ["INVALID_TEST_TOKEN"] };
    }

    // 3) منع هجوم إعادة الاستخدام (Replay Attack Prevention)
    const tokenHash = crypto.createHash("sha256").update(trimmed).digest("hex");
    const replayKey = `captcha:used:${tokenHash}`;
    const alreadyUsed = await securityCache.get(replayKey);
    if (alreadyUsed) {
      if (clientIp) void ipBanService.recordAbuse(clientIp, 2);
      return {
        success: false,
        error: "رمز التحقق استُخدم مسبقًا ولا يمكن إعادة استخدامه.",
        reasons: ["REPLAY_TOKEN"],
      };
    }

    // وسم الرمز كمستخدم لمدة دقيقتين
    await securityCache.set(replayKey, "1", 120);

    if (trimmed.startsWith("test_captcha_valid_") || trimmed.startsWith("simulated_token_")) {
      if (isProduction) {
        return { success: false, error: "رموز المحاكاة والاختبار محظورة تمامًا في بيئة الإنتاج.", reasons: ["MOCK_FORBIDDEN_IN_PROD"] };
      }
      return { success: true, score: 0.9, action: expectedAction, simulated: true };
    }

    const secretKey = process.env.RECAPTCHA_SECRET_KEY;
    if (!secretKey) {
      if (isProduction) {
        console.error("[AUTH:CAPTCHA] Missing RECAPTCHA_SECRET_KEY in production environment (Fail-Closed).");
        return {
          success: false,
          error: "إعدادات حماية Google reCAPTCHA غير مكتملة في بيئة الإنتاج (Fail-Closed).",
          reasons: ["SECRET_KEY_MISSING_PROD"],
        };
      }
      // وضع المحاكاة الآمن عند عدم ضبط Secret في البيئة المحلية فقط
      return { success: true, score: 0.8, action: expectedAction, simulated: true };
    }

    // 4) الاتصال بخوادم Google للتحقق الفعلي
    try {
      const verifyUrl = "https://www.google.com/recaptcha/api/siteverify";
      const params = new URLSearchParams({
        secret: secretKey,
        response: trimmed,
        ...(clientIp ? { remoteip: clientIp } : {}),
      });

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000); // 4 ثوانٍ كحد أقصى

      const response = await fetch(verifyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Google verify returned HTTP ${response.status}`);
      }

      const data = (await response.json()) as {
        success: boolean;
        score?: number;
        action?: string;
        hostname?: string;
        "error-codes"?: string[];
      };

      if (!data.success) {
        return {
          success: false,
          error: "فشل التحقق من Google reCAPTCHA",
          reasons: data["error-codes"] || ["VERIFICATION_FAILED"],
        };
      }

      const score = data.score;

      // فحص النتيجة (Score) لـ reCAPTCHA v3 / Enterprise فقط (في v2 Checkbox، نجاح التحقق البشري كافٍ)
      if (typeof score === "number") {
        const minScore = settings.emergencyMode ? 0.7 : settings.recaptchaMinScore;

        if (score < minScore) {
          if (clientIp) void ipBanService.recordAbuse(clientIp, 1);
          return {
            success: false,
            score,
            error: "تم تصنيف هذا الطلب كنشاط آلي أو عالي المخاطر.",
            reasons: ["LOW_SCORE"],
          };
        }
      }

      // فحص مطابقة الإجراء (Action)
      if (data.action && data.action !== expectedAction) {
        return {
          success: false,
          score,
          action: data.action,
          error: "إجراء رمز التحقق لا يطابق العملية المطلوبة.",
          reasons: ["ACTION_MISMATCH"],
        };
      }

      // فحص اسم النطاق المسموح (Hostname verification)
      const allowedHostname = process.env.ALLOWED_HOSTNAME;
      if (allowedHostname && data.hostname && data.hostname.toLowerCase() !== allowedHostname.toLowerCase()) {
        return {
          success: false,
          score,
          hostname: data.hostname,
          error: "نطاق رمز التحقق لا يطابق نطاق المنصة المعتمد.",
          reasons: ["HOSTNAME_MISMATCH"],
        };
      }

      return {
        success: true,
        score,
        action: data.action,
        hostname: data.hostname,
      };
    } catch (err) {
      // التعامل الصارم مع انقطاع خدمة Google: Fail-Closed في الإنتاج أو وضع الطوارئ
      if (settings.emergencyMode || isProduction) {
        return {
          success: false,
          error: "تعذر التحقق من خوادم الحماية. أعد المحاولة لاحقًا (Fail-Closed Enforcement).",
          reasons: ["GOOGLE_SERVICE_UNAVAILABLE"],
        };
      }
      // في وضع التطوير المحلي العادي فقط: نسجل التحذير ونمرر الطلب
      console.warn("[RECAPTCHA] تعذر الوصول لخوادم Google reCAPTCHA (تمرير محلي مع تحذير):", (err as Error).message);
      return { success: true, score: 0.5, simulated: true };
    }
  },
};
