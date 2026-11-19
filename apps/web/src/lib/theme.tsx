import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useT } from '../i18n';
import { IconSun, IconMoon } from '../components/icons';

export type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'light';
    try {
      const saved = localStorage.getItem('siraj_theme') as Theme | null;
      // White/light is default as requested
      return saved === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem('siraj_theme', theme);
    } catch {
      // ignore
    }
  }, [theme]);

  const toggleTheme = () => {
    setThemeState((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  const setTheme = (t: Theme) => setThemeState(t);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const t = useT();
  const label = theme === 'dark' ? t('nav.lightMode') : t('nav.darkMode');

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      className={`relative inline-flex size-9 items-center justify-center rounded-[10px] border border-line bg-surface text-ink-primary shadow-sm transition-all duration-200 hover:border-line-gold hover:bg-elevated hover:text-gold-300 focus:outline-none focus:ring-2 focus:ring-gold-300/40 ${className}`}
    >
      {theme === 'dark' ? (
        <IconSun className="size-4.5 text-gold-300 transition-transform duration-300 hover:rotate-45" />
      ) : (
        <IconMoon className="size-4.5 text-gold-300 transition-transform duration-300 hover:-rotate-12" />
      )}
    </button>
  );
}
