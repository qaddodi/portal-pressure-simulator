// Every text token reads at 4.5:1 or better on every surface it can sit on, in every theme (docs/ACCESSIBILITY.md
// claims it; review Q18). The tokens are read from styles/tokens.css, so a colour change that breaks the claim fails here.
// The system dark theme (prefers-color-scheme) must carry the same colours as the chosen dark theme, so it is checked
// to match rather than measured twice.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const tokens = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8');
// The body of the first rule (from `from` on) whose selector is exactly `sel`, as written at the start of a line.
const block = (sel, from = 0) => {
  const at = tokens.slice(from).search(new RegExp(`\\n[ \\t]*${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{`)) + from;
  assert.ok(at >= from, `token block ${sel}`);
  const open = tokens.indexOf('{', at), close = tokens.indexOf('}', open);
  return tokens.slice(open + 1, close);
};
const vars = (src) => Object.fromEntries([...src.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
const light = vars(block(':root'));
const dark = { ...light, ...vars(block(':root[data-theme="dark"]')) };
const THEMES = {
  light,
  dark,
  soft: { ...light, ...vars(block(':root[data-theme="soft"]')) },
  'dark circuit map': { ...dark, ...vars(block(':root[data-theme="dark"] .stage-wrap.cmap')) },
};

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
  const sys = vars(block(':root:not([data-theme="light"]):not([data-theme="soft"])', tokens.indexOf('@media (prefers-color-scheme: dark)')));
  for (const k of [...TEXT, ...SURFACES]) assert.equal(sys[k], dark[k], `system dark ${k}`);
});
