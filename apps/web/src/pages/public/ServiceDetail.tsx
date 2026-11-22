import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, type Service } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../lib/toast';
import { Button, Card, Badge, Skeleton, EmptyState, Textarea, Field, Form } from '../../components/ui';
import { PageHeader } from '../../components/PageHeader';
import { formatMoney, SERVICE_CATEGORY_LABEL } from '../../lib/format';
import { useI18n } from '../../i18n';
import { Seo, SITE_URL, breadcrumbLd, truncateMeta } from '../../lib/seo';

export default function ServiceDetail() {
  const { slug = '' } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const { t } = useI18n();
  const [s, setS] = useState<Service | null>(null);
  const [err, setErr] = useState(false);
  const [note, setNote] = useState('');
  const [custom, setCustom] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (slug === 'custom') { setCustom(true); return; }
    api.services.get(slug).then(({ data }) => setS(data)).catch(() => setErr(true));
  }, [slug]);

  const order = async () => {
    if (!user) { nav('/login', { state: { from: `/services/${slug}` } }); return; }
    if (user.role !== 'STUDENT') { toast.push('error', t('serviceDetail.studentOnly')); return; }
    if (custom || s?.basePrice == null) {
      toast.push('info', t('serviceDetail.customNeedsRequest'));
      nav('/requests/new');
      return;
    }
    setSending(true);
    try {
      const { data: o } = await api.serviceOrders.create({ slug, notes: note });
      const orderId = (o as { id?: string })?.id ?? (o as { order?: { id?: string } })?.order?.id;
      toast.push('success', t('serviceDetail.orderCreated'));
      nav(`/dashboard/orders/${orderId}`);
    } catch (e) {
      toast.push('error', e instanceof Error ? e.message : t('serviceDetail.orderFailed'));
    } finally {
      setSending(false);
    }
  };

  if (err) {
    return (
      <div className="container-x py-16">
        <Seo title={t('serviceDetail.loadFailed')} description={t('seo.services.desc')} noindex />
        <EmptyState
          title={t('serviceDetail.loadFailed')}
          action={<Link to="/services"><Button variant="outline">{t('serviceDetail.allServices')}</Button></Link>}
        />
      </div>
    );
  }
  if (!custom && !s) {
    return <div className="container-x space-y-4 py-10"><Skeleton className="h-40 w-full" /><Skeleton className="h-64 w-full" /></div>;
  }

  return (
    <div className="container-x py-10">
      {!custom && s && (
        <Seo
          title={s.title}
          description={truncateMeta(s.description) || t('seo.service.fallbackDesc', { title: s.title })}
          jsonLd={[
            {
              '@context': 'https://schema.org',
              '@type': 'Service',
              name: s.title,
              description: s.description ?? undefined,
              serviceType: s.category,
              inLanguage: ['ar', 'en'],
              provider: { '@type': 'EducationalOrganization', name: 'أكاديمية سراج التعليمية', sameAs: SITE_URL },
              areaServed: 'SA',
              ...(s.basePrice != null
                ? { offers: { '@type': 'Offer', price: s.basePrice, priceCurrency: 'SAR', url: `${SITE_URL}/services/${s.slug}` } }
                : {}),
            },
            breadcrumbLd([
              { name: 'الرئيسية', path: '/' },
              { name: 'الخدمات', path: '/services' },
              { name: s.title, path: `/services/${s.slug}` },
            ]),
          ]}
        />
      )}
      <PageHeader
        back
        title={custom ? t('serviceDetail.customTitle') : s?.title ?? t('serviceDetail.service')}
        subtitle={custom ? t('serviceDetail.customSubtitle') : s?.description ?? undefined}
        action={s?.category ? <Badge tone="gold">{t(SERVICE_CATEGORY_LABEL[s.category] ?? s.category)}</Badge> : undefined}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          {!custom && s && (
            <Card className="p-6">
              <h2 className="mb-4 font-bold text-gold-200">{t('serviceDetail.detailsTitle')}</h2>
              <ul className="space-y-3 text-sm text-ink-secondary">
                <li>{t('common.category')}: <b className="text-ink-primary">{t(SERVICE_CATEGORY_LABEL[s.category] ?? s.category)}</b></li>
                {s.basePrice != null && (
                  <li>
                    {t('serviceDetail.basePrice')}:{' '}
                    <b className="text-gold-300">{s.basePrice === 0 ? t('serviceDetail.free') : formatMoney(s.basePrice)}</b>
                  </li>
                )}
                {s.durationDays != null && (
                  <li>{t('serviceDetail.duration')}: <b className="text-ink-primary">{t('serviceDetail.upToDays', { days: s.durationDays })}</b></li>
                )}
              </ul>
            </Card>
          )}
          <Card className="p-6">
            <h2 className="mb-3 font-bold text-gold-200">{t('serviceDetail.notesTitle')}</h2>
            <Form onSubmit={order}>
              <Field label={t('serviceDetail.notesLabel')}>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={custom ? t('serviceDetail.notesPlaceholderCustom') : t('serviceDetail.notesPlaceholder')}
                />
              </Field>
              <Button type="submit" loading={sending} className="mt-4">
                {user ? t('serviceDetail.order') : t('serviceDetail.loginToOrder')}
              </Button>
            </Form>
          </Card>
        </div>
        <aside className="space-y-4 self-start lg:sticky lg:top-24">
          <Card className="p-6">
            <p className="text-sm text-ink-muted">{t('serviceDetail.howTitle')}</p>
            <ol className="mt-3 space-y-3 text-sm text-ink-secondary">
              <li><b className="text-gold-300">1.</b> {t('serviceDetail.step1')}</li>
              <li><b className="text-gold-300">2.</b> {t('serviceDetail.step2')}</li>
              <li><b className="text-gold-300">3.</b> {t('serviceDetail.step3')}</li>
              <li><b className="text-gold-300">4.</b> {t('serviceDetail.step4')}</li>
            </ol>
          </Card>
          <Card className="p-6 text-sm text-ink-muted">{t('serviceDetail.paymentNote')}</Card>
        </aside>
      </div>
    </div>
  );
}
