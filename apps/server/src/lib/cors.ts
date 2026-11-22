// ============================================================
// سياسة CORS الصارمة وحماية الأصل المشترك (Strict CORS Policy)
// تحظر تمامًا عكس الأصول العشوائية أو استخدام Wildcard مع الاعتماديات (Credentials)
// وتسمح فقط بالأصول الموثوقة صراحة في بيئة الإنتاج والتطوير المعتمد.
// ============================================================
import type { Request, Response, NextFunction } from "express";

/** قائمة الأصول المعتمدة افتراضيًا في الإنتاج */
const DEFAULT_PROD_ORIGINS = [
  "https://siraj-academy-qhht.vercel.app",
  "https://sirajacademy.com",
  "https://www.sirajacademy.com",
];

/** قائمة الأصول المسموحة في بيئة التطوير والاختبار المحلي فقط */
const DEV_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:3000",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:3000",
];

const ALLOWED_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];
const ALLOWED_HEADERS = [
  "Content-Type",
  "Authorization",
  "X-Requested-With",
  "X-Captcha-Token",
  "X-CSRF-Token",
  "Accept",
  "Accept-Language",
  "x-captcha-token",
  "x-csrf-token",
];
const EXPOSED_HEADERS = ["Content-Range", "X-Content-Range", "Retry-After"];

function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, "").toLowerCase();
}

/** تجميع الأصول الموثوقة من البيئة والمصفوفة الثابتة */
export function getTrustedOrigins(): Set<string> {
  const isProd = process.env.NODE_ENV === "production";
  const origins = new Set<string>();

  // 1) الأصول الإنتاجية الثابتة
  for (const o of DEFAULT_PROD_ORIGINS) {
    origins.add(normalizeOrigin(o));
  }

  // 2) أصول بيئة التطوير (في غير الإنتاج فقط)
  if (!isProd) {
    for (const o of DEV_ORIGINS) {
      origins.add(normalizeOrigin(o));
    }
  }

  // 3) الأصول المحددة في متغير البيئة CLIENT_URL أو ALLOWED_ORIGINS
  const envOrigins = [process.env.CLIENT_URL, process.env.ALLOWED_ORIGINS]
    .filter(Boolean)
    .join(",");

  if (envOrigins) {
    for (const raw of envOrigins.split(",")) {
      const trimmed = raw.trim();
      // حظر قاطع لأي محاولة لوضع "*" مع الاعتماديات
      if (!trimmed || trimmed === "*") continue;
      try {
        const url = new URL(trimmed);
        origins.add(normalizeOrigin(url.origin));
      } catch {
        // إذا كان بصيغة نطاق مباشر
        origins.add(normalizeOrigin(trimmed));
      }
    }
  }

  return origins;
}

/** هل الأصل الوارد موثوق به صراحة؟ */
export function isOriginTrusted(origin: string | undefined): boolean {
  if (!origin) return false;
  const normalized = normalizeOrigin(origin);
  const trusted = getTrustedOrigins();
  return trusted.has(normalized);
}

/**
 * وسيط CORS الصارم:
 * - لا يعكس أي Origin غير معتمد.
 * - لا يمنح Credentials إلا للأصول الموثوقة حصريًا.
 * - يرفض طلبات Preflight OPTIONS من الأصول المجهولة بحالة 403 Forbidden.
 */
export function strictCorsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;

  // إذا لم يكن هناك ترويسة Origin (طلب مباشر من السيرفر، Curl، أو Same-Origin)
  if (!origin) {
    return next();
  }

  const trusted = isOriginTrusted(origin);

  if (trusted) {
    const normalized = normalizeOrigin(origin);
    res.setHeader("Access-Control-Allow-Origin", normalized);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", ALLOWED_METHODS.join(", "));
    res.setHeader("Access-Control-Allow-Headers", ALLOWED_HEADERS.join(", "));
    res.setHeader("Access-Control-Expose-Headers", EXPOSED_HEADERS.join(", "));
    res.setHeader("Access-Control-Max-Age", "86400"); // 24 ساعة كاش لـ Preflight
    res.setHeader("Vary", "Origin");

    // الرد الفوري على طلبات Preflight المعتمدة
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    return next();
  }

  // إذا كان الأصل غير موثوق:
  // في طلبات OPTIONS Preflight نرفض صراحة لمنع أي استكشاف
  if (req.method === "OPTIONS") {
    res.status(403).json({
      message: "نطاق الطلب غير مصرح به عبر سياسة حماية CORS المعتمدة.",
      error: { code: "CORS_ORIGIN_DENIED" },
    });
    return;
  }

  // للطلبات العادية من أصل غير معتمد: لا نضيف أي ترويسات CORS (فيمتنع المتصفح عن قراءة الاستجابة)
  res.setHeader("Vary", "Origin");
  next();
}
