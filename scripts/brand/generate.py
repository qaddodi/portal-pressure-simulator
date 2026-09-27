"""Brand assets: the mark (the portal confluence inside a liver), its monochrome and maskable
forms, and the wordmark lockups with outlined type.

    pip install fonttools brotli uharfbuzz
    python3 scripts/brand/generate.py        # writes brand/*.svg
    node scripts/brand/render-icons.mjs      # renders brand/icon-*.png from them

The mark is drawn on a 32-unit grid so it holds at 16 px: the superior mesenteric vein rises
from below, the splenic vein arrives from the patient's left, and from their confluence the
portal vein climbs obliquely to the hilum and divides into right and left branches in the
liver. Only the vessel carries the pressure colormap (high in the gut, low in the liver).
"""
import io
import re
from pathlib import Path
import uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'brand'
INTER = ROOT / 'fonts' / 'inter-latin.woff2'

LIVER = ('M3.2 11C3.2 6.9 7.4 4.6 13.8 4.6C20.2 4.6 25.9 5.2 29 6.6C29.6 6.9 29.4 7.7 28.8 8.1'
         'C26.2 9.9 22.8 11.9 20.2 13.9C18.4 15.3 16.8 16.9 15 17.8C14.2 18.2 13.5 17.6 12.8 17.9'
         'C11.6 18.5 11.2 19.4 9.6 19.6C7.4 19.9 5.2 18.8 4.2 16.8C3.5 15.3 3.2 13.3 3.2 11Z')
TRUNKS = 'M17.4 29.3V23.4M28.6 22.3C24.8 23.4 20.8 23.6 17.4 23.4M17.4 23.4C15.8 21 14.6 19 13.3 16.2'
BRANCHES = 'M13.3 16.2C11.6 14.2 9.2 12.9 6.3 12.5M13.3 16.2C15.4 13.8 18.4 11.6 22 10'
SW, SWB = 2.7, 1.9
INK, TISSUE = '#16181D', '#F4E4E1'
GRAD = ('<linearGradient id="{id}" gradientUnits="userSpaceOnUse" x1="24" y1="28" x2="9" y2="11">'
        '<stop offset="0" stop-color="#D2448A"/><stop offset=".5" stop-color="#7A86E0"/><stop offset="1" stop-color="#4FA9D6"/></linearGradient>')

def vessels(stroke):
    return (f'<path d="{BRANCHES}" stroke="{stroke}" stroke-width="{SWB}" stroke-linecap="round" fill="none"/>'
            f'<path d="{TRUNKS}" stroke="{stroke}" stroke-width="{SW}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>')

def mark_body(gid='pv'):
    """The mark's artwork on its 32-unit tile, without the <svg> wrapper."""
    return f'<rect width="32" height="32" rx="7.5" fill="{INK}"/><path d="{LIVER}" fill="{TISSUE}"/>{vessels(f"url(#{gid})")}'

def mono_body(mid='m'):
    """One ink: the vessels are knocked out of the liver (with a gap) and drawn solid outside it."""
    knock = (f'<path d="{TRUNKS}" stroke="#000" stroke-width="{SW + 2}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>'
             f'<path d="{BRANCHES}" stroke="#000" stroke-width="{SWB + 1.6}" stroke-linecap="round" fill="none"/>')
    return (f'<mask id="{mid}"><rect width="32" height="32" fill="#fff"/>{knock}</mask>'
            f'<path d="{LIVER}" fill="currentColor" mask="url(#{mid})"/>{vessels("currentColor")}')

def svg(view, body, title='Portal Pressure Simulator', defs=''):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view}"><title>{title}</title>'
            + (f'<defs>{defs}</defs>' if defs else '') + body + '</svg>\n')

# ── Type ──
def instance(wght):
    f = TTFont(str(INTER)); f.flavor = None
    inst = instantiateVariableFont(f, {'wght': wght, 'opsz': 28})
    buf = io.BytesIO(); inst.save(buf)
    return inst, buf.getvalue()

def text_path(text, wght, size, x0, y0, tracking=0.0):
    """Outlined text shaped by HarfBuzz (kerning included). Returns (path data, advance)."""
    font, data = instance(wght)
    face = hb.Face(data); hf = hb.Font(face)
    b = hb.Buffer(); b.add_str(text); b.guess_segment_properties(); hb.shape(hf, b, {'kern': True})
    gs, order, k = font.getGlyphSet(), font.getGlyphOrder(), size / face.upem
    x, parts = 0, []
    for info, pos in zip(b.glyph_infos, b.glyph_positions):
        pen = SVGPathPen(gs)
        gs[order[info.codepoint]].draw(TransformPen(pen, (k, 0, 0, -k, x0 + (x + pos.x_offset) * k, y0 - pos.y_offset * k)))
        parts.append(pen.getCommands())
        x += pos.x_advance + tracking * face.upem
    d = ' '.join(p for p in parts if p)
    d = re.sub(r'-?\d+\.\d+', lambda m: f'{float(m.group()):.2f}'.rstrip('0').rstrip('.'), d)
    return d, x * k

def main():
    OUT.mkdir(exist_ok=True)
    (OUT / 'mark.svg').write_text(svg('0 0 32 32', mark_body(), defs=GRAD.format(id='pv')))
    (OUT / 'mark-mono.svg').write_text(svg('0 0 32 32', mono_body()))
    # Maskable app icon: full-bleed ink, the artwork inside the 80 % safe zone.
    art = f'<path d="{LIVER}" fill="{TISSUE}"/>{vessels("url(#pv)")}'
    (OUT / 'mark-maskable.svg').write_text(svg('0 0 32 32', f'<rect width="32" height="32" fill="{INK}"/><g transform="translate(16 16) scale(.72) translate(-16 -16)">{art}</g>', defs=GRAD.format(id='pv')))

    # Horizontal lockup: mark, then the name on one line (sales page, SCORM package).
    name, w1 = text_path('Portal Pressure', 650, 22, 52, 31, -0.012)
    sub, w2 = text_path('Simulator', 430, 22, 52 + w1 + 7, 31, -0.008)
    W = round(52 + w1 + 7 + w2 + 2)
    body = f'<g transform="translate(0 4) scale(1.25)">{mark_body()}</g><path d="{name}" fill="{INK}"/><path d="{sub}" fill="#5B5F6A"/>'
    (OUT / 'lockup.svg').write_text(svg(f'0 0 {W} 48', body, defs=GRAD.format(id='pv')))
    body_d = f'<g transform="translate(0 4) scale(1.25)">{mark_body()}</g><path d="{name}" fill="#E9EDF6"/><path d="{sub}" fill="#A9B2C7"/>'
    (OUT / 'lockup-dark.svg').write_text(svg(f'0 0 {W} 48', body_d, defs=GRAD.format(id='pv')))
    body_m = f'<g transform="translate(0 4) scale(1.25)" color="#16181D">{mono_body()}</g><path d="{name}" fill="#16181D"/><path d="{sub}" fill="#16181D"/>'
    (OUT / 'lockup-mono.svg').write_text(svg(f'0 0 {W} 48', body_m))

    # Stacked lockup (printed debriefs, title slides): mark above a two-line name.
    n2, a = text_path('Portal Pressure', 650, 26, 0, 0, -0.012)
    s2, b2 = text_path('Simulator', 430, 26, 0, 0, -0.008)
    Wst = round(max(a, b2)) + 4
    cx = Wst / 2
    n2, _ = text_path('Portal Pressure', 650, 26, cx - a / 2, 104, -0.012)
    s2, _ = text_path('Simulator', 430, 26, cx - b2 / 2, 136, -0.008)
    body_s = f'<g transform="translate({cx - 32:.1f} 0) scale(2)">{mark_body()}</g><path d="{n2}" fill="{INK}"/><path d="{s2}" fill="#5B5F6A"/>'
    (OUT / 'lockup-stacked.svg').write_text(svg(f'0 0 {Wst} 146', body_s, defs=GRAD.format(id='pv')))
    print('brand/*.svg written')

if __name__ == '__main__':
    main()
