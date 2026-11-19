import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { Button, Card, Spinner } from '../../components/ui';
import { useI18n } from '../../i18n';

export default function ConfirmEmailChange() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!token) {
      setState('error');
      setMessage(t('confirmChange.missing'));
      return;
    }
    api.auth
      .confirmEmailChange(token)
      .then(({ data }) => {
        setState('ok');
        setMessage(data?.message ?? t('confirmChange.success'));
      })
      .catch((e) => {
        setState('error');
        setMessage(e instanceof Error ? e.message : t('confirmChange.error'));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="container-x grid min-h-[70vh] max-w-md place-items-center py-14">
      <Card className="w-full p-8 text-center">
        <h1 className="mb-4 text-2xl font-bold">{t('confirmChange.title')}</h1>
        {state === 'loading' && (
          <div className="flex flex-col items-center gap-3 py-6 text-sm text-ink-muted">
            <Spinner className="size-6" />
            {t('common.loading')}
          </div>
        )}
        {state !== 'loading' && (
          <>
            <p
              className={`rounded-md border px-3 py-3 text-sm leading-6 ${
                state === 'ok' ? 'border-ok/40 bg-ok/10 text-ink-secondary' : 'border-danger/40 bg-danger/10 text-ink-secondary'
              }`}
            >
              {message}
            </p>
            <div className="mt-5 space-y-2">
              {state === 'ok' ? (
                <Link to="/login"><Button className="w-full">{t('confirmChange.loginNew')}</Button></Link>
              ) : (
                <Link to="/account/settings"><Button variant="outline" className="w-full">{t('confirmChange.backSettings')}</Button></Link>
              )}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
