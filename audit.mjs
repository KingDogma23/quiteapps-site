#!/usr/bin/env node
/**
 * SEO / structure audit of dist/.
 *
 *   node build.mjs && node audit.mjs
 *
 * Exits non-zero if anything fails, so it can gate a deploy.
 */

import { readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const DIST = join(ROOT, 'dist');
const site = JSON.parse(readFileSync(join(ROOT, 'data/site.json'), 'utf8'));
const exts = JSON.parse(readFileSync(join(ROOT, 'data/extensions.json'), 'utf8')).extensions;

const PAGES = [
  'index.html',
  ...exts.map(x => `extensions/${x.slug}/index.html`),
  'contact/index.php',
  'privacy/index.html',
  '404.html',
];

let failures = 0;
const read = (f) => readFileSync(join(DIST, f), 'utf8');
const plain = (s) => String(s).replace(/&amp;/g, '&').replace(/&mdash;/g, '—');
const ok = (pass, label, detail = '') => {
  if (!pass) failures++;
  console.log(`  ${pass ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${label}${detail ? `  \x1b[2m${detail}\x1b[0m` : ''}`);
};
const head = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);

/* ------------------------------------------------------------- per page */
head('Per page');
for (const p of PAGES) {
  const h = read(p);
  const noindex = h.includes('noindex');
  const title = plain((h.match(/<title>(.*?)<\/title>/) || [])[1] || '');
  const desc = plain((h.match(/name="description" content="(.*?)"/) || [])[1] || '');
  const h1s = (h.match(/<h1[^>]*>/g) || []).length;
  const levels = [...h.matchAll(/<h([1-6])/g)].map(m => +m[1]);
  let ordered = true;
  for (let i = 1; i < levels.length; i++) if (levels[i] - levels[i - 1] > 1) ordered = false;

  console.log(`\n  \x1b[1m${p}\x1b[0m  \x1b[2m${Math.round(statSync(join(DIST, p)).size / 1024)} kB${noindex ? ', noindex' : ''}\x1b[0m`);
  ok(title.length >= 15 && title.length <= 62, `title ${title.length} chars`, title);
  ok(desc.length >= 70 && desc.length <= 160, `description ${desc.length} chars`);
  ok(h1s === 1, 'exactly one h1', `${h1s}`);
  ok(ordered, 'headings never skip a level', `[${levels.join(',')}]`);
  ok(h.includes('rel="canonical"'), 'canonical');
  ok(h.includes('name="robots"'), 'robots directive');
  ok(/<html lang="en-GB">/.test(h), 'lang="en-GB"');
  ok(h.includes('application/ld+json'), 'structured data');
  ok(!noindex ? h.includes('og:image') : true, 'og:image');
  ok((h.match(/<img (?![^>]*alt=|[^>]*<\?)/g) || []).length === 0, 'every <img> has alt');
  ok((h.match(/role="img"(?![^>]*aria-label)/g) || []).length === 0, 'every role=img is labelled');
}

/* --------------------------------------------------- structured data */
head('Structured data');
const REQUIRED = {
  SoftwareApplication: ['name', 'url', 'description', 'applicationCategory',
    'operatingSystem', 'offers', 'publisher', 'softwareVersion'],
  Organization: ['name', 'url', 'description', 'contactPoint'],
  WebSite: ['url', 'name', 'publisher'],
  BreadcrumbList: ['itemListElement'],
  FAQPage: ['mainEntity'],
  ItemList: ['itemListElement'],
};
for (const p of PAGES) {
  const raw = read(p).match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  let graph;
  try { const j = JSON.parse(raw[1]); graph = j['@graph'] || [j]; }
  catch { ok(false, `${p} — JSON-LD does not parse`); continue; }
  for (const node of graph) {
    const req = REQUIRED[node['@type']];
    if (!req) continue;
    const missing = req.filter(k => node[k] === undefined);
    ok(missing.length === 0, `${p} — ${node['@type']}`, missing.length ? `missing ${missing.join(', ')}` : '');
    if (node['@type'] === 'SoftwareApplication') {
      const o = node.offers || {};
      ok(o.price !== undefined && !!o.priceCurrency && !!o.availability, '  offers complete');
      // Fabricated review markup is a manual-action risk.
      ok(!node.aggregateRating, '  no aggregateRating unless real Web Store data');
    }
  }
}

/* --------------------------------------------------------- site files */
head('Site files');
for (const f of ['sitemap.xml', 'robots.txt', 'llms.txt', 'favicon.svg',
                 'apple-touch-icon.png', '.htaccess', 'styles.css'])
  ok(existsSync(join(DIST, f)), f);

const sm = read('sitemap.xml');
const locs = [...sm.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]);
ok(locs.length === exts.length + 3, `sitemap lists ${locs.length} urls`);  // home, contact, privacy
ok(locs.every(l => l.startsWith(site.url + '/')), 'all sitemap urls on the canonical host');
ok(!locs.some(l => l.includes('404')), '404 excluded from sitemap');
ok(read('robots.txt').includes('Sitemap:'), 'robots.txt points at the sitemap');

/* ----------------------------------------------------- internal links */
head('Links');
let refs = 0, broken = 0;
for (const p of PAGES) {
  for (const m of read(p).matchAll(/(?:href|src)="(\/[^"#?]*)/g)) {
    refs++;
    // A directory may be served by index.html or index.php.
    const hit = m[1].endsWith('/')
      ? ['index.html', 'index.php'].some(f => existsSync(join(DIST, m[1], f)))
      : existsSync(join(DIST, m[1]));
    if (!hit) { broken++; console.log(`    broken: ${m[1]} in ${p}`); }
  }
}
ok(broken === 0, `${refs} internal references resolve`);

/* ------------------------------------------------------- performance */
head('Performance');
const all = PAGES.map(read);
ok(!all.some(h => /fonts\.(googleapis|gstatic)/.test(h)), 'no external font requests');
ok(!all.some(h => /<script[^>]+src="https?:/.test(h)), 'no third-party scripts');
// Only stylesheets — a canonical <link> legitimately carries an absolute URL.
ok(!all.some(h => /<link[^>]+rel="stylesheet"[^>]*href="https?:|<link[^>]+href="https?:[^"]*"[^>]*rel="stylesheet"/.test(h)),
   'no third-party stylesheets');
const biggest = Math.max(...PAGES.map(p => statSync(join(DIST, p)).size));
ok(biggest < 80 * 1024, `largest page ${Math.round(biggest / 1024)} kB`);

console.log(failures === 0
  ? '\n\x1b[32mAll checks passed.\x1b[0m\n'
  : `\n\x1b[31m${failures} check(s) failed.\x1b[0m\n`);
process.exit(failures === 0 ? 0 : 1);
