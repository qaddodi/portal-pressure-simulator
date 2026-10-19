// The HVPG against PPG plane on Sites and causes' patients (Mohammad, 19 Oct): no key beside it on a Mac or an iPad, so
// every zone keeps its words there (an iPhone keeps the key under the plot: a 0 to 5 mmHg column some 50 px wide holds no
// zone's words); each name sits beside its own point, on the point's side of every cut-off line, and goes out on a thin
// line only where it has no room beside its point. Where its own side of a cut-off has no room (an iPhone's 0 to 5 mmHg
// column), it sits right beside its point across the line, which breaks 4 px clear of it, rather than far out on a long line
// ("They should be closer to the dots", Mohammad 19 Oct). Checked at the plot sizes the panel takes on a Mac, an iPad and an iPhone
// (upright and sideways).
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DECKS } from '../src/ui/decks.js';
import { readFileSync } from 'node:fs';
import { planeOf, frame, scaler, layoutPlane, crosses, cutSegs, gapSegs } from '../src/ui/visual-plane.js';
import { deckStates } from './deck-states.js';

const touch = (a, o) => a[0] < o[2] && a[2] > o[0] && a[1] < o[3] && a[3] > o[1];
// [W, H, caption px, where]: the summary panel's plot, from an iPhone upright to a wide Mac.
const SIZES = [[345, 300, 16, 'iPhone upright', 1], [390, 340, 16, 'iPhone wide upright', 1], [620, 260, 14, 'iPhone sideways', 1], [700, 480, 15, 'iPad upright'],
  [800, 450, 16, 'iPad'], [1000, 500, 16, 'iPad sideways'], [1180, 460, 16, 'small Mac'], [1290, 570, 18, 'Mac'], [1500, 620, 18, 'large Mac']];

test('HVPG against PPG: no key, every zone named, names beside their points and clear of every line', async () => {
  const d = DECKS.find((x) => x.id === 'sites'), st = await deckStates(d);
  const fp = (id) => st[d.slides.findIndex((s) => s.id === id)];
  const [healthy] = await (await import('./deck-states.js')).runSteps([{ preset: 'healthy' }]);
  const rows = [[healthy, 'Healthy'], [fp('pvt'), 'Portal vein thrombosis', 'PVT'], [fp('presin'), 'Schistosomiasis'], [fp('sin'), 'Cirrhosis'],
    [fp('postsin'), 'Sinusoidal obstruction', 'SOS'], [fp('post'), 'Budd–Chiari'], [fp('cardiac'), 'Heart failure']];
  const pl = planeOf('hvpg-ppg');
  assert.equal(pl.key, false, 'the zones name themselves: no key beside the plot');
  assert.equal(planeOf('csph').key, 'never', 'the stiffness plane names its zones on the drawing everywhere, no key');
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  assert.match(css, /\.pze-planewrap\.pze-nokey > \.pze-key \{ display: none; \}/, 'no key beside the plot');
  assert.match(css, /\.pz\.stack \.pze-planewrap\.pze-nokey > \.pze-key \{ display: block; \}/, 'an iPhone keeps the key under it');
  for (const [W, H, fs, where, phone] of SIZES) {
    const fr = frame(W, H, fs, pl), { X, Y } = scaler(pl, fr);
    const pts = rows.map(([f, name, short]) => ({ x: X(f.hvpg), y: Y(f.ppg), name, short, f }));
    const { names, words: zw, rules, dots } = layoutPlane(pl, fr, X, Y, fs, pts);
    assert.ok(names.every(Boolean), `${where}: every point is named`);
    // (The cut-off lines as drawn, broken where a name sits across one, as thin boxes 4 px either side.)
    const drawn = gapSegs(cutSegs(pl, X, Y, fr), names.filter((n) => n.across).map((n) => n.box))
      .map((c) => [Math.min(c.x1, c.x2) - 4, Math.min(c.y1, c.y2) - 4, Math.max(c.x1, c.x2) + 4, Math.max(c.y1, c.y2) + 4]);
    // (The screenshot's complaint: on a Mac every name sits beside its point, none out on a line across the cut-offs.)
    if (W >= 1180) assert.equal(names.filter((n) => n.lead).length, 0, `${where}: every name beside its point, no line out`);
    for (const [i, n] of names.entries()) {
      const p = pts[i];
      assert.ok(n.box[0] >= fr.L && n.box[2] <= fr.R && n.box[1] >= fr.T && n.box[3] <= fr.B, `${where}: ${p.name} inside the plot`);
      assert.ok(!drawn.some((o) => touch(n.box, o)), `${where}: ${p.name} keeps 4 px off every cut-off line drawn`);
      if (!n.across) assert.ok(!rules.some((o) => touch(n.box, o)), `${where}: ${p.name} keeps off every line it does not sit across`);
      for (const q of pts) assert.ok(!touch(n.box, [q.x - 10, q.y - 10, q.x + 10, q.y + 10]), `${where}: ${p.name} covers no point`);
      for (const m of names.slice(i + 1)) assert.ok(!touch(n.box, m.box), `${where}: ${p.name} overlaps no other name`);
      const gx = Math.max(n.box[0] - p.x, 0, p.x - n.box[2]), gy = Math.max(n.box[1] - p.y, 0, p.y - n.box[3]);
      if (!n.lead && n.across) assert.ok(Math.hypot(gx, gy) <= 8 + 6 + fs, `${where}: ${p.name} across a line, right beside its point`);
      else if (!n.lead) {
        // (Beside its point: on the point's side of every cut-off, and close.)
        for (const v of pl.cuts.x) assert.ok((p.x < X(v)) === (n.box[2] <= X(v)), `${where}: ${p.name} on its point's side of HVPG ${v}`);
        for (const v of pl.cuts.y) assert.ok((p.y < Y(v)) === (n.box[3] <= Y(v)), `${where}: ${p.name} on its point's side of PPG ${v}`);
        assert.ok(Math.hypot(gx, gy) <= 8 + 6 + fs, `${where}: ${p.name} right beside its point`);
      } else {
        // (A line out only where the name is wider than the room beside its point: it passes no other point and crosses only
        // the cut-offs it must.)
        for (const q of pts) if (q !== p) assert.ok(!crosses(p.x, p.y, n.lead[0], n.lead[1], [q.x - 10, q.y - 10, q.x + 10, q.y + 10]), `${where}: ${p.name}'s line passes no point`);
        assert.ok(rules.filter((o) => crosses(p.x, p.y, n.lead[0], n.lead[1], o)).length <= 2, `${where}: ${p.name}'s line crosses two cut-offs at most`);
        // (and stays short: the name near its point, not across the plot.)
        assert.ok(Math.hypot(n.lead[0] - p.x, n.lead[1] - p.y) <= 4 * fs, `${where}: ${p.name}'s line ${Math.round(Math.hypot(n.lead[0] - p.x, n.lead[1] - p.y))} px, short`);
      }
    }
    // Every zone keeps its words (where no key stands under the plot), clear of the names, the points and the lines.
    // (On an iPad upright the 0 to 5 by 0 to 6 corner is about 120 by 80 px around two points: no room for its words there.)
    const named = zw.map((w) => w.z.t);
    if (!phone) for (const z of pl.zones) if (W >= 1000 || z.tone !== 'ok') assert.ok(named.includes(z.t), `${where}: ${z.t} named`);
    for (const w of zw) {
      assert.ok(fs >= 12);
      for (const o of [...names.map((n) => n.box), ...rules, ...dots]) assert.ok(!touch(w.box, o), `${where}: ${w.z.t} clear`);
      for (const v of zw) if (v !== w) assert.ok(!touch(w.box, v.box));
    }
  }
});

// The zones' fills read as the tiles' green, amber and red, and their words keep 4.5:1 on them in every theme
// (Mohammad, 19 Oct: "where is the amber area?" on the stiffness plane, whose gray zone read olive).
test('the plane\'s green, amber and red zones: words 4.5:1 on their fills, light, soft and dark', () => {
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8'), tok = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8');
  const pick = (block, k) => block.match(new RegExp(`--${k}: (#[0-9A-Fa-f]{6})`))[1];
  const blocks = { light: tok.slice(0, tok.indexOf('@media (prefers-color-scheme: dark)')), soft: tok.slice(tok.indexOf(':root[data-theme="soft"]')), dark: tok.slice(tok.indexOf(':root[data-theme="dark"] {')) };
  const theme = (b) => ({ surface: pick(b, 'surface'), text: pick(b, 'text'), ok: pick(b, 'ok'), caution: pick(b, 'caution'), danger: pick(b, 'danger'), black: pick(tok, 'black') });
  const T = { light: theme(blocks.light), soft: { ...theme(blocks.light), ...theme(blocks.soft) }, dark: theme(tok.slice(tok.indexOf('@media (prefers-color-scheme: dark)'))) };
  const rgb = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const mix = (a, p, b) => rgb(a).map((v, i) => v * p + rgb(b)[i] * (1 - p));
  const lum = (c) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => m - n); return (y + 0.05) / (x + 0.05); };
  const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  // (Each theme's variables as app.css sets them: the light and soft rule first, then the dark one.)
  const light = css.match(/\.pze-plot, \.pze-ckey, \.pze-key \{([^}]*)\}/)[1], dark = css.match(/:root\[data-theme="dark"\] :is\(\.pze-plot, \.pze-ckey, \.pze-key\) \{([^}]*)\}/)[1];
  const val = (rule, th, k) => {
    const m = rule.match(new RegExp(`--pze-${k}: ([^;]+);`))[1].trim(), c = m.match(/color-mix\(in srgb, var\(--(\w+)\) (\d+)%, var\(--(\w+)\)\)/);
    if (!c) return rgb(th[m.match(/var\(--(\w+)\)/)[1]]);
    return mix(th[c[1]], +c[2] / 100, th[c[3]]);
  };
  for (const [name, th] of Object.entries(T)) {
    const rule = name === 'dark' ? dark : light;
    for (const [k, col] of [['ok', th.ok], ['mid', th.caution], ['hi', th.danger]]) {
      const fill = val(rule, th, k), ink = val(rule, th, `${k}-ink`);
      assert.ok(ratio(ink, fill) >= 4.5, `${name} ${k}: words ${ratio(ink, fill).toFixed(2)}:1 on ${hex(fill)}`);
      // (The fill keeps the tile colour's hue: its strongest channel and its weakest are the colour's own.)
      const order = (c) => c.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).map((x) => x[1]);
      assert.deepEqual([order(fill)[0], order(fill)[2]], [order(rgb(col))[0], order(rgb(col))[2]], `${name} ${k}: ${hex(fill)} reads as ${col}`);
    }
  }
  assert.match(css, /@media \(prefers-color-scheme: dark\) \{ :root:not\(\[data-theme="light"\]\):not\(\[data-theme="soft"\]\) :is\(\.pze-plot, \.pze-ckey, \.pze-key\) \{\n {2}--pze-ok: color-mix\(in srgb, var\(--ok\) 42%, var\(--black\)\)/, 'the system dark theme matches');
  for (const k of ['ok', 'mid', 'hi']) assert.ok(css.includes(`.pze-key li[data-tone="${k}"] i { background: var(--pze-${k}); }`) && css.includes(`.pze-ckey li[data-tone="${k}"] i { background: var(--pze-${k}); }`), `${k}: the keys' swatches are the plot's fills`);
});

// A cut-off line breaks 4 px clear of a name sitting across it, and only there.
test('a cut-off line breaks behind a name that sits across it', () => {
  assert.deepEqual(gapSegs([{ x1: 50, x2: 50, y1: 0, y2: 100 }], [[30, 40, 80, 60]]), [{ x1: 50, x2: 50, y1: 0, y2: 36 }, { x1: 50, x2: 50, y1: 64, y2: 100 }]);
  assert.deepEqual(gapSegs([{ x1: 0, x2: 100, y1: 20, y2: 20 }], [[30, 40, 80, 60]]), [{ x1: 0, x2: 100, y1: 20, y2: 20 }], 'a name clear of the line leaves it whole');
  assert.deepEqual(gapSegs([{ x1: 0, x2: 100, y1: 50, y2: 50 }], [[10, 40, 30, 60], [20, 45, 50, 55]]), [{ x1: 0, x2: 6, y1: 50, y2: 50 }, { x1: 54, x2: 100, y1: 50, y2: 50 }]);
});
