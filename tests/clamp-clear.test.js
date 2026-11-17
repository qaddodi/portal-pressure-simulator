// A narrowing's words ("Narrowed 8.0 to 3.2 mm × 1.0 cm") are never under another label: every reading gives way to them (17 Nov 2026,
// play-test at 1024: the callout on "HA" in Circuit and on "IVC 4.0"). Each case boots in a process of its own (tests/clamp-clear-run.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const run = (o) => {
  const out = execFileSync(process.execPath, ['tests/clamp-clear-run.mjs', JSON.stringify(o)], { encoding: 'utf8', maxBuffer: 1 << 24, timeout: 300000 });
  const line = out.split('\n').find((l) => l.startsWith('CLAMP'));
  assert.ok(line, 'the run printed its result');
  return JSON.parse(line.slice(5));
};

for (const o of [{ size: 'mac', view: 'circuit' }, { size: 'mac', view: 'anatomy' }, { size: 'iphone', view: 'anatomy' }, { size: 'mac', view: 'anatomy', s: 0.5 }]) {
  test(`no label shows over a narrowing's words: ${JSON.stringify(o)}`, { timeout: 320000 }, () => {
    const r = run(o);
    assert.ok(r.cl.some((c) => /narrowed$/.test(c.t) && c.box[2] > c.box[0]), 'the narrowing is called out');
    assert.deepEqual(r.lap, []);
    assert.deepEqual(r.cross, []);
  });
}

// A card opening over the words (all of them, or half): they move off it or fade out whole; they never stand cut by the card's edge (finding 23,
// 17 Nov 2026: "D…", "W…" beside the stent, under the Tests card).
for (const card of [true, 'half', 'top']) {   // ('top': a bar across the top of the stage down past the words, as the top bar is after the Tests sheet's pan: F29)
  test(`a narrowing's words under a card move off it or fade out whole: ${card}`, { timeout: 320000 }, () => {
    const r = run({ size: 'mac', view: 'anatomy', card });
    const [x0, y0, x1, y1] = r.card, b = r.cl[0].box;
    const under = b[0] < x1 && b[2] > x0 && b[1] < y1 && b[3] > y0;
    assert.ok(!under || r.op[0] < 0.05, `words at ${b} under the card ${r.card} with opacity ${r.op[0]}`);
  });
}

