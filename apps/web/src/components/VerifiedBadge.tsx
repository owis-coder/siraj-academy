import { useI18n } from '../i18n';

/**
 * علامة التوثيق الزرقاء — تُعرض فقط عندما يرسل الخادم isVerified = true.
 * لا يمكن تقليدها بإدخال نص في الاسم أو الصورة؛ مصدرها بيانات المستخدم.
 */
export function VerifiedBadge({
  verified,
  size = 'sm',
  className = '',
}: {
  verified?: boolean | null;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const { t } = useI18n();
  if (!verified) return null;
  const px = size === 'md' ? 'size-[1.15rem]' : 'size-[0.95rem]';
  return (
    <span
      className={`inline-flex shrink-0 items-center align-middle ${className}`}
      title={t('verified.badge')}
      aria-label={t('verified.badge')}
      role="img"
    >
      <svg viewBox="0 0 24 24" className={`${px} drop-shadow-sm`} aria-hidden="true">
        <path
          fill="#1D9BF0"
          d="M12 1.6l2.35 1.7 2.88-.28 1.05 2.7 2.62 1.22-.68 2.82.68 2.82-2.62 1.22-1.05 2.7-2.88-.28L12 22.4l-2.35-1.7-2.88.28-1.05-2.7-2.62-1.22.68-2.82-.68-2.82 2.62-1.22 1.05-2.7 2.88.28L12 1.6z"
        />
        <path
          fill="#fff"
          d="M9.7 15.9l-3.1-3.1 1.4-1.4 1.7 1.7 5.2-5.2 1.4 1.4-6.6 6.6z"
        />
      </svg>
    </span>
  );
}
