import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type Order, type ExplainRequest } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { Card, Badge, StatCard, Skeleton, EmptyState, Button } from '../../../components/ui';
import { ORDER_STATUS_LABEL, ORDER_STATUS_TONE, REQUEST_STATUS_LABEL, REQUEST_STATUS_TONE, formatDateTime } from '../../../lib/format';
import { PaymentPanel, OrderRow } from '../../../components/Payment';
import { useI18n } from '../../../i18n';
import { IconArrowForward, IconArrowBack } from '../../../components/icons';

/* ================= نظرة عامة ================= */
export function DashboardHome() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [orders, setOrders] = useState<Order[]>([]);
  const [requests, setRequests] = useState<ExplainRequest[]>([]);
  const [notifCount, setNotifCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    Promise.allSettled([api.orders.list(), api.requests.list({ mine: 'true' }), api.notifications.list()]).then(([o, r, n]) => {
      if (!alive) return;
      setOrders(o.status === 'fulfilled' ? o.value.data ?? [] : []);
      setRequests(r.status === 'fulfilled' ? r.value.data ?? [] : []);
      if (n.status === 'fulfilled') setNotifCount((n.value.data ?? []).filter((x) => !x.isRead).length);
      else setNotifCount(null);
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  const paying = orders.filter((o) => o.status === 'AWAITING_PAYMENT' || o.status === 'AWAITING_REVIEW');
  const enrolled = orders.filter((o) => o.status === 'PAID' && o.targetType === 'OFFERING');

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">
          {t('sd.greeting')} <span className="gold-text">{user?.fullName?.split(' ')[0] ?? t('sd.guest')}</span>
        </h1>
        <p className="mt-1 text-sm text-ink-muted">{t('sd.subtitle')}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t('sd.paymentsPending')} value={loading ? null : paying.length.toLocaleString()} tone="coral" />
        <StatCard label={t('sd.confirmedEnrollments')} value={loading ? null : enrolled.length.toLocaleString()} />
        <StatCard label={t('sd.explainRequests')} value={loading ? null : requests.length.toLocaleString()} tone="teal" />
        <StatCard label={t('sd.unreadNotifications')} value={loading ? null : notifCount != null ? notifCount.toLocaleString() : null} tone="ok" />
      </div>

      {paying.length > 0 && (
        <section>
          <h2 className="mb-4 font-bold text-gold-200">{t('sd.latestPayment')}</h2>
          <PaymentPanel order={paying[0]} />
          <Link to="/dashboard/orders" className="mt-3 inline-flex items-center gap-1 text-sm text-gold-300 hover:text-gold-200">
            <span>{t('sd.allOrders')}</span>
            <IconArrowForward className="size-3.5" />
          </Link>
        </section>
      )}

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-bold text-gold-200">{t('sd.recentRequests')}</h2>
          <Link to="/dashboard/requests" className="inline-flex items-center gap-1 text-sm text-gold-300 hover:text-gold-200">
            <span>{t('sd.all')}</span>
            <IconArrowForward className="size-3.5" />
          </Link>
        </div>
        {loading ? <Skeleton className="h-40 w-full" /> : requests.length === 0 ? (
          <EmptyState
            compact
            title={t('sd.noRequests')}
            hint={t('sd.noRequestsHint')}
            action={<Link to="/requests/new"><Button size="sm" variant="outline">{t('sd.newRequest')}</Button></Link>}
          />
        ) : (
          <div className="divide-y divide-line/60 rounded-lg border border-line bg-surface">
            {requests.slice(0, 4).map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 text-sm">
                <div>
                  <p className="font-medium">{r.courseTitle}</p>
                  <p className="text-xs text-ink-muted">{formatDateTime(r.createdAt)}</p>
                </div>
                <Badge tone={REQUEST_STATUS_TONE[r.status]}>{t(REQUEST_STATUS_LABEL[r.status])}</Badge>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/* ================= الطلبات والمدفوعات ================= */
export function Orders() {
  const { t } = useI18n();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.orders.list().then(({ data }) => { setOrders(data ?? []); setLoading(false); })
      .catch(() => { setOrders([]); setLoading(false); });
  };
  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('sd.ordersTitle')}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t('sd.ordersSubtitle')}</p>
      </div>
      {loading ? <Skeleton className="h-48 w-full" /> : orders.length === 0 ? (
        <EmptyState title={t('sd.ordersEmptyTitle')} hint={t('sd.ordersEmptyHint')} />
      ) : (
        <div className="space-y-5">
          {orders.map((o) => <OrderRow key={o.id} o={o} onChanged={load} />)}
        </div>
      )}
    </div>
  );
}

/* ============ طلب واحد (تفاصيل + دفع) ============ */
export function OrderDetail() {
  const { t } = useI18n();
  const { id = '' } = useParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [err, setErr] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = () => {
    if (!id) return;
    setLoading(true);
    setErr(false);
    api.orders
      .get(id)
      .then(({ data }) => {
        const o = ((data as unknown as { order?: Order })?.order ?? data) as Order;
        if (!o || !o.id) {
          setErr(true);
        } else {
          setOrder(o);
        }
      })
      .catch(() => setErr(true))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    if (id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (err || !order) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <Link to="/dashboard/orders" className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-ink-secondary">
          <IconArrowBack className="size-3.5" />
          <span>{t('sd.backToOrders')}</span>
        </Link>
        <EmptyState
          title={t('sd.orderLoadFailed')}
          hint={t('sd.orderNotFound')}
          action={<Button variant="outline" size="sm" onClick={load}>{t('common.retry') || 'إعادة المحاولة'}</Button>}
        />
      </div>
    );
  }

  const typeKey =
    order.targetType === 'OFFERING'
      ? 'payment.typeOffering'
      : order.targetType === 'SERVICE'
        ? 'payment.typeService'
        : order.targetType === 'OFFER'
          ? 'payment.typeOffer'
          : 'payment.typeCustom';

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link to="/dashboard/orders" className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-ink-secondary">
        <IconArrowBack className="size-3.5" />
        <span>{t('sd.backToOrders')}</span>
      </Link>
      <h1 className="text-2xl font-bold">{order.title ?? t('sd.orderFallback')}</h1>
      <PaymentPanel order={order} onChanged={load} />
      <Card className="p-6 text-sm leading-7 text-ink-secondary">
        <p className="mb-2 font-bold text-gold-200">{t('sd.extraDetails')}</p>
        <p>{t('sd.orderType')}: {t(typeKey)}</p>
        {order.notes && <p className="mt-2">{t('sd.orderNotes')}: {order.notes}</p>}
        {order.status === 'PAID' && <p className="mt-2 text-emerald-500">{t('sd.paidNote')}</p>}
        {order.status === 'REJECTED' && <p className="mt-2 text-coral">{t('sd.rejectedNote')}</p>}
      </Card>
    </div>
  );
}
