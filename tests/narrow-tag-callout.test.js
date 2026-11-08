// The "Narrowing" tag on a stent (the slide's mark, seg 'site'; Mohammad, 8 Nov 2026: "the word narrowing is on top of the stent; should
// be callout and avoid the vessels"). It had no spot of its own: the stent's narrowing arrows ring its site, and a leader starting inside
// their box passed no check, so every spot was refused and the tag stood on the stent and the hepatic vein with no leader. It is a callout
// now, as a step's is: its words 6 px off every vessel, on a leader that is drawn, on a Mac, an iPad and an iPhone.
// The TIPS stent at 60 % in its distal third, the liver framed as the Doppler slide frames it, one stage per process.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bootGL, pump } from './stage-gl-boot.js';

const SIZES = { mac: [1200, 800, 1, false], ipad: [820, 1180, 2, true], iphone: [395, 859, 3, true] };
const size = SIZES[process.env.NARROW_SIZE || 'mac'];

test(`the Narrowing tag stands off every vessel, on a leader (${process.env.NARROW_SIZE || 'mac'})`, async () => {
  const [w, h, dpr, coarse] = size;
  const { st, page } = await bootGL({ w, h, dpr, coarse });
  const { store } = await import('../src/ui/store.js');
  const { createCore } = await import('../src/worker-core.js');
  const { REGIONS } = await import('../src/ui/decks.js');
  const tasks = () => new Promise((r) => setImmediate(r));
  let q = [];
  const core = createCore((m) => { if (m.type === 'frame') q.push(m); });
  await core.handle({ type: 'init' });
  await core.handle({ type: 'preset', id: 'cirr-decomp' });
  const P = JSON.parse(JSON.stringify(core.engine().params));
  Object.assign(P, { tips: { on: true, d: 9 }, splanchnicTone: 0.7, habrStrength: 1.5, apShunt: 0.5, stenosis: { TIPS: 0.6 } });
  await core.handle({ type: 'setParams', params: P, settle: true });
  await core.handle({ type: 'run', running: true });
  let lastF = null;
  const step = async () => { pump(16.7); const f = q.at(-1); q = []; if (f) lastF = f; if (lastF) st.update(lastF); await tasks(); await tasks(); };
  page.document.querySelector('.app')?.style.setProperty('--pz-b', coarse ? '260px' : '0px');
  const marks = [{ edges: ['TIPS'], label: 'Narrowing', kind: 'block', free: false, seg: 'site' }];
  store.set({ presenting: true, presentLabels: ['LPV'], presentTerms: null, params: P, dopGate: 'site', focus: { ...marks[0], marks } });
  st.setView?.('anatomy');
  st.frameBox(REGIONS.liver, 800, 3.2, false, {});
  st.pinDoppler('PVH_L');
  for (let i = 0; i < 260; i++) await step();
  const sn = st.labelSnapshot(), V = st.labelVessels();
  const d = sn.items.find((x) => /^focus/.test(x.key));
  assert.ok(d && d.a > 0.9, 'the tag is shown');
  const b = [d.x - 8, d.y - 4, d.x + d.w + 8, d.y + d.h + 4];   // (its pill: the words and their padding)
  // How far each vessel (its half width taken off) is from the pill; below zero the pill is on it.
  const gapTo = (sg) => { let m = 1e9; for (let u = 0; u <= 1; u += 1 / 80) { const px = sg[0] + (sg[2] - sg[0]) * u, py = sg[1] + (sg[3] - sg[1]) * u; m = Math.min(m, Math.hypot(Math.max(b[0] - px, 0, px - b[2]), Math.max(b[1] - py, 0, py - b[3]))); } return m - sg[4]; };
  const near = [...new Set(V.segs.filter((sg) => gapTo(sg) < 6).map((sg) => sg[5]))];
  assert.deepEqual(near, [], 'the tag stands 6 px clear of every vessel, the stent and the hepatic veins included');
  const ax = d.px, ay = d.py, cx = Math.max(b[0], Math.min(ax, b[2])), cy = Math.max(b[1], Math.min(ay, b[3]));
  assert.ok(Math.hypot(cx - ax, cy - ay) > 12, 'a leader joins it to the site');
  assert.ok(!(ax > b[0] && ax < b[2] && ay > b[1] && ay < b[3]), 'its site is not under the words');
});
