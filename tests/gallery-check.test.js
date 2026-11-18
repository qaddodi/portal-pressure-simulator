// The gallery's Check action and device frame (src/ui/gallery/fit-check.js, device-frame.js, fit-rules-panel.js), and that the two fit scripts
// judge through the shared rules instead of keeping their own copies.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body></body>');
globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.SVGElement = dom.window.SVGElement;
// (What util.js and layout-snap.js ask of a page when they load.)
for (const k of ['Element', 'HTMLElement', 'Node', 'NodeFilter', 'MutationObserver', 'getComputedStyle', 'addEventListener']) globalThis[k] ??= dom.window[k]?.bind ? dom.window[k].bind(dom.window) : dom.window[k];
globalThis.Element = dom.window.Element;
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.ResizeObserver ??= class { observe() {} disconnect() {} };
globalThis.requestAnimationFrame ||= (f) => setTimeout(() => f(performance.now()), 0);
const { runCheck, drawOutlines, clearOutlines, numberedReport, OUTLINE_ID } = await import('../src/ui/gallery/fit-check.js');
const { FRAME_DEVICES, DEFAULT_FRAME, isFrameRequest, frameRequest, frameSrc, framePageUrl, fitScale } = await import('../src/ui/gallery/device-frame.js');

const DEFAULTS = { display: 'block', visibility: 'visible', opacity: '1', overflow: 'visible', overflowX: 'visible', overflowY: 'visible', fontSize: '16px', zoom: '1', maxHeight: 'none' };
const camel = (k) => k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const rect = (el) => { const [l, t, r, b] = (el.dataset.box || '0,0,0,0').split(',').map(Number); return { left: l, top: t, right: r, bottom: b, width: r - l, height: b - t }; };
const IO = {
  box: rect, rects: (el) => [rect(el)],
  style: (el) => { const o = { ...DEFAULTS }; for (const d of (el.getAttribute('style') || '').split(';')) { const [k, v] = d.split(':'); if (k && v) o[camel(k.trim())] = v.trim(); } return o; },
  metric: (el, k) => (el === window ? { innerWidth: 390, innerHeight: 844 }[k] : +(el.dataset[k] ?? 0)),
  ctm: () => null,
};
const set = (html) => { document.body.innerHTML = html; };

test('Check names the element each problem is about, for the slide and for the open structure card', () => {
  set(`<div id="app"><div class="pz"><section class="pz-text" data-box="10,40,380,300"><h1 class="pz-h" style="font-size:20px" data-box="20,50,300,80">Title</h1><p class="pz-line" style="font-size:18px" data-box="20,90,300,120">Words</p></section>
    <section class="pz-data" data-box="10,320,380,800"><span class="lab" style="font-size:10px" data-box="20,330,120,350">tiny label</span></section></div>
    <section class="action-card ac-scroll" data-box="10,500,380,800"><div class="ac-body" style="overflow-y:hidden">words</div></section></div>`);
  const card = document.querySelector('.action-card');
  const r = runCheck({ io: IO, pps: { card: { el: card }, presenter: { busy: () => true } } });
  assert.equal(r.busy, true);
  assert.equal(r.slide, true);
  assert.equal(r.structure, true);
  const kinds = r.problems.map((p) => `${p.where}:${p.kind}`);
  assert.ok(kinds.includes('slide:small'), kinds.join());
  assert.ok(kinds.includes('slide:ratio'), kinds.join());
  assert.equal(r.problems.find((p) => p.kind === 'small' && p.where === 'slide').el.className, 'lab');
  assert.equal(r.problems.find((p) => p.kind === 'ratio').el.className, 'pz-h');
  assert.equal(r.problems.find((p) => p.where === 'card' && p.kind === 'tall').el, card);
});

test('Check on a page with no card says so and finds nothing', () => {
  set('<div id="app"><p>Just the figure</p></div>');
  const r = runCheck({ io: IO, pps: { card: { el: null } } });
  assert.deepEqual([r.problems.length, r.slide, r.structure, r.busy], [0, false, false, false]);
});

test('the red outlines: one per element, numbered as the list is, replaced by the next run and removed by Clear', () => {
  set('<div id="app"><div class="a" data-box="10,20,110,70"></div><div class="b" data-box="200,20,300,70"></div><div class="gone" data-box="0,0,0,0"></div></div>');
  const [a, b, gone] = ['.a', '.b', '.gone'].map((q) => document.querySelector(q));
  const problems = [{ kind: 'small', text: 'x', el: a }, { kind: 'scroll', text: 'y', el: b }, { kind: 'off', text: 'z', el: a }, { kind: 'cut', text: 'w', el: gone }, { kind: 'ratio', text: 'v', el: null }];
  assert.equal(drawOutlines(problems, { box: IO.box }), 2, 'a, b; the empty box and the missing element are skipped');
  const wrap = document.getElementById(OUTLINE_ID);
  assert.equal(wrap.getAttribute('aria-hidden'), 'true');
  assert.match(wrap.style.cssText, /pointer-events:\s*none/);
  const outs = [...wrap.children];
  assert.equal(outs.length, 2);
  assert.match(outs[0].style.cssText, /left:\s*10px/);
  assert.deepEqual(outs.map((o) => o.textContent), ['1, 3', '2']);
  assert.match(outs[0].style.cssText, /#e5242b|rgb\(229, 36, 43\)/, 'red');
  drawOutlines([{ kind: 'small', text: 'x', el: b }], { box: IO.box });
  assert.equal(document.querySelectorAll(`#${OUTLINE_ID}`).length, 1, 'never two layers');
  assert.equal(document.getElementById(OUTLINE_ID).children.length, 1);
  assert.equal(drawOutlines([], { box: IO.box }), 0);
  assert.equal(document.getElementById(OUTLINE_ID), null, 'an empty run leaves none');
  drawOutlines([{ kind: 'small', text: 'x', el: a }], { box: IO.box });
  clearOutlines();
  assert.equal(document.getElementById(OUTLINE_ID), null);
});

test('the copied list numbers each problem as its outline is', () => {
  const t = numberedReport([{ kind: 'small', text: 'span "a" 10.0 px' }, { kind: 'scroll', text: 'card runs 9 px past' }], { title: 'T', look: 'dark', size: '390 x 844' });
  assert.match(t, /^Card check: T\nlook dark, screen 390 x 844\n2 problems:/);
  assert.match(t, /scroll \(words run past the card\)\n {2}- #2 card runs 9 px past/);
  assert.match(t, /small \(lettering under 12 px\)\n {2}- #1 span "a" 10\.0 px/);
});

test('the frame request: the device, the rest of the address, the page inside the frame', () => {
  assert.equal(isFrameRequest('?gallery=frame'), true);
  assert.equal(isFrameRequest('?gallery'), false);
  assert.equal(isFrameRequest(''), false);
  assert.deepEqual(frameRequest('?gallery=frame&device=ipad&look=navy'), { device: 'ipad', rest: 'look=navy' });
  assert.deepEqual(frameRequest('?gallery=frame&device=nope'), { device: DEFAULT_FRAME, rest: '' });
  assert.equal(frameSrc({ pathname: '/preview/', search: '?gallery=frame&device=iphone&look=navy', hash: '#doppler/tips-gates' }), '/preview/?gallery&look=navy#doppler/tips-gates');
  assert.equal(frameSrc({ pathname: '/preview/', search: '?gallery=frame', hash: '' }), '/preview/?gallery');
  assert.equal(framePageUrl({ pathname: '/preview/', search: '?gallery=frame&device=iphone&look=navy', hash: '#a' }, 'mac'), '/preview/?gallery=frame&device=mac&look=navy#a');
  assert.equal(fitScale(390, 844, 1200, 800), 800 / 844);
  assert.equal(fitScale(390, 844, 1200, 2000), 1, 'never blown up');
  assert.equal(fitScale(1440, 900, 720, 800), 0.5);
  // (The phone sizes are the ones scripts/shoot.mjs and the card scripts use.)
  assert.deepEqual([FRAME_DEVICES.iphone.w, FRAME_DEVICES.iphone.h, FRAME_DEVICES['iphone-landscape'].w, FRAME_DEVICES['iphone-landscape'].h], [390, 844, 844, 390]);
  for (const [id, d] of Object.entries(FRAME_DEVICES)) if (d.turn) assert.equal(FRAME_DEVICES[d.turn].turn, id, `${id} turns back`);
});

test('bootFrame draws one iframe at the device size, scaled to fit, and starts no app', async () => {
  const { bootFrame } = await import('../src/ui/gallery/device-frame.js');
  const d = new JSDOM('<!doctype html><head></head><body></body>', { url: 'https://x.test/preview/?gallery=frame&device=iphone&look=navy#s' });
  const win = d.window;
  win.history.replaceState = win.history.replaceState.bind(win.history);
  const f = bootFrame(win.document, win);
  assert.equal(win.document.querySelectorAll('iframe').length, 1);
  const fr = win.document.querySelector('iframe');
  assert.equal(fr.getAttribute('src'), '/preview/?gallery&look=navy#s');
  assert.equal(fr.style.width, '390px'); assert.equal(fr.style.height, '844px');
  assert.equal(win.document.querySelector('[data-device="iphone"]').getAttribute('aria-pressed'), 'true');
  f.select('ipad');
  assert.equal(win.document.querySelectorAll('iframe').length, 1, 'one frame at a time');
  assert.equal(fr.style.width, '1180px');
  assert.equal(win.location.search, '?gallery=frame&device=ipad&look=navy');
  assert.equal(fr.getAttribute('src'), '/preview/?gallery&look=navy#s', 'the page inside is not reloaded');
  f.select('not-a-device');
  assert.equal(fr.style.width, '1180px');
  f.dispose();
});

test('the two fit scripts judge through the shared rules and keep no judging of their own', () => {
  for (const f of ['scripts/card-fit.mjs', 'scripts/phone-card-fit.mjs']) {
    const s = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    assert.match(s, /from '\.\.\/src\/ui\/gallery\/fit-rules\.js'/, `${f} imports the shared rules`);
    assert.match(s, /from '\.\/fit-io\.mjs'/, `${f} runs the readers through fit-io`);
    assert.ok(!/clippedInside|gapTop|ac-scroll|const READ = \(\) =>/.test(s.replace(/\/\/.*$/gm, '')), `${f} keeps no judging of its own`);
  }
});

test('the Check panel registers with the gallery, runs on a tap, and lists, outlines, copies and clears', async () => {
  globalThis.navigator ??= { clipboard: null };
  Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText: async (t) => { copied = t; } } }, configurable: true });
  let copied = '';
  globalThis.innerWidth = 390; globalThis.innerHeight = 844;
  const { panelList, mountPart } = await import('../src/ui/gallery/registry.js');
  await import('../src/ui/gallery/fit-rules-panel.js');
  const part = panelList().find((p) => p.id === 'check');
  assert.ok(part, 'the Check panel is registered');
  assert.equal(part.title, 'Check');
  // (A card with lettering under 12 px: the real layout-snap reads give zeros in jsdom, so the page here is only checked for the wiring.)
  set('<div id="app"><div class="pz"><section class="pz-text"><h1 class="pz-h">Title</h1></section></div></div>');
  const host = document.createElement('div'); document.body.append(host);
  const toasts = [];
  const off = mountPart(part, host, { pps: { card: { el: null } }, specimen: () => ({ title: 'Specimen' }), look: () => 'dark', toast: (t) => toasts.push(t) });
  const [go, copy, clear] = host.querySelectorAll('button');
  assert.equal(go.textContent, 'Check');
  assert.ok(copy.hidden && clear.hidden && host.querySelector('ol').hidden, 'nothing but the Check button before a run');
  go.click();
  assert.match(host.querySelector('.fitc-status').textContent, /Every card fits|No card is on the screen/);
  assert.equal(copy.hidden, false);
  copy.click(); await new Promise((r) => setTimeout(r, 0));
  assert.match(copied, /^Card check: Specimen\nlook dark, screen \d+ x \d+/);
  assert.deepEqual(toasts, ['Check list copied.']);
  off();
  assert.equal(document.getElementById(OUTLINE_ID), null);
  assert.equal(host.children.length, 0, 'the page empties its host on the way out');
});
