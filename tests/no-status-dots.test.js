// No status or decorative dots anywhere (Mohammad, 15 Oct: "No green dots please. Anywhere."). A state shows in the colour of
// its own words or number, a key uses short strokes like the vessels it names, and nothing wears a badge dot. What stays round
// is a control or a mark on a scale: switch knobs, slider thumbs, check circles, the scale bar's now and start marks, numbered markers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const css = ['styles/app.css', 'styles/tokens.css'].map(read).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
const js = readdirSync(new URL('../src/ui/', import.meta.url)).filter((f) => f.endsWith('.js')).map((f) => [f, read('src/ui/' + f)]);

// Round things that are controls or marks, not status: each named on purpose.
const ALLOWED = [
  /input\[type=range\]/, /\.switch/, /switch-vis/, /\.mt-sw/,            // switch knobs and slider thumbs
  /\.drug \.dot/, /\.oc-dot/,                                           // check circles (a tick appears inside)
  /\.info-i/,                                                           // the (i) button
  /\.pzb-(now|was)/, /\.pzk-/, /\.tl-dot/,                             // a value's place on a scale or timeline
  /\.instr-tab\[data-slot/,                                             // the numbered 1 / 2 slot badge
  /\.pz-nm/,                                                            // the table's "none" ring (○)
];
const small = (v) => !!v && (/px/.test(v) ? parseFloat(v) <= 16 : /em/.test(v) ? parseFloat(v) <= 1 : false);

test('no small round filled shape in the stylesheets except the named controls and scale marks', () => {
  const bad = [];
  for (const [, sel, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const w = body.match(/(?:^|[;\s])width:\s*([^;]+)/)?.[1], hh = body.match(/(?:^|[;\s])height:\s*([^;]+)/)?.[1];
    if (!/border-radius:\s*(50%|999px|var\(--r-pill\))/.test(body) || !small(w) || !small(hh)) continue;
    if (!ALLOWED.some((r) => r.test(sel))) bad.push(sel.trim());
  }
  assert.deepEqual(bad, [], 'a dot came back');
});

test('no state, badge or "live" dot drawn as a pseudo-element', () => {
  // (A pseudo-element with words in it, such as the phone's "Measure", is fine; an empty one on these is a dot or a size for one.)
  const names = ['status', 'pzt-r', 'endo-grade', 'endo-chip-v', 'dop-dir', 'ab-grade', 'pt-sev', 'wall-sev', 'pill', 'ping', 'dop-on', 'workspace-live'];
  for (const [, sel, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (/content:\s*(attr|'[^']|"[^"]|none)/.test(body)) continue;
    for (const name of names) assert.doesNotMatch(sel, new RegExp(`\\.${name}\\b[^,]*::(before|after)`), `${name}: ${sel.trim().slice(-80)}`);
  }
});

test('no dot elements in the markup the scripts build', () => {
  for (const [f, src] of js) {
    assert.doesNotMatch(src, /h\('i', \{ class: '(dot|um-dot|fd-dot|sev)'|pz-lens-dot/, f);
    assert.doesNotMatch(src, /class: 'pz-(site|kick)[^']*'[^)]*\}, h\('i'\)/, `${f}: the site tag has no dot`);
  }
});

test('the Doppler range marker is an upright tick, a deck level is a word, and a chip that is on has an edge, not a tint', () => {
  const rule = (sel) => css.match(new RegExp('(?:^|\\n)' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\{([^}]*)\\}'))?.[1] || '';
  assert.match(rule('.dop-mark'), /width: 4px; height: 18px;[^}]*border-radius: 2px/);
  const menu = read('src/ui/menu.js');
  assert.doesNotMatch(menu, /um-lv[^\n]*\[1, 2, 3\]\.map/, 'no level pips');
  assert.match(menu, /h\('span', \{ class: 'um-m um-lv' \}, levels\[lv\]/);
  for (const sel of ['.endo-chip[data-on="true"]', '.endo-chip.endo-red[data-on="true"]']) {
    assert.match(rule(sel), /box-shadow: inset 0 0 0 3px/, sel);
    assert.doesNotMatch(rule(sel), /background/, sel);
  }
  assert.doesNotMatch(css, /\.endo-chip(\.endo-red)?\[data-on="true"\] \{[^}]*background/, 'no tinted fill on an active chip');
});

test('the readings carry their state in their own colour instead', () => {
  assert.match(css, /\.endo-grade\[data-sev="danger"\] \{ --sev-ink: var\(--danger\); \}/);
  assert.match(css, /\.endo-chip\.endo-red\[data-on="true"\] \.endo-chip-v \{ color: var\(--danger\); \}/);
  assert.match(css, /\.dop-dir\[data-sev="caution"\] \{ color:/);
  assert.match(css, /\.cut-h\[data-sev="danger"\] \{ color: var\(--danger\); \}/);
  assert.match(css, /\.measure-launch\.ping \{ color: var\(--accent-ink\); \}/);
});
