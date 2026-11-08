// The tamponade tube and its balloons: the tube sliding down the esophagus, the gastric and esophageal balloons filling in order, and their draw.
// (moved out of stage.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)
import { gastricUp } from '../engine/scenario.js';
import { BALLOON, BALLOON_MS, balloonShape, esoAt, smoothPath } from './balloon-eso.js';
import { GAS, gasShape, pathAt, pullArrow, sheath, sheathArcs, tubePath, tubeTip, tubeTo } from './balloon-gas.js';
import { easeMove } from './motion.js';
import { restPass } from './rest-pass.js';
import { s } from './util.js';

import { stageScope } from './stage-scope.js';
export function createBalloon(st, live) {
  const { ov } = st;
  // The tamponade tube goes in and its balloons fill in order, each eased: the tube slides down the esophagus and into the stomach (adv),
  // its gastric balloon fills there and the tube is drawn up so the balloon seats against the cardia (gas, the traction in its second
  // half), and only then the esophageal balloon fills (eso). Let down, the reverse: the esophageal balloon first, then the gastric one,
  // then the tube comes out. Drawn again every frame while any of them moves. (The esophageal balloon is only ever filled on a tube
  // whose gastric balloon is up: gastricUp, scenario.js.)
  const bal = { adv: 0, gas: 0, eso: 0, last: 0, wantGas: false, wantEso: false, anat: true, dirty: true };
  const BAL_ADV_MS = BALLOON_MS.adv, BAL_INF_MS = BALLOON_MS.inflate, BAL_ESO_MS = BALLOON_MS.eso;
  const balEase = easeMove;   // (the one inflation curve, procedure balloons' too: motion.js)
  // (The tube's fit to the stomach is worked out once, in a few milliseconds: ahead of its first use, while the page is idle.)
  (typeof requestIdleCallback === 'function' ? (f) => requestIdleCallback(f, { timeout: 5000 }) : (f) => stageScope.timer(f, 3000))(() => { tubePath(); });
  function balloonStep(p, anat) {
    const now = performance.now(), dt = Math.min(100, bal.last ? now - bal.last : 0);
    bal.last = now;
    const wantEso = !!p.balloonEso && anat, wantGas = gastricUp(p) && anat;
    if (wantGas !== bal.wantGas || wantEso !== bal.wantEso) { bal.wantGas = wantGas; bal.wantEso = wantEso; bal.dirty = true; }
    const was0 = bal.adv, was1 = bal.gas, was2 = bal.eso, out = dt / 0.6;   // (out quicker than in)
    if (wantEso) { if (bal.gas >= 1) bal.eso = Math.min(1, bal.eso + dt / BAL_ESO_MS); }
    else bal.eso = Math.max(0, bal.eso - out / BAL_ESO_MS * 1.5);
    if (wantGas) { if (bal.adv >= 1) bal.gas = Math.min(1, bal.gas + dt / BAL_INF_MS); }
    else if (bal.eso <= 0) bal.gas = Math.max(0, bal.gas - out / BAL_INF_MS * 1.5);
    if (wantGas) bal.adv = Math.min(1, bal.adv + dt / BAL_ADV_MS);
    else if (bal.gas <= 0) bal.adv = Math.max(0, bal.adv - out / BAL_ADV_MS * 1.5);
    if (bal.adv !== was0 || bal.gas !== was1 || bal.eso !== was2) bal.dirty = true;
    bal.anat = anat;
    live.balloonSqueeze = 1 - 0.45 * balEase(bal.eso);
    if (bal.dirty) { bal.dirty = false; balloonDraw(anat); }
  }
  // The balloons' drawing is built between frames, from the state it finds then (the last ask wins).
  let balloonAnat = false, balloonAsked = false;
  function balloonDraw(anat) {
    balloonAnat = anat;
    if (!balloonAsked) { balloonAsked = true; restPass(balloonCommit); }
  }
  function balloonCommit() {
    balloonAsked = false;
    const anat = balloonAnat;
    ov.balloons.innerHTML = '';
    if (!anat || bal.adv <= 0) return;
    // Drawn as the HVPG catheter's wedge balloon is (veins-gl.js mode 5): cream latex, clear in the middle and denser toward
    // the rim, a thin warm edge, a soft round highlight up top; on the white tube with its dark rim and the esophageal balloon's two marker bands.
    // Plain translucent fills stacked as rings (no SVG gradients: on the iPhone a gradient in the other SVG's defs left
    // only the outline once the balloon was up), so the latex reads the same at every step of the inflation.
    const RINGS = [[1, 'balloon-latex'], [0.86, 'balloon-latex-rim'], [0.7, 'balloon-latex-rim']];
    const hi = (cx, cy, rx, ry, k, turn = 0) => {
      const g = s('g', { class: 'balloon-hi', opacity: Math.min(1, (k - 0.3) / 0.4).toFixed(3) });
      if (turn) g.setAttribute('transform', `rotate(${turn.toFixed(1)} ${cx.toFixed(2)} ${cy.toFixed(2)})`);
      for (const f of [1, 0.66, 0.36]) g.append(s('ellipse', { cx, cy, rx: rx * f, ry: ry * f }));
      return g;
    };
    const adv = balEase(bal.adv), kG = balEase(bal.gas), kE = balEase(bal.eso);
    // (The traction is the gastric balloon's second half: drawn up as it fills, seated when it is full.)
    const pull = balEase(Math.min(1, Math.max(0, (bal.gas - 0.45) / 0.55)));
    const path = tubePath(), tip = tubeTip(adv, pull, path), arcs = sheathArcs(tip, path);
    const shaft = smoothPath(tubeTo(adv, pull, path));
    ov.balloons.append(s('path', { d: shaft, class: 'balloon-shaft-rim' }), s('path', { d: shaft, class: 'balloon-shaft' }));
    // A balloon, whole: the latex over all of it, then two rims (the outline less narrower copies of it), denser toward the edge, then its edge.
    const latex = (ring, narrow) => {
      const d = smoothPath(ring, true);
      ov.balloons.append(s('path', { d, class: RINGS[0][1] }));
      for (const [f, cls] of RINGS.slice(1)) ov.balloons.append(s('path', { d: d + ' ' + smoothPath(narrow(f), true), class: cls }));
      ov.balloons.append(s('path', { d, class: 'balloon-edge' }));
    };
    // The gastric balloon, the first step: collapsed on the tube it rides in with it, then a pear on the tube's axis, its cone drawn up into the
    // cardia, as wide as the stomach's outline leaves room for, and pressed on by the junction where it meets it (its shoulder gives against the roof).
    if (kG > 0.001) {
      const gs = gasShape(kG, pull);
      latex(gs.outline, gs.ring);
      if (kG > 0.3) {
        // (The highlight on the upper side of the shoulder, along the axis, as the esophageal balloon's is up its length.)
        const [dx, dy] = gs.dir, u = 0.42, w = gs.half(u), cx = gs.p0[0] + dx * u * gs.L + dy * 0.4 * w, cy = gs.p0[1] + dy * u * gs.L - dx * 0.4 * w;
        ov.balloons.append(hi(cx, cy, gs.b * 0.34, gs.b * 0.17, kG, (Math.atan2(dy, dx) * 180) / Math.PI));
      }
    } else {
      const sg = sheath(arcs.gas[0], arcs.gas[1], () => GAS.neck, path);
      if (sg) latex(sg.ring, sg.narrow);
    }
    // The esophageal balloon, the second step: collapsed on the tube until the gastric balloon is up, then filled.
    const per = (arcs.eso[1] - arcs.eso[0]) / (BALLOON.bottom - BALLOON.top), bands = [3, BALLOON.bottom - BALLOON.top - 3].map((o) => arcs.eso[0] + o * per);
    if (kE > 0.001) {
      const sh = balloonShape(kE);
      const ering = (f) => sh.outline.map(([x, y]) => { const c = esoAt(y).c; return [c + (x - c) * f, y]; });
      latex(sh.outline, ering);
      const y = BALLOON.top + 14, h = sh.half(y);
      if (kE > 0.3) ov.balloons.append(hi(esoAt(y).c - h * 0.22, y, h * 0.34, h * 0.5, kE));
    } else {
      const se = sheath(arcs.eso[0], arcs.eso[1], (t) => Math.max(BALLOON.shaftR, BALLOON.sleeve * Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 2))), path);
      if (se) latex(se.ring, se.narrow);
    }
    // The two marker bands, on the tube at the esophageal balloon's ends.
    for (const sb of bands) {
      if (sb < 0 || sb > path.total) continue;
      const { p, t } = pathAt(sb, path), turn = (Math.atan2(t[1], t[0]) * 180) / Math.PI - 90;
      // (A path, not a rect with rounded corners, which the GPU's reader does not take: it sent the tube and every overlay above it back to the SVG.)
      const x0 = p[0] - BALLOON.shaftR - 0.3, x1 = p[0] + BALLOON.shaftR + 0.3, y0 = p[1] - 0.5, y1 = p[1] + 0.5, r = 0.3, f = (v) => v.toFixed(2);
      const d = `M${f(x0 + r)} ${f(y0)}H${f(x1 - r)}Q${f(x1)} ${f(y0)} ${f(x1)} ${f(y0 + r)}V${f(y1 - r)}Q${f(x1)} ${f(y1)} ${f(x1 - r)} ${f(y1)}H${f(x0 + r)}Q${f(x0)} ${f(y1)} ${f(x0)} ${f(y1 - r)}V${f(y0 + r)}Q${f(x0)} ${f(y0)} ${f(x0 + r)} ${f(y0)}Z`;
      ov.balloons.append(s('path', { d, class: 'balloon-marker', transform: `rotate(${turn.toFixed(1)} ${p[0].toFixed(2)} ${p[1].toFixed(2)})` }));
    }
    // The traction, shown as the tube is drawn up: an arrow up the esophagus's side, easing in with it.
    if (pull > 0.01) {
      const ar = pullArrow(), g = s('g', { class: 'balloon-pull', opacity: pull.toFixed(3) });
      g.append(s('path', { d: smoothPath(ar.line), class: 'balloon-pull-line' }), s('path', { d: `M${ar.head.map((q) => q.map((v) => v.toFixed(2)).join(' ')).join('L')}Z`, class: 'balloon-pull-head' }));
      ov.balloons.append(g);
    }
  }
  return { bal, balloonDraw, balloonStep };
}
