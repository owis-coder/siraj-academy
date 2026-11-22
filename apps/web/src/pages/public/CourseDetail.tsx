import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { api, type Course, type Offering, type Lesson } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../lib/toast';
import { Button, Card, Badge, Skeleton, EmptyState } from '../../components/ui';
import { PageHeader } from '../../components/PageHeader';
import { formatMoney, truncate } from '../../lib/format';
import { useI18n } from '../../i18n';
import { Seo, SITE_URL, breadcrumbLd, truncateMeta } from '../../lib/seo';
import { IconPlay, IconLock } from '../../components/icons';

type CourseDetail = Course & { offerings?: Offering[]; lessons?: Lesson[]; related?: Course[] };

/** استخراج embed id من أي شكل روابط يوتيوب */
function ytEmbed(url?: string | null): string | null {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{6,})/);
  return m ? m[1] : (/^[\w-]{6,}$/.test(url.trim()) ? url.trim() : null);
}

export default function CourseDetail() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const { t } = useI18n();
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [err, setErr] = useState(false);
  const [playing, setPlaying] = useState<{ embed: string; title: string } | null>(null);
  const [enrolling, setEnrolling] = useState<string | null>(null);

  useEffect(() => {
    setCourse(null);
    setErr(false);
    setPlaying(null);
    api.courses.get(id).then(({ data }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = data as any;
      const c = raw?.course ?? raw;
      const offs = raw?.offerings ?? c?.offerings ?? [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allLessons = offs.flatMap((o: any) => o.lessons ?? []);
      setCourse({ ...c, offerings: offs, lessons: allLessons });
    }).catch(() => setErr(true));
  }, [id]);

  if (err) {
    return (
      <div className="container-x py-16">
        <Seo title={t('courseDetail.loadFailed')} description={t('seo.courses.desc')} noindex />
        <EmptyState
          title={t('courseDetail.loadFailed')}
          action={<Link to="/courses"><Button variant="outline">{t('courseDetail.allCourses')}</Button></Link>}
        />
      </div>
    );
  }
  if (!course) {
    return (
      <div className="container-x space-y-6 py-10">
        <Skeleton className="h-44 w-full" />
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]"><Skeleton className="h-72 w-full" /><Skeleton className="h-72 w-full" /></div>
      </div>
    );
  }

  const offerings = (course.offerings ?? []).filter((o) => o.status !== 'DRAFT');
  const lessons = course.lessons ?? [];
  const trial = lessons.filter((l) => l.access === 'TRIAL');

  // الوصول محسوب لكل دورة على حدة: اشتراك في دورة مدرّس لا يفتح دروس مدرّس آخر.
  const lessonOffering = new Map<string, Offering>();
  for (const o of offerings) for (const l of o.lessons ?? []) lessonOffering.set(l.id, o);
  const unlocked = (l: Lesson) => !!lessonOffering.get(l.id)?.canSeeAllLessons;

  const enroll = async (o: Offering) => {
    if (!user) { nav('/login', { state: { from: `/courses/${id}` } }); return; }
    if (user.role !== 'STUDENT') { toast.push('error', t('courseDetail.studentOnly')); return; }
    setEnrolling(o.id);
    try {
      const { data: order } = await api.offerings.enroll(o.id);
      const orderId = (order as { order?: { id?: string }; id?: string })?.order?.id ?? (order as { id?: string })?.id;
      toast.push('success', t('courseDetail.enrollCreated'));
      nav(`/dashboard/orders/${orderId}`);
    } catch (e) {
      toast.push('error', e instanceof Error ? e.message : t('courseDetail.enrollFailed'));
    } finally {
      setEnrolling(null);
    }
  };

  const subtitle = [
    course.university?.name,
    course.college?.name,
    course.code ? t('courseDetail.code', { code: course.code }) : null,
    course.level ? t('courseDetail.level', { level: course.level }) : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className="container-x py-10">
      <Seo
        title={`${course.title}${course.university?.name ? ` — ${course.university.name}` : ''}`}
        description={
          truncateMeta(course.description) || t('seo.course.fallbackDesc', { title: course.title })
        }
        type="article"
        image={course.coverUrl ?? undefined}
        jsonLd={[
          {
            '@context': 'https://schema.org',
            '@type': 'Course',
            name: course.title,
            description: course.description ?? t('seo.course.fallbackDesc', { title: course.title }),
            inLanguage: ['ar', 'en'],
            ...(course.code ? { courseCode: course.code } : {}),
            ...(course.level ? { educationalLevel: course.level } : {}),
            provider: { '@type': 'EducationalOrganization', name: 'أكاديمية سراج التعليمية', sameAs: SITE_URL },
            ...(course.minPrice != null
              ? {
                  offers: {
                    '@type': 'Offer',
                    price: course.minPrice,
                    priceCurrency: 'SAR',
                    availability: 'https://schema.org/InStock',
                    url: `${SITE_URL}/courses/${course.id}`,
                  },
                }
              : {}),
          },
          breadcrumbLd([
            { name: 'الرئيسية', path: '/' },
            { name: 'الدورات', path: '/courses' },
            { name: course.title, path: `/courses/${course.id}` },
          ]),
        ]}
      />
      <PageHeader back title={course.title} subtitle={subtitle} />

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* العمود الرئيسي */}
        <div className="space-y-6">
          {course.description && (
            <Card className="p-6">
              <h2 className="mb-3 font-bold text-gold-200">{t('courseDetail.aboutCourse')}</h2>
              <p className="text-sm leading-8 text-ink-secondary">{course.description}</p>
            </Card>
          )}

          {/* المشغّل التجريبي */}
          <Card className="overflow-hidden">
            <div className="border-b border-line px-6 py-4">
              <h2 className="font-bold text-gold-200">
                {playing ? playing.title : trial.length ? t('courseDetail.trialTitle') : t('courseDetail.contentTitle')}
              </h2>
            </div>
            <div className="aspect-video w-full bg-black">
              {playing ? (
                <iframe src={`https://www.youtube.com/embed/${playing.embed}`} title={playing.title} className="size-full" allowFullScreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" />
              ) : (
                <div className="grid h-full place-items-center text-center text-sm text-ink-muted">
                  <div>
                    <IconPlay className="mx-auto mb-2 size-10 text-gold-300" aria-hidden />
                    {t('courseDetail.pickTrial')}
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* قائمة الدروس */}
          <Card>
            <div className="border-b border-line px-6 py-4"><h2 className="font-bold text-gold-200">{t('courseDetail.lessonsTitle')}</h2></div>
            {lessons.length === 0 ? (
              <div className="p-6"><EmptyState compact title={t('courseDetail.noData')} hint={t('courseDetail.noDataHint')} /></div>
            ) : (
              <ul className="divide-y divide-line/60">
                {lessons.map((l) => {
                  const embed = ytEmbed(l.videoUrl);
                  const locked = l.access === 'PAID' && !unlocked(l);
                  return (
                    <li key={l.id} className="flex items-center gap-3 px-6 py-3.5 text-sm">
                      <span className="grid size-8 shrink-0 place-items-center rounded-full border border-line-gold text-gold-200" aria-hidden>
                        {locked ? <IconLock className="size-3.5" /> : <IconPlay className="size-3.5" />}
                      </span>
                      <span className={`flex-1 truncate ${locked ? 'text-ink-muted' : 'text-ink-primary'}`}>{l.title}</span>
                      <Badge tone={locked ? 'muted' : 'ok'}>
                        {l.access === 'PAID'
                          ? locked ? t('courseDetail.paidLocked') : t('courseDetail.paidUnlocked')
                          : t('courseDetail.trial')}
                      </Badge>
                      {locked ? (
                        user ? (
                          user.role === 'STUDENT' ? (
                            <Button size="sm" variant="outline" onClick={() => { const o = lessonOffering.get(l.id); if (o) enroll(o); }}>{t('courseDetail.subscribeToOpen')}</Button>
                          ) : (
                            <span className="text-xs text-ink-muted">محتوى مخصص للطلاب المشتركين</span>
                          )
                        ) : (
                          <Link to="/login" state={{ from: `/courses/${id}` }} className="text-xs text-gold-300 hover:text-gold-200">{t('courseDetail.registerToAccess')}</Link>
                        )
                      ) : (
                        <button className="text-xs text-teal hover:underline" onClick={() => embed && setPlaying({ embed, title: l.title })} disabled={!embed}>
                          {embed ? t('courseDetail.watch') : t('courseDetail.invalidLink')}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {course.related && course.related.length > 0 && (
            <div>
              <h2 className="mb-4 font-bold text-gold-200">{t('courseDetail.related')}</h2>
              <div className="grid gap-4 sm:grid-cols-3">
                {course.related.slice(0, 3).map((r) => (
                  <Link key={r.id} to={`/courses/${r.id}`}>
                    <Card hover className="p-4 text-sm">
                      <p className="font-semibold">{truncate(r.title, 60)}</p>
                      <p className="mt-1 text-xs text-ink-muted">{r.university?.name}</p>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* العمود الجانبي: العروض */}
        <aside className="space-y-4 self-start lg:sticky lg:top-24">
          <h2 className="font-bold text-gold-200">{t('courseDetail.teacherOfferings', { count: offerings.length.toLocaleString() })}</h2>
          {offerings.length === 0 ? (
            <EmptyState compact title={t('courseDetail.noOffersTitle')} hint={t('courseDetail.noOffersHint')} />
          ) : (
            offerings.map((o) => (
              <Card key={o.id} hover className="p-5">
                <p className="font-semibold text-ink-primary">{o.title ?? course.title}</p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                  <span>{t('courseDetail.teacher')} <b className="text-gold-300">{o.teacherName ?? o.teacher?.fullName ?? t('courseDetail.verifiedTeacher')}</b></span>
                  <Badge tone="ok">{t('courseDetail.verified')}</Badge>
                </p>
                {o.summary && <p className="mt-2 text-sm leading-7 text-ink-secondary">{truncate(o.summary, 140)}</p>}
                <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
                  <span className="text-lg font-bold text-gold-300">{o.price === 0 ? t('courseDetail.free') : formatMoney(o.price)}</span>
                  {o.canSeeAllLessons ? (
                    <Button size="sm" variant="outline" onClick={() => nav('/dashboard/courses')}>{t('courseDetail.openContent')}</Button>
                  ) : (
                    <Button size="sm" loading={enrolling === o.id} onClick={() => enroll(o)}>
                      {user?.role === 'STUDENT' ? t('courseDetail.subscribe') : t('courseDetail.registerAndSubscribe')}
                    </Button>
                  )}
                </div>
              </Card>
            ))
          )}
        </aside>
      </div>
    </div>
  );
}
