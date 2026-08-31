"""
Chrome Web Store artwork for all three Quite extensions, drawn by one program.

Why one program: the three extensions had grown three different sets of store
art — two hand-made shots each for YouTube and Facebook, three generated ones
for Cookies, with different panel styling and different headline metrics. On a
publisher page they sat next to each other and did not look like one studio.
Everything here comes off the same helpers, so they cannot drift again.

The counters show real usage rather than a fresh install's zeros. The Facebook
figures (213/313/65) and the Cookies figures (357/45/228) are measured; the
YouTube figures are placeholders, flagged as such in data/extensions.json.

Two things worth knowing before editing:
  - Everything is drawn at 2x and downsampled once at the end. Text hinted at
    final size looks thin and ragged next to text supersampled from 2x.
  - SFNS variable-font weights are set BY NAME. Its axis order is Width,
    Optical Size, GRAD, Weight, so set_variation_by_axes([700]) silently sets
    the width axis and leaves the weight alone.

Run from the project root:  python3 tools/make-shots.py
"""
import json
import os
import sys
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILDS = "/Applications/Claude Folder"

K = 2                                        # supersampling factor
SF = "/System/Library/Fonts/SFNS.ttf"
MONO = "/System/Library/Fonts/SFNSMono.ttf"
WEIGHTS = {400: "Regular", 500: "Medium", 600: "Semibold", 700: "Bold"}
_fonts = {}


def f(size, weight=400, mono=False):
    key = (round(size * K), weight, mono)
    if key not in _fonts:
        font = ImageFont.truetype(MONO if mono else SF, round(size * K))
        if not mono:
            try:
                font.set_variation_by_name(WEIGHTS.get(weight, "Regular"))
            except Exception:
                pass
        _fonts[key] = font
    return _fonts[key]


class Scaled:
    """Draws in logical units onto a surface that is K times bigger."""

    def __init__(self, img):
        self.d = ImageDraw.Draw(img)

    def _p(self, box):
        return [v * K for v in box]

    def rectangle(self, box, **kw):
        self.d.rectangle(self._p(box), **kw)

    def rounded_rectangle(self, box, radius=0, **kw):
        self.d.rounded_rectangle(self._p(box), radius=radius * K, **kw)

    def ellipse(self, box, width=None, **kw):
        if width is not None:
            kw["width"] = max(1, round(width * K))
        self.d.ellipse(self._p(box), **kw)

    def line(self, box, width=1, **kw):
        self.d.line(self._p(box), width=max(1, round(width * K)), **kw)

    def text(self, xy, s, font, fill, anchor="la"):
        self.d.text([xy[0] * K, xy[1] * K], s, font=font, fill=fill, anchor=anchor)

    def textlength(self, s, font):
        return self.d.textlength(s, font=font) / K

    def fit(self, s, font, max_w):
        if self.textlength(s, font) <= max_w:
            return s
        while s and self.textlength(s + "…", font) > max_w:
            s = s[:-1]
        return s + "…"


# --------------------------------------------------------------- palette

class Theme:
    """One accent, one dark ground. Everything else is shared, which is what
    makes three products read as one studio."""

    FG, MUTED, DIM = "#eef3f8", "#94a6b5", "#c9d6e0"

    def __init__(self, accent, ground, card, sunk, line):
        self.accent, self.ground = accent, ground
        self.card, self.sunk, self.line = card, sunk, line


THEMES = {
    "quite-for-youtube": Theme("#35b98c", "#0d1512", "#141d19", "#1a2622", "#25332d"),
    "quite-for-facebook": Theme("#e0a341", "#0f0e13", "#17161c", "#1e1d25", "#2b2933"),
    "quite-for-cookies": Theme("#55a8e8", "#0f151b", "#141c24", "#1a242e", "#253039"),
}

PW = 320                                     # logical popup width


def canvas(w, h, colour):
    img = Image.new("RGB", (w * K, h * K), colour)
    return img, Scaled(img)


def mark(size, colour):
    """The Quite ring-and-tail, drawn on the 48-unit grid the icons use."""
    # Drawn on a canvas twice the final size and halved, so the ring's curve
    # supersamples the same way the text does.
    s = size / 48 * K * 2
    img = Image.new("RGBA", (size * K * 2, size * K * 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = 8.68 * s          # measured off the shipped PNGs; 11.52 hides the tail
    d.ellipse([(24 * s) - r, (24 * s) - r, (24 * s) + r, (24 * s) + r],
              outline=colour, width=round(5.52 * s))
    d.line([26.04 * s, 26.04 * s, 33.61 * s, 33.61 * s], fill=colour, width=round(5.52 * s))
    return img.resize((size * K, size * K), Image.LANCZOS)


# ------------------------------------------------------------ popup parts

def p_header(d, t, name, ver):
    m = mark(15, t.accent)
    d.d._image.paste(m, (14 * K, 15 * K), m)
    head, tail = name.split(" ", 1) if " " in name else (name, "")
    d.text((38, 15), head, f(13, 700), t.FG)
    d.text((38 + d.textlength(head + " ", f(13, 700)), 15), tail, f(13), t.FG)
    d.text((PW - 14, 16), ver, f(10), t.MUTED, "ra")
    d.line([0, 42, PW, 42], fill=t.line)
    return 43


def p_state(d, t, y, title, sub, toggle=True):
    d.text((14, y + 11), title, f(12, 700), t.FG)
    d.text((14, y + 28), sub, f(10.5), t.MUTED)
    if toggle:
        d.rounded_rectangle([PW - 60, y + 14, PW - 14, y + 38], radius=12, fill=t.accent)
        d.ellipse([PW - 36, y + 16, PW - 16, y + 36], fill="#ffffff")
    d.line([0, y + 52, PW, y + 52], fill=t.line)
    return y + 53


def p_stats(d, t, y, caption, items):
    d.rectangle([0, y, PW, y + 64], fill=t.sunk)
    d.text((PW / 2, y + 9), caption, f(9, 500), t.MUTED, "ma")
    # Long values step down a size so a five-character count reads the same as
    # a two-character one instead of crowding its neighbours.
    longest = max(len(str(v)) for v, _ in items)
    size = 17 if longest > 5 else 19 if longest > 4 else 21
    for i, (n, lab) in enumerate(items):
        cx = PW / 6 + i * PW / 3
        d.text((cx, y + 22), n, f(size, 700), t.FG, "ma")
        d.text((cx, y + 48), d.fit(lab, f(9), PW / 3 - 8), f(9), t.MUTED, "ma")
    d.line([0, y + 64, PW, y + 64], fill=t.line)
    return y + 65


def p_coffee(d, t, y):
    d.rectangle([0, y, PW, y + 26], fill=t.card)
    lead = "Free, and staying that way. "
    w = d.textlength(lead, f(9.5)) + d.textlength("buy me a coffee", f(9.5, 700))
    x = (PW - w) / 2
    d.text((x, y + 8), lead, f(9.5), t.MUTED)
    d.text((x + d.textlength(lead, f(9.5)), y + 8), "buy me a coffee", f(9.5, 700), t.DIM)
    d.line([0, y + 26, PW, y + 26], fill=t.line)
    return y + 27


def p_tick(d, t, x, y, on):
    d.rounded_rectangle([x, y, x + 11, y + 11], radius=2.5,
                        fill=t.accent if on else None,
                        outline=t.accent if on else t.MUTED)
    if on:
        d.line([x + 2.8, y + 5.6, x + 4.8, y + 8], fill=t.ground, width=1.7)
        d.line([x + 4.8, y + 8, x + 8.4, y + 3], fill=t.ground, width=1.7)


def p_row(d, t, y, name, meta, on, tag=None, mono=False):
    p_tick(d, t, 14, y + 12, on)
    d.text((36, y + 7), name, f(11.5, 600, mono=mono), t.FG)
    if tag:
        tx = 36 + d.textlength(name, f(11.5, 600, mono=mono)) + 8
        tw = d.textlength(tag, f(8.5, 600))
        d.rounded_rectangle([tx, y + 7, tx + tw + 11, y + 21], radius=4, fill="#2a2113")
        d.text((tx + 5.5, y + 9), tag, f(8.5, 600), "#e0a341")
    d.text((36, y + 24), d.fit(meta, f(10), PW - 50), f(10), t.MUTED)
    d.line([0, y + 44, PW, y + 44], fill=t.line)
    return y + 45


def p_note(d, t, y, lines):
    for line in lines:
        d.text((PW / 2, y), line, f(8.5), t.MUTED, "ma")
        y += 13
    return y + 6


# --------------------------------------------------------------- the panels

def panel_toggles(x, t, rows=None, note=None):
    """YouTube and Facebook: a master switch, the counters, then the options."""
    img, d = canvas(PW, 760, t.card)
    opts = x["options"]
    rows = rows if rows is not None else [
        (o["name"], o["what"].rstrip("."), o["default"].lower() == "on") for o in opts[1:7]
    ]
    y = p_header(d, t, x["name"], "v" + x["version"])
    y = p_state(d, t, y, "Protection on", x["popupSub"])
    y = p_stats(d, t, y, x.get("statsCaption", "ALL TIME"),
                [(s["value"], s["label"]) for s in x["stats"]])
    y = p_coffee(d, t, y)
    for name, meta, on in rows:
        y = p_row(d, t, y, name, meta, on)
    if note:
        y = p_note(d, t, y + 8, note)
    return img.crop((0, 0, PW * K, (y + 6) * K))


def panel_site(x, t):
    """Cookies, per-site: what this one site stored, and what will go."""
    img, d = canvas(PW, 760, t.card)
    y = p_header(d, t, x["name"], "v" + x["version"])
    y = p_state(d, t, y, x["popupSite"], x["popupSub"], toggle=False)
    y = p_stats(d, t, y, x["statsCaption"], [(s["value"], s["label"]) for s in x["stats"]])
    y = p_coffee(d, t, y)

    d.rectangle([0, y, PW, y + 38], fill="#2a2113")
    d.text((14, y + 7), "Keeping the cookies that hold your sign-in,", f(10), "#e0a341")
    d.text((14, y + 21), "so you'll stay logged in to bbc.co.uk.", f(10), "#e0a341")
    y += 38

    d.rectangle([0, y, PW, y + 20], fill=t.sunk)
    d.text((14, y + 5), "COOKIES", f(9.5, 600), t.MUTED)
    y += 20
    for name, meta, on, tag in [
        (".bbc.co.uk", "17 cookies · 3.7 KB", False, "2 sign-in"),
        ("www.bbc.co.uk", "3 cookies · 123 B", True, None),
        (".session.bbc.co.uk", "2 cookies · 3.0 KB", False, "2 sign-in"),
    ]:
        y = p_row(d, t, y, name, meta, on, tag, mono=True)

    d.rectangle([0, y, PW, y + 20], fill=t.sunk)
    d.text((14, y + 5), "SITE DATA", f(9.5, 600), t.MUTED)
    y += 20
    y = p_row(d, t, y, "www.bbc.co.uk", "46 items local storage (9.7 KB) · 4 caches",
              True, mono=True)

    y += 10
    lead = "Can read cookies on "
    d.text((14, y), lead, f(10), t.MUTED)
    d.text((14 + d.textlength(lead, f(10)), y), "bbc.co.uk", f(10, 700), t.FG)
    d.text((PW - 14, y), "Allow every site", f(10, 600), t.accent, "ra")
    y += 22
    d.rounded_rectangle([14, y, PW - 14, y + 34], radius=9, fill=t.accent)
    d.text((PW / 2, y + 9), "Remove 3 cookies and site data", f(11.5, 600), t.ground, "ma")
    return img.crop((0, 0, PW * K, (y + 48) * K))


def panel_sweep(x, t):
    """Cookies, whole browser: the second tab, sweeping every site at once."""
    img, d = canvas(PW, 700, t.card)
    y = p_header(d, t, x["name"], "v" + x["version"])
    y = p_state(d, t, y, "Every site", "1,847 cookies across 312 sites", toggle=False)
    y = p_stats(d, t, y, x["statsCaption"], [(s["value"], s["label"]) for s in x["stats"]])
    y = p_coffee(d, t, y)
    for name, meta, on in [
        ("Trackers only", "Advertising and analytics. Cannot sign you out.", True),
        ("Everything", "All cookies and site data. Will sign you out.", False),
        ("Keep sites I have protected", "9 sites on your list", True),
        ("Include other companies’ cookies", "Set by domains the pages loaded", False),
    ]:
        y = p_row(d, t, y, name, meta, on)
    y += 12
    d.rounded_rectangle([14, y, PW - 14, y + 34], radius=9, fill=t.accent)
    d.text((PW / 2, y + 9), "Remove 1,204 tracking cookies", f(11.5, 600), t.ground, "ma")
    return img.crop((0, 0, PW * K, (y + 48) * K))


def panel_proof(x, t):
    """Cookies, after the fact: counted again, and reported honestly."""
    img, d = canvas(PW, 700, t.card)
    y = p_header(d, t, x["name"], "v" + x["version"])
    y = p_state(d, t, y, "Done", "Counted again, not assumed", toggle=False)
    y = p_stats(d, t, y, "THIS RUN",
                [("22", "Removed"), ("0", "Left behind"), ("3", "Set again")])
    y = p_coffee(d, t, y)
    for name, meta, on in [
        ("22 cookies removed", "Confirmed gone by re-reading the browser", True),
        ("Site data cleared", "Local storage, databases, caches, workers", True),
        ("3 set again by the page", "bbc.co.uk is still open in a tab", False),
        ("2 sign-in cookies kept", "You are still logged in", True),
    ]:
        y = p_row(d, t, y, name, meta, on)
    y = p_note(d, t, y + 10,
               ["Every number here comes from reading the browser a",
                "second time. Nothing is reported as gone on trust."])
    return img.crop((0, 0, PW * K, (y + 6) * K))


def panel_auto(x, t):
    """Cookies 0.20: the sweep that runs on its own when a tab closes."""
    img, d = canvas(PW, 720, t.card)
    y = p_header(d, t, x["name"], "v" + x["version"])
    y = p_state(d, t, y, "Every site", "Clearing sites as you close them", toggle=False)
    y = p_stats(d, t, y, x["statsCaption"], [(s["value"], s["label"]) for s in x["stats"]])
    y = p_coffee(d, t, y)
    for name, meta, on in [
        ("Clear a site when I close its last tab", "Runs on its own, in the background", True),
        ("Keep sign-in cookies when it does", "Leaves anything that looks like a login", True),
        ("Also clear stored site data", "Stops trackers putting the same cookie back", False),
    ]:
        y = p_row(d, t, y, name, meta, on)

    # The worker runs where nobody can watch it, so the popup reports its last
    # run. Showing that line is the whole point of the feature.
    d.rectangle([0, y, PW, y + 34], fill=t.sunk)
    d.text((14, y + 7), "Last sweep", f(9.5, 600), t.MUTED)
    d.text((14, y + 20), "bbc.co.uk, 22 cookies removed, 2 sign-ins kept, 4 minutes ago",
           f(9), t.DIM)
    y += 34
    d.line([0, y, PW, y], fill=t.line)
    y = p_note(d, t, y + 12,
               ["A sweep that removed nothing says so. It is never",
                "left looking the same as one that worked."])
    return img.crop((0, 0, PW * K, (y + 6) * K))


# ------------------------------------------------------- the 1280x800 shots

def shot(path, t, headline, bullets, panel):
    W, H = 1280, 800
    img, d = canvas(W, H, t.ground)
    m = mark(56, t.accent)
    img.paste(m, (90 * K, 92 * K), m)
    d.text((162, 100), "Quite Apps", f(22, 500), Theme.MUTED)

    y = 196
    for line in headline:
        d.text((90, y), line, f(52, 700), Theme.FG)
        y += 70
    y += 30
    for b in bullets:
        d.ellipse([94, y + 9, 102, y + 17], fill=t.accent)
        d.text((122, y), b, f(19), Theme.DIM)
        y += 50

    # The panel sits on a slightly lighter plate so it reads as a window on the
    # ground rather than a hole in it.
    x = (W - panel.width // K - 92) * K
    py = (H * K - panel.height) // 2
    ImageDraw.Draw(img).rounded_rectangle(
        [x - 12 * K, py - 12 * K, x + panel.width + 12 * K, py + panel.height + 12 * K],
        radius=16 * K, fill=t.sunk)
    img.paste(panel, (x, py))
    img.resize((W, H), Image.LANCZOS).save(path)
    return path


def tile(path, t, size, headline, sub, panel=None):
    W, H = size
    img, d = canvas(W, H, t.ground)
    m = mark(round(H * 0.16), t.accent)
    img.paste(m, (round(W * 0.07) * K, round(H * 0.14) * K), m)
    x = round(W * 0.07)
    y = round(H * 0.14) + m.height // K + round(H * 0.07)
    d.text((x, y), headline, f(round(H * 0.105), 700), Theme.FG)
    d.text((x, y + round(H * 0.15)), sub, f(round(H * 0.052)), Theme.MUTED)
    if panel:
        # A panel taller than the tile bleeds off both edges and reads as a
        # cropping accident rather than a design. Scale it to fit with a margin.
        margin = round(H * 0.07) * K
        if panel.height > H * K - 2 * margin:
            s = (H * K - 2 * margin) / panel.height
            panel = panel.resize((round(panel.width * s), round(panel.height * s)), Image.LANCZOS)
        img.paste(panel, (W * K - panel.width - round(W * 0.05) * K, (H * K - panel.height) // 2))
    img.resize((W, H), Image.LANCZOS).save(path)
    return path


# --------------------------------------------------------------- the copy

TM = {
    "quite-for-youtube": ["YouTube™ is a trademark of Google LLC. This extension is independent",
                          "and is not affiliated with, endorsed by or sponsored by them."],
    "quite-for-facebook": ["Facebook™ is a trademark of Meta Platforms, Inc. This extension is",
                           "independent and is not affiliated with, endorsed by or sponsored by them."],
}

PLAN = {
    "quite-for-youtube": {
        "dir": "yt-ad-cleaner",
        "tile": ("Quite for YouTube", "Ads out of YouTube."),
        "shots": [
            ("01-ads-out-of-youtube", ["Ads out of", "YouTube."],
             ["Video ads skipped as they appear",
              "Feed, sidebar and search ads hidden",
              "Overlay banners dismissed"], "main"),
            ("02-stopped-at-source", ["Stopped at source,", "not faked."],
             ["The ad schedule is never issued in the first place",
              "Nothing is edited after the fact, so nothing mismatches",
              "Which is why the anti-adblock wall stays down"], "alt"),
            ("03-no-account-no-tracking", ["One permission.", "No tracking."],
             ["Storage, to remember your six checkboxes",
              "Runs on youtube.com and nowhere else",
              "No account, no server, MIT licensed"], "min"),
        ],
    },
    "quite-for-facebook": {
        "dir": "fb-feed-cleaner",
        "tile": ("Quite for Facebook", "A feed of people you know."),
        "shots": [
            ("01-a-quieter-feed", ["A feed of the people", "you actually know."],
             ["Sponsored posts hidden as the feed loads",
              "Suggested pages and groups gone",
              "The Sponsored column removed"], "main"),
            ("02-hidden-as-it-loads", ["Hidden as it loads,", "not after."],
             ["Posts never paint, so nothing flickers away",
              "Keeps working as the feed scrolls",
              "A placeholder strip instead, if you prefer"], "alt"),
            ("03-nothing-hidden", ["One permission.", "No tracking."],
             ["Storage, to remember your six checkboxes",
              "Runs on facebook.com and nowhere else",
              "No account, no server, MIT licensed"], "min"),
        ],
    },
    "quite-for-cookies": {
        "dir": "cookie-cleaner",
        "tile": ("Quite for Cookies", "Close the tab. It is cleared."),
        "shots": [
            ("01-see-it-before-you-delete-it", ["See exactly what's", "there. Then delete it."],
             ["Every cookie listed, grouped by who set it",
              "Sign-in cookies kept unless you say otherwise",
              "Untick a domain and it is genuinely spared"], "site"),
            ("02-close-the-tab-and-it-is-cleared", ["Close the tab.", "The site is cleared."],
             ["Runs on its own, in the background",
              "Sign-ins kept, and sites you spare are never touched",
              "Chrome's own setting waits for the whole browser to close"], "auto"),
            ("03-then-check-that-it-went", ["Then check", "that it went."],
             ["Counts again after deleting, and reports it",
              "Says plainly what it could not remove",
              "No access to any site until you ask"], "proof"),
        ],
    },
}

# Three shots of one popup would otherwise be three copies of the same picture.
# Each of these is a state a user can genuinely put the extension in — everything
# on, and the pared-back set — so the carousel shows range without inventing UI.
MIN_ROWS = {
    "quite-for-youtube": [
        ("Stop ads loading", "Asks YouTube for the video in a way that comes back without ads", True),
        ("Skip video ads", "Clicks Skip, fast-forwards unskippable ones", True),
        ("Hide feed & search ads", "Homepage, sidebar, search, Shorts, masthead", False),
        ("Hide player overlays", "Banners on top of the video", False),
        ("Hide merch shelves", "Product shelves under videos", False),
        ("Status badge", "Troubleshooting overlay on the page", False),
    ],
    "quite-for-facebook": [
        ("Hide ads", "Posts marked “Sponsored” or “Ad”", True),
        ("Hide suggested posts", "Pages you don’t follow, pushed into your feed", False),
        ("Hide suggested groups", "Groups you’re not a member of", False),
        ("Hide the Sponsored column", "The ad panel on the right, above your contacts", True),
        ("Strict mode", "Only hide posts also marked “Suggested for you”", True),
        ("Show a placeholder", "Leave a strip with a Show button instead of removing", True),
    ],
}

ALT_ROWS = {
    "quite-for-youtube": [
        ("Stop ads loading", "Asks YouTube for the video in a way that comes back without ads", True),
        ("Skip video ads", "Clicks Skip, fast-forwards unskippable ones", True),
        ("Hide feed & search ads", "Homepage, sidebar, search, Shorts, masthead", True),
        ("Hide player overlays", "Banners on top of the video", True),
        ("Hide merch shelves", "Product shelves under videos", True),
        ("Status badge", "Troubleshooting overlay on the page", True),
    ],
    "quite-for-facebook": [
        ("Hide ads", "Posts marked “Sponsored” or “Ad”", True),
        ("Hide suggested posts", "Pages you don’t follow, pushed into your feed", True),
        ("Hide suggested groups", "Groups you’re not a member of", True),
        ("Hide the Sponsored column", "The ad panel on the right, above your contacts", True),
        ("Strict mode", "Only hide posts also marked “Suggested for you”", True),
        ("Show a placeholder", "Leave a strip with a Show button instead of removing", True),
    ],
}


def build_panel(kind, x, t):
    if kind == "site":
        return panel_site(x, t)
    if kind == "sweep":
        return panel_sweep(x, t)
    if kind == "proof":
        return panel_proof(x, t)
    if kind == "auto":
        return panel_auto(x, t)
    if kind == "alt":
        return panel_toggles(x, t, rows=ALT_ROWS[x["slug"]], note=TM.get(x["slug"]))
    if kind == "min":
        return panel_toggles(x, t, rows=MIN_ROWS[x["slug"]], note=TM.get(x["slug"]))
    return panel_toggles(x, t, note=TM.get(x["slug"]))


def main():
    exts = {e["slug"]: e for e in json.load(open(os.path.join(ROOT, "data/extensions.json")))["extensions"]}
    made = 0
    for slug, plan in PLAN.items():
        x, t = exts[slug], THEMES[slug]
        base = os.path.join(BUILDS, plan["dir"], "store")
        if not os.path.isdir(os.path.dirname(base)):
            print(f"  ! {plan['dir']} not found — skipped")
            continue
        out = os.path.join(base, "screenshots")
        os.makedirs(out, exist_ok=True)
        print(f"\n{x['name']}  →  {out}")
        for name, headline, bullets, kind in plan["shots"]:
            p = shot(os.path.join(out, name + ".png"), t, headline, bullets, build_panel(kind, x, t))
            print(f"    {name}.png  {os.path.getsize(p) // 1024} KB")
            made += 1
        hero, sub = plan["tile"]
        for fn, size, pan in [("promo-tile-440x280.png", (440, 280), None),
                              ("marquee-1400x560.png", (1400, 560), build_panel(plan["shots"][0][3], x, t))]:
            p = tile(os.path.join(base, fn), t, size, hero, sub, pan)
            print(f"    {fn}  {os.path.getsize(p) // 1024} KB")
            made += 1
    print(f"\n{made} assets, one set of helpers.")


if __name__ == "__main__":
    sys.exit(main())
