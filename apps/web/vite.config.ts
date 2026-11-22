import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const SITE_URL = (process.env.VITE_SITE_URL || 'https://siraj-academy-qhht.vercel.app').replace(/\/+$/, '');

/** صفحات عامة ثابتة تُدرج في sitemap بجانب الصفحات الديناميكية من الخادم */
const PUBLIC_ROUTES: { path: string; changefreq: string; priority: string }[] = [
  { path: '/', changefreq: 'daily', priority: '1.0' },
  { path: '/courses', changefreq: 'daily', priority: '0.9' },
  { path: '/universities', changefreq: 'weekly', priority: '0.8' },
  { path: '/teachers', changefreq: 'weekly', priority: '0.8' },
  { path: '/services', changefreq: 'weekly', priority: '0.8' },
  { path: '/about', changefreq: 'monthly', priority: '0.5' },
  { path: '/faq', changefreq: 'monthly', priority: '0.5' },
  { path: '/privacy', changefreq: 'yearly', priority: '0.3' },
  { path: '/terms', changefreq: 'yearly', priority: '0.3' },
  { path: '/refund', changefreq: 'yearly', priority: '0.3' },
];

const escapeXml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function sitemapEntry(path: string, changefreq: string, priority: string): string {
  const ar = `${SITE_URL}${path}`;
  const en = `${SITE_URL}${path}${path.includes('?') ? '&' : '?'}lang=en`;
  return [
    '  <url>',
    `    <loc>${escapeXml(ar)}</loc>`,
    `    <xhtml:link rel="alternate" hreflang="ar" href="${escapeXml(ar)}"/>`,
    `    <xhtml:link rel="alternate" hreflang="en" href="${escapeXml(en)}"/>`,
    `    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(ar)}"/>`,
    `    <changefreq>${changefreq}</changefreq>`,
    `    <priority>${priority}</priority>`,
    '  </url>',
    '  <url>',
    `    <loc>${escapeXml(en)}</loc>`,
    `    <xhtml:link rel="alternate" hreflang="ar" href="${escapeXml(ar)}"/>`,
    `    <xhtml:link rel="alternate" hreflang="en" href="${escapeXml(en)}"/>`,
    `    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(ar)}"/>`,
    `    <changefreq>${changefreq}</changefreq>`,
    `    <priority>${priority}</priority>`,
    '  </url>',
  ].join('\n');
}

function buildSitemap(): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...PUBLIC_ROUTES.map((r) => sitemapEntry(r.path, r.changefreq, r.priority)),
    '</urlset>',
    '',
  ].join('\n');
}

function buildRobots(): string {
  return [
    'User-agent: *',
    'Allow: /',
    '',
    '# لوحات التحكم والحسابات — محمية من الخادم، ومسموح بفهرسة الصفحات العامة فقط',
    'Disallow: /dashboard',
    'Disallow: /admin',
    'Disallow: /teacher',
    'Disallow: /account',
    'Disallow: /login',
    'Disallow: /register',
    'Disallow: /forgot-password',
    'Disallow: /reset-password',
    'Disallow: /verify-email',
    'Disallow: /confirm-email-change',
    'Disallow: /recovery',
    'Disallow: /requests/new',
    'Disallow: /requests/custom',
    'Disallow: /requests/',
    'Disallow: /api/',
    'Disallow: /uploads/',
    'Disallow: /files/',
    '',
    `Sitemap: ${SITE_URL}/sitemap.xml`,
    '',
  ].join('\n');
}

/** يراجع روابط الموقع في HTML ويولّد robots.txt وsitemap.xml */
function seoAssets(): Plugin {
  return {
    name: 'siraj-seo-assets',
    // pre: الاستبدال قبل معالجة Vite لروابط HTML حتى لا يُضاف "/" أمام الرابط المطلق
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return html.replaceAll('__SITE_URL__', SITE_URL);
      },
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url || '').split('?')[0];
        if (url === '/robots.txt') {
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.end(buildRobots());
          return;
        }
        if (url === '/sitemap.xml') {
          res.setHeader('Content-Type', 'application/xml; charset=utf-8');
          res.end(buildSitemap());
          return;
        }
        next();
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: buildRobots() });
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: buildSitemap() });
    },
  };
}

export default defineConfig({
  plugins: [react(), seoAssets()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      '/uploads': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
  build: { outDir: 'dist', sourcemap: false },
});
