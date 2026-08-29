#!/usr/bin/env node
/**
 * Quite Apps — static site generator.  Style guide: apple.com.
 *
 *   node build.mjs
 *
 * Reads data/site.json + data/extensions.json and writes dist/, ready to
 * upload to 20i. Add, remove or edit an extension in data/extensions.json and
 * every page, the sitemap and all structured data regenerate. No dependencies.
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const DIST = join(ROOT, 'dist');
const OGSRC = join(ROOT, '.ogsrc');

const site = JSON.parse(readFileSync(join(ROOT, 'data/site.json'), 'utf8'));
const exts = JSON.parse(readFileSync(join(ROOT, 'data/extensions.json'), 'utf8')).extensions;
// Kept in the order the file gives, newest first: an editor reading the JSON
// sees the same order as the page, and a post cannot be silently reordered by
// a date typo.
const news = existsSync(join(ROOT, 'data/news.json'))
  ? JSON.parse(readFileSync(join(ROOT, 'data/news.json'), 'utf8')).posts || []
  : [];
const latestNewsFor = (slug) => news.find(p => p.ext === slug) || null;
const BASE = site.url.replace(/\/+$/, '');

/* ---------------------------------------------------------------- utils */

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const abs = (p) => BASE + p;
const pad2 = (n) => String(n).padStart(2, '0');
const write = (rel, body) => {
  const full = join(DIST, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, body);
};

/** Mix a hex colour toward white (amt > 0) or black (amt < 0). */
function shade(hex, amt) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  const to = amt > 0 ? 255 : 0, t = Math.abs(amt);
  const ch = (sh) => Math.round(((n >> sh) & 255) * (1 - t) + to * t);
  return '#' + [16, 8, 0].map(sh => pad2(ch(sh).toString(16))).join('');
}

const accentOf = (x) => x.accent || site.accent;
const accentDark = (x) => shade(accentOf(x), 0.42);
const themeVars = (x) => `--a:${accentOf(x)};--a-dark:${accentDark(x)}`;

const fmtDate = (iso) => iso
  ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
      .format(new Date(iso + 'T12:00:00Z'))
  : '';

/* ------------------------------------------------------------------ svg */

let uid = 0;

/** The Quite mark: a ring with a tail crossing it at 45 degrees, in the product
 *  accent on its dark ground. Same mark for both extensions — colour is the only
 *  difference. Geometry matches the shipped extension icons exactly. */
function icon(x, cls = 'icon', px = 56) {
  const a = accentOf(x);
  const ground = x.ground || '#14201b';
  return `<svg class="${cls}" viewBox="0 0 48 48" width="${px}" height="${px}" role="img" aria-label="${esc(x.name)} icon">
  <rect class="icon__tile" width="48" height="48" rx="10.56" fill="${ground}"/>
  <g fill="none" stroke="${a}" stroke-width="5.52">
    <circle cx="24" cy="24" r="11.52"/>
    <path d="M26.04 26.04 33.61 33.61"/>
  </g>
</svg>`;
}

const CUP = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true" style="flex:none"><path d="M4 8h13v6.5A5.5 5.5 0 0 1 11.5 20h-2A5.5 5.5 0 0 1 4 14.5z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M17 9.5h1.75a2.75 2.75 0 0 1 0 5.5H17" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M8 2.5v2.2M12 2.5v2.2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`;
const CHEV = '<span aria-hidden="true">&rsaquo;</span>';
const RSS_ICON = '<svg class="rss" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">'
  + '<circle cx="3" cy="13" r="2"/>'
  + '<path d="M1 8.5a6.5 6.5 0 0 1 6.5 6.5h2.6A9.1 9.1 0 0 0 1 5.9z"/>'
  + '<path d="M1 3.4A11.6 11.6 0 0 1 12.6 15h2.6A14.2 14.2 0 0 0 1 .8z"/></svg>';

/** The extension's own popup, drawn to scale — icon, master toggle, all-time
 *  stats and the option list. This is the product shot. */
function popupMock(x) {
  // Two shapes, one set of metrics. The toggle products (YouTube, Facebook)
  // put a master switch above the counters; Cookies puts the site it is looking
  // at there instead, because it has no master switch — it does nothing until
  // you press the button. Everything else — header, counters box, row rhythm —
  // is shared, which is what keeps the three looking like one family.
  const list = x.popupStyle === 'list';
  const opts = x.options || [];
  const master = opts[0] || { name: 'Protection' };
  const rows = x.popupRows
    ? x.popupRows.slice(0, 5)
    : opts.slice(1, 6).map(o => ({ name: o.name, what: o.what, on: String(o.default).toLowerCase() === 'on' }));
  const stats = (x.stats || []).slice(0, 3);
  const a = accentOf(x);
  const clip = (t, n) => (t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t);
  const GREEN = '#34C759';

  const ROW_H = 47, ROW_TOP = 272;
  const rowsEnd = ROW_TOP + rows.length * ROW_H + 6;   // last sub-label sits ~27 below row top
  const panelEnd = rowsEnd + (list ? 52 : 0);          // room for the primary button
  const panelH = panelEnd - 50;
  const canvasH = panelEnd - 42;

  // Columns are spaced evenly inside the stats box, and the numerals step down a
  // size when the values are long, so a 5-digit count reads the same as a 2-digit
  // one instead of crowding its neighbours.
  const BOX_X = 72, BOX_W = 312;
  const longest = stats.reduce((m, st) => Math.max(m, String(st.value).length), 0);
  const statSize = longest > 4 ? 21 : longest > 3 ? 23 : 25;
  const statCols = stats.map((st, i) => {
    const cx = BOX_X + (BOX_W / stats.length) * (i + 0.5);
    return `<text class="pm-stat" x="${cx}" y="216" text-anchor="middle"
      style="font-size:${statSize}px">${esc(st.value)}</text>
    <text class="pm-statlab" x="${cx}" y="234" text-anchor="middle">${esc(clip(st.label, 19))}</text>`;
  }).join('');

  const optRows = rows.map((o, i) => {
    const y = ROW_TOP + i * ROW_H;
    const on = !!o.on;
    return `<rect x="76" y="${y}" width="15" height="15" rx="3.5"
        fill="${on ? GREEN : 'none'}" stroke="${on ? GREEN : 'var(--mock-line)'}" stroke-width="1.3"/>
      ${on ? `<path d="m79.5 ${y + 7.6} 2.8 3 5.2-5.6" fill="none" stroke="#fff" stroke-width="1.8"
        stroke-linecap="round" stroke-linejoin="round"/>` : ''}
      <text class="pm-opt" x="102" y="${y + 12}">${esc(clip(o.name, 30))}</text>
      <text class="pm-sub" x="102" y="${y + 27}">${esc(clip(o.what, 52))}</text>`;
  }).join('');

  // The band between the header and the counters.
  const band = list
    ? `<text class="pm-opt" x="76" y="130">${esc(x.popupSite || 'this site')}</text>
  <text class="pm-sub" x="76" y="147">${esc(x.popupSub || '')}</text>`
    : `<text class="pm-opt" x="76" y="130">${esc(master.name.replace(/\s+on$/i, ''))} on</text>
  <text class="pm-sub" x="76" y="147">${esc(x.popupSub || 'Running on this page')}</text>
  <rect x="336" y="118" width="46" height="26" rx="13" fill="${GREEN}"/>
  <circle cx="369" cy="131" r="10.5" fill="#fff"/>`;

  const action = list && x.popupAction
    ? `<rect x="76" y="${rowsEnd + 4}" width="304" height="34" rx="9" fill="${a}"/>
  <text class="pm-btn" x="228" y="${rowsEnd + 26}" text-anchor="middle">${esc(x.popupAction)}</text>`
    : '';

  const label = list
    ? `The ${esc(x.name)} popup, showing the site it is looking at, all-time counts and the cookies it found`
    : `The ${esc(x.name)} popup, showing the master toggle, all-time counts and every option`;

  return `<div class="pop-frame" style="${themeVars(x)}">
<svg viewBox="0 0 420 ${canvasH}" role="img" aria-label="${label}">
  <!-- popup panel — shifted so the panel itself is centred on the canvas -->
  <g transform="translate(-18 -42)">
  <rect x="56" y="50" width="344" height="${panelH}" rx="15" fill="var(--mock-bg)" stroke="var(--mock-line)"/>

  <rect x="76" y="66" width="24" height="24" rx="5.28" fill="${x.ground || '#14201b'}"/>
  <g transform="translate(76 66) scale(.5)" fill="none" stroke="${a}" stroke-width="5.52">
    <circle cx="24" cy="24" r="11.52"/><path d="M26.04 26.04 33.61 33.61"/>
  </g>
  <text class="pm-name" x="110" y="83">${esc(x.name)}</text>
  <line x1="56" y1="104" x2="400" y2="104" stroke="var(--mock-line)"/>

  ${band}

  <rect x="72" y="166" width="312" height="82" rx="10" fill="var(--mock)" fill-opacity=".06"
        stroke="var(--mock-line)" stroke-opacity=".6"/>
  <text class="pm-cap" x="228" y="186" text-anchor="middle">${esc(x.statsCaption || 'ALL TIME')}</text>
  ${statCols}
  ${optRows}
  ${action}
  </g>
</svg></div>`;
}

/** Abstract browser-window art — a stand-in until real Web Store shots land. */
function browserMock(x, variant) {
  const bar = (bx, by, w, o, h = 9) =>
    `<rect x="${bx}" y="${by}" width="${w}" height="${h}" rx="${h / 2}" fill="var(--mock)" fill-opacity="${o}"/>`;

  const popup = () => [
    [0, 1, 2, 3, 4, 5].map(i =>
      bar(28, 92 + i * 26, [190, 150, 210, 120, 176, 138][i], i > 2 ? '.09' : '.17')).join(''),
    `<rect x="258" y="80" width="136" height="152" rx="10" fill="var(--mock-bg)" stroke="var(--mock-line)"/>`,
    bar(274, 96, 62, '.42'),
    [0, 1, 2, 3].map(i =>
      bar(274, 126 + i * 28, [74, 92, 66, 84][i], '.16') +
      `<rect x="352" y="${122 + i * 28}" width="26" height="14" rx="7" fill="var(--mock)" fill-opacity="${i === 0 ? '.5' : '.12'}"/>`
    ).join(''),
  ].join('');

  const cleaned = () => [
    bar(28, 92, 150, '.42', 12),
    bar(28, 116, 232, '.13'),
    `<rect x="28" y="142" width="366" height="74" rx="8" fill="var(--mock)" fill-opacity=".05"/>`,
    bar(44, 160, 210, '.2'), bar(44, 180, 168, '.2'), bar(44, 198, 126, '.1', 7),
    bar(28, 236, 300, '.13'), bar(28, 256, 246, '.13'),
  ].join('');

  const list = () => [0, 1, 2, 3, 4, 5].map(i => [
    `<rect x="28" y="${88 + i * 32}" width="366" height="24" rx="6" fill="var(--mock)" fill-opacity="${i % 2 ? '.04' : '.07'}"/>`,
    `<circle cx="43" cy="${100 + i * 32}" r="4" fill="var(--mock)" fill-opacity=".3"/>`,
    bar(58, 96 + i * 32, [176, 138, 208, 152, 190, 122][i], '.22', 8),
    bar(304, 96 + i * 32, 62, '.09', 8),
  ].join('')).join('');

  return `<div class="win-frame" style="${themeVars(x)}">
<svg viewBox="0 0 422 300" role="img" aria-label="Illustration of ${esc(x.name)} running in a browser window">
  <rect x=".5" y=".5" width="421" height="299" rx="13" fill="var(--mock-bg)" stroke="var(--mock-line)"/>
  <rect x="16" y="10" width="92" height="22" rx="6" fill="var(--mock)" fill-opacity=".18"/>
  <rect x="114" y="10" width="74" height="22" rx="6" fill="var(--mock)" fill-opacity=".07"/>
  <rect x="194" y="10" width="74" height="22" rx="6" fill="var(--mock)" fill-opacity=".07"/>
  <circle cx="24" cy="52" r="4" fill="var(--mock)" fill-opacity=".2"/>
  <circle cx="40" cy="52" r="4" fill="var(--mock)" fill-opacity=".2"/>
  <rect x="56" y="42" width="286" height="20" rx="10" fill="var(--mock)" fill-opacity=".08"/>
  <rect x="368" y="42" width="20" height="20" rx="6" fill="var(--mock)" fill-opacity=".55"/>
  <line x1="0" y1="72" x2="422" y2="72" stroke="var(--mock-line)"/>
  ${[popup, cleaned, list][variant % 3]()}
</svg></div>`;
}

/* ------------------------------------------------- open graph rendering */

/**
 * A card per news post.
 *
 * Anchors cannot carry their own og:image — a scraper handed /news/#some-post
 * reads the tags on /news/ and shows whatever that page declares. So every
 * post gets its own URL, and this draws its card: the headline set large, the
 * date and tag above it, tinted with the extension's accent so a YouTube
 * breakage and a Cookies release do not look like the same announcement.
 */
function ogNewsDoc(p) {
  const x = exts.find(e => e.slug === p.ext);
  const a = x ? accentOf(x) : site.accent;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;background:#fff;color:#1d1d1f;
  font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Helvetica Neue",Helvetica,Arial,sans-serif;
  -webkit-font-smoothing:antialiased;padding:84px 88px;position:relative;
  display:flex;flex-direction:column;justify-content:center}
.rule{position:absolute;left:0;top:0;width:100%;height:10px;background:${a}}
.meta{display:flex;align-items:center;gap:18px;margin-bottom:26px;font-size:24px;color:#6e6e73}
.tag{background:${a};color:#fff;font-weight:600;padding:5px 16px;border-radius:980px;font-size:21px}
h1{font-size:${p.title.length > 46 ? 68 : 82}px;font-weight:600;letter-spacing:-.019em;line-height:1.06;max-width:20ch}
.foot{position:absolute;left:88px;right:88px;bottom:52px;display:flex;
  align-items:center;justify-content:space-between;font-size:23px;color:#86868b}
.foot b{font-weight:600;color:#1d1d1f}
</style></head><body>
<div class="rule"></div>
<div class="meta">
  <span>${esc(fmtDate(p.date))}</span>
  ${p.tag ? `<span class="tag">${esc(p.tag)}</span>` : ''}
  ${x ? `<span>${esc(x.name)}</span>` : ''}
</div>
<h1>${esc(p.title)}</h1>
<div class="foot"><b>${esc(site.domain)}</b><span>News</span></div>
</body></html>`;
}

function ogDoc(x) {
  const a = x ? accentOf(x) : site.accent;
  const title = x ? x.name : site.name;
  const sub = x ? x.tagline : site.tagline;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;background:#fff;color:#1d1d1f;
  font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Helvetica Neue",Helvetica,Arial,sans-serif;
  -webkit-font-smoothing:antialiased;display:flex;flex-direction:column;
  align-items:center;justify-content:center;text-align:center;padding:72px;position:relative}
.icon{width:120px;height:120px;border-radius:28px;margin-bottom:34px}
h1{font-size:${x ? 104 : 88}px;font-weight:600;letter-spacing:-.017em;line-height:1.04}
p{font-size:34px;line-height:1.25;letter-spacing:.004em;color:#6e6e73;margin-top:20px;max-width:24ch}
.foot{position:absolute;left:0;right:0;bottom:46px;font-size:22px;color:#86868b;letter-spacing:-.01em}
.foot b{font-weight:600;color:#1d1d1f}
</style></head><body>
${x ? icon(x, 'icon', 120) : `<div style="width:120px;height:120px;border-radius:28px;background:${a};margin-bottom:34px"></div>`}
<h1>${esc(title)}</h1><p>${esc(sub)}</p>
<div class="foot"><b>${esc(site.domain)}</b> &nbsp;·&nbsp; ${x ? 'Chrome extension' : 'Chrome extensions'}</div>
</body></html>`;
}

function findChrome() {
  return [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ].find(existsSync) || null;
}

/**
 * Brand assets supplied by hand, in src/brand/.
 *
 * The build can draw a favicon, a touch icon and an OG card from the accent
 * colour, which is what it did before the rename. Anything in src/brand/ wins:
 * these are the designed versions, and a generated stand-in silently replacing
 * one is how the site went on serving a pre-rename green OG card long after the
 * brand had changed. Missing files fall back to generation, so the build still
 * works on a clean checkout.
 */
const BRAND = join(ROOT, 'src', 'brand');
const brandFile = (name) => {
  const p = join(BRAND, name);
  return existsSync(p) ? p : null;
};

/** 180x180 PNG for iOS home screens, rendered from the same mark as the favicon. */
function renderTouchIcon(chrome) {
  const supplied = brandFile('apple-touch-icon.png');
  if (supplied) {
    copyFileSync(supplied, join(DIST, 'apple-touch-icon.png'));
    return true;
  }
  if (!chrome) return false;
  mkdirSync(OGSRC, { recursive: true });
  const src = join(OGSRC, 'touch.html');
  const out = join(DIST, 'apple-touch-icon.png');
  writeFileSync(src, `<!doctype html><meta charset="utf-8">
<style>*{margin:0}body{width:180px;height:180px;background:${site.accent};
display:flex;align-items:center;justify-content:center}</style>
<svg width="112" height="112" viewBox="0 0 48 48">
  <g fill="none" stroke="${site.markInk || '#f2f0f4'}" stroke-width="5.52">
    <circle cx="24" cy="24" r="11.52"/>
    <path d="M26.04 26.04 33.61 33.61"/>
  </g>
</svg>`);
  try {
    execFileSync(chrome, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-sandbox',
      '--force-device-scale-factor=1', '--window-size=180,180',
      '--virtual-time-budget=1500', `--screenshot=${out}`, `file://${src}`,
    ], { stdio: 'ignore', timeout: 30000 });
    return existsSync(out);
  } catch { return false; }
}

function renderOgImages() {
  const chrome = findChrome();
  if (!chrome) {
    console.warn('  ! No Chrome found — pages will ship without og:image.');
    return new Set();
  }
  mkdirSync(OGSRC, { recursive: true });
  mkdirSync(join(DIST, 'og'), { recursive: true });
  const done = new Set();
  for (const { name, x, post } of [
    { name: 'default', x: null },
    ...exts.map(e => ({ name: e.slug, x: e })),
    ...news.map(p => ({ name: `news-${p.id}`, post: p })),
  ]) {
    const src = join(OGSRC, `${name}.html`);
    const out = join(DIST, 'og', `${name}.png`);
    // The default card is the one every shared link of the home page renders,
    // so a designed version matters most there.
    const supplied = name === 'default' ? brandFile('og-default.png') : null;
    if (supplied) { copyFileSync(supplied, out); done.add(name); continue; }
    writeFileSync(src, post ? ogNewsDoc(post) : ogDoc(x));
    try {
      execFileSync(chrome, [
        '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-sandbox',
        '--force-device-scale-factor=1', '--window-size=1200,630',
        '--virtual-time-budget=3000', `--screenshot=${out}`, `file://${src}`,
      ], { stdio: 'ignore', timeout: 45000 });
      if (existsSync(out)) done.add(name);
    } catch { /* page simply ships without an og:image */ }
  }
  renderTouchIcon(chrome);
  rmSync(OGSRC, { recursive: true, force: true });
  return done;
}

/* ------------------------------------------------------------- partials */

const CSS_TEXT = readFileSync(join(ROOT, 'src/styles.css'), 'utf8');
const CSS_V = createHash('sha1').update(CSS_TEXT).digest('hex').slice(0, 8);

// Wordmark splits the studio name on its first space: "Quit" . "Apps".
const [MARK_A, ...MARK_REST] = site.name.split(' ');
const MARK = `<b>${esc(MARK_A)}</b><s>.</s><i>${esc(MARK_REST.join(' '))}</i>`;

const gnav = () => `
<nav class="gnav" aria-label="Primary">
  <div class="wrap gnav__in">
    <a class="gnav__mark" href="/">${MARK}</a>
    <ul>
      <li><a class="gnav__link" href="/#extensions">Extensions</a></li>
      <li class="is-optional"><a class="gnav__link" href="/#approach">Approach</a></li>
      <li><a class="gnav__link" href="/news/">News</a></li>
      <li><a class="gnav__link" href="/contact/">Contact</a></li>
      ${site.donate ? `<li class="gnav__coffee"><a class="gnav__link" href="${esc(site.donate)}" rel="noopener">
        ${CUP}<span>Buy me a coffee</span></a></li>` : ''}
    </ul>
  </div>
</nav>`;

const lnav = (x) => `
<div class="lnav">
  <div class="wrap lnav__in">
    <a class="lnav__name" href="/extensions/${x.slug}/">${esc(x.name)}</a>
    <div class="lnav__right">
      <a class="is-optional" href="#features">Features</a>
      ${x.githubUrl || x.releaseUrl ? `<a class="is-optional" href="#install">Install</a>` : ''}
      <a href="#permissions">Permissions</a>
      <a class="is-optional" href="#questions">Questions</a>
      ${x.githubUrl || x.releaseUrl
        ? `<a class="btn btn--sm" href="#install">Download</a>`
        : `<span class="btn btn--sm btn--soon">Coming soon</span>`}
    </div>
  </div>
</div>`;

const footer = () => `
<footer class="foot">
  <div class="wrap">
    <div class="foot__grid">
      <div>
        <h2>Extensions</h2>
        <ul>${exts.map(e => `<li><a href="/extensions/${e.slug}/">${esc(e.name)}</a></li>`).join('')}</ul>
      </div>
      <div>
        <h2>Studio</h2>
        <ul>
          <li><a href="/#approach">Approach</a></li>
          <li><a href="/news/">News</a></li>
          <li><a href="/contact/">Contact</a></li>
          ${site.facebook ? `<li><a href="${esc(site.facebook)}" rel="noopener">Breakage notices</a></li>` : ''}
        </ul>
      </div>
      <div>
        <h2>Support</h2>
        <ul>
          <li><a href="mailto:${esc(site.supportEmail)}">${esc(site.supportEmail)}</a></li>
          <li><a href="/privacy/">Privacy</a></li>
          ${site.donate ? `<li><a href="${esc(site.donate)}" rel="noopener">Buy me a coffee</a></li>` : ''}
        </ul>
      </div>
      <div>
        <h2>Source</h2>
        <ul>
          ${exts.filter(e => e.githubUrl).map(e => `<li><a href="${esc(e.githubUrl)}" rel="noopener">${esc(e.shortName || e.name)} on GitHub</a></li>`).join('')}
          <li><a href="${esc(site.github)}" rel="noopener">All repositories</a></li>
        </ul>
      </div>
    </div>
    <div class="foot__base">
      <span>Copyright &copy; ${new Date().getFullYear()} ${esc(site.name)}. All rights reserved.</span>
      <span>United Kingdom</span>
    </div>
    <p class="foot__legal">${esc(site.name)} is an independent studio in the United Kingdom. Our extensions
      are free, MIT licensed and published as source on GitHub. They install unpacked and run in Chrome,
      Edge, Brave, Arc, Opera and other Chromium browsers. Not affiliated with, endorsed by or connected to
      Google, YouTube or Meta. Chrome and YouTube are trademarks of Google LLC; Facebook is a trademark of
      Meta Platforms, Inc.</p>
  </div>
</footer>`;

const REVEAL_JS = `
(function(){
  var els=document.querySelectorAll('.reveal');
  if(!els.length)return;
  if(!('IntersectionObserver'in window)||matchMedia('(prefers-reduced-motion: reduce)').matches){
    els.forEach(function(e){e.classList.add('is-in')});return;}
  var io=new IntersectionObserver(function(en){en.forEach(function(x){
    if(x.isIntersecting){x.target.classList.add('is-in');io.unobserve(x.target);}})},
    {rootMargin:'0px 0px -6% 0px',threshold:.05});
  els.forEach(function(e,i){e.style.transitionDelay=Math.min(i%3*80,160)+'ms';io.observe(e)});
})();`;

/* --------------------------------------------------------------- layout */

function layout({ title, description, path, og, jsonld, main, local = '', bodyAttr = '', noindex = false }) {
  const url = abs(path);
  const ogImg = og ? abs(`/og/${og}.png`) : null;
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(url)}">
<meta name="robots" content="${noindex
  ? 'noindex, follow'
  : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'}">
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)">
<meta name="color-scheme" content="light dark">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(site.name)}">
<meta property="og:locale" content="en_GB">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">${ogImg ? `
<meta property="og:image" content="${esc(ogImg)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(title)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${esc(ogImg)}">` : ''}
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<link rel="stylesheet" href="/styles.css?v=${CSS_V}">
<link rel="alternate" type="application/rss+xml" title="${esc(site.name)} news" href="${abs('/news/feed.xml')}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
${existsSync(join(DIST, 'apple-touch-icon.png')) ? '<link rel="apple-touch-icon" href="/apple-touch-icon.png">' : ''}
<script>document.documentElement.classList.add('js')</script>
<script type="application/ld+json">${JSON.stringify(jsonld)}</script>
</head>
<body${bodyAttr}>
<a class="skip" href="#main">Skip to content</a>
${gnav()}${local}
<main id="main">
${main}
</main>
${footer()}
<script>${REVEAL_JS}</script>
</body>
</html>`;
}

/* ------------------------------------------------------------ home page */

function tile(x, i, total) {
  const dark = i === 0;
  const full = i === 0 && total % 2 === 1;
  const soon = x.status === 'soon';
  return `
<article class="tile ${full ? 'tile--full' : ''} ${dark ? 'tile--dark' : ''} reveal">
  <div>
    ${icon(x, 'tile__icon')}
    <h2 class="tile__name">${esc(x.name)}</h2>
    <p class="tile__tag">${esc(x.tagline)}</p>
    <p class="tile__price">${esc(x.price)} &middot; ${esc(x.licence || 'MIT')} &middot; Open source</p>
    ${x.notice ? `<p class="tile__notice">${esc(x.notice)}</p>` : ''}
    <p class="btnrow" style="margin-top:1.1rem">
      ${x.storeUrl ? `<a class="btn btn--sm" href="${esc(x.storeUrl)}" rel="noopener">Add to Chrome</a>` : ''}
      <a class="clink" href="/extensions/${x.slug}/">Learn more ${CHEV}</a>
    </p>
    <p class="linkrow">
      ${x.githubUrl ? `<a class="clink clink--sm" href="${esc(x.githubUrl)}" rel="noopener">Source ${CHEV}</a>`
        : `<span class="clink clink--sm clink--soon">Source coming soon</span>`}
    </p>
  </div>
  <div class="tile__art">${popupMock(x)}</div>
</article>`;
}

function homePage(ogSet) {
  const main = `
<section class="hero">
  <div class="wrap center">
    <p class="t-eyebrow reveal">${esc(site.name)}</p>
    <h1 class="t-hero reveal">${site.heroHeadline}</h1>
    <p class="t-sub measure reveal" style="margin-inline:auto">${esc(site.heroLead)}</p>
    <p class="linkrow reveal">
      <a class="clink" href="#extensions">See the extensions ${CHEV}</a>
      <a class="clink" href="#approach">How we go about it ${CHEV}</a>
    </p>
  </div>
</section>

<section class="band band--tight" id="extensions">
  <div class="wrapw">
    <div class="tiles">${exts.map((x, i) => tile(x, i, exts.length)).join('')}</div>
  </div>
</section>

<section class="band band--alt" id="approach">
  <div class="wrap">
    <div class="band__head center reveal">
      <h2 class="t-h2">How we go about it</h2>
      <p class="t-sub measure reveal" style="margin:1rem auto 0">${esc(site.leadIn)}</p>
    </div>
    <div class="grid3">
      ${site.principles.map(p => `
      <div class="fcard reveal">
        <h3 class="t-h3">${esc(p.title)}</h3>
        <p>${esc(p.body)}</p>
      </div>`).join('')}
    </div>
  </div>
</section>

${site.donate ? `
<section class="band" id="support">
  <div class="wrap center">
    <h2 class="t-h2 reveal">${esc(site.donateHeading)}</h2>
    <p class="t-sub measure reveal" style="margin:1.15rem auto 0">${esc(site.donateBody)}</p>
    <p class="btnrow reveal" style="margin-top:1.75rem">
      <a class="btn btn--ghost btn--cup" href="${esc(site.donate)}" rel="noopener">${CUP} Buy me a coffee</a>
    </p>
  </div>
</section>` : ''}

<section class="band band--alt" id="contact">
  <div class="wrap center">
    <h2 class="t-h2 reveal">Write to a person, not a queue.</h2>
    <p class="t-sub measure reveal" style="margin:1.15rem auto 0">${esc(site.contactBody)}</p>
    <p class="btnrow reveal" style="margin-top:1.75rem">
      <a class="btn" href="/contact/">Send us a message</a>
    </p>
    <p class="t-small reveal" style="margin-top:1rem">
      Or email <span class="selectable">${esc(site.email)}</span> from your own mail app.
    </p>
  </div>
</section>`;

  const jsonld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': abs('/#org'),
        name: site.name, legalName: site.legalName, url: BASE, email: site.email,
        foundingDate: site.foundedYear, description: site.metaDescription,
        address: { '@type': 'PostalAddress', addressCountry: 'GB' },
        ...(ogSet.has('default') ? { logo: abs('/og/default.png') } : {}),
        ...(site.github ? { sameAs: [site.github] } : {}),
        contactPoint: {
          '@type': 'ContactPoint',
          contactType: 'customer support',
          email: site.supportEmail,
          availableLanguage: 'English',
        },
      },
      {
        '@type': 'WebSite', '@id': abs('/#website'),
        url: BASE, name: site.name, inLanguage: 'en-GB',
        publisher: { '@id': abs('/#org') },
      },
      {
        '@type': 'ItemList',
        name: `Chrome extensions by ${site.name}`,
        numberOfItems: exts.length,
        itemListElement: exts.map((x, i) => ({
          '@type': 'ListItem', position: i + 1,
          url: abs(`/extensions/${x.slug}/`), name: x.name,
        })),
      },
    ],
  };

  return layout({
    title: site.metaTitle, description: site.metaDescription, path: '/',
    og: ogSet.has('default') ? 'default' : null, jsonld, main,
  });
}

/* ------------------------------------------------------- extension page */

function extPage(x, ogSet) {
  const soon = x.status === 'soon';
  const nPerms = (x.permissions || []).length;

  const spec = [
    ['Browsers', (site.browsers || []).join(', ')],
    ['Price', x.price],
    ['Licence', x.githubUrl ? `${x.licence}, source on GitHub` : x.licence],
    ['Version', x.version],
    ['Updated', fmtDate(x.updated)],
    ['Size', x.size],
    ['Permissions', (x.permissions || []).map(p => p.name).join(', ')],
    ['Site access', (x.hostPermissions || []).map(p => p.name).join(', ')],
    ['Built as', x.manifest],
    ['Requires', x.requires],
  ].filter(([, v]) => v);

  const cta = x.storeUrl
    ? `<a class="btn" href="${esc(x.storeUrl)}" rel="noopener">Add to Chrome, it's free</a>
       ${x.githubUrl ? `<a class="clink" href="${esc(x.githubUrl)}" rel="noopener" style="margin-left:.5rem">View the source ${CHEV}</a>` : ''}`
    : x.releaseUrl
    ? `<a class="btn" href="${esc(x.releaseUrl)}" rel="noopener">Download the latest release</a>
       <a class="clink" href="${esc(x.githubUrl)}" rel="noopener" style="margin-left:.5rem">View the source ${CHEV}</a>`
    : x.githubUrl
    ? `<a class="btn" href="${esc(x.githubUrl)}" rel="noopener">Get it on GitHub</a>
       <a class="clink" href="#install" style="margin-left:.5rem">How to install it ${CHEV}</a>`
    : `<p class="soonbadge">Finished, not yet released</p>
       <p class="t-sub" style="margin-top:.75rem">It is built and working. The source goes up on GitHub
       shortly, and this page will carry the download the moment it does.</p>`;

  const main = `
<div class="wrap crumbs">
  <nav aria-label="Breadcrumb"><ol>
    <li><a href="/">Home</a></li>
    <li><a href="/#extensions">Extensions</a></li>
    <li><span aria-current="page">${esc(x.name)}</span></li>
  </ol></nav>
</div>

<section class="ahero" id="get">
  <div class="wrap center">
    ${icon(x, 'ahero__icon', 88)}
    <h1>${esc(x.name)}</h1>
    <p class="t-sub">${esc(x.tagline)}</p>
    <p class="ahero__pills">
      <span class="pill">${esc(x.price)}</span>
      <span class="pill">${esc(x.licence)}</span>
      ${(site.browsers || []).slice(0, 4).map(b => `<span class="pill">${esc(b)}</span>`).join('')}
    </p>
    <p class="btnrow">${cta}</p>
    ${x.notice ? `<p class="notice">${esc(x.notice)}</p>` : ''}
    <p class="ahero__note">${nPerms} permission${nPerms === 1 ? '' : 's'} &middot; ${esc(x.accessNote || `Runs only on ${x.reloadTarget}`)} &middot; No tracking &middot; ${esc(x.licence)} licensed</p>
  </div>
  <div class="wrapw" style="margin-top:clamp(2.5rem,5vw,4rem)">
    ${(x.screenshots && x.screenshots.length) ? `
    <div class="shots reveal">
      ${x.screenshots.map(s => `<img src="${esc(s.src)}" alt="${esc(s.alt)}" width="1280" height="800" loading="lazy" decoding="async">`).join('')}
    </div>` : `
    <div class="hero-shot reveal">
      <div class="hero-shot__side">${browserMock(x, 1)}</div>
      <div class="hero-shot__main">${popupMock(x)}</div>
      <div class="hero-shot__side">${browserMock(x, 2)}</div>
    </div>`}
  </div>
</section>

<section class="band band--alt">
  <div class="wrap center">
    <div class="prose" style="max-width:48ch;margin-inline:auto">
      ${(x.description || []).map(p => `<p class="t-sub" style="color:var(--ink)">${esc(p)}</p>`).join('')}
    </div>
  </div>
</section>

<section class="band" id="features">
  <div class="wrap">
    <div class="band__head center reveal">
      <h2 class="t-h2">What it does</h2>
      <p class="t-sub" style="margin-top:.85rem">${(x.features || []).length} things, and no more.</p>
    </div>
    <div class="grid3">
      ${(x.features || []).map(f => `
      <div class="fcard reveal">
        <h3 class="t-h3">${esc(f.title)}</h3>
        <p>${esc(f.body)}</p>
      </div>`).join('')}
    </div>
  </div>
</section>

${!(x.githubUrl || x.releaseUrl) ? '' : `
<section class="band" id="install">
  <div class="wrap">
    <div class="band__head center reveal">
      <h2 class="t-h2">Installing it</h2>
      <p class="t-sub" style="margin-top:.85rem">${x.storeUrl
        ? `One click from the Chrome Web Store. The unpacked route below still works if you would rather run the source.`
        : `Not on the Chrome Web Store, so it installs unpacked. Two minutes, once.`}</p>
      ${x.storeUrl ? `<p class="btnrow" style="margin-top:1.75rem">
        <a class="btn" href="${esc(x.storeUrl)}" rel="noopener">Add to Chrome</a>
      </p>` : ''}
    </div>
    <ol class="steps reveal">
      ${[
        x.releaseUrl ? site.installFirstRelease : site.installFirstZip,
        ...(site.install || []),
        `Reload any <b>${esc(x.reloadTarget)}</b> tab you already had open.`,
      ].map((step, i) => `
      <li><span class="steps__n">${i + 1}</span><p>${step}</p></li>`).join('')}
    </ol>
    <p class="perms__note" style="margin-top:2.25rem">${esc(site.installNote)}</p>
    <p class="btnrow" style="margin-top:2.5rem">
      ${x.releaseUrl
        ? `<a class="btn" href="${esc(x.releaseUrl)}" rel="noopener">Download ${esc(x.name)} ${esc(x.version)}</a>`
        : `<a class="btn" href="${esc(x.githubUrl)}" rel="noopener">Get ${esc(x.name)} on GitHub</a>`}
    </p>
    ${site.donate ? `<p class="center" style="margin-top:1.5rem">
      <a class="clink clink--sm" href="${esc(site.donate)}" rel="noopener">${CUP} Free forever. Buy me a coffee if it helped ${CHEV}</a>
    </p>` : ''}
  </div>
</section>`}

${latestNewsFor(x.slug) ? `
<section class="band" id="latest">
  <div class="wrap">
    <div class="band__head center reveal">
      <h2 class="t-h2">Latest news</h2>
      <p class="t-sub" style="margin-top:.85rem">Releases and breakages for ${esc(x.name)}.</p>
    </div>
    <div class="posts measure-l">${newsEntry(latestNewsFor(x.slug), { heading: 'h3' })}</div>
    <p class="center" style="margin-top:2rem">
      <a class="clink" href="/news/">All news ${CHEV}</a>
      <a class="clink" href="/news/feed.xml" style="margin-left:1rem">${RSS_ICON} RSS ${CHEV}</a>
    </p>
  </div>
</section>` : ''}

${(x.options || []).length ? `
<section class="band band--alt" id="options">
  <div class="wrap">
    <div class="band__head center reveal">
      <h2 class="t-h2">Every setting</h2>
      <p class="t-sub" style="margin-top:.85rem">Click the extension icon. Changes apply immediately.</p>
    </div>
    <div class="tablewrap reveal">
      <table class="opts">
        <thead><tr><th scope="col">Option</th><th scope="col">Default</th><th scope="col">What it does</th></tr></thead>
        <tbody>
          ${x.options.map(o => `<tr>
            <th scope="row">${esc(o.name)}</th>
            <td><span class="tog tog--${o.default.toLowerCase()}">${esc(o.default)}</span></td>
            <td>${esc(o.what)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>
</section>` : ''}

<section class="band band--alt" id="permissions">
  <div class="wrap">
    <div class="band__head center reveal">
      <h2 class="t-h2">What it asks for</h2>
      <p class="t-sub" style="margin-top:.85rem">${esc(x.permsNote || `${nPerms} permission${nPerms === 1 ? '' : 's'} and one site, and why each is there.`)}</p>
    </div>
    <dl class="perms reveal">
      ${[...(x.permissions || []), ...(x.hostPermissions || [])].map(p => `
      <div><dt><code>${esc(p.name)}</code></dt><dd>${esc(p.why)}</dd></div>`).join('')}
    </dl>
    <p class="perms__note">Chrome shows you this list at install time. We would rather you saw it first.${
      x.githubUrl ? ` The source is public, so you can check that it is the whole list.` : ''}</p>
  </div>
</section>

${(x.faq || []).length ? `
<section class="band" id="questions">
  <div class="wrap">
    <div class="band__head center reveal"><h2 class="t-h2">Questions</h2></div>
    <div class="faq reveal">
      ${x.faq.map(f => `<details><summary>${esc(f.q)}</summary><div><p>${esc(f.a)}</p></div></details>`).join('')}
    </div>
  </div>
</section>` : ''}

<section class="band band--alt" id="specs">
  <div class="wrap">
    <div class="band__head center reveal"><h2 class="t-h2">The details</h2></div>
    <dl class="spec reveal">
      ${spec.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}
    </dl>
    <div class="prose measure-l reveal" style="margin:2.5rem auto 0">
      <p class="t-small">${esc(x.privacy)} Something not working? Write to
        <a href="mailto:${esc(site.supportEmail)}?subject=${encodeURIComponent(x.name)}">${esc(site.supportEmail)}</a>.
        Full terms are on the <a href="/privacy/">privacy page</a>.</p>
    </div>
  </div>
</section>

<section class="band">
  <div class="wrapw">
    <div class="band__head center reveal"><h2 class="t-h2">Also from ${esc(site.name)}</h2></div>
    <div class="tiles">${(() => { const rest = exts.filter(e => e.slug !== x.slug); return rest.map((e, i) => tile(e, i, rest.length)).join(''); })()}</div>
  </div>
</section>`;

  const graph = [
    {
      '@type': 'SoftwareApplication',
      '@id': abs(`/extensions/${x.slug}/#app`),
      name: x.name, url: abs(`/extensions/${x.slug}/`), description: x.summary,
      applicationCategory: 'BrowserApplication',
      operatingSystem: 'Chrome',
      browserRequirements: x.requires,
      softwareVersion: x.version,
      ...(x.released ? { datePublished: x.released } : {}),
      ...(x.updated ? { dateModified: x.updated } : {}),
      ...(x.size ? { fileSize: x.size } : {}),
      ...(nPerms ? { permissions: x.permissions.map(p => p.name).join(', ') } : {}),
      ...(ogSet.has(x.slug) ? { image: abs(`/og/${x.slug}.png`) } : {}),
      ...(x.rating && x.ratingCount ? {
        aggregateRating: {
          '@type': 'AggregateRating', ratingValue: x.rating,
          ratingCount: x.ratingCount, bestRating: '5', worstRating: '1',
        },
      } : {}),
      offers: {
        '@type': 'Offer',
        price: x.priceValue ?? '0', priceCurrency: x.currency || 'GBP',
        availability: soon ? 'https://schema.org/PreOrder' : 'https://schema.org/InStock',
          ...(x.storeUrl || x.releaseUrl || x.githubUrl ? { url: x.storeUrl || x.releaseUrl || x.githubUrl } : {}),
      },
      publisher: { '@id': abs('/#org') },
      ...(x.licence ? { license: `https://spdx.org/licenses/${x.licence}.html` } : {}),
      ...(x.storeUrl || x.releaseUrl ? { downloadUrl: x.storeUrl || x.releaseUrl } : {}),
      ...(x.githubUrl ? {
        codeRepository: x.githubUrl,
        isAccessibleForFree: true,
        installUrl: x.storeUrl || x.releaseUrl || x.githubUrl,
        softwareHelp: abs(`/extensions/${x.slug}/#questions`),
      } : {}),
      applicationSubCategory: 'Chrome Extension',
      ...(x.features || []).length
        ? { featureList: x.features.map(f => f.title).join(', ') } : {},
      ...(ogSet.has(x.slug) ? { screenshot: abs(`/og/${x.slug}.png`) } : {}),
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: BASE + '/' },
        { '@type': 'ListItem', position: 2, name: 'Extensions', item: abs('/#extensions') },
        { '@type': 'ListItem', position: 3, name: x.name },
      ],
    },
  ];
  if ((x.faq || []).length) {
    graph.push({
      '@type': 'FAQPage',
      mainEntity: x.faq.map(f => ({
        '@type': 'Question', name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    });
  }

  return layout({
    title: x.metaTitle || `${x.name} | ${site.name}`,
    description: x.metaDescription || x.summary,
    path: `/extensions/${x.slug}/`,
    og: ogSet.has(x.slug) ? x.slug : null,
    jsonld: { '@context': 'https://schema.org', '@graph': graph },
    main, local: lnav(x),
  });
}

/* ------------------------------------------------------------ contact */

/** A real form, because a mailto: link does nothing for anyone without a mail
 *  client configured. Plain PHP, posts to itself, no JavaScript, no third party. */
function contactPage(ogSet) {
  const PHP = `<?php
declare(strict_types=1);

$TO      = ${JSON.stringify(site.email)};
$SUBJECT = 'Website enquiry from ' . ${JSON.stringify(site.domain)};
$MIN_SECONDS = 3;   // a human takes longer than this to fill the form in

$sent = false;
$errors = [];
$name = $email = $message = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $name    = trim((string)($_POST['name'] ?? ''));
    $email   = trim((string)($_POST['email'] ?? ''));
    $message = trim((string)($_POST['message'] ?? ''));
    $trap    = trim((string)($_POST['website'] ?? ''));
    $started = (int)($_POST['t'] ?? 0);

    // Bots fill hidden fields and submit instantly. Accept silently rather than
    // telling them why they failed.
    $looks_automated = $trap !== '' || $started <= 0 || (time() - $started) < $MIN_SECONDS;

    if ($name === '')                                        { $errors['name'] = 'Please add your name.'; }
    if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL))
                                                             { $errors['email'] = 'That does not look like an email address.'; }
    if (mb_strlen($message) < 10)                            { $errors['message'] = 'Please add a little more detail.'; }
    if (mb_strlen($message) > 5000)                          { $errors['message'] = 'That is longer than we can accept.'; }

    if (!$errors) {
        if ($looks_automated) {
            $sent = true;   // pretend
        } else {
            // From must be on our own domain or SPF fails; the sender goes in Reply-To.
            $headers = [
                'From: ' . ${JSON.stringify('Quite Apps <website@' + site.domain + '>')},
                'Reply-To: ' . mb_encode_mimeheader($name, 'UTF-8') . ' <' . $email . '>',
                'Content-Type: text/plain; charset=UTF-8',
                'X-Mailer: quiteapps-contact',
            ];
            $body = "Name:  " . $name . "\\n"
                  . "Email: " . $email . "\\n"
                  . "Sent:  " . gmdate('c') . "\\n"
                  . "IP:    " . ($_SERVER['REMOTE_ADDR'] ?? 'unknown') . "\\n\\n"
                  . $message . "\\n";
            $sent = @mail($TO, $SUBJECT, $body, implode("\\r\\n", $headers));
            if (!$sent) {
                $errors['form'] = 'Something went wrong sending that. Please email us directly instead.';
            }
        }
    }
}

function v(string $s): string { return htmlspecialchars($s, ENT_QUOTES, 'UTF-8'); }
function err(array $e, string $k): string {
    return isset($e[$k]) ? '<span class="field__err">' . htmlspecialchars($e[$k], ENT_QUOTES, 'UTF-8') . '</span>' : '';
}
?>
`;

  const main = `
<div class="wrap crumbs">
  <nav aria-label="Breadcrumb"><ol>
    <li><a href="/">Home</a></li><li><span aria-current="page">Contact</span></li>
  </ol></nav>
</div>

<section class="band band--tight">
  <div class="wrap center">
    <h1 class="t-h2">${esc(site.contactHeading)}</h1>
    <p class="t-sub measure" style="margin:1.15rem auto 0">${esc(site.contactBody)}</p>
  </div>
</section>

<section class="band band--alt" style="padding-top:0">
  <div class="wrap">
    <?php if ($sent): ?>
      <div class="formcard formcard--done reveal">
        <h2 class="t-h3">Thank you. That has been sent.</h2>
        <p>We read everything ourselves, so a reply may take a day or two, but it will come from a
          person rather than a queue.</p>
        <p style="margin-top:1.5rem"><a class="clink" href="/">Back to the extensions ${CHEV}</a></p>
      </div>
    <?php else: ?>
      <form class="formcard reveal" method="post" action="/contact/" novalidate>
        <?php if (isset($errors['form'])): ?>
          <p class="field__err field__err--top"><?= v($errors['form']) ?></p>
        <?php endif; ?>

        <div class="field">
          <label for="name">Your name</label>
          <input id="name" name="name" type="text" autocomplete="name" required
                 value="<?= v($name) ?>" <?= isset($errors['name']) ? 'aria-invalid="true"' : '' ?>>
          <?= err($errors, 'name') ?>
        </div>

        <div class="field">
          <label for="email">Email</label>
          <input id="email" name="email" type="email" autocomplete="email" required
                 value="<?= v($email) ?>" <?= isset($errors['email']) ? 'aria-invalid="true"' : '' ?>>
          <?= err($errors, 'email') ?>
        </div>

        <div class="field">
          <label for="message">Message</label>
          <textarea id="message" name="message" rows="7" required
                    <?= isset($errors['message']) ? 'aria-invalid="true"' : '' ?>><?= v($message) ?></textarea>
          <?= err($errors, 'message') ?>
        </div>

        <div class="trap" aria-hidden="true">
          <label for="website">Leave this empty</label>
          <input id="website" name="website" type="text" tabindex="-1" autocomplete="off">
        </div>
        <input type="hidden" name="t" value="<?= time() ?>">

        <div class="field field--submit">
          <button class="btn" type="submit">Send it</button>
          <p class="t-tiny" style="margin-top:.85rem">
            No tracking on this form, and your address is used only to reply.
            Prefer your own mail app? <a class="prose-link" href="mailto:${esc(site.email)}">${esc(site.email)}</a>
          </p>
        </div>
      </form>
    <?php endif; ?>
  </div>
</section>`;

  return PHP + layout({
    title: `Contact | ${site.name}`,
    description: `Get in touch about any of the Quite Apps extensions. Bug reports, feature requests and questions, all read by the person who wrote the code.`,
    path: '/contact/',
    og: ogSet.has('default') ? 'default' : null,
    jsonld: {
      '@context': 'https://schema.org', '@type': 'ContactPage',
      name: 'Contact', url: abs('/contact/'), isPartOf: { '@id': abs('/#website') },
    },
    main,
  });
}

/* ------------------------------------------------------- privacy & 404 */

function privacyPage(ogSet) {
  const main = `
<div class="wrap crumbs">
  <nav aria-label="Breadcrumb"><ol>
    <li><a href="/">Home</a></li><li><span aria-current="page">Privacy</span></li>
  </ol></nav>
</div>
<section class="band band--tight">
  <div class="wrap">
    <h1 class="t-h2">Privacy</h1>
    <p class="t-tiny" style="margin-top:.75rem">Last updated ${fmtDate(site.privacyUpdated)}</p>
    <div class="prose measure-l" style="margin-top:2.5rem">
      <p class="t-sub" style="color:var(--ink)">The short version: our extensions collect nothing about you,
        and this website sets no cookies, loads no webfonts and runs no analytics.</p>
      <h2 class="t-h3">This website</h2>
      <p>${esc(site.domain)} is a set of static files. There is no tracking script, no advertising
        pixel and no cookie banner, because there are no cookies to consent to. Type is set in
        your device's own system font, so no font requests leave your browser either. Our host
        keeps standard server access logs, which include IP addresses, for security and
        troubleshooting; we do not analyse them or share them.</p>
      <h2 class="t-h3">The extensions</h2>
      <p>Every permission each extension asks for is listed with its reason on that extension's own
        page. Two of them run on a single site and cannot see any other tab you have open; the third
        installs with no access to any site at all and asks for one domain at a time, when you press
        the button. None of them contain analytics, remote code, or a server of ours for your data to
        sit on.</p>
      ${exts.map(e => `<p><strong>${esc(e.name)}.</strong> ${esc(e.privacy)}
        <a href="/extensions/${e.slug}/#permissions">See its permissions</a>.</p>`).join('')}
      <h2 class="t-h3">Nothing is sold</h2>
      <p>The extensions are free and MIT licensed. There is no purchase, no licence key and no
        payment processor involved, so there is no payment data for anyone to hold.</p>
      <h2 class="t-h3">You can check all of this</h2>
      <p>The full source of every released extension is public. If you would rather verify than trust,
        the code is at <a href="${esc(site.github)}" rel="noopener">${esc(site.github.replace(/^https?:\/\//, ''))}</a>.</p>
      <h2 class="t-h3">Email</h2>
      <p>If you write to us, we keep the message so we can reply and so we remember the
        conversation next time. We do not add you to a mailing list, because we do not have one.</p>
      <h2 class="t-h3">Your rights</h2>
      <p>Under UK GDPR you may ask what personal data we hold about you and ask us to delete it.
        In practice this is almost always just an email thread. Write to
        <a href="mailto:${esc(site.email)}">${esc(site.email)}</a> and we will deal with it
        within thirty days.</p>
    </div>
  </div>
</section>`;
  return layout({
    title: `Privacy | ${site.name}`,
    description: `How ${site.name} handles data: no analytics, no cookies, no accounts. What each Chrome extension stores, and your rights under UK GDPR.`,
    path: '/privacy/', og: ogSet.has('default') ? 'default' : null,
    jsonld: {
      '@context': 'https://schema.org', '@type': 'WebPage',
      name: 'Privacy', url: abs('/privacy/'), isPartOf: { '@id': abs('/#website') },
    },
    main,
  });
}

function notFoundPage() {
  const main = `
<section class="wrap mid">
  <h1 class="t-h2">This page has quietly gone.</h1>
  <p class="t-sub measure" style="margin:1.15rem auto 0">The link may be old, or we may have
    moved something. The extensions are all still here.</p>
  <p class="btnrow" style="margin-top:1.75rem">
    <a class="btn" href="/">Back to the start</a>
    <a class="clink" href="/#extensions" style="margin-left:.5rem">See the extensions ${CHEV}</a>
  </p>
</section>`;
  return layout({
    title: `Page not found | ${site.name}`,
    description: ('That page could not be found. Quite Apps makes free, open-source Chrome extensions '
      + 'that remove ads and clutter from YouTube and Facebook.'),
    path: '/404.html', og: null, noindex: true,
    jsonld: { '@context': 'https://schema.org', '@type': 'WebPage', name: 'Page not found' },
    main,
  });
}


/* ------------------------------------------------------------- news */

/** One post, used by the news page and, in short form, by extension pages. */
function newsEntry(p, { heading = 'h2', linked = true } = {}) {
  const x = exts.find(e => e.slug === p.ext);
  return `
<article class="post reveal" id="${esc(p.id)}">
  <div class="post__meta">
    <time datetime="${esc(p.date)}">${fmtDate(p.date)}</time>
    ${p.tag ? `<span class="post__tag">${esc(p.tag)}</span>` : ''}
    ${x ? `<a class="post__ext" href="/extensions/${x.slug}/">${esc(x.name)}</a>` : ''}
  </div>
  <${heading} class="${heading === 'h1' ? 't-h2' : 't-h3'} post__title">
    ${linked ? `<a href="/news/${esc(p.id)}/">${esc(p.title)}</a>` : esc(p.title)}
  </${heading}>
  ${(p.body || []).map(t => `<p>${esc(t)}</p>`).join('')}
  ${(p.works || []).length ? `
  <p class="post__works-head">What still works</p>
  <ul class="post__works">${p.works.map(w => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
  ${p.updated ? `<p class="t-tiny post__updated">Updated ${fmtDate(p.updated)}</p>` : ''}
</article>`;
}

/** One post, on its own URL, so a share of it carries its own card. */
function newsPostPage(p, ogSet) {
  const x = exts.find(e => e.slug === p.ext);
  const idx = news.indexOf(p);
  const newer = news[idx - 1] || null;
  const older = news[idx + 1] || null;
  const ogName = `news-${p.id}`;
  const main = `
<div class="wrap crumbs">
  <nav aria-label="Breadcrumb"><ol>
    <li><a href="/">Home</a></li>
    <li><a href="/news/">News</a></li>
    <li><span aria-current="page">${esc(p.title)}</span></li>
  </ol></nav>
</div>
<section class="band band--tight">
  <div class="wrap">
    <div class="posts measure-l">${newsEntry(p, { heading: 'h1', linked: false })}</div>
    ${x ? `<p class="linkrow linkrow--start" style="margin-top:2.5rem">
      <a class="clink clink--sm" href="/extensions/${x.slug}/">About ${esc(x.name)} ${CHEV}</a>
      ${x.storeUrl ? `<a class="clink clink--sm" href="${esc(x.storeUrl)}" rel="noopener">Add to Chrome ${CHEV}</a>` : ''}
    </p>` : ''}
    ${newer || older ? `
    <nav class="postnav measure-l ${newer && older ? '' : 'postnav--one'}" aria-label="More news">
      ${newer ? `<a href="/news/${esc(newer.id)}/"><span>Newer</span>${esc(newer.title)}</a>` : ''}
      ${older ? `<a class="postnav__older" href="/news/${esc(older.id)}/"><span>Older</span>${esc(older.title)}</a>` : ''}
    </nav>` : ''}
    <p class="linkrow linkrow--start" style="margin-top:2.5rem">
      <a class="clink clink--sm" href="/news/">All news ${CHEV}</a>
      <a class="clink clink--sm" href="/news/feed.xml">${RSS_ICON} RSS ${CHEV}</a>
    </p>
  </div>
</section>`;
  return layout({
    title: `${p.title} | ${site.name}`,
    description: (p.body || [])[0] ? String(p.body[0]).slice(0, 155) : `News from ${site.name}.`,
    path: `/news/${p.id}/`,
    og: ogSet.has(ogName) ? ogName : (ogSet.has('default') ? 'default' : null),
    jsonld: {
      '@context': 'https://schema.org', '@type': 'BlogPosting',
      headline: p.title, datePublished: p.date,
      ...(p.updated ? { dateModified: p.updated } : {}),
      url: abs(`/news/${p.id}/`),
      author: { '@type': 'Organization', name: site.name, url: BASE },
      publisher: { '@type': 'Organization', name: site.name, url: BASE },
      ...(ogSet.has(ogName) ? { image: abs(`/og/${ogName}.png`) } : {}),
    },
    main,
  });
}

function newsPage(ogSet) {
  const main = `
<div class="wrap crumbs">
  <nav aria-label="Breadcrumb"><ol>
    <li><a href="/">Home</a></li><li><span aria-current="page">News</span></li>
  </ol></nav>
</div>
<section class="band band--tight">
  <div class="wrap">
    <h1 class="t-h2">News</h1>
    <p class="t-sub measure-l" style="margin-top:.85rem">Releases, and what to do when a site changes
      its markup and an extension stops working. Newest first.</p>
    <p class="linkrow linkrow--start" style="margin-top:1.5rem">
      <a class="clink clink--sm" href="/news/feed.xml">${RSS_ICON} Subscribe by RSS ${CHEV}</a>
      ${site.facebook ? `<a class="clink clink--sm" href="${esc(site.facebook)}" rel="noopener">Breakage notices on Facebook ${CHEV}</a>` : ''}
    </p>
    <div class="posts measure-l" style="margin-top:3rem">
      ${news.length ? news.map(p => newsEntry(p)).join('') : '<p>Nothing yet.</p>'}
    </div>
  </div>
</section>`;
  return layout({
    title: `News | ${site.name}`,
    description: 'Release notes and breakage notices for the Quite Apps extensions, newest first.',
    path: '/news/',
    og: ogSet.has('default') ? 'default' : null,
    jsonld: {
      '@context': 'https://schema.org', '@type': 'Blog',
      name: `${site.name} news`, url: abs('/news/'),
      publisher: { '@type': 'Organization', name: site.name, url: BASE },
      blogPost: news.map(p => ({
        '@type': 'BlogPosting',
        headline: p.title,
        datePublished: p.date,
        ...(p.updated ? { dateModified: p.updated } : {}),
        url: abs(`/news/${p.id}/`),
        author: { '@type': 'Organization', name: site.name },
      })),
    },
    main,
  });
}

/**
 * RSS 2.0, full text rather than teasers.
 *
 * A feed that carries an excerpt makes the reader fetch the page to learn
 * anything, which defeats the point for the one audience most likely to use it:
 * someone whose extension just broke and who wants to know why without opening
 * a browser tab. guid is the permalink and never changes once published, so
 * editing a post in place updates the entry rather than creating a second one.
 */
const rssDate = (d) => new Date(`${d}T09:00:00Z`).toUTCString();

function feed() {
  const items = news.map(p => {
    const url = abs(`/news/${p.id}/`);
    const html = [
      ...(p.body || []).map(t => `<p>${esc(t)}</p>`),
      ...((p.works || []).length
        ? [`<p><strong>What still works</strong></p><ul>${p.works.map(w => `<li>${esc(w)}</li>`).join('')}</ul>`]
        : []),
      ...(p.updated ? [`<p><em>Updated ${fmtDate(p.updated)}</em></p>`] : []),
    ].join('');
    return `  <item>
    <title>${esc(p.title)}</title>
    <link>${url}</link>
    <guid isPermaLink="true">${url}</guid>
    <pubDate>${rssDate(p.updated || p.date)}</pubDate>
    <description><![CDATA[${html}]]></description>
  </item>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>${esc(site.name)}</title>
  <link>${abs('/news/')}</link>
  <atom:link href="${abs('/news/feed.xml')}" rel="self" type="application/rss+xml"/>
  <description>Release notes and breakage notices for the ${esc(site.name)} extensions.</description>
  <language>en-GB</language>
${news.length ? `  <lastBuildDate>${rssDate(news[0].updated || news[0].date)}</lastBuildDate>\n` : ''}${items}
</channel>
</rss>
`;
}

/* ------------------------------------------------------------- non-html */

const sitemap = () => {
  // lastmod must say when the page's CONTENT changed, not when the build ran.
  // Stamping today's date on every rebuild told crawlers all six pages changed
  // every time anything shipped, which makes the signal worthless — and it put a
  // "Last updated" on the privacy policy that moved without the policy moving.
  // The home page lists every extension, so it is as fresh as the freshest of
  // them or the site's own copy, whichever is later.
  const newest = (...d) => d.filter(Boolean).sort().pop();
  const home = newest(site.updated, ...exts.map(x => x.updated));
  const urls = [
    { loc: BASE + '/', pri: '1.0', mod: home },
    ...exts.map(x => ({ loc: abs(`/extensions/${x.slug}/`), pri: '0.8', mod: x.updated || site.updated })),
    ...(news.length ? [{ loc: abs('/news/'), pri: '0.6', mod: news[0].updated || news[0].date }] : []),
    ...news.map(p => ({ loc: abs(`/news/${p.id}/`), pri: '0.5', mod: p.updated || p.date })),
    { loc: abs('/contact/'), pri: '0.5', mod: site.updated },
    { loc: abs('/privacy/'), pri: '0.3', mod: site.privacyUpdated },
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.mod}</lastmod>
    <priority>${u.pri}</priority>
  </url>`).join('\n')}
</urlset>
`;
};

const robots = () => `# ${site.domain}
User-agent: *
Allow: /

Sitemap: ${abs('/sitemap.xml')}
`;

const favicon = () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
  <rect width="48" height="48" rx="10.56" fill="${site.accent}"/>
  <g fill="none" stroke="${site.markInk || '#f2f0f4'}" stroke-width="5.52">
    <circle cx="24" cy="24" r="11.52"/>
    <path d="M26.04 26.04 33.61 33.61"/>
  </g>
</svg>
`;

/** llms.txt — a plain-text map for AI crawlers and answer engines.
 *  Ignored by Google Search, but read by several assistants. Cheap to keep true. */
const llmsTxt = () => `# ${site.name}

> ${site.metaDescription}

${site.leadIn}

## Extensions

${exts.map(x => `- [${x.name}](${abs(`/extensions/${x.slug}/`)}): ${x.summary} ${x.price}, ${x.licence} licensed.${x.storeUrl ? ` Chrome Web Store: ${x.storeUrl}.` : ''}${x.githubUrl ? ` Source: ${x.githubUrl}` : ' Not yet released.'}
  - Permissions: ${[...(x.permissions || []), ...(x.hostPermissions || [])].map(p => p.name).join(', ')}
  - Version ${x.version}, updated ${fmtDate(x.updated)}. Runs on ${(site.browsers || []).join(', ')}.`).join('\n')}

## How the extensions are distributed

Not on the Chrome Web Store. They install unpacked: download the folder from
GitHub, open chrome://extensions, turn on Developer mode, and use Load unpacked.

## Privacy

- [Privacy](${abs('/privacy/')}): No analytics, no cookies, no accounts, no servers.
  Each extension runs only on the single site it is for and stores nothing beyond
  your own settings, in your own browser.

## Contact

- Email: ${site.email}
- Support: ${site.supportEmail}
- Source: ${site.github}
`;

const htaccess = () => `# ${site.domain} — 20i (Apache / LiteSpeed)

Options -Indexes
DirectoryIndex index.html index.php

# A git checkout in the document root would otherwise expose .git to the world,
# and the whole history with it. Deny it regardless of how the site got here.
RedirectMatch 404 /\\.git(/|$)
<FilesMatch "^\\.(git|gitignore|gitattributes|env)">
  Require all denied
</FilesMatch>
ErrorDocument 404 /404.html

<IfModule mod_rewrite.c>
  RewriteEngine On

${site.forceHttps ? `  # Force HTTPS
  RewriteCond %{HTTPS} !=on
  RewriteCond %{HTTP:X-Forwarded-Proto} !https
  RewriteRule ^(.*)$ https://${site.domain}/$1 [R=301,L]
` : `  # HTTPS redirect is OFF because ${site.domain} has no certificate yet.
  # Turn on free SSL in StackCP, confirm https://${site.domain} loads clean,
  # then set "forceHttps": true in data/site.json, rebuild, and re-upload.
  # Enabling this before the certificate exists sends every visitor into a
  # browser security warning.
  #
  # RewriteCond %{HTTPS} !=on
  # RewriteCond %{HTTP:X-Forwarded-Proto} !https
  # RewriteRule ^(.*)$ https://${site.domain}/$1 [R=301,L]
`}
  # Canonical host: strip www.
  RewriteCond %{HTTP_HOST} ^www\\.(.+)$ [NC]
  RewriteRule ^(.*)$ ${site.sslLive ? 'https' : '%{REQUEST_SCHEME}'}://%1/$1 [R=301,L]

  # Canonical URLs: add a trailing slash to directories
  RewriteCond %{REQUEST_FILENAME} -d
  RewriteCond %{REQUEST_URI} !/$
  RewriteRule ^(.*)$ /$1/ [R=301,L]

  # Never expose /index.html
  RewriteCond %{THE_REQUEST} \\s/(.*/)?index\\.html[\\s?] [NC]
  RewriteRule ^(.*)index\\.html$ /$1 [R=301,L]
</IfModule>

# Apache maps .xml to text/xml, which some readers refuse. Scoped to the feed
# by name so sitemap.xml keeps its own type.
<Files "feed.xml">
  ForceType application/rss+xml
</Files>

<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/css text/plain text/xml \\
    application/javascript application/json application/xml image/svg+xml
</IfModule>

<IfModule mod_expires.c>
  ExpiresActive On
  ExpiresByType text/css      "access plus 1 year"
  ExpiresByType image/svg+xml "access plus 1 year"
  ExpiresByType image/png     "access plus 6 months"
  ExpiresByType text/html     "access plus 1 hour"
</IfModule>

<IfModule mod_headers.c>
  Header always set X-Content-Type-Options "nosniff"
  Header always set Referrer-Policy "strict-origin-when-cross-origin"
  Header always set Permissions-Policy "geolocation=(), microphone=(), camera=()"
${site.sslLive ? `  Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"
` : `  # HSTS omitted until SSL is live.
`}  Header always set Content-Security-Policy "default-src 'self'; img-src 'self' data:; style-src 'self'; font-src 'self'; script-src 'self' 'unsafe-inline'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
  <FilesMatch "\\.(css|svg|png|jpe?g|woff2?)$">
    Header set Cache-Control "public, max-age=31536000, immutable"
  </FilesMatch>
</IfModule>
`;

/* ------------------------------------------------------------------ run */

console.log(`\nBuilding ${site.domain} — ${exts.length} extensions\n`);
rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

console.log('  · rendering social images');
const ogSet = renderOgImages();

write('index.html', homePage(ogSet));
for (const x of exts) write(`extensions/${x.slug}/index.html`, extPage(x, ogSet));
write('contact/index.php', contactPage(ogSet));
write('news/index.html', newsPage(ogSet));
for (const p of news) write(`news/${p.id}/index.html`, newsPostPage(p, ogSet));
write('news/feed.xml', feed());
write('privacy/index.html', privacyPage(ogSet));
write('404.html', notFoundPage());
write('styles.css', CSS_TEXT);
write('sitemap.xml', sitemap());
write('robots.txt', robots());
write('llms.txt', llmsTxt());
write('favicon.svg', brandFile('favicon.svg') ? readFileSync(brandFile('favicon.svg'), 'utf8') : favicon());
write('.htaccess', htaccess());
// No visible twin in dist/: deploys are via git now, and anything in dist/ is
// served, which would publish the server config at /htaccess.txt.

console.log('  · index.html');
exts.forEach(x => console.log(`  · extensions/${x.slug}/index.html`));
console.log('  · contact/, privacy/, 404.html, styles.css, sitemap.xml, robots.txt, llms.txt, favicon.svg, .htaccess');
console.log(`  · og images: ${ogSet.size ? [...ogSet].join(', ') : 'none'}`);
console.log('\nDone. Upload the contents of dist/ to public_html on 20i.\n');
