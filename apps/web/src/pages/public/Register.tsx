import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../lib/toast';
import { Button, Card, Form, Field, Input, PasswordInput, Textarea, Tabs } from '../../components/ui';
import { IconCheck, IconClose } from '../../components/icons';
import { Recaptcha, type RecaptchaRef } from '../../components/Recaptcha';
import {
  EMAIL_RE,
  fullNameError,
  isPasswordValid,
  passwordChecks,
  usernameError,
} from '../../lib/accountRules';
import { useI18n } from '../../i18n';

/* ============================================================
   التسجيل: الحقول الأساسية فقط (الاسم، اسم المستخدم، البريد،
   كلمة المرور وتأكيدها). البيانات الإضافية تُستكمل من الإعدادات.
   اسم المستخدم يُفحص مباشرة من الخادم أثناء الكتابة (Debounce).
   ============================================================ */

type UsernameStatus = 'idle' | 'invalid' | 'checking' | 'available' | 'taken' | 'error';

export default function Register() {
  const nav = useNavigate();
  const toast = useToast();
  const { refresh } = useAuth();
  const { t } = useI18n();
  const [params] = useSearchParams();
  const [tab, setTab] = useState(params.get('tab') === 'teacher' ? 'teacher' : 'student');

  /* الحقول الأساسية المشتركة */
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  /* حقول وظيفية للمدرّس فقط (لازمة لمراجعة الاعتماد) */
  const [degree, setDegree] = useState('');
  const [specialties, setSpecialties] = useState('');
  const [bio, setBio] = useState('');
  const [docsUrl, setDocsUrl] = useState('');

  /* حالة فحص اسم المستخدم المباشر */
  const [unameStatus, setUnameStatus] = useState<UsernameStatus>('idle');
  const [unameMsgKey, setUnameMsgKey] = useState<string | null>(null);
  const checkSeq = useRef(0);

  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState<string[]>([]);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaEnabled, setCaptchaEnabled] = useState(false);
  const recaptchaRef = useRef<RecaptchaRef>(null);

  useEffect(() => {
    const value = username.trim();
    if (!value) {
      setUnameStatus('idle');
      setUnameMsgKey(null);
      return;
    }

    // إذا كان أقل من 3 أحرف، ننتظر أن يكمل المستخدم كتابة 3 أحرف ولا نعتبره خطأ أثناء الكتابة
    if (value.length < 3) {
      setUnameStatus('idle');
      setUnameMsgKey('validation.usernameMin');
      return;
    }

    const localError = usernameError(value);
    if (localError) {
      setUnameStatus('invalid');
      setUnameMsgKey(localError);
      return;
    }

    setUnameStatus('checking');
    setUnameMsgKey(null);
    const seq = ++checkSeq.current;

    // استجابة سريعة فورية بعد 200ms
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.auth.usernameAvailability(value);
        if (checkSeq.current !== seq) return;
        if (!data?.valid) {
          setUnameStatus('invalid');
          setUnameMsgKey('validation.usernameChars');
        } else if (data.available) {
          setUnameStatus('available');
        } else {
          setUnameStatus('taken');
        }
      } catch {
        if (checkSeq.current !== seq) return;
        setUnameStatus('error');
        setUnameMsgKey('errors.network');
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [username]);

  const checks = passwordChecks(password);

  /** تحقق مشترك — الخادم يعيد التحقق دائمًا عند الإرسال */
  const validateCommon = (): string[] => {
    const e: string[] = [];
    const nameErr = fullNameError(fullName);
    if (nameErr) e.push(t(nameErr));
    const userErr = usernameError(username);
    if (userErr) e.push(t(userErr));
    if (!EMAIL_RE.test(email.trim())) e.push(t('validation.emailInvalid'));
    if (!isPasswordValid(password)) e.push(t('validation.pwInvalid'));
    if (password !== confirmPassword) e.push(t('validation.pwMismatch'));
    return e;
  };

  const submitStudent = async () => {
    const e = validateCommon();
    if (unameStatus === 'checking') e.push(t('register.checkingWait'));
    if (unameStatus !== 'available') e.push(t('register.usernameRequired'));
    if (captchaEnabled && !captchaToken) e.push(t('captcha.required'));
    setErrs(e);
    if (e.length) return;
    setBusy(true);
    try {
      await api.auth.registerStudent({
        fullName: fullName.trim(),
        username: username.trim(),
        email: email.trim(),
        password,
        confirmPassword,
      }, captchaToken);
      await refresh();
      toast.push('success', t('register.successStudent'));
      nav('/dashboard');
    } catch (err) {
      recaptchaRef.current?.reset();
      setCaptchaToken(null);
      setErrs([err instanceof Error ? err.message : t('register.failed')]);
    } finally {
      setBusy(false);
    }
  };

  const submitTeacher = async () => {
    const e = validateCommon();
    if (!degree.trim()) e.push(t('validation.degreeRequired'));
    if (!specialties.trim()) e.push(t('validation.specialtiesRequired'));
    if (bio.trim().length < 20) e.push(t('validation.bioMin'));
    if (unameStatus === 'checking') e.push(t('register.checkingWait'));
    if (unameStatus !== 'available') e.push(t('register.usernameRequired'));
    if (captchaEnabled && !captchaToken) e.push(t('captcha.required'));
    setErrs(e);
    if (e.length) return;
    setBusy(true);
    try {
      const specs = specialties.split(/[,،\n]+/).map((s) => s.trim()).filter(Boolean);
      await api.auth.registerTeacher({
        fullName: fullName.trim(),
        username: username.trim(),
        email: email.trim(),
        password,
        confirmPassword,
        degree,
        specialties: specs,
        bio: bio.trim(),
        ...(docsUrl ? { docsUrl } : {}),
      }, captchaToken);
      await refresh();
      toast.push('success', t('register.successTeacher'));
      nav('/teacher/profile');
    } catch (err) {
      recaptchaRef.current?.reset();
      setCaptchaToken(null);
      setErrs([err instanceof Error ? err.message : t('register.failedTeacher')]);
    } finally {
      setBusy(false);
    }
  };

  const unameMessage = (() => {
    if (unameStatus === 'available') return { text: t('register.usernameAvailable'), tone: 'ok' };
    if (unameStatus === 'taken') return { text: t('register.usernameTaken'), tone: 'bad' };
    if (unameStatus === 'checking') return { text: t('register.usernameChecking'), tone: 'muted' };
    if (unameStatus === 'idle' && unameMsgKey) return { text: t(unameMsgKey), tone: 'muted' };
    if (unameStatus === 'invalid' || unameStatus === 'error') {
      return { text: unameMsgKey ? t(unameMsgKey) : t('validation.usernameChars'), tone: 'bad' };
    }
    return null;
  })();

  const unameInvalid = unameStatus === 'invalid' || unameStatus === 'taken' || unameStatus === 'error';

  const commonFields = (
    <>
      <Field label={t('common.fullName')} required hint={t('register.fullNameHint')}>
        <Input value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink-secondary">
              {t('common.username')}
              <span className="text-coral"> *</span>
            </span>
            <div className="relative">
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value.replace(/\s/g, ''))}
                autoComplete="username"
                placeholder=""
                aria-invalid={unameInvalid}
                aria-describedby="username-status"
                className={`pe-11 text-start ${unameInvalid ? 'border-danger/70' : unameStatus === 'available' ? 'border-ok/70' : ''}`}
              />
              {(unameStatus === 'available' || unameStatus === 'taken' || unameStatus === 'invalid' || unameStatus === 'checking' || unameStatus === 'error') && (
                <span
                  aria-hidden
                  className={`pointer-events-none absolute end-2.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full border text-xs font-bold ${
                    unameStatus === 'available'
                      ? 'border-ok/60 bg-ok/15 text-emerald-700 dark:text-emerald-300'
                      : unameStatus === 'checking'
                        ? 'border-line bg-elevated text-ink-muted'
                        : 'border-danger/60 bg-danger/15 text-coral'
                  }`}
                >
                  {unameStatus === 'available' ? (
                    <IconCheck className="size-3.5" />
                  ) : unameStatus === 'checking' ? (
                    <span className="size-3 animate-spin rounded-full border-2 border-ink-muted/30 border-t-ink-muted" />
                  ) : (
                    <IconClose className="size-3.5" />
                  )}
                </span>
              )}
            </div>
            <span className="mt-1 block text-xs text-ink-muted">{t('register.usernameHint')}</span>
            {unameMessage && (
              <span
                id="username-status"
                role="status"
                aria-live="polite"
                className={`mt-1 block text-xs ${
                  unameMessage.tone === 'ok'
                    ? 'font-medium text-emerald-700 dark:text-emerald-300'
                    : unameMessage.tone === 'bad'
                      ? 'font-medium text-coral'
                      : 'text-ink-muted'
                }`}
              >
                {unameMessage.text}
              </span>
            )}
          </label>
        </div>

        <Field label={t('common.email')} required>
          <Input dir="ltr" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('common.password')} required hint={t('register.passwordHint')}>
          <PasswordInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
        </Field>
        <Field label={t('common.confirmPassword')} required>
          <PasswordInput
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
          />
        </Field>
      </div>
      <ul className="grid gap-1 rounded-md border border-line bg-elevated/40 p-3 text-xs sm:grid-cols-2">
        {checks.map((c) => (
          <li key={c.key} className={`flex items-center gap-1.5 ${c.ok ? 'text-emerald-600 dark:text-emerald-300' : 'text-ink-muted'}`}>
            {c.ok ? (
              <IconCheck className="size-3.5 shrink-0 stroke-[2.5]" />
            ) : (
              <span className="size-1.5 shrink-0 rounded-full bg-ink-muted/50" />
            )}
            <span>{t(c.labelKey)}</span>
          </li>
        ))}
      </ul>
    </>
  );

  return (
    <div className="container-x max-w-xl py-12">
      <div className="mb-4 text-center">
        <Link
          to="/register"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-muted hover:text-gold-500 transition-colors"
        >
          <span>←</span>
          <span>{t('oauth.backToChoice') || 'العودة لاختيار طريقة أخرى'}</span>
        </Link>
      </div>
      <h1 className="mb-2 text-center text-3xl font-bold">
        {t('register.title')} <span className="gold-text">{t('register.titleHighlight')}</span>
      </h1>
      <p className="mb-8 text-center text-sm text-ink-muted">{t('register.subtitle')}</p>
      <Tabs
        tabs={[
          { key: 'student', label: t('register.tabStudent') },
          { key: 'teacher', label: t('register.tabTeacher') },
        ]}
        active={tab}
        onChange={setTab}
        fullWidth
        className="mx-auto mb-6 max-w-xs"
      />
      <Card className="p-8">
        {tab === 'student' ? (
          <Form onSubmit={submitStudent} className="space-y-4">
            {commonFields}
            <Recaptcha
              ref={recaptchaRef}
              onVerify={(tok) => {
                setCaptchaToken(tok);
                setErrs((prev) => prev.filter((msg) => msg !== t('captcha.required')));
              }}
              onExpired={() => setCaptchaToken(null)}
              onReady={setCaptchaEnabled}
            />
            <Errors errs={errs} />
            <Button type="submit" loading={busy} className="w-full">{t('register.submitStudent')}</Button>
          </Form>
        ) : (
          <Form onSubmit={submitTeacher} className="space-y-4">
            {commonFields}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('register.degree')} required hint={t('register.degreeHint')}>
                <Input value={degree} onChange={(e) => setDegree(e.target.value)} />
              </Field>
              <Field label={t('register.specialties')} required hint={t('register.specialtiesHint')}>
                <Input value={specialties} onChange={(e) => setSpecialties(e.target.value)} />
              </Field>
            </div>
            <Field label={t('register.bio')} required hint={t('register.bioHint')}>
              <Textarea value={bio} onChange={(e) => setBio(e.target.value)} placeholder={t('register.bioPlaceholder')} />
            </Field>
            <Field label={t('register.docs')} hint={t('register.docsHint')}>
              <Input dir="ltr" value={docsUrl} onChange={(e) => setDocsUrl(e.target.value)} placeholder="https://…" />
            </Field>
            <p className="rounded-md border border-line bg-elevated/50 p-3 text-xs leading-6 text-ink-muted">
              {t('register.teacherPendingNote')}
            </p>
            <Recaptcha
              ref={recaptchaRef}
              onVerify={(tok) => {
                setCaptchaToken(tok);
                setErrs((prev) => prev.filter((msg) => msg !== t('captcha.required')));
              }}
              onExpired={() => setCaptchaToken(null)}
              onReady={setCaptchaEnabled}
            />
            <Errors errs={errs} />
            <Button type="submit" loading={busy} className="w-full">{t('register.submitTeacher')}</Button>
          </Form>
        )}
        <p className="mt-5 text-center text-sm text-ink-muted">
          {t('register.haveAccount')}{' '}
          <Link to="/login" className="text-gold-300 hover:text-gold-200">{t('register.signIn')}</Link>
        </p>
      </Card>
    </div>
  );
}

function Errors({ errs }: { errs: string[] }) {
  if (!errs.length) return null;
  return (
    <ul className="space-y-1 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-coral">
      {errs.map((e, i) => <li key={i}>{e}</li>)}
    </ul>
  );
}
