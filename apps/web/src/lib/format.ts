import type { RequestStatus, OrderStatus } from './api';

/* التنسيق العام يتبع اللغة المختارة في الموقع (المحفوظة في المتصفح) */
function currentLang(): 'ar' | 'en' {
  try {
    return window.localStorage.getItem('siraj_lang') === 'en' ? 'en' : 'ar';
  } catch {
    return 'ar';
  }
}

function locale(): string {
  return currentLang() === 'en' ? 'en-GB' : 'ar-SA-u-nu-latn';
}

export function formatMoney(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  const amount = Number(v).toLocaleString(locale());
  return currentLang() === 'en' ? `SAR ${amount}` : `${amount} ر.س`;
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return '—';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
  const kb = Math.max(1, Math.round(bytes / 1024));
  return `${kb} KB`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(locale(), { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return iso;
  }
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return (
      new Date(iso).toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' }) +
      ' · ' +
      new Date(iso).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })
    );
  } catch {
    return iso;
  }
}

export function truncate(s: string | null | undefined, n = 140): string {
  if (!s) return '';
  return s.length > n ? s.slice(0, n).trimEnd() + '…' : s;
}

/* الحالات تُخزَّن كمفاتيح ترجمة وتُترجم في المكوّنات عبر t() */
export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  PENDING_REVIEW: 'status.request.PENDING_REVIEW',
  OPEN: 'status.request.OPEN',
  TEACHER_SELECTED: 'status.request.TEACHER_SELECTED',
  CLOSED: 'status.request.CLOSED',
  REJECTED: 'status.request.REJECTED',
};

export const REQUEST_STATUS_TONE: Record<RequestStatus, string> = {
  PENDING_REVIEW: 'warn',
  OPEN: 'ok',
  TEACHER_SELECTED: 'gold',
  CLOSED: 'muted',
  REJECTED: 'danger',
};

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  AWAITING_PAYMENT: 'status.order.AWAITING_PAYMENT',
  AWAITING_REVIEW: 'status.order.AWAITING_REVIEW',
  REJECTED: 'status.order.REJECTED',
  PAID: 'status.order.PAID',
  CANCELLED: 'status.order.CANCELLED',
};

export const ORDER_STATUS_TONE: Record<OrderStatus, string> = {
  AWAITING_PAYMENT: 'warn',
  AWAITING_REVIEW: 'gold',
  REJECTED: 'danger',
  PAID: 'ok',
  CANCELLED: 'muted',
};

export const OFFERING_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'status.offering.DRAFT',
  PENDING_REVIEW: 'status.offering.PENDING_REVIEW',
  NEEDS_REVISION: 'status.offering.NEEDS_REVISION',
  PUBLISHED: 'status.offering.PUBLISHED',
  HIDDEN: 'status.offering.HIDDEN',
  REJECTED: 'status.offering.REJECTED',
};

export const AD_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'status.ad.DRAFT',
  PENDING_REVIEW: 'status.ad.PENDING_REVIEW',
  APPROVED: 'status.ad.APPROVED',
  REJECTED: 'status.ad.REJECTED',
  HIDDEN: 'status.ad.HIDDEN',
  EXPIRED: 'status.ad.EXPIRED',
};

export const TEACHER_STATUS_LABEL: Record<string, string> = {
  PENDING: 'status.teacher.PENDING',
  APPROVED: 'status.teacher.APPROVED',
  REJECTED: 'status.teacher.REJECTED',
  SUSPENDED: 'status.teacher.SUSPENDED',
};

export const URGENCY_LABEL: Record<string, string> = {
  NOW: 'status.urgency.NOW',
  DAY: 'status.urgency.DAY',
  WEEK: 'status.urgency.WEEK',
  TERM: 'status.urgency.TERM',
};

export const EXPLAIN_TYPE_LABEL: Record<string, string> = {
  ONLINE: 'status.type.ONLINE',
  IN_PERSON: 'status.type.IN_PERSON',
  BOTH: 'status.type.BOTH',
};

export const CUSTOM_STATUS_LABEL: Record<string, string> = {
  NEW: 'status.custom.NEW',
  UNDER_REVIEW: 'status.custom.UNDER_REVIEW',
  AWAITING_RESPONSE: 'status.custom.AWAITING_RESPONSE',
  ACCEPTED: 'status.custom.ACCEPTED',
  REJECTED: 'status.custom.REJECTED',
  IN_PROGRESS: 'status.custom.IN_PROGRESS',
  COMPLETED: 'status.custom.COMPLETED',
};

export const CUSTOM_TYPE_LABEL: Record<string, string> = {
  COURSE_EXPLAIN: 'status.customType.COURSE_EXPLAIN',
  TOPIC_EXPLAIN: 'status.customType.TOPIC_EXPLAIN',
  TRANSLATION: 'status.customType.TRANSLATION',
  SUMMARY: 'status.customType.SUMMARY',
  PPT: 'status.customType.PPT',
  PROGRAMMING_PROJECT: 'status.customType.PROGRAMMING_PROJECT',
  OTHER: 'status.customType.OTHER',
};

export const SERVICE_CATEGORY_LABEL: Record<string, string> = {
  PRIVATE_EXPLAIN: 'status.category.PRIVATE_EXPLAIN',
  LIVE_EXPLAIN: 'status.category.LIVE_EXPLAIN',
  SUMMARY: 'status.category.SUMMARY',
  TRANSLATION: 'status.category.TRANSLATION',
  PPT: 'status.category.PPT',
  PROGRAMMING_PROJECT: 'status.category.PROGRAMMING_PROJECT',
  RESEARCH_REVIEW: 'status.category.RESEARCH_REVIEW',
  PROOFREADING: 'status.category.PROOFREADING',
  ACADEMIC_FORMAT: 'status.category.ACADEMIC_FORMAT',
  HOMEWORK_TRAINING: 'status.category.HOMEWORK_TRAINING',
  ACADEMIC_CONSULT: 'status.category.ACADEMIC_CONSULT',
  CUSTOM: 'status.category.CUSTOM',
};

export function whatsappLink(numbers: string | string[] | null | undefined): string | null {
  if (!numbers) return null;
  const list = Array.isArray(numbers) ? numbers : String(numbers).split(/[,،]/);
  const first = list[0]?.replace(/\D/g, '');
  if (!first) return null;
  if (first.startsWith('05')) {
    return `https://wa.me/966${first.slice(1)}`;
  }
  const cleaned = first.replace(/^0+/, '');
  return `https://wa.me/${cleaned}`;
}
