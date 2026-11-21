import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type ExplainRequest, type ChatRoom, type Notification, type Course, type Offer } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { Card, Badge, Button, Skeleton, EmptyState, Form, Field, Input, AnimatedCounter } from '../../../components/ui';
import { REQUEST_STATUS_LABEL, REQUEST_STATUS_TONE, formatDateTime, formatMoney } from '../../../lib/format';
import { ChatThread } from '../../../components/ChatThread';
import { useI18n } from '../../../i18n';
import { IconArrowForward } from '../../../components/icons';

/* ================= دوراتي ================= */
export function MyCourses() {
  const { t } = useI18n();
  const [items, setItems] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);

  useEffect(() => {
    // الدورات المشترك بها تُجلب من اشتراكات الطالب/الطلبات المدفوعة
    Promise.allSettled([api.orders.list(), api.courses.list({ mine: 'true' })]).then(([o, c]) => {
      const paidOfferingOrders = o.status === 'fulfilled' ? (o.value.data ?? []).filter((x) => x.status === 'PAID' && x.targetType === 'OFFERING') : [];
      const mine = c.status === 'fulfilled' ? c.value.data ?? [] : [];
      setItems(
        mine.length
          ? mine
          : paidOfferingOrders.map((x) => ({
              id: x.targetId ?? x.id,
              title: x.title ?? t('sd.courseFallback'),
              universityId: '',
              university: undefined,
              collegeId: null,
              majorId: null,
            } as unknown as Course)),
      );
      setLoading(false);
      if (c.status === 'rejected' && o.status === 'rejected') setErr(true);
    });
  }, [t]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('sd.myCoursesTitle')}</h1>
          <p className="mt-1 text-sm text-ink-muted">{t('sd.myCoursesSubtitle')}</p>
        </div>
        {!loading && items.length > 0 && (
          <span className="inline-flex items-center rounded-lg bg-gold-500/10 px-3 py-1 text-sm font-bold text-gold-300 ring-1 ring-gold-500/20">
            <AnimatedCounter value={items.length} suffix=" مقرر مسجل" />
          </span>
        )}
      </div>
      {loading ? <Skeleton className="h-48 w-full" /> : err ? (
        <EmptyState title={t('sd.coursesLoadFailed')} hint={t('sd.coursesServerHint')} />
      ) : items.length === 0 ? (
        <EmptyState
          title={t('sd.ordersEmptyTitle')}
          hint={t('sd.coursesEmptyHint')}
          action={<Link to="/courses"><Button variant="outline">{t('sd.browseCourses')}</Button></Link>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((c) => (
            <Link key={c.id} to={`/courses/${c.id}`} className="block">
              <Card hover className="flex h-full flex-col p-5">
                <p className="font-semibold">{c.title}</p>
                {c.code && <p className="mt-1 text-xs text-ink-muted">{c.code}</p>}
                <span className="mt-auto inline-flex items-center gap-1 pt-3 text-xs text-gold-300">
                  <span>{t('sd.openContent')}</span>
                  <IconArrowForward className="size-3.5" />
                </span>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/* ================= طلباتي ================= */
export function MyRequests() {
  const { t } = useI18n();
  const [items, setItems] = useState<ExplainRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.requests.list({ mine: 'true' }).then(({ data }) => { setItems(data ?? []); setLoading(false); }).catch(() => { setItems([]); setLoading(false); });
  };
  useEffect(load, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold">{t('sd.requestsTitle')}</h1>
            {!loading && items.length > 0 && (
              <span className="inline-flex items-center rounded-lg bg-gold-500/10 px-2.5 py-0.5 text-xs font-bold text-gold-300 ring-1 ring-gold-500/20">
                <AnimatedCounter value={items.length} suffix=" طلب" />
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-ink-muted">{t('sd.requestsSubtitle')}</p>
        </div>
        <Link to="/requests/new"><Button>{t('sd.newRequest')}</Button></Link>
      </div>
      {loading ? <Skeleton className="h-48 w-full" /> : items.length === 0 ? (
        <EmptyState title={t('sd.ordersEmptyTitle')} hint={t('sd.noRequestsSent')} />
      ) : (
        <div className="space-y-4">
          {items.map((r) => (
            <RequestsRow key={r.id} r={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function RequestsRow({ r }: { r: ExplainRequest }) {
  const { t } = useI18n();
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold">{r.courseTitle}</p>
          <p className="text-xs text-ink-muted">#{r.requestNo ?? r.id.slice(0, 6)} · {r.university?.name ?? ''} · {formatDateTime(r.createdAt)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="gold">{t('sd.offersCount', { count: (r.offersCount ?? r.offers?.length ?? 0).toLocaleString() })}</Badge>
          <Badge tone={REQUEST_STATUS_TONE[r.status]}>{t(REQUEST_STATUS_LABEL[r.status])}</Badge>
          <Link to={`/requests/${r.id}`} className="inline-flex items-center gap-1 text-sm text-gold-300 hover:text-gold-200">
            <span>{t('sd.detailsOffers')}</span>
            <IconArrowForward className="size-3.5" />
          </Link>
        </div>
      </div>
      {r.offers && r.status === 'OPEN' && r.offers.length > 0 && (
        <div className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-2 lg:grid-cols-3">
          {(r.offers as Offer[]).slice(0, 3).map((o) => (
            <div key={o.id} className="rounded-md border border-line bg-elevated/40 p-3 text-sm">
              <p className="font-medium">{o.teacher?.fullName ?? t('sd.teacher')}</p>
              <p className="mt-1 text-xs text-gold-300">{formatMoney(o.price)}</p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ================= المحادثات ================= */
export function ChatPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.chat.rooms().then(({ data }) => {
      const rs = (data ?? []) as ChatRoom[];
      setRooms(rs);
      setActive((a) => a ?? rs[0]?.id ?? null);
      setLoading(false);
    }).catch(() => { setLoading(false); });
  }, []);

  const room = rooms.find((r) => r.id === active) ?? null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t('sd.chatsTitle')}</h1>
        <p className="mt-1 text-xs text-ink-muted">تواصل مباشرة مع الدعم الفني للأكاديمية، أو مع المدرسين والطلاب</p>
      </div>
      {loading ? <Skeleton className="h-80 w-full" /> : rooms.length === 0 ? (
        <EmptyState title={t('sd.ordersEmptyTitle')} hint={t('sd.chatsEmptyHint')} />
      ) : (
        <div className="flex h-[580px] gap-4">
          <div className="flex w-64 shrink-0 flex-col gap-1.5 overflow-y-auto">
            {rooms.map((r) => {
              const isSupport = r.isSupport || (r.participants ?? []).some((p) => p.role === 'ADMIN' || (p as { username?: string }).username === 'siraj_support');
              const peer = (r.participants ?? []).find((p) => (p.id || (p as { userId?: string }).userId) !== user?.id);
              const displayName = isSupport
                ? 'الدعم الفني — أكاديمية سراج'
                : (r.title ?? peer?.fullName ?? t('sd.conversation'));
              const isCurrent = r.id === active;

              return (
                <button
                  key={r.id}
                  onClick={() => setActive(r.id)}
                  className={`group relative flex flex-col items-start gap-1 rounded-xl p-3 text-start text-sm transition-all ${
                    isCurrent
                      ? 'border border-gold-500/50 bg-gold-500/15 text-gold-200 shadow-sm'
                      : isSupport
                      ? 'border border-line-gold/50 bg-surface-2/80 text-ink-primary hover:border-gold-500/30 hover:bg-surface-2'
                      : 'border border-line/50 bg-surface text-ink-secondary hover:bg-elevated/70'
                  }`}
                >
                  <div className="flex w-full items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {isSupport && (
                        <span className="inline-flex shrink-0 items-center rounded bg-gold-500/20 px-1.5 py-0.5 text-[10px] font-bold text-gold-300">
                          الدعم الفني
                        </span>
                      )}
                      <span className="truncate font-semibold">{displayName}</span>
                    </div>
                    {Boolean(r.unread || r.unreadCount) && (
                      <span className="shrink-0 rounded-full bg-coral px-1.5 py-0.2 text-[10px] font-bold text-white">
                        {r.unread || r.unreadCount}
                      </span>
                    )}
                  </div>
                  {r.lastMessage?.body && (
                    <span className="line-clamp-1 text-xs text-ink-muted">
                      {r.lastMessage.body}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="min-w-0 flex-1">
            <ChatThread room={room} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ================= الإشعارات ================= */
export function Notifications() {
  const { t } = useI18n();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.notifications.list().then(({ data }) => { setItems(data ?? []); setLoading(false); }).catch(() => { setItems([]); setLoading(false); });
  };
  useEffect(load, []);

  const markAll = async () => {
    await api.notifications.readAll().catch(() => {});
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t('sd.notificationsTitle')}</h1>
        <Button variant="subtle" size="sm" onClick={markAll}>{t('sd.markAllRead')}</Button>
      </div>
      {loading ? <Skeleton className="h-48 w-full" /> : items.length === 0 ? (
        <EmptyState title={t('sd.noNotifications')} hint={t('sd.notificationsHint')} />
      ) : (
        <div className="space-y-3">
          {items.map((n) => (
            <Card key={n.id} className={`flex items-start justify-between gap-4 p-5 ${n.isRead ? 'opacity-70' : 'border-line-gold'}`}>
              <div>
                <p className="font-semibold">{n.title}</p>
                {n.body && <p className="mt-1 text-sm text-ink-secondary">{n.body}</p>}
                <p className="mt-1.5 text-xs text-ink-muted">{formatDateTime(n.createdAt)}</p>
              </div>
              <div className="flex items-center gap-2">
                {n.link && <a href={n.link} className="text-xs text-teal hover:underline">{t('sd.open')}</a>}
                {!n.isRead && (
                  <button onClick={async () => { await api.notifications.read(n.id).catch(() => {}); load(); }} className="text-xs text-ink-muted hover:text-gold-200">
                    {t('sd.markRead')}
                  </button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ================= المفضلة ================= */
type FavRow = { id: string; targetId: string; targetType: 'SERVICE' | 'OFFERING' | 'TEACHER' };

export function Favorites() {
  const { t } = useI18n();
  const [rows, setRows] = useState<{ row: FavRow; title: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);

  useEffect(() => {
    api.favorites
      .list()
      .then(async (j) => {
        const items: FavRow[] = (j as { data?: FavRow[] }).data ?? [];
        // تفاصيل كل عنصر تُسحب من نقطته العامة لعرض اسمه (التفاصيل غير الحرجة إن فشلت)
        const detailed = await Promise.all(
          items.map(async (row) => {
            let title = t(row.targetType === 'SERVICE' ? 'sd.favService' : row.targetType === 'OFFERING' ? 'sd.favOffering' : 'sd.favTeacher');
            try {
              if (row.targetType === 'SERVICE') {
                const s = await api.services.get(row.targetId);
                title = `${title} — ${(s as Record<string, unknown>)['title'] ?? ''}`;
              } else if (row.targetType === 'OFFERING') {
                title = `${title} — ${row.targetId.slice(0, 8)}…`;
              } else if (row.targetType === 'TEACHER') {
                title = `${title} — ${row.targetId.slice(0, 8)}…`;
              }
            } catch { /* العنصر ربما حُذف */ }
            return { row, title };
          }),
        );
        setRows(detailed);
        setLoading(false);
      })
      .catch(() => { setErr(true); setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const remove = async (row: FavRow) => {
    await api.favorites.toggle(row.targetId, row.targetType).catch(() => {});
    setRows((rs) => rs.filter((r) => r.row.id !== row.id));
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('sd.favoritesTitle')}</h1>
      {loading ? <Skeleton className="h-48 w-full" /> : err ? (
        <EmptyState title={t('sd.favLoadFailed')} hint={t('sd.favLoadHint')} />
      ) : rows.length === 0 ? (
        <EmptyState title={t('sd.ordersEmptyTitle')} hint={t('sd.favEmptyHint')} />
      ) : (
        <div className="grid gap-3">
          {rows.map(({ row, title }) => (
            <Card key={row.id} className="flex items-center justify-between p-4">
              <span className="text-sm">{title}</span>
              <Button variant="subtle" size="sm" onClick={() => remove(row)}>{t('sd.remove')}</Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ================= الملف الشخصي ================= */
export function Profile() {
  const { user, refresh } = useAuth();
  const { t } = useI18n();
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [whatsapp, setWhatsapp] = useState(user?.whatsapp ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api.account.updateProfile({ fullName, whatsapp: whatsapp || null });
      await refresh();
    } catch { /* تُعرض حالة الخطأ عبر القيمة الافتراضية */ }
    finally { setSaving(false); }
  };

  if (!user) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-bold">{t('sd.profileTitle')}</h1>
      <Card className="p-6">
        <div className="mb-6 grid gap-3 text-sm sm:grid-cols-2">
          <div><p className="text-xs text-ink-muted">{t('sd.username')}</p><p className="font-mono">{user.username}</p></div>
          <div><p className="text-xs text-ink-muted">{t('common.email')}</p><p className="font-mono" dir="ltr">{user.email}</p></div>
          <div>
            <p className="text-xs text-ink-muted">{t('sd.emailVerifiedLabel')}</p>
            {user.emailVerified ? <Badge tone="ok">{t('sd.verified')}</Badge> : <Badge tone="warn">{t('sd.unverified')}</Badge>}
          </div>
          <div><p className="text-xs text-ink-muted">{t('common.university')}</p><p>{user.university?.name ?? '—'}</p></div>
        </div>
        <Form onSubmit={save} className="space-y-4">
          <Field label={t('common.fullName')}><Input value={fullName} onChange={(e) => setFullName(e.target.value)} /></Field>
          <Field label={t('sd.whatsapp')}><Input dir="ltr" value={whatsapp ?? ''} onChange={(e) => setWhatsapp(e.target.value)} /></Field>
          <Button type="submit" loading={saving}>{t('sd.saveEdits')}</Button>
        </Form>
      </Card>
    </div>
  );
}

export { default as StudentCustomRequests } from './StudentCustomRequests';
