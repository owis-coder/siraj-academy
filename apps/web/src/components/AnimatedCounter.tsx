import { useEffect, useRef, useState } from 'react';

export interface AnimatedCounterProps {
  /** القيمة الرقمية أو النصية (يقوم باستخراج الأرقام بذكاء مثل 1,280 أو 250 ر.س) */
  value: number | string | null | undefined;
  /** مدة الأنيميشن بالميلي ثانية (الافتراضي: 1100) */
  duration?: number;
  /** كلاسات إضافية */
  className?: string;
  /** نص قبل الرقم */
  prefix?: string;
  /** نص بعد الرقم */
  suffix?: string;
  /** تفعيل تأثير النبضة واللمعة اللطيفة عند اكتمال العد */
  glow?: boolean;
}

interface ParsedValue {
  isNumeric: boolean;
  target: number;
  prefix: string;
  suffix: string;
  decimals: number;
  raw: string;
}

/**
 * يحلل القيمة لاستخراج الرقم والبادئة واللاحقة مع دعم العملات مثل "250 ر.س" أو "SAR 1,500"
 */
function parseValue(value: number | string | null | undefined, customPrefix = '', customSuffix = ''): ParsedValue {
  if (value === null || value === undefined) {
    return { isNumeric: false, target: 0, prefix: customPrefix, suffix: customSuffix, decimals: 0, raw: '—' };
  }

  if (typeof value === 'number') {
    if (isNaN(value)) {
      return { isNumeric: false, target: 0, prefix: customPrefix, suffix: customSuffix, decimals: 0, raw: '—' };
    }
    const decimals = Number.isInteger(value) ? 0 : 2;
    return { isNumeric: true, target: value, prefix: customPrefix, suffix: customSuffix, decimals, raw: String(value) };
  }

  const str = String(value).trim();
  if (!str || str === '—' || str === '-') {
    return { isNumeric: false, target: 0, prefix: customPrefix, suffix: customSuffix, decimals: 0, raw: str || '—' };
  }

  // إذا كان النص يحتوي على كسر أو سلاش مثل "24/7" فلا يُعد رقماً تصاعدياً
  if (str.includes('/')) {
    return { isNumeric: false, target: 0, prefix: customPrefix, suffix: customSuffix, decimals: 0, raw: str };
  }

  // التقاط البادئة والرقم واللاحقة (يدعم الفواصل والكسور العشرية)
  // مثال: "1,280", "250 ر.س", "SAR 1,500.50", "+50"
  const match = str.match(/^([^\d\-+]*?)([-+]?[\d,]+(?:\.\d+)?)([^\d]*)$/);
  if (match) {
    const rawPrefix = match[1] ?? '';
    const numPart = match[2]?.replace(/,/g, '') ?? '';
    const rawSuffix = match[3] ?? '';
    const target = parseFloat(numPart);

    if (!isNaN(target)) {
      const decimals = numPart.includes('.') ? numPart.split('.')[1].length : 0;
      return {
        isNumeric: true,
        target,
        prefix: customPrefix || rawPrefix,
        suffix: customSuffix || rawSuffix,
        decimals,
        raw: str,
      };
    }
  }

  return { isNumeric: false, target: 0, prefix: customPrefix, suffix: customSuffix, decimals: 0, raw: str };
}

/**
 * مكوّن العداد التصاعدي Counter Up مع تأثير حركي انسيابي لطيف (Gentle Easing & Pop Effect)
 */
export function AnimatedCounter({
  value,
  duration = 1100,
  className = '',
  prefix = '',
  suffix = '',
  glow = true,
}: AnimatedCounterProps) {
  const parsed = parseValue(value, prefix, suffix);
  const [displayNumber, setDisplayNumber] = useState<number>(0);
  const [isComplete, setIsComplete] = useState<boolean>(false);
  const [hasEnteredView, setHasEnteredView] = useState<boolean>(false);
  const spanRef = useRef<HTMLSpanElement>(null);
  const prevTargetRef = useRef<number>(0);

  // مراقبة ظهور العنصر في الشاشة لبدء العد لحظة وصول المستخدم له
  useEffect(() => {
    if (!spanRef.current) return;
    if (typeof IntersectionObserver === 'undefined') {
      setHasEnteredView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setHasEnteredView(true);
            observer.disconnect();
          }
        });
      },
      { threshold: 0.15 }
    );

    observer.observe(spanRef.current);
    return () => observer.disconnect();
  }, []);

  // تشغيل حركة العد التصاعدي مع دالة تسارع لطيفة (Ease-out Quartic)
  useEffect(() => {
    if (!parsed.isNumeric || !hasEnteredView) {
      if (!parsed.isNumeric) setIsComplete(true);
      return;
    }

    // التحقق من تفضيلات تقليل الحركة (prefers-reduced-motion)
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      setDisplayNumber(parsed.target);
      setIsComplete(true);
      prevTargetRef.current = parsed.target;
      return;
    }

    setIsComplete(false);
    const startVal = prevTargetRef.current;
    const endVal = parsed.target;

    if (startVal === endVal) {
      setDisplayNumber(endVal);
      setIsComplete(true);
      return;
    }

    const startTime = performance.now();
    let animId: number;

    const easeOutQuart = (x: number): number => 1 - Math.pow(1 - x, 4);

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, Math.max(0, elapsed / duration));
      const eased = easeOutQuart(progress);
      const current = startVal + (endVal - startVal) * eased;

      setDisplayNumber(current);

      if (progress < 1) {
        animId = requestAnimationFrame(step);
      } else {
        setDisplayNumber(endVal);
        prevTargetRef.current = endVal;
        setIsComplete(true);
      }
    };

    animId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animId);
  }, [hasEnteredView, parsed.isNumeric, parsed.target, duration]);

  if (!parsed.isNumeric) {
    return (
      <span ref={spanRef} className={`inline-block ${className}`}>
        {parsed.raw}
      </span>
    );
  }

  // تنسيق الرقم مع الفواصل
  const formattedNumber =
    parsed.decimals > 0
      ? displayNumber.toLocaleString('ar-SA-u-nu-latn', {
          minimumFractionDigits: parsed.decimals,
          maximumFractionDigits: parsed.decimals,
        })
      : Math.round(displayNumber).toLocaleString('ar-SA-u-nu-latn');

  return (
    <span
      ref={spanRef}
      className={`inline-flex items-center transition-all duration-300 ${
        isComplete && glow ? 'scale-[1.02] text-opacity-100' : ''
      } ${className}`}
      dir="ltr"
    >
      {parsed.prefix && <span className="opacity-90 me-0.5">{parsed.prefix}</span>}
      <span className="tabular-nums font-inherit tracking-normal">{formattedNumber}</span>
      {parsed.suffix && <span className="opacity-90 ms-1 text-[0.82em] font-normal">{parsed.suffix}</span>}
    </span>
  );
}

export default AnimatedCounter;
