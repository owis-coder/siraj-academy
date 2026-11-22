// ============================================================
// تنظيف المدخلات والوقاية من هجمات XSS وحقن المحتوى الضار
// ينظف النصوص المدخلة من وسوم السكربت، معالجات الأحداث (onerror, onload)،
// ومحاولات استغلال البروتوكولات المزيفة (javascript: data:)
// مع الحفاظ الكامل على الحروف العربية، الرموز، والأسماء المشروعة.
// ============================================================

/**
 * تنظيف نصوص المستخدمين العادية (الأسماء، النبذة، الملاحظات، الرسائل، تفاصيل الطلبات)
 */
export function sanitizePlainText(input: unknown): string {
  if (typeof input !== "string") return "";
  let clean = input.normalize("NFKC");

  // إزالة محارف التحكم الخفية الضارة (Null bytes و Escape sequences)
  clean = clean.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");

  // إزالة وسوم السكربت والأطر
  clean = clean.replace(/<\s*(script|iframe|embed|object|base|link|meta)[\s\S]*?>[\s\S]*?<\s*\/\s*\1\s*>/gi, "");
  clean = clean.replace(/<\s*(script|iframe|embed|object|base|link|meta)[\s\S]*?\/?>/gi, "");

  // إزالة معالجات الأحداث الخبيثة مثل onload=, onerror=, onclick=
  clean = clean.replace(/\bon\w+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, "");

  // إزالة بروتوكولات جافاسكريبت
  clean = clean.replace(/javascript\s*:/gi, "blocked-script:");
  clean = clean.replace(/vbscript\s*:/gi, "blocked-script:");
  clean = clean.replace(/data\s*:\s*text\/html/gi, "blocked-data:");

  return clean.trim();
}

/**
 * تنظيف الحقول التي يُتوقع أن تحتوي روابط
 */
export function sanitizeUrl(input: unknown): string {
  if (typeof input !== "string") return "";
  const trimmed = input.trim();
  if (!trimmed) return "";

  // الروابط المسموح بها تبدأ بـ https:// أو http:// أو /
  if (/^(?:https?:\/\/|\/)/i.test(trimmed)) {
    // التأكد من خلو الرابط من بروتوكولات جافاسكريبت أو فراغات مريبة
    if (!/javascript:|data:|vbscript:/i.test(trimmed)) {
      return trimmed;
    }
  }

  return "";
}

/**
 * هروب HTML للقيم المعروضة في بيئات غير React (مثل رسائل البريد الإلكتروني)
 */
export function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
