// glass-motion.js builds nothing in a frame (2 Nov 2026, "SVG and CPU do NOTHING during motion"). The glass reads a card's inline
// transform and translate, its keyframes' progress and its style attribute's changes every frame of a slide change; each of those
// used to split, trim, map and allocate (29 sites on the off-GPU scan). They now walk the text by character code and write numbers
// into kept buffers. These tests hold them to the old code's answers (tests/fixtures/glass-motion-ref.mjs is the module as it was at
// 93a7c877, verbatim) over hand-made and random input, and hold the new code to building nothing at all.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PerformanceObserver } from 'node:perf_hooks';
import * as ref from './fixtures/glass-motion-ref.mjs';
import { shiftInto, translateInto, compileKeyframes, motionAt, Motion, movesOnly, clockOf, clockAt, Inline, inlineShift, inlineTranslate } from '../src/ui/glass-motion.js';

// A seeded random source, so a failure repeats.
let seed = 0x2f6e2b1;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];

const PAIR = new Float64Array(2);
const same = (a, b) => Object.is(a, b) || (Number.isNaN(a) && Number.isNaN(b));

const NUMS = ['0', '0px', '0.0', '-0', '-0px', '1', '1px', '-1px', '12px', '-12.5px', '.5px', '5.px', '+3px', '1e2px', '1E-2px', '1e', '1e+', '1.5e3px', '10PX', '10Px', '10 px', '3em', '50%', 'auto', '', ' ', 'NaN', 'Infinity', '-Infinity', '0x10', '1_0px',
  '123456789.123456px', '0.000001px', '12.3456789012345678px', '1e30px', '1e-30px', '00012px', '-.0px', '.px', '-', '--1px', '1.2.3px', 'calc(1px + 2px)', '1e400px', '9007199254740993px', '0.1px', '0.7px', '33.333333px', '-249.99px'];

function transform() {
  const parts = [];
  const n = Math.floor(rnd() * 4);
  for (let i = 0; i < n; i++) {
    const kind = pick(['translate', 'translate3d', 'translateX', 'translateY', 'matrix', 'matrix3d', 'scale', 'rotate', 'translateZ', 'junk']);
    let args;
    if (kind === 'matrix') args = [1, 0, 0, 1, pick(NUMS), pick(NUMS)].map((v, k) => (k < 4 && rnd() < 0.1 ? pick(NUMS) : v));
    else if (kind === 'matrix3d') {
      args = Array.from({ length: 16 }, (_, k) => ([0, 5, 10, 15].includes(k) ? 1 : [12, 13].includes(k) ? pick(NUMS) : 0));
      if (rnd() < 0.2) args[Math.floor(rnd() * 16)] = pick(NUMS);
      if (rnd() < 0.1) args.pop();
    } else args = Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => pick(NUMS));
    parts.push(`${kind}(${args.join(pick([',', ', ', ' , ', ',  ']))})`);
  }
  const sep = pick([' ', '', '  ', '\n', '\t', ' x ']);
  let s = parts.join(sep);
  const r = rnd();
  if (r < 0.06) s = 'none'; else if (r < 0.1) s = ''; else if (r < 0.14) s = ` ${s} `; else if (r < 0.17) s += 'translate('; else if (r < 0.2) s = `junk ${s}`; else if (r < 0.22) s = ' none ';
  return s;
}

test('shiftInto answers as the old shiftOf did, on hand-made and random transforms', () => {
  const hand = ['', 'none', '  none  ', 'None', 'translate(0px, 0px)', 'translate(10px)', 'translate(10px, 4px)', 'translate(-3.5px, 2px)', 'translateX(5px)', 'translateY(-5px)', 'translateX(1px) translateY(2px)',
    'translate3d(1px, 2px, 0px)', 'translate3d(1px, 2px, 3px)', 'translate3d(1px, 2px)', 'translate3d(1px, 2px, 0)', 'matrix(1, 0, 0, 1, 12, 7)', 'matrix(1,0,0,1,12.5,-7.25)', 'matrix(2, 0, 0, 1, 12, 7)',
    'matrix(1, 0, 0, 1, 12)', 'matrix()', 'matrix3d(1,0,0,0, 0,1,0,0, 0,0,1,0, 8,9,0,1)', 'matrix3d(1,0,0,0, 0,1,0,0, 0,0,1,5, 8,9,0,1)', 'matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,8,9,0)', 'matrix3d(1,0,0,0, 0,1,0,0, 0,0,1,0, 1e-7,9,0,1)',
    'scale(2)', 'rotate(5deg)', 'translate(10px) scale(2)', 'translate(10%, 4px)', 'translate(calc(1px + 2px))', 'translate (1px)', 'translate(1px', 'translate(1px)translate(2px)', 'translate(1px) ) ', 'translate(1px) x', 'x translate(1px)',
    'translate(1px,)', 'translate(,1px)', 'translate()', 'translateX()', 'translate3d(1px,2px,)', 'translateX(1px, 99px)', 'translate(0, 0)', 'translate(1, 2)', 'translate(-0px, -0px)', 'matrix(1, 0, 0, 1, Infinity, 0)', 'matrix(1, 0, 0, 1, 0x10, 0)',
    'matrix(1, 0, 0, 1, , )', 'matrix(1,0,0,1,1e999,0)', 'translate(1e999px, 0px)'];
  const cases = [...hand];
  for (let i = 0; i < 20000; i++) cases.push(transform());
  for (const c of cases) {
    const want = ref.shiftOf(c), got = shiftInto(c, PAIR);
    assert.equal(got, want !== null, `shiftOf(${JSON.stringify(c)}) ${want}`);
    if (want) { assert.ok(same(PAIR[0], want[0]) && same(PAIR[1], want[1]), `${JSON.stringify(c)}: ${[...PAIR]} vs ${want}`); }
  }
  assert.equal(shiftInto(undefined, PAIR), true);
  assert.equal(shiftInto(null, PAIR), true);
});

test('translateInto answers as the old translateOf did', () => {
  const hand = ['', 'none', ' none ', '10px', '10px 4px', '10px 4px 0px', '10px 4px 1px', '10px 4px 0', '1px 2px 3px 4px', '0', '0 0', '0px', '  5px   6px  ', '10px\n4px', '10%', '10px 50%', 'auto', 'none none', 'NONE', '-0px -0px', '.5px', '1e2px 1e-2px', '5', '0.800px 0.500px', '1.5px'];
  const cases = [...hand];
  for (let i = 0; i < 20000; i++) cases.push(Array.from({ length: Math.floor(rnd() * 5) }, () => pick(NUMS)).join(pick([' ', '  ', '\t', ' \n '])));
  for (const c of cases) {
    const want = ref.translateOf(c), got = translateInto(c, PAIR);
    assert.equal(got, want !== null, `translateOf(${JSON.stringify(c)}) ${want}`);
    if (want) assert.ok(same(PAIR[0], want[0]) && same(PAIR[1], want[1]), `${JSON.stringify(c)}: ${[...PAIR]} vs ${want}`);
  }
});

test('Inline keeps the numbers and parses again only when the text changed', () => {
  const m = new Inline();
  assert.equal(inlineShift(m, 'translate(10px, 4px)'), true);
  assert.deepEqual([m.tx, m.ty], [10, 4]);
  assert.equal(inlineShift(m, 'translate(10px, 4px)'), true);
  assert.equal(inlineShift(m, 'rotate(3deg)'), false);
  assert.equal(inlineShift(m, ''), true);
  assert.deepEqual([m.tx, m.ty], [0, 0]);
  assert.equal(inlineShift(new Inline(), undefined), true, 'a style with no transform is none');
  assert.equal(inlineTranslate(m, '3px 5px'), true);
  assert.deepEqual([m.ux, m.uy], [3, 5]);
  assert.equal(inlineTranslate(m, '50%'), false);
  assert.equal(inlineTranslate(m, 'none'), true);
  assert.deepEqual([m.ux, m.uy], [0, 0]);
});

const EASES = ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'cubic-bezier(0.2, 0, 0, 1)', 'cubic-bezier(0.4,0,0.2,1)', 'cubic-bezier(0.5, 1.6, 0.5, -0.6)', 'cubic-bezier(0, 0, 1, 1)', 'cubic-bezier(1,2,3)', 'cubic-bezier(a,b,c,d)', 'steps(4)', 'steps(2, jump-end)', 'linear(0, 1)', '', 'constructor', 'toString', '__proto__'];
const TRANSFORMS = ['translateX(0px)', 'translateX(40px)', 'translateY(-12px)', 'translate(10px, 20px)', 'none', 'translate3d(0px, 0px, 0px)', 'matrix(1, 0, 0, 1, 5, 6)', 'scale(0.9)', 'rotate(4deg)', 'translateX(10%)'];

function keyframes() {
  const n = 1 + Math.floor(rnd() * 5);
  const hasT = rnd() < 0.6, hasO = rnd() < 0.6;
  const kf = [];
  for (let i = 0; i < n; i++) {
    const k = { easing: pick(EASES) };
    const r = rnd();
    if (r < 0.7) k.computedOffset = n > 1 ? i / (n - 1) : 0;
    else if (r < 0.85) k.offset = rnd(); else if (r < 0.9) { k.computedOffset = i === 0 ? 0 : kf[i - 1].computedOffset ?? 0; }
    if (hasT && rnd() < 0.93) k.transform = pick(TRANSFORMS);
    if (hasO && rnd() < 0.93) k.opacity = pick(['0', '1', '0.5', 0.25, '0.75', '1e-1', 'x']);
    kf.push(k);
  }
  return kf;
}

test('motionAt answers as the old motionAt did, on random keyframes at every progress', () => {
  const ps = [NaN, Infinity, -Infinity, -1, -0.001, 0, 1e-9, 0.1, 0.25, 0.3333, 0.5, 0.5000001, 0.75, 0.9, 0.999, 1, 1.5, 2];
  const out = new Motion();
  for (let c = 0; c < 4000; c++) {
    const kf = keyframes(), T = compileKeyframes(kf);
    for (const p of [...ps, rnd(), rnd(), rnd()]) {
      out.at = p;
      const want = ref.motionAt(kf, p), got = motionAt(T, out), what = `${JSON.stringify(kf)} at ${p}`;
      assert.equal(got, want !== null, what);
      if (!want) continue;
      assert.equal(out.hasT, want.t !== undefined, `${what}: transform`);
      assert.equal(out.hasO, want.o !== undefined, `${what}: opacity`);
      if (out.hasT) assert.ok(same(out.tx, want.t[0]) && same(out.ty, want.t[1]), `${what}: ${out.tx},${out.ty} vs ${want.t}`);
      if (out.hasO) assert.ok(same(out.o, want.o), `${what}: ${out.o} vs ${want.o}`);
    }
  }
  assert.equal(compileKeyframes([]), null);
  assert.equal(compileKeyframes(null), null);
  out.at = 0.5;
  assert.equal(motionAt(null, out), false, 'no keyframes: nothing to follow');
  assert.equal(ref.motionAt(null, 0.5), null);
});

test('a card\'s slide: translateX 0 → 40px over cubic-bezier(0.2, 0, 0, 1), with its fade, at the quarter', () => {
  const kf = [{ computedOffset: 0, easing: 'cubic-bezier(0.2, 0, 0, 1)', transform: 'translateX(0px)', opacity: '0' }, { computedOffset: 1, easing: 'linear', transform: 'translateX(40px)', opacity: '1' }];
  const out = new Motion();
  out.at = 0.25;
  assert.equal(motionAt(compileKeyframes(kf), out), true);
  assert.ok(out.hasT && out.hasO);
  assert.ok(out.tx > 10 && out.tx < 40 && out.ty === 0, `${out.tx}`);
  assert.ok(Math.abs(out.o - out.tx / 40) < 1e-12, 'its fade goes the same way');
});

const STYLE_DECLS = ['transform: translateX(4px)', 'transform: translateX(9px)', 'transform: none', 'translate: 3px 4px', 'translate: 5px', 'opacity: 0.5', 'opacity: 1', 'OPACITY: .25', 'Transform: translateY(1px)', 'width: 40px', 'width: 50px', 'height: 10px',
  'transition: opacity 0.2s', 'transition: transform 0.4s ease', 'transition-duration: 0.3s', 'transition-timing-function: cubic-bezier(0.2; 0, 0, 1)', 'will-change: transform', '--pz-rise: 4px', '--pz-rise: 8px', 'background: url("a;b.png")',
  "content: 'a;b'", 'color: red', 'color:red', ' color : blue ', 'filter: drop-shadow(0 0 1px rgba(0,0,0,.2))', 'visibility: hidden', ':bad', 'novalue', 'a:', ' :x', 'opacity:', 'font-family: "A:B"', 'transform: matrix(1, 0, 0, 1, 2, 3)'];

function style() {
  const n = Math.floor(rnd() * 6);
  const parts = Array.from({ length: n }, () => pick(STYLE_DECLS));
  let s = parts.join(pick(['; ', ';', ' ;  ', ';\n']));
  if (n && rnd() < 0.7) s += ';';
  if (rnd() < 0.05) s = ` ${s} `;
  return s;
}

test('movesOnly answers as the old movesOnly did, on random style attributes', () => {
  const pairs = [['', ''], ['', 'opacity: 1;'], ['opacity: 1;', ''], ['opacity: 0;', 'opacity: 1;'], ['transform: translateX(4px);', 'transform: translateX(9px);'], ['transform: translateX(4px);', ''],
    ['', 'transition: opacity 0.2s;'], ['width: 1px', 'width: 1px'], ['width: 1px', 'width: 2px'], ['opacity: 1; opacity: 0.5', 'opacity: 0.5'], ['opacity: 0.5', 'opacity: 0.5; opacity: 0.2'], ['opacity: 0.5; width: 3px', 'width: 3px; opacity: 1'],
    ['a: b;;; c: d', 'c: d;a: b'], ['background: url("a;b.png"); opacity: 1', 'background: url("a;b.png"); opacity: 0'], ['background: url("a;b.png")', 'background: url("a']];
  for (let i = 0; i < 30000; i++) {
    const a = style();
    // (Mostly a style and the same style a frame later, with a few declarations changed: the pair a mutation record holds.)
    const b = rnd() < 0.7 ? a.split(';').map((d) => (rnd() < 0.3 ? pick(STYLE_DECLS) : d)).join(';') : style();
    pairs.push([a, b]);
  }
  for (const [a, b] of pairs) assert.equal(movesOnly(a, b), ref.movesOnly(a, b), `movesOnly(${JSON.stringify(a)}, ${JSON.stringify(b)})`);
  // a style longer than the tables hold: they grow
  const long = Array.from({ length: 400 }, (_, i) => `--p${i}: ${i}px`).join('; ');
  assert.equal(movesOnly(long, `${long}; opacity: 1`), ref.movesOnly(long, `${long}; opacity: 1`));
  assert.equal(movesOnly(`${long}; opacity: 1`, `${long}; opacity: 0.5`), true);
  assert.equal(movesOnly(`${long}; opacity: 1`, `${long.replace('--p399: 399px', '--p399: 1px')}; opacity: 1`), false);
});

function fakeAnimation() {
  const timing = { duration: pick([0, 1, 100, 250, 'auto', 400.5]), delay: pick([0, 0, 50, -20]), endDelay: pick([0, 0, 30]), iterations: pick([1, 1, 2, 0.5, 3, Infinity]), iterationStart: pick([0, 0, 0.25]),
    direction: pick(['normal', 'reverse', 'alternate', 'alternate-reverse']), fill: pick(['none', 'forwards', 'backwards', 'both', 'auto']), easing: pick(EASES) };
  const state = pick(['running', 'running', 'paused', 'finished', 'idle', 'pending']);
  return { playState: state, playbackRate: pick([1, 1, 2, -1, 0.5]), startTime: rnd() < 0.7 ? pick([0, 100, 1000]) : null, currentTime: pick([0, 40, 300]), effect: { getTiming: () => timing } };
}

test('clockAt answers as the old clockAt did, over random timings and times', () => {
  const out = { st: '', has: false, p: 0, end: 0 };
  for (let i = 0; i < 6000; i++) {
    const an = fakeAnimation(), now = pick([0, 0, 100, 1000]);
    const a = ref.clockOf(an, now), b = clockOf(an, now);
    assert.equal(!!a, !!b);
    if (!a) continue;
    assert.equal(b.bad, a.bad, 'an easing it does not know is flagged the same');
    assert.equal(b.fwd, ref.fillsAfter(a));
    for (const t of [now, now + 1, now + 16.7, now + 100, now + 250, now + 1000, now + 5000]) {
      const want = ref.clockAt(a, t), got = clockAt(b, t, out);
      assert.equal(got, out, 'written in place');
      assert.equal(got.st, want.st);
      assert.equal(got.has, want.p !== null, 'in its active time, or in a fill, as before');
      if (got.has) assert.ok(same(got.p, want.p), `${JSON.stringify(an.effect.getTiming())} at ${t}: ${got.p} vs ${want.p}`);
      assert.ok(same(got.end, want.end));
    }
  }
});

test('a pending animation is held at its start until its start time is known, not run on from when it was read', () => {
  const fade = { playState: 'pending', playbackRate: 1, startTime: null, currentTime: 0, effect: { getTiming: () => ({ duration: 240, delay: 0, endDelay: 0, iterations: 1, iterationStart: 0, direction: 'normal', fill: 'both', easing: 'linear' }) } };
  const c = clockOf(fade, 1000), out = { st: '', has: false, p: 0, end: 0 };
  // read in a frame at 1000; a slow frame later (1230) the browser has not started it yet: its first frame is its start
  assert.equal(clockAt(c, 1230, out).p, 0, 'still at its start');
  assert.equal(out.st, 'running');
  // the browser starts it at the next frame (1250); from then on it runs from there
  c.s = 1250;
  assert.equal(clockAt(c, 1250, out).p, 0);
  assert.ok(Math.abs(clockAt(c, 1370, out).p - 0.5) < 1e-9);
});

// Whether anything is built: the collector's runs are counted (a scavenge follows every few megabytes of garbage), so the same loop
// over the old code shows them and the new does not. Run once first, to let the optimiser settle: code still being compiled boxes
// every number it adds. The optimiser compiles on another thread, so on a loaded machine (the suite runs files in parallel) the first
// runs can still be the unoptimised code: the loop is run again, up to `tries` times, and the fewest collector runs of any is the count.
// (Code that builds something runs the collector on every try; only code that builds nothing can get through one try with none.)
async function gcRuns(fn, tries = 1) {
  fn();
  let best = Infinity;
  for (let t = 0; t < tries && best > 0; t++) {
    let runs = 0;
    const obs = new PerformanceObserver((l) => { runs += l.getEntries().length; });
    obs.observe({ entryTypes: ['gc'] });
    fn();
    await new Promise((r) => setTimeout(r, 100));
    obs.disconnect();
    best = Math.min(best, runs);
  }
  return best;
}

test('a frame\'s reading of the glass\'s motion builds nothing: no collector run over a million of them', async () => {
  const kf = [{ computedOffset: 0, easing: 'cubic-bezier(0.2, 0, 0, 1)', transform: 'translateX(0px)', opacity: '0' }, { computedOffset: 0.5, easing: 'ease', transform: 'translate(20px, 4px)', opacity: '0.5' }, { computedOffset: 1, easing: 'linear', transform: 'translateX(40px)', opacity: '1' }];
  const timing = { duration: 400, delay: 0, endDelay: 0, iterations: 1, direction: 'normal', fill: 'both', easing: 'ease-out' };
  const fake = { playState: 'running', playbackRate: 1, startTime: 0, currentTime: 0, effect: { getTiming: () => timing } };
  const T = compileKeyframes(kf), mo = new Motion(), im = new Inline(), c = clockOf(fake, 0), S = { st: '', has: false, p: 0, end: 0 };
  const PS = new Float64Array(1000).map((_, i) => i / 1000), sink = new Float64Array(1);
  const styles = ['transform: translateX(4px); opacity: 0.5; transition: opacity 0.2s', 'transform: translateX(9px); opacity: 0.6; transition: opacity 0.2s'];
  const transforms = ['translateX(12.5px)', 'translate(3px, -4px)', 'matrix(1, 0, 0, 1, 12, 7)'];
  const runNew = () => {
    for (let i = 0; i < 1000000; i++) {
      mo.at = PS[i % 1000];
      if (motionAt(T, mo)) sink[0] += mo.tx + mo.o;
      sink[0] += clockAt(c, i % 500, S).p;
      if (movesOnly(styles[i & 1], styles[(i + 1) & 1])) sink[0]++;
      if (shiftInto(transforms[i % 3], PAIR)) sink[0] += PAIR[0];
      if (translateInto('3px 5px', PAIR)) sink[0] += PAIR[1];
      inlineShift(im, transforms[i % 3]);
    }
  };
  const cc = ref.clockOf(fake, 0);
  const runOld = () => {
    for (let i = 0; i < 200000; i++) {
      const v = ref.motionAt(kf, (i % 1000) / 1000);
      if (v) sink[0] += v.t[0];
      sink[0] += ref.clockAt(cc, i % 500).p ?? 0;
      if (ref.movesOnly(styles[i & 1], styles[(i + 1) & 1])) sink[0]++;
      sink[0] += ref.shiftOf(transforms[i % 3])[0];
    }
  };
  const old = await gcRuns(runOld);
  const now = await gcRuns(runNew, 8);
  if (old === 0) return;   // (a runtime that reports no collector runs: nothing to hold the loop to)
  assert.equal(now, 0, `${now} collector runs over a million frames' reading (the old code: ${old} over a fifth of that)`);
});

test('glass-gl.js reads the motion through the numeric calls, and the off-GPU scan finds nothing left in glass-motion.js', () => {
  const glass = readFileSync(new URL('../src/ui/glass-gl.js', import.meta.url), 'utf8');
  const mod = readFileSync(new URL('../src/ui/glass-motion.js', import.meta.url), 'utf8');
  assert.match(glass, /import \{ Inline, inlineShift, inlineTranslate, Motion, compileKeyframes, motionAt, movesOnly, clockOf, clockAt \} from '\.\/glass-motion\.js/);
  assert.doesNotMatch(glass, /\b(shiftOf|translateOf)\(/, 'no text is taken apart into an array in a frame');
  assert.match(glass, /AM = new Motion\(\), inlines = new WeakMap\(\);/);
  assert.match(glass, /clockAt\(rec\.c, tlNow\(\), ST\);/, 'an animation\'s state is written into the kept record');
  assert.match(glass, /rec\.kf = compileKeyframes\(/, 'the keyframes are turned into numbers when the animation is first seen');
  // (Nothing that splits, trims, maps or builds is left in the functions a frame calls: only the lines marked as run-once remain.)
  const frame = mod.slice(mod.indexOf('export function shiftInto'), mod.indexOf('// ── An animation\'s clock'));
  for (const line of frame.split('\n')) {
    if (/alloc-rare:/.test(line)) continue;
    assert.doesNotMatch(line.replace(/^\s*\/\/.*$/, ''), /\.(split|trim|map|filter|replace|slice|join|toLowerCase)\(|\bnew (Map|Set|Array)\b|\.\.\./, line);
  }
});
