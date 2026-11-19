// Review 15 Nov 2026, PC-1 and PC-2: a web font that arrives after a surface was fitted refits it, and a card that ends its fit with
// its words still cut off is recorded by slide.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { presenterSource } from './split-src.js';

const SRC = new URL('../src/ui/', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, SRC), 'utf8');
const PZ = presenterSource();

test('font-arrival: the counter moves and every subscriber hears each batch of faces, one that throws stops none, and a stopped one is silent', async () => {
  const fonts = new EventTarget();
  globalThis.document = { fonts };
  const { fontGen, onFontsLoaded } = await import('../src/ui/font-arrival.js?t=' + Date.now());
  const heard = [], errs = [];
  const realST = globalThis.setTimeout;
  globalThis.setTimeout = (fn) => { try { fn(); } catch (e) { errs.push(e.message); } };   // (the rethrow is deferred to a timer: caught here)
  onFontsLoaded(() => { throw new Error('boom'); });
  onFontsLoaded(() => heard.push('a'));
  const off = onFontsLoaded(() => heard.push('b'));
  const g0 = fontGen();
  fonts.dispatchEvent(new Event('loadingdone'));
  assert.equal(fontGen(), g0 + 1, 'a face arriving changes what a fit made before it depends on');
  off();
  fonts.dispatchEvent(new Event('loadingdone'));
  assert.equal(fontGen(), g0 + 2);
  assert.deepEqual(heard, ['a', 'b', 'a'], 'both heard the first; the stopped one missed the second');
  globalThis.setTimeout = realST;
  assert.deepEqual(errs, ['boom', 'boom'], 'the throws surfaced (once per batch), after the others ran');
  delete globalThis.document;
});

test('presenter: a card fit depends on the font generation, and a late face drops the words plan, the phone cap and every fit', () => {
  assert.match(PZ, /const fitSig = \(el\) => `f\$\{fontGen\(\)\}\|/);
  const fn = PZ.slice(PZ.indexOf('  const onFonts = () => {'), PZ.indexOf('// alloc-rare: slide arrival', PZ.indexOf('  const onFonts = () => {')));
  assert.match(fn, /(?:live\.)?textLock = null; phoneLock = null;/);
  assert.match(fn, /for \(const el of \[(?:live\.)?ui\.text, (?:live\.)?ui\.data, (?:live\.)?ui\.panel\]\) (?:live\.)?fitDone\.delete\(el\);/);
  assert.match(fn, /if \((?:live\.)?thrown\(\)\) layoutAtLanding\(\); else layout\(\);/);
});

test('every fit that measures text hears each batch of faces: none waits on document.fonts.ready alone', () => {
  const ok = new Set(['topbar-motion.js', 'stage-label-text.js']);   // (one start; and one that also listens to loadingdone)
  const files = [];
  const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.js')) files.push(p); } };
  walk(new URL('../src/', import.meta.url).pathname);
  const bad = [];
  for (const f of files) {
    const t = /\/presenter(?:-[a-z]+)?\.js$/.test(f) ? PZ : readFileSync(f, 'utf8');   // (the presenter is read with its parts: a listener may sit in another)
    for (const m of t.matchAll(/fonts\?*\.ready\b[^\n]*/g)) {
      const base = f.split('/').pop();
      if (ok.has(base) || /Promise\.race/.test(m[0]) || /loadingdone/.test(t) || /onFontsLoaded/.test(t)) continue;
      bad.push(`${base}: ${m[0].slice(0, 80)}`);
    }
  }
  assert.deepEqual(bad, []);
  assert.match(PZ, /onFontsLoaded\(/, 'presenter');
  assert.match(read('tool-fluid.js'), /onFontsLoaded\(/, 'tool-fluid.js');
  assert.doesNotMatch(PZ, /fonts\?\.ready\??\.then/);
});

test('card-clip: only words past the box that clips them count, by more than rounding', async () => {
  const { reachPast, isClipped, SLACK } = await import('../src/ui/card-clip.js');
  const bound = { bottom: 100, right: 200 };
  const q = (bottom, right, w = 10, h = 12) => ({ bottom, right, width: w, height: h });
  assert.deepEqual(reachPast([q(90, 150)], bound), { v: 0, h: 0 }, 'inside: no reach');
  assert.equal(isClipped(reachPast([q(100 + SLACK, 150)], bound)), false, 'rounding is not clipping');
  assert.equal(isClipped(reachPast([q(104, 150)], bound)), true, 'a last line cut below');
  assert.equal(isClipped(reachPast([q(50, 210)], bound)), true, 'a word cut at the side');
  assert.equal(isClipped(reachPast([q(500, 500, 0, 12), q(500, 500, 10, 0)], bound)), false, 'a box with no glyphs is not a word');
  assert.deepEqual(reachPast([], bound), { v: 0, h: 0 });
});

test('presenter: a card that ends its fit cut off is recorded by slide and card, once, never while the cards move, and shows in the paste', () => {
  assert.match(PZ, /const sig = fitSig\(el\);\n\s+if \((?:live\.)?fitDone\.get\(el\) === sig\) \{ clipSoon\(el\); continue; \}/, 'a fit kept as it was is still looked at once');
  assert.match(PZ, /(?:live\.)?fitDone\.set\(el, fitSig\(el\)\);[^\n]*\n\s+clipSoon\(el\);/);
  const fn = PZ.slice(PZ.indexOf('  const clipSeen = new WeakMap()'), PZ.indexOf('  // A narrow summary table'));
  assert.match(fn, /(?:live\.)?cardMoving\(\)\) return;/);
  assert.match(fn, /clipSeen\.get\(c\) === key\) continue;/);
  assert.match(fn, /(?:live\.)?degrade\(why\)/);
  assert.match(fn, /`card-clipped:\$\{(?:live\.)?slides\[(?:live\.)?want\]\?\.id \?\? (?:live\.)?want\}:/);
  assert.match(PZ, /const degraded = \{ n: 0, last: '', clipped: \[\] \};/);
  assert.match(PZ, /degraded: \(\) => \(\{ \.\.\.degraded, clipped: \[\.\.\.degraded\.clipped\]/);
  assert.match(read('lap.js'), /Cards still clipped after their fit/);
});
