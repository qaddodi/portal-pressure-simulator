// The glitch sweep's rules (scripts/glitch-sweep.mjs `judge`) on made-up frame series: each seeded glitch is found, and a clean change is not flagged.
// No browser: the series are the records the sweep reads from the page every frame.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judge } from '../scripts/glitch-sweep.mjs';

const N = 60, DT = 50;
const card = (name, op, o = {}) => ({ name, cls: `pz-${name}${o.cls ? ' ' + o.cls : ''}`, x: 60, y: 300, w: 400, h: 300, op, hidden: false, text: 20, words: 'Words', gl: true, wait: false, ...o });
/** frames of a change: the words card fades in over 20 frames and holds, unless `mut` rewrites a frame. */
function series(mut = () => {}) {
  const fr = Array.from({ length: N }, (_, i) => ({
    t: i * DT, slide: null, rootCls: 'pz pz-card',
    cards: [card('text', Math.min(1, i / 20))],
    more: { labels: [{ key: 'n:PV', op: 1, x: 500 + i, y: 300, w: 40, h: 14, ax: 480 + i, ay: 310 }], nums: [{ id: 1, t: '12.4', w: 30, cw: 400, op: 1 }], busy: i < 25, n: 'Slide 3 of 12', cam: [1, Math.min(i, 40), 0], load: false, vw: 1440, vh: 900 },
  }));
  fr.forEach((f, i) => mut(f, i));
  return fr;
}
const rules = (fr, o) => judge(fr, { expect: { text: true }, ...o }).map((f) => f.rule);

test('a clean change is not flagged', () => assert.deepEqual(rules(series()), []));

test('a card frozen part way through its fade is found', () => {
  const r = series((f, i) => { if (i >= 20) f.cards[0].op = 0.5; });
  assert.ok(rules(r).includes('stuck-mid'));
});

test('a card left in pz-leave, or sitting at opacity 0 where the slide shows it, is found', () => {
  assert.ok(rules(series((f, i) => { if (i >= 20) f.cards[0].cls += ' pz-leave'; })).includes('stuck-mid'));
  assert.ok(rules(series((f, i) => { f.cards[0].op = 0; })).includes('frozen-zero'));
});

test('a change that has not ended when the window ends is found', () => assert.ok(rules(series((f) => { f.more.busy = true; })).includes('stuck-mid')));

test('a card or label that drops out for a few frames and returns is a flash', () => {
  assert.ok(rules(series((f, i) => { if (i === 40 || i === 41) f.cards[0].op = 0; })).includes('flash'));
  assert.ok(rules(series((f, i) => { if (i === 40) f.more.labels = []; })).includes('flash'));
});

test('a label that moves differently from its anchor, or sits far from it, is detached', () => {
  assert.ok(rules(series((f, i) => { if (i >= 30 && i < 34) { f.more.labels[0].x = 530; f.more.labels[0].ax = 480 + 30 + (i - 29) * 20; } })).includes('label-detached'));
  assert.ok(!rules(series((f, i) => { if (i === 30) { f.more.labels[0].x = 530; f.more.labels[0].ax = 480 + 30 + 20; } if (i > 30) f.more.labels[0].x = 520 + i; })).includes('label-detached'), 'one frame of lag is not a finding');
  assert.ok(rules(series((f) => { f.more.labels[0].x += 600; })).includes('label-detached'));
});

test('a number that changes width while its card holds still is flagged; the same width is not', () => {
  assert.ok(rules(series((f, i) => { f.more.nums[0].w = i % 2 ? 30 : 33.5; })).includes('width-jump'));
  assert.ok(!rules(series((f, i) => { f.more.nums[0].t = String(10 + i); })).includes('width-jump'));
});

test('black frames show up when pixels are read', () => {
  const r = series((f, i) => { f.px = { lum: i === 30 ? 2 : 200, dark: i === 30 ? 0.97 : 0 }; });
  assert.ok(rules(r).includes('black'));
});

test('glass rules run only when the real GPU path draws', () => {
  const r = series((f) => { f.cards.unshift(card('shade', 1, { gl: false, wait: false })); });
  assert.ok(!rules(r).some((x) => x.startsWith('glass')));
  assert.ok(rules(r, { glass: true }).includes('glass:solid-card'));
});

test('a camera still moving at the end of the window, or moving after the hand lifted, is found', () => {
  assert.ok(rules(series((f, i) => { f.more.cam = [1, i * 5, 0]; })).includes('camera-moving'));
  const snap = series((f, i) => { if (i >= 50) f.more.cam = [1, 90, 0]; });
  assert.ok(rules(snap, { restFrom: 30 }).includes('moves-after-release'), 'a 50 px snap in one frame after release');
  assert.ok(!rules(series(), { restFrom: 30 }).includes('moves-after-release'), 'a smooth settle is not');
});
