// Every lumen a deck sets is on the lumen sliders' 0.5 mm step (17 Nov 2026, Mohammad: "0.5 mm steps too / For lumen"). The
// figures print a lumen on that step (stent-geom.js lumenShown), so a deck that set one between steps (the Doppler deck's 9 mm
// stent at 60 %, 3.6 mm) showed a label that disagreed with the model. Each slide's own state, as the presenter computes it, and
// each of its compare states: the end stenosis's lumen and the waist's, of the TIPS and the DIPS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import './dom-shim.js';
import { deckStates } from './deck-states.js';
import { LUMEN_STEP } from '../src/engine/portal/stent-geom.js';

const DIR = new URL('../src/ui/decks/', import.meta.url);
const onStep = (mm) => Math.abs(mm / LUMEN_STEP - Math.round(mm / LUMEN_STEP)) < 1e-3;
const STENTS = [['tips', 'TIPS'], ['dips', 'DIPS']];

test('every lumen a deck sets, a slide\'s or a compare state\'s, is on the 0.5 mm step', async () => {
  const bad = [];
  for (const f of readdirSync(DIR).filter((x) => x.endsWith('.js'))) {
    const d = Object.values(await import(new URL(f, DIR))).find((v) => Array.isArray(v?.slides));
    if (!d) continue;
    const fps = await deckStates(d);
    d.slides.forEach((s, i) => {
      const fp = fps[i] || {};
      for (const [k, id] of STENTS) {
        const dm = fp[`${k}D`];
        if (!(dm > 0)) continue;
        for (const [what, share] of [['stenosis', fp[`${k}Stn`]], ['waist', fp[`${k}Red`]]]) {
          if (share > 0.004 && share < 0.999 && !onStep(dm * (1 - share))) bad.push(`${f} ${s.id}: ${id} ${what} ${(dm * (1 - share)).toFixed(2)} mm of ${dm} mm`);
        }
        // (A compare state changes the slide's: its own diameter if it sets one, else the slide's.)
        for (const c of s.compare || []) {
          const p = c?.params;
          if (!p) continue;
          const dc = p[k]?.d ?? dm;
          for (const [what, share] of [['stenosis', p.stenosis?.[id]], ['waist', p.stentGeom?.[id]?.red]]) {
            if (share > 0.004 && share < 0.999 && !onStep(dc * (1 - share))) bad.push(`${f} ${s.id} "${c.label}": ${id} ${what} ${(dc * (1 - share)).toFixed(2)} mm of ${dc} mm`);
          }
        }
      }
    });
  }
  assert.deepEqual(bad, [], 'set each to the share that leaves a lumen on the step (stent-geom.js shareFor)');
});
