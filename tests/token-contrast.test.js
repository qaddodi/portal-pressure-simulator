// Every text token reads at 4.5:1 or better on every surface it can sit on, in every theme (docs/ACCESSIBILITY.md
// claims it; review Q18). The tokens are read from src/ui/theme-tokens.js (styles/tokens.css is printed from it), so a colour change that
// breaks the claim fails here.
// The system dark theme (prefers-color-scheme) must carry the same colours as the chosen dark theme, so it is checked
// to match rather than measured twice.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TOKENS, LOOK_IDS, tokensOfLook } from '../src/ui/theme-tokens.js';
import { appCss } from './split-src.js';

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
// A look's own ink form of a colour: the share of the colour kept in its `--x-ink: color-mix(in srgb, var(--x) N%, var(--text))` where the look sets it (Soft and Dark's
// critical red do, ST-5), else the shared 88 % of tokens.css.
const inkShare = (t, k) => { const m = /color-mix\(in srgb, var\(--[\w-]+\) (\d+)%/.exec(t[`${k}-ink`] || ''); return m ? +m[1] / 100 : 0.88; };
// The surfaces text sits on, the darkest card (--surface-3) included: the test left it out and Soft's inks were 4.3:1 there (ST-5).
const INK_SURFACES = ['--bg', '--surface', '--surface-2', '--surface-3'];
test('amber used as text (--caution-ink) is at least 4.5:1 on the surfaces text sits on, in every theme', () => {
  const css = appCss();
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
  const css = appCss();
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
  const css = appCss();
  // (the ink tokens are in the generated :root block now, printed from theme-tokens.js, where the charts read them too: LOOK-1)
  assert.match(tokens, /--ok-ink: color-mix\(in srgb, var\(--ok\) 88%, var\(--text\)\);/);
  assert.match(tokens, /--danger-ink: color-mix\(in srgb, var\(--danger\) 88%, var\(--text\)\);/);
  const fails = [];
  for (const [theme, t] of Object.entries(THEMES)) {
    for (const k of ['--ok', '--danger']) {
      const ink = mixRGB(hex(t[k]), hex(t['--text']), inkShare(t, k));
      for (const bg of INK_SURFACES) {
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
  const css = appCss();
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
  const css = appCss();
  assert.match(tokens, /--critical-ink: color-mix\(in srgb, var\(--critical\) 88%, var\(--text\)\);/);
  const fails = [];
  for (const [theme, t] of Object.entries(THEMES)) {
    const ink = mixRGB(hex(t['--critical']), hex(t['--text']), inkShare(t, '--critical'));
    for (const bg of INK_SURFACES) {
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

// ST-3, ST-5, COL-1 (full app review, 15 Nov 2026): reversed-flow label text, Soft's amber chip, the day counter, and Soft's low pressure stops.
test('the reversed-flow label ink is 4.5:1 on the ground in every look, and the vessel orange itself is untouched', () => {
  const fails = [];
  for (const [theme, t] of Object.entries(THEMES)) {
    if (theme.includes('circuit')) continue;
    const m = /color-mix\(in srgb, var\(--flow-reversed\) (\d+)%, var\(--text\)\)/.exec(t['--flow-reversed-ink'] || '');
    const ink = m ? mixRGB(hex(t['--flow-reversed']), hex(t['--text']), +m[1] / 100) : hex(t['--flow-reversed']);   // (the dark looks keep the orange itself: 6.8:1)
    for (const bg of ['--bg', '--surface']) {
      const r = ratio(ink, hex(t[bg]));
      if (r < 4.5) fails.push(`${theme}: reversed-flow ink on ${bg} is ${r.toFixed(2)}:1`);
    }
  }
  assert.deepEqual(fails, []);
  assert.equal(light['--flow-reversed'], '#EC7424');
  const css = appCss();
  assert.match(css, /\.lb-rev \{ fill: var\(--flow-reversed-ink\); \}/);
  assert.match(css, /\.lb-alert \{ fill: var\(--danger-ink\); \}/);
});

test('Soft: the ink on the amber fill and the day counter read 4.5:1, and the pressure scale\'s low end reads on its ground', () => {
  const soft = THEMES.soft;
  assert.ok(ratio(hex(soft['--on-caution']), hex(soft['--caution'])) >= 4.5, 'the amber chip\'s text');
  for (const bg of ['--bg', '--surface', '--surface-2']) assert.ok(ratio(hex(soft['--lapse-ink']), hex(soft[bg])) >= 4.5, `the day counter on ${bg}`);
  const stops = soft['--ramp-pressure'].split(',').slice(0, 2).map((x) => hex(x.trim().split(' ')[0]));
  // (Light's own two low stops are 1.28:1 and 1.79:1 on Linen; Oat's were 1.25 and 1.22, so a healthy vein was carried by its casing alone: COL-1.)
  assert.ok(ratio(stops[0], hex(soft['--bg'])) >= 1.3 && ratio(stops[1], hex(soft['--bg'])) >= 1.7, 'a normal-pressure vessel reads against Oat\'s ground as it does against Linen\'s');
});

// ST-4: amber is a fill and a stroke, not ink (2.95:1 on white): no style sheet sets text to the raw amber, green or red; the Pressure strip had.
test('no style sheet paints text in raw amber, green or red', async () => {
  const { readdirSync } = await import('node:fs');
  const dir = new URL('../styles/', import.meta.url);
  const bad = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.css'))) {
    for (const m of readFileSync(new URL(f, dir), 'utf8').matchAll(/(?<![-\w])color: var\(--(caution|ok|danger|critical)\)/g)) bad.push(`${f}: ${m[0]}`);
  }
  assert.deepEqual(bad, []);
});

// LOOK-1 (bible review, 19 Nov 2026): the words that took a trace or status colour through a local variable or a mix, where the grep above cannot see them.
// The equation's coloured terms, a catheter reading's name and number, the split label's words, the reversed-flow chips and the balance's falling unit now wear
// the ink forms (printed from theme-tokens.js, measured in tests/chart-text-contrast.test.js for every look).
test('equation terms, catheter readings and the flow chips name their ink forms, not the raw trace and status colours', () => {
  const css = appCss();
  for (const t of ['wedge', 'hv', 'pv', 'ivc', 'var']) assert.match(css, new RegExp(`\\.pz-eq \\.eq-${t} \\{ color: var\\(--tr-${t}-ink\\); \\}`));
  assert.doesNotMatch(css, /\.cath-label small \{ color: var\(--c\);/);
  assert.doesNotMatch(css, /\.cath-label b \{[^}]*color: var\(--c\);/);
  assert.match(css, /\.cath-label\.ok \{ --c: var\(--ok\); --c-ink: var\(--ok-ink\); \}/);
  assert.match(css, /\.cath-label\.danger \{ --c: var\(--danger\); --c-ink: var\(--danger-ink\); \}/);
  assert.match(css, /\.pill\.rev \{[^}]*color: var\(--flow-reversed-ink\);/);
  assert.match(css, /\.hp-chip\.rev \{ color: var\(--flow-reversed-ink\);/);
  assert.doesNotMatch(css, /\.ab-rate-a \{ color: var\(--vel-normal\); \}/);
  for (const t of [light, THEMES.soft]) for (const k of ['wedge', 'hv', 'pv', 'ivc', 'var']) assert.ok(t[`--tr-${k}-ink`], `${k} ink`);
});
