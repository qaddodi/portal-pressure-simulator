// A stent's waist words ("Waist 8.0 to 4.4 mm × 1.0 cm") stand beside the waist or, where the vessels leave no room, off it on a short leader to its nearest corner, and
// no other label stands against them (play-test 17 Nov 2026, finding 26: zoomed out beside the stent card, the words stood 60 px off, under "IVC 4.1", with no line to the stent).
// Each case boots in a process of its own (tests/waist-label-run.mjs): a 4.4 mm waist of an 8 mm TIPS, the Healthy figure at 800×600, the camera zoomed out.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const run = (o) => {
  const out = execFileSync(process.execPath, ['tests/waist-label-run.mjs', JSON.stringify({ size: 'small', view: 'anatomy', preset: 'healthy', frames: 300, sweep: [0], ...o })], { encoding: 'utf8', maxBuffer: 1 << 24, timeout: 300000 });
  const line = out.split('\n').find((l) => /^\d+ WAIST/.test(l));
  assert.ok(line, 'the run printed its result');
  return JSON.parse(line.slice(line.indexOf('WAIST') + 5));
};

for (const zoom of [1, 0.65, 0.5]) {
  test(`the waist's words stand by the waist, off it only on a leader that takes the short way, clear of every label: zoom ${zoom}`, { timeout: 320000 }, () => {
    const r = run({ zoom });
    assert.match(r.text, /^Waist 8\.0 to 4\.4 mm × 1\.0 cm$/);
    assert.equal(r.vessel, 'TIPS', 'the words know their own stent: it is the one vessel they may stand against');
    assert.ok(r.box && r.bracket, 'the words and the bracket are drawn');
    assert.deepEqual(r.over, [], 'no label is under them');
    const lead = r.leads.find((l) => l.id === 'TIPS~waist');
    if (r.gap > 30) {
      assert.ok(lead, `off the waist by ${Math.round(r.gap)} px, a leader joins them`);
      const n = lead.d.match(/-?[\d.]+/g).map(Number), len = Math.hypot(n[2] - n[0], n[3] - n[1]);
      assert.ok(len <= r.gap + 30, `the leader takes the short way, ${Math.round(len)} px for words ${Math.round(r.gap)} px off`);
      const [x0, y0, x1, y1] = r.box;
      assert.ok(n[2] >= x0 - 1 && n[2] <= x1 + 1 && n[3] >= y0 - 1 && n[3] <= y1 + 1, 'and ends on the words\' box');
    }
    assert.ok(r.air > 0, `no label stands against the words, air ${r.air}`);
  });
}
