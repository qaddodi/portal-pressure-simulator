// What an imported deck may carry in: equations are MathML from an allowlist only (both sinks), and a curve tool's
// setting path cannot reach a prototype. Fixtures are inert: strings that would be rejected, never run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanMathML, cleanEq, safeParamPath, unsafeIn, patchOf, getAt, mergeOf } from '../src/ui/import-safety.js';
import { checkDeck, parseDeckSource } from '../src/ui/deck-source.js';
import { handoutHTML } from '../src/ui/handout.js';
import { DECKS } from '../src/ui/decks.js';

const deck = (eq) => ({ title: 'T', slides: [{ title: 'S', eq }] });

test('the built-in equations pass unchanged', () => {
  let n = 0;
  for (const d of DECKS) for (const s of d.slides) if (s.eq) { n++; assert.equal(cleanMathML(s.eq[0]), s.eq[0], d.id + ' ' + s.title); assert.doesNotThrow(() => checkDeck({ title: 'T', slides: [{ title: 'x', eq: s.eq }] })); }
  assert.ok(n > 5);
});

test('HTML elements, event attributes, URLs and broken markup are rejected', () => {
  const bad = [
    '<mi>x</mi><img src=x onerror=alert(1)>',
    '<mi onclick="x()">x</mi>',
    '<mi class="a" style="x:y">x</mi>',
    '<mtext><a href="javascript:void(0)">x</a></mtext>',
    '<mi>x</mi></math><div>y</div>',
    '<math><mi>x</mi></math>',
    '<mi href="https://example.invalid">x</mi>',
    '<mi>x</mi><svg><mi/></svg>',
    '<mi>x',                  // unbalanced
    '<mi>x</mo>',             // mismatched
    '<mi class="a"b">x</mi>', // broken attribute
    '<mi>x</mi><',            // stray <
    '<mi>&</mi>',             // bare ampersand
    '<script>1</script>',
    '<style>a{}</style>',
    '<annotation-xml encoding="text/html"><p>x</p></annotation-xml>',
    '<mi/>',                  // non-void self-closed
    '',
    42,
  ];
  for (const ml of bad) assert.equal(cleanMathML(ml), null, String(ml));
  assert.equal(cleanEq([bad[0], 'legend']), null);
  assert.equal(cleanEq('<mi>x</mi>'), null);
  assert.equal(cleanEq(['<mi>x</mi>', 5]), null);
});

test('plain MathML with entities and an allowed class is kept', () => {
  assert.equal(cleanMathML('<mi class="eq-wedge">R</mi><mo>&times;</mo><mn>2</mn>'), '<mi class="eq-wedge">R</mi><mo>&times;</mo><mn>2</mn>');
  assert.deepEqual(cleanEq(['<mi>x</mi>', 'x is x']), ['<mi>x</mi>', 'x is x']);
});

test('an imported deck with a bad equation is refused before it can be presented or turned into notes', () => {
  assert.throws(() => checkDeck(deck(['<mi>x</mi><img src=x onerror=1>', 'k'])), /equation/);
  assert.throws(() => parseDeckSource(JSON.stringify(deck(['<script>1</script>', '']))), /equation/);
  assert.doesNotThrow(() => checkDeck(deck(['<mi>x</mi>', 'k'])));
});

test('the notes sink writes only cleaned markup, even for a deck that skipped the import check', () => {
  const html = handoutHTML(deck(['<mi>x</mi><img src=x onerror=1>', 'k']), 'https://x.invalid/', []);
  assert.doesNotMatch(html, /onerror|<img/);
  assert.match(handoutHTML(deck(['<mi>x</mi>', 'k']), 'https://x.invalid/', []), /<math display="block"><mi>x<\/mi><\/math>/);
});

test('the presenter sets an equation only through the cleaner', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
  assert.match(src, /function equation\(eq\)[\s\S]{0,300}cleanEq\(eq\)/);
});

test('unsafe setting paths are refused', () => {
  for (const p of ['__proto__.polluted', 'tips.__proto__.d', 'constructor.prototype.x', 'cirrhosis.constructor', 'tips..d', '', 'notASetting', 'a.b.c.d.e', 'tips.d;x', null, undefined, 7]) assert.equal(safeParamPath(p), false, String(p));
  for (const p of ['cirrhosis', 'tips.d', 'stenosis.TIPS', 'thrombus.PV_TRUNK', 'fibrosis.R.post', 'scope.air', 'tr', 'habrStrength']) assert.equal(safeParamPath(p), true, p);
});

test('patchOf, mergeOf and getAt cannot reach Object.prototype', () => {
  const before = Object.getOwnPropertyNames(Object.prototype).sort().join();
  const inert = JSON.parse('{"__proto__":{"polluted":1},"tips":{"__proto__":{"polluted":2}}}');
  assert.deepEqual(patchOf('__proto__.polluted', 1), {});
  assert.deepEqual(patchOf('tips.__proto__.polluted', 1, { cirrhosis: 5 }), { cirrhosis: 5 });
  assert.equal(getAt({}, '__proto__'), undefined);
  assert.equal(getAt({}, 'constructor'), undefined);
  mergeOf({ a: 1 }, inert); mergeOf(inert, inert); patchOf('tips.d', 4, inert);
  assert.equal({}.polluted, undefined);
  assert.equal(Object.getOwnPropertyNames(Object.prototype).sort().join(), before);
  assert.equal(Object.getPrototypeOf(mergeOf({}, inert)), Object.prototype);
});

test('ordinary settings and nested also patches still work', () => {
  assert.deepEqual(patchOf('cirrhosis', 30), { cirrhosis: 30 });
  assert.deepEqual(patchOf('tips.d', 6), { tips: { d: 6, on: true } });
  assert.deepEqual(patchOf('thrombus.PV_TRUNK', 50, { tips: { d: 8 }, drugs: { carvedilol: true } }), { tips: { d: 8 }, drugs: { carvedilol: true }, thrombus: { PV_TRUNK: 50 } });
  assert.deepEqual(mergeOf({ tips: { d: 8 } }, { tips: { on: true } }), { tips: { d: 8, on: true } });
  assert.equal(getAt({ fibrosis: { R: { post: 3 } } }, 'fibrosis.R.post'), 3);
});

test('an imported deck with a prototype key or an unsafe curve setting is refused', () => {
  const tool = (param, extra = {}) => ({ title: 'T', slides: [{ title: 'S', tool: { kind: 'curve', param, from: 0, to: 10, ...extra } }] });
  assert.throws(() => checkDeck(tool('__proto__.polluted')), /may not/);
  assert.throws(() => checkDeck(tool('cirrhosis', { also: JSON.parse('{"__proto__":{"x":1}}') })), /__proto__/);
  assert.throws(() => parseDeckSource('{"title":"T","slides":[{"title":"S","tool":{"kind":"curve","param":"tips.constructor.prototype"}}]}'), /may not/);
  assert.doesNotThrow(() => checkDeck(tool('cirrhosis', { also: { tips: { d: 8 } } })));
  assert.equal(unsafeIn(DECKS), '');
});
