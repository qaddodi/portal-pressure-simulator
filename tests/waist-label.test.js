// The TIPS's and the DIPS's one figure label (Mohammad, 17 Nov 2026: "instead of TIPS 108 cm/s show the diameter and the waist and length, and no need for the chevrons,
// the bracket is sufficient"): "TIPS 8 mm", under it "4.4 mm × 1.0 cm" (the waist, no word: Mohammad, 17 Nov) and "distal stenosis 4 mm" where the stent has them; no velocity; the waist has its bracket
// and no arrowheads, and no clamp of either stent has words of its own. Each case boots the TIPS slide's figure in node (tests/waist-label-run.mjs) in a process of its own.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const MARK = { edges: ['TIPS'], label: 'Covered stent', kind: 'treat' };
const run = (o) => {
  const out = execFileSync(process.execPath, ['tests/waist-label-run.mjs', JSON.stringify({ size: 'mac', mark: MARK, points: false, ...o })], { encoding: 'utf8', maxBuffer: 1 << 24, timeout: 300000 });
  const line = out.split('\n').find((l) => l.startsWith('WAIST'));
  assert.ok(line, 'the run printed its result');
  return JSON.parse(line.slice(5));
};

test('a TIPS with a waist: one label, its diameter and the waist and length, no velocity, the bracket alone marks it', { timeout: 320000 }, () => {
  const r = run({});
  assert.equal(r.text, 'TIPS 8 mm / 4.4 mm × 1.0 cm');
  assert.deepEqual(r.keys, ['n:TIPS TIPS 8 mm / 4.4 mm × 1.0 cm'], 'one label of the stent, no cm/s');
  assert.equal(r.spans, 1, 'the bracket');
  assert.equal(r.arrows, 0, 'and no arrowheads beside it');
  assert.equal(r.clampLabels, 0, 'no clamp has words of its own');
  assert.equal(r.overBracket, 0, 'the words stand off the bracket');
  assert.deepEqual(r.over, []);
});

test('a TIPS with no narrowing says only its diameter', { timeout: 320000 }, () => {
  const r = run({ red: 0 });
  assert.equal(r.text, 'TIPS 8 mm');
  assert.equal(r.spans, 0);
});

test('a waist and an end stenosis are two lines of the one label', { timeout: 320000 }, () => {
  const r = run({ extra: { stenosis: { TIPS: 0.5 }, stenosisSite: { TIPS: 'distal' } } });
  assert.equal(r.text, 'TIPS 8 mm / 4.4 mm × 1.0 cm / distal stenosis 4 mm');
  assert.equal(r.clampLabels, 0);
  assert.equal(r.arrows, 0, 'the waist has none');
  assert.equal(r.overBracket, 0);
});

test('zoomed out the label still stands by its waist, or on a leader that reaches it', { timeout: 320000 }, () => {
  const r = run({ zoom: 0.6 });
  assert.match(r.text, /^TIPS 8 mm/);
  assert.ok(r.gap <= 30 || r.leader, `the label stands ${Math.round(r.gap)} px off the bracket, with${r.leader ? '' : 'out'} a leader`);
  assert.equal(r.overBracket, 0);
});

// The label is always there (Mohammad, 17 Nov: "Tips has no label now"): where the whole of it has no room it gives up its lines from the last, down to "TIPS 8 mm",
// never to a line cut to its numbers ("6 2.0") and never to nothing.
const FORMS = [['TIPS 8 mm', '6 mm × 2.0 cm'], ['TIPS 8 mm']];   // (the whole; the stent's line alone)
const holds = (text, o) => {
  assert.ok(text && /^TIPS 8 mm/.test(text), `${JSON.stringify(o)}: the TIPS has its label, "${text}"`);
  assert.ok(FORMS.some((f) => f.join(' / ') === text), `${JSON.stringify(o)}: one of its forms, whole lines only, "${text}"`);
};
for (const o of [{ red: 0.25, waist: 2, size: 'iphone' }, { red: 0.25, waist: 2, zoom: 0.5 }, { red: 0.25, waist: 2, size: 'iphone', sel: true, zoom: 1.5 }]) {
  test(`the TIPS label is always present, whole lines only: ${JSON.stringify(o)}`, { timeout: 320000 }, () => { holds(run(o).text, o); });
}
