// The lobule's label pills read for their frost on the GPU (lz-pills.js, recs B4): boxes from the label and its ::before insets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readPills, ringOf } from '../src/ui/lz-pills.js';

test('an inset ring is read in either order the browsers serialise it', () => {
  assert.deepEqual(ringOf('rgb(10, 20, 30) 0px 0px 0px 2px inset'), { w: 2, colour: 'rgb(10, 20, 30)' });
  assert.deepEqual(ringOf('inset 0px 0px 0px 2px rgb(10, 20, 30)'), { w: 2, colour: 'rgb(10, 20, 30)' });
  assert.equal(ringOf('none'), null);
  assert.equal(ringOf('rgb(0, 0, 0) 0px 1px 2px 0px'), null, 'an outer shadow is no ring');
});

test('a pill shows a set gap outside its label, at its fades\' opacity; hidden or faded-out ones are left out', () => {
  const el = (cls, box, ps, hidden = false) => ({ cls, hidden, ps, getBoundingClientRect: () => ({ ...box, right: box.left + box.width, bottom: box.top + box.height }) });
  const lit = el('lz-lab', { left: 110, top: 220, width: 80, height: 30 }, { opacity: '0.5', left: '-5px', top: '-6px', right: '-5px', bottom: '-6px', borderTopLeftRadius: '12px', backgroundColor: 'rgba(1, 2, 3, 0.4)', boxShadow: 'rgb(9, 9, 9) 0px 0px 0px 2px inset' });
  const off = el('lz-lab', { left: 0, top: 0, width: 50, height: 20 }, { opacity: '0' });
  const gone = el('lz-zone', { left: 0, top: 0, width: 50, height: 20 }, { opacity: '1', content: 'none' });
  const hid = el('sv-region', { left: 0, top: 0, width: 50, height: 20 }, { opacity: '1' }, true);
  const root = { querySelectorAll: () => [lit, off, gone, hid] };
  const gcs = (e, p) => (p ? e.ps : { borderLeftWidth: '1px', borderTopWidth: '1px', borderRightWidth: '1px', borderBottomWidth: '1px' });
  const out = readPills(root, { left: 100, top: 200 }, gcs);
  assert.equal(out.length, 1);
  const [p] = out;
  assert.equal(p.el, lit);
  assert.deepEqual([p.x, p.y, p.w, p.h, p.r, p.a], [6, 15, 88, 40, 12, 0.5]);
  assert.equal(p.tint, 'rgba(1, 2, 3, 0.4)');
  assert.deepEqual(p.ring, { w: 2, colour: 'rgb(9, 9, 9)' });
});

test('a colour serialised as color(srgb …) is given to the glass as rgba()', async () => {
  const { rgbaOf } = await import('../src/ui/lz-pills.js');
  assert.equal(rgbaOf('color(srgb 1 0.5 0 / 0.47)'), 'rgba(255, 128, 0, 0.47)');
  assert.equal(rgbaOf('color(srgb 0 0 1)'), 'rgba(0, 0, 255, 1)');
  assert.equal(rgbaOf('rgba(1, 2, 3, 0.4)'), 'rgba(1, 2, 3, 0.4)');
});

test('the lobule draws the lit pills\' frost on the GPU from its own stacked copy, only in frames it drew', async () => {
  const { readFileSync } = await import('node:fs');
  const lz = readFileSync(new URL('../src/ui/lobule-zoom.js', import.meta.url), 'utf8');
  const gg = readFileSync(new URL('../src/ui/glass-gl.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  assert.match(gg, /const q = cards\?\.read \? cards\.read\(g\) : undefined;\n\s+if \(q !== undefined\) \{/);
  assert.match(lz, /cards: \{ find: \(\) => pillLabels\(labels\), watch: \[labels\], before: labels, read: \(e\) => pillOf\(e\) \|\| null \},/);
  assert.match(lz, /const pillLive = \(\) => fade > 0\.98 && !diveScaled && sinU === 0 && !sinTo && !wide && !resCover && !keep2D && pillTisOK && pillSeq > 0;/);
  // (The tissue's GPU canvas read only in a frame it drew.)
  assert.match(lz, /if \(!tissueOnGL \|\| tissueDrew\) \{/);
  assert.match(lz, /if \(!ok\) return false;\n\s+tissueDrew = true;/);
  assert.match(lz, /paintFx\(W, H, dpr, dark, dt, !g \|\| g\.lost\);\n\s+pillCopy\(W, H\);\n\s+return true;/);
  assert.match(css, /\.lz \.lz-labels :is\(\.lz-lab, \.lz-zone\)\[data-gl\]\[data-gl\]\[data-gl\]::before \{ background: none; -webkit-backdrop-filter: none; backdrop-filter: none; \}/);
});
