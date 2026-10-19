// The HVPG against PPG plane on Sites and causes' patients (Mohammad, 19 Oct): no key beside it on a Mac or an iPad, so
// every zone keeps its words there (an iPhone keeps the key under the plot: a 0 to 5 mmHg column some 50 px wide holds no
// zone's words); each name sits beside its own point, on the point's side of every cut-off line, and goes out on a thin
// line only where it has no room beside its point. Checked at the plot sizes the panel takes on a Mac, an iPad and an iPhone
// (upright and sideways).
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DECKS } from '../src/ui/decks.js';
import { readFileSync } from 'node:fs';
import { planeOf, frame, scaler, layoutPlane, crosses } from '../src/ui/visual-plane.js';
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
  assert.equal(planeOf('csph').key, undefined, 'the stiffness plane keeps its key');
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  assert.match(css, /\.pze-planewrap\.pze-nokey > \.pze-key \{ display: none; \}/, 'no key beside the plot');
  assert.match(css, /\.pz\.stack \.pze-planewrap\.pze-nokey > \.pze-key \{ display: block; \}/, 'an iPhone keeps the key under it');
  for (const [W, H, fs, where, phone] of SIZES) {
    const fr = frame(W, H, fs, pl), { X, Y } = scaler(pl, fr);
    const pts = rows.map(([f, name, short]) => ({ x: X(f.hvpg), y: Y(f.ppg), name, short, f }));
    const { names, words: zw, rules, dots } = layoutPlane(pl, fr, X, Y, fs, pts);
    assert.ok(names.every(Boolean), `${where}: every point is named`);
    // (The screenshot's complaint: on a Mac every name sits beside its point, none out on a line across the cut-offs.)
    if (W >= 1180) assert.equal(names.filter((n) => n.lead).length, 0, `${where}: every name beside its point, no line out`);
    for (const [i, n] of names.entries()) {
      const p = pts[i];
      assert.ok(n.box[0] >= fr.L && n.box[2] <= fr.R && n.box[1] >= fr.T && n.box[3] <= fr.B, `${where}: ${p.name} inside the plot`);
      assert.ok(!rules.some((o) => touch(n.box, o)), `${where}: ${p.name} keeps 4 px off every cut-off line`);
      for (const q of pts) assert.ok(!touch(n.box, [q.x - 10, q.y - 10, q.x + 10, q.y + 10]), `${where}: ${p.name} covers no point`);
      for (const m of names.slice(i + 1)) assert.ok(!touch(n.box, m.box), `${where}: ${p.name} overlaps no other name`);
      if (!n.lead) {
        // (Beside its point: on the point's side of every cut-off, and close.)
        for (const v of pl.cuts.x) assert.ok((p.x < X(v)) === (n.box[2] <= X(v)), `${where}: ${p.name} on its point's side of HVPG ${v}`);
        for (const v of pl.cuts.y) assert.ok((p.y < Y(v)) === (n.box[3] <= Y(v)), `${where}: ${p.name} on its point's side of PPG ${v}`);
        const gx = Math.max(n.box[0] - p.x, 0, p.x - n.box[2]), gy = Math.max(n.box[1] - p.y, 0, p.y - n.box[3]);
        assert.ok(Math.hypot(gx, gy) <= 8 + 6 + fs, `${where}: ${p.name} right beside its point`);
      } else {
        // (A line out only where the name is wider than the room beside its point: it passes no other point and crosses only
        // the cut-offs it must.)
        for (const q of pts) if (q !== p) assert.ok(!crosses(p.x, p.y, n.lead[0], n.lead[1], [q.x - 10, q.y - 10, q.x + 10, q.y + 10]), `${where}: ${p.name}'s line passes no point`);
        assert.ok(rules.filter((o) => crosses(p.x, p.y, n.lead[0], n.lead[1], o)).length <= 2, `${where}: ${p.name}'s line crosses two cut-offs at most`);
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
