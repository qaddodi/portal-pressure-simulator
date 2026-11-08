// Animation recs item 1 (8 Nov 2026): the crossfade between the old and the new labels is made once. xfLayer used to write the #labels root's
// opacity, and label-gl multiplies every picture by that root's opacity (layer-alpha.js, LA) and then by xfOld / xfNew, so at the tap of a view
// change or a presenter's glide LA was 0 and the old labels that should ride at full were drawn at nothing, and the new ones at n squared.
// Now the fade is written on the layer's groups (the SVG's own copy of the labels), the root is left alone, and LA stays 1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { installPage } = await import('../scripts/warm/dom.mjs');
installPage();
globalThis.requestAnimationFrame = () => 1;
const { createView } = await import('../src/ui/stage-view.js');
const { createLayerAlpha } = await import('../src/ui/layer-alpha.js');
const { viewXfMix } = await import('../src/ui/view-xf.js');

const el = (parent = null) => { const e = document.createElement('div'); (parent || document.body).append(e); return e; };
const gcs = (e) => ({ opacity: e.style.opacity === '' ? '1' : e.style.opacity, visibility: 'visible', display: 'block' });

function rig(progress, landAt) {
  const root = el(), gLabels = el(root), gLeaders = el(root);
  const log = [];
  const live = {
    viewXf: { t0: 0, tT: 1, pending: false, landAt }, morph: progress, morphTarget: 1, easeInOut: (t) => t,
    labelSvg: root, gLabels, gLeaders, xfOp: '', labelGL: { crossfade(o, n) { log.push({ o, n }); }, check() { log.push('check'); } },
  };
  const st = { refreshCTM() {}, stageBox: () => ({ width: 100, height: 100 }), EV: [], geo: {}, circTurn: () => ({ on: false }) };
  const v = createView(st, live);
  return { v, live, root, gLabels, gLeaders, log };
}

test('a crossfade step leaves the #labels root alone: the layer alpha stays 1 and the GPU fades are the only ones', () => {
  for (const p of [0.55, 0.75, 0.9]) {
    const { v, root, gLabels, gLeaders, log } = rig(p, 0);
    v.viewXfStep();
    const n = viewXfMix(p, 0).n, o = viewXfMix(p, 0).o;
    assert.equal(root.style.opacity, '', 'the root is untouched');
    const laObj = createLayerAlpha(root, { gcs }), la = laObj.now();
    laObj.dispose();
    assert.equal(la, 1, 'LA is 1');
    const last = log.filter((x) => x !== 'check').pop();
    assert.ok(Math.abs(la * last.n - n) < 1e-9, 'LA x xfNew = n');
    assert.ok(Math.abs(la * last.o - o) < 1e-9, 'LA x xfOld = 1 - n');
    assert.ok(Math.abs((gLabels.style.opacity === '' ? 1 : +gLabels.style.opacity) - n) < 1e-3, 'the SVG copy of the labels comes in with the new ones');
    assert.equal(gLeaders.style.opacity, gLabels.style.opacity);
  }
});

test('at the tap (the old labels at full, the new at nothing) the old labels are not drawn at nothing', () => {
  const { v, root, log } = rig(0, 0);
  v.viewXfStep(true);
  const laObj = createLayerAlpha(root, { gcs });
  assert.equal(laObj.now(), 1);
  laObj.dispose();
  const last = log.filter((x) => x !== 'check').pop();
  assert.deepEqual(last, { o: 1, n: 0 }, 'the old labels ride at full, as view-xf.js says: never a frame with no labels on the figure');
});

test('no writer of the change or of a presenter\'s glide fades the #labels root', () => {
  for (const f of ['stage-view.js', 'glide-labels.js']) {
    const src = readFileSync(new URL(`../src/ui/${f}`, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /labelSvg\.style\.opacity/, f);
  }
});
