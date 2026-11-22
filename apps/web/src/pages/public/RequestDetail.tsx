import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError, type ExplainRequest } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../lib/toast';
import { Button, Card, Badge, Skeleton, EmptyState, Form, Field, Input, Textarea } from '../../components/ui';
import { PageHeader } from '../../components/PageHeader';
import { REQUEST_STATUS_LABEL, REQUEST_STATUS_TONE, formatMoney, formatDate, URGENCY_LABEL, EXPLAIN_TYPE_LABEL } from '../../lib/format';
import { useI18n } from '../../i18n';
import { IconAttachment } from '../../components/icons';
import { VerifiedBadge } from '../../components/VerifiedBadge';
import { Seo } from '../../lib/seo';

type LoadError = { status: number; message: string };

export default function RequestDetail() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const { t } = useI18n();
  const [r, setR] = useState<ExplainRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<LoadError | null>(null);
  const [sending, setSending] = useState(false);
  const [accepting, setAccepting] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setErr(null);
    api.requests
      .get(id)
      .then(({ data }) => {
        // الخادم يعيد كائن الطلب مسطّحًا — نتحقق من وجود المعرّف قبل أي عرض
        if (!data || typeof data !== 'object' || !data.id) {
          setErr({ status: 404, message: t('requestDetail.notFound.hint') });
          setR(null);
          return;
        }
        setR(data);
      })
      .catch((e: unknown) => {
        const status = e instanceof ApiError ? e.status : 0;
        const message = e instanceof Error ? e.message : t('requestDetail.loadFailed');
        setErr({ status, message });
        setR(null);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    setR(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) {
    return (
      <div className="container-x space-y-4 py-10">
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (err || !r) {
    const status = err?.status ?? 0;
    const title =
      status === 404
        ? t('requestDetail.notFound.title')
        : status === 403
          ? t('requestDetail.forbidden.title')
          : t('requestDetail.loadFailed');
    const hint =
      status === 404
        ? t('requestDetail.notFound.hint')
        : status === 403
          ? err?.message ?? t('requestDetail.forbidden.hint')
          : err?.message ?? t('requestDetail.connection');
    return (
      <div className="container-x py-16">
        <EmptyState
          title={title}
          hint={hint}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="outline" onClick={load}>{t('requestDetail.retry')}</Button>
              <Link to="/requests"><Button variant="subtle">{t('requestDetail.allRequests')}</Button></Link>
            </div>
          }
        />
      </div>
    );
  }

  const isOwner = user?.id === r.studentId;
  const myOffer = (r as any).myOffer;
  const canOffer = user?.role === 'TEACHER' && r.status === 'OPEN' && !r.restricted && !myOffer && !r.myOfferId;
  // الطالب لا يرى إلا العرض الذي اعتمدته الإدارة — لا عروض منافسة ولا ردود داخلية
  const publishedOffer = r.publishedOffer ?? null;

  const submitOffer = async (price: number, message: string, timelineDays?: number) => {
    setSending(true);
    try {
      await api.requests.createOffer(id, { price, message, timelineDays });
      toast.push('success', t('requestDetail.offerSent'));
      load();
    } catch (e) {
      toast.push('error', e instanceof Error ? e.message : t('requestDetail.offerFailed'));
    } finally {
      setSending(false);
    }
  };

  const confirmOffer = async (offerId: string) => {
    setAccepting(offerId);
    try {
      const { data: order } = await api.requests.confirmOffer(offerId);
      toast.push('success', t('requestDetail.acceptedToast'));
      nav(`/dashboard/orders/${order.id}`);
    } catch (e) {
      toast.push('error', e instanceof Error ? e.message : t('requestDetail.acceptFailed'));
    } finally {
      setAccepting(null);
    }
  };

  return (
    <div className="container-x py-10">
      <Seo
        title={t('seo.requests.title')}
        description={t('seo.requests.desc')}
        noindex
      />
      <PageHeader
        back
        title={t('requestDetail.titlePrefix', { course: r.courseTitle })}
        subtitle={r.details ?? undefined}
        action={
          <div className="flex items-center gap-3">
            <span className="font-mono text-lg text-gold-300">
              #{r.requestNo ?? String(r.id).slice(0, 6)}
            </span>
            <Badge tone={REQUEST_STATUS_TONE[r.status] ?? 'muted'}>
              {REQUEST_STATUS_LABEL[r.status] ? t(REQUEST_STATUS_LABEL[r.status]) : r.status}
            </Badge>
          </div>
        }
      />

      {r.restricted && (
        <div className="mb-6 rounded-lg border border-line bg-elevated/40 p-4 text-sm leading-7 text-ink-secondary">
          <p className="font-semibold text-gold-200">{t('requestDetail.restrictedTitle')}</p>
          <p className="mt-1 text-ink-muted">{t('requestDetail.restrictedBody')}</p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="mb-4 font-bold text-gold-200">{t('requestDetail.dataTitle')}</h2>
            <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
              <Row k={t('requestDetail.subject')} v={r.courseTitle} />
              <Row k={t('common.university')} v={r.university?.name ?? '—'} />
              <Row k={t('requestDetail.type')} v={EXPLAIN_TYPE_LABEL[r.type] ? t(EXPLAIN_TYPE_LABEL[r.type]) : r.type} />
              <Row k={t('requestDetail.urgency')} v={URGENCY_LABEL[r.urgency] ? t(URGENCY_LABEL[r.urgency]) : r.urgency} />
              {!r.restricted && (
                <Row k={t('requestDetail.budget')} v={r.budget != null ? formatMoney(r.budget) : t('requestDetail.budgetUnset')} />
              )}
              <Row k={t('requestDetail.submittedAt')} v={formatDate(r.createdAt)} />
              <Row k={t('requestDetail.offersCount')} v={(r.offersCount ?? 0).toLocaleString()} />
              {!r.restricted && r.linkUrl && (
                <Row
                  k={t('requestDetail.attachmentLink')}
                  v={<a href={r.linkUrl} target="_blank" rel="noreferrer" className="text-teal hover:underline" dir="ltr">{t('requestDetail.openLink')}</a>}
                />
              )}
            </dl>
            {!r.restricted && r.attachments && r.attachments.length > 0 && (
              <div className="mt-4 border-t border-line pt-4">
                <p className="mb-2 text-xs font-semibold text-ink-muted">{t('requestDetail.attachments')}</p>
                <div className="flex flex-wrap gap-2">
                  {r.attachments.map((a, i) => (
                    <a
                      key={i}
                      href={a.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-xs text-ink-secondary hover:text-teal"
                    >
                      <IconAttachment className="size-3.5" />
                      <span>{a.name ?? t('requestDetail.attachmentN', { n: i + 1 })}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* العرض المعتمد من الإدارة فقط — لا تُعرض العروض الداخلية أو المنافسة */}
          {isOwner && (
            <Card>
              <div className="border-b border-line px-6 py-4">
                <h2 className="font-bold text-gold-200">{t('requestDetail.offersTitle')}</h2>
              </div>
              {!publishedOffer ? (
                <div className="p-6">
                  {r.offersCount && r.offersCount > 0 ? (
                    <div className="rounded-lg border border-gold-500/30 bg-gold-500/10 p-5 text-center">
                      <p className="font-semibold text-gold-200">
                        توجد عروض مقدمة ({r.offersCount}) قيد مراجعة الإدارة
                      </p>
                      <p className="mt-2 text-xs text-ink-secondary leading-relaxed">
                        وصلت عروض من الأساتذة على طلبك، وتقوم إدارة المنصة حاليًا بمراجعتها واعتماد العرض الأنسب لك للتأكد من الجودة والاتفاق المالي. سيظهر العرض المعتمد هنا فور اعتماده لتتمكن من قبوله والبدء.
                      </p>
                    </div>
                  ) : (
                    <EmptyState compact title={t('requestDetail.noOffers')} hint={t('requestDetail.noOffersHint')} />
                  )}
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-4 px-6 py-4">
                  <div className="min-w-40 flex-1">
                    <p className="inline-flex items-center gap-1 font-semibold text-ink-primary">
                      {publishedOffer.teacherName}
                      <VerifiedBadge verified={publishedOffer.teacherVerified} />
                    </p>
                    <p className="mt-1 text-xs text-ink-muted">
                      معتمد من الإدارة · {publishedOffer.timelineDays != null ? t('requestDetail.deliveryDays', { days: publishedOffer.timelineDays }) : '—'}
                    </p>
                  </div>
                  <Badge tone={publishedOffer.status === 'ACCEPTED' ? 'ok' : 'gold'}>
                    {publishedOffer.status === 'ACCEPTED' ? t('requestDetail.accepted') : formatMoney(publishedOffer.price)}
                  </Badge>
                  {publishedOffer.status === 'APPROVED' && (
                    <Button size="sm" loading={accepting === publishedOffer.id} onClick={() => confirmOffer(publishedOffer.id)}>
                      {t('requestDetail.acceptOffer')}
                    </Button>
                  )}
                </div>
              )}
            </Card>
          )}
        </div>

        <aside className="space-y-4 self-start lg:sticky lg:top-24">
          {myOffer ? (
            <Card className="p-6 border-gold-500/30 bg-gold-500/10">
              <h3 className="font-bold text-gold-200 mb-3">عرضك المقدّم</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-ink-muted">السعر المقدّم:</span>
                  <span className="font-semibold text-ink-primary">{formatMoney(myOffer.price)}</span>
                </div>
                {myOffer.timelineDays != null && (
                  <div className="flex justify-between">
                    <span className="text-ink-muted">مدة التسليم:</span>
                    <span className="font-semibold text-ink-primary">{myOffer.timelineDays} يوم</span>
                  </div>
                )}
                <div className="flex justify-between items-center pt-2 border-t border-line">
                  <span className="text-ink-muted">حالة العرض:</span>
                  <Badge tone={myOffer.status === 'APPROVED' || myOffer.status === 'ACCEPTED' ? 'ok' : myOffer.status === 'REJECTED' ? 'danger' : 'warn'}>
                    {myOffer.status === 'PENDING'
                      ? 'قيد مراجعة الإدارة'
                      : myOffer.status === 'APPROVED'
                        ? 'معتمد ومرسل للطالب'
                        : myOffer.status === 'ACCEPTED'
                          ? 'مقبول من الطالب'
                          : myOffer.status === 'NEEDS_REVISION'
                            ? 'يحتاج تعديل'
                            : 'مرفوض'}
                  </Badge>
                </div>
              </div>
              <p className="mt-4 rounded-md border border-line bg-elevated/40 p-3 text-xs leading-5 text-ink-muted">
                ℹ️ نظام الوساطة في سراج: تُراجع الإدارة عروض الأساتذة وتعتمد الأنسب لإرساله للطالب. لا يظهر العرض للطالب إلا بعد اعتماد الإدارة له.
              </p>
            </Card>
          ) : canOffer ? (
            <OfferForm submitting={sending} onSubmit={submitOffer} />
          ) : r.restricted ? (
            <Card className="p-6 text-sm text-ink-muted">
              <p className="font-semibold text-ink-primary">{t('requestDetail.teacherCta')}</p>
              <p className="mt-2 leading-7">{t('requestDetail.teacherCtaBody')}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {!user ? (
                  <>
                    <Link to="/login" state={{ from: `/requests/${r.id}` }}><Button size="sm" variant="outline">{t('common.login')}</Button></Link>
                    <Link to="/register?tab=teacher"><Button size="sm" variant="subtle">{t('teachers.join')}</Button></Link>
                  </>
                ) : user.role === 'TEACHER' ? (
                  <Link to="/teacher/profile"><Button size="sm" variant="outline">إكمال التوثيق لتقديم عرض</Button></Link>
                ) : (
                  <span className="text-xs text-ink-muted">هذا الطلب مخصص لعروض الأساتذة المعتمدين فقط</span>
                )}
              </div>
            </Card>
          ) : (
            <Card className="p-6">
              <p className="text-sm text-ink-muted">{t('requestDetail.whatNext')}</p>
              <ol className="mt-3 space-y-2 text-sm text-ink-secondary">
                <li>1. {t('requestDetail.step1')}</li>
                <li>2. {t('requestDetail.step2')}</li>
                <li>3. {t('requestDetail.step3')}</li>
                <li>4. {t('requestDetail.step4')}</li>
              </ol>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-ink-muted">{k}</dt>
      <dd className="mt-0.5 text-ink-primary">{v}</dd>
    </div>
  );
}

function OfferForm({ submitting, onSubmit }: { submitting: boolean; onSubmit: (price: number, msg: string, days?: number) => void }) {
  const { t } = useI18n();
  const [price, setPrice] = useState('');
  const [msg, setMsg] = useState('');
  const [days, setDays] = useState('');
  const [err, setErr] = useState<string | null>(null);

  return (
    <Card className="p-6">
      <h3 className="mb-4 font-bold text-gold-200">{t('requestDetail.offerFormTitle')}</h3>
      <p className="mb-3 text-xs text-ink-muted">العرض موجه للإدارة فقط.</p>
      <Form
        onSubmit={() => {
          const p = Number(price);
          if (!price || Number.isNaN(p) || p < 5 || p > 10000) {
            setErr(t('requestDetail.priceErr'));
            return;
          }
          setErr(null);
          onSubmit(p, msg, days ? Number(days) : undefined);
        }}
      >
        <div className="space-y-4">
          <Field label={t('requestDetail.priceLabel')} required error={err ?? undefined} hint={t('requestDetail.priceHint')}>
            <Input type="number" min={5} max={10000} value={price} onChange={(e) => setPrice(e.target.value)} />
          </Field>
          <Field label="لماذا ترى أنك الأنسب لتنفيذ هذه الخدمة؟" hint="يُوجّه هذا المبرر إلى الإدارة فقط.">
            <Textarea value={msg} onChange={(e) => setMsg(e.target.value)} placeholder={t('requestDetail.messagePlaceholder')} />
          </Field>
          <Field label={t('requestDetail.daysLabel')}>
            <Input type="number" min={1} value={days} onChange={(e) => setDays(e.target.value)} />
          </Field>
          <Button type="submit" loading={submitting} className="w-full">{t('requestDetail.sendOffer')}</Button>
        </div>
      </Form>
    </Card>
  );
}
