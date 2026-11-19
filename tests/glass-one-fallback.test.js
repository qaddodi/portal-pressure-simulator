// LOOK-3 (bible review, 19 Nov 2026): the CSS fallback glass (Battery saver, Blur effect off, a software renderer, and the first frames of any card before the
// GPU draws its glass) is the same glass as the GPU's: the tint, a hairline edge (--glass-edge) and no drop shadow (13 Nov, "everything is same glass parameters").
// Every card used to keep its own pre-13-Nov look beside it, a lit top line and a soft drop (black 42 to 45 % in the dark looks), so the frame in which the GPU
// took over removed both at once, and a phone in Low Power Mode wore a second look.
import test from 'node:test';
import assert from 'node:assert/strict';
import { appCss } from './split-src.js';

const css = appCss();
const GLASS = ['.pz-shade', '.pz-shade.pz-card:not(.stack)', '.pz-shade.stack', '.pz-data.pz-data', '.pz-fk', '.pz-case', '.pz-bar', '.pz-scales', '.pz.stack .pz-bar'];
const ruleOf = (sel) => { const at = css.indexOf(`\n${sel} {`); assert.ok(at >= 0, `rule ${sel}`); return css.slice(at, css.indexOf('}', at)); };

test('the cards\' own glass edge and drop variables are gone, in every look', () => {
  assert.doesNotMatch(css, /--pz-glass-(edge|drop|line)/);
});

test('each glass card\'s fallback is the one glass: a hairline edge, no lit top line, no drop', () => {
  for (const sel of GLASS) {
    const r = ruleOf(sel);
    const shadow = /box-shadow:\s*([^;]+);/.exec(r);
    assert.ok(shadow, `${sel} has a box-shadow`);
    assert.equal(shadow[1].trim(), 'inset 0 0 0 1px var(--glass-edge)', sel);
  }
});

test('no card glass rule sets a drop shadow or a lit top line of its own', () => {
  const bad = [];
  for (const m of css.matchAll(/(^|\n)((?:\.pz|:root)[^{\n]*(?:\.pz-(?:shade|data|fk|case|bar|scales|sheet|fold))[^{\n]*)\{([^}]*)\}/g)) {
    for (const s of m[3].matchAll(/box-shadow:\s*([^;]+);/g)) if (/inset 0 1px 0|\d+px \d+px \d+px -?\d+px/.test(s[1]) && /--black-rgb|--glass-drop|rgb\(var\(--black/.test(s[1])) bad.push(`${m[2].trim().slice(0, 80)}: ${s[1]}`);
  }
  assert.deepEqual(bad, []);
});

test('the one glass is declared once, with no shadow (the GPU draws it with the same three values)', () => {
  assert.match(css, /--glass-edge: var\(--hairline\); --glass-shadow: none;/);
});
