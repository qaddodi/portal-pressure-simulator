// The sinusoid view keeps its names on a presenter slide (Mohammad, 26 Oct: "keep most of the labels especially hepatocyte, lymph,
// portal venule, central vein and the arrows"): a slide's lit names take their term's ink, the rest stay plain as in Explore, and only
// the lobule's own names ease out. The Fenestrae callout points at a fenestra, not at an endothelial cell body.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { poreAt, calloutPore, underNucleus, nucAt, NUC_COVER, SEED, SLOT } from '../src/ui/sinusoid-gl.js';
import { appCss } from './split-src.js';

const CSS = appCss();
const VIEW = readFileSync(new URL('../src/ui/sinusoid-view.js', import.meta.url), 'utf8');

test('a lit sinusoid name takes its term\'s colour as its ink, with no pill behind', () => {
  // (13 Nov 2026, unification audit 12: one style on the figure, outlined text; the lit term is its words in the term's colour.)
  const ink = CSS.split('\n').find((l) => l.startsWith(':root:root:root:root:root:root:root:root :is(.lz-lab, .lz-zone, .sv-region):is(') && l.includes(') { color: color-mix(in srgb, var(--term-c, var(--accent)) 84%, var(--cap-ink)); }')) || '';
  for (const k of ['fenestrae', 'disse', 'stellate', 'kupffer', 'hepatocyte', 'lymph', 'lumen']) assert.ok(ink.includes(`.app[data-lit~="sinusoid:${k}"] [data-target="sinusoid:${k}"]`), k);
  assert.ok(!CSS.split('\n').some((l) => l.includes(')::before { opacity: 1;') && l.includes('sinusoid:')), 'no lit pill');
});


const pores = (sd, from = -120, to = 120) => { const a = []; for (let j = from; j < to; j++) { const p = poreAt(j, sd); if (p) a.push(p); } return a; };

test('the nucleus swell\'s reach matches the shader\'s nucAt and swell', () => {
  for (const n of [-2, 0, 3]) { const c = nucAt(n, SEED.nucUp); assert.ok(c >= 38 * n + 8 && c < 38 * n + 30, `nucleus ${n} sits in its 38 µm slot (${c})`); }
  // (the swell: a 3.3 µm half length blended 0.9 into the sheet, in the shader's sdEndo)
  assert.ok(NUC_COVER >= 3.3 + 0.9, 'clear of the swell and its blend');
});

test('the Fenestrae callout never points at a pore under a cell body', () => {
  const upper = pores(SEED.poreUp);
  assert.ok(upper.length > 20);
  // The old pick (the pore that stays open longest within 9 µm) at the view's centre ran into the nucleus at 12.4 µm: pore 15.5, 3.1 µm from its centre.
  const old = (x) => upper.filter((p) => Math.abs(p.x - x) < 9).reduce((m, p) => (!m || p.th < m.th ? p : m), null);
  assert.ok(underNucleus(old(14).x, SEED.nucUp), 'the old pick sat under a swell');
  let moved = 0;
  for (let x = -90; x <= 90; x += 0.5) {
    const at = calloutPore(upper, x, -100, 100, SEED.nucUp);
    assert.ok(upper.some((p) => p.x === at), `x ${x}: a pore of the lining (${at})`);
    assert.ok(!underNucleus(at, SEED.nucUp), `x ${x}: pore ${at} is under a nucleus swell`);
    assert.ok(Math.abs(at - x) <= 20, `x ${x}: stays near what it was set at (${at})`);
    if (old(x) && old(x).x !== at) moved++;
  }
  assert.ok(moved > 10, 'the pick did change where it used to be covered');
});

test('the Fenestrae callout is by place only, in view where a pore is, and falls back to where it was set', () => {
  const upper = pores(SEED.poreUp);
  // Not by how open the wall is (the callout's leader does not hop as pores close): no open share goes in.
  assert.equal(calloutPore.length, 5);
  // In view: a pore inside the bounds is chosen over a better one outside them.
  const a = calloutPore(upper, 40, 35, 50, SEED.nucUp);
  assert.ok(a >= 35 && a <= 50, `in view (${a})`);
  // None clear at all: where it was set.
  assert.equal(calloutPore([], 12, -5, 5, SEED.nucUp), 12);
  const only = [{ x: nucAt(0, SEED.nucUp) + 0.5, w: 0.6, th: 0.2 }];
  assert.equal(calloutPore(only, nucAt(0, SEED.nucUp), -1e3, 1e3, SEED.nucUp), nucAt(0, SEED.nucUp), 'a pore under the swell is not chosen even when it is the only one');
  assert.ok(SLOT > 0);
});

test('both layouts take the pore from the one helper', () => {
  assert.equal(VIEW.split('fenAt(').length - 1, 3, 'three calls (across, beside the stellate cell, down)');
});
