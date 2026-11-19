// No dashes on a trace that scrolls (Mohammad, 16 Nov 2026: "the dashed line scrolls at the same speed as the graph so it ends up looking distracting"):
// a dash pattern drawn on data that moves marches with the data, so the readings on a scrolling strip are told apart by colour alone. A dash is for a
// line that stands still (a limit, a "before" level, a hover mark, a level's dashes). This reads the sources of every scrolling trace and fails when
//   1. a stroke of a scrolling series (line(), tracePts, a trace's path) is drawn while a dash pattern is set, or
//   2. a dashed level's dashes are counted from where it starts rather than from where it ends, so they move when its start does, or
//   3. the three reading colours the scrolling strips draw (portal, wedged, free) are too alike to tell apart without a dash.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const TOKENS_CSS = read('../styles/tokens.css');

// Every module that draws a trace that scrolls (a strip whose x is time and whose newest sample is at the right).
const SCROLLING = ['../src/ui/pressure-time.js', '../src/ui/monitor.js', '../src/ui/vitals-monitor.js', '../src/ui/ekg.js', '../src/ui/vitals-gl.js'];
// A stroke of a series: the helpers the strips draw their traces with.
const SERIES_STROKE = /\b(line\(ctx|line\(c,|tracePts\(|seg\(ctx|inkSeg\()/;

/** The source drawn while a dash pattern other than none is set: from a setLineDash(X) (X not an empty list) to the next setLineDash that clears it. */
function dashedRegions(src) {
  const lines = src.split('\n'), out = [];
  const empty = /^(\[\]|DASH_NONE|NO_DASH|DASH_SOLID|PROF_SOLID)$/;
  let open = -1;
  for (let i = 0; i < lines.length; i++) {
    for (const m of lines[i].matchAll(/setLineDash\(([^)]*)\)/g)) {
      if (empty.test(m[1].trim())) { if (open >= 0) out.push(lines.slice(open, i + 1).join('\n')); open = -1; } else if (open < 0) open = i;
    }
  }
  if (open >= 0) out.push(lines.slice(open).join('\n'));   // (never cleared: everything after it is dashed)
  return out;
}

test('a scrolling trace is never stroked with a dash pattern set', () => {
  for (const f of SCROLLING) {
    let src; try { src = read(f); } catch { continue; }
    for (const region of dashedRegions(src)) {
      // (Limits, "before" levels and the hover mark are plain strokes, never a series.)
      const code = region.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
      assert.ok(!SERIES_STROKE.test(code), `${f}: a series is stroked while a dash is set:\n${region}`);
    }
  }
});

test('the beat card and the pressure lanes keep no dash for a series: the dash names that remain are only the static ones', () => {
  const pt = read('../src/ui/pressure-time.js');
  const names = [...pt.matchAll(/\b(DASH_[A-Z]+)\b/g)].map((m) => m[1]);
  const allowed = new Set(['DASH_NONE', 'DASH_BEFORE', 'DASH_LIMIT', 'DASH_MARK']);
  for (const n of new Set(names)) assert.ok(allowed.has(n), `${n}: a dash on pressure-time.js must be one of the static lines (${[...allowed].join(', ')})`);
  assert.ok(!/DASH_(PORTAL|WEDGE|SWATCH)/.test(pt), 'the portal and wedged traces and their keys are solid');
  assert.ok(!/dashed:/.test(pt), 'a key row carries no dashed flag: its swatch is a plain colour');
});

test('a level\'s dashes on the monitor are counted from its end, so they do not march while the sweep\'s head moves its start', () => {
  const m = read('../src/ui/monitor.js');
  const at = m.indexOf('function level(');
  const body = m.slice(at, m.indexOf('\n}\n', at));
  assert.ok(!/for \(let xx = x0; xx < x1; xx \+= DASH \+ DASH_GAP\)/.test(body), 'the loop must not start at x0');
  assert.match(body, /x1 - Math\.ceil\(\(x1 - x0\) \/ P\) \* P/, 'the grid is anchored at the right axis');
});

// ── The three readings the scrolling strips draw are told apart by colour alone ──
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const gam = (c) => { c = Math.min(1, Math.max(0, c)); return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055; };
const ok = (rgb) => {
  const [r, g, b] = rgb.map(lin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
};
const dE = (a, b) => { const A = ok(a), B = ok(b); return 100 * Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); };
// Machado et al. 2009, severity 1 (linear RGB): deuteranopia and protanopia, the two common kinds of colour blindness.
const CVD = {
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
};
const sim = (rgb, k) => { const l = rgb.map(lin); return CVD[k].map((r) => gam(r[0] * l[0] + r[1] * l[1] + r[2] * l[2])); };
/** Every `--name: #hex` of a token block, the first block after `marker`. */
function tokensAfter(marker, names) {
  const at = TOKENS_CSS.indexOf(marker);
  assert.ok(at >= 0, `tokens.css has ${marker}`);
  const out = {};
  for (const n of names) { const m = new RegExp(`--${n}:\\s*(#[0-9A-Fa-f]{6})`).exec(TOKENS_CSS.slice(at)); assert.ok(m, `${n} after ${marker}`); out[n] = m[1]; }
  return out;
}

test('the portal, wedged and free traces differ by 13 or more (OKLab ΔE, the palette floor less the one pair, portal against free in the dark, that deuteranopia brings to 14) from each other, for normal sight, deuteranopia and protanopia, in the light and the dark looks', () => {
  // (The light looks' tokens are the first block that defines them, the dark looks' the one in `@media (prefers-color-scheme: dark)`, which `data-theme="dark"` repeats.)
  const looks = { light: tokensAfter('--tr-pv:', ['tr-pv', 'tr-wedge', 'tr-hv']) };
  const dark = TOKENS_CSS.indexOf('prefers-color-scheme: dark');
  assert.ok(dark > 0);
  looks.dark = {}; for (const n of ['tr-pv', 'tr-wedge', 'tr-hv']) { const m = new RegExp(`--${n}:\\s*(#[0-9A-Fa-f]{6})`).exec(TOKENS_CSS.slice(dark)); assert.ok(m, `dark ${n}`); looks.dark[n] = m[1]; }
  for (const [look, t] of Object.entries(looks)) {
    for (const [a, b] of [['tr-pv', 'tr-wedge'], ['tr-pv', 'tr-hv'], ['tr-wedge', 'tr-hv']]) {
      for (const k of [null, 'deuteranopia', 'protanopia']) {
        const f = (h) => (k ? sim(hex(h), k) : hex(h));
        const d = dE(f(t[a]), f(t[b]));
        assert.ok(d >= 13, `${look}: ${a} against ${b} (${k || 'normal sight'}): ΔE ${d.toFixed(1)}`);
      }
    }
  }
});
