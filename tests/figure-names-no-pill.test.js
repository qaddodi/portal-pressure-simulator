// One style for text on the figure (unification audit 12, 13 Nov 2026; Mohammad: one label style, outlined text, no boxes): the lobule's and
// the sinusoid's names are outlined text like every label (label-gl.js, through label-captions.js), lit or not. No ::before pill is left on
// them in the stylesheet, nothing reads one for a frost or a leader's end, and the pills' reader (lz-pills.js) is gone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const noComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const CSS = readdirSync(new URL('../styles/', import.meta.url)).filter((f) => f.endsWith('.css')).map((f) => noComments(read(`../styles/${f}`))).join('\n');

test('no ::before pill remains on .lz-lab, .lz-zone or .sv-region', () => {
  const rules = [...CSS.matchAll(/([^{}]+)\{[^{}]*\}/g)].map((m) => m[1].trim());
  const bad = [];
  for (const sel of rules) {
    // (Each selector of the rule, split at its top-level commas; a pill is the name's own ::before. The edge arrow on a name's
    // text (.lz-lab .n::before, a pointer to a name off the screen) is not a pill and stays.)
    let depth = 0, from = 0;
    const parts = [];
    for (let i = 0; i < sel.length; i++) { const c = sel[i]; if (c === '(') depth++; else if (c === ')') depth--; else if (c === ',' && !depth) { parts.push(sel.slice(from, i)); from = i + 1; } }
    parts.push(sel.slice(from));
    for (const p of parts) {
      const m = /::before\s*$/.exec(p.trim());
      if (!m) continue;
      const head = p.trim().slice(0, -'::before'.length).trim();
      const last = head.split(/\s+|>/).filter(Boolean).at(-1) || '';
      if (/\.(lz-lab|lz-zone|sv-region)\b/.test(last) || /^:is\(\.lz-lab, \.lz-zone(, \.sv-region)?\)/.test(last) || /^:is\(.*\.(lz-lab|lz-zone|sv-region).*\)(\[|:|$)/.test(last)) bad.push(p.trim().slice(0, 140));
    }
  }
  assert.deepEqual(bad, [], 'a name on the figure wears no pill');
  assert.doesNotMatch(CSS, /--gl-pill|--pill-x|--pill-y|@keyframes pill-in|canvas#pillGl/);
});

test('nothing reads a pill: no lz-pills.js, no leader stopping on a pill\'s outline', () => {
  assert.equal(existsSync(new URL('../src/ui/lz-pills.js', import.meta.url)), false);
  const LZ = read('../src/ui/lobule-zoom.js'), SV = read('../src/ui/sinusoid-view.js'), PR = read('../src/ui/presenter.js');
  assert.doesNotMatch(LZ, /pillQ|'::before'\)\.opacity|getComputedStyle\(L\.el, '::before'\)/);
  const letters = LZ.slice(LZ.indexOf('const lettersInto = '), LZ.indexOf('const dropCost = '));
  assert.match(letters, /o\.r = 0;/);
  assert.doesNotMatch(letters, /litIn|cap\.on/, 'a lit name\'s leader stops on its letters as any other\'s');
  assert.doesNotMatch(SV, /pillX|pillY/);
  assert.doesNotMatch(PR, /'pill-in'/);
});

test('a computed colour is read as rgba() by one function (css-color.js), for the sheet\'s glass and the names alike', async () => {
  const { rgbaOf } = await import('../src/ui/css-color.js');
  const cap = await import('../src/ui/label-captions.js');
  assert.equal(cap.rgbaOf, rgbaOf);
  assert.equal(rgbaOf('color(srgb 1 0.5 0 / 0.47)'), 'rgba(255, 128, 0, 0.47)');
  assert.equal(rgbaOf('color(srgb 0 0 1)'), 'rgba(0, 0, 255, 1)');
  assert.equal(rgbaOf('rgba(1, 2, 3, 0.4)'), 'rgba(1, 2, 3, 0.4)');
  assert.equal(rgbaOf('transparent'), '');
  assert.match(read('../src/ui/sheet-glass.js'), /import \{ rgbaOf \} from '\.\/css-color\.js';/);
});
