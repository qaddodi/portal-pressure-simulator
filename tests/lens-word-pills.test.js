// The words name the view the vessels are colored by ("With the vessels colored by congestion"): the view's name is a
// pill in that view's own colour, red for congestion (Mohammad, 16 Oct). Every such phrase in every deck must name a
// view the presenter knows, so none is left plain, and each view's colour must exist in the tokens.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DECKS } from '../src/ui/decks.js';

const SRC = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
const TOKENS = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8');
const obj = (name) => {
  const body = SRC.match(new RegExp(`export const ${name} = \\{([^}]+)\\}`))[1];
  return Object.fromEntries([...body.matchAll(/'?([\w ]+)'?: '([^']+)'/g)].map((m) => [m[1].trim(), m[2]]));
};
const WORDS = obj('LENS_WORDS'), TONE = obj('LENS_TONE');

test('every "colored by" in a slide line names a view that gets its pill', () => {
  const plain = [];
  let n = 0;
  for (const d of DECKS) for (const s of d.slides) {
    for (const m of (s.line || '').matchAll(/\bcolou?red by (\w+(?: \w+)?)/gi)) {
      n++;
      if (!Object.keys(WORDS).some((w) => m[1] === w || m[1].startsWith(`${w} `))) plain.push(`${d.id}/${s.id}: colored by ${m[1]}`);
    }
  }
  assert.ok(n > 40, `found ${n} phrases`);
  assert.deepEqual(plain, []);
});

test('each view the words name has a colour defined in the tokens, congestion red', () => {
  for (const [w, k] of Object.entries(WORDS)) {
    const v = TONE[k];
    assert.ok(v, `${w}: no tone`);
    assert.match(TOKENS, new RegExp(`${v}:\\s*#`), `${w}: ${v} is not defined`);
  }
  assert.equal(TONE[WORDS.congestion], '--lens-heat');
  assert.match(TOKENS, /--lens-heat: #D7263D/);   // (the heat ramp's red)
});

test('the line typesetter sets the view word as a tinted pill that lights nothing on the figure', () => {
  assert.match(SRC, /\|\$\{LENS_RE\}`, 'g'\)/, 'the phrase is one of the line\'s tokens');
  assert.match(SRC, /const \[all, [^\]]*, lensBy, lensW\] = m/);
  assert.match(SRC, /if \(lensW\) out\.push\(lensBy\.replace\(\/ \$\/, '\\u00a0'\), h\('span', \{ class: 'pz-term pz-lens-t', style: `--tone: \$\{toneVar\(LENS_TONE\[LENS_WORDS\[lensW\]\]\)\}` \}, lensW\)\)/);
});
