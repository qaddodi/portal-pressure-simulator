// Every action on a card says what it does in words, beside its icon (Mohammad, 17 Nov 2026, the TIPS card: "The IR button should probably have the text IR
// or something"). The IR shortcut beside Doppler and Dye showed only its catheter icon: a stylesheet rule hid its word. No button verb may be an icon alone,
// in the models (each has a word) or in the styles (no rule hides a button's word).
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EDGES } from '../src/engine/topology.js';
import { cardFor } from '../src/ui/actions.js';
import { appCss } from './split-src.js';

const CTX = { canShunt: () => true, injectDye: () => {}, canDye: () => true, openIr: () => {} };
const cards = [];
for (const e of EDGES) if (e.kind !== 'wedge') { const m = cardFor({ type: 'edge', id: e.id }, CTX); if (m) cards.push([e.id, m]); }
for (const id of ['liver', 'heart', 'varices', 'gastric', 'spleen']) { const m = cardFor({ type: 'organ', id }, CTX); if (m) cards.push([id, m]); }

test('every button on every card has a word to show beside its icon', () => {
  let n = 0;
  for (const [id, m] of cards) for (const v of m.verbs || []) if (v.type === 'button') {
    const word = v.short || v.label;
    assert.ok(typeof word === 'string' && word.trim().length > 0, `${id}: ${v.id} has no word`);
    n++;
  }
  assert.ok(n > 0);
});

test('the TIPS and the DIPS show "IR" beside the catheter', () => {
  for (const id of ['TIPS', 'DIPS']) {
    const ir = cardFor({ type: 'edge', id }, CTX).verbs.find((v) => v.id === 'ir');
    assert.equal(ir.short, 'IR'); assert.equal(ir.icon, 'catheter');
  }
});

test('no stylesheet rule hides a card button\'s word', () => {
  const css = appCss().replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of css.matchAll(/([^{}]*\.ac-bl[^{}]*)\{([^}]*)\}/g)) {
    assert.doesNotMatch(m[2], /display:\s*none|visibility:\s*hidden|font-size:\s*0|(?:^|[;\s])width:\s*0|opacity:\s*0(?![.\d])/, `${m[1].trim()} hides the word`);
  }
});
