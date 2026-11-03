// The scan follows a call only where the code can make it (2 Nov 2026: a number named r in one function was taken for a row of a table
// another function's r stood for, a small arrow named a for every function stored under a, a typed array's fill for a recorder's fill,
// a DOM node named panel for another function's panel arrow, and a plain object's o.data for a write to the page; each made hundreds of
// sites look like frame work they are not, and pointed the threads at code that never runs in a frame).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scan } from '../scripts/off-gpu-scan.mjs';

const fixture = (m) => {
  const root = mkdtempSync(join(tmpdir(), 'offgpu-scope-'));
  mkdirSync(join(root, 'src/ui'), { recursive: true }); mkdirSync(join(root, 'styles'));
  writeFileSync(join(root, 'index.html'), '<html></html>');
  writeFileSync(join(root, 'src/ui/frame.js'), 'export function frame(cb) { return requestAnimationFrame(cb); }\nexport const frameFor = (t) => (cb) => frame(cb, t);\n');
  writeFileSync(join(root, 'src/ui/m.js'), m);
  return scan({ root });
};
// (a site is on the frame path when it is a hit of its own category; reached only by an event, timer or registry it is `unreached`)
const onFrame = (hits, re) => hits.some((h) => h.cat !== 'unreached' && re.test(h.detail));
const anywhere = (hits, re) => hits.some((h) => re.test(h.detail));

test('an alias of a registry holds in the function that makes it, not in every function with a variable of that name', () => {
  const hits = fixture(`
import { frameFor } from './frame.js';
const raf = frameFor('m');
const real = [], phantom = [];
real.push(() => { document.body.textContent = 'real'; });
phantom.push(() => { document.body.title = 'x'; document.body.className = 'phantom'; });
function rows() { for (const r of phantom) r.go(); }       // (r here is a row of phantom)
function walk() { for (const t of real) t(); }             // (a real call through a registry, in a frame)
function haloLike(x) { const r = x * 2; return r.toFixed(2); }   // (r here is a number: no registry)
function step() { walk(); haloLike(3); }
raf(step);
rows();
`);
  assert.ok(onFrame(hits, /\.textContent =/), 'a call through a registry from a frame still reaches what the registry holds');
  assert.ok(anywhere(hits, /\.className =/) && !onFrame(hits, /\.className =/), 'r.toFixed() on a number does not call the functions another r stood for');
});

test('a bare call of a function declared in scope is that function, not a call through a registry of that name', () => {
  const hits = fixture(`
import { frameFor } from './frame.js';
const raf = frameFor('m');
const hooks = [];
hooks.push(function late() { document.body.className = 'hooked'; });
function step() { const hooks = (k) => k + 1; return hooks(2); }
raf(step);
`);
  assert.ok(anywhere(hits, /\.className =/) && !onFrame(hits, /\.className =/), 'hooks(2) is the arrow in step, not the hooks array');
  const hits2 = fixture(`
import { frameFor } from './frame.js';
const raf = frameFor('m');
const hooks = [];
hooks.push(function late() { document.body.className = 'hooked'; });
function step(hooks) { return hooks(2); }
raf(step);
`);
  assert.ok(onFrame(hits2, /\.className =/), 'a parameter of that name may still be a registry member, so it is followed');
});

test('a method of a built-in value is not a method of the file: S.fill(0) on a typed array is not the recorder\'s fill', () => {
  const hits = fixture(`
import { frameFor } from './frame.js';
const raf = frameFor('m');
const rec = { fill() { document.body.className = 'recorder'; } };
const GS = new Float32Array(8);
function step() { const S = GS; S.fill(0); }
function step2(x) { x.fill(); }
raf(step);
rec.fill();
`);
  assert.ok(anywhere(hits, /\.className =/) && !onFrame(hits, /\.className =/), 'S.fill(0) does not reach the recorder');
  const hits2 = fixture(`
import { frameFor } from './frame.js';
const raf = frameFor('m');
const rec = { fill() { document.body.className = 'recorder'; } };
function step(S) { S.fill(0); }
raf(step);
`);
  assert.ok(onFrame(hits2, /\.className =/), 'a parameter of unknown kind may be the recorder, so it is followed');
});

test('a variable handed to a function is not another scope\'s function of the same name', () => {
  const hits = fixture(`
import { frameFor } from './frame.js';
const raf = frameFor('m');
function wallsVisual() { const panel = () => { document.body.className = 'panel'; }; addEventListener('click', panel); }
function cardIn(fn) { raf(fn); }
function mount() { const panel = document.createElement('div'); cardIn(panel); }
mount(); wallsVisual();
`);
  assert.ok(anywhere(hits, /\.className =/) && !onFrame(hits, /\.className =/), 'cardIn(panel) hands a DOM node, not wallsVisual\'s panel arrow');
  const hits2 = fixture(`
import { frameFor } from './frame.js';
const raf = frameFor('m');
function cardIn(fn) { raf(fn); }
function mount() { const panel = () => { document.body.className = 'panel'; }; cardIn(panel); }
mount();
`);
  assert.ok(onFrame(hits2, /\.className =/), 'a function handed under its own name in scope is still a frame callback');
});

test('data, value, src… set on a plain object is not a write to the page', () => {
  const hits = fixture(`
import { frameFor } from './frame.js';
const raf = frameFor('m');
const liveOut = { data: null, shape: null };
const regions = {};
function step(el, key) {
  const o = liveOut; o.data = 1;
  let R = regions[key];
  if (!R) R = regions[key] = { value: 0, name: null };
  R.value = 2;
  el.value = 3;
}
raf(step);
`);
  const writes = hits.filter((h) => h.cat === 'attrWrite');
  assert.equal(writes.length, 1, `only el.value is a write: ${writes.map((h) => h.detail)}`);
  assert.match(writes[0].detail, /\.value =/);
});

test('sites reached only by events, timers or promises are shown as their own line, apart from the per-frame view and never hidden from the honest total', async () => {
  const { score, eventOnly } = await import('../scripts/off-gpu-scan.mjs');
  const hits = fixture(`
import { frameFor } from './frame.js';
const raf = frameFor('m');
function step() { document.body.className = 'frame'; }
raf(step);
addEventListener('click', () => { document.body.textContent = 'click'; });
Promise.resolve().then(() => { document.body.hidden = true; });
`);
  const e = eventOnly(hits);
  assert.equal(e.n, 2, 'the click write and the promise write');
  assert.equal(e.kinds['event handler'], 1);
  assert.equal(e.kinds.promise, 1);
  assert.ok(hits.some((h) => h.cat !== 'unreached' && /\.className =/.test(h.detail)), 'the frame write is a per-frame site, not event-only');
  const line = score(hits);
  assert.match(line, /per-frame view \(event-only sites set aside\): \d+\/\d+ on GPU \(\d+%\), 2 event-only sites listed apart \((promise 1, event handler 1|event handler 1, promise 1)\)/);
  assert.match(line, new RegExp(`${hits.onGpu}/${hits.sites} on GPU`), 'the honest total still counts every site');
});

test('a variable kept as null for an object made later is that object, not a built-in value (the scan had never reached the vessel renderer)', () => {
  const root = mkdtempSync(join(tmpdir(), 'offgpu-scope-'));
  mkdirSync(join(root, 'src/ui'), { recursive: true }); mkdirSync(join(root, 'styles'));
  writeFileSync(join(root, 'index.html'), '<html></html>');
  writeFileSync(join(root, 'src/ui/frame.js'), 'export function frame(cb) { return requestAnimationFrame(cb); }\nexport const frameFor = (t) => (cb) => frame(cb, t);\n');
  writeFileSync(join(root, 'src/ui/n.js'), "export function make() { return { draw() { document.body.className = 'drawn'; } }; }\n");
  writeFileSync(join(root, 'src/ui/m.js'), `
import { frameFor } from './frame.js';
import { make } from './n.js';
const raf = frameFor('m');
let veins = null;
veins = make();
function step() { veins.draw(); }
raf(step);
`);
  const hits = scan({ root });
  assert.ok(hits.some((h) => h.cat !== 'unreached' && h.file === 'src/ui/n.js' && /\.className =/.test(h.detail)), 'veins.draw() in a frame reaches the drawn object\'s method');
});
