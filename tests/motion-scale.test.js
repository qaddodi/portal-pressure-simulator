// One motion scale (premium-feel R3): three durations and the camera's own, three curves, and nothing else tuned by hand. This reads
// the stylesheets, the boot screen and the sources, like the type-size lint does for the interface (tests/e2e/type-scale.mjs), so a
// duration or curve written off the scale fails here, in the unit tests that gate every deploy.
//
//   durations  var(--d-flip) 120 ms · var(--d-small) 240 ms · var(--d-surface) 420 ms · the camera's (camMs, --d-camera, --vp-ms)
//   curves     var(--ease) = var(--ease-arrive) in · var(--ease-move) travelling · var(--ease-in) leaving
//   exempt     an instant (10 ms or less: Reduce Motion, a held visibility), a loop (`infinite`), and a declaration that carries the
//              marker comment `/*own pace*/`: a scene that teaches (a column filling, a halo) or a value that follows a finger or
//              a model (a linear bar). The marker is the list of exceptions; it is not for chrome.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { D_FLIP, D_SMALL, D_SURFACE, EASE_ARRIVE, EASE_MOVE, EASE_IN, CAM_MS_MIN } from '../src/ui/ease.js';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const MARK = '/*own pace*/';

const mask = (css) => css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
// Every declaration (property, value, source line, and its raw text up to the next ; or }, comments kept).
function* decls(css) {
  const t = mask(css); let buf = '', start = 0, line = 1;
  const emit = function* (b, s, l, end) {
    const m = /^\s*([-\w]+)\s*:\s*([\s\S]*?)\s*$/.exec(b);
    if (!m) return;
    let e = end; while (e < css.length && css[e] !== ';' && css[e] !== '}') e++;
    yield { prop: m[1], value: m[2], line: l, raw: css.slice(s, e) };
  };
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (ch === '\n') line++;
    if (ch === '{') { buf = ''; start = i + 1; continue; }
    if (ch === '}') { if (buf.trim()) yield* emit(buf, start, line, i); buf = ''; start = i + 1; continue; }
    if (ch === ';') { yield* emit(buf, start, line, i); buf = ''; start = i + 1; continue; }
    if (ch === '(') {
      let d = 0, j = i;
      for (; j < t.length; j++) { if (t[j] === '(') d++; else if (t[j] === ')') { d--; if (!d) break; } if (t[j] === '\n') line++; }
      buf += t.slice(i, j + 1); i = j; continue;
    }
    buf += ch;
  }
}
const splitTop = (s, sep) => { const out = []; let d = 0, cur = ''; for (const ch of s) { if (ch === '(') d++; if (ch === ')') d--; if (d === 0 && ch === sep) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; };
const words = (s) => { const out = []; let d = 0, cur = ''; for (const ch of s.trim()) { if (ch === '(') d++; if (ch === ')') d--; if (d === 0 && /\s/.test(ch)) { if (cur) out.push(cur); cur = ''; } else cur += ch; } if (cur) out.push(cur); return out; };

const NUM = /^-?(\d*\.?\d+)(ms|s)$/;
const ms = (w) => { const m = NUM.exec(w); return m ? parseFloat(m[1]) * (m[2] === 's' ? 1000 : 1) : null; };
const TOKEN_DUR = /^var\(--(d-flip|d-small|d-surface|d-camera|card-t|vp-ms)(,[\s\S]*)?\)$/;
const CURVES = /^var\(--(ease|ease-arrive|ease-move|ease-in)\)$/;
const isTime = (w) => NUM.test(w) || TOKEN_DUR.test(w) || /^var\(--d-(flip|small|surface|camera)(,[\s\S]*)?\)$/.test(w);

const problems = (css, where) => {
  const out = [];
  for (const d of decls(css)) {
    const at = `${where}:${d.line}`;
    if (d.prop === '--card-t') { if (!TOKEN_DUR.test(d.value.trim()) && !d.raw.includes(MARK)) out.push(`${at}: --card-t ${d.value}`); continue; }
    if (/^(transition|animation)-timing-function$/.test(d.prop)) {
      for (const c of splitTop(d.value, ',')) if (!CURVES.test(c.trim())) out.push(`${at}: ${d.prop}: ${c.trim()} is off the three curves`);
      continue;
    }
    const long = /^(transition|animation)-duration$/.test(d.prop), short = /^(transition|animation)$/.test(d.prop);
    if (!long && !short) continue;
    if (d.value.trim() === 'none' || /^none\s*!important$/.test(d.value.trim())) continue;
    const marked = d.raw.includes(MARK);
    if (long) {
      for (const p of splitTop(d.value.replace(/\s*!important$/, ''), ',')) {
        const w = p.trim(), t = ms(w);
        if (t !== null ? t > 10 : !TOKEN_DUR.test(w)) if (!marked) out.push(`${at}: ${d.prop}: ${w} is off the scale`);
      }
      continue;
    }
    for (const item of splitTop(d.value.replace(/\s*!important$/, ''), ',')) {
      const w = words(item);
      if (!w.length || w.includes('infinite')) continue;
      if (/\bcubic-bezier\(|^(ease|ease-in|ease-out|ease-in-out)$/.test(item.trim()) || w.some((x) => /^(ease|ease-in|ease-out|ease-in-out)$/.test(x) || /^cubic-bezier\(/.test(x))) out.push(`${at}: "${item.trim()}" writes a curve by hand`);
      const times = w.filter(isTime);
      if (!times.length) continue;
      const dur = times[0], t = ms(dur);
      const instant = t !== null && t <= 10;
      if (!instant && t !== null && !marked) out.push(`${at}: "${item.trim()}": ${dur} is off the scale`);
      if (!instant && t === null && !TOKEN_DUR.test(dur)) out.push(`${at}: "${item.trim()}": ${dur} is off the scale`);
      const curve = w.find((x) => CURVES.test(x));
      const holdsVisibility = w[0] === 'visibility';
      const linearOk = w.includes('linear') && (marked || instant);
      if (!instant && !curve && !holdsVisibility && !linearOk && !marked) out.push(`${at}: "${item.trim()}" has no curve of the three`);
      if (!instant && w.includes('linear') && !marked && !holdsVisibility) out.push(`${at}: "${item.trim()}" is linear`);
    }
  }
  return out;
};

test('the scale is one list: tokens.css and ease.js agree on the three durations, the camera\'s shortest and the three curves', () => {
  const tokens = read('styles/tokens.css');
  assert.match(tokens, new RegExp(`--d-flip: ${D_FLIP}ms; --d-small: ${D_SMALL}ms; --d-surface: ${D_SURFACE}ms; --d-camera: ${CAM_MS_MIN}ms;`));
  assert.deepEqual([D_FLIP, D_SMALL, D_SURFACE], [120, 240, 420]);
  assert.match(tokens, /--ease-arrive: cubic-bezier\(\.2, \.8, \.2, 1\); --ease-move: cubic-bezier\(\.5, 0, \.5, 1\); --ease-in: cubic-bezier\(\.4, 0, 1, 1\);/);
  assert.equal(EASE_ARRIVE, 'cubic-bezier(.2, .8, .2, 1)'); assert.equal(EASE_MOVE, 'cubic-bezier(.5, 0, .5, 1)'); assert.equal(EASE_IN, 'cubic-bezier(.4, 0, 1, 1)');
  assert.match(tokens, /--ease: var\(--ease-arrive\);/);
  // A leave takes the step below its entrance, so the scale is strictly increasing and each step is a clear one (about double).
  assert.ok(D_FLIP < D_SMALL && D_SMALL < D_SURFACE && D_SMALL / D_FLIP >= 2 && D_SURFACE / D_SMALL >= 1.5);
  for (const old of ['--t-fast', '--t-out', '--view-fade', '--ease-io']) assert.ok(!tokens.includes(`${old}:`), `${old} was folded into the scale`);
  for (const f of ['styles/app.css', 'index.html']) for (const old of ['var(--t-fast)', 'var(--t-out)', 'var(--view-fade)', 'var(--ease-io)', 'var(--t)']) assert.ok(!read(f).includes(old), `${f} still reads ${old}`);
});

test('app.css: every transition and animation is on the scale (three durations or the camera\'s), on one of the three curves', () => {
  const bad = problems(read('styles/app.css'), 'app.css');
  assert.deepEqual(bad, []);
});

test('tokens.css and the boot screen in index.html: nothing off the scale', () => {
  assert.deepEqual(problems(read('styles/tokens.css'), 'tokens.css'), []);
  const html = read('index.html'), style = /<style>([\s\S]*?)<\/style>/.exec(html)[1];
  assert.deepEqual(problems(style, 'index.html'), []);
});

test('the lint catches what it is for: an off-scale duration, a hand-written curve, a keyword curve, a missing curve, a linear ramp', () => {
  const t = (css) => problems(css, 'x');
  assert.equal(t('a { transition: opacity .3s var(--ease); }').length, 1);
  assert.equal(t('a { transition: opacity var(--d-small) cubic-bezier(.1, .2, .3, 1); }').length >= 1, true);
  assert.equal(t('a { transition: opacity var(--d-small) ease; }').length >= 1, true);
  assert.equal(t('a { transition: opacity var(--d-small); }').length, 1);
  assert.equal(t('a { transition: transform var(--d-small) linear; }').length >= 1, true);
  assert.equal(t('a { animation: pop .22s var(--ease); }').length, 1);
  assert.equal(t('a { transition-duration: .5s; }').length, 1);
  assert.equal(t('a { animation-timing-function: ease-out; }').length, 1);
  // Allowed: the tokens, the camera's own, an instant, a loop, a held visibility, a delay of any length, a marked scene.
  assert.deepEqual(t('a { transition: opacity var(--d-surface) var(--ease) 1.9s, visibility 0s linear var(--d-surface); }'), []);
  assert.deepEqual(t('a { transition-duration: var(--vp-ms, var(--d-camera)); transition-timing-function: var(--ease-move); }'), []);
  assert.deepEqual(t('a { transition-duration: .01s; animation: pz-cover-i .01s 1.2s forwards; }'), []);
  assert.deepEqual(t('a { animation: shimmer 1.2s linear infinite; }'), []);
  assert.deepEqual(t('a { transition: transform 1.6s var(--ease) .5s /*own pace*/; }'), []);
  assert.deepEqual(t('a { animation: var(--card-in) var(--card-t) var(--ease-in) forwards !important; }'), []);
});

// Premium-feel R11: everything that enters or leaves is one of four primitives, each with its exit. A new @keyframes is either
// one of them or named here with its reason (a loop, an attention cue, a scene that teaches, a registered variable that other code
// also reads). A piece that enters or leaves takes a primitive; it does not get a keyframe set of its own.
const PRIMITIVES = ['fade-rise', 'fade-rise-out', 'slide-from-edge', 'slide-to-edge', 'scale-settle', 'scale-settle-out', 'crossfade', 'crossfade-out'];
const OTHER_KEYFRAMES = {
  'fade-rise-b': 'fade-rise under a second name (the menu\'s tab entrance restarts by swapping names, with no reflow)', spin: 'a loop', 'pz-spin': 'a loop', shimmer: 'a loop', monAlarm: 'an alarm that pulses', roFlash: 'an attention cue', roFlash2: 'the same attention cue under a second name (restarts with no reflow)',
  haloRing: 'an attention cue', haloText: 'an attention cue', 'sp-tap': 'a tap wiggle', 'sp-tap2': 'a tap wiggle (its twin, so the tap restarts with no style read)',
  'pzw-drift': 'a scene that teaches', 'pzw-pulse': 'a scene that teaches', 'pzw-rise': 'a scene that teaches',
  'sv-fade-in': 'a caption\'s own entrance, by its opacity, that sinusoid-view.js lets go of by name once played', 'lz-in': 'a label\'s entrance, by its own opacity, that presenter.js waits on by name',
  'pill-in': 'a lit pill\'s entrance, by its ::before\'s opacity, that presenter.js waits on by name', thumbIn: 'a card without a plate rising a short way from behind the opaque tab row (translate, which the drag\'s --sink also sets, and opacity)',
  thumbOut: 'the same card sinking back behind the tab row as it fades',
  'sheet-rise': 'a phone sheet\'s content rising by translate under its still clip (sheet-move.js)', 'sheet-sink': 'a phone sheet\'s content sinking by translate under its still clip (sheet-move.js)',
  'dock-sheet-in': 'a menu or popover sheet rising from the dock\'s top edge by translate, one engine (menu-system-plan)', 'dock-sheet-out': 'the same sheet sinking back to the dock\'s top edge',
  'sheet-hold': 'holds a sinking sheet\'s box until its content has gone, so its leave ends on it',
  'odo-up': 'a value that follows the model (a number rolling its digits)', 'odo-down': 'a value that follows the model (a number rolling its digits)',
};
const noComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const keyframeNames = (css) => [...noComments(css).matchAll(/@keyframes ([\w-]+)\s*\{/g)].map((m) => m[1]);
const keyframeProblems = (css) => {
  const out = [], defined = new Set(keyframeNames(css));
  for (const n of defined) if (!PRIMITIVES.includes(n) && !(n in OTHER_KEYFRAMES) && !n.startsWith('pz-breathe')) out.push(`@keyframes ${n}: a primitive (${PRIMITIVES.join(', ')}) or a named reason in OTHER_KEYFRAMES`);
  for (const m of noComments(css).matchAll(/animation(?:-name)?\s*:\s*([^;}]+)/g)) {
    for (const part of splitTop(m[1], ',')) {
      const name = words(part).find((w) => /^[a-zA-Z][\w-]*$/.test(w) && !/^(ease|infinite|both|forwards|backwards|none|reverse|linear|normal|alternate|alternate-reverse|paused|running)$/.test(w));
      if (name && !defined.has(name)) out.push(`animation names @keyframes ${name}, which is not defined`);
    }
  }
  // (The card system names its keyframes in variables: --card-in and --card-out.)
  for (const m of noComments(css).matchAll(/--card-(?:in|out)\s*:\s*([\w-]+)/g)) if (!defined.has(m[1])) out.push(`--card-in/--card-out names @keyframes ${m[1]}, which is not defined`);
  return out;
};
test('R11: every @keyframes in app.css is one of the four motion primitives (with its exit) or has its named reason; every animation names a defined one', () => {
  assert.deepEqual(keyframeProblems(read('styles/app.css')), []);
  const css = read('styles/app.css');
  for (const n of PRIMITIVES) assert.ok(new RegExp(`^@keyframes ${n} \\{`, 'm').test(css), `${n} is defined`);
  // Each primitive's movement is kept for the movement only; Reduce Motion keeps the fade (the keyframes in the media query replace them).
  const tail = css.slice(css.lastIndexOf('@media (prefers-reduced-motion: reduce) {'));
  for (const n of ['fade-rise', 'fade-rise-out', 'slide-from-edge', 'slide-to-edge', 'scale-settle', 'scale-settle-out']) assert.ok(new RegExp(`@keyframes ${n} \\{ (from|to) \\{ opacity: 0; \\} \\}`).test(tail), `${n} fades without moving under Reduce Motion`);
  // A keyframe set that moves a registered variable moves nothing else (it is the primitive's twin, not a new look).
  for (const n of Object.keys(OTHER_KEYFRAMES).filter((k) => /variable/.test(OTHER_KEYFRAMES[k]))) {
    const body = new RegExp(`@keyframes ${n} \\{([^\\n]*)\\}`).exec(css)[1];
    assert.match(body, /--[\w-]+:/, `${n} moves a variable`);
    assert.doesNotMatch(body, /opacity:|transform:/, `${n} moves nothing but its variable`);
  }
});

test('R11: the lint for keyframes catches a keyframe set of a piece\'s own and a name that is not defined', () => {
  assert.equal(keyframeProblems('@keyframes cardSlide { from { opacity: 0; } } a { animation: cardSlide var(--d-small) var(--ease); }').length, 1);
  assert.equal(keyframeProblems('@keyframes crossfade { from { opacity: 0; } } a { animation: crossfade var(--d-small) var(--ease), gone 1s linear; }').length, 1);
  assert.equal(keyframeProblems('@keyframes crossfade { from { opacity: 0; } } a { --card-in: cardInRight; animation: var(--card-in) var(--d-small) var(--ease); }').length, 1);
  assert.deepEqual(keyframeProblems('@keyframes crossfade { from { opacity: 0; } } @keyframes spin { to { transform: rotate(360deg); } } a { animation: crossfade var(--d-small) var(--ease), spin 1s linear infinite; }'), []);
});

test('R11: fade-rise rises the one distance, in the sheet of keyframes and in the scripts that rise rows by hand (RISE_PX)', () => {
  const css = read('styles/app.css'), ease = read('src/ui/ease.js');
  assert.match(css, /@property --rise-y \{ syntax: '<length-percentage>'; inherits: false; initial-value: (\d+)px; \}/);
  assert.equal(Number(/@property --rise-y \{[^}]*initial-value: (\d+)px/.exec(css)[1]), Number(/export const RISE_PX = (\d+);/.exec(ease)[1]));
  assert.match(css, /@keyframes scale-settle \{ from \{ opacity: 0; \} \}/);
  for (const f of ['util.js']) assert.doesNotMatch(read(`src/ui/${f}`), /translateY\(\d+px\)/, `${f} rises by RISE_PX`);
});

test('R11: a popover settles by opacity alone, and every floating card is placed by the one placer (placeAt)', () => {
  const util = read('src/ui/util.js'), why = read('src/ui/why.js'), menu = read('src/ui/menu.js');
  assert.match(util, /export function placeAt\(el, anchor, \{/);
  assert.doesNotMatch(util, /settleFrom|transformOrigin/, 'the entrance has no scale, so no origin is written');
  assert.doesNotMatch(why, /transformOrigin/);
  assert.match(why, /placeAt\(pop, anchor, /);
  assert.match(menu, /placeAt\(el, anchor, /);
});

// The sources: no curve is written by hand outside ease.js, and no animation is given a number of milliseconds.
const walk = (dir) => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : []; });
test('the sources: curves and durations of an animation come from ease.js (D_FLIP, D_SMALL, D_SURFACE, EASE_ARRIVE, EASE_MOVE, EASE_IN)', () => {
  const bad = [];
  for (const file of walk(join(ROOT, 'src'))) {
    const rel = file.slice(ROOT.length);
    if (rel === 'src/ui/ease.js') continue;
    read(rel).split('\n').forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, '').replace(/\/\*[\s\S]*?\*\//g, '');
      if (line.includes('motion-scale: own pace')) return;
      if (/cubic-bezier\(/.test(code)) bad.push(`${rel}:${i + 1}: a curve written by hand`);
      if (/\beasing:\s*['"`]/.test(code)) bad.push(`${rel}:${i + 1}: an easing string`);
      if (/\bduration:\s*\d{2,}\b/.test(code)) bad.push(`${rel}:${i + 1}: a duration in milliseconds`);
      if (/style\.transition\s*=\s*[`'"][^'"`]*\b\d*\.?\d+m?s\b/.test(code) && !/\$\{D_/.test(code)) bad.push(`${rel}:${i + 1}: an inline transition with its own time`);
    });
  }
  assert.deepEqual(bad, []);
});

// ── The GPU's side of the scale (item 18 of docs/recommendations/animation-and-transitions.md, 8 Nov 2026) ─────────────────────────────────
// The CSS is linted above. In the sources, a file that asks for frames (imports frameFor) is a file that moves something, so a duration constant
// in it (`*_MS`, `*_DUR`) is either made from the scale (D_FLIP, D_SMALL, D_SURFACE, CAM_MS_MIN/MAX, LOBULE_MS_MAX, afterMs, or a named
// exception, all imported from motion.js or ease.js), or carries a marker on its line:
//   motion-scale: own pace      a move that teaches, or was decided (the view change, the card zoom, a halo): the list of exceptions
//   motion-scale: not a move    a wait, a budget, a poll, a timeout: a time that is not the length of anything drawn
// scripts/motion-allowance.json "gpuConstants" lists, by file, the unmarked constants still waiting (the labels' files, which another
// thread owns): the numbers only go down. A hand-written smoothstep (t * t * (3 - 2 * t)) against a clock is smooth01 (motion.js), or easeMove
// when the thing travels; one that blends shapes in space is not a time ease and stays as it is.
const GPU_MARK = /motion-scale: (own pace|not a move)/;
const importsFrameFor = (src) => /import\s*\{[^}]*\bframeFor\b[^}]*\}\s*from/.test(src);
const scaleNames = (src) => {
  const names = new Set();
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]\.\/(?:motion|ease)\.js['"]/g)) for (const n of m[1].split(',')) { const w = n.trim().split(/\s+as\s+/).pop(); if (w) names.add(w); }
  return names;
};
// The expression after `NAME =`, up to the comma or semicolon that ends it at the top level of brackets.
const valueOf = (code, from) => {
  let d = 0, i = from;
  for (; i < code.length; i++) { const ch = code[i]; if ('([{'.includes(ch)) d++; else if (')]}'.includes(ch)) { if (!d) break; d--; } else if ((ch === ',' || ch === ';') && !d) break; }
  return code.slice(from, i);
};
export const gpuConstantProblems = (src, rel) => {
  if (!importsFrameFor(src)) return [];
  const names = scaleNames(src), out = [];
  src.split('\n').forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of code.matchAll(/(?:^|[\s,({])([A-Z][A-Z0-9_]*_(?:MS|DUR))\s*=\s*(?!=)/g)) {
      const v = valueOf(code, m.index + m[0].length).trim();
      if (/^0$/.test(v) || GPU_MARK.test(line)) continue;
      if ((v.match(/\b[A-Z][A-Z0-9_]+\b/g) || []).some((n) => names.has(n))) continue;
      out.push(`${rel}:${i + 1}: ${m[1]} = ${v.slice(0, 40)} is not from motion.js or ease.js and has no motion-scale marker`);
    }
  });
  return out;
};
const TIME_WORDS = /\b(now|dt|t0|since|elapsed|dur|fade|clock|age)\b|_MS\b|_FADE\b|ease|fade|alpha/i;
export const smoothstepClockProblems = (src, rel) => {
  const out = [];
  src.split('\n').forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, '');
    if (/\b([A-Za-z_]\w*)\s*\*\s*\1\s*\*\s*\(\s*3\s*-\s*2\s*\*\s*\1\s*\)/.test(code) && TIME_WORDS.test(code) && !GPU_MARK.test(line)) out.push(`${rel}:${i + 1}: a hand-written smoothstep against a clock: smooth01 (or easeMove when it travels), motion.js`);
  });
  return out;
};

test('the sources: a *_MS or *_DUR constant in a file that imports frameFor comes from motion.js or ease.js, or carries a motion-scale marker', () => {
  const allow = JSON.parse(read('scripts/motion-allowance.json')).gpuConstants || {};
  const bad = [];
  for (const file of walk(join(ROOT, 'src'))) {
    const rel = file.slice(ROOT.length);
    if (rel === 'src/ui/motion.js' || rel === 'src/ui/ease.js') continue;
    const found = gpuConstantProblems(read(rel), rel);
    const n = allow[rel] || 0;
    if (found.length > n) bad.push(...found);
    else if (found.length < n) bad.push(`${rel}: ${found.length} unmarked, allowance ${n} in scripts/motion-allowance.json gpuConstants: lower it`);
  }
  for (const rel of Object.keys(allow)) if (!gpuConstantProblems(read(rel), rel).length) bad.push(`${rel}: listed in gpuConstants with none unmarked: remove it`);
  assert.deepEqual(bad, []);
});

test('the sources: no hand-written smoothstep against a clock (smooth01 in motion.js, easeMove when it travels)', () => {
  const bad = [];
  for (const file of walk(join(ROOT, 'src'))) {
    const rel = file.slice(ROOT.length);
    if (rel === 'src/ui/motion.js' || rel === 'src/ui/ease.js') continue;
    bad.push(...smoothstepClockProblems(read(rel), rel));
  }
  assert.deepEqual(bad, []);
});

test('the GPU lint catches what it is for: a bare duration, a marked one, one made from the scale, a clock smoothstep, a smoothstep in space', () => {
  const ff = "import { frameFor } from './frame.js';\nimport { D_SMALL } from './motion.js';\n";
  assert.equal(gpuConstantProblems(`${ff}const FADE_MS = 300;`, 'x').length, 1);
  assert.equal(gpuConstantProblems(`${ff}const A_MS = D_SMALL, B_MS = 300;`, 'x').length, 1);
  assert.equal(gpuConstantProblems(`${ff}export const HOLD_DUR = 450;`, 'x').length, 1);
  assert.deepEqual(gpuConstantProblems(`${ff}const FADE_MS = D_SMALL + 20;`, 'x'), []);
  assert.deepEqual(gpuConstantProblems(`${ff}const HALO_MS = 1500;   // motion-scale: own pace (a cue)`, 'x'), []);
  assert.deepEqual(gpuConstantProblems(`${ff}const POLL_MS = 100;   // motion-scale: not a move`, 'x'), []);
  assert.deepEqual(gpuConstantProblems(`${ff}const CALM_MS = 0;`, 'x'), []);
  assert.deepEqual(gpuConstantProblems("const FADE_MS = 300;", 'x'), [], 'a file that asks for no frames moves nothing');
  assert.equal(smoothstepClockProblems('const e = (now - t0) / ms; const k = e * e * (3 - 2 * e);', 'x').length, 1);
  assert.equal(smoothstepClockProblems('const fadeAlpha = (u) => u * u * (3 - 2 * u);', 'x').length, 1);
  assert.deepEqual(smoothstepClockProblems('const w = reach * (0.5 + 0.5 * e) + 64 * Math.round(e * 63); const f = e * e * (3 - 2 * e);', 'x'), []);
  assert.deepEqual(smoothstepClockProblems('const u = clamp(d / taper, 0, 1), s = u * u * (3 - 2 * u);', 'x'), []);
});

test('motion.js: the GPU tokens are the scale and the named exceptions, and smooth01 is the clamped smoothstep', async () => {
  const m = await import('../src/ui/motion.js');
  assert.deepEqual([m.D_FLIP, m.D_SMALL, m.D_SURFACE, m.CAM_MS_MIN, m.CAM_MS_MAX, m.LOBULE_MS_MAX], [120, 240, 420, 480, 900, 1500]);
  assert.deepEqual([m.VIEW_CHANGE_MS, m.DIVE_MS, m.RISE_MS, m.HALO_MS, m.COUNT_MS, m.TURN_MS], [1300, 2200, 1300, 1500, 950, 480]);
  assert.equal((await import('../src/ui/view-xf.js')).VIEW_CHANGE_MS, m.VIEW_CHANGE_MS);
  assert.equal(m.afterMs(m.D_FLIP), 140);
  assert.deepEqual([-1, 0, 0.5, 1, 2].map(m.smooth01), [0, 0, 0.5, 1, 1]);
  const e = (await import('../src/ui/liver-morph.js')).smooth01; assert.equal(e, m.smooth01, 'one smooth01');
  // A smoothstep's speed is zero at both ends and 1.5 at the middle; easeMove is the quintic (flatter at the ends, 1.875 at the middle).
  assert.ok(m.smooth01(0.1) > m.easeMove(0.1) && m.smooth01(0.9) < m.easeMove(0.9));
});

// ── Exits and displaced items (item 20) ─────────────────────────────────────────────────────────────────────────────────────────────────────
test('item 20: a leaving state takes --ease-in and the step below its entrance, written on the leaving state', () => {
  const css = read('styles/app.css'), tokens = read('styles/tokens.css');
  const rule = (sel) => { const i = css.indexOf(`\n${sel} {`); assert.ok(i >= 0, `${sel} is in app.css`); return css.slice(i, css.indexOf('}', i)); };
  assert.match(rule('.pz-text > .pz-leave'), /transition: opacity var\(--d-small\) var\(--ease-in\), transform var\(--d-small\) var\(--ease-in\)/);
  assert.match(rule('.pz-scales.pz-leave'), /transition: opacity var\(--d-small\) var\(--ease-in\)/);
  assert.match(rule('.pz-pscrim, .pz-gscrim'), /transition: opacity var\(--d-small\) var\(--ease-in\)/);
  assert.match(rule('.pz-pscrim.on, .pz-gscrim.on'), /transition: opacity var\(--d-surface\) var\(--ease\)/);
  assert.match(css, /\.app\.figure-focus \.topbar\.two-rows \.stage-bar\.top \{[^}]*transition: opacity var\(--d-flip\) var\(--ease-in\), transform var\(--d-flip\) var\(--ease-in\)/);
  assert.match(css, /\.cath-label\.site\.cath-leave > \.cl-glass \{[^}]*transition: opacity var\(--d-small\) var\(--ease-in\), visibility 0s linear var\(--d-small\)/);
  assert.match(css, /\.cath-label\.site\.off > \.cl-glass \{[^}]*transition: opacity var\(--d-small\) var\(--ease-in\), visibility 0s linear var\(--d-small\)/);
  assert.match(css, /\.pz \.pz-data\.pz-hide \+ \.pz-lip:not\(\[hidden\]\) \{[^}]*transition: opacity var\(--d-flip\) var\(--ease-in\), transform var\(--d-small\) var\(--ease-in\)/);
  assert.match(css, /\.pz\.stack\.stack \.pz-data\.pz-sheet\.pz-hide \{[^}]*transition: transform var\(--d-small\) var\(--ease-in\)/);
  assert.match(css, /\.pz\.pz-wide\.pz-wide \.pz-data\.pz-sheet\.pz-hide \{[^}]*transition: transform var\(--d-small\) var\(--ease-in\)/);
  assert.match(tokens, /Leaves are written on the leaving state[\s\S]*fade-only toggle[\s\S]*phone sheets[\s\S]*240 ms in and 240 ms out/, 'tokens.css writes down the two exceptions');
});

test('item 20: what was on screen and is displaced travels on the move curve, and a FLIP caught by another adds to it (composite add) instead of starting again', () => {
  const src = (f) => read(`src/ui/${f}`);
  assert.match(src('menu.js'), /el\._lift = el\.animate\(\[[^\]]*\], \{ duration: D_SMALL, easing: EASE_MOVE, composite: 'add' \}\);/);
  assert.doesNotMatch(src('menu.js'), /el\._lift\?\.cancel\(\)/);
  assert.match(src('dock.js'), /b\.animate\(\[\{ translate: `\$\{dx\}px 0` \}, \{ translate: '0 0' \}\], \{ duration: D_SMALL, easing: EASE_MOVE, composite: 'add' \}\)/);
  assert.match(src('presenter.js'), /mon\.el\.animate\(\[\{ transform: `translateY\(\$\{dy\}px\)` \}, \{ transform: 'none' \}\], \{ duration: D_SURFACE, easing: EASE_MOVE, composite: 'add' \}\)/);
  const util = src('util.js');
  assert.match(util, /\{ duration: dur, easing: EASE_MOVE, composite: 'add' \}\)\.id = 'glide';/);
  assert.doesNotMatch(util, /a\.id === 'glide'\) \{ const m = new DOMMatrixReadOnly/, 'a running glide is not cancelled and re-read');
  assert.match(util, /\{ duration: D_SMALL, easing: EASE_MOVE, composite: 'add' \}\);\n\s+\}\);/, 'the toasts that stay');
  const tb = src('topbar-motion.js');
  assert.match(tb, /const ROW_MOVE = \{ duration: D_SURFACE, easing: EASE_MOVE, composite: 'add' \}, BAR_MOVE = \{ duration: MOVE_MS, easing: EASE_MOVE, composite: 'add' \};/);
  assert.match(tb, /inRow\(el\) \? ROW_MOVE : BAR_MOVE/);
  assert.doesNotMatch(tb, /if \(a\.id === 'tbm'\) a\.cancel\(\);\n\n/, 'the bar does not cancel a glide that is running');
  assert.match(tb, /dx = t\.x - o\.x - \(pt \? pt\.x : 0\)/, 'only the move since the running glide was aimed');
  assert.match(src('cath-flip.js'), /const EASE = easeMove;/);
});

test('item 21: the timers that wait on a transition come from its token and a fixed slack (afterMs), not a number of their own', () => {
  const src = (f) => read(`src/ui/${f}`);
  assert.match(src('menu.js'), /setTimeout\(\(\) => removeSoon\(old\), afterMs\(D_FLIP\)\)/);
  assert.match(src('menu.js'), /setTimeout\(removeSoon, afterMs\(D_FLIP\), p\)/);
  assert.match(src('menu.js'), /const timer = setTimeout\(done, afterMs\(D_SMALL\)\)/);
  assert.match(src('dock.js'), /const timer = setTimeout\(done, afterMs\(D_SMALL\)\)/);
  assert.match(src('why.js'), /afterMs\(asSheet\(\) \? D_SMALL : D_FLIP\)\)/);
  assert.match(src('stage-sites-paint.js'), /afterMs\(D_SMALL\), el\)/);
  assert.doesNotMatch(src('menu.js'), /setTimeout\([^;]*, (130|140|250)\)/);
  assert.doesNotMatch(src('why.js'), /: 200\)/);
});

test('item 18: the off-scale GPU durations were snapped to the scale', () => {
  const src = (f) => read(`src/ui/${f}`);
  assert.match(src('endo-motion.js'), /FADE_MS = D_SMALL;/); assert.match(src('endo-motion.js'), /BAND_DELAY_MS = D_FLIP;/);
  assert.match(src('doppler-marks.js'), /CAL_FADE = D_SURFACE \/ 1000;/); assert.match(src('cath-flip.js'), /FLIP_MS = D_SURFACE;/); assert.match(src('trace-callouts.js'), /DROP_MS = D_SMALL;/);
  assert.match(src('stage-outlines.js'), /OL_FADE = D_FLIP;[^\n]*\n[\s\S]*CLAMP_FADE = D_SMALL;/);
  assert.match(src('stage-cath.js'), /const CATH_GLIDE = D_SURFACE;/);
  assert.match(src('stage-sites-paint.js'), /ROOM_GLIDE_MS = D_SURFACE/); assert.match(src('stage-sites-paint.js'), /LABEL_GLIDE_MS = D_SURFACE;/);
  assert.match(src('stage-glow.js'), /const SEL_FADE = D_SMALL \/ 1000;/);
  assert.match(src('ink-gl.js'), /FADE_MS = D_FLIP;/); assert.match(src('tool-profile.js'), /const FADE_MS = D_SURFACE;/);
  assert.doesNotMatch(src('stage-glow.js') + src('stage-hover.js') + src('stage-pick.js') + src('stage-focus.js'), /dur: (160|280|300|360|380|420|450|500|600)\b/, 'a glow takes a step of the scale');
  // The curves: no cubic in-out left beside easeMove, and the data card's tweens, the probe's swing, the patient's change take the one curve.
  for (const f of ['hvpg-clock.js', 'presenter.js', 'stage-doppler.js', 'endo-motion.js']) assert.doesNotMatch(src(f), /4 \* (t|u|p) \* \1 \* \1/, `${f} has no cubic in-out`);
  assert.doesNotMatch(read('src/worker-core.js'), /4 \* x \* x \* x/);
  assert.match(src('stage-glide.js'), /if \(reduceMotion\.matches\) ms = reducedMs\(ms, true\);/, 'the reduced camera glide is motion.js\'s exception, not a 300');
});
