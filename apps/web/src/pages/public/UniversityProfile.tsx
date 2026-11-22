import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type Course, type Service, type University } from '../../lib/api';
import { Tabs, Card, Badge, Skeleton, EmptyState, Button, AnimatedCounter } from '../../components/ui';
import { ServiceCard, TeacherCard } from '../../components/cards';
import { formatMoney } from '../../lib/format';
import { useI18n } from '../../i18n';
import { Seo, SITE_URL, breadcrumbLd, truncateMeta } from '../../lib/seo';
import { IconArrowForward } from '../../components/icons';

type UniDetail = {
  university?: University;
  colleges?: { id: string; name: string; coursesCount?: number; _count?: { courses: number; majors: number } }[];
  coursesCount?: number;
  majorsCount?: number;
  teachers?: (import('../../lib/api').User & { teacherProfile?: import('../../lib/api').TeacherProfile | null; specialties?: string[]; offeringsCount?: number })[];
  servicesForUniversity?: Service[];
  services?: Service[];
  priceSummary?: {
    offeringsCount?: number;
    minPrice?: number | null;
    avgPrice?: number | null;
    maxPrice?: number | null;
  };
  offerings?: { id: string; title?: string; price: number; course?: Course; teacher?: { fullName?: string } }[];
};

export default function UniversityProfile() {
  const { t } = useI18n();
  const { slug = '' } = useParams();
  const [data, setData] = useState<UniDetail | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const [tab, setTab] = useState('colleges');

  useEffect(() => {
    setData(null);
    setLoadErr(false);
    api.universities.get(slug).then(({ data }) => setData(data as unknown as UniDetail)).catch(() => setLoadErr(true));
  }, [slug]);

  if (loadErr) {
    return (
      <div className="container-x py-16">
        <Seo title={t('universityProfile.loadFailed')} description={t('seo.universities.desc')} noindex />
        <EmptyState
          title={t('universityProfile.loadFailed')}
          hint={t('universityProfile.loadHint')}
          action={<Link to="/universities"><Button variant="outline">{t('universityProfile.all')}</Button></Link>}
        />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="container-x space-y-6 py-10">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const u = data.university;
  const colleges = data.colleges ?? [];
  const coursesCount = data.coursesCount ?? colleges.reduce((sum, c) => sum + (c._count?.courses ?? c.coursesCount ?? 0), 0);
  const teachers = data.teachers ?? [];
  const services = data.servicesForUniversity ?? data.services ?? [];
  const priceSummary = data.priceSummary;
  const offerings = data.offerings ?? [];

  return (
    <div className="container-x py-10">
      <Seo
        title={u?.name ?? t('seo.universities.title')}
        description={
          truncateMeta([u?.city, t('seo.university.fallbackDesc', { name: u?.name ?? '' })].filter(Boolean).join(' · ')) ||
          t('seo.universities.desc')
        }
        jsonLd={[
          {
            '@context': 'https://schema.org',
            '@type': 'CollegeOrUniversity',
            name: u?.name,
            url: `${SITE_URL}/universities/${slug}`,
            ...(u?.city ? { address: { '@type': 'PostalAddress', addressLocality: u.city, addressCountry: 'SA' } } : {}),
          },
          breadcrumbLd([
            { name: 'الرئيسية', path: '/' },
            { name: 'الجامعات', path: '/universities' },
            { name: u?.name ?? '', path: `/universities/${slug}` },
          ]),
        ]}
      />
      {/* Header */}
      <Card className="relative mb-8 overflow-hidden p-8">
        <div className="hero-pattern absolute inset-0 opacity-60" aria-hidden />
        <div className="relative flex flex-wrap items-center gap-5">
          <span className="grid size-16 place-items-center rounded-lg border border-line-gold bg-elevated/70 text-2xl font-bold text-gold-200" aria-hidden>
            {(u?.name ?? '؟').charAt(0)}
          </span>
          <div>
            <h1 className="text-3xl font-bold">{u?.name ?? t('universityProfile.fallback')}</h1>
            <p className="mt-1 text-sm text-ink-muted">{u?.city ?? t('universityProfile.saudi')}</p>
          </div>
          <div className="ms-auto flex gap-6 text-center text-sm">
            <div>
              <p className="text-xl font-bold text-gold-300">
                <AnimatedCounter value={coursesCount} />
              </p>
              <p className="text-ink-muted">{t('universityProfile.courses')}</p>
            </div>
            <div>
              <p className="text-xl font-bold text-gold-300">
                <AnimatedCounter value={teachers.length} />
              </p>
              <p className="text-ink-muted">{t('universityProfile.teachers')}</p>
            </div>
            <div>
              <p className="text-xl font-bold text-gold-300">
                <AnimatedCounter value={services.length} />
              </p>
              <p className="text-ink-muted">{t('universityProfile.services')}</p>
            </div>
          </div>
        </div>
      </Card>

      <Tabs
        tabs={[
          { key: 'colleges', label: t('universityProfile.tabColleges', { count: colleges.length.toLocaleString() }) },
          { key: 'teachers', label: t('universityProfile.tabTeachers', { count: teachers.length.toLocaleString() }) },
          { key: 'services', label: t('universityProfile.tabServices', { count: services.length.toLocaleString() }) },
          { key: 'prices', label: t('universityProfile.tabPrices') },
        ]}
        active={tab}
        onChange={setTab}
        className="mb-6"
      />

      {tab === 'colleges' && (colleges.length === 0 ? (
        <EmptyState title={t('universityProfile.emptyColleges')} hint={t('universityProfile.emptyCollegesHint')} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {colleges.map((c) => (
            <Card key={c.id} hover className="p-5">
              <p className="font-semibold">{c.name}</p>
              <p className="mt-1 text-xs text-ink-muted">{t('cards.courseCount', { count: ((c._count?.courses ?? c.coursesCount) ?? 0).toLocaleString() })}</p>
              <Link to={`/courses?universityId=${u?.id}&collegeId=${c.id}`} className="mt-3 inline-flex items-center gap-1 text-xs text-gold-300 hover:text-gold-200">
                <span>{t('universityProfile.viewCollegeCourses')}</span>
                <IconArrowForward className="size-3" />
              </Link>
            </Card>
          ))}
        </div>
      ))}

      {tab === 'teachers' && (teachers.length === 0 ? (
        <EmptyState title={t('universityProfile.noTeachers')} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {teachers.map((row) => (
            <TeacherCard key={row.id} t={row as never} />
          ))}
        </div>
      ))}

      {tab === 'services' && (services.length === 0 ? (
        <EmptyState title={t('universityProfile.noServices')} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((s) => (
            <ServiceCard key={s.id} s={s} />
          ))}
        </div>
      ))}

      {tab === 'prices' && (
        priceSummary && (priceSummary.offeringsCount ?? 0) > 0 ? (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <Card className="p-6 text-center">
                <p className="text-xs text-ink-muted">{t('universityProfile.minPrice')}</p>
                <p className="mt-2 text-2xl font-bold text-gold-300">{formatMoney(priceSummary.minPrice ?? 0)}</p>
              </Card>
              <Card className="p-6 text-center">
                <p className="text-xs text-ink-muted">{t('universityProfile.avgPrice')}</p>
                <p className="mt-2 text-2xl font-bold text-ink-primary">{formatMoney(Math.round(priceSummary.avgPrice ?? 0))}</p>
              </Card>
              <Card className="p-6 text-center">
                <p className="text-xs text-ink-muted">{t('universityProfile.publishedOfferings')}</p>
                <p className="mt-2 text-2xl font-bold text-ok">{(priceSummary.offeringsCount ?? 0).toLocaleString()}</p>
              </Card>
            </div>
            <div className="text-center">
              <Link to={`/courses?universityId=${u?.id}`}>
                <Button variant="primary">{t('universityProfile.browseCourses')}</Button>
              </Link>
            </div>
          </div>
        ) : offerings.length > 0 ? (
          <div className="divide-y divide-line/60 overflow-hidden rounded-lg border border-line">
            {offerings.map((o) => (
              <div key={o.id} className="flex items-center justify-between gap-4 bg-surface p-4 text-sm">
                <div>
                  <p className="font-medium text-ink-primary">{o.title ?? o.course?.title ?? t('universityProfile.courseFallback')}</p>
                  <p className="text-xs text-ink-muted">{o.teacher?.fullName} · {o.course?.code ?? o.course?.title}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge tone={o.price === 0 ? 'ok' : 'gold'}>{o.price === 0 ? t('cards.free') : formatMoney(o.price)}</Badge>
                  <Link to={`/courses/${o.course?.id ?? ''}`}>
                    <Button size="sm" variant="subtle">{t('common.view')}</Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title={t('universityProfile.noPricedOfferings')} hint={t('universityProfile.noPricedHint')} />
        )
      )}
    </div>
  );
}
