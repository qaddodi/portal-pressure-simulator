// The terminal model command (scripts/model-cli.mjs, docs/model-cli.md): it runs the app's own step chain, so its numbers are the app's,
// and it refuses a typo or an out-of-range value instead of silently ignoring it.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { main, parseArgs, patchOf, actionsOf } from '../scripts/model-cli.mjs';
import { PRESETS } from '../src/engine/scenario.js';
import { SNAPSHOTS } from '../src/ui/snapshots.js';
import { HVPG_CUTS, hvpgWord, NOT_MEASURABLE } from '../src/engine/pressure-cuts.js';
import { DECKS, withOverview } from '../src/ui/decks.js';

const run = async (...argv) => { let out = ''; await main(argv, (s) => { out += `${s}\n`; }); return out; };
const json = async (...argv) => JSON.parse(await run(...argv, '--json'));

test('shortcuts become the parameter patch the engine takes', () => {
  const patch = patchOf(parseArgs(['--carvedilol', '--tips', '10', '--dips', '--albumin', '3', '--set', 'fibrosis.R.sin=3', '--params', '{"cirrhosis":0.7}']));
  assert.deepEqual(patch.drugs, { carvedilol: true });
  assert.deepEqual(patch.tips, { on: true, d: 10 });
  assert.deepEqual(patch.dips, { on: true, d: 8 });
  assert.equal(patch.albumin, 3);
  assert.equal(patch.fibrosis.R.sin, 3);
  assert.equal(patch.cirrhosis, 0.7);
  assert.deepEqual(actionsOf(parseArgs(['--band', '--paracentesis', '2000'])), [{ kind: 'band' }, { kind: 'paracentesis', mL: 2000, albumin: true }]);
});

test('a typo, an out-of-range value and an unknown preset are refused with a message', async () => {
  await assert.rejects(run('--preset', 'csph', '--set', 'cirhosis=0.5'), /no parameter "cirhosis"/);
  await assert.rejects(run('--preset', 'csph', '--set', 'cirrhosis=7'), /outside what the model accepts/);
  await assert.rejects(run('--preset', 'csph', '--set', 'thrombus.NOT_A_VESSEL=1'), /not a vessel/);
  await assert.rejects(run('--preset', 'cirhosis'), /No preset/);
  await assert.rejects(run('--preset', 'csph', '--compare'), /needs a change/);
  await assert.rejects(run('--bogus'), /Unknown option/);
  await assert.rejects(run('--preset', 'csph', '--days', '-3'), /whole number of days/);
});

test('each preset prints the numbers Home shows for it (src/ui/snapshots.js)', async () => {
  for (const p of PRESETS) {
    const { after } = await json('--preset', p.id), want = SNAPSHOTS[p.id].fp;
    assert.ok(Math.abs(after.fingerprint.pv - want.pv) < 0.15, `${p.id}: portal vein ${after.fingerprint.pv} against ${want.pv}`);
    assert.ok(Math.abs(after.fingerprint.hvpg - want.hvpg) < 0.15, `${p.id}: HVPG ${after.fingerprint.hvpg} against ${want.hvpg}`);
  }
});

test('--compare puts the preset as loaded beside the treated state, and the words come from pressure-cuts.js', async () => {
  const j = await json('--preset', 'cirr-decomp', '--carvedilol', '--days', '30', '--compare');
  assert.ok(j.after.fingerprint.hvpg < j.before.fingerprint.hvpg, 'carvedilol lowers the HVPG');
  assert.ok(j.change.hvpg < 0 && Math.abs(j.change.hvpg - (j.after.fingerprint.hvpg - j.before.fingerprint.hvpg)) < 0.15);
  assert.ok(j.before.fingerprint.hvpg >= HVPG_CUTS.red && j.before.readout.hvpg.status === 'danger');
  assert.equal(j.before.readout.hvpg.word, hvpgWord(j.before.fingerprint.hvpg, true));
  assert.deepEqual(j.input.params, { drugs: { carvedilol: true } });
  assert.equal(j.input.days, 30);
});

test('a TIPS lowers the portal gradient, and the same command twice prints the same numbers', async () => {
  const a = await json('--preset', 'cirr-decomp', '--tips', '8');
  const b = await json('--preset', 'cirr-decomp', '--tips', '8');
  assert.deepEqual(a, b);
  assert.ok(a.after.fingerprint.ppg < (await json('--preset', 'cirr-decomp')).after.fingerprint.ppg - 3);
});

test('the HVPG of a clotted hepatic vein reads Not measurable, as the app shows it', async () => {
  const j = await json('--preset', 'budd-chiari');
  assert.equal(j.after.readout.hvpg.measurable, false);
  assert.match(await run('--preset', 'budd-chiari'), new RegExp(NOT_MEASURABLE));
});

test('the text report names the groups an agent reads', async () => {
  const t = await run('--preset', 'cirr-decomp');
  for (const w of ['Pressures', 'HVPG', 'PPG (PV − IVC)', 'Portal flow', 'Shunted past the liver', 'Ascites', 'Varix wall stress', 'Liver (LSM)', 'MAP', 'Cut-offs']) assert.ok(t.includes(w), w);
});

test('--deck prints a slide as the presenter numbers it (slide 1 is the outline)', async () => {
  const d = DECKS.find((x) => x.id === 'hvpg'), shown = withOverview(d);
  const j = await json('--deck', 'hvpg');
  assert.equal(j.slides.length, shown.slides.length);
  assert.equal(j.slides[1].id, shown.slides[1].id);
  const one = await json('--deck', 'hvpg', '--slide', '2');
  assert.equal(one.slides.length, 1);
  assert.equal(one.slides[0].fingerprint.hvpg, j.slides[1].fingerprint.hvpg);
  await assert.rejects(run('--deck', 'hvpg', '--slide', '999'), /has slides 1 to/);
});

test('--list names every preset and deck, and the command exits 2 on a bad option', () => {
  const ok = spawnSync(process.execPath, ['scripts/model-cli.mjs', '--list', '--json'], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  const l = JSON.parse(ok.stdout);
  assert.deepEqual(l.presets.map((p) => p.id), PRESETS.map((p) => p.id));
  assert.deepEqual(l.decks.map((d) => d.id), DECKS.map((d) => d.id));
  const bad = spawnSync(process.execPath, ['scripts/model-cli.mjs', '--preset', 'nope'], { encoding: 'utf8' });
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /No preset "nope"/);
});
