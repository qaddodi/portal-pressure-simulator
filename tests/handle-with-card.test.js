import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The stacked card's handle (.pz-lip, the bar on the readings' card) comes in with the card and never ahead of it (Mohammad, 25 Oct: "the handle
// of the stacked cards appears before the cards"). The bar is a crisp mark on glass that is nearly clear while it fades, so it fades in once the
// glass is in and out before it; with Reduce Motion every transition was off for it, so it came up at once while the cards were still fading in.
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const css = read('../styles/app.css');
const js = read('../src/ui/presenter.js');

const secs = (s) => (s.endsWith('ms') ? parseFloat(s) / 1000 : parseFloat(s));
// The body of the rule that opens with `sel` (which ends in its brace).
const rule = (sel, from = css) => {
  const at = from.indexOf(sel);
  assert.ok(at >= 0, `rule ${sel}`);
  return from.slice(at + sel.length, from.indexOf('}', at));
};
// A rule's opacity transition: [duration, delay] in seconds.
const fade = (body) => {
  const list = body.match(/transition: ([^;]*?)(?: !important)?;/)?.[1] ?? '';
  const m = list.match(/opacity ([\d.]+m?s)(?: var\(--ease\))?(?: ([\d.]+m?s))?/);
  assert.ok(m, `an opacity transition in "${list}"`);
  return [secs(m[1]), m[2] ? secs(m[2]) : 0];
};
const glassIn = (root) => {
  const m = css.match(new RegExp(`\\.pz\\.${root}\\.${root} \\.pz-data\\.pz-sheet:not\\(\\.pz-hide\\)::before[^{]*\\{ transition-duration: ([\\d.]+m?s); transition-delay: ([\\d.]+m?s); \\}`));
  assert.ok(m, `the ${root} card's glass enters with its own duration and delay`);
  return [secs(m[1]), secs(m[2])];
};

test('the handle sits right after the data card, so its out look follows the card\'s own class', () => {
  assert.match(js, /h\('div', \{ class: 'pz' \}, safe, veil, load, fk, text, data, lip, panel,/);
  assert.match(css, /\.pz \.pz-data\.pz-hide \+ \.pz-lip:not\(\[hidden\]\) \{ opacity: 0;/);
});

test('in motion, the handle fades in after the card\'s glass has begun and is out before it, on every device', () => {
  // The card's glass (its two pieces, the header and the instrument), phone and wide: the same pace and start on both.
  const [dur, delay] = glassIn('stack');
  assert.deepEqual(glassIn('pz-wide'), [dur, delay]);
  const [glassOut] = fade(rule('.pz.stack.stack .pz-data.pz-sheet::before, .pz.stack.stack .pz-data.pz-sheet::after, .pz.stack.stack .pz-data.pz-sheet > :is(.pz-dh, .pz-tool) {'));
  // The handle in: the phone's, the pull's own rule, and the wide screen's.
  for (const sel of ['.pz:is(.stack, .low) .pz-lip:not([hidden]) {', '.pz.stack .pz-data.pz-sheet.pz-sliding + .pz-lip {', '.pz.pz-wide .pz-lip:not([hidden]) {']) {
    const [d, s] = fade(rule(sel));
    assert.ok(s > delay, `${sel} the bar starts after the glass has begun`);
    assert.ok(s + d >= delay + dur, `${sel} and ends with it or after it, never before`);
  }
  // The handle out: at once, and quicker than the glass's own fade.
  const [outDur, outDelay] = fade(rule('.pz .pz-data.pz-hide + .pz-lip:not([hidden]) {'));
  assert.equal(outDelay, 0);
  assert.ok(outDur < glassOut, 'out before the glass is');
  // (A slide that changes in the middle of a pull: the pull's own transition would hold the bar back.)
  assert.deepEqual(fade(rule('.pz.stack .pz-data.pz-sheet.pz-sliding.pz-hide + .pz-lip {')), [outDur, 0]);
});

test('with Reduce Motion the handle still fades with the cards, in after the glass and out before it, never popping', () => {
  const block = css.match(/@media \(prefers-reduced-motion: reduce\) \{\n {2}\.pz \*, \.pz,[\s\S]*?\n\}/)?.[0] ?? '';
  assert.ok(block.includes('transition: none !important'), 'the block turns every transition off, the handle\'s included');
  // (The cards' glass fades in .3 s from the start there: .pz > :is(.pz-data ...) { transition: opacity .3s }.)
  const [inDur, inDelay] = fade(rule('.pz > .pz-lip {', block));
  const [outDur, outDelay] = fade(rule('.pz > .pz-data.pz-hide + .pz-lip {', block));
  assert.ok(inDur > 0 && inDelay >= 0.3, 'in once the glass has faded in');
  assert.ok(outDur > 0 && outDur < 0.3 && outDelay === 0, 'out before the glass is out');
  assert.match(rule('.pz > .pz-lip {', block), /transform: none !important/, 'no slide, as the cards');
});

test('a handle that comes up with its card already standing starts from its out look and eases in', () => {
  assert.match(css, /\.pz \.pz-lip\.pz-lip-in:not\(\[hidden\]\) \{ opacity: 0; transition: none !important; \}/);
  assert.match(js, /const lipMO = new MutationObserver\(lipSync\);/);
  const src = js.match(/const lipSync = \(\) => \{[\s\S]*?\n {4}\};/)?.[0];
  assert.ok(src, 'lipSync is in presenter.js build');
  const run = (lipHidden, data) => {
    const log = [];
    const lip = { hidden: lipHidden, classList: { add: (c) => log.push(`add ${c}`), remove: (c) => log.push(`remove ${c}`) }, get offsetWidth() { log.push('flush'); return 0; } };
    const card = { hidden: !!data.hidden, classList: { contains: (c) => data.classes.includes(c) } };
    new Function('lip', 'data', 'placeLip', `${src}; return lipSync;`)(lip, card, () => log.push(`place ${lip.hidden ? 'hidden' : 'shown'}`))();
    return { lip, log };
  };
  // Un-hidden under a standing card: out look first, placed, painted that way (the flush), then let go to ease in.
  let r = run(true, { classes: ['pz-sheet'] });
  assert.equal(r.lip.hidden, false);
  assert.deepEqual(r.log, ['add pz-lip-in', 'place shown', 'flush', 'remove pz-lip-in']);
  // Un-hidden while the card is still out (pz-hide): the card's own out look holds the handle, nothing more to do.
  r = run(true, { classes: ['pz-sheet', 'pz-hide'] });
  assert.equal(r.lip.hidden, false);
  assert.deepEqual(r.log, ['place shown']);
  // Already shown, the card standing: just placed (every style change of the card runs this).
  r = run(false, { classes: ['pz-sheet'] });
  assert.deepEqual(r.log, ['place shown']);
  // A card that is hidden, or not a sheet, takes the handle away.
  r = run(false, { hidden: true, classes: ['pz-sheet'] });
  assert.equal(r.lip.hidden, true);
  r = run(false, { classes: [] });
  assert.equal(r.lip.hidden, true);
  assert.deepEqual(r.log, ['place hidden']);
});
