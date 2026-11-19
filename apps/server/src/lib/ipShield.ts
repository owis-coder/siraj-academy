// ============================================================
// درع العناوين وشبكة التوصيل الطرفية (IP Shield & Cloudflare Helper)
// يمنع تزوير ترويسات X-Forwarded-For ويتحقق بدقة من ترويسات Cloudflare
// ويعزل عناوين IP بأمان لمنع استهداف أو حظر شبكات جامعية بأكملها.
// ============================================================
import type { Request } from "express";

// نطاقات Cloudflare الرسمية المعتمدة (IPv4)
const CLOUDFLARE_IPV4_CIDRS = [
  "173.245.48.0/20",
  "103.21.244.0/22",
  "103.22.200.0/22",
  "103.31.4.0/22",
  "141.101.64.0/18",
  "108.162.192.0/18",
  "190.93.240.0/20",
  "188.114.96.0/20",
  "197.234.240.0/22",
  "198.41.128.0/17",
  "162.158.0.0/15",
  "104.16.0.0/13",
  "104.24.0.0/14",
  "172.64.0.0/13",
  "131.0.72.0/22",
];

// نطاقات محلية موثوقة (Reverse Proxies مثل Nginx أو Caddy محلي)
const LOCAL_PROXY_PREFIXES = ["127.", "10.", "172.16.", "172.17.", "172.18.", "172.19.", "172.20.", "172.30.", "172.31.", "192.168.", "::1", "fc00:", "fd00:"];

function ipToInt(ip: string): number {
  return ip
    .split(".")
    .reduce((acc, octet) => ((acc << 8) + parseInt(octet, 10)) >>> 0, 0);
}

function isIpInCidr(ip: string, cidr: string): boolean {
  if (!ip.includes(".") || !cidr.includes(".")) return false;
  const [range, bitsStr] = cidr.split("/");
  const bits = parseInt(bitsStr, 10);
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  const ipIntVal = ipToInt(ip);
  const rangeInt = ipToInt(range);
  return (ipIntVal & mask) === (rangeInt & mask);
}

export function isCloudflareIp(ip: string): boolean {
  const clean = cleanIp(ip);
  if (!clean) return false;
  // فحص IPv4
  for (const cidr of CLOUDFLARE_IPV4_CIDRS) {
    if (isIpInCidr(clean, cidr)) return true;
  }
  // فحص نطاق Cloudflare IPv6
  if (clean.toLowerCase().startsWith("2400:cb00:") || clean.toLowerCase().startsWith("2606:4700:") || clean.toLowerCase().startsWith("2803:f800:")) {
    return true;
  }
  return false;
}

export function isLocalProxy(ip: string): boolean {
  const clean = cleanIp(ip);
  if (!clean) return false;
  return LOCAL_PROXY_PREFIXES.some((prefix) => clean.startsWith(prefix));
}

/** تنظيف الـ IP من بادئات IPv6-mapped IPv4 */
export function cleanIp(raw: string | undefined | null): string {
  if (!raw) return "";
  let s = String(raw).trim();
  if (s.startsWith("::ffff:")) {
    s = s.slice(7);
  }
  // إزالة المنفذ إن وُجد (e.g. 1.2.3.4:5678)
  if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(s)) {
    s = s.split(":")[0];
  }
  return s;
}

/**
 * يستخرج عنوان العميل الحقيقي بصورة آمنة ومقاومة للتزوير.
 * لا يعتمد على X-Forwarded-For إلا إذا كان الطلب واردًا من وكيل محلي معتمد أو Cloudflare.
 */
export function getTrustedClientIp(req: Request): string {
  const remoteIp = cleanIp(req.socket?.remoteAddress);

  // 1) إذا كان الطلب قادمًا عبر Cloudflare (ترويسة cf-connecting-ip)
  const cfIp = req.headers["cf-connecting-ip"];
  if (typeof cfIp === "string" && cfIp.trim()) {
    const cleanCf = cleanIp(cfIp);
    // نثق بـ Cloudflare إذا كان socket IP ينتمي لـ Cloudflare أو بروكسي محلي
    if (isCloudflareIp(remoteIp) || isLocalProxy(remoteIp) || process.env.NODE_ENV !== "production") {
      return cleanCf;
    }
  }

  // 2) إذا كان من وكيل محلي موثوق (Nginx / Docker proxy)
  if (isLocalProxy(remoteIp)) {
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded.trim()) {
      const parts = forwarded.split(",").map((p) => cleanIp(p)).filter(Boolean);
      // أول عنوان في القائمة هو العميل الأصلي
      if (parts[0]) return parts[0];
    }
    const realIp = req.headers["x-real-ip"];
    if (typeof realIp === "string" && realIp.trim()) {
      return cleanIp(realIp);
    }
  }

  // 3) غير ذلك: استخدام remote socket IP المباشر منعًا لأي تزوير
  return remoteIp || "127.0.0.1";
}

/**
 * يعيد تمثيل النطاق المحدد (Subnet) لحظر آمن:
 * لـ IPv4 يعيد العنوان المفرد /32 (لا يحظر الشبكة /24 كاملة لحماية المشتركين في نفس الجامعة)
 * ولـ IPv6 يعيد بادئة /64 لحظر نطاق الجهاز
 */
/**
 * يعيد تمثيل النطاق المحدد (Subnet) لحظر آمن:
 * لـ IPv4 يعيد العنوان المفرد /32 (لا يحظر الشبكة /24 كاملة لحماية المشتركين في نفس الجامعة)
 * ولـ IPv6 يعيد بادئة /64 لحظر نطاق الجهاز
 */
export function getSubnetIdentifier(ip: string): string {
  const clean = cleanIp(ip);
  if (!clean.includes(":")) {
    return clean; // IPv4 فردي
  }
  // IPv6: نأخذ أول 4 مقاطع (/64)
  const parts = clean.split(":");
  if (parts.length >= 4) {
    return parts.slice(0, 4).join(":") + "::/64";
  }
  return clean;
}

/**
 * وسيط حماية الأصل (Origin Shield Middleware):
 * عندما يكون CLOUDFLARE_ENABLED=true في بيئة الإنتاج، يُلزم بأن تكون جميع الاتصالات الواردة
 * قادمة إما من نطاقات Cloudflare الرسمية أو من وكيل محلي / فحص صحة معتمد،
 * ويمنع الاتصال المباشر بعنوان Origin IP لتفادي تجاوز حافة WAF.
 */
export function originShieldMiddleware(req: Request, res: import("express").Response, next: import("express").NextFunction): void {
  // لا نطبق الحظر إذا لم تكن الحماية مفعلة، أو في بيئة التطوير والاختبار المحلي
  if (process.env.CLOUDFLARE_ENABLED !== "true" || process.env.NODE_ENV !== "production") {
    return next();
  }

  // السماح بمسارات فحص الصحة المحلية (Health Checks) دون إعاقة
  if (req.path === "/healthz" || req.path === "/api/healthz") {
    return next();
  }

  const socketIp = cleanIp(req.socket?.remoteAddress);

  // التحقق الحصري من اتصال الـ Socket الحقيقي
  const isAllowedSource = isCloudflareIp(socketIp) || isLocalProxy(socketIp);

  if (!isAllowedSource) {
    res.status(403).json({
      message: "الاتصال المباشر بخادم الأصل غير مصرح به. يجب الوصول عبر شبكة الحماية المعتمدة فقط.",
      error: { code: "ORIGIN_DIRECT_ACCESS_BLOCKED" },
    });
    return;
  }

  next();
}
