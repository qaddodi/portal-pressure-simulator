import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCardLayoutQueue } from '../src/ui/card-layout-queue.js';

function harness() {
  let id = 0, moving = false;
  const frames = new Map(), calls = [];
  const queue = createCardLayoutQueue({
    frame: (fn) => { frames.set(++id, fn); return id; },
    cancel: (key) => frames.delete(key),
    blocked: () => moving,
    run: (kind) => calls.push(kind),
  });
  class ResizeObserver {
    constructor(fn) { this.fn = fn; }
    report() { this.fn([{ contentRect: { height: 100 } }]); }
  }
  const fit = new ResizeObserver(() => queue.request('fit'));
  const pane = new ResizeObserver(() => queue.request('layout'));
  return {
    queue, fit, pane, frames, calls,
    move: (on) => { moving = on; },
    frame() { const batch = [...frames.values()]; frames.clear(); batch.forEach((fn) => fn()); },
  };
}

test('many fold resize reports do no global layout or frame polling, then settle once', () => {
  const h = harness(); h.move(true);
  for (let n = 0; n < 120; n++) { h.fit.report(); h.pane.report(); h.frame(); }
  assert.deepEqual(h.calls, []);
  assert.equal(h.frames.size, 0);
  h.move(false);
  h.queue.settle(() => h.calls.push('final resize'));
  h.frame();
  assert.deepEqual(h.calls, ['final resize']);
});

test('a drag grabbing an already queued layout retains it without polling or a duplicate settle', () => {
  const h = harness(); h.pane.report();
  assert.equal(h.frames.size, 1);
  h.move(true); h.frame();
  assert.deepEqual(h.calls, []);
  assert.equal(h.frames.size, 0);
  // Release into an ease, then grab and reverse it before it lands.
  h.fit.report(); h.pane.report(); h.frame();
  h.move(false);
  h.queue.settle(() => h.calls.push('final resize'));
  h.frame();
  assert.deepEqual(h.calls, ['final resize']);
});

test('settle cancels a callback queued before the fold begins', () => {
  const h = harness(); h.fit.report(); h.pane.report();
  h.move(true); h.move(false);
  h.queue.settle(() => h.calls.push('final resize'));
  assert.equal(h.frames.size, 0);
  h.frame();
  assert.deepEqual(h.calls, ['final resize']);
});

test('viewport, fonts and content invalidations survive an interrupted drag', () => {
  const h = harness(), state = { width: 800, font: 'fallback', content: 'old' }, seen = [];
  h.move(true); h.pane.report();
  // Explicit viewport/font handlers still run immediately; observer reports do not replace them.
  state.width = 1180; seen.push({ ...state }); h.pane.report();
  state.font = 'loaded'; seen.push({ ...state }); h.fit.report();
  state.content = 'new reading label'; h.fit.report();
  h.frame();
  assert.equal(seen.length, 2);
  assert.deepEqual(h.calls, []);
  h.move(false);
  h.queue.settle(() => seen.push({ ...state }));
  h.frame();
  assert.deepEqual(seen.at(-1), { width: 1180, font: 'loaded', content: 'new reading label' });
  assert.equal(seen.length, 3);
});

test('at rest reports coalesce, a pane layout subsumes a fit, and later changes still run', () => {
  const h = harness();
  h.pane.report(); h.fit.report(); h.pane.report();
  assert.equal(h.frames.size, 1); h.frame();
  assert.deepEqual(h.calls, ['layout']);
  h.fit.report(); h.frame();
  assert.deepEqual(h.calls, ['layout', 'fit']);
});

test('ending a presentation drops queued work before another presentation', () => {
  const h = harness(); h.pane.report(); h.queue.reset(); h.frame();
  assert.deepEqual(h.calls, []);
  h.fit.report(); h.frame();
  assert.deepEqual(h.calls, ['fit']);
});

test('an old fold timer cannot poll a detached sliding card or settle the next presentation', () => {
  const src = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
  const declaration = src.slice(src.indexOf('const foldStill = () => {'), src.indexOf("const fold = h('button'"));
  const data = { dataset: { folding: '' }, classList: { contains: () => true } };
  for (const ui of [null, { data: {} }]) {
    let polls = 0, settles = 0;
    const foldStill = new Function('data', 'ui', 'clearTimeout', 'setTimeout', 'partOf', 'fitDone', 'cardLayouts', 'onResize', `let foldT = 1; ${declaration} return foldStill;`)(
      data, ui, () => {}, () => { polls++; }, () => { throw new Error('old card measured'); },
      new WeakMap(), { settle: () => { settles++; } }, () => { throw new Error('new presentation resized'); },
    );
    foldStill();
    assert.equal(polls, 0);
    assert.equal(settles, 0);
    assert.ok('folding' in data.dataset);
  }
});

test('presenter defers both observers, retains direct font/viewport layouts and settles after sliding', () => {
  const src = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
  assert.match(src, /fitRO \|\|= new ResizeObserver\(\(\) => cardLayouts\.request\('fit'\)\)/);
  assert.match(src, /clearRO \|\|= new ResizeObserver\(\(\) => \{ cardLayouts\.request\('layout'\);/);
  assert.match(src, /blocked: \(\) => !ui \|\| 'folding' in ui\.data\.dataset \|\| ui\.data\.classList\.contains\('pz-sliding'\)/);
  assert.match(src, /const onFonts = \(\) => \{ if \(ui\) layout\(\); \};/);
  const resize = src.slice(src.indexOf('const onResize = (e) => {'), src.indexOf('// Projector-size labels'));
  assert.match(resize, /layout\(\);/);
  const settle = src.slice(src.indexOf('const foldStill = () => {'), src.indexOf("const fold = h('button'"));
  assert.match(settle, /data\.classList\.contains\('pz-sliding'\)/);
  assert.match(settle, /delete data\.dataset\.folding; fitDone\.delete\(data\); cardLayouts\.settle\(\(\) => onResize\(\)\);/);
});
