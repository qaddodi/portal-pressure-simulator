// Every full card but the six ladders on a wide screen (a laptop, an iPad on its side): the outline, the summary table, the quick check, the
// scale, the SAAG plot, the two walls and a plane are a centred card of their own width, not the screen's whole width, so the viewer has one
// place to read (Mohammad, 25 Oct: "Ladders OK but the rest can be narrowed"). The ladders and a phone keep their full-width card.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const src = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');

const VISUALS = ['outline', 'table', 'check', 'plane'];   // (plane: an illustration, narrower than the table, Mohammad 29 Oct)
const ALL = [...VISUALS, 'chart'];

test('every other full card takes the chart width, and only the ladders keep the screen', () => {
  assert.match(css, /\.pz:not\(\.stack\):not\(\.low\) \.pz-panel:not\(\.fill\) \{ width: var\(--pz-rw-chart\); \}/);
  // (.fill is the six ladders: presenter.js toggles it for visual 'ladders' alone, and it is the panel's only other class that sets a size.)
  assert.match(src, /panel\.classList\.toggle\('fill', s\.visual === 'ladders'\)/);
  // (The chart rule comes before the three reading rules, which are as specific: the later wins.)
  const at = (re) => css.search(re);
  assert.ok(at(/\.pz-panel:not\(\.fill\) \{ width: var\(--pz-rw-chart\)/) < at(/\.pz-panel\[data-visual="outline"\] \{ width: var/));
  assert.ok(at(/\.pz-panel\[data-visual="check"\] \{ width: var/) > at(/\.pz-panel\[data-visual="outline"\] \{ width: var/));
  // (The rule never reaches a phone: the stacked and sideways layouts keep the panel's own phone width.)
  assert.doesNotMatch(css, /\.pz\.(?:stack|low)[^{]*\.pz-panel[^{]*\{[^}]*--pz-rw-/);
});

test('each reading card has its own width rule, for the wide layout only', () => {
  for (const v of VISUALS) {
    assert.match(css, new RegExp(`\\.pz:not\\(\\.stack\\):not\\(\\.low\\) \\.pz-panel\\[data-visual="${v}"\\] \\{ width: var\\(--pz-rw-${v}\\); \\}`), v);
    // (A phone, upright or on its side, and an upright tablet keep their own full-width and 70% cards.)
    assert.doesNotMatch(css, new RegExp(`\\.pz\\.(?:stack|low)[^{]*\\.pz-panel\\[data-visual="${v}"\\] \\{[^}]*\\bwidth:`), `${v}: no phone width`);
  }
  // (The old 1180 px outline rule never applied: the wide panel's own rule is more specific. It is gone, not left to look in force.)
  assert.doesNotMatch(css, /\.pz-panel\[data-visual="outline"\] \{ width: min\(1180px/);
});

test('the widths are :root tokens in the teaching card\'s body text, never more than 82% of the screen', () => {
  const root = css.match(/:root \{ --pz-b:[^]*?\n\.pz-shade\.pz-card/)[0];
  for (const v of ALL) {
    const m = root.match(new RegExp(`--pz-rw-${v}: min\\(calc\\(\\d+ \\* var\\(--pz-b\\)\\), (\\d+)%\\);`));
    assert.ok(m && +m[1] <= 82, `${v}: never more than 82% of the screen`);
  }
  // presenter.js sets --pz-b on the app element as the room under a phone's words, in px (0 on a wide screen): read there, the body
  // text would be 0 and the cards would have no width. The element rules read the :root tokens, never --pz-b.
  assert.match(src, /set\('--pz-b', p && t \? B \+ 34 : 0\)/);
  for (const m of css.matchAll(/\.pz-panel\[data-visual="[a-z]+"\] \{[^}]*\}/g)) assert.doesNotMatch(m[0], /var\(--pz-b\)/, m[0]);
});

test('every wide screen keeps the card well under the screen and still wide enough for the outline\'s two columns', () => {
  const k = Object.fromEntries(ALL.map((v) => [v, +css.match(new RegExp(`--pz-rw-${v}: min\\(calc\\((\\d+) \\*`))[1]]));
  // (--pz-b: clamp(17px, 2.311 vh, 28px); the panel's side padding clamp(20px, 3vw, 52px); the outline's two columns need 2 x 340 px and the gap.)
  const body = (H) => Math.min(28, Math.max(17, 2.311 * H / 100));
  const width = (v, W, H) => Math.min(k[v] * body(H), 0.82 * W);
  for (const [W, H] of [[1024, 768], [1133, 744], [1180, 820], [1194, 834], [1366, 1024], [1440, 900], [1512, 982], [1728, 1117], [1920, 1080], [2560, 1440]]) {
    for (const v of ALL) assert.ok(width(v, W, H) <= 0.82 * W + 0.01, `${v} at ${W}x${H}`);
    const content = width('outline', W, H) - 2 * Math.min(52, Math.max(20, 0.03 * W)), gap = Math.min(60, Math.max(24, 0.036 * W));
    assert.ok(content >= 2 * 340 + gap, `the outline keeps two columns at ${W}x${H}: ${content}`);
    // (The check is the narrowest, the table the widest.)
    assert.ok(width('check', W, H) <= width('outline', W, H) && width('outline', W, H) <= width('table', W, H), `${W}x${H}`);
  }
  // (A Mac window is clearly narrower than before, when the panel took up to 1560 px: 1440 x 900 was 1366.)
  assert.ok(width('table', 1440, 900) < 1200 && width('outline', 1440, 900) < 1100 && width('check', 1440, 900) < 900 && width('chart', 1440, 900) < 1200);
  // (The charts share the table's width.)
  assert.equal(k.chart, k.table);
});

test('a card changes width only while it is faded out (the panel leaves whole before its next slide is built)', () => {
  assert.doesNotMatch(css.match(/\.pz-panel \{[^}]*\}/)[0], /transition:[^;]*width/);
});
