import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { Button, Card, Field, Form, Input } from '../../components/ui';
import { EMAIL_RE } from '../../lib/accountRules';
import { useI18n } from '../../i18n';

export default function ForgotPassword() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!EMAIL_RE.test(email.trim())) {
      setErr(t('validation.emailInvalid'));
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      const { data } = await api.auth.forgotPassword(email.trim());
      setDone(data?.message ?? t('forgot.subtitle'));
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('forgot.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container-x grid min-h-[70vh] max-w-md place-items-center py-14">
      <Card className="w-full p-8">
        <h1 className="mb-1 text-2xl font-bold">{t('forgot.title')}</h1>
        <p className="mb-6 text-sm text-ink-muted">{t('forgot.subtitle')}</p>

        {done ? (
          <div className="space-y-4">
            <p className="rounded-md border border-ok/40 bg-ok/10 px-3 py-3 text-sm leading-6 text-ink-secondary">{done}</p>
            <p className="text-xs text-ink-muted">{t('forgot.spamNote')}</p>
            <Link to="/login">
              <Button variant="outline" className="w-full">{t('forgot.backToLogin')}</Button>
            </Link>
          </div>
        ) : (
          <Form onSubmit={submit} className="space-y-4">
            <Field label={t('common.email')} required error={err ?? undefined}>
              <Input dir="ltr" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Button type="submit" loading={busy} className="w-full">{t('forgot.send')}</Button>
            <p className="text-center text-sm text-ink-muted">
              {t('forgot.remembered')} <Link to="/login" className="text-gold-300 hover:text-gold-200">{t('register.signIn')}</Link>
            </p>
          </Form>
        )}
      </Card>
    </div>
  );
}
