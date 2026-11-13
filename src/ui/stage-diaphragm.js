// The diaphragm and the organs' step: the dome over the liver, fundus and spleen, the liver's ease, and updateOrgans.
// (moved out of stage.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)
import { SPLEEN_CENTER } from './anatomy.js';
import { pressureColor } from './colormap.js';
import { diaphragmD, diaphragmLine } from './diaphragm.js';
import { heldBin } from './idle-keys.js';
import { fluidTarget } from './fluid-step.js';
import { gpuProbe } from './gpu-probe.js';
import { liverShrink, smooth01 } from './liver-morph.js';
import { reduceMotionMQ as reduceMotion } from './motion.js';
import { easeTo } from './organ-ease.js';
import { measurePath } from './shape-gl.js';
import { store } from './store.js';
import { clamp } from './util.js';

export function createDiaphragm(st, live) {
  const { EI, NI, abdTo, caud, diaCut, drawAscites, findingHidden, gBackdrop, hidePlate, liveOn, liverTint, lv, morphLiver, normalSync, organEls, organG, platePoke, putA, recruitFrac, spleenMv, syncOrganMasks, syncSelFluid, syncSelLine } = st;
  // The diaphragm is drawn around the organs it covers, the way a plate shows it: one smooth dome a
  // little above the liver, the fundus and the spleen, bridging the dips between them, and down the
  // flanks on both sides (where diaMask fades it out). It runs along the top of their current outlines,
  // pushed out a few units, so it follows a shrunken or congested liver and an enlarged spleen as they
  // ease, and never crosses an organ; the heart rests on it.
  const diaEls = gBackdrop.querySelectorAll('.org-diaphragm');
  // Just under the heart's base, column by column (or far above, beside it), for the diaphragm the heart rests on.
  let heartBase = null;
  function heartFloor(x) {
    if (!heartBase) {
      heartBase = new Map();
      for (const [hx, hy] of outlinePts(diaCut.heart.getAttribute('d'), diaCut.heart)) {
        const i = Math.round(hx / 4);
        if (hy > (heartBase.get(i) ?? -Infinity)) heartBase.set(i, hy);
      }
      // (A column the outline's samples skipped, or caught only on its upper side, takes its neighbours' base: no notch.)
      const ks = [...heartBase.keys()].sort((p, q) => p - q);
      for (let k = ks[0]; k <= ks.at(-1); k++) {
        const l = heartBase.get(k - 1), r = heartBase.get(k + 1), v = heartBase.get(k);
        if (l != null && r != null && (v == null || v < Math.min(l, r) - 6)) heartBase.set(k, (l + r) / 2);
      }
    }
    const i = x / 4, a = heartBase.get(Math.floor(i)), b = heartBase.get(Math.ceil(i));
    return a == null || b == null ? -Infinity : a + (b - a) * (i - Math.floor(i)) + 3.5;
  }
  // An outline's points: a polyline's own (the diseased liver), else sampled once along the curve.
  const outlineCache = new Map();
  function outlinePts(d, el) {
    if (!/[CQSAcqsa]/.test(d)) { const n = d.match(/-?\d+(\.\d+)?/g).map(Number); return n.flatMap((v, i) => (i % 2 ? [] : [[v, n[i + 1]]])); }
    if (!outlineCache.has(d)) {
      const mp = measurePath(d), out = [];   // (in script: no layout in the diaphragm's frame, 2 Nov 2026)
      for (let u = 0; u < mp.L; u += 4) out.push(mp.at(u));
      outlineCache.set(d, out);
    }
    return outlineCache.get(d);
  }
  const diaParts = [null, null, null], DIA_IDS = ['liver', 'spleen'];
  function diaphragmPath(shrink, sc) {
    const at = (P, cx, cy, k) => P.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]);
    // (The liver's smooth dome, never its nodular edge: the nodules stand out about 2 at most, inside the gap.)
    const liver = at(live.liverDome || outlinePts(diaCut.liver.getAttribute('d'), diaCut.liver), 560, 350, shrink);
    const stomach = outlinePts(diaCut.stomach.getAttribute('d'), diaCut.stomach);
    const spleen = at(outlinePts(diaCut.spleen.getAttribute('d'), diaCut.spleen), SPLEEN_CENTER[0], SPLEEN_CENTER[1], sc);
    // One smooth dome over them (diaphragm.js); the heart rests on it, just under its base.
    diaParts[0] = liver; diaParts[1] = stomach; diaParts[2] = spleen;
    return diaphragmD(diaphragmLine(diaParts, heartFloor));
  }
  function liftDiaphragm(shrink, sc) {
    // The spleen in steps of 1% (as the plate key reads it): the running model's slow drift must not
    // redraw the dome, and the plate with it, every frame. The gap absorbs the difference.
    const scQ = Math.round(sc * 100) / 100;
    const key = `${live.liverKey}|${shrink.toFixed(3)}|${scQ}`;
    if (key === live.diaKey) return;
    live.diaKey = key;
    for (const id of DIA_IDS) diaCut[id].setAttribute('transform', organG[id].getAttribute('transform') || '');
    const d = diaphragmPath(shrink, scQ);
    for (const el of diaEls) el.setAttribute('d', d);
  }
  // Targets that follow the running model's pressures move only in steps (with hysteresis), so a
  // pressure wavering with the cycle never keeps the liver easing, and its plate being dropped and
  // rasterized again, over and over.
  // An end (0 or 1) is reached at once but left only on a clear move, so a value hovering just
  // past an end never flips to it and back.
  const stepHeld = (prev, v, tol) => (prev === null || Math.abs(v - prev) > ((prev === 0 || prev === 1) ? 2 * tol : tol) || (v === 0 && prev !== 0) || (v === 1 && prev !== 1) ? v : prev);
  // The liver's shape (cirrhosis), congestion and tint, eased toward the patient over `dt` seconds: [cT, gT, tT], their targets.
  function easeLiver(f, p, dt) {
    // The heart-cycle-averaged pressures: the beat must not swing the liver's look.
    const PA = f.Pf || f.P;
    const psin = Math.max(PA[NI.SIN_R], PA[NI.SIN_L]);
    live.lvTT = stepHeld(live.lvTT, clamp((psin - 8) / 16, 0, 1), 0.1);
    const tT = live.isImaging() ? 0 : live.lvTT * 0.5;
    const hp = store.get().healthy?.P;
    const cvUp = hp ? Math.max(PA[NI.CV_R] - hp[NI.CV_R], PA[NI.CV_L] - hp[NI.CV_L]) : 0;
    // (The congestion's target from the venous pressure with the breath taken out (12 Nov 2026, his Mac at rest: the organ layer painted again twice a
    // second, "page changed: liver g.organ transform"): the beat-filtered pressure still breathes, about 0.4 mmHg in a congested liver, more than
    // the 0.3 mmHg the hold below allows, so the target flipped a step each breath, the liver eased to it and back, and its outline and scale were
    // written again over and over with nothing visible changing. Low-passed over BREATH_TAU first; a jump of a real change (a slide, a TIPS) is taken at once.)
    const gRaw = clamp((cvUp - 4) / 10, 0, 1), gNow = performance.now();
    if (gLow === null || Math.abs(gRaw - gLow) > G_JUMP) gLow = gRaw;
    else gLow += (gRaw - gLow) * -Math.expm1(-(gNow - gLowAt) / BREATH_TAU);
    gLowAt = gNow;
    live.lvGT = stepHeld(live.lvGT, gLow, 0.03);
    const cT = Math.min(1, p.cirrhosis), gT = live.lvGT;
    if (live.lvC === null || reduceMotion.matches || !live.figureShown) { live.lvC = cT; live.lvG = gT; live.lvT = tT; }   // under the loading screen nothing is seen easing
    else { live.lvC = easeTo(live.lvC, cT, dt); live.lvG = easeTo(live.lvG, gT, dt); live.lvT = easeTo(live.lvT, tT, dt); }
    live.lvAt = performance.now();
    lvTargets[0] = cT; lvTargets[1] = gT; lvTargets[2] = tT;
    return lvTargets;
  }
  const lvTargets = [0, 0, 0];   // (read at once by its callers)
  // (The congestion's breath-free pressure, easeLiver: low-passed over BREATH_TAU ms; a change past G_JUMP is taken whole.)
  const BREATH_TAU = 3000, G_JUMP = 0.12;
  let gLow = null, gLowAt = 0;
  // (What updateOrgans hands the probe's timed calls, kept: the calls are fixed functions that read these, so none is made in a frame.)
  let orgMoving = false, orgPA2 = null, orgShrink = 1, caudBin = NaN;
  let caputK = null;   // (the caput medusae's held share, updateOrgans)
  let pseEl = null;   // (the embolized spleen's infarct group, found once: stage.js detailFor)
  const orgMorphLiver = () => morphLiver(live.lvC, live.lvG, orgMoving);
  const orgCaudate = () => { caudBin = heldBin(caudBin, orgPA2[NI.IVCS] + 0.5); caud.sync(pressureColor(caudBin), live.caudK); };   // (the colour's bin held: a pressure breathing across a bin's edge must not flip the lobe's colour, and the organ layer with it)
  const orgMasks = () => syncOrganMasks(orgShrink, organG.spleen.getAttribute('transform'));
  const QUARTERS = ['0', '0.25', '0.5', '0.75', '1'];   // (String(n / 4) for n 0 … 4)
  // The congestion's shades stay hidden at no opacity (the glossy one aside), and all hide in the figure view.
  function lvShade(el, gloss, imaging) { const v = imaging || (el !== gloss && !(+el.style.opacity > 0)) ? 'hidden' : ''; if (el.style.visibility !== v) el.style.visibility = v; }
  function updateOrgans(f, p, t) {
    const k = 1 - t;
    const imaging = live.isImaging();
    const [cT, gT, tT] = easeLiver(f, p, Math.min(0.1, (performance.now() - live.lvAt) / 1000));
    // The congestion tint eases here, not by a CSS transition: the plate raster reads the value
    // it shows, and a fade in progress at that moment would be baked in (re-rastered over and
    // over, the tint flickered between mid-fade values).
    // (The congested liver takes the even dusk instead, so the tint's darker rim gives way to it as congestion comes in: organ
    // picks, 20 Oct.) It hands over across the same range the dusk comes in by (morphLiver: g / 0.5), so a slightly raised
    // pressure (after a TIPS) keeps some of the tint until the dusk is there to take its place.
    // (Not faded with the switch to the circuit: the organs' group fades it there, and a tint stepping down with the switch
    // changed the picture's key, so the organs' picture was drawn again every half second of the fade.)
    liverTint.style.opacity = (live.lvT * (1 - smooth01(live.lvG / 0.5))).toFixed(3);
    if (live.lvT !== tT) live.widthEasing = live.organsEasing = true;
    const moving = live.lvC !== cT || live.lvG !== gT;
    // While it eases, the live drawing shows (a raster would move in steps); the plate is
    // rasterized again once it settles.
    // A large change, or one still under way (a time-lapse), shows the live drawing. A small step
    // (the running model's congestion drifting a notch) eases under the plate and is rasterized once
    // it settles: swapping to the live drawing and back every few seconds would flash the organs.
    const retarget = live.lvMoving && (cT !== live.lvCT || gT !== live.lvGTo);
    live.lvCT = cT; live.lvGTo = gT;
    if (moving && (retarget || Math.max(Math.abs(cT - live.lvC), Math.abs(gT - live.lvG)) > 0.08) && live.veins && !live.veins.lost && live.veins.hasPlate(0) && !liveOn()) hidePlate();
    if (live.lvMoving && !moving) live.lvStillAt = performance.now();
    live.lvMoving = moving;
    if (moving) live.widthEasing = live.organsEasing = true;
    orgMoving = moving;
    gpuProbe.time(null, 'organs: liver', orgMorphLiver);
    // (The congestion's shades stay hidden at no opacity, as lvFade leaves them: showing them here undid lvFade on every liver frame, a
    // flip of the SVG's visibility each frame that also read the liver for the GPU again each time (motion budget, 2 Nov).)
    lvShade(lv.cong, lv.gloss, imaging); lvShade(lv.isl, lv.gloss, imaging); lvShade(lv.gloss, lv.gloss, imaging);
    // A cirrhotic liver shrinks a little; a congested one swells.
    const shrink = liverShrink(live.lvC, live.lvG);
    live.liverScale = shrink;
    const liverT = `translate(560 350) scale(${shrink.toFixed(4)}) translate(-560 -350)`;
    putA(organG.liver, 'transform', liverT);
    putA(organG.falciform, 'transform', liverT);   // (the falciform line goes with the liver, as its surface lines do)
    {
      // The caudate lobe grows as its veins carry the liver's outflow: from twice their normal flow, fully at four times.
      const hq = store.get().healthy?.Q?.[EI.CAUD], PA2 = f.Pf || f.P;
      live.caudK = stepHeld(live.caudK, hq ? clamp((Math.abs((f.Qf || f.Q)[EI.CAUD] / hq) - 2) / 2, 0, 1) : 0, 0.05);
      orgPA2 = PA2;
      caud.stented(!!p.dips?.on);
      gpuProbe.time(null, 'organs: caudate', orgCaudate);
    }
    // The caput medusae: one value for everything that belongs to it (the skin's tint around the navel, the navel's ring, the epigastric
    // veins and the paraumbilical vein, stage-frame edgeVisible and stage-tubes), from the vein's recruitment (0 closed, 1 as wide as it
    // grows): it starts at 15% and is whole at 45%, and a finding the view keeps hidden takes all of it away. Held in steps of 5%, so a
    // wobble in the model never moves it; the tint then eases to each new step (stage.js abdTo).
    caputK = stepHeld(caputK, findingHidden('coll') ? 0 : clamp((recruitFrac('C3', f) - 0.15) / 0.3, 0, 1), 0.05);
    abdTo((caputK * 0.9 * k).toFixed(2));
    // The navel is a landmark only for the paraumbilical vein that runs to it: with that vein closed, it was a lone ring
    // in the empty abdomen beside the gut (sweep batches 02–04). It fades in as the vein opens, as the caput's veins do, in
    // quarter steps (the organs' raster is drawn again at each step: plateStateKey).
    if (organEls.umbilicus) {
      const op = QUARTERS[Math.round(4 * caputK)];
      if (organEls.umbilicus.getAttribute('opacity') !== op) organEls.umbilicus.setAttribute('opacity', op);
    }
    const sc = f.slow.spleen / 11;
    normalSync(sc);
    // Growing, the plate (a picture of the organs at one size) gives way to the live drawing, which follows this size each frame.
    if (spleenMv.see(sc, performance.now()) && live.veins && !live.veins.lost && live.veins.hasPlate(0) && !liveOn()) hidePlate();
    putA(organG.spleen, 'transform', `translate(${SPLEEN_CENTER[0]} ${SPLEEN_CENTER[1]}) scale(${sc.toFixed(3)}) translate(${-SPLEEN_CENTER[0]} ${-SPLEEN_CENTER[1]})`);
    orgShrink = shrink;
    gpuProbe.time(null, 'organs: masks', orgMasks);
    if (organG.spleen.style.opacity !== (p.splenicRx === 2 ? '0.14' : '')) organG.spleen.style.opacity = p.splenicRx === 2 ? '0.14' : '';
    // Partial embolization: the infarcted lower part fades as the removed spleen does (anatomy.js SPLEEN_PSE_AREA; stage.js detailFor).
    // (An attribute the organ reading watches, so the live spleen is read again, and part of the plate's key: plateStateKey.)
    pseEl ??= organG.spleen.querySelector('.spleen-pse');
    if (pseEl && (pseEl.getAttribute('display') === 'none') !== (p.splenicRx !== 1)) { if (p.splenicRx === 1) pseEl.removeAttribute('display'); else pseEl.setAttribute('display', 'none'); }
    liftDiaphragm(shrink, sc);
    syncSelLine();
    // The shown ascites eases to the model's volume (stepFluid), so a tap or diuretics never pops the level.
    // (In steps of FLUID_STEP from the volume drawn: the model's trickle each update must not count as the fluid moving.)
    const asc = fluidTarget(live.ascTarget, f.slow.ascites);
    if (live.ascTarget === null) live.ascShown = asc;
    live.ascTarget = asc;
    gpuProbe.time(null, 'organs: fluid', drawAscites);
    syncSelFluid();
    gpuProbe.time(null, 'organs: plate poke', platePoke);
  }
  return { easeLiver, updateOrgans };
}
