import { Router } from "express";
import { prisma } from "../lib/prisma";

/**
 * robots.txt و sitemap.xml من الخادم — للصفحات الديناميكية التي لا يعرفها build الواجهة.
 * لا تُدرج أي صفحة خاصة أو تتطلب تسجيل دخول.
 */

const router = Router();

function siteUrl(): string {
  return (
    process.env.PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    process.env.APP_BASE_URL ||
    "https://siraj-academy-qhht.vercel.app"
  ).replace(/\/+$/, "");
}

const escapeXml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

type Entry = { path: string; lastmod?: Date | null; changefreq?: string; priority?: string };

function urlBlock(entry: Entry): string {
  const base = siteUrl();
  const ar = `${base}${entry.path}`;
  const en = `${base}${entry.path}${entry.path.includes("?") ? "&" : "?"}lang=en`;
  const alternates = [
    `    <xhtml:link rel="alternate" hreflang="ar" href="${escapeXml(ar)}"/>`,
    `    <xhtml:link rel="alternate" hreflang="en" href="${escapeXml(en)}"/>`,
    `    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(ar)}"/>`,
  ].join("\n");
  const lastmod = entry.lastmod ? `    <lastmod>${entry.lastmod.toISOString()}</lastmod>\n` : "";
  const change = entry.changefreq ? `    <changefreq>${entry.changefreq}</changefreq>\n` : "";
  const priority = entry.priority ? `    <priority>${entry.priority}</priority>\n` : "";

  return [ar, en]
    .map((loc) =>
      [
        "  <url>",
        `    <loc>${escapeXml(loc)}</loc>`,
        alternates,
        lastmod.trimEnd(),
        change.trimEnd(),
        priority.trimEnd(),
        "  </url>",
      ]
        .filter((line) => line !== "")
        .join("\n"),
    )
    .join("\n");
}

const STATIC_ROUTES: Entry[] = [
  { path: "/", changefreq: "daily", priority: "1.0" },
  { path: "/courses", changefreq: "daily", priority: "0.9" },
  { path: "/universities", changefreq: "weekly", priority: "0.8" },
  { path: "/teachers", changefreq: "weekly", priority: "0.8" },
  { path: "/services", changefreq: "weekly", priority: "0.8" },
  { path: "/about", changefreq: "monthly", priority: "0.5" },
  { path: "/faq", changefreq: "monthly", priority: "0.5" },
  { path: "/privacy", changefreq: "yearly", priority: "0.3" },
  { path: "/terms", changefreq: "yearly", priority: "0.3" },
  { path: "/refund", changefreq: "yearly", priority: "0.3" },
];

router.get("/robots.txt", (_req, res) => {
  res.type("text/plain").send(
    [
      "User-agent: *",
      "Allow: /",
      "",
      "Disallow: /dashboard",
      "Disallow: /admin",
      "Disallow: /teacher",
      "Disallow: /account",
      "Disallow: /login",
      "Disallow: /register",
      "Disallow: /forgot-password",
      "Disallow: /reset-password",
      "Disallow: /verify-email",
      "Disallow: /confirm-email-change",
      "Disallow: /recovery",
      "Disallow: /requests/new",
      "Disallow: /requests/custom",
      "Disallow: /requests/",
      "Disallow: /api/",
      "Disallow: /uploads/",
      "Disallow: /files/",
      "",
      `Sitemap: ${siteUrl()}/sitemap.xml`,
      "",
    ].join("\n"),
  );
});

router.get("/sitemap.xml", async (_req, res) => {
  const entries: Entry[] = [...STATIC_ROUTES];

  const [universities, courses, teachers, services] = await Promise.all([
    prisma.university
      .findMany({ where: { isVisible: true }, select: { slug: true } })
      .catch(() => []),
    prisma.course
      .findMany({ where: { isVisible: true }, select: { id: true, updatedAt: true } })
      .catch(() => []),
    prisma.teacherProfile
      .findMany({
        where: { status: "APPROVED" },
        select: { updatedAt: true, user: { select: { username: true } } },
      })
      .catch(() => []),
    prisma.service
      .findMany({ where: { isActive: true }, select: { slug: true, updatedAt: true } })
      .catch(() => []),
  ]);

  for (const row of universities) {
    entries.push({ path: `/universities/${encodeURIComponent(row.slug)}`, changefreq: "weekly", priority: "0.7" });
  }
  for (const row of courses) {
    entries.push({ path: `/courses/${encodeURIComponent(row.id)}`, lastmod: row.updatedAt, changefreq: "weekly", priority: "0.7" });
  }
  for (const row of teachers) {
    if (!row.user?.username) continue;
    entries.push({ path: `/teachers/${encodeURIComponent(row.user.username)}`, lastmod: row.updatedAt, changefreq: "weekly", priority: "0.6" });
  }
  for (const row of services) {
    entries.push({ path: `/services/${encodeURIComponent(row.slug)}`, lastmod: row.updatedAt, changefreq: "monthly", priority: "0.6" });
  }

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...entries.map(urlBlock),
    "</urlset>",
    "",
  ].join("\n");

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.send(xml);
});

export default router;
