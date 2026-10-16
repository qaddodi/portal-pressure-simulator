// A disease name in a teaching card is set in a pill (src/ui/diseases.js, .pz-dz in styles/app.css): marked from one
// list, so no slide needs marking by hand, and tinted by a token so every theme has its own colour.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { diseasePieces, DISEASE_SRC } from '../src/ui/diseases.js';
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

// Written out apart from the list, with the spellings decks use, so a name the list misses (or spells differently) shows
// up here. Fibrosis, shock and a bare "thrombosis" are findings or processes, not named conditions, and stay plain.
const PROBE = new RegExp(String.raw`\b(?:cardiac cirrhosis|cirrho(?:sis|tic)|(?:portal|splenic|mesenteric|hepatic) (?:vein|artery) thrombosis|PVT|NCPH|non-?cirrhotic portal hypertension|PSVD|porto-?sinusoidal vascular (?:disorder|disease)|schistosomiasis|sinusoidal obstruction(?: syndrome)?|veno-?occlusive disease|SOS|Budd[–-]\u2060?Chiari(?: syndrome)?|(?:right )?heart failure|constrictive pericarditis|tricuspid regurgitation|congestive hepatopathy|MASLD|MASH|NASH|NAFLD|hepatitis [A-E]|alcohol-(?:associated|related) hepatitis|hepatorenal syndrome|HRS(?:-AKI)?|SBP|spontaneous bacterial peritonitis|hepatic encephalopathy|HCC|hepatocellular carcinoma|(?:liver|pancreatic) cancer|nodular regenerative hyperplasia|hepatoportal sclerosis|pancreatitis|sarcoidosis|primary (?:biliary|sclerosing) cholangitis|PBC|PSC|amyloidosis|ha?emochromatosis|Wilson disease|polycyth(?:a)?emia vera)\b`, 'gi');
const nb = (t) => t.replace(/(\p{L})–(\p{L})/gu, '$1–\u2060$2');   // (as presenter.js sets a title or line)

test('every disease a deck title or line names is in the list and gets a pill', () => {
  let n = 0;
  for (const d of DECKS) for (const s of d.slides) for (const f of [s.title, s.line]) {
    if (!f) continue;
    const t = nb(f), dz = marked(t);
    for (const m of t.matchAll(PROBE)) { n++; assert.ok(dz.some((x) => x.includes(m[0])), `${d.id}/${s.id}: "${m[0]}" has no pill in "${f}"`); }
  }
  assert.ok(n > 40, `${n} names checked`);
});

// (presenter.js cannot load outside a browser, so its line tokenizer is read as source.) A slide term, bold key word or
// value that starts inside a disease name used to win the place and drop the pill ("portal vein" in "portal vein
// thrombosis"): the disease group comes right after the link and marked value, and the loop reads it as group 5.
test('in a line, a disease name keeps its pill over a term, bold word or value that starts in it', () => {
  const src = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
  const fn = src.slice(src.indexOf('function lineRe('), src.indexOf('function rich('));
  assert.ok(fn.includes('|\\{([^}]+)\\}([,.;:]?)|\\b(${DISEASE_SRC})\\b` + (tw.length'),'the disease name is the third kind, before terms, values and key words');
  assert.match(src, /const \[all, lw, lk, mk, mkStop, dz, tword, val, valStop, key, term, lensBy, lensW\] = m/);
  // The same order on a line: the name wins where a term starts inside it.
  const re = new RegExp(String.raw`\[([^\]]+)\]\(([\w:]+)\)|\{([^}]+)\}([,.;:]?)|\b(${DISEASE_SRC})\b|\b([Pp]ortal vein)\b`, 'g');
  assert.deepEqual([...'Portal vein thrombosis narrows the portal vein.'.matchAll(re)].map((m) => (m[5] ? 'dz' : 'term')), ['dz', 'term']);
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

test('a title only tints the name: no box, padding or shadow that a card edge could clip', () => {
  const app = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  const rule = app.match(/\.pz-h \.pz-dz \{([^}]*)\}/)?.[1] || '';
  assert.ok(/background: none/.test(rule) && /box-shadow: none/.test(rule) && /padding: 0;/.test(rule) && /var\(--disease\)/.test(rule));
});

test('a body pill adds no vertical padding or margin, so it stays inside its line and the card', () => {
  const app = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  const rule = app.match(/\n\.pz-dz \{([^}]*)\}/)?.[1] || '';
  assert.ok(rule && /padding: 0 \.3em;/.test(rule) && !/margin-block|margin-top|margin-bottom|display|line-height/.test(rule));
});
