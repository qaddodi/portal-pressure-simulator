// The liver's lymph (16 Nov 2026, Mohammad: "fix the model"): in cirrhosis hepatic and thoracic duct lymph rise many times over, and ascites is what
// is made beyond what the lymphatics can carry. The lymph must rise with the sinusoidal pressure, never fall below a healthy liver's, level off at the
// lymphatics' capacity (what they carry) and keep rising as formation beyond it (ascites); the belly's pressure is only a small brake, and the
// ascites must never run away. (In the Ascites talk the liver's lymph fell below the CSPH slide's once ascites formed: 2.2 then 1.8 mL/min.)
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/engine.js';
import { LYMPH, tissueP, sinusoidPull, hepLymphOf, pushOfHepLymph } from '../src/engine/lymph.js';
import { DECKS } from '../src/ui/decks.js';
import { deckStates } from './deck-states.js';
import { runPatient } from '../src/engine/inverse-run.js';

const healthy = (() => { const e = new Engine(); e.loadPreset('healthy'); return e.starling(true).hep; })();

test('formation rises with the sinusoidal pressure at every albumin and wall, and never falls below the healthy rate', () => {
  for (const alb of [2, 2.8, 4]) for (const sig of [0.1, 0.35, 0.6]) {
    let last = -Infinity;
    for (let p = 0; p <= 40; p += 0.5) {
      const j = hepLymphOf(p - tissueP(5), sinusoidPull(alb, sig));
      assert.ok(j >= last - 1e-12, `albumin ${alb}, sigma ${sig}: falls at ${p} mmHg`);
      assert.ok(j >= LYMPH.hepBase, 'never below the healthy floor');
      last = j;
    }
    assert.ok(last > 10 * LYMPH.hepBase, 'and many times the floor at a high pressure');
  }
});

test('the push read back from a lymph rate is the one that made it', () => {
  for (const out of [8, 15, 25]) { const pull = sinusoidPull(2.8, 0.5), j = hepLymphOf(out, pull); assert.ok(Math.abs(pushOfHepLymph(j, pull) - out) < 1e-9); }
});

test('the belly\'s pressure is a small brake up to tense ascites (20 mmHg) and a whole one past it, and continuous', () => {
  let last = tissueP(5);
  assert.equal(last, 5);
  for (let iap = 5.1; iap <= 40; iap += 0.1) {
    const t = tissueP(iap), slope = (t - last) / 0.1;
    assert.ok(slope > 0.55 - 1e-6 && slope < 1 + 1e-6, `slope ${slope} at ${iap}`);
    if (iap > 20.15) assert.ok(Math.abs(slope - 1) < 1e-6, 'past tense ascites the tissue takes the whole rise');
    last = t;
  }
});

test('what the lymphatics carry levels off at their capacity, and their capacity at its most', () => {
  for (const id of ['healthy', 'csph', 'cirr-decomp', 'budd-chiari', 'rhf']) {
    const e = new Engine(); e.loadPreset(id);
    const st = e.starling(true);
    assert.ok(Math.abs(st.carried - Math.min(st.made, e.slow.lymphCap)) < 1e-12, `${id}: carried is the made up to capacity`);
    assert.ok(Math.abs(st.excess - Math.max(0, st.made - e.slow.lymphCap)) < 1e-12, `${id}: the rest is the overflow`);
    assert.ok(e.slow.lymphCap <= LYMPH.max + 1e-9 && e.slow.lymphCap >= LYMPH.base - 1e-9, `${id}: capacity between healthy and its most`);
    assert.ok(st.hep >= LYMPH.hepBase, `${id}: never below the healthy floor`);
  }
});

test('cirrhosis makes many times a healthy liver\'s lymph, more as it decompensates, and never less once ascites forms', () => {
  const at = (id) => { const e = new Engine(); e.loadPreset(id); return e.starling(true); };
  const csph = at('csph'), dec = at('cirr-decomp');
  assert.ok(csph.hep > 4 * healthy, `CSPH ${csph.hep} against healthy ${healthy}`);
  assert.ok(dec.hep > csph.hep, 'decompensated above CSPH');
  assert.ok(dec.carried * 1440 > 8000, `the lymphatics carry over 8 L/day in decompensated cirrhosis (${Math.round(dec.carried * 1440)})`);
});

test('in the Ascites talk the liver\'s lymph never falls as the disease advances, and stays far above healthy with tense ascites', async () => {
  const d = DECKS.find((x) => x.id === 'ascites'), fps = await deckStates(d), by = (id) => fps[d.slides.findIndex((s) => s.id === id)];
  const lymph = by('lymph'), fill = by('fill'), over = by('overrun'), tense = by('tense');
  assert.ok(fill.hepLymph > lymph.hepLymph && over.hepLymph >= lymph.hepLymph, `CSPH ${lymph.hepLymph}, two months on ${fill.hepLymph}`);
  assert.ok(over.lymphOver > 0 && over.hepLymph + over.splLymph > over.lymphCap, 'the overrun slide makes more than the lymphatics carry');
  assert.ok(over.lymphCap / healthy > 5, 'and they carry many times the healthy flow');
  assert.ok(tense.hepLymph > 5 * healthy, `tense ascites: ${tense.hepLymph}`);
});

test('ascites never runs away: congested and cirrhotic patients settle below the model\'s ceiling', () => {
  for (const [f, p] of [['rhf', { rhf: 0.8 }], ['rhf', { rhf: 0.95 }], ['sinus+rhf', { sinus: 0.4, rhf: 0.8 }], ['sinus+constr', { sinus: 0.4, constr: 0.8 }], ['sinus', { sinus: 0.9 }]]) {
    const r = runPatient(f, p);
    assert.ok(r.asc < 14000, `${f} ${JSON.stringify(p)}: ${r.asc} mL`);
  }
});
