import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useI18n, type Lang } from '../i18n';

/**
 * إدارة وسوم SEO بدون مكتبات إضافية.
 * - عنوان ووصف لكل صفحة.
 * - canonical مطلق + hreflang (ar / en / x-default).
 * - Open Graph + Twitter.
 * - JSON-LD منظم.
 * - robots noindex للصفحات الخاصة.
 */

export const SITE_URL = (
  (import.meta.env.VITE_SITE_URL as string | undefined) || 'https://siraj-academy-qhht.vercel.app'
).replace(/\/+$/, '');

export const SITE_NAME = {
  ar: 'أكاديمية سراج التعليمية',
  en: 'Siraj Educational Academy',
} as const;

export const SITE_DESCRIPTION = {
  ar: 'منصة تعليمية سعودية تربط طلبة الجامعات بمدرسين معتمدين: شرح المقررات الجامعية، دورات، طلبات شرح خاصة، وخدمات أكاديمية بأسعار واضحة ودفع آمن.',
  en: 'A Saudi educational platform connecting university students with verified tutors: university course explanations, courses, private explanation requests, and academic services with clear pricing.',
} as const;

const DEFAULT_IMAGE = '/brand/identity-poster.jpg';

export function absoluteUrl(pathname: string): string {
  const clean = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${SITE_URL}${clean}`;
}

/** رابط اللغة: العربية بلا معامل، الإنجليزية بـ ?lang=en */
export function localizedUrl(pathname: string, lang: Lang): string {
  const clean = pathname.split('?')[0].split('#')[0] || '/';
  const base = absoluteUrl(clean);
  return lang === 'en' ? `${base}${base.includes('?') ? '&' : '?'}lang=en` : base;
}

export function truncateMeta(text: string | null | undefined, max = 158): string {
  if (!text) return '';
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length <= max ? normalized : `${normalized.slice(0, max - 1).trimEnd()}…`;
}

type JsonLd = Record<string, unknown>;

export function organizationLd(): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'EducationalOrganization',
    name: SITE_NAME.ar,
    alternateName: SITE_NAME.en,
    url: SITE_URL,
    logo: absoluteUrl('/brand/logo-mark-transparent.png'),
    description: SITE_DESCRIPTION.ar,
    areaServed: 'SA',
    knowsLanguage: ['ar', 'en'],
  };
}

export function websiteLd(): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME.ar,
    alternateName: SITE_NAME.en,
    url: SITE_URL,
    inLanguage: ['ar', 'en'],
    potentialAction: {
      '@type': 'SearchAction',
      target: `${SITE_URL}/courses?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
}

export function breadcrumbLd(items: { name: string; path: string }[]): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function itemListLd(items: { name: string; path: string }[]): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      url: absoluteUrl(item.path),
    })),
  };
}

function upsertMeta(attr: 'name' | 'property', key: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    el.setAttribute('data-seo', '1');
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertLink(rel: string, href: string, hreflang?: string): void {
  const selector = hreflang
    ? `link[rel="${rel}"][hreflang="${hreflang}"]`
    : `link[rel="${rel}"][data-seo="1"]`;
  let el = document.head.querySelector<HTMLLinkElement>(selector);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    if (hreflang) el.setAttribute('hreflang', hreflang);
    else el.setAttribute('data-seo', '1');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

export type SeoProps = {
  title: string;
  description?: string;
  /** الصفحات الخاصة: لوحات التحكم، الطلبات، الدفع، الملفات */
  noindex?: boolean;
  image?: string;
  type?: 'website' | 'article' | 'profile';
  jsonLd?: JsonLd | JsonLd[];
};

export function Seo({ title, description, noindex = false, image, type = 'website', jsonLd }: SeoProps) {
  const { pathname } = useLocation();
  const { lang } = useI18n();

  const fullTitle = title.includes('سراج') || title.includes('Siraj') ? title : `${title} | ${SITE_NAME[lang]}`;
  const desc = truncateMeta(description || SITE_DESCRIPTION[lang]);
  const canonical = localizedUrl(pathname, lang);
  const imageUrl = image ? (image.startsWith('http') ? image : absoluteUrl(image)) : absoluteUrl(DEFAULT_IMAGE);

  useEffect(() => {
    document.title = fullTitle;

    upsertMeta('name', 'description', desc);
    upsertMeta(
      'name',
      'robots',
      noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1',
    );

    upsertMeta('property', 'og:title', fullTitle);
    upsertMeta('property', 'og:description', desc);
    upsertMeta('property', 'og:type', type);
    upsertMeta('property', 'og:url', canonical);
    upsertMeta('property', 'og:image', imageUrl);
    upsertMeta('property', 'og:site_name', SITE_NAME[lang]);
    upsertMeta('property', 'og:locale', lang === 'ar' ? 'ar_SA' : 'en_US');
    upsertMeta('property', 'og:locale:alternate', lang === 'ar' ? 'en_US' : 'ar_SA');

    upsertMeta('name', 'twitter:card', 'summary_large_image');
    upsertMeta('name', 'twitter:title', fullTitle);
    upsertMeta('name', 'twitter:description', desc);
    upsertMeta('name', 'twitter:image', imageUrl);

    // canonical واحد فقط: نحدّث الوسم الثابت في index.html ونحذف أي نسخة مكررة
    const canonicals = document.querySelectorAll<HTMLLinkElement>('link[rel="canonical"]');
    let canonicalEl = canonicals[0];
    if (!canonicalEl) {
      canonicalEl = document.createElement('link');
      canonicalEl.rel = 'canonical';
      document.head.appendChild(canonicalEl);
    }
    canonicalEl.setAttribute('href', canonical);
    canonicalEl.setAttribute('data-seo', '1');
    canonicals.forEach((el, index) => {
      if (index > 0) el.remove();
    });

    upsertLink('alternate', localizedUrl(pathname, 'ar'), 'ar');
    upsertLink('alternate', localizedUrl(pathname, 'en'), 'en');
    upsertLink('alternate', localizedUrl(pathname, 'ar'), 'x-default');

    const scriptId = 'seo-jsonld';
    document.getElementById(scriptId)?.remove();
    if (jsonLd) {
      const nodes = Array.isArray(jsonLd) ? jsonLd : [jsonLd];
      if (nodes.length > 0) {
        const script = document.createElement('script');
        script.id = scriptId;
        script.type = 'application/ld+json';
        script.textContent = JSON.stringify(nodes.length === 1 ? nodes[0] : nodes);
        document.head.appendChild(script);
      }
    }
  }, [fullTitle, desc, canonical, imageUrl, type, noindex, lang, pathname, jsonLd]);

  return null;
}
