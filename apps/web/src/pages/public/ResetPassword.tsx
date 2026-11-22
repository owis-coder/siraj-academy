import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { Button, Card, Field, Form, Input, PasswordInput } from '../../components/ui';
import { isPasswordValid, passwordChecks } from '../../lib/accountRules';
import { useI18n } from '../../i18n';
import { IconCheck } from '../../components/icons';

export default function ResetPassword() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const checks = passwordChecks(password);

  const submit = async () => {
    if (!isPasswordValid(password)) {
      setErr(t('validation.pwInvalid'));
      return;
    }
    if (password !== confirmPassword) {
      setErr(t('validation.pwMismatch'));
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      await api.auth.resetPassword({ token, password, confirmPassword });
      setDone(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('reset.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container-x grid min-h-[70vh] max-w-md place-items-center py-14">
      <Card className="w-full min-w-0 p-5 sm:p-8">
        <h1 className="mb-1 text-2xl font-bold">{t('reset.title')}</h1>

        {!token ? (
          <>
            <p className="mb-6 mt-2 text-sm text-ink-muted">{t('reset.missing')}</p>
            <Link to="/forgot-password"><Button className="w-full">{t('reset.requestNew')}</Button></Link>
          </>
        ) : done ? (
          <div className="mt-2 space-y-4">
            <p className="rounded-md border border-ok/40 bg-ok/10 px-3 py-3 text-sm leading-6 text-ink-secondary">
              {t('reset.success')}
            </p>
            <Link to="/login"><Button className="w-full">{t('common.login')}</Button></Link>
          </div>
        ) : (
          <>
            <p className="mb-6 mt-2 text-sm text-ink-muted">{t('reset.hint')}</p>
            <Form onSubmit={submit} className="space-y-4">
              <Field label={t('common.newPassword')} required>
                <PasswordInput autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
              <Field label={t('common.confirmPassword')} required error={err ?? undefined}>
                <PasswordInput autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
              </Field>
              <ul className="grid gap-1 text-xs">
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
              <Button type="submit" loading={busy} className="w-full">{t('reset.submit')}</Button>
              <p className="text-center text-xs text-ink-muted">
                {t('reset.expiredNote')}{' '}
                <Link to="/forgot-password" className="text-gold-300">{t('reset.requestNew')}</Link>
              </p>
            </Form>
          </>
        )}
      </Card>
    </div>
  );
}
