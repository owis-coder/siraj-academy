import type { ComponentType } from 'react';
import { Outlet, NavLink, NavLinkProps, useNavigate, useLocation } from 'react-router-dom';
import { Navbar } from './Navbar';
import { Footer } from './Footer';
import { useAuth } from '../lib/auth';
import { RoleRoute } from './guards';
import { LogoMark } from './Navbar';
import { Badge } from './ui';
import { ThemeToggle } from '../lib/theme';
import { LocaleToggle } from './LocaleToggle';
import { useI18n } from '../i18n';
import { Seo } from '../lib/seo';
import type { Role } from '../lib/api';
import {
  IconDashboard,
  IconOrders,
  IconCourses,
  IconRequests,
  IconCustomRequests,
  IconChat,
  IconStar,
  IconNotifications,
  IconUser,
  IconSettings,
  IconMegaphone,
  IconLive,
  IconWallet,
  IconIdCard,
  IconUniversities,
  IconColleges,
  IconMajors,
  IconServices,
  IconTeachers,
  IconPayments,
  IconBroadcast,
  IconSecurity,
  IconAudit,
  IconArrowBack,
  IconProfile,
  IconGraduation,
} from './icons';

export function PublicLayout() {
  return (
    <div className="flex min-h-screen min-h-dvh flex-col">
      <Navbar />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

/* ============ لوحات التحكم ============ */

type NavItem = { to: string; labelKey: string; icon: ComponentType<{ className?: string }> };

const NAVS: Record<Role, NavItem[]> = {
  STUDENT: [
    { to: '/dashboard', labelKey: 'dash.overview', icon: IconDashboard },
    { to: '/dashboard/orders', labelKey: 'dash.orders', icon: IconOrders },
    { to: '/dashboard/refunds', labelKey: 'dash.refunds', icon: IconWallet },
    { to: '/dashboard/courses', labelKey: 'dash.myCourses', icon: IconCourses },
    { to: '/dashboard/requests', labelKey: 'dash.requests', icon: IconRequests },
    { to: '/dashboard/custom-requests', labelKey: 'dash.customRequests', icon: IconCustomRequests },
    { to: '/dashboard/chat', labelKey: 'dash.chats', icon: IconChat },
    { to: '/dashboard/favorites', labelKey: 'dash.favorites', icon: IconStar },
    { to: '/dashboard/notifications', labelKey: 'dash.notifications', icon: IconNotifications },
    { to: '/dashboard/profile', labelKey: 'dash.profile', icon: IconUser },
    { to: '/account/settings', labelKey: 'dash.settings', icon: IconSettings },
  ],
  TEACHER: [
    { to: '/teacher', labelKey: 'dash.overview', icon: IconDashboard },
    { to: '/teacher/offerings', labelKey: 'dash.teacherOfferings', icon: IconGraduation },
    { to: '/teacher/requests', labelKey: 'dash.availableRequests', icon: IconRequests },
    { to: '/teacher/live', labelKey: 'dash.live', icon: IconLive },
    { to: '/teacher/earnings', labelKey: 'dash.earnings', icon: IconWallet },
    { to: '/teacher/chat', labelKey: 'dash.chats', icon: IconChat },
    { to: '/teacher/files', labelKey: 'dash.myFiles', icon: IconOrders },
    { to: '/teacher/profile', labelKey: 'dash.professionalProfile', icon: IconProfile },
    { to: '/account/settings', labelKey: 'dash.settings', icon: IconSettings },
    { to: '/account/profile', labelKey: 'dash.profile', icon: IconIdCard },
  ],
  ADMIN: [
    { to: '/admin', labelKey: 'dash.overview', icon: IconDashboard },
    { to: '/admin/users', labelKey: 'dash.usersManagement', icon: IconTeachers },
    { to: '/admin/chat', labelKey: 'dash.supportChats', icon: IconChat },
    { to: '/admin/universities', labelKey: 'dash.universities', icon: IconUniversities },
    { to: '/admin/colleges', labelKey: 'dash.colleges', icon: IconColleges },
    { to: '/admin/majors', labelKey: 'dash.majors', icon: IconMajors },
    { to: '/admin/courses', labelKey: 'dash.catalogCourses', icon: IconCourses },
    { to: '/admin/services', labelKey: 'dash.servicesCatalog', icon: IconServices },
    { to: '/admin/offerings', labelKey: 'dash.offeringsReview', icon: IconGraduation },
    { to: '/admin/review', labelKey: 'dash.reviewCenter', icon: IconAudit },
    { to: '/admin/teachers', labelKey: 'dash.teachers', icon: IconTeachers },
    { to: '/admin/requests', labelKey: 'dash.requests', icon: IconRequests },
    { to: '/admin/custom-requests', labelKey: 'dash.customServices', icon: IconCustomRequests },
    { to: '/admin/payments', labelKey: 'dash.paymentReceipts', icon: IconPayments },
    { to: '/admin/storage', labelKey: 'dash.fileStorage', icon: IconOrders },
    { to: '/admin/orders', labelKey: 'dash.financialOrders', icon: IconOrders },
    { to: '/admin/refunds', labelKey: 'dash.adminRefunds', icon: IconWallet },
    { to: '/admin/withdrawals', labelKey: 'dash.adminWithdrawals', icon: IconPayments },
    { to: '/admin/ads', labelKey: 'dash.adsModeration', icon: IconMegaphone },
    { to: '/admin/notifications', labelKey: 'dash.broadcast', icon: IconBroadcast },
    { to: '/admin/settings', labelKey: 'dash.platformSettings', icon: IconSettings },
    { to: '/admin/security', labelKey: 'dash.securityCenter', icon: IconSecurity },
    { to: '/admin/audit', labelKey: 'dash.auditLog', icon: IconAudit },
  ],
};

const ROLE_TITLE_KEY: Record<Role, string> = {
  STUDENT: 'layout.studentDashboard',
  TEACHER: 'layout.teacherDashboard',
  ADMIN: 'layout.adminDashboard',
};

function Item({ item, onClick }: { item: NavItem; onClick?: NavLinkProps['onClick'] }) {
  const { t } = useI18n();
  const IconComp = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.to === '/dashboard' || item.to === '/teacher' || item.to === '/admin'}
      onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-sm transition-colors ${
          isActive ? 'bg-elevated font-semibold text-gold-200 shadow-glow' : 'text-ink-secondary hover:bg-elevated/60 hover:text-ink-primary'
        }`
      }
    >
      <IconComp className="size-4 shrink-0 text-gold-300/80" />
      <span>{t(item.labelKey)}</span>
    </NavLink>
  );
}

function DashboardShell({ role }: { role: Role }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const nav = useNavigate();
  const loc = useLocation();
  const items = NAVS[role];

  return (
    <RoleRoute role={role}>
      <Seo
        title={t(ROLE_TITLE_KEY[role])}
        description="لوحة تحكم خاصة في أكاديمية سراج — غير مخصصة للفهرسة. Private dashboard."
        noindex
      />
      <div className="flex min-h-screen min-h-dvh">
        {/* Sidebar */}
        <aside className="sticky top-0 hidden h-screen h-dvh w-64 shrink-0 flex-col overflow-y-auto border-e border-line bg-surface/70 p-4 lg:flex">
          <div className="mb-6 flex items-center justify-between gap-2">
            <button onClick={() => nav('/')} className="flex items-center gap-2.5 text-start">
              <LogoMark className="size-9" />
              <span>
                <span className="block text-sm font-bold text-ink-primary">{t('common.appName')}</span>
                <span className="block text-[11px] text-ink-muted">{t(ROLE_TITLE_KEY[role])}</span>
              </span>
            </button>
          </div>
          <div className="mb-3 flex items-center gap-2">
            <LocaleToggle compact />
            <ThemeToggle />
          </div>
          <nav className="flex-1 space-y-1 overflow-y-auto">
            {items.map((it) => (
              <Item key={it.to} item={it} />
            ))}
          </nav>
          {user && (
            <div className="mt-3 rounded-lg border border-line bg-elevated/50 p-3 text-xs">
              <p className="font-semibold text-ink-primary">{user.fullName}</p>
              <p className="mt-0.5 text-ink-muted" dir="ltr">@{user.username}</p>
              {user.role === 'TEACHER' && (
                <Badge tone={user.teacherProfile?.status === 'APPROVED' ? 'ok' : 'warn'} className="mt-2">
                  {user.teacherProfile?.status === 'APPROVED' ? t('layout.teacherActive') : t('layout.teacherPending')}
                </Badge>
              )}
            </div>
          )}
          <button onClick={() => nav('/')} className="mt-3 flex items-center gap-2 rounded-[10px] px-3 py-2.5 text-start text-sm text-ink-muted transition-colors hover:text-ink-primary">
            <IconArrowBack className="size-4 shrink-0" />
            <span>{t('layout.backToSite')}</span>
          </button>
        </aside>

        {/* Mobile top bar + drawer */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="sticky top-0 z-40 flex items-center gap-2 border-b border-line glass p-3 lg:hidden">
            <LogoMark className="size-8" />
            <span className="text-sm font-bold">{t(ROLE_TITLE_KEY[role])}</span>
            <select
              aria-label={t('nav.quickJump')}
              className="input-base ms-auto max-w-40 text-xs"
              value={loc.pathname}
              onChange={(e) => nav(e.target.value)}
            >
              {items.map((it) => (
                <option key={it.to} value={it.to}>{t(it.labelKey)}</option>
              ))}
            </select>
            <LocaleToggle compact />
            <ThemeToggle />
          </div>
          <main className="flex-1 p-4 sm:p-6 lg:p-8">
            <Outlet />
          </main>
        </div>
      </div>
    </RoleRoute>
  );
}

export function StudentLayout() {
  return <DashboardShell role="STUDENT" />;
}
export function TeacherLayout() {
  return <DashboardShell role="TEACHER" />;
}
export function AdminLayout() {
  return <DashboardShell role="ADMIN" />;
}
