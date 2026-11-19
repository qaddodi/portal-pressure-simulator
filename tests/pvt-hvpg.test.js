// Portal vein thrombosis and the HVPG, as in patients (Mohammad, 16 Nov 2026: "PVT HVPG: what's the answer? Figure it out! In real life").
// The answer the model and every deck keep: the clot is prehepatic, so the WHVP reflects only the sinusoids and the HVPG never rises with it;
// the HVPG underestimates the portal pressure whenever a clot is present (EASL 2025 vascular liver diseases). Without cirrhosis the HVPG stays
// normal however high the portal pressure. In cirrhosis a partial clot, the usual one, leaves the HVPG nearly unchanged; an occlusive clot
// lowers it, because less portal blood reaches the sinusoids (Rao, J Dig Dis 2023;24:284: in 356 patients with cirrhosis and recent variceal
// bleeding, the HVPG was lower with advanced PVT, while grade III varices were more common). Text that says a clot lowers the HVPG therefore
// belongs to a deck whose clot is occlusive and says so.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/portal/engine.js';
import { computeMetrics } from '../src/engine/portal/metrics.js';
import { HVPG_CUTS } from '../src/engine/portal/pressure-cuts.js';
import { DECKS } from '../src/ui/decks.js';
import { strings } from '../scripts/clinical-wording.mjs';

const after = (preset, clot, days = 90) => {
  const e = new Engine();
  e.loadPreset(preset);
  const base = computeMetrics(e);
  e.setParams({ ...e.params, thrombus: { PV_TRUNK: clot } }); e.settle();
  e.advanceDays(days, { noRupture: true, silent: true }); e.settle();
  return { base, clot: computeMetrics(e) };
};

test('without cirrhosis a portal vein clot raises the PPG and leaves the HVPG normal', () => {
  for (const c of [0.6, 1]) {
    const { base, clot } = after('healthy', c);
    assert.ok(clot.hvpg < HVPG_CUTS.amber, `clot ${c}: HVPG ${clot.hvpg} stays normal`);
    assert.ok(clot.ppg > base.ppg + 3, `clot ${c}: PPG rises (${base.ppg} to ${clot.ppg})`);
  }
});

test('in cirrhosis a partial clot leaves the HVPG nearly unchanged and an occlusive one lowers it; neither raises it', () => {
  const part = after('csph', 0.5), occl = after('csph', 1);
  assert.ok(Math.abs(part.clot.hvpg - part.base.hvpg) < 1.2, `partial: HVPG ${part.base.hvpg} to ${part.clot.hvpg}`);
  assert.ok(part.clot.ppg > part.base.ppg, `partial: PPG rises (${part.base.ppg} to ${part.clot.ppg})`);
  assert.ok(occl.base.hvpg - occl.clot.hvpg > 1.5, `occlusive: HVPG falls (${occl.base.hvpg} to ${occl.clot.hvpg})`);
  assert.ok(occl.clot.ppg > occl.base.ppg + 3, `occlusive: PPG rises (${occl.base.ppg} to ${occl.clot.ppg})`);
  for (const preset of ['healthy', 'csph']) for (const c of [0.3, 0.6, 0.85, 1]) for (const days of [0, 90]) {
    const { base, clot } = after(preset, c, days);
    assert.ok(clot.hvpg <= base.hvpg + 0.3, `${preset}, clot ${c}, day ${days}: the HVPG never rises (${base.hvpg} to ${clot.hvpg})`);
  }
});

const CLOT = /\b(?:clot|thromb\w*|PVT)\b/i;
const LOWERS = /\b(?:lowers?|lowered|lowering)\s+(?:the\s+)?HVPG\b|\bHVPG\s+(?:falls|fell|drops|is lower)\b|\blower HVPG\b/i;
// (a statement, not a question, and not negated: "A clot never raises the HVPG" is the rule itself)
const RAISES = /\b(?:clot|thromb\w*|PVT)\b(?:(?!\b(?:never|not|no)\b)[^.;?])*\b(?:raises|raised)\s+(?:the PPG and\s+)?(?:the\s+)?HVPG\b/i;
const occlusiveIn = (d) => d.slides.some((s) => (s.params?.thrombus?.PV_TRUNK ?? 0) >= 0.85);

test('the claim finders catch what they are for', () => {
  assert.ok(RAISES.test('A portal vein clot raises the HVPG.') && RAISES.test('The thrombus raised the PPG and the HVPG.'));
  for (const t of ['A clot never raises the HVPG.', 'Will partial PVT raise the HVPG, the PPG or both?', 'The clot raises the PPG and lowers the HVPG.']) assert.ok(!RAISES.test(t), t);
  assert.ok(LOWERS.test('The clot raises the PPG and lowers the HVPG.') && LOWERS.test('with a lower HVPG than before'));
});

test('a deck says a clot lowers the HVPG only when its clot is occlusive and it says so; no deck says a clot raises it', () => {
  const bad = [];
  for (const d of DECKS) {
    const all = [...strings(d)], text = all.map(([, s]) => s).join('\n');
    for (const [path, s] of all) {
      if (RAISES.test(s)) bad.push(`${d.id}.${path}: a clot never raises the HVPG: "${s.slice(0, 120)}"`);
      if (CLOT.test(s) && LOWERS.test(s) && !(occlusiveIn(d) && /\bocclusive\b/i.test(text))) bad.push(`${d.id}.${path}: only an occlusive clot lowers the HVPG: "${s.slice(0, 120)}"`);
    }
  }
  assert.deepEqual(bad, []);
});
