import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useI18n } from '../i18n';
import { Spinner } from './ui';

declare global {
  interface Window {
    grecaptcha?: {
      render: (
        container: HTMLElement | string,
        parameters: {
          sitekey: string;
          theme?: 'light' | 'dark';
          size?: 'normal' | 'compact';
          tabindex?: number;
          callback?: (response: string) => void;
          'expired-callback'?: () => void;
          'error-callback'?: () => void;
          hl?: string;
        },
      ) => number;
      reset: (widgetId?: number) => void;
      getResponse: (widgetId?: number) => string;
      ready: (callback: () => void) => void;
    };
    onRecaptchaApiLoaded?: () => void;
  }
}

export interface RecaptchaRef {
  reset: () => void;
}

export interface RecaptchaProps {
  onVerify: (token: string) => void;
  onExpired?: () => void;
  onError?: () => void;
  onReady?: (enabled: boolean) => void;
  className?: string;
}

export const Recaptcha = forwardRef<RecaptchaRef, RecaptchaProps>(function Recaptcha(
  { onVerify, onExpired, onError, onReady, className = '' },
  ref,
) {
  const { lang, t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<number | null>(null);

  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [siteKey, setSiteKey] = useState<string>('');
  const [simulatedToken, setSimulatedToken] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  // كشف نمط المظهر الداكن
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

  // جلب إعدادات reCAPTCHA من الخادم أو من متغيرات Vite
  useEffect(() => {
    let active = true;

    async function loadConfig() {
      try {
        const viteSiteKey = (import.meta.env.VITE_RECAPTCHA_SITE_KEY as string | undefined)?.trim() || '';
        const { data } = await api.auth.captchaConfig();
        if (!active) return;

        const isEnabled = Boolean(data?.enabled);
        const resolvedKey = data?.siteKey?.trim() || viteSiteKey;

        setEnabled(isEnabled);
        setSiteKey(resolvedKey);
        onReady?.(isEnabled);
      } catch {
        if (!active) return;
        // في حال تعذر القراءة، نعتمد مفتاح الواجهة إن وجد
        const viteSiteKey = (import.meta.env.VITE_RECAPTCHA_SITE_KEY as string | undefined)?.trim() || '';
        const isEnabled = Boolean(viteSiteKey);
        setEnabled(isEnabled);
        setSiteKey(viteSiteKey);
        onReady?.(isEnabled);
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadConfig();
    return () => {
      active = false;
    };
  }, []);

  // دالة إعادة التعيين
  const reset = () => {
    setSimulatedToken(null);
    if (widgetIdRef.current !== null && window.grecaptcha?.reset) {
      try {
        window.grecaptcha.reset(widgetIdRef.current);
      } catch {}
    }
  };

  useImperativeHandle(ref, () => ({
    reset,
  }));

  // تحميل واستدعاء ويدجت Google reCAPTCHA الرسمي
  useEffect(() => {
    if (loading || !enabled || !siteKey || !containerRef.current) return;

    let unmounted = false;

    function renderWidget() {
      if (unmounted || !containerRef.current || !window.grecaptcha?.render) return;

      // تنظيف أي محتوى سابق داخل الحاوية عند تغيير اللغة
      containerRef.current.innerHTML = '';

      try {
        const id = window.grecaptcha.render(containerRef.current, {
          sitekey: siteKey,
          theme: isDark ? 'dark' : 'light',
          size: 'normal',
          hl: lang,
          callback: (token: string) => {
            if (!unmounted) {
              setErrorText(null);
              onVerify(token);
            }
          },
          'expired-callback': () => {
            if (!unmounted) {
              onExpired?.();
            }
          },
          'error-callback': () => {
            if (!unmounted) {
              setErrorText(t('captcha.failed'));
              onError?.();
            }
          },
        });
        widgetIdRef.current = id;
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[RECAPTCHA] Render issue:', e);
      }
    }

    // إذا كانت المكتبة محملة مسبقًا
    if (window.grecaptcha && typeof window.grecaptcha.render === 'function') {
      renderWidget();
      return;
    }

    // وإلا نحقن السكربت الرسمي لـ Google
    const scriptId = 'google-recaptcha-v2-script';
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;

    window.onRecaptchaApiLoaded = () => {
      if (!unmounted) renderWidget();
    };

    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.src = `https://www.google.com/recaptcha/api.js?onload=onRecaptchaApiLoaded&render=explicit&hl=${lang}`;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    } else if (window.grecaptcha) {
      window.grecaptcha.ready(() => {
        if (!unmounted) renderWidget();
      });
    }

    return () => {
      unmounted = true;
    };
  }, [loading, enabled, siteKey, lang, isDark]);

  if (loading) {
    return (
      <div className={`flex items-center gap-2 py-2 text-xs text-ink-muted ${className}`}>
        <Spinner className="size-3.5" />
        <span>{t('captcha.loading')}</span>
      </div>
    );
  }

  if (!enabled) {
    return null;
  }

  // إذا لم يتم توفير مفتاح Google في البيئة المحلية: تفعيل وضع المحاكاة الآمن للمطورين
  if (!siteKey) {
    return (
      <div className={`rounded-xl border border-line bg-elevated/40 p-3.5 text-xs ${className}`}>
        <div className="flex items-center justify-between gap-3">
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={!!simulatedToken}
              onChange={(e) => {
                if (e.target.checked) {
                  const token = `test_captcha_valid_${Date.now()}`;
                  setSimulatedToken(token);
                  setErrorText(null);
                  onVerify(token);
                } else {
                  setSimulatedToken(null);
                  onExpired?.();
                }
              }}
              className="size-5 rounded border-line text-gold-500 focus:ring-gold-300"
            />
            <span className="font-semibold text-ink-primary">
              {t('captcha.devMode')}
            </span>
          </label>
          <span className="rounded bg-gold-500/10 px-2 py-0.5 text-[10px] font-semibold text-gold-300">
            Dev Mode
          </span>
        </div>
        <p className="mt-1 text-[11px] text-ink-muted">
          {lang === 'ar'
            ? 'لم يُضبط RECAPTCHA_SITE_KEY في البيئة بعد — يعمل الحقل محليًا لاختبار المصادقة.'
            : 'RECAPTCHA_SITE_KEY is not configured in .env — running locally in dev mode.'}
        </p>
      </div>
    );
  }

  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="overflow-x-auto py-1">
        <div ref={containerRef} className="min-h-[78px] inline-block" />
      </div>
      {errorText && (
        <p role="alert" className="text-xs text-coral">
          {errorText}
        </p>
      )}
    </div>
  );
});
