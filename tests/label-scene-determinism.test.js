// The Anatomy's station labels are the same every time the same patient is opened, and the portal vein's is always among them (play-test, 16 Nov 2026:
// Anatomy, Healthy, 1280 × 800, no clicks; the page reloaded four times named other stations each time, "PV 8.1" missing on three loads, "HA" floating
// without its leader; and in every disease patient checked the PV label was left out, the same station dropped by the rule that keeps a label off a vessel).
// Two roots, both in the solver (stage-label-solve.js): (1) a label with no clear spot beside its vessel was left out, the portal vein's too; the portal
// vein, the HVPG pair and the hepatic artery, the stations the patient flags and every station at the All level now stand farther out on a leader instead
// (`must`); (2) a solve read the slots, widths, leaders and hidden marks of the solves before it, so the labels depended on when the page was solved and
// by what route; the first solve of a scene (a load, a patient, a view, a stage size) reads none (`fresh`), and a solve ahead for the other view no longer
// writes the live view's marks. Each page is the real stage booted in node (label-scene-run.mjs), in a process of its own: the stage keeps module state.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';

// (the patients the play-test named, healthy, and the one with the narrowed cava)
const ALL = ['healthy', 'csph', 'cirr-decomp', 'ivc-web', 'pvt-acute', 'svt', 'schisto', 'cirr-comp', 'psvd'];
const open = (o) => new Promise((ok, no) => execFile(process.execPath, [new URL('./label-scene-run.mjs', import.meta.url).pathname, JSON.stringify(o)], { encoding: 'utf8', maxBuffer: 1 << 24 }, (err, out) => {
  const line = out && out.split('\n').find((l) => l.startsWith('LAID'));
  return line ? ok(JSON.parse(line.slice(4))) : no(err || new Error('no labels: ' + out));
}));
const names = (laid) => laid.map((it) => it.key).sort().join(' ');
const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) <= 4);   // (a few px: the vessels' widths ease with the model)
// The stations in a second box on a different route: same names, and the main ones in the same place, to the pixel the model's own easing moves them.
const same = (id, a, b, what) => {
  assert.equal(names(b), names(a), `${id}: the labels shown ${what}`);
  for (const k of ['n:CONF', 'n:HA', 'n:SIN_R', 'n:RHV']) {
    const x = a.find((it) => it.key === k), y = b.find((it) => it.key === k);
    assert.ok(near(x.box, y.box), `${id}: ${k} stands at ${x.box} on one route and ${y.box} ${what}`);
    assert.equal(y.leader, x.leader, `${id}: ${k} has its leader on one route and not ${what}`);
  }
};

test('the portal vein, the hepatic artery and the HVPG pair are shown, with a number, in every patient; and the same however the page got there', async () => {
  // (Each patient alone on a page of its own, twice, the second with more frames and a solve asked every few: the labels are the same. A patient opened
  // after another would still have that one's vessel widths easing, which is the figure, not the labels.)
  const [a, all, h1, h2, c1, c2] = await Promise.all([open({ presets: ALL, base: 30 }), open({ presets: ['csph'], level: 'all' }),
    open({ presets: ['healthy'] }), open({ presets: ['healthy'], frames: 23, solves: true }), open({ presets: ['csph'] }), open({ presets: ['csph'], frames: 31, solves: true })]);
  for (const id of ALL) {
    const keys = a[id].map((it) => it.key);
    for (const k of ['n:CONF', 'n:HA', 'n:SIN_R', 'n:RHV']) assert.ok(keys.includes(k), `${id}: ${k} is shown (${keys.join(' ')})`);
    for (const k of ['n:CONF', 'n:SIN_R', 'n:RHV']) { const it = a[id].find((o) => o.key === k); assert.match(it.text, /\d/, `${id}: "${it.text}" carries its number`); }
  }
  same('healthy', h1.healthy, h2.healthy, 'after more frames and solves on the way');
  same('csph', c1.csph, c2.csph, 'after more frames and solves on the way');
  // (at the All level every station is asked for; a narrowing's two stations are flagged at the Key level)
  for (const k of ['n:CONF', 'n:SIN_R', 'n:RHV', 'n:IVCS', 'n:IVCI', 'n:RA', 'n:SV', 'n:SMV']) assert.ok(all.csph.some((it) => it.key === k), `All level, CSPH: ${k} is shown (${names(all.csph)})`);
  for (const k of ['n:IVCS', 'n:RA']) assert.ok(a['ivc-web'].some((it) => it.key === k), `IVC web: ${k} is shown (${names(a['ivc-web'])})`);
});
