import { Link } from 'react-router-dom';
import { Card, Badge } from './ui';
import type { University, Course, Service, ExplainRequest } from '../lib/api';
import { formatMoney, truncate, REQUEST_STATUS_LABEL, REQUEST_STATUS_TONE, formatDate } from '../lib/format';
import { LogoMark } from './Navbar';
import { useI18n } from '../i18n';
import { ServiceCategoryIcon } from './icons';

const FALLBACK_AVATAR =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" rx="20" fill="#2E2B29"/><text x="48" y="60" text-anchor="middle" font-size="38" fill="#C9964B" font-family="serif">س</text></svg>`,
  );

export function UniversityCard({ u }: { u: University }) {
  const { t } = useI18n();
  return (
    <Link to={`/universities/${u.slug}`} className="block min-w-0">
      <Card hover className="flex h-full items-center gap-4 p-5">
        <span className="grid size-12 shrink-0 place-items-center rounded-[10px] border border-line-gold bg-elevated/70 text-lg font-bold text-gold-200" aria-hidden>
          {(u.name || '؟').trim().charAt(0)}
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink-primary">{u.name}</p>
          <p className="mt-0.5 text-xs text-ink-muted">
            {u.city ? `${u.city} · ` : ''}
            {t('cards.courseCount', { count: (u.coursesCount ?? 0).toLocaleString() })}
          </p>
        </div>
      </Card>
    </Link>
  );
}

export function CourseCard({ c }: { c: Course }) {
  const { t, lang } = useI18n();
  const teacher =
    Array.isArray(c.teacherNames) ? c.teacherNames.join(lang === 'ar' ? '، ' : ', ') : (c.teacherNames as unknown as string) || '';
  return (
    <Link to={`/courses/${c.id}`} className="block h-full min-w-0">
      <Card hover className="flex h-full flex-col p-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <h3 className="line-clamp-2 font-semibold text-ink-primary">{c.title}</h3>
          {c.code && <Badge tone="gold">{c.code}</Badge>}
        </div>
        {c.description && <p className="mb-3 text-sm leading-6 text-ink-secondary">{truncate(c.description, 110)}</p>}
        <div className="mt-auto flex items-center justify-between border-t border-line pt-3 text-xs text-ink-muted">
          <span className="truncate">{teacher ? t('cards.teacher', { name: teacher }) : t('cards.noTeacher')}</span>
          {c.minPrice != null ? (
            <span className="font-semibold text-gold-300">{c.minPrice === 0 ? t('cards.free') : formatMoney(c.minPrice)}</span>
          ) : (
            <span>{t('cards.noOffers')}</span>
          )}
        </div>
        {c.university?.name && <p className="mt-2 text-[11px] text-ink-muted">{c.university.name}</p>}
      </Card>
    </Link>
  );
}

export function ServiceCard({ s }: { s: Service }) {
  const { t } = useI18n();
  return (
    <Link to={`/services/${s.slug}`} className="block h-full">
      <Card hover className="flex h-full flex-col p-5">
        <div className="mb-2 flex items-center justify-between">
          <span className="grid size-10 place-items-center rounded-[10px] border border-line-gold bg-elevated/70 text-gold-300" aria-hidden>
            <ServiceCategoryIcon category={s.category} className="size-5" />
          </span>
          {s.isFeatured && <Badge tone="gold">{t('cards.featured')}</Badge>}
        </div>
        <h3 className="font-semibold text-ink-primary">{s.title}</h3>
        <p className="mt-1 line-clamp-2 text-sm text-ink-muted">{truncate(s.description ?? '', 90)}</p>
        <div className="mt-auto pt-3 text-xs text-ink-muted">
          {s.basePrice != null ? (
            <span className="text-gold-300">{t('cards.fromPrice', { price: formatMoney(s.basePrice) })}</span>
          ) : (
            t('cards.priceOnRequest')
          )}
          {s.durationDays != null && <span className="ms-2">· {t('cards.deliveryDays', { days: s.durationDays })}</span>}
        </div>
      </Card>
    </Link>
  );
}

export function RequestCard({ r }: { r: ExplainRequest }) {
  const { t } = useI18n();
  return (
    <Link to={`/requests/${r.id}`} className="block h-full">
      <Card hover className="flex h-full flex-col gap-3 p-5">
        <div className="flex items-center justify-between">
          <span className="font-mono text-sm text-ink-muted">#{r.requestNo ?? r.id.slice(0, 6)}</span>
          <Badge tone={REQUEST_STATUS_TONE[r.status]}>{t(REQUEST_STATUS_LABEL[r.status])}</Badge>
        </div>
        <div>
          <h3 className="line-clamp-1 font-semibold text-ink-primary">{r.courseTitle}</h3>
          <p className="text-xs text-ink-muted">{t('cards.explainRequest')} · {r.university?.name ?? '—'}</p>
        </div>
        {r.details && <p className="line-clamp-2 text-sm text-ink-secondary">{truncate(r.details, 120)}</p>}
        <div className="mt-auto flex items-center justify-between border-t border-line pt-3 text-xs text-ink-muted">
          <span>{formatDate(r.createdAt)}</span>
          <span>{t('cards.offersCount', { count: (r.offersCount ?? r.offers?.length ?? 0).toLocaleString() })}</span>
        </div>
      </Card>
    </Link>
  );
}

export function TeacherCard({ t: teacherRow }: { t: any }) {
  const { t, lang } = useI18n();
  const sep = lang === 'ar' ? '، ' : ', ';
  const specialties = Array.isArray(teacherRow.specialties)
    ? teacherRow.specialties.join(sep)
    : typeof teacherRow.specialties === 'string'
      ? teacherRow.specialties
      : Array.isArray(teacherRow.teacherProfile?.specialties)
        ? teacherRow.teacherProfile.specialties.join(sep)
        : (teacherRow.teacherProfile?.specialties ?? '');
  const bio = teacherRow.bio ?? teacherRow.teacherProfile?.bio ?? '';
  const universitiesText = teacherRow.universitiesText ?? teacherRow.teacherProfile?.universitiesText;

  return (
    <Link to={`/teachers/${teacherRow.username}`} className="block h-full">
      <Card hover className="flex h-full items-start gap-4 p-5">
        <img src={FALLBACK_AVATAR} alt="" className="size-14 shrink-0 rounded-[12px] border border-line" />
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-ink-primary">{teacherRow.fullName}</h3>
          {specialties && (
            <p className="mt-0.5 line-clamp-1 text-xs text-gold-300">{specialties}</p>
          )}
          {bio && <p className="mt-1 line-clamp-2 text-sm text-ink-muted">{truncate(bio, 100)}</p>}
          {universitiesText && (
            <p className="mt-1.5 text-[11px] text-ink-muted">{universitiesText}</p>
          )}
        </div>
      </Card>
    </Link>
  );
}

export function SERVICE_ICON(category?: string | null): JSX.Element | null {
  return category ? <ServiceCategoryIcon category={category} className="size-5" /> : null;
}
