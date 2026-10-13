// A disease name in a teaching card is set in a pill (src/ui/diseases.js, .pz-dz in styles/app.css): marked from one
// list, so no slide needs marking by hand, and tinted by a token so every theme has its own colour.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { diseasePieces } from '../src/ui/diseases.js';
import { DECKS } from '../src/ui/decks.js';

const marked = (t) => diseasePieces(t).filter(([, d]) => d).map(([x]) => x);

test('names are found wherever they sit, in either case, with their abbreviations', () => {
  assert.deepEqual(marked('Cirrhosis raises the HVPG, and so does schistosomiasis.'), ['Cirrhosis', 'schistosomiasis']);
  assert.deepEqual(marked('Portal vein thrombosis, NCPH and right heart failure'), ['Portal vein thrombosis', 'NCPH', 'right heart failure']);
  assert.deepEqual(marked('Heart failure and Hepatitis B'), ['Heart failure', 'Hepatitis B']);
  assert.deepEqual(marked('Budd–⁠Chiari syndrome and Budd-Chiari'), ['Budd–⁠Chiari syndrome', 'Budd-Chiari']);
  assert.deepEqual(marked('hepatic encephalopathy'), ['hepatic encephalopathy']);
});

test('the subject and findings with their own tiles stay plain; words inside words are left alone', () => {
  assert.deepEqual(marked('Portal hypertension with ascites and varices'), []);
  assert.deepEqual(marked('sosa pvtx'), []);
});

test('pieces rebuild the text exactly', () => {
  const t = 'In cirrhosis, SOS and cardiac cirrhosis differ.';
  assert.equal(diseasePieces(t).map(([x]) => x).join(''), t);
});

test('every deck title and line that names a disease gets a pill', () => {
  let n = 0;
  for (const d of DECKS) for (const s of d.slides) for (const f of [s.title, s.line]) if (f && /cirrhosis|portal vein thrombosis|schistosomiasis/i.test(f)) { n++; assert.ok(marked(f).length, f); }
  assert.ok(n > 10);
});

test('the pill colour is a token with a value in the light and both dark blocks', () => {
  const css = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8');
  assert.ok(/:root \{[\s\S]*?--disease: #/.test(css));
  assert.ok((css.match(/--disease: #/g) || []).length >= 3);
  const app = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  assert.ok(/\.pz-dz \{[^}]*var\(--disease\)/.test(app));
  // No vertical padding or display change: the pill never alters a line's height.
  assert.ok(!/\.pz-dz \{[^}]*(?:padding: [^0;]|display:|line-height)/.test(app));
});
