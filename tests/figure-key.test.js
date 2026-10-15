// A slide's colour key sits on the figure (src/ui/figure-key.js): on the open spot nearest the wanted corner, clear of cards and
// of the figure's art, on one line where it fits and in a column where it does not.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { pickKeySpot } = await import('../src/ui/figure-key.js');
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const presenter = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
const fig = { l: 0, t: 0, r: 390, b: 600 };
const row = { w: 280, h: 22, layout: 'row' }, col = { w: 70, h: 90, layout: 'col' };
const clear = (s, z, obs, gap = 8) => obs.every((o) => s.x + z.w + gap <= o.l || s.x - gap >= o.r || s.y + z.h + gap <= o.t || s.y - gap >= o.b);

test('the key takes the wanted corner of a bare figure, on one line', () => {
  const s = pickKeySpot({ fig, obs: [], sizes: [row, col], order: ['bl', 'br', 'tl', 'tr'] });
  assert.equal(s.layout, 'row');
  assert.equal(s.x, 14);
  assert.ok(s.y + row.h >= fig.b - 14 - 12, 'at the bottom');
});

test('a card the key cannot share a row with sends it elsewhere, never under the card', () => {
  const obs = [{ l: 0, t: 500, r: 390, b: 600 }, { l: 0, t: 0, r: 390, b: 100 }];
  const s = pickKeySpot({ fig, obs, sizes: [row, col], order: ['bl', 'br', 'tl', 'tr'] });
  assert.ok(clear(s, s.layout === 'row' ? row : col, obs), 'clear of both cards');
});

test('a vessel at the corner moves the key off it, and the key stays off the art', () => {
  const art = (b, { pad }) => !(b.r + pad < 150 || b.l - pad > 250 || b.b + pad < 400 || b.t - pad > 600) && true;   // art box x 150-250, y 400-600
  art.cover = () => 0;
  const s = pickKeySpot({ fig, obs: [], sizes: [row, col], order: ['bl', 'br', 'tl', 'tr'], art });
  const z = s.layout === 'row' ? row : col;
  assert.ok(s.bare);
  assert.ok(s.x + z.w + 6 < 150 || s.x - 6 > 250 || s.y + z.h + 6 < 400, 'not touching the vessel');
});

test('with no bare spot the key takes the one with the least art under it', () => {
  const art = () => true;
  art.cover = (b) => b.t;   // the higher, the less
  const s = pickKeySpot({ fig, obs: [], sizes: [row], order: ['bl'], art });
  assert.equal(s.bare, false);
  assert.ok(s.y < 100);
});

test('no open spot at all hides the key', () => {
  assert.equal(pickKeySpot({ fig, obs: [{ l: -10, t: -10, r: 400, b: 610 }], sizes: [row, col], order: ['bl'] }), null);
});

test('the key lives on the figure, not in the teaching card, and never takes a tap', () => {
  assert.ok(!/lensKey\(|querySelector\('\.pz-lens'\)/.test(presenter), 'the card no longer builds a key line');
  assert.match(presenter, /createFigureKey\(\{ el: fk/);
  assert.match(css, /\.pz-fk \{[^}]*pointer-events: none;/);
});

test("the phone's nav pill is compact", () => {
  assert.match(css, /\.pz\.stack \.pz-bar \{[^}]*height: 38px;/);
  assert.match(css, /\.pz\.stack \.pz-bar \.ib \{ width: 38px;/);
});
