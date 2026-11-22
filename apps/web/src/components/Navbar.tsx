import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { Button } from './ui';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { ThemeToggle, useTheme } from '../lib/theme';
import { AccountMenu } from './AccountMenu';
import { LocaleToggle } from './LocaleToggle';
import { useI18n } from '../i18n';
import { IconSearch, IconUniversities, IconCourses, IconUser } from './icons';
import logoPureTransparent from '/brand/logo-mark-pure-transparent.png';
import logoLockupDark from '/brand/logo-lockup-dark.png';
import logoLockupLight from '/brand/logo-lockup-light.png';

export function LogoMark({ className = 'size-9' }: { className?: string }) {
  const { t } = useI18n();
  return <img src={logoPureTransparent} alt={t('nav.logoAlt')} className={className} />;
}

const NAV = [
  { to: '/', labelKey: 'nav.home' },
  { to: '/courses', labelKey: 'nav.courses' },
  { to: '/teachers', labelKey: 'nav.teachers' },
  { to: '/requests', labelKey: 'nav.requests' },
  { to: '/services', labelKey: 'nav.services' },
];

export function Navbar() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const { t } = useI18n();
  const nav = useNavigate();
  const logoLockup = theme === 'dark' ? logoLockupDark : logoLockupLight;
  const [q, setQ] = useState('');
  const [scope, setScope] = useState('courses');
  const [openMenu, setOpenMenu] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpenMenu(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const results = useMegaSearch(openMenu ? q : '');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    if (scope === 'universities') nav(`/universities?q=${encodeURIComponent(q)}`);
    else if (scope === 'teachers') nav(`/teachers?q=${encodeURIComponent(q)}`);
    else nav(`/courses?q=${encodeURIComponent(q)}`);
    setOpenMenu(false);
  };

  return (
    <header className="sticky top-0 z-50 border-b border-line/70 glass">
      <div className="container-x flex h-16 items-center gap-3">
        <Link to="/" className="flex shrink-0 items-center" aria-label={t('common.appNameFull')}>
          <img src={logoLockup} alt={t('nav.lockupAlt')} width={3000} height={3050} decoding="async" className="h-10 w-auto" />
        </Link>

        <nav className="hidden items-center gap-1 text-sm font-medium lg:flex">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'}
              className={({ isActive }) => `rounded-md px-3 py-2 transition-colors ${isActive ? 'text-gold-200' : 'text-ink-secondary hover:text-ink-primary'}`}>
              {t(n.labelKey)}
            </NavLink>
          ))}
        </nav>

        {/* بحث شامل */}
        <div ref={boxRef} className="relative ms-auto hidden min-w-0 flex-1 max-w-md md:block">
          <form onSubmit={submit} className="flex">
            <select
              aria-label={t('nav.searchScope')}
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              className="rounded-s-[10px] border border-e-0 border-line bg-elevated/70 px-2 text-xs text-ink-muted focus:outline-none"
            >
              <option value="courses">{t('nav.scopeCourses')}</option>
              <option value="universities">{t('nav.scopeUniversities')}</option>
              <option value="teachers">{t('nav.scopeTeachers')}</option>
            </select>
            <input
              value={q}
              onChange={(e) => { setQ(e.target.value); setOpenMenu(true); }}
              onFocus={() => setOpenMenu(true)}
              placeholder={t('nav.searchPlaceholder')}
              className="w-full rounded-e-[10px] border border-s-0 border-line bg-elevated/70 px-3 py-2 text-sm placeholder:text-ink-muted/70 focus:outline-none"
            />
          </form>
          {openMenu && results.q && (
            <div className="absolute inset-x-0 top-full mt-2 overflow-hidden rounded-lg border border-line bg-surface p-2 shadow-glow">
              {results.loading && <p className="px-3 py-4 text-center text-xs text-ink-muted">{t('common.searching')}</p>}
              {!results.loading && results.courses.length === 0 && results.teachers.length === 0 && results.universities.length === 0 && (
                <p className="px-3 py-4 text-center text-xs text-ink-muted">{t('common.noResults')}</p>
              )}
              {results.universities.map((u) => (
                <Link key={u.id} to={`/universities/${u.slug}`} onClick={() => setOpenMenu(false)} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-elevated">
                  <IconUniversities className="size-4 shrink-0 text-gold-300" />
                  <span className="truncate">{u.name}</span>
                  <span className="ms-auto text-xs text-ink-muted">{t('nav.scopeUniversities')}</span>
                </Link>
              ))}
              {results.courses.map((c) => (
                <Link key={c.id} to={`/courses/${c.id}`} onClick={() => setOpenMenu(false)} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-elevated">
                  <IconCourses className="size-4 shrink-0 text-gold-300" />
                  <span className="truncate">{c.title}</span>
                  <span className="ms-auto text-xs text-ink-muted">{c.code}</span>
                </Link>
              ))}
              {results.teachers.map((t2) => (
                <Link key={t2.id} to={`/teachers/${t2.username}`} onClick={() => setOpenMenu(false)} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-elevated">
                  <IconUser className="size-4 shrink-0 text-gold-300" />
                  <span className="truncate">{t2.fullName}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="ms-auto flex items-center gap-2 md:ms-0">
          <LocaleToggle compact />
          <ThemeToggle />
          {user ? (
            <AccountMenu />
          ) : (
            <>
              <Link to="/login" className="hidden sm:block"><Button variant="ghost" size="sm">{t('common.login')}</Button></Link>
              <Link to="/register"><Button size="sm">{t('nav.startNow')}</Button></Link>
            </>
          )}
        </div>
      </div>

      {/* شريط سفري للجوال */}
      <nav className="container-x flex gap-1 overflow-x-auto pb-2 text-xs lg:hidden">
        {NAV.concat([{ to: '/universities', labelKey: 'nav.universities' }]).map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'}
            className={({ isActive }) => `shrink-0 rounded-md px-3 py-1.5 ${isActive ? 'bg-elevated text-gold-200' : 'text-ink-secondary'}`}>
            {t(n.labelKey)}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}

function useMegaSearch(q: string) {
  const [state, setState] = useState<{
    q: string;
    loading: boolean;
    courses: import('../lib/api').Course[];
    universities: import('../lib/api').University[];
    teachers: { id: string; username: string; fullName: string }[];
  }>({ q: '', loading: false, courses: [], universities: [], teachers: [] });
  const token = useRef(0);

  useEffect(() => {
    if (!q || q.trim().length < 2) { setState((s) => ({ ...s, q, loading: false, courses: [], universities: [], teachers: [] })); return; }
    const my = ++token.current;
    setState((s) => ({ ...s, q, loading: true }));
    const t = setTimeout(async () => {
      try {
        const [c, u, t2] = await Promise.all([
          api.courses.list({ q, pageSize: 5 }),
          api.universities.list(q),
          api.teachers.list({ q, pageSize: 5 }),
        ]);
        if (token.current !== my) return;
        setState({ q, loading: false, courses: (c.data ?? []).slice(0, 4), universities: (u.data ?? []).slice(0, 3), teachers: ((t2.data ?? []) as { id: string; username: string; fullName: string }[]) });
      } catch {
        if (token.current !== my) return;
        setState({ q, loading: false, courses: [], universities: [], teachers: [] });
      }
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return state;
}
