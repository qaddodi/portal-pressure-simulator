// A slide change as one transaction (review pass 2, priority 3): ids that supersede, stale publication refused, input owned and given
// back together, slide preparation cancelled with its change, and the presenter checking its transaction after every await.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTxns } from '../src/ui/slide-txn.js';

const keepUp = setInterval(() => {}, 1000);
after(() => clearInterval(keepUp));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 2000) => { const t = performance.now(); while (!f() && performance.now() - t < ms) await sleep(5); };
const prepUrl = new URL('../src/ui/slide-prep.js', import.meta.url);
const { createSlidePrep } = await import(prepUrl.href);
const PZ = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');

test('a new transaction supersedes the one before: it is no longer live, its signal aborts, its releases run newest first', () => {
  const txns = createTxns();
  const a = txns.begin({ to: 3 }), order = [];
  a.onRelease(() => order.push(1)); a.onRelease(() => order.push(2));
  assert.equal(a.live(), true);
  const b = txns.begin({ to: 4 });
  assert.equal(a.live(), false);
  assert.equal(b.live(), true);
  assert.equal(b.id, a.id + 1);
  assert.equal(a.signal?.aborted ?? true, true);
  assert.deepEqual(order, [2, 1]);
  assert.equal(txns.current(), b);
  let later = 0; a.onRelease(() => later++);
  assert.equal(later, 1, 'a release asked of an ended transaction runs at once');
});

test('only the current transaction publishes: a stale one is refused and counted', () => {
  const txns = createTxns();
  const a = txns.begin(), b = txns.begin();
  let shown = null;
  assert.equal(a.publish(() => { shown = 'a'; }), false);
  assert.equal(b.publish(() => { shown = 'b'; }), true);
  assert.equal(shown, 'b');
  b.end();
  assert.equal(b.publish(() => { shown = 'late'; }), false);
  assert.equal(shown, 'b');
  assert.equal(txns.stats().stale, 2);
});

test('leaving cards are disowned until the current change gives them back, across rapid Next / Back', () => {
  const txns = createTxns();
  const card = { inert: false }, data = { inert: false }, kept = { inert: true };
  const a = txns.begin();
  a.own([card, data, null, kept]);
  assert.equal(card.inert, true); assert.equal(data.inert, true);
  const b = txns.begin();   // (Back pressed while the first change runs)
  assert.equal(card.inert, true, 'the superseded change does not hand them back mid-flight');
  b.restore([data]);
  assert.equal(data.inert, false);
  b.end();
  assert.equal(card.inert, false, 'the change that lands gives the rest back');
  assert.equal(kept.inert, true, 'an element inert for its own reasons is left alone');
});

test('slide preparation belongs to its change: a newer aim, or a superseded transaction, stops it and leaves nothing queued', async () => {
  const calls = [];
  let resolve;
  const prep = createSlidePrep({ count: () => 10, steps: {
    state: (i) => { calls.push(`state${i}`); return new Promise((r) => { resolve = () => r({}); }); },
    glyphs: () => Promise.resolve(), tool: (i) => calls.push(`tool${i}`), shaders: () => 0,
  } });
  const txns = createTxns();
  const a = txns.begin();
  prep.aim(4, 'next', a.live);
  await until(() => calls.length > 0);
  assert.deepEqual(calls, ['state4']);
  txns.begin();   // (superseded)
  resolve();
  await sleep(60);
  assert.ok(!calls.includes('tool4'), 'nothing after the change was superseded');
  const b = txns.begin();
  prep.aim(5, 'next', b.live);
  prep.aim(6, 'next', b.live);   // (Next again at once)
  assert.ok(prep.stats().cancelled >= 1);
  assert.ok(prep.stats().live <= 1, 'one generation of jobs at a time');
  resolve(); await sleep(30); resolve(); await sleep(120);
  assert.equal(calls.filter((c) => c === 'tool5').length, 0, 'the slide passed over is not warmed');
});

test('slide preparation finishes a manifest when nothing supersedes it, and keeps at most five (two either side)', async () => {
  const prep = createSlidePrep({ count: () => 10, steps: { state: () => Promise.resolve({}), glyphs: () => Promise.resolve({}), tool: () => {}, shaders: () => 0 } });
  for (const i of [1, 2, 3, 7]) prep.aim(i, 'next');
  await until(() => prep.ready(7));
  assert.equal(prep.ready(7), true);
  assert.ok(prep.stats().kept <= 5);
  assert.equal(prep.manifest(1), null, 'a slide far behind is dropped');
});

// ── The presenter (source pins: the transaction wired where it decides) ──
const fn = (head) => { const i = PZ.indexOf(head); assert.ok(i >= 0, head); return PZ.slice(i, PZ.indexOf('\n  }\n', i)); };
test('go() begins the transaction before anything else of the change, and the preparation serves it', () => {
  assert.match(fn('function go(i) {'), /const tx = \(txn = txns\.begin\(\{ to: want, dir: turn \}\)\);\s*slidePrep\.aim\(want, turn, tx \? tx\.live : undefined\);/);
  assert.match(fn('function prepHold(i, then) {'), /!txnLive\(tx\)/, 'a prep hold of a superseded change lets go');
  assert.match(PZ, /k = `\$\{want\}\|\$\{gen\}\|\$\{txn\?\.id \|\| 0\}\|/, 'a newer press is a new try');
});

test('transitionRun checks its transaction after every await before it publishes content, visibility, camera or marks', () => {
  const run = PZ.slice(PZ.indexOf('async function transitionRun('), PZ.indexOf('function paintOverlays('));
  assert.match(run, /cut = \(\) => !deck \|\| want !== to \|\| gen !== g \|\| !txnLive\(tx\);/);
  const code = run.replace(/\/\/[^\n]*/g, '');
  const re = /if \(!await\b|\bawait\s+(\w+)?|cut\(\)|\b(cardsIn|figureIn|applyState|paintOverlays|camera|cathTo)\(|shown = \{/g;
  let dirty = false, m;
  const bad = [];
  while ((m = re.exec(code))) {
    const t = m[0];
    if (t.startsWith('if (!await') || t === 'cut()') { dirty = false; continue; }
    if (t.startsWith('await')) { dirty = true; continue; }
    if (dirty) bad.push(code.slice(Math.max(0, m.index - 100), m.index + 20).replace(/\s+/g, ' '));
  }
  assert.deepEqual(bad, [], 'a publication after an await with no check of the transaction between');
});

test('the leaving cards are disowned at the press and when the change starts, and given back when its cards come in', () => {
  assert.match(fn('function outNow() {'), /txn\?\.own\(els\);/);
  assert.match(PZ, /tx\?\.own\(\[keepNow\.text \? null : ui\.text, keepNow\.text \? null : ui\.shade, keepNow\.data \? null : ui\.data, ui\.panel\]\);/);
  assert.match(PZ, /function cardsIn\(at\) \{[^\n]*?if \(!bare\) \{ ui\.text\.classList\.remove\('pz-leave'\); txn\?\.restore\(\);/);
  assert.match(PZ, /if \(mine && want === to\) tx\.end\(\);/);
  assert.match(fn('function stopNow('), /txn\?\.end\(\); txn = null;/);
});

test('phase: each begin starts without a phase; stats and trail name the current step', () => {
  const txns = createTxns();
  const a = txns.begin({ to: 1 });
  assert.equal(txns.stats(0).phase, null);
  a.phase('leave', 100); a.phase('camera', 250);
  assert.deepEqual(txns.stats(1000), { ...txns.stats(1000), phase: 'camera', since: 750 });
  assert.deepEqual(txns.trail(), [{ phase: 'leave', at: 100 }, { phase: 'camera', at: 250 }]);
  const b = txns.begin({ to: 2 });
  assert.equal(txns.stats(0).phase, null);
  a.phase('late', 300);   // a superseded change names nothing
  assert.equal(txns.stats(0).phase, null);
  b.phase('cards', 5);
  assert.equal(txns.stats(10).phase, 'cards');
  b.end();
  assert.equal(txns.stats(10).phase, null);
});
