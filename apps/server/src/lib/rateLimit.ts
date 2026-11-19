// ============================================================
// حدّ معدل بسيط في الذاكرة (لكل مفتاح: IP + إجراء).
// يُستخدم لحماية نقاط النهاية العامة من الإساءة (فحص اسم المستخدم،
// إعادة إرسال روابط التحقق/الاستعادة).
// ملاحظة: الذاكرة محلية للعملية — في نشر متعدد النسخ يُستحسن مخزن مشترك.
// ============================================================

interface Bucket {
  hits: number[];
}

const buckets = new Map<string, Bucket>();
const MAX_KEYS = 5000;

export interface RateLimitResult {
  ok: boolean;
  /** الثواني المتبقية قبل السماح بالمحاولة التالية */
  retryAfterSec: number;
  remaining: number;
}

/** يسجل محاولة ويعيد هل هي مسموحة خلال النافذة الزمنية */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);

  if (bucket.hits.length >= limit) {
    const oldest = bucket.hits[0] ?? now;
    const retryAfterSec = Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000));
    buckets.set(key, bucket);
    return { ok: false, retryAfterSec, remaining: 0 };
  }

  bucket.hits.push(now);
  buckets.set(key, bucket);

  // تنظيف دوري بسيط لتجنّب تضخّم الذاكرة
  if (buckets.size > MAX_KEYS) {
    for (const [k, b] of buckets) {
      if (!b.hits.some((t) => now - t < windowMs)) buckets.delete(k);
    }
  }

  return { ok: true, retryAfterSec: 0, remaining: limit - bucket.hits.length };
}

/** يصفّر الحد لمفتاح (بعد نجاح العملية مثلًا) */
export function resetRateLimit(key: string): void {
  buckets.delete(key);
}
