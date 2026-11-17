// A slide's callouts and a stent's cm/s labels hold their spots and stay shown while the slide stands (Mohammad, 17 Nov 2026: "the TIPS stenosis callout
// and the ultrasound probe and the actual label of the segment cm/s are all competing and popping in and out"). Three roots, each in the labels' solver:
// (1) the solve ahead for the other view (stage-view.js atTargetStage) asked whether the stent had settled with the vessels at that view's widths and so
// restarted the live stent's settling clock: the cm/s labels went for 1.2 s and came back, every few seconds, for as long as the slide stood; it also wrote
// the live column's side and moved the live "60 %". (2) Every solve on a slide (no pan before it) placed every label afresh, so a near tie between two
// spots flipped a callout there and back as a value, a vessel's width, the probe or a card moved; a scene's solves now keep their slots once it has settled,
// and a slide's mark keeps its spot while that spot is free. (3) The stent's own dimension words (waist length, mm per section) were not obstacles.
// Each slide is the real stage booted in node (label-hold-run.mjs) on the test clock, in a process of its own; a solve is asked every few frames.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';

const run = (o) => new Promise((ok, no) => execFile(process.execPath, [new URL('./label-hold-run.mjs', import.meta.url).pathname, JSON.stringify(o)], { encoding: 'utf8', maxBuffer: 1 << 24 }, (err, out) => {
  const line = out && out.split('\n').find((l) => l.startsWith('HOLD'));
  return line ? ok(JSON.parse(line.slice(4))) : no(err || new Error('no record: ' + out));
}));
// Each label once it has come in: how often it went, and how often it jumped more than 6 px (a spot change; the model's easing moves it a pixel or two).
const judge = (name, { rec, over }, want) => {
  for (const k of want) assert.ok(Object.keys(rec).some((key) => (key === k || (k === 'focus' && key.startsWith('focus'))) && rec[key].some((r) => r[3])), `${name}: ${k} is shown (${Object.keys(rec).join(' ')})`);
  for (const [k, rows] of Object.entries(rec)) {
    const from = rows.findIndex((r) => r[3]);
    if (from < 0) continue;
    const gone = [], jumps = [];
    for (let i = from + 1; i < rows.length; i++) {
      const [f, x, y, a] = rows[i], p = rows[i - 1];
      if (!a && p[3]) gone.push(f);
      if (a && p[3] && Math.hypot(x - p[1], y - p[2]) > 6) jumps.push(`${f}: (${p[1]}, ${p[2]}) to (${x}, ${y})`);
    }
    assert.deepEqual(gone, [], `${name}: ${k} went at frames ${gone.join(', ')} while the slide stood`);
    assert.deepEqual(jumps, [], `${name}: ${k} changed spot while the slide stood`);
  }
  assert.deepEqual(over, [], `${name}: a label covers the stent's dimension words`);
};

test('a TIPS slide\'s callout and the stent\'s cm/s labels hold their spots and never go while the slide stands', async () => {
  const STENOSIS = { edges: ['TIPS'], label: 'Stenosis', seg: 'site' }, COVERED = { edges: ['TIPS'], label: 'Covered stent', kind: 'treat' };
  const [a, b, c] = await Promise.all([run({ size: 'mac', mark: STENOSIS, points: true }), run({ size: 'iphone', mark: COVERED, points: true }), run({ size: 'mac', mark: COVERED, points: false })]);
  const PTS = ['n:TIPS:proximal', 'n:TIPS:mid', 'n:TIPS:distal'];
  judge('Mac, Stenosis, three points', a, ['focus', ...PTS]);
  judge('iPhone, Covered stent, three points', b, ['focus', ...PTS]);
  judge('Mac, Covered stent, one reading', c, ['focus']);
});
