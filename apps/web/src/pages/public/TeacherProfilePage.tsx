import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type User, type TeacherProfile, type Offering, type LiveSession } from '../../lib/api';
import { Button, Card, Badge, Skeleton, EmptyState, Tabs } from '../../components/ui';
import { formatMoney, formatDateTime } from '../../lib/format';
import { useI18n } from '../../i18n';
import { VerifiedBadge } from '../../components/VerifiedBadge';
import { Seo, SITE_URL, breadcrumbLd, truncateMeta } from '../../lib/seo';

type TeacherDetail = User & { isVerified?: boolean; teacherProfile?: TeacherProfile | null; offerings?: Offering[]; services?: { id: string; slug: string; title: string }[]; liveSessions?: LiveSession[] };

type Extras = {
  bio?: string | null;
  degree?: string | null;
  specialties?: string[] | string | null;
  universitiesText?: string | null;
};

export default function TeacherProfilePage() {
  const { username = '' } = useParams();
  const { t, lang } = useI18n();
  const [data, setData] = useState<TeacherDetail | null>(null);
  const [err, setErr] = useState(false);
  const [tab, setTab] = useState('about');

  useEffect(() => {
    setData(null); setErr(false);
    api.teachers.get(username).then(({ data }) => setData(data as unknown as TeacherDetail)).catch(() => setErr(true));
  }, [username]);

  if (err) {
    return (
      <div className="container-x py-16">
        <Seo title={t('teacherProfile.loadFailed')} description={t('seo.teachers.desc')} noindex />
        <EmptyState
          title={t('teacherProfile.loadFailed')}
          action={<Link to="/teachers"><Button variant="outline">{t('teacherProfile.allTeachers')}</Button></Link>}
        />
      </div>
    );
  }
  if (!data) {
    return <div className="container-x space-y-6 py-10"><Skeleton className="h-44 w-full" /><Skeleton className="h-64 w-full" /></div>;
  }

  const extras = data as TeacherDetail & Extras;
  const offerings = data.offerings ?? [];
  const sessions = data.liveSessions ?? [];
  const services = data.services ?? [];
  const sep = lang === 'ar' ? '، ' : ', ';
  const specialties = Array.isArray(extras.specialties)
    ? extras.specialties.join(sep)
    : (extras.specialties ?? data.teacherProfile?.specialties ?? '—');

  const specialtyText = Array.isArray(data.teacherProfile?.specialties)
    ? data.teacherProfile?.specialties.join('، ')
    : (data.teacherProfile?.specialties as unknown as string) || '';

  return (
    <div className="container-x py-10">
      <Seo
        title={data.fullName}
        description={
          truncateMeta(data.teacherProfile?.bio) ||
          t('seo.teacher.fallbackDesc', { name: data.fullName })
        }
        type="profile"
        jsonLd={[
          {
            '@context': 'https://schema.org',
            '@type': 'Person',
            name: data.fullName,
            url: `${SITE_URL}/teachers/${data.username}`,
            ...(specialtyText ? { knowsAbout: specialtyText.split(/[,،]/).map((s) => s.trim()).filter(Boolean) } : {}),
            ...(data.teacherProfile?.degree ? { jobTitle: data.teacherProfile.degree } : {}),
            worksFor: { '@type': 'EducationalOrganization', name: 'أكاديمية سراج التعليمية', sameAs: SITE_URL },
            ...(data.isVerified ? { hasCredential: 'Verified by Siraj Academy' } : {}),
          },
          breadcrumbLd([
            { name: 'الرئيسية', path: '/' },
            { name: 'المدرسون', path: '/teachers' },
            { name: data.fullName, path: `/teachers/${data.username}` },
          ]),
        ]}
      />
      <Card className="relative mb-8 overflow-hidden p-8">
        <div className="hero-pattern absolute inset-0 opacity-60" aria-hidden />
        <div className="relative flex flex-wrap items-center gap-5">
          <span className="grid size-16 place-items-center rounded-lg border border-line-gold bg-elevated/70 text-2xl font-bold text-gold-200" aria-hidden>
            {data.fullName.charAt(0)}
          </span>
          <div>
            <h1 className="inline-flex items-center gap-2 text-3xl font-bold">
              {data.fullName}
              <VerifiedBadge verified={(data as unknown as { isVerified?: boolean }).isVerified} size="md" />
            </h1>
            <p className="mt-1 text-sm text-ink-muted" dir="ltr">@{data.username}</p>
          </div>
          <div className="ms-auto">
            <Badge tone="ok">{t('teacherProfile.verified')}</Badge>
          </div>
        </div>
      </Card>

      <Tabs
        tabs={[
          { key: 'about', label: t('teacherProfile.aboutTab') },
          { key: 'offerings', label: t('teacherProfile.offeringsTab', { count: offerings.length.toLocaleString() }) },
          { key: 'services', label: t('teacherProfile.servicesTab', { count: services.length.toLocaleString() }) },
          { key: 'live', label: t('teacherProfile.liveTab', { count: sessions.length.toLocaleString() }) },
        ]}
        active={tab}
        onChange={setTab}
        className="mb-6"
      />

      {tab === 'about' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-6">
            <h2 className="mb-3 font-bold text-gold-200">{t('teacherProfile.bio')}</h2>
            <p className="text-sm leading-8 text-ink-secondary">
              {extras.bio ?? data.teacherProfile?.bio ?? t('teacherProfile.noBio')}
            </p>
          </Card>
          <div className="space-y-4">
            <Card className="p-6">
              <h2 className="mb-3 font-bold text-gold-200">{t('teacherProfile.qualification')}</h2>
              <p className="text-sm text-ink-secondary">{extras.degree ?? data.teacherProfile?.degree ?? '—'}</p>
            </Card>
            <Card className="p-6">
              <h2 className="mb-3 font-bold text-gold-200">{t('teacherProfile.specialties')}</h2>
              <p className="text-sm text-ink-secondary">{specialties}</p>
            </Card>
            <Card className="p-6">
              <h2 className="mb-3 font-bold text-gold-200">{t('teacherProfile.universities')}</h2>
              <p className="text-sm text-ink-secondary">{extras.universitiesText ?? data.teacherProfile?.universitiesText ?? '—'}</p>
            </Card>
          </div>
        </div>
      )}

      {tab === 'offerings' && (offerings.length === 0 ? (
        <EmptyState title={t('teacherProfile.noOfferings')} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {offerings.map((o) => (
            <Link key={o.id} to={`/courses/${o.courseId ?? o.course?.id ?? ''}`} className="block">
              <Card hover className="flex h-full flex-col p-5">
                <p className="font-semibold">{o.title ?? o.course?.title ?? t('teacherProfile.courseFallback')}</p>
                <p className="mt-1 text-xs text-ink-muted">{o.course?.code} · {o.course?.university?.name}</p>
                <p className="mt-auto pt-3 font-bold text-gold-300">{o.price === 0 ? t('teacherProfile.free') : formatMoney(o.price)}</p>
              </Card>
            </Link>
          ))}
        </div>
      ))}

      {tab === 'services' && (services.length === 0 ? (
        <EmptyState title={t('teacherProfile.noData')} />
      ) : (
        <div className="flex flex-wrap gap-2">
          {services.map((s) => (
            <Link key={s.id} to={`/services/${s.slug}`}><Badge tone="gold">{s.title}</Badge></Link>
          ))}
        </div>
      ))}

      {tab === 'live' && (sessions.length === 0 ? (
        <EmptyState title={t('teacherProfile.noLive')} />
      ) : (
        <div className="divide-y divide-line/60 overflow-hidden rounded-lg border border-line">
          {sessions.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 bg-surface p-4 text-sm">
              <div>
                <p className="font-medium">{s.title}</p>
                <p className="text-xs text-ink-muted">
                  {formatDateTime(s.startsAt)} · {t('teacherProfile.minutes', { count: s.durationMin ?? 60 })}
                </p>
              </div>
              <Badge tone={s.price ? 'gold' : 'ok'}>{s.price ? formatMoney(s.price) : t('teacherProfile.free')}</Badge>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
