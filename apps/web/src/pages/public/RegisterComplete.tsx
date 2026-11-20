import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../lib/toast';
import { useI18n } from '../../i18n';
import { Button, Card, Form, Field, Input, PasswordInput, Textarea, Tabs } from '../../components/ui';
import { IconCheck, IconClose } from '../../components/icons';
import {
  fullNameError,
  isPasswordValid,
  passwordChecks,
  usernameError,
} from '../../lib/accountRules';

type UsernameStatus = 'idle' | 'invalid' | 'checking' | 'available' | 'taken' | 'error';

interface OAuthState {
  registrationTicket: string;
  email: string;
  fullName?: string;
  avatarUrl?: string | null;
}

export default function RegisterComplete() {
  const nav = useNavigate();
  const loc = useLocation();
  const toast = useToast();
  const { refresh } = useAuth();
  const { t } = useI18n();

  // استرجاع بيانات تذكرة OAuth من الـ state أو sessionStorage
  const [oauthData, setOauthData] = useState<OAuthState | null>(() => {
    const fromState = loc.state as OAuthState | null;
    if (fromState?.registrationTicket && fromState?.email) {
      return fromState;
    }
    try {
      const stored = sessionStorage.getItem('siraj_oauth_registration');
      if (stored) {
        const parsed = JSON.parse(stored) as OAuthState;
        if (parsed?.registrationTicket && parsed?.email) return parsed;
      }
    } catch {
      /* تجاهل */
    }
    return null;
  });

  const [role, setRole] = useState<'student' | 'teacher'>('student');
  const [fullName, setFullName] = useState(oauthData?.fullName || '');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  /* حقول إضافية للمدرس */
  const [degree, setDegree] = useState('');
  const [specialties, setSpecialties] = useState('');
  const [bio, setBio] = useState('');
  const [docsUrl, setDocsUrl] = useState('');

  /* حالة فحص اسم المستخدم */
  const [unameStatus, setUnameStatus] = useState<UsernameStatus>('idle');
  const [unameMsgKey, setUnameMsgKey] = useState<string | null>(null);
  const checkSeq = useRef(0);

  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState<string[]>([]);

  // إذا لم تكن هناك تذكرة صالحة، توجيه المستخدم لصفحة اختيار التسجيل
  useEffect(() => {
    if (!oauthData?.registrationTicket || !oauthData?.email) {
      toast.push('info', t('oauth.ticketExpired') || 'يرجى تسجيل الدخول أو اختيار طريقة التسجيل أولاً.');
      nav('/register', { replace: true });
    }
  }, [oauthData, nav, toast, t]);

  // فحص توفر اسم المستخدم مع Debounce
  useEffect(() => {
    const value = username.trim();
    if (!value) {
      setUnameStatus('idle');
      setUnameMsgKey(null);
      return;
    }

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

  const validate = (): string[] => {
    const e: string[] = [];
    const nameErr = fullNameError(fullName);
    if (nameErr) e.push(t(nameErr));
    const userErr = usernameError(username);
    if (userErr) e.push(t(userErr));
    if (!isPasswordValid(password)) e.push(t('validation.pwInvalid'));
    if (password !== confirmPassword) e.push(t('validation.pwMismatch'));

    if (unameStatus === 'checking') e.push(t('register.checkingWait'));
    if (unameStatus !== 'available') e.push(t('register.usernameRequired'));

    if (role === 'teacher') {
      if (!degree.trim()) e.push(t('validation.degreeRequired'));
      if (!specialties.trim()) e.push(t('validation.specialtiesRequired'));
      if (bio.trim().length < 20) e.push(t('validation.bioMin'));
    }

    return e;
  };

  const handleSubmit = async () => {
    if (!oauthData?.registrationTicket) return;
    const errors = validate();
    setErrs(errors);
    if (errors.length) return;

    setBusy(true);
    try {
      const specs = specialties.split(/[,،\n]+/).map((s) => s.trim()).filter(Boolean);

      const res = await api.auth.completeOAuth({
        registrationTicket: oauthData.registrationTicket,
        fullName: fullName.trim(),
        username: username.trim(),
        password,
        confirmPassword,
        role: role === 'teacher' ? 'TEACHER' : 'STUDENT',
        degree: role === 'teacher' ? degree.trim() : undefined,
        bio: role === 'teacher' ? bio.trim() : undefined,
        specialties: role === 'teacher' ? specs : undefined,
        docsUrl: role === 'teacher' && docsUrl.trim() ? docsUrl.trim() : undefined,
      });

      // مسح التخزين المؤقت بعد النجاح
      try {
        sessionStorage.removeItem('siraj_oauth_registration');
      } catch {
        /* تجاهل */
      }

      if (role === 'teacher') {
        toast.push('success', t('register.successTeacher'));
        nav('/login', { replace: true });
      } else {
        await refresh();
        toast.push('success', t('register.successStudent') || 'تم استكمال التسجيل بنجاح!');
        nav('/dashboard', { replace: true });
      }
    } catch (err) {
      setErrs([err instanceof Error ? err.message : t('register.failed')]);
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

  if (!oauthData) return null;

  return (
    <div className="container-x max-w-xl py-12">
      <div className="mb-6 text-center animate-fadeUp">
        <h1 className="text-2xl font-bold sm:text-3xl text-ink-primary">
          {t('oauth.completeTitle')}{' '}
          <span className="gold-text">{t('register.titleHighlight')}</span>
        </h1>
        <p className="mt-2 text-sm text-ink-muted leading-relaxed">
          {t('oauth.completeDesc')}
        </p>
      </div>

      <Card className="p-6 sm:p-8 shadow-card">
        {/* صندوق البريد الموثق — محمي وقراءة فقط وغير قابل للتعديل */}
        <div className="mb-6 rounded-xl border border-line bg-surface-2/60 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-ink-secondary">
              {t('common.email')}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <IconCheck className="size-3.5 stroke-[2.5]" />
              {t('oauth.verified')}
            </span>
          </div>

          <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-ink-primary dir-ltr">
            <svg
              className="size-4 shrink-0 text-ink-muted"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span className="truncate">{oauthData.email}</span>
          </div>

          <p className="mt-2 text-[11px] text-ink-muted leading-relaxed">
            {t('oauth.verifiedBadgeHint')}
          </p>
        </div>

        {/* اختيار نوع الحساب */}
        <div className="mb-6">
          <label className="mb-2 block text-xs font-semibold text-ink-secondary">
            {t('oauth.accountType')}
          </label>
          <Tabs
            tabs={[
              { key: 'student', label: t('register.tabStudent') },
              { key: 'teacher', label: t('register.tabTeacher') },
            ]}
            active={role}
            onChange={(k) => setRole(k as 'student' | 'teacher')}
            fullWidth
            className="w-full"
          />
        </div>

        <Form onSubmit={handleSubmit} className="space-y-4">
          {/* الاسم الكامل */}
          <Field label={t('common.fullName')} required hint={t('register.fullNameHint')}>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoComplete="name"
              placeholder="مثال: أحمد عبد الله"
            />
          </Field>

          {/* اسم المستخدم مع الفحص المباشر */}
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
                  className={`pe-11 text-start ${
                    unameInvalid
                      ? 'border-danger/70'
                      : unameStatus === 'available'
                        ? 'border-ok/70'
                        : ''
                  }`}
                />
                {(unameStatus === 'available' ||
                  unameStatus === 'taken' ||
                  unameStatus === 'invalid' ||
                  unameStatus === 'checking' ||
                  unameStatus === 'error') && (
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
              <span className="mt-1 block text-xs text-ink-muted">
                {t('register.usernameHint')}
              </span>
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

          {/* كلمة المرور وتأكيدها */}
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
              <li
                key={c.key}
                className={`flex items-center gap-1.5 ${
                  c.ok ? 'text-emerald-600 dark:text-emerald-300' : 'text-ink-muted'
                }`}
              >
                {c.ok ? (
                  <IconCheck className="size-3.5 shrink-0 stroke-[2.5]" />
                ) : (
                  <span className="size-1.5 shrink-0 rounded-full bg-ink-muted/50" />
                )}
                <span>{t(c.labelKey)}</span>
              </li>
            ))}
          </ul>

          {/* حقول المعلم إذا تم اختياره */}
          {role === 'teacher' && (
            <div className="space-y-4 pt-2 border-t border-line">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('register.degree')} required hint={t('register.degreeHint')}>
                  <Input value={degree} onChange={(e) => setDegree(e.target.value)} />
                </Field>
                <Field
                  label={t('register.specialties')}
                  required
                  hint={t('register.specialtiesHint')}
                >
                  <Input
                    value={specialties}
                    onChange={(e) => setSpecialties(e.target.value)}
                  />
                </Field>
              </div>
              <Field label={t('register.bio')} required hint={t('register.bioHint')}>
                <Textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder={t('register.bioPlaceholder')}
                />
              </Field>
              <Field label={t('register.docs')} hint={t('register.docsHint')}>
                <Input
                  dir="ltr"
                  value={docsUrl}
                  onChange={(e) => setDocsUrl(e.target.value)}
                  placeholder="https://…"
                />
              </Field>
              <p className="rounded-md border border-line bg-elevated/50 p-3 text-xs leading-6 text-ink-muted">
                {t('register.teacherPendingNote')}
              </p>
            </div>
          )}

          {errs.length > 0 && (
            <ul className="space-y-1 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-coral">
              {errs.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}

          <Button type="submit" loading={busy} className="w-full">
            {role === 'teacher'
              ? t('register.submitTeacher')
              : t('oauth.completeSubmit') || 'إتمام إنشاء الحساب والدخول'}
          </Button>

          <div className="text-center pt-2">
            <Link
              to="/register"
              className="text-xs text-ink-muted hover:text-gold-500 transition-colors"
            >
              ← {t('oauth.backToChoice') || 'العودة لاختيار طريقة أخرى'}
            </Link>
          </div>
        </Form>
      </Card>
    </div>
  );
}
