# quiteapps.co.uk

A static site for Quite Apps: a home page plus one page per Chrome extension.
Built to the apple.com style guide. No framework, no dependencies, no build
toolchain beyond Node.

## Build

```
node build.mjs
```

Writes `dist/`. Upload the **contents** of `dist/` into `public_html` on 20i
(including the dotfile `.htaccess` — most FTP clients hide it by default).

## Adding or changing an extension

Everything on the site comes from two files:

- `data/site.json` — studio name, taglines, principles, contact, browser list
- `data/extensions.json` — one object per extension

Edit `data/extensions.json` and re-run the build. Pages, navigation, the
"Also from Quite Apps" tiles, `sitemap.xml`, breadcrumbs and all structured
data regenerate. Adding a fourth extension needs no code change.

### Fields

Distribution is **GitHub, unpacked** — neither extension is on the Chrome Web
Store — so the CTAs point at releases and source, not at a store listing.

| Field | Notes |
|---|---|
| `slug` | URL segment — `/extensions/<slug>/`. Keep stable once live. |
| `name`, `shortName`, `tagline`, `summary` | `name` is the manifest name. `shortName` is used in the footer. |
| `metaDescription` | The `<meta name="description">`. Aim for 140–158 characters. |
| `accent` | Hex. Drives the icon, the artwork tint and per-page theming. A lightened variant is derived for dark backgrounds. |
| `icon` | An SVG path on a 24×24 grid, stroked. |
| `githubUrl` | Repository. Always shown as "View the source". |
| `releaseUrl` | Release page. **When empty the CTA falls back to the repo** and reads "Get it on GitHub" — cut a release and fill this in. |
| `version` | The version a visitor can actually **download**, not necessarily the repo manifest version. See `_versionNotes` in the data file. |
| `licence` | Shown on tiles, pills and the spec table, and emitted as an SPDX URL in schema. |
| `permissions` | `[{name, why}]` — the manifest `permissions`. |
| `hostPermissions` | `[{name, why}]` — the manifest `host_permissions`. Rendered in the same table; this is the one users actually care about. |
| `options` | `[{name, default, what}]` — mirrors the popup. Drives the "Every setting" table. `default` must be `On` or `Off`. |
| `reloadTarget` | Site name used in the last install step ("Reload any **YouTube** tab"). |
| `features`, `faq` | Any number. The FAQ also emits `FAQPage` structured data. |
| `stats` | `[{value, label}]`, up to 3. The "ALL TIME" counts drawn in the popup artwork. **Facebook's are real; YouTube's are placeholders** — replace them. Columns space themselves evenly and the numerals step down a size for long values (25px → 23px at 4 chars → 21px at 5+), so counts of different magnitudes stay visually matched. Labels clip at 13 characters — keep them short. |
| `popupSub` | The one-line subtitle under the master toggle in the popup artwork. |
| `screenshots` | `[{src, alt}]`. When empty, the popup artwork is drawn from `options` + `stats`. Supplying real 1280×800 shots replaces it with a scrolling strip. |

The **popup artwork** is generated SVG, not an image — it draws the extension's
own popup from `options`, `stats`, `version` and `accent`, so it stays correct
when you change a default or a count, and it re-themes for light and dark. It
appears on the home tiles (bleeding off the bottom edge) and centred in the
extension page hero.

`site.donate` adds the Buy Me a Coffee link — a band on the home page, a line
under each install button, and a footer entry. Remove the key and all three
disappear.

Install steps are shared in `site.json` and **rendered as raw HTML**, so `<b>`
and `<code>` work there. Step one is chosen per extension: `installFirstRelease`
when `releaseUrl` is set, `installFirstZip` (Code → Download ZIP) when it is not.
The last step is generated from `reloadTarget`.

**Checking versions:** use the GitHub **API**, not `raw.githubusercontent.com` —
raw is served through a CDN that can return a stale manifest for a long while
after a push, which is how the wrong version numbers got in here once already.

```
curl -s "https://api.github.com/repos/KingDogma23/<repo>/contents/manifest.json?ref=main" \
  | python3 -c "import json,sys,base64;m=json.loads(base64.b64decode(json.load(sys.stdin)['content']));print(m['name'],m['version'])"
```

## What the build produces

```
dist/
  index.html                      home
  extensions/<slug>/index.html    one per extension
  privacy/index.html              site + per-extension privacy, UK GDPR
  404.html                        wired up via .htaccess
  styles.css                      hash-busted (?v=…) in every page
  og/<slug>.png                   1200×630 social cards, rendered by headless Chrome
  apple-touch-icon.png, favicon.svg
  sitemap.xml, robots.txt, .htaccess
```

## SEO

Every page carries:

- A unique `<title>` (≤60 chars) and `description` (140–158 chars), written to
  lead with search intent rather than the brand — `metaTitle` / `metaDescription`
  per extension, overriding the generated defaults
- A canonical URL, and `robots: index, follow, max-image-preview:large,
  max-snippet:-1, max-video-preview:-1`. The 404 is `noindex, follow`
- Open Graph + Twitter cards with real 1200×630 images generated at build time
- A visible breadcrumb that matches the `BreadcrumbList` markup
- One `h1`, headings that never skip a level, and a labelled `role="img"` on
  every piece of artwork

Structured data:

| Page | Nodes |
|---|---|
| Home | `Organization` (with `contactPoint`, `sameAs`), `WebSite`, `ItemList` |
| Extension | `SoftwareApplication` as `BrowserApplication` — with `offers`, `license`, `codeRepository`, `installUrl`, `softwareHelp`, `featureList`, `screenshot`, `permissions`, `browserRequirements` — plus `BreadcrumbList` and `FAQPage` |
| Privacy / 404 | `WebPage` |

`aggregateRating` is deliberately absent. It only appears if you add real
`rating` + `ratingCount`; fabricated review markup risks a manual action.

Also generated: `sitemap.xml` (canonical host, per-page `lastmod`, 404 excluded),
`robots.txt` pointing at it, and `llms.txt` — a plain-text site map for AI
answer engines, built from the same data so it cannot drift.

Performance, which is the part most static sites get wrong: no webfonts, no
external scripts, no third-party requests at all, so nothing blocks first paint.
Artwork is inline SVG rather than images. Largest page is 35 kB.

To re-run the audit after changing content:

```
node build.mjs && node audit.mjs
```

## The `.htaccess`

Forces HTTPS, strips `www`, adds trailing slashes, hides `/index.html`, sets the
404 document, enables compression and long cache lifetimes, and sends HSTS,
CSP, `X-Content-Type-Options`, `Referrer-Policy` and `Permissions-Policy`.

If you point the domain at 20i before DNS has propagated, comment out the HTTPS
redirect until the SSL certificate is issued, or you will redirect-loop.

## Type

Set in the system font — SF on Apple devices, Segoe/Roboto/Helvetica elsewhere.
That is what apple.com does, it costs zero network requests, and it removes the
Google Fonts privacy caveat entirely.
