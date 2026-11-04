// The sinusoid view when the room the cards leave changes (a data card tucks, untucks, hides or docks; Mohammad, 28 Oct: "on iphone and
// upright ipad, in sinusoid view, when opening and closing data cards, tucking, untucking, hiding, the whole view jumps instead of
// transition/ease/glide"). The vessel always glided to its new centre; the names, the end arrows and the legend were laid against the room
// where it comes to rest, so they stood there at once. The real createSinusoidView runs here on a small stand-in for the DOM and the frame
// scheduler, frame by frame, so what is read is the view's own placement of each name, with no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

class El {
  constructor(tag) {
    this.tag = tag; this.nodeType = 1; this.children = []; this.attrs = {}; this.dataset = {}; this.hidden = false; this.isConnected = true;
    this.classSet = new Set(); this.vars = {}; this.offsetWidth = 96; this.offsetHeight = 30; this.rect = null;
    const vars = this.vars;
    this.style = { setProperty: (k, v) => { vars[k] = String(v); }, getPropertyValue: (k) => vars[k] ?? '', removeProperty: (k) => { delete vars[k]; } };
  }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'class') this.classSet = new Set(String(v).split(/\s+/).filter(Boolean)); }
  getAttribute(k) { return this.attrs[k] ?? null; }
  append(...k) { for (const c of k) this.children.push(c); }
  prepend(...k) { this.children.unshift(...k); }   // (the leaders' GPU picture's canvas: svg-gl createSvgGL)
  removeAttribute(k) { delete this.attrs[k]; }
  cloneNode(deep) {   // (a leader cloned from its model: sinusoid-view LEAD_TPL)
    const c = new El(this.tag);
    for (const [k, v] of Object.entries(this.attrs)) c.setAttribute(k, v);
    if (deep) for (const k of this.children) c.children.push(k.nodeType === 1 ? k.cloneNode(true) : { ...k });
    return c;
  }
  get attributes() { return Object.entries(this.attrs).map(([name, value]) => ({ name, value })); }
  replaceChildren(...k) { this.children = []; this.append(...k.flat(Infinity).filter((c) => c != null && c !== false)); }
  insertBefore(el) { this.children.push(el); }
  addEventListener() {}
  getAnimations() { return []; }
  // (only what the view asks for: the percentage's bold figure inside a value line)
  querySelector(sel) {
    if (sel !== '.v b') return null;
    let out = null;
    const walk = (n, inV) => { for (const c of n.children || []) { if (c.nodeType !== 1 || out) continue; if (inV && c.tag === 'b') out = c; else walk(c, inV || c.classSet.has('v')); } };
    walk(this, false);
    return out;
  }
  getContext() { return null; }
  getBoundingClientRect() { return this.rect || { width: 0, height: 0, left: 0, top: 0 }; }
  get firstElementChild() { return this.children.find((c) => c.nodeType === 1) || null; }
  set className(v) { this.setAttribute('class', v); }
  set textContent(v) { this.children = [{ nodeType: 3, textContent: String(v) }]; }
  get textContent() { return this.children.map((c) => c.textContent).join(''); }
  get classList() { const s = this; return { add: (c) => s.classSet.add(c), remove: (c) => s.classSet.delete(c), contains: (c) => s.classSet.has(c), toggle: (c, f) => { if (f === undefined) f = !s.classSet.has(c); f ? s.classSet.add(c) : s.classSet.delete(c); } }; }
}
const rootVars = {}, appVars = {}, appClasses = new Set(['presenting']);
const listeners = {};
let hostBox = { width: 390, height: 844, left: 0, top: 0 };
globalThis.window = globalThis;
// (The rest passes' shared time budget (prep-budget.js) counts wall time, which a hand-run frame loop does not keep: off here, so the
// page's work between frames runs where a browser would run it, not by how fast this machine is.)
globalThis.location = { search: '?prepbudget=0' };
globalThis.Element = class {};
globalThis.devicePixelRatio = 1;
// (An observer reports its elements' sizes before the next frame paints, as a browser's does: here, before each frame run by hand.)
const observers = [];
globalThis.ResizeObserver = class { constructor(cb) { this.cb = cb; this.fresh = []; observers.push(this); } observe(t) { this.fresh.push(t); } };
const reportSizes = () => { for (const o of observers) { const ts = o.fresh.splice(0); if (ts.length) o.cb(ts.map((target) => ({ target, contentRect: { width: 0, height: 0 } })), o); } };
globalThis.MutationObserver = class { observe() {} disconnect() {} };
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '', opacity: '1' });
globalThis.addEventListener = (type, fn) => { (listeners[type] ||= []).push(fn); };
globalThis.dispatchEvent = (ev) => { for (const fn of listeners[ev.type] || []) fn(ev); return true; };
const app = { dataset: {}, style: { getPropertyValue: (k) => appVars[k] ?? '', setProperty: (k, v) => { appVars[k] = String(v); } }, classList: { contains: (c) => appClasses.has(c) } };
globalThis.document = {
  createElement: (tag) => new El(tag), createElementNS: (ns, tag) => new El(tag), createTextNode: (t) => ({ nodeType: 3, textContent: String(t) }),
  getElementById: (id) => (id === 'app' ? app : null), querySelector: () => null, querySelectorAll: () => [], addEventListener() {},
  documentElement: { dataset: {}, style: { getPropertyValue: (k) => rootVars[k] ?? '', setProperty: (k, v) => { rootVars[k] = String(v); } } },
};
// The rest passes run whole, by hand, after each frame: the time slice and the shared preparation budget are real-clock limits that, on a
// busy machine (the whole suite running), cut a drain short and carried passes past the frame the test expects them in (3 flaky failures).
globalThis.location = { search: '?restslice=0&prepbudget=0' };
// The frame scheduler's browser frame: held here and run by hand, a frame at a time.
let flushNext = null;
globalThis.requestAnimationFrame = (cb) => { flushNext = cb; return 1; };
// The rest passes (rest-pass.js, a message between two frames: the page writes a frame asks for land there) run by hand too, after each frame.
const restQ = [];
globalThis.MessageChannel = class { constructor() { const p1 = { onmessage: null }; this.port1 = p1; this.port2 = { postMessage: () => restQ.push(() => p1.onmessage?.()) }; } };
const rests = () => { while (restQ.length) restQ.shift()(); };
// (A rest pass cut short by its time slice goes on in a zero timer (rest-pass.js): here, in the same hand-run drain, so the page's
// models are made and their looks read between the frames, as a browser runs them.)
const realTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms, ...a) => (ms > 16 ? realTimeout(fn, ms, ...a) : (restQ.push(() => fn(...a)), 0));
let clock = 1000;
// The view's own timers (a fade, the 250 ms the blockers' read waits) run on the same clock as the frames, not the wall's: on a busy machine
// the wall clock moved on between two held frames, and a read or a fade landed in a frame the test did not expect it in.
performance.now = () => clock;
const frames = (n, ms = 1000 / 60) => { for (let i = 0; i < n; i++) { rests(); reportSizes(); clock += ms; const f = flushNext; flushNext = null; if (f) f(clock); rests(); } };

const { createSinusoidView } = await import('../src/ui/sinusoid-view.js');
const { store } = await import('../src/ui/store.js');

const MODEL = { fibSin: 0.2, act: 0.2, zone: { sin: 1 }, congU: 0, flow: 1, rev: { sin: false }, lymph: 0.6, lymph0: 0.6, sigma: 0.2, lyProt: 0.8, hide: false, P1: 12, P2: 9, P3: 4 };
// (Where the GPU draws each name this frame: the view's own placement, caption-gl.js, never the page's model, placed between frames.)
const at = (p) => p;
const KEY = { lumen: 'sin', fenestrae: 'fen', disse: 'disse', in: 'in', out: 'out' };

function open(vars, box, { running = true, model = MODEL } = {}) {
  for (const k in appVars) delete appVars[k];
  Object.assign(appVars, vars);
  hostBox = box;
  store.set({ running });
  const host = new El('div'); host.rect = hostBox;
  const view = createSinusoidView({ host, before: null });
  view.setModel(model);
  view.place({ opacity: 1, isOpen: true });
  frames(40);
  const name = (t) => view.captionAt(KEY[t]);
  return {
    view, name,
    legend: () => view.captionAt('legend'),
    set(v) { Object.assign(appVars, v); dispatchEvent({ type: 'pps:occ' }); },
  };
}
// The place a name is drawn at, each frame for `n` frames after the room changes: [x, y] per frame.
function glide(o, read, n = 90) {
  const out = [read()];
  for (let i = 0; i < n; i++) { frames(1); out.push(read()); }
  return out;
}
const PHONE = { '--top-safe': '56px', '--cmp-h': '0px', '--pz-t': '300px', '--pz-b': '230px', '--pz-l': '0px', '--pz-r': '0px' };

test('a phone: tucking the data card moves the end names, the legend and the other names smoothly, a share of the way each frame', () => {
  const o = open(PHONE, { width: 390, height: 844, left: 0, top: 0 });
  const reads = { 'portal venule': () => at(o.name('in'))[1], 'central vein': () => at(o.name('out'))[1], 'the legend': () => at(o.legend())[1], 'the lumen name': () => at(o.name('lumen'))[1] };
  const before = Object.fromEntries(Object.entries(reads).map(([k, r]) => [k, r()]));
  o.set({ '--pz-t': '150px' });   // (the readings tuck: the card's foot comes up 150 px)
  // Frame by frame, from the moment the room changes.
  const trace = {};
  for (const k in reads) trace[k] = [before[k]];
  for (let i = 0; i < 110; i++) { frames(1); for (const k in reads) trace[k].push(reads[k]()); }
  for (const k in reads) {
    const ys = trace[k], total = ys.at(-1) - ys[0];
    if (k !== 'central vein') assert.ok(Math.abs(total) > 20, `${k} moves with the room (${total.toFixed(1)} px)`);
    let worst = 0;
    for (let i = 1; i < ys.length; i++) worst = Math.max(worst, Math.abs(ys[i] - ys[i - 1]));
    if (Math.abs(total) > 20) assert.ok(worst < Math.abs(total) * 0.2, `${k}: no frame moves more than a fifth of the way (largest step ${worst.toFixed(1)} of ${total.toFixed(1)} px)`);
    // ... and it goes one way only
    const dir = Math.sign(total);
    for (let i = 1; i < ys.length; i++) assert.ok((ys[i] - ys[i - 1]) * dir >= -0.6, `${k}: frame ${i} turns back (${ys[i - 1].toFixed(1)} to ${ys[i].toFixed(1)})`);
  }
});

test('the same on an upright iPad (the room under the top bar and above the words both change) and with the card hidden altogether', () => {
  const o = open({ ...PHONE, '--top-safe': '70px', '--pz-t': '360px', '--pz-b': '300px' }, { width: 820, height: 1180, left: 0, top: 0 });
  const rd = () => at(o.name('in'))[1];
  const y0 = rd();
  o.set({ '--pz-t': '0px', '--pz-b': '300px' });   // (the data card hidden)
  const ys = glide(o, rd, 110), total = ys.at(-1) - y0;
  assert.ok(Math.abs(total) > 40, `the portal venule's name moves (${total.toFixed(1)} px)`);
  let worst = 0;
  for (let i = 1; i < ys.length; i++) worst = Math.max(worst, Math.abs(ys[i] - ys[i - 1]));
  assert.ok(worst < Math.abs(total) * 0.2, `no frame moves more than a fifth of the way (largest step ${worst.toFixed(1)} of ${total.toFixed(1)} px)`);
});

test('a paused simulation glides too (its traffic stopped, the room still moves the names)', () => {
  const o = open(PHONE, { width: 390, height: 844, left: 0, top: 0 }, { running: false });
  frames(120);
  const rd = () => at(o.name('in'))[1];
  const y0 = rd();
  o.set({ '--pz-t': '150px' });
  const ys = glide(o, rd, 120), total = ys.at(-1) - y0;
  assert.ok(Math.abs(total) > 20, `the name follows the room while paused (${total.toFixed(1)} px)`);
  let worst = 0;
  for (let i = 1; i < ys.length; i++) worst = Math.max(worst, Math.abs(ys[i] - ys[i - 1]));
  assert.ok(worst < Math.abs(total) * 0.2, `a share of the way each frame (largest step ${worst.toFixed(1)} of ${total.toFixed(1)} px)`);
  // ... and it has come to rest exactly where a view opened at that room puts it.
  const rest = open({ ...PHONE, '--pz-t': '150px' }, { width: 390, height: 844, left: 0, top: 0 }, { running: false });
  assert.ok(Math.abs(ys.at(-1) - at(rest.name('in'))[1]) < 0.6, `the end name rests where a fresh view puts it (${ys.at(-1)} vs ${at(rest.name('in'))[1]})`);
});

test('across a wide screen: a card docking at the right moves the fenestrae and Disse names along the vessel by a share each frame, never at once', () => {
  const o = open({ ...PHONE, '--pz-t': '0px', '--pz-b': '0px', '--pz-l': '0px', '--pz-r': '0px' }, { width: 1180, height: 700, left: 0, top: 0 });
  const rd = () => ['fenestrae', 'disse'].map((t) => at(o.name(t))[0]);
  const x0 = rd();
  o.set({ '--pz-r': '420px' });
  const xs = glide(o, rd, 120);
  for (let j = 0; j < 2; j++) {
    const series = xs.map((p) => p[j]), total = series.at(-1) - series[0];
    let worst = 0;
    for (let i = 1; i < series.length; i++) worst = Math.max(worst, Math.abs(series[i] - series[i - 1]));
    // (A name that the card leaves in its place needs no glide; one the room moves must not step.)
    if (Math.abs(total) > 20) assert.ok(worst < Math.abs(total) * 0.2, `name ${j}: largest step ${worst.toFixed(1)} of ${total.toFixed(1)} px`);
  }
  assert.ok(x0.every(Number.isFinite));
});

test('turned from upright to sideways, and closed and opened again: the names stay on the screen, and a view opened anew starts at rest', () => {
  const o = open(PHONE, { width: 390, height: 844, left: 0, top: 0 });
  hostBox.width = 844; hostBox.height = 390;   // (the host's rect is the same object the view reads)
  dispatchEvent({ type: 'resize' });
  o.set({ '--pz-t': '0px', '--pz-b': '0px' });
  for (let i = 0; i < 120; i++) {
    frames(1);
    for (const t of ['in', 'out', 'lumen']) {
      const [x, y] = at(o.name(t));
      assert.ok(Number.isFinite(x) && Number.isFinite(y), `${t} is placed (${x}, ${y})`);
      assert.ok(x > -200 && x < 1100 && y > -200 && y < 700, `${t} stays near the screen (${x}, ${y})`);
    }
  }
  const y = at(o.name('in'))[1];
  o.view.place({ opacity: 0, isOpen: false });
  o.set({ '--pz-t': '0px' });
  o.view.place({ opacity: 1, isOpen: true });
  assert.ok(Math.abs(at(o.name('in'))[1] - y) < 0.6, 'opened again, the name is at rest in the room it finds, with no glide to make');
});

test('the view lays its names against the eased room, not the room where it comes to rest (source)', () => {
  const src = readFileSync(new URL('../src/ui/sinusoid-view.js', import.meta.url), 'utf8');
  assert.match(src, /const viewVec = \(\) => \{ CUR\[0\] = VW\.k; CUR\[1\] = VW\.C\[0\]; CUR\[2\] = VW\.C\[1\]; CUR\[3\] = VW\.fe\.l; CUR\[4\] = VW\.fe\.t; CUR\[5\] = VW\.fe\.r; CUR\[6\] = VW\.fe\.b; for \(let i = 0; i < 3; i\+\+\) CUR\[7 \+ i\] = VW\.ins\[i\];/, 'the room eases with the centre and scale, in one spring');
  assert.match(src, /const g = geo, f = VW\.fe;/, 'the end names and the legend take the eased room');
  assert.match(src, /const lx = f\.l \+ 2, ly = VW\.ins\[0\] \+ 12;/);
  assert.match(src, /const f0 = locAlong\(VW\.fe\.l, VW\.fe\.t, cx, cy, ga, gs, kk\), f1 = locAlong\(VW\.fe\.r, VW\.fe\.b, cx, cy, ga, gs, kk\);\s*\n\s*VW\.fr\[0\] = Math\.min\(f0, f1\); VW\.fr\[1\] = Math\.max\(f0, f1\);/, 'the band for the other names is the eased room too');
  assert.match(src, /if \(gliding \|\| layoutBusy\) settled = false;/, 'the loop never sleeps with a glide half done');
  assert.match(src, /addEventListener\('pps:occ', wake\);/, 'a change of room wakes a sleeping view');
});

// Mohammad, 29 Oct (iPhone): "when I untuck and tuck card stacked ... the view is snapping into new camera position instead of easing". The
// glide began with a kick (an exponential approach moves 7% of the way in its first frame) and took the whole of a slow frame: the layout the
// tuck sets off is a long frame on a phone, and 0.2 s of it carried the view 60% of the way in one step. It now sets out from rest as a spring
// and counts a frame at most STEP_MAX long.
test('the glide sets out from rest: its first frame moves a sliver, then it gathers pace', () => {
  const o = open(PHONE, { width: 390, height: 844, left: 0, top: 0 });
  const rd = () => at(o.name('in'))[1];
  const y0 = rd();
  o.set({ '--pz-t': '150px' });
  const ys = glide(o, rd, 110), total = ys.at(-1) - y0;
  assert.ok(Math.abs(total) > 20, `the name moves (${total.toFixed(1)} px)`);
  const steps = ys.slice(1).map((y, i) => Math.abs(y - ys[i]));
  assert.ok(steps[0] < Math.abs(total) * 0.03, `the first frame moves ${(100 * steps[0] / Math.abs(total)).toFixed(1)}% of the way, not a kick`);
  assert.ok(Math.max(...steps) > steps[0] * 2.5, 'and the steps grow after it (an ease in)');
  // ... and eases out: the last frames before it rests move less than its fastest
  const peak = steps.indexOf(Math.max(...steps));
  assert.ok(steps[peak + 12] < steps[peak] * 0.7, 'and slows towards the end (an ease out)');
});

test('a slow frame at the start of the glide holds it back instead of carrying the view part of the way at once', () => {
  const o = open(PHONE, { width: 390, height: 844, left: 0, top: 0 });
  const rd = () => at(o.name('in'))[1];
  const y0 = rd();
  o.set({ '--pz-t': '150px' });
  frames(1, 200);   // (the layout pass the tuck set off, a 200 ms frame)
  const y1 = rd();
  frames(110);
  const total = rd() - y0;
  assert.ok(Math.abs(total) > 20, `the name moves (${total.toFixed(1)} px)`);
  assert.ok(Math.abs(y1 - y0) < Math.abs(total) * 0.1, `a 200 ms frame moved it ${(100 * Math.abs(y1 - y0) / Math.abs(total)).toFixed(1)}% of the way`);
});

test('a slow frame in the middle of the glide moves it no further than two ordinary frames would', () => {
  const o = open(PHONE, { width: 390, height: 844, left: 0, top: 0 });
  const rd = () => at(o.name('in'))[1];
  const y0 = rd();
  o.set({ '--pz-t': '150px' });
  frames(12);
  const a = rd();
  frames(1, 250);
  const b = rd();
  frames(120);
  const total = rd() - y0;
  assert.ok(Math.abs(b - a) < Math.abs(total) * 0.16, `a 250 ms frame moved it ${(100 * Math.abs(b - a) / Math.abs(total)).toFixed(1)}% of the way`);
});

test('a target that moves on while the view glides (the layout pass after a tuck) carries it on with no stop and no turn back', () => {
  const o = open(PHONE, { width: 390, height: 844, left: 0, top: 0 });
  const rd = () => at(o.name('in'))[1];
  const y0 = rd();
  o.set({ '--pz-t': '150px' });
  const ys = [y0];
  for (let i = 0; i < 20; i++) { frames(1); ys.push(rd()); }
  o.set({ '--pz-t': '140px' });   // (the second layout pass lands 10 px higher)
  for (let i = 0; i < 100; i++) { frames(1); ys.push(rd()); }
  const total = ys.at(-1) - y0, dir = Math.sign(total);
  for (let i = 1; i < ys.length; i++) assert.ok((ys[i] - ys[i - 1]) * dir >= -0.6, `frame ${i} turns back (${ys[i - 1].toFixed(1)} to ${ys[i].toFixed(1)})`);
  const mid = ys.slice(18, 24).map((y, i, a) => (i ? Math.abs(y - a[i - 1]) : 0)).slice(1);
  assert.ok(Math.min(...mid) > 0.05, 'it does not stop where the first target was');
  const rest = open({ ...PHONE, '--pz-t': '140px' }, { width: 390, height: 844, left: 0, top: 0 });
  assert.ok(Math.abs(ys.at(-1) - at(rest.name('in'))[1]) < 0.6, 'and comes to rest where the second puts it');
});
