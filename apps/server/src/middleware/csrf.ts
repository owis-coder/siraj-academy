// ============================================================
// وسيط الحماية من تزوير الطلبات عبر المواقع (CSRF Protection Middleware)
// يعتمد التحقق من الأصل (Origin / Referer Validation) والترويسات المخصصة
// ويمنع أي هجوم تزوير للطلبات المعتمدة على الكوكيز (SameSite=None).
// ============================================================
import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { isOriginTrusted } from "../lib/cors";
import { COOKIE_NAME } from "../lib/jwt";

export const CSRF_COOKIE_NAME = "siraj_csrf";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** استخراج أصل الرابط من ترويسة Referer */
function getOriginFromReferer(referer: string | undefined): string | null {
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

/**
 * وسيط حماية CSRF:
 * 1) الطلبات الآمنة (GET, HEAD, OPTIONS) تمر دون حظر مع تحديث رمز CSRF الكوكي.
 * 2) الطلبات المعتمدة على Bearer Token حصريًا (بلا كوكي) معفاة لأن المتصفح لا يرفق الترويسة آليًا.
 * 3) الطلبات المغيرة للحالة (POST, PUT, PATCH, DELETE) المعتمدة على الكوكي تخضع للتحقق الصارم:
 *    - التحقق من ترويسة Origin أو Referer ومطابقتها للأصول الموثوقة.
 *    - حظر أي طلب قادم من نطاق غريب أو غير مصرح به بحالة 403.
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  // 1) الطريقة الآمنة للقراءة: نمرر ونضمن وجود كوكي CSRF للمستخدم
  if (SAFE_METHODS.has(req.method)) {
    if (!req.cookies?.[CSRF_COOKIE_NAME]) {
      const token = crypto.randomBytes(24).toString("hex");
      const isProd = process.env.NODE_ENV === "production";
      res.cookie(CSRF_COOKIE_NAME, token, {
        httpOnly: false, // متاح لجافاسكريبت الواجهة الأمامية لقراءته وإرساله في X-CSRF-Token
        secure: isProd,
        sameSite: isProd ? "none" : "lax",
        path: "/",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
    }
    return next();
  }

  // 2) فحص هل الطلب يستخدم كوكي الجلسة
  const hasSessionCookie = Boolean(req.cookies?.[COOKIE_NAME]);
  const hasAuthHeader = Boolean(req.headers.authorization?.startsWith("Bearer "));

  // إذا كان الطلب يعتمد حصريًا على Bearer Token في الترويسة بدون كوكي:
  // المتصفح لا يرسل ترويسات Authorization مخصصة في هجمات CSRF الكلاسيكية
  if (hasAuthHeader && !hasSessionCookie) {
    return next();
  }

  // 3) التحقق الصارم من الأصل (Origin / Referer)
  const origin = req.headers.origin;
  const referer = req.headers.referer;

  if (origin) {
    if (!isOriginTrusted(origin)) {
      res.status(403).json({
        message: "تم رفض الطلب: نطاق المصدر (Origin) غير موثوق به أمنيًا لحماية حسابك (CSRF).",
        error: { code: "CSRF_ORIGIN_INVALID" },
      });
      return;
    }
    return next();
  }

  if (referer) {
    const refererOrigin = getOriginFromReferer(referer);
    if (!refererOrigin || !isOriginTrusted(refererOrigin)) {
      res.status(403).json({
        message: "تم رفض الطلب: مرجع الطلب (Referer) غير مصرح به أمنيًا (CSRF).",
        error: { code: "CSRF_REFERER_INVALID" },
      });
      return;
    }
    return next();
  }

  // 4) إذا غاب Origin و Referer معًا في طلب يغير الحالة ويحمل كوكي:
  // نتحقق من وجود ترويسة مخصصة لا يمكن لـ HTML Form عادي أو <img> أو <script> إرسالها
  const customHeader =
    req.headers["x-csrf-token"] ||
    req.headers["x-requested-with"] ||
    (typeof req.headers["content-type"] === "string" && req.headers["content-type"].includes("application/json"));

  if (hasSessionCookie && !customHeader) {
    res.status(403).json({
      message: "تم رفض الطلب: مفقود بيانات التحقق الأمني من تزوير الطلبات (Missing CSRF Proof).",
      error: { code: "CSRF_VERIFICATION_REQUIRED" },
    });
    return;
  }

  next();
}
