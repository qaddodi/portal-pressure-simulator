// The ascites belly's daily balance ("Steady", "▲ 120 mL/day", "▼ 80 mL/day") must read clearly wherever the fluid line
// sits: over the empty belly, over the fullest, brightest fluid and across the line between them, in every theme.
// Mohammad, 15 Oct: grey "Steady" on the pale fluid "can barely be seen". This resolves the line's colours and its
// outline from the CSS and the tokens and checks WCAG contrast (4.5:1) against it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const tokens = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8');

const block = (re) => { const m = tokens.match(re); assert.ok(m, `token block ${re}`); return m[1]; };
const vars = (src) => Object.fromEntries([...src.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
const base = vars(block(/\n:root \{([^}]*)\}/));
const THEMES = {
  light: base,
  dark: { ...base, ...vars(block(/\n:root\[data-theme="dark"\] \{([^}]*)\}/)) },
  soft: { ...base, ...vars(block(/\n:root\[data-theme="soft"\] \{([^}]*)\}/)) },
};

const hex = (s) => { const h = s.replace('#', ''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
const over = (fg, a, bg) => fg.map((c, i) => c * a + bg[i] * (1 - a));
// Colours as [r, g, b, alpha]; enough of CSS for the expressions used here: var(), #hex, color-mix in srgb, transparent.
function colour(expr, t) {
  expr = expr.replace(/!important/, '').trim();
  let m;
  if ((m = expr.match(/^var\((--[\w-]+)\)$/))) { assert.ok(t[m[1]], `token ${m[1]}`); return colour(t[m[1]], t); }
  if (/^#[0-9a-f]{6}$/i.test(expr)) return [...hex(expr), 1];
  if (expr === 'transparent') return [0, 0, 0, 0];
  if ((m = expr.match(/^color-mix\(in srgb,\s*(.+?)\s+(\d+)%,\s*(.+)\)$/))) {
    const a = colour(m[1], t), b = colour(m[3], t), p = +m[2] / 100;
    const al = a[3] * p + b[3] * (1 - p);   // (premultiplied, as the spec mixes)
    return [0, 1, 2].map((i) => (al ? (a[i] * a[3] * p + b[i] * b[3] * (1 - p)) / al : 0)).concat(al);
  }
  throw new Error(`can't resolve colour ${expr}`);
}
const lum = (c) => { const l = c.slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// The last declaration of a property for a selector wins, as in the cascade (these rules are all !important or alike).
function decl(selector, prop) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let v = null;
  for (const m of css.matchAll(new RegExp(`(?:^|[}\\n])\\s*${esc}\\s*\\{([^}]*)\\}`, 'g'))) {
    const d = m[1].match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`));
    if (d) v = d[1].trim();
  }
  return v;
}

const RATE = '.ab .ab-belly > .ab-big > .ab-rate';
// Mohammad, 19 Oct: no pill. The words carry a solid 1 px outline of the card's colour on all eight sides (then a soft halo),
// so every letter is edged by the card colour whatever lies behind; the contrast that counts is the words against it.
test('the belly daily balance has no pill, only a solid card-coloured outline round its letters', () => {
  assert.equal(decl(`${RATE}[data-dir]`, 'background'), null, 'no backing pill');
  assert.match(decl(`${RATE}[data-dir]`, 'text-shadow'), /^var\(--ab-rate-halo\) !important$/);
  const halo = decl(`${RATE}[data-dir]`, '--ab-rate-halo');
  for (const [x, y] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
    const o = (v) => (v ? `${v}px` : '0');
    assert.ok(halo.includes(`${o(x)} ${o(y)} 0 var(--surface)`), `solid outline at ${x},${y}`);
  }
});

test('the belly daily balance is readable against its outline in every theme', () => {
  const fails = [];
  for (const [theme, t] of Object.entries(THEMES)) {
    const bg = colour('var(--surface)', t).slice(0, 3);
    for (const dir of ['steady', 'up', 'down']) {
      const fg = colour(decl(`${RATE}[data-dir="${dir}"]`, 'color'), t);
      const r = ratio(over(fg, fg[3], bg), bg);
      if (r < 4.5) fails.push(`${theme} ${dir}: ${r.toFixed(2)}:1`);
    }
  }
  assert.deepEqual(fails, [], 'the balance line needs 4.5:1 against the outline round it');
});

test('the balance keeps its meaning colours: amber rising, teal falling', () => {
  assert.match(decl(`${RATE}[data-dir="up"]`, 'color'), /--caution/);
  assert.match(decl(`${RATE}[data-dir="down"]`, 'color'), /--vel-normal/);
  assert.match(css, /\.ab-rate\[data-dir="up"\] \.ab-rate-a \{ color: var\(--caution\); \}/);
  assert.match(css, /\.ab-rate\[data-dir="down"\] \.ab-rate-a \{ color: var\(--vel-normal\); \}/);
});
