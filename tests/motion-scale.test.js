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
