import { useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api, type User } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../lib/toast';
import { Button, Card, Form, Field, Input, PasswordInput } from '../../components/ui';
import { useI18n } from '../../i18n';
import { IconShieldKeyhole } from '../../components/icons';
import { Recaptcha, type RecaptchaRef } from '../../components/Recaptcha';
import { GoogleSignInButton } from '../../components/GoogleSignInButton';

export default function Login() {
  const nav = useNavigate();
  const loc = useLocation();
  const toast = useToast();
  const { refresh } = useAuth();
  const { t } = useI18n();
  const stateIdentifier = (loc.state as { identifier?: string } | null)?.identifier ?? '';
  const [identifier, setIdentifier] = useState(stateIdentifier);
  const [password, setPassword] = useState('');
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaEnabled, setCaptchaEnabled] = useState(false);
  const recaptchaRef = useRef<RecaptchaRef>(null);
  const [mfaTicket, setMfaTicket] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleGoogleSuccess = async (idToken: string) => {
    setErr(null);
    setBusy(true);
    try {
      const res = await api.auth.google(idToken);
      const data = res.data;

      if (data.status === 'LOGGED_IN') {
        await refresh();
        toast.push('success', t('login.success'));
        navigateAfterLogin(data.user);
        return;
      }

      if (data.status === 'ACCOUNT_EXISTS') {
        setIdentifier(data.email || '');
        setErr(
          t('oauth.existingAccountLogin') ||
            'يوجد حساب مسجل بهذا البريد مسبقًا. يرجى تسجيل الدخول بكلمة المرور الخاصة بك لإتمام ربط حساب Google بأمان.'
        );
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
          /* تجاهل */
        }
        nav('/register/complete', { state: payload });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'تعذر تسجيل الدخول عبر Google.');
    } finally {
      setBusy(false);
    }
  };

  const from = (loc.state as { from?: string } | null)?.from ?? null;

  const navigateAfterLogin = (user?: User | null) => {
    if (from) {
      nav(from, { replace: true });
    } else if (user?.role === 'ADMIN') {
      nav('/admin', { replace: true });
    } else if (user?.role === 'TEACHER') {
      nav('/teacher/profile', { replace: true });
    } else {
      nav('/dashboard', { replace: true });
    }
  };

  const submit = async () => {
    if (!identifier.trim() || !password) { setErr(t('login.required')); return; }
    if (captchaEnabled && !captchaToken) {
      setErr(t('captcha.required'));
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      const res = await api.auth.login(identifier.trim(), password, captchaToken);
      const data = res.data;

      if (data && 'requireMfa' in data && data.requireMfa) {
        setMfaTicket(data.mfaTicket);
        setMfaCode('');
        setErr(null);
        return;
      }

      const loggedInUser = data as User;
      await refresh();
      toast.push('success', t('login.success'));
      navigateAfterLogin(loggedInUser);
    } catch (e) {
      recaptchaRef.current?.reset();
      setCaptchaToken(null);
      setErr(e instanceof Error ? e.message : t('login.failed'));
    } finally {
      setBusy(false);
    }
  };

  const submitMfa = async () => {
    if (!mfaTicket || !mfaCode.trim()) {
      setErr('يرجى إدخال رمز التحقق المكون من 6 أرقام أو رمز الاسترجاع.');
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      const res = await api.auth.mfa.verify({ mfaTicket, code: mfaCode.trim() });
      await refresh();
      toast.push('success', t('login.success'));
      navigateAfterLogin(res.data.user);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'رمز التحقق غير صحيح أو منتهي.');
    } finally {
      setBusy(false);
    }
  };

  if (mfaTicket) {
    return (
      <div className="container-x grid min-h-[70vh] max-w-md place-items-center py-14">
        <Card className="w-full p-8">
          <div className="mb-4 inline-flex size-12 items-center justify-center rounded-2xl bg-gold-400/10 text-gold-300">
            <IconShieldKeyhole className="size-6 text-gold-300" />
          </div>
          <h1 className="mb-1 text-2xl font-bold">التحقق بخطوتين (MFA)</h1>
          <p className="mb-6 text-sm text-ink-muted">
            أدخل الرمز المكون من 6 أرقام من تطبيق التحقق (Google Authenticator) أو أحد رموز الاسترجاع الاحتياطية.
          </p>
          <Form onSubmit={submitMfa} className="space-y-4">
            <Field label="رمز التحقق" required>
              <Input
                autoFocus
                dir="ltr"
                placeholder="123456"
                maxLength={16}
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
              />
            </Field>
            {err && (
              <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-coral">
                {err}
              </p>
            )}
            <Button type="submit" loading={busy} className="w-full">
              تأكيد الدخول
            </Button>
            <Button
              type="button"
              variant="subtle"
              className="w-full"
              onClick={() => {
                setMfaTicket(null);
                setMfaCode('');
                setErr(null);
              }}
            >
              العودة لتسجيل الدخول
            </Button>
          </Form>
        </Card>
      </div>
    );
  }

  return (
    <div className="container-x grid min-h-[70vh] max-w-md place-items-center py-14">
      <Card className="w-full p-8">
        <h1 className="mb-1 text-2xl font-bold">{t('login.title')}</h1>
        <p className="mb-6 text-sm text-ink-muted">{t('login.subtitle')}</p>

        <div className="mb-5">
          <GoogleSignInButton
            text="signin_with"
            disabled={busy}
            onSuccess={handleGoogleSuccess}
            onError={(e) => setErr(e.message)}
          />
          <div className="relative my-4 flex items-center justify-center">
            <div className="w-full border-t border-line" />
            <span className="absolute bg-surface px-3 text-xs font-medium text-ink-muted">
              {t('oauth.or')}
            </span>
          </div>
        </div>

        <Form onSubmit={submit} className="space-y-4">
          <Field label={t('login.identifier')} required>
            <Input
              dir="ltr"
              autoComplete="username"
              placeholder=""
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
            />
          </Field>
          <Field label={t('common.password')} required>
            <PasswordInput
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <div className="text-end">
            <Link to="/forgot-password" className="text-xs text-gold-300 hover:text-gold-200">
              {t('login.forgot')}
            </Link>
          </div>
          <Recaptcha
            ref={recaptchaRef}
            onVerify={(token) => {
              setCaptchaToken(token);
              setErr(null);
            }}
            onExpired={() => setCaptchaToken(null)}
            onReady={setCaptchaEnabled}
          />
          {err && <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-coral">{err}</p>}
          <Button type="submit" loading={busy} className="w-full">{t('common.login')}</Button>
        </Form>
        <p className="mt-5 text-center text-sm text-ink-muted">
          {t('login.noAccount')} <Link to="/register" className="text-gold-300 hover:text-gold-200">{t('login.createFree')}</Link>
        </p>
      </Card>
    </div>
  );
}
