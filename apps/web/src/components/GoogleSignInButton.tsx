import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useI18n } from '../i18n';
import { useToast } from '../lib/toast';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              type?: 'standard' | 'icon';
              theme?: 'outline' | 'filled_blue' | 'filled_black';
              size?: 'large' | 'medium' | 'small';
              text?: 'signin_with' | 'signup_with' | 'continue_with';
              shape?: 'rectangular' | 'pill' | 'circle' | 'square';
              logo_alignment?: 'left' | 'center';
              width?: number | string;
              locale?: string;
            }
          ) => void;
          prompt: (momentListener?: (moment: unknown) => void) => void;
        };
      };
    };
  }
}

export interface GoogleSignInButtonProps {
  onSuccess: (idToken: string) => void;
  onError?: (error: Error) => void;
  text?: 'continue_with' | 'signup_with' | 'signin_with';
  disabled?: boolean;
  className?: string;
}

export function GoogleSignInButton({
  onSuccess,
  onError,
  text = 'continue_with',
  disabled = false,
  className = '',
}: GoogleSignInButtonProps) {
  const { lang, t } = useI18n();
  const toast = useToast();
  const [clientId, setClientId] = useState<string>(
    (import.meta.env.VITE_GOOGLE_CLIENT_ID as string) || ''
  );
  const [gisLoaded, setGisLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // جلب Client ID من الخادم إذا لم يكن معرّفاً في الواجهة
  useEffect(() => {
    let unmounted = false;
    if (!clientId) {
      api.platform.public().then((res) => {
        if (!unmounted && res.data?.oauth?.googleClientId) {
          setClientId(res.data.oauth.googleClientId);
        }
      }).catch(() => {
        /* تجاهل عند عدم توفر الاتصال */
      });
    }
    return () => {
      unmounted = true;
    };
  }, [clientId]);

  // التحقق من تحميل مكتبة Google GIS
  useEffect(() => {
    const checkGis = () => {
      if (typeof window !== 'undefined' && window.google?.accounts?.id) {
        setGisLoaded(true);
        return true;
      }
      return false;
    };

    if (checkGis()) return;

    const timer = setInterval(() => {
      if (checkGis()) clearInterval(timer);
    }, 300);

    return () => clearInterval(timer);
  }, []);

  // تهيئة زر Google الرسمي إذا توفر Client ID
  useEffect(() => {
    if (!gisLoaded || !clientId || !containerRef.current) return;

    try {
      window.google?.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => {
          if (response.credential) {
            onSuccess(response.credential);
          }
        },
      });

      // تفريغ المحتوى السابق لتجنب التكرار
      containerRef.current.innerHTML = '';

      window.google?.accounts.id.renderButton(containerRef.current, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text,
        shape: 'rectangular',
        logo_alignment: 'left',
        width: 340,
        locale: lang,
      });
    } catch (err) {
      console.warn('[Google GIS] Setup error:', err);
    }
  }, [gisLoaded, clientId, lang, text, onSuccess]);

  const handleCustomClick = () => {
    if (disabled) return;

    if (!clientId) {
      toast.push(
        'info',
        lang === 'ar'
          ? 'تكامل Google جاهز برمجياً. يرجى ضبط GOOGLE_CLIENT_ID في إعدادات الخادم أو البيئة لتفعيل الدخول المباشر.'
          : 'Google Integration is ready. Please configure GOOGLE_CLIENT_ID in server settings.'
      );
      return;
    }

    if (gisLoaded && window.google?.accounts?.id) {
      try {
        window.google.accounts.id.prompt();
      } catch (err) {
        if (onError && err instanceof Error) onError(err);
      }
    } else {
      toast.push(
        'info',
        lang === 'ar'
          ? 'جاري تحميل خدمة Google، يرجى المحاولة بعد لحظات...'
          : 'Loading Google Identity Services, please try again in a moment...'
      );
    }
  };

  const buttonLabel =
    text === 'signup_with'
      ? t('oauth.signUpWithGoogle') || 'التسجيل باستخدام Google'
      : text === 'signin_with'
        ? t('oauth.signInWithGoogle') || 'تسجيل الدخول باستخدام Google'
        : t('oauth.continueWithGoogle') || 'المتابعة باستخدام Google';

  return (
    <div className={`relative flex w-full flex-col items-center justify-center ${className}`}>
      {/* حاوية زر Google الرسمي المنشأ بواسطة GIS */}
      {clientId ? (
        <div
          ref={containerRef}
          className="flex min-h-[44px] w-full items-center justify-center overflow-hidden rounded-lg"
        />
      ) : (
        /* زر مطابق للمواصفات الرسمية بشعار Google عندما لا يكون Client ID محملاً */
        <button
          type="button"
          onClick={handleCustomClick}
          disabled={disabled}
          className="group flex w-full max-w-[340px] items-center justify-center gap-3 rounded-lg border border-line bg-surface-1 px-4 py-2.5 text-sm font-medium text-ink transition-all hover:border-gold-300 hover:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-gold-400/40 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <GoogleIcon className="size-5 shrink-0" />
          <span>{buttonLabel}</span>
        </button>
      )}
    </div>
  );
}

export function GoogleIcon({ className = 'size-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  );
}
