import type { ComponentType } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { Badge } from './ui';
import { useI18n } from '../i18n';
import {
  IconUser,
  IconSettings,
  IconNotifications,
  IconDashboard,
  IconAudit,
  IconGraduation,
  IconRequests,
  IconCustomRequests,
  IconOrders,
  IconChat,
  IconCheck,
  IconChevronDown,
  IconLogout,
} from './icons';

/* ============================================================
   قائمة الحساب الموحّدة في رأس الموقع:
   الطالب والمدرّس والإدارة يستخدمون الموقع نفسه، وتُعرض فقط
   الروابط المسموحة لدور المستخدم (التحقق الحقيقي على الخادم).
   ============================================================ */

type MenuLink = { to: string; labelKey: string; icon: ComponentType<{ className?: string }> };

const ROLE_LABEL_KEY: Record<string, string> = {
  STUDENT: 'account.roleStudent',
  TEACHER: 'account.roleTeacher',
  ADMIN: 'account.roleAdmin',
};

function linksFor(role: 'STUDENT' | 'TEACHER' | 'ADMIN'): MenuLink[] {
  const profile: MenuLink[] = [
    { to: '/account/profile', labelKey: 'account.profile', icon: IconUser },
    { to: '/account/settings', labelKey: 'account.settings', icon: IconSettings },
  ];
  const notifications: MenuLink = { to: '/account/notifications', labelKey: 'account.notifications', icon: IconNotifications };

  if (role === 'ADMIN') {
    return [
      ...profile,
      { to: '/admin', labelKey: 'account.adminDashboard', icon: IconDashboard },
      { to: '/admin/chat', labelKey: 'account.messages', icon: IconChat },
      { to: '/admin/audit', labelKey: 'account.auditLog', icon: IconAudit },
      notifications,
    ];
  }

  if (role === 'TEACHER') {
    return [
      ...profile,
      { to: '/teacher', labelKey: 'account.teacherDashboard', icon: IconDashboard },
      { to: '/teacher/offerings', labelKey: 'account.teacherCourses', icon: IconGraduation },
      { to: '/teacher/requests', labelKey: 'nav.requests', icon: IconRequests },
      { to: '/teacher/chat', labelKey: 'account.messages', icon: IconChat },
      { to: '/teacher/profile', labelKey: 'account.teacherApproval', icon: IconCheck },
      notifications,
    ];
  }

  return [
    ...profile,
    { to: '/dashboard', labelKey: 'account.studentDashboard', icon: IconDashboard },
    { to: '/dashboard/requests', labelKey: 'account.myRequests', icon: IconRequests },
    { to: '/dashboard/courses', labelKey: 'account.myCourses', icon: IconGraduation },
    { to: '/dashboard/custom-requests', labelKey: 'account.customServices', icon: IconCustomRequests },
    { to: '/dashboard/orders', labelKey: 'account.orders', icon: IconOrders },
    { to: '/dashboard/chat', labelKey: 'account.messages', icon: IconChat },
    notifications,
  ];
}

export function UserAvatar({ size = 36, className = '' }: { size?: number; className?: string }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const [broken, setBroken] = useState(false);

  useEffect(() => setBroken(false), [user?.avatarUrl]);

  const initials = (user?.fullName ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('');

  if (user?.avatarUrl && !broken) {
    return (
      <img
        src={user.avatarUrl}
        alt={t('account.avatarAlt', { name: user.fullName })}
        width={size}
        height={size}
        className={`rounded-full border border-line-gold object-cover ${className}`}
        style={{ width: size, height: size }}
        onError={() => setBroken(true)}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-full border border-line-gold bg-elevated font-bold text-gold-200 ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials || t('account.menuAvatarFallback')}
    </span>
  );
}

export function AccountMenu() {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const nav = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // إظهار تلميح القائمة المنسدلة عند التحويل للشاشة الرئيسية بعد الدخول أو التسجيل
    const pendingSession = sessionStorage.getItem('siraj_account_hint') === 'pending';
    const pendingState = (location.state as { showAccountHint?: boolean } | null)?.showAccountHint;

    if (pendingSession || pendingState) {
      sessionStorage.removeItem('siraj_account_hint');
      setShowHint(true);
    }
  }, [location.state]);

  useEffect(() => {
    if (!open && !showHint) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowHint(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setShowHint(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, showHint]);

  if (!user) return null;

  const items = linksFor(user.role);
  const approval = user.teacherProfile?.status;

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setShowHint(false);
          setOpen((v) => !v);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('account.menu')}
        className={`flex items-center gap-2 rounded-full border py-1 pe-2 ps-1 text-sm transition-all hover:border-line-gold hover:bg-elevated focus:outline-none focus:ring-2 focus:ring-gold-300/40 ${
          showHint ? 'border-gold-400 bg-gold-500/10 shadow-glow' : 'border-line bg-surface/80'
        }`}
      >
        <UserAvatar size={30} />
        <span className="hidden max-w-28 truncate font-semibold text-ink-primary sm:block">{user.fullName}</span>
        <IconChevronDown
          aria-hidden
          className={`hidden size-3.5 text-ink-muted transition-transform sm:block ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* المربع المنبثق التوضيحي بالقرب من القائمة المنسدلة */}
      {showHint && !open && (
        <div
          role="dialog"
          aria-label="تلميح إعدادات الحساب"
          className="absolute end-0 top-full z-[70] mt-3 w-72 sm:w-80 rounded-2xl border border-line-gold/90 bg-surface/95 p-4 text-start shadow-glow backdrop-blur-md animate-fadeUp"
        >
          {/* سهم مؤشر يشير للأعلى إلى زر القائمة */}
          <div
            aria-hidden
            className="absolute -top-1.5 end-6 size-3 rotate-45 border-s border-t border-line-gold/90 bg-surface"
          />

          <div className="relative">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="grid size-7 place-items-center rounded-lg bg-gold-500/20 text-gold-300">
                  <IconSettings className="size-4" />
                </span>
                <span className="font-bold text-sm text-gold-200">
                  إعدادات حسابك ولوحة التحكم
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowHint(false)}
                className="grid size-6 place-items-center rounded-md text-ink-muted hover:bg-elevated hover:text-ink-primary"
                title="إغلاق"
              >
                ✕
              </button>
            </div>

            <p className="mt-2.5 text-xs leading-5 text-ink-secondary">
              إذا أردت المزيد من <b>الإعدادات</b>، أو الانتقال إلى <b>لوحة التحكم</b>، أو <b>الملف الشخصي</b> و<b>المحادثات</b>، اضغط هنا على اسم حسابك في أي وقت.
            </p>

            <div className="mt-3 flex items-center justify-end gap-2 border-t border-line/50 pt-2.5">
              <button
                type="button"
                onClick={() => {
                  setShowHint(false);
                  setOpen(true);
                }}
                className="rounded-lg bg-gold-500/20 px-3 py-1.5 text-xs font-semibold text-gold-300 transition-colors hover:bg-gold-500/30"
              >
                فتح القائمة الآن
              </button>
              <button
                type="button"
                onClick={() => setShowHint(false)}
                className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:bg-elevated hover:text-ink-primary"
              >
                حسناً، فهمت
              </button>
            </div>
          </div>
        </div>
      )}

      {open && (
        <div
          role="menu"
          className="absolute end-0 top-full z-[60] mt-2 w-64 max-w-[calc(100vw-1rem)] overflow-hidden rounded-xl border border-line-gold bg-surface shadow-glow"
        >
          <div className="border-b border-line bg-elevated/40 px-4 py-3">
            <p className="truncate font-bold text-ink-primary">{user.fullName}</p>
            <p className="mt-0.5 truncate font-mono text-[11px] text-ink-muted" dir="ltr">
              @{user.username}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Badge tone="gold">{t(ROLE_LABEL_KEY[user.role] ?? 'role.student')}</Badge>
              {user.role === 'TEACHER' && (
                <Badge tone={approval === 'APPROVED' ? 'ok' : approval === 'REJECTED' ? 'danger' : 'warn'}>
                  {approval === 'APPROVED'
                    ? t('account.approved')
                    : approval === 'REJECTED'
                      ? t('account.rejected')
                      : approval === 'SUSPENDED'
                        ? t('account.suspended')
                        : t('account.pendingApproval')}
                </Badge>
              )}
              {!user.emailVerified && <Badge tone="info">{t('account.emailUnverified')}</Badge>}
            </div>
          </div>

          <nav className="max-h-[60vh] overflow-y-auto p-1.5">
            {items.map((it) => {
              const IconComp = it.icon;
              return (
                <Link
                  key={it.to}
                  to={it.to}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-sm text-ink-secondary transition-colors hover:bg-elevated hover:text-ink-primary"
                >
                  <IconComp className="size-4 shrink-0 text-gold-300/80" />
                  <span>{t(it.labelKey)}</span>
                </Link>
              );
            })}
          </nav>

          <div className="border-t border-line p-1.5">
            <button
              type="button"
              role="menuitem"
              onClick={async () => {
                setOpen(false);
                await logout();
                toast.push('success', t('account.logoutSuccess'));
                nav('/');
              }}
              className="flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-start text-sm text-coral transition-colors hover:bg-danger/10"
            >
              <IconLogout className="size-4 shrink-0 text-coral" />
              <span>{t('common.logout')}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
