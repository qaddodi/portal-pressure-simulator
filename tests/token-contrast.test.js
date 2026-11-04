// Every text token reads at 4.5:1 or better on every surface it can sit on, in every theme (docs/ACCESSIBILITY.md
// claims it; review Q18). The tokens are read from src/ui/theme-tokens.js (styles/tokens.css is printed from it), so a colour change that
// breaks the claim fails here.
// The system dark theme (prefers-color-scheme) must carry the same colours as the chosen dark theme, so it is checked
// to match rather than measured twice.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TOKENS, LOOK_IDS, tokensOfLook } from '../src/ui/theme-tokens.js';

const tokens = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8');
// The body of the first rule (from `from` on) whose selector is exactly `sel`, as written at the start of a line.
const block = (sel, from = 0) => {
  const at = tokens.slice(from).search(new RegExp(`\\n[ \\t]*${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{`)) + from;
  assert.ok(at >= from, `token block ${sel}`);
  const open = tokens.indexOf('{', at), close = tokens.indexOf('}', open);
  return tokens.slice(open + 1, close);
};
// (The values are read from src/ui/theme-tokens.js, the table tokens.css is printed from; tokens.css itself is read for the checks that
// the printed stylesheet carries the system dark theme and the hand-written ink tokens.)
const pre = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [`--${k}`, v]));
const look = (id, circuit = false) => pre(tokensOfLook(id, circuit));
const light = look('light');
const dark = look('dark');
// (A dark palette (Navy, and any added later) takes Dark's tokens and moves only its own, so every palette in the table is measured.)
const PALETTES = LOOK_IDS.filter((id) => TOKENS[id].from === 'dark');
const THEMES = { light, dark, soft: look('soft'), 'dark circuit map': look('dark', true) };
for (const name of PALETTES) {
  THEMES[name] = look(name);
  THEMES[`${name} circuit map`] = look(name, true);
}

const TEXT = ['--text', '--text-2', '--text-3'];
const SURFACES = ['--bg', '--stage-bg', '--surface', '--surface-2', '--surface-3'];

const hex = (s) => { assert.match(s, /^#[0-9a-f]{6}$/i, `a solid colour, got ${s}`); return [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16)); };
const lum = (c) => { const l = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('the contrast formula matches WCAG on known pairs', () => {
  assert.equal(ratio([0, 0, 0], [255, 255, 255]).toFixed(2), '21.00');
  assert.equal(ratio([255, 255, 255], [255, 255, 255]).toFixed(2), '1.00');
  assert.equal(ratio(hex('#767676'), hex('#FFFFFF')).toFixed(2), '4.54');
});

test('every text token is at least 4.5:1 on every surface, in every theme', () => {
  const fails = [];
  for (const [theme, t] of Object.entries(THEMES)) {
    for (const fg of TEXT) for (const bg of SURFACES) {
      const r = ratio(hex(t[fg]), hex(t[bg]));
      if (r < 4.5) fails.push(`${theme}: ${fg} ${t[fg]} on ${bg} ${t[bg]} is ${r.toFixed(2)}:1`);
    }
  }
  assert.deepEqual(fails, []);
});

test('the system dark theme uses the same text and surface colours as the chosen dark theme', () => {
  const sys = Object.fromEntries([...block(':root:not([data-theme="light"]):not([data-theme="soft"])', tokens.indexOf('@media (prefers-color-scheme: dark)')).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
  for (const k of [...TEXT, ...SURFACES]) assert.equal(sys[k], dark[k], `system dark ${k}`);
});

// Amber and the status text colours (production pass, 31 Oct): --caution is a fill and a stroke (2.95:1 on white); where amber is the
// text itself the stylesheet uses --caution-ink, the colour 30 % toward the text colour. --on-status is the text on a danger fill.
const mixRGB = (a, b, t) => a.map((v, i) => Math.round(v * t + b[i] * (1 - t)));
test('amber used as text (--caution-ink) is at least 4.5:1 on the surfaces text sits on, in every theme', () => {
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  assert.match(tokens, /--caution-ink: color-mix\(in srgb, var\(--caution\) 70%, var\(--text\)\);/);
  const fails = [];
  for (const [theme, t] of Object.entries(THEMES)) {
    const ink = mixRGB(hex(t['--caution']), hex(t['--text']), 0.7);
    for (const bg of ['--bg', '--surface', '--surface-2']) {
      const r = ratio(ink, hex(t[bg]));
      if (r < 4.5) fails.push(`${theme}: amber ink on ${bg} ${t[bg]} is ${r.toFixed(2)}:1`);
    }
  }
  assert.deepEqual(fails, []);
  // (No text rule paints the raw amber: a colour: declaration names --caution-ink, or mixes further toward the text colour.)
  assert.deepEqual(css.match(/(?<![-\w])color: var\(--caution\)/g) || [], []);
  assert.deepEqual(css.match(/(?<![-\w])color: color-mix\(in srgb, var\(--caution\) (?:70|75|80|85)%, var\(--text\)\)/g) || [], []);
});

test('the text on a danger fill (--on-status) is at least 4.5:1 on --danger, in every theme', () => {
  const fails = [];
  for (const [theme, t] of Object.entries(THEMES)) {
    const r = ratio(hex(t['--on-status']), hex(t['--danger']));
    if (r < 4.5) fails.push(`${theme}: ${t['--on-status']} on ${t['--danger']} is ${r.toFixed(2)}:1`);
  }
  assert.deepEqual(fails, []);
});

test('the amber pill\'s text is at least 4.5:1 on its own amber tint, on every surface, in every theme', () => {
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  assert.match(css, /\.pill\.warn \{ background: color-mix\(in srgb, var\(--caution\) 14%, transparent\); color: color-mix\(in srgb, var\(--caution\) 62%, var\(--text\)\); \}/);
  const fails = [];
  for (const [theme, t] of Object.entries(THEMES)) {
    const ink = mixRGB(hex(t['--caution']), hex(t['--text']), 0.62);
    for (const bg of ['--bg', '--surface', '--surface-2']) {
      const tint = mixRGB(hex(t['--caution']), hex(t[bg]), 0.14);
      const r = ratio(ink, tint);
      if (r < 4.5) fails.push(`${theme}: pill text on its tint over ${bg} is ${r.toFixed(2)}:1`);
    }
  }
  assert.deepEqual(fails, []);
});

// Green and red as text (production pass, second round): --ok is 3.97:1 and --danger 4.16:1 on the paper-grey surface of the light theme. Where they are
// the text, the stylesheet uses --ok-ink and --danger-ink (12 % toward the text colour); the raw colours stay the fills and strokes.
test('green and red used as text (--ok-ink, --danger-ink) are at least 4.5:1 on the surfaces text sits on, in every theme', () => {
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  assert.match(tokens, /--ok-ink: color-mix\(in srgb, var\(--ok\) 88%, var\(--text\)\); --danger-ink: color-mix\(in srgb, var\(--danger\) 88%, var\(--text\)\);/);
  const fails = [];
  for (const [theme, t] of Object.entries(THEMES)) {
    for (const k of ['--ok', '--danger']) {
      const ink = mixRGB(hex(t[k]), hex(t['--text']), 0.88);
      for (const bg of ['--bg', '--surface', '--surface-2']) {
        const r = ratio(ink, hex(t[bg]));
        if (r < 4.5) fails.push(`${theme}: ${k} ink on ${bg} ${t[bg]} is ${r.toFixed(2)}:1`);
      }
    }
  }
  assert.deepEqual(fails, []);
  // (No text rule paints the raw colours: a colour: declaration names the ink, or mixes further toward the text colour.)
  assert.deepEqual(css.match(/(?<![-\w])color: var\(--(?:ok|danger)\)/g) || [], []);
});

test('the green and red pills\' text clears 4.5:1 on their own tint, on every surface, in every theme', () => {
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  assert.match(css, /\.pill\.ok \{ background: color-mix\(in srgb, var\(--ok\) 12%, transparent\); color: color-mix\(in srgb, var\(--ok\) 80%, var\(--text\)\); \}/);
  assert.match(css, /\.pill\.bad \{ background: color-mix\(in srgb, var\(--danger\) 12%, transparent\); color: color-mix\(in srgb, var\(--danger\) 80%, var\(--text\)\); \}/);
  const fails = [];
  for (const [theme, t] of Object.entries(THEMES)) {
    for (const k of ['--ok', '--danger']) {
      const ink = mixRGB(hex(t[k]), hex(t['--text']), 0.8);
      for (const bg of ['--bg', '--surface', '--surface-2']) {
        const r = ratio(ink, mixRGB(hex(t[k]), hex(t[bg]), 0.12));
        if (r < 4.5) fails.push(`${theme}: ${k} pill on its tint over ${bg} is ${r.toFixed(2)}:1`);
      }
    }
  }
  assert.deepEqual(fails, []);
});

// Critical red as text and the surgical-shunt green (dark sweep, 1 Nov): --critical is the dark theme's bright #FF4747, 4.3:1 on a raised surface, so the status
// table's heads and stacked labels use --critical-ink (12 % toward the text colour). --s6 was the light theme's #008300 on the dark ground (3.2:1 on --surface, 2.9:1 on
// --surface-2); the dark theme now carries a lighter green that clears 4:1 on both.
test('critical red as text (--critical-ink) is at least 4.5:1 on the surfaces text sits on, and the dark --s6 line colour stays visible', () => {
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  assert.match(tokens, /--critical-ink: color-mix\(in srgb, var\(--critical\) 88%, var\(--text\)\);/);
  const fails = [];
  for (const [theme, t] of Object.entries(THEMES)) {
    const ink = mixRGB(hex(t['--critical']), hex(t['--text']), 0.88);
    for (const bg of ['--bg', '--surface', '--surface-2']) {
      const r = ratio(ink, hex(t[bg]));
      if (r < 4.5) fails.push(`${theme}: critical ink on ${bg} ${t[bg]} is ${r.toFixed(2)}:1`);
    }
  }
  for (const bg of ['--bg', '--surface', '--surface-2']) {
    const r = ratio(hex(dark['--s6']), hex(dark[bg]));
    if (r < 4) fails.push(`dark: --s6 ${dark['--s6']} on ${bg} is ${r.toFixed(2)}:1`);
  }
  assert.deepEqual(fails, []);
  assert.deepEqual(css.match(/(?<![-\w])color: var\(--critical\)/g) || [], []);
});
