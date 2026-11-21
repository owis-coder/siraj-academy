import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../lib/toast';
import { useI18n } from '../../i18n';
import { Card } from '../../components/ui';
import { GoogleSignInButton } from '../../components/GoogleSignInButton';

export default function RegisterChoice() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const toast = useToast();
  const { refresh } = useAuth();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const teacherParam = params.get('tab') === 'teacher' ? '?tab=teacher' : '';

  const handleGoogleSuccess = async (idToken: string) => {
    setErrorMsg(null);
    setBusy(true);
    try {
      const res = await api.auth.google(idToken);
      const data = res.data;

      if (data.status === 'LOGGED_IN') {
        await refresh();
        toast.push('success', t('login.success') || 'تم تسجيل الدخول بنجاح');
        const userRole = data.user?.role;
        if (userRole === 'TEACHER') {
          nav('/teacher/profile', { replace: true });
        } else if (userRole === 'ADMIN') {
          nav('/admin', { replace: true });
        } else {
          nav('/dashboard', { replace: true });
        }
        return;
      }

      if (data.status === 'ACCOUNT_EXISTS') {
        toast.push(
          'info',
          t('oauth.existingAccountLogin') ||
            'يوجد حساب مسجل بهذا البريد مسبقًا. يرجى تسجيل الدخول أولاً بكلمة المرور لإتمام ربط حساب Google بأمان.'
        );
        nav('/login', {
          state: { identifier: data.email },
          replace: true,
        });
        return;
      }

      if (data.status === 'NEEDS_COMPLETION') {
        const payload = {
          registrationTicket: data.registrationTicket,
          email: data.email,
          fullName: data.fullName,
          avatarUrl: data.avatarUrl,
        };

        try {
          sessionStorage.setItem('siraj_oauth_registration', JSON.stringify(payload));
        } catch {
          /* تجاهل خطأ التخزين في البيئات المقيدة */
        }

        nav('/register/complete', {
          state: payload,
          replace: true,
        });
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'تعذر التحقق من حساب Google. يرجى المحاولة مرة أخرى.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container-x flex min-h-[75vh] items-center justify-center py-12">
      <Card className="w-full max-w-lg p-6 sm:p-10 shadow-card">
        {/* رأس الصفحة مع أنيميشن متلاشي للأعلى */}
        <div className="text-center animate-fadeUp">
          <h1 className="text-2xl font-extrabold sm:text-3xl text-ink-primary">
            {t('oauth.welcomeTitle')}{' '}
            <span className="gold-text">{t('register.titleHighlight')}</span>
          </h1>
          <p className="mt-2 text-sm text-ink-secondary leading-relaxed">
            {t('oauth.welcomeDesc')}
          </p>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="mt-6 rounded-lg border border-danger/40 bg-danger/10 p-3.5 text-center text-xs text-coral"
          >
            {errorMsg}
          </div>
        )}

        <div className="mt-8 space-y-4">
          {/* الخيار الأول: المتابعة باستخدام Google */}
          <div className="rounded-xl border border-line bg-surface-2/40 p-4 transition-all hover:border-gold-300/60 hover:bg-surface-2/70">
            <div className="mb-2 text-xs font-semibold text-ink-muted">
              {t('oauth.continueWithGoogle')}
            </div>
            <GoogleSignInButton
              text="continue_with"
              disabled={busy}
              onSuccess={handleGoogleSuccess}
              onError={(err) => setErrorMsg(err.message)}
            />
          </div>

          {/* فاصل "أو" */}
          <div className="relative flex items-center justify-center my-3">
            <div className="w-full border-t border-line" />
            <span className="absolute bg-surface px-4 text-xs font-medium text-ink-muted">
              {t('oauth.or')}
            </span>
          </div>

          {/* الخيار الثاني: التسجيل باستخدام البريد الإلكتروني */}
          <button
            type="button"
            onClick={() => nav(`/register/form${teacherParam}`)}
            className="group flex w-full items-start gap-4 rounded-xl border border-line bg-surface p-4 text-start transition-all hover:border-gold-300 hover:bg-surface-2/50 focus:outline-none focus:ring-2 focus:ring-gold-400/40"
          >
            <div className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-lg border border-line bg-elevated/70 text-ink-secondary transition-colors group-hover:border-gold-300/40 group-hover:text-gold-500">
              <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect width="20" height="16" x="2" y="4" rx="2" />
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
              </svg>
            </div>
            <div className="flex-1">
              <div className="text-sm font-bold text-ink-primary group-hover:text-gold-500 transition-colors">
                {t('oauth.emailOptionTitle')}
              </div>
              <p className="mt-0.5 text-xs text-ink-muted leading-relaxed">
                {t('oauth.emailOptionDesc')}
              </p>
            </div>
          </button>
        </div>

        {/* رابط تسجيل الدخول للحسابات القائمة */}
        <p className="mt-8 text-center text-xs text-ink-muted">
          {t('register.haveAccount')}{' '}
          <Link
            to="/login"
            className="font-semibold text-gold-500 hover:text-gold-400 hover:underline"
          >
            {t('register.signIn')}
          </Link>
        </p>
      </Card>
    </div>
  );
}
