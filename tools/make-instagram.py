"""
Square cards for instagram.com/quite_apps.

Instagram crops to square (or 4:5) and shows no link on a post, so each card has
to stand alone: what the thing is, what it does for you, and the domain, because
the bio link is the only route off the platform.

Everything is drawn with the helpers in make-shots.py, so the grid, the store
screenshots and the site all render the same mark, the same accents and the same
popup panels. A fourth visual language would be one too many.

Run from the project root:  python3 tools/make-instagram.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from make_shots import K, f, Scaled, Theme, THEMES, mark, build_panel  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "social", "instagram")
S = 1080                       # logical square; drawn at S*K and downsampled
PARENT_GROUND, PARENT_INK = "#110f16", "#f2f0f4"


def square(ground):
    img = Image.new("RGB", (S * K, S * K), ground)
    return img, Scaled(img)


def wordmark(d, img, ink, accent, ground, y=72, domain=False):
    m = mark(52, accent)
    img.paste(m, (72 * K, y * K), m)
    d.text((140, y + 12), "Quite Apps", f(26, 600), ink)
    # The product cards bleed their panel over the footer, and a post carries no
    # link, so the domain rides up here instead of being lost.
    if domain:
        d.text((S - 72, y + 14), "quiteapps.co.uk", f(23), "#8b939c", "ra")


def headline(d, lines, ink, y, size=64, lead=80):
    for line in lines:
        d.text((72, y), line, f(size, 700), ink)
        y += lead
    return y


def body(d, lines, colour, y, size=25, lead=36):
    for line in lines:
        d.text((72, y), line, f(size), colour)
        y += lead
    return y


def footer(d, ink, muted):
    d.line([72, S - 108, S - 72, S - 108], fill=muted)
    d.text((72, S - 84), "quiteapps.co.uk", f(24, 600), ink)
    d.text((S - 72, S - 84), "Free · MIT · Open source", f(24), muted, "ra")


def card_panel(slug, lines, sub):
    """A product card: what it does, with its own popup bled off the bottom."""
    t = THEMES[slug]
    img, d = square(t.ground)
    wordmark(d, img, Theme.FG, t.accent, t.ground, domain=True)
    y = headline(d, lines, Theme.FG, 190)
    body(d, sub, Theme.DIM, y + 18)

    panel = build_panel("main" if slug != "quite-for-cookies" else "site",
                        EXT[slug], t)
    # Scale so the panel fills the lower half and bleeds off the bottom edge,
    # which is what makes it read as a product shot rather than a pasted image.
    target_w = 460
    scale = target_w * K / panel.width
    panel = panel.resize((round(panel.width * scale), round(panel.height * scale)), Image.LANCZOS)
    img.paste(panel, ((S * K - panel.width) // 2, round(560 * K)))
    return img


def card_text(ground, ink, accent, lines, sub, size=64, lead=80):
    img, d = square(ground)
    wordmark(d, img, ink, accent, ground)
    y = headline(d, lines, ink, 230, size=size, lead=lead)
    body(d, sub, "#9aa3ad", y + 26)
    footer(d, ink, "#5d646d")
    return img


def card_family():
    """The three marks together: this is a studio, not one extension."""
    img, d = square(PARENT_GROUND)
    wordmark(d, img, PARENT_INK, PARENT_INK, PARENT_GROUND)
    headline(d, ["Small extensions,", "quietly made."], PARENT_INK, 250)
    body(d, ["Three of them. Each does one job and then", "gets out of the way."],
         "#9aa3ad", 430)

    order = ["quite-for-youtube", "quite-for-facebook", "quite-for-cookies"]
    labels = ["for YouTube", "for Facebook", "for Cookies"]
    size, gap = 150, 46
    total = len(order) * size + (len(order) - 1) * gap
    x = (S - total) // 2
    for slug, label in zip(order, labels):
        t = THEMES[slug]
        d.rounded_rectangle([x, 610, x + size, 610 + size], radius=size * 0.22, fill=t.card)
        m = mark(round(size * 0.62), t.accent)
        img.paste(m, (round((x + size * 0.19) * K), round((610 + size * 0.19) * K)), m)
        d.text((x + size / 2, 610 + size + 18), label, f(21), "#9aa3ad", "ma")
        x += size + gap
    footer(d, PARENT_INK, "#5d646d")
    return img


EXT = {}


def main():
    global EXT
    data = json.load(open(os.path.join(ROOT, "data/extensions.json")))
    EXT = {e["slug"]: e for e in data["extensions"]}
    os.makedirs(OUT, exist_ok=True)

    cards = [
        ("1-family", card_family()),
        ("2-youtube", card_panel("quite-for-youtube",
            ["YouTube, without", "the advertising."],
            ["Skip is clicked the moment it appears, and the ad",
             "panels in your feed and sidebar never paint."])),
        ("3-facebook", card_panel("quite-for-facebook",
            ["A feed of people", "you actually know."],
            ["Sponsored posts, suggested pages and groups you",
             "never joined are taken out."])),
        ("4-cookies", card_panel("quite-for-cookies",
            ["See it before", "you delete it."],
            ["Every cookie a site stored, listed first. Delete only",
             "what you pick, then watch it check."])),
        ("5-privacy", card_text(PARENT_GROUND, PARENT_INK, PARENT_INK,
            ["No account.", "No server.", "Nothing sent", "to us."],
            ["Every permission is listed with the reason for it,",
             "on the extension's own page.",
             "",
             "Settings sync through Chrome's own extension sync,",
             "which is Google's, not ours."], size=58, lead=74)),
        ("6-source", card_text(PARENT_GROUND, PARENT_INK, PARENT_INK,
            ["You don't have", "to take our", "word for it."],
            ["All three are MIT licensed with the source public",
             "on GitHub. When something breaks we write it up,",
             "including the ones nobody reported."], size=58, lead=74)),
    ]
    for name, img in cards:
        p = os.path.join(OUT, f"{name}.png")
        img.resize((S, S), Image.LANCZOS).save(p, optimize=True)
        print(f"  {name}.png  {os.path.getsize(p)//1024} KB")
    print(f"\n  {len(cards)} cards in social/instagram/")
    print("  Post 6 first and 1 last, so the family card lands top-left.")


if __name__ == "__main__":
    main()
