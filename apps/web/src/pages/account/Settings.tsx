import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type AccountSession, type Major, type University } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../lib/toast';
import { UserAvatar } from '../../components/AccountMenu';
import { Badge, Button, Card, Field, Form, Input, Select, Skeleton } from '../../components/ui';
import { PageHeader } from '../../components/PageHeader';
import { formatDateTime, TEACHER_STATUS_LABEL } from '../../lib/format';
import {
  describeUserAgent,
  EMAIL_RE,
  fullNameError,
  isPasswordValid,
  passwordChecks,
  PHONE_RE,
  usernameError,
} from '../../lib/accountRules';
import { useI18n } from '../../i18n';
import { IconCheck, IconAlert, IconSecurity } from '../../components/icons';

/* ============================================================
   إعدادات الحساب
   - البيانات الأساسية (الاسم، الجوال، الجامعة، التخصص، المستوى)
   - اسم المستخدم، البريد، كلمة المرور، الصورة الشخصية
   - توثيق البريد الحالي بزر واحد (رابط إلى البريد المسجّل)
   - تغيير البريد الإلكتروني عملية منفصلة (رابط إلى العنوان الجديد)
   - سجل الأجهزة والجلسات
   كل التحقق يُعيد التحقق منه على الخادم.
   ============================================================ */

export default function AccountSettings() {
  const { user, refresh, setUser } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const { t } = useI18n();

  const [loading, setLoading] = useState(true);

  // البيانات الأساسية
  const [fullName, setFullName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [universityId, setUniversityId] = useState('');
  const [majorId, setMajorId] = useState('');
  const [level, setLevel] = useState('');
  const [unis, setUnis] = useState<University[]>([]);
  const [majors, setMajors] = useState<Major[]>([]);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileErr, setProfileErr] = useState<string | null>(null);

  // اسم المستخدم
  const [username, setUsername] = useState('');
  const [savingUsername, setSavingUsername] = useState(false);
  const [usernameErr, setUsernameErr] = useState<string | null>(null);

  // توثيق البريد الحالي
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifySent, setVerifySent] = useState(false);
  const [verifyErr, setVerifyErr] = useState<string | null>(null);

  // تغيير البريد
  const [showEmailChange, setShowEmailChange] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailErr, setEmailErr] = useState<string | null>(null);
  const [emailNotice, setEmailNotice] = useState<string | null>(null);

  // كلمة المرور
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordErr, setPasswordErr] = useState<string | null>(null);

  // الصورة الشخصية
  const fileRef = useRef<HTMLInputElement>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);

  // الجلسات
  const [sessions, setSessions] = useState<AccountSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sessionsBusy, setSessionsBusy] = useState(false);

  // التحقق بخطوتين TOTP / MFA
  const [mfaStep, setMfaStep] = useState<'idle' | 'setting_up' | 'disabling'>('idle');
  const [mfaSetupData, setMfaSetupData] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaDisablePw, setMfaDisablePw] = useState('');
  const [mfaBackupCodes, setMfaBackupCodes] = useState<string[] | null>(null);
  const [mfaBusy, setMfaBusy] = useState(false);
  const [mfaErr, setMfaErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([api.account.me(), api.account.sessions(), api.universities.list()])
      .then(([me, sess, u]) => {
        if (!alive) return;
        const meUser = me.data.user;
        setFullName(meUser.fullName ?? '');
        setWhatsapp(meUser.whatsapp ?? '');
        setUniversityId(meUser.universityId ?? '');
        setMajorId(meUser.majorId ?? '');
        setLevel(meUser.level ?? '');
        setUsername(meUser.username ?? '');
        setUnis(u.data ?? []);
        setSessions(sess.data ?? []);
        setCurrentSessionId((sess.meta as unknown as { currentSessionId?: string })?.currentSessionId ?? null);
      })
      .catch((e) => toast.push('error', e instanceof Error ? e.message : t('settings.loadFailed')))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!universityId) {
      setMajors([]);
      return;
    }
    api.majors
      .list(universityId)
      .then(({ data }) => setMajors(data ?? []))
      .catch(() => setMajors([]));
  }, [universityId]);

  if (!user || loading) {
    return (
      <div className="container-x space-y-4 py-10">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const saveProfile = async () => {
    const nameKey = fullNameError(fullName);
    if (nameKey) {
      setProfileErr(t(nameKey));
      return;
    }
    if (whatsapp.trim() && !PHONE_RE.test(whatsapp.trim())) {
      setProfileErr(t('validation.phoneInvalid'));
      return;
    }
    setProfileErr(null);
    setSavingProfile(true);
    try {
      await api.account.updateProfile({
        fullName: fullName.trim(),
        whatsapp: whatsapp.trim() || null,
        universityId: universityId || null,
        majorId: universityId ? majorId || null : null,
        level: level.trim() || null,
      });
      await refresh();
      toast.push('success', t('settings.profile.saved'));
    } catch (e) {
      setProfileErr(e instanceof Error ? e.message : t('settings.profile.failed'));
    } finally {
      setSavingProfile(false);
    }
  };

  const saveUsername = async () => {
    const errKey = usernameError(username);
    if (errKey) {
      setUsernameErr(t(errKey));
      return;
    }
    setUsernameErr(null);
    setSavingUsername(true);
    try {
      await api.account.updateUsername(username.trim());
      await refresh();
      toast.push('success', t('settings.username.updated'));
    } catch (e) {
      setUsernameErr(e instanceof Error ? e.message : t('settings.username.failed'));
    } finally {
      setSavingUsername(false);
    }
  };

  /** توثيق البريد الحالي — زر واحد يرسل رابطًا إلى البريد المسجّل نفسه */
  const requestEmailVerification = async () => {
    setVerifyErr(null);
    setVerifyBusy(true);
    try {
      await api.auth.requestEmailVerification();
      setVerifySent(true);
      await refresh();
      toast.push('success', t('settings.email.verifySent'));
    } catch (e) {
      setVerifyErr(e instanceof Error ? e.message : t('verify.sendFailed'));
    } finally {
      setVerifyBusy(false);
    }
  };

  const requestEmailChange = async () => {
    setEmailNotice(null);
    if (!EMAIL_RE.test(newEmail.trim())) {
      setEmailErr(t('validation.emailInvalid'));
      return;
    }
    if (!emailPassword) {
      setEmailErr(t('settings.email.passwordRequired'));
      return;
    }
    setEmailErr(null);
    setSavingEmail(true);
    try {
      const { data } = await api.account.requestEmailChange({ newEmail: newEmail.trim(), currentPassword: emailPassword });
      setEmailNotice(data.message);
      setNewEmail('');
      setEmailPassword('');
      await refresh();
    } catch (e) {
      setEmailErr(e instanceof Error ? e.message : t('settings.email.requestFailed'));
    } finally {
      setSavingEmail(false);
    }
  };

  const savePassword = async () => {
    if (!currentPassword) {
      setPasswordErr(t('settings.password.currentRequired'));
      return;
    }
    if (!isPasswordValid(newPassword)) {
      setPasswordErr(t('settings.password.invalid'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordErr(t('settings.password.mismatch'));
      return;
    }
    setPasswordErr(null);
    setSavingPassword(true);
    try {
      await api.account.changePassword({ currentPassword, newPassword, confirmPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      await refresh();
      toast.push('success', t('settings.password.changed'));
    } catch (e) {
      setPasswordErr(e instanceof Error ? e.message : t('settings.password.failed'));
    } finally {
      setSavingPassword(false);
    }
  };

  const uploadAvatar = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.push('error', t('settings.avatar.invalidType'));
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      toast.push('error', t('settings.avatar.tooLarge'));
      return;
    }
    setAvatarBusy(true);
    try {
      await api.account.uploadAvatar(file);
      await refresh();
      toast.push('success', t('settings.photo.uploaded'));
    } catch (e) {
      toast.push('error', e instanceof Error ? e.message : t('settings.avatar.failed'));
    } finally {
      setAvatarBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const removeAvatar = async () => {
    setAvatarBusy(true);
    try {
      await api.account.removeAvatar();
      await refresh();
      toast.push('success', t('settings.avatar.removed'));
    } catch (e) {
      toast.push('error', e instanceof Error ? e.message : t('settings.avatar.removeFailed'));
    } finally {
      setAvatarBusy(false);
    }
  };

  const reloadSessions = async () => {
    const res = await api.account.sessions();
    setSessions(res.data ?? []);
    setCurrentSessionId((res.meta as unknown as { currentSessionId?: string })?.currentSessionId ?? null);
  };

  const revokeSession = async (id: string) => {
    setSessionsBusy(true);
    try {
      await api.account.revokeSession(id);
      await reloadSessions();
      toast.push('success', t('settings.sessions.revoked'));
    } catch (e) {
      toast.push('error', e instanceof Error ? e.message : t('settings.sessions.endFailed'));
    } finally {
      setSessionsBusy(false);
    }
  };

  const logoutAll = async () => {
    if (!window.confirm(t('settings.sessions.confirmLogoutAll'))) return;
    setSessionsBusy(true);
    try {
      await api.account.logoutAll();
      setUser(null);
      toast.push('success', t('settings.sessions.loggedOutAll'));
      nav('/login');
    } catch (e) {
      toast.push('error', e instanceof Error ? e.message : t('settings.sessions.opFailed'));
    } finally {
      setSessionsBusy(false);
    }
  };

  const startMfaSetup = async () => {
    setMfaBusy(true);
    setMfaErr(null);
    try {
      const res = await api.auth.mfa.setup();
      setMfaSetupData(res.data);
      setMfaStep('setting_up');
      setMfaCode('');
    } catch (e) {
      setMfaErr(e instanceof Error ? e.message : 'تعذر بدء إعداد المصادقة الثنائية.');
    } finally {
      setMfaBusy(false);
    }
  };

  const confirmMfaEnable = async () => {
    if (!mfaSetupData || !mfaCode.trim()) {
      setMfaErr('يرجى إدخال رمز التحقق المكون من 6 أرقام.');
      return;
    }
    setMfaBusy(true);
    setMfaErr(null);
    try {
      const res = await api.auth.mfa.enable({ secret: mfaSetupData.secret, code: mfaCode.trim() });
      setMfaBackupCodes(res.data.backupCodes);
      setMfaStep('idle');
      await refresh();
      toast.push('success', res.data.message);
    } catch (e) {
      setMfaErr(e instanceof Error ? e.message : 'رمز التحقق غير صحيح.');
    } finally {
      setMfaBusy(false);
    }
  };

  const confirmMfaDisable = async () => {
    if (!mfaDisablePw) {
      setMfaErr('يرجى إدخال كلمة المرور الحالية.');
      return;
    }
    setMfaBusy(true);
    setMfaErr(null);
    try {
      const res = await api.auth.mfa.disable({ password: mfaDisablePw, code: mfaCode.trim() || undefined });
      setMfaStep('idle');
      setMfaDisablePw('');
      setMfaCode('');
      setMfaBackupCodes(null);
      await refresh();
      toast.push('success', res.data.message);
    } catch (e) {
      setMfaErr(e instanceof Error ? e.message : 'تعذر إلغاء تفعيل المصادقة الثنائية.');
    } finally {
      setMfaBusy(false);
    }
  };

  const checks = passwordChecks(newPassword);

  return (
    <div className="container-x max-w-4xl space-y-6 py-10">
      <PageHeader title={t('settings.title')} subtitle={t('settings.subtitle')} back />

      {/* الصورة الشخصية */}
      <Card className="p-6">
        <h2 className="mb-4 font-bold text-gold-200">{t('settings.photo.title')}</h2>
        <div className="flex flex-wrap items-center gap-4">
          <UserAvatar size={72} />
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadAvatar(f);
              }}
            />
            <Button variant="outline" loading={avatarBusy} onClick={() => fileRef.current?.click()}>
              {t('settings.photo.upload')}
            </Button>
            {user.avatarUrl && (
              <Button variant="subtle" loading={avatarBusy} onClick={removeAvatar}>
                {t('settings.photo.remove')}
              </Button>
            )}
          </div>
        </div>
        <p className="mt-3 text-xs text-ink-muted">{t('settings.photo.hint')}</p>
      </Card>

      {/* البيانات الأساسية */}
      <Card className="p-6">
        <h2 className="mb-1 font-bold text-gold-200">{t('settings.profile.title')}</h2>
        <p className="mb-5 text-xs text-ink-muted">
          {user?.role === 'TEACHER'
            ? 'الاسم ورقم التواصل والبريد الإلكتروني — بياناتك الأساسية.'
            : t('settings.profile.subtitle')}
        </p>
        <Form onSubmit={saveProfile} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('common.fullName')} required error={profileErr ?? undefined}>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </Field>
            <Field label={t('common.phone')} hint={t('settings.profile.phoneHint')}>
              <Input dir="ltr" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="مثال: +966... أو 05... أو أي رقم دولي" />
            </Field>
          </div>
          {user?.role === 'TEACHER' && (
            <Field label={t('common.email')} hint="لتغيير البريد الإلكتروني، استخدم قسم «البريد الإلكتروني» بالأسفل">
              <Input dir="ltr" value={user?.email ?? ''} readOnly className="opacity-80 bg-surface-2 cursor-not-allowed" />
            </Field>
          )}
          {user?.role !== 'TEACHER' && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('common.university')}>
                  <Select
                    value={universityId}
                    onChange={(e) => {
                      setUniversityId(e.target.value);
                      setMajorId('');
                    }}
                  >
                    <option value="">—</option>
                    {unis.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </Select>
                </Field>
                <Field label={t('common.major')}>
                  <Select value={majorId} onChange={(e) => setMajorId(e.target.value)} disabled={!universityId || majors.length === 0}>
                    <option value="">—</option>
                    {majors.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Field label={t('common.level')} hint={t('settings.profile.levelHint')}>
                <Input value={level} onChange={(e) => setLevel(e.target.value)} placeholder={t('settings.profile.levelPlaceholder')} />
              </Field>
            </>
          )}
          <Button type="submit" loading={savingProfile}>{t('settings.profile.save')}</Button>
        </Form>
      </Card>

      {/* اسم المستخدم */}
      <Card className="p-6">
        <h2 className="mb-1 font-bold text-gold-200">{t('settings.username.title')}</h2>
        <p className="mb-5 text-xs text-ink-muted">{t('settings.username.subtitle')}</p>
        <Form onSubmit={saveUsername} className="space-y-4">
          <Field
            label={t('common.username')}
            required
            error={usernameErr ?? undefined}
            hint={t('settings.username.current', { username: user.username })}
          >
            <Input dir="ltr" value={username} onChange={(e) => setUsername(e.target.value)} />
          </Field>
          <Button type="submit" loading={savingUsername}>{t('settings.username.update')}</Button>
        </Form>
      </Card>

      {/* البريد الإلكتروني — التوثيق بزر واحد + تغيير منفصل */}
      <Card className="p-6">
        <h2 className="mb-1 font-bold text-gold-200">{t('settings.email.title')}</h2>
        <p className="mb-4 flex flex-wrap items-center gap-2 text-sm text-ink-secondary">
          {t('settings.email.current')} <span className="font-mono font-medium" dir="ltr">{user.email}</span>
          {user.emailVerified ? (
            <Badge tone="ok" className="inline-flex items-center gap-1">
              <IconCheck className="size-3" />
              <span>{t('settings.email.verifiedBadge')}</span>
            </Badge>
          ) : (
            <Badge tone="warn">{t('settings.email.unverifiedBadge')}</Badge>
          )}
        </p>

        {user.emailVerified ? (
          <p className="flex items-center gap-1.5 rounded-md border border-ok/40 bg-ok/10 px-3 py-2 text-xs text-ink-secondary">
            <IconCheck className="size-4 shrink-0 text-emerald-400" />
            <span>
              {t('verify.verified')}
              {user.emailVerifiedAt ? ` · ${formatDateTime(user.emailVerifiedAt)}` : ''}
            </span>
          </p>
        ) : (
          <div className="space-y-3 rounded-md border border-line bg-elevated/30 p-4">
            <div>
              <h3 className="text-sm font-semibold text-ink-primary">{t('settings.email.verifyTitle')}</h3>
              <p className="mt-1 text-xs leading-6 text-ink-muted">{t('settings.email.verifyHint', { email: user.email })}</p>
            </div>
            <Button loading={verifyBusy} onClick={requestEmailVerification}>
              {verifyBusy ? t('verify.sending') : verifySent ? t('settings.email.resend') : t('settings.email.verifyButton')}
            </Button>
            {verifySent && (
              <p role="status" className="rounded-md border border-ok/40 bg-ok/10 px-3 py-2 text-xs text-ink-secondary">
                <span className="flex items-center gap-1.5">
                  <IconCheck className="size-4 shrink-0 text-emerald-400" />
                  <span>{t('settings.email.verifySent')}</span>
                </span>
                <span className="mt-1 block text-ink-muted">{t('settings.email.verifyPending')}</span>
              </p>
            )}
            {verifyErr && (
              <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-coral">{verifyErr}</p>
            )}
          </div>
        )}

        {user.pendingEmail && (
          <p className="mt-4 rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-ink-secondary">
            {t('settings.email.pendingChange', { email: user.pendingEmail })}
          </p>
        )}
        {emailNotice && (
          <p className="mt-4 rounded-md border border-ok/40 bg-ok/10 px-3 py-2 text-xs text-ink-secondary">{emailNotice}</p>
        )}

        <div className="mt-6 border-t border-line pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-ink-primary">{t('settings.email.changeTitle')}</h3>
              <p className="mt-0.5 text-xs text-ink-muted">{t('settings.email.changeDesc')}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setShowEmailChange((prev) => !prev);
                setEmailErr(null);
              }}
            >
              {showEmailChange ? t('common.cancel') : t('settings.email.changeButton')}
            </Button>
          </div>

          {showEmailChange && (
            <div className="mt-4 rounded-lg border border-line bg-elevated/20 p-4">
              <p className="mb-4 text-xs leading-6 text-ink-muted">{t('settings.email.changeHint')}</p>
              <Form onSubmit={requestEmailChange} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={t('settings.email.newLabel')} required error={emailErr ?? undefined}>
                    <Input dir="ltr" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="new@example.com" />
                  </Field>
                  <Field label={t('common.currentPassword')} required hint={t('settings.email.passwordHint')}>
                    <Input dir="ltr" type="password" autoComplete="current-password" value={emailPassword} onChange={(e) => setEmailPassword(e.target.value)} />
                  </Field>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="submit" variant="outline" loading={savingEmail}>{t('settings.email.sendLink')}</Button>
                  <Button type="button" variant="ghost" onClick={() => setShowEmailChange(false)}>{t('common.cancel')}</Button>
                </div>
              </Form>
            </div>
          )}
        </div>
      </Card>

      {/* كلمة المرور */}
      <Card className="p-6">
        <h2 className="mb-1 font-bold text-gold-200">{t('settings.password.title')}</h2>
        <p className="mb-5 text-xs text-ink-muted">{t('settings.password.subtitle')}</p>
        <Form onSubmit={savePassword} className="space-y-4">
          <Field label={t('common.currentPassword')} required>
            <Input dir="ltr" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('common.newPassword')} required>
              <Input dir="ltr" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </Field>
            <Field label={t('common.confirmPassword')} required error={passwordErr ?? undefined}>
              <Input dir="ltr" type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
            </Field>
          </div>
          <ul className="grid gap-1 text-xs sm:grid-cols-2">
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
          <Button type="submit" loading={savingPassword}>{t('settings.password.change')}</Button>
        </Form>
      </Card>

      {/* التحقق بخطوتين (MFA / TOTP) */}
      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-gold-200">التحقق بخطوتين (Two-Factor Authentication / TOTP)</h2>
              <Badge tone={user.totpEnabled ? 'ok' : 'muted'} className="inline-flex items-center gap-1">
                {user.totpEnabled ? (
                  <>
                    <IconSecurity className="size-3" />
                    <span>مفعّلة ومحمية</span>
                  </>
                ) : (
                  'غير مفعّلة'
                )}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-ink-muted">
              حماية إضافية لحسابك باستخدام تطبيق مثل Google Authenticator أو 1Password لتوليد رمز أمان عند كل تسجيل دخول.
            </p>
          </div>
          {user.totpEnabled && mfaStep === 'idle' && (
            <Button variant="danger" size="sm" onClick={() => { setMfaStep('disabling'); setMfaErr(null); }}>
              تعطيل المصادقة الثنائية
            </Button>
          )}
          {!user.totpEnabled && mfaStep === 'idle' && (
            <Button size="sm" loading={mfaBusy} onClick={startMfaSetup}>
              تفعيل التحقق بخطوتين
            </Button>
          )}
        </div>

        {/* عرض رموز الاسترجاع الاحتياطية بعد التفعيل الناجح */}
        {mfaBackupCodes && (
          <div className="mt-4 rounded-xl border border-warning/40 bg-warning/10 p-4">
            <h3 className="flex items-center gap-2 font-bold text-gold-200">
              <IconAlert className="size-4 text-gold-300" />
              <span>رموز الاسترجاع الاحتياطية (Single-Use Backup Codes)</span>
            </h3>
            <p className="mt-1 text-xs text-ink-secondary">
              احفظ هذه الرموز في مكان آمن فورًا! يمكن استخدام كل رمز لمرة واحدة فقط لتسجيل الدخول في حال فقدت الوصول لتطبيق المصادقة.
            </p>
            <div className="my-3 grid grid-cols-2 gap-2 font-mono text-sm sm:grid-cols-4">
              {mfaBackupCodes.map((c, i) => (
                <div key={i} className="rounded bg-surface/80 p-2 text-center font-bold tracking-wider text-ink-primary border border-line">
                  {c}
                </div>
              ))}
            </div>
            <Button
              size="sm"
              variant="subtle"
              onClick={() => {
                void navigator.clipboard.writeText(mfaBackupCodes.join('\n'));
                toast.push('info', 'تم نسخ الرموز إلى الحافظة.');
              }}
            >
              نسخ جميع الرموز
            </Button>
          </div>
        )}

        {/* نموذج إعداد المصادقة الثنائية */}
        {mfaStep === 'setting_up' && mfaSetupData && (
          <div className="mt-5 space-y-4 rounded-xl border border-line bg-surface/40 p-4">
            <h3 className="font-bold text-ink-primary">خطوات إعداد تطبيق المصادقة</h3>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-3">
                <p className="text-xs text-ink-secondary">
                  1. افتح تطبيق التحقق (Google Authenticator أو 1Password) وامسح الرمز المربع، أو أدخل المفتاح السري يدويًا.
                </p>
                <div className="flex flex-col items-center justify-center rounded-lg bg-white p-3 shadow-inner">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(mfaSetupData.otpauthUri)}`}
                    alt="QR Code"
                    className="size-40"
                  />
                </div>
                <div className="rounded bg-elevated p-2 text-center text-xs">
                  <span className="text-ink-muted">المفتاح السري اليدوي: </span>
                  <code className="font-mono font-bold text-gold-200">{mfaSetupData.secret}</code>
                </div>
              </div>

              <div className="space-y-4">
                <p className="text-xs text-ink-secondary">
                  2. أدخل الرمز المكون من 6 أرقام الظاهر في التطبيق لتأكيد وتفعيل الحماية:
                </p>
                <Field label="رمز التحقق (6 أرقام)" required error={mfaErr ?? undefined}>
                  <Input
                    dir="ltr"
                    placeholder="123456"
                    maxLength={6}
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value)}
                  />
                </Field>
                <div className="flex gap-2">
                  <Button loading={mfaBusy} onClick={confirmMfaEnable}>
                    تأكيد وتفعيل الحماية
                  </Button>
                  <Button variant="subtle" onClick={() => { setMfaStep('idle'); setMfaErr(null); }}>
                    إلغاء
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* نموذج تعطيل المصادقة الثنائية */}
        {mfaStep === 'disabling' && (
          <div className="mt-5 space-y-4 rounded-xl border border-danger/40 bg-danger/5 p-4">
            <h3 className="font-bold text-coral">تأكيد تعطيل التحقق بخطوتين</h3>
            <p className="text-xs text-ink-muted">
              لتأكيد التعطيل، يرجى إدخال كلمة المرور الحالية لحسابك ورمز التحقق اختياريًا.
            </p>
            {mfaErr && <p className="text-xs text-coral">{mfaErr}</p>}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="كلمة المرور الحالية" required>
                <Input
                  dir="ltr"
                  type="password"
                  value={mfaDisablePw}
                  onChange={(e) => setMfaDisablePw(e.target.value)}
                />
              </Field>
              <Field label="رمز التحقق أو رمز الاسترجاع (اختياري)">
                <Input
                  dir="ltr"
                  placeholder="123456"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                />
              </Field>
            </div>
            <div className="flex gap-2">
              <Button variant="danger" loading={mfaBusy} onClick={confirmMfaDisable}>
                تأكيد التعطيل
              </Button>
              <Button variant="subtle" onClick={() => { setMfaStep('idle'); setMfaErr(null); }}>
                إلغاء
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* الأجهزة والجلسات */}
      <Card className="p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-gold-200">{t('settings.sessions.title')}</h2>
            <p className="mt-1 text-xs text-ink-muted">{t('settings.sessions.note')}</p>
          </div>
          <Button variant="danger" size="sm" loading={sessionsBusy} onClick={logoutAll}>
            {t('settings.sessions.logoutAll')}
          </Button>
        </div>
        {sessions.length === 0 ? (
          <p className="text-sm text-ink-muted">{t('settings.sessions.empty')}</p>
        ) : (
          <ul className="divide-y divide-line/60">
            {sessions.map((s) => {
              const info = describeUserAgent(s.userAgent);
              const active = !s.endedAt;
              const isCurrent = s.id === currentSessionId;
              return (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink-primary">
                      {t(info.browserKey)} · {t(info.osKey)} · {t(info.deviceKey)}
                      {isCurrent && <Badge tone="ok" className="ms-2">{t('settings.sessions.thisSession')}</Badge>}
                      {!active && <Badge tone="muted" className="ms-2">{t('settings.sessions.ended')}</Badge>}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {t('settings.sessions.started', { date: formatDateTime(s.createdAt) })} · {t('settings.sessions.lastActiveLabel', { date: formatDateTime(s.lastSeenAt) })}
                      {s.endedAt ? ` · ${formatDateTime(s.endedAt)}` : ''}
                    </p>
                  </div>
                  {active && !isCurrent && (
                    <Button variant="subtle" size="sm" loading={sessionsBusy} onClick={() => revokeSession(s.id)}>
                      {t('settings.sessions.revoke')}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {user.role === 'TEACHER' && (
        <Card className="p-6">
          <h2 className="mb-2 font-bold text-gold-200">{t('settings.teacherApproval.title')}</h2>
          <p className="text-sm text-ink-secondary">
            {TEACHER_STATUS_LABEL[user.teacherProfile?.status ?? 'PENDING'] ? t(TEACHER_STATUS_LABEL[user.teacherProfile?.status ?? 'PENDING']) : '—'}
            {user.teacherProfile?.status !== 'APPROVED' && ` — ${t('settings.teacherApproval.hidden')}`}
          </p>
        </Card>
      )}
    </div>
  );
}
