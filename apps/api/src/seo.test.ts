import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import type { Vars } from './app';
import { PUBLIC_PAGES, registerSeo } from './seo';

describe('robots.txt und sitemap.xml', () => {
  const app = new Hono<Vars>();
  registerSeo(app, 'https://fokus.example/');

  it('robots: nur öffentliche Seiten, Verweis auf die Sitemap', async () => {
    const t = await (await app.request('/api/seo/robots.txt')).text();
    expect(t).toContain('Allow: /willkommen');
    expect(t).toContain('Disallow: /');
    expect(t).toContain('Sitemap: https://fokus.example/sitemap.xml');
  });

  it('sitemap: absolute Adressen aller öffentlichen Seiten', async () => {
    const r = await app.request('/api/seo/sitemap.xml');
    expect(r.headers.get('content-type')).toContain('application/xml');
    const t = await r.text();
    for (const p of PUBLIC_PAGES) expect(t).toContain(`<loc>https://fokus.example${p}</loc>`);
    expect(t).not.toContain('example//');
  });
});
