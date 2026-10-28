// Blood loss gives the vital signs of the ATLS hemorrhage classes (ATLS 10th ed., 2018): under 15 % lost the
// pressure and pulse barely change, 15–30 % speeds the heart with the pressure held, 30–40 % brings hypotension,
// over 40 % is severe shock. Cirrhosis has less reserve and a blunted heart rate, and a beta-blocker blunts it more.
// The slides that show a bleed must say what their numbers do.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { Engine } from '../src/engine/engine.js';
import { computeMetrics } from '../src/engine/metrics.js';
import { createCore } from '../src/worker-core.js';

/** MAP, heart rate and shock class after an instant loss of mL, settled (the reflexes have caught up). */
function after(preset, mL, { carvedilol = false } = {}) {
  const e = new Engine(); e.loadPreset(preset);
  if (carvedilol) { e.params.drugs.carvedilol = true; e.settle(); }
  const hr0 = e.hr, map0 = computeMetrics(e).map;
  e.hemorrhage(mL); e.settle();
  const m = computeMetrics(e);
  return { map: m.map, hr: m.hr, co: m.co, shock: m.blood.shock, lossPct: m.blood.lossPct, hr0, map0, e };
}

test('healthy: the ATLS classes at 500, 1000, 1500, 2000 and 2500 mL', () => {
  const at = Object.fromEntries([500, 1000, 1500, 2000, 2500].map((v) => [v, after('healthy', v)]));
  const msg = (v) => `${v} mL: MAP ${at[v].map.toFixed(0)}, HR ${at[v].hr.toFixed(0)}`;
  // Class I (10 %): almost nothing changes.
  assert.ok(at[500].map >= 88 && at[500].hr <= 80, msg(500));
  assert.equal(at[500].shock, 1);
  // Class II (20 %): a faster heart, the pressure held.
  assert.ok(at[1000].map >= 84 && at[1000].hr >= 85 && at[1000].hr <= 110, msg(1000));
  assert.equal(at[1000].shock, 2);
  // Class III (30 %): the pressure starts to fall, the heart rate over 100.
  assert.ok(at[1500].map >= 70 && at[1500].map <= 84 && at[1500].hr >= 105 && at[1500].hr <= 140, msg(1500));
  assert.equal(at[1500].shock, 3);
  // Class IV (40 %): hypotension and a heart rate over 140.
  assert.ok(at[2000].map >= 50 && at[2000].map <= 70 && at[2000].hr >= 140, msg(2000));
  assert.equal(at[2000].shock, 4);
  // Half the volume: collapse.
  assert.ok(at[2500].map < 45, msg(2500));
  // The pressure never rises with the loss, and falls faster the more is lost.
  for (const [a, b] of [[500, 1000], [1000, 1500], [1500, 2000], [2000, 2500]]) assert.ok(at[b].map < at[a].map && at[b].hr >= at[a].hr, `${msg(a)} → ${msg(b)}`);
});

test('a 500 mL bleed is not shock: no circulatory collapse, pressure within a few mmHg', () => {
  for (const p of ['healthy', 'cirr-comp', 'csph', 'cirr-decomp', 'cirr-hepatofugal', 'gastric-varix']) {
    const r = after(p, 500);
    assert.ok(r.map0 - r.map < 7 && r.co > 3, `${p}: MAP ${r.map0.toFixed(0)} → ${r.map.toFixed(0)}, CO ${r.co.toFixed(1)}`);
  }
});

test('decompensated cirrhosis has less reserve, and its heart rate stays under the healthy maximum', () => {
  for (const v of [1000, 1500, 2000]) {
    const h = after('healthy', v), c = after('cirr-decomp', v);
    assert.ok(c.map < h.map, `${v} mL: cirrhosis MAP ${c.map.toFixed(0)} vs healthy ${h.map.toFixed(0)}`);
  }
  // (A litre from a decompensated patient: class II, the pressure lower but not shock. Measured from the patient's own
  // pressure, which the hyperdynamic circulation holds in the low 80s (22 Oct), not from a healthy 93: no more than 13 mmHg
  // down, and never under the 65 mmHg that calls for stopping the beta-blocker, Baveno VIII 4.6.)
  const c = after('cirr-decomp', 1000);
  assert.ok(c.map >= c.map0 - 13 && c.map > 65 && c.hr - c.hr0 >= 20 && c.hr <= 140, `1000 mL: MAP ${c.map0.toFixed(0)} → ${c.map.toFixed(0)}, HR ${c.hr0.toFixed(0)} → ${c.hr.toFixed(0)}`);
});

test('carvedilol blunts the rise in heart rate, not the fall in pressure', () => {
  for (const p of ['healthy', 'cirr-decomp']) {
    const off = after(p, 1500), on = after(p, 1500, { carvedilol: true });
    assert.ok(on.hr - on.hr0 < 0.5 * (off.hr - off.hr0), `${p}: rise ${(on.hr - on.hr0).toFixed(0)} on carvedilol vs ${(off.hr - off.hr0).toFixed(0)}`);
    assert.ok(on.map < on.map0 - 5, `${p} on carvedilol: MAP ${on.map0.toFixed(0)} → ${on.map.toFixed(0)}`);
  }
});

test('the venous reservoir gives its blood back as the volume is replaced, and blood is conserved', () => {
  const { e } = after('healthy', 1500);
  const shifted = e.blood.shift;
  assert.ok(shifted > 600, `reservoir moved ${shifted.toFixed(0)} mL`);
  assert.ok(Math.abs(e.bloodVolume() - 3500) < 1, `blood volume ${e.bloodVolume().toFixed(1)} counts the loss, not the reservoir`);
  e.addVolume(1500, 0.42); e.settle();
  assert.ok(e.blood.shift < 20, `reservoir after refilling: ${e.blood.shift.toFixed(0)} mL`);
  const m = computeMetrics(e);
  assert.ok(Math.abs(m.map - 93) < 3 && Math.abs(m.hr - 60) < 4, `refilled: MAP ${m.map.toFixed(0)}, HR ${m.hr.toFixed(0)}`);
});

test('a snapshot carries the reflex state, and an older snapshot without it restores as the patient\'s own volume', () => {
  const { e } = after('cirr-decomp', 1000);
  const m0 = computeMetrics(e), snap = e.snapshot();
  const r = new Engine(); r.restore(snap); r.settle();
  assert.ok(Math.abs(computeMetrics(r).map - m0.map) < 0.5 && Math.abs(r.hr - m0.hr) < 1);
  const old = structuredClone(snap); delete old.blood.ref; delete old.blood.shift; delete old.blood.inf0;
  const o = new Engine(); o.restore(old); o.settle();
  assert.ok(Number.isFinite(computeMetrics(o).map) && Number.isFinite(o.hr) && o.volumeDeficit() < 1);
});

test('chronic plasma expansion is the patient\'s own volume: no reflex and no loss at baseline', () => {
  for (const p of ['cirr-decomp', 'budd-chiari', 'rhf', 'ivc-web']) {
    const e = new Engine(); e.loadPreset(p);
    const m = computeMetrics(e);
    assert.ok(e.volumeDeficit() < 1 && e.blood.shift < 1 && Math.abs(m.blood.lossPct) < 0.5, `${p}: deficit ${e.volumeDeficit().toFixed(0)}, loss ${m.blood.lossPct.toFixed(1)} %`);
  }
});

// ───────────── slide words against slide numbers ─────────────

const DIR = new URL('../src/ui/decks/', import.meta.url);
const MODEL = ['preset', 'presetDays', 'params', 'action', 'days'];
const changes = (s) => MODEL.some((k) => s[k]);

/** Each slide's fingerprint plus its blood (lost, ref) as the presenter computes the deck. */
async function deckStates(d) {
  const out = [];
  const core = createCore((m) => { if (m.type === 'seqStep') out[m.i] = { ...m.fp, lossPct: (100 * m.snap.blood.lost) / m.snap.blood.ref }; });
  const steps = d.slides.map((s) => (changes(s) ? { preset: s.preset, presetDays: s.presetDays, params: s.params, action: s.action, days: s.days, ramp: s.ramp, fine: !!s.lapse } : {}));
  core.handle({ type: 'run', running: false });
  await core.handle({ type: 'sequence', steps, reqId: 1 });
  core.dispose();
  let last = out[0];
  return d.slides.map((s, i) => (last = changes(s) || i === 0 ? out[i] : last));
}

// The vital signs a bleed moves: "falls to {map}" means lower than the slide before, "up to {map}" higher.
// ("is back to" names no direction.)
const DOWN = /\b(?:falls|fallen|falling|drops|dropped|eases|down)(?: only)?(?: back)? to \{(map|hr)\}/gi;
const UP = /\b(?:rises|risen|climbs|comes|up)(?: back)? to \{(map|hr)\}/gi;

test('every "falls to {map}" or "up to {map}" in a slide line moves that way from the slide before', async () => {
  const bad = [];
  for (const f of readdirSync(DIR).filter((x) => x.endsWith('.js'))) {
    const d = Object.values(await import(new URL(f, DIR))).find((v) => Array.isArray(v?.slides));
    if (!d.slides.some((s) => /to \{(map|hr)\}/.test(s.line || ''))) continue;
    const fps = await deckStates(d);
    d.slides.forEach((s, i) => {
      if (!i || !s.line) return;
      const now = fps[i], prev = fps[i - 1];
      for (const [re, dir] of [[DOWN, -1], [UP, 1]]) for (const [, k] of s.line.matchAll(re)) {
        if (!Number.isFinite(now[k]) || !Number.isFinite(prev[k])) continue;
        if (Math.sign(now[k] - prev[k]) !== dir) bad.push(`${d.id}/${s.id}: ${k} ${prev[k].toFixed(1)} → ${now[k].toFixed(1)} vs "${s.line}"`);
      }
    });
  }
  assert.deepEqual(bad, []);
});

test('the bleed decks: shock is a class II loss with a fast heart, and the pressure holds early', async () => {
  const { BLEED } = await import('../src/ui/decks/variceal-bleed.js');
  const fps = await deckStates(BLEED), at = Object.fromEntries(BLEED.slides.map((s, i) => [s.id, fps[i]]));
  // The tear: "the heart rate usually rises first … blood pressure is still normal".
  // ("still normal": within 6 mmHg of this patient's own pressure, in the low 80s since the hyperdynamic reset of 22 Oct.)
  assert.ok(at.tear.hr > at.before.hr + 5 && at.tear.map >= at.before.map - 6, `tear: HR ${at.tear.hr.toFixed(0)}, MAP ${at.before.map.toFixed(0)} → ${at.tear.map.toFixed(0)}`);
  // "Shock before anemia": class II or worse, a heart rate over 100, the hemoglobin unchanged.
  assert.ok(at.minutes.lossPct >= 15 && at.minutes.hr > 100 && at.minutes.map < at.tear.map, `minutes: ${at.minutes.lossPct.toFixed(0)} % lost, HR ${at.minutes.hr.toFixed(0)}, MAP ${at.minutes.map.toFixed(0)}`);
  assert.ok(Math.abs(at.minutes.hb - at.before.hb) < 0.5);
  // Never a pressure that only a dying patient has, while the slides speak of a circulation to restore.
  for (const s of BLEED.slides) assert.ok(at[s.id].map > 60, `${s.id}: MAP ${at[s.id].map.toFixed(0)}`);
  // Banding comes "as soon as the blood pressure holds": no lower than the unit before it.
  assert.ok(at.band.map >= at.blood.map, `band ${at.band.map.toFixed(0)} vs blood ${at.blood.map.toFixed(0)}`);

});
