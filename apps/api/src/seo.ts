// robots.txt und sitemap.xml mit der öffentlichen Adresse (Caddy leitet /robots.txt und
// /sitemap.xml hierher). Nur öffentliche Seiten, die App selbst wird nicht indexiert.
import type { Hono } from 'hono';
import type { Vars } from './app';

export const PUBLIC_PAGES = [
  '/willkommen',
  '/registrieren',
  '/login',
  '/impressum',
  '/datenschutz',
  '/nutzungsbedingungen',
];

export function registerSeo(app: Hono<Vars>, publicUrl: string) {
  const base = publicUrl.replace(/\/$/, '');
  app.get('/api/seo/robots.txt', (c) =>
    c.text(
      [
        'User-agent: *',
        ...PUBLIC_PAGES.map((p) => `Allow: ${p}`),
        'Allow: /$',
        'Allow: /og.png',
        'Allow: /_expo/',
        'Allow: /icons/',
        'Disallow: /',
        '',
        `Sitemap: ${base}/sitemap.xml`,
        '',
      ].join('\n'),
      200,
      { 'cache-control': 'public, max-age=3600' },
    ),
  );
  app.get('/api/seo/sitemap.xml', (c) =>
    c.body(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ...PUBLIC_PAGES.map((p) => `  <url><loc>${base}${p}</loc></url>`),
        '</urlset>',
        '',
      ].join('\n'),
      200,
      { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' },
    ),
  );
}
