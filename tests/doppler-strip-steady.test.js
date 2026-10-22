// The Doppler's top strip ("−47 cm/s Hepatofugal · Phasic") holds its size while its words change: the fitting step is chosen once
// per width and vessel kind for the widest words that kind can show, never from the words on screen (Mohammad, 19 Oct: the line
// jumped when "Phasic" turned "Monophasic").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/ui/doppler.js', import.meta.url), 'utf8');
const body = (name) => { const i = src.indexOf(`function ${name}(`); assert.ok(i > 0, name); return src.slice(i, src.indexOf('\n  }\n', i)); };

test('the strip is sized by width, type sizes and vessel kind, not by the words shown', () => {
  const fit = body('fitStrip');
  const key = fit.match(/const key = `([^`]*)`/)[1];
  assert.match(key, /meta\(\)\.kind/);
  for (const shown of ['dirFull', 'patternEl', 'velEl', 'textContent']) assert.ok(!key.includes(shown), `fit key reads ${shown}: ${key}`);
  // (the shown words only ever take a smaller step than the base, never a bigger one)
  assert.match(fit, /for \(i = stripBase; i < STEPS\.length - 1; i\+\+\)/);
  // (and the step is remembered by the words' shape, the reading's digits all one width: a new number measures nothing)
  assert.match(fit, /stripSteps\.get\(shape\)/);
  assert.match(fit, /velB\.textContent\.replace\(\/\\d\/g, '0'\)/);
  // (the number keeps a slot as wide as its widest reading)
  assert.match(fit, /velB\.style\.minWidth = `\$\{[^`]+\}em`/);
});

test('every direction and pattern interpret() can write is among the words the strip is sized for', () => {
  const words = src.slice(src.indexOf('const STRIP_WORDS = {'), src.indexOf('};', src.indexOf('const STRIP_WORDS = {')));
  const kinds = Object.fromEntries([...words.matchAll(/^\s+(\w+): (\[.*\]),$/gm)].map(([, k, v]) => [k, JSON.parse(v.replace(/'/g, '"'))]));
  const it = body('interpret');
  // Each kind's branch of interpret(), its dir and pattern literals.
  const at = Object.fromEntries(['portal', 'hepatic', 'artery', 'tips', 'ivc'].map((k) => [k, it.indexOf(`} else if (p.kind === '${k}')`)]));
  at.collateral = it.lastIndexOf('} else {');
  const order = Object.values(at);
  for (const [kind, a] of Object.entries(at)) {
    assert.ok(a > 0, kind);
    const b = Math.min(...order.filter((x) => x > a), it.length);
    const part = it.slice(a, b), [dirs, pats] = kinds[kind];
    // (the quoted words of each assignment, leaving out those it compares with, as p.id === 'DIPS')
    const lits = (re) => [...part.matchAll(re)].flatMap((m) => [...m[1].replace(/=== '[^']*'/g, '').matchAll(/'([^']+)'/g)].map((x) => x[1]));
    const dirLits = lits(/dir = ([^;]+);/g), patLits = lits(/pattern = ([^;]+);/g).filter((t) => !t.startsWith('Expected'));
    assert.ok(dirLits.length && (patLits.length || kind === 'artery'), kind);
    for (const d of dirLits) assert.ok(dirs.includes(d) || d === 'No flow', `${kind}: direction "${d}" missing`);
    for (const p of patLits) assert.ok(pats.includes(p), `${kind}: pattern "${p}" missing`);
  }
  // (the hepatic artery's pattern carries a number: sized for two decimals)
  assert.match(it, /pattern = `Resistive index \$\{fmt\(ri, 2\)\}`/);
  assert.ok(kinds.artery[1].includes('Resistive index 0.00'));
});
