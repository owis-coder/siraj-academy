import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        page: 'rgb(var(--color-page) / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        'surface-2': 'rgb(var(--color-surface-2) / <alpha-value>)',
        elevated: 'rgb(var(--color-elevated) / <alpha-value>)',
        line: 'rgb(var(--color-line) / <alpha-value>)',
        'line-gold': 'var(--color-line-gold)',
        ink: {
          primary: 'rgb(var(--color-ink-primary) / <alpha-value>)',
          secondary: 'rgb(var(--color-ink-secondary) / <alpha-value>)',
          muted: 'rgb(var(--color-ink-muted) / <alpha-value>)',
        },
        gold: {
          DEFAULT: 'rgb(var(--color-gold-500) / <alpha-value>)',
          700: '#A97C2F',
          600: '#C08A3B',
          500: 'rgb(var(--color-gold-500) / <alpha-value>)',
          400: 'rgb(var(--color-gold-400) / <alpha-value>)',
          300: 'rgb(var(--color-gold-300) / <alpha-value>)',
          200: 'rgb(var(--color-gold-200) / <alpha-value>)',
          100: '#F3E3C0',
        },
        coral: '#F07159',
        teal: '#2E96A8',
        ok: '#4C9E67',
        danger: '#E1633F',
        warn: '#D9A655',
        cham: '#201D1A',
      },
      fontFamily: {
        sans: ['"IBM Plex Sans Arabic"', 'Tajawal', 'Cairo', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '10px',
        lg: '14px',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        'card-hover': 'var(--shadow-card-hover)',
        glow: 'var(--shadow-glow)',
      },
      keyframes: {
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          from: { backgroundPosition: '200% 0' },
          to: { backgroundPosition: '-200% 0' },
        },
        float: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
      },
      animation: {
        fadeUp: 'fadeUp .45s ease both',
        shimmer: 'shimmer 1.6s linear infinite',
        float: 'float 5s ease-in-out infinite',
      },
      backgroundImage: {
        'gold-grad': 'linear-gradient(135deg, #B98A4E, #EAC87F)',
        'gold-text': 'var(--bg-gold-text, linear-gradient(135deg, #B98A4E, #EAC87F 55%, #F3E3C0))',
      },
    },
  },
  plugins: [],
} as Config;
