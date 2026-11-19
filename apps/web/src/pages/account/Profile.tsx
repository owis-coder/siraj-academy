import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type MyProfile } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { UserAvatar } from '../../components/AccountMenu';
import { Badge, Button, Card, EmptyState, Skeleton } from '../../components/ui';
import { PageHeader } from '../../components/PageHeader';
import { formatDate, TEACHER_STATUS_LABEL } from '../../lib/format';
import { useI18n } from '../../i18n';
import { IconArrowForward } from '../../components/icons';

/* ============================================================
   الملف الشخصي الموحّد — جزء من الموقع الأساسي لا لوحة منفصلة.
   يعرض البيانات الأساسية وحالة الحساب والروابط الخاصة بالدور.
   ============================================================ */

const ROLE_LABEL_KEY: Record<string, string> = {
  STUDENT: 'role.student',
  TEACHER: 'role.teacher',
  ADMIN: 'role.admin',
};

export default function AccountProfile() {
  const { refresh } = useAuth();
  const { t } = useI18n();
  const [data, setData] = useState<MyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api.account
      .me()
      .then(({ data: d }) => {
        if (alive) setData(d);
      })
      .catch((e) => {
        if (alive) setErr(e instanceof Error ? e.message : t('profile.loadFailed'));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    void refresh();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="container-x space-y-4 py-10">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-52 w-full" />
      </div>
    );
  }

  if (err || !data) {
    return (
      <div className="container-x py-16">
        <EmptyState
          title={t('profile.loadFailed')}
          hint={err ?? t('profile.checkConnection')}
          action={<Button onClick={() => window.location.reload()}>{t('profile.retry')}</Button>}
        />
      </div>
    );
  }

  const u = data.user;
  const role = u.role;
  const isTeacher = role === 'TEACHER';
  const profileStatus = u.teacherProfile?.status;

  return (
    <div className="container-x py-10">
      <PageHeader
        title={t('profile.title')}
        subtitle={t('profile.subtitle')}
        action={
          <Link to="/account/settings">
            <Button variant="outline">{t('account.settings')}</Button>
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card className="p-6">
            <div className="flex flex-wrap items-center gap-4">
              <UserAvatar size={72} />
              <div className="min-w-0">
                <h2 className="truncate text-xl font-bold text-ink-primary">{u.fullName}</h2>
                <p className="mt-0.5 font-mono text-sm text-ink-muted" dir="ltr">@{u.username}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge tone="gold">{t(ROLE_LABEL_KEY[role] ?? 'role.student')}</Badge>
                  {u.emailVerified ? (
                    <Badge tone="ok">{t('profile.emailVerifiedBadge')}</Badge>
                  ) : (
                    <Badge tone="warn">{t('profile.emailUnverifiedBadge')}</Badge>
                  )}
                  {isTeacher && (
                    <Badge tone={profileStatus === 'APPROVED' ? 'ok' : profileStatus === 'REJECTED' ? 'danger' : 'warn'}>
                      {TEACHER_STATUS_LABEL[profileStatus ?? 'PENDING'] ? t(TEACHER_STATUS_LABEL[profileStatus ?? 'PENDING']) : profileStatus}
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            {u.pendingEmail && (
              <p className="mt-5 rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-ink-secondary">
                {t('profile.pendingEmail', { email: u.pendingEmail })}
              </p>
            )}
          </Card>

          <Card className="p-6">
            <h3 className="mb-4 font-bold text-gold-200">{t('profile.basicTitle')}</h3>
            <dl className="grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
              <Row label={t('common.email')} value={<span dir="ltr" className="font-mono">{u.email}</span>} />
              <Row label={t('profile.phone')} value={u.whatsapp ? <span dir="ltr" className="font-mono">{u.whatsapp}</span> : t('profile.notAdded')} />
              <Row label={t('common.university')} value={u.university?.name ?? t('profile.notSet')} />
              <Row label={t('common.major')} value={u.major?.name ?? t('profile.notSet')} />
              <Row label={t('common.level')} value={u.level ?? t('profile.notSet')} />
              <Row label={t('profile.joinedAt')} value={formatDate(u.createdAt)} />
            </dl>
          </Card>

          {isTeacher && u.teacherProfile && (
            <Card className="p-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-bold text-gold-200">{t('profile.professionalTitle')}</h3>
                <Link to="/teacher/profile" className="inline-flex items-center gap-1 text-xs text-gold-300 hover:text-gold-200">
                  <span>{t('profile.manageProfessional')}</span>
                  <IconArrowForward className="size-3.5" />
                </Link>
              </div>
              <dl className="grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
                <Row label={t('profile.approvalStatus')} value={TEACHER_STATUS_LABEL[profileStatus ?? 'PENDING'] ? t(TEACHER_STATUS_LABEL[profileStatus ?? 'PENDING']) : '—'} />
                <Row label={t('profile.degree')} value={u.teacherProfile.degree ?? '—'} />
                <Row label={t('profile.specialties')} value={u.teacherProfile.specialties ?? '—'} />
                <Row label={t('profile.universitiesText')} value={u.teacherProfile.universitiesText ?? '—'} />
              </dl>
              {u.teacherProfile.bio && <p className="mt-4 text-sm leading-7 text-ink-secondary">{u.teacherProfile.bio}</p>}
              {profileStatus !== 'APPROVED' && (
                <p className="mt-4 rounded-md border border-line bg-elevated/40 p-3 text-xs leading-6 text-ink-muted">
                  {t('profile.notApprovedNote')}
                </p>
              )}
            </Card>
          )}
        </div>

        <aside className="space-y-4 self-start">
          <Card className="p-5">
            <h3 className="mb-3 font-bold text-gold-200">{t('profile.activityTitle')}</h3>
            <ul className="space-y-2 text-sm">
              <StatRow label={t('profile.statExplain')} value={data.stats.explainRequests} to="/dashboard/requests" />
              <StatRow label={t('profile.statCustom')} value={data.stats.customRequests} to="/dashboard/custom-requests" />
              <StatRow label={t('profile.statEnroll')} value={data.stats.enrollments} to="/dashboard/courses" />
            </ul>
          </Card>

          <Card className="p-5">
            <h3 className="mb-3 font-bold text-gold-200">{t('profile.quickLinks')}</h3>
            <div className="flex flex-col gap-1.5 text-sm">
              {role === 'STUDENT' && (
                <>
                  <QuickLink to="/dashboard/requests" label={t('account.myRequests')} />
                  <QuickLink to="/dashboard/courses" label={t('account.myCourses')} />
                  <QuickLink to="/dashboard/chat" label={t('account.messages')} />
                </>
              )}
              {role === 'TEACHER' && (
                <>
                  <QuickLink to="/teacher/offerings" label={t('account.teacherCourses')} />
                  <QuickLink to="/teacher/requests" label={t('profile.availableRequests')} />
                  <QuickLink to="/teacher/chat" label={t('account.messages')} />
                </>
              )}
              {role === 'ADMIN' && (
                <>
                  <QuickLink to="/admin" label={t('account.adminDashboard')} />
                  <QuickLink to="/admin/audit" label={t('account.auditLog')} />
                </>
              )}
              <QuickLink to="/account/notifications" label={t('account.notifications')} />
              <QuickLink to="/account/settings" label={t('account.settings')} />
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="mt-0.5 text-ink-primary">{value}</dd>
    </div>
  );
}

function StatRow({ label, value, to }: { label: string; value: number; to: string }) {
  return (
    <li>
      <Link to={to} className="flex items-center justify-between gap-2 rounded-md px-1 py-1 hover:text-gold-200">
        <span className="text-ink-secondary">{label}</span>
        <span className="font-bold text-ink-primary">{value.toLocaleString()}</span>
      </Link>
    </li>
  );
}

function QuickLink({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="flex items-center justify-between rounded-md px-2 py-1.5 text-ink-secondary transition-colors hover:bg-elevated hover:text-ink-primary">
      <span>{label}</span>
      <IconArrowForward className="size-3.5" />
    </Link>
  );
}
