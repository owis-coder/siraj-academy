import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { Button, Card, Spinner } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { useI18n } from '../../i18n';
import { IconCheck, IconClose } from '../../components/icons';

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const { refresh, user } = useAuth();
  const { t } = useI18n();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!token) {
      setState('error');
      setMsg(t('verify.missingToken'));
      return;
    }
    api.auth
      .verifyEmail(token)
      .then(async () => {
        setState('ok');
        // تحديث حالة الحساب في الواجهة فورًا (البريد موثّق ✓)
        await refresh();
      })
      .catch((e) => {
        setState('error');
        setMsg(e instanceof Error ? e.message : t('verify.verifyFailed'));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="container-x grid min-h-[60vh] max-w-lg place-items-center py-14">
      <Card className="w-full p-10 text-center">
        {state === 'loading' && (
          <>
            <Spinner className="size-8" />
            <p className="mt-4 text-sm text-ink-secondary">{t('verify.verifyPageTitle')}</p>
          </>
        )}
        {state === 'ok' && (
          <>
            <span className="mb-3 inline-grid size-14 place-items-center rounded-full border border-ok/40 bg-ok/10 text-emerald-300" aria-hidden>
              <IconCheck className="size-7" />
            </span>
            <h1 className="text-xl font-bold">{t('verify.verified')}</h1>
            <p className="mt-2 text-sm text-ink-muted">{t('verify.verifySuccess')}</p>
            <div className="mt-6 flex justify-center gap-3">
              <Link to={user ? '/account/settings' : '/login'}>
                <Button>{user ? t('verify.goSettings') : t('common.login')}</Button>
              </Link>
              <Link to="/"><Button variant="subtle">{t('common.home')}</Button></Link>
            </div>
          </>
        )}
        {state === 'error' && (
          <>
            <span className="mb-3 inline-grid size-14 place-items-center rounded-full border border-danger/40 bg-danger/10 text-coral" aria-hidden>
              <IconClose className="size-7" />
            </span>
            <h1 className="text-xl font-bold">{t('verify.verifyFailed')}</h1>
            <p className="mt-2 text-sm text-ink-secondary">{msg}</p>
            <p className="mt-1 text-xs text-ink-muted">{t('verify.requestNew')}</p>
            <div className="mt-6 flex justify-center gap-3">
              <Link to="/account/settings"><Button variant="subtle">{t('verify.goSettings')}</Button></Link>
              <Link to="/"><Button variant="ghost">{t('common.home')}</Button></Link>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
