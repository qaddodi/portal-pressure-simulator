// LOOK-3 (bible review, 19 Nov 2026): the CSS fallback glass (Battery saver, Blur effect off, a software renderer, and the first frames of any card before the
// GPU draws its glass) is the same glass as the GPU's: the tint, a hairline edge (--glass-edge) and the one lift (--glass-shadow, 19 Nov 2026: Mohammad's B "Soft lift",
// 0 10px 24px -8px at --card-shadow-a of the shadow ink; it replaced "no drop" of 13 Nov, "everything is same glass parameters").
// Every card used to keep its own pre-13-Nov look beside it, a lit top line and its own soft drop (black 42 to 45 % in the dark looks), so the frame in which the GPU
// took over removed both at once, and a phone in Low Power Mode wore a second look. Now the fallback writes the shared token, never a number of its own.
import test from 'node:test';
import assert from 'node:assert/strict';
import { appCss } from './split-src.js';

const css = appCss();
const GLASS = ['.pz-shade', '.pz-shade.pz-card:not(.stack)', '.pz-shade.stack', '.pz-data.pz-data', '.pz-fk', '.pz-case', '.pz-bar', '.pz-scales', '.pz.stack .pz-bar'];
const ruleOf = (sel) => { const at = css.indexOf(`\n${sel} {`); assert.ok(at >= 0, `rule ${sel}`); return css.slice(at, css.indexOf('}', at)); };

test('the cards\' own glass edge and drop variables are gone, in every look', () => {
  assert.doesNotMatch(css, /--pz-glass-(edge|drop|line)/);
});

test('each glass card\'s fallback is the one glass: a hairline edge and the shared lift, no lit top line, no drop of its own', () => {
  for (const sel of GLASS) {
    const r = ruleOf(sel);
    const shadow = /box-shadow:\s*([^;]+);/.exec(r);
    assert.ok(shadow, `${sel} has a box-shadow`);
    assert.equal(shadow[1].trim(), 'inset 0 0 0 1px var(--glass-edge), var(--glass-shadow)', sel);
  }
});

test('no card glass rule sets a drop shadow or a lit top line of its own', () => {
  const bad = [];
  for (const m of css.matchAll(/(^|\n)((?:\.pz|:root)[^{\n]*(?:\.pz-(?:shade|data|fk|case|bar|scales|sheet|fold))[^{\n]*)\{([^}]*)\}/g)) {
    for (const s of m[3].matchAll(/box-shadow:\s*([^;]+);/g)) if (/inset 0 1px 0|\d+px \d+px \d+px -?\d+px/.test(s[1]) && /--black-rgb|--glass-drop|rgb\(var\(--black/.test(s[1])) bad.push(`${m[2].trim().slice(0, 80)}: ${s[1]}`);
  }
  assert.deepEqual(bad, []);
});

test('the one glass is declared once: the tint, the hairline and the lift (the GPU draws it with the same three values)', () => {
  assert.match(css, /--glass-edge: var\(--hairline\); --glass-shadow: 0 10px 24px -8px rgb\(var\(--shadow-rgb\) \/ var\(--card-shadow-a\)\); \}/);
});

test('the lift is written in one place: only the :root declaration and the callouts\' clearing set --glass-shadow', () => {
  const decl = [...css.matchAll(/(?:^|[;{\s])--glass-shadow:\s*([^;}]+)[;}]/g)].map((m) => m[1].trim());
  assert.deepEqual(decl.sort(), ['0 10px 24px -8px rgb(var(--shadow-rgb) / var(--card-shadow-a))', 'none']);
  assert.match(css, /\.cath-label \{ --glass-shadow: none; \}/);
});

test('its strength is one token with a value for each look: Light .45, Soft .5, the dark looks .75', async () => {
  const { tokensOfLook, LOOK_IDS } = await import('../src/ui/theme-tokens.js');
  const a = Object.fromEntries(LOOK_IDS.map((id) => [id, tokensOfLook(id)['card-shadow-a']]));
  assert.deepEqual(a, { light: '.45', soft: '.5', dark: '.75', navy: '.75', black: '.75' });
});

test('the lift parses as the glass reads it: one drop, no inset, the shadow ink at the look\'s strength', async () => {
  const { dropsOf, parseColour } = await import('../src/ui/glass-gl.js');
  const d = dropsOf('0 10px 24px -8px rgb(46 22 34 / .45)');
  assert.deepEqual(d.map((x) => [x.x, x.y, x.blur, x.spread]), [[0, 10, 24, -8]]);
  assert.deepEqual(parseColour(d[0].c).map((v) => +v.toFixed(3)), [0.18, 0.086, 0.133, 0.45]);
});

test('the shadow\'s quad reaches three sigmas past the shadow\'s own edge, a negative spread pulling it in (28 px for the lift, not 36)', async () => {
  const { dropReach } = await import('../src/ui/glass-gl.js');
  assert.equal(dropReach({ x: 0, y: 10, blur: 24, spread: -8 }), 28);
  assert.equal(dropReach({ x: 0, y: 0, blur: 24, spread: 4 }), 40);
  assert.equal(dropReach({ x: 0, y: 3, blur: 0, spread: 0 }), 0);
  assert.equal(dropReach({ x: 0, y: 0, blur: 2, spread: -9 }), 0);
});
