import { Link } from 'react-router-dom';
import { useEffect, useState, type ComponentType } from 'react';
import { api, type University, type Course, type ExplainRequest, type Service } from '../../lib/api';
import { Button, Card, Badge, SkeletonGrid, Accordion, StatCard, AnimatedCounter } from '../../components/ui';
import { UniversityCard, CourseCard, RequestCard, ServiceCard } from '../../components/cards';
import { useI18n } from '../../i18n';
import {
  IconChat,
  IconBank,
  IconRequests,
  IconCheck,
  IconArrowForward,
} from '../../components/icons';

const FAQ_KEYS = [1, 2, 3, 4, 5].map((n) => ({ qKey: `home.faq.${n}.q`, aKey: `home.faq.${n}.a` }));

const VALUE_KEYS: { icon: ComponentType<{ className?: string }>; n: number }[] = [
  { icon: IconChat, n: 1 },
  { icon: IconBank, n: 2 },
  { icon: IconRequests, n: 3 },
  { icon: IconCheck, n: 4 },
];

export default function Home() {
  const { t } = useI18n();
  const [universities, setUniversities] = useState<University[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [requests, setRequests] = useState<ExplainRequest[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [activeUni, setActiveUni] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    Promise.allSettled([
      api.universities.list(),
      api.courses.list({ pageSize: 8 }),
      api.requests.list({ status: 'OPEN', pageSize: 4 }),
      api.services.list(),
    ]).then(([u, c, r, s]) => {
      if (!alive) return;
      setUniversities(u.status === 'fulfilled' ? u.value.data ?? [] : []);
      setCourses(c.status === 'fulfilled' ? c.value.data ?? [] : []);
      setRequests(r.status === 'fulfilled' ? r.value.data ?? [] : []);
      setServices(s.status === 'fulfilled' ? s.value.data ?? [] : []);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  const visibleCourses = activeUni ? courses.filter((c) => c.university?.id === activeUni) : courses;

  return (
    <>
      {/* ============ Hero ============ */}
      <section className="relative overflow-hidden border-b border-line/50">
        <div className="hero-pattern absolute inset-0" aria-hidden />
        <div className="container-x relative py-20 lg:py-28">
          <div className="max-w-3xl animate-fadeUp">
            <Badge tone="gold" className="mb-5">{t('home.badge')}</Badge>
            <h1 className="text-4xl font-bold leading-[1.25] sm:text-5xl lg:text-[3.4rem]">
              {t('home.heroTitle')} <span className="gold-text">{t('home.heroHighlight')}</span>
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-ink-secondary sm:text-lg">
              {t('home.heroDesc')}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/register"><Button className="px-7 py-3 text-base">{t('home.ctaStart')}</Button></Link>
              <Link to="/courses"><Button variant="outline" className="px-7 py-3 text-base">{t('home.ctaExplore')}</Button></Link>
            </div>
          </div>
        </div>
      </section>

      {/* ============ شريط الأرقام (أرقام حقيقية فقط) ============ */}
      <section className="container-x py-12">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label={t('home.stats.universities')} value={universities.length ? universities.length.toLocaleString() : null} hint={universities.length ? undefined : t('home.stats.noData')} />
          <StatCard label={t('home.stats.courses')} value={courses.length ? courses.length.toLocaleString() : null} hint={courses.length ? undefined : t('home.stats.noData')} />
          <StatCard label={t('home.stats.requests')} value={requests.length ? requests.length.toLocaleString() : null} hint={requests.length ? undefined : t('home.stats.noRequests')} />
          <StatCard label={t('home.stats.support')} value="24/7" hint={t('home.stats.supportHint')} />
        </div>
      </section>

      {/* ============ اختر جامعتك وابدأ ============ */}
      <section className="container-x py-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-2xl font-bold">{t('home.universities.title')}</h2>
              {universities.length > 0 && (
                <span className="inline-flex items-center rounded-full bg-gold-500/10 px-2.5 py-0.5 text-xs font-bold text-gold-300 ring-1 ring-gold-500/20">
                  <AnimatedCounter value={universities.length} suffix=" جامعة" />
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-ink-muted">{t('home.universities.subtitle')}</p>
          </div>
          <Link to="/universities" className="inline-flex items-center gap-1.5 text-sm text-gold-300 transition-colors hover:text-gold-200">
            <span>{t('home.universities.viewAll')}</span>
            <IconArrowForward className="size-4 shrink-0" />
          </Link>
        </div>
        {loading ? (
          <SkeletonGrid count={6} />
        ) : universities.length === 0 ? (
          <EmptyHint text={t('home.universities.empty')} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {universities.slice(0, 6).map((u) => (
              <UniversityCard key={u.id} u={u} />
            ))}
          </div>
        )}
      </section>

      {/* ============ الطلبات الجارية ============ */}
      <section className="container-x py-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-2xl font-bold">{t('home.requests.title')}</h2>
              {requests.length > 0 && (
                <span className="inline-flex items-center rounded-full bg-gold-500/10 px-2.5 py-0.5 text-xs font-bold text-gold-300 ring-1 ring-gold-500/20">
                  <AnimatedCounter value={requests.length} suffix=" طلب" />
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-ink-muted">{t('home.requests.subtitle')}</p>
          </div>
          <Link to="/requests" className="inline-flex items-center gap-1.5 text-sm text-gold-300 transition-colors hover:text-gold-200">
            <span>{t('home.requests.viewAll')}</span>
            <IconArrowForward className="size-4 shrink-0" />
          </Link>
        </div>
        {loading ? (
          <SkeletonGrid count={4} />
        ) : requests.length === 0 ? (
          <EmptyHint
            text={t('home.requests.empty')}
            cta={<Link to="/requests/new"><Button variant="outline" size="sm">{t('home.requests.emptyCta')}</Button></Link>}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {requests.slice(0, 4).map((r) => (
              <RequestCard key={r.id} r={r} />
            ))}
          </div>
        )}
      </section>

      {/* ============ أحدث الدورات ============ */}
      <section className="container-x py-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-2xl font-bold">{t('home.courses.title')}</h2>
              {courses.length > 0 && (
                <span className="inline-flex items-center rounded-full bg-teal/10 px-2.5 py-0.5 text-xs font-bold text-teal ring-1 ring-teal/20">
                  <AnimatedCounter value={courses.length} suffix=" مقرر" />
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-ink-muted">{t('home.courses.subtitle')}</p>
          </div>
          <Link to="/courses" className="inline-flex items-center gap-1.5 text-sm text-gold-300 transition-colors hover:text-gold-200">
            <span>{t('home.courses.viewAll')}</span>
            <IconArrowForward className="size-4 shrink-0" />
          </Link>
        </div>

        {universities.length > 0 && (
          <div className="mb-6 flex flex-wrap gap-2">
            <Chip active={!activeUni} onClick={() => setActiveUni(null)}>{t('home.courses.all')}</Chip>
            {universities.slice(0, 6).map((u) => (
              <Chip key={u.id} active={activeUni === u.id} onClick={() => setActiveUni(activeUni === u.id ? null : u.id)}>
                {u.name}
              </Chip>
            ))}
          </div>
        )}

        {loading ? (
          <SkeletonGrid count={8} />
        ) : visibleCourses.length === 0 ? (
          <EmptyHint text={t('home.courses.empty')} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {visibleCourses.slice(0, 8).map((c) => (
              <CourseCard key={c.id} c={c} />
            ))}
          </div>
        )}
      </section>

      {/* ============ لماذا سراج ============ */}
      <section className="container-x py-12">
        <div className="mb-8 text-center">
          <h2 className="text-2xl font-bold">
            {t('home.values.title')} <span className="gold-text">{t('home.values.highlight')}</span>
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {VALUE_KEYS.map((v) => {
            const IconComp = v.icon;
            return (
              <Card key={v.n} hover className="p-6 text-center">
                <span className="mx-auto mb-3 grid size-12 place-items-center rounded-full border border-line-gold bg-elevated/60 text-gold-200" aria-hidden>
                  <IconComp className="size-6 text-gold-300" />
                </span>
                <h3 className="font-semibold">{t(`home.values.${v.n}.title`)}</h3>
                <p className="mt-2 text-sm leading-7 text-ink-secondary">{t(`home.values.${v.n}.desc`)}</p>
              </Card>
            );
          })}
        </div>
      </section>

      {/* ============ الخدمات الطلابية ============ */}
      <section className="container-x py-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold">{t('home.services.title')}</h2>
            <p className="mt-1 text-sm text-ink-muted">{t('home.services.subtitle')}</p>
          </div>
          <Link to="/services" className="inline-flex items-center gap-1.5 text-sm text-gold-300 transition-colors hover:text-gold-200">
            <span>{t('home.services.viewAll')}</span>
            <IconArrowForward className="size-4 shrink-0" />
          </Link>
        </div>
        {loading ? (
          <SkeletonGrid count={8} />
        ) : services.length === 0 ? (
          <EmptyHint text={t('home.services.empty')} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {services.slice(0, 12).map((s) => (
              <ServiceCard key={s.id} s={s} />
            ))}
          </div>
        )}
      </section>

      {/* ============ الأسئلة الشائعة ============ */}
      <section className="container-x py-12">
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-6 text-center text-2xl font-bold">{t('home.faq.title')}</h2>
          <Accordion items={FAQ_KEYS.map((f) => ({ q: t(f.qKey), a: t(f.aKey) }))} />
        </div>
      </section>

      {/* ============ CTA ============ */}
      <section className="container-x pb-8">
        <Card className="relative overflow-hidden p-10 text-center">
          <div className="hero-pattern absolute inset-0 opacity-70" aria-hidden />
          <div className="relative">
            <h2 className="text-2xl font-bold sm:text-3xl">
              {t('home.cta.title')} <span className="gold-text">{t('home.cta.highlight')}</span>
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-sm text-ink-secondary">{t('home.cta.desc')}</p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link to="/register"><Button className="px-8">{t('home.cta.register')}</Button></Link>
              <Link to="/requests/new"><Button variant="outline">{t('home.cta.requestPrivate')}</Button></Link>
            </div>
          </div>
        </Card>
      </section>
    </>
  );
}

function Chip({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
        active ? 'border-line-gold bg-gold-500/15 text-gold-200' : 'border-line text-ink-muted hover:border-gold/40 hover:text-ink-secondary'
      }`}
    >
      {children}
    </button>
  );
}

function EmptyHint({ text, cta }: { text: string; cta?: React.ReactNode }) {
  return (
    <Card className="p-10 text-center">
      <p className="text-sm text-ink-muted">{text}</p>
      {cta && <div className="mt-4">{cta}</div>}
    </Card>
  );
}
