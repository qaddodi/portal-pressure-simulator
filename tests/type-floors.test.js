// LOOK-4 (bible review, 19 Nov 2026): the design system's type floors lost their guard when the browser suites (tests/e2e/smoke.mjs, type-scale.mjs) were retired on
// 4 Nov 2026: 11 and 11.5 px text arrived in the trials card, 11 px endoscopy names, a 10 px caption on the portal split label, weights 650 and 750, and a
// `--fs-13` that no token defines. The rules (styles/tokens.css): no text under 12 px, weights 400, 500, 600 (700 for numerals), and every size token defined.
// This test reads the style sheets and the chart looks as text, so it runs in node. What is not yet on the scale is listed with its count (ALLOWED) and may only
// shrink; a size written as a fraction of its parent (.8em) or through a custom property is not resolved here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { LOOKS } from '../src/ui/chart-looks/index.js';

const dir = new URL('../styles/', import.meta.url);
const SHEETS = readdirSync(dir).filter((f) => f.endsWith('.css')).map((f) => [f, readFileSync(new URL(f, dir), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')]);
const WEIGHTS = new Set([400, 500, 600, 700]);
// Weights that are not on the scale yet, per file and weight: the slide titles' 540 on the display face (a variable weight picked by eye; LOOK-4 follow-up).
const ALLOWED = { 'app-04-presenter.css:540': 2 };

const declarations = function* () {
  for (const [f, css] of SHEETS) for (const line of css.split('\n')) yield [f, line];
};

test('no text under 12 px: font-size and the font shorthand, and the floor of a min()', () => {
  const bad = [];
  for (const [f, line] of declarations()) {
    for (const m of line.matchAll(/font-size:\s*([^;}]+)/g)) {
      const v = m[1];
      if (/var\(--fs-|em\b|%/.test(v) && !/px/.test(v)) continue;
      const nums = [...v.matchAll(/(\d+(?:\.\d+)?)px/g)].map((x) => +x[1]);
      // a bare size, or a size that is only ever as small as its smallest literal (min), or a calc of a literal times a scale of 1 or more
      if (nums.length && Math.min(...nums.filter((_, i) => !/max\(/.test(v) || i === 0)) < 12 && !/max\(\s*1[2-9]px/.test(v) && !/(?:^|\s)0px/.test(v)) bad.push(`${f}: font-size: ${v.trim()}`);
    }
    for (const m of line.matchAll(/(?<![-\w])font:\s*([^;}]+)/g)) {
      const size = m[1].trim().replace(/^(?:(?:italic|normal)\s+)*(?:\d{3}\s+)?/, '').split(/\s+/)[0].split('/')[0];
      const nums = [...size.matchAll(/(\d+(?:\.\d+)?)px/g)].map((x) => +x[1]);
      if (nums.length && Math.min(...nums) < 12 && !/var\(--/.test(size)) bad.push(`${f}: font: ${m[1].trim().slice(0, 60)}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('weights are 400, 500, 600 or 700 (the allowance may only shrink)', () => {
  const seen = {};
  for (const [f, line] of declarations()) {
    for (const m of line.matchAll(/(?:font-weight:\s*|(?<![-\w])font:\s*(?:(?:italic|normal)\s+)*)(\d{3})\b/g)) {
      const w = +m[1];
      if (!WEIGHTS.has(w)) seen[`${f}:${w}`] = (seen[`${f}:${w}`] || 0) + 1;
    }
  }
  for (const k of Object.keys(ALLOWED)) assert.ok((seen[k] || 0) <= ALLOWED[k], `${k}: ${seen[k] || 0} uses, allowed ${ALLOWED[k]}`);
  const fresh = Object.keys(seen).filter((k) => !(k in ALLOWED));
  assert.deepEqual(fresh, [], 'a weight off the scale (400, 500, 600, 700)');
  for (const k of Object.keys(ALLOWED)) assert.ok((seen[k] || 0) >= ALLOWED[k], `${k} now ${seen[k] || 0}: lower the allowance`);
});

test('every --fs-N a style sheet reads is defined', () => {
  const tokens = SHEETS.find(([f]) => f === 'tokens.css')[1];
  const defined = new Set([...tokens.matchAll(/(--fs-\d+):/g)].map((m) => m[1]));
  const bad = [];
  for (const [f, css] of SHEETS) for (const m of css.matchAll(/var\((--fs-\d+)/g)) if (!defined.has(m[1])) bad.push(`${f}: ${m[1]}`);
  assert.deepEqual(bad, []);
});

// The chart looks: weights as above, and a size written in px (a literal) is 12 or more.
const nodes = function* (v) {
  if (Array.isArray(v)) { for (const x of v) yield* nodes(x); return; }
  if (v && typeof v === 'object') { yield v; for (const k in v) if (typeof v[k] === 'object') yield* nodes(v[k]); }
};
test('chart looks: weights are 400, 500, 600 or 700, and a literal px size is 12 or more', () => {
  const bad = [];
  for (const [key, e] of Object.entries(LOOKS)) {
    for (const p of [e.base || {}, ...(e.when || []).map(([, props]) => props)]) {
      const w = p.font ? p.font[0] : p.weight;
      if (typeof w === 'number' && !WEIGHTS.has(w)) bad.push(`${key}: weight ${w}`);
      const s = p.font ? p.font[1] : p.size;
      if (typeof s === 'number' && s < 12) bad.push(`${key}: size ${s}`);
      for (const n of nodes(s)) if (n.k === 'px' && n.n < 12) bad.push(`${key}: size ${n.n} px`);
    }
  }
  assert.deepEqual(bad, []);
});

test('the scanners see what they scan (a guard against a regex that finds nothing)', () => {
  const sizes = SHEETS.flatMap(([, css]) => [...css.matchAll(/font-size:\s*\d+px/g)]);
  assert.ok(sizes.length > 50, `${sizes.length} literal sizes`);
  assert.ok(SHEETS.some(([f]) => f === 'tests-card.css'));
  assert.ok(Object.keys(LOOKS).length > 200);
});
