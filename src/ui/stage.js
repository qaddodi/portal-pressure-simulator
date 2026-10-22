// Anatomical stage (blueprint §6): the figure drawn on the GPU (plate, vessels, moving blood),
// over an SVG scene that holds the organ artwork, hit targets and overlays, and screen-space labels.

import { EDGES, dopplerK, NODES, PORTAL_TERRITORY, dMinOf, edgePresent, isOccluded, SHUNT_PORTAL, SHUNT_SYSTEMIC, customShuntId, isStent, stentSite, STENT_SITES, STENT_SPANS, stentGate, stentSegments } from '../engine/topology.js?v=4044766e96';
import { route as metroRoute, RECTUM_FADE, LABEL_VESSEL, TIP_FADE, TIP_CONNECT, VIEW, VB_ANAT, VB_CIRC, ATLAS_COLUMNS, HIDDEN_EDGES, HIDDEN_NODES, ANAT_HIDDEN, ANAT_HIDDEN_NODES, CAUDATE, CONTEXT_EDGES, BACK_EDGES, IVC_EDGES, NEEDS_C3, NODE_POS, EDGE_PATH, CIRCUIT_PATH, metroPath, ORGANS, SEAM_D, ORGAN_DETAIL, BACKDROP, LIVER_INNER, LIVER_EDGES, LANE_CAPTIONS, ABDOMEN_CLIP, ABDOMEN_FLOOR, flankPath, abdomenOutline, cavityHalfWidths, SPLEEN_CENTER, SITES, ORGAN_LABELS, ATLAS_LABELS, SHORT, ABBR, CHIP_NODES, LIVER_SPLIT_X, CIRCUIT_ZONES, CIRCUIT_LABELS, STRANDS, STRAND_FROM, SIN_EDGES, FEEDERS, fanFeeders, CIRCUIT_TREES } from './anatomy.js?v=1f28084c15';
import { pressureColor, deltaColor, dropColor, flowColor, heatColor, velColorOf, velocityColor, oxygenColor } from './colormap.js?v=287019881f';
import { forkJoins, sideEndScale } from './fork-joins.js?v=20a032142f';
import { nodeEnds, nodeDrawn, dotRadius, bareDots } from './circuit-nodes.js?v=1040ba0ec4';
import { STATION_VESSEL, meanVel, velNormal, judgeFlow } from './velNormal.js?v=97920ddf3f';
import { store, updateParams, varicesPresent, varixGrowth, shownVel } from './store.js?v=67f4341802';
import { fibroReading } from './clock.js?v=6a1f89a5c2';
import { s, h, fmt, fmtFlow, fp, clamp, lerp, toast, systemEdge, bloodColors, restBox, translateRest, settledBox, putText, UPRIGHT_MQ } from './util.js?v=be12b8e102';
import { riseCentre } from './rise-path.js?v=c039cb7b49';
import { sinceSource } from './since-ref.js?v=ef1a818c75';
import { clipBox, mapBox } from './fit-box.js?v=d5d6d4c60f';
import { runFlick, FLICK } from './flick.js?v=9602697f46';
import { inlineStyles } from './svg-inline.js?v=fc17cb73fe';
import { fluidTarget, poolFade } from './fluid-step.js?v=2742314765';
import { easeTo, fluidSpring, fluidSpringFor } from './organ-ease.js?v=4ebb648131';
import { spleenMotion } from './spleen-motion.js?v=4e87db0dbb';
import { subpathsIn, foldOpacity, dropInvisible, mergeClipRuns, boxOutside, paintBox, maskRegionIn, maskSlot, fillMaskHead, pruneDefs } from './plate-copy.js?v=0b5acb0928';
import { gridHits, segHitsBox } from './seg-hits.js?v=e7cde76929';
import { glassCallout } from './callout.js?v=d5524b6a11';
import { TEXT_MIN, TEXT_MAX, rolePx, roleOf } from './type-scale.js?v=d7cca3fb73';
import { seeded, strHash, nodularSites, nodularCells } from './liver-geo.js?v=977185f80a';
import { diaphragmLine, diaphragmD } from './diaphragm.js?v=8012ab6b28';
import { CIRR, smooth01, liverField, liverShrink, outlineNormals, contourNodules, morphOutline, fix1 } from './liver-morph.js?v=6eac699aa9';
import { LIVER_GEO } from './liver-geo-data.js?v=41a20a25ac';
import { COLON_ART, BOWEL_ART, DUO_CLIPS, DUO_A, DUO_B } from './organ-art.js?v=a1c08582e2';
import { warmVisible, ringGrid, inGrid } from './warm-vis.js?v=ccf4f6f71b';
import { createRouter } from './circuit-router.js?v=0ee9e02fc6';
import { gpuProbe } from './gpu-probe.js?v=e82dc07b45';
import { plateStrips, premultiply, gutStep, viewReuse, copyPixels } from './plate-upload.js?v=5fc45556a1';
import { cropToGrid } from './organs-gl.js?v=eb7a83e544';
import { readGroup } from './organ-paint.js?v=7bcc7ef138';
import { createVeinsGL, binVeins, TUBE_TEXELS, FLOW_TEXELS, MAX_TIERS, F_DIFFUSE, F_SHADOW, F_DOTTED, F_NOCASE, F_SPEC, F_VEIL, ORIGIN_GREY } from './veins-gl.js?v=86fb02065e';
import { varixBead, beadRadius } from './varix-bead.js?v=ac0e84fd89';
import { advanceStream, createReversalHold, bleedShapes, stepBleedFade, fadeBleedShapes, chevFlowLevel, keyChevron, KEY_CHEV_LANES, originFractions, oxygenFor, ORIGIN_N, createBolus, DYE_BINS, KAPPA, STASIS_MIN_D, HIDDEN_SECONDS } from './blood.js?v=e668d01823';
import { frameFor, cancelFrame, noteDraw, setSaver as setFrameSaver, paceMs } from './frame.js?v=19b3f2915c';
import { softwareYield } from './sw-yield.js?v=e580a095b1';
import { portalSplit } from './table-marks.js?v=15f059172f';
import { hashSeed, clotSide, clotSpan, clotRadius, clotShift, clotLayers, CLOT_EDGE } from './clot-shape.js?v=415ba6b9c0';
import { leaderEnd as edgeOf, leaderEndRects as edgeOfRects } from './leader-end.js?v=8e884700ab';
import { balloonRy, balloonOutline, routeRadii } from './hvpg-balloon.js?v=35d7bb162c';
import { outlineBox, placeSummary } from './cath-place.js?v=b5835a19ca';
import { layoutWatch } from './idle-keys.js?v=4b46e6a6ef';
import { writeGlowTexels } from './glow-texels.js?v=e578794a92';
import { SIN_PERFUSION, sinStrandRadius } from './sin-perfusion.js?v=25a8407fdd';
import { wavePacks, paintWave } from './scan-waves.js?v=066db7aa38';
import { fitPose, probeShapes, beamBoxes, gateBoxes, awayFromProbe, createProbeMind, NONE_MS, SLACK, PROBE, PROBE_SVG } from './dop-probe.js?v=333917e0dc';
import { pathPieces, piecesLength, pointsAlong } from './path-pieces.js?v=e486672c9b';
import { organDimMatrix } from './organ-dim.js?v=7888276613';
import { parseColor, greyOf, paintRef } from './organ-grey.js?v=e41d68222c';
import { bandRing, dashRings, liftEnd, normalShown, rippleList, systemOf, SYSTEM_COLOR } from './highlight-math.js?v=e2c1816e25';
import { organAnchor, spleenCaliper, acrossVessel, stepGroups, spanOf, spanPath, zoneBand, SPAN_TICK, insideBy, clearOf, besideLine } from './callout-math.js?v=d92ff7722e';
const nextFrame = frameFor('stage');

const N_SAMPLES = 64;
// Shorter circuit zone titles, tried in turn when the full one is wider than its zone.
const ZONE_SHORT = { 'Splanchnic beds': ['Gut & spleen'], 'Liver · sinusoids': ['Liver'], 'Portal veins': ['Portal'], 'Hepatic veins · IVC': ['Hep. veins · IVC', 'Outflow'] };   // never a second "IVC" beside the IVC's own label
// Displayed width grows sub-linearly with diameter so the cavae don't swamp the portal tree,
// while distension of small veins and collaterals stays visible.
// Drawn caliber (px) for a vessel diameter. The 1.3 lifts the baseline so the veins read at a
// glance; the dilation of disease still scales on top of it.
const CALIBER = 1.3;
const vesselPx = (D) => CALIBER * Math.max(2.6, 2.0 * Math.pow(Math.max(0.1, D), 0.72));
// Only the vessels that tell the portal story are drawn (see anatomy.js).
const ALL_EDGES = EDGES.filter((e) => e.kind !== 'wedge' && !HIDDEN_EDGES.has(e.id));
const EI = Object.fromEntries(EDGES.map((e, i) => [e.id, i]));
const NI = Object.fromEntries(NODES.map((n, i) => [n.id, i]));
const REVERSAL_WATCH = new Set(['PV_TRUNK', 'SV_CONF', 'SMV_CONF', 'LGV_CONF', 'PVH_R', 'PVH_L', 'PRE_R', 'PRE_L', 'V_SPL', 'SV_MID', 'V_IMV', 'V_INT', 'RHV_IVC', 'MHV_IVC', 'LHV_IVC', 'V_STO', 'IVC_IS']);

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
// Relative luminance of an 'rgb(r,g,b)' string (non-rgb strings count as dark).
function luminance(c) {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c || '');
  if (!m) return 0;
  const [r, g, b] = [m[1], m[2], m[3]].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function createStage({ wrap, onSelect, onAction, onOpenTab, onHoverInfo, onViewChange }) {
  // (#30) The stage's styles, as the model's frames read them (colours, the plate's theme, whether the figure shows): read live, each
  // read made the browser bring its styles up to date in the middle of the frame. They are read once and kept until something that
  // can change them happens: a class, style or theme attribute on the stage or any element above it, the system's light or dark
  // setting, a resize, or a new text size.
  // (A settings change reaches its listeners only at the next frame: a read between, from a timer or an idle moment, checks them itself.)
  let csSnap = null, csMq = null;
  // A class list less the classes a pan or pinch puts on and takes off, which change no colour or look the stage draws.
  const gestureFree = (c) => (c || '').replace(/(?:^|\s)(?:panning|stage-busy|figure-focus)(?=\s|$)/g, '');
  const MQ = ['(prefers-color-scheme: dark)', '(prefers-reduced-motion: reduce)', '(prefers-reduced-transparency: reduce)', '(hover: hover)', '(pointer: coarse)', 'print'].map((q) => matchMedia(q));
  function wrapCS() {
    if (csSnap && MQ.some((q, i) => q.matches !== csMq[i])) csSnap = null;
    if (!csSnap) {
      csMq = MQ.map((q) => q.matches);
      const live = getComputedStyle(wrap), m = new Map();
      csSnap = { getPropertyValue: (n) => { let v = m.get(n); if (v === undefined) m.set(n, (v = live.getPropertyValue(n))); return v; } };
    }
    return csSnap;
  }
  {
    const drop = () => { csSnap = null; };
    // (Not for the classes of a gesture alone: panning (the cursor), stage-busy (the menus' fade) and figure-focus (the phone's
    // top bar and dock) set no colour the stage reads. Dropped, the snapshot forced a style pass and a whole vessel sync as a
    // pan began, as it ended and again as the menus faded back in, 0.6 s after (Mohammad, 21 Oct: "still lag after i pan or zoom").)
    const seen = new Map();
    const mo = new MutationObserver((recs) => {
      for (const r of recs) {
        if (r.attributeName === 'class') { const c = gestureFree(r.target.getAttribute('class')); if (seen.get(r.target) === c) continue; seen.set(r.target, c); }
        drop(); return;
      }
    });
    for (let el = wrap; el; el = el.parentElement) { seen.set(el, gestureFree(el.getAttribute('class'))); mo.observe(el, { attributes: true, attributeFilter: ['class', 'style', 'hidden', 'data-theme', 'data-noglass', 'data-mode'] }); }
    // (The settings the style sheets ask about; the sizes come with a resize, as does a turn of the device or a page zoom.)
    for (const q of MQ) q.addEventListener?.('change', drop);
    addEventListener('resize', drop); addEventListener('orientationchange', drop); addEventListener('pps:labelscale', drop);
    addEventListener('beforeprint', drop); addEventListener('afterprint', drop);
  }
  const svg = wrap.querySelector('#stage');
  const stageWrap = wrap.closest('.stage-wrap') || wrap;
  // What the framing and the labels' card boxes measure, watched so they are read again only when one may have moved.
  const watch = layoutWatch();
  watch.addBox(wrap); watch.addBox(svg); watch.addNode(svg); watch.addNode(wrap);
  addEventListener('resize', watch.touch); addEventListener('pps:occ', watch.touch); addEventListener('pps:labelscale', watch.touch);
  document.addEventListener('visibilitychange', watch.touch);
  document.fonts?.addEventListener?.('loadingdone', watch.touch);
  for (const q of MQ) q.addEventListener?.('change', watch.touch);
  // (Not the model's frames, nor its parameters: a slide's time-lapse sets them several times a second for minutes, which kept the
  // cards' boxes read ten times a second through the slide; a card that grows with a new reading is seen by its own size watch.)
  store.on('*', (keys) => { if (keys.some((k) => k !== 'frame' && k !== 'params')) watch.touch(); });
  svg.setAttribute('viewBox', `0 0 ${VIEW.w} ${VIEW.h}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  // ── Geometry sampling ──────────────────────────────
  // A fresh element per course: Chromium can keep measuring a reused path's previous course after
  // its `d` changes (a straight segment after another), which drew the suprahepatic IVC over the
  // infrahepatic one and put the SVC out on the circuit's course.
  const scratchG = s('g');
  svg.append(scratchG);
  function sample(d) {
    const scratch = s('path', { d });
    scratchG.replaceChildren(scratch);
    const L = scratch.getTotalLength();
    const pts = [];
    for (let i = 0; i < N_SAMPLES; i++) {
      const p = scratch.getPointAtLength((L * i) / (N_SAMPLES - 1));
      pts.push([p.x, p.y]);
    }
    return pts;
  }
  // Real vessels are never ruler-straight: a gentle, low-frequency meander (a few units, fixed
  // per vessel) along each anatomic course, fading to zero at both ends so junctions stay put.
  function meander(pts, id) {
    let L = 0;
    const cum = [0];
    for (let i = 1; i < pts.length; i++) { L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); cum.push(L); }
    const amp = Math.min(4.5, L * 0.02);
    if (amp < 0.8) return pts;
    let hsh = 0;
    for (const c of id) hsh = (hsh * 31 + c.charCodeAt(0)) >>> 0;
    const ph = (hsh % 628) / 100, k = (Math.PI * 2 * (0.7 + (hsh % 5) * 0.12)) / L;
    return pts.map((p, i) => {
      if (i === 0 || i === pts.length - 1) return p;
      const a = pts[i - 1], b = pts[i + 1];
      let nx = -(b[1] - a[1]), ny = b[0] - a[0];
      const n = Math.hypot(nx, ny) || 1; nx /= n; ny /= n;
      const u = cum[i] / L;
      const o = amp * Math.sin(Math.PI * u) * (0.72 * Math.sin(k * cum[i] + ph) + 0.28 * Math.sin(2.3 * k * cum[i] + 2 * ph));
      return [p[0] + nx * o, p[1] + ny * o];
    });
  }
  const CIRC_SPINE_Y = 345;   // the circuit's main line runs along this row
  const defaultPath = (a, b, circuit) => (circuit ? metroPath(a, b) : `M${a[0]} ${a[1]} L ${b[0]} ${b[1]}`);
  // A custom shunt in the circuit is a bypass: a gentle arc bowing away from the spine (the main
  // portal → liver → heart line), so it crosses the lanes it meets instead of running along one.
  const bypassPath = ([x1, y1], [x2, y2]) => {
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, L = Math.hypot(x2 - x1, y2 - y1) || 1;
    let nx = -(y2 - y1) / L, ny = (x2 - x1) / L;
    const away = my < CIRC_SPINE_Y - 5 ? -1 : my > CIRC_SPINE_Y + 5 ? 1 : -1;
    if (Math.sign(ny || 1) !== away) { nx = -nx; ny = -ny; }
    const k = Math.max(0.28 * L, 40);
    return `M${x1} ${y1} Q ${(mx + nx * k).toFixed(1)} ${(my + ny * k).toFixed(1)} ${x2} ${y2}`;
  };
  const geo = {};
  for (const e of ALL_EDGES) {
    const a = NODE_POS[e.from], b = NODE_POS[e.to];
    const dA = EDGE_PATH[e.id] || defaultPath(a[0], b[0], false);
    const dC = CIRCUIT_PATH[e.id] || (e.shunt === 'custom' ? bypassPath(a[1], b[1]) : defaultPath(a[1], b[1], true));
    // A spontaneous shunt (gastrorenal, splenorenal) is one large vein, drawn like one.
    const A = (e.kind === 'collateral' && !e.spontaneous) || e.kind === 'shunt' ? sample(dA) : meander(sample(dA), e.id);
    geo[e.id] = { dA, dC, A, C: sample(dC), cur: null, len: 0, wig: 0 };
  }
  // Tributaries and feeders (anatomic only), sampled once, with a vein's gentle meander (a
  // feeder that is a collateral gets a serpentine instead).
  const feedGeo = {};
  // Veins that run on out of the plate fade out instead of ending: [y where the fade starts, y where
  // it is gone], downward for the rectal and epigastric veins and the infrarenal IVC, upward for the
  // SVC above the azygos arch (it leaves the top of the plate).
  // Veins that end on the faded IVC fade into it over their last stretch, so the join is seamless.
  const IVC_NODES = new Set(['IVCS', 'IVCI', 'RA']), IVC_JOIN_LEN = 60;
  // Solid to the wall, joined to the cava as a confluence: the hepatic and renal veins.
  const HEPATIC_VEINS = new Set(['RHV_IVC', 'MHV_IVC', 'LHV_IVC', 'LRV_IVC', 'RRV_IVC']);
  const IVC_JOIN = {};
  for (const e of ALL_EDGES) {
    if (IVC_EDGES.has(e.id) || HEPATIC_VEINS.has(e.id) || !IVC_NODES.has(e.to) || !NODE_POS[e.to] || !NODE_POS[e.from]) continue;
    // To where the drawn course actually ends (on the cava's wall), not to the node.
    const end = EDGE_PATH[e.id]?.match(/(-?[\d.]+)[ ,]+(-?[\d.]+)\s*$/);
    const [bx, by] = end ? [+end[1], +end[2]] : NODE_POS[e.to][0], [ax, ay] = NODE_POS[e.from][0], d = Math.hypot(bx - ax, by - ay) || 1;
    const k = Math.min(IVC_JOIN_LEN, d) / d;
    IVC_JOIN[e.id] = [bx - (bx - ax) * k, by - (by - ay) * k, bx, by, 0, 1, 0.3, 1];
  }
  const FADE_DOWN_Y = { C4: [892, 928], EPI_ILI: [870, 925], ILI_IVC: [800, 870], V_UP: [38, 4] };
  // The azygos trunk fades out toward its lower end: [y where the fade starts, y where it is gone].
  // When the ascending lumbar collateral (C9) is open it runs on in the same lane behind the organs,
  // so the trunk still fades, into it, rather than ending in a hard step. (A feeder listed in
  // FEEDER_CONNECTOR is drawn solid to its end while that collateral is open.)
  const FEEDER_FADE_Y = { AZY_SVC: [110, 176] };
  const FEEDER_CONNECTOR = {};
  // The IVC narrows to the SVC's caliber at the right atrium on the GPU too, so its end never
  // shows as a rounded cap inside the narrower SVC.
  const GPU_EASE = { IVCS_RA: 'RA' };
  // Shunts that leave and join a vein part-way along it, not at a node: the veins at each end ([from end], [to end]).
  const SIDE_HOSTS = { C6: [['V_SPL', 'SV_MID'], ['V_KID_L']], S_DSR: [['V_SPL', 'SV_MID'], ['V_KID_L']] };
  // The ends of those that lie inside the vein's lumen, as a side branch (the Warren shunt's start runs on from the
  // divided splenic vein instead): narrowed there on the GPU (renderTube).
  const SIDE_INSIDE = { C6: [true, true], S_DSR: [false, true] };
  // Surgical shunts and the vein each one divides (engine.js closes the same vessels): the Warren shunt the splenic
  // vein, the portocaval shunt the portal trunk. The vein's first stretch, at the shunt, is not drawn, so the shunt
  // side and the tied-off stump stand apart with a clear gap, each ending in a rounded cap.
  const LIGATED = [['S_DSR', 'SV_MID'], ['S_PC', 'PV_TRUNK']];
  // How much of the divided vein is cut away (arc length, world units): the clear gap plus both rounded ends.
  // It opens and closes as the shunt draws on or retracts; 0 without the shunt.
  function divideLen(vein) {
    const sh = LIGATED.find((l) => l[1] === vein), x = sh && E[sh[0]], v = E[vein];
    if (!x?.vis || !v?.vis) return 0;
    let k = 1;
    if (x.reveal) { const u = clamp((performance.now() - x.reveal.t0) / x.reveal.dur, 0, 1); k = x.reveal.out ? 1 - easeInOut(u) : easeInOut(u); }
    return k * (v.width * 2.2 + 2 * (v.wallPx || 1));
  }
  // The ascending lumbar–azygos channel runs in the azygos trunk's lane, so it stays straight.
  const STRAIGHT_COLL = new Set(['C9']);
  // Veins that fade into the vessel they sink into: a linear mask [x1, y1, x2, y2, offset], from
  // solid at the offset to 30 % at the end (the caudate vein into the IVC, C5 into the renal vein).
  const FADE_IN = { RHV_IVC: [604, 226, 616, 204, 0, 0.5], MHV_IVC: [604, 246, 615, 228, 0, 0.5], LHV_IVC: [638, 220, 624, 211, 0, 0.5], LRV_IVC: [642, 625, 624, 625, 0, 0.5 / 0.6], RRV_IVC: [602, 660, 615, 673, 0, 0], CAUD: [566, 326, 620, 350, 0.45], C5: [852, 520, 862, 618, 0.6] };
  // The sinusoids lie inside the liver: faded along their course, most in the middle of the lobe, clearing as
  // they gather into the central and hepatic veins. Linear from the portal end to the venous end, [offset of
  // the faintest point, alpha at the start, there, mode 3] (the end is solid).
  const SIN_FADE = {};
  for (const id of SIN_EDGES) {
    const e = ALL_EDGES.find((q) => q.id === id), a = NODE_POS[e.from][0], b = NODE_POS[e.to][0];
    SIN_FADE[id] = [a[0], a[1], b[0], b[1], 0.5, 0.8, 0.36, 3];
  }
  for (const [id, fd] of Object.entries(FEEDERS)) {
    // A generated fan is a tortuous network (drawn like the variceal plexus); listed paths meander.
    const list = [...(fd.fan ? fanFeeders(fd.fan).map((x) => ({ ...x, fan: true, when: fd.fan.when, out: !!fd.fan.out })) : []), ...(fd.paths || []).map((d, i) => ({ d, k: 1, when: fd.when, src: fd.from?.[i] }))];
    feedGeo[id] = list.map(({ d, k, fan, when, src, out }, i) => { const pts = sample(d); const shaped = fan ? wiggle(pts, (2.2 + 1.2 * k) * (fd.fan.wig ?? 1), i * 2.3 + 1) : fd.wig ? wiggle(pts, fd.wig, i * 2.3 + 1) : fd.exact ? pts : meander(pts, id + i); return { k, fan, when, src, out, pts: out ? shaped.slice().reverse() : shaped }; });
  }
  // The liver's branches in the circuit (circuit only), sampled once.
  const treeGeo = {};
  for (const [id, list] of Object.entries(CIRCUIT_TREES)) treeGeo[id] = list.map(({ d, k }) => ({ pts: sample(d), k }));
  // Custom shunts in the circuit: each opened one is routed as a transit-map line around everything
  // already drawn (and the custom shunts opened before it, which keep their courses, so nothing on
  // the map moves when another one opens). A closed one keeps its last course while it fades out.
  const customRoutes = new Map();
  const routerLines = ALL_EDGES.filter((e) => e.shunt !== 'custom').map((e) => geo[e.id].C).concat(Object.values(treeGeo).flatMap((l) => l.map((b) => b.pts)));
  const routerStations = NODES.map((n) => n.id || n[0]).filter((id) => NODE_POS[id] && !HIDDEN_NODES.has(id)).map((id) => NODE_POS[id][1]);
  function routeCustomShunts(p) {
    const open = Object.keys(p.customShunts || {}).filter((id) => p.customShunts[id] > 0 && geo[id]).sort();
    for (const id of [...customRoutes.keys()]) if (!open.includes(id)) customRoutes.delete(id);
    // Past a dozen at once there is no room left to route another clear of the rest (and the search
    // would stall the page); those stay as plain bypass arcs.
    const fresh = open.filter((id) => !customRoutes.has(id)).slice(0, Math.max(0, 12 - customRoutes.size));
    if (!fresh.length) return false;
    const router = createRouter({ lines: routerLines, stations: routerStations,
      bounds: [VB_CIRC[0], 100, VB_CIRC[0] + VB_CIRC[2], VB_CIRC[1] + VB_CIRC[3] + 10] });
    for (const id of customRoutes.keys()) router.addLine(geo[id].C, true);
    svg.append(scratchG);
    for (const id of fresh) {
      const e = EDGES[EI[id]], pts = router.route(NODE_POS[e.from][1], NODE_POS[e.to][1]);
      if (!pts) continue;
      const g = geo[id];
      g.dC = metroRoute(pts, 16);
      g.C = sample(g.dC);
      router.addLine(g.C, true);
      customRoutes.set(id, pts);
    }
    scratchG.remove();
    return true;
  }
  routeCustomShunts(store.get().params);
  scratchG.remove();
  // Where to caption each circuit lane: the middle of its longest horizontal run.
  const laneU = {}, laneAlt = {};
  for (const id of Object.keys(LANE_CAPTIONS)) {
    const C = geo[id]?.C;
    if (!C) continue;
    // Every straight horizontal run, longest first: the caption goes on the first of them (or the
    // spot along it) that is free of other vessels.
    const runs = [];
    let st = 0;
    for (let i = 1; i <= C.length; i++) {
      if (i < C.length && Math.abs(C[i][1] - C[i - 1][1]) < 0.6) continue;
      if (i - 1 - st >= 3) runs.push([st, i - 1]);
      st = i;
    }
    runs.sort((p, q) => (q[1] - q[0]) - (p[1] - p[0]));
    const last = C.length - 1;
    laneU[id] = runs.length ? (runs[0][0] + runs[0][1]) / 2 / last : 0.5;
    laneAlt[id] = runs.flatMap(([i0, i1]) => [0.5, 0.3, 0.7, 0.15, 0.85].map((f) => (i0 + (i1 - i0) * f) / last));
  }

  const polyD = (pts) => {
    // Catmull-Rom → cubic Bézier for a smooth morph
    let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
    }
    return d;
  };
  const arcLen = (pts) => { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; };
  function pointAt(pts, u) {
    const f = clamp(u, 0, 1) * (pts.length - 1);
    const i = Math.min(pts.length - 2, Math.floor(f)), t = f - i;
    const a = pts[i], b = pts[i + 1];
    // The tangent blends between the directions at the two samples (central differences), so a
    // mark gliding along a curve turns smoothly instead of snapping at each sample.
    const tan = (j) => { const p0 = pts[Math.max(0, j - 1)], p1 = pts[Math.min(pts.length - 1, j + 1)]; const dx = p1[0] - p0[0], dy = p1[1] - p0[1], n = Math.hypot(dx, dy) || 1; return [dx / n, dy / n]; };
    const ta = tan(i), tb = tan(i + 1);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, ta[0] + (tb[0] - ta[0]) * t, ta[1] + (tb[1] - ta[1]) * t];
  }
  // Tortuous collateral: a smooth serpentine (wavelength ≈ 64 units) along the centerline,
  // tapered to zero at both ends so the vessel still meets its nodes.
  function wiggle(pts, amp, seed) {
    if (amp < 0.3) return pts;
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const L = cum[cum.length - 1] || 1;
    const k = Math.max(1.5, Math.round(L / 90)) * Math.PI * 2 / L;
    return pts.map((p, i) => {
      if (i === 0 || i === pts.length - 1) return p;
      const a = pts[i - 1], b = pts[i + 1];
      let nx = -(b[1] - a[1]), ny = b[0] - a[0];
      const n = Math.hypot(nx, ny) || 1; nx /= n; ny /= n;
      const u = cum[i] / L;
      const env = Math.min(1, u * 6, (1 - u) * 6);
      const w = amp * env * Math.sin(cum[i] * k + seed);
      return [p[0] + nx * w, p[1] + ny * w];
    });
  }
  // Lateral offset of `off` units at mid-course, easing to zero at both ends (or, with `u0`, at
  // `u0` along the vessel and the far end: the strands leave a single trunk there).
  // With a stretch `span` [from, to] the strand leaves and rejoins the vessel there, its bow a little uneven (`ph`).
  function braid(pts, off, u0 = 0, span = null, ph = 0) {
    if (Math.abs(off) < 0.3) return pts;
    if (span) {
      // One normal for every strand (across the vessel's chord), so a bend in the vessel never kinks a strand or
      // makes two cross.
      const [ua, ub] = span, n0 = pts.length - 1, A = pts[0], B = pts[n0];
      const cl = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1, nx = -(B[1] - A[1]) / cl, ny = (B[0] - A[0]) / cl;
      return pts.map((p, i) => {
        const v = (i / n0 - ua) / (ub - ua);
        if (v <= 0 || v >= 1) return p;
        const o = off * Math.sin(Math.PI * v) ** 1.4 * (1 + 0.1 * Math.sin(3 * Math.PI * v + ph));
        return [p[0] + nx * o, p[1] + ny * o];
      });
    }
    return pts.map((p, i) => {
      if (i === 0 || i === pts.length - 1) return p;
      const a = pts[i - 1], b = pts[i + 1];
      let nx = -(b[1] - a[1]), ny = b[0] - a[0];
      const n = Math.hypot(nx, ny) || 1; nx /= n; ny /= n;
      const o = off * Math.sin(Math.PI * clamp((i / (pts.length - 1) - u0) / (1 - u0), 0, 1));
      return [p[0] + nx * o, p[1] + ny * o];
    });
  }
  // `b` blended in over `a` past `u0` along the vessel (a short smooth ramp): before it, `a`.
  function blendFrom(a, b, u0) {
    const n = a.length - 1;
    return a.map((p, i) => { const e = clamp((i / n - u0) / 0.12, 0, 1), k = e * e * (3 - 2 * e); return [lerp(p[0], b[i][0], k), lerp(p[1], b[i][1], k)]; });
  }
  // Light comes from the top (slightly left). For each sample: the unit normal and how much it
  // faces the light (n·L), so a tube's sheen and shade slide smoothly around its curves.
  const LIGHT = (() => { const n = Math.hypot(-0.42, -0.91); return [-0.42 / n, -0.91 / n]; })();
  function litNormals(pts) {
    return pts.map((p, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      let nx = -(b[1] - a[1]), ny = b[0] - a[0];
      const n = Math.hypot(nx, ny) || 1; nx /= n; ny /= n;
      const dot = nx * LIGHT[0] + ny * LIGHT[1];
      return [nx, ny, dot];
    });
  }
  // A centerline shifted toward (k > 0) or away from (k < 0) the light by k·(n·L) world units.
  function litOffset(pts, lit, k, u0 = 0, u1 = 1) {
    const i0 = Math.round(u0 * (pts.length - 1)), i1 = Math.round(u1 * (pts.length - 1));
    const out = [];
    for (let i = i0; i <= i1; i++) { const [nx, ny, dot] = lit[i]; out.push([pts[i][0] + nx * dot * k, pts[i][1] + ny * dot * k]); }
    return out;
  }
  // Outline of a tube of radius r(u) along pts (with round ends), as a closed path. The end caps
  // are explicit half-circles bulging along the tangent, so they are always convex.
  function tubeOutline(pts, lit, rOf) {
    const n = pts.length, L = [], R = [];
    for (let i = 0; i < n; i++) {
      const r = rOf(i / (n - 1));
      const [nx, ny] = lit[i];
      L.push([pts[i][0] + nx * r, pts[i][1] + ny * r]); R.push([pts[i][0] - nx * r, pts[i][1] - ny * r]);
    }
    const cap = (i, r, fwd) => {
      const [nx, ny] = lit[i];
      const tx = ny * fwd, ty = -nx * fwd; // tangent pointing out of the tube at this end
      const out = [];
      for (let k = 1; k < 8; k++) {
        const th = (k / 8) * Math.PI, c = Math.cos(th), sn = Math.sin(th);
        const sx = fwd > 0 ? nx * c : -nx * c, sy = fwd > 0 ? ny * c : -ny * c;
        out.push([pts[i][0] + (sx + tx * sn) * r, pts[i][1] + (sy + ty * sn) * r]);
      }
      return out;
    };
    // Along the left side, round the far end (left → right), back along the right side, round the
    // near end (right → left).
    const ring = [...L, ...cap(n - 1, rOf(1), 1), ...R.reverse(), ...cap(0, rOf(0), -1)];
    return 'M' + ring.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L') + ' Z';
  }
  // Where along each vessel a stenosis sits (0–1 of its drawn path). A stent's narrowing sits in the segment its card
  // names (the model's short pinch, see engine.js); any other vessel is one lumped segment, drawn narrowed at its middle.
  const stenosisAt = (id, p) => (isStent(EDGES[EI[id]]) ? STENT_SITES[stentSite(p, id)] : 0.5);
  // Lumen radius factor along a stenosed vessel: the diameter narrows by the stenosis fraction
  // (the model's resistance scales as 1/(1−s)⁴), with a smooth waist about 2.5 diameters long.
  function waist(id, v, len, w, p) {
    const u0 = stenosisAt(id, p);
    const sig = Math.max(9, w * 1.25) / Math.max(1, len);
    return (u) => 1 - v * Math.exp(-(((u - u0) / sig) ** 2));
  }

  // Polyline helpers for the catheter: the drawn centerline (geo[id].cur), cut at a length fraction.
  const headOf = (pts, f) => {
    const L = pts.reduce((n, q, i) => n + (i ? Math.hypot(q[0] - pts[i - 1][0], q[1] - pts[i - 1][1]) : 0), 0);
    let run = 0; const out = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (seg > 0 && run + seg >= f * L) { const u = (f * L - run) / seg; out.push([lerp(pts[i - 1][0], pts[i][0], u), lerp(pts[i - 1][1], pts[i][1], u)]); return out; }
      run += seg; out.push(pts[i]);
    }
    return out;
  };
  // The wedge station sits inside the small peripheral hepatic vein branch, on its drawn centerline.
  const WEDGE_BRANCH = { W_R: 'POST_R_RHV', W_M: 'POST_R_MHV', W_L: 'POST_L_LHV' };
  const wedgeTip = (id) => { const c = geo[WEDGE_BRANCH[id]]?.cur; return c?.length > 1 ? headOf(c.slice().reverse(), 0.55).at(-1) : null; };
  const nodePos = (id, t) => { if (WEDGE_BRANCH[id]) { const w = wedgeTip(id); if (w) return w; } const [a, c] = NODE_POS[id]; return [lerp(a[0], c[0], t), lerp(a[1], c[1], t)]; };
  // The point half way along a drawn vessel, by length, and the direction it runs there.
  // (at: how far along, 0.5 by default: the middle.)
  function arcMid(pts, at = 0.5) {
    let total = 0;
    for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    let run = 0;
    for (let i = 1; i < pts.length; i++) {
      const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (run + seg >= total * at && seg > 0) {
        const u = (total * at - run) / seg, dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1];
        return [pts[i - 1][0] + dx * u, pts[i - 1][1] + dy * u, dx / seg, dy / seg];
      }
      run += seg;
    }
    return [pts[0][0], pts[0][1], 1, 0];
  }

  // ── SVG scaffolding ───────────────────────────────
  const defs = s('defs');
  // Organ fills: a light top-to-bottom falloff in the organ's own hue.
  const grad = (id, varName, a0, a1) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(${varName});stop-opacity:calc(var(--organ-a) * ${a0})"/><stop offset="1" style="stop-color:var(${varName});stop-opacity:calc(var(--organ-a) * ${a1})"/></linearGradient>`;
  // The diaphragm's mask ends where its fade does (diaFadeG: clear from y 420 down, padded clear past it): the same pixels, as below it
  // the mask hid everything anyway. Ending at the bottom of the view, its region made the page build a mask the size of the whole
  // backdrop on every frame the organs were drawn live (the flank, drawn with ascites, stretched the backdrop over the abdomen), as
  // the liver eased (Mohammad's iPhone ?perf, 21 Oct: 35-50 ms frames with the live organs left out, 60-140 with them; 16 Oct notes).
  const DIA_MASK_H = 422 + 150;
  defs.innerHTML = `
    ${grad('gLiver', '--organ-liver', 0.8, 1.05)}${grad('gStomach', '--organ-stomach', 0.75, 1)}${grad('gSpleen', '--organ-spleen', 0.8, 1.05)}
    ${grad('gKidney', '--organ-kidney', 0.75, 1)}${grad('gGut', '--organ-gut', 0.6, 0.85)}${grad('gHeart', '--organ-heart', 0.8, 1.05)}${grad('gPancreas', '--organ-pancreas', 0.8, 1)}
    <filter id="orgSoft" x="-8%" y="-8%" width="116%" height="116%"><feGaussianBlur stdDeviation="6"/></filter>
    <radialGradient id="congest" cx=".42" cy=".42" r=".7"><stop offset=".35" class="cg-in"/><stop offset="1" class="cg-out"/></radialGradient>
    <linearGradient id="fluid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="fl-top"/><stop offset="1" class="fl-bot"/></linearGradient>
    <radialGradient id="skin" cx=".5" cy=".5" r=".5"><stop offset="0" class="sk-in"/><stop offset=".8" class="sk-mid"/><stop offset="1" class="sk-out"/></radialGradient>
    <linearGradient id="metal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" class="mt-a"/><stop offset=".5" class="mt-b"/><stop offset="1" class="mt-a"/></linearGradient>
    <linearGradient id="esoFadeG" gradientUnits="userSpaceOnUse" x1="0" y1="40" x2="0" y2="-40"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <mask id="esoFade" maskUnits="userSpaceOnUse" x="0" y="-150" width="${VIEW.w}" height="${VIEW.h + 150}"><rect x="0" y="-150" width="${VIEW.w}" height="${VIEW.h + 150}" fill="url(#esoFadeG)"/></mask>
    <linearGradient id="diaFadeG" gradientUnits="userSpaceOnUse" x1="0" y1="300" x2="0" y2="420"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <mask id="diaMask" maskUnits="userSpaceOnUse" x="0" y="-150" width="${VIEW.w}" height="${DIA_MASK_H}"><rect x="0" y="-150" width="${VIEW.w}" height="${DIA_MASK_H}" fill="url(#diaFadeG)"/></mask>
    <linearGradient id="rectFadeG" gradientUnits="userSpaceOnUse" x1="0" y1="${RECTUM_FADE[0]}" x2="0" y2="${RECTUM_FADE[1]}"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <mask id="rectFade" maskUnits="userSpaceOnUse" x="0" y="0" width="${VIEW.w}" height="1100"><rect x="0" y="0" width="${VIEW.w}" height="1100" fill="url(#rectFadeG)"/></mask>
    <clipPath id="abdomenClip"><path d="${ABDOMEN_CLIP}"/></clipPath>
    <radialGradient id="orgForm" cx=".3" cy=".2" r=".95"><stop offset="0" class="lit-hi"/><stop offset=".48" class="lit-mid"/><stop offset="1" class="lit-lo"/></radialGradient>
    <filter id="castShadow" x="-10%" y="-10%" width="130%" height="130%"><feGaussianBlur stdDeviation="7"/></filter>
    <pattern id="texLiver" width="22" height="19" patternUnits="userSpaceOnUse"><path class="tex" d="M5.5 0l5.5 3.2v6.3l-5.5 3.2L0 9.5V3.2zM16.5 9.5l5.5 3.2V19M11 9.5l5.5-3.2"/></pattern>
    <pattern id="texFine" width="9" height="9" patternUnits="userSpaceOnUse"><circle class="tex-dot" cx="2" cy="2" r=".8"/><circle class="tex-dot" cx="6.5" cy="6.5" r=".6"/></pattern>
    <pattern id="texRugae" width="40" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(-38)"><path class="tex" d="M0 6c7-4 13 4 20 0s13-4 20 0"/></pattern>
    <pattern id="texLobules" width="14" height="12" patternUnits="userSpaceOnUse"><path class="tex" d="M1 6a6 5 0 0 1 12 0M-6 12a6 5 0 0 1 12 0M8 12a6 5 0 0 1 12 0"/></pattern>
    <pattern id="texMuscle" width="30" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(24)"><path class="tex" d="M0 5c8-3 22 3 30 0"/></pattern>
    <pattern id="mapGrid" width="20" height="20" patternUnits="userSpaceOnUse"><circle class="map-dot" cx="10" cy="10" r=".9"/></pattern>`;
  svg.append(defs);
  const world = s('g', { id: 'world' });
  svg.append(world);
  const gGrid = s('g', { id: 'grid', class: 'circuit-only' });
  // Background plane (anatomy): the diaphragm, behind everything else (no body-cavity shading: the abdomen sits on the
  // plain stage background).
  const gBackdrop = s('g', { id: 'backdrop', mask: 'url(#diaMask)' });
  gBackdrop.innerHTML = `<path class="org-diaphragm band-edge" d="${BACKDROP.diaphragm}"/><path class="org-diaphragm band-body" d="${BACKDROP.diaphragm}"/>`;
  const gOrgans = s('g', { id: 'organs' });
  const gAscites = s('g', { id: 'ascites', 'clip-path': 'url(#abdomenClip)' });
  for (const g of [gBackdrop, gOrgans, gAscites]) watch.addGroup(g);   // (the home framing measures these: defaultVT)
  const gBack = s('g', { id: 'backEdges' });
  // Posterior veins (retrohepatic IVC, iliac, azygos…) pass behind opaque organs; a faint copy
  // drawn over the organs shows their course, as a hidden line does in an anatomical plate.
  const gGhost = s('g', { id: 'ghosts' });
  // The ghosts are faded together, as one layer, so where two meet they do not stack into a darker disc.
  const gGhostIn = s('g', { class: 'ghost-layer' });
  gGhost.append(gGhostIn);
  // Veins are drawn as one network, the way a map draws streets: every shadow, then every
  // casing, then every lumen, so where vessels join their lumens flow into each other instead of
  // one tube's wall cutting across another. Arteries lie beneath; retroperitoneal veins get the
  // same three tiers behind the organs.
  const gArt = s('g', { id: 'arteries' });
  const gShadowL = s('g', { id: 'vShadows' });
  const gCaseL = s('g', { id: 'vCasings' });
  const gEdges = s('g', { id: 'edges' });
  const gBackS = s('g'), gBackC = s('g'), gBackL = s('g'), gBackH = s('g');
  // Highlights (the lit sheen and the shaded side of each tube) are a tier of their own above the
  // lumens of the whole network, so a vessel's highlight never cuts across its neighbor.
  const gHiMid = s('g'), gHiFront = s('g');
  const gOver = s('g', { id: 'overlays' });
  const gNodes = s('g', { id: 'nodes', class: 'circuit-only' });
  const gFocus = s('g', { id: 'focus' });
  const gGuides = s('g', { id: 'guides' });
  // The venous network is one group, so that fading it (when a vessel is selected or hovered) fades
  // its union once: casings, lumens and overlaps together, not tier by tier. The focused vessel is
  // lifted out of it, into a layer above that stays bright.
  const gNet = s('g', { id: 'net' });
  gNet.append(gArt, gShadowL, gCaseL, gEdges);
  const gTop = s('g', { id: 'focusNet' });
  const gTopS = s('g'), gTopC = s('g'), gTopL = s('g'), gTopH = s('g');
  gTop.append(gTopS, gTopC, gTopL, gTopH);
  world.append(gBackdrop, gGrid, gBack, gOrgans, gGhost, gFocus, gNet, gAscites, gTop, gOver, gNodes, gGuides);
  // The figure is drawn on the GPU (veins-gl.js): the plate, every vessel in both views and the
  // moving blood. The SVG below keeps the organ artwork (rasterized for the GPU), invisible hit
  // targets and focus for each vessel, and what is drawn above the vessels (lesions, stents,
  // halos, guides), which moves to a second SVG above the GPU layer, with the same view box.
  const GL_ROWS = ALL_EDGES.length + ALL_EDGES.reduce((n, e) => n + (STRANDS[e.id]?.length || 0) + (feedGeo[e.id]?.length || 0) + (treeGeo[e.id]?.length || 0), 0);
  let veins = null, svgOver = null, worldOver = null;
  let olList = [], olCol = [0.2, 0.45, 0.9], olDirty = false, olLast = 0, olVerts = null;   // the organ outlines on the GPU (see olStep)
  const vCanvas = document.createElement('canvas');
  vCanvas.id = 'veins'; vCanvas.setAttribute('aria-hidden', 'true');
  svg.after(vCanvas);
  // Lite graphics (main.js) keeps the SVG tubes: a software renderer copied every WebGL frame back to the CPU.
  veins = createVeinsGL(vCanvas, { tubes: GL_ROWS, force: true });
  if (veins) {
    svgOver = s('svg', { id: 'stageOver', 'aria-hidden': 'true', viewBox: `0 0 ${VIEW.w} ${VIEW.h}`, preserveAspectRatio: 'xMidYMid meet' });
    worldOver = s('g');
    svgOver.append(worldOver);
    vCanvas.after(svgOver);
    worldOver.append(gFocus, gOver, gNodes, gGuides);
    wrap.classList.add('veins-gl');
  } else {
    // No WebGL2 at all (very old browsers): a short notice; the SVG tubes still show the figure.
    console.warn('WebGL2 is not available: the figure is drawn without moving blood.');
    toast('This device cannot draw moving blood (it needs WebGL2). The vessels still show their colours and readings.');
  }
  wrap.dataset.veins = veins ? 'webgl2' : 'none';
  gBack.append(gBackS, gBackC, gBackL, gBackH);

  // Circuit view: quiet bands for each pressure zone (captioned by the label layer).
  // The dots run on past the figure in every direction and fade out in steps: concentric frames of
  // the pattern at falling opacity (no mask, so nothing repaints on pan or zoom).
  const GRID_STEPS = [[0, 0.9], [200, 0.7], [450, 0.5], [750, 0.3], [1100, 0.15], [1500, 0.06]];
  const frame = (e) => `M${30 - e} ${30 - e}h${1340 + 2 * e}v${700 + 2 * e}h${-1340 - 2 * e}z`;
  GRID_STEPS.forEach(([e, op], i) => {
    gGrid.append(s('path', { d: i ? frame(e) + frame(GRID_STEPS[i - 1][0]) : frame(e), 'fill-rule': 'evenodd', fill: 'url(#mapGrid)', class: 'map-grid', style: `opacity:${op}` }));
  });
  CIRCUIT_ZONES.forEach(([, x0, x1], i) => {
    gGrid.append(s('rect', { x: x0, y: 40, width: x1 - x0, height: 690, class: 'zone' + (i % 2 ? ' alt' : '') }));
  });
  // A slide's lit zone (deck visuals V25, ext-callouts.js: zone): one band of the five, lit softly (fxSync).
  const fxZone = s('rect', { x: 0, y: 40, width: 0, height: 690, class: 'fx-zone' });
  gGrid.append(fxZone);

  // Each organ is drawn as a medical plate draws it, lit from the upper left:
  //   ambient occlusion where it meets the body wall (a soft dark edge outside it),
  //   its tissue tone (a light face turning to a shaded face, per tissue),
  //   the volume of a curved surface (a broad highlight and a darker turn at the rim),
  //   its surface anatomy (fissures, rugae, hilum, lobulation; clipped inside),
  //   an inner shade along the lower-right edge and a rim light along the upper-left edge,
  //   and a crisp outline in the tissue's own darker tone.
  // Everything is gradients and clips (no blur filters), so it costs nothing per frame.
  const TONES = ['liver', 'stomach', 'eso', 'spleen', 'panc', 'kidney', 'gb', 'gut', 'heart', 'ra'];
  defs.insertAdjacentHTML('beforeend', TONES.map((t) => `<linearGradient id="og-${t}" x1=".15" y1="0" x2=".85" y2="1"><stop offset="0" style="stop-color:var(--og-${t}-1)"/><stop offset="1" style="stop-color:var(--og-${t}-2)"/></linearGradient>`).join('')
    + '<radialGradient id="ogVol" cx=".34" cy=".26" r=".92"><stop offset="0" style="stop-color:var(--light-ink);stop-opacity:.22"/><stop offset=".5" style="stop-color:var(--light-ink);stop-opacity:0"/><stop offset=".8" style="stop-color:var(--og-vol-shade);stop-opacity:0"/><stop offset="1" style="stop-color:var(--og-vol-shade);stop-opacity:.1"/></radialGradient>');
  const organEls = {}, organG = {};
  const detailFor = (o) => {
    const list = ORGAN_DETAIL[o.id];
    if (!list) return null;
    const dg = s('g', { class: 'org-detail', 'clip-path': `url(#clip-${o.id})` });
    for (const [kind, d] of list) {
      if (kind === 'lobules') dg.append(s('path', { d: o.d, class: 'org-lobules', fill: 'url(#texLobules)' }));
      else dg.append(s('path', { d, class: 'od-' + kind }));
    }
    return dg;
  };
  // The gut (colon, small bowel, duodenum; organ picks, 20 Oct): drawn from organ-art.js in one see-through group (app.css
  // --gut-a), so the colon covers the loops under it, and cut away under the liver, stomach, spleen and kidney (#gutHide):
  // the gut never shows through them. The cut follows the liver and spleen as they change size (syncOrganMasks).
  // Each gut organ keeps its own group (the bowel's floats up on ascites) and its own path, unpainted (.org-key-path),
  // which highlights, anchors and the vessels' cover read.
  const GUT_DRAW = { colon: COLON_ART, bowel: BOWEL_ART, duodenum: `<g clip-path="url(#du-Bc)">${DUO_B}</g>` };
  const GUT_HIDE = ['liver', 'stomach', 'spleen'];
  const FLUID_R = [284, 430, 856, 600], FLUID_COLS = 1201;   // the GPU ascites' rectangle (world x, y, w, h), and its rows and columns
  const MASK_BOX = 'x="200" y="-200" width="1020" height="1320"';   // (the plate's rectangle, PLATE_RECT)
  defs.insertAdjacentHTML('beforeend', `${DUO_CLIPS}`
    // colour-exempt: masks (white shows, black hides)
    // (The gut's mask runs to y 1080, past the rectum's end: at 1040 it cut the rectum off in a hard edge. The rectum's fade is on the colon's
    // own group, rectFade, as the esophagus has esoFade.)
    + '<clipPath id="gutBox" clipPathUnits="userSpaceOnUse"><rect x="320" y="420" width="800" height="660"/></clipPath>'
    + `<mask id="gutHide" maskUnits="userSpaceOnUse" x="320" y="420" width="800" height="660"><rect x="320" y="420" width="800" height="660" fill="#fff"/>${GUT_HIDE.map((id) => `<path data-gut-cut="${id}" d="${id === 'stomach' ? SEAM_D : ORGANS.find((o) => o.id === id).d}" fill="#000"/>`).join('')}</mask>`
    // The duodenum's first part fades in over the stomach's tip, from inside it (x 730) to just past it (x 712).
    + '<linearGradient id="duFadeG" gradientUnits="userSpaceOnUse" x1="712" y1="0" x2="730" y2="0"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient><mask id="duFade" maskUnits="userSpaceOnUse" x="500" y="400" width="400" height="400"><rect x="500" y="400" width="400" height="400" fill="url(#duFadeG)"/></mask>'
    // The esophagus and stomach as one shape: the stomach's tones as one ramp over both, and the esophagus's own tone fading
    // out over the cardia (y 226 to 262), so no colour step marks the old seam.
    + '<linearGradient id="seamS" gradientUnits="userSpaceOnUse" x1="750" y1="241" x2="948" y2="566"><stop offset="0" style="stop-color:var(--og-stomach-1)"/><stop offset="1" style="stop-color:var(--og-stomach-2)"/></linearGradient>'
    + '<linearGradient id="seamFG" gradientUnits="userSpaceOnUse" x1="0" y1="226" x2="0" y2="262"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><mask id="seamFade" maskUnits="userSpaceOnUse" x="700" y="-150" width="200" height="450"><rect x="700" y="-150" width="200" height="450" fill="url(#seamFG)"/></mask>'
    // The liver lies in front of the stomach and esophagus, which show through it: where it covers them they are drawn at
    // .65, and up to full strength as cirrhosis comes in (morphLiver); the top still fades out of the plate as before.
    + `<mask id="frontM" maskUnits="userSpaceOnUse" ${MASK_BOX}><rect ${MASK_BOX} fill="url(#esoFadeG)"/><path data-front d="${ORGANS.find((o) => o.id === 'liver').d}" fill="#000" fill-opacity=".35"/></mask>`
    // With cirrhosis the liver itself goes lighter over the stomach (to .5 of its strength), in the liver's own frame (the
    // shrink's inverse, syncOrganMasks), and the stomach's outline is traced over the liver, only where the liver covers it.
    + `<mask id="lvThin" maskUnits="userSpaceOnUse" ${MASK_BOX}><rect ${MASK_BOX} fill="#fff"/><path data-thin d="${SEAM_D}" fill="#000" fill-opacity="0"/></mask>`
    + `<mask id="ghostM" maskUnits="userSpaceOnUse" ${MASK_BOX}><path data-ghost d="${ORGANS.find((o) => o.id === 'liver').d}" fill="#fff"/></mask>`
    // The ascites kept off the congested liver (the page's copy, drawn without WebGL; the GPU's own: fluidLv in veins-gl.js).
    + `<mask id="ascLv" maskUnits="userSpaceOnUse" ${MASK_BOX}><rect ${MASK_BOX} fill="#fff"/><path data-asc-lv d="${ORGANS.find((o) => o.id === 'liver').d}" fill="#000" fill-opacity="0"/></mask>`);
  const gutCut = Object.fromEntries([...defs.querySelectorAll('#gutHide [data-gut-cut]')].map((el) => [el.dataset.gutCut, el]));
  const frontCut = defs.querySelector('#frontM [data-front]'), thinCut = defs.querySelector('#lvThin [data-thin]'), ghostCut = defs.querySelector('#ghostM [data-ghost]'), ascLvCut = defs.querySelector('#ascLv [data-asc-lv]');
  let gGut = null;
  for (const o of ORGANS) {
    const g = s('g', { class: 'organ organ-' + o.id + (o.tone ? ' tone-' + o.tone : '') });
    let el;
    if (o.circle) { const [cx, cy, r] = o.circle; el = s('circle', { cx, cy, r, class: o.cls, opacity: o.id === 'umbilicus' ? 0 : null }); g.append(el); }
    else if (o.art || o.id === 'esophagus') {
      // Drawn from its markup (the esophagus with the stomach, as one shape): the organ's own path stays, unpainted.
      el = s('path', { d: o.d, class: o.cls + ' org-key-path' });
      g.append(el);
      if (o.art) g.insertAdjacentHTML('beforeend', GUT_DRAW[o.art]);
      if (o.id === 'colon') g.setAttribute('mask', 'url(#rectFade)');   // the rectum runs down out of the frame: it fades away, as the esophagus does at the top
    } else if (o.band) {
      // Tubes (the appendix): a soft contact edge, the wall, the lumen in the tissue tone, a shaded underside.
      el = s('path', { d: o.d, class: o.cls + ' band-body' });
      g.append(s('path', { d: o.d, class: o.cls + ' band-ao' }), s('path', { d: o.d, class: o.cls + ' band-edge' }), el,
        s('path', { d: o.d, class: o.cls + ' band-under', transform: 'translate(1.5 3)' }));
    } else if (o.deco) { el = s('path', { d: o.d, class: o.cls }); g.append(el); }
    else {
      // The stomach is painted as one shape with the esophagus (SEAM_D); its own outline stays its organ path.
      const seam = o.id === 'stomach', d = seam ? SEAM_D : o.d;
      el = s('path', { d, class: o.cls + ' org-fill', fill: o.tone ? `url(#og-${o.tone})` : null });
      defs.insertAdjacentHTML('beforeend', `<clipPath id="clip-${o.id}"><path d="${d}"/></clipPath>`);
      const clip = `url(#clip-${o.id})`;
      g.append(s('path', { d, class: 'org-ao' }));
      if (seam) {
        // A base over all of it, the stomach's fill and volume on its own outline, then the esophagus's, fading over the cardia.
        const eso = ORGANS.find((q) => q.id === 'esophagus').d.replace('L 792 251', 'L 813 266 L 792 266');
        const sg = s('g', { 'clip-path': clip }), fade = s('g', { mask: 'url(#seamFade)' });
        el = s('path', { d: o.d, class: o.cls + ' org-fill', fill: `url(#og-${o.tone})` });
        fade.append(s('path', { d: eso, class: 'org-eso-fill', fill: 'url(#og-eso)' }), s('path', { d: eso, class: 'org-form', fill: 'url(#ogVol)' }));
        sg.append(el, s('path', { d: o.d, class: 'org-form', fill: 'url(#ogVol)' }), fade);
        g.append(s('path', { d, class: 'org-seam-base', fill: 'url(#seamS)' }), sg);
      } else g.append(el, s('path', { d, class: 'org-form', fill: 'url(#ogVol)' }));
      const dg = detailFor(o);
      if (dg) g.append(dg);
      // The inner shade is a soft ramp (three widening, fading strokes), never a hard band.
      for (const k of [1, 2, 3]) g.append(s('path', { d, class: 'org-shade s' + k, 'clip-path': clip, transform: 'translate(-3.5 -5)' }));
      g.append(
        s('path', { d, class: 'org-rimlight', 'clip-path': clip, transform: 'translate(2 3)' }),
        s('path', { d, class: o.cls + ' org-line' }));
      // The duodenum's first part lies over the stomach's tip in the stomach's own group, so stomach and duodenum read as one tube.
      if (seam) g.insertAdjacentHTML('beforeend', `<g clip-path="url(#du-Ac)"><g mask="url(#duFade)">${DUO_A}</g></g>`);
      if (seam) g.setAttribute('mask', 'url(#frontM)');
    }
    organEls[o.id] = el; organG[o.id] = g;
    if (o.art) {
      if (!gGut) { gGut = s('g', { class: 'organ organ-gut tone-gut', mask: 'url(#gutHide)' }); gOrgans.append(gGut); }
      gGut.append(g);
    } else gOrgans.append(g);
  }
  // The gut's picture while the organs ease (gutPic), over its groups, under the gut's mask and opacity.
  const gGutPics = s('g', { class: 'gut-pics', 'pointer-events': 'none', style: 'display:none' });
  gGut?.append(gGutPics);
  // Over the picture, the gut's three cuts as patches of the stage's colour (app.css .gut-cuts): while the picture shows they
  // stand in for the mask, whose liver cut changed on every frame of an ease and had Safari draw the whole gut again through two
  // offscreen layers the size of the screen (external review, 21 Oct). Under the gut, inside the liver, stomach and spleen, there
  // is only the stage (the diaphragm is cut away there, and clear below y 420), so a patch of its colour inside the see-through
  // group shows the stage, as the cut did: the same pixels. A plain rectangle clip keeps the mask's box.
  const gGutCuts = s('g', { class: 'gut-cuts', 'pointer-events': 'none' });
  const gutPatch = Object.fromEntries(GUT_HIDE.map((id) => [id, s('path', { d: id === 'stomach' ? SEAM_D : ORGANS.find((o) => o.id === id).d })]));
  gGutCuts.append(...Object.values(gutPatch));
  gGut?.append(gGutCuts);
  const gutKids = () => (gGut ? [...gGut.children].filter((c) => c !== gGutPics && c !== gGutCuts) : []);
  const GUT_RECT = [320, 410, 800, 670];   // the gut's mask (#gutHide), in the groups' own frame (the bowel's float of 26 included)
  const GUT_CAP = Math.min(4096 / GUT_RECT[2], 4096 / GUT_RECT[3], Math.sqrt(4.2e6 / (GUT_RECT[2] * GUT_RECT[3])));   // px per unit, at most
  let gutPic = null, gutPics = [], gutPicOn = false, gutPicSeq = 0, gutPicTimer = 0, gutMut = 0, gutLookAt = null, gutLookV = '';
  const darkMq = matchMedia('(prefers-color-scheme: dark)');
  const gutPicGrey = s('filter', { id: 'gutPicGrey', filterUnits: 'userSpaceOnUse', x: GUT_RECT[0], y: GUT_RECT[1] - 30, width: GUT_RECT[2], height: GUT_RECT[3] + 30, 'color-interpolation-filters': 'sRGB' });
  const gutPicGreyFx = s('feColorMatrix', { type: 'matrix' });
  gutPicGrey.append(gutPicGreyFx); defs.append(gutPicGrey);
  // (A change in the drawn art, other than the bowel's float or the live grey, which the picture follows itself, retires it.)
  const gutMo = new MutationObserver((ms) => { if (ms.some((m) => m.type === 'childList' || (m.attributeName !== 'style' && !(m.attributeName === 'transform' && m.target.parentNode === gGut)))) gutMut++; });
  for (const k of gutKids()) gutMo.observe(k, { attributes: true, childList: true, subtree: true });
  // The stomach's outline traced over the liver where the liver covers it (cirrhosis only: morphLiver), after the liver.
  const ghost = s('g', { class: 'org-ghost', mask: 'url(#ghostM)', style: 'display:none' });
  ghost.append(s('path', { d: SEAM_D, class: 'org-ghost-line' }));
  organG.liver.after(ghost);
  // The masks' copies of the liver and spleen follow them as they change size, every frame (as the diaphragm's cuts do).
  function syncOrganMasks(shrink, spleenT) {
    const lt = `translate(560 350) scale(${shrink.toFixed(4)}) translate(-560 -350)`;
    for (const el of [gutCut.liver, gutPatch.liver, frontCut, ghostCut, ascLvCut]) putA(el, 'transform', lt);
    for (const el of [gutCut.spleen, gutPatch.spleen]) putA(el, 'transform', spleenT || '');
    // (lvThin is the liver's own mask, read in the liver's frame: the stomach's copy takes the shrink's inverse.)
    putA(thinCut, 'transform', `translate(560 350) scale(${(1 / shrink).toFixed(5)}) translate(-560 -350)`);
  }
  // Keyboard stops for the organs a tap opens (the drawn plate is hidden under the GPU copy, and hidden things take no
  // focus): invisible outlines after the organs, reached by Tab only. They take no pointer, so a click or tap never
  // focuses one, and their focus shows as the organ's hover outline (focusin below), never as a ring on the figure.
  const ORGAN_KEYS = [['heart', 'Right heart'], ['liver', 'Liver'], ['spleen', 'Spleen']];   // (the names the palette uses)
  const gOrgKeys = s('g', { id: 'organKeys' });
  for (const [id, label] of ORGAN_KEYS) gOrgKeys.append(s('path', { class: 'org-key', d: ORGANS.find((o) => o.id === id).d, tabindex: 0, role: 'button', 'aria-label': `${label}. Press Enter for its card.`, 'data-organ': id }));
  gOrgans.after(gOrgKeys);
  // The liver shows its disease in its form and surface, never as a pressure hue (hue is kept for
  // data). Healthy: a smooth, glossy capsule and a thin, sharp inferior edge. Congested: a
  // swollen, rounder, darker organ with a faint nutmeg mottle. Cirrhotic: a shrunken right lobe,
  // a larger left lobe, blunt edges, a tawny cast and a surface of regenerative nodules parted by
  // pale fibrous septa, firmer with severity. Shape and surface are drawn from one displacement
  // field, so every state blends continuously into the next.
  const liverD = ORGANS.find((o) => o.id === 'liver').d;
  const liverTint = s('path', { d: liverD, fill: 'url(#congest)', class: 'liver-tint' });
  // The liver's nodules, septa and congestion fade in with the disease; at 0 they are hidden too: at opacity 0 a clipped path
  // was still drawn into its own layer, the liver's size, on every repaint (the same pixels).
  const lvFade = (el, a) => { const o = a.toFixed(3), v = +o > 0 ? '' : 'hidden'; el.style.opacity = o; if (el.style.visibility !== v) el.style.visibility = v; };
  const lv = {
    gloss: s('g', { class: 'lv-gloss', 'clip-path': 'url(#clip-liver)' }),
    cong: s('path', { d: liverD, class: 'lv-cong', 'clip-path': 'url(#clip-liver)', style: 'opacity:0;visibility:hidden' }),
    isl: s('path', { class: 'lv-isl', 'clip-path': 'url(#clip-liver)', style: 'opacity:0;visibility:hidden' }),
    sep: s('path', { d: liverD, class: 'lv-sep', 'clip-path': 'url(#clip-liver)', style: 'opacity:0;visibility:hidden' }),
    nod: s('path', { class: 'lv-nod', 'clip-path': 'url(#clip-liver)', style: 'opacity:0;visibility:hidden' }),
  };
  // The capsule's sheen: broad soft reflections on the domes of both lobes.
  // The organs' dim and grey on the live drawing (syncOrganDim), over the plate's rectangle (PLATE_RECT), as the GPU copy has it.
  defs.insertAdjacentHTML('beforeend', '<filter id="organDim" filterUnits="userSpaceOnUse" x="200" y="-200" width="1020" height="1320" color-interpolation-filters="sRGB"><feColorMatrix type="matrix"/></filter>');
  defs.insertAdjacentHTML('beforeend', '<radialGradient id="lvSheen"><stop offset="0" class="lv-sh0"/><stop offset=".55" class="lv-sh1"/><stop offset="1" class="lv-sh2"/></radialGradient>');
  lv.gloss.append(s('ellipse', { cx: 468, cy: 236, rx: 118, ry: 34, transform: 'rotate(-6 468 236)', fill: 'url(#lvSheen)' }),
    s('ellipse', { cx: 752, cy: 262, rx: 66, ry: 16, transform: 'rotate(22 752 262)', fill: 'url(#lvSheen)' }));
  const shadeAt = organG.liver.querySelector('.org-shade');
  for (const el of [liverTint, lv.cong, lv.isl, lv.sep, lv.nod, lv.gloss]) organG.liver.insertBefore(el, shadeAt);
  const liverPaths = [...organG.liver.querySelectorAll('path')].filter((el) => el.getAttribute('d') === liverD);
  const liverClip = defs.querySelector('#clip-liver path');
  if (liverClip) liverPaths.push(liverClip);
  liverPaths.push(lv.sep);
  // The diaphragm is hidden under every organ it passes behind (the organs are see-through, and a
  // line showing through the heart or liver reads as a stray arc), with a little clearance. The
  // liver and spleen copies follow their organ's shape and size (liftDiaphragm).
  const diaMask = defs.querySelector('#diaMask');
  const diaCut = {};
  for (const o of ORGANS) if (['heart', 'heart-ra', 'esophagus', 'liver', 'stomach', 'spleen'].includes(o.id)) {
    diaCut[o.id] = s('path', { d: o.d, fill: '#000', stroke: '#000', 'stroke-width': 5, 'stroke-linejoin': 'round', 'data-cut': o.id });   // colour-exempt: a mask (black hides)
    diaMask.append(diaCut[o.id]);
  }
  liverPaths.push(diaCut.liver);
  liverPaths.push(gutCut.liver, gutPatch.liver, frontCut, ghostCut, ascLvCut);   // (the masks' copies: the gut's cut and its patch, the stomach's see-through, the ghost line's, the ascites')
  // (Cirrhosis's reshaping of the liver, CIRR and liverField: liver-morph.js.)
  let baseLiver = null, liverKey = '';
  // The diseased liver's outline without its nodular bulges and notches, for the diaphragm: one smooth dome the nodules
  // never dent (Mohammad, 20 Oct: it was "morphing to the nodules of the liver"). null while the liver is healthy.
  let liverDome = null;
  function sampleLiver() {
    // The outline and the nodules' sites, computed ahead for this artwork (liver-geo.js); live if the outline changed.
    const pre = LIVER_GEO.key === strHash(liverD) ? LIVER_GEO : null, n = 360;
    let L, pts = [];
    if (pre) { L = pre.L; for (let i = 0; i < n; i++) pts.push([pre.pts[i * 2], pre.pts[i * 2 + 1]]); }
    else {
      const tmp = s('path', { d: liverD }); svg.append(tmp);
      L = tmp.getTotalLength();
      for (let i = 0; i < n; i++) { const q = tmp.getPointAtLength((L * i) / n); pts.push([q.x, q.y]); }
      tmp.remove();
    }
    const nm = outlineNormals(pts), nod = contourNodules(L, n);
    const sites = [];
    if (pre) for (let i = 0; i < pre.sites.length; i += 2) sites.push([pre.sites[i], pre.sites[i + 1]]);
    else sites.push(...nodularSites(pts));
    return { pts, nm, nod, cells: nodularCells(sites), isl: nutmegIslands(sites) };
  }
  // Congestion's nutmeg (organ picks, 20 Oct, "even dusk"): blood pools round each lobule's central vein and those dark zones
  // join from lobule to lobule, so the dark tone lies evenly over the whole liver (lv.cong); what stays pale are islands round
  // the portal tracts, at the lobules' corners. The lobules are the cells of the nodules' sites; the sites stop at y 540 (the
  // cirrhotic liver never reaches lower) but the congested liver reaches about 575, so the band just above that line is
  // mirrored below it. Each island is three-lobed, as the pale zone reaches out along the lobules' edges.
  function nutmegIslands(sites0) {
    const sites = sites0.slice();
    for (const [x, y] of sites0) if (y > 505 && y < 540) sites.push([x, 1080 - y]);
    const cells = nodularCells(sites), r = seeded(29);
    for (let i = 0; i < 36; i++) r();   // (the stream as the mock-up drew it: its first draws placed a size drift, unused here)
    const seen = new Map(), isl = [];
    for (const cl of cells) {
      const R = cl.v.reduce((a, [x, y]) => a + Math.hypot(x - cl.x, y - cl.y), 0) / cl.v.length;
      for (const [x, y] of cl.v) {
        // corners the neighbouring lobules share come out a little apart: merge those within 2 units
        const gx = Math.floor(x / 3), gy = Math.floor(y / 3);
        let hit = null;
        for (let i = -1; i <= 1 && !hit; i++) for (let j = -1; j <= 1 && !hit; j++) for (const o of seen.get((gx + i) * 10000 + gy + j) || []) if (Math.hypot(o.x - x, o.y - y) < 2) { hit = o; break; }
        if (hit) continue;
        const o = { x, y, R }, key = gx * 10000 + gy;
        if (seen.has(key)) seen.get(key).push(o); else seen.set(key, [o]);
        isl.push(o);
      }
    }
    // lobules on the rim are cut open (no neighbour on one side), so their size overstates: capped near the typical one
    const Rs = isl.map((o) => o.R).sort((a, b) => a - b), Rcap = Rs[Math.floor(Rs.length / 2)] * 1.15;
    let d = '';
    for (const o of isl) {
      const rr = Math.min(o.R, Rcap) * 0.7 * (0.75 + 0.5 * r());
      if (rr < 0.6) continue;
      const b = { k: Array.from({ length: 6 }, (_, j) => (j % 3 === 0 ? 1.15 : 0.62) + 0.45 * r()), a: r() * Math.PI };
      d += blobPath(b, o.x, o.y, rr);
    }
    return d;
  }
  // A cell drawn as a rounded nodule: corners pulled in toward the site by the septum's half
  // width, then smoothed (quadratics through the edge midpoints).
  function cellPath(cl, c, w) {
    const [sx, sy] = liverField(cl.x, cl.y, c);
    const p = cl.v.map(([vx, vy]) => {
      const [x, y] = liverField(vx, vy, c), dx = x - sx, dy = y - sy, l = Math.hypot(dx, dy) || 1, k = Math.max(0.35, 1 - w / l);
      return [sx + dx * k, sy + dy * k];
    });
    const n = p.length, m = (j) => { const a = p[j % n], q = p[(j + 1) % n]; return `${fix1((a[0] + q[0]) / 2)} ${fix1((a[1] + q[1]) / 2)}`; };
    let d = 'M' + m(n - 1);
    for (let j = 0; j < n; j++) d += `Q${fix1(p[j][0])} ${fix1(p[j][1])} ${m(j)}`;
    return d + 'Z';
  }
  // A closed smooth blob (quadratics through the edge midpoints) of radius r at (x, y).
  function blobPath(b, x, y, r, sx = 1, sy = 1) {
    const p = b.k.map((k, j) => { const t = b.a + (j * Math.PI) / 3; return [x + Math.cos(t) * r * k * sx, y + Math.sin(t) * r * k * sy]; });
    const m = (j) => { const a = p[j % 6], q = p[(j + 1) % 6]; return `${((a[0] + q[0]) / 2).toFixed(1)} ${((a[1] + q[1]) / 2).toFixed(1)}`; };
    let d = 'M' + m(5);
    for (let j = 0; j < 6; j++) d += `Q${p[j][0].toFixed(1)} ${p[j][1].toFixed(1)} ${m(j)}`;
    return d + 'Z';
  }
  // The liver's lower edge (in its own frame) at FLUID_COLS columns evenly across the fluid's rectangle (FLUID_R), for the
  // GPU ascites: the lowest point of the outline over each column, or far above where the liver does not reach.
  let liverFloor = null, liverFluidCut = 0, liverScale = 1;
  function lowerEdge(P) {
    const out = new Float32Array(FLUID_COLS).fill(-1e4), k = (FLUID_COLS - 1) / FLUID_R[2];
    for (let i = 0; i < P.length; i++) {
      const [ax, ay] = P[i], [bx, by] = P[(i + 1) % P.length];
      const u0 = Math.ceil((Math.min(ax, bx) - FLUID_R[0]) * k), u1 = Math.floor((Math.max(ax, bx) - FLUID_R[0]) * k);
      for (let u = Math.max(0, u0); u <= Math.min(FLUID_COLS - 1, u1); u++) {
        const x = FLUID_R[0] + u / k, y = bx === ax ? Math.max(ay, by) : ay + (by - ay) * (x - ax) / (bx - ax);
        if (y > out[u]) out[u] = y;
      }
    }
    return out;
  }
  function morphLiver(cirr, cong, fine) {
    const q = fine ? 200 : 40;
    const c = Math.round(clamp(cirr, 0, 1) * q) / q, g = Math.round(clamp(cong, 0, 1) * q) / q;
    const key = c + ',' + g;
    if (key === liverKey) return;
    if (!baseLiver) { try { baseLiver = sampleLiver(); } catch { return; } if (!baseLiver.pts.length) { baseLiver = null; return; } }
    liverKey = key;
    // (?perf: the outline and nodules worked out, apart from writing them into the page: the browser's own work on them comes later.)
    const { out, dome } = gpuProbe.time(null, 'liver: outline (maths)', () => morphOutline(baseLiver, c, g));
    const f1 = fix1;
    const d = c + g > 0 ? 'M' + out.map(([x, y]) => `${f1(x)} ${f1(y)}`).join(' L') + ' Z' : liverD;
    gpuProbe.time(null, 'liver: writes', () => { for (const el of liverPaths) el.setAttribute('d', d); });
    liverDome = c + g > 0 ? dome : null;
    liverFloor = lowerEdge(c + g > 0 ? out : baseLiver.pts);
    if (veins && !veins.lost) veins.setFluidLiver(liverFloor);
    lv.gloss.style.opacity = (1 - 0.75 * smooth01(c / 0.6)).toFixed(3);
    // Regenerative nodules: tawny islands of mixed size parted by a network of pale fibrous
    // septa (the liver shows through the gaps, lightened). Flat, no shading; the septa widen and
    // the contrast firms with severity.
    const cn = smooth01(c / 0.5) * (0.55 + 0.45 * c);
    const nod = gpuProbe.time(null, 'liver: nodules (maths)', () => (cn > 0.01 ? baseLiver.cells.map((cl) => cellPath(cl, c, (0.3 + 0.45 * c) * CIRR.sep)).join('') : ''));
    gpuProbe.time(null, 'liver: writes', () => lv.nod.setAttribute('d', nod));
    lvFade(lv.sep, cn); lvFade(lv.nod, cn);
    // Nutmeg: the even dusky tone and its pale islands, fading in as congestion deepens.
    lv.isl.setAttribute('d', g > 0.01 ? baseLiver.isl : '');
    const gn = smooth01(g / 0.5); lvFade(lv.cong, gn); lvFade(lv.isl, gn);
    // The ascites is kept off the liver as its congestion shows (over the dusky liver its straw turned the lower lobe into a
    // brown blotch; organ picks, round 26).
    liverFluidCut = smooth01(g / 0.5);
    ascLvCut.setAttribute('fill-opacity', liverFluidCut.toFixed(3));
    // (Only while it cuts anything: an unused mask would still be rasterized with the fluid on every frame it eases.)
    for (const el of [ascitesPath, ascitesLine]) if (liverFluidCut > 0.001) putA(el, 'mask', 'url(#ascLv)'); else el.removeAttribute('mask');
    // The liver lies in front of the stomach and esophagus, which show through it at .65; as cirrhosis comes in (the
    // shrunken liver leaves them in plain view) they come back to full strength under it, the liver goes lighter over them
    // and their outline is traced over it (organ picks, 20 Oct).
    frontCut.setAttribute('fill-opacity', (0.35 * (1 - cn)).toFixed(3));
    thinCut.setAttribute('fill-opacity', (0.5 * cn).toFixed(3));
    if (cn > 0.01) organG.liver.setAttribute('mask', 'url(#lvThin)'); else organG.liver.removeAttribute('mask');
    ghost.style.display = cn > 0.01 ? '' : 'none';
    ghost.style.opacity = (0.55 * cn).toFixed(3);
  }
  // The liver's state eases toward the model's (a new patient or a slider never makes it jump).
  let lvC = null, lvG = 0, lvT = 0, lvGT = null, lvTT = null, lvAt = 0, lvMoving = false, lvCT = null, lvGTo = null, lvStillAt = 0, caudK = null;
  // The spleen growing through a time-lapse shows on the live drawing, at its size each frame, as the liver's ease does (spleen-motion.js).
  const spleenMv = spleenMotion();
  const spleenMoving = () => spleenMv.moving(performance.now());
  let spleenTimer = 0;
  // Abdominal wall (anterior): a soft skin tint that appears only with caput medusae, under its veins.
  const abdWall = s('ellipse', { cx: SITES.umbilicus[0], cy: SITES.umbilicus[1], rx: 120, ry: 96, fill: 'url(#skin)', class: 'abd-wall', opacity: 0 });
  // Flanks: the outline of the abdominal wall, which bulges as ascites accumulates.
  const flank = s('path', { class: 'flank', d: '' });
  gOver.before(abdWall);
  const ascitesPath = s('path', { class: 'ascites-fill', d: '', fill: 'url(#fluid)' });
  const ascitesLine = s('path', { class: 'ascites-line', d: '' });
  gAscites.append(ascitesPath, ascitesLine);
  let fluidSurf = null;   // the ascites surface y(x) while there is fluid; a tap below it opens the Ascites view
  gBackdrop.append(flank);

  // Edge groups
  const E = {};
  for (const e of ALL_EDGES) {
    const vcls = 'vg' + (CONTEXT_EDGES.has(e.id) ? ' ctx' : '') + (e.kind === 'collateral' ? ' coll' : '');
    const g = s('g', { class: vcls, 'data-id': e.id });
    const gc = s('g', { class: vcls }), gs = s('g', { class: vcls }), gh = s('g', { class: vcls });
    const grad = s('linearGradient', { id: 'gr-' + e.id, gradientUnits: 'userSpaceOnUse' });
    const st0 = s('stop', { offset: '0' }), st1 = s('stop', { offset: '1' });
    grad.append(st0, st1); defs.append(grad);
    const isArt = e.kind === 'arteriole' || e.kind === 'artery' || (e.kind === 'shunt' && e.shunt === 'ap');
    const halo = s('path', { class: 'v-halo' });
    const sel = s('path', { class: 'v-select' });
    // Anatomy: a soft contact shadow under the tube (so a vessel in front visibly passes over
    // the one behind it), the casing, the pressure-colored lumen, then the tube's shading: a
    // darker band on the side turned away from the light and a narrow sheen on the lit side.
    const shadow = s('path', { class: 'v-shadow' });
    const wall = s('path', { class: isArt ? 'v-artery' : 'v-wall' });
    const lumen = isArt ? null : s('path', { class: 'v-lumen' + (e.kind === 'liver' && (e.zone === 'sin' || e.zone === 'inter') ? ' liver-micro' : ''), stroke: `url(#gr-${e.id})` });
    const shade = isArt ? null : s('path', { class: 'v-shade' });
    const sheen = s('path', { class: 'v-sheen' });
    // A stenosed vessel is drawn as a filled outline whose width narrows at the lesion.
    const wallP = isArt ? null : s('path', { class: 'v-wallP' });
    const lumenP = isArt ? null : s('path', { class: 'v-lumenP', fill: `url(#gr-${e.id})` });
    const hit = s('path', { class: 'v-hit', tabindex: 0, role: 'button', 'aria-label': e.label || e.id, 'data-id': e.id });
    // Extra channels of a braided collateral (cavernoma): plain strokes under the main tube.
    const strands = !isArt && STRANDS[e.id] ? STRANDS[e.id].map(([off, ph, k, ua, ub]) => ({ off, ph, k, span: ua != null ? [ua, ub] : null, wall: s('path', { class: 'v-strand-wall' }), lumen: s('path', { class: 'v-strand', stroke: `url(#gr-${e.id})` }) })) : null;
    const feeders = !isArt && feedGeo[e.id] ? feedGeo[e.id].map(({ pts: cur, k: fk, fan, when, src, out }, i) => ({ cur, fk, fan, when, src, out, len: arcLen(cur), ph: i * 0.37, wall: s('path', { class: 'v-strand-wall' }), lumen: s('path', { class: 'v-strand', stroke: `url(#gr-${e.id})` }) })) : null;
    // A feeder that leaves a named vein is colored from that vein's pressure to the vessel's.
    if (feeders) feeders.forEach((fd, i) => {
      if (!fd.src) return;
      const a = fd.cur[0], b = fd.cur[fd.cur.length - 1];
      fd.st0 = s('stop', { offset: '0' }); fd.st1 = s('stop', { offset: '1' });
      const gr = s('linearGradient', { id: `gf-${e.id}-${i}`, gradientUnits: 'userSpaceOnUse', x1: a[0], y1: a[1], x2: b[0], y2: b[1] });
      gr.append(fd.st0, fd.st1); defs.append(gr);
      fd.lumen.setAttribute('stroke', `url(#gf-${e.id}-${i})`);
    });
    if (feeders && FEEDERS[e.id].fan) {
      // Tributaries fade out toward the bowel they drain, so they stay background.
      const { at, len, levels, fade = [0.7, 0.4] } = FEEDERS[e.id].fan;
      defs.insertAdjacentHTML('beforeend', `<radialGradient id="fg-${e.id}" gradientUnits="userSpaceOnUse" cx="${at[0]}" cy="${at[1]}" r="${len * (levels ? 2.7 : 1.35)}"><stop offset="0" stop-color="#fff" stop-opacity="${fade[0]}"/><stop offset=".45" stop-color="#fff" stop-opacity="${fade[1]}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient><mask id="fm-${e.id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${VIEW.w}" height="${VIEW.h}"><rect x="0" y="0" width="${VIEW.w}" height="${VIEW.h}" fill="url(#fg-${e.id})"/></mask>`);
      for (const fd of feeders) if (fd.fan) { fd.wall.setAttribute('mask', `url(#fm-${e.id})`); fd.lumen.setAttribute('mask', `url(#fm-${e.id})`); fd.faded = true; }
    }
    // Veins that sink into a retroperitoneal vein fade into it instead of ending on it: the
    // caudate vein into the IVC, the gastrorenal shunt into the left renal vein.
    if (feeders && FEEDER_FADE_Y[e.id]) {
      const [y0, y1] = FEEDER_FADE_Y[e.id];
      defs.insertAdjacentHTML('beforeend', `<linearGradient id="ffg-${e.id}" gradientUnits="userSpaceOnUse" x1="0" y1="${y0}" x2="0" y2="${y1}"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><mask id="ffm-${e.id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${VIEW.w}" height="${VIEW.h}"><rect x="0" y="0" width="${VIEW.w}" height="${VIEW.h}" fill="url(#ffg-${e.id})"/></mask>`);
      for (const fd of feeders) { fd.fadeMask = `url(#ffm-${e.id})`; fd.wall.setAttribute('mask', fd.fadeMask); fd.lumen.setAttribute('mask', fd.fadeMask); }
    }
    const FADE_DOWN = FADE_DOWN_Y;
    if (FADE_IN[e.id]) {
      const [x1, y1, x2, y2, o, to = 0.3] = FADE_IN[e.id];
      defs.insertAdjacentHTML('beforeend', `<linearGradient id="cg-${e.id}" gradientUnits="userSpaceOnUse" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"><stop offset="${o}" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="${to}"/></linearGradient><mask id="cm-${e.id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${VIEW.w}" height="${VIEW.h}"><rect x="0" y="0" width="${VIEW.w}" height="${VIEW.h}" fill="url(#cg-${e.id})"/></mask>`);
    }
    if (isArt) { g.append(halo, sel, wall, sheen, hit); gArt.append(g); }
    else {
      gs.append(shadow);
      gc.append(halo, sel, wall, wallP);
      g.append(lumen, lumenP, hit);
      gh.append(shade, sheen);
      if (strands) { gc.prepend(...strands.map((sd) => sd.wall)); g.prepend(...strands.map((sd) => sd.lumen)); }
      if (feeders) {
        for (const fd of feeders) { const d = polyD(fd.cur); fd.wall.setAttribute('d', d); fd.lumen.setAttribute('d', d); }
        gc.prepend(...feeders.map((fd) => fd.wall)); g.prepend(...feeders.map((fd) => fd.lumen));
        // A drawn trunk (the azygos) is part of its vessel: it takes hover and clicks, not only the short arch path.
        for (const fd of feeders) if (!fd.fan) { const fh = s('path', { class: 'v-hit', 'data-id': e.id, d: polyD(fd.cur), 'aria-hidden': 'true' }); fh.style.strokeWidth = 12; g.append(fh); }
      }
      gShadowL.append(gs); gCaseL.append(gc); gEdges.append(g); gHiMid.append(gh);
    }
    if (FADE_IN[e.id]) for (const el of [shadow, wall, lumen, shade, sheen, wallP, lumenP]) el?.setAttribute('mask', `url(#cm-${e.id})`);
    if (SIN_FADE[e.id]) {
      // The SVG's own copy of the sinusoids' fade (the GPU draws it from SIN_FADE).
      const [x1, y1, x2, y2, o, a0, am] = SIN_FADE[e.id];
      defs.insertAdjacentHTML('beforeend', `<linearGradient id="sg-${e.id}" gradientUnits="userSpaceOnUse" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="#fff" stop-opacity="${a0}"/><stop offset="${o}" stop-color="#fff" stop-opacity="${am}"/><stop offset="1" stop-color="#fff"/></linearGradient><mask id="sm-${e.id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${VIEW.w}" height="${VIEW.h}"><rect x="0" y="0" width="${VIEW.w}" height="${VIEW.h}" fill="url(#sg-${e.id})"/></mask>`);
      for (const el of [shadow, wall, lumen, shade, sheen, ...(strands || []).flatMap((sd) => [sd.wall, sd.lumen])]) el?.setAttribute('mask', `url(#sm-${e.id})`);
    }
    // Veins that run on out of the plate toward the pelvis (the rectal veins and their anorectal
    // varices, the inferior epigastric) fade out downward instead of ending: [y where the fade
    // starts, y where it is gone]. Only the anatomy is that low; the circuit is unaffected.
    const fadeY = FADE_DOWN[e.id];
    if (fadeY) {
      defs.insertAdjacentHTML('beforeend', `<linearGradient id="dg-${e.id}" gradientUnits="userSpaceOnUse" x1="0" y1="${fadeY[0]}" x2="0" y2="${fadeY[1]}"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><mask id="dm-${e.id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${VIEW.w}" height="${VIEW.h}"><rect x="0" y="0" width="${VIEW.w}" height="${VIEW.h}" fill="url(#dg-${e.id})"/></mask>`);
      for (const el of [shadow, wall, lumen, shade, sheen, wallP, lumenP, halo, sel, ...(strands || []).flatMap((sd) => [sd.wall, sd.lumen])]) el?.setAttribute('mask', `url(#dm-${e.id})`);
    }
    // A vein that ends in the organ it drains fades out over its first stretch (TIP_FADE): a mask
    // whose gradient follows the vessel's course, kept clear in the circuit (see updateGeometry).
    let tipFade = null;
    if (TIP_FADE[e.id] && !isArt) {
      const tg = s('linearGradient', { id: `tg-${e.id}`, gradientUnits: 'userSpaceOnUse' });
      const s0 = s('stop', { offset: '0', 'stop-color': '#fff', 'stop-opacity': '0' }), s1 = s('stop', { offset: '1', 'stop-color': '#fff' });   // colour-exempt: a mask
      tg.append(s0, s1);
      const tm = s('mask', { id: `tm-${e.id}`, maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: VIEW.w, height: VIEW.h });
      tm.append(s('rect', { x: 0, y: 0, width: VIEW.w, height: VIEW.h, fill: `url(#tg-${e.id})` }));
      defs.append(tg, tm);
      for (const el of [shadow, wall, lumen, shade, sheen, wallP, lumenP, halo, sel]) el?.setAttribute('mask', `url(#tm-${e.id})`);
      tipFade = { tg, s0, frac: TIP_FADE[e.id], line: [0, 0, 1, 0], joined: false };
    }
    E[e.id] = { e, g, gc, gs, gh, tipFade, groups: isArt ? [g] : [gs, gc, g, gh], grad, st0, st1, halo, sel, shadow, wall, lumen, shade, sheen, wallP, lumenP, hit, strands, feeders, isArt, vis: true, width: 4, wallPx: 1, shadeKey: '' };
  }
  ALL_EDGES.forEach((e, i) => { E[e.id].row = i; });
  // (Every vessel, in E's order, as one list kept from here on: E is built once above and never gains or loses a key, so the
  // per-frame loops below need not build Object.values(E) again on every frame.)
  const EV = Object.values(E);
  // Draw order within each tier: the portal tree in front (it lies anterior to the IVC).
  for (const x of EV) if (!x.isArt && (x.e.kind === 'vein' && PORTAL_TERRITORY.has(x.e.to) && PORTAL_TERRITORY.has(x.e.from || '') || ['PV_TRUNK', 'PVH_R', 'PVH_L', 'SMV_CONF', 'SV_CONF'].includes(x.e.id))) { gShadowL.append(x.gs); gCaseL.append(x.gc); gEdges.append(x.g); gHiFront.append(x.gh); x.front = true; x.g.dataset.front = '1'; }
  // Highlights of the middle tier sit above its lumens and below the front tier's; the front tier's above all.
  gEdges.insertBefore(gHiMid, gEdges.querySelector('[data-front]'));
  gEdges.append(gHiFront);
  for (const id of BACK_EDGES) if (E[id]) {
    const x = E[id];
    if (x.isArt) gBackL.append(x.g); else { gBackS.append(x.gs); gBackC.append(x.gc); gBackL.append(x.g); gBackH.append(x.gh); }
    x.back = true;
    x.g.id = 'vg-' + id;
    // The ghost is also how the hidden stretch is picked: it carries the vessel's id.
    const u = s('use', { href: '#vg-' + id, class: 'ghost ghost-hit', 'data-id': id });
    gGhostIn.append(u);
  }

  // Translucent vessels (the context veins, collaterals) are drawn in stacks, one per opacity level,
  // beneath the opaque network. A stack is faded once, as a whole, so where two of its vessels meet
  // their overlap is composited as a union instead of each fading on its own and the overlap of
  // their round ends showing as a darker, ringed disc; the opaque vessels above cover the ends
  // that run in under them.
  const LEVELS = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
  const nearestLevel = (o) => (o >= 0.95 ? 1 : LEVELS.reduce((b, l) => (Math.abs(l - o) < Math.abs(b - o) ? l : b)));
  // Each stack is one group holding a level's shadows, casings, lumens and highlights, so the
  // fade applies to the vessel as drawn (its border does not show through its own body).
  const mkStacks = () => Object.fromEntries(LEVELS.map((l) => {
    const P = s('g'); P.style.opacity = String(l);
    const parts = { s: s('g', { class: 'tier-shadow' }), c: s('g', { class: 'tier-casing' }), l: s('g'), h: s('g') };
    P.append(parts.s, parts.c, parts.l, parts.h);
    return [l, { P, ...parts }];
  }));
  const midStacks = mkStacks(), backStacks = mkStacks();
  const gStackMid = s('g'), gStackBack = s('g');
  gStackMid.append(...LEVELS.map((l) => midStacks[l].P));
  gStackBack.append(...LEVELS.map((l) => backStacks[l].P));
  gShadowL.before(gStackMid);   // beneath the opaque network
  gBackS.before(gStackBack);    // beneath the opaque part of the retroperitoneal veins
  gShadowL.classList.add('tier-shadow'); gCaseL.classList.add('tier-casing');
  gBackS.classList.add('tier-shadow'); gBackC.classList.add('tier-casing');
  gTopS.classList.add('tier-shadow'); gTopC.classList.add('tier-casing');
  // Where a vessel's parts (shadow, casing, lumen, highlights) go: on top when it is the focus
  // (selected or hovered), in the stack of its opacity level when translucent, else in the opaque
  // network. A vessel behind the organs is never lifted (it would jump in front of them).
  function place(x) {
    if (x.isArt) { (x.lifted ? gTopL : gArt).append(x.g); return; }
    if (x.lifted && !x.back) { gTopS.append(x.gs); gTopC.append(x.gc); gTopL.append(x.g); gTopH.append(x.gh); return; }
    const st = (x.level ?? 1) < 1 && (x.back ? backStacks : midStacks)[x.level];
    if (st) { st.s.append(x.gs); st.c.append(x.gc); st.l.append(x.g); st.h.append(x.gh); }
    else if (x.back) { gBackS.append(x.gs); gBackC.append(x.gc); gBackL.append(x.g); gBackH.append(x.gh); }
    else if (x.front) { gShadowL.append(x.gs); gCaseL.append(x.gc); gEdges.insertBefore(x.g, gHiFront); gHiFront.append(x.gh); }
    else { gShadowL.append(x.gs); gCaseL.append(x.gc); gEdges.insertBefore(x.g, gHiMid); gHiMid.append(x.gh); }
  }
  function setLevel(x, l) { if ((x.level ?? 1) === l) return; x.level = l; place(x); }
  function syncLift() {
    for (const x of EV) {
      // (The sinusoids cross nothing, so they stay on their tier: lifted, the tier below would redraw their junctions
      // as hard-edged patches.)
      // (A selected vessel stays in its own tier, so it joins its neighbours as every vessel does, and stands out of the dimmed
      // network along its course instead (tube texel 12), easing back into it toward its ends. Only the cava, one vessel to the
      // eye, is lifted whole, and stays so while it eases back: selA.)
      const on = (x.g.classList.contains('hl') || (IVC_EDGES.has(x.e.id) && (x.g.classList.contains('is-sel') || vh.selA.get(x.e.id) > 0))) && !SIN_EDGES.has(x.e.id);
      if (on !== !!x.lifted) { x.lifted = on; place(x); }
    }
    // Within the focus tier the portal tree stays in front (as in the resting order), so a
    // lifted collateral (paraumbilical) never draws over a lifted portal vein.
    for (const x of EV) if (x.lifted && x.front && !x.isArt && !x.back) { gTopS.append(x.gs); gTopC.append(x.gc); gTopL.append(x.g); gTopH.append(x.gh); }
  }
  const cls = (x, c, on) => { for (const g of x.groups) g.classList.toggle(c, on); };
  const setStyle = (x, k, v) => { if (x['_s' + k] === v) return; x['_s' + k] = v; for (const g of x.groups) g.style[k] = v; };
  // Context veins are always translucent; collaterals start faint until the model says otherwise.
  for (const x of EV) if (!x.isArt) { if (CONTEXT_EDGES.has(x.e.id) && !IVC_EDGES.has(x.e.id)) setLevel(x, 0.6); else if (x.e.kind === 'collateral') setLevel(x, 0.3); }
  // Performance: every model frame (≈10 a second) would otherwise rewrite hundreds of SVG
  // attributes with values that differ only in the third decimal, and each write makes the
  // browser restyle and repaint the figure. Writes go through a per-element cache, pressures
  // used for color are rounded to 0.25 mmHg and widths to 0.25 px (well below what shows).
  const setA = (el, k, v) => { const c = el._a || (el._a = {}); if (c[k] === v) return; c[k] = v; el.setAttribute(k, v); };
  // (The same, checked against the element itself, for attributes other code writes too: the organs' each model update, and every
  // frame of a liver's or the fluid's ease, were written again with the values they had, and Safari repainted them each time.)
  const putA = (el, k, v) => { v = String(v); if (el.getAttribute(k) !== v) el.setAttribute(k, v); };
  // While the GPU draws the vessels (gl-on), their SVG walls, strands, feeders and selection rings are display:none
  // (app.css): their widths and colours are held and written when the SVG shows them again (syncVeins, flushTubes). The lumens are
  // always written (credit.js reads a lit lumen's width), and so are the gradient stops.
  let tubesHidden = false;
  const tubesHeld = new Set();
  const setT = (el, k, v) => {
    if (tubesHidden) { (el._held ||= {})[k] = v; tubesHeld.add(el); return; }
    if (el._held) delete el._held[k];
    setA(el, k, v);
  };
  function flushTubes() {
    for (const el of tubesHeld) { for (const k in el._held) setA(el, k, el._held[k]); el._held = null; }
    tubesHeld.clear();
  }
  // Colors follow the beat-filtered mean pressure (the scale shows mean venous pressure) in
  // 0.5 mmHg steps, so a vessel's gradient is not rewritten on every heartbeat; widths move in
  // 0.5 px steps once settled (below, with hysteresis), so tubes are not rebuilt either.
  const qP = (v) => Math.round(v * 2) / 2;
  // A vessel end's colour bin (0.5 mmHg) with hysteresis: it moves to a new bin only once the value is 0.4 mmHg from the one
  // shown, so a value breathing across a bin's edge no longer flickers the colour with every breath (round 2 review, B7).
  const colourBins = new Map();
  const qHold = (lens, k, end, v) => {
    let a = colourBins.get(lens);
    if (!a) { a = new Float64Array(EDGES.length * 2).fill(NaN); colourBins.set(lens, a); }
    const i = 2 * k + end, was = a[i];
    if (!(Math.abs(v - was) < 0.4)) a[i] = qP(v);
    return a[i];
  };

  // Nodes (circuit view)
  // (Each dot starts off, and comes in with the first vessel drawn at its station (updateNodesCircuit): none shows on the
  // first frame before the model says which vessels are drawn.)
  const nodeEls = {};
  for (const n of NODES) {
    if (n.kind === 'wedge' || HIDDEN_NODES.has(n.id)) continue;
    const c = s('circle', { r: dotRadius(n.kind), class: 'node-dot circuit-only off' });
    gNodes.append(c);
    nodeEls[n.id] = { c, off: true };
  }
  // Resistance of each liver compartment, per lobe (read out in the circuit's liver header).
  const liverR = {};
  for (const id of ['PRE_R', 'PRE_L', 'SIN_RR', 'SIN_LL', 'POST_R_RHV', 'POST_L_LHV']) liverR[id] = { R: Infinity };

  // Overlays
  const ov = {
    clamps: s('g'), clampsOut: s('g'), thrombi: s('g'), stents: s('g'), plugs: s('g'), varices: s('g'), gvarices: s('g'),
    balloons: s('g'), bands: s('g'),
  };
  Object.values(ov).forEach((g) => gOver.append(g));
  // A slide's calipers (deck visuals V9) over the anatomy, and its brackets under the circuit (V25): ext-callouts.js, fxSync.
  const gFx = s('g', { class: 'fx-cal-g' }), gFxC = s('g', { class: 'fx-span-g circuit-only' });
  gOver.append(gFx, gFxC);
  // The caudate lobe and its veins (CAUDATE): shown only while a slide is about them (pinOrgans 'caudate'), eased in
  // and out (.caud.on), under the stents and other overlays. Each vein is a tapered tube (a wall, its lumen colored
  // from its pressures like the vessels, a sheen) that fades into the IVC's wall instead of ending on it.
  const caud = (() => {
    const [ax, ay] = CAUDATE.anchor, W = CAUDATE.wall;
    const g = s('g', { class: 'caud gone', style: `transform-origin:${ax}px ${ay}px` });
    let defsHtml = '<radialGradient id="caudDome"><stop offset="0" class="caud-d0"/><stop offset=".55" class="caud-d1"/><stop offset="1" class="caud-d2"/></radialGradient>'
      + `<linearGradient id="caudFade" gradientUnits="userSpaceOnUse" x1="${W - 1}" y1="0" x2="${W + 4}" y2="0"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`
      + `<mask id="caudMask" maskUnits="userSpaceOnUse" x="0" y="0" width="${VIEW.w}" height="${VIEW.h}"><rect x="0" y="0" width="${VIEW.w}" height="${VIEW.h}" fill="url(#caudFade)"/></mask>`;
    const lobe = s('g', { class: 'caud-lobe' });
    for (const [cx, cy, rx, ry, a] of CAUDATE.lobe) {
      const at = { cx, cy, rx, ry, transform: `rotate(${a} ${cx} ${cy})` };
      lobe.append(s('ellipse', { ...at, fill: 'url(#caudDome)' }));
    }
    const veinsG = s('g', { mask: 'url(#caudMask)', class: 'caud-veins' });
    CAUDATE.veins.forEach(([d, w], i) => {
      const n = d.match(/-?\d+(?:\.\d+)?/g).map(Number), P0 = [n[0], n[1]], C = [n[2], n[3]], P1 = [n[4] + 3, n[5] - 1.5];   // (on into the wall, where it fades)
      const at = (t) => [0, 1].map((j) => (1 - t) ** 2 * P0[j] + 2 * (1 - t) * t * C[j] + t * t * P1[j]);
      // The outline of a tube that widens from a rounded start inside the lobe and flares a little into the cava.
      const h0 = (pad) => (w / 2) * 0.45 + pad;
      const tube = (pad) => {
        const L = [], R = [];
        for (let k = 0; k <= 20; k++) {
          const t = k / 20, p = at(t), q = at(Math.min(1, t + 0.01)), r = at(Math.max(0, t - 0.01));
          let nx = -(q[1] - r[1]), ny = q[0] - r[0]; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
          const h = (w / 2) * (0.45 + 0.55 * Math.min(1, t / 0.75)) * (1 + 0.25 * Math.max(0, (t - 0.75) / 0.25) ** 2) + pad;
          L.push([p[0] + nx * h, p[1] + ny * h]); R.push([p[0] - nx * h, p[1] - ny * h]);
        }
        return 'M' + [...L, ...R.reverse()].map((v) => v[0].toFixed(2) + ' ' + v[1].toFixed(2)).join(' L') + ' Z';
      };
      veinsG.append(s('path', { d: tube(0.45), class: 'caud-wall' }), s('circle', { cx: P0[0], cy: P0[1], r: h0(0.45), class: 'caud-wall' }),
        s('path', { d: tube(0), class: 'caud-lumen' }), s('circle', { cx: P0[0], cy: P0[1], r: h0(0), class: 'caud-lumen' }),
        s('path', { d: `M${at(0.35).join(' ')} Q ${C.join(' ')} ${P1.join(' ')}`, class: 'caud-sheen', 'stroke-width': (w * 0.22).toFixed(2) }));
    });
    g.insertAdjacentHTML('afterbegin', `<defs>${defsHtml}</defs>`);
    const lumens = [...veinsG.querySelectorAll('.caud-lumen')];
    g.append(lobe, veinsG);
    gOver.prepend(g);
    let cols = '', grow = '', goneT = 0;
    return {
      // (Once faded out, hidden, its veins' mask is off (.gone): a hidden group's mask is still built on every repaint.)
      show(on, veins) {
        g.classList.toggle('on', !!on); if (on) g.classList.toggle('lobe-only', !veins);
        clearTimeout(goneT);
        if (on) g.classList.remove('gone'); else goneT = setTimeout(() => g.classList.add('gone'), 760);
      },
      // Colored from the pressure they drain at (the IVC's: the lobe keeps its outflow); sized by its share of it.
      sync(c, kq) {
        if (c !== cols) { cols = c; for (const el of lumens) el.setAttribute('fill', c); }
        const [gx, gy] = CAUDATE.grow, v = `scale(${(1 + gx * kq).toFixed(3)}, ${(1 + gy * kq).toFixed(3)})`;
        if (v !== grow) { grow = v; g.style.transform = v; }
      },
    };
  })();
  // ── Vessel glow: one engine for every highlight ──
  // Hover, a slide's glows, a step's focus, the Doppler's vessel and a change in pressure all light a vessel the same
  // way: a thin soft band hugging its live wall on both sides, fading to nothing at a free end, drawn by the GPU with
  // the vessels (veins-gl.js, tube rows 10 and 11). It follows every move and pulse for free: no blur, no mask, no
  // outline to rebuild. Each source asks for vessels in a colour (null: the vessel's own); a vessel several sources
  // light takes the colour of the last in GLOW_RANK. Each eases in and out on its own, so a change cross-fades.
  const GLOW_RANK = ['spot', 'sel', 'hover', 'flash', 'delta', 'dop', 'slide', 'focus', 'shunt'];
  const glow = { src: new Map(), lit: new Map(), raf: 0, t: 0 };
  // The glow and hover eases step at the display's rate, but the vessels are redrawn at the paced rate (animate): an
  // ease only marks the tubes stale, and the paced frame rebuilds and uploads them once.
  let glowSync = false;
  /** list: [{ id, col (a CSS colour, or null), amt (strength, 1 by default), wide (band width ×, ≤ 1.3), at (ms to wait before easing in),
   *  span ([from, to] along the vessel, 0–1: only that stretch glows, as a stent's third) }] */
  function setGlowSrc(src, list) {
    glow.src.set(src, new Map((list || []).filter((g) => E[g.id]).map((g) => [g.id, g])));
    const want = new Map();
    // (Two sources lighting a vessel in the same colour keep the stronger, wider glow: hovering a selected vessel never dims it.)
    for (const k of GLOW_RANK) for (const [id, g] of glow.src.get(k) || []) {
      const was = want.get(id);
      want.set(id, was && (was.col ?? null) === (g.col ?? null) ? { ...g, amt: Math.max(was.amt ?? 1, g.amt ?? 1), wide: Math.max(was.wide || 1, g.wide || 1) } : g);
    }
    // (The Doppler's gate on a stent outranks a slide's or a mark's glow on it: the third it samples is the one that shows.)
    for (const [id, g] of glow.src.get('dop') || []) if (g.span) want.set(id, g);
    // Which ends fade: an end that meets another vessel glowing in the same colour runs on into it (even where a third colour also joins, as the IMV joins the splenic vein); one that meets
    // another colour fades over a few units, so the two meet softly; a free end fades over a third of the vessel.
    const nodes = new Map();
    for (const [id, g] of want) for (const n of [E[id].e.from, E[id].e.to]) { if (!nodes.has(n)) nodes.set(n, []); nodes.get(n).push(g.col ?? ''); }
    const now = performance.now();
    for (const [id, g] of want) {
      const len = Math.max(1, geo[id]?.len || 60), key = g.col ?? '';
      const endOf = (n) => { const t = nodes.get(n); return t.length < 2 ? 0.35 * len : t.filter((v) => v === key).length > 1 ? 0 : Math.min(0.3 * len, 16); };
      let l = glow.lit.get(id);
      if (!l) { l = { v: 0, to: 0, col: g.col, from: null, cu: 1, end: null, span: null }; glow.lit.set(id, l); }
      if (!l.to) l.start = now + (g.at || 0);
      if (l.col !== g.col) { l.from = l.v > 0 && l.col && l.rgb ? l.rgb : null; l.cu = l.from ? 0 : 1; l.col = g.col; }
      l.to = 1; l.amt = g.amt ?? 1; l.wide = g.wide || 1; l.top = !!g.top; l.dur = (g.dur || 450) / 1000;
      l.endT = [endOf(E[id].e.from), endOf(E[id].e.to)];
      if (!l.end || l.v <= 0) l.end = [...l.endT];
      // A stretch eases along the vessel to its new place (a whole vessel is the stretch 0–1).
      l.spanT = g.span ? [...g.span] : [0, 1];
      if (!l.span || l.v <= 0) l.span = [...l.spanT];
    }
    for (const [id, l] of glow.lit) if (!want.has(id)) l.to = 0;
    if (!glow.raf) { glow.t = now; glow.raf = nextFrame(glowStep); }
  }
  function glowStep(now) {
    const dt = Math.min(0.1, (now - glow.t) / 1000); glow.t = now;
    let moving = false;
    for (const [id, l] of glow.lit) {
      if (l.to && now < l.start) { moving = true; continue; }
      const k = reduceMotion.matches ? 1 : dt / l.dur;
      l.v = l.to > l.v ? Math.min(1, l.v + k) : Math.max(0, l.v - k);
      l.cu = Math.min(1, l.cu + k);
      for (const i of [0, 1]) { const d = l.endT[i] - l.end[i]; l.end[i] = Math.abs(d) < 0.5 ? l.endT[i] : l.end[i] + d * Math.min(1, k * 2); }
      for (const i of [0, 1]) { const d = l.spanT[i] - l.span[i]; l.span[i] = Math.abs(d) < 0.003 ? l.spanT[i] : l.span[i] + d * Math.min(1, k * 1.5); }
      if (l.v <= 0 && !l.to) glow.lit.delete(id);
      else if (l.v !== l.to || l.cu < 1 || l.end[0] !== l.endT[0] || l.end[1] !== l.endT[1] || l.span[0] !== l.spanT[0] || l.span[1] !== l.spanT[1]) moving = true;
    }
    glowSync = true; stageWake();
    glow.raf = moving ? nextFrame(glowStep) : 0;
  }
  // The watched vessels (REVERSAL_WATCH) whose flow runs against its healthy direction, as shown: their stations' value
  // pills carry ⟲. In an imaging case it waits, as the blood does, until a Doppler has looked at the flow.
  const revShown = new Set();
  // The Doppler's vessel glows (--dop-glow: white on the dark themes, ink on the light ones; 19 Oct, it was the Doppler's green, which
  // reads as "normal") while its instrument is open; on a stent, only the third its gate samples. The probe looks at it (dprobePaint).
  // (points: a slide's Doppler on a stent shows a callout at each of its three points, not just the sampled one.)
  const dop = { id: null, want: null, pin: null, key: '', seg: '', points: false, all: false };
  const dopGateOf = (id) => (dop.id === id && dop.seg ? dop.seg : '');   // the third of a stent the Doppler samples ('' when it is elsewhere)
  // The Doppler probe on the figure (dprobePaint): live once the stage is built (dopApply runs before its pieces exist).
  const dpr = { el: null, on: false, key: '', side: 0, reach: 0, rev: false, k: 1, cur: null, tgt: null, hold: 0, mon: false, noneT: 0, headOff: false, eRaf: 0, eAt: 0, box: null, marks: [], swap: 0, shapes: '', at: '', ready: false, gate: null, monAt: 0, syncKey: '', searchAt: 0, searchGap: 150, lastSig: '' };
  function dopApply() {
    let id = dop.pin ?? dop.want ?? null;
    if (id && !E[id]) id = null;
    const st = store.get(), seg = id && isStent(EDGES[EI[id]]) ? stentGate(st.dopGate, st.params, id) : '';
    const all = !!seg && dop.points && id === dop.pin, key = `${id}|${seg}|${+all}`;
    if (key === dop.key) return;
    dop.id = id; dop.key = key; dop.seg = seg; dop.all = all;
    // (On a slide it waits for the slide's camera: the framing comes a moment after the slide's tool, once its cards land, and the
    // probe showed before the zoom, went with it and came back after (Doppler 2, Mohammad, 20 Oct). animateVT lets it go.)
    if (id && store.get().presenting) dprHold();
    // (On top of every vessel it crosses, as a glow should lie (18f2e33): the stent's lit third over the hepatic vein above it, Review 15 Oct.)
    setGlowSrc('dop', id ? [{ id, col: 'var(--dop-glow)', amt: 1.1, wide: 0.8, dur: 360, top: true, span: seg ? STENT_SPANS[seg] : null }] : []);
    dprobePaint();
  }
  // A presenter slide's glows (glow: [...] and its terms' vessels), each in its station's colour. Slide, focus and
  // Doppler glows are a slim, soft band (smaller than a hover's), so they mark the vessel without swamping it.
  const toneCol = (tone) => (tone.startsWith('--') ? `var(${tone})` : tone === 'accent' ? 'var(--accent)' : `var(--tr-${tone})`);
  let slideGlow = [], glowSetAt = 0;   // (the slide's glows as set, and when: a glowSeq slide's step numbers follow them, V10)
  function setGlow(list) { slideGlow = list || []; glowSetAt = performance.now(); setGlowSrc('slide', (list || []).map((g) => ({ id: g.id, col: toneCol(g.tone || 'accent'), amt: g.soft ? 0.55 : 1, wide: g.soft ? 0.8 : 0.75, at: g.at, dur: 500 }))); }
  // The hovered vessel glows softly in its own colour (and its lumen brightens a little, vh: tube row 9).
  // Each vessel's brightening eases in and out on its own, so moving from one vessel to the next cross-fades.
  // The selected vessel (sel: it and, on the cava, the rest of the cava) takes the same brightening, and selA eases its
  // standing out of the dimmed network in and out (syncVeins), so selecting and deselecting never snap.
  const vh = { id: null, amt: new Map(), sel: new Set(), selKey: '', selA: new Map(), raf: 0, t: 0 };
  // A slide's spotlight (deck visuals V2, ext-highlights.js: spot): the network and the organs step back as for a selection,
  // the named vessels stand out of it as a selected one does (selA, vhStep) and the named organs are outlined. Never in the
  // liver's own views. live: from the spotlight set until the plate has eased back after it (the ascites follows it there).
  const spot = { ids: new Set(), on: false, live: false };
  const spotOn = () => spot.on && !store.get().lobule && !store.get().sinusoid;
  const SEL_FADE = 0.3;
  const selAKey = () => { let k = ''; for (const [id, v] of vh.selA) k += id + v; return k; };

  // ── View transform (pan / zoom) ───────────────────
  let vt = { k: 1, x: 0, y: 0 };
  let morph = store.get().view === 'circuit' ? 1 : 0, morphTarget = morph, lastMorph = -1;
  // The circuit can be turned a quarter turn counter-clockwise, so its flow runs bottom to top and
  // the map is tall instead of wide: it fills a phone held upright. rotU is the (animated) turn,
  // 0 to 1; the anatomy is never turned. The turn is part of the world transform and of the view
  // box (which swaps its width and height with it), so pan, zoom and every screen-space layer
  // keep working in the frame they already use.
  // With no saved choice, a phone or tablet held upright opens the circuit upright (the wide map would be a strip).
  const portraitPhone = () => matchMedia(UPRIGHT_MQ).matches;   // (the style sheet's upright clause, util.js)
  let rotTarget = (() => { try { const v = localStorage.getItem('pps.circuitRot'); return v == null ? (portraitPhone() ? 1 : 0) : v === '1' ? 1 : 0; } catch { return portraitPhone() ? 1 : 0; } })();
  let rotU = rotTarget;
  const rotEase = (u) => u * u * (3 - 2 * u);
  const CIRC_C = [VB_CIRC[0] + VB_CIRC[2] / 2, VB_CIRC[1] + VB_CIRC[3] / 2];
  const VB_CIRC_R = [CIRC_C[0] - VB_CIRC[3] / 2, CIRC_C[1] - VB_CIRC[2] / 2, VB_CIRC[3], VB_CIRC[2]];
  // Degrees the world is turned by right now (blended in with the view morph).
  const rotDeg = () => -90 * rotEase(rotU) * Math.max(0, lastMorph);
  let lz = null;   // the lobule view's layer (built when its code has arrived: lobuleReady)
  let lzCode = null, lzLoad = null, lzWaiting = false, lzSoon = false, aimWait = null;
  let geometryVersion = 0;
  let netBox = null, netBoxFor = -1;
  // Everything drawn in screen space (labels, leaders, organ names, the flow marks, the action
  // card) follows the artwork on the very next frame of a pan or zoom, not on the next model
  // update: a view change schedules one coalesced sync per animation frame.
  let viewRaf = 0, viewVersion = 0, CTM = null, wrapRect = null;
  let organMorphA = 1, organDimA = 1;   // the organs' fade with the morph and their dim (syncOrganDim), as the groups' opacity
  let drawOnce = false;   // draw the vessels once through the dive's freeze: the camera moved while hidden
  let stageWake = () => {};   // set once the frame loop exists: anything that may need a redraw calls it
  let resizeReady = false, forceDraw = false;   // forceDraw: the vessel canvas was just resized (and so cleared): the next frame draws it at once
  let clampFs = '', clampBase = 12;   // clampBase: the "60 %"'s size on screen (clampFontAt: the labels' own name size)
  // A narrowing's label stands level on screen whatever the figure's turn, at the spot the layout chose for it (clampLabelAt: the
  // column's side, a spot off the probe) or, where it chose none, just clear of its clamp on the vessel's side, at the labels' name size
  // (a turned "60 %" had stood on end across the right atrium in the circuit). Every rebuild of the marks and every change of zoom
  // places it again by that one rule, so neither undoes the spot the layout gave it: the "60 %" had gone back to the vessel's side
  // under the stent's callouts after a redraw.
  function placeClampLabels() {
    for (const t of ov.clamps.querySelectorAll('.clamp-label')) clampLabelAt(t);
  }
  const applyVT = () => {
    const deg = rotDeg();
    world.setAttribute('transform', `translate(${vt.x} ${vt.y}) scale(${vt.k})${deg ? ` rotate(${deg.toFixed(3)} ${CIRC_C[0]} ${CIRC_C[1]})` : ''}`);
    worldOver?.setAttribute('transform', world.getAttribute('transform'));
    syncSemantic();
    CTM = null; viewVersion++; stageWake();
    if (!viewRaf) viewRaf = nextFrame(syncView);
  };
  function syncView() {
    viewRaf = 0;
    if (!F || lz?.isOpen()) return;
    refreshCTM();
    gpuProbe.time(null, 'labels (script)', () => updateLabels(F));
    if (cath.st) cathLabels();
    if (sites.list) sitesPaint();
    if (scan.on) scanPaint();
    dprobePaint();
    gpuProbe.time(null, 'cards follow (script)', () => onViewChange?.());
  }
  applyVT();
  // The figure's screen transform, computed from the viewBox, the zoom state and the stage box.
  // Asking the browser (getScreenCTM / getBoundingClientRect) right after the SVG has been
  // updated forces a synchronous style + layout pass over thousands of elements, every frame;
  // the arithmetic is exact and free. The stage box is cached and kept current by observers.
  let box = null;
  const measureBox = () => {
    // Measured without the lobule dive's zoom (a CSS scale on the svg), or the vessels would be drawn zoomed twice.
    const tf = svg.style.transform; if (tf) svg.style.transform = '';
    const r = wrap.getBoundingClientRect(), q = svg.getBoundingClientRect();
    if (tf) svg.style.transform = tf; box = { left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom, sx: q.left - r.left, sy: q.top - r.top, sw: q.width, sh: q.height }; };
  const stageBox = () => { if (!box) measureBox(); return box; };
  new ResizeObserver(() => { box = null; CTM = null; }).observe(wrap);
  addEventListener('resize', () => { box = null; CTM = null; });
  addEventListener('scroll', () => { box = null; CTM = null; }, true);
  let ctmLast = null;
  function refreshCTM() {
    const b = stageBox(), vb = svg.viewBox.baseVal;
    const s = Math.min(b.sw / vb.width, b.sh / vb.height);
    const ox = b.left + b.sx + (b.sw - vb.width * s) / 2 - vb.x * s, oy = b.top + b.sy + (b.sh - vb.height * s) / 2 - vb.y * s;
    // world → view box: translate(vt) · scale(k) · rotate(θ about the circuit's centre); then the view box → screen.
    const th = (rotDeg() * Math.PI) / 180, co = Math.cos(th), si = Math.sin(th), sk = s * vt.k;
    const m = { a: sk * co, b: sk * si, c: -sk * si, d: sk * co, e: ox + s * vt.x + sk * (CIRC_C[0] - co * CIRC_C[0] + si * CIRC_C[1]), f: oy + s * vt.y + sk * (CIRC_C[1] - si * CIRC_C[0] - co * CIRC_C[1]), sc: sk };
    // An unchanged view keeps the same object, so the frame loop (which compares it) sees that nothing moved.
    CTM = ctmLast && ['a', 'b', 'c', 'd', 'e', 'f', 'sc'].every((k) => ctmLast[k] === m[k]) ? ctmLast : (ctmLast = m);
    wrapRect = b;
    applyClampFs();
  }
  // (A narrowing's "60 %" is drawn in the figure: its size there is that of the labels' names on screen at any zoom, sweep batch 03 at 6–7 px.)
  function applyClampFs() {
    const sk = CTM?.sc || 0, cfs = sk > 0 ? (clampBase / sk).toFixed(2) : '';
    if (cfs && cfs !== clampFs) { clampFs = cfs; for (const g of [ov.clamps, ov.clampsOut]) g.style.setProperty('--clamp-fs', `${cfs}px`); placeClampLabels(); }
  }
  function worldToLocal(x, y) {
    if (!CTM) refreshCTM();
    return [CTM.a * x + CTM.c * y + CTM.e - wrapRect.left, CTM.b * x + CTM.d * y + CTM.f - wrapRect.top];
  }
  function clientToWorld(cx, cy) {
    const m = world.getScreenCTM().inverse();
    return [m.a * cx + m.c * cy + m.e, m.b * cx + m.d * cy + m.f];
  }
  function clientToVB(cx, cy) {
    const m = svg.getScreenCTM().inverse();
    return [m.a * cx + m.c * cy + m.e, m.b * cx + m.d * cy + m.f];
  }
  function freeCentre() { const ins = safeInsets(), b = stageBox(); return [b.left + (ins.l + ins.W - ins.r) / 2, b.top + (ins.t + ins.H - ins.b) / 2]; }
  // A zoom step by the buttons glides there instead of jumping.
  function animZoomAt(cx, cy, factor) {
    fitted = false;
    if (lobuleOn) return;
    const [vx, vy] = clientToVB(cx, cy), base = vtTarget && vtAnim ? vtTarget : vt;
    const k = clamp(base.k * factor, 0.6, 6), wx = (vx - vt.x) / vt.k, wy = (vy - vt.y) / vt.k;
    animateVT({ k, x: vx - wx * k, y: vy - wy * k }, 260);
  }
  // A trackpad pinch may stretch a little past the limits (it springs back when it ends).
  function zoomAt(cx, cy, factor, stretch = false) {
    if (lobuleOn) return;   // the lobule view has its own zoom
    const [vx, vy] = clientToVB(cx, cy);
    const wx = (vx - vt.x) / vt.k, wy = (vy - vt.y) / vt.k;
    // (A new view, never the old one changed in place: the first fit sets the view, the home framing and the glide's target outright, and
    // a zoom that changed the one object changed them all, so the home look took the zoomed view for home and glided it back to the fit
    // as soon as a card moved: a pinch in the first seconds after the page opened was undone.)
    const k = stretch ? clamp(vt.k * factor, 0.5, 7.2) : clamp(vt.k * factor, 0.6, 6);
    vt = { k, x: vx - wx * k, y: vy - wy * k };
    applyVT(); CTM = null;
  }
  // Default framing. The circuit is a wide map (≈ 1.9 : 1); in a squarish or tall viewport,
  // fitting its width would shrink every station to a dot, so it opens zoomed to fill the height,
  // centered on the portal vein and liver, and the learner pans sideways to the beds or heart.
  // The esophagus and the great veins run on above the plate and fade out; Fit stops where they fade.
  const FIT_TOP = -40;
  // The figure fills the window and the rest of the interface floats over it. Each floating piece
  // says which edge it holds (data-safe="top|bottom|left|right"); the default framing keeps the
  // figure in the space they leave. Side cards count only on a wide screen (on a phone they are
  // sheets over the figure), and the figure never shrinks to a sliver for them.
  // The space the cards leave above them and below the top bars, as it really is (no softening): the HVPG
  // procedure keeps its zoomed view and readings inside it. A phone's sheet and a tablet's wide card count as bottom.
  // (A piece sliding with the sinusoid zoom, main.js sinMotion: the dock as it slides away (vd-out) no longer counts, and while
  // the dock or the view pill slides back, data-slide-y holds its shift on screen, so it counts where it will rest.)
  const slideRest = (el, q) => { const y = +el.dataset.slideY || 0; return y ? new DOMRect(q.x, q.y - y, q.width, q.height) : q; };
  // (A card hidden by visibility no longer counts, except the slide's data card while it waits for its entry (data-safe-waits):
  // an upright phone's data card with its readings on a sheet waits hidden by visibility, not opacity (styles/app.css
  // .pz-sheet.pz-hide), while the slide's camera frames. Skipped then, the figure framed as if no card stood at the top, and the
  // card came in over the slide's vessel: the test all deck's clot slide on an iPhone, 19 Oct. Only that card: the Tests sheet and
  // the Details panel (data-safe-rest too) are hidden by visibility when closed, and counted then, the app opened framed small at
  // the top of a phone, 19 Oct.)
  const unseenCard = (el) => !('safeWaits' in el.dataset) && (el.checkVisibility ? !el.checkVisibility({ visibilityProperty: true }) : getComputedStyle(el).visibility === 'hidden');
  function cardSpace() {
    const wr = wrap.getBoundingClientRect(), W = wr.width, H = wr.height, sp = { t: 0, b: 0 };
    for (const el of document.querySelectorAll('[data-safe]')) {
      // (A card playing its way out no longer counts: the camera frames for what stays.)
      if (el.hidden || el.closest('[hidden]') || el.classList.contains('card-leaving') || el.classList.contains('vd-out')) continue;
      if (unseenCard(el)) continue;
      const q = slideRest(el, el.getBoundingClientRect());
      if (!q.width || !q.height) continue;
      const y0 = ((el.classList.contains('mini') || el.dataset.folding) && +el.dataset.fullH ? q.bottom - +el.dataset.fullH : q.top) - wr.top - (+el.dataset.safePad || 0), y1 = q.bottom - wr.top;
      if (y1 <= 0 || y0 >= H) continue;
      const edge = el.dataset.safe;
      if (edge === 'top') sp.t = Math.max(sp.t, y1);
      else if (y0 > H * 0.3 && (W < 768 || q.width > W * 0.75 || (edge === 'bottom' && !el.classList.contains('side')))) sp.b = Math.max(sp.b, H - y0);
    }
    return sp;
  }
  // (exact: the cards' real edges, with no softening: a slide that must keep its vessels clear of them, even where they leave a thin band.)
  function safeInsets(exact = false, skip = null) {
    const wr = wrap.getBoundingClientRect(), W = wr.width, H = wr.height;
    const ins = { t: 0, b: 0, l: 0, r: 0, W, H }, cards = [];
    if (!W || !H) return ins;
    // A phone held sideways docks its cards at the side like a tablet (dock.js), so they count as side cards.
    const wide = W >= 768 || (W > H && H <= 500 && W >= 640);
    for (const el of document.querySelectorAll('[data-safe]')) {
      // (A card playing its way out no longer counts: the camera frames for what stays.)
      if (el.hidden || el.closest('[hidden]') || el.classList.contains('card-leaving') || el.classList.contains('vd-out')) continue;
      if (skip && skip.includes(el)) continue;
      if (unseenCard(el)) continue;
      let q = slideRest(el, el.getBoundingClientRect());
      if (!q.width || !q.height) continue;
      // (data-safe-rest: a card whose own transform only eases it in or out counts where it rests, so the camera frames once.)
      if ('safeRest' in el.dataset) q = translateRest(el, restBox(el, q));
      // The vitals dock folded to one line on a phone (main.js) still counts at its full height, so the
      // framing does not jump each time it folds and opens.
      // (data-safe-pad: room kept clear above a piece too, as the 8 px between the figure's readings and the view switch's pill.)
      const y0 = ((el.classList.contains('mini') || el.dataset.folding) && +el.dataset.fullH ? q.bottom - +el.dataset.fullH : q.top) - wr.top - (+el.dataset.safePad || 0);
      const x0 = q.left - wr.left, x1 = q.right - wr.left, y1 = q.bottom - wr.top;
      if (x1 <= 0 || y1 <= 0 || x0 >= W || y0 >= H) continue;
      let edge = el.dataset.safe;
      if (edge === 'right' && !wide) edge = 'bottom';   // a phone's cards are sheets over the bottom
      else if (edge === 'bottom' && el.classList.contains('side')) edge = 'right';   // the instruments docked at the side
      if (edge === 'top') ins.t = Math.max(ins.t, y1);
      else if (edge === 'bottom') ins.b = Math.max(ins.b, H - y0);
      else if (wide && edge === 'right') { ins.r = Math.max(ins.r, W - x0); cards.push([y0, y1]); }
      else if (wide && edge === 'left') ins.l = Math.max(ins.l, x1);
    }
    // Where the side cards would leave under 60% of the width (a tablet held upright), a short card is cleared
    // above (or below) instead, so the figure keeps the full width rather than shrinking into a strip.
    // (Not while presenting: a slide's text and data columns are laid out to leave the figure its own column.)
    if (ins.r && W - ins.l - ins.r < W * 0.6 && !store.get().presenting) {
      const top = Math.min(...cards.map((c) => c[0])), bot = Math.max(...cards.map((c) => c[1]));
      if (top > H * 0.45) { ins.b = Math.max(ins.b, H - top + 8); ins.r = 0; }
      else if (bot <= H * 0.62) { ins.t = Math.max(ins.t, bot + 8); ins.r = 0; }
    }
    // (While presenting, the slide's words and data card both stay clear even on a tablet: the figure frames into the
    // column between them rather than going under them; only a strip too thin to frame anything gives way.)
    if (W - ins.l - ins.r < (store.get().presenting ? 200 : W < 768 ? 260 : Math.min(W * 0.5, 360))) ins.l = ins.r = 0;
    if (!exact && H - ins.t - ins.b < H * 0.35) { const k = (H * 0.65) / (ins.t + ins.b); ins.t *= k; ins.b *= k; }
    return ins;
  }
  // A framing computed for the whole stage, moved and scaled into the free space.
  function insetVT(v, vbArr) {
    const ins = safeInsets(), { W, H } = ins;
    if (!W || !H) return v;
    const [vx, vy, vw, vh] = vbArr, s0 = Math.min(W / vw, H / vh);
    const f = Math.min((W - ins.l - ins.r) / W, (H - ins.t - ins.b) / H);
    const cx = vx + vw / 2, cy = vy + vh / 2, ox = (ins.l - ins.r) / 2 / s0, oy = (ins.t - ins.b) / 2 / s0;
    return { k: v.k * f, x: cx + ox + f * (v.x - cx), y: cy + oy + f * (v.y - cy) };
  }
  const circVB = () => (rotTarget ? VB_CIRC_R : VB_CIRC);
  // The whole map keeps clear of the zoom pill (+, −, Fit), which stands in the figure's bottom right corner beside
  // any card on the right. Where the map would run under it, the map rises at the same size until it ends 8 px above the
  // pill, if the room under the top bars allows (shrinking it would also thin out its labels); only where it does not, the
  // map shrinks just enough to end 8 px left of the pill (sweep, 16 Oct: the controls covered the Epigastric → SVC corner).
  // (The whole map's drawn extent in world units, as #net's box with every collateral open: the same in every case, so the
  // framing never moves as collaterals open.)
  const ART_CIRC = [70, 30, 1330, 730];
  function clearPill(v, vbArr) {
    const pill = document.getElementById('zoomPill');
    if (!pill) return v;
    const p = settledBox(pill), wr = wrap.getBoundingClientRect();
    if (!p.width || !p.height || !wr.width || !wr.height || pill.classList.contains('no-room') || getComputedStyle(pill).visibility === 'hidden') return v;
    const [vx, vy, vw, vh] = vbArr, s0 = Math.min(wr.width / vw, wr.height / vh);
    const ox = (wr.width - vw * s0) / 2 - vx * s0, oy = (wr.height - vh * s0) / 2 - vy * s0;
    let [x0, y0, x1, y1] = ART_CIRC;
    // (Turned upright, the map's box turns a quarter turn counter-clockwise about the circuit's centre.)
    if (rotTarget) [x0, y0, x1, y1] = [CIRC_C[0] + (y0 - CIRC_C[1]), CIRC_C[1] - (x1 - CIRC_C[0]), CIRC_C[0] + (y1 - CIRC_C[1]), CIRC_C[1] - (x0 - CIRC_C[0])];
    const ax0 = ox + s0 * (v.x + v.k * x0), ax1 = ox + s0 * (v.x + v.k * x1), ay0 = oy + s0 * (v.y + v.k * y0), ay1 = oy + s0 * (v.y + v.k * y1);
    const g = 8, pl = p.left - wr.left - g, pt = p.top - wr.top - g, pr = p.right - wr.left + g, pb = p.bottom - wr.top + g;
    if (ax1 <= pl || ax0 >= pr || ay1 <= pt || ay0 >= pb) return v;
    const up = ay1 - pt + 1, room = ay0 - safeInsets().t - g;   // (+1: the art's box rounds on screen; a whole pixel to spare)
    if (up <= room) return { k: v.k, x: v.x, y: v.y - up / s0 };
    if (pl - ax0 < (ax1 - ax0) * 0.5) return v;
    const f = (pl - ax0) / (ax1 - ax0), wx = (ax0 - ox) / s0, wy = ((ay0 + ay1) / 2 - oy) / s0;
    return { k: v.k * f, x: wx - f * (wx - v.x), y: wy - f * (wy - v.y) };
  }
  // On a slide, the circuit as drawn (its header row down to its lowest open vessel) stands centred in the height the cards leave,
  // above the nav pill, at the same size: framed for every collateral, a circuit with few open sat high over a bare band (17 Oct
  // design review, iPad on its side). Read from the vessels' circuit courses, which never morph, so it frames once.
  function centreDrawn(v) {
    if (!store.get().presenting) return v;
    const wr = wrap.getBoundingClientRect(), W = wr.width, H = wr.height;
    if (!W || !H) return v;
    let bot = -Infinity;
    for (const x of EV) {
      if (!x.vis || x.g.classList.contains('coll-ghost')) continue;
      for (const p of geo[x.e.id]?.C || []) if (p[1] > bot) bot = p[1];
    }
    if (!Number.isFinite(bot)) return v;
    const [, vy, vw, vh] = VB_CIRC, s0 = Math.min(W / vw, H / vh), oy = (H - vh * s0) / 2 - vy * s0;
    const sy = (Y) => oy + s0 * (v.y + v.k * Y);
    const ins = safeInsets(), top = sy(vy), end = Math.min(sy(vy + vh), sy(bot) + 30);
    let floor = H - ins.b;
    for (const el of [document.querySelector('.pz-bar.pzb-pill'), document.getElementById('zoomPill')]) {
      const r = el?.getBoundingClientRect();
      if (r?.width && getComputedStyle(el).visibility !== 'hidden') floor = Math.min(floor, r.top - wr.top - 8);
    }
    const hi = floor - end, dy = Math.min(hi, Math.max(ins.t + 4 - top, (ins.t + floor) / 2 - (top + end) / 2));   // (never past the pill, nor its top under a card)
    return hi > 0 && dy > 0 ? { k: v.k, x: v.x, y: v.y + dy / s0 } : v;
  }
  // The whole map, in the space the cards leave and clear of the zoom pill.
  const circWhole = () => clearPill(insetVT({ k: 1, x: 0, y: 0 }, circVB()), circVB());
  // The boxes the home framing fits: whole groups as drawn, and each gut organ (in its own transform) with every clipped
  // part cut to its clip path's box.
  function fitBoxes(whole, clipped) {
    const out = [], box = (el) => { try { return el.getBBox(); } catch { return null; } };
    for (const g of whole) { const b = box(g); if (b) out.push(b); }
    for (const g of clipped) {
      const parts = [];
      for (const c of g.children) {
        const b = box(c); if (!b || !b.width || !b.height) continue;
        const id = /url\(#([^)]+)\)/.exec(c.getAttribute('clip-path') || '')?.[1];
        const cp = id && svg.querySelector('#' + CSS.escape(id))?.firstElementChild;
        const k = cp && box(cp);
        parts.push(k ? clipBox(b, k) : b);
      }
      const m = g.transform?.baseVal?.consolidate()?.matrix;
      for (const b of parts) if (b) out.push(m ? mapBox(b, m) : b);
    }
    return out;
  }
  function defaultVT(circuit) {
    if (!circuit) {
      // Fit frames everything the plate draws: the heart and the veins above it, the organs, the
      // flanks, and with ascites the fluid pooled in the pelvic floor below the default frame. The
      // box is measured, so it follows an enlarged spleen or a growing ascites.
      // (The layout size: the svg's drawn rectangle is scaled while the lobule zoom plays, and a fit read from it lands somewhere else.)
      const r = { width: svg.clientWidth, height: svg.clientHeight };
      if (!r.width || !r.height) return { k: 1, x: 0, y: 0 };
      let x0 = VB_ANAT[0], y0 = VB_ANAT[1], x1 = VB_ANAT[0] + VB_ANAT[2], y1 = VB_ANAT[1] + VB_ANAT[3];
      // Only what holds still is measured: the abdomen, the organs and the ascites. The vessels morph (to and from
      // the circuit, and as the first frames lay them out), and measuring them made the framing land in one place
      // and then glide to another a second later.
      // (A box ignores clip paths, so the gut's art, drawn past Mohammad's outlines and clipped to them, is measured
      // clipped: fitBoxes. Measured whole, its loose ends pushed the framing off centre.)
      for (const b of fitBoxes([gBackdrop, ...[...gOrgans.children].filter((c) => c !== gGut), gAscites], gGut ? gutKids() : [])) {
        if (!b.width || !b.height) continue;
        x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height);
      }
      y0 = Math.max(y0, FIT_TOP) - 8; y1 += 8;
      // The svg shows its viewBox scaled to fit (meet), and the spare room on the other axis is
      // visible too: fit the box into that whole visible area, less what the floating pieces cover.
      const ins = safeInsets();
      const s0 = Math.min(r.width / VB_ANAT[2], r.height / VB_ANAT[3]);
      const fw = Math.max(40, r.width - ins.l - ins.r), fh = Math.max(40, r.height - ins.t - ins.b);
      const k = Math.min(1.15, fw / s0 / (x1 - x0), fh / s0 / (y1 - y0));
      const cx = VB_ANAT[0] + VB_ANAT[2] / 2 + (ins.l - ins.r) / 2 / s0, cy = VB_ANAT[1] + VB_ANAT[3] / 2 + (ins.t - ins.b) / 2 / s0;
      return { k, x: cx - k * ((x0 + x1) / 2), y: cy - k * ((y0 + y1) / 2) };
    }
    // Turned upright, the map is tall and fills the height of the stage as it is.
    if (rotTarget) return circWhole();
    const ins = safeInsets();
    const W = ins.W - ins.l - ins.r, H = ins.H - ins.t - ins.b;
    const s0 = Math.min(W / VB_CIRC[2], H / VB_CIRC[3]);
    // (With a card at the side the whole map is shown: the close-up is for a narrow screen with nothing over it.)
    if (ins.l || ins.r || VB_CIRC[3] * s0 > 0.62 * H) return centreDrawn(clearPill(insetVT({ k: 1, x: 0, y: 0 }, VB_CIRC), VB_CIRC));
    const k = clamp((0.94 * H) / (VB_CIRC[3] * s0), 1, 3);
    const cx = VB_CIRC[0] + VB_CIRC[2] / 2, cy = VB_CIRC[1] + VB_CIRC[3] / 2;
    const fx = 640, fy = cy;
    return insetVT({ k, x: cx - k * fx, y: cy - k * fy }, VB_CIRC);
  }
  // Fit shows the whole figure. On a narrow screen the circuit opens as a close-up of the portal vein
  // and liver (see defaultVT), which is not a fit: there Fit shows the entire map, and tapping it
  // again returns to the close-up, so the button always does something visible.
  // Whether the view is a fit (Fit, a refit for the cards, the anatomy's home framing) rather than one the learner zoomed or
  // panned: a pinch, a drag, the wheel or a zoom step clears it. The tools' own camera trips (the HVPG catheter's route and
  // close-up, there and back) leave it as it was, so a card closed after a measurement still fits (see closeView).
  let fitted = false;
  // The Tests card opening leaves the camera where it is (Mohammad, 20 Oct): the pan and zoom stay as they were, under the card too.
  // keepView(true) is called as the card opens and notes the space the other pieces leave (the card itself not counted); the
  // refits that follow the card (the open's, the sheet settling, a tool's card changing height) and the home framing's own
  // look then leave the view alone for as long as only the Tests card has changed that space. Another card coming or going,
  // a turn of the device or a resize changes it, and the framing follows as ever; so do the Fit button and a slide's own
  // framing (not kept while presenting).
  let keptSpace = null;
  const spaceSig = () => {
    // (The vitals dock changes shape beside a side-docked Tests card, so it is not counted either.)
    const i = safeInsets(false, [document.getElementById('dock'), document.getElementById('vdock')]);
    return [i.W, i.H, i.t, i.b, i.l, i.r].map(Math.round).join();
  };
  // (Once the space has changed for another reason the view is no longer kept: the framing follows from then on.)
  const keptNow = () => {
    if (keptSpace === null) return false;
    if (!store.get().presenting && keptSpace === spaceSig()) return true;
    keptSpace = null;
    return false;
  };
  const fit = () => {
    // In the lobule view, Fit shows the whole lobule again (it never leaves the view). Inside the sinusoid it steps back out to the lobule.
    if (lobuleOn) { if (store.get().sinusoid) { store.set({ sinusoid: false }); return; } lz.fitView(); return; }
    handsOff();
    const circuit = morphTarget === 1, focus = defaultVT(circuit), whole = circuit ? circWhole() : { k: 1, x: 0, y: 0 };
    const near = (a, b) => Math.abs(a.k - b.k) < 0.02 && Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1;
    // Judged from where a glide in progress is going, so a second tap toggles as expected.
    const at = vtGliding ? vtTarget : vt;
    const to = circuit && !near(focus, whole) ? (near(at, whole) ? focus : whole) : focus;
    if (!circuit) homeAt = to;
    fitted = true;
    // It glides there, as the zoom buttons do (reduced motion: a short glide).
    animateVT(to, 420);
  };

  // A card or sheet opened or closed: glide to the framing for the space that is now free (not in the lobule, which refits itself).
  function refit() {
    if (lobuleOn || keptNow()) return;
    const to = defaultVT(morphTarget === 1);
    if (morphTarget !== 1) homeAt = to;
    fitted = true;
    // (Mid-measurement the catheter's camera keeps the view: its trip back ends on the new fit instead of the old one.)
    if (cath.saved) { cath.saved = to; return; }
    if (!sameView(to, vtGliding ? vtTarget : vt)) animateVT(to, 420);
  }
  // The Tests card closed. A fitted view (see fitted) is fitted again to the space the card leaves, whatever the tools did
  // with the camera meanwhile; a view the learner zoomed or panned stays where it is, and the home framing is let go so the
  // looks that follow the card leaving (resize, pps:occ) leave it alone too. Every way of closing it (the Tests button, its
  // close button, Esc, a swipe) comes here, so they all end the same. Gives back true when it fits.
  function closeView() {
    if (lobuleOn) return false;
    if (fitted) return true;
    homeAt = null;
    return false;
  }

  // Turn the circuit upright (flow bottom to top) or back to wide. Shown whole, it stays whole (fitted
  // to the new shape); zoomed in, it keeps the zoom and turns about the point at the middle of the
  // free space, which stays where it is on screen.
  let rotHold = null;
  function holdView(hd) {
    const b = stageBox(), vb = svg.viewBox.baseVal, s0 = Math.min(b.sw / vb.width, b.sh / vb.height);
    const ox = b.left + b.sx + (b.sw - vb.width * s0) / 2 - vb.x * s0, oy = b.top + b.sy + (b.sh - vb.height * s0) / 2 - vb.y * s0;
    const k = hd.sc / s0, th = (rotDeg() * Math.PI) / 180, co = Math.cos(th), si = Math.sin(th);
    const dx = hd.w[0] - CIRC_C[0], dy = hd.w[1] - CIRC_C[1];
    const rx = CIRC_C[0] + co * dx - si * dy, ry = CIRC_C[1] + si * dx + co * dy;
    vt = { k, x: (hd.sx - ox) / s0 - k * rx, y: (hd.sy - oy) / s0 - k * ry };
    applyVT(); CTM = null;
  }
  function setCircuitRotated(on) {
    on = on ? 1 : 0;
    try { localStorage.setItem('pps.circuitRot', String(on)); } catch { /* storage unavailable */ }
    if (on === rotTarget) return;
    // Mid-glide (Fit, a zoom button), the turn starts from where the glide was going.
    if (vtGliding) { cancelFrame(vtAnim); vtGliding = false; vt = { ...vtTarget }; applyVT(); CTM = null; }
    const whole = morphTarget !== 1 || vt.k <= 1.001 || sameView(vt, circWhole());
    rotHold = null;
    if (!whole) {
      const ins = safeInsets(), b = stageBox();
      const sx = b.left + (ins.l + ins.W - ins.r) / 2, sy = b.top + (ins.t + ins.H - ins.b) / 2;
      refreshCTM();
      rotHold = { w: clientToWorld(sx, sy), sx, sy, sc: CTM.sc };
    }
    rotTarget = on;
    cancelFrame(vtAnim);
    if (whole) vt = morphTarget === 1 ? circWhole() : { k: 1, x: 0, y: 0 };
    if (morphTarget !== 1 || reduceMotion.matches) { rotU = on; setViewBox(easeInOut(morph)); if (rotHold) { holdView(rotHold); rotHold = null; } }
  }

  // A bottom sheet (the action card on a phone) covers the lower part of the figure. reveal() pans the figure,
  // no more than needed, so the selected structure stays in the part that is left; unreveal() puts the view back
  // when the sheet closes, unless the learner has moved the figure since.
  let revealFrom = null, revealTo = null;
  const sameView = (a, b) => a && b && Math.abs(a.k - b.k) < 0.001 && Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1;
  function reveal(sel, insetBottom) {
    if (!sel || lobuleOn || lz?.isOpen()) return;
    const a = anchorFor(sel);
    if (!a) return;
    const ins = safeInsets();
    const W = wrap.clientWidth, H = wrap.clientHeight, top = Math.max(44, ins.t + 12), bottom = H - Math.max(insetBottom, ins.b) - 18, side = 18;
    if (bottom - top < 80) return;
    // A vessel is kept wholly in view when it fits; one too long for that keeps at least its middle in view.
    let x0 = a.x, x1 = a.x, y0 = a.y, y1 = a.y;
    if (a.r != null) for (const [px, py] of a.path) { x0 = Math.min(x0, px - a.r); x1 = Math.max(x1, px + a.r); y0 = Math.min(y0, py - a.r); y1 = Math.max(y1, py + a.r); }
    if (x1 - x0 > W - 2 * side) { x0 = x1 = a.x; }
    if (y1 - y0 > bottom - top) { y0 = y1 = a.y; }
    const inside = y0 >= top && y1 <= bottom && x0 >= side && x1 <= W - side;
    if (inside) return;
    const s = vbScale();
    const dx = x0 < side ? side - x0 : x1 > W - side ? W - side - x1 : 0;
    const dy = y0 < top ? top - y0 : y1 > bottom ? bottom - y1 : 0;
    if (revealTo && !sameView(vt, revealTo)) revealFrom = null;   // the learner moved the figure: keep it where it is
    if (!revealFrom) revealFrom = { ...vt };
    revealTo = { k: vt.k, x: vt.x + dx / s, y: vt.y + dy / s };
    animateVT(revealTo, 320);
  }
  function unreveal() {
    if (revealFrom && sameView(vt, revealTo)) animateVT(revealFrom, 320);
    revealFrom = revealTo = null;
  }

  // ── Semantic zoom: abdomen → liver → lobule ───────
  // Zooming (wheel, pinch, buttons) only moves the camera: past ×1.9 over the liver its inner
  // trees open (see liverExpanded) and a trail in the corner names the level. The lobule is
  // never entered by zooming alone; it opens only when asked for (the trail's Lobule step, the
  // liver's card, the palette, a presenter step) and cross-fades over the plate.
  let liverBB = null;
  let lobuleOn = false, lobU = 0, lobAnim = 0;
  // Into the lobule, a dive (1.6 s): one continuous zoom from a spot in the liver, gentle at both ends.
  // The anatomy is magnified as it stands (a compositor transform: nothing is redrawn); a field of
  // lobules (few and large, so the zoom stays light) blooms out from that spot over it; the zoom goes on through them and
  // settles onto one, where the lobule's tissue fades in, in place, and then its labels and card.
  // Out, the same in reverse, quicker.
  // The anatomy's own framing is never touched. diveT is the dive's clock, 0 (anatomy) to 1 (lobule).
  let diveAt = null, diveLand = null, diveT = 0, diveOut = false;
  const DIVE_MS = 1600, RISE_MS = 1000;
  let diveZ = 0;   // the dive's zoom so far (log scale), kept for cameraZoom
  let riseLine = false, riseFast = false, zShift = 0;   // (zShift: for cameraZoom, the plate's zoom is reset unseen when the rise begins)
  const RH = 24;   // a lobule's size on screen (px) as the liver's surface gives way to the field
  const LC = Math.log(5);   // the anatomy's share of the zoom (×5), the field's the rest
  const diveEls = () => [svg, wrap.querySelector('#stageOver'), wrap.querySelector('#labels'), vCanvas].filter(Boolean);
  function diveTarget() {
    const lb = liverBox();
    if (!lb) return null;
    return [lb.x + lb.w * 0.42, lb.y + lb.h * 0.5];
  }
  const smoothT = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  // The elements' offsets are read once per dive, before any write: read between writes, each would
  // make the browser lay the page out again, every frame.
  let diveOrig = null, diveHid = false, labHid = false;
  function setDiveHidden(on, lab = on) {
    lab = !!(on || lab);
    if (on === diveHid && lab === labHid) return;
    diveHid = on; labHid = lab;
    for (const el of diveEls()) el.style.visibility = (el.id === 'labels' ? lab : on) ? 'hidden' : '';
  }
  // The anatomy fades out as the field fades in over it (one crossfade, the same curve), and is hidden only once it is fully clear, so
  // nothing pops out of or into view at either end of the zoom. Opacity on layers the zoom already composites costs nothing per frame;
  // their usual .25s opacity transition is held off while it is driven frame by frame (and eases the anatomy back in under the landed lobule).
  let diveFadeO = null;
  function setDiveFade(o) {
    const q = o === null ? null : +o.toFixed(3);
    if (q === diveFadeO) return;
    diveFadeO = q;
    for (const el of diveEls()) { if (el.id === 'labels') continue; el.style.transition = q === null ? '' : 'none'; el.style.opacity = q === null ? '' : String(q); }
  }
  // (keep: landed in the lobule, the anatomy stays hidden under it a moment longer, see diveFrame.)
  let unhideAt = 0;
  function setDiveScale(k, keep = false) {
    if (k <= 1.0001) {
      if (!keep) { setDiveHidden(false, false); setDiveFade(null); }
      // The transform goes first and the layer hint a frame later: dropping both at once can leave the
      // browser showing the last zoomed picture while clicks already land on the unzoomed figure.
      if (diveOrig) { const els = diveOrig.map(([el]) => el); for (const el of els) { el.style.transform = 'none'; el.style.transformOrigin = ''; } nextFrame(() => { if (!diveOrig) for (const el of els) { el.style.willChange = ''; el.style.transform = ''; } }); }
      // The stage's measured box (and so the drawing transform) may have been taken while the dive's zoom
      // was on, which would keep the canvas drawn zoomed in after it ends: measure again.
      if (diveOrig) { box = null; CTM = null; }
      diveOrig = null; return;
    }
    if (!diveOrig) {
      const [ox, oy] = diveAt;
      // From the boxes, not offsetLeft/Top: an SVG has none, and its origin would fall back to its own
      // centre, so the overlays (stents, the Doppler's glow) drifted from the anatomy as it zoomed.
      const w0 = wrap.getBoundingClientRect();
      diveOrig = diveEls().map((el) => { const r = el.getBoundingClientRect(); return [el, `${(ox - (r.left - w0.left)).toFixed(1)}px ${(oy - (r.top - w0.top)).toFixed(1)}px`]; });
      for (const [el, o] of diveOrig) { el.style.willChange = 'transform'; el.style.transformOrigin = o; }
    }
    const tf = `scale(${k.toFixed(4)})`;
    for (const [el] of diveOrig) el.style.transform = tf;
  }
  function diveFrame(t) {
    if (diveAt && diveLand) {
      // The whole zoom in one log scale. The lobule's place is read live, so the field settles exactly
      // where the view frames it.
      if (lz.isShown()) diveLand = lz.current();
      else if (lobuleOn) lz.warm();
      const lt = LC + Math.log(Math.max(RH * 2, diveLand.r) / RH);
      // Eased in and out (smootherstep), one ease over the whole log scale: the anatomy's part and the field's run on at the same
      // speed where they meet. (Each part had its own rate, so the zoom sped up by a sixth or more, suddenly, a third of the way in.)
      // (riseFast: a way out of the landed lobule moves from its first frame; the dive's ease starts at rest and held the lobule
      // still for its first 120-160 ms. A reversal keeps the curve it was on, so nothing jumps.)
      const TJ = riseFast ? 1 : 0.84, u = clamp(t / TJ, 0, 1);
      const p = riseFast ? u * u * (2 - u) : u * u * u * (u * (u * 6 - 15) + 10);
      const z = lt * p;
      diveZ = z;
      // Landed in the lobule: the anatomy under it is shown again only once the lobule has settled and its flow marks have
      // faded in. (Shown in the landing frame, Safari redrew the whole figure there, with everything else the landing does.)
      const landed = t >= 1 && !diveOut;
      setDiveScale(t >= 1 ? 1 : Math.exp(Math.min(z, LC + 0.4)), landed);
      if (landed) { clearTimeout(unhideAt); unhideAt = setTimeout(() => { if (diveT >= 1 && lobuleOn) { setDiveHidden(false, false); setDiveFade(null); } }, 500); }
      setDiveFade(t <= 0 ? null : landed ? 0 : 1 - smoothT(LC * 0.45, LC + 0.3, z));
      // The anatomy's labels leave as the zoom starts.
      const lab = wrap.querySelector('#labels');
      // (Going out they come back over the last half of the zoom, in place, rather than at the very end.)
      if (lab) lab.style.opacity = t <= 0 ? '' : (1 - smoothT(0, diveOut ? 0.55 : 0.12, t)).toFixed(3);
      // The detailed lobule comes in while the zoom is still settling, zooming with the field.
      const r = RH * Math.exp(z - LC);
      const [ox, oy] = diveAt;
      // Going in, the zoom's centre drifts from the dive point to the lobule's place. Going out (riseLine), one straight pull-out:
      // the lobule is scaled about one fixed point, so it leaves its place in step with the zoom and ends on the dive point, with
      // no sideways pan across it first (rise-path.js).
      const g = smoothT(LC - 0.5, lt, z);
      const [px, py] = riseLine ? riseCentre([diveLand.x, diveLand.y], [ox, oy], Math.exp(-lt), Math.exp(z - lt)) : [lerp(ox, diveLand.x, g), lerp(oy, diveLand.y, g)];
      // The detailed lobule rides on the field's own lobule at that centre, so it grows out of it.
      lz.setDiveZoom(t >= 1 ? 1 : clamp(r / diveLand.r, 0.05, 1), diveLand.x, diveLand.y, px, py);
      lz.setDive(t <= 0 || t >= 1 ? null : {
        a: smoothT(LC * 0.45, LC + 0.3, z), x: px, y: py,
        r, ox, oy, quiet: smoothT(0.45, 0.8, t), focus: smoothT(0.1, 0.8, t),
      });
      // Once the field is whole (fully opaque, from z = LC + 0.3) the magnified anatomy beneath it is not seen: it is hidden, so the
      // browser stops compositing it (Safari redraws a scaled SVG at each new scale, every frame); the labels as soon as they have faded.
      if (!landed) setDiveHidden(t > 0 && t < 1 && z >= LC + 0.3, lab && t > 0 && t < 1 && +lab.style.opacity <= 0.001);
    }
    lobU = easeInOut(clamp((t - 0.48) / 0.4, 0, 1));
    syncSemantic();
  }
  // Before the way out of a landed lobule (prepRise, asked for by the presenter as the slide changes): the anatomy under it, still
  // covered, follows the model again and its organs' picture is made for the patient now, so the rise fades in a current picture.
  // (Left as it was under the lobule, the picture held the patient from before the dive: shown through the rise and swapped at
  // landing, the organs changed in one frame; dropped as the rise began, the live drawing showed, scaled up by the zoom, and
  // Safari lost its masked groups, the stomach and gut, until partway down: Mohammad, 20 Oct, HVPG 7 to 8.)
  let risePrep = false, risePrepT = 0;
  function prepRise() {
    if (!lobuleOn || diveT < 1 || morphTarget !== 0 || risePrep) return;
    risePrep = true; clearTimeout(risePrepT); risePrepT = setTimeout(() => { risePrep = false; }, 6000);   // (never left on in the lobule)
    if (F && !inUpdate) update(F);
    platePoke();
  }
  // The organs' picture is made for the patient now (prepRise is done: it ends when that picture lands), or there is none to wait for.
  function riseReady() {
    if (!risePrep || !F || !veins || veins.lost || !glWanted(easeInOut(morph)) || figureHidden() || !lobuleOn) return true;
    return plateOn() && !plateBusy && !lvMoving && !fluidEasing() && !spleenMoving() && plateKey === plateStateKey();
  }
  function setLobule(on) {
    if (on && morphTarget !== 0) return;
    risePrep = false; clearTimeout(risePrepT);
    const from0 = diveT;
    diveOut = !on;
    if (on) { riseBox = null; riseUsed = false; }
    if (lobuleOn === on && diveT === (on ? 1 : 0)) return;
    lobuleOn = on;
    logMove({ t: performance.now(), kind: on ? 'dive' : 'rise' });
    cancelFrame(lobAnim);
    if (on && diveT === 0) {
      riseFast = false; riseLine = false;
      const w = diveTarget();
      if (w) {
        refreshCTM();
        const [x, y] = worldToLocal(w[0], w[1]);
        diveAt = [clamp(x, 0, wrap.clientWidth), clamp(y, 0, wrap.clientHeight)];
      } else diveAt = [wrap.clientWidth / 2, wrap.clientHeight / 2];
      diveLand = lz.landing();
      lz.prewarm(diveLand.r);
      lz.stage();   // the lobule is drawn now, for where it lands, and only then does the zoom start (its clock starts below)
    } else if (!on && diveT >= 1) {
      riseLine = true;   // (kept through a reversal, so the lobule stays on the line it was on)
      riseFast = true;
      lz.stageRise();   // (out of a zoomed-in lobule: its whole copy is drawn now, before the rise's clock starts)
      diveLand = lz.current();
      // The anatomy is covered by the lobule at this point: take it to its fit framing now, unseen, so the way out is one
      // continuous zoom from the lobule's fit to the anatomy's fit, with no correction after it lands.
      if (morphTarget === 0 && liverBox()) {
        // Leaving from the sinusoid, its focus class (main.js) still hides the dock and bars until the store's other
        // listeners run: drop it first, or the fit is measured without them and lands too close, cutting off the ascites.
        if (!store.get().lobule) document.getElementById('app')?.classList.remove('sin-focus');
        cancelFrame(vtAnim); vtGliding = false;
        refreshCTM(); const zOld = Math.log(CTM.sc);
        const d = defaultVT(false); vt = { ...d }; homeAt = d; fitted = true; applyVT(); CTM = null; refreshCTM();
        // The plate stopped updating under the lobule, so it still holds the old zoom's culling and detail: bring it up to date for the fit now, not when the zoom lands.
        if (F && !inUpdate) { catchUp = true; try { update(F); } finally { catchUp = false; } }
        // The next slide's own framing, if it asked for one: the rise lands there, not at the fit.
        const rv = riseVT();
        riseUsed = !!rv && !sameView(rv, d);
        if (riseUsed) { vt = { ...rv }; applyVT(); CTM = null; refreshCTM(); if (F && !inUpdate) { catchUp = true; try { update(F); } finally { catchUp = false; } } }
        zShift = zOld - Math.log(CTM.sc);
        const w = diveTarget(); if (w) { const [x, y] = worldToLocal(w[0], w[1]); diveAt = [clamp(x, 0, wrap.clientWidth), clamp(y, 0, wrap.clientHeight)]; }
        diveOrig = null; drawOnce = forceDraw = true;   // the vessel canvas is frozen for the zoom: redraw it now at the fit, not the old camera
        if (F) updateLabels(F);   // the labels are laid out for the final framing now, so they come in where they will stay
      }
    }
    // (Lite mode: no zoom, the figure fades in at the lobule or the anatomy.)
    // A reversal mid-way glides back from where it is, at the speed of the move it turns round (eased from rest, not at full speed at once).
    const turn = from0 > 0 && from0 < 1, from = diveT, to = on ? 1 : 0;
    const ms = reduceMotion.matches ? 0 : turn ? (on ? RISE_MS : DIVE_MS) : on ? DIVE_MS : RISE_MS;
    const t0 = performance.now();
    const step = (now) => {
      const e0 = ms ? clamp((now - t0) / (ms * Math.abs(to - from) || 1), 0, 1) : 1, e = turn ? e0 * e0 * (3 - 2 * e0) : e0;
      diveT = from + (to - from) * e;
      // A frame that throws must not leave the anatomy stuck mid-zoom: the glide always goes on to its end.
      try { diveFrame(diveT); } catch (err) { if (e < 1) console.error(err); }
      if (e < 1) lobAnim = nextFrame(step);
      else if (on) setTimeout(() => { if (lobuleOn && lz.isOpen()) platePoke(); }, 600);   // the anatomy's raster, held back during the dive, catches up under the lobule
      else if (!on) {
        setDiveScale(1); lz.setDiveZoom(1, 0, 0); diveLand = null;
        zShift = 0;
        // Out of the lobule the anatomy always ends on its full fit, not where the dive began (often the liver close-up).
        // (Already taken to its fit when the way out began; measuring it again here read the floating pieces mid-change and sent the view down, then back.)
        if (riseUsed) riseUsed = false;   // (the rise already landed on the slide's own framing)
        else if (morphTarget === 0) { if (liverBox() && sameView(vt, homeAt || vt)) homeAt = { ...vt }; else { const d = defaultVT(false); homeAt = d; fitted = true; if (!sameView(vt, d)) animateVT(d, 450); } }
      }
    };
    step(t0);
    // Backstop: if the frames stop (a throttled or dropped frame loop), land on the end state anyway.
    clearTimeout(lobEnd);
    lobEnd = setTimeout(() => { if (lobuleOn === on && diveT !== to) { cancelFrame(lobAnim); step(t0 + ms * 2 + 1); } }, ms * Math.abs(to - from) + 250);
  }
  let lobEnd = 0;
  function liverBox() {
    if (!liverBB && organEls.liver) { try { const b = organEls.liver.getBBox(); if (b.width) liverBB = { x: b.x, y: b.y, w: b.width, h: b.height }; } catch { /* not rendered yet */ } }
    return liverBB;
  }
  function vbCenter() { const b = svg.viewBox.baseVal; return [b.x + b.width / 2, b.y + b.height / 2]; }
  function syncSemantic() {
    if (!lz) return;
    // Turning to the circuit closes the lobule view.
    if (lobuleOn && morphTarget !== 0) { lobuleOn = false; lobU = 0; diveT = 0; diveLand = null; lz.setDive(null); lz.setDiveZoom(1, 0, 0); if (diveAt) setDiveScale(1); { const lab = wrap.querySelector('#labels'); if (lab) lab.style.opacity = ''; } cancelFrame(lobAnim); if (store.get().lobule) store.set({ lobule: false }); }
    const u = morphTarget === 0 ? lobU : 0;
    const wasOpen = lz.isOpen();
    lz.setFade(u);
    if (wasOpen && !lz.isOpen() && F && !inUpdate) update(F);
    wrap.classList.toggle('in-lobule', u > 0.98);
  }
  let vtAnim = 0, vtGliding = false;
  const camMoves = [], logMove = (m) => { camMoves.push(m); if (camMoves.length > 60) camMoves.shift(); };   // every glide of the camera (and dive), kept for the tests: a way into or out of the lobule is a single move
  let vtTarget = null;   // where the last animated move was headed
  // A presenter's camera move: the labels ease out as it starts, are not laid out while it runs, and ease
  // back in at their new places once it settles (they never slide across the figure).
  let camMove = false;
  function camSettle() {
    if (!camMove) return;
    camMove = false;
    if (F) updateLabels(F);
    nextFrame(() => { if (!camMove) wrap.classList.remove('cam-move'); });
  }
  function animateVT(to, ms = 700) {
    cancelFrame(vtAnim);
    vtTarget = to;
    const from = { ...vt }, t0 = performance.now();
    if (!sameView(from, to)) logMove({ t: t0, ms, restart: vtGliding, kind: 'glide', zoom: Math.abs(Math.log(to.k / from.k)), pan: Math.hypot(to.x - from.x, to.y - from.y) });
    if (reduceMotion.matches) ms = Math.min(ms, 300);   // (reduced motion: a short glide, never a jump)
    // Lite mode: a jump, and a move that changes the view (not a small refit) fades the figure in at its new framing.
    if (ms <= 0) { vtGliding = false; vt = to; applyVT(); CTM = null; camSettle(); dprLet(); return; }
    vtGliding = true;
    if (store.get().presenting && !sameView(from, to)) { camMove = true; wrap.classList.add('cam-move'); setTimeout(() => { if (!vtGliding) camSettle(); }, ms + 80); } else camSettle();
    dprLet();   // (a probe waiting for the slide's framing: a move hides it till it lands, a refit shows it now)
    const step = (now) => {
      // A newer glide (or a framing set outright) took over: this one stops. A glide started from inside this step's
      // frame (a refit a view change set off) left two running, and the older could land last, where nobody wanted it.
      if (vtTarget !== to) return;
      const u = easeInOut(clamp((now - t0) / ms, 0, 1));
      vt = lerpVT(from, to, u);
      applyVT(); CTM = null;
      // With the catheter in, the vessels, the catheter and its labels follow the camera in this very frame.
      if (cath.st) { refreshCTM(); cathLabels(); if (drawVeins()) drawnView = viewVersion; }
      if (sites.list) { refreshCTM(); sitesPaint(); }
      if (scan.on) scanPaint();
      dprobePaint();
      if (u < 1) vtAnim = nextFrame(step); else { vtGliding = false; camSettle(); }
    };
    vtAnim = nextFrame(step);
  }
  // Interpolate the zoom geometrically so the approach feels even at every scale.
  function lerpVT(from, to, u) {
    const k = from.k * Math.pow(to.k / from.k, u), a = to.k === from.k ? u : (k - from.k) / (to.k - from.k);
    return { k, x: from.x + (to.x - from.x) * a, y: from.y + (to.y - from.y) * a };
  }
  function zoomToBox(x0, y0, x1, y1) {
    fitted = false;
    const k = clamp(Math.min(VIEW.w / (x1 - x0), VIEW.h / (y1 - y0)) * 0.9, 1, 5);
    animateVT({ k, x: VIEW.w / 2 - ((x0 + x1) / 2) * k, y: VIEW.h / 2 - ((y0 + y1) / 2) * k }, 400);
  }
  // The presenter's camera: glide so a box of the plate (world units) fills the space the floating
  // pieces leave, as Fit does for the whole plate, zoomed in no further than kMax.
  // (clear: the box goes entirely into the band the cards leave, however thin: it may zoom out past the usual floor for it.)
  // The camera that frames a box of the plate (world units) in the space the floating pieces leave.
  // While presenting, the presenter names the free area (freeArea: the open rectangles the words, the data card where it
  // comes to rest and the controls leave), and the box is centred in whichever of them shows it largest.
  let freeArea = null, lastFree = null;
  function boxVT([x0, y0, x1, y1], kMax = 4, clear = false) {
    const r = { width: svg.clientWidth, height: svg.clientHeight };
    if (!r.width || !r.height) return null;
    const s0 = Math.min(r.width / VB_ANAT[2], r.height / VB_ANAT[3]), pad = clear ? 12 : 0;   // (clear: a margin for the vessels' glow)
    const fitK = (q) => Math.min(Math.max(40, q.r - q.l - 2 * pad) / s0 / (x1 - x0), Math.max(40, q.b - q.t - 2 * pad) / s0 / (y1 - y0));
    let rects = store.get().presenting && freeArea ? freeArea() : null;
    { const pref = rects?.filter((q) => q.pref && fitK(q) >= (clear ? 0.3 : 0.6)); if (pref?.length) rects = pref; }   // (between the cards, when the box fits there)
    if (!rects?.length) { const ins = safeInsets(clear); rects = [{ l: ins.l, t: ins.t, r: r.width - ins.r, b: r.height - ins.b }]; }
    // (A clearly larger fit wins; within 4% the larger rectangle does, so a near tie never flips the framing about.)
    const score = (q) => Math.min(fitK(q), kMax);
    const area = (q) => (q.r - q.l) * (q.b - q.t);
    const f = rects.reduce((a, q) => (score(q) > score(a) * 1.04 || (score(q) >= score(a) / 1.04 && area(q) > area(a)) ? q : a));
    lastFree = { ...f, box: [x0, y0, x1, y1] };
    const k = clamp(fitK(f), clear ? 0.3 : 0.6, kMax);
    const cx = VB_ANAT[0] + VB_ANAT[2] / 2 + ((f.l + f.r) / 2 - r.width / 2) / s0, cy = VB_ANAT[1] + VB_ANAT[3] / 2 + ((f.t + f.b) / 2 - r.height / 2) / s0;
    return { k, x: cx - k * ((x0 + x1) / 2), y: cy - k * ((y0 + y1) / 2) };
  }
  function frameBox(box, ms = 1300, kMax = 4, clear = false) {
    fitted = false;
    if (morphTarget !== 0) return;
    const to = boxVT(box, kMax, clear);
    if (to && !sameView(to, vtGliding ? vtTarget : vt)) animateVT(to, ms);
  }
  // Where the way out of the lobule lands when the next slide frames somewhere other than the fit: the rise itself
  // zooms straight to that framing, so there is no stop at the fit on the way. The box is asked for when the rise
  // begins (the plate is brought up to date first, so it is measured as it will be). It expires if the lobule was not open to rise from.
  let riseBox = null, riseExp = 0, riseUsed = false;
  function riseTo(box, kMax, clear) { riseBox = box ? { box, kMax, clear } : null; riseExp = performance.now() + 4000; }
  function riseVT() {
    const r = riseBox; riseBox = null;
    if (!r || performance.now() > riseExp) return null;
    const box = typeof r.box === 'function' ? r.box() : r.box;
    return box ? boxVT(box, r.kMax, r.clear) : null;
  }
  function vtFor(wx, wy, k) { const [cx, cy] = vbCenter(); return { k, x: cx - wx * k, y: cy - wy * k }; }
  function zoomLiver() {
    if (store.get().lobule) store.set({ lobule: false });
    const lb = liverBox(); if (!lb) return;
    fitted = false;
    const b = svg.viewBox.baseVal;
    animateVT(vtFor(lb.x + lb.w / 2, lb.y + lb.h / 2, clamp(Math.min(b.width / lb.w, b.height / lb.h) * 0.92, 2, 3)));
  }
  // The lobule is a view of its own (Anatomy · Circuit · Lobule): it opens over the figure and closes
  // only from the view switch, never by zooming out. The anatomy underneath keeps its framing.
  function openLobule(tries = 0) {
    if (morphTarget !== 0) store.set({ view: 'anatomic' });
    // The lobule's code loads after the first paint (lobuleReady): a dive asked for before it is there goes on once it is.
    if (!lz) {
      if (!lzWaiting) {
        lzWaiting = true;
        lobuleReady().then(() => { lzWaiting = false; if (store.get().lobule) openLobule(); }, (err) => { lzWaiting = false; console.error(err); store.set({ lobule: false, sinusoid: false }); });
      }
      return;
    }
    // Right after loading the liver may not be laid out yet: try again shortly.
    // From the circuit, ease into the anatomy first, then dive.
    if (!liverBox() || morphTarget !== 0 || morph > 0.02) { if (tries < 40) setTimeout(() => { if (store.get().lobule) openLobule(tries + 1); }, 120); return; }
    // The anatomy's card (the liver's, usually) would sit over the lobule: the lobule's parts have their own.
    if (store.get().selection && store.get().selection.type !== 'lobule') store.set({ selection: null });
    setLobule(true);
  }
  function closeLobule() { setLobule(false); }
  store.on('lobule', (on) => (on ? openLobule() : closeLobule()));
  const zoomLobule = () => store.set({ lobule: true });
  // The lobule's layer (the zoom, the sinusoid view under it) is built when its code has arrived, which the stage asks for once the
  // figure is on screen and the page has a moment (prepLobule), or at once when a dive is asked for. It takes the place in the page it
  // always had (the anchor), so the layers stack as they did, and reads the frame and the store as they stand. What a presenter slide
  // asked of it before then (lobuleAim) is kept for it.
  const lzAnchor = document.createComment('lobule');
  wrap.append(lzAnchor);
  // (The code is fetched as soon as the figure is shown; the layer is built a moment later, when the page is quiet, or at once for a dive.)
  const lobuleCode = () => (lzCode ||= import('./lobule-zoom.js?v=233e6a43e6').catch((err) => { lzCode = null; throw err; }));
  function lobuleReady() {
    return (lzLoad ||= lobuleCode().then(({ createLobuleZoom }) => {
      lz = createLobuleZoom({ host: wrap, styles: wrapCS, before: lzAnchor });
      if (aimWait) { lz.aim(...aimWait); aimWait = null; }
      if (F) lz.update(F);
      return lz;
    }, (err) => { lzLoad = null; throw err; }));
  }

  // ── Detail ────────────────────────────────────────
  // Detail: the moving blood is drawn on every frame the screen offers (fps 0: 60, 120 or more a second; a frame of it
  // only re-composites the vessel cells) at full resolution, whatever the device, the zoom or the frame time: the figure
  // never steps itself down (the owner, 15 Oct: "0 drop in quality", "120hz persistently"). Only two steps lower it, each
  // explicit: Settings › Battery saver (15 a second at 0.6 of the pixels), and a software renderer (WebGL drawn on the
  // CPU, no usable GPU: 8 a second at half the pixels), where every frame costs CPU the rest of the page needs.
  // (Levels a device once stepped down to were stored under 'pps.quality' and 'pps.q', and an old low one stuck, also on
  // the live site, which shares this origin: both are dropped.)
  const QUALITY = [{ fps: 0, res: 1 }, { fps: 15, res: 0.6 }, { fps: 8, res: 0.5 }], Q_SAVER = 1, Q_SOFTWARE = 2;
  const paceOf = (q) => (QUALITY[q].fps ? 1000 / QUALITY[q].fps : 0);   // (ms between drawn frames of the blood; 0: every frame)
  const SOFTWARE = !!veins?.software;
  try { localStorage.removeItem('pps.quality'); localStorage.removeItem('pps.q'); } catch { /* storage unavailable */ }
  let quality = SOFTWARE ? Q_SOFTWARE : 0;
  // The context is lost (iOS Safari takes it in the background or under memory pressure): the SVG vessels and organs
  // come back at once, as they do whenever the GPU is not wanted (syncVeinsNow with `on` false, which a lost context never
  // reaches). Without this the tubes stayed hidden under a blank canvas until a restore, which Safari may never send.
  // (Pixels as the SVG path draws them; the GPU picture returns with the context.)
  vCanvas.addEventListener('webglcontextlost', () => {
    wrap.classList.remove('gl-on');
    if (wrap.classList.contains('gl-plate')) { wrap.classList.remove('gl-plate'); syncPlateLook(); }
    plateView = null; plateViewKey = ''; plateCopy = null; plateKey = ''; dropViewKeep();
    tubesHidden = false; if (tubesHeld.size) flushTubes();
    if (tubesStale) { tubesStale = false; updateGeometry(true); }
    syncOrganDim();
    vLook = null; vBinKey = ''; binShown = null; bendShown = null; veinsDirty = true;
    stageWake();
  });
  vCanvas.addEventListener('webglcontextrestored', () => {
    veins?.dispose();   // the lost instance's listener goes with it (one per restore otherwise)
    veins = createVeinsGL(vCanvas, { tubes: GL_ROWS, force: true });
    if (!veins) { wrap.classList.remove('gl-on', 'gl-plate'); syncPlateLook(); return; }   // (no context this time: the SVG stays)
    vBinKey = ''; binShown = null; bendShown = null; glOrgans = false; plateKey = ''; tubesShown = null;   // (a new context holds no vessels yet)
    liverKey = '';   // (nor the liver's lower edge the ascites stops at: morphLiver sends it again)
    for (const x of EV) for (const o of [x, ...(x.strands || []), ...(x.feeders || [])]) { o.glRadKey = null; o.glRSent = null; }
    if (F) update(F);
  });
  wrap.dataset.quality = String(quality);
  wrap.dataset.renderer = SOFTWARE ? 'software' : 'gpu';
  let vdpr = 1;
  function resizeCanvas() {
    const r = wrap.getBoundingClientRect();
    vdpr = Math.min(2, devicePixelRatio || 1) * QUALITY[quality].res;
    wrap.dataset.res = vdpr.toFixed(2);   // (the vessel canvas's pixels per CSS pixel, for diagnosis)
    vCanvas.width = Math.max(1, Math.round(r.width * vdpr)); vCanvas.height = Math.max(1, Math.round(r.height * vdpr));
    wrap.classList.toggle('compact', r.height < 600);
    CTM = null; forceDraw = true; stageWake();
    // Resizing clears the canvas, and the organs (the plate) and vessels drawn on it with it: draw
    // them again in the same task. A pinch or a layout change can land after this frame's draw
    // (Safari delivers touches outside the frame loop), and the figure would vanish for a frame.
    if (resizeReady && F && !inUpdate && !(lz?.isOpen() || lz?.covers())) { veinsDirty = true; drawVeins(); }
  }
  new ResizeObserver(resizeCanvas).observe(wrap);
  resizeCanvas(); resizeReady = true;

  // ── Frame state ───────────────────────────────────
  let F = null;            // latest frame
  let hoverId = null;

  // A view may keep each finding (varices, collaterals, clots, flow) off the figure until a test shows it.
  const findingHidden = (k) => { const fd = store.get().found; return !!fd && !fd.has(k); };
  const FINDING_OF = { VAR: 'eso', GV: 'gv' };
  function edgeVisible(x, f) {
    const e = x.e, p = f.viewParams || store.get().params;
    if (ANAT_HIDDEN.has(e.id) && morph < 0.5) return false;
    if (NEEDS_C3.has(e.id)) return !findingHidden('coll') && recruitFrac('C3', f) > 0.15;
    if (e.kind === 'collateral') {
      if (!edgePresent(e, p)) return false;
      if (findingHidden(FINDING_OF[VARIX_CHANNELS[e.id]] || 'coll')) return false;
      return store.get().layers.collaterals || collOpen(e.id, f);
    }
    if (e.kind === 'shunt') {
      if (e.shunt === 'ap') return f.Q[EI[e.id]] > 0.3;
      return f.D[EI[e.id]] > 0;
    }
    return true;
  }
  // A collateral is drawn as open once it has grown noticeably or carries meaningful flow
  // (≥ 0.3 mL/s), so a channel the model is using is never hidden.
  // ?allroutes draws every collateral open, whatever the model says: a check that the circuit's lanes all fit at once.
  const ALL_ROUTES = /[?&]allroutes\b/.test(location.search);
  function collOpen(id, f) {
    if (ALL_ROUTES) return true;
    const k = EI[id];
    return shownFrac(id, f) > 0.12 || Math.abs(f.Qf ? f.Qf[k] : f.Q[k]) > 0.3;
  }
  // The channels that feed and drain the varices (coronary vein → esophageal varices → azygos; short gastric
  // veins → fundal varices) are drawn open whenever the varices exist (see varicesPresent), whatever their own
  // recruitment, so the figure and circuit show the same varices as the endoscopy pane.
  const VARIX_CHANNELS = { C1a: 'VAR', C1b: 'VAR', C2: 'GV' };
  function shownFrac(id, f) {
    const site = VARIX_CHANNELS[id];
    return site ? Math.max(recruitFrac(id, f), varixGrowth(f, site)) : recruitFrac(id, f);
  }
  function recruitFrac(id, f) {
    const e = EDGES[EI[id]];
    const dMin = dMinOf(e);
    return clamp(((f.slow.dEff?.[id] ?? f.slow.d[id]) - dMin) / (e.dMax - dMin), 0, 1);
  }

  // The view box morphs from the anatomy's to the circuit's, wide or (turned) tall.
  function setViewBox(t) {
    const rr = rotEase(rotU), vb = VB_ANAT.map((a, i) => lerp(a, lerp(VB_CIRC[i], VB_CIRC_R[i], rr), t));
    svg.setAttribute('viewBox', vb.map((v) => v.toFixed(1)).join(' '));
    svgOver?.setAttribute('viewBox', svg.getAttribute('viewBox'));
    applyVT();
  }

  let tubesStale = false;
  // `only`: the vessels whose shape changed while the morph stayed put (a collateral coiling); the rest keep their paths.
  function updateGeometry(force, only) {
    const t = easeInOut(morph);
    const full = force || t !== lastMorph;
    if (!full && !only?.length) return;
    geometryVersion++;
    lastMorph = t;
    const svgTubes = !wrap.classList.contains('gl-on');
    if (!svgTubes) tubesStale = true;
    for (const x of full ? EV : only) {
      const g = geo[x.e.id];
      let pts;
      if (t === 0) pts = g.A; else if (t === 1) pts = g.C; else pts = g.A.map((p, i) => [lerp(p[0], g.C[i][0], t), lerp(p[1], g.C[i][1], t)]);
      const base = pts;
      const u0 = STRAND_FROM[x.e.id] || 0;
      if (x.e.kind === 'collateral' && !x.e.spontaneous && t < 1) { const wz = wiggle(pts, g.wig * (1 - t), x.e.id.length); pts = u0 ? blendFrom(base, wz, u0) : wz; }
      // Strands fan out from the shared ends (or from where the trunk breaks up) and fold back
      // onto the lane in the circuit.
      if (x.strands) for (const sd of x.strands) {
        let sp = sd.span ? braid(base, sd.off * (1 - t), 0, sd.span, sd.ph) : wiggle(braid(base, sd.off * (1 - t), u0), (0.8 * g.wig + 3) * (1 - t), sd.ph);
        if (u0) sp = blendFrom(pts, sp, u0);
        sd.u0 = u0;
        const d = polyD(sp);
        sd.wall.setAttribute('d', d); sd.lumen.setAttribute('d', d);
        if (!sd.hit) { sd.hit = s('path', { class: 'v-hit', 'data-id': x.e.id, 'aria-hidden': 'true' }); sd.hit.style.strokeWidth = 12; x.g.append(sd.hit); }   // each strand of a varix is part of its vessel
        sd.hit.setAttribute('d', d); sd.hit.style.display = (sd.live ?? 1) >= 0.5 && morph < 0.5 ? '' : 'none';
        sd.cur = sp; sd.len = arcLen(sp);
      }
      g.cur = pts;
      g.len = arcLen(pts);
      const d = t === 1 ? g.dC : polyD(pts);
      x.halo.setAttribute('d', d); x.hit.setAttribute('d', d);
      // While the GPU draws the tubes their SVG layers are hidden (gl-on): their paths catch up when the SVG shows them again (syncVeins).
      if (svgTubes) {
        x.sel.setAttribute('d', d); x.wall.setAttribute('d', d); x.shadow.setAttribute('d', d);
        if (x.lumen) x.lumen.setAttribute('d', d);
      }
      g.lit = litNormals(pts);
      x.shadeKey = '';
      const a = pts[0], b = pts[pts.length - 1];
      x.grad.setAttribute('x1', a[0]); x.grad.setAttribute('y1', a[1]);
      x.grad.setAttribute('x2', b[0] === a[0] && b[1] === a[1] ? a[0] + 1 : b[0]); x.grad.setAttribute('y2', b[1]);
      if (x.tipFade) {
        // From the tip (nothing) to `frac` of the way along (solid); in the circuit there is no fade.
        const q = pointAt(pts, x.tipFade.frac);
        x.tipFade.line = [a[0], a[1], q[0], q[1]];
        x.tipFade.tg.setAttribute('x1', a[0]); x.tipFade.tg.setAttribute('y1', a[1]);
        x.tipFade.tg.setAttribute('x2', q[0]); x.tipFade.tg.setAttribute('y2', q[1]);
        x.tipFade.s0.setAttribute('stop-opacity', (x.tipFade.joined ? 1 : t).toFixed(2));
      }
    }
    if (!full) return;
    for (const n of NODES) {
      if (!nodeEls[n.id]) continue;
      const [x, y] = nodePos(n.id, t);
      nodeEls[n.id].c.setAttribute('cx', x); nodeEls[n.id].c.setAttribute('cy', y);
    }
    setViewBox(t);
    organMorphA = 1 - t; paintOrganAlpha();
    gGhost.style.opacity = String(1 - t);
    gAscites.style.opacity = String(1 - t);
    svg.classList.toggle('circuit', t > 0.5);
    svgOver?.classList.toggle('circuit', t > 0.5);
    // The circuit is a dark hemodynamic map; the anatomy an atlas plate on paper.
    stageWrap.classList.toggle('cmap', t > 0.5);
    gGrid.style.opacity = String(t);
    gNodes.style.opacity = String(t);
    gFxC.style.opacity = String(t);
    // (Faded out whole, the circuit's grid and dots are hidden too (app.css, once their fade has run): at opacity 0 Safari still
    // painted the grid's patterned frames under the anatomy on every frame the figure moved.)
    gGrid.classList.toggle('gone', t === 0); gNodes.classList.toggle('gone', t === 0);
    CTM = null;
  }
  const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

  // ── Update from frame ─────────────────────────────
  let inUpdate = false;
  // The anatomy opens fitted to everything it draws, once the first frame has drawn it; a view the
  // learner has already zoomed or panned is left alone.
  // Every zoom out of the anatomy (the first frame, Fit, back from the circuit) goes to the same home
  // framing, measured from what is drawn. While the view is still at home it follows what is drawn:
  // when ascites fills the pelvis or the spleen grows, home grows with it and the view follows.
  let firstFit = false, homeAt = null, homeCheck = 0, userMoved = false;
  // A patient has arrived and none is on its way (opening one from Home, the first frames are still the last one's).
  const patientArrived = () => ((store.get().historyTick || 0) > 0 || !!store.get().booted) && !store.get().presetLoading;
  let patientReady = patientArrived();
  store.on('historyTick', () => { patientReady = patientArrived(); });
  store.on('presetLoading', () => { patientReady = patientArrived(); });
  store.on('booted', () => { patientReady = patientArrived(); firstFrame(); });
  wrap.classList.add('unframed');
  // The loading screen (index.html) waits for this: the figure framed, faded in and on screen.
  let figureShown = false;
  const showFigure = () => {
    wrap.classList.remove('unframed');
    if (figureShown) return;
    figureShown = true;
    nextFrame(() => nextFrame(() => setTimeout(() => { window.ppsFigureReady = true; dispatchEvent(new Event('pps:figure-ready')); }, 260)));
  };
  setTimeout(showFigure, 4000);   // never left hidden
  function firstFrame() {
    if (firstFit || !F || !(morphTarget === 1 || patientReady)) return;
    firstFit = true;
    nextFrame(() => {
      // (Set outright, so a glide still under way (a refit as the bars came in) stops here: left running it never landed,
      // stayed 'gliding' for good, and the zoom-out spring and the pans' bounds waited on it, so a pinch out stayed stuck.)
      // (While presenting, the slide's framing is the presenter's: set outright here it jumped the figure off the slide's framing,
      // after the start's cover had lifted when the patient came late. Shown already (the 4 s backstop), the figure glides to its fit.)
      if (morphTarget === 0 && !userMoved && !store.get().presenting) {
        const d = defaultVT(false);
        if (figureShown) { homeAt = d; fitted = true; if (!sameView(d, vtGliding ? vtTarget : vt)) animateVT(d, 450); }
        else { cancelFrame(vtAnim); vtGliding = false; vt = { ...d }; homeAt = d; vtTarget = { ...d }; fitted = true; applyVT(); CTM = null; }   // (three views, not one object: see zoomAt)
      }
      showFigure();
    });
  }
  // The lobule is made ready while the anatomy sits idle (its tiles, tissue, WebGL and a first frame), so the dive
  // into it only places what is already drawn instead of building it mid-zoom. Checked about once a second; the
  // pieces run one per idle moment and stop as soon as a dive or the circuit begins.
  let prepBusy = false, prepAt = 0;
  // A piece of the lobule's preparation takes tens of ms on a phone: it waits until the page has been left alone a moment
  // (no touch, wheel or key for 0.7 s), so it never lands in the middle of a pan, a pinch or a tap's response.
  let inputAt = -1e9;
  for (const ev of ['pointerdown', 'pointermove', 'wheel', 'keydown']) addEventListener(ev, (e) => { if (ev !== 'pointermove' || e.buttons) inputAt = performance.now(); }, { passive: true, capture: true });
  // A finger or button still down, held still or not: the pictures made after a pan or pinch wait until it lifts (Mohammad, 21 Oct:
  // "hitch as soon as I stop panning", finger still down). (A mouse let go outside the window is seen on its next move; a press
  // held over 5 s with no input stops counting, so nothing waits for a lost release.)
  const pressed = new Set();
  addEventListener('pointerdown', (e) => pressed.add(e.pointerId), { passive: true, capture: true });
  for (const ev of ['pointerup', 'pointercancel']) addEventListener(ev, (e) => pressed.delete(e.pointerId), { passive: true, capture: true });
  addEventListener('pointermove', (e) => { if (!e.buttons) pressed.delete(e.pointerId); }, { passive: true, capture: true });
  addEventListener('blur', () => pressed.clear());
  const leftAlone = (ms) => !(pressed.size && performance.now() - inputAt < 5000) && performance.now() - inputAt >= ms;
  const prepIdle = (fn) => {
    const go = () => (performance.now() - inputAt < 700 ? setTimeout(go, 400) : window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 600 }) : setTimeout(fn, 50));
    setTimeout(go, 0);
  };
  function prepLobule() {
    if (!lz) {   // (the lobule's code comes once the figure is on screen and the page is quiet; the first dive is prepared as soon as it is built)
      if (figureShown && !lzLoad && !lzSoon) { lzSoon = true; lobuleCode().catch(() => {}); prepIdle(() => lobuleReady().then(() => prepLobule(), (err) => console.warn('The lobule view did not load.', err))); }
      return;
    }
    const now = performance.now();
    if (prepBusy || !figureShown || now - prepAt < 1000) return;
    prepAt = now;
    const calm = () => morphTarget === 0 && morph < 0.02 && !lobuleOn && diveT === 0 && !vtGliding;
    if (!calm() || figureHidden()) return;
    const q = lz.preparePieces();
    if (!q.length) return;
    prepBusy = true;
    const run = () => {
      if (!lobuleOn && diveT === 0 && morphTarget === 0 && (!calm() || figureHidden())) { prepIdle(run); return; }   // busy for now: later
      if (lobuleOn || diveT > 0 || morphTarget !== 0 || !lz.prepareRun(q)) { prepBusy = false; return; }
      prepIdle(run);
    };
    prepIdle(run);
  }
  let catchUp = false, wAt = 0, widthEasing = false;
  // (What the last full update was drawn from, and whether a coil or an organ was still easing then: see stepWidths.)
  let widthF = null, widthVer = -1, widthCTM = null, coilEasing = false, organsEasing = false, storeVer = 0;
  // A presenter's slide change holds the fit still while it runs: the words leaving or arriving change the space the camera
  // frames into, and a fit that followed them would glide the figure before the slide's own move (a dive, a rise) starts.
  let homeHeld = 0;
  function holdHome(on) { homeHeld = Math.max(0, homeHeld + (on ? 1 : -1)); }
  function update(f) {
    stageWake();
    inUpdate = true;
    try { gpuProbe.time(null, 'update (script)', () => updateInner(f)); } finally { inUpdate = false; fxAt = null; }
    // (Hidden, no animation frame comes to draw the vessels again: they are drawn now, so the canvas never keeps colours the
    // page no longer has, as after a change of the device's light or dark setting in the background.)
    if (plateRedraw || (document.hidden && veinsDirty)) { plateRedraw = false; drawVeins(); }
    // The first framing waits for the patient (the first frames are drawn before it has loaded, without its
    // ascites or spleen), and the figure stays hidden until it is framed, so it appears once, in place.
    firstFrame();
    prepLobule();
    followHome();
  }
  // While the view is at home, home follows what is drawn and the space the cards leave: checked on the model's frames
  // (at most every 500 ms) and once a resize or a turn of the device has settled, which needs no model frame (paused, a
  // turned phone or iPad kept the old shape's framing: under the top bar, or off screen behind the Tests sheet).
  // (Not while a move away from home is under way: its first frames still sit at home. A glide on its way home is retargeted.)
  // (The look measures the organs' boxes and the cards' (a forced layout in the middle of the model's frames, about 22 ms twice
  // a second on a slowed phone): it is taken only while something it measures may have moved, see layoutWatch, and once
  // whenever the view comes back home.)
  let wasHome = false;
  function followHome(now = performance.now()) {
    if (homeResizeT) return;   // (a resize still settling: its own look comes once it has)
    const home = !!homeAt && !homeHeld && morphTarget === 0 && !lobuleOn && diveT === 0 && (sameView(vt, homeAt) || (vtGliding && sameView(vtTarget, homeAt))) && (!vtTarget || sameView(vtTarget, homeAt));
    if (home && !wasHome) watch.touch();
    wasHome = home;
    if (home && now - homeCheck > 500 && watch.due()) {
      homeCheck = now;
      if (keptNow()) return;   // (the Tests card alone has changed the space: see keepView)
      const d = defaultVT(false);
      if (!sameView(d, homeAt)) { homeAt = d; fitted = true; animateVT(d, 400); }
    }
  }
  // (The first look when the size has held for 200 ms: a turn fires several resizes, and a glide after each moved the camera
  // two or three times. Then a look 0.5 s and 1.3 s after, and whenever a card or sheet announces a new place (pps:occ),
  // each only if the view is still at home: a sheet or a card takes its new shape a moment after the turn, and the first
  // look measured the space it left before it had. A slide is the presenter's to frame, on a resize too.)
  let homeResizeT = 0, homeLateT = [], homeOccT = 0;
  const lookHome = () => { if (!store.get().presenting) { homeCheck = 0; watch.touch(); followHome(); } };
  addEventListener('resize', () => {
    clearTimeout(homeResizeT); homeLateT.forEach(clearTimeout);
    homeResizeT = setTimeout(() => { homeResizeT = 0; lookHome(); homeLateT = [500, 1300].map((ms) => setTimeout(lookHome, ms)); }, 200);
  });
  addEventListener('pps:occ', () => { clearTimeout(homeOccT); homeOccT = setTimeout(lookHome, 150); });

  // Hidden under the lobule or the sinusoid, the anatomy and the circuit are not drawn, but they go on following the patient:
  // the liver's shape, congestion and tint and the ascites ease on the same clock, with no drawing, so on the way out they show
  // the state reached by then (part way if the change is still easing), not an ease that only starts from the patient before.
  // (since: when it was covered; pAt: the last change of the patient's settings while covered, from which the quicker eases
  // and a vessel's drawing on or off are timed when it is shown again.)
  const hid = { at: 0, since: 0, p: null, pAt: 0 };
  function followHidden(f) {
    const now = performance.now(), dt = hid.at ? (now - hid.at) / 1000 : 0, p = f.viewParams || store.get().params;
    if (!hid.at) hid.since = now;
    else if (p !== hid.p) hid.pAt = now;
    hid.at = now; hid.p = p;
    easeLiver(f, p, dt);
    const asc = fluidTarget(ascTarget, f.slow.ascites);
    if (ascTarget === null) ascShown = asc;
    ascTarget = asc;
    if (ascShown !== ascTarget) ({ shown: ascShown, vel: ascVel } = fluidSpringFor(ascShown, ascVel, ascTarget, dt));
  }
  // What follows from a vessel's drawn width (its hit stroke, casing, lumen, the liver branches, braided strands and drawn-in
  // tributaries): written by the model's update and by the width step between model frames (stepWidths) alike.
  function widthWrites(x, w, t, f, k) {
    const e = x.e;
    // The hit stroke is never thinner than the drawn tube (the IVC is wide, behind the liver) and never under ~10 px on screen.
    { const narrow = CONTEXT_EDGES.has(e.id) || BACK_EDGES.has(e.id), hw = Math.round(Math.max(narrow ? 8 : 20, w + 6, 10 / ((CTM && CTM.sc) || 1))); if (x.hitW !== hw) { x.hitW = hw; x.hit.style.strokeWidth = hw; } }
    if (x.isArt) { setT(x.wall, 'stroke-width', w.toFixed(1)); return; }
    const wallPx = x.wallPx;
    setT(x.wall, 'stroke-width', (w + 2 * wallPx).toFixed(1));
    setA(x.lumen, 'stroke-width', w.toFixed(1));
    if (x.cbr) for (const cb of x.cbr) cb.w = Math.max(1.2, w * cb.k);
    if (x.strands) x.strands.forEach((sd, i) => {
      setT(sd.lumen, 'stroke-width', Math.max(1.6, w * sd.k).toFixed(1)); setT(sd.wall, 'stroke-width', (Math.max(1.6, w * sd.k) + 2 * wallPx).toFixed(1));
      sd.bead = e.id === 'C1a' ? Math.round(varixBead(f.metrics?.varix?.d) * (1 - t) * 100) / 100 : 0;   // (in hundredths: the radii are sent again only when it moves a step)
      sd.live = e.code === 'C1' ? clamp(i + 1 - (f.bands || 0), 0, 1) : e.id === 'C8' ? clamp(1 + 4 * clamp((recruitFrac('C8', f) - 0.15) / 0.7, 0, 1) - i, 0, 1) : 1;   // cavernoma: one strand beside the main channel when acute, the rest grow in with the remodeling
      const vis = sd.live > 0.02 ? '' : 'none', sop = sd.live * (SIN_EDGES.has(e.id) ? SIN_PERFUSION.fade : 1), op = sop < 1 ? sop.toFixed(2) : '';
      for (const el of [sd.lumen, sd.wall]) { if (el.style.display !== vis) el.style.display = vis; if (el.style.opacity !== op) el.style.opacity = op; }
    });
    if (x.feeders) {
      const cfg = FEEDERS[e.id];
      let live = 1;
      if (cfg.when === 'caudate') {
        const ref = store.get().healthy?.Q?.[k], q = Math.abs(f.Qf ? f.Qf[k] : f.Q[k]);
        live = ref ? clamp((q / Math.abs(ref) - 2) / 2, 0, 1) : 0;
      } else if (cfg.when === 'caput') {
        // Caput medusae: the epigastric network fills in as the paraumbilical route opens.
        live = clamp((recruitFrac('C3', f) - 0.15) / 0.3, 0, 1);
      }
      // A trunk that a collateral carries on (the azygos, with the ascending lumbar veins) is
      // connected: it is drawn to its end; otherwise it fades out.
      const conn = FEEDER_CONNECTOR[e.id], joined = !!conn && collOpen(conn, f);
      x.feedJoined = joined;
      for (const fd of x.feeders) {
        if (fd.fadeMask) for (const el of [fd.wall, fd.lumen]) { if (joined) el.removeAttribute('mask'); else if (!el.hasAttribute('mask')) el.setAttribute('mask', fd.fadeMask); }
        const lv = fd.when ? live : 1;   // only the conditional feeders come and go
        const fw = Math.max(1.2, w * cfg.k * fd.fk * (fd.when ? 0.5 + 0.5 * lv : 1));
        fd.live = lv; fd.w = fw;
        setT(fd.lumen, 'stroke-width', fw.toFixed(1)); setT(fd.wall, 'stroke-width', (fw + 2 * wallPx).toFixed(1));
        const vis = lv > 0.02 ? '' : 'none', op = lv < 1 ? lv.toFixed(2) : '';
        for (const el of [fd.lumen, fd.wall]) { if (el.style.display !== vis) el.style.display = vis; if (el.style.opacity !== op) el.style.opacity = op; }
      }
    }
  }
  function updateInner(f) {
    // In the lobule, or diving into it (the anatomy is only magnified, then covered), the plate is left as it is
    // (reading the cards' boxes and restyling it each model frame stalled the zoom); it catches up on the way out,
    // with its eases already where they have got to (followHidden).
    const under = (lobuleOn || lz?.isOpen()) && !catchUp && !risePrep;
    // The cards' boxes, read at most every 100 ms (each read forces a layout in the middle of the model's frames);
    // a card that opens, closes or moves announces itself (pps:occ, resize) and is read at once.
    // (And only while one of them may have moved: layoutWatch.)
    if (!under && (blockersStale || (performance.now() - blockersAt > 100 && watch.due()))) { blockerBoxes = readBlockers(); blockersAt = performance.now(); blockersStale = false; }
    F = f;
    holdReversals(f);
    lz?.update(f);
    if (under) { followHidden(f); return; }
    // Widths and coils ease toward their targets in time (~0.25 s), not per model update. Shown again after being covered,
    // they have eased for as long as they were covered since the patient's settings last changed.
    const nowW = performance.now();
    let dtW = Math.min(0.1, (nowW - (wAt || nowW)) / 1000);
    if (hid.at) { followHidden(f); dtW = (nowW - Math.max(wAt, hid.pAt)) / 1000; fxAt = Math.max(hid.since, hid.pAt); plateStale = true; hid.at = 0; hid.p = null; hid.pAt = 0; }
    const kW = -Math.expm1(-dtW / 0.25);
    wAt = nowW; widthEasing = false; coilEasing = false; organsEasing = false;
    tubesHidden = wrap.classList.contains('gl-on');
    const st = store.get();
    const p = f.viewParams || st.params;
    const t = easeInOut(morph);
    const gain = lerp(1, 0.8, t);
    const ref = REF();
    // The circuit shown small (a phone, the whole map): every lane grows by the same factor, so the
    // widest stays about 10 px on screen; capped so neighbouring lanes stay apart.
    if (!CTM) refreshCTM();
    const circBoost = clamp(10 / (15 * (CTM?.sc || 1)), 1, 1.75);
    const imaging = isImaging();
    const mode = layerMode();
    wrap.classList.toggle('imaging', imaging);
    // Data layers other than pressure quiet the anatomy so the network carries the reading.
    wrap.classList.toggle('data-layer', !['pressure', 'neutral'].includes(mode));
    if (wrap.dataset.layer !== mode) wrap.dataset.layer = mode;   // unchanged writes still queue a mutation and restyle [data-layer]
    // Colored by oxygen: each vessel's saturation at its two ends (the sinusoids darken toward the central vein).
    const oxy = mode === 'oxygen' ? oxygenFor(EDGES, NODES, f).edge : null;

    // collateral tortuosity
    const coiling = [];
    for (const x of EV) {
      if (x.e.kind !== 'collateral' || x.e.spontaneous || STRAIGHT_COLL.has(x.e.id)) continue;
      const w = shownFrac(x.e.id, f) > 0.25 ? 1.5 + 3.5 * shownFrac(x.e.id, f) : 0;
      // Eased toward its target (a change of over 0.6 starts it), so the vessel coils gradually.
      const g = geo[x.e.id];
      if (g.wigT == null || Math.abs(w - g.wigT) > 0.6) g.wigT = w;
      if (g.wig !== g.wigT) { const d = g.wigT - g.wig; g.wig = Math.abs(d) < 0.03 ? g.wigT : g.wig + d * kW; coiling.push(x); if (g.wig !== g.wigT) widthEasing = coilEasing = true; }
    }
    gpuProbe.time(null, 'update: geometry', () => updateGeometry(false, coiling));

    for (const x of EV) {
      const e = x.e;
      let vis = edgeVisible(x, f);
      const wasDrawn = !!x.drawn;   // on screen in the previous frame (not merely flagged visible)
      // A vessel that leaves (a collateral that closes, a shunt that is removed) retracts along its
      // flow, the way it drew on, and is hidden when it is done; it is held visible until then.
      if (x.reveal?.out) vis = true;
      else if (!vis && x.vis && wasDrawn && canFade(x) && !x.reveal && !x.g.classList.contains('coll-ghost') && !quietFx()) { startExit(x, f); vis = true; }
      if (vis !== x.vis) { setStyle(x, 'display', vis ? '' : 'none'); x.vis = vis; }
      if (!vis) { x.drawn = false; continue; }
      if (x.tipFade && TIP_CONNECT[e.id]) {
        // Drawn solid to its end while something attaches there; otherwise it fades.
        const joined = TIP_CONNECT[e.id].some((c) => E[c]?.vis && collOpen(c, f));
        if (joined !== x.tipFade.joined) { x.tipFade.joined = joined; x.tipFade.s0.setAttribute('stop-opacity', (joined ? 1 : easeInOut(morph)).toFixed(2)); }
      }
      x.drawn = true;   // it has been on screen, so leaving it is worth animating
      const k = EI[e.id];
      const D = f.D[k];
      const PM = f.Pf || f.P;
      const P1 = PM[NI[e.from]], P2 = PM[NI[e.to]];
      // Anatomy: width follows diameter (compressed). Circuit: a narrower, more uniform range,
      // as on a transit map, so the lines stay even and legible.
      const wA = e.kind === 'liver' ? (e.zone === 'sin' || e.zone === 'inter' || e.zone === 'post' ? 3.6 : 5.2) : vesselPx(IVC_EDGES.has(e.id) ? f.D[EI.IVC_IS] : D) * (IVC_EDGES.has(e.id) || e.id === 'SVC_RA' ? 0.72 : 1);   // the IVC is one tube: one caliber end to end
      const wC = (e.kind === 'liver' ? 8 : clamp(vesselPx(D) * 0.95, 6, 15)) * circBoost;
      let w = lerp(wA, wC, t);
      // Flow layer: width follows flow volume (∝ √Q), like traffic volume on a city map.
      if (mode === 'flow' && !x.isArt) w = clamp(2.2 + 8.5 * Math.sqrt(Math.abs(f.Qf ? f.Qf[k] : f.Q[k]) * 0.06), 2.2, 22);
      if (x.isArt) w = lerp(Math.max(1.8, vesselPx(D) * 0.5), 3, t);
      // Band ligation strangles the esophageal varices: each band thromboses a channel and the
      // rest shrink (the model raises the route's resistance by the same count).
      if (e.code === 'C1' && f.bands > 0 && t < 1) w *= 1 - 0.14 * Math.min(4, f.bands);
      // The periportal collaterals (cavernoma) are fine channels, thinner than the caliber their flow alone would draw.
      if (e.id === 'C8') w *= lerp(0.6, 1, t);
      // The spontaneous splenorenal shunt never reads fatter than the splenic vein it leaves.
      if (e.id === 'C6' && mode !== 'flow' && EI.V_SPL != null) w = Math.min(w, lerp(vesselPx(f.D[EI.V_SPL]), clamp(vesselPx(f.D[EI.V_SPL]) * 0.95, 6, 15) * circBoost, t));
      // The caudate vein hypertrophies when it becomes the liver's outflow (Budd–Chiari).
      if (e.id === 'CAUD' && t < 1) { const ref = store.get().healthy?.Q?.[k]; if (ref) w *= 0.8 * clamp(Math.sqrt(Math.abs(f.Qf ? f.Qf[k] : f.Q[k]) / Math.abs(ref)), 1, 1.8); }
      // A vessel leaving keeps its width. While the views morph, the width follows the morph frame by frame.
      // Otherwise the model's width is the target on every model frame (no dead-band: the breath never stops and
      // starts), and the drawn width follows it on every display frame (followWidth).
      if (x.reveal?.out && x.width != null) x.wT = x.w1 = x.width;
      else if (x.width == null || (t > 0 && t < 1)) x.wT = x.w1 = x.width = w;
      else { followWidth(x, dtW); x.wT = w; }   // (up to now under the target it had, then the new one: the same curve at any frame rate)
      if (widthMoving(x)) widthEasing = true;
      w = x.width;
      x.wMode = mode;
      // The liver's own small vessels (portal venules, central veins) are the liver to the pointer in the anatomy:
      // no hover, no tap on them; it falls through to the organ. The sinusoids are a vessel of their own.
      cls(x, 'no-hit', LIVER_EDGES.has(e.id) && !SIN_EDGES.has(e.id) && t < 0.5);
      if (!x.isArt) {
        const baseD = IVC_EDGES.has(e.id) ? E.IVC_IS.e.d : e.d || (e.dMax ? dMinOf(e) : 3);   // one wall thickness along the whole cava
        // The circuit is a map: a slightly wider border (drawn by the GPU, as one shape with filleted
        // joins) gives its lines their weight.
        const wallT = (e.kind === 'liver' ? 0.7 : clamp(0.9 * Math.sqrt(baseD / Math.max(0.3, D)), 0.8, 1.6)) * (1 + 0.45 * t);
        if (x.wallPx == null || Math.abs(wallT - x.wallPx) >= 0.1) x.wallPx = Math.round(wallT * 20) / 20;
      }
      widthWrites(x, w, t, f, k);
      if (x.isArt) continue;
      let c1, c2;
      if (mode === 'pressure') { c1 = pressureColor(qHold(mode, k, 0, P1)); c2 = pressureColor(qHold(mode, k, 1, P2)); }
      else if (mode === 'drop') { c1 = c2 = dropColor(P1 - P2); }
      else if (mode === 'direction') { const rev = reversedShown(e); c1 = c2 = rev ? 'var(--flow-reversed)' : 'var(--flow-normal)'; }
      else if (mode === 'flow') { c1 = c2 = flowColor(Math.abs(f.Qf ? f.Qf[k] : f.Q[k]) * 0.06); }
      else if (mode === 'velocity') { c1 = c2 = e.kind === 'liver' ? 'var(--lens-neutral)' : velColorOf(f, k, store.get().healthy); }
      else if (mode === 'oxygen') { c1 = oxygenColor(oxy[2 * k]); c2 = oxygenColor(oxy[2 * k + 1]); }
      else if (mode === 'heat') { c1 = heatColor(ref ? qHold(mode, k, 0, P1 - ref[NI[e.from]]) : 0); c2 = heatColor(ref ? qHold(mode, k, 1, P2 - ref[NI[e.to]]) : 0); }
      else if (mode === 'system') { c1 = c2 = SYSTEM_COLOR[systemOf(e, PORTAL_TERRITORY)]; }   // (a slide's vein system, deck visuals V7: the same on every patient)
      else if (mode === 'neutral') { c1 = c2 = PORTAL_TERRITORY.has(e.from) || PORTAL_TERRITORY.has(e.to) ? 'var(--vein-portal)' : 'var(--vein-systemic)'; }
      else { c1 = deltaColor(ref ? qHold(mode, k, 0, P1 - ref[NI[e.from]]) : 0); c2 = deltaColor(ref ? qHold(mode, k, 1, P2 - ref[NI[e.to]]) : 0); }
      setA(x.st0, 'stop-color', c1); setA(x.st1, 'stop-color', c2);
      x.col = [c1, c2];
      if (x.feeders) for (const fd of x.feeders) {
        if (fd.src) { fd.col = [mode === 'pressure' ? pressureColor(qP(PM[NI[fd.src]])) : c1, c1]; setA(fd.st0, 'stop-color', fd.col[0]); setA(fd.st1, 'stop-color', c1); }
        else if (FEEDERS[e.id].tone === 'end') { fd.col = [c2, c2]; setT(fd.lumen, 'stroke', c2); }   // a network that leaves the vessel's end takes that end's color
      }
      // Flow marks are white on dark lumens and ink on pale ones.
      x.inkDark = mode === 'pressure' ? luminance(pressureColor((P1 + P2) / 2)) > 0.36 : luminance(c1) > 0.36;
      if (e.kind === 'collateral') {
        const fr = shownFrac(e.id, f);
        const qa = Math.abs(f.Qf ? f.Qf[k] : f.Q[k]);
        const openNow = collOpen(e.id, f);
        if (!openNow && wasDrawn && !x.g.classList.contains('coll-ghost') && !x.reveal && !quietFx()) startExit(x, f);
        cls(x, 'coll-ghost', !openNow && !x.reveal?.out);
        x.opa = isOccluded(p, e.id) ? 0.45 : 0.3 + 0.7 * Math.min(1, Math.max(fr * 2.5, qa / 1.5));
        setLevel(x, nearestLevel(x.opa));
      }
      x.rev = REVERSAL_WATCH.has(e.id) && reversedShown(e);
      if (x.rev && (!st.imaging || !!st.found?.has('flow'))) revShown.add(e.id); else revShown.delete(e.id);
      const selOn = (st.selection?.type === 'edge' && st.selection.id === e.id) || (st.selection?.type === 'node' && SIN_EDGES.has(e.id) && LABEL_VESSEL[st.selection.id] === e.id);   // a side's station dot is its sinusoids
      x.sel.classList.toggle('on', selOn);
      cls(x, 'is-sel', selOn);
      if (selOn) setT(x.sel, 'stroke-width', (w + 12).toFixed(1));
      x.dopW = w;
    }
    // The selected vessel glows as a hovered one does, a little stronger and wider, fading out at its free ends (no ring
    // with hard round ends); a selected side's sinusoids glow as one soft band over the whole network. Eased in and out by
    // the glow engine, as the brightening and the network's dimming are (vhStep, stepPlateEase).
    {
      const sl = st.selection, sv = sl?.type === 'node' && SIN_EDGES.has(LABEL_VESSEL[sl.id]) ? LABEL_VESSEL[sl.id] : sl?.type === 'edge' ? sl.id : null;
      const ids = sv && E[sv] ? (IVC_EDGES.has(sv) ? [...IVC_EDGES] : [sv]).filter((id) => E[id]?.vis) : [];
      const key = ids.join();
      if (key !== vh.selKey) {
        vh.selKey = key; vh.sel = new Set(ids);
        setGlowSrc('sel', ids.map((id) => (SIN_EDGES.has(id) ? { id, col: null, amt: 1.5, wide: 1.2, dur: 450 } : { id, col: null, amt: 1.5, wide: 0.6, dur: SEL_FADE * 1000 })));
        if (!vh.raf) { vh.t = performance.now(); vh.raf = nextFrame(vhStep); }
      }
    }
    // Junction widths: where vessels meet, the largest narrows to the second largest and the
    // others widen toward it, so calibers change smoothly through every junction.
    const jw = {};
    for (const x of EV) {
      if (!x.vis || x.isArt || x.g.classList.contains('coll-ghost')) continue;
      (jw[x.e.from] ||= []).push(x.width); (jw[x.e.to] ||= []).push(x.width);
    }
    const J = {};
    for (const [n, ws] of Object.entries(jw)) { ws.sort((a, b) => b - a); J[n] = ws[1] ?? ws[0]; }
    // Detect newly opened collaterals before the tubes are built: a revealing vessel is drawn as a
    // dashed stroke from its first frame (never first as a full tube that then vanishes).
    trackChanges(f, p);
    stepReveals(performance.now());
    gpuProbe.time(null, 'update: tubes', () => { for (const x of EV) if (x.vis && !x.isArt) renderTube(x, p, t, J); });
    if (glWanted(t)) clearJoins(); else updateJoins(t);
    // A selected vessel stays bright while the rest of the network recedes.
    wrap.classList.toggle('has-sel', st.selection?.type === 'edge' && !!E[st.selection.id]?.vis);
    syncLift();
    syncVeins(t);
    updateOrganSel(st.selection, t);
    gpuProbe.time(null, 'update: nodes', () => updateNodesCircuit(f));
    gpuProbe.time(null, 'update: overlays', () => updateOverlays(f, p, gain, t));
    updateFocus();
    dopApply();
    gpuProbe.time(null, 'update: bridges', () => updateBridges(t));
    gpuProbe.time(null, 'update: labels', () => updateLabels(f));
    gpuProbe.time(null, 'update: organs', () => updateOrgans(f, p, t));
    gpuProbe.time(null, 'update: slide marks', () => fxSync(f, t));
    widthF = f; widthVer = storeVer; widthCTM = CTM;
  }

  // A vessel's drawn width follows the model's through two exponential eases in series (tau 0.2 s each: critically damped).
  // Each step is the exact solution for the time elapsed (the lag behind the target decays as (e2 + e1 t/tau) e^(-t/tau)),
  // and a new target is taken only after stepping up to its arrival, so the width and its speed change continuously and
  // trace the same curve at 60 or 120 Hz; a model frame's new target (10 a second) bends the speed instead of jumping it.
  const W_TAU = 0.2;
  function followWidth(x, dt) {
    if (x.w1 == null) x.w1 = x.width;
    if (x.wT == null || x.width == null) return false;   // (no target yet: the caller sets the first one after this)
    if (x.width === x.wT && x.w1 === x.wT) return false;
    const u = Math.max(0, dt) / W_TAU, a = Math.exp(-u), e1 = x.w1 - x.wT, e2 = x.width - x.wT;
    x.w1 = x.wT + e1 * a; x.width = x.wT + (e2 + e1 * u) * a;
    if (Math.abs(x.wT - x.w1) < 0.005 && Math.abs(x.w1 - x.width) < 0.005) x.w1 = x.width = x.wT;
    return true;
  }
  function widthMoving(x) { return x.width !== x.wT || x.w1 !== x.wT; }
  // How far a lumen edge moves (canvas px) before the vessel layer draws it again: each width and radius the tubes are keyed on
  // is kept until what it follows has moved that far. A tenth of a canvas pixel (a twentieth of a CSS pixel) at any zoom: the
  // edge glides in sub-pixel steps, and the model's sub-pixel wobble redraws nothing.
  const EDGE_STEP = 0.1;
  function edgeQ() { const cpx = CTM ? vdpr * Math.hypot(CTM.a, CTM.b) : 0; return cpx > 0 ? EDGE_STEP / cpx : 0.01; }
  // (o[k] is kept until v has moved by q from it; a zoom that makes q less than half the step it was kept at takes it exact,
  // and so does q = 0, which the callers pass once the vessel's width is at rest: a settled figure is drawn exactly.)
  function keep(o, k, v, q) { const was = o[k]; if (was == null || Math.abs(v - was) >= q || q < o[k + 'Q'] / 2) { o[k] = v; o[k + 'Q'] = q; } return o[k]; }
  // The width step's vessel-layer sync: the radii alone. It stands in for syncVeins only when nothing else the whole sync
  // writes can differ from what it last wrote (the glow-only sync's own test, glowOnlyOk, with no glow or plate ease under
  // way and no vessel crossing the sheen's 3.4 width); a vessel outgrowing its binned reach takes the whole sync (it re-bins).
  function syncRadiiOnly(t) {
    return gpuProbe.time(null, 'radius sync (script)', () => {
      if (glowSync || plateEasing() || !glowOnlyOk(t)) return false;
      const m = glowMemo, items = m.items;
      for (let i = 0; i < items.length; i++) if ((items[i].x.width >= 3.4) !== m.wide[i]) return false;
      sendRadii(items);
      for (const it of items) if (Math.ceil((it.obj.glMaxR + (it.x.wallPx || 1) + 18) / 2) * 2 > (vBinReach.get(it.row) || 0)) return false;
      // (A ligated vein's divided stretch is as long as the vein is wide (divideLen): its drawn start, tube texel 5, follows the width.)
      let lig = false;
      for (const it of items) {
        if (it.kind !== 'v' || !LIGATED.some((l) => l[1] === it.x.e.id)) continue;
        const o = it.row * TUBE_TEXELS * 4 + 20, lo = Math.fround(Math.max(0, divideLen(it.x.e.id) / (it.len || geo[it.x.e.id].len || 1)));
        if (tubeData[o] !== lo) { tubeData[o] = lo; tubesShown[o] = lo; veinsRows.add(it.row); lig = true; }
      }
      if (lig) veins.setTubes(tubeData);
      return true;
    });
  }
  // Between the model's frames, while only vessel widths are still easing (the breath moves the cava's and the hepatic veins'
  // targets by half a pixel or more on every breath, so they seldom rest), each display frame steps the widths and writes only
  // what follows from them: the strokes, the tubes and their joins, the vessel layer's radii, the bridges, the narrowings'
  // marks, and the labels when a width has moved far enough to lay them out again (sigWidth). Everything else the update
  // computes comes from the model's frame and the settings, which have not changed since the last full update, so it would be
  // written again with the same values. Anything else under way (a new frame or setting, a pan, a coil, the liver or the fluid
  // easing, a vessel drawing on or off, a card moving, the lobule) takes the full update, as before: the same picture, frame
  // for frame, for less work.
  function stepWidths() {
    const f = F;
    if (!f || f !== widthF || storeVer !== widthVer || !CTM || CTM !== widthCTM || coilEasing || organsEasing || catchUp) return false;
    if (lobuleOn || lz?.isOpen() || hid.at || plateStale || plateRedraw || blockersStale || (performance.now() - blockersAt > 100 && watch.due())) return false;
    if (ascShown !== ascTarget || morph !== morphTarget || tubesHidden !== wrap.classList.contains('gl-on') || EV.some((x) => x.reveal)) return false;
    stageWake();
    inUpdate = true;
    try { gpuProbe.time(null, 'width step (script)', () => stepWidthsInner(f)); } finally { inUpdate = false; fxAt = null; }
    firstFrame();
    prepLobule();
    followHome();
    return true;
  }
  // In the same way, while the organs ease (the liver's shape, its tint) and no vessel width, coil, reveal or view moves, each
  // display frame between the model's frames steps the organs alone (updateOrgans: the liver, the spleen, the fluid, their masks):
  // the rest of the update reads only the model's frame, the settings and the view, unchanged since the last full update, and
  // nothing in it follows the liver's ease (the organs' anchors are fixed, the spleen's size is the model's). External review,
  // 21 Oct: the whole update, the labels' layout read included, ran on every frame of an ease. The same picture, frame for frame.
  function stepOrgans() {
    const f = F;
    // (A pan moves no drawn size, and the view's own frame lays the labels out again (syncView): it takes this step too. A zoom or a
    // turn changes the sizes kept in screen pixels, and takes the full update.)
    if (!organsEasing || !f || f !== widthF || storeVer !== widthVer || !CTM || !widthCTM || CTM.sc !== widthCTM.sc || CTM.a !== widthCTM.a || CTM.b !== widthCTM.b || coilEasing || catchUp) return false;
    if (lobuleOn || lz?.isOpen() || hid.at || plateStale || blockersStale || (performance.now() - blockersAt > 100 && watch.due())) return false;
    if (morph !== morphTarget || tubesHidden !== wrap.classList.contains('gl-on') || EV.some((x) => x.reveal || (x.vis && widthMoving(x)))) return false;
    stageWake();
    inUpdate = true;
    try {
      gpuProbe.time(null, 'organ step (script)', () => {
        const t = easeInOut(morph);
        widthEasing = organsEasing = false;
        updateOrgans(f, f.viewParams || store.get().params, t);
        // (What the width step lays out every frame, it does here too: the site labels, a scan, a slide's moving camera, TIPS or DIPS.)
        if (sites.list || scan.on || camMove || E.TIPS?.vis || E.DIPS?.vis) updateLabels(f);
        if (fx) fxSync(f, t);
      });
    } finally { inUpdate = false; fxAt = null; }
    if (plateRedraw) { plateRedraw = false; drawVeins(); }
    firstFrame();
    prepLobule();
    followHome();
    return true;
  }
  function stepWidthsInner(f) {
    const nowW = performance.now(), dt = Math.min(0.1, (nowW - (wAt || nowW)) / 1000);
    wAt = nowW; widthEasing = false;
    lvAt = nowW;   // (the liver's ease clock: a full update after width steps eases from this frame, not from the last full update)
    const t = easeInOut(morph);
    let moved = false, labels = !!sites.list || scan.on || !!camMove || !!E.TIPS?.vis || !!E.DIPS?.vis;
    for (const x of EV) {
      if (!x.vis || !followWidth(x, dt)) continue;
      if (widthMoving(x)) widthEasing = true;
      moved = true;
      const w = x.width;
      widthWrites(x, w, t, f, EI[x.e.id]);
      if (x.isArt) continue;
      if (x.sel.classList.contains('on')) setT(x.sel, 'stroke-width', (w + 12).toFixed(1));
      x.dopW = w;
      if (!labels) { const sw = sigW.get(x.e.id); labels = sw == null || Math.abs(w - sw) >= 2; }
    }
    if (!moved) return;
    const jw = {};
    for (const x of EV) {
      if (!x.vis || x.isArt || x.g.classList.contains('coll-ghost')) continue;
      (jw[x.e.from] ||= []).push(x.width); (jw[x.e.to] ||= []).push(x.width);
    }
    const J = {};
    for (const [n, ws] of Object.entries(jw)) { ws.sort((a, b) => b - a); J[n] = ws[1] ?? ws[0]; }
    const p = f.viewParams || store.get().params;
    for (const x of EV) if (x.vis && !x.isArt) renderTube(x, p, t, J);
    if (glWanted(t)) clearJoins(); else updateJoins(t);
    if (!syncRadiiOnly(t)) syncVeins(t);
    updateOverlays(f, p, lerp(1, 0.8, t), t);
    updateBridges(t);
    if (labels) updateLabels(f);
    if (fx) fxSync(f, t);
  }

  // Each vein is a filled tube whose radius eases from the junction width at either end to its
  // own caliber (and narrows at a stenosis), with the shading of a lit cylinder. The circuit,
  // closed collaterals and vessels being drawn on use plain strokes. Recomputed only when a
  // width, a lesion or the geometry changes.
  const smooth = (u) => u * u * (3 - 2 * u);
  function renderTube(x, p, t, J) {
    const g = geo[x.e.id], id = x.e.id, w = x.width, wallPx = x.wallPx;
    const v = isImaging() ? 0 : p.stenosis[id] || 0;
    const sten = v > 0.01;
    const stroked = x.g.classList.contains('coll-ghost') || !!x.reveal || (t >= 0.5 && !sten);
    cls(x, 'sten', sten); cls(x, 'stroked', stroked);
    const lim = x.e.kind === 'collateral' ? 1.3 : 1.7;
    // A large shunt tapers into the smaller vein it drains into instead of butting onto it.
    const lo = x.e.spontaneous ? 0.4 : 0.5;
    // On the GPU each vessel keeps its own caliber to its ends: the fillet rounds a fork, and where one
    // vessel runs on into the next both ends ease to meet (see smoothRunOn), so no tube swells or pinches
    // beside a join. The SVG tubes ease their ends to the junction width instead.
    const gpu = glWanted(t);
    const endW = (n) => (J[n] && !stroked && (!gpu || GPU_EASE[id] === n) ? clamp(J[n], w * lo, w * lim) : w);
    // A shunt drawn onto the side of a vein (SIDE_HOSTS) narrows at that end to the vein's own caliber, so its round
    // end stays inside the vein instead of bulging out of the far wall.
    const hostW = (i) => { const hs = SIDE_HOSTS[id]?.[i].filter((h) => E[h]?.vis).map((h) => E[h].width); return hs?.length ? clamp(Math.max(...hs), w * 0.4, w) : null; };
    const a = (!stroked && hostW(0)) || endW(x.e.from), b = (!stroked && hostW(1)) || endW(x.e.to);
    // On the GPU its end inside the vein then narrows further (fork-joins.js sideEndScale), so the round end stays clear
    // of the far wall: the hosts' radii at each end, or 0.
    const hostR = (i) => { const hs = SIDE_HOSTS[id]?.[i].filter((h) => E[h]?.vis).map((h) => E[h].width); return gpu && !stroked && SIDE_INSIDE[id]?.[i] && hs?.length ? Math.max(...hs) / 2 : 0; };
    const qw = widthMoving(x) ? 2 * edgeQ() : 0;
    keep(x, 'kw', w, qw); keep(x, 'ka', a, qw); keep(x, 'kb', b, qw);
    keep(x, 'kh0', hostR(0), qw); keep(x, 'kh1', hostR(1), qw);
    const key = `${x.kw},${x.ka},${x.kb},${x.kh0},${x.kh1}|${wallPx.toFixed(2)}|${sten ? v.toFixed(3) + '@' + stenosisAt(id, p) : ''}|${lastMorph}|${stroked}|${gpu}`;
    if (key === x.shadeKey) return;
    x.shadeKey = key;
    const f = sten ? waist(id, v, g.len, w, p) : null;
    const h0 = x.kh0, h1 = x.kh1, L = g.len || 1;
    x.rOf = (u) => {
      const r = u < 0.3 ? lerp(a, w, smooth(u / 0.3)) : u > 0.7 ? lerp(w, b, smooth((u - 0.7) / 0.3)) : w;
      const side = (h0 ? sideEndScale(u * L, h0) : 1) * (h1 ? sideEndScale((1 - u) * L, h1) : 1);
      return Math.max(0.35, (r / 2) * (f ? f(u) : 1) * side);
    };
    // The GPU draws the tube from rOf; the SVG outlines are built only when the SVG shows them.
    if (gpu) return;
    const pts = g.cur, lit = g.lit;
    if (!stroked) {
      const casing = tubeOutline(pts, lit, (u) => x.rOf(u) + wallPx);
      x.wallP.setAttribute('d', casing);
      x.shadow.setAttribute('d', casing);
      x.lumenP.setAttribute('d', tubeOutline(pts, lit, x.rOf));
    }
    if (stroked || w < 3.4 || t >= 0.999 || sten) { x.sheen.removeAttribute('d'); x.shade.removeAttribute('d'); return; }
    // Highlights are filled ribbons that taper to nothing at both ends, so they dissolve into the
    // junction instead of stopping short of it and starting again on the next vessel.
    const wm = Math.min(w, a, b);
    const taper = (u) => smooth(clamp(u / 0.22, 0, 1)) * smooth(clamp((1 - u) / 0.22, 0, 1));
    x.sheen.setAttribute('d', tubeOutline(litOffset(pts, lit, wm * 0.2), lit, (u) => wm * 0.12 * taper(u)));
    x.shade.setAttribute('d', tubeOutline(litOffset(pts, lit, -wm * 0.24), lit, (u) => wm * 0.19 * taper(u)));
  }

  // Joins across layers: within a layer the casings lie under all the lumens, so vessels that meet
  // merge. Where a vein ends on vessels drawn in a lower layer (a translucent context vein, one
  // behind the organs), its round end and casing would sit on top of them as a ringed disc. That
  // end instead dissolves into the vessel beneath over the length of its cap, unless it runs on
  // into a vessel of its own layer. Found from the drawn courses, which need not end at the nodes.
  const joinRank = (x) => (x.back ? 0 : 10) + (x.level ?? 1);
  const shown = (y) => y.vis && !y.isArt && !y.g.classList.contains('coll-ghost');
  // Distance from q to a drawn course; `body`: only to its length, not beyond either end.
  function distTo(pts, q, body) {
    let best = Infinity;
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], dx = pts[i][0] - ax, dy = pts[i][1] - ay;
      const v = ((q[0] - ax) * dx + (q[1] - ay) * dy) / (dx * dx + dy * dy || 1);
      if (body && ((i === 1 && v < 0) || (i === pts.length - 1 && v > 1))) continue;
      const u = clamp(v, 0, 1);
      best = Math.min(best, Math.hypot(ax + dx * u - q[0], ay + dy * u - q[1]));
    }
    return best;
  }
  // For each vein end, the other veins whose course passes within reach of it, with the distance.
  // Built from the anatomy's courses (joins are drawn only there).
  let near = null, nearVersion = -1;
  function buildNear() {
    const xs = EV.filter((x) => !x.isArt && geo[x.e.id].cur);
    const box = new Map(xs.map((x) => {
      const P = geo[x.e.id].cur;
      return [x, [Math.min(...P.map((q) => q[0])) - 14, Math.min(...P.map((q) => q[1])) - 14, Math.max(...P.map((q) => q[0])) + 14, Math.max(...P.map((q) => q[1])) + 14]];
    }));
    near = new Map();
    for (const x of xs) {
      const P = geo[x.e.id].cur;
      near.set(x, [P[0], P[P.length - 1]].map((q) => {
        const out = [];
        for (const y of xs) {
          const b = box.get(y);
          if (y === x || q[0] < b[0] || q[0] > b[2] || q[1] < b[1] || q[1] > b[3]) continue;
          const d = distTo(geo[y.e.id].cur, q);
          if (d < 14) out.push([y, d]);
        }
        return out;
      }));
    }
  }
  // A vein's end: the end point, the direction out of the vessel there, and its outer radius.
  function endFrame(x, i) {
    const pts = geo[x.e.id].cur;
    const R = (x.rOf ? x.rOf(i) : x.width / 2) + x.wallPx + 1;
    const end = i ? pts[pts.length - 1] : pts[0];
    let k = i ? pts.length - 2 : 1;
    while (k > 0 && k < pts.length - 1 && Math.hypot(pts[k][0] - end[0], pts[k][1] - end[1]) < R) k += i ? -1 : 1;
    const l = Math.hypot(end[0] - pts[k][0], end[1] - pts[k][1]) || 1;
    return { end, R, tx: (end[0] - pts[k][0]) / l, ty: (end[1] - pts[k][1]) / l };
  }
  const JOIN_FADE = 1.1;   // outer radii over which an end fades, short of the junction
  // Which ends of a vein (0, 1) fade into a vessel beneath that runs on past them.
  function joinEnds(x, t) {
    if (t >= 0.5 || !near?.has(x) || !shown(x) || x.reveal) return [];
    const r = joinRank(x), ends = [];
    near.get(x).forEach((list, i) => {
      const cand = list.filter(([y, d]) => shown(y) && d < y.width / 2 + 1.5).map(([y]) => y);
      const lower = cand.filter((y) => joinRank(y) < r);
      if (!lower.length) return;
      const { end, R, tx, ty } = endFrame(x, i);
      // Its own tributaries are drawn with it (the azygos trunk into the arch) and would fade too.
      if (x.feeders?.some((fd) => [fd.cur[0], fd.cur[fd.cur.length - 1]].some((c) => Math.hypot(c[0] - end[0], c[1] - end[1]) < 2 * R))) return;
      const at = (k) => [end[0] + tx * k * R, end[1] + ty * k * R];
      const covers = (ys, q) => ys.some((y) => distTo(geo[y.e.id].cur, q, true) < y.width / 2);
      // Just past the end: a vessel of its own layer (or nearer) that runs on there merges with
      // it (a small one, such as a collateral, does not cover the end); nothing beneath running on means a blind end, which keeps its round end.
      const ahead = at(0.15);
      if (covers(cand.filter((y) => joinRank(y) >= r && y.width >= 0.6 * x.width), ahead) || !covers(lower, ahead)) return;
      ends.push(i);
    });
    return ends;
  }
  function updateJoins(t) {
    if (t === 0 && nearVersion !== geometryVersion) { buildNear(); nearVersion = geometryVersion; }
    for (const x of EV) {
      const ends = joinEnds(x, t);
      const pts = geo[x.e.id].cur;
      const key = ends.length && pts ? ends.join() + '|' + Math.round(x.width) + '|' + geometryVersion : '';
      if (key === (x.joinKey || '')) continue;
      x.joinKey = key;
      if (!key) { for (const g of x.groups) g.removeAttribute('mask'); continue; }
      if (!x.join) {
        const id = x.e.id;
        const m = s('mask', { id: `jm-${id}`, maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: VIEW.w, height: VIEW.h });
        m.append(s('rect', { x: 0, y: 0, width: VIEW.w, height: VIEW.h, fill: '#fff' }));   // colour-exempt: a mask
        x.join = [0, 1].map((i) => {
          const gr = s('linearGradient', { id: `jg-${id}-${i}`, gradientUnits: 'userSpaceOnUse' });
          gr.append(s('stop', { offset: '0', 'stop-color': '#fff' }), s('stop', { offset: '1', 'stop-color': '#000' }));   // colour-exempt: a mask
          const box = s('path', { fill: `url(#jg-${id}-${i})` });
          defs.append(gr); m.append(box);
          return { gr, box };
        });
        defs.append(m);
      }
      for (const i of [0, 1]) {
        const { gr, box } = x.join[i];
        if (!ends.includes(i)) { box.removeAttribute('d'); continue; }
        const { end, R, tx, ty } = endFrame(x, i);
        // From solid a little short of the junction to gone just past it, so no part of the round
        // end or its outline is left: the vein turns into the vessel that carries on beneath.
        const s0 = -JOIN_FADE * R, s1 = 0.3 * R, w = R + 2;
        const at = (a, b) => [end[0] + tx * a - ty * b, end[1] + ty * a + tx * b];
        gr.setAttribute('x1', at(s0, 0)[0].toFixed(1)); gr.setAttribute('y1', at(s0, 0)[1].toFixed(1));
        gr.setAttribute('x2', at(s1, 0)[0].toFixed(1)); gr.setAttribute('y2', at(s1, 0)[1].toFixed(1));
        const c = [at(s0 - 1, -w), at(R + 4, -w), at(R + 4, w), at(s0 - 1, w)];
        box.setAttribute('d', 'M' + c.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L') + ' Z');
      }
      for (const g of x.groups) g.setAttribute('mask', `url(#jm-${x.e.id})`);
    }
  }

  // ── Vessels on the GPU (veins-gl.js) ─────────────────
  // In the anatomy every vessel (veins in every tier, arteries, cavernoma strands, tributaries,
  // closed collaterals, vessels drawing on, the congestion glow), in the anatomy and in the
  // circuit, is drawn by veins-gl.js; the SVG keeps only the hit strokes, and builds its tubes
  // only for an exported SVG figure (or where WebGL2 is missing altogether).
  // Tiers, back to front: the retroperitoneal stacks and opaque layer (behind the organs), the
  // arteries, the translucent stacks, the opaque network, the portal tree in front, the focus.
  const TIER_BACK0 = 0, TIER_BACK = 7, TIER_ART = 8, TIER_MID0 = 9, TIER_NET = 16, TIER_FRONT = 17, TIER_LIFT = 18, TIER_LIFT_FRONT = 19;
  const TIER_GROUP = Array.from({ length: MAX_TIERS }, (_, i) => (i <= TIER_BACK ? 0 : i < TIER_LIFT ? 1 : 2));
  const TIER_ALPHA = Array.from({ length: MAX_TIERS }, (_, i) => (i < TIER_BACK ? LEVELS[i] : i >= TIER_MID0 && i < TIER_NET ? LEVELS[i - TIER_MID0] : 1));
  const levelTier = (x) => {
    const l = x.level ?? 1;
    if (l >= 1) return x.back ? TIER_BACK : x.front ? TIER_FRONT : TIER_NET;
    return (x.back ? TIER_BACK0 : TIER_MID0) + Math.max(0, LEVELS.indexOf(l));
  };
  // Rows of the per-vessel textures: the model's vessels, then every strand, tributary and liver branch.
  {
    for (const [id, list] of Object.entries(treeGeo)) if (E[id]) E[id].cbr = list.map(({ pts, k }) => ({ cur: pts, k, w: 0 }));
    let row = ALL_EDGES.length;
    for (const e of ALL_EDGES) {
      const x = E[e.id];
      for (const sd of x.strands || []) sd.row = row++;
      for (const fd of x.feeders || []) fd.row = row++;
      for (const cb of x.cbr || []) cb.row = row++;
    }
  }
  const tubeData = veins ? new Float32Array(GL_ROWS * TUBE_TEXELS * 4) : null;
  let cathTint = null;   // the HVPG's wedged vein, recolored (see cathPaint)
  const ORIGIN_LUMEN = [ORIGIN_GREY, ORIGIN_GREY, ORIGIN_GREY];   // the lumen while the blood is colored by origin (the GPU paints the streams on it)
  const binMemo = new Map();
  let binShown = null, bendShown = null;
  // A coiling collateral's cells are tested against its points when the coil began, reaching farther by as much as the coil
  // still has to go (each point moves toward its coiled place by at most the change in amplitude), so they list it wherever
  // it draws until the coil settles: every model frame of the coil writes its new points over the last binning (binVeins'
  // patch) instead of binning every vessel again (round 2 review, G1-3). Settled, or moved past that (a new target), it is
  // binned on its own points again. (A vessel listed in a cell it does not reach draws nothing there: the 1.25 headroom of a
  // widening vein, below, lists such cells too.)
  const binFrom = new Map();
  // How far a vessel's lumen can reach, for the cells the moving blood is drawn in each frame (binVeins' `blood`): the reach
  // less the 18 it adds for the casing, shadow and glow (reachOf), plus BLOOD_PAD. A vessel whose widest radius (glMaxR) and
  // wall outgrow its reach is binned again (syncVeins, syncRadiiOnly), so this is always at least glMaxR + its wall + BLOOD_PAD,
  // past the lumen's edge, which antialiases half a pixel out (veins-gl aL): half a pixel is under 6 world units even for the
  // whole circuit at its smallest zoom (K_MIN) in a small window on a 1x screen, drawn at half resolution (a software
  // renderer). Elsewhere in its cells nothing changes from frame to frame.
  const BLOOD_PAD = 6;
  function binTube(it, pts) {
    const reach = vBinReach.get(it.row), g = it.x.e.kind === 'collateral' ? geo[it.x.e.id] : null;   // (its strands and feeders too)
    const core = reach - 18 + BLOOD_PAD;
    // (A collateral that never coils, spontaneous or straight, has no target: wigT stays unset, and a reach of
    // NaN from it spoilt the whole binning's bounds, so no vessel drew at all: the outflow talk's caval collateral, 18 Oct.)
    if (!g || g.wigT == null || g.wig === g.wigT) { binFrom.delete(it.row); return { id: it.row, pts, reach, core }; }
    let a = binFrom.get(it.row);
    if (a && a.pts.length === pts.length) {
      let far = 0;
      for (let i = 0; i < pts.length && far <= a.m; i++) far = Math.max(far, Math.hypot(pts[i][0] - a.pts[i][0], pts[i][1] - a.pts[i][1]));
      if (far > a.m) a = null;
    } else a = null;
    if (!a) binFrom.set(it.row, a = { pts: pts.map((q) => q.slice()), m: Math.ceil(Math.abs(g.wigT - g.wig) * 2 + 1) / 2 });
    return { id: it.row, pts, bin: a.pts, reach: reach + a.m, core: core + a.m };
  }
  let vBinKey = '', vBinReach = new Map(), veinsDirty = true, veinsDrawKey = '', vLook = null, glOrgans = false;
  const veinsRows = new Set();   // vessel rows whose attributes changed since the vessel layer was drawn (only those, while veinsDirty is false)
  let plateDim = null, plateSat = 1, netA = 1;
  // A lens switch crossfades every vessel from the colors it showed to the new lens's (no one-frame recolor).
  let shownCol = new Map(), lensFrom = null, lensT0 = 0, lensMode = null;
  let sinceP = null;   // (a "change since" slide's reference: see changeRef)
  const JUMP_MMHG = 2;
  let jumpP = null, jumpF = null;
  function modelJumped(f) {
    if (!f || f === jumpF) return false;
    jumpF = f;
    const P = f.Pf || f.P;
    if (!P) return false;
    let big = false;
    if (jumpP && jumpP.length === P.length) for (let i = 0; i < P.length; i++) if (Math.abs(P[i] - jumpP[i]) > JUMP_MMHG) { big = true; break; }
    if (!jumpP || jumpP.length !== P.length) jumpP = new Float64Array(P.length);
    jumpP.set(P);
    return big && shownCol.size > 0;
  }
  const LENS_FADE = 300;
  const lensFading = () => !!lensFrom && performance.now() - lensT0 < LENS_FADE + 20;
  const colorCtx = veins ? document.createElement('canvas').getContext('2d') : null;
  const rgbCache = new Map();
  // Any CSS color (rgb(), #hex, a named var) as [r, g, b] in 0–1.
  function toRGB(c, cs) {
    const m = /^var\((--[\w-]+)\)$/.exec(c || '');
    const v = m ? cs.getPropertyValue(m[1]).trim() : c;
    let out = rgbCache.get(v);
    if (out) return out;
    colorCtx.fillStyle = '#000'; colorCtx.fillStyle = v || '#000';   // colour-exempt: the parser's reset
    const f = colorCtx.fillStyle;
    if (f[0] === '#') out = [1, 3, 5].map((i) => parseInt(f.slice(i, i + 2), 16) / 255);
    else { const k = f.match(/[\d.]+/g).map(Number); out = [k[0] / 255, k[1] / 255, k[2] / 255]; }
    rgbCache.set(v, out);
    return out;
  }
  const mix3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  const cssNum = (cs, name, dflt) => { const v = parseFloat(cs.getPropertyValue(name)); return Number.isFinite(v) ? v : dflt; };
  const cssTriplet = (cs, name) => { const k = cs.getPropertyValue(name).trim().split(/[\s,/]+/).map(Number); return k.length >= 3 && k.every(Number.isFinite) ? k.slice(0, 3).map((v) => v / 255) : [0, 0, 0]; };
  /** Whether the GPU draws the vessels (always, except while an SVG export is built). */
  const glWanted = () => !!veins && !veins.lost;

  // What the GPU draws this frame: each vessel on screen, its strands and its tributaries. Strands
  // and tributaries lie where the anatomy has them, so the circuit leaves them out (as the SVG did).
  function glItems() {
    const items = [];
    const anat = morph < 0.5;
    for (const x of EV) {
      const pts = geo[x.e.id].cur;
      if (!x.vis || !pts || (!x.isArt && !x.rOf)) continue;
      items.push({ x, obj: x, row: x.row, pts, kind: 'v' });
      // The liver's branches lie where the circuit has them, so the anatomy leaves them out.
      if (!anat && x.cbr) for (const cb of x.cbr) if (cb.w) items.push({ x, obj: cb, row: cb.row, pts: cb.cur, kind: 'c' });
      if (!anat || x.isArt || x.g.classList.contains('coll-ghost')) continue;
      for (const sd of x.strands || []) if (sd.cur && (sd.live ?? 1) > 0.02) items.push({ x, obj: sd, row: sd.row, pts: sd.cur, kind: 's' });
      for (const fd of x.feeders || []) if ((fd.live ?? 1) > 0.02 && fd.w) items.push({ x, obj: fd, row: fd.row, pts: fd.cur, kind: 'f' });
    }
    // The cava is drawn as one vessel: its two stretches (below and above the hepatic veins) are two
    // edges of the model, but one tube on screen, with one course, one shading and one chevron track.
    // Drawn where they would meet, two capped ends layered as an arc, a band and a seam.
    const a = items.find((it) => it.kind === 'v' && it.x.e.id === 'IVC_IS'), b = items.find((it) => it.kind === 'v' && it.x.e.id === 'IVCS_RA');
    if (a && b && a.pts.length > 1 && b.pts.length > 1) {
      const P = a.pts, Q = b.pts, q = P[P.length - 1], La = geo.IVC_IS.len || arcLen(P), Lb = geo.IVCS_RA.len || arcLen(Q);
      // Re-sampled evenly by arc length to the usual count of samples (a sample's index is its place along the vessel).
      const C = P.concat(Math.hypot(Q[0][0] - q[0], Q[0][1] - q[1]) < 0.5 ? Q.slice(1) : Q), cum = [0];
      for (let i = 1; i < C.length; i++) cum.push(cum[i - 1] + Math.hypot(C[i][0] - C[i - 1][0], C[i][1] - C[i - 1][1]));
      const L = cum[cum.length - 1] || 1;
      a.pts = Array.from({ length: N_SAMPLES }, (_, i) => {
        const d = (L * i) / (N_SAMPLES - 1);
        let j = 1;
        while (j < C.length - 1 && cum[j] < d) j++;
        const t = cum[j] > cum[j - 1] ? clamp((d - cum[j - 1]) / (cum[j] - cum[j - 1]), 0, 1) : 0;
        return [C[j - 1][0] + (C[j][0] - C[j - 1][0]) * t, C[j - 1][1] + (C[j][1] - C[j - 1][1]) * t];
      });
      a.ra = b.x; a.f = La / (La + Lb); a.len = La + Lb; a.endNode = b.x.e.to;
      items.splice(items.indexOf(b), 1);
    }
    return items;
  }
  // Lumen radius along an item, and the key it changes with.
  function itemRadii(it) {
    const { x, kind } = it;
    if (kind === 'v' && it.ra) {
      const { ra, f } = it;
      return [`${x.shadeKey}|${ra.shadeKey}|${f.toFixed(4)}`, (i) => { const u = i / (N_SAMPLES - 1); return u < f ? x.rOf(u / f) : ra.rOf((u - f) / (1 - f)); }];
    }
    if (kind === 'v' && !x.isArt) return [x.shadeKey, (i) => x.rOf(i / (N_SAMPLES - 1))];
    const r = kind === 'v' ? Math.max(0.5, x.width / 2) : kind === 's' ? Math.max(1.6, x.width * it.obj.k) / 2 : it.obj.w / 2;
    // (A varix strand beaded by the varix's size: varix-bead.js.)
    const b = kind === 's' ? it.obj.bead || 0 : 0, o = it.obj;
    keep(o, 'kr', r, widthMoving(x) ? edgeQ() : 0);
    const rk = String(o.kr);
    if (b > 0) return [`${rk}|${b}|${Math.round(o.len || 0)}`, (i) => beadRadius(r, b, i / (N_SAMPLES - 1), o.len || 1, o.ph * 1.7, o.u0 || 0)];
    // (A sinusoid strand narrows across its stretch: sin-perfusion.js.)
    if (kind === 's' && SIN_EDGES.has(x.e.id)) { const w = x.width; return [`${r.toFixed(2)}|${w.toFixed(2)}|sin`, (i) => sinStrandRadius(r, w, i / (N_SAMPLES - 1), o.span)]; }
    return [rk, () => r];
  }
  // Vessels that run on into each other (from veinJoins): their calibers are eased to meet at the join.
  let glStraight = [], glRadDirty = true;
  // Where one vessel runs on into the next, the two courses meet at a slight corner: the last few
  // samples either side are redrawn as one smooth curve (a cubic through the join, following each
  // course's own direction), so the tube bends through the join instead of kinking.
  const runOnSamples = (it, n) => (it.ra ? Math.max(2, Math.round(n * (1 - it.f))) : n);
  function smoothRunOn(items) {
    const out = new Map(), byRow = new Map(items.map((it) => [it.row, it])), E = 10;
    const pt = (P, i, end) => (end ? P[P.length - 1 - i] : P[i]);   // i samples in from that end
    for (const { a, ia, b, ib } of glStraight) {
      const A = byRow.get(a), B = byRow.get(b);
      if (!A || !B) continue;
      const PA = out.get(a) || A.pts.map((q) => q.slice()), PB = out.get(b) || B.pts.map((q) => q.slice());
      if (PA.length < 2 * E + 2 || PB.length < 2 * E + 2) continue;
      // From E samples into A, through the join, to E samples into B (fewer into the cava drawn as one,
      // whose samples lie farther apart: about as far along as into its last stretch alone).
      const Ea = runOnSamples(A, E), Eb = runOnSamples(B, E);
      const p0 = pt(PA, Ea, ia), p0b = pt(PA, Ea + 1, ia), p3 = pt(PB, Eb, ib), p3b = pt(PB, Eb + 1, ib);
      const L = Math.hypot(p3[0] - p0[0], p3[1] - p0[1]) / 3;
      const ta = [p0[0] - p0b[0], p0[1] - p0b[1]], tb = [p3[0] - p3b[0], p3[1] - p3b[1]];
      const na = Math.hypot(...ta) || 1, nb = Math.hypot(...tb) || 1;
      const p1 = [p0[0] + (ta[0] / na) * L, p0[1] + (ta[1] / na) * L], p2 = [p3[0] + (tb[0] / nb) * L, p3[1] + (tb[1] / nb) * L];
      const bez = (t) => { const u = 1 - t; return [u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]; };
      // A's samples E … 0 (toward its end) take t 0 … 0.5, B's 0 … E take 0.5 … 1.
      for (let i = 0; i <= Ea; i++) PA[ia ? PA.length - 1 - i : i] = bez(0.5 * (1 - i / Ea));
      for (let i = 0; i <= Eb; i++) PB[ib ? PB.length - 1 - i : i] = bez(0.5 + 0.5 * (i / Eb));
      out.set(a, PA); out.set(b, PB);
    }
    return out;
  }
  // Junctions: ends that meet at a model node (clustered by where the drawn courses actually
  // end), and ends that lie on another vessel's course (a tributary on its trunk, a vein drawn
  // onto the side of another). Arteries join only arteries.
  function veinJoins(items) {
    const joins = [], pairs = new Set();
    glStraight = []; glRadDirty = true;
    const pairKey = (a, b) => Math.min(a.row, b.row) + ':' + Math.max(a.row, b.row);
    const endOf = (it, i) => (i ? it.pts[it.pts.length - 1] : it.pts[0]);
    const rEnd = (it, i) => it.obj.glR[i ? N_SAMPLES - 1 : 0];
    const add = (ends, c, trunk) => {
      const uniq = [...new Map(ends.map((e) => [e[0].row, e])).values()];
      if (uniq.length < 2) return;
      let spread = 0, rMin = Infinity, rMax = 0;
      for (const [it, i] of uniq) {
        const q = i == null ? c : endOf(it, i), r = i == null ? it.obj.glMaxR : rEnd(it, i);
        spread = Math.max(spread, Math.hypot(q[0] - c[0], q[1] - c[1]));
        rMin = Math.min(rMin, r); rMax = Math.max(rMax, r);
      }
      const k = clamp(1.2 * rMin + 1.2, 1.5, 11);
      // Which ends blend into which (fork-joins.js): a vessel running on into the next is not filleted to it, in a fork too.
      const dir = ([it, i]) => { if (i == null) return null; const P = it.pts, n = P.length, a = i ? P[n - 1] : P[0], b = i ? P[Math.max(0, n - 4)] : P[Math.min(n - 1, 3)], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / L, (b[1] - a[1]) / L]; };
      const { groups, runOn } = forkJoins(uniq.map(dir));
      if (runOn) glStraight.push({ a: uniq[runOn[0]][0].row, ia: uniq[runOn[0]][1], b: uniq[runOn[1]][0].row, ib: uniq[runOn[1]][1], fork: uniq.length > 2 });
      const reach = spread + 2 * rMax + k + 6;
      const rows = uniq.map(([it]) => it);
      for (let a = 0; a < rows.length; a++) for (let b = a + 1; b < rows.length; b++) pairs.add(pairKey(rows[a], rows[b]));
      for (const g of groups) joins.push({ x: c[0], y: c[1], reach, k, fillet: g.fillet, members: g.members.map((i) => rows[i].row), trunk: g.trunk != null ? rows[g.trunk].row : trunk, fork: g.trunk != null });
    };
    const byNode = new Map();
    for (const it of items) {
      if (it.kind === 'f') continue;
      const pre = it.x.isArt ? 'a:' : '';
      for (const i of [0, 1]) { const n = pre + (i ? it.endNode || it.x.e.to : it.x.e.from); if (!byNode.has(n)) byNode.set(n, []); byNode.get(n).push([it, i]); }
    }
    for (let ends of byNode.values()) {
      while (ends.length) {
        const q0 = endOf(...ends[0]);
        const near = ends.filter(([it, i]) => { const q = endOf(it, i); return Math.hypot(q[0] - q0[0], q[1] - q0[1]) < 20; });
        ends = ends.filter((e) => !near.includes(e));
        if (near.length < 2) continue;
        const c = near.reduce((a, [it, i]) => { const q = endOf(it, i); return [a[0] + q[0] / near.length, a[1] + q[1] / near.length]; }, [0, 0]);
        add(near, c);
      }
    }
    const box = new Map(items.map((it) => {
      const P = it.pts, m = it.obj.glMaxR + 4;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const q of P) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }
      return [it, [x0 - m, y0 - m, x1 + m, y1 + m]];
    }));
    for (const it of items) for (const i of [0, 1]) {
      const q = endOf(it, i), rq = rEnd(it, i);
      for (const y of items) {
        const b = box.get(y);
        if (y === it || !!y.x.isArt !== !!it.x.isArt || q[0] < b[0] || q[0] > b[2] || q[1] < b[1] || q[1] > b[3]) continue;
        if (pairs.has(pairKey(it, y))) continue;
        if (distTo(y.pts, q) < y.obj.glMaxR + 0.5 * rq + 2) add([[it, i], [y, null]], q, y.x.e.id === it.x.e.id ? undefined : y.row);   // (the trunk, unless it is another stretch of the same vessel: the azygos arch's bend)
      }
    }
    return joins;
  }
  let tubesShown = null, tubesLook = '', tubesNew = true;
  // A glow or hover easing (glowStep, vhStep) changes only the glow texels of the tube data. While nothing else the whole sync
  // reads has changed since it last ran (the same vessels, model frame, morph, layout, colours, plate, lens, catheter, classes),
  // those texels alone are written again (writeGlowTexels, as the whole sync writes them) and only the rows that changed are
  // drawn again: the same tube data and the same picture as a whole sync, without rebuilding ~300 items each frame of an ease.
  let glowMemo = null;
  const IVC_LIST = [...IVC_EDGES];
  // Each item's classes the whole sync reads (selected, hovered, ghost; on its own and the cava's upper stretch), and the cava's.
  function glowBits(items) {
    const b = new Uint8Array(items.length + IVC_LIST.length), on = (g, c) => (g?.classList.contains(c) ? 1 : 0);
    items.forEach((it, i) => { const g = it.x.g, r = it.ra?.g; b[i] = on(g, 'is-sel') | on(g, 'hl') << 1 | on(g, 'coll-ghost') << 2 | on(r, 'is-sel') << 3 | on(r, 'hl') << 4 | (it.x.lifted ? 32 : 0) | (it.x.reveal ? 64 : 0); });
    IVC_LIST.forEach((id, i) => { const g = E[id]?.g; b[items.length + i] = on(g, 'is-sel') | on(g, 'hl') << 1; });
    return b;
  }
  // Whether a selected or spotlit vessel eases back into the network toward its end at node n (highlight-math.js liftEnd).
  function selEnd(id, n) {
    const joins = [];
    for (const y of EV) {
      if (y.e.id === id || !y.vis || (y.e.from !== n && y.e.to !== n)) continue;
      joins.push({ lit: vh.sel.has(y.e.id) || spot.ids.has(y.e.id), ghost: y.g.classList.contains('coll-ghost') });
    }
    return liftEnd(spot.ids.has(id) && spotOn(), joins);
  }
  function glowOnlyOk(t) {
    const m = glowMemo;
    if (!m || !veins || veins.lost || !vLook || tubesNew || lensFrom || !tubesShown || tubesShown.length !== tubeData.length) return false;
    if (m.t !== t || m.F !== F || m.geo !== geometryVersion || m.netA !== netA || m.cs !== wrapCS() || m.mode !== layerMode() || m.origin !== originOn()) return false;
    if (m.selK !== selAKey() || m.cath !== cathTint || m.plate !== veins.hasPlate(0) || m.cls !== gestureFree(wrap.className) || m.reach !== (glow.lit.size ? 20 : 11)) return false;
    const b = glowBits(m.items);
    for (let i = 0; i < b.length; i++) if (b[i] !== m.bits[i] || b[i] & 64) return false;   // (a vessel drawing on changes with the clock: whole syncs)
    return true;
  }
  /** The glow-only sync: true when it stood in for syncVeins (see glowMemo). */
  function syncGlowOnly(t) {
    if (!glowOnlyOk(t)) return false;
    glowSync = false;
    const cs = glowMemo.cs, rgbCs = (c) => toRGB(c, cs), W = TUBE_TEXELS * 4;
    let changed = false;
    for (const it of glowMemo.items) {
      if (it.kind !== 'v' && it.kind !== 's') continue;
      const o = it.row * W;
      writeGlowTexels(tubeData, o, it.kind, it.x.e.id, it.ra?.e.id, it.obj.len, glow.lit, vh.amt, rgbCs, easeInOut);
      for (let i = o + 39; i < o + 48; i++) if (tubeData[i] !== tubesShown[i]) { veinsRows.add(it.row); tubesShown.set(tubeData.subarray(o, o + W), o); changed = true; break; }
    }
    if (changed) veins.setTubes(tubeData);
    return true;
  }
  // (Timed, binning included, for the debug overlay's GPU readout: gpu-probe.js.)
  // Radii: re-sent only when a tube changed.
  let easedMemo = null;
  function sendRadii(items) {
    for (const it of items) {
      const [key, rOf] = itemRadii(it), o = it.obj;
      if (o.glRadKey === key && o.glR0) continue;
      o.glRadKey = key; glRadDirty = true;
      o.glR0 = Array.from({ length: N_SAMPLES }, (_, i) => rOf(i));
    }
    // Where one vessel runs on into the next, both ends ease to the same caliber, so the tube is one
    // smooth course (no step and no swelling at the join).
    // (Kept while the radii they start from are the same arrays: the same eases, and those rows are then skipped below.)
    let eased = new Map(), refs = null;
    if (glRadDirty && glStraight.length) {
      const objOf = new Map(items.map((it) => [it.row, it.obj]));
      refs = glStraight.flatMap(({ a, b }) => [objOf.get(a)?.glR0, objOf.get(b)?.glR0]);
      if (easedMemo?.pairs === glStraight && refs.every((r, i) => r === easedMemo.refs[i])) { eased = easedMemo.map; refs = null; }
    }
    if (refs) {
      const byRow = new Map(items.map((it) => [it.row, it.obj])), itOf = new Map(items.map((it) => [it.row, it]));
      for (const { a, ia, b, ib, fork } of glStraight) {
        const A = byRow.get(a), B = byRow.get(b);
        if (!A?.glR0 || !B?.glR0) continue;
        const ra = A.glR0[ia ? N_SAMPLES - 1 : 0], rb = B.glR0[ib ? N_SAMPLES - 1 : 0];
        // In a fork the narrower stretch widens to the wider one's caliber at the node instead (the wider never narrows):
        // a tributary there meets the trunk at full width, so its end stays inside the trunk's walls (the splenorenal
        // shunt on the splenic vein, where the splenic vein's last stretch carries little).
        if (fork) {
          const m = Math.max(ra, rb), S = (u) => u * u * (3 - 2 * u);
          for (const [O, i, r0, row] of [[A, ia, ra, a], [B, ib, rb, b]]) {
            if (r0 >= m) continue;
            // (Over about three trunk radii, not half its course: a short funnel, not a long cone.)
            const it = itOf.get(row), step = arcLen(it.pts) / (N_SAMPLES - 1) || 1;
            const E = Math.min(runOnSamples(it, N_SAMPLES >> 1), Math.max(2, Math.round((3 * m) / step))), R = eased.get(O) || O.glR0.slice();
            for (let s = 0; s < E; s++) R[i ? N_SAMPLES - 1 - s : s] += (m - r0) * (1 - S(s / E));
            eased.set(O, R);
          }
          continue;
        }
        // One smoothstep from A's caliber (half A's course back) to B's (half B's course on), so the
        // taper runs steadily through the join: no plateau there, which read as a crease.
        const S = (u) => u * u * (3 - 2 * u);
        for (const [O, i, side, row] of [[A, ia, 0, a], [B, ib, 1, b]]) {
          const E = runOnSamples(itOf.get(row), N_SAMPLES >> 1), R = eased.get(O) || O.glR0.slice();
          for (let s = 0; s < E; s++) {
            const u = side ? 0.5 + 0.5 * (s / E) : 0.5 - 0.5 * (s / E), j = i ? N_SAMPLES - 1 - s : s;
            R[j] += side ? (ra - rb) * (1 - S(u)) : (rb - ra) * S(u);
          }
          eased.set(O, R);
        }
      }
    }
    if (refs) easedMemo = { pairs: glStraight, refs, map: eased };
    if (glRadDirty) for (const it of items) {
      const o = it.obj, R = eased.get(o) || o.glR0;
      if (R === o.glR) continue;   // (the very array last sent)
      // (Compared with a copy of the radii last sent, element by element, and copied only when they change: a joined string
      // per vessel per sync was megabytes a second of garbage; round 2 review, P6.)
      const sent = o.glRSent;
      if (sent && sent.length === R.length) { let j = 0; while (j < R.length && sent[j] === R[j]) j++; if (j === R.length) continue; }
      let mx = -Infinity;
      for (let j = 0; j < R.length; j++) if (R[j] > mx) mx = R[j];
      o.glRSent = Float64Array.from(R); o.glR = R; o.glMaxR = mx;
      // (A vessel's new radii change only its own cells: drawn again as a colour change is, see drawVeins.)
      veins.setRadii(it.row, R); veinsRows.add(it.row);
    }
    glRadDirty = false;
  }
  function syncVeins(t) { return gpuProbe.time(null, 'vessel sync (script)', () => syncVeinsNow(t)); }
  function syncVeinsNow(t) {
    if (!veins || veins.lost) return;
    glowSync = false;
    const on = glWanted(t);
    wrap.classList.toggle('gl-on', on);
    if (!on) { tubesHidden = false; if (tubesHeld.size) flushTubes(); }
    if (!on && tubesStale) { tubesStale = false; updateGeometry(true); }
    const plateWas = plateOn();
    wrap.classList.toggle('gl-plate', on && veins.hasPlate(0));
    syncOrganDim();
    if (!on) { if (vLook) { veins.clear(); vLook = null; vBinKey = ''; binShown = null; bendShown = null; } return; }
    if (!glOrgans) {
      // The organ covers, rasterized once in world space (1.5 px per unit): tiers behind them fade.
      const k = 1.5, c = document.createElement('canvas');
      c.width = VIEW.w * k; c.height = VIEW.h * k;
      const mc = c.getContext('2d');
      mc.setTransform(k, 0, 0, k, 0, 0);
      mc.lineCap = 'round'; mc.lineJoin = 'round';
      mc.fillStyle = mc.strokeStyle = '#000';   // colour-exempt: a mask
      const solid = new Path2D();
      for (const { p, w } of getOrganCovers()) { if (w) { mc.lineWidth = w; mc.stroke(p); } else solid.addPath(p); }
      mc.fill(solid);
      veins.setOrgans(c, [0, 0, VIEW.w, VIEW.h]);
      glOrgans = true; tubesNew = true;
    }
    const items = gpuProbe.time(null, 'vessel sync: list', () => glItems());
    const cs = wrapCS();
    const mode = layerMode();
    // A jump in the model (a new patient, Undo or History, a time jump, Compare's Then and Now, Settle) recolours the vessels
    // through the same crossfade as a lens change, instead of in one frame (round 2 review, B6): a frame whose pressures moved
    // by more than JUMP_MMHG anywhere since the last one drawn. The running model's own steps (well under that) are drawn as
    // they come.
    // (So does a held reversal turning in the Direction lens: B3.)
    const jumped = modelJumped(F), flipped = revFlip && mode === 'direction';
    revFlip = false;
    if (((lensMode && mode !== lensMode) || jumped || flipped) && !reduceMotion.matches) { lensFrom = shownCol; lensT0 = performance.now(); }
    lensMode = mode;
    if (lensFrom && !lensFading()) lensFrom = null;
    shownCol = new Map();
    gpuProbe.time(null, 'vessel sync: radii', () => sendRadii(items));
    // Geometry: re-binned when the layout, the set of vessels or a vessel's reach grows.
    const reachOf = (it) => Math.ceil((it.obj.glMaxR + (it.x.wallPx || 1) + 18) / 2) * 2;
    const key = `${geometryVersion}|` + items.map((it) => it.row).join(',');
    const grew = key === vBinKey && items.some((it) => reachOf(it) > (vBinReach.get(it.row) || 0));
    if (key !== vBinKey || grew) gpuProbe.time(null, 'vessel sync: binning', () => {
      vBinKey = key;
      // A vessel that outgrows its reach gets a quarter more room than it needs: a widening vein (a congested IVC easing
      // in over a slide) was re-binned and its geometry uploaded again at every 2 px of growth, about 4 MB each time, a
      // hundred times in one slide change. (The reach only says which cells list a vessel; the drawing is unchanged.)
      vBinReach = new Map(items.map((it) => [it.row, grew ? Math.max(vBinReach.get(it.row) || 0, Math.ceil(reachOf(it) * 1.25 / 2) * 2) : reachOf(it)]));
      const J = veinJoins(items), smooth = smoothRunOn(items);
      for (const it of items) if (it.kind === 'v') { it.obj.glPts = smooth.get(it.row) || it.pts; }
      // (Binned against the last binning: a coiling collateral re-tests only its own cells, and when nothing the GPU holds
      // changed (another vessel's coil easing while it is hidden), nothing is uploaded.)
      const bins = binVeins(items.map((it) => binTube(it, smooth.get(it.row) || it.pts)), J, binMemo);
      // (Patched in place, only the rows that changed go up again: the cells and every other entry are as uploaded.)
      if (bins !== binShown) { if (bins.patch && binShown?.ent === bins.ent) veins.patchGeometry(bins); else veins.setGeometry(bins); binShown = bins; }
      // (Each axis's curvature with it, so the flow arrowheads keep their shape on a bend: veins-gl chevAt.)
      if (bins !== bendShown) { bendShown = bins; for (const it of items) veins.setBend(it.row, smooth.get(it.row) || it.pts); }
      tubesNew = true;
    });
    // Attributes, every frame.
    const T0 = easeInOut(morph), now = performance.now();
    const artery = toRGB('var(--artery)', cs);
    const originMode = originOn();
    const rgbCs = (c) => toRGB(c, cs);
    tubeData.fill(0);
    // Hovering or selecting any part of the IVC shows it whole: no veil, and no fades on it or on the tributaries joining it.
    let ivcOn = false;
    for (const id of IVC_EDGES) { const g = E[id]?.g; if (g && (g.classList.contains('is-sel') || g.classList.contains('hl') || vh.selA.get(id) > 0)) ivcOn = true; }
    gpuProbe.time(null, 'vessel sync: colours', () => { for (const it of items) {
      const { x, kind, obj } = it, id = x.e.id, o = it.row * TUBE_TEXELS * 4;
      const ghost = x.g.classList.contains('coll-ghost');
      const ra = it.ra;
      let c0, c1;
      if (x.isArt) c0 = c1 = artery;
      else {
        const [a, b] = (x.col || ['var(--lens-neutral)', 'var(--lens-neutral)']).map((c) => toRGB(c, cs));
        if (kind === 'f' || kind === 'c') {
          if (obj.col) [c0, c1] = obj.col.map((c) => toRGB(c, cs));
          else {
            // A tributary takes its trunk's gradient where it lies along the trunk's chord.
            const P = geo[id].cur, A = P[0], B = P[P.length - 1], dx = B[0] - A[0], dy = B[1] - A[1], L2 = dx * dx + dy * dy || 1;
            const at = (q) => clamp(((q[0] - A[0]) * dx + (q[1] - A[1]) * dy) / L2, 0, 1);
            c0 = mix3(a, b, at(it.pts[0])); c1 = mix3(a, b, at(it.pts[it.pts.length - 1]));
          }
        } else { c0 = a; c1 = ra ? toRGB((ra.col || ['var(--lens-neutral)', 'var(--lens-neutral)'])[1], cs) : b; }
        // Coloring the blood by origin: the lumen steps back to a quiet grey so the parcels' colors read.
        if (originMode) c0 = c1 = ORIGIN_LUMEN;
      }
      let alpha = x.isArt ? 0.85 : kind === 'c' ? clamp(2 * T0 - 1, 0, 1) : kind === 's' || kind === 'f' ? (obj.live ?? 1) * clamp(1 - 2 * T0, 0, 1) : 1;
      const sinStrand = kind === 's' && SIN_EDGES.has(id);
      const tier = ivcOn && IVC_EDGES.has(id) ? TIER_LIFT : x.lifted && !x.back ? (x.front ? TIER_LIFT_FRONT : TIER_LIFT) : x.isArt ? TIER_ART : levelTier(x);
      // The network recedes to netA with a vessel selected (the lifted tier and the vessels behind the organs are not faded as a
      // group): the selected vessel eases out of that dimming and, deselected, back into it (selA), so it never snaps.
      if (x.back || tier >= TIER_LIFT) alpha *= netA + (1 - netA) * easeInOut(Math.max(vh.selA.get(id) || 0, ra ? vh.selA.get(ra.e.id) || 0 : 0));
      const shade = !x.isArt && !ghost;
      const veil = IVC_EDGES.has(id) && !ivcOn;
      const spec = shade && !veil && kind !== 'f' && kind !== 'c' && !CONTEXT_EDGES.has(id) && !x.back && x.width >= 3.4;
      const flags = (shade ? F_DIFFUSE : 0) | (spec ? F_SPEC : 0) | (!x.back && !x.isArt && !ghost && !veil ? F_SHADOW : 0) | (ghost ? F_DOTTED : 0) | (x.isArt ? F_NOCASE : 0) | (veil ? F_VEIL : 0);
      const z = (kind === 'v' ? x.row + 0.5 : x.row) / GL_ROWS;
      if (lensFrom) {
        const was = lensFrom.get(it.row), u = easeInOut(clamp((now - lensT0) / LENS_FADE, 0, 1));
        if (was) { c0 = mix3(was[0], c0, u); c1 = mix3(was[1], c1, u); }
      }
      shownCol.set(it.row, [c0, c1]);
      // The sinusoids' strands are drawn faint and fine (sin-perfusion.js).
      if (sinStrand) alpha *= SIN_PERFUSION.fade;
      tubeData.set([...c0, x.isArt ? 0 : x.wallPx, ...c1, alpha, tier, z, flags, 0], o);
      // Fades, as the SVG masks: into an organ (TIP_FADE), out of the plate, into a deeper vein,
      // tributaries toward the bowel they drain.
      let fade = null;
      if (kind === 'f') {
        const cfg = FEEDERS[id];
        if (obj.fadeMask && !x.feedJoined) { const [y0, y1] = FEEDER_FADE_Y[id]; fade = [0, y0, 0, y1, 0, 1, 0, 1]; }
        else if (obj.fan && cfg.fan) { const { at, len, levels, fade: fr = [0.7, 0.4] } = cfg.fan; fade = [at[0], at[1], len * (levels ? 2.7 : 1.35), 0, 0, fr[0], fr[1], 2]; }
      } else if (x.tipFade) { const L = x.tipFade.line; fade = [L[0], L[1], L[2], L[3], 0, x.tipFade.joined ? 1 : T0, 1, 1]; }
      else if (kind === 'v' && IVC_JOIN[id]) { if (!ivcOn) fade = [...IVC_JOIN[id]]; }
      else if (FADE_DOWN_Y[id] && !(ivcOn && IVC_EDGES.has(id))) { const [y0, y1] = FADE_DOWN_Y[id]; fade = [0, y0, 0, y1, 0, 1, 0, 1]; }
      else if (SIN_FADE[id] && (kind === 'v' || kind === 's')) fade = [...SIN_FADE[id]];
      else if (FADE_IN[id] && kind === 'v') { const [x1, y1, x2, y2, of, to = 0.3] = FADE_IN[id]; fade = [x1, y1, x2, y2, of, 1, to, 1]; }
      // The fades are drawn in the anatomy's coordinates: they let go as the circuit takes over.
      // (The tip fade already does: it is cleared in the circuit.)
      if (fade && T0 > 0 && !(kind !== 'f' && x.tipFade)) { fade[5] += (1 - fade[5]) * T0; fade[6] += (1 - fade[6]) * T0; }
      if (fade) tubeData.set(fade, o + 12);
      // The drawn stretch: a vessel drawing on (or retracting) grows along its flow. A tributary's arc length is its own
      // (not its trunk's), or its chevrons and streaks would run along it many times too fast and bunch into ticks.
      let lo = 0, hi = 1;
      if (x.reveal && kind !== 'f' && kind !== 'c') {
        const r = x.reveal, u = clamp((now - r.t0) / r.dur, 0, 1), off = r.out ? easeInOut(u) : 1 - easeInOut(u);
        if (r.dir > 0) hi = 1 - off; else lo = off;
      }
      if (kind === 'v' && LIGATED.some((l) => l[1] === id)) lo = Math.max(lo, divideLen(id) / (it.len || geo[id].len || 1));
      tubeData.set([lo, hi, kind === 's' ? obj.len : kind === 'f' ? arcLen(it.pts) || 1 : it.len || geo[id].len || 1, 0, 0, 0, 0, 0], o + 20);
      let tint = kind === 'v' && cathTint?.[id];
      if (ra && kind === 'v') {
        // On the cava drawn as one, each stretch's tint is placed along the whole.
        const f = it.f, tb = cathTint?.[ra.e.id], m = (t, lo, w) => (t < 0 ? t : lo + t * w);
        if (tint) tint = [m(tint[0], 0, f), m(tint[1], 0, f)];
        if (tb) tint = tint ? [Math.min(tint[0] < 0 ? 0 : tint[0], m(tb[0], f, 1 - f)), Math.max(tint[1], m(tb[1], f, 1 - f))] : [m(tb[0], f, 1 - f), m(tb[1], f, 1 - f)];
      }
      if (tint) tubeData.set([...toRGB(cathTint.col, cs), 1, tint[0], tint[1], cathTint.soft, 0], o + 32);
      writeGlowTexels(tubeData, o, kind, id, ra?.e.id, obj.len, glow.lit, vh.amt, rgbCs, easeInOut);
      // The selected vessel's standing out of the dimmed network (its tributaries' too); the cava and the vessels behind the
      // organs take it in their alpha above. Toward an end where another visible vessel joins and none of the selection, it
      // eases back into the network; a free end, or one into the rest of the selection, stays at full.
      const sa = tier < TIER_LIFT && !x.back && !SIN_EDGES.has(id) ? vh.selA.get(id) || 0 : 0;
      if (sa > 0) tubeData.set(kind === 'v' ? [easeInOut(sa), selEnd(id, x.e.from), selEnd(id, x.e.to), 0] : [easeInOut(sa), 0, 0, 0], o + 48);
    } });
    // (Uploaded only when some vessel's attributes changed: most model frames in a steady state change none.)
    let tubesChanged = !tubesShown || tubesShown.length !== tubeData.length;
    if (!tubesChanged) for (let i = 0; i < tubeData.length; i++) if (tubeData[i] !== tubesShown[i]) { tubesChanged = true; break; }
    if (tubesChanged) veins.setTubes(tubeData);
    vLook = {
      shOff: [1.4, 2.8], light: LIGHT, reach: glow.lit.size ? 20 : 11, organs: 1 - T0,
      casing: [...cssTriplet(cs, '--casing-rgb'), cssNum(cs, '--casing-a', 0.56)],
      shadow: [...cssTriplet(cs, '--shadow-rgb'), cssNum(cs, '--shadow-a', 0.15)],
      sheen: [...toRGB('var(--light-ink)', cs), cssNum(cs, '--tube-sheen', 0.42)],
      shade: [...toRGB('var(--tube-shade-ink)', cs), cssNum(cs, '--tube-shade', 0.2)],
      ring: [...(olCol = toRGB('var(--accent)', cs)), 0.34],
      netAlpha: netA,
      fx: true,
      tierAlpha: TIER_ALPHA, tierGroup: TIER_GROUP, fluid: fluidLook,
    };
    syncPlateLook();
    // The vessel layer is drawn again only when what it is drawn from changed: a running model sends a frame about ten
    // times a second, and in a steady state most of them leave every vessel's colour, width and fade exactly as they were.
    const lookSig = JSON.stringify(vLook, (k, v) => (k === 'fluid' ? undefined : v)) + plateOn();
    // Most of those that do change only a few vessels' colours (the pulse), and the vessel layer then redraws only those
    // vessels' cells (veinsRows; see drawVeins): a whole redraw at a Retina size is the heaviest thing the figure draws.
    if (tubesNew || lookSig !== tubesLook || !tubesShown || tubesShown.length !== tubeData.length) {
      veinsDirty = true; tubesLook = lookSig;
      if (tubesChanged) tubesShown = tubeData.slice();
    } else if (tubesChanged) {
      const W = TUBE_TEXELS * 4;
      for (let o = 0; o < tubeData.length; o += W) {
        for (let i = o; i < o + W; i++) if (tubeData[i] !== tubesShown[i]) { veinsRows.add(o / W); tubesShown.set(tubeData.subarray(o, o + W), o); break; }
      }
    }
    tubesNew = false;
    glowMemo = { items, t, netA, cs, mode, origin: originMode, cath: cathTint, F, geo: geometryVersion, plate: veins.hasPlate(0), cls: gestureFree(wrap.className), bits: glowBits(items), reach: vLook.reach };
    glowMemo.selK = selAKey();   // (the selection's ease sets the vessels' alpha, which the glow-only sync does not write)
    glowMemo.wide = items.map((it) => it.x.width >= 3.4);   // (the sheen's width: syncRadiiOnly)
    // The SVG organs just hid for the GPU plate: draw it now, so no frame shows neither.
    if (!plateWas && plateOn()) drawVeins();
  }
  /** Redraws the vessel layer (and the picture) if anything in it changed; true when it did. */
  let glM = null;   // the world → stage transform (CSS px) the vessels were last drawn in (for the tests)
  function drawVeins(fullComposite = false) {
    if (liveSet || liveOn()) { syncLiveOrgans(); if (liveSet) veins.organs.shift('bowel', bowelDy()); }
    syncGutPic();
    if (!veins || veins.lost || !vLook || !F) return false;
    if (!CTM) refreshCTM();
    const m = CTM;
    const T = [vdpr * m.a, vdpr * m.b, vdpr * m.c, vdpr * m.d, vdpr * (m.e - wrapRect.left), vdpr * (m.f - wrapRect.top)];
    const key = T.map((v) => v.toFixed(3)).join(',') + `|${vCanvas.width}x${vCanvas.height}`;
    if (!veinsDirty && key === veinsDrawKey) {
      if (!veinsRows.size) return false;
      // Only some vessels' attributes changed: their cells alone are drawn again (the same picture as a whole redraw).
      const rows = [...veinsRows];
      veinsRows.clear();
      if (veins.drawRows(T, vLook, bloodLook(), rows, fullComposite)) return true;
    }
    if (key !== veinsDrawKey) {
      if (plateOn()) schedulePlateView();
      // (The organs drawn live, the view moved: once it is let go, the gut's picture for it, if none kept will do.)
      else if (gutCopy && gGut && morphTarget === 0 && !(morph > 0) && !gutPicFor(vdpr * m.sc)) gutPicSoon();
    }
    // (Moved with only some vessels' attributes changed, those vessels are named: a drag while the model plays still
    // moves the drawn layer, and draws their cells again, rather than drawing it all.)
    const rows = veinsDirty ? null : [...veinsRows];
    veinsDirty = false; veinsDrawKey = key; veinsRows.clear();
    glM = [m.a, m.b, m.c, m.d, m.e - wrapRect.left, m.f - wrapRect.top];
    veins.draw(T, vLook, bloodLook(), rows);
    return true;
  }
  function clearJoins() {
    for (const x of EV) if (x.joinKey) { x.joinKey = ''; for (const g of x.groups) g.removeAttribute('mask'); }
  }

  // ── The plate on the GPU ─────────────────────────────
  // The backdrop, organs and ascites are rasterized from the live SVG (styles inlined) into
  // textures the vessel layer draws first: one of the whole plate, and, once a pan or zoom has
  // settled, a sharper one of the view. The SVG is rasterized again only when what it shows
  // changes (cirrhosis, spleen size, ascites, congestion tint, theme); dimming
  // for a selection or a data layer is applied on the GPU. The SVG groups stay, hidden, for
  // picking organs and for exports.
  const PLATE_RECT = [200, -200, 1020, 1320];
  const PLATE_BASE = 1.2;          // px per world unit of the whole-plate raster
  let plateTheme = null, plateKey = '', plateSeq = 0, plateBusy = false, plateAgain = false, plateLast = 0, plateTimer = 0, plateView = null, plateViewKey = '', plateSettle = 0, plateCopy = null, gutCopy = null;
  // The last sharp picture of the view, kept in memory (its pixels, its world rect, size and scale, and the state it shows): a pan
  // at the same scale takes the pixels the two views share from it and draws only what the pan uncovered (viewReuse).
  // (One per layer of the organs drawn as layers, under the layer's name; the flattened plate's under ''.)
  const viewKeeps = new Map();
  let viewSeq = 0;
  function dropViewKeep() { viewKeeps.clear(); }
  const plateOn = () => wrap.classList.contains('gl-plate');
  // The organs drawn as layers on the GPU (organs-gl.js) instead of one flattened picture: the ?perf switch "GPU organs" for now.
  // (Not on a software renderer: CI's browser checks keep the one picture; ?gpuorgans=force turns it on there, for its own check.)
  const gpuOrgansOn = () => !!(gpuProbe.gpuOrgans && veins?.organs && (!SOFTWARE || gpuProbe.gpuOrgans === 'force'));
  // With it, the organs that change (the liver, the spleen, the diaphragm, the falciform line: LIVE_LAYERS) are painted live on
  // the GPU from their own SVG at each frame they change (syncLiveOrgans), so their picture is never dropped while they ease; the
  // gut's and the stomach's masks, which follow the liver and the spleen, are painted live over pictures made without them.
  // (Off when an organ could not be read for painting: the organs are then all pictures, as above.)
  const LIVE_LAYERS = new Set(['back', 'spleen', 'liver', 'front']);
  // (Painted live, the bowel is a layer of its own, gathered under the gut's: syncLiveOrgans.)
  const LIVE_ORDER = ['back', 'behind', 'bowel', 'gut', 'kidney', 'spleen', 'stomach', 'liver', 'front'];
  const bowelDy = () => parseFloat((organG.bowel?.getAttribute('transform') || '').match(/^translate\(0 ([-\d.]+)\)$/)?.[1]) || 0;
  let liveFailed = false;
  const liveOn = () => gpuOrgansOn() && !!veins.organs.canLive && !liveFailed;
  // Drops the plate rasters and shows the live SVG organs. The vessel layer is redrawn in the same
  // task (after the model update in progress), so no frame shows the SVG organs over the old GPU
  // plate: the two, and the ascites, would add up to a bright flash.
  let plateRedraw = false, plateDrops = 0;
  function hidePlate() {
    plateDrops++;   // (a raster still on its way in is of the state before: rasterPlate gives it up)
    veins.dropPlate(0); veins.dropPlate(1); plateView = null; plateViewKey = ''; plateCopy = null; dropViewKeep();
    wrap.classList.remove('gl-plate'); veinsDirty = true; syncPlateLook();
    if (inUpdate) plateRedraw = true; else drawVeins();
  }
  // The inlined copy of the backdrop and organs for the current state (plateStateKey), built with the whole-plate raster
  // and reused by the view rasters that follow it (a pan changes only the window): inlining every element's styles is
  // about 30 ms of each redraw. Made cheaper to draw on the way (plate-copy.js), with the same pixels.
  // The diaphragm's cut for the spleen never touches it: the dome runs DIA.gap (11, diaphragm.js) units above it, more than the cut's
  // half-width (2.5) and the line's (3.5). The stomach's stays (its upper right comes within a few units of the dome, and
  // crosses it with a large spleen; 20 Oct review), and so does the liver's: under the heart the dome passes below the liver's top
  // (the heart rests on it), so the liver hides it there, in the copy as on the page. The heart and esophagus cuts stay too.
  const DEAD_CUTS = ['spleen'];
  // The organs' groups by the layer they are drawn in (organs-gl.js), back to front: the five pictures of the plan, with the two
  // organs that change shape, the spleen and the liver (its ghost line with it), each a layer of its own between them. An element
  // the list does not name (none today) goes with the layer before it, so the order of the SVG is always kept.
  const ORGAN_LAYERS = ['back', 'behind', 'gut', 'kidney', 'spleen', 'stomach', 'liver', 'front'];
  function organLayers() {
    const by = new Map([[gGut, 'gut'], [ghost, 'liver']]);
    for (const [id, L] of [['esophagus', 'behind'], ['heart', 'behind'], ['heart-ra', 'behind'], ['heart-grooves', 'behind'], ['appendix', 'behind'],
      ['kidney-l', 'kidney'], ['spleen', 'spleen'], ['stomach', 'stomach'], ['liver', 'liver'], ['falciform', 'front'], ['umbilicus', 'front']]) if (organG[id]) by.set(organG[id], L);
    const out = new Map();
    let last = 'behind';
    for (const k of gOrgans.children) { last = by.get(k) || last; out.set(k, last); }
    return out;
  }
  function plateBuild(key) {
    // (The plate's class stays on: it only hides the groups and turns their masks off, and the copy takes neither (every group is
    // copied as shown, below, and the mask attributes are cloned). Taking it off and on again restyled and laid out the whole figure
    // at the next read, up to 714 ms in one frame on the Mac (Mohammad's ?perf, 21 Oct), each time a copy was made while it was up.)
    // (The copy takes the organs' own colours, as the GPU greys and dims it itself: the live grey comes off for it.)
    const greyed = !!greyList;
    if (greyed) { greyClear(); organDimKey = ''; }
    const ser = new XMLSerializer(), parts = [], subs = [], live = new Map();
    try {
      const dc = defs.cloneNode(true); inlineStyles(defs, dc);
      for (const id of DEAD_CUTS) dc.querySelector(`[data-cut="${id}"]`)?.remove();
      // The masks, for the view's strips: each strip's copy has their regions cut to the strip (maskHead). The elements that use
      // them are found in the copy now, with their page counterparts (for their transforms), while the two trees still match.
      const masks = [], maskRefs = [];
      for (const m of dc.querySelectorAll('mask')) {
        const r = ['x', 'y', 'width', 'height'].map((a) => parseFloat(m.getAttribute(a)));
        if (m.id && m.getAttribute('maskUnits') === 'userSpaceOnUse' && r.every(Number.isFinite)) masks.push({ id: m.id, el: m, r });
      }
      const layerOf = organLayers();
      for (const g of [gBackdrop, gOrgans]) {   // the ascites is drawn on the GPU over the plate (see fluidLook)
        const c = g.cloneNode(true);
        // Each part of the copy marked with the layer it is drawn in when the organs are drawn as layers (plateMarkup's `layer`).
        if (g === gBackdrop) c.setAttribute('data-layer', 'back');
        else [...c.children].forEach((k, i) => k.setAttribute('data-layer', layerOf.get(gOrgans.children[i])));
        { const lm = [g, ...g.querySelectorAll('[mask]')], cm = [c, ...c.querySelectorAll('[mask]')]; for (let i = 0; i < cm.length; i++) if (cm[i].getAttribute('mask')) maskRefs.push([cm[i], lm[i], cm[i].getAttribute('mask').match(/#([^)"']+)/)?.[1]]); }
        { const lv = g.querySelectorAll(CULL_TAGS), cv = c.querySelectorAll(CULL_TAGS); for (let i = 0; i < cv.length; i++) live.set(cv[i], lv[i]); }   // (for plateCull: the same tree, in the same order)
        // Marked while the classes are still on (inlineStyles takes them off).
        for (const el of c.querySelectorAll('.lv-nod, .lv-isl')) el.setAttribute('data-pc', 'sub fold');
        for (const el of c.querySelectorAll('.lv-sep, .lv-cong, .liver-tint')) el.setAttribute('data-pc', 'fold');
        for (const el of c.querySelectorAll('.lv-gloss')) el.setAttribute('data-pc', 'kids');
        // The flank (the abdominal wall, drawn with ascites) lies wholly below the diaphragm's fade (diaMask: clear past
        // y 420, the flank starts at 470), so it shows nothing; in the copy it only stretched the backdrop's mask, two
        // offscreen layers, from the dome over the liver and spleen to the whole abdomen.
        for (const el of c.querySelectorAll('.flank')) el.setAttribute('data-pc', 'drop');
        // The gut's own picture (gutPic) is never part of the copy; its groups are marked so it can be made from the copy.
        if (g === gOrgans) {
          const gc = c.children[[...gOrgans.children].indexOf(gGut)];
          if (gc) [...gc.children].forEach((k, i) => { if (gGut.children[i] === gGutPics || gGut.children[i] === gGutCuts) k.setAttribute('data-pc', 'drop'); else k.setAttribute('data-gut', i); });
        }
        // (Shown for this copy by definition: the stage hides these groups only while the GPU draws them. A visibility read back
        // from the page here could be stale, as Chrome's was for descendants (d7d2314), and one stale "hidden" at the top hides
        // every organ in the copy and so in the figure.)
        if (inlineStyles(g, c, 'visible') === false) continue;
        c.removeAttribute('opacity');   // the plate fades with the morph on the GPU
        c.removeAttribute('filter');    // and dims and greys there too (syncOrganDim)
        for (const el of [...c.querySelectorAll('[data-pc="drop"]')]) el.remove();
        dropInvisible(c);
        for (const el of c.querySelectorAll('[data-pc~="fold"]')) foldOpacity(el);
        // The gloss's two sheens never overlap, so its fade can sit on each of them instead of a layer.
        for (const el of c.querySelectorAll('[data-pc="kids"]')) {
          const o = parseFloat(el.getAttribute('opacity') ?? '1');
          if (o < 1) {
            for (const k of el.children) { k.setAttribute('opacity', String(+(o * parseFloat(k.getAttribute('opacity') ?? '1')).toFixed(5))); foldOpacity(k); }
            el.removeAttribute('opacity');
          }
        }
        for (const el of c.querySelectorAll('[data-pc~="sub"]')) subs.push({ el, d: el.getAttribute('d') || '' });
        for (const el of c.querySelectorAll('[data-pc]')) el.removeAttribute('data-pc');
        for (const og of [c, ...c.children]) mergeClipRuns(og);
        for (const k of c.children) if (!k.hasAttribute('data-layer') && g === gOrgans) k.setAttribute('data-layer', k.querySelector('[data-layer]')?.getAttribute('data-layer') || 'behind');
        parts.push(c);
      }
      // The nodules and islands are drawn in the liver's own frame (its shrink about a centre): the window is mapped into it.
      const t = organG.liver.getAttribute('transform') || '', m = t.match(/^translate\(([-\d.]+) ([-\d.]+)\) scale\(([-\d.]+)\) translate\([-\d.]+ [-\d.]+\)$/);
      const toLiver = !t ? (r) => r : m ? (r) => { const [cx, cy, k] = m.slice(1).map(Number); return [cx + (r[0] - cx) / k, cy + (r[1] - cy) / k, r[2] / k, r[3] / k]; } : null;
      const gut = parts.flatMap((c) => [...c.querySelectorAll('[data-gut]')]);
      // (Only the definitions the organs use go with them: the defs hold the vessels' too, a third of each strip's markup.)
      pruneDefs(dc, parts.map((c) => ser.serializeToString(c)).join(''));
      const head = ser.serializeToString(dc);
      // (Only the masks the copy's own elements use get a strip's region; one used from elsewhere keeps its own.)
      const refs = maskRefs.filter(([ce]) => parts.some((p) => p.contains(ce)));
      const used = masks.filter((m) => refs.some((x) => x[2] === m.id));
      used.forEach((m, i) => { for (const [a, k] of [['x', 'x'], ['y', 'y'], ['width', 'w'], ['height', 'h']]) m.el.setAttribute(a, maskSlot(i, k)); });
      // (Each user's world → user-space matrix, read now, while the page and the copy are the same state.)
      const base = gOrgans.parentNode.getCTM?.(), inv = base?.inverse();
      const toLocal = (el) => { try { const k = el.getCTM?.(); return inv && k ? inv.multiply(k).inverse() : null; } catch { return null; } };
      const maskT = used.length ? { head: ser.serializeToString(dc), masks: used.map((m) => ({ r: m.r, toLocal: refs.filter((x) => x[2] === m.id).map((x) => toLocal(x[1])) })) } : null;
      // (The gut's part of it outlives the copy: it does not change with the liver, the spleen or the fluid, so its pictures can be
      // made with the plate down too, after a pinch in mid-change: makeGutPic.)
      gutCopy = { gut, head, gutMut, look: gutLook() };
      return { key, seq: plateSeq, head, parts, subs, toLiver, gut, gutMut, live, boxes: null, maskT, bowelDy: bowelDy() };
    } finally { if (greyed) syncOrganDim(); }
  }
  // The sharp picture of the view (slot 1) leaves out every shape that paints nothing inside it: zoomed in, most of the
  // organs' 1 MB of shapes lay outside the view, and writing them out, reading them back and drawing them all, in one go
  // after each pan settled, was the hitch half a second after a zoomed pan stopped (Mohammad, 21 Oct). The same pixels: a
  // shape is left out only when its whole painted box (its outline through every transform, its stroke at the widest a
  // miter reaches, and a margin) misses the view. Kept whole: whatever sits in a clip, mask, pattern or marker, under a
  // filter (a blur spreads past the box), or under a clip or mask sized to its group (its group's box would change), and
  // anything with an id another element could point at; the nodules are trimmed to the window on their own (subpathsIn).
  const CULL_TAGS = 'path, circle, ellipse, rect, polygon, polyline, line';
  function plateBoxes(copy) {
    const roots = new Set(copy.parts), subs = new Set(copy.subs.map((sp) => sp.el)), out = [];
    const bboxRef = (v) => { const id = v && v.match(/#([^)"']+)/)?.[1], d = id && defs.querySelector(`#${CSS.escape(id)}`); return !!d && (d.getAttribute('maskContentUnits') === 'objectBoundingBox' || d.getAttribute('clipPathUnits') === 'objectBoundingBox'); };
    const base = gOrgans.parentNode.getCTM?.();
    if (!base) return out;
    const inv = base.inverse();
    for (const [c, el] of copy.live) {
      if (subs.has(c) || c.id) continue;
      let ok = true, top = c;
      for (let a = c; a; a = a.parentNode) {
        top = a;
        if (a !== c && /^(clipPath|mask|pattern|marker|symbol|defs)$/.test(a.localName)) { ok = false; break; }
        if (a.getAttribute?.('filter') || (a !== c && (bboxRef(a.getAttribute?.('mask')) || bboxRef(a.getAttribute?.('clip-path'))))) { ok = false; break; }
      }
      if (!ok || !roots.has(top) || c.hasAttribute('marker-start') || c.hasAttribute('marker-mid') || c.hasAttribute('marker-end')) continue;
      try {
        const bb = el.getBBox(), m = el.getCTM();
        if (!m || !(bb.width || bb.height)) continue;
        out.push([c, paintBox(bb, inv.multiply(m), parseFloat(c.getAttribute('stroke-width')) || 0)]);
      } catch { /* not measurable: kept */ }
    }
    return out;
  }
  // The copy's defs for a strip of the view: each mask the organs use has its region cut to the strip and 4 pixels round it
  // (plate-copy.js maskRegionIn: Safari's layer for a mask is as big as its region lets it be).
  function maskHead(copy, rect, W) {
    const t = copy.maskT;
    if (!t) return copy.head;
    const g = 4 * rect[2] / W, band = [rect[0] - g, rect[1] - g, rect[2] + 2 * g, rect[3] + 2 * g];
    return fillMaskHead(t.head, t.masks.map((m) => maskRegionIn(m.r, band, m.toLocal)));
  }
  function plateMarkup(rect, W, H, fresh, cull = false, layer = null, unmask = false) {
    const key = plateStateKey();
    if (fresh || !plateCopy || plateCopy.key !== key || plateCopy.seq !== plateSeq) plateCopy = plateBuild(key);
    // Only the nodules and nutmeg islands that meet this window (the others add nothing to it).
    const lr = plateCopy.toLiver?.(rect);
    for (const sp of plateCopy.subs) sp.el.setAttribute('d', lr ? subpathsIn(sp.d, lr) : sp.d);
    const ser = new XMLSerializer(), out0 = [];
    if (cull) {
      plateCopy.boxes ??= gpuProbe.time(null, 'organ boxes (script)', () => plateBoxes(plateCopy));
      for (const [c, b] of plateCopy.boxes) if (boxOutside(b, rect)) out0.push([c, c.parentNode, c.nextSibling]);
      for (const [c] of out0) c.remove();
    }
    // One layer of the organs: the backdrop alone, or only the organs' groups marked with it (plateBuild).
    // (The bowel's layer is drawn from the gut's group: below.)
    const want = layer === 'bowel' ? 'gut' : layer;
    const parts = layer ? plateCopy.parts.filter((c) => (c.getAttribute('data-layer') === 'back') === (want === 'back')) : plateCopy.parts;
    const unmasked = [];
    if (layer && layer !== 'back') {
      const off = [];
      for (const c of parts) for (const k of c.children) if (k.getAttribute('data-layer') !== want) off.push([k, c, k.nextSibling]);
      for (const [k] of off) k.remove();
      out0.push(...off);
      // (Painted live, its mask is left out of the picture: syncLiveOrgans paints it over the picture.)
      if (unmask) for (const c of parts) for (const k of c.children) if (k.getAttribute('mask')) { unmasked.push([k, 'mask', k.getAttribute('mask')]); k.removeAttribute('mask'); }
      // With the organs painted live, the gut is two pictures laid as one group on the GPU, with the group's opacity and its mask:
      // the bowel alone (it floats up on the ascites, moved on the GPU while the fluid eases), and the rest of the gut without it.
      if (unmask && want === 'gut') {
        const bowel = String([...gGut.children].indexOf(organG.bowel)), drop = [];
        for (const c of parts) for (const k of c.children) {
          if (k.getAttribute('data-layer') !== 'gut') continue;
          if (k.getAttribute('opacity') != null) { unmasked.push([k, 'opacity', k.getAttribute('opacity')]); k.removeAttribute('opacity'); }
          for (const g of k.querySelectorAll('[data-gut]')) {
            const mine = g.getAttribute('data-gut') === bowel;
            if (mine !== (layer === 'bowel')) drop.push([g, g.parentNode, g.nextSibling]);
          }
        }
        for (const [g] of drop) g.remove();
        out0.push(...drop);
      }
    }
    let out;
    try { out = (cull ? maskHead(plateCopy, rect, W) : plateCopy.head) + parts.map((c) => ser.serializeToString(c)).join(''); }
    finally {
      for (let i = out0.length - 1; i >= 0; i--) { const [c, p, n] = out0[i]; p.insertBefore(c, n); }   // (the copy stays whole: the next view, the gut's picture)
      for (const [k, a, v] of unmasked) k.setAttribute(a, v);
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="${rect.join(' ')}" preserveAspectRatio="none">${out}</svg>`;
  }
  // An SVG picture of the given markup, loaded (its parse is the browser's, in one go: so each one is kept small).
  async function svgPicture(markup) {
    const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }));
    try {
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
      gpuProbe.note('organ SVG read', markup.length / 1024);   // (its parse is the browser's: the ?perf readout notes it in its frame)
      return img;
    } finally { URL.revokeObjectURL(url); }
  }
  async function rasterPlate(slot, rect, scale, layer = null, fresh = true, unmask = false) {
    const W = Math.max(1, Math.round(rect[2] * scale)), H = Math.max(1, Math.round(rect[3] * scale));
    const seq = plateSeq, drops = plateDrops;
    // The view's sharp picture (slot 1) is made a strip at a time, each strip a picture of its own from only the shapes that
    // meet it: one picture of the whole view was built, read in and laid out by the browser in one long frame 0.28 s after
    // the view stopped, finger still down or not (Mohammad, 21 Oct: "still hitch as soon as I stop panning"). Each strip is
    // the same world rows at the same scale (its view box starts at its first row: rows are whole pixels), so the same pixels.
    // The whole plate (slot 0) is made the same way, a strip per frame, from a fresh copy: as one picture it was read in and laid out
    // by the browser in one go at its first strip, the 100-185 ms frames as the plate came back after a change (Mohammad's ?perf).
    const banded = slot === 1;
    if (!banded && fresh) gpuProbe.time(null, 'organ picture: copy (script)', () => { plateCopy = plateBuild(plateStateKey()); });
    const drawnAs = banded ? plateStateKey() : plateCopy?.key;   // (the strips' copy is made, if need be, with the first strip)
    if (seq !== plateSeq || !veins || veins.lost) return false;
    // Only the newest view picture goes on (an older one, overtaken by a later pan, is given up), and after a pan at the same
    // scale, of the same state, it takes the pixels the two views share from the last one: its rect starts on the scale's pixel
    // grid (schedulePlateView), so the views sit a whole number of pixels apart and the pixels are the same. Only the strip of
    // organs the pan uncovered is drawn from the shapes (Mohammad, 21 Oct: "the lag after stopping panning or zooming").
    const vseq = banded ? ++viewSeq : 0;
    const viewKeep = viewKeeps.get(layer || '');
    const prev = banded && viewKeep && viewKeep.seq === seq && viewKeep.drops === drops && viewKeep.key === drawnAs && viewKeep.scale === scale ? viewKeep : null;
    const ox = prev ? Math.round((rect[0] - prev.rect[0]) * scale) : 0, oy = prev ? Math.round((rect[1] - prev.rect[1]) * scale) : 0;
    // Drawn a piece at a time into a small canvas of its own and read back from it, then sent as pixels, a strip per frame
    // (plate-upload.js): a canvas handed to the GPU stalled Safari for up to 750 ms. The raster shown meanwhile stays until
    // the last strip is in. (Read back from one canvas the size of the whole picture, each strip took Safari longer than the
    // one above it: 25 ms for the first, over 200 ms for the last, on every pan and pinch: Mohammad's ?perf readout, Mac,
    // 21 Oct. A canvas per piece is read in the time its own pixels take.) The view's pixels stay in memory, for the next pan.
    // Each piece is read a frame after it is drawn: Safari only records a drawing on a canvas and paints it on its own, so a
    // read straight after the draw waited out the whole painting, the 70–130 ms "organ picture: read" of his readout. A
    // frame later the painting has had that frame to get done, and the strip's pixels are the same.
    let px = banded ? new Uint8ClampedArray(W * H * 4) : null;
    const pend = [];
    const drawn = (w, h, paint) => {
      const pc = document.createElement('canvas');
      pc.width = w; pc.height = h;
      const pg = pc.getContext('2d', { willReadFrequently: true }), p = { pc, pg, w, h };
      pend.push(p);
      gpuProbe.time(null, 'organ picture: draw', () => paint(pg));
      return p;
    };
    const readBack = (p) => {
      try { return gpuProbe.time(null, 'organ picture: read', () => premultiply(p.pg.getImageData(0, 0, p.w, p.h).data)); } finally { p.pc.width = p.pc.height = 0; pend.splice(pend.indexOf(p), 1); }
    };
    const v = veins, sx = W / rect[2], sy = H / rect[3];
    // (A state that changed on the way is given up at the next strip, not after every strip is drawn, read back and uploaded: with the
    // plate already down, another organ change hides nothing, so plateDrops does not move for it. External review, 21 Oct.)
    const gone = () => seq !== plateSeq || drops !== plateDrops || v !== veins || v.lost || vseq !== (banded ? viewSeq : 0) || drawnAs !== plateStateKey();
    let job = v.plateJob(W, H), waited = false;
    try {
      for (const [y, rows] of plateStrips(W, H)) {
        if (y && !waited) await new Promise((res) => nextFrame(res));
        waited = false;
        if (gone()) return false;
        if (banded) {
          const { copy, draw } = prev ? viewReuse(W, H, prev.W, prev.H, ox, oy, y, rows) : { copy: null, draw: [[0, y, W, rows]] };
          if (copy) gpuProbe.time(null, 'organ picture: reuse', () => copyPixels(px, W, copy[0], copy[1], prev.px, prev.W, copy[0] + ox, copy[1] + oy, copy[2], copy[3]));
          const mine = [];
          for (const [qx, qy, qw, qh] of draw) {
            const band = await svgPicture(gpuProbe.time(null, 'organ picture: copy (script)', () => plateMarkup([rect[0] + qx / sx, rect[1] + qy / sy, qw / sx, qh / sy], qw, qh, false, true, layer, unmask)));
            if (gone() || plateCopy?.key !== drawnAs) return false;
            mine.push([qx, qy, drawn(qw, qh, (pg) => pg.drawImage(band, 0, 0, qw, qh))]);
          }
          if (mine.length) { await new Promise((res) => nextFrame(res)); waited = true; if (gone()) return false; }
          for (const [qx, qy, p] of mine) copyPixels(px, W, qx, qy, readBack(p), p.w, 0, 0, p.w, p.h);
          v.plateRows(job, y, rows, px.subarray(y * W * 4, (y + rows) * W * 4));
        } else {
          const band = await svgPicture(gpuProbe.time(null, 'organ picture: copy (script)', () => plateMarkup([rect[0], rect[1] + y / sy, rect[2], rows / sy], W, rows, false, true, layer, unmask)));
          if (gone() || plateCopy?.key !== drawnAs) return false;
          const p = drawn(W, rows, (pg) => pg.drawImage(band, 0, 0, W, rows));
          await new Promise((res) => nextFrame(res)); waited = true;
          if (gone()) return false;
          v.plateRows(job, y, rows, readBack(p));
        }
      }
      // A picture of a state that ended while it was on its way in is given up (the one shown stays). Above all the colours: an
      // iPhone or iPad turns the page light and back while it takes the app switcher's pictures, and a picture begun then
      // finished on the way back to the app, in the light theme's colours (the organs mixed with its white stage: almost
      // white), until the next one replaced it (Mohammad, 21 Oct: "overly bright almost white then it goes back").
      if (drawnAs !== plateStateKey()) return false;
      if (layer) v.organs.stage(slot, layer, job, rect, layer === 'bowel' ? plateCopy.bowelDy : 0); else v.setPlate(slot, job, rect);
      job = null;
      if (banded) { viewKeeps.set(layer || '', { px, rect, W, H, scale, seq, drops, key: drawnAs }); px = null; }   // (kept for the next pan)
      return true;
    } finally { if (job && !v.lost) v.dropJob(job); px = null; for (const p of pend) p.pc.width = p.pc.height = 0; }
  }
  // The organs as layers (gpuOrgansOn): each layer rasterized as the plate is (rasterPlate, from the same copy), cropped to its own
  // painted box on the plate's pixel grid (so its pixels are the plate's samples), and the set shown whole once every layer is in.
  // Composited back to front on the GPU, each with its group's opacity baked in, they make the plate's picture.
  const EVERYWHERE = [-Infinity, -Infinity, Infinity, Infinity];
  function layerBoxes() {
    const base = gOrgans.parentNode.getCTM?.(), by = new Map([['back', EVERYWHERE]]);
    if (!base) return null;
    const inv = base.inverse();
    for (const [k, L] of organLayers()) {
      let b = EVERYWHERE;
      try {
        const bb = k.getBBox(), m = k.getCTM();
        if (!m || !(bb.width || bb.height)) continue;
        // (Its outline through every transform, the widest stroke on it (the liver's inner shade, 30 wide, clipped inside) and a margin.)
        b = paintBox(bb, inv.multiply(m), 15, 24);
      } catch { /* not measurable: the whole plate */ }
      const u = by.get(L);
      by.set(L, u ? [Math.min(u[0], b[0]), Math.min(u[1], b[1]), Math.max(u[2], b[2]), Math.max(u[3], b[3])] : b);
    }
    // The bowel (its own layer when the organs are painted live: plateMarkup).
    try { const bb = organG.bowel.getBBox(), m = organG.bowel.getCTM(); if (m && (bb.width || bb.height)) by.set('bowel', paintBox(bb, inv.multiply(m), 15, 24)); } catch { by.set('bowel', EVERYWHERE); }
    return by;
  }
  let layerStarts = 0, layerStartsEasing = 0;   // (for the tests: organ pictures begun, and those begun while the fluid eased)
  async function rasterLayers(slot, rect, scale) {
    const v = veins, boxes = layerBoxes(), names = [], live = liveOn();
    layerStarts++; if (fluidEasing()) layerStartsEasing++;
    if (slot === 0) gpuProbe.time(null, 'organ picture: copy (script)', () => { plateCopy = plateBuild(plateStateKey()); });
    try {
      for (const L of live ? LIVE_ORDER : ORGAN_LAYERS) {
        if (live && LIVE_LAYERS.has(L)) continue;
        const box = boxes ? boxes.get(L) : EVERYWHERE;
        const r = box && cropToGrid(rect, box, scale);
        if (!r) continue;
        if (!(await rasterPlate(slot, r, scale, L, false, live)) || v !== veins || !v.organs) return false;
        names.push(L);
      }
      v.organs.commit(slot, names);
      if (live) { syncLiveOrgans(true); v.organs.setOrder(ORGAN_LAYERS); }
      return true;
    } finally { if (v === veins && !v.lost) v.organs?.dropStaged(slot); }
  }
  // The live organs' specs (organ-paint readGroup) read again whenever what they draw may have changed (liveKey), for the next
  // render of the stack. Their outlines are read from the page at the render itself.
  const matOfEl = (el) => { const t = el?.transform?.baseVal; if (!t || !t.numberOfItems) return [1, 0, 0, 1, 0, 0]; const k = t.consolidate().matrix; return [k.a, k.b, k.c, k.d, k.e, k.f]; };
  const MASK_OF = { gut: '#gutHide', stomach: '#frontM' };
  let liveKeyWas = '', liveSet = false;
  // (What eases, the outlines, the organs' frames and the parts' own opacities, the painter reads from the page at each paint
  // (organ-paint liveOf): the specs are read again only when what is in them changes: a part hidden or shown, the liver's mask,
  // the ghost line, a lens, the theme and its colours. They were read again on every frame of an ease: about fifty computed
  // styles, with the step's writes pending.)
  function liveKey() {
    const cs = wrapCS();
    return [organG.liver.getAttribute('mask'), ghost.style.display, lv.sep.style.visibility, lv.nod.style.visibility, lv.cong.style.visibility, lv.isl.style.visibility,
      cs.getPropertyValue('--stage-bg'), cs.getPropertyValue('--organ-liver'), wrap.classList.contains('imaging'), document.documentElement.dataset.theme || ''].join('|');
  }
  function syncLiveOrgans(force = false) {
    const v = veins;
    if (!v || v.lost || !v.organs) return;
    if (!liveOn()) { if (liveSet) { v.organs.setLive(null, null); liveSet = false; liveKeyWas = ''; } return; }
    const key = liveKey();
    if (!force && key === liveKeyWas) return;
    // (The organs' own colours: a lens's grey on the live SVG (only while the plate is off) would be read as theirs.)
    if (greyList) return;
    liveKeyWas = key;
    const organs = new Map(), masks = new Map();
    let ok = true;
    const add = (L, el) => {
      if (getComputedStyle(el).display === 'none') return;
      const spec = readGroup(el);
      if (!spec) { ok = false; console.warn('Organs on the GPU: not readable for painting, the organs stay pictures:', el); return; }
      if (!organs.has(L)) organs.set(L, []);
      organs.get(L).push({ spec, get m() { return matOfEl(el); } });   // (the group's own frame, as it is at each paint)
    };
    add('back', gBackdrop);
    for (const [k, L] of organLayers()) if (LIVE_LAYERS.has(L)) add(L, k);
    for (const [L, sel] of Object.entries(MASK_OF)) {
      const el = defs.querySelector(sel), g = L === 'gut' ? gGut : organG.stomach;
      const spec = el && readGroup(el);
      if (!spec) { ok = false; continue; }
      // (The gut's: its group's opacity laid with it, and the bowel's picture, at rest, gathered under it with its float. el: the
      // element whose frame m reads, watched by the stack for writes with the mask's own elements: organs-gl watchLive.)
      masks.set(L, L === 'gut' ? { spec, el: g, get m() { return matOfEl(g); }, opacity: parseFloat(getComputedStyle(gGut).opacity), under: [{ name: 'bowel', dy: bowelDy() }] } : { spec, el: g, get m() { return matOfEl(g); } });
    }
    if (!ok) { liveFailed = true; v.organs.setLive(null, null); liveSet = false; hidePlate(); platePoke(); return; }
    // (The next composite renders the stack again for it (its version moved): the vessels themselves need no redraw.)
    v.organs.setLive(organs, masks); liveSet = true;
  }
  // What the plate shows, in coarse steps: re-rasterize when it changes. A selected organ is not part of it: its outline is drawn
  // outside the organs (gSelO, or on the GPU) and its dim on the GPU, and its .org-sel class styles nothing, so the picture was
  // the same; drawing it again made every highlight and unhighlight lag (Mohammad, 20 Oct: "even highlighting the liver is laggy").
  let tintQ = 0;
  let bowelHeld = null;
  function plateStateKey() {
    const cs = wrapCS();
    // The tint in coarse steps, with some hysteresis: a pressure that wavers on a step boundary
    // while the model runs must not re-rasterize the plate over and over.
    const tq = (parseFloat(liverTint.style.opacity) || 0) * 40;
    if (Math.abs(tq - tintQ) > 1.5 || (tq === 0 && tintQ !== 0)) tintQ = Math.round(tq);
    // (With the changing organs painted live, the pictures hold none of them: only the rest is the pictures' state.)
    // (The bowel's float only once the fluid has settled: while it eases, the bowel's picture is moved on the GPU, organs-gl.js shift.)
    if (!fluidEasing()) bowelHeld = organG.bowel.getAttribute('transform');
    if (liveOn()) return ['live', bowelHeld, cs.getPropertyValue('--stage-bg'), cs.getPropertyValue('--organ-liver'), wrap.classList.contains('imaging')].join('|');
    return [liverKey, organG.liver.getAttribute('transform')?.replace(/(\d\.\d\d\d)\d*/g, '$1'), organG.spleen.getAttribute('transform')?.replace(/(\d\.\d\d)\d*/g, '$1'), diaKey,
      tintQ,
      organG.bowel.getAttribute('transform'), (flank.getAttribute('d') || '').slice(0, 24), organEls.umbilicus?.getAttribute('opacity'),
      cs.getPropertyValue('--stage-bg'), cs.getPropertyValue('--organ-liver'), wrap.classList.contains('imaging')].join('|');
  }
  // Hidden (the home page over the app), every organ would rasterize invisible: wait until the figure shows.
  const figureHidden = () => wrapCS().getPropertyValue('visibility') === 'hidden';
  // The circuit's own colours (.cmap) in the dark theme: it sets its own --stage-bg, which the organs' fills mix with. They come
  // on halfway through the switch, when the organs are half faded, and read as a theme change: the picture was dropped, every
  // organ drawn live for the rest of the fade (the gut's 1,201 paths), and the picture drawn again mid-switch, in the circuit's
  // colours, then once more on the way back (Mohammad, 20 Oct: "switching from anatomy to circuit lags mid switch and back").
  // While they are on the organs are fading out or gone, so the picture in the anatomy's colours stays; a change made in the
  // circuit is drawn once the anatomy's colours are back. (In the light themes the circuit keeps the stage's colour: no change.)
  let anatBg = null, cmapSeen = false;
  function circuitInk() {
    const on = stageWrap.classList.contains('cmap');
    if (on !== cmapSeen) { cmapSeen = on; csSnap = null; }   // (the style snapshot is dropped by an observer, a beat after the class)
    const bg = wrapCS().getPropertyValue('--stage-bg');
    if (!on) { anatBg = bg; return false; }
    return anatBg !== null && bg !== anatBg;
  }
  let plateStale = false;
  let plateMiss = 0, fluidStillAt = 0, fluidWas = false;   // (pictures given up in a row; when the fluid last stopped)
  function platePoke() {
    // Not while diving into the lobule (the anatomy is only magnified, then covered): once landed, under the lobule.
    if (lobuleOn && !lz?.isOpen()) return;
    // In the background no picture is begun (below), but one in colours the page no longer has is dropped at once, for the live
    // drawing (already in the colours now, drawn in the same task): the system turns the page light for the app switcher's
    // pictures and dark again while it is hidden, and the light picture stayed on the canvas until the next one replaced it, so
    // coming back showed the organs almost white first (Mohammad, 21 Oct: "the flash when I switch to the app ... still happens").
    if (document.hidden && veins && !veins.lost && plateTheme !== null && veins.hasPlate(0) && !circuitInk()) {
      const theme = wrapCS().getPropertyValue('--stage-bg');
      if (theme !== plateTheme) { plateTheme = theme; hidePlate(); }
    }
    if (!veins || veins.lost || !glWanted(easeInOut(morph)) || figureHidden() || document.hidden || circuitInk()) return;
    // An ease that outgrows the plate (a fill played over days, a liver that changes in small steps) shows on the live drawing
    // as it goes, and the plate is drawn again once it settles: held, the organs inside it stood still while their outlines
    // moved, then jumped to the new shape at the end (Ascites deck slide 5, 17 Oct).
    // (With the changing organs painted live (liveOn) nothing is held or dropped: the pictures under them hold no liver, spleen or
    // diaphragm, and are made again while the fluid eases, a strip a frame, the one shown staying until the new one is in.)
    const live = liveOn();
    if (!live && (lvMoving || fluidEasing())) { if (plateKey && veins.hasPlate(0) && plateStateKey() !== plateKey) hidePlate(); return; }
    // (A growing spleen: no new size may come once it stops, so a later poke rasterizes it once it has settled.)
    if (!live && spleenMoving()) { if (plateKey && veins.hasPlate(0) && plateStateKey() !== plateKey) hidePlate(); clearTimeout(spleenTimer); spleenTimer = setTimeout(platePoke, 320); return; }
    const stale = plateStale; plateStale = false;
    const key = plateStateKey();
    if (key === plateKey && veins.hasPlate(0)) return;
    readFluidInk(wrapCS());
    // A theme switch: the old raster would keep the old background for a beat, so show the live
    // SVG plate (already in the new theme) at once and rasterize again without the throttle.
    const theme = wrapCS().getPropertyValue('--stage-bg');
    const themed = plateTheme !== null && theme !== plateTheme;
    plateTheme = theme;
    // Shown again after being covered while the patient changed (followHidden): the raster still holds the patient before, so
    // the live drawing, already of the patient now, shows until it is rasterized again.
    if ((themed || stale) && veins.hasPlate(0)) {
      hidePlate();
    }
    if (plateBusy) { plateAgain = true; return; }
    // (A liver that just settled may be pausing mid time-lapse: give it a moment.)
    // A picture that came too late (the change moved on before it landed, so it was given up) waits longer the next time, 0.8 s,
    // then 1.6, then 3.2 after the liver or the fluid last moved: a time-lapse that pauses between steps began a whole organ picture in each pause
    // and threw it away, a frame of a quarter of a second each time on an iPhone (Mohammad's ?perf recording, 21 Oct). The live
    // drawing shows meanwhile, as it does now; once one lands the wait is as before.
    // (Now one step only, 0.8 s: the whole picture is made a strip per frame from the shapes that meet each strip (0e73bb6), so one
    // given up costs a strip, and the waits of up to 3.2 s kept the live organs up, every pan or zoom a repaint of all of them, for
    // seconds after a change: external review, 22 Oct.)
    const still = plateMiss ? 800 : 400;
    const wait = themed ? 0 : live ? Math.max(0, 500 - (performance.now() - plateLast)) : Math.max(0, 500 - (performance.now() - plateLast), still - (performance.now() - lvStillAt), 400 - (performance.now() - spleenMv.stillAt()), still - (performance.now() - fluidStillAt));
    clearTimeout(plateTimer);
    plateTimer = setTimeout(async () => {
      const moving = !liveOn() && (lvMoving || fluidEasing() || spleenMoving());
      if (figureHidden() || moving || (lobuleOn && !lz?.isOpen()) || circuitInk() || document.hidden) return;   // hidden, moving or diving meanwhile: a later poke rasterizes
      const k = plateStateKey();
      if (k === plateKey && veins?.hasPlate(0)) return;   // it changed and changed back
      plateBusy = true; plateLast = performance.now();
      plateSeq++;
      try {
        if (await (gpuOrgansOn() ? rasterLayers : rasterPlate)(0, PLATE_RECT, PLATE_BASE)) {
          plateKey = k;
          // The sharp view raster stays until its replacement lands (dropping it first would show
          // the softer whole plate for a beat: the textures would blur, then sharpen).
          plateView = null; plateViewKey = ''; dropViewKeep();   // (a picture of the state before: nothing to take from it)
          veinsDirty = true; stageWake();
          if (!plateOn() && glWanted(easeInOut(morph)) && (liveOn() || (!lvMoving && !spleenMoving()))) {
            // The raster lands outside an animation frame (and the next frames may be paced out):
            // hide the SVG organs only together with a GPU draw that shows the plate, or a frame
            // would show neither (a flash of the dark stage through the organs).
            wrap.classList.add('gl-plate'); syncPlateLook();
            if (!drawVeins()) { wrap.classList.remove('gl-plate'); syncPlateLook(); }
          } else syncPlateLook();
          plateMiss = plateOn() ? 0 : Math.min(3, plateMiss + 1);
          if (!plateOn()) plateKey = '';   // not shown (the liver moved meanwhile): raster again once it settles
          else if (risePrep) { risePrep = false; clearTimeout(risePrepT); }   // (made for the way out: the anatomy under the lobule rests again)
          schedulePlateView(); if (!liveOn()) gutPicSoon();   // (with the organs drawn live the plate stays up through eases, so a gut picture is never shown: gutPicOk)
        } else if (plateStateKey() !== k) plateAgain = true;   // (given up as out of date: drawn again for the state now)
        if (plateAgain && !plateOn()) plateMiss = Math.min(3, plateMiss + 1);   // (and the next one waits longer for the change to rest)
      } catch (e) { console.warn('Plate raster failed; the SVG plate stays.', e); }
      plateBusy = false;
      if (plateAgain) { plateAgain = false; platePoke(); }
    }, wait);
  }
  // In the background nothing is drawn again (the page's colours can change and change back meanwhile, as above): back in
  // view, the picture is checked against the state now, and drawn again only if that differs.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) platePoke(); });
  // The ?perf switch "GPU organs": the picture shown now is dropped (the live drawing shows for a beat) and made again the other way.
  gpuProbe.onOrgans = () => { plateKey = ''; liveFailed = false; if (veins && !veins.lost) { hidePlate(); syncLiveOrgans(); } platePoke(); };
  // After a pan or zoom settles, a raster of the view at the screen's resolution (when the
  // whole-plate raster would look soft there).
  function schedulePlateView() {
    clearTimeout(plateSettle);
    plateSettle = setTimeout(async function settled() {
      // (Not with a finger or button still down, nor within 0.28 s of the last input: it is begun once the figure is let go.)
      if (!leftAlone(280)) { plateSettle = setTimeout(settled, 120); return; }
      if (!veins || !plateOn() || !CTM) return;
      // (Not in the circuit, or on the way to it: the organs are faded out there, and their sharp picture and the gut's were
      // drawn after every pan and pinch for nothing (Mohammad, 21 Oct: the lag "also happens in circuit view"). The way back to
      // the anatomy moves the view on every frame, so the last of them, at the anatomy, schedules them again.)
      if (morphTarget !== 0 || morph > 0) return;
      if (!liveOn()) gutPicSoon();
      const need = vdpr * CTM.sc;
      if (need <= PLATE_BASE * 1.2) { if (veins.hasPlate(1)) { veins.dropPlate(1); veinsDirty = true; stageWake(); } return; }
      // The view in world units (the anatomy is never turned), with a margin, within the plate.
      const r = stageBox(), [ax, ay] = clientToWorldFast(r.left, r.top), [bx, by] = clientToWorldFast(r.right, r.bottom);
      const mx = (bx - ax) * 0.15, my = (by - ay) * 0.15;
      let x0 = Math.max(PLATE_RECT[0], ax - mx), y0 = Math.max(PLATE_RECT[1], ay - my);
      let x1 = Math.min(PLATE_RECT[0] + PLATE_RECT[2], bx + mx), y1 = Math.min(PLATE_RECT[1] + PLATE_RECT[3], by + my);
      if (x1 <= x0 || y1 <= y0) return;
      // (4094: the rect grows by up to a pixel each way below, and a texture side stays within 4096.)
      const scale = Math.min(need, 4094 / (x1 - x0), 4094 / (y1 - y0), Math.sqrt(4.2e6 / ((x1 - x0) * (y1 - y0))));
      // On the scale's pixel grid (grown outward to whole pixels): two views at one scale sit whole pixels apart, so the next pan
      // can take the pixels they share (rasterPlate).
      x0 = Math.floor(x0 * scale) / scale; y0 = Math.floor(y0 * scale) / scale; x1 = Math.ceil(x1 * scale) / scale; y1 = Math.ceil(y1 * scale) / scale;
      const key = `${plateKey}|${x0.toFixed(0)},${y0.toFixed(0)},${x1.toFixed(0)},${y1.toFixed(0)}|${scale.toFixed(2)}`;
      if (key === plateViewKey) return;
      if (plateView && x0 >= plateView[0] && y0 >= plateView[1] && x1 <= plateView[2] && y1 <= plateView[3] && scale <= plateView[4] * 1.05) return;
      plateViewKey = key;
      try { if (await (gpuOrgansOn() ? rasterLayers : rasterPlate)(1, [x0, y0, x1 - x0, y1 - y0], scale)) { plateView = [x0, y0, x1, y1, scale]; veinsDirty = true; stageWake(); } else if (plateViewKey === key) plateViewKey = ''; } catch { /* the whole-plate raster stays */ }
    }, 280);
  }
  // ── The gut's picture while the organs ease ─────────
  // While the live drawing shows (the plate is down while the liver, the spleen or the fluid eases), the gut was repainted on
  // every frame the liver changed, though nothing in it does: its mask (#gutHide) holds the liver's outline, and a mask that
  // changes repaints everything it covers, the gut's 1,201 paths (Mohammad, 20 Oct: "why is it redrawing if there is nothing
  // happening there"). So while the plate is down the gut shows as a picture of itself, made at rest from the plate's copy at
  // the plate's resolution (as the GPU shows it at rest), under the gut's own live mask and opacity: the liver's cut still
  // follows the liver each frame, over one image instead of the paths. The groups that move together are one image, placed with
  // their transform (the small bowel floats on the fluid: a run of its own). A picture that no longer fits (the theme, a change
  // in the art, a zoom past its resolution, groups of one run apart) is not used: the live paths show, as before.
  // What the gut's colours are made of, read again only when the classes or the theme change.
  const GUT_VARS = ['--og-gut-1', '--og-gut-2', '--og-gut-3', '--og-ao', '--og-light', '--og-hi', '--og-hi-k', '--gut-rim-k', '--organ-gut', '--stage-bg'];
  function gutLook() {
    const r = document.documentElement, at = `${gestureFree(wrap.className).replace(/\bgl-plate\b/, '')}|${r.className}|${r.dataset.theme || ''}|${darkMq.matches}`;
    if (at !== gutLookAt) { const cs = getComputedStyle(gGut); gutLookAt = at; gutLookV = GUT_VARS.map((v) => cs.getPropertyValue(v).trim()).join('|'); }
    return gutLookV;
  }
  function gutRuns() {
    const runs = [];
    let prev = null;
    for (const k of gutKids()) { if (!runs.length || k === organG.bowel || prev === organG.bowel) runs.push([]); runs[runs.length - 1].push(k); prev = k; }
    return runs;
  }
  const trOf = (el) => el.getAttribute('transform') || '';
  function gutPicOk() {
    if (plateOn() || !veins || veins.lost || !CTM || !glWanted(easeInOut(morph))) return false;
    const pic = gutPicFor(vdpr * CTM.sc);
    if (!pic) return false;
    return pic.runs.every((r) => r.kids.every((k) => trOf(k) === trOf(r.kids[0])));
  }
  // The picture for this zoom among those kept: of the art and colours now, at most 1.15x softer and 2x sharper than the
  // screen, the closest. Two are kept (the one before stays when a new zoom has one made), so a slide whose camera glides back
  // out while the organs ease (an ascites slide from a close-up to the whole figure, Mohammad's iPhone ?perf recording, 21 Oct:
  // "zoomed out past it", 95-120 ms frames with the gut's live paths) still finds the picture made at the zoom it comes back to.
  function gutPicFor(need) {
    let best = null;
    // (Zoomed in past the whole gut's sharpest picture, one of the view's part of it (gutWin) stands in: as sharp as the organs'
    // own picture of that view at rest, and only while every run's place still lies inside it.)
    const win = need > GUT_CAP * 1.15 ? gutWin(0) : null;
    for (const p of gutPics) {
      if (p.mut !== gutMut || p.look !== gutLook()) continue;
      if (p.win) { if (!win || p.k * 1.15 < win.scale || p.k > need * 2 || !gutWinHolds(p, win)) continue; }
      else if (p.k * 1.15 < need || p.k > need * 2) continue;
      if (!best || Math.abs(Math.log(p.k / need)) < Math.abs(Math.log(best.k / need))) best = p;
    }
    return best;
  }
  // The view's part of the gut, in the world, for a picture past GUT_CAP: the view with `margin` of its size around it, within the
  // gut's rect, at the scale the organs' sharp picture of such a view has (schedulePlateView: the screen's, within 4.2 MP).
  function gutWin(margin = 0.15) {
    if (!CTM) return null;
    const r = stageBox(), [ax, ay] = clientToWorldFast(r.left, r.top), [bx, by] = clientToWorldFast(r.right, r.bottom);
    const mx = (bx - ax) * margin, my = (by - ay) * margin;
    const x0 = Math.max(GUT_RECT[0], ax - mx), y0 = Math.max(GUT_RECT[1], ay - my);
    const x1 = Math.min(GUT_RECT[0] + GUT_RECT[2], bx + mx), y1 = Math.min(GUT_RECT[1] + GUT_RECT[3], by + my);
    if (x1 <= x0 || y1 <= y0) return null;
    const w = x1 - x0, h = y1 - y0, need = vdpr * CTM.sc;
    return { rect: [x0, y0, w, h], scale: Math.min(need, 4094 / w, 4094 / h, Math.sqrt(4.2e6 / (w * h))) };
  }
  // Whether a picture of part of the gut still holds the view (`win`, no margin) for every run, each in its own frame (the bowel
  // floats: its run is moved by its translate).
  function gutWinHolds(p, win) {
    const [vx, vy, vw, vh] = win.rect, [px, py, pw, ph] = p.win;
    return p.runs.every((r) => {
      const t = trOf(r.kids[0]), m = t.match(/^translate\(([-\d.]+)[ ,]+([-\d.]+)\)$/), [tx, ty] = !t ? [0, 0] : m ? [+m[1], +m[2]] : [NaN, NaN];
      const x = vx - tx, y = vy - ty;
      return x >= px - 0.5 && y >= py - 0.5 && x + vw <= px + pw + 0.5 && y + vh <= py + ph + 0.5;
    });
  }
  // (For the ?perf readout: why the gut shows its live paths while the organ picture is down.)
  function gutLiveWhy() {
    const pics = gutPics.filter((p) => p.mut === gutMut), need = vdpr * (CTM?.sc || 0);
    if (!gutPics.length) return 'no picture';
    if (!pics.length) return 'art changed';
    const looks = pics.filter((p) => p.look === gutLook());
    if (!looks.length) return 'colours changed';
    if (need > GUT_CAP * 1.15) return looks.some((p) => p.win) ? 'moved off its part' : 'zoomed past it';
    if (looks.every((p) => p.k * 1.15 < need)) return 'zoomed past it';
    if (!gutPicFor(need)) return 'zoomed out past it';
    return 'moved apart';
  }
  function syncGutPic() {
    if (!gGut) return;
    const on = gutPicOk();
    if (on) {
      const pic = gutPicFor(vdpr * CTM.sc);
      if (pic !== gutPic) { gutPic = pic; gGutPics.replaceChildren(...pic.runs.map((r) => r.img)); }
      for (const r of gutPic.runs) { const t = trOf(r.kids[0]); if (t) putA(r.img, 'transform', t); else r.img.removeAttribute('transform'); }
      // The live grey is each paint's own colour made grey (greyOn): the same grey over the picture, a linear map, as the same.
      const grey = !!greyList && plateSat < 1;
      if (grey) putA(gutPicGreyFx, 'values', organDimMatrix(1, plateSat));
      if (grey) putA(gGutPics, 'filter', 'url(#gutPicGrey)'); else gGutPics.removeAttribute('filter');
    }
    if (on === gutPicOn) return;
    gutPicOn = on;
    gGutPics.style.display = on ? '' : 'none';
    gGut.classList.toggle('gut-pic-on', on);
  }
  // (Begun once the figure has been left alone for a second, finger lifted: it is a long piece of work, and it was made 0.6 s after
  // each pinch, as the menus faded back in.)
  function gutPicSoon() {
    clearTimeout(gutPicTimer);
    const go = () => { if (!leftAlone(1000)) { gutPicTimer = setTimeout(go, 250); return; } makeGutPic().then(gutPicsIn).then(gutPicsOut).catch(() => { /* the live paths stay */ }); };
    gutPicTimer = setTimeout(go, 350);
  }
  // The gut's pictures for the zooms further out, down to the whole figure (its home framing, or the whole plate if that is
  // further out): a slide's camera often glides out while the organs ease, and the picture of the close-up was then too sharp
  // for it, so the gut drew its live paths in every frame of the change (Mohammad's iPhone ?perf recording, 21 Oct:
  // "zoomed out past it", 95-300 ms frames). Each step down is half the pixels of the one above, so they cost little.
  // And the two steps further in, up to the cap: a pinch in during a change then finds a picture at once, instead of the gut's live
  // paths until the pinch is let go and its own picture made (external review, 22 Oct). Every step is at or under the cap, each
  // kept once, so all the pictures together stay under twice the cap's pixels.
  async function gutPicsIn() {
    if (!CTM || vdpr * CTM.sc > GUT_CAP) return;
    const k0 = gutStep(vdpr * CTM.sc, GUT_CAP);
    for (let k = k0 * Math.SQRT2, n = 0; n < 2 && k <= GUT_CAP * 1.001; k *= Math.SQRT2, n++) { if (!leftAlone(1000)) return; await makeGutPic(k / 1.01); }
  }
  async function gutPicsOut() {
    if (!CTM || !(vt.k > 0)) return;
    const lo = gutStep(vdpr * CTM.sc / vt.k * Math.min(1, homeAt?.k ?? 1), GUT_CAP);
    const top = vdpr * CTM.sc > GUT_CAP * 1.15 ? GUT_CAP * Math.SQRT2 : gutStep(vdpr * CTM.sc, GUT_CAP);   // (past the cap: the view's part was made, the whole from the cap down)
    for (let k = top / Math.SQRT2; k >= lo * 0.99; k /= Math.SQRT2) { if (!leftAlone(1000)) return; await makeGutPic(k / 1.01); }   // (not under a finger: a later rest makes them)
  }
  async function makeGutPic(need = vdpr * (CTM?.sc || 0)) {
    // (From the gut's copy, kept across the plate's drops, of the same art and colours: with the plate down too. Zoomed in during a
    // change, no kept picture was sharp enough and none could be made until the plate came back, so the gut's 1,201 paths were drawn
    // on every frame of the pinch and the ease: Mohammad on f65f3bb, "extreme lag ... as I zoom or pan around during that change".)
    if (!gGut || !CTM || morphTarget !== 0 || morph > 0 || !gutCopy?.gut.length || gutCopy.gutMut !== gutMut || gutCopy.look !== gutLook()) return;
    // Zoomed in past what a picture of the whole gut can hold, the picture is of the view's part of it, with a margin (and the
    // bowel's float of 26 above and below), at the organs' own sharpness for the view (Mohammad's Mac ?perf, zoom 3.06, 21 Oct:
    // "gut live: zoomed past it", 160-220 ms frames while the liver eased).
    let win = null;
    if (need > GUT_CAP * 1.15) {
      const g = gutWin(0.15);
      if (!g) return;
      const y0 = Math.max(GUT_RECT[1], g.rect[1] - 28), y1 = Math.min(GUT_RECT[1] + GUT_RECT[3], g.rect[1] + g.rect[3] + 28), w = g.rect[2], h = y1 - y0;
      const k = Math.min(g.scale, 4094 / w, 4094 / h, Math.sqrt(4.2e6 / (w * h)));
      win = { rect: [g.rect[0], y0, w, h], k };
      const w0 = gutWin(0);
      if (w0 && gutPics.some((p) => p.win && p.mut === gutMut && p.look === gutLook() && p.k * 1.15 >= w0.scale && gutWinHolds(p, w0))) return;
    }
    const R = win ? win.rect : GUT_RECT;
    const k = win ? win.k : gutStep(need, GUT_CAP), look = gutLook(), mut = gutMut;   // (the next fixed step at or above the view's: never stretched)
    if (!win && gutPics.some((p) => !p.win && p.mut === mut && p.look === look && p.k === k)) return;
    const seq = ++gutPicSeq, W = Math.max(1, Math.round(R[2] * k)), H = Math.max(1, Math.round(R[3] * k));
    const ser = new XMLSerializer(), copies = gutCopy.gut, head = gutCopy.head, runs = [];
    try {
      for (const kids of gutRuns()) {
        const body = kids.map((kid) => { const i = String([...gGut.children].indexOf(kid)), c = copies.find((el) => el.getAttribute('data-gut') === i)?.cloneNode(true); if (!c) throw new Error('gut copy'); c.removeAttribute('transform'); c.removeAttribute('data-gut'); return ser.serializeToString(c); }).join('');
        const src = URL.createObjectURL(new Blob([`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="${R.join(' ')}" preserveAspectRatio="none">${head}${body}</svg>`], { type: 'image/svg+xml' }));
        let blob;
        try {
          const img = new Image();
          await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = src; });
          const cv = document.createElement('canvas');
          cv.width = W; cv.height = H;
          // (A strip per frame, as the plate's picture: drawn whole, the gut's 1,201 paths took one long frame after a pinch.)
          const cg = cv.getContext('2d');
          for (const [y, rows] of plateStrips(W, H)) {
            if (y) await new Promise((res) => nextFrame(res));
            if (seq !== gutPicSeq) throw new Error('overtaken');
            cg.drawImage(img, 0, y, W, rows, 0, y, W, rows);
          }
          blob = await gpuProbe.time(null, 'gut picture: encode', () => new Promise((res) => cv.toBlob(res, 'image/png')));
          cv.width = cv.height = 0;
        } finally { URL.revokeObjectURL(src); }
        if (!blob) throw new Error('gut picture');
        const url = URL.createObjectURL(blob);
        runs.push({ kids, url });
        // Decoded before it can show, so the first frame of an ease does not wait for it.
        const keep = new Image(); keep.src = url; await keep.decode();
        runs[runs.length - 1].keep = keep;
        if (seq !== gutPicSeq || mut !== gutMut) throw new Error('overtaken');
      }
    } catch (e) { for (const r of runs) URL.revokeObjectURL(r.url); throw e; }
    gutPic = { k, look, mut, win: win ? R : null, runs: runs.map(({ kids, url, keep }) => ({ kids, url, keep, img: s('image', { href: url, x: R[0], y: R[1], width: R[2], height: R[3], preserveAspectRatio: 'none' }) })) };
    gGutPics.replaceChildren(...gutPic.runs.map((r) => r.img));
    // (Those before are kept if they are of the same art and colours, for the zooms out (gutPicsOut) or one it may come back to: up to
    // seven, every step from the cap down to an eleventh of it, so the chain gutPicsOut makes never pushes out the picture of the zoom
    // it began at (it kept three: external review, 21 Oct). Each step has half the pixels of the one above, so all of them together
    // are less than twice the largest.)
    // (Of the view's part, only the newest is kept: each is up to 4.2 MP.)
    // (Nine: the zoom it began at, the two steps in (gutPicsIn) and seven out.)
    const kept = gutPics.filter((p) => p.mut === mut && p.look === look && (p.win ? !win : p.k !== k)).slice(-9);
    for (const p of gutPics) if (!kept.includes(p)) for (const r of p.runs) URL.revokeObjectURL(r.url);
    gutPics = [...kept, gutPic];
    gutPicOn = false; gGutPics.style.display = 'none'; gGut.classList.remove('gut-pic-on');
    syncGutPic();
  }
  function clientToWorldFast(cx, cy) {
    if (!CTM) refreshCTM();
    const { a, b, c, d, e, f } = CTM, det = a * d - b * c || 1, x = cx - e, y = cy - f;
    return [(d * x - c * y) / det, (-b * x + a * y) / det];
  }
  // With a vessel selected the organs (and the ascites over them) step back to SEL_DIM, as app.css's .has-sel filter (G20).
  const SEL_DIM = 0.6;
  const SPOT_NET = 0.16;   // the network's alpha outside a slide's spotlight (deck visuals V2)
  // The plate's dim and grey (a lens or a selection) and the network's dim ease toward their targets
  // (stepPlateEase, each frame), so a lens switch or a selection never changes the figure in one frame.
  const plateTargets = () => {
    const dataLayer = wrap.classList.contains('data-layer'), own = wrap.classList.contains('has-sel') || wrap.classList.contains('shunting'), sel = own || spotOn();
    // (A slide's spotlight steps the rest of the network further back than a selection, SPOT_NET: its vessels are a set, and a pale
    // one, as the paraumbilical vein in Pressure colours, must still stand out of it.)
    return [(sel ? SEL_DIM : 1) * (dataLayer ? 0.72 : 1), dataLayer ? 0.12 : 1, own ? 0.42 : sel ? SPOT_NET : 1];
  };
  function syncPlateLook() {
    syncOrganDim(); syncGutPic();
    if (!vLook) return;
    if (plateDim == null || reduceMotion.matches) [plateDim, plateSat, netA] = plateTargets();
    vLook.plate = plateOn() ? { alpha: (1 - easeInOut(morph)) * plateDim, sat: plateSat, stack: gpuOrgansOn() } : null;
    vLook.netAlpha = netA;
  }
  // The live SVG organs (shown while the GPU copy is off: a patient change, a theme switch, no WebGL) take the same dim and
  // grey, on the same eased values (organ-dim.js), only while they show. The grey is each fill, stroke and gradient stop's own
  // colour made grey (organ-grey.js), and the dim the groups' opacity: no filter. A filter over the organs made Safari draw
  // every organ again on each frame of a change in any lens but Pressure (a cirrhosis slider, HVPG 8 to 9, 17 Oct), and one on
  // each organ came on a frame late in Safari (the organs flashed to colour). The same picture as the filter's: the grey is
  // linear in each colour and keeps alpha, so greying each paint equals greying their composite, overlaps and translucency
  // included; opacity multiplies alpha as the matrix's alpha row did. A colour the grey cannot read keeps the filter.
  const organDimFx = defs.querySelector('#organDim feColorMatrix');
  let organDimKey = '', greyList = null, greyFilter = false;
  // (While dimmed the groups' opacity transition (app.css, .5 s) is off: it would start each dim from full strength, a flash of
  // the undimmed organs at every patient change. The dim eases on the plate's own clock, as the filter's did.)
  function paintOrganAlpha() {
    const a = String(organMorphA * organDimA), tr = organDimA !== 1 ? 'none' : '';
    for (const g of [gOrgans, gBackdrop]) {
      if (g.style.transition !== tr) g.style.transition = tr;
      if (g.style.opacity !== a) g.style.opacity = a;
    }
  }
  // Every colour the organs paint with (shapes, their gradients' stops and patterns' contents), as computed with no grey on.
  const GREY_TAGS = new Set(['path', 'circle', 'ellipse', 'rect', 'polygon', 'polyline', 'line', 'text', 'tspan', 'use', 'stop']);
  function greyRead() {
    const list = [], refs = [], seen = new Set();
    const visit = (el) => {
      if (!GREY_TAGS.has(el.localName)) return true;
      const cs = getComputedStyle(el);
      for (const p of el.localName === 'stop' ? ['stop-color'] : ['fill', 'stroke']) {
        const v = cs.getPropertyValue(p).trim();
        if (!v || v === 'none') continue;
        const id = paintRef(v);
        if (id) { refs.push(id); continue; }   // (a gradient or pattern: its own colours are greyed)
        const c = parseColor(v);
        if (!c) return false;
        list.push({ el, p, c, was: el.style.getPropertyValue(p), pri: el.style.getPropertyPriority(p) });
      }
      return true;
    };
    for (const el of [...gBackdrop.querySelectorAll('*'), ...gOrgans.querySelectorAll('*')]) if (!gGutCuts.contains(el) && !visit(el)) return null;   // (the gut's patches stay the stage's colour, as the stage shows through a cut)
    while (refs.length) {
      const id = refs.pop();
      if (seen.has(id)) continue;
      seen.add(id);
      const r = svg.querySelector(`[id="${id}"]`);
      if (r) for (const el of r.querySelectorAll('*')) if (!visit(el)) return null;
    }
    return list;
  }
  function greyClear() {
    if (!greyList) return;
    for (const g of greyList) { if (g.was) g.el.style.setProperty(g.p, g.was, g.pri); else g.el.style.removeProperty(g.p); }
    greyList = null;
  }
  function greySet(sat) {
    if (greyFilter) { organDimFx.setAttribute('values', organDimMatrix(1, sat)); return; }
    for (const g of greyList) g.el.style.setProperty(g.p, greyOf(g.c, sat), 'important');
  }
  // The colours are read again when what they depend on changes (the theme, the stage's classes), before the next paint.
  const greyDeps = () => { const r = document.documentElement; return `${gestureFree(wrap.className)}|${r.className}|${r.dataset.theme || ''}|${matchMedia('(prefers-color-scheme: dark)').matches}`; };
  let greyAt = '';
  const greyStale = () => { if (greyList && greyDeps() !== greyAt) { greyClear(); organDimKey = ''; syncOrganDim(); } };
  new MutationObserver(greyStale).observe(wrap, { attributes: true, attributeFilter: ['class'] });
  new MutationObserver(greyStale).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });   // (not its style: label sizes change there on every frame of a glide)
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', greyStale);
  function greyOn(sat) {
    if (!greyFilter && !greyList) {
      greyList = greyRead(); greyAt = greyDeps();
      if (!greyList) { greyFilter = true; for (const g of [gOrgans, gBackdrop]) g.setAttribute('filter', 'url(#organDim)'); }
    }
    greySet(sat);
  }
  function greyOff() {
    greyClear();
    if (greyFilter) { greyFilter = false; for (const g of [gOrgans, gBackdrop]) g.removeAttribute('filter'); }
  }
  function syncOrganDim() {
    if (plateDim == null || reduceMotion.matches) [plateDim, plateSat, netA] = plateTargets();
    const on = !plateOn() && (plateDim < 1 || plateSat < 1);
    const grey = on && plateSat < 1;
    const key = on ? `${plateDim}|${grey ? plateSat : 1}` : '';
    if (key === organDimKey) return;
    organDimKey = key;
    organDimA = on ? plateDim : 1; paintOrganAlpha();
    if (grey) greyOn(plateSat); else greyOff();
  }
  const plateEasing = () => { if (plateDim == null) return false; const [d, s, n] = plateTargets(); return d !== plateDim || s !== plateSat || n !== netA; };
  // Timed on the clock with an ease in and out (PLATE_FADE), so the organs fade to grey and back smoothly at any frame rate.
  // One clock for organs and vessels (G18): the plate eases over the vessels' own lens crossfade, from the same moment, on the
  // same curve, as the SVG organs' filter does when the GPU plate is off (app.css: --view-fade, --ease-io).
  const PLATE_FADE = LENS_FADE;
  let plateFrom = null, plateTo = null, plateT0 = 0;
  function stepPlateEase() {
    if (lensFrom) { veinsDirty = true; glowSync = true; }   // (each frame of the crossfade syncs the vessels, paused too, so it runs to its end)
    if (!spot.on && !plateEasing()) spot.live = false;   // (the spotlight's dim has eased away: the ascites goes back to its own)
    if (!plateEasing()) { plateFrom = null; return; }
    const to = plateTargets(), now = performance.now();
    if (!plateFrom || to.some((v, i) => v !== plateTo[i])) { plateFrom = [plateDim, plateSat, netA]; plateTo = to; plateT0 = lensFrom && now - lensT0 < 60 ? lensT0 : now; }
    const u = easeInOut(clamp((now - plateT0) / PLATE_FADE, 0, 1));
    [plateDim, plateSat, netA] = u >= 1 ? to : plateFrom.map((v, i) => v + (to[i] - v) * u);
    if (u >= 1) plateFrom = null;
    syncPlateLook(); veinsDirty = true;
  }

  // Circuit liver module: collapsed unless asked for, selected into, or zoomed in on.
  function liverExpanded() {
    const sel = store.get().selection;
    return vt.k >= 1.9 || (sel?.type === 'edge' && LIVER_EDGES.has(sel.id)) || (sel?.type === 'node' && LIVER_INNER.has(sel.id));
  }

  // ── Model-driven transitions ──────────────────────
  // Nothing flashes or sweeps across the anatomy. Pressure change shows as the vessel's own color
  // easing; reversed flow is a steady state (its tracers run the other way);
  // the one animation is a collateral or shunt that opens, drawn on in the direction of its
  // flow, and, when it closes or is removed, retracted back the way it came. Nothing runs under
  // reduced motion or in the figure view.
  const track = {};
  const appEl = document.getElementById('app');
  const quietFx = () => reduceMotion.matches || isImaging();
  // A vessel that opened or closed while the figure was covered draws on or off from that moment, not when it is shown again (followHidden).
  let fxAt = null;
  function trackChanges(f) {
    const now = fxAt ?? performance.now();
    const quiet = quietFx();
    for (const x of EV) {
      const e = x.e;
      const q = f.Qf ? f.Qf[EI[e.id]] : f.Q[EI[e.id]];
      const open = x.vis && !x.g.classList.contains('coll-ghost') && !x.reveal?.out;
      const was = track[e.id];
      track[e.id] = open;
      if (was === false && open && canFade(x) && !quiet) x.reveal = { t0: now, dur: e.kind === 'shunt' ? 900 : 1500, dir: q >= 0 ? 1 : -1 };
    }
  }
  // The vessels that come and go with the disease (collaterals, shunts, the epigastric veins that
  // open with the paraumbilical route) draw on when they appear and retract when they leave.
  const canFade = (x) => !x.isArt && (x.e.kind === 'collateral' || x.e.kind === 'shunt' || NEEDS_C3.has(x.e.id));
  function startExit(x, f) {
    const q = f.Qf ? f.Qf[EI[x.e.id]] : f.Q[EI[x.e.id]];
    x.reveal = { t0: fxAt ?? performance.now(), dur: x.e.kind === 'shunt' ? 700 : 1100, dir: q >= 0 ? 1 : -1, out: true };
  }
  // When the retraction ends: hide the vessel, or leave the dotted outline of a closed collateral.
  function finishExit(x) {
    if (!F) return;
    if (!edgeVisible(x, F)) { setStyle(x, 'display', 'none'); x.vis = false; }
    else if (x.e.kind === 'collateral' && !collOpen(x.e.id, F)) cls(x, 'coll-ghost', true);
  }
  const REVEAL_PARTS = ['shadow', 'wall', 'lumen', 'shade', 'sheen'];
  function stepReveals(now) {
    let finished = false;
    for (const x of EV) {
      if (!x.reveal) continue;
      const r = x.reveal;
      const u = clamp((now - r.t0) / r.dur, 0, 1);
      const done = u >= 1 || quietFx();
      const off = (r.out ? easeInOut(u) : 1 - easeInOut(u)) * r.dir;
      for (const el of REVEAL_PARTS.map((part) => x[part]).concat(x.strands ? x.strands.flatMap((sd) => [sd.wall, sd.lumen]) : [])) {
        if (!el) continue;
        if (done) { el.removeAttribute('pathLength'); el.style.strokeDasharray = ''; el.style.strokeDashoffset = ''; continue; }
        el.setAttribute('pathLength', '1');
        el.style.strokeDasharray = '1 1';
        el.style.strokeDashoffset = off.toFixed(4);
      }
      if (done) { x.reveal = null; finished = true; if (r.out) finishExit(x); }
    }
    // Rebuild at once so the vessel turns from the drawn-on stroke into its shaded tube on the
    // same frame, rather than holding the stroke until the next model update.
    if (finished && F && !inUpdate) update(F);
    else if (veins && !inUpdate && EV.some((x) => x.reveal)) syncVeins(easeInOut(morph));
  }
  // Δ halos: after a change, the three places whose pressure moved most get a brief ring and
  // their change in mmHg, once the model has had a moment to respond. Answers "what did that do?"
  // without a sweep across the whole figure.
  const gHalo = s('g', { id: 'halos', 'aria-hidden': 'true' });
  gOver.after(gHalo);
  let haloBase = null, haloTimer = 0, deltaT = 0;
  // Opening or resuming the app restores parameters and the model settles; that is not a change to explain.
  let resumedAt = 0;
  document.addEventListener('visibilitychange', () => { resumedAt = performance.now(); });
  addEventListener('pageshow', () => { resumedAt = performance.now(); });
  store.on('params', () => {
    if (routeCustomShunts(store.get().params)) updateGeometry(true);
    // (A presentation explains its own changes: no halos over its slides.)
    if (!F || quietFx() || store.get().presenting || performance.now() < 5000 || performance.now() - resumedAt < 4000) return;
    if (!haloBase) haloBase = { P: Float64Array.from(F.P), t: performance.now() };
    clearTimeout(haloBase.timer);
    haloBase.timer = setTimeout(() => { if (F && haloBase) { haloBase.t = 0; stepHalos(F, easeInOut(morph)); } }, 1200);
  });
  // Loading a patient (or going back to one) is not a change to explain: no halos, and none left
  // over in a view they no longer mark.
  function dropHalos() {
    if (haloBase) clearTimeout(haloBase.timer);
    haloBase = null;
    clearTimeout(haloTimer);
    gHalo.replaceChildren(); setGlowSrc('delta', []);
  }
  store.on('presetId', dropHalos);
  store.on('view', dropHalos);
  function stepHalos(f, t) {
    if (!haloBase || performance.now() - haloBase.t < 1100) return;
    const base = haloBase.P; haloBase = null;
    if (quietFx() || !f.P) return;
    const cand = [];
    for (const n of NODES) {
      // (A ring marks a place on a drawn vessel: none over a station with nothing drawn at it, as no dot is.)
      if (n.kind === 'wedge' || HIDDEN_NODES.has(n.id) || !NODE_POS[n.id] || !nodeVisible(n.id)) continue;
      const d = f.P[NI[n.id]] - base[NI[n.id]];
      if (Math.abs(d) >= 1) cand.push([n.id, d]);
    }
    cand.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    clearTimeout(haloTimer);
    // The vessels whose pressure moved by 2 mmHg or more glow briefly (warm: up, cool: down), so the
    // reach of a change shows along the network, not only at the three rings.
    const glows = [];
    for (const e of EDGES) {
      const x = E[e.id];
      if (!x?.vis || x.isArt || e.kind === 'wedge' || x.g.classList.contains('coll-ghost')) continue;
      const d = (f.P[NI[e.from]] + f.P[NI[e.to]] - base[NI[e.from]] - base[NI[e.to]]) / 2;
      if (Math.abs(d) >= 2) glows.push([x, d]);
    }
    glows.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    if (!reduceMotion.matches) setGlowSrc('delta', glows.slice(0, 16).map(([x, d]) => ({ id: x.e.id, col: d > 0 ? 'var(--glow-up)' : 'var(--glow-down)', amt: 1.35, wide: 1.1, dur: 420 })));
    gHalo.replaceChildren(...cand.slice(0, 3).map(([id, d]) => {
      const [x, y] = nodePos(id, t);
      return s('g', { class: 'halo ' + (d > 0 ? 'up' : 'down'), transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})` },
        s('circle', { r: 16 }), s('text', { y: -24, 'text-anchor': 'middle' }, `${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(Math.abs(d) < 10 ? 1 : 0)}`));
    }));
    haloTimer = setTimeout(() => gHalo.replaceChildren(), 1700);
    clearTimeout(deltaT); deltaT = setTimeout(() => setGlowSrc('delta', []), 1000);
  }

  // The organ outlines (selected, hovered) are drawn on the GPU with the figure, so a drag, pinch
  // or zoom moves them in the same frame (an SVG overlay is composited apart and can trail it).
  // Each one fades in and out; the SVG lines are kept only where the GPU cannot draw them.
  const glLines = !!veins?.canLines;
  const OL_LOOK = { sel: [2.6, 0.7], hov: [2, 0.45], pin: [2.6, 0.6], spot: [2.6, 0.6], normal: [1.4, 0.5] };   // as .org-sel-line and .org-hov-line: width, opacity
  // (spot: a slide's spotlit organ, as a pinned one; normal: the normal-sized spleen's thin line inside an enlarged one, V18.)
  // A selected organ is outlined in its own deep tone (--og-<tone>-3, read through the organ's tone class as --o3), not the
  // accent blue, with a soft glow of the same tone easing out from its edge (G20). Hovered, the same tone without the glow.
  const SEL_GLOW = { reach: 12, alpha: 0.22 };
  const orgToneCache = new Map();
  function orgTone(id) {
    const k = `${id}|${document.documentElement.dataset.theme}|${darkMQ.matches}`;
    let c = orgToneCache.get(k);
    if (!c) {
      const g = organG[id], v = g && getComputedStyle(g).getPropertyValue('--o3').trim();
      c = v ? [...toRGB(v, null)].slice(0, 3) : olCol;
      if (v) orgToneCache.set(k, c);
    }
    return c;
  }
  const OL_FADE = 160;   // ms
  // A narrowing's clamp and its "60 %" fade in and out with the narrowing (they had popped): each narrowing's shown amount
  // (0 … 1), stepped in olStep. A narrowing that goes keeps its marks, moved to ov.clampsOut, until they have faded.
  // (The arrows are drawn on the GPU, so their fade is the draw's alpha; the label, and the arrows without the GPU, take opacity.)
  const CLAMP_FADE = 250;   // ms
  const clampA = new Map();   // id → { a, on }
  let clampLast = 0;
  const clampFading = () => { for (const c of clampA.values()) if (c.a !== (c.on ? 1 : 0)) return true; return false; };
  const clampEase = (id) => { const a = clampA.get(id)?.a ?? 1; return a * a * (3 - 2 * a); };
  function clampShade(id) {
    const e = clampEase(id), op = e < 1 ? e.toFixed(3) : '';
    for (const g of [ov.clamps, ov.clampsOut]) for (const el of g.querySelectorAll(`[data-id="${id}"]`)) if (el.tagName === 'text' || !glLines) el.style.opacity = op;
  }
  // The heart a slide points at (the right atrium, the heart itself) is lit whole by a soft glow, not a line: one band
  // easing out from its edge (the GPU shades the falloff smoothly, behind the organs): reach in world units, peak opacity.
  const HEART_GLOW = { reach: 46, alpha: 0.34 };
  let olPath = null;   // sampled in <defs>: the organ itself is hidden while the GPU draws the plate
  // A tube (the bowel, colon, duodenum: a stroke along a centre line) is outlined along both its edges (bandRing), at the
  // width its edge is stroked. bare: the organ's own path at its normal size, not as the figure now scales it (the normal
  // spleen, V18).
  const BAND_IDS = new Set(ORGANS.filter((o) => o.band).map((o) => o.id));
  // An organ with a drawn outline of its own (ORGANS ring: the colon as it shows, the transverse colon over the limbs behind)
  // is outlined along it; the small bowel's path is already its outline, the whole pile as one.
  const RING_OF = Object.fromEntries(ORGANS.filter((o) => typeof o.ring === 'string').map((o) => [o.id, o.ring]));
  function olRings(id, bare = false) {
    const rings = olRingsRaw(id, bare);
    if (BAND_IDS.has(id) && !RING_OF[id]) {
      const o = ORGANS.find((q) => q.id === id), edge = organG[id].querySelector('.band-edge');
      const w = o.ringW || (edge ? parseFloat(getComputedStyle(edge).strokeWidth) : 0);
      return w > 0 ? rings.map((r) => bandRing(r, w / 2)).filter((r) => r.length) : rings;
    }
    return rings;
  }
  // A group's transform as one matrix, read without consolidate() (which rewrites the attribute as a matrix(), and the group's own
  // writer puts translate() back, so the outline keys would change at every build).
  const gMatrix = (g) => { const l = g.transform.baseVal; let m = null; for (let i = 0; i < l.numberOfItems; i++) { const t = l.getItem(i).matrix; m = m ? m.multiply(t) : t; } return m; };
  // An outline's points in its own coordinates, every `stride` along it, kept by its path (bounded: an easing liver's outline is
  // new on every frame). Measured piece by piece (path-pieces.js): getPointAtLength along the whole path walks it from its start
  // on every call, and the first Doppler probe read every organ so (the colon's 608 pieces at 1752 points), a second or two
  // with the page held as a monitor first opened (Mohammad, 22 Oct). The same points, measured once per path.
  const olLocalMemo = new Map();
  let olPieceG = null;
  function olLocal(src, stride) {
    const mk = `${stride}|${src}`;
    let r = olLocalMemo.get(mk);
    if (r) return r;
    let L, at;
    const pieces = pathPieces(src);
    if (pieces) {
      // (Each curve its own fresh element, all put in at once and taken out after: a reused element can keep measuring its last
      // course in Chromium, sample() above.)
      if (!olPieceG) { olPieceG = s('g'); defs.append(olPieceG); }
      const els = [];
      for (const q of pieces) if (q.c) { const el = s('path', { d: q.c }); q.el = el; els.push(el); }
      olPieceG.replaceChildren(...els);
      try {
        L = piecesLength(pieces, ({ el }) => ({ len: el.getTotalLength(), at: (u) => { const p = el.getPointAtLength(u); return [p.x, p.y]; } }));
      } catch { olPieceG.replaceChildren(); return null; }
      at = (ls) => pointsAlong(pieces, ls);
    } else {
      if (!olPath) { olPath = s('path'); defs.append(olPath); }
      const el = olPath;
      el.setAttribute('d', src);
      try { L = el.getTotalLength(); } catch { return null; }
      at = (ls) => ls.map((u) => { const q = el.getPointAtLength(u); return [q.x, q.y]; });
    }
    const n = Math.max(48, Math.ceil(L / stride)), step = L / n, ls = [];
    for (let i = 0; i <= n; i++) ls.push(i * step);
    r = { step, pts: at(ls) };
    olPieceG?.replaceChildren();
    if (olLocalMemo.size >= 48) olLocalMemo.delete(olLocalMemo.keys().next().value);
    olLocalMemo.set(mk, r);
    return r;
  }
  function olRingsRaw(id, bare, d = null, stride = 2) {
    const m = bare ? null : gMatrix(organG[id]);
    const loc = olLocal(d || RING_OF[id] || organEls[id].getAttribute('d'), stride);
    if (!loc) return [];
    const { step } = loc, rings = [];
    let cur = [], prev = null;
    for (const [qx, qy] of loc.pts) {
      const p = m ? [m.a * qx + m.c * qy + m.e, m.b * qx + m.d * qy + m.f] : [qx, qy];
      if (prev && Math.hypot(p[0] - prev[0], p[1] - prev[1]) > step * 4 * (m ? Math.hypot(m.a, m.b) : 1)) { if (cur.length > 1) rings.push(cur); cur = []; }   // a new subpath
      cur.push(p); prev = p;
    }
    if (cur.length > 1) rings.push(cur);
    return rings;
  }
  const olKey = (id) => organEls[id].getAttribute('d') + '|' + (organG[id].getAttribute('transform') || '');
  // The small bowel's loops as they are drawn now: the centre line of each tube of its pile (the deep-tone stroke under the loops,
  // .ob-deep in organ-art.js), read from the live drawing, so a pile that is reshaped is followed without a copy of its path here.
  // A warm layer (see WARM) is a soft glow along both edges of each tube, on the organs and under the vessels: the loops' outlines
  // glow, the tubes' insides stay as drawn.
  // The tubes are plain polylines: their points are read from the path's own text once (cached by it), every other point, and each
  // build is only the group's transform over them (no path measuring: the ascites moves the bowel, and each move builds again).
  const GLOW_SPAN = 4;   // (points either side an outline's glow takes its direction from: the rings are read every 2 units)
  const WARM = { reach: 10, alpha: 0.46, taper: 20 };   // (how far the glow runs out from a tube's edge, in world units (under the tube's own half width, so a tube's middle stays clear), and its strength on the edge)
  const warmEls = new Map(), warmEdges = new Map(), warmPts = new Map();   // (the drawing's tubes, found again if the pile is redrawn: the key below is read every frame)
  const warmTubes = (id) => {
    let t = warmEls.get(id), e = warmEdges.get(id);
    // (the first and last of the drawing's pieces stand for them all: a redrawn pile replaces the lot; an empty list is looked for again)
    const gone = (l) => !l || !l.length || !l[0].isConnected || !l[l.length - 1].isConnected;
    if (gone(t) || gone(e)) {
      t = [...organG[id].querySelectorAll('.ob-deep')]; warmEls.set(id, t);
      warmEdges.set(id, [...organG[id].querySelectorAll('.ob-edge')]);
    }
    return t;
  };
  const warmDs = (id) => warmTubes(id).map((el) => el.getAttribute('d')).filter(Boolean);
  function warmLines(d) {
    let r = warmPts.get(d);
    if (!r) {
      // (Only M and L: a path with curves in it is measured along instead.)
      r = /^[ML\d.,\s-]+$/.test(d)
        ? d.split('M').filter(Boolean).map((c) => { const n = c.match(/-?\d*\.?\d+/g).map(Number), pts = []; for (let i = 0; i + 1 < n.length; i += 4) pts.push([n[i], n[i + 1]]); if (n.length >= 4 && (n.length / 2 - 1) % 2) pts.push([n[n.length - 2], n[n.length - 1]]); return pts; })
        : null;
      warmPts.set(d, r);
    }
    return r;
  }
  // (the tubes' lines in the drawing's own coordinates, in drawing order)
  const warmLocal = (id) => warmDs(id).flatMap((d) => { const lines = warmLines(d) || olRingsRaw(id, true, d, 6); return lines.filter((r) => r.length > 1); });
  function warmRings(id) {
    const m = gMatrix(organG[id]);
    return warmLocal(id).map((r) => (m ? r.map(([x, y]) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]) : r));
  }
  // Which of the loops' edges can be seen (warm-vis.js): not under a loop drawn over it, and inside the organ's own outline (the
  // glow is not clipped as the drawing is). Per tube and point, side -1 then 1; worked out once per drawing (its key below).
  const warmSeen = new Map();
  function warmVis(id) {
    const k = warmDs(id).map((d) => d.length + d.slice(-30)).join('|') + '|' + warmR(id) + '|' + (organEls[id].getAttribute('d') || '').length;
    let c = warmSeen.get(id);
    if (!c || c.k !== k) {
      const g = ringGrid(olRingsRaw(id, true));
      warmSeen.set(id, c = { k, vis: warmVisible(warmLocal(id), warmR(id), { inside: g ? (x, y) => inGrid(g, x, y) : null }) });
    }
    return c.vis;
  }
  // A tube's radius, from the drawing's own pieces (each .ob-edge is stroked 2r wide): the middle one, read again when the
  // deep-toned bed under the tubes (stroked wider as the tubes are) changes, so a refitted pile is followed.
  const warmRad = new Map();
  // (its signature: the bed's stroke widths and a few of the pieces' own, cheap enough to read every frame)
  const warmSw = (id) => { const e = (warmTubes(id), warmEdges.get(id)), at = (i) => e[i]?.getAttribute('stroke-width'); return warmTubes(id).map((el) => el.getAttribute('stroke-width')).join(',') + '|' + e.length + ',' + at(0) + ',' + at(e.length >> 1) + ',' + at(e.length - 1); };
  function warmR(id) {
    const sw = warmSw(id);
    let c = warmRad.get(id);
    if (!c || c.sw !== sw) {
      // (A drawing that leaves out its hidden pieces names the middle width of all of them: scripts/organ-art.mjs cullHidden.)
      const named = +organG[id].querySelector('[data-edge-w]')?.dataset.edgeW;
      const w = warmEdges.get(id).map((el) => +el.getAttribute('stroke-width')).filter((x) => x > 0).sort((a, b) => a - b);
      warmRad.set(id, c = { sw, r: named > 0 ? named / 2 : w.length ? w[w.length >> 1] / 2 : 12.5 });
    }
    return c.r;
  }
  // The colon's drawn outline (its limbs, closed), from the ring's own text once: the glow is left off where the colon lies over the pile.
  // (As a coarse grid in the colon's own coordinates, filled once by scanlines: a point is then one transform and one look-up,
  // where testing it against the ring made each build cost ten times more, and builds run every frame while the ascites eases.)
  const COLON_CELL = 3;
  let colonMask = null;
  function colonGrid() {
    if (colonMask) return colonMask;
    const rings = (RING_OF.colon || '').split('M').filter(Boolean).map((c) => { const n = c.match(/-?\d*\.?\d+/g).map(Number), r = []; for (let i = 0; i + 1 < n.length; i += 2) r.push([n[i], n[i + 1]]); return r; });
    const all = rings.flat(), x0 = Math.min(...all.map((q) => q[0])), y0 = Math.min(...all.map((q) => q[1])), w = Math.ceil((Math.max(...all.map((q) => q[0])) - x0) / COLON_CELL) + 1, h = Math.ceil((Math.max(...all.map((q) => q[1])) - y0) / COLON_CELL) + 1;
    const bits = new Uint8Array(w * h);
    for (const r of rings) for (let j = 0; j < h; j++) {
      const y = y0 + (j + 0.5) * COLON_CELL, xs = [];
      for (let i = 0, k = r.length - 1; i < r.length; k = i++) if ((r[i][1] > y) !== (r[k][1] > y)) xs.push(r[i][0] + (y - r[i][1]) * (r[k][0] - r[i][0]) / (r[k][1] - r[i][1]));
      xs.sort((u, v) => u - v);
      for (let m = 0; m + 1 < xs.length; m += 2) for (let i = Math.max(0, Math.ceil((xs[m] - x0) / COLON_CELL - 0.5)); i <= Math.min(w - 1, Math.floor((xs[m + 1] - x0) / COLON_CELL - 0.5)); i++) bits[j * w + i] = 1;
    }
    return (colonMask = { x0, y0, w, h, bits });
  }
  (typeof requestIdleCallback === 'function' ? (f) => requestIdleCallback(f, { timeout: 5000 }) : (f) => setTimeout(f, 3000))(() => { try { colonGrid(); if (organG.bowel && warmDs('bowel').length) warmVis('bowel'); } catch { /* each is made when a glow first needs it */ } });   // (made while idle, so a slide's start does not pay for them)
  const warmKey = (id) => olKey(id) + '|' + (organG.colon?.getAttribute('transform') || '') + '|' + warmSw(id) + '|' + warmDs(id).map((d) => d.length + d.slice(-30)).join('|');
  const olRingsOf = (o) => (o.kind === 'warm' ? warmRings(o.id) : olRings(o.id));
  function olSet(kind, id) {
    for (const o of olList) if (o.kind === kind && o.id !== id) o.on = false;
    if (id && organEls[id]?.getAttribute('d') && !olList.some((o) => o.kind === kind && o.id === id && (o.on = true))) {
      olList.push({ kind, id, key: olKey(id), rings: olRings(id), a: 0, on: true });
    }
    olDirty = true; olLast = performance.now();
  }
  // A presenter slide's organs, outlined and held (several at once): eased in and out like the hover outline.
  // Each in its station's colour ([{ id, tone }], --tr-<tone>).
  // The right atrium's slides light the whole heart (the atrium is one chamber of it), so both ids come to 'heart'.
  // (An item may also ask for the soft glow the heart gets, glow: true, and its own fade in ms, fade: a meal's gut glow swells and
  // eases off over a second or more, where an outline's own fade is 160 ms. glowOrgans adds such items to the slide's pins.)
  const PIN_ID = (id) => (id === 'heart-ra' ? 'heart' : id);
  let pinList = [];
  function pinOrgans(list, more) {
    if (!more) pinList = list || [];
    const items = [...pinList, ...(more || [])].map((o) => (typeof o === 'string' ? { id: o } : o)).map((o) => ({ id: PIN_ID(o.id), tone: o.tone || null, glow: !!o.glow, warm: !!o.warm, fade: o.fade || 0 }));
    const ids = items.map((o) => o.id);
    caud.show(ids.includes('caudate') || ids.includes('caudate-lobe'), ids.includes('caudate'));
    const want = new Map(items.filter((o) => organEls[o.id]).map((o) => [o.id, o]));
    const cs = getComputedStyle(svg), col = (tone) => (tone ? [...toRGB(`var(${tone.startsWith('--') ? tone : `--tr-${tone}`})`, cs)].slice(0, 3) : null);
    for (const o of olList) if (o.kind === 'pin' && !want.has(o.id)) o.on = false;   // (it keeps its own fade on the way out)
    for (const [id, it] of want) {
      const o = olList.find((x) => x.kind === 'pin' && x.id === id);
      if (o) { o.on = true; o.col = col(it.tone); o.glow = id === 'heart' || it.glow; o.fade = it.fade; } else if (organEls[id].getAttribute('d')) olList.push({ kind: 'pin', id, key: olKey(id), rings: olRings(id), a: 0, on: true, col: col(it.tone), glow: id === 'heart' || it.glow, fade: it.fade });
    }
    // (warm: the organ's loops glow along their edges, beside its outline's glow: the bowel's pile, eased with the same fade.)
    const warm = new Map(items.filter((o) => glLines && o.warm && organEls[o.id]?.getAttribute('d') && warmDs(o.id).length).map((o) => [o.id, o]));
    for (const o of olList) if (o.kind === 'warm' && !warm.has(o.id)) o.on = false;
    for (const [id, it] of warm) {
      const o = olList.find((x) => x.kind === 'warm' && x.id === id);
      if (o) { o.on = true; o.col = col(it.tone); o.fade = it.fade; } else olList.push({ kind: 'warm', id, key: warmKey(id), rings: warmRings(id), a: 0, on: true, col: col(it.tone), fade: it.fade });
    }
    olDirty = true; olLast = performance.now();
  }
  // A slide's spotlit organs (V2), outlined beside its pins; an organ the slide already pins keeps that one line.
  function spotOrgans(list) {
    const cs = getComputedStyle(svg), col = (tone) => (tone ? [...toRGB(`var(${tone.startsWith('--') ? tone : `--tr-${tone}`})`, cs)].slice(0, 3) : null);
    const want = new Map((list || []).filter((o) => organEls[o.id]?.getAttribute('d') && !olList.some((x) => x.kind === 'pin' && x.on && x.id === o.id)).map((o) => [o.id, o.tone]));
    for (const o of olList) if (o.kind === 'spot' && !want.has(o.id)) o.on = false;
    for (const [id, tone] of want) {
      const o = olList.find((x) => x.kind === 'spot' && x.id === id);
      if (o) { o.on = true; o.col = col(tone); } else olList.push({ kind: 'spot', id, key: olKey(id), rings: olRings(id), a: 0, on: true, col: col(tone) });
    }
    olDirty = true; olLast = performance.now(); stageWake();
  }
  // The normal spleen's outline (V18): wanted by a slide, shown while the spleen is enlarged (normalSync, each frame the spleen
  // is drawn), in the spleen's own deep tone. It keeps the organ's normal size and place as the spleen grows round it.
  // Dashed (on, off in world units), so it reads as where the spleen would be and not as a second organ.
  const normal = { want: false, shown: false, sc: 1 };
  const NORMAL_DASH = [7, 5];
  function normalSync(sc = normal.sc) {
    normal.sc = sc;
    const p = store.get().params;
    const on = normal.want && !!organEls.spleen && p?.splenicRx !== 2 && easeInOut(morph) < 0.5 && normalShown(sc, normal.shown);
    if (on === normal.shown) return;
    normal.shown = on;
    const o = olList.find((x) => x.kind === 'normal');
    if (o) o.on = on;
    else if (on) olList.push({ kind: 'normal', id: 'spleen', key: '', rings: dashRings(olRings('spleen', true), NORMAL_DASH[0], NORMAL_DASH[1]), a: 0, on: true, col: orgTone('spleen') });
    olDirty = true; olLast = performance.now(); stageWake();
  }
  // Deck visuals, package F (ext-callouts.js): a slide's figure callouts, or null. live: an edge mark's words by
  // `${edge}|${kind}`; organs: marks on organs; calipers; steps (the glow's first entry's vessels: its order is numbered, V10);
  // spans and zone, on the circuit (V25). Each piece of words is { runs: [{ t, sp, tone? }], wide, label }: wide, the same words at
  // their widest, is the room its pill keeps, so a number ticking never moves or resizes it (fxPill).
  let fx = null, fxSig = '';
  const fxWide = new Map(), fxBuild = new Map(), fxEls = new Map();
  function setCallouts(sp) {
    const sig = sp ? JSON.stringify([Object.keys(sp.live || {}), (sp.organs || []).map((o) => o.organ + o.kind), (sp.calipers || []).map((c) => c.id), sp.steps, (sp.spans || []).map((x) => x.from + x.to), sp.zone]) : '';
    if (!sp || sig !== fxSig) { fxWide.clear(); for (const [k, b] of pool) if (k.startsWith('fxs:')) b.fxIn = false; }
    fx = sp ? { live: {}, organs: [], calipers: [], steps: null, spans: [], zone: -1, ...sp } : null; fxSig = sig;
    const band = fx && zoneBand(fx.zone);
    if (band) { fxZone.setAttribute('x', band[0]); fxZone.setAttribute('width', band[1] - band[0]); }
    fxZone.classList.toggle('on', !!band);
    stageWake();
  }
  // A callout's pill (a mark, a caliper's or a bracket's reading): its words as runs, a value in its rating colour where the pill
  // is plain (tone; on a red or accent pill the words keep the pill's own ink), as wide as its widest words (and never narrower
  // than it has been on this slide). fxw: its words with each value as #, so a number ticking redraws no pill (renderBlock).
  const fxRuns = (runs, tone) => runs.map((r, i) => ({ t: r.t, size: 11.5, weight: r.tone !== undefined ? 750 : 650, cls: r.tone !== undefined ? 'lb-focus fx-v' : 'lb-focus', ...(i ? { gap: r.sp ? 3 : 0 } : {}), ...(tone && r.tone ? { fill: `color-mix(in srgb, var(${r.tone}) 78%, var(--text))` } : {}) }));
  // (split: the words on one line and the reading from its first value on under them, where one line is too wide for its room.)
  function fxPill(key, w, cls, tone, split = false) {
    const cut = split ? w.runs.findIndex((r) => r.tone !== undefined) : -1, two = cut > 0;
    const part = (runs) => (two ? [runs.slice(0, cut), runs.slice(cut)] : [runs]);
    const lines = part(w.runs).map((r) => fxRuns(r, tone)), wide = part(w.wide || w.runs).map((r) => fxRuns(r, tone));
    const wd = Math.max(...lines.map(lineW), ...wide.map(lineW), fxWide.get(key + (two ? ':2' : '')) || 0);
    fxWide.set(key + (two ? ':2' : ''), wd);
    return { key, cls, lines, align: 'middle', bg: true, padX: 8, padY: 4, w: wd, h: lines.reduce((a, l) => a + LINE_H(l), 0), label: w.label, fxw: w.runs.map((r) => (r.tone !== undefined ? '#' : r.t)).join(' ') + (two ? '|2' : '') };
  }
  // The calipers' and brackets' lines, each frame (the spleen grows through a time-lapse, a vessel's width eases): a line that
  // comes eases in, one that goes eases out (app.css, Package F).
  function fxLine(key, parent, d, cls) {
    let el = fxEls.get(key);
    if (!el) {
      el = s('g', { class: cls });
      el.append(s('path', { class: 'fx-halo' }), s('path', { class: 'fx-ink' }));
      parent.append(el); fxEls.set(key, el);
      if (!reduceMotion.matches) requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('on'))); else el.classList.add('on');
    }
    el.seen = true;
    if (el._d !== d) { el._d = d; for (const p of el.children) p.setAttribute('d', d); }
  }
  // (Screen pixels per world unit now: lines that keep a size on screen are drawn in world units from it.)
  const fxK = () => { if (!CTM) refreshCTM(); return CTM?.sc || 1; };
  function caliperAt(c, f) {
    if (c.organ) {
      const p = f.viewParams || store.get().params;
      if (p?.splenicRx === 2 || !organEls.spleen) return null;
      const [a, b] = spleenCaliper((f.slow?.spleen ?? 11) / 11);
      return { a, b };
    }
    const x = E[c.edge], cur = geo[c.edge]?.cur;
    if (!x?.vis || x.g.classList.contains('coll-ghost') || !(cur?.length > 1)) return null;
    // (Wall to wall and a little past, and never shorter than 30 px on screen, so a narrow stent on a phone still reads as a caliper.)
    // (A varix at its middle, where the tile measures it; any other vessel a third along, off its station's dot at the middle.)
    const [wx, wy, tx, ty] = c.key === 'varix' ? arcMid(cur) : pointAt(cur, 0.32), [a, b] = acrossVessel(wx, wy, tx, ty, Math.max((x.width || 4) / 2 + 3, 15 / fxK()));
    return { a, b };
  }
  // A caliper's line and its end ticks (5 px either side, square to it), in world units.
  function caliperSegs(c, f) {
    const g = caliperAt(c, f);
    if (!g) return null;
    const [[ax, ay], [bx, by]] = [g.a, g.b], L = Math.hypot(bx - ax, by - ay) || 1, tk = 5 / fxK(), nx = (-(by - ay) / L) * tk, ny = ((bx - ax) / L) * tk;
    return { a: g.a, b: g.b, segs: [[g.a, g.b], [[ax - nx, ay - ny], [ax + nx, ay + ny]], [[bx - nx, by - ny], [bx + nx, by + ny]]] };
  }
  function fxSync(f, t) {
    for (const el of fxEls.values()) el.seen = false;
    if (fx && t < 0.5) for (const c of fx.calipers) {
      const g = caliperSegs(c, f);
      if (!g) continue;
      const P = ([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`;
      fxLine('c:' + c.id, gFx, g.segs.map(([p, q]) => `M${P(p)}L${P(q)}`).join(''), 'fx-cal-line');
    }
    if (fx) for (const sp of fx.spans) { const at = spanOf(sp.from, sp.to, fxK()); if (at) fxLine(`s:${sp.from}:${sp.to}`, gFxC, spanPath(at), 'fx-span-line'); }
    for (const [k, el] of fxEls) {
      if (el.seen || el.going) continue;
      el.going = true; el.classList.remove('on');
      setTimeout(() => { el.remove(); if (fxEls.get(k) === el) fxEls.delete(k); }, reduceMotion.matches ? 0 : 420);
    }
    for (const [k, el] of fxEls) if (el.seen && el.going) { fxEls.delete(k); }   // (a line gone and wanted again starts afresh)
    gFx.style.opacity = t > 0 ? String(1 - t) : '';
  }
  // The organ was redrawn (a reshaped liver, a larger spleen): the outlines follow it.
  function olGeom() {
    for (const o of olList) { if (o.kind === 'normal') continue; const k = o.kind === 'warm' ? warmKey(o.id) : olKey(o.id); if (k !== o.key) { o.key = k; o.rings = olRingsOf(o); o.verts = null; olDirty = true; } }
  }
  // Eases each outline toward shown or gone and hands them to the GPU; true while anything is changing.
  function olStep(now) {
    const cdu = Math.min(1, (now - clampLast) / CLAMP_FADE);
    clampLast = now;
    let clampMoved = false;
    for (const [id, c] of clampA) {
      const t = c.on ? 1 : 0;
      if (c.a !== t) { c.a = t > c.a ? Math.min(1, c.a + cdu) : Math.max(0, c.a - cdu); clampMoved = true; clampShade(id); }
      if (!c.on && c.a === 0) { for (const el of ov.clampsOut.querySelectorAll(`[data-id="${id}"]`)) el.remove(); clampA.delete(id); mk.ver++; }
    }
    marksSync();
    if (!glLines || (!olDirty && !olList.length && !mk.dirty && !clampMoved)) return false;
    const dt = now - olLast;
    olLast = now;
    let moving = false;
    for (const o of olList) {
      const t = o.on ? 1 : 0, du = Math.min(1, dt / (o.fade || OL_FADE));
      if (o.a !== t) { o.a = t > o.a ? Math.min(1, o.a + du) : Math.max(0, o.a - du); moving = true; }
    }
    // (An outline that has faded out leaves the list: the rest are laid out again, or each would draw from its old place.)
    const kept = olList.filter((o) => o.on || o.a > 0);
    if (kept.length !== olList.length) olDirty = true;
    olList = kept;
    let V = olDirty ? [] : null;
    const draws = [];
    let first = 0;
    for (const o of olList) {
      const ease = o.a * o.a * (3 - 2 * o.a);
      const col = o.col || (o.kind === 'pin' ? olCol : orgTone(o.id));
      // A warm layer: a soft glow along each side of every tube, strongest on its edge and easing out from it (strips are laid with MAX,
      // so where two meet they never stack). Only a loop's edge that shows is lit: not where a loop drawn over it lies on it, nor
      // outside the organ's outline (warmVis). Left off where the colon lies over the pile; on the inside of a tight bend the glow is
      // held short of the bend's centre (its reach follows the room there) and dropped where there is none, so it never folds back.
      if (o.kind === 'warm') {
        if (V) {
          const mt = gMatrix(organG[o.id]), rad = warmR(o.id) * (mt ? Math.hypot(mt.a, mt.b) : 1), reachMax = Math.min(63, WARM.reach, 0.8 * rad);   // (under the tube's half width, whatever the drawing)
          const cm = o.id === 'colon' ? null : gMatrix(organG.colon), inv = cm?.inverse(), grid = o.id === 'colon' ? null : colonGrid();
          const underColon = (x, y) => {
            if (!grid) return false;
            const lx = inv ? inv.a * x + inv.c * y + inv.e : x, ly = inv ? inv.b * x + inv.d * y + inv.f : y, i = Math.floor((lx - grid.x0) / COLON_CELL), j = Math.floor((ly - grid.y0) / COLON_CELL);
            return i >= 0 && j >= 0 && i < grid.w && j < grid.h && grid.bits[j * grid.w + i] === 1;
          };
          o.runs = [];
          const seen = warmVis(o.id);
          for (const [ri, r] of o.rings.entries()) {
            const vis = seen[ri];
            const n = r.length, R = new Float32Array(n), cs = new Int8Array(n), tg = [];
            for (let i = 0; i < n; i++) {
              const pa = r[Math.max(0, i - 1)], pb = r[Math.min(n - 1, i + 1)];
              let tx = pb[0] - pa[0], ty = pb[1] - pa[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l; tg.push([tx, ty]);
              const i0 = Math.max(0, i - 2), i1 = Math.min(n - 1, i + 2), ax = r[i][0] - r[i0][0], ay = r[i][1] - r[i0][1], bx = r[i1][0] - r[i][0], by = r[i1][1] - r[i][1];
              const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by), th = Math.atan2(ax * by - ay * bx, ax * bx + ay * by);
              R[i] = la < 0.5 || lb < 0.5 || Math.abs(th) < 1e-3 ? 1e9 : (la + lb) / 2 / Math.abs(th);
              cs[i] = th > 0 ? 1 : -1;   // (the side the bend turns toward)
            }
            for (const side of [-1, 1]) {
              // A run is held until it ends, then laid down fading out to nothing over its first and last WARM.taper units of length (a
              // blunt start or stop would read as a cut). It goes by length, not by points, so a run's profile stays steady as the
              // colon's cut or a bend moves it by a point. The fade rides in the width (64 x its 63 steps + the width; see LINE_VS).
              let run = [];
              const end = () => {
                const len = run.length;
                if (len > 1) {
                  const dist = [0];
                  for (let k = 1; k < len; k++) dist.push(dist[k - 1] + Math.hypot(run[k][0] - run[k - 1][0], run[k][1] - run[k - 1][1]));
                  const L = dist[len - 1];
                  run.forEach(([ex, ey, tx, ty, reach], k) => {
                    const f = Math.min(1, Math.min(dist[k], L - dist[k]) / WARM.taper), e = f * f * (3 - 2 * f), w = reach * (0.5 + 0.5 * e) + 64 * Math.round(e * 63);
                    V.push(ex, ey, -ty, tx, 0, w, ex, ey, -ty, tx, side, w);
                  });
                  o.runs.push(len * 2);
                }
                run = [];
              };
              // The glow at a point along the line, between points i0 and i1 (t from 0 to 1): its place, its direction and its reach,
              // and whether it is shown (the colon is not over it and the reach is room enough).
              const at = (i0, i1, t) => {
                const a = r[i0], b = r[i1];
                let tx = tg[i0][0] * (1 - t) + tg[i1][0] * t, ty = tg[i0][1] * (1 - t) + tg[i1][1] * t; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
                const Rv = 1 / Math.max((1 - t) / R[i0] + t / R[i1], 1e-9);
                const ex = a[0] + (b[0] - a[0]) * t - ty * rad * side, ey = a[1] + (b[1] - a[1]) * t + tx * rad * side;
                const reach = (t < 0.5 ? cs[i0] : cs[i1]) === side ? Math.min(reachMax, (Rv - rad) * 0.85) : reachMax;
                return { v: [ex, ey, tx, ty, reach], ok: !(reach < 2.5 || (vis && !vis[2 * (t < 0.5 ? i0 : i1) + (side > 0 ? 1 : 0)]) || underColon(ex, ey)) };
              };
              // Where a run starts or stops falls exactly on its cut (found between the last point on one side and the first on the
              // other), so its length, and with it the fade, moves smoothly as the cut does, not a whole point at a time.
              const cut = (i, wasOk) => {
                let lo = 0, hi = 1;
                for (let k = 0; k < 6; k++) { const m = (lo + hi) / 2; if (at(i - 1, i, m).ok === wasOk) lo = m; else hi = m; }
                return at(i - 1, i, wasOk ? lo : hi).v;
              };
              let prevOk = false;
              for (let i = 0; i < n; i++) {
                const c = at(i, i, 0);
                if (c.ok) { if (i > 0 && !prevOk) run.push(cut(i, false)); run.push(c.v); } else { if (prevOk) run.push(cut(i, true)); end(); }
                prevOk = c.ok;
              }
              end();
            }
          }
        }
        for (const c of o.runs || []) { draws.push({ first, count: c, col, alpha: WARM.alpha * ease, soft: true, warm: true, endFade: RECTUM_FADE }); first += c; }
        continue;
      }
      // The passes: a glow alone (the heart a slide points at), a glow under the line (a selected organ), or the line.
      const passes = o.glow ? [[true, HEART_GLOW.reach, HEART_GLOW.alpha]] : [...(o.kind === 'sel' ? [[true, SEL_GLOW.reach, SEL_GLOW.alpha]] : []), [false, ...OL_LOOK[o.kind]]];
      for (const [glow, w, alpha] of passes) {
        const h = w / 2, a = alpha * ease;
        for (const r of o.rings) {
          const closed = Math.hypot(r[0][0] - r[r.length - 1][0], r[0][1] - r[r.length - 1][1]) < 0.5;
          const pts = closed ? r.slice(0, -1) : r, n = pts.length, count = (n + (closed ? 1 : 0)) * 2;
          // A glow starts on the edge and runs outward only (inside it would fold over itself on a tight curve): the side
          // that points away from the shape, by the ring's winding.
          let out = 1;
          if (glow) { let ar = 0; for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; ar += p[0] * q[1] - q[0] * p[1]; } out = ar > 0 ? -1 : 1; }
          if (V) for (let i = 0; i <= n - (closed ? 0 : 1); i++) {
            // (A glow's direction is taken across a few points either side (GLOW_SPAN, about 8 units): along a hand-drawn line with
            // small wobbles, the next points alone turn it back and forth, and its strips fan out into ticks.)
            const k = i % n, p = pts[k], sp = glow ? Math.min(GLOW_SPAN, (n - 1) >> 1) : 1;
            const pa = pts[closed ? (k - sp + n) % n : Math.max(0, k - sp)], pb = pts[closed ? (k + sp) % n : Math.min(n - 1, k + sp)];
            let tx = pb[0] - pa[0], ty = pb[1] - pa[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
            if (glow) V.push(p[0], p[1], -ty, tx, 0, w, p[0], p[1], -ty, tx, out, w);
            else V.push(p[0], p[1], -ty, tx, 1, h, p[0], p[1], -ty, tx, -1, h);
          }
          draws.push({ first, count, col, alpha: a, soft: glow || undefined, endFade: RECTUM_FADE });
          first += count;
        }
      }
    }
    if (V) olVerts = new Float32Array(V);
    // The vessel marks first (they sit under an organ's outline, as in the SVG), then the outlines.
    if (V || mk.dirty || !mk.all) {
      const n = mk.verts.length, all = new Float32Array(n + (olVerts?.length || 0));
      all.set(mk.verts); if (olVerts) all.set(olVerts, n);
      mk.all = all; mk.dirty = false;
    }
    const off = mk.verts.length / 6;
    const list = [...mk.draws.map((d) => (d.fade ? { ...d, alpha: d.alpha * clampEase(d.fade) } : d)), ...draws.map((d) => ({ ...d, first: d.first + off }))];
    veins.setLines(list.length ? { verts: mk.all, draws: list } : null);
    olDirty = false;
    return moving || !!V;
  }

  // The marks on the vessels (bands, clamps, clots, stents and sutures, plugs, balloons, the spleen's marks) are drawn
  // on the GPU with the outlines, for the same reason: an SVG overlay is composited apart from the vessel canvas, and
  // a browser may show it a frame ahead of the vessels (Safari), so during a pan or pinch the marks slid along their
  // vessels. Each shape (not text) is read as the SVG draws it now, styles included, into world-space strokes and
  // fills; the SVG copy stays, hidden (data-gl), and shows again wherever the GPU cannot draw.
  const mk = { key: '', ver: 0, verts: new Float32Array(0), draws: [], all: null, dirty: false };
  const darkMQ = matchMedia('(prefers-color-scheme: dark)');
  const marksKey = () => `${mk.ver}|${gestureFree(wrap.className)}|${document.documentElement.dataset.theme}|${darkMQ.matches}`;
  // Subpaths of an absolute M/L/H/V/C/Q/Z path as point lists (curves sampled); null for anything else.
  function pathRings(d) {
    const tok = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) || [];
    const rings = [];
    let cur = null, cmd = '', i = 0, x = 0, y = 0;
    const num = () => Number(tok[i++]);
    while (i < tok.length) {
      if (/[a-zA-Z]/.test(tok[i])) cmd = tok[i++];
      if (cmd === 'M') { x = num(); y = num(); cur = { pts: [[x, y]], closed: false }; rings.push(cur); cmd = 'L'; }
      else if (!cur) return null;
      else if (cmd === 'L') { x = num(); y = num(); cur.pts.push([x, y]); }
      else if (cmd === 'H') { x = num(); cur.pts.push([x, y]); }
      else if (cmd === 'V') { y = num(); cur.pts.push([x, y]); }
      else if (cmd === 'C' || cmd === 'Q') {
        const c = cmd === 'C' ? [num(), num(), num(), num(), num(), num()] : [num(), num(), num(), num()];
        const ex = c[c.length - 2], ey = c[c.length - 1], x0 = x, y0 = y;
        const n = Math.max(2, Math.min(24, Math.ceil(Math.hypot(ex - x0, ey - y0) / 2)));
        for (let k = 1; k <= n; k++) {
          const t = k / n, u = 1 - t;
          cur.pts.push(cmd === 'C'
            ? [u * u * u * x0 + 3 * u * u * t * c[0] + 3 * u * t * t * c[2] + t * t * t * ex, u * u * u * y0 + 3 * u * u * t * c[1] + 3 * u * t * t * c[3] + t * t * t * ey]
            : [u * u * x0 + 2 * u * t * c[0] + t * t * ex, u * u * y0 + 2 * u * t * c[1] + t * t * ey]);
        }
        x = ex; y = ey;
      } else if (cmd === 'Z' || cmd === 'z') { cur.closed = true; x = cur.pts[0][0]; y = cur.pts[0][1]; }
      else return null;
      if (Number.isNaN(x) || Number.isNaN(y)) return null;
    }
    return rings;
  }
  function ellipseRing(cx, cy, rx, ry) {
    const n = Math.max(24, Math.min(96, Math.ceil(Math.PI * (rx + ry) / 1.5))), pts = [];
    for (let k = 0; k < n; k++) { const a = (k / n) * 2 * Math.PI; pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); }
    return { pts, closed: true };
  }
  function shapeRings(el) {
    const n = (a) => Number(el.getAttribute(a)) || 0;
    switch (el.tagName) {
      case 'path': return pathRings(el.getAttribute('d') || '');
      case 'circle': return [ellipseRing(n('cx'), n('cy'), n('r'), n('r'))];
      case 'ellipse': return [ellipseRing(n('cx'), n('cy'), n('rx'), n('ry'))];
      case 'rect': {
        const x = n('x'), y = n('y'), w = n('width'), h = n('height'), r = Math.min(n('rx') || n('ry'), w / 2, h / 2);
        if (!r) return [{ pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], closed: true }];
        const pts = [];
        for (const [cx, cy, a0] of [[x + w - r, y + r, -90], [x + w - r, y + h - r, 0], [x + r, y + h - r, 90], [x + r, y + r, 180]]) {
          for (let k = 0; k <= 8; k++) { const a = ((a0 + (k / 8) * 90) * Math.PI) / 180; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
        }
        return [{ pts, closed: true }];
      }
      default: return null;
    }
  }
  function paintOf(v, a) {
    if (!v || v === 'none' || v.startsWith('url')) return null;
    const m = /^rgba?\(([^)]+)\)$/.exec(v);
    if (!m) return [...toRGB(v, getComputedStyle(svg)), a];
    const k = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return [k[0] / 255, k[1] / 255, k[2] / 255, a * (k.length > 3 ? k[3] : 1)];
  }
  // Ear clipping: the triangles of a simple polygon (counter-clockwise or not).
  function earcut(P) {
    const n = P.length, idx = [...Array(n).keys()], out = [];
    let area = 0;
    for (let i = 0; i < n; i++) { const a = P[i], b = P[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
    const sgn = area > 0 ? 1 : -1;
    const cross = (a, b, c) => ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) * sgn;
    const inside = (p, a, b, c) => cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;
    let guard = n * n;
    while (idx.length > 3 && guard-- > 0) {
      let cut = false;
      for (let i = 0; i < idx.length; i++) {
        const ia = idx[(i + idx.length - 1) % idx.length], ib = idx[i], ic = idx[(i + 1) % idx.length];
        const a = P[ia], b = P[ib], c = P[ic];
        if (cross(a, b, c) <= 0) continue;
        if (idx.some((j) => j !== ia && j !== ib && j !== ic && inside(P[j], a, b, c))) continue;
        out.push(a, b, c); idx.splice(i, 1); cut = true; break;
      }
      if (!cut) break;
    }
    if (idx.length === 3) out.push(P[idx[0]], P[idx[1]], P[idx[2]]);
    return { tris: out, sgn };
  }
  // Reads the marks for the GPU when they are not read yet (new shapes, a new look). Run in the frame loop, and by the update that rebuilds the
  // overlays (below), in the same task: a rebuilt mark is an SVG shape without data-gl, shown until it is read, and the frame loop does not
  // come round in every frame (a paced or yielding frame, a step in between), so a pan or pinch painted the new marks as SVG a frame apart
  // from the vessels (the stent and the band rings, on a slow screen up to a quarter of a second after the model changed them).
  function marksSync() {
    if (glLines && marksKey() !== mk.key) gpuProbe.time(null, 'vessel marks (script)', marksBuild);
  }
  function marksBuild() {
    mk.key = marksKey();
    const V = [], draws = [];
    let first = 0;
    let fade;   // (a narrowing's clamp: its id, whose fade olStep lays on the draw's alpha)
    const push = (col, count, tri) => { if (count) { draws.push({ first, count, col: col.slice(0, 3), alpha: col[3], tri, fade }); first += count; } };
    // A stroke as a strip of mitred joins (as SVG, limit 4); open ends with square or round caps.
    const stroke = (pts, closed, h, cap) => {
      const n = pts.length;
      if (n < 2) return 0;
      const P = closed ? pts : pts.slice();
      if (!closed && cap === 'square') {
        const ext = (p, q) => { const l = Math.hypot(p[0] - q[0], p[1] - q[1]) || 1; return [p[0] + (p[0] - q[0]) / l * h, p[1] + (p[1] - q[1]) / l * h]; };
        P[0] = ext(P[0], P[1]); P[n - 1] = ext(P[n - 1], P[n - 2]);
      }
      const nrm = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [-dy / l, dx / l]; };
      let c = 0;
      for (let i = 0; i <= (closed ? n : n - 1); i++) {
        const k = i % n, p = P[k];
        const prev = closed ? P[(k - 1 + n) % n] : P[Math.max(0, k - 1)], next = closed ? P[(k + 1) % n] : P[Math.min(n - 1, k + 1)];
        const n1 = k > 0 || closed ? nrm(prev, p) : nrm(p, next), n2 = k < n - 1 || closed ? nrm(p, next) : n1;
        let mx = n1[0] + n2[0], my = n1[1] + n2[1];
        const ml = Math.hypot(mx, my);
        if (ml < 1e-6) { mx = n1[0]; my = n1[1]; } else { mx /= ml; my /= ml; }
        const sc = 1 / Math.max(0.25, mx * n1[0] + my * n1[1]);
        V.push(p[0], p[1], mx * sc, my * sc, 1, h, p[0], p[1], mx * sc, my * sc, -1, h);
        c += 2;
      }
      return c;
    };
    const disc = (p, r) => { const ring = ellipseRing(p[0], p[1], r, r).pts; let c = 0; for (let k = 0; k < ring.length; k++) { const a = ring[k], b = ring[(k + 1) % ring.length]; V.push(p[0], p[1], 1, 0, 0, 1e4, a[0], a[1], 1, 0, 0, 1e4, b[0], b[1], 1, 0, 0, 1e4); c += 3; } return c; };
    for (const g of Object.values(ov)) {
      for (const el of g.querySelectorAll('path, circle, ellipse, rect')) {
        el.removeAttribute('data-gl');
        let cs = getComputedStyle(el), op = 1, M = null, ok = cs.display !== 'none' && cs.strokeDasharray === 'none';
        for (let e = el; ok && e && e !== gOver; e = e.parentNode) {
          const c = e === el ? cs : getComputedStyle(e);
          if (c.display === 'none' || (e !== el && (e.getAttribute('clip-path') || e.getAttribute('mask')))) ok = false;
          op *= Number(c.opacity);
          const t = c.transform;
          if (t && t !== 'none') { const q = t.match(/-?[\d.]+(?:e-?\d+)?/g).map(Number); M = M ? [M[0] * q[0] + M[2] * q[1], M[1] * q[0] + M[3] * q[1], M[0] * q[2] + M[2] * q[3], M[1] * q[2] + M[3] * q[3], M[0] * q[4] + M[2] * q[5] + M[4], M[1] * q[4] + M[3] * q[5] + M[5]] : q; }
        }
        const rings = ok ? shapeRings(el) : null;
        if (!rings) continue;
        fade = el.classList.contains('clamp') || el.classList.contains('clamp-out') ? el.dataset.id : undefined;
        if (M) for (const r of rings) r.pts = r.pts.map(([x, y]) => [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]]);
        for (const r of rings) r.pts = r.pts.filter((p, i, a) => !i || Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1]) > 1e-3);
        const fill = paintOf(cs.fill, op * Number(cs.fillOpacity)), sk = paintOf(cs.stroke, op * Number(cs.strokeOpacity));
        const sw = parseFloat(cs.strokeWidth) || 0;
        if (fill && fill[3] > 0) for (const r of rings) {
          if (r.pts.length < 3) continue;
          const { tris, sgn } = earcut(r.pts);
          for (const p of tris) V.push(p[0], p[1], 1, 0, 0, 1e4);
          push(fill, tris.length, true);
          // Without a stroke over it, the fill's edge is antialiased by a one-pixel fringe outside it.
          if (!(sk && sw >= 0.6)) {
            const n = r.pts.length;
            let c = 0;
            for (let i = 0; i <= n; i++) {
              const p = r.pts[i % n], a = r.pts[(i - 1 + n) % n], b = r.pts[(i + 1) % n];
              const ux = b[0] - a[0], uy = b[1] - a[1], l = Math.hypot(ux, uy) || 1, ox = (uy / l) * sgn, oy = (-ux / l) * sgn;
              V.push(p[0], p[1], ox, oy, 0, -1, p[0], p[1], ox, oy, 1, -1); c += 2;
            }
            push(fill, c, false);
          }
        }
        if (sk && sk[3] > 0 && sw > 0) {
          const h = sw / 2, cap = cs.strokeLinecap;
          for (const r of rings) {
            push(sk, stroke(r.pts, r.closed, h, cap), false);
            if (cap === 'round' && !r.closed && r.pts.length > 1) { push(sk, disc(r.pts[0], h), true); push(sk, disc(r.pts[r.pts.length - 1], h), true); }
          }
        }
        el.setAttribute('data-gl', '');
      }
    }
    mk.verts = new Float32Array(V); mk.draws = draws; mk.dirty = true;
  }

  // A selected organ keeps a quiet outline; a selected site (varices, fundus, abdomen) a ring.
  const gSelO = s('g', { id: 'organSel' });
  gOver.after(gSelO);
  let selOKey = '', selLine = null, selFluid = null;
  function syncSelFluid() {
    if (!selFluid) return;
    selFluid.fill.setAttribute('d', ascitesPath.getAttribute('d') || '');
    selFluid.line.setAttribute('d', ascitesLine.getAttribute('d') || '');
    selFluid.g.style.opacity = ascitesPath.getAttribute('d') ? fluidFade().toFixed(3) : '';   // (fades with the pool it outlines)
  }
  function syncSelLine() {
    if (glLines) olGeom();
    if (!selLine) return;
    const d = organEls[selLine.id].getAttribute('d'), tr = organG[selLine.id].getAttribute('transform');
    if (selLine.el.getAttribute('d') !== d) selLine.el.setAttribute('d', d);
    if (tr) selLine.el.setAttribute('transform', tr); else selLine.el.removeAttribute('transform');
  }
  function updateOrganSel(sel, t) {
    const o = sel?.type === 'organ' && t < 0.5 ? sel.id : null;
    const key = o ? o + (sel.lobe || '') : '';
    if (key === selOKey) return;
    selOKey = key;
    for (const g of Object.values(organG)) g.classList.remove('org-sel');
    gSelO.replaceChildren(); selLine = null; selFluid = null;
    const byOrgan = o && { liver: ['liver'], heart: ['heart'], spleen: ['spleen'] }[o];
    if (glLines) olSet('sel', byOrgan?.[0] || null);
    if (!o) return;
    if (byOrgan) {
      for (const id of byOrgan) organG[id]?.classList.add('org-sel');
      if (glLines) return;
      // The outline follows the organ as drawn now (a cirrhotic liver's reshaped contour, an
      // enlarged spleen), not its healthy outline.
      if (organEls[byOrgan[0]]?.getAttribute('d')) { selLine = { id: byOrgan[0], el: s('path', { class: 'org-sel-line', style: `stroke: rgb(${orgTone(byOrgan[0]).map((x) => Math.round(x * 255))})` }) }; syncSelLine(); gSelO.append(selLine.el); }
      return;
    }
    if (o === 'abdomen') {   // the fluid as drawn; it follows the volume (see syncSelFluid)
      const cg = s('g', { 'clip-path': 'url(#abdomenClip)' });
      selFluid = { g: cg, fill: s('path', { class: 'org-sel-fluid' }), line: s('path', { class: 'org-sel-line' }) };
      cg.append(selFluid.fill, selFluid.line); gSelO.append(cg); syncSelFluid();
      return;
    }
    
  }

  // Circuit bridges: where two lines cross without meeting, the one drawn later hops over the
  // other, as on a transit map, so a crossing never reads as a junction.
  const gBridges = s('g', { id: 'bridges', 'aria-hidden': 'true' });
  gEdges.after(gBridges);
  let bridgeKey = '';
  function segX(a, b, c, d) {
    const r = [b[0] - a[0], b[1] - a[1]], q = [d[0] - c[0], d[1] - c[1]];
    const den = r[0] * q[1] - r[1] * q[0];
    if (Math.abs(den) < 1e-9) return null;
    const u = ((c[0] - a[0]) * q[1] - (c[1] - a[1]) * q[0]) / den, v = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
    // Half-open, so a crossing that falls exactly on a sample vertex is counted once, not missed.
    return u >= 0 && u < 1 && v >= 0 && v < 1 ? [a[0] + r[0] * u, a[1] + r[1] * u, r[0], r[1]] : null;
  }
  function updateBridges(t) {
    // The GPU draws crossings itself (each tier passes over the one below with its own border).
    if (wrap.classList.contains('gl-on')) { if (bridgeKey) { bridgeKey = ''; gBridges.replaceChildren(); } return; }
    const vis = t === 1 ? EV.filter((x) => x.vis && !x.isArt && !x.g.classList.contains('coll-ghost') && x.g.style.display !== 'none') : [];
    const key = vis.map((x) => x.e.id + ':' + x.width.toFixed(0)).join(',');
    if (key === bridgeKey) return;
    bridgeKey = key;
    gBridges.replaceChildren();
    if (!vis.length) return;
    const order = new Map([...gNet.querySelectorAll('.vg[data-id]'), ...gTopL.querySelectorAll('.vg[data-id]')].map((g, i) => [g, i]));
    const box = (pts) => pts.reduce((b, p) => [Math.min(b[0], p[0]), Math.min(b[1], p[1]), Math.max(b[2], p[0]), Math.max(b[3], p[1])], [Infinity, Infinity, -Infinity, -Infinity]);
    const boxes = vis.map((x) => box(geo[x.e.id].cur));
    const out = [];
    for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) {
      const A = vis[i], B = vis[j], a = boxes[i], b = boxes[j];
      if (a[0] > b[2] || b[0] > a[2] || a[1] > b[3] || b[1] > a[3]) continue;
      // Lines that share a station meet there: where they leave it along a common stretch and
      // then fork, their sampled courses graze each other, which is a fork, not a crossing.
      if (A.e.from === B.e.from || A.e.from === B.e.to || A.e.to === B.e.from || A.e.to === B.e.to) continue;
      const pa = geo[A.e.id].cur, pb = geo[B.e.id].cur;
      const ends = [pa[0], pa[pa.length - 1], pb[0], pb[pb.length - 1]];
      for (let m = 1; m < pa.length; m++) for (let n = 1; n < pb.length; n++) {
        const hit = segX(pa[m - 1], pa[m], pb[n - 1], pb[n]);
        if (!hit || ends.some((q) => Math.hypot(q[0] - hit[0], q[1] - hit[1]) < 10)) continue;
        // A real crossing is at a clear angle; near-parallel courses only brush past each other.
        const bx = pb[n][0] - pb[n - 1][0], by = pb[n][1] - pb[n - 1][1];
        const sin = Math.abs(hit[2] * by - hit[3] * bx) / ((Math.hypot(hit[2], hit[3]) * Math.hypot(bx, by)) || 1);
        if (sin < 0.35) continue;
        const [up, lo] = (order.get(A.g) ?? 0) > (order.get(B.g) ?? 0) ? [A, B] : [B, A];
        const dir = up === A ? [hit[2], hit[3]] : [pb[n][0] - pb[n - 1][0], pb[n][1] - pb[n - 1][1]];
        const L = Math.hypot(dir[0], dir[1]) || 1, half = (lo.width + 2 * lo.wallPx) / 2 + 10;
        const ux = (dir[0] / L) * half, uy = (dir[1] / L) * half;
        const d = `M${(hit[0] - ux).toFixed(1)} ${(hit[1] - uy).toFixed(1)} L${(hit[0] + ux).toFixed(1)} ${(hit[1] + uy).toFixed(1)}`;
        const W = up.width + 2 * up.wallPx;
        out.push(s('path', { class: 'bridge-gap', d, 'stroke-width': (W + 10).toFixed(1) }),
          s('path', { class: 'v-wall bridge-wall', d, 'stroke-width': W.toFixed(1) }),
          s('path', { class: 'v-lumen bridge-lumen', d, stroke: `url(#gr-${up.e.id})`, 'stroke-width': up.width.toFixed(1) }));
      }
    }
    gBridges.append(...out);
  }

  // Where the figure asks the viewer to look (store.focus).
  let focusKey = '';
  function updateFocus() {
    const foc = store.get().focus;
    // A presenter slide can hold several marks, each of a kind (block, treat, note), each in its colour.
    // (A mark's seg on a stent lights only that third of it; several marks on one stent light the stretch that spans them.)
    const kindOf = new Map(), spanOf = new Map();
    for (const m of foc ? foc.marks || [foc] : []) for (const id of m.edges || []) {
      if (!kindOf.has(id)) kindOf.set(id, m.kind || '');
      const sp = m.seg && isStent(EDGES[EI[id]]) ? STENT_SPANS[stentGate(m.seg, store.get().params, id)] : [0, 1], was = spanOf.get(id);
      spanOf.set(id, was ? [Math.min(was[0], sp[0]), Math.max(was[1], sp[1])] : sp);
    }
    const ids = [...kindOf.keys()].filter((id) => E[id]?.vis);
    const presenting = !!store.get().presenting;
    const key = ids.map((id) => id + kindOf.get(id) + spanOf.get(id).join('-')).join(',') + '|' + presenting;
    if (focusKey === key) return;
    focusKey = key;
    // The glow (setGlowSrc): the accent; on a slide a block is the danger red, a treatment the accent, and a note
    // only a pointer (its vessel glows in its station's colour, the slide's glow).
    const col = (k) => (!presenting || k === 'treat' ? 'var(--accent)' : k === 'note' ? null : 'var(--danger)');
    setGlowSrc('focus', ids.filter((id) => col(kindOf.get(id))).map((id) => ({ id, col: col(kindOf.get(id)), amt: 1, wide: 0.75, dur: 600, span: spanOf.get(id)[1] - spanOf.get(id)[0] < 1 ? spanOf.get(id) : null })));
  }

  // Reversal as shown (the Direction lens, the moving blood, the watched stations): a vessel's flag changes only once its
  // new direction has held for a whole breath of model time (respiration is a 4 s cycle), so flow near the cut-off no longer
  // flips blue and orange with every breath; a jump in the model (a new patient, a time jump, Undo: pressures moved more than
  // JUMP_MMHG, or the clock went back or leapt) takes the new flags at once (createReversalHold, blood.js). The model's own flags are untouched (round 2
  // review, B3).
  const revHolder = createReversalHold(EDGES.length, 4), revHold = revHolder.hold;
  let revF = null, revH = null, revT = 0, revP = null, revFlip = false;
  function holdReversals(f) {
    const H = store.get().healthy;
    if (!f || (f === revF && H === revH)) return;
    const P = f.Pf || f.P, t = f.t ?? 0;
    let jump = !revF || H !== revH || t < revT || t - revT > 1 || !revP || revP.length !== P?.length;
    if (!jump) for (let i = 0; i < P.length; i++) if (Math.abs(P[i] - revP[i]) > JUMP_MMHG) { jump = true; break; }
    revF = f; revH = H; revT = t;
    if (P) { if (!revP || revP.length !== P.length) revP = new Float64Array(P.length); revP.set(P); }
    if (revHolder.step((k) => (isReversed(EDGES[k], f) ? 1 : 0), t, jump)) revFlip = true;
  }
  const reversedShown = (e) => revHold[EI[e.id]] === 1;
  function isReversed(e, f) {
    const q = f.Qf[EI[e.id]];
    const ref = st0Ref(e.id);
    return q < -Math.max(0.12, 0.02 * Math.abs(ref));
  }
  const st0Ref = (id) => store.get().healthy?.Q?.[EI[id]] ?? 1;

  function updateNodesCircuit(f) {
    if (morph < 0.02) return;
    for (const n of NODES) {
      if (!nodeEls[n.id]) continue;
      // (A junction dot fades with the vessels that come and go through it, as the figure's views fade: it popped. P21)
      const ne = nodeEls[n.id], off = !nodeVisible(n.id);
      if (ne.off !== off) { ne.off = off; ne.c.classList.toggle('off', off); }
    }
    for (const [id, r] of Object.entries(liverR)) {
      const k = EI[id];
      const q = f.Q[k];
      const dp = f.P[NI[EDGES[k].from]] - f.P[NI[EDGES[k].to]];
      r.R = Math.abs(q) > 1e-3 ? dp / (q * 0.06) : Infinity;
    }
  }

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
  let diaKey = '';
  // An outline's points: a polyline's own (the diseased liver), else sampled once along the curve.
  const outlineCache = new Map();
  function outlinePts(d, el) {
    if (!/[CQSAcqsa]/.test(d)) { const n = d.match(/-?\d+(\.\d+)?/g).map(Number); return n.flatMap((v, i) => (i % 2 ? [] : [[v, n[i + 1]]])); }
    if (!outlineCache.has(d)) {
      const L = el.getTotalLength(), out = [];
      for (let u = 0; u < L; u += 4) { const q = el.getPointAtLength(u); out.push([q.x, q.y]); }
      outlineCache.set(d, out);
    }
    return outlineCache.get(d);
  }
  function diaphragmPath(shrink, sc) {
    const at = (P, cx, cy, k) => P.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]);
    // (The liver's smooth dome, never its nodular edge: the nodules stand out about 2 at most, inside the gap.)
    const liver = at(liverDome || outlinePts(diaCut.liver.getAttribute('d'), diaCut.liver), 560, 350, shrink);
    const stomach = outlinePts(diaCut.stomach.getAttribute('d'), diaCut.stomach);
    const spleen = at(outlinePts(diaCut.spleen.getAttribute('d'), diaCut.spleen), SPLEEN_CENTER[0], SPLEEN_CENTER[1], sc);
    // One smooth dome over them (diaphragm.js); the heart rests on it, just under its base.
    return diaphragmD(diaphragmLine([liver, stomach, spleen], heartFloor));
  }
  function liftDiaphragm(shrink, sc) {
    // The spleen in steps of 1% (as the plate key reads it): the running model's slow drift must not
    // redraw the dome, and the plate with it, every frame. The gap absorbs the difference.
    const scQ = Math.round(sc * 100) / 100;
    const key = `${liverKey}|${shrink.toFixed(3)}|${scQ}`;
    if (key === diaKey) return;
    diaKey = key;
    for (const id of ['liver', 'spleen']) diaCut[id].setAttribute('transform', organG[id].getAttribute('transform') || '');
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
    lvTT = stepHeld(lvTT, clamp((psin - 8) / 16, 0, 1), 0.1);
    const tT = isImaging() ? 0 : lvTT * 0.5;
    const hp = store.get().healthy?.P;
    const cvUp = hp ? Math.max(PA[NI.CV_R] - hp[NI.CV_R], PA[NI.CV_L] - hp[NI.CV_L]) : 0;
    lvGT = stepHeld(lvGT, clamp((cvUp - 4) / 10, 0, 1), 0.03);
    const cT = Math.min(1, p.cirrhosis), gT = lvGT;
    if (lvC === null || reduceMotion.matches || !figureShown) { lvC = cT; lvG = gT; lvT = tT; }   // under the loading screen nothing is seen easing
    else { lvC = easeTo(lvC, cT, dt); lvG = easeTo(lvG, gT, dt); lvT = easeTo(lvT, tT, dt); }
    lvAt = performance.now();
    return [cT, gT, tT];
  }
  function updateOrgans(f, p, t) {
    const k = 1 - t;
    const imaging = isImaging();
    const [cT, gT, tT] = easeLiver(f, p, Math.min(0.1, (performance.now() - lvAt) / 1000));
    // The congestion tint eases here, not by a CSS transition: the plate raster reads the value
    // it shows, and a fade in progress at that moment would be baked in (re-rastered over and
    // over, the tint flickered between mid-fade values).
    // (The congested liver takes the even dusk instead, so the tint's darker rim gives way to it as congestion comes in: organ
    // picks, 20 Oct.) It hands over across the same range the dusk comes in by (morphLiver: g / 0.5), so a slightly raised
    // pressure (after a TIPS) keeps some of the tint until the dusk is there to take its place.
    // (Not faded with the switch to the circuit: the organs' group fades it there, and a tint stepping down with the switch
    // changed the picture's key, so the organs' picture was drawn again every half second of the fade.)
    liverTint.style.opacity = (lvT * (1 - smooth01(lvG / 0.5))).toFixed(3);
    if (lvT !== tT) widthEasing = organsEasing = true;
    const moving = lvC !== cT || lvG !== gT;
    // While it eases, the live drawing shows (a raster would move in steps); the plate is
    // rasterized again once it settles.
    // A large change, or one still under way (a time-lapse), shows the live drawing. A small step
    // (the running model's congestion drifting a notch) eases under the plate and is rasterized once
    // it settles: swapping to the live drawing and back every few seconds would flash the organs.
    const retarget = lvMoving && (cT !== lvCT || gT !== lvGTo);
    lvCT = cT; lvGTo = gT;
    if (moving && (retarget || Math.max(Math.abs(cT - lvC), Math.abs(gT - lvG)) > 0.08) && veins && !veins.lost && veins.hasPlate(0) && !liveOn()) hidePlate();
    if (lvMoving && !moving) lvStillAt = performance.now();
    lvMoving = moving;
    if (moving) widthEasing = organsEasing = true;
    gpuProbe.time(null, 'organs: liver', () => morphLiver(lvC, lvG, moving));
    for (const el of [lv.cong, lv.isl, lv.gloss]) if (el.style.visibility !== (imaging ? 'hidden' : '')) el.style.visibility = imaging ? 'hidden' : '';
    // A cirrhotic liver shrinks a little; a congested one swells.
    const shrink = liverShrink(lvC, lvG);
    liverScale = shrink;
    const liverT = `translate(560 350) scale(${shrink.toFixed(4)}) translate(-560 -350)`;
    putA(organG.liver, 'transform', liverT);
    putA(organG.falciform, 'transform', liverT);   // (the falciform line goes with the liver, as its surface lines do)
    {
      // The caudate lobe grows as its veins carry the liver's outflow: from twice their normal flow, fully at four times.
      const hq = store.get().healthy?.Q?.[EI.CAUD], PA2 = f.Pf || f.P;
      caudK = stepHeld(caudK, hq ? clamp((Math.abs((f.Qf || f.Q)[EI.CAUD] / hq) - 2) / 2, 0, 1) : 0, 0.05);
      gpuProbe.time(null, 'organs: caudate', () => caud.sync(pressureColor(qP(PA2[NI.IVCS] + 0.5)), caudK));
    }
    const c3 = recruitFrac('C3', f);
    putA(abdWall, 'opacity', (clamp((c3 - 0.1) / 0.4, 0, 1) * 0.9 * k).toFixed(2));
    // The umbilicus is a landmark only for the paraumbilical vein that runs to it: with that vein closed, it was a lone ring
    // in the empty abdomen beside the gut (sweep batches 02–04). It fades in as the vein opens, as the caput's veins do, in
    // quarter steps (the organs' raster is drawn again at each step: plateStateKey).
    if (organEls.umbilicus) {
      const op = String(Math.round(4 * (findingHidden('coll') ? 0 : clamp((c3 - 0.15) / 0.3, 0, 1))) / 4);
      if (organEls.umbilicus.getAttribute('opacity') !== op) organEls.umbilicus.setAttribute('opacity', op);
    }
    const sc = f.slow.spleen / 11;
    normalSync(sc);
    // Growing, the plate (a picture of the organs at one size) gives way to the live drawing, which follows this size each frame.
    if (spleenMv.see(sc, performance.now()) && veins && !veins.lost && veins.hasPlate(0) && !liveOn()) hidePlate();
    putA(organG.spleen, 'transform', `translate(${SPLEEN_CENTER[0]} ${SPLEEN_CENTER[1]}) scale(${sc.toFixed(3)}) translate(${-SPLEEN_CENTER[0]} ${-SPLEEN_CENTER[1]})`);
    gpuProbe.time(null, 'organs: masks', () => syncOrganMasks(shrink, organG.spleen.getAttribute('transform')));
    if (organG.spleen.style.opacity !== (p.splenicRx === 2 ? '0.14' : '')) organG.spleen.style.opacity = p.splenicRx === 2 ? '0.14' : '';
    liftDiaphragm(shrink, sc);
    syncSelLine();
    // The shown ascites eases to the model's volume (stepFluid), so a tap or diuretics never pops the level.
    // (In steps of FLUID_STEP from the volume drawn: the model's trickle each update must not count as the fluid moving.)
    const asc = fluidTarget(ascTarget, f.slow.ascites);
    if (ascTarget === null) ascShown = asc;
    ascTarget = asc;
    gpuProbe.time(null, 'organs: fluid', () => drawAscites());
    syncSelFluid();
    gpuProbe.time(null, 'organs: plate poke', () => platePoke());
  }

  // Ascites collects in the flanks and the pelvis first (supine patient, frontal view), so its
  // surface is a meniscus: highest at the sides, lowest in the middle. The abdominal wall bulges
  // and the bowel floats up on it. A slow ripple runs along the surface while the model runs. On
  // the GPU the fluid is drawn over the plate (not in its raster), so no lens tints it; the SVG
  // copy stays for picking, the selection outline and exports.
  let bulgeQ = 0;
  // The fluid still easing toward its volume by more than a step of the wall's bulge (a tap, a drain, diuretics): the organ plate,
  // whose wall and bowel follow the bulge, is rasterized once it settles, not at every step on the way (each about 712 KB of SVG and
  // an 8 MB upload, several times per ease). The slow creep of a running model stays within a step, so it never holds the plate.
  const fluidEasing = () => ascTarget !== null && Math.abs(clamp(ascTarget / 8500, 0, 1) - clamp(ascShown / 8500, 0, 1)) * 34 > 0.5;
  let ascTarget = null, ascShown = 0, ascVel = 0, fluidMaskB = null, fluidMaskOf = null, fluidMaskOfB = null, fluidBandH = -1, fluidH = 0, fluidAmp = 0, fluidInkRGBA = [0.9, 0.75, 0.28, 0.4];
  const fluidLook = { s: [0, 0, 0, 0], ink: [0, 0, 0, 0], ripple: false };
  const abdomenClipEl = defs.querySelector('#abdomenClip path');
  // (The ripple's phase advances with the running model's frames, so it carries on from where it stood after a pause instead of
  // jumping to the wall clock's; round 2 review, B11.)
  let fluidPh = 0;
  const fluidPhase = () => fluidPh;   // both ripple terms are periodic over 20π
  const fluidSurfAt = (x, ph) => { const c = (x - 712) / 400; return ABDOMEN_FLOOR + 5 - fluidH * (0.8 + 0.2 * c * c) + (Math.sin(x / 38 + ph) * 0.7 + Math.sin(x / 23 - ph * 1.3) * 0.3) * fluidAmp; };
  // No pool while the readout grades the belly "None"; past that it fades in as it fills and out as it drains, so it never pops.
  const fluidFade = () => poolFade(ascShown);
  function drawAscites() {
    const u = clamp(ascShown / 8500, 0, 1);
    // The wall and the bowel move in half-unit steps of the bulge, with some hysteresis: each step re-rasterizes the
    // organ plate (plateStateKey), so a pool that fills slowly at rest must not change them on every model tick.
    const raw = u * 34;
    if (Math.abs(raw - bulgeQ) > 0.4 || (raw < 0.5 && bulgeQ !== 0)) bulgeQ = Math.round(raw * 2) / 2;
    const bulge = bulgeQ;
    putA(flank, 'd', u < 0.04 ? '' : flankPath(bulge));
    const d = abdomenOutline(bulge);
    if (fluidMaskB !== bulge) { fluidMaskB = bulge; abdomenClipEl.setAttribute('d', d); abdomenEl.setAttribute('d', d); }
    if (veins && !veins.lost && (fluidMaskOf !== veins || fluidMaskOfB !== bulge)) {
      fluidMaskOf = veins; fluidMaskOfB = bulge; fluidBandH = -1;
      // The cavity as a half-width per half unit of height (cavityHalfWidths), not a raster of its outline: copying a fresh
      // 856 x 600 canvas into a texture took Safari about 220 ms, on nearly every frame of a fluid ease (a Timelines
      // recording of HVPG slide 8 to 9, 17 Oct).
      const R = FLUID_R;
      veins.setFluidSpans(cavityHalfWidths(bulge, R[1], R[3], FLUID_COLS), R);   // (its second row: the liver's edge, setFluidLiver)
    }
    putA(organG.bowel, 'transform', `translate(0 ${(-bulge / 34 * 26).toFixed(1)})`);
    // The fluid level rises on a compressed scale (u^0.6), so a grade 1–2 effusion is a visible pool, not a sliver. Near the
    // top of the scale (about 8.5 L) the surface reaches the lower edge of the spleen: clearly concave (about 100 units
    // lower in the middle than at the flanks), the same on both sides.
    const uv = Math.pow(u, 0.6);
    fluidH = uv * 485; fluidAmp = 2 * Math.min(1, uv * 4);
    fluidSurf = null;
    if (fluidFade() <= 0) { putA(ascitesPath, 'd', ''); putA(ascitesLine, 'd', ''); }
    else {
      const floor = ABDOMEN_FLOOR + 5, ph = reduceMotion.matches || plateOn() ? 0 : fluidPhase();
      const surf = (x) => fluidSurfAt(x, ph);
      fluidSurf = surf;
      let line = '';
      for (let x = 296; x <= 1128; x += 8) line += `${x === 296 ? 'M' : ' L'}${x} ${surf(x).toFixed(1)}`;
      putA(ascitesLine, 'd', line);
      if (gAscites.style.getPropertyValue('--fluid-fade') !== fluidFade().toFixed(3)) gAscites.style.setProperty('--fluid-fade', fluidFade().toFixed(3));
      putA(ascitesPath, 'd', `${line} L 1128 ${floor + 70} L 296 ${floor + 70} Z`);   // down past the rounded pelvic floor; the clip shapes it
      // The cells the rippling surface (and its light band) passes through, redrawn each frame on the GPU.
      if (veins && !veins.lost && Math.abs(fluidH - fluidBandH) > 0.25) {
        fluidBandH = fluidH;
        const cells = [];
        for (let x = 288; x < 1136; x += 16) {
          const base = (z) => { const c = (z - 712) / 400; return ABDOMEN_FLOOR + 5 - fluidH * (0.8 + 0.2 * c * c); };
          const a = base(x), b = base(x + 16);
          const y0 = Math.min(a, b) - fluidAmp - 2, y1 = Math.max(a, b) + fluidAmp + 10;
          for (let y = y0; y < y1; y += 16) cells.push(x, y);
        }
        veins.setFluidCells(new Float32Array(cells));
      }
    }
    syncSelFluid();
    platePoke();
  }
  // Per animation frame: ease the shown volume and keep the GPU fluid's look current. True when the level moved.
  function stepFluid(dt, st, easeDt = dt) {
    if (ascTarget === null) return false;
    let moved = false;
    if (ascShown !== ascTarget) {
      fluidFrom ??= fluidH;
      // A large change shows the live drawing while it eases, as the liver's does: the wall and bowel move with the fluid, and the plate
      // is rasterized once it settles (held under the plate, the wall would jump by the whole change when it landed).
      const held = fluidEasing();
      if (held && Math.abs(clamp(ascTarget / 8500, 0, 1) * 34 - bulgeQ) > 3 && veins && !veins.lost && veins.hasPlate(0) && !liveOn()) hidePlate();
      // A critically damped spring on the drawn scale (volume^0.6), so the fluid fills in from the pelvis and
      // drains out smoothly, starting and stopping gently, instead of jumping in or out of existence.
      ({ shown: ascShown, vel: ascVel } = easeDt > 0.05 ? fluidSpringFor(ascShown, ascVel, ascTarget, easeDt) : fluidSpring(ascShown, ascVel, ascTarget, easeDt));
      drawAscites(); moved = true;   // (its platePoke rasterizes once the fluid is within a step of its volume)
    }
    const run = st.running && !reduceMotion.matches;
    if (run) fluidPh = (fluidPh + dt / 1.1) % (20 * Math.PI);
    // (Under a slide's spotlight the fluid eases with the organs' dim: the plate's own value, less a lens's share of it.)
    const spotK = spot.live && plateDim != null ? clamp(plateDim / (wrap.classList.contains('data-layer') ? 0.72 : 1), SEL_DIM, 1) : 1;
    const t = easeInOut(morph), k = (1 - t) * (wrap.classList.contains('has-sel') ? SEL_DIM : spotK);
    fluidLook.s = [ABDOMEN_FLOOR + 5, fluidH, fluidAmp, run ? fluidPhase() : fluidLook.s[3]];
    fluidLook.ink = [fluidInkRGBA[0], fluidInkRGBA[1], fluidInkRGBA[2], fluidInkRGBA[3] * k * fluidFade()];
    fluidLook.ripple = run && fluidFade() > 0 && k > 0;
    fluidLook.lv = [liverScale, liverFluidCut];
    if (vLook) vLook.fluid = fluidLook;
    // (A level that moves under fluid drawn at no opacity changes no pixel (the shader draws none at ink 0): no whole repaint for it,
    // only for the frame it fades to nothing. External review, 21 Oct.)
    const seen = fluidLook.ink[3] > 0, was = fluidSeen;
    fluidSeen = seen;
    const from = fluidFrom ?? fluidH;
    fluidFrom = null;
    if (!(moved && (seen || was))) return false;
    // Only the pool's cells are composited again, from above the higher of the two levels (the surface, its ripple and its light
    // band) down: the rest of the picture does not change with it. It was the whole screen on every frame of a fill or a drain
    // (Fable's lag review, item 4). A whole repaint where there is no cavity to bound it.
    const pool = !!(veins && !veins.lost && veins.fluidPool(ABDOMEN_FLOOR + 5 - Math.max(from, fluidH) - fluidAmp - 6));
    if (pool) poolFrames++;
    return !pool;
  }
  let fluidSeen = false, fluidFrom = null, poolFrames = 0;
  function readFluidInk(cs) {
    const hex = cs.getPropertyValue('--ascites').trim().replace('#', ''), a = parseFloat(cs.getPropertyValue('--ascites-a')) || 0.4;
    if (hex.length === 6) fluidInkRGBA = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).concat(a);
  }

  // Point, unit normal and unit tangent at arc length `d` along a vessel's current centerline.
  function frameAt(id, d) {
    const g = geo[id];
    const [x, y, dx, dy] = pointAt(g.cur, clamp(d / (g.len || 1), 0, 1));
    const n = Math.hypot(dx, dy) || 1;
    return { x, y, tx: dx / n, ty: dy / n, nx: -dy / n, ny: dx / n };
  }
  // TIPS: a self-expanding metal stent over the lumen (two rails, a diamond lattice of struts,
  // radiopaque markers at both ends), so the shunt reads as a device, not a vessel.
  // A narrowed stent pinches with its lumen (the same waist, in the segment its card names).
  function stentMesh(id, p) {
    const x = E[id], L = geo[id].len;
    const v = isImaging() ? 0 : p.stenosis[id] || 0, wf = v > 0.01 ? waist(id, v, L, x.width, p) : null;
    const R = (d) => (x.width / 2) * (wf ? wf(d / (L || 1)) : 1) + (x.wallPx || 1) + 1.2;
    const f = (d, side) => { const q = frameAt(id, d), r = R(d); return [q.x + q.nx * r * side, q.y + q.ny * r * side]; };
    const P = (p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
    const d0 = 2, d1 = L - 2, cell = Math.max(6, R(d0) * 1.7);
    let rails = '', struts = '';
    for (const side of [1, -1]) {
      rails += 'M' + P(f(d0, side));
      for (let d = d0 + 3; d < d1; d += 3) rails += ' L' + P(f(d, side));
      rails += ' L' + P(f(d1, side)) + ' ';
    }
    for (const start of [1, -1]) {
      let side = start;
      struts += 'M' + P(f(d0, side));
      for (let d = d0 + cell / 2; d <= d1 + 0.01; d += cell / 2) { side = -side; struts += ' L' + P(f(Math.min(d, d1), side)); }
      struts += ' ';
    }
    let marks = '';
    for (const d of [d0, d1]) { const a = f(d, 1), b = f(d, -1); marks += `M${P(a)} L${P(b)} `; }
    ov.stents.append(s('path', { class: 'stent-strut', d: struts }), s('path', { class: 'stent-rail', d: rails }), s('path', { class: 'stent-rail-glint', d: rails }), s('path', { class: 'stent-mark', d: marks }));
  }
  // Surgical shunts: a row of sutures across each anastomosis.
  function anastomoses(id) {
    const x = E[id], L = geo[id].len;
    const R = x.width / 2 + (x.wallPx || 1) + 2;
    let d = '';
    for (const c of [Math.min(10, L * 0.1), Math.max(L - 10, L * 0.9)]) for (const o of [-3.5, 0, 3.5]) {
      const q = frameAt(id, c + o);
      d += `M${(q.x + q.nx * R).toFixed(1)} ${(q.y + q.ny * R).toFixed(1)} L${(q.x - q.nx * R).toFixed(1)} ${(q.y - q.ny * R).toFixed(1)} `;
    }
    ov.stents.append(s('path', { class: 'suture', d }));
  }
  // A vessel divided at surgery (the splenic vein in a Warren shunt, the portal trunk in a portocaval
  // shunt): two suture ties across its tied-off stump, a little apart, just behind the stump's rounded end.
  function ligature(id) {
    const x = E[id], c = Math.min(divideLen(id) + 5, geo[id].len * 0.6);
    const R = x.width / 2 + (x.wallPx || 1) + 3;
    let d = '';
    for (const o of [-3.5, 3.5]) {
      const q = frameAt(id, c + o);
      d += `M${(q.x + q.nx * R).toFixed(1)} ${(q.y + q.ny * R).toFixed(1)} L${(q.x - q.nx * R).toFixed(1)} ${(q.y - q.ny * R).toFixed(1)} `;
    }
    ov.stents.append(s('path', { class: 'ligature', d }));
  }

  // ── The HVPG catheter (Measure › HVPG) ─────────────
  // A balloon catheter drawn along the real vessels: in from the neck, down the SVC, through the right
  // atrium into the IVC and out into the right hepatic vein, where its tip reads the pressure. In
  // front of the inflated balloon the still column fills with the wedged (sinusoidal) pressure. The
  // readings are labels at the tip, in screen pixels. hvpg-proc.js drives it frame by frame.
  const cath = (() => {
    const g = s('g', { class: 'cath', 'aria-hidden': 'true' });
    const column = s('path', { class: 'cath-column' }), column2 = s('path', { class: 'cath-column' });
    const shadow = s('path', { class: 'cath-shadow' }), body = s('path', { class: 'cath-body' });
    const balloon = s('path', { class: 'cath-balloon' }), ring = s('circle', { class: 'cath-ring' }), tip = s('circle', { class: 'cath-tip' });
    g.append(column, column2, shadow, body, balloon, ring, tip);
    g.style.display = 'none';
    gOver.append(g);
    const labels = document.createElement('div');
    labels.className = 'cath-labels'; labels.setAttribute('aria-hidden', 'true');
    wrap.append(labels);
    return { g, column, column2, shadow, body, balloon, ring, tip, labels, st: null, at: null, saved: null, kind: 'hvpg' };
  })();
  // A presenter slide's measuring sites (the PPG's portal vein and IVC): a pointer on each station with its reading,
  // drawn like the catheter's WHVP and FHVP callouts. It fades in, follows the camera and stays in the figure's free space.
  // (The portal vein's hangs below the confluence, clear of the trunk and its clot.)
  // rLiver, rColl: the circuit's resistors, the liver's and the collaterals', each against the healthy liver's
  // resistance (a zigzag drawn on the vessels, its stroke heavier as the resistance rises, and the ratio beside it).
  const SITE_DEF = { pv: { node: 'CONF', kicker: 'Portal vein', cls: 'pv', below: true }, ivc: { node: 'IVCS', kicker: 'IVC', cls: 'ivc' },
    ra: { node: 'RA', kicker: 'Right atrium', cls: 'ivc' },
    web: { node: 'IVCS', kicker: 'IVC, below the web', cls: 'ivc', below: true },   // (with ra above it: the two sides of an IVC web)
    // split: where portal blood goes, the share that bypasses the liver over a bar split into the liver's and the shunts' shares.
    split: { node: 'PVH', kicker: 'Portal blood', cls: 'split', split: true, below: true },
    // (Both readings stand above the liver's column, clear of the station labels; the zigzags mark where each resistor is.)
    // (Named in full, each ratio bare; "vs healthy liver" is said once, in the group's key: 17 Oct design review.)
    rLiver: { kicker: 'Liver resistance', cls: 'res', unit: '', res: 'liver' },
    rColl: { kicker: 'Collateral resistance', cls: 'res coll', unit: '', res: 'coll' },
    // The gut's arterioles (the splanchnic arteries in parallel), in series before the liver: most of the pressure falls here.
    rGut: { kicker: 'Gut arteriole resistance', cls: 'res gut', unit: '', res: 'gut' } };
  // The resistors' key, under the one reading at the group's outer edge (resKeyed).
  const RES_KEY = '× healthy liver’s resistance';
  // Where the resistors' readings stand (stage-local): centred over the circuit, above it, or below it once it is turned upright.
  function resAt() {
    const c = [[60, 40], [1360, 40], [60, 640], [1360, 640]].map(([x, y]) => worldToLocal(x, y)), ys = c.map((p) => p[1]);
    const up = rotU > 0.5;
    return { x: c.reduce((a, p) => a + p[0], 0) / 4, y: up ? Math.max(...ys) : Math.min(...ys), up };
  }
  // Resistance as ΔP / Q: the liver's lobes, each its venules, sinusoids and outflow in series, in parallel with each other.
  const LOBES = [['PRE_R', 'SIN_RR', 'POST_R_RHV'], ['PRE_L', 'SIN_LL', 'POST_L_LHV']];
  const rOf = (P, Q, id) => { const k = EI[id], e = EDGES[k]; return (P[NI[e.from]] - P[NI[e.to]]) / Math.max(1e-6, Math.abs(Q[k])); };
  const GUT_ART = ['A_SMA', 'A_IMA', 'A_SPL', 'A_LGA'];
  const liverRes = (P, Q) => 1 / LOBES.reduce((g, ids) => g + 1 / Math.max(1e-6, ids.reduce((r, id) => r + rOf(P, Q, id), 0)), 0);
  /** The ratio a resistor shows, or null when there is nothing to show (collaterals closed). */
  function resRatio(kind) {
    const hp = store.get().healthy, at = pinned()?.at, P = at?.P || F.Pf || F.P, Q = at?.Q || F.Qf || F.Q;
    if (!hp?.P || !hp?.Q) return null;
    const r0 = liverRes(hp.P, hp.Q);
    // (The live frame breathes a few percent around the settled value, so a liver within 8% of the healthy one reads exactly ×1.0, not ×0.9 and ×1.0 by turns.)
    if (kind === 'liver') { const r = liverRes(P, Q) / r0; return Math.abs(r - 1) < 0.08 ? 1 : r; }
    if (kind === 'gut') return 1 / GUT_ART.reduce((g, id) => g + 1 / Math.max(1e-6, rOf(P, Q, id)), 0) / r0;
    let qc = 0;
    for (const e of EDGES) if (e.kind === 'collateral' && edgePresent(e, store.get().params)) qc += Math.max(0, Q[EI[e.id]]);
    if (qc * 0.06 < 0.05) return null;
    return (P[NI.CONF] - P[NI.IVCS]) / qc / r0;
  }
  const resG = s('g', { class: 'res-zz circuit-only', 'aria-hidden': 'true' });
  gOver.append(resG);
  const resMade = new Map();
  let resLit = new Map();   // the circuit's resistors a slide's words point at (rLiver, rColl) → their station tone
  // A resistor's zigzag along a vessel: n teeth of amplitude amp (world units) from a to b.
  const zig = (a, b, n = 6, amp = 9) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    let d = `M${a[0].toFixed(1)} ${a[1].toFixed(1)}`;
    for (let i = 0; i < n; i++) { const u = (i + 0.5) / n, sgn = i % 2 ? -1 : 1; d += ` L${(a[0] + dx * u + nx * amp * sgn).toFixed(1)} ${(a[1] + dy * u + ny * amp * sgn).toFixed(1)}`; }
    return d + ` L${b[0].toFixed(1)} ${b[1].toFixed(1)}`;
  };
  function resPaint(k, d, ratio) {
    let g = resMade.get(k);
    const want = sites.list?.includes(k) && ratio != null;
    if (!want) { if (g) { resMade.delete(k); g.style.opacity = 0; setTimeout(() => g.remove(), 700); } return; }   // (faded out whole first: .res-one, .6 s)
    if (!g) { g = s('g', { class: 'res-one' }); g.style.opacity = 0; resG.append(g); resMade.set(k, g); nextFrame(() => nextFrame(() => { g.style.opacity = 1; })); }
    const segs = d.res === 'liver' ? [[[812, 303], [888, 303]], [[812, 387], [888, 387]]] : (() => {
      const q = d.res === 'gut' ? geo.A_SMA?.cur && pointAt(geo.A_SMA.cur, 0.5) : geo.C1b && pointAt(geo.C1b.cur, 0.5);
      return q ? [[[q[0] - q[2] * 34, q[1] - q[3] * 34], [q[0] + q[2] * 34, q[1] + q[3] * 34]]] : [];
    })();
    const lit = resLit.get(k);
    g.classList.toggle('lit', !!lit); g.style.setProperty('--res-c', lit ? toneCol(lit) : 'var(--text)');
    g._segs = segs;   // (the figure's labels keep off the zigzags too: buildSegs)
    const path = segs.map(([a, b]) => zig(a, b)).join(' ');
    if (g.dataset.d !== path) { g.dataset.d = path; g.replaceChildren(s('path', { class: 'res-halo', d: path }), s('path', { class: 'res-line', d: path })); }
    // Heavier as the resistance rises: 1.5 px at the healthy liver's, about 4 px at four times it (eased by CSS).
    g.style.setProperty('--res-w', `${clamp(1.5 + 1.25 * Math.log2(Math.max(0.25, ratio)), 0.8, 5).toFixed(2)}px`);
  }
  // The wide screen's nav pill, read with the cards (readBlockers): its gap from the stage's right edge is the slides' one margin
  // (--pz-cm), and its top bounds the row the figure's readings keep clear of. Null when no pill shows (a phone, or no slide).
  let pillEdge = null;
  const sites = (() => {
    const el = document.createElement('div');
    el.className = 'cath-labels site-labels'; el.setAttribute('aria-hidden', 'true');
    wrap.append(el);
    return { el, list: null, fp: null, made: new Map(), dy: null, dyG: null };
  })();
  // A slide's numbers (its fingerprint, or a what-if's or time-lapse's since): the tiles show them, and a callout or figure
  // label that agrees with the model reads them too, so a laptop and a tablet show the same number at the same moment.
  let slideFp = null;
  store.on('presentFp', () => { slideFp = null; });
  const pinned = () => (store.get().presenting ? slideFp || store.get().presentFp : null);
  const breath = (v) => Math.max(0.8, Math.abs(v) * 0.08);   // (how far the live model may breathe from a pinned number and still read it)
  // The "Portal blood" callout: the share that bypasses the liver as its headline, over one bar split into the liver's
  // share (portal pink) and the shunts' (tinted like the shunt tile: plain, amber, red). A new share counts and slides
  // there over 0.8 s, eased; the callout's size never changes.
  function splitShow(el, sh) {
    const p = portalSplit(sh), [n, lt, st] = el.querySelectorAll('.sp-n, .sp-lt, .sp-st'), lx = `To the liver ${p.liver}%`, sx = `Shunts ${p.shunt}%`;   // (a share of the portal blood: never read as the tile's liver flow, % of normal)
    if (n.textContent !== `${p.shunt}`) n.textContent = `${p.shunt}`;
    if (lt.textContent !== lx) lt.textContent = lx;
    if (st.textContent !== sx) st.textContent = sx;
    el.style.setProperty('--sp-lf', (1 - sh).toFixed(4)); el.style.setProperty('--sp-sf', sh.toFixed(4));
    el.style.setProperty('--sp-lm', p.liver ? '4px' : '0px'); el.style.setProperty('--sp-sm', p.shunt ? '4px' : '0px');   // a share that rounds above 0 keeps a sliver; 0 leaves none
  }
  function splitTo(el, to) {
    if (el._shTo === to) return;
    el._shTo = to; el.dataset.rate = portalSplit(to).rate;
    cancelAnimationFrame(el._shRaf);
    if (el._sh == null || matchMedia('(prefers-reduced-motion: reduce)').matches) { splitShow(el, el._sh = to); return; }
    const from = el._sh, t0 = performance.now();
    const step = (now) => { const k = Math.min(1, (now - t0) / 800); splitShow(el, el._sh = from + (to - from) * easeInOut(k)); if (k < 1 && el.isConnected) el._shRaf = requestAnimationFrame(step); };
    el._shRaf = requestAnimationFrame(step);
  }
  const siteLive = (f, live, tol) => Number.isFinite(live) ? (Number.isFinite(f) && Math.abs(live - f) < tol ? f : live) : f;
  // Where a reading stands on the stage (its CSS translate worked out here, so placing it reads no layout), pointer included:
  // the figure's labels keep clear of it (layoutLabels). d: its SITE_DEF entry, or null for the catheter's readings.
  function calloutBox(el, d, cx, y, half, h) {
    const w = 2 * half, low = el.classList.contains('low');
    let bx = cx - half, by;
    if (d?.res) {
      const i = d.res === 'gut' ? 2 : d.res === 'coll' ? 1 : 0;
      if (low) { by = i === 2 ? y + h + 18 : y + 10; if (i === 0) bx = cx - w - 10; else if (i === 1) bx = cx + 10; }
      else by = y - (i + 1) * h - 12 - 6 * i;
      const b = { x0: bx, y0: by, x1: bx + w, y1: by + h };
      // (The key, centred on the group: above the outermost reading of a level circuit, under the group of an upright one.)
      if (el.classList.contains('keyed')) {
        const kw = (el._kwid || 0) / 2;
        b.x0 = Math.min(b.x0, cx - kw); b.x1 = Math.max(b.x1, cx + kw);
        if (low) b.y1 = by + 2 * h + 4; else b.y0 = by - h - 4;
      }
      return b;
    }
    const ahead = el.dataset.at === 'ahead' && !el.classList.contains('above');
    return ahead ? { x0: bx, y0: y, x1: bx + w, y1: y + 18 + h } : { x0: bx, y0: y - 18 - h, x1: bx + w, y1: y };
  }
  // A site's reading that leaves fades out whole, its glass too (cath-leave), and is removed once faded.
  function siteLeave(k, el) {
    if (sites.made.get(k) === el) sites.made.delete(k);
    el.classList.add('cath-leave');
    setTimeout(() => { el._glass?.dispose(); el.remove(); }, reduceMotion.matches ? 0 : 700);
  }
  // A reading's number counts to a new value over 950 ms, eased, as the data card's tiles count (presenter.js tweener), so a slide's
  // or a patient's change never swaps it at once; within tol of the number shown (the live model breathing, a slider being dragged)
  // it simply follows. A reading just shown, hidden, or under reduced motion takes its number at once.
  const COUNT_MS = 950, LABEL_GLIDE_MS = 450;   // (LABEL_GLIDE_MS: the figure's labels glide as long: labelGlide)
  let sitesRaf = 0;
  const sitesAgain = () => { if (!sitesRaf) sitesRaf = nextFrame(() => { sitesRaf = 0; if (F && sites.list) { refreshCTM(); sitesPaint(); } }); };
  function siteCount(el, to, tol) {
    if (!Number.isFinite(to)) { el._nv = null; el._ng = null; return to; }
    if (el._nv == null || reduceMotion.matches || el.classList.contains('off')) { el._ng = null; return (el._nv = to); }
    const now = performance.now();
    let g = el._ng;
    if (g ? Math.abs(to - g.to) > tol : Math.abs(to - el._nv) > tol) g = el._ng = { from: el._nv, to, t0: now };
    if (!g) return (el._nv = to);
    g.to = to;
    const u = clamp((now - g.t0) / COUNT_MS, 0, 1);
    el._nv = g.from + (g.to - g.from) * easeInOut(u);
    if (u < 1) sitesAgain(); else el._ng = null;
    return el._nv;
  }
  // The resistors' group, moved clear of the cards, glides to its new place when a slide's change moves it (a reading joining or leaving
  // the group); while the camera moves it keeps with the circuit exactly, as before.
  let resCam = '';
  function resShift(dy) {
    const cam = [CTM.a, CTM.b, CTM.e, CTM.f].map((v) => v.toFixed(2)).join(), still = cam === resCam;
    resCam = cam;
    const now = performance.now();
    if (sites.dy == null || !still || reduceMotion.matches || camMove) { sites.dyG = null; return (sites.dy = dy); }
    let g = sites.dyG;
    if (Math.abs(dy - (g ? g.to : sites.dy)) > 0.5) g = sites.dyG = { from: sites.dy, to: dy, t0: now };
    if (!g) return (sites.dy = dy);
    const u = clamp((now - g.t0) / LABEL_GLIDE_MS, 0, 1);
    sites.dy = g.from + (g.to - g.from) * easeInOut(u);
    if (u < 1) sitesAgain(); else sites.dyG = null;
    return sites.dy;
  }
  function sitesPaint() {
    const want = sites.list || [], made = sites.made;
    for (const k of [...resMade.keys()]) if (!want.includes(k)) resPaint(k, SITE_DEF[k], null);
    for (const [k, el] of made) if (!want.includes(k)) siteLeave(k, el);
    if (!F || !want.length) return;
    const { width: W, height: H } = stageBox(), t = easeInOut(morph);   // (the cached box: reading the wrap's each model frame forced a layout)
    // (Never nearer a screen edge than the slides' one margin, as the cards and the figure's labels keep: 17 Oct design review.)
    const M = pillEdge ? pillEdge.m : 8;
    const x0 = Math.max(M, pzInset('--pz-l') + 8), x1 = W - Math.max(M, pzInset('--pz-r') + 8), y0 = Math.max(M, pzInset('--pz-t') + 8), y1 = H - pzInset('--pz-b') - 8;
    // (A wider screen's colour key stands on the nav pill at the lower right (presenter.js): one box, kept clear of every callout;
    // read at most twice a second, not each model frame.)
    const ko = keyPillBox();
    // The resistors' readings stand as one group (side by side under an upright circuit, stacked above a level one, the gut's
    // the farthest out): where the group's box would reach under the slide's cards, the whole group moves into the free space.
    let resDy = 0, resKeyed = null, resH = 0;
    const ra0 = want.some((k) => SITE_DEF[k]?.res) ? resAt() : null;
    if (ra0) {
      const rh = resH = Math.max(0, ...[...made].filter(([k]) => SITE_DEF[k]?.res).map(([, el]) => el._h || 0));
      const on = (k) => want.includes(k) && resRatio(SITE_DEF[k].res) != null;
      const gut = on('rGut'), coll = on('rColl');
      // (The key goes with the reading at the group's outer edge: the top one of a level circuit, else under the row of an upright one.)
      resKeyed = (ra0.up ? ['rGut', 'rLiver', 'rColl'] : ['rGut', 'rColl', 'rLiver']).find(on) || null;
      const kh = resKeyed ? rh + 4 : 0;
      if (rh && ra0.up) resDy = Math.min(0, y1 - (ra0.y + (gut ? 2 * rh + 18 : rh + 10) + kh));
      else if (rh) resDy = Math.max(0, y0 - (ra0.y - (gut ? 3 * rh + 24 : coll ? 2 * rh + 18 : rh + 12) - kh));
    }
    // (Readings not measured yet take their place at once next frame: a group just come never slides in from where it was not.)
    resDy = ra0 && resH ? resShift(resDy) : ((sites.dy = null), resDy);
    for (const k of want) {
      const d = SITE_DEF[k];
      if (!d || (d.node && !NODE_POS[d.node])) continue;
      const ratio = d.res ? resRatio(d.res) : null;
      if (d.res) resPaint(k, d, ratio);
      let el = made.get(k);
      if (!el) {
        el = document.createElement('div'); el.className = `cath-label site ${d.cls} cath-pre`;
        if (!d.res) el._glass = glassCallout(el);
        const sm = document.createElement('small'); sm.textContent = d.kicker;
        const b = document.createElement('b'), u = document.createElement('span'); u.textContent = d.unit ?? 'mmHg';
        el.append(sm, b, u);
        if (d.res) { const kk = document.createElement('i'); kk.className = 'res-k'; kk.textContent = RES_KEY; el.append(kk); }
        if (d.split) {
          b.innerHTML = '<span class="sp-h"><em class="sp-n"></em>% bypasses the liver</span>'
            + '<span class="sp-bar"><i class="sp-l"></i><i class="sp-s"></i></span>'
            + '<span class="sp-cap"><em class="sp-lt"></em><em class="sp-st"></em></span>';   // (constant markup)
          u.textContent = '';
        }
        sites.el.append(el); made.set(k, el);
        void el.offsetWidth; el.classList.remove('cath-pre');
      }
      // Live readings, like the data card: the slide's numbers (fp) only while the model still agrees with them, so a
      // what-if slider moves the callouts as it moves the tiles.
      if (d.split) splitTo(el, clamp((Number.isFinite(sites.fp?.shunt) ? sites.fp.shunt : beatMean('shunt', F.metrics?.shuntFraction, 2)) ?? 0, 0, 1));   // (the slide's own share, the tile's number; a what-if or a time-lapse moves it with the tiles)
      // (A new number counts there, as the data card's tiles do, never jumps: siteCount.)
      const n = d.split ? null : d.res ? (ratio == null ? null : siteCount(el, ratio, 0.15)) : siteCount(el, siteLive(Number.isFinite(sites.fp?.[k]) ? sites.fp[k] : pinned()?.at?.P[NI[d.node]], (F.Pf || F.P)[NI[d.node]], breath(Number.isFinite(sites.fp?.[k]) ? sites.fp[k] : (F.Pf || F.P)[NI[d.node]])), 0.5);
      const b = el.querySelector('b'), v = d.split ? null : d.res ? (n == null ? '' : '×' + fmt(n, n < 10 ? 1 : 0)) : fmt(n, 1);
      if (v != null) putText(b, v);
      const ra = d.res ? resAt() : null;
      if (ra) { el.classList.toggle('low', ra.up); el.classList.toggle('keyed', k === resKeyed); }
      const [x, y] = ra ? [ra.x, ra.y + resDy] : worldToLocal(...nodePos(d.node, t));
      // Off the free space (or a resistor with nothing to show, or out of the circuit), the reading waits hidden; above
      // its point unless the top is covered (decided once, so it never jumps).
      // (A reading wider than the free space, as the portal blood's share is between two wide cards on a phone held sideways, waits
      // hidden too: it would stand half under a card, its words cut off.)
      el.classList.toggle('off', x < x0 || x > x1 || y < y0 || y > y1 || (!!d.res && (ratio == null || t < 0.5)) || (!d.res && !!el._half && 2 * el._half > x1 - x0 + 1));
      if (el._below == null && el.offsetHeight) { el._below = d.below ? y + 18 + el.offsetHeight < y1 : y - 18 - el.offsetHeight < y0; el.dataset.at = el._below ? 'ahead' : ''; }
      // (Its width read again only when its words or classes change: a read after each frame's new number forced a layout.)
      const wk = `${el.className}|${el.textContent}|${W}|${labelBase()}|${labelFonts}`;
      if (el._wk !== wk || !el._half) { el._wk = wk; el._half = el.offsetWidth / 2; el._h = el.offsetHeight; el._kwid = d.res ? el.querySelector('.res-k')?.offsetWidth || 0 : 0; }
      const half = el._half, cx = clamp(x, Math.min(x0 + half, (x0 + x1) / 2), Math.max(x1 - half, (x0 + x1) / 2));
      el._box = el.classList.contains('off') ? null : calloutBox(el, d, cx, y, half, el._h || 0);
      el.style.setProperty('--ax', `${(x - cx).toFixed(1)}px`);
      el._glass?.(x - cx);
      el.style.transform = `translate(${cx.toFixed(1)}px, ${y.toFixed(1)}px)`;
      // Over the key or the nav pill: the callout steps left, its pointer still on its point; with no room there, a callout above
      // its point rises just clear of them. (Its height and its top's offset from its point are read with its width.)
      // (A reading's own offset is known from its side of the point, app.css data-at: read off the screen, it was read part way through
      // the .45 s glide to that side, and a callout below its point counted as above it, its foot on the key: Shunts 2 sideways.)
      if (el._kt == null || el._kw !== wk + el.dataset.at) {
        el._kw = wk + el.dataset.at;
        if (d.res) { const q = el.getBoundingClientRect(), wb = stageBox(); el._kt = q.top - wb.top - y; el._kh = q.height; }
        else { el._kh = el.offsetHeight; el._kt = el.dataset.at === 'ahead' && !el.classList.contains('above') ? 18 : -18 - el._kh; }
      }
      if (ko && !el.classList.contains('off')) {
        const r = { l: cx - half, r: cx + half, t: y + el._kt, b: y + el._kt + el._kh };
        if (r.r > ko.l - 8 && r.l < ko.r + 8 && r.b > ko.t - 8 && r.t < ko.b + 8) {
          const dx = r.r - (ko.l - 8), dy = r.b - (ko.t - 8);
          if (r.l - dx >= x0 && Math.abs(x - (cx - dx)) < half - 16) {
            el.style.setProperty('--ax', `${(x - cx + dx).toFixed(1)}px`); el._glass?.(x - cx + dx);
            el.style.transform = `translate(${(cx - dx).toFixed(1)}px, ${y.toFixed(1)}px)`;
            if (el._box) el._box = { ...el._box, x0: el._box.x0 - dx, x1: el._box.x1 - dx };
          } else if (!el._below && r.t - dy >= y0 - 8) { el.style.transform = `translate(${cx.toFixed(1)}px, ${(y - dy).toFixed(1)}px)`; if (el._box) el._box = { ...el._box, y0: el._box.y0 - dy, y1: el._box.y1 - dy }; }
          // (One below its point, as the portal blood's share is, with no room to the left: it turns to stand above its point when
          // that is clear, once (Shunts 2 on a phone held sideways, its foot on the key).)
          else if (el._below && !el._turned && y - 18 - el._kh >= y0) { el._turned = true; el._below = false; el.dataset.at = ''; }
        }
      }
    }
  }
  let kpAt = -1e9, kpBox = null;
  function keyPillBox() {
    const now = performance.now();
    if (now - kpAt < 500) return kpBox;
    kpAt = now; kpBox = null;
    const wb = stageBox();
    for (const q of document.querySelectorAll('.pz:not(.stack) .pz-fk:not([hidden]):not([data-empty]), .pz-bar.pzb-pill, .pz:not(.stack) .pz-scales:not([hidden])')) {
      const r = q.getBoundingClientRect();
      if (!r.width) continue;
      const o = { l: r.left - wb.left, t: r.top - wb.top, r: r.right - wb.left, b: r.bottom - wb.top };
      kpBox = kpBox ? { l: Math.min(kpBox.l, o.l), t: Math.min(kpBox.t, o.t), r: Math.max(kpBox.r, o.r), b: Math.max(kpBox.b, o.b) } : o;
    }
    return kpBox;
  }
  // The FibroScan probe (the Presenter's stiffness slides): a transducer on the skin at the top left of the right
  // lobe, angled 45° down toward the portal vein, with a shear wave easing out from its tip into the liver along that
  // line. Screen-space, at the liver's outline. Each tap (three a second) sends one shear wavefront: a soft arc that spreads and fades as
  // it crosses the liver. The true speed goes with √kPa (about 2.2× from 5 to 25 kPa); on screen it is exaggerated to
  // roughly linear in kPa (5× from 5 to 25) so the difference reads at a glance, easing to a new speed when the reading changes.
  const scan = { on: false, el: null, raf: 0, deg: 45, v: 0, fronts: [], next: 0, nextTap: 0, last: 0, k: null, leaving: false, headAt: 0 };   // k: the stiffness the callout shows, eased
  const SCAN_EDGE = 8, SCAN_TIP = [66, 48], SCAN_SPAN = 150, SCAN_EVERY = 1 / 3, SCAN_N = 12, SCAN_HALF = 0.5, SCAN_GAP = 6;   // three pulses a second, so several fronts are in flight at once
  const scanSpeed = () => 35 * (clamp(F?.metrics?.lsm ?? 5, 4, 40) / 5) ** 1.3;   // px/s, steeper than linear: 35 at 5 kPa (clearly slow), 240 at 25 (7x), 520 from 40
  function scanArc(r) {
    const [cx, cy] = SCAN_TIP, h = SCAN_HALF * (0.75 + 0.25 * Math.min(1, r / 50));   // the front widens a little with depth
    const p = (t) => `${(cx + r * Math.cos(t)).toFixed(1)} ${(cy + r * Math.sin(t)).toFixed(1)}`;
    return `M${p(-h)} A${r.toFixed(1)} ${r.toFixed(1)} 0 0 1 ${p(h)}`;
  }
  // The probe's body and cable lie up and to the left of its tip, turned 45°: where a card covers any of that, the head fades out and the
  // waves stay, so no stub pokes out from under the card. (The box is the head's four corners, 90 px back along the axis, 13 px to either side.)
  function scanHead() {
    const tip = scan.el && scanTipLocal();
    if (!tip) return;
    const wr = wrap.getBoundingClientRect(), a = scan.deg * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a), ax = tip.tx, ay = tip.y;
    const xs = [], ys = [];
    for (const [u, v] of [[-92, -13], [-92, 13], [-2, -13], [-2, 13]]) { xs.push(ax + u * c - v * sn); ys.push(ay + u * sn + v * c); }
    const x0 = Math.min(...xs) + wr.left, x1 = Math.max(...xs) + wr.left, y0 = Math.min(...ys) + wr.top, y1 = Math.max(...ys) + wr.top;
    let hit = false;
    for (const el of document.querySelectorAll('.pz-text.stage-blocker, .pz-data.stage-blocker, .pz-panel.stage-blocker')) {
      if (el.hidden || 'gone' in el.dataset || el.classList.contains('pz-hide') || getComputedStyle(el).opacity < 0.5) continue;
      const r = el.getBoundingClientRect();
      if (r.width && r.left < x1 && r.right > x0 && r.top < y1 && r.bottom > y0) { hit = true; break; }
    }
    scan.el.classList.toggle('head-off', hit);
  }
  function scanTick(now) {
    scan.raf = 0;
    if (!scan.on || !scan.el) return;
    // Under an open lobule the probe is covered: it looks again four times a second instead of every frame (leaving the
    // lobule uncovers it gradually, so it is moving again before it shows).
    if (lz?.isOpen()) { scan.last = 0; clearTimeout(scan.nap); scan.nap = setTimeout(() => { if (scan.on && !scan.raf) scan.raf = nextFrame(scanTick); }, 250); return; }
    // Drawn on every frame the screen offers, like the blood (15 a second in Battery saver).
    if (scan.last && now - scan.last < paceMs()) { scan.raf = nextFrame(scanTick); return; }
    const dt = scan.last && !reduceMotion.matches ? Math.min(0.1, (now - scan.last) / 1000) : 0; scan.last = now;
    const target = scanSpeed();
    scan.v = scan.v ? scan.v + (target - scan.v) * (1 - Math.exp(-dt / 0.6)) : target;   // ease to a new kPa
    const lsm = F?.metrics?.lsm;
    if (Number.isFinite(lsm)) scan.k = scan.k == null || reduceMotion.matches ? lsm : scan.k + (lsm - scan.k) * (1 - Math.exp(-dt / 0.6));   // the callout's number eases too
    scanShow();
    if (!(now < scan.headAt)) { scan.headAt = now + 250; scanHead(); }
    if (now >= scan.next) { scan.fronts.push(0); scan.next = now + SCAN_EVERY * 1000; }
    if (!(now < scan.nextTap)) { scan.nextTap = scan.nextTap && now - scan.nextTap < 250 ? scan.nextTap + 1000 : now + 1000; scan.el.classList.remove('tap'); void scan.el.offsetWidth; scan.el.classList.add('tap'); }   // the probe itself shakes once a second; the waves keep their own rhythm
    const span = clamp(scan.v * 2.5, 70, SCAN_SPAN);   // slow fronts fade sooner, so a healthy liver shows a few calm arcs, not a crowd
    scan.fronts = scan.fronts.map((r) => r + scan.v * dt).filter((r) => r < span);
    const gap = clamp(scan.v * SCAN_EVERY * 0.4, 2, SCAN_GAP);   // the ripples tighten when fronts are close, so neighbours never merge
    // (The packets' elements are looked up once, and an opacity or a path is written only when its text changed: an idle packet
    // stays at 0 without a write each frame. The same values as before, so the same picture.)
    scan.packs ||= wavePacks(scan.el);
    scan.packs.forEach((w, i) => {
      const r = scan.fronts[i];
      if (r == null) { paintWave(w, '0'); return; }
      const u = r / span, fade = Math.sin(Math.PI * Math.min(1, u * 1.15 + 0.04)) ** 1.2 * (1 - u * 0.35);
      // A short packet: the crest, with a faint ripple ahead and behind.
      paintWave(w, fade.toFixed(3), (j) => scanArc(Math.max(1, r + (j - 1) * gap)));
    });
    scan.raf = nextFrame(scanTick);
  }
  // The top left of the right lobe (the patient's right is the figure's left): the tip sits on its edge, aimed 45° down toward the portal vein.
  // Anchored to the liver, not the view: it pans off screen with the liver (and hides once the tip is out of view). Null when no probe shows.
  function scanTipLocal() {
    const lv = organEls.liver;
    if (!scan.on || !lv || morph > 0.5) return null;
    const r = lv.getBoundingClientRect(), wr = wrap.getBoundingClientRect();
    return { tx: r.left - wr.left + r.width * 0.13, y: r.top - wr.top + r.height * 0.09 };
  }
  // The probe's reading is the FibroScan card's own number (fibroscan.js writes it in its frame, with its rounding) while a card
  // is on screen; without one it falls back to the model's eased value.
  function scanShow(cardTxt) {
    if (!scan.el) return;
    // (Whether a card is on screen is asked only when its number is not given: the card's own frame gives it, and asking laid the page out.)
    const card = fibroReading.cv, live = () => card?.isConnected && card.offsetParent !== null && fibroReading.txt != null;
    const k = scan.k, txt = cardTxt ?? (live() ? fibroReading.txt : k == null ? '--' : k.toFixed(1));
    const sv = scan.el.querySelector('.sp-val');
    putText(sv, txt);
  }
  fibroReading.show = scanShow;
  // (Its body's far corners sit 76 px back from the tip along the probe and 13.8 px either side of it, the stroke included,
  // so the corners bound the rounded body: near the screen's top edge, a phone on its side, the probe lies flatter, down to 10°, so the whole
  // body stays 4 px or more below the top edge; the left edge wins where both press.)
  // The probe's body (its four corners, 92 px back along it and 13 px either side of the tip's line) turned to deg, stage-local.
  function scanBody(tx, y, deg) {
    const a = deg * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a), xs = [], ys = [];
    for (const [u, v] of [[-92, -13], [-92, 13], [-2, -13], [-2, 13]]) { xs.push(tx + u * c - v * sn); ys.push(y + u * sn + v * c); }
    return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  }
  // The slide's cards the probe keeps clear of, one margin out (read at most four times a second).
  let scCards = [], scCardsAt = -1e9;
  function scanCards() {
    const now = performance.now();
    if (now - scCardsAt < 250) return scCards;
    scCardsAt = now;
    if (!store.get().presenting) return (scCards = []);
    const wr = wrap.getBoundingClientRect(), m = pillEdge ? pillEdge.m : 8;
    scCards = [...document.querySelectorAll('.pz-shade, .pz-data.stage-blocker, .pz-panel.stage-blocker')].map((el) => {
      if (el.hidden || 'gone' in el.dataset || el.classList.contains('pz-hide') || el.classList.contains('pz-leave') || +getComputedStyle(el).opacity < 0.5) return null;
      const q = el.getBoundingClientRect();
      return q.width ? { x0: q.left - wr.left - m, y0: q.top - wr.top - m, x1: q.right - wr.left + m, y1: q.bottom - wr.top + m } : null;
    }).filter(Boolean);
    return scCards;
  }
  function scanTurn(tx, y = Infinity) {
    const r = (d) => d * Math.PI / 180, left = (d) => tx - 92 * Math.cos(r(d)) - 13 * Math.sin(r(d)) >= SCAN_EDGE, top = (d) => y - 76 * Math.sin(r(d)) - 13.8 * Math.cos(r(d)) >= 4;
    const bodyLeft = (d) => tx - 76 * Math.cos(r(d)) - 13.8 * Math.sin(r(d)) >= 4;   // (only the body must stay on screen; the cable is a short stub)
    let deg = 45;
    while (deg < 80 && !left(deg)) deg += 5;
    if (left(deg)) while (deg > 10 && !top(deg) && bodyLeft(deg - 5)) deg -= 5;
    // (Where a slide's card (its glass, the deck tab included) comes within one margin of the probe's body, the probe turns, nearest
    // first, to an angle that keeps its body and reading clear of every card and on screen; with none, it stays and its head fades
    // under the card (scanHead): 17 Oct design review, the probe lay on the teaching card's tab.)
    const cards = scanCards(), clear = (d) => !cards.length || !cards.some((b) => { const q = scanBody(tx, y, d); return b.x0 < q.x1 && b.x1 > q.x0 && b.y0 < q.y1 && b.y1 > q.y0; });
    if (!clear(deg)) {
      const alt = [];
      for (let d = 10; d <= 80; d += 5) if (d !== deg && bodyLeft(d) && y - 76 * Math.sin(r(d)) - 13.8 * Math.cos(r(d)) >= 4 && clear(d)) alt.push(d);
      if (alt.length) deg = alt.sort((a, b) => Math.abs(a - deg) - Math.abs(b - deg) || b - a)[0];
    }
    if (deg !== scan.deg) { scan.deg = deg; scan.el.style.setProperty('--sp-turn', `${deg}deg`); }
    // (The cable stays a short stub behind the body at every angle: laid flatter it used to run on to the screen's edge, a long
    // straight wire across the stage and under the cards, 18 Oct.)
  }
  function scanPaint() {
    if (!scan.el) {
      const el = document.createElement('div');
      el.className = 'scan-probe cath-pre'; el.setAttribute('aria-hidden', 'true');
      el.innerHTML = '<svg viewBox="0 0 220 96"><defs><radialGradient id="sp-beam" cx="66" cy="48" r="150" gradientUnits="userSpaceOnUse">'
        + '<stop offset="0" stop-color="var(--scan)" stop-opacity=".22"/><stop offset="1" stop-color="var(--scan)" stop-opacity="0"/></radialGradient></defs>'
        + '<path class="sp-beam" d="M66 48 L197.6 -23.9 A150 150 0 0 1 197.6 119.9 Z"/><g class="sp-waves">'
        + '<g><path class="sp-rip"/><path class="sp-front"/><path class="sp-rip"/></g>'.repeat(SCAN_N) + '</g>'
        + '<path class="sp-cable" d="M-26 48 C-18 48 -14 48 -8 48"/><g class="sp-head"><rect class="sp-body" x="-10" y="35" width="68" height="26" rx="11"/>'
        + '<rect class="sp-tip" x="54" y="39" width="10" height="18" rx="3"/><rect class="sp-screen" x="-3" y="39.5" width="54" height="17" rx="4"/>'
        + '<text class="sp-read" x="24" y="52.3" text-anchor="middle"><tspan class="sp-val">5.0</tspan><tspan class="sp-unit" dx="2">kPa</tspan></text></g></svg>';   // (constant markup; the screen on the body shows the live stiffness)
      sites.el.append(el); scan.el = el; scan.deg = 45;
      const t0 = scanTipLocal(); if (t0) scanTurn(t0.tx, t0.y);   // (turned before it first shows, so it fades in at its angle rather than swinging to it)
      void el.offsetWidth; el.classList.remove('cath-pre');
      if (reduceMotion.matches) { scan.fronts = [40, 90]; scan.v = 0; scan.next = scan.nextTap = Infinity; }
      if (!scan.raf) { scan.last = 0; scan.raf = nextFrame(scanTick); }
    }
    const tip = scanTipLocal(), wr = wrap.getBoundingClientRect();
    if (!tip) { scan.el.classList.add('off'); return; }
    const { tx, y } = tip, x = tx - SCAN_TIP[0];
    // Turned 45° down-right, the probe's body and its kPa screen reach 75 px left of the tip; where the liver sits near the
    // screen's left edge (a phone), the probe stands steeper, up to 80°, so its reading stays whole on screen.
    scanTurn(tx, y);
    scan.el.classList.toggle('off', tx < -30 || tx > wr.width + 30 || y < -30 || y > wr.height + 30);
    scan.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  }
  function setScanProbe(on) {
    if (scan.on === !!on) return;
    scan.on = !!on;
    if (on) { scan.leaving = false; refreshCTM(); scanPaint(); return; }
    // The callout and its leader fade out with the probe, then go.
    scan.leaving = true; scan.k = null;
    pool.get('scan')?.g.classList.add('lb-off'); gScan.classList.add('off');
    setTimeout(() => { if (scan.on) return; scan.leaving = false; const b = pool.get('scan'); if (b) b.g.style.display = 'none'; }, 700);
    const el = scan.el; scan.el = null; scan.packs = null; scan.fronts = []; scan.v = 0; scan.next = 0; scan.nextTap = 0;
    if (scan.raf) { cancelFrame(scan.raf); scan.raf = 0; }
    if (el) { el.classList.add('cath-pre'); setTimeout(() => { el._glass?.dispose(); el.remove(); }, 500); }
  }
  // ── The Doppler probe (dop-probe.js) ──
  // While the Doppler reads a vessel, a small probe stands off it, its line of sight runs straight through the vessel, and the sample
  // volume's two bars and the flow axis mark the vessel's middle (where its callout points), or a stent's sampled third. It
  // follows the camera with the labels; it fades out while the views morph and in the liver's own views. A new vessel or third, or
  // a card making it change sides, fades it out where it stood and back in at its new place (nothing jumps).
  let dprCardsList = [], dprCardsAt = -1e9, lbRects = [], colShown = false, colWaitAt = 0;   // colShown: a stent's three point callouts stand (the probe keeps off them, so it waits for them)
  // The cards and bars it keeps off: the slide's cards, and the docked instruments and bars. Read at most four times a second, and
  // only while one may have moved (layoutWatch), as the labels' blockers are: each read forces a layout among the model's frames.
  const dprStale = () => { dprCardsAt = -1e9; };
  addEventListener('pps:occ', dprStale);
  addEventListener('resize', dprStale);
  function dprCards() {
    const now = performance.now();
    if (dprCardsAt > 0 && !(now - dprCardsAt > 250 && watch.due())) return dprCardsList;
    dprCardsAt = now;
    const wr = wrap.getBoundingClientRect();
    dprCardsList = [...scanCards(), ...[...document.querySelectorAll('[data-safe], .stage-blocker:not([hidden])')].map((el) => {
      // (A card hidden by visibility is not there, as the framing reads it (unseenCard): the closed Details sheet stays in place on
      // a phone, invisible, as tall as it was last opened, and kept the probe off the whole figure in Tests › Doppler, 20 Oct.)
      if (el.hidden || el.closest('[hidden]') || el.classList.contains('card-leaving') || el.classList.contains('vd-out') || unseenCard(el)) return null;
      const q = el.getBoundingClientRect();
      return q.width && q.height ? { x0: q.left - wr.left - 6, y0: q.top - wr.top - 6, x1: q.right - wr.left + 6, y1: q.bottom - wr.top + 6 } : null;
    }).filter(Boolean)];
    return dprCardsList;
  }
  // The labels and callouts showing (stage px), which the probe and its line of sight keep off where a side allows.
  function dprAvoid() {
    const out = [...lbRects];
    for (const el of sites.made.values()) if (el._box && !el.classList.contains('cath-pre')) out.push(el._box);
    if (cath.made && !cath.labels.hidden) for (const el of cath.made.values()) if (el._box) out.push(el._box);
    // (A narrowing's "60 %" too: the probe stands on the side whose line of sight and flow axis keep off it: Mohammad, 20 Oct.)
    for (const el of ov.clamps.querySelectorAll('.clamp-label')) if (el._box) out.push(el._box);
    return out;
  }
  // The organs' outlines (world units, every 4 or so along them), kept until an organ's shape or transform changes (olKey).
  const dprOrgPts = new Map();
  function dprOrgans() {
    const out = [];
    if (organMorphA < 0.5) return out;   // (faded out with the morph to the circuit)
    for (const o of ORGANS) {
      if (o.deco || o.circle || !organEls[o.id]?.getAttribute('d')) continue;
      const k = olKey(o.id), now = performance.now();
      let c = dprOrgPts.get(o.id);
      // (While a shape eases (the liver to cirrhosis) its key changes every frame: the outline is read again (getPointAtLength along
      // it, the costliest step of a Doppler slide's frame) at most every 300 ms, a few px stale through an ease, for a count that
      // only weighs how busy a place is.)
      if (!c || (c.k !== k && now - c.at > 300)) { c = { k, at: now, pts: olRings(o.id).flatMap((ring) => ring.filter((_, i) => i % 2 === 0)) }; dprOrgPts.set(o.id, c); }
      out.push(c.pts);
    }
    return out;
  }
  // Points along the vessels drawn (stage px, with their radius), near the gate: the probe stands where the figure is quieter. The
  // organs' outlines count too, at half a vessel's weight (Mohammad, 20 Oct: "less busy, where not a lot of drawings").
  function dprBusy(g, id) {
    const out = [], sc = CTM?.sc || 1, R = PROBE.GAP + PROBE.LEN + 140;   // (out to the farthest place, dop-probe.js FAR)
    for (const pts of dprOrgans()) {
      let last = null;
      for (const [wx, wy] of pts) {
        const p = worldToLocal(wx, wy);
        if (Math.abs(p[0] - g[0]) >= R || Math.abs(p[1] - g[1]) >= R || (last && Math.hypot(p[0] - last[0], p[1] - last[1]) < 6)) continue;
        out.push([p[0], p[1], 1, 0.5]); last = p;
      }
    }
    for (const x of EV) {
      if (!x.vis || x.g.classList.contains('coll-ghost') || x.e.id === id) continue;
      const pts = geo[x.e.id]?.cur, q = cathRadOf(x.e.id, 0.5) * sc;
      if (!(pts?.length > 1)) continue;
      let prev = worldToLocal(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) {
        const p = worldToLocal(pts[i][0], pts[i][1]), n = Math.max(1, Math.ceil(Math.hypot(p[0] - prev[0], p[1] - prev[1]) / 6));
        for (let j = 0; j < n; j++) {
          const px = prev[0] + ((p[0] - prev[0]) * j) / n, py = prev[1] + ((p[1] - prev[1]) * j) / n;
          if (Math.abs(px - g[0]) < R + q && Math.abs(py - g[1]) < R + q) out.push([px, py, q]);
        }
        prev = p;
      }
    }
    return out;
  }
  // (In a deck it waits for the slide's zoom to settle: it fades out as a camera move starts and back in once it lands (camSettle
  // lays the labels out, which paints it): Mohammad, 20 Oct.)
  function dprHold() {
    clearTimeout(dpr.hold); dpr.hold = setTimeout(dprLet, 1500);   // (no framing came: it shows anyway)
  }
  function dprLet() {
    if (!dpr.hold) return;
    clearTimeout(dpr.hold); dpr.hold = 0; dprobePaint();
  }
  // No Doppler screen in sight, no probe (Mohammad, 20 Oct: "no doppler screen = no probe"): a monitor whose card is hidden,
  // folded, leaving, off screen or covered (the case card over it) leaves the probe hidden. Checked a few times a second while a
  // vessel is chosen, since those changes come from the cards, not the figure.
  // (Only while a card or bar may have moved, shown, hidden or covered another (layoutWatch, as dprCards): otherwise the last
  // look's answer still holds and no layout is read. Review item 28.)
  let dprMonLast = false;
  const dprQuiet = () => dpr.monAt > 0 && !watch.due();
  function dprMonitorOn() {
    const now = performance.now();
    if (now - dpr.monAt < 200) return dpr.mon;   // (asked on every model frame: the answer of the last 200 ms, the pace it is watched at anyway)
    if (dprQuiet()) return dprMonLast;
    dpr.monAt = now;
    dprMonLast = dprMonitorLook();
    return dprMonLast;
  }
  function dprMonitorLook() {
    const W = innerWidth, H = innerHeight;
    for (const cv of document.querySelectorAll('canvas[aria-label^="Spectral Doppler"]')) {
      if (cv.closest('[hidden], .card-leaving, .vd-out, [data-folding]')) continue;
      if (cv.checkVisibility && !cv.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
      const q = cv.getBoundingClientRect();
      if (q.width < 20 || q.height < 20 || q.right <= 0 || q.bottom <= 0 || q.left >= W || q.top >= H) continue;
      const x = Math.min(W - 1, Math.max(0, (q.left + q.right) / 2)), y = Math.min(H - 1, Math.max(0, (q.top + q.bottom) / 2));
      const hit = document.elementFromPoint(x, y), mon = cv.parentElement;
      if (hit && (hit === cv || mon?.contains(hit) || hit.contains(cv))) return true;
    }
    return false;
  }
  setInterval(() => {
    if (!dpr.ready || !dop.id) return;
    let on = dprMonLast;
    if (!dprQuiet()) { dpr.monAt = 0; on = dprMonitorOn(); }
    if (on !== dpr.mon || (on && !dpr.on && !dpr.swap)) { dpr.mon = on; dprobePaint(); }
  }, 200);
  // What the probe remembers between frames: the places it has left on this layout, and how long a fresh place has held still
  // (dop-probe.js createProbeMind: the cure for the probe flashing on and off, Right heart 6 on an iPhone, 21 Oct).
  const dprMind = createProbeMind();
  const dprHide = () => { if (dpr.on) { dpr.on = false; dpr.el.classList.add('off'); } dpr.box = null; dpr.marks = []; dpr.key = ''; dpr.gate = null; dprDots(); };
  function dprobePaint() {
    if (!dpr.ready) return;
    const st = store.get(), id = dop.id, pts = id && geo[id]?.cur;
    // (On a stent called out at its three points, the probe waits for the column: it keeps off the callouts, which never move for it,
    // so it must know where they stand before it picks its side: Mohammad, 22 Oct, the mid callout hopped to the far side on a pick.
    // Where they never show, it waits four seconds and stands anyway.)
    if (!dop.all || colShown) colWaitAt = 0; else colWaitAt ||= performance.now();
    const waitCol = !dpr.on && !dpr.swap && dop.all && !colShown && performance.now() - colWaitAt < 4000;
    const show = !!(pts?.length > 1 && E[id]?.vis && (morph < 0.01 || morph > 0.99) && !camMove && !dpr.hold && dprMonitorOn() && !st.lobule && !st.sinusoid && !lz?.isOpen() && !waitCol);
    if (!show) {
      dprMind.hide();
      dprHide();
      return;
    }
    if (!dpr.el) {
      const el = document.createElement('div');
      el.className = 'dop-probe off'; el.setAttribute('aria-hidden', 'true'); el.innerHTML = PROBE_SVG;
      // (Beneath the figure's labels and the callouts, above the figure: where no side is clear of them, they read over its marks.)
      labelSvg.before(el); dpr.el = el; void el.offsetWidth;
    }
    if (dpr.swap) return;   // (fading out to move: it comes back at its new place)
    const key = `${id}|${dop.seg}`, u = dop.seg ? STENT_SITES[dop.seg] : null;
    const [wx, wy, tx, ty] = u == null ? arcMid(pts) : pointAt(pts, u);
    const [gx, gy] = worldToLocal(wx, wy), [ax, ay] = worldToLocal(wx + tx, wy + ty);
    const r = cathRadOf(id, u ?? 0.5) * (CTM?.sc || 1), cards = dprCards();
    // (What its place is worked out for: the vessel, the camera, the stage, the gate and the cards, a little coarsely. While it holds,
    // the places the probe has left stay left; a change forgets them.)
    const syncKey = [key, CTM ? `${CTM.a.toFixed(2)},${CTM.b.toFixed(2)},${Math.round(CTM.e / 12)},${Math.round(CTM.f / 12)}` : '', Math.round(wrapRect.width / 8), Math.round(wrapRect.height / 8), Math.round(gx / 12), Math.round(gy / 12),
      cards.map((c) => [c.x0, c.y0, c.x1, c.y1].map((v) => Math.round(v / 16)).join()).join(';')].join('|');
    // (Asked on every model frame, the search below (every place's busyness over the vessels' and organs' points, the labels' boxes)
    // runs at most every 150 ms while its inputs hold; a change of vessel, camera, gate or cards runs it at once. The probe's place is
    // decided with 0.2 s of stillness and eases over 0.3 s, so nothing it does is timed finer than that.)
    const tNow = performance.now();
    if (syncKey === dpr.syncKey && dpr.on && tNow - dpr.searchAt < dpr.searchGap) return;
    if (syncKey !== dpr.syncKey) dpr.searchGap = 150;   // (a new layout: searched at once, and again soon; a place that holds is searched less often, up to 600 ms)
    dpr.syncKey = syncKey; dpr.searchAt = tNow;
    dprMind.sync(syncKey);
    // (Its place keeps its fit through a few px of give, unless only its marks fit: back to the head's fade, it needs the whole room.)
    const pose = fitPose({ g: [gx, gy], t: [ax - gx, ay - gy], r, away: awayFromProbe(id), w: wrapRect.width, h: wrapRect.height, cards, keep: key === dpr.key ? dpr.side : 0, keepReach: dpr.reach, keepRev: dpr.rev, keepK: dpr.k, sc: CTM?.sc || 1, avoid: dprAvoid(), busy: dprBusy([gx, gy], id),
      ban: dprMind.banned(), lock: dprMind.locked(), slack: dpr.headOff ? 0 : SLACK });
    // A new vessel or third: it fades out where it stood and in at the new place.
    if (dpr.on && key !== dpr.key) {
      dpr.on = false; dpr.box = null; dpr.marks = []; dpr.el.classList.add('off'); dprDots(); dprMind.hide();
      dpr.swap = setTimeout(() => { dpr.swap = 0; dpr.key = ''; dprobePaint(); }, reduceMotion.matches ? 0 : 380);
      return;
    }
    // A new place on the same vessel: the probe swings round the gate to it, its distance and size easing with it (Mohammad,
    // 20 Oct: "I'm okay with the probe rotating in real time as I move around"); the flow axis stays along the flow. Shown afresh,
    // it starts at its place. (dprShape draws it, a frame at a time.)
    const tgt = { ang: pose.ang, d: pose.D - Math.max(0, r), k: pose.k, ax: pose.ang + pose.phi, r };
    // (Shown afresh, it waits till its place holds still for 0.2 s, the late cards and labels landed, then fades in already there
    // and turned to it, so it never arrives and then swings into place (Mohammad, 20 Oct). A place far round the gate or far nearer:
    // it fades out and in there rather than flying across. No place: it holds a moment before it fades. dprMind decides.)
    const sig = `${key}|${pose.side}|${pose.reach}|${+pose.rev}|${pose.k}|${Math.round(pose.ang / 5)}|${Math.round(gx / 4)},${Math.round(gy / 4)}`;
    dpr.searchGap = sig === dpr.lastSig ? Math.min(600, dpr.searchGap * 2) : 150; dpr.lastSig = sig;
    const act = dprMind.act({ pose, tgt, on: dpr.on, cur: dpr.cur, sig, now: performance.now(), instant: reduceMotion.matches });
    if (act !== 'hold' && dpr.noneT) { clearTimeout(dpr.noneT); dpr.noneT = 0; }
    // (No place on the slide's free space at any side or distance, for good: it fades out, and fades in once one opens.)
    if (act === 'hide') { dprHide(); return; }
    if (act === 'hold') { dpr.noneT ||= setTimeout(() => { dpr.noneT = 0; dprobePaint(); }, NONE_MS + 30); return; }
    if (act === 'restart') { dprStale(); return; }
    if (act === 'wait') return;
    if (act === 'jump') {
      dpr.on = false; dpr.box = null; dpr.marks = []; dpr.el.classList.add('off'); dprDots();
      dpr.swap = setTimeout(() => { dpr.swap = 0; dpr.key = ''; dprobePaint(); }, reduceMotion.matches ? 0 : 380);
      return;
    }
    if (!dpr.on || !dpr.cur || reduceMotion.matches) dpr.cur = { ang: tgt.ang, d: tgt.d, k: tgt.k };
    else dpr.cur.ang = tgt.ang + angTo(tgt.ang, dpr.cur.ang);   // (the short way round)
    dpr.k = pose.k; dpr.tgt = tgt;
    dprShape();
    const at = `translate(${gx.toFixed(1)}px, ${gy.toFixed(1)}px)`;
    if (at !== dpr.at) { dpr.at = at; dpr.el.style.transform = at; }
    dpr.key = key; dpr.side = pose.side; dpr.reach = pose.reach; dpr.rev = pose.rev; dpr.box = pose.box; dpr.marks = [...beamBoxes([gx, gy], pose.ang, pose.D, r), ...gateBoxes([gx, gy], pose.ang, pose.phi, r)];
    // (Only its marks fit clear of the cards: the head fades, as the FibroScan probe's does under a card (scanHead).)
    dpr.headOff = !!pose.headOff;
    dpr.el.classList.toggle('head-off', dpr.headOff);
    dpr.gate = [gx, gy];
    if (!dpr.on) { dpr.on = true; dpr.el.classList.remove('off'); }
    dprDots();
  }
  // The probe as drawn (dpr.cur: its direction from the gate, its face's distance from the wall and its size), easing to where it
  // stands (dpr.tgt) in about 0.3 s, one frame at a time; the line of sight always square to its face, the flow axis along the flow.
  const angTo = (a, b) => ((((b - a) % 360) + 540) % 360) - 180;   // b − a, in −180 … 180
  function dprShape() {
    const c = dpr.cur, t = dpr.tgt, rr = Math.max(0, t.r), D = rr + c.d;
    const sh = `${D.toFixed(1)}|${Math.round(t.r * 2)}|${c.ang.toFixed(2)}|${t.ax.toFixed(2)}|${c.k.toFixed(3)}`;
    if (sh !== dpr.shapes) {
      dpr.shapes = sh;
      const p = probeShapes(D, t.r, angTo(c.ang, t.ax), c.k), all = (q, k, v) => { for (const e of dpr.el.querySelectorAll(q)) e.setAttribute(k, v); };
      all('.dpr-wedge', 'd', p.wedge); all('.dpr-beam', 'd', p.beam); all('.dpr-axis', 'd', p.axis); all('.dpr-bars', 'd', p.gate); all('.dpr-head', 'transform', p.head);
      dpr.el.querySelector('.dpr-rot').setAttribute('transform', `rotate(${c.ang.toFixed(2)})`);
    }
    const done = c.ang === t.ang && c.d === t.d && c.k === t.k;
    if (done) { dpr.eAt = 0; return; }
    if (dpr.eRaf) return;
    const step = (now) => {
      dpr.eRaf = 0;
      if (!dpr.on || !dpr.tgt || dpr.swap) { if (dpr.tgt) dpr.cur = { ang: dpr.tgt.ang, d: dpr.tgt.d, k: dpr.tgt.k }; dpr.eAt = 0; return; }
      const dt = dpr.eAt ? Math.min(0.1, (now - dpr.eAt) / 1000) : 0, f = 1 - Math.exp(-dt / 0.1), q = dpr.cur, g = dpr.tgt; dpr.eAt = now;
      q.ang += (g.ang - q.ang) * f; q.d += (g.d - q.d) * f; q.k += (g.k - q.k) * f;
      if (Math.abs(g.ang - q.ang) < 0.3) q.ang = g.ang;
      if (Math.abs(g.d - q.d) < 0.3) q.d = g.d;
      if (Math.abs(g.k - q.k) < 0.004) q.k = g.k;
      dprShape();   // (and the next frame, while it is still easing)
    };
    dpr.eRaf = nextFrame(step);
  }
  // The station dot under the gate (where the reading's leader starts) fades out while the probe shows on that vessel, and back as it
  // goes: the reading and its leader stay. Every dot within 6 px of the gate, at the same 0.36 s as the probe (.dpr-hid, styles/app.css).
  // Called as the probe's state changes and as the leaders are painted (paintLeaders), so a dot that comes in under the probe never shows.
  function dprDots() {
    const g = (dpr.on || dpr.swap) && dpr.gate;   // (a probe changing sides keeps the dot away: it fades out and in again with the probe)
    for (const [k, el] of leadEls) {
      if (!/^(d|h):/.test(k)) continue;
      const a = el._a, hide = !!g && !el._gone && Math.hypot(+a.cx - g[0], +a.cy - g[1]) < 6;
      if (hide !== !!el._dprHid) { el._dprHid = hide; el.classList.toggle('dpr-hid', hide); }
    }
  }
  const CATH_IDS = ['SVC_RA', 'IVCS_RA', 'RHV_IVC', 'POST_R_RHV'];   // (and down the IVC_IS to the hepatic vein)
  const lenTo = (pts) => { const c = [0]; for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); return c; };
  /** The part of a polyline from length a to length b (cumulative lengths in cum). */
  function cutLen(pts, cum, a, b) {
    const out = [];
    for (let i = 1; i < pts.length; i++) {
      const s0 = cum[i - 1], s1 = cum[i];
      if (s1 < a || s0 > b) continue;
      const at = (d) => { const u = s1 > s0 ? (d - s0) / (s1 - s0) : 0; return [lerp(pts[i - 1][0], pts[i][0], u), lerp(pts[i - 1][1], pts[i][1], u)]; };
      if (!out.length) out.push(at(Math.max(a, s0)));
      out.push(s1 <= b ? pts[i] : at(b));
    }
    return out;
  }
  // The route, with the lengths where its parts start: neck, SVC, IVC, right hepatic vein, the branch,
  // and the lumen's radius at each point (as the GPU draws it), so the balloon and the still column fill
  // the vein exactly. The course is held for the procedure; the radii follow the vessels' drawn caliber
  // live (it eases with the pressure), see cathLive.
  const cathRadOf = (id, f) => {
    const R = E[id].glR;
    if (!R?.length) return Math.max(0.5, E[id].width / 2);
    const x = clamp(f, 0, 1) * (R.length - 1), i = Math.min(R.length - 2, Math.floor(x));
    return lerp(R[i], R[i + 1], x - i);
  };
  // The vessels' courses meet at corners (the IVC turns into the hepatic vein at its side): the
  // catheter bends through them as a wire does. Resampled evenly, then smoothed with a window as wide
  // as the vein there, so the curve stays inside the lumen. (marks: where each part starts, as indices into pts.)
  function smoothRoute(pts, rad, marks) {
    const c0 = lenTo(pts), H = 1.2, n = Math.max(2, Math.ceil(c0[c0.length - 1] / H) + 1);
    let P = [], j = 1;
    const Rr = [], map = [];   // (map: each resampled point's two source points and the mix between them)
    for (let i = 0; i < n; i++) {
      const d = (c0[c0.length - 1] * i) / (n - 1);
      while (j < c0.length - 1 && c0[j] < d) j++;
      const u = c0[j] > c0[j - 1] ? clamp((d - c0[j - 1]) / (c0[j] - c0[j - 1]), 0, 1) : 0;
      P.push([lerp(pts[j - 1][0], pts[j][0], u), lerp(pts[j - 1][1], pts[j][1], u)]); Rr.push(lerp(rad[j - 1], rad[j], u)); map.push(j, u);
    }
    const idx = marks.map((m) => Math.round((c0[Math.min(m, c0.length - 1)] / c0[c0.length - 1]) * (n - 1)));
    const raw = P;   // the vessels' own centrelines, where the walls are (the balloon is fitted between them)
    for (let pass = 0; pass < 2; pass++) {
      const Q = P.map((q) => q.slice());
      for (let i = 1; i < n - 1; i++) {
        const sg = clamp(Rr[i] * 0.55, 1, 8) / H, w = Math.min(Math.ceil(sg * 2), i, n - 1 - i);
        let sx = 0, sy = 0, sw = 0;
        for (let k = -w; k <= w; k++) { const g = Math.exp(-(k * k) / (2 * sg * sg)); sx += P[i + k][0] * g; sy += P[i + k][1] * g; sw += g; }
        Q[i] = [sx / sw, sy / sw];
      }
      P = Q;
    }
    return { P, raw, Rr, map, idx };
  }
  function cathRoute() {
    const kind = cath.st?.route || cath.kind || 'hvpg';
    if (kind !== 'hvpg') return procRoute(kind);
    if (morph > 0.01 || CATH_IDS.some((id) => !geo[id]?.cur?.length || !E[id])) return null;
    if (cath.route?.kind === 'hvpg') return cath.route;
    const radOf = cathRadOf;
    const svc = geo.SVC_RA.cur, top = svc[0], pts = [], rad = [], src = [], marks = [];
    const at = (id, f) => { src.push([id, f]); return radOf(id, f); };
    const add = (id, rev) => {
      const P = rev ? geo[id].cur.slice().reverse() : geo[id].cur, c = lenTo(P), n = c[c.length - 1] || 1;
      marks.push(pts.length);
      for (let i = 1; i < P.length; i++) { pts.push(P[i]); rad.push(at(id, rev ? 1 - c[i] / n : c[i] / n)); }
    };
    marks.push(0);
    for (const q of [[top[0] - 6, top[1] - 150], [top[0] - 2, top[1] - 60], top]) { pts.push(q); rad.push(at('SVC_RA', 0)); }
    add('SVC_RA', false); add('IVCS_RA', true);
    // On down the middle of the IVC to the level where the right hepatic vein opens into it.
    const ost = geo.RHV_IVC.cur[geo.RHV_IVC.cur.length - 1];
    if (geo.IVC_IS?.cur?.length && E.IVC_IS) {
      const P = geo.IVC_IS.cur.slice().reverse(), c = lenTo(P), n = c[c.length - 1] || 1;
      for (let i = 1; i < P.length && P[i][1] < ost[1] - 4; i++) { pts.push(P[i]); rad.push(at('IVC_IS', 1 - c[i] / n)); }
    }
    add('RHV_IVC', true); add('POST_R_RHV', true);
    const { P, raw, Rr, map, idx } = smoothRoute(pts, rad, marks);
    const cum = lenTo(P), L = (i) => cum[Math.min(idx[i], cum.length - 1)];
    // The tip reads in the trunk of the right hepatic vein, about two thirds of the way out from the IVC.
    const hv0 = L(3), hv1 = L(4);
    const r = { kind: 'hvpg', pts: P, raw, rad: Rr.slice(), src, map, refs: null, cum, total: cum[cum.length - 1], start: L(1) * 0.55, free: hv0 + (hv1 - hv0) * 0.62, hv0, hvEnd: hv1 };
    if (E.RHV_IVC.glR?.length) cath.route = r;
    return r;
  }
  // The treatment catheters (proc-anim.js plays them, from Tests › HVPG or a slide's procedure), each on the real vessels as
  // the HVPG catheter is: TIPS in from the neck to the right hepatic vein, a needle across the liver along the TIPS tract into
  // the right portal vein and on into the trunk; BRTO up from the femoral vein, the IVC and the left renal vein into the
  // gastrorenal shunt; BATO through the liver into the right portal vein, along the portal and splenic veins into the short
  // gastric feeder of the fundal varices. build lays the legs in the order the catheter travels (see procRoute); tip: where
  // the tip stops (a leg's name and how far along it); focus: the legs the close-up frames; start: how far along the lead-in
  // the tip sits before it moves.
  const PROC_ROUTES = {
    tips: { ids: ['SVC_RA', 'IVCS_RA', 'IVC_IS', 'RHV_IVC', 'TIPS', 'PVH_R', 'PV_TRUNK'], start: 0.55, tip: ['trunk', 0.45], focus: ['hv', 'trunk'],
      build(B) {
        const top = geo.SVC_RA.cur[0], ost = geo.RHV_IVC.cur[geo.RHV_IVC.cur.length - 1];
        B.pts([[top[0] - 6, top[1] - 150], [top[0] - 2, top[1] - 60], top], 'SVC_RA', 0);
        B.vessel('SVC_RA'); B.vessel('IVCS_RA', { rev: true });
        B.vessel('IVC_IS', { rev: true, until: (q) => q[1] >= ost[1] - 4 });
        // Out along the right hepatic vein to where the tract leaves it, then the needle's path through the liver (the tract,
        // as wide as the stent will be) into the right portal vein, and the wire on into the portal trunk.
        B.vessel('RHV_IVC', { rev: true, near: geo.TIPS.cur[geo.TIPS.cur.length - 1], name: 'hv' });
        B.vessel('TIPS', { rev: true, name: 'tract', r: cathRadOf('PVH_R', 0.5) * 0.8 });
        B.vessel('PVH_R', { rev: true }); B.vessel('PV_TRUNK', { rev: true, b: 0.6, name: 'trunk' });
      } },
    brto: { ids: ['ILI_IVC', 'IVC_IS', 'LRV_IVC', 'C5'], start: 0.55, tip: ['shunt', 0.3], focus: ['lrv', 'shunt'],
      build(B) {
        const bot = geo.ILI_IVC.cur[0], lrv = geo.LRV_IVC.cur[geo.LRV_IVC.cur.length - 1];
        B.pts([[bot[0] + 4, bot[1] + 150], [bot[0] + 1, bot[1] + 60], bot], 'ILI_IVC', 0);
        B.vessel('ILI_IVC'); B.vessel('IVC_IS', { until: (q) => q[1] <= lrv[1] + 4 });
        B.vessel('LRV_IVC', { rev: true, name: 'lrv' }); B.vessel('C5', { rev: true, name: 'shunt' });
      } },
    bato: { ids: ['PVH_R', 'PV_TRUNK', 'SV_CONF', 'C2'], start: 0.1, tip: ['feeder', 0.35], focus: ['splenic', 'feeder'],
      build(B) {
        const rpv = geo.PVH_R.cur[geo.PVH_R.cur.length - 1];
        B.pts([[rpv[0] - 215, rpv[1] + 34], [rpv[0] - 120, rpv[1] + 16], rpv], 'PVH_R', 1);
        B.vessel('PVH_R', { rev: true }); B.vessel('PV_TRUNK', { rev: true });
        B.vessel('SV_CONF', { rev: true, name: 'splenic' }); B.vessel('C2', { name: 'feeder' });
      } },
  };
  // A leg's lumen radius: a vessel's drawn caliber there, or a fixed one ('=r', a tract through the liver).
  const procRadOf = (id, f) => (id[0] === '=' ? +id.slice(1) : cathRadOf(id, f));
  function procRoute(kind) {
    const spec = PROC_ROUTES[kind];
    if (!spec || morph > 0.01 || spec.ids.some((id) => !geo[id]?.cur?.length || !E[id])) return null;
    if (cath.route?.kind === kind) return cath.route;
    const pts = [], rad = [], src = [], marks = [], parts = [];
    const at = (id, f) => { src.push([id, f]); return procRadOf(id, f); };
    const B = {
      // Loose points (a lead-in from outside the plate), with the lumen radius of vessel id at f; the last one is where the next leg starts.
      pts(list, id, f) { marks.push(pts.length); parts.push({ id: null, name: 'lead' }); for (const q of list) { pts.push(q); rad.push(at(id, f)); } },
      // A vessel, whole or in part, the way the catheter travels it (rev: against its drawn course): from a to b of the
      // way, or until a point meets until(q), or to the point nearest `near`. r: a fixed lumen radius instead of its caliber.
      vessel(id, { rev = false, a = 0, b = 1, until = null, near = null, name = id, r = 0 } = {}) {
        const P0 = rev ? geo[id].cur.slice().reverse() : geo[id].cur, c = lenTo(P0), n = c[c.length - 1] || 1;
        if (near) { let best = Infinity; P0.forEach((q, i) => { const dd = Math.hypot(q[0] - near[0], q[1] - near[1]); if (dd < best) { best = dd; b = c[i] / n; } }); }
        if (until) { const i = P0.findIndex((q, k) => k > 0 && until(q)); if (i > 0) b = c[i - 1] / n; }
        const seg = cutLen(P0, c, a * n, b * n), own = (f) => (rev ? 1 - f : f);
        marks.push(pts.length); parts.push({ id, name, fa: own(a), fb: own(b) });
        for (let i = a === 0 && pts.length ? 1 : 0, run = a * n; i < seg.length; i++) {
          if (i) run += Math.hypot(seg[i][0] - seg[i - 1][0], seg[i][1] - seg[i - 1][1]);
          pts.push(seg[i]); rad.push(r ? at('=' + r.toFixed(3), 0) : at(id, own(run / n)));
        }
      },
    };
    spec.build(B);
    const { P, raw, Rr, map, idx } = smoothRoute(pts, rad, marks);
    const cum = lenTo(P), total = cum[cum.length - 1], L = (i) => (i < idx.length ? cum[Math.min(idx[i], cum.length - 1)] : total);
    parts.forEach((q, i) => { q.d0 = L(i); q.d1 = L(i + 1); });
    const span = (name) => parts.find((q) => q.name === name);
    const tp = span(spec.tip[0]), free = tp.d0 + (tp.d1 - tp.d0) * spec.tip[1];
    const spans = Object.fromEntries(parts.filter((q) => q.name !== 'lead').map((q) => [q.name, [q.d0, q.d1]]));
    const r = { kind, pts: P, raw, rad: Rr.slice(), src, map, refs: null, radOf: procRadOf, cum, total, parts, spans,
      start: parts[1].d0 * spec.start, free, hv0: free, hvEnd: total, focus: [span(spec.focus[0]).d0, span(spec.focus[1]).d1] };
    if (E[spec.ids[spec.ids.length - 1]].glR?.length) cath.route = r;
    return r;
  }
  // The route's lumen radii from the vessels' drawn caliber now, so the balloon and the still column hug the
  // walls as the vein widens and narrows (re-read only when a vessel's radii were sent again).
  function cathLive(r) {
    const ids = [...new Set(r.src.map((q) => q[0]))], refs = ids.map((id) => E[id]?.glR);
    if (r.refs && refs.every((R, i) => R === r.refs[i])) return;
    r.refs = refs;
    routeRadii(r.src, r.map, r.radOf || cathRadOf, r.rad);
  }
  /** The point, direction, the vein's own centre (w) and lumen radius at length d along the route. */
  function cathAt(r, d) {
    d = clamp(d, 0, r.total);
    let i = 1;
    while (i < r.cum.length - 1 && r.cum[i] < d) i++;
    const s0 = r.cum[i - 1], s1 = r.cum[i], u = s1 > s0 ? (d - s0) / (s1 - s0) : 0, a = r.pts[i - 1], b = r.pts[i];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const wa = r.raw[i - 1], wb = r.raw[i];
    return { p: [lerp(a[0], b[0], u), lerp(a[1], b[1], u)], t: [(b[0] - a[0]) / l, (b[1] - a[1]) / l], w: [lerp(wa[0], wb[0], u), lerp(wa[1], wb[1], u)], r: lerp(r.rad[i - 1], r.rad[i], u) };
  }
  function cathPaint() {
    const st = cath.st, r = st && cathRoute();
    const gpu = !!r && glWanted() && veins.canCath;
    cath.g.style.display = r && !gpu ? '' : 'none';
    cath.labels.hidden = !r;
    if (!gpu) cathLast = null;   // (its fade-out only redraws what the GPU last drew)
    if (!r) { if (veins?.canCath) veins.setCath(null); return; }
    cathLive(r);
    if (!CTM) refreshCTM();
    // A blocked hepatic vein: the tip only reaches the ostium and probes it (st.probe 0..1 nudges it in).
    const end = st.ostium ? r.hv0 - 2 : r.free;
    const Rf = cathAt(r, r.free).r;
    const tipD = r.start + (end - r.start) * clamp(st.u, 0, 1) + (st.probe || 0) * Rf * 1.6;
    // A 5 F catheter in the hepatic vein, held at one width in the world for the whole procedure (never
    // thinner than about 3 px at the start, nor so thick it crowds the vein), so it scales with the anatomy as the camera moves.
    if (!cath.rc) cath.rc = clamp(1.5 / (CTM.sc || 1), Rf * 0.17, Rf * 0.28);
    const rc = cath.rc, ahead = cathAt(r, Math.min(r.total, tipD + Rf * 6.4));
    const tp = cathAt(r, tipD);
    cath.at = { tip: tp.p, ahead: ahead.p, nx: -tp.t[1], ny: tp.t[0] };
    // The wedged reading: the vein beyond the balloon, out toward the sinusoids, takes the wedged
    // pressure's color in the vessel's own rendering, filling outward as the column settles.
    let tint = null;
    const col = clamp(st.column || 0, 0, 1);
    if (gpu && col > 0.001 && r.parts) {
      // A treatment's sclerosant: from the tip on to the route's end, each vessel it reaches tinted over the part it covers
      // (an end where it runs on into the next vessel left open, so the joins show no edge).
      const a = tipD, reach = a + (r.total - a) * col;
      tint = { col: st.columnColor || 'var(--tr-wedge)', soft: Rf * 2.6 };
      for (const q of r.parts) {
        if (!q.id || q.d1 <= a || q.d0 >= reach) continue;
        const f = (d) => q.fa + (q.fb - q.fa) * clamp((d - q.d0) / (q.d1 - q.d0 || 1), 0, 1), open = (fe) => (fe === 0 ? -1 : fe === 1 ? 2 : fe);
        const lo = a < q.d0 - 0.5 ? open(q.fa) : f(a), hi = reach > q.d1 + 0.5 ? open(q.fb) : f(reach);
        tint[q.id] = [Math.min(lo, hi), Math.max(lo, hi)];
      }
    } else if (gpu && col > 0.001) {
      const a = tipD - rc * 4.2, reach = a + (r.total - a) * col, soft = Rf * 2.6;   // (a long fade where it meets moving blood)
      const hv = (d) => 1 - (d - r.hv0) / (r.hvEnd - r.hv0), br = (d) => 1 - (d - r.hvEnd) / (r.total - r.hvEnd);
      tint = { col: st.columnColor || 'var(--tr-wedge)', soft, RHV_IVC: [hv(Math.min(reach, r.hvEnd)), hv(a)] };
      if (reach >= r.hvEnd) tint.RHV_IVC[0] = -1;   // runs on into the branch: no edge at the join
      if (reach > r.hvEnd) tint.POST_R_RHV = [br(reach), 2];
    }
    const tk = !tint ? '' : r.parts ? Object.entries(tint).map(([k, v]) => (Array.isArray(v) ? `${k}:${v.map((x) => x.toFixed(3))}` : k === 'col' ? v : '')).join('|')
      : `${tint.col}|${tint.RHV_IVC.map((v) => v.toFixed(3))}|${tint.POST_R_RHV?.[0].toFixed(3) ?? ''}`;
    if (tk !== cath.tintKey) { cath.tintKey = tk; cathTint = tint; if (!inUpdate) syncVeins(easeInOut(morph)); }
    if (gpu) cathGL(st, r, tipD, rc);
    else cathSVG(st, r, tipD, rc * 2, Rf * 2);
    cathVer++; stageWake();
    cathLabels();
  }
  let cathVer = 0;
  // On the GPU (veins-gl.js): the still column, the shaft and its shadow, the marker band and rounded tip,
  // the balloon behind the tip and the reading ripples, as tubes and discs in world units.
  function cathGL(st, r, tipD, rc) {
    const V = [], draws = [], op = st.opacity ?? 1, cs = wrapCS();
    const begin = () => V.length / 6;
    const tube = (a, b, rOf, mode, col, alpha, fade, ox = 0, oy = 0) => {
      const first = begin(), step = Math.max(rc * 0.6, 0.35);
      const n = Math.max(2, Math.ceil((b - a) / step) + 1);
      for (let i = 0; i < n; i++) {
        const d = a + (b - a) * (i / (n - 1)), q = cathAt(r, d), nx = -q.t[1], ny = q.t[0], w = rOf(q, d);
        for (const side of [-1, 1]) V.push(q.p[0] + ox + nx * w * side, q.p[1] + oy + ny * w * side, nx, ny, side, d - a);
      }
      draws.push({ mode, first, count: begin() - first, col, alpha: alpha * op, fade, len: b - a });
    };
    const disc = (c, t, hx, hy, mode, col, alpha) => {
      const first = begin(), nx = -t[1], ny = t[0];
      for (const [u, v] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) V.push(c[0] + t[0] * hx * u + nx * hy * v, c[1] + t[1] * hx * u + ny * hy * v, t[0], t[1], u, v);
      draws.push({ mode, first, count: 4, col, alpha: alpha * op });
    };
    const shaft = [0.93, 0.95, 0.98];
    tube(0, tipD - rc * 0.4, () => rc * 2.1, 0, [0.03, 0.05, 0.12], 0.34, [60, 0], rc * 0.7, rc * 1.1);
    tube(0, tipD - rc * 0.4, () => rc, 2, shaft, 1, [60, 0]);
    // The pressure-reading tip: a dark marker band, then the rounded end.
    tube(Math.max(0, tipD - rc * 3.2), tipD - rc * 1.6, () => rc * 1.06, 3, [0.2, 0.23, 0.29], 1, [0, 0]);
    const tp = cathAt(r, tipD);
    disc(tp.p, tp.t, rc, rc, 4, shaft, 1);
    // The balloon sits just behind the tip; inflated, it fills the vein and wedges, held inside its walls.
    const bl = clamp(st.balloon || 0, 0, 1);
    cath.balBox = null;
    if (bl > 0.001) {
      const gap = rc * 4.2, Rb = cathAt(r, tipD - gap - rFree(r) * 1.6).r, sp = r.spans?.[st.balloonSpan];
      // (A TIPS's angioplasty balloon lies along the tract it opens, its whole length; the others sit just behind the tip.)
      const rx = sp ? (sp[1] - sp[0]) * 0.45 : lerp(rc * 3.4, Rb * 1.6, bl), dC = sp ? (sp[0] + sp[1]) / 2 : tipD - gap - rx;
      const at = (d) => cathAt(r, d), ry0 = balloonRy(at, dC, rx, rc * 1.35, { floor: rc * 1.05 });
      // Bent with the vein: a strip whose sides are the outline, its local coords on the unit circle at the
      // sides so it shades and edges as the latex disc does.
      const first = begin(), ol = balloonOutline(at, dC, rx, ry0, bl, { floor: rc * 1.05 });
      cath.balBox = outlineBox(ol);   // (the readings keep clear of it)
      for (const o of ol) {
        const nx = -o.t[1], ny = o.t[0], v = Math.sqrt(Math.max(0, 1 - o.s * o.s));
        for (const side of [-1, 1]) V.push(o.c[0] + nx * o.h * side, o.c[1] + ny * o.h * side, o.t[0], o.t[1], o.s, v * side);
      }
      draws.push({ mode: 5, first, count: begin() - first, col: [0.99, 0.9, 0.7], alpha: (0.55 + 0.45 * bl) * op });   // latex
    }
    // The tip reading: two ripples running out from it.
    if (st.ring) {
      const rgb = toRGB(st.ring, cs), ph = ((st.clock || 0) / 1300) % 1;
      for (const k of [ph, (ph + 0.5) % 1]) disc(tp.p, tp.t, rc * (1.6 + 4.2 * k), rc * (1.6 + 4.2 * k), 6, rgb, (1 - k) * (1 - k) * 0.9);
    }
    if (cathV.length < V.length) cathV = new Float32Array(V.length * 2);
    cathV.set(V);
    veins.setCath(cathLast = { verts: cathV.subarray(0, V.length), draws, light: LIGHT });
  }
  let cathV = new Float32Array(0), cathLast = null;
  // When the procedure ends or is cancelled the catheter, its balloon and its labels fade out over .22 s instead of vanishing
  // in one frame (MOTION_HEAT_REVIEW P21). A new catheter meanwhile ends the fade at once.
  let cathFade = null;
  function cathFadeOut() {
    const gs = veins?.canCath ? cathLast : null, anims = [];
    for (const el of [cath.labels, cath.g]) if (!el.hidden && el.style.display !== 'none' && el.animate) anims.push(el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: 'cubic-bezier(.4, 0, 1, 1)', fill: 'forwards' }));
    const me = { raf: 0, done: null }, t0 = performance.now();
    me.done = () => {
      if (cathFade !== me) return;
      cathFade = null; cancelAnimationFrame(me.raf);
      for (const a of anims) a.cancel();
      if (veins?.canCath) veins.setCath(null);
      cathVer++; stageWake();
      cath.g.style.display = 'none'; cath.labels.hidden = true;
      for (const el of cath.made?.values() || []) el._glass?.dispose();
      cath.labels.replaceChildren(); cath.made?.clear();
    };
    const step = (now) => {
      const k = Math.min(1, (now - t0) / 220);
      if (k >= 1) { me.done(); return; }
      if (gs && veins?.canCath) { const a = (1 - k) * (1 - k); veins.setCath({ ...gs, draws: gs.draws.map((d) => ({ ...d, alpha: d.alpha * a })) }); cathVer++; stageWake(); }
      me.raf = requestAnimationFrame(step);
    };
    cathFade = me;
    me.raf = requestAnimationFrame(step);
    setTimeout(me.done, 400);   // (frames stalled in a background tab: it still ends)
  }   // the catheter's vertices, reused frame to frame
  const rFree = (r) => cathAt(r, r.free).r;
  // Without WebGL: the same catheter in SVG.
  function cathSVG(st, r, tipD, cw, wHV) {
    const body = cutLen(r.pts, r.cum, 0, tipD), d = polyD(body), tp = body[body.length - 1];
    for (const el of [cath.shadow, cath.body]) el.setAttribute('d', d);
    cath.shadow.setAttribute('stroke-width', (cw * 1.6).toFixed(2)); cath.body.setAttribute('stroke-width', cw.toFixed(2));
    cath.tip.setAttribute('cx', tp[0].toFixed(2)); cath.tip.setAttribute('cy', tp[1].toFixed(2)); cath.tip.setAttribute('r', (cw * 0.85).toFixed(2));
    cath.ring.setAttribute('cx', tp[0].toFixed(2)); cath.ring.setAttribute('cy', tp[1].toFixed(2));
    cath.ring.setAttribute('r', (cw * (1.8 + 0.8 * (st.pulse || 0))).toFixed(2)); cath.ring.style.display = st.ring ? '' : 'none';
    cath.ring.style.stroke = st.ring || '';
    // The balloon: inflated, it lies along the vein and fills it wall to wall (see balloonOutline).
    const sp = r.spans?.[st.balloonSpan], bl = clamp(st.balloon || 0, 0, 1), at = (d) => cathAt(r, d);
    const rx = sp ? (sp[1] - sp[0]) * 0.45 : wHV * (0.45 + 0.35 * bl), dC = sp ? (sp[0] + sp[1]) / 2 : tipD - rx - cw * 1.5;
    const ry0 = balloonRy(at, dC, rx, cw * 0.65, { floor: cw * 0.55 }), ol = balloonOutline(at, dC, rx, ry0, bl, { floor: cw * 0.55 });
    const side = (k) => ol.map((o) => [o.c[0] - o.t[1] * o.h * k, o.c[1] + o.t[0] * o.h * k]);
    cath.balBox = bl > 0 ? outlineBox(ol) : null;   // (the readings keep clear of it)
    cath.balloon.style.display = bl > 0 ? '' : 'none';
    cath.balloon.setAttribute('d', bl > 0 ? `${polyD([...side(1), ...side(-1).reverse()])}Z` : '');
    const col = clamp(st.column || 0, 0, 1), reach = tipD + (r.total - tipD) * col;
    const a = cutLen(r.pts, r.cum, tipD, reach);
    cath.column.setAttribute('d', a.length > 1 ? polyD(a) : ''); cath.column.setAttribute('stroke-width', (wHV * 0.82).toFixed(2));
    cath.column2.setAttribute('d', '');
    cath.column.style.stroke = st.columnColor || '';
    cath.g.style.opacity = st.opacity ?? 1;
  }
  // A reading that has to move to a new spot (the cards or the slide changed the room it has) glides there, eased, never
  // jumps: its jump is kept as an offset that eases to nothing, while it still follows its point on the figure as the camera moves.
  // (x, y: where it should be now; ax, ay: its point. Returns where it shows. A glide still running asks for the next frame.)
  const CATH_GLIDE = 600;
  function cathGlide(el, x, y, ax, ay) {
    const now = performance.now(), g = el._gl;
    const left = (q) => { const u = Math.min(1, (now - q.t0) / CATH_GLIDE), e = 1 - (1 - u) ** 3; return [q.ox * (1 - e), q.oy * (1 - e), u < 1]; };
    let [ox, oy] = g ? left(g) : [0, 0];
    if (g) {
      const jx = x - g.x - (ax - g.ax), jy = y - g.y - (ay - g.ay);
      if (Math.hypot(jx, jy) > 4 && !matchMedia('(prefers-reduced-motion: reduce)').matches) { el._gl = { x, y, ax, ay, ox: ox - jx, oy: oy - jy, t0: now }; ox -= jx; oy -= jy; }
      else el._gl = { ...g, x, y, ax, ay };
    } else el._gl = { x, y, ax, ay, ox: 0, oy: 0, t0: now };
    if (left(el._gl)[2] && !cath.glideRaf) cath.glideRaf = nextFrame(() => { cath.glideRaf = 0; cath.lblKey = ''; cathLabels(); });
    return [x + ox, y + oy];
  }
  function cathLabels() {
    const st = cath.st, at = cath.at;
    if (!st || !at) { for (const el of [...(cath.made?.values() || []), ...(cath.leaving?.keys() || [])]) el._glass?.dispose(); cath.labels.replaceChildren(); cath.made?.clear(); cath.leaving?.clear(); cath.lblKey = ''; return; }
    // Laid out once per change of the camera or the catheter (a glide and the procedure's step both ask in one frame).
    const lk = `${viewVersion}|${cathVer}`;
    if (lk === cath.lblKey) return;
    cath.lblKey = lk;
    // Each label keeps its element while its key is shown (numbers update in place). A new key fades in
    // (opacity and a small rise, eased); one that goes fades out before it is removed.
    const made = cath.made || (cath.made = new Map());
    const want = new Map((st.labels || []).map((l) => [l.key, l]));
    // When the summary arrives, the two readings travel from where they were into it (their old pills go at once).
    const leaving = cath.leaving || (cath.leaving = new Map());
    const travel = want.has('s') && !made.has('s') && !matchMedia('(prefers-reduced-motion: reduce)').matches;
    const from = {};
    for (const [k, el] of made) if (!want.has(k)) {
      made.delete(k);
      if (travel && (k === 'f' || k === 'w')) { from[k === 'f' ? 'tip' : 'ahead'] = el.getBoundingClientRect(); el._glass?.dispose(); el.remove(); continue; }
      // It fades out where it is on the figure (following the camera, never stuck on the screen), then goes.
      el.classList.add('cath-pre', 'cath-out'); leaving.set(el, el._l);
      setTimeout(() => { el._glass?.dispose(); el.remove(); leaving.delete(el); }, 450);
    }
    const pill = (l, cls = '') => {
      const el = document.createElement('div');
      el.className = `cath-label ${l.cls || ''} ${cls}`; el.dataset.at = l.at || '';
      const k = document.createElement('small'); k.textContent = l.kicker || ''; el.append(k);
      const b = document.createElement('b'); b.textContent = l.text; el.append(b);
      if (l.unit) { const u = document.createElement('span'); u.textContent = l.unit; el.append(u); }
      el._glass = glassCallout(el);
      return el;
    };
    const fill = (el, l) => { const sm = el.querySelector('small'); if (sm.textContent !== l.kicker) sm.textContent = l.kicker || ''; const b = el.querySelector('b'); if (b.textContent !== l.text) b.textContent = l.text; };
    const build = (l) => {
      if (l.at !== 'sum') return pill(l);
      // The two readings stacked (wedged above free, as on the tracing), a bracket joining them and
      // the difference beside it; thin leaders run from each reading to where it was taken.
      const el = document.createElement('div'); el.className = 'cath-sum';
      const svg = s('svg', { class: 'cath-leads' });
      const col = document.createElement('div'); col.className = 'cath-sum-col';
      col.append(...l.rows.map((r) => pill(r, 'in-sum')));
      const brace = s('svg', { class: 'cath-brace', width: 22 });
      brace.append(s('path', {}));
      const box = document.createElement('div'); box.className = 'cath-sum-box';
      box.append(col, brace, pill(l.calc, 'in-sum calc'));
      el.append(svg, box);
      return el;
    };
    for (const [k, l] of want) {
      if (made.has(k)) continue;
      const el = build(l); el.classList.add(l.at === 'sum' && travel ? 'cath-travel' : 'cath-pre'); cath.labels.append(el); made.set(k, el);
      if (l.at === 'sum' && travel) el._from = from;
      el._l = l;
      void el.offsetWidth; el.classList.remove('cath-pre');   // the transition runs from the hidden state
    }
    // Read, then write: every reading's new text first, then all the sizes (one layout), then the positions.
    // (The live labels: those shown, and those fading out, which follow the camera until they go.)
    for (const [k, l] of want) made.get(k)._l = l;
    const live = [...[...want].map(([k, l]) => [made.get(k), l]), ...leaving];
    const pills = live.filter(([, l]) => l && l.at !== 'sum');
    for (const [el, l] of pills) fill(el, l);
    const W = wrap.clientWidth, H = wrap.clientHeight;
    // The readings stay in the space the cards leave (a phone's Measure card sits over the bottom).
    const sp = cardSpace(), lim = H - sp.b;
    const size = new Map(pills.map(([el]) => [el, [el.offsetWidth, el.offsetHeight]]));
    const fEl = made.get('f'), fW = fEl ? (size.get(fEl) || [fEl.offsetWidth])[0] : 0;
    for (const [el] of pills) {
      const [w, h] = size.get(el);
      const p = el.dataset.at === 'ahead' ? at.ahead : at.tip;
      const [x, y] = worldToLocal(p[0], p[1]);
      // A reading that hangs below its point goes above it when the bottom is covered (decided once, so it never jumps).
      if (el._above == null && el.dataset.at === 'ahead') { el._above = y + 18 + h > lim - 8; el.classList.toggle('above', el._above); }
      // Side by side with the free reading, the wedged one steps aside rather than overlap it.
      let dx = 0;
      if (el.dataset.at === 'ahead' && el._above && fEl) { const [tx] = worldToLocal(at.tip[0], at.tip[1]); dx = -clamp((x + w / 2) - (tx - fW / 2) + 6, 0, 14); }
      // Kept inside the stage: the box moves in and its pointer stays on the point.
      const half = w / 2, [cx, cy] = cathGlide(el, clamp(x + dx, Math.min(half + 8, W / 2), Math.max(W - half - 8, W / 2)), y, x, y);
      el.style.setProperty('--ax', `${(x + dx - cx).toFixed(1)}px`);
      el._glass(x + dx - cx);
      el.style.transform = `translate(${cx.toFixed(1)}px, ${cy.toFixed(1)}px)`;
      el._box = calloutBox(el, null, cx, cy, half, h);
    }
    live.forEach(([el, l]) => {
      if (!l || l.at !== 'sum') return;
      const box = el.querySelector('.cath-sum-box'), rows = [...box.querySelectorAll('.cath-sum-col .cath-label')];
      rows.forEach((r, j) => fill(r, l.rows[j]));
      fill(box.querySelector('.calc'), l.calc);
      const A = Object.fromEntries(['tip', 'ahead'].map((k) => [k, worldToLocal(at[k][0], at[k][1])]));
      const bw = box.offsetWidth, bh = box.offsetHeight, top = Math.max(70, sp.t + 6), gap = lim < 440 ? 40 : 64;
      const R = rows.map((r) => [r.offsetLeft, r.offsetTop, r.offsetWidth, r.offsetHeight]);   // (read before any write below)
      // Above the readings, centred between them; below them when there is no room above. Either way it sits in the
      // free figure, clear of the cards, the slide's panel and its controls, and never over what it names: the tip,
      // the wedged balloon and the point ahead (cath-place.js). Its leaders stay on the vein.
      const keep = [...['tip', 'ahead'].map((k) => ({ x0: A[k][0] - 8, y0: A[k][1] - 8, x1: A[k][0] + 8, y1: A[k][1] + 8 }))];
      if (cath.balBox) {
        const b = cath.balBox, cs = [[b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1]].map(([px, py]) => worldToLocal(px, py));
        keep.push({ x0: Math.min(...cs.map((c) => c[0])), y0: Math.min(...cs.map((c) => c[1])), x1: Math.max(...cs.map((c) => c[0])), y1: Math.max(...cs.map((c) => c[1])) });
      }
      let { x, y } = placeSummary({ A, bw, bh, W, top, lim, gap, blockers: readBlockers(), keep });
      [x, y] = cathGlide(box, x, y, (A.tip[0] + A.ahead[0]) / 2, (A.tip[1] + A.ahead[1]) / 2);
      box.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      el._box = { x0: x, y0: y, x1: x + bw, y1: y + bh };
      // The bracket, from the middle of one reading to the middle of the other.
      const ys = R.map((q) => q[1] + q[3] / 2), path = box.querySelector('.cath-brace path');
      box.querySelector('.cath-brace').setAttribute('height', bh);
      path.setAttribute('d', `M2 ${ys[0]} H9 V${ys[1]} H2 M9 ${(ys[0] + ys[1]) / 2} H20`);
      // Leaders: from each reading to its point on the vein. The reading nearer the points runs straight
      // from its edge; the other leaves from its outer side and runs down (or up) beside the stack.
      const svg = el.querySelector('.cath-leads');
      svg.setAttribute('width', W); svg.setAttribute('height', H);
      const below = (A.tip[1] + A.ahead[1]) / 2 > y + bh / 2, near = below ? rows.length - 1 : 0;
      const c0 = R[0], c1 = R[R.length - 1], colTop = y + c0[1], colBot = y + c1[1] + c1[3];
      // Updated in place (a path and a dot per reading), rebuilt only when the readings change.
      if (svg.childElementCount !== rows.length * 2) svg.replaceChildren(...rows.flatMap(() => [s('path', {}), s('circle', { r: 4.5 })]));
      rows.forEach((r, j) => {
        const [px, py] = A[l.rows[j].at];
        const rx0 = x + R[j][0], ry0 = y + R[j][1], rx1 = rx0 + R[j][2], ry1 = ry0 + R[j][3];
        let d;
        if (j === near) d = `M${clamp(px, rx0 + 12, rx1 - 12).toFixed(1)} ${(below ? ry1 : ry0).toFixed(1)} L${px.toFixed(1)} ${py.toFixed(1)}`;
        else { const ex = rx0 - 12, ey = below ? colBot + 14 : colTop - 14; d = `M${rx0.toFixed(1)} ${((ry0 + ry1) / 2).toFixed(1)} H${ex.toFixed(1)} V${ey.toFixed(1)} L${px.toFixed(1)} ${py.toFixed(1)}`; }
        const lead = svg.children[j * 2], dot = svg.children[j * 2 + 1], cls = l.rows[j].cls || '';
        if (lead.getAttribute('class') !== 'lead ' + cls) { lead.setAttribute('class', 'lead ' + cls); dot.setAttribute('class', 'lead-dot ' + cls); }
        lead.setAttribute('d', d); dot.setAttribute('cx', px.toFixed(1)); dot.setAttribute('cy', py.toFixed(1));
      });
      if (el._from) {
        // FLIP: each reading starts where its pill was and eases into its row; the bracket, leaders and
        // HVPG wait (CSS delays) until they have landed.
        rows.forEach((r, j) => {
          const a = el._from[l.rows[j].at]; if (!a) return;
          const b = r.getBoundingClientRect();
          r.style.transition = 'none'; r.style.transform = `translate(${(a.left - b.left).toFixed(1)}px, ${(a.top - b.top).toFixed(1)}px)`;
          void r.offsetWidth; r.style.transition = 'transform .6s var(--ease)'; r.style.transform = '';
          setTimeout(() => { r.style.transition = ''; }, 650);   // then back to the stylesheet's (the shadow's fade-out)
        });
        el._from = null; nextFrame(() => el.classList.remove('cath-travel'));
      }
    });
  }
  // The camera for the procedure: the route, the tip close up, then back where it was.
  // both: the close-up holds the tip and the vein ahead of it, where the wedged reading hangs, inside the free space.
  function cathFocus(mode, ms = 700, { both = false } = {}) {
    const r = cathRoute();
    if (mode === 'home') { if (cath.saved) animateVT(cath.saved, ms); cath.saved = null; cath.k0 = 0; return true; }
    if (!r) return false;
    if (!cath.saved) cath.saved = { ...(vtTarget && vtAnim ? vtTarget : vt) };
    if (mode === 'route') cath.k0 = 0;
    const wr = wrap.getBoundingClientRect(), ins = safeInsets();
    const [fx0, fy0] = clientToVB(wr.left + ins.l, wr.top + ins.t), [fx1, fy1] = clientToVB(wr.left + ins.W - ins.r, wr.top + ins.H - ins.b);
    let cx, cy, k, cyScreen = (fy0 + fy1) / 2;
    if (mode === 'tip' && r.focus) {
      // A treatment: the stretch it works on (the tract and the portal vein, the shunt, the feeder), whole and close.
      const seg = cutLen(r.pts, r.cum, r.focus[0], r.focus[1]);
      const xs = seg.map((q) => q[0]), ys = seg.map((q) => q[1]), x0 = Math.min(...xs) - 24, x1 = Math.max(...xs) + 24, y0 = Math.min(...ys) - 24, y1 = Math.max(...ys) + 24;
      cx = (x0 + x1) / 2; cy = (y0 + y1) / 2; k = clamp(Math.min((fx1 - fx0) / (x1 - x0), (fy1 - fy0) / (y1 - y0)) * 0.85, 1, 5);
    } else if (mode === 'tip') {
      const tp = cutLen(r.pts, r.cum, 0, r.free).at(-1);
      cx = tp[0]; cy = tp[1]; k = 6.2;
      if (both) {
        const ah = cathAt(r, Math.min(r.total, r.free + cathAt(r, r.free).r * 6.4)).p;
        cx = (tp[0] + ah[0]) / 2; cy = (tp[1] + ah[1]) / 2;
        k = Math.min(k, (fx1 - fx0) * 0.5 / Math.max(1, Math.abs(ah[0] - tp[0])), (fy1 - fy0) * 0.5 / Math.max(1, Math.abs(ah[1] - tp[1])));
      }
      // A blocked vein: the tip waits at the ostium, so the view holds both it and the vein it cannot enter.
      if (cath.st?.ostium) { const o = cutLen(r.pts, r.cum, 0, r.hv0 - 2).at(-1); cx = (o[0] + tp[0]) / 2; cy = (o[1] + tp[1]) / 2; k = 4.8; }
      // With little room above a card (a phone), the view is a little wider and the tip sits low in the free space,
      // so the vein still shows and the readings fit above the tip.
      const sp = cardSpace(), freeH = ins.H - sp.t - sp.b;
      if (freeH < 440) {
        const [, top] = clientToVB(wr.left, wr.top + sp.t), [, bot] = clientToVB(wr.left, wr.top + ins.H - sp.b);
        k = 4.2; cyScreen = bot - (bot - top) * (74 / Math.max(freeH, 120));
      }
    } else {
      const seg = cutLen(r.pts, r.cum, r.start * 0.5, r.hvEnd);
      const xs = seg.map((q) => q[0]), ys = seg.map((q) => q[1]), x0 = Math.min(...xs) - 30, x1 = Math.max(...xs) + 30, y0 = Math.min(...ys) - 30, y1 = Math.max(...ys) + 30;
      cx = (x0 + x1) / 2; cy = (y0 + y1) / 2; k = clamp(Math.min((fx1 - fx0) / (x1 - x0), (fy1 - fy0) / (y1 - y0)) * 0.9, 1, 2.6);
    }
    animateVT({ k, x: (fx0 + fx1) / 2 - cx * k, y: cyScreen - cy * k }, ms);
    return true;
  }
  // While the catheter travels, the view drifts after its tip (eased, never snapping) once the tip has
  // passed the middle of the route view, so the hepatic vein arrives centred before the close-up.
  let followT = 0;
  function cathFollow() {
    const r = cathRoute(), now = performance.now(), dt = Math.min(64, now - (followT || now)); followT = now;
    const st = cath.st;
    if (!r || !st || !cath.saved || vtGliding || reduceMotion.matches) return;
    const end = st.ostium ? r.hv0 - 2 : r.free, tipD = r.start + (end - r.start) * clamp(st.u, 0, 1);
    const wr = wrap.getBoundingClientRect(), ins = safeInsets();
    const [fx0, fy0] = clientToVB(wr.left + ins.l, wr.top + ins.t), [fx1, fy1] = clientToVB(wr.left + ins.W - ins.r, wr.top + ins.H - ins.b);
    // Up and down only (no sideways pan), with a gentle zoom in as the tip nears the vein.
    const tp = cutLen(r.pts, r.cum, 0, tipD).at(-1), a = 1 - Math.exp(-dt / 450);
    if (!cath.k0) cath.k0 = vt.k;
    const k = vt.k + (cath.k0 * (1 + 0.25 * clamp(st.u, 0, 1)) - vt.k) * a, sx = (fx0 + fx1) / 2;
    const nx = sx - (sx - vt.x) * (k / vt.k), ty = (fy0 + fy1) / 2 - tp[1] * k;
    const sy = (fy0 + fy1) / 2, ys = sy - (sy - vt.y) * (k / vt.k), ny = ys + Math.min(0, ty - ys) * a;
    if (Math.abs(ny - vt.y) + Math.abs(nx - vt.x) + Math.abs(k - vt.k) * 100 < 0.05) return;
    vt = { k, x: nx, y: ny }; applyVT(); CTM = null; refreshCTM(); if (drawVeins()) drawnView = viewVersion;   // (the step's setCatheter lays out the labels next)
  }

  // Overlays (stenosis, thrombus, stents, varices, balloons, catheter…)
  // The overlays (clamps, clots, stents, varices, caput medusae, balloons, catheter) are rebuilt
  // only when something they draw has visibly changed: the key holds every input, rounded.
  let overlayKey = '', thrombiKey = '';
  // A stent called out at its three points stands its callouts in a column on one side (ptSide, 'E' | 'W', chosen in layoutLabels);
  // its narrowing's "60 %" then goes to the other side (clampAway), so the two never meet.
  let ptSide = null, clampAway = null, clampFor = null;
  // (The flow's arrowheads stay out from under a stent's called-out points: world boxes [x0, y0, x1, y1, r], round by r; see bloodLook.)
  let chevHoles = [], holesKey = '';
  // A narrowing's "60 %" the Doppler probe would cover (its body, line of sight, bars or flow axis) steps out to the nearest clear spot on
  // a leader line, by stenosis: cur is where it stands now, busy while it fades out and in at its new place (Mohammad, 20 Oct).
  const clampMv = new Map();
  const clampD = new Map();   // (a column's "60 %": how far out it stands, by stenosis, kept across the overlay's rebuilds)
  // (A new slide (the presenter clears its mark first) starts the stent's column afresh: its callouts, its mark, their side and the
  // "60 %" are solved for this slide alone, as on a fresh load, never held from the slide before: Review 16 Oct.)
  store.on('focus', (foc) => {
    if (foc) return;
    for (const k of [...labelSol.keys()]) if (/^(n:TIPS:|n:DIPS:|focus)/.test(k)) labelSol.delete(k);
    ptSide = null; colShown = false; clampD.clear();
  });
  // How far a point's callout stands from its dot: clear of the stent's body, its leader 16 px at most.
  const colGap = (sid) => Math.min(16, ((E[sid]?.width || 4) * CTM.sc) / 2 + 7);
  // (The "60 %" is drawn in the figure's own units, in the labels' own name size on screen (fontPx 11.5: 12 px at least, the text size
  // setting and a presentation's projector size included), the weight and the 7 px stage-colour halo of the callouts beside it.)
  // (Its halo a constant 7 px wide on screen, whatever the zoom: wide enough to fill the counters of "6", "0" and "%" too, so
  // the figure never shows through inside a digit: Review 16 Oct.)
  const clampFontAt = (el) => {
    const px = fontPx(11.5);
    if (Math.abs(px - clampBase) > 0.01) { clampBase = px; applyClampFs(); }
    el.style.fontSize = CTM.sc > 0 && CTM.sc < 1 ? `${(clampBase / CTM.sc).toFixed(2)}px` : '';
    el.style.strokeWidth = CTM.sc > 0 ? `${(7 / CTM.sc).toFixed(2)}px` : '';
  };
  // Moves a "60 %" to `want` ({ d, t } or null: back where it belongs): it fades out where it stands, then in at the new place.
  function clampStep(id, want) {
    const m = clampMv.get(id) || { cur: null, want: null, busy: false }, same = (a, b) => (a ? !!b && a.d === b.d && a.t === b.t : !b);
    clampMv.set(id, m);
    if (m.busy) return;
    m.want = want;
    if (same(m.cur, want)) return;
    const els = () => [...ov.clamps.querySelectorAll(`.clamp-label[data-id="${id}"]`)];
    m.busy = true;
    const dur = reduceMotion.matches ? 0 : 260;
    for (const el of els()) el.animate?.([{ opacity: getComputedStyle(el).opacity }, { opacity: 0 }], { duration: dur, fill: 'forwards' });
    setTimeout(() => {
      m.cur = m.want; m.busy = false;
      for (const el of els()) { el.getAnimations?.().forEach((a) => a.cancel()); clampLabelAt(el); el.animate?.([{ opacity: 0 }, { opacity: getComputedStyle(el).opacity }], { duration: dur }); }
      if (F) updateLabels(F);
    }, dur);
  }
  // A narrowing's "60 %": one rule for where it stands, whichever code asks (the marks' rebuild, a change of zoom, the layout's search).
  // Its spot is d past the clamp's arrows on one side of the vessel and t along it (the layout's, or 16 and 0), the text reading
  // outward from there, ending at the spot on the clamp's left on screen and starting there on its right, level whatever the turn.
  function clampLabelAt(el) {
    const q = clampLabelPos(el);
    if (!q) return;
    const { x, y, left, gap, deg } = q;
    el.setAttribute('x', x.toFixed(2)); el.setAttribute('y', y.toFixed(2));
    el.setAttribute('dx', (left ? -gap : gap).toFixed(2)); el.setAttribute('dy', gap.toFixed(2));
    if (left) el.setAttribute('text-anchor', 'end'); else el.removeAttribute('text-anchor');
    if (deg) el.setAttribute('transform', `rotate(${(-deg).toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)})`); else el.removeAttribute('transform');
  }
  // Where clampLabelAt puts a clamp's percentage (its spot, which side its text runs and its offset), without writing it.
  function clampLabelPos(el) {
    const c = el._c;
    if (!c) return null;
    const away = c.id === clampFor ? clampAway : null;
    const kept = c.id === clampFor ? clampD.get(c.id) : null, mv = c.id !== clampFor ? clampMv.get(c.id)?.cur : null;
    const d = c.off + (el._d ?? mv?.d ?? kept?.d ?? 16), t = el._d != null ? el._t ?? 0 : mv?.t ?? kept?.t ?? 0;
    const pos = [1, -1].map((sg) => [c.x + c.nx * sg * d - c.ny * t, c.y + c.ny * sg * d + c.nx * t]);   // (t: slid along the vessel)
    const xs = pos.map((q) => worldToLocal(...q)[0]);
    const k = away && (away === 'W') !== (xs[0] < xs[1]) ? 1 : 0, left = xs[k] < xs[1 - k] - 0.5, [x, y] = pos[k];
    const gap = (6 * clampBase) / 12 / Math.max(CTM?.sc || 1, 1e-3), deg = rotDeg();   // (6 px on screen at 12 px text, the text's own offset from its spot, in step with the text's size)
    return { x, y, left, gap, deg };
  }
  // A quantized value that only moves once the input has clearly left its step (so a varix whose
  // diameter pulses across a rounding boundary is not rebuilt on every beat).
  const held = {};
  const hold = (k, v, step) => { const h0 = held[k]; if (h0 == null || Math.abs(v - h0) > step * 0.75) held[k] = Math.round(v / step) * step; return held[k]; };
  function overlayInputs(f, p, t) {
    const m = f.metrics;
    const lesions = [...Object.keys(p.stenosis), ...Object.keys(p.thrombus), ...Object.keys(p.occluded), 'TIPS', 'DIPS', 'S_PC', 'S_DSR', 'S_MC', ...LIGATED.map((l) => l[1]), ...Object.keys(p.customShunts || {}), 'C3'];
    return JSON.stringify([t.toFixed(3), isImaging(), findingHidden('clot'), p.stenosis, p.stenosisSite, p.thrombus, p.occluded, p.splenicRx | 0, p.tips, p.dips, p.customShunts, p.balloonEso, p.balloonGas,
      // A vessel's width eases with its pressure for a long while after a change; held in steps,
      // so a clot or stent is not rebuilt several times a second for sub-pixel drift.
      lesions.map((id) => (E[id] ? [E[id].vis, hold(`w${id}`, E[id].width, 0.25), !!E[id].reveal] : 0)),
      // Varix geometry follows the grade, not the pulse: red wales appear above 70 % of the
      // rupture threshold, in coarse steps.
      hold('vd', m.varix.d, 0.5), hold('vr', m.varix.r, 0.5), m.varix.ratio > 0.7 ? hold('vt', m.varix.ratio, 0.2) : 0, Math.round(f.bands || 0),
      hold('gd', m.gastricVarix.d, 0.5), hold('c3', recruitFrac('C3', f), 0.1), lastMorph]);
  }
  const setVar = (el, k, v) => { const c = el._v || (el._v = {}); if (c[k] === v) return; c[k] = v; el.style.setProperty(k, v); };
  function updateOverlays(f, p, gain, t) {
    // Colors follow pressure continuously through CSS variables; geometry rebuilds only on change.
    const PM = f.Pf || f.P;
    setVar(ov.varices, '--vx', pressureColor(qP(PM[NI.VAR])));
    setVar(ov.gvarices, '--vx', pressureColor(qP(PM[NI.GV])));
    const key = overlayInputs(f, p, t);
    if (key === overlayKey) return;
    overlayKey = key;
    const anat = t < 0.5;
    // stenosis clamps & thrombi
    const hideDx = store.get().found ? findingHidden('clot') : isImaging();
    // (A narrowing that goes leaves its clamp and "60 %" to fade out in ov.clampsOut, under other classes so the label
    // layout never counts them; one that comes, or comes back, fades in from where it stands.)
    const want = new Set(Object.entries(p.stenosis).filter(([id, v]) => !hideDx && v > 0 && E[id]?.vis).map(([id]) => id));
    if (!clampFading()) clampLast = performance.now();
    for (const el of [...ov.clamps.children]) {
      const id = el.dataset.id;
      if (want.has(id)) continue;
      const c = clampA.get(id);
      if (!c) { el.remove(); continue; }
      c.on = false;
      el.classList.replace('clamp', 'clamp-out'); el.classList.replace('clamp-label', 'clamp-label-out');
      ov.clampsOut.append(el);
    }
    for (const id of want) {
      const c = clampA.get(id);
      if (!c) clampA.set(id, { a: 0, on: true });
      else if (!c.on) { c.on = true; for (const el of ov.clampsOut.querySelectorAll(`[data-id="${id}"]`)) el.remove(); }
    }
    ov.clamps.innerHTML = ''; ov.stents.innerHTML = ''; ov.plugs.innerHTML = '';
    // Clots keep their own key: growing varices (the disease clock) rebuild the rest, not them.
    const tk = JSON.stringify([t.toFixed(3), hideDx, p.thrombus, Object.keys(p.thrombus).map((id) => (E[id] ? [E[id].vis, held[`w${id}`]] : 0))]);
    const clots = tk !== thrombiKey;
    if (clots) { thrombiKey = tk; ov.thrombi.innerHTML = ''; }
    for (const [id, v] of Object.entries(p.stenosis)) {
      if (!want.has(id)) continue;
      const [x, y, dx, dy] = pointAt(geo[id].cur, stenosisAt(id, p));
      const n = Math.hypot(dx, dy) || 1, nx = -dy / n, ny = dx / n;
      const off = (E[id].width / 2) * (1 - v) + 3;
      for (const sgn of [1, -1]) {
        const bx = x + nx * sgn * (off + 8), by = y + ny * sgn * (off + 8);
        const tx = x + nx * sgn * off, ty = y + ny * sgn * off;
        const ux = dx / n * 4.5, uy = dy / n * 4.5;
        ov.clamps.append(s('path', { class: 'clamp', 'data-id': id, d: `M${tx} ${ty} L ${bx + ux} ${by + uy} L ${bx - ux} ${by - uy} Z` }));
      }
      const lab = s('text', { class: 'clamp-label', 'data-id': id }, document.createTextNode(`${Math.round(v * 100)}%`));
      lab._c = { id, x, y, nx, ny, off }; clampLabelAt(lab); clampFontAt(lab);
      ov.clamps.append(lab);
      clampShade(id);
    }
    placeClampLabels();
    // Thrombus: a lumpy clot lying against one wall of the lumen, drawn as soft stacked layers of one
    // deep red (see clotLayers) so it is darkest where thickest and fades into the vessel at its edges.
    // A hairline in a darker shade of the same red traces only its free edge in the lumen, so it reads
    // as resting on the wall. Below full occlusion the vessel's own blood shows down the open side.
    // Its thickness, length and lumps are smooth in the occlusion (see clot-shape.js), so an eased change
    // eases the clot: it thickens from the wall inwards, then lengthens.
    for (const [id, v] of Object.entries(clots ? p.thrombus : {})) {
      if (hideDx || !(v > 0) || !E[id] || !E[id].vis) continue;
      // W is a little inside the drawn lumen, so the clot's soft edge never spills onto the vessel wall.
      const g = geo[id], lit = g.lit, W = E[id].width * 0.9;
      const seed = hashSeed(id), side = clotSide(seed), { u0, u1 } = clotSpan(v);
      const i0 = Math.round(u0 * (N_SAMPLES - 1)), i1 = Math.round(u1 * (N_SAMPLES - 1));
      const pts = g.cur.slice(i0, i1 + 1), ln = lit.slice(i0, i1 + 1), n = pts.length;
      if (n < 3) continue;
      const rOf = (f) => clotRadius(v, W, f, seed);
      const mid = pts.map((q, i) => { const sh = clotShift(W, rOf(i / (n - 1)), side); return [q[0] + ln[i][0] * sh, q[1] + ln[i][1] * sh]; });
      for (const { cls, k } of clotLayers) ov.thrombi.append(s('path', { class: cls, d: tubeOutline(mid, ln, (f) => rOf(f) * k) }));
      const edge = mid.map((q, i) => { const r = rOf(i / (n - 1)) * CLOT_EDGE; return [q[0] - ln[i][0] * side * r, q[1] - ln[i][1] * side * r]; });
      ov.thrombi.append(s('path', { class: 'thrombus-edge', d: polyD(edge) }));
    }
    for (const id of ['TIPS', 'DIPS', 'S_PC', 'S_DSR', 'S_MC', ...Object.keys(p.customShunts || {})]) {
      if (!E[id].vis || E[id].reveal) continue;
      if (id === 'TIPS' || id === 'DIPS' || id.startsWith('X_')) stentMesh(id, p); else anastomoses(id);
    }
    // The stump of the vessel each surgical shunt divides, a clear gap past where the shunt leaves it.
    for (const [shunt, vein] of LIGATED) if (E[shunt].vis && !E[shunt].reveal && E[vein]?.vis) ligature(vein);
    for (const id of new Set([...Object.keys(p.occluded), ...(p.occluded.C5 ? ['C2'] : [])])) {
      if (!isOccluded(p, id) || !E[id] || !E[id].vis) continue;
      const [x, y] = pointAt(geo[id].cur, 0.5);
      ov.plugs.append(s('circle', { cx: x, cy: y, r: 7, fill: 'var(--surface)', stroke: 'var(--danger)', 'stroke-width': 2 }),
        s('path', { d: `M${x - 4} ${y - 4} L ${x + 4} ${y + 4} M${x + 4} ${y - 4} L ${x - 4} ${y + 4}`, stroke: 'var(--danger)', 'stroke-width': 2 }));
    }

    // Spleen: embolization leaves pale infarcted patches in the organ; after a splenectomy the organ
    // fades (see the opacity set with its size) and a cross is drawn on it.
    const rx = p.splenicRx | 0;
    if (anat && rx) {
      const [cx, cy] = SPLEEN_CENTER, sc = f.slow.spleen / 11;
      if (rx === 1) {
        for (const [dx, dy, rx_, ry_] of [[6, -38, 17, 22], [14, 4, 15, 20], [2, 44, 14, 17]]) {
          ov.plugs.append(s('ellipse', { cx: cx + dx * sc, cy: cy + dy * sc, rx: rx_ * sc, ry: ry_ * sc, fill: 'var(--surface)', 'fill-opacity': 0.55, stroke: 'var(--danger)', 'stroke-width': 1.5, 'stroke-opacity': 0.7 }));
        }
      } else {
        const x = cx + 12, y = cy + 6;
        ov.plugs.append(s('circle', { cx: x, cy: y, r: 18, fill: 'var(--surface)', stroke: 'var(--danger)', 'stroke-width': 2.5 }),
          s('path', { d: `M${x - 8} ${y - 8} L ${x + 8} ${y + 8} M${x + 8} ${y - 8} L ${x - 8} ${y + 8}`, stroke: 'var(--danger)', 'stroke-width': 3, 'stroke-linecap': 'round' }));
      }
    }
    // The varices themselves are shown by the plexus of channels feeding and draining them (see
    // STRANDS in anatomy.js), which swell as they are recruited; here only the bands, fitted at
    // ligation, are drawn over the lower esophagus.
    ov.varices.innerHTML = ''; ov.gvarices.innerHTML = ''; ov.bands.innerHTML = '';
    if (anat) {
      const eso = (y) => 789 + (y - 24) * 0.066;
      const nb = Math.round(f.bands || 0);
      for (let i = 0; i < nb; i++) { const y = 272 - i * 16; ov.bands.append(s('ellipse', { cx: eso(y), cy: y, rx: 11, ry: 3, class: 'band-ring' })); }
    }
    // Balloons
    ov.balloons.innerHTML = '';
    if (anat && p.balloonEso) ov.balloons.append(s('rect', { x: 792, y: 190, width: 20, height: 84, rx: 10, class: 'balloon-shape' }));
    if (anat && p.balloonGas) ov.balloons.append(s('circle', { cx: SITES.fundus[0], cy: SITES.fundus[1], r: 24, class: 'balloon-shape' }));
    mk.ver++;
    marksSync();
  }

  // ── Labels: a screen-space layer (SVG) laid out every frame ──
  // Text keeps a constant on-screen size whatever the zoom. Every label is a block with a
  // priority and a list of candidate positions; blocks are placed greedily, most important
  // first, and a block that cannot be placed without a collision is dropped. Anatomy on a wide
  // stage uses atlas columns in the margins with leader lines; everything else is placed
  // around its anchor. The same layer is serialized into exported figures.
  const labelSvg = wrap.querySelector('#labels');
  // Frosted pane behind the liver card: a backdrop blur needs an HTML element, and the labels are SVG.
  const glass = h('div', { class: 'lb-glass', 'aria-hidden': 'true', hidden: true });
  labelSvg.before(glass);
  const gLeaders = s('g', { class: 'lb-leaders' });
  const gLabels = s('g', { class: 'lb-blocks' });
  const gScan = s('g', { class: 'lb-scan off' }, s('path', { class: 'leader scan' }), s('circle', { class: 'leader-dot scan', r: 2.6 }));   // the FibroScan callout's leader: its own layer, so it eases with the probe
  // (A reading that has to sit on its vessel (layoutLabels, onVessel) takes a wide text halo in the stage's colour: .on-vessel in
  // app.css. Never an SVG filter: the grown-glyph filter drew dark boxes on iPhone and was redrawn on every frame: 16 Oct.)
  labelSvg.append(gLeaders, gScan, gLabels);
  const FONT = 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const measure = document.createElement('canvas').getContext('2d');
  const widths = new Map();
  function textW(t, size, weight = 500, track = 0) {
    // Labels draw tabular digits (every digit as wide as a zero), so measure them that way too:
    // a value ticking from 6.0 to 6.1 then keeps its width and its label stays put. (Kept by that text too, so a ticking
    // value is measured once, not once for every value it passes through.)
    const z = t.replace(/\d/g, '0'), k = `${weight}|${size}|${track}|${z}`;
    let w = widths.get(k);
    if (w == null) { measure.font = `${weight} ${size}px ${FONT}`; w = measure.measureText(z).width + track * size * z.length; widths.set(k, w); }
    return w;
  }
  document.fonts?.ready?.then(() => { widths.clear(); labelFonts++; if (F) updateLabels(F); });

  // Label text size: the reader's choice (Menu › Text size), and a larger baseline in the circuit,
  // whose labels are the map's only text. Every run's size and spacing is scaled by labelK.
  const CIRCUIT_LABEL_K = 1.22;
  const LABEL_MIN = TEXT_MIN, LABEL_MAX = TEXT_MAX;   // (a size saved below 100 % reads as 100 %)
  // Where a map direction lands on the screen once the circuit is turned a quarter turn counter-clockwise.
  const TURN_DIR = { N: 'W', W: 'S', S: 'E', E: 'N', NE: 'NW', NW: 'SW', SW: 'SE', SE: 'NE', C: 'C' };
  // A desktop (a wide screen and a mouse) is read from farther away: its 100 % is half as large again as a phone's or tablet's.
  const deskMQ = matchMedia('(min-width: 1024px) and (pointer: fine)');
  // One label size on every screen and window width at 100 % (the laptop's): only the label setting changes it.
  const deskK = () => 1.5;
  let labelScale = (() => {
    try {
      let v = parseFloat(localStorage.getItem('pps.labelScale'));
      // A size saved before that desktop baseline keeps a raised size where it was, and is never below the new 100 %.
      if (localStorage.getItem('pps.labelScaleV') !== '2') {
        if (v && deskMQ.matches) { v = Math.max(1, Math.round((v / 1.5) * 100) / 100); localStorage.setItem('pps.labelScale', String(v)); }
        localStorage.setItem('pps.labelScaleV', '2');
      }
      return clamp(v || 1, LABEL_MIN, LABEL_MAX);
    } catch { return 1; }
  })();
  // Every label on a figure (the lobule's too) reads the same scale.
  document.documentElement.style.setProperty('--label-k', String(labelScale * deskK())); document.documentElement.style.setProperty('--label-scale', String(labelScale)); document.documentElement.style.setProperty('--ts', String(labelScale));
  let labelK = labelScale * deskK();
  // Projection ramp: presenting sets the atlas labels at projector sizes (at 2: values 28 px, names 23 px),
  // readable from the back of a room. The presenter passes a scale for the screen it is on.
  let projecting = false;
  // (Projecting, the projector's size times the viewer's own text size from Settings.)
  const labelBase = () => (projecting ? (typeof projecting === 'number' ? projecting : 2) * labelScale : labelScale * deskK());
  // (A window dragged between a desktop's width and a narrow one: the labels follow; a presentation sets its own.)
  deskMQ.addEventListener?.('change', () => { if (projecting) return; document.documentElement.style.setProperty('--label-k', String(labelScale * deskK())); document.documentElement.style.setProperty('--label-scale', String(labelScale)); document.documentElement.style.setProperty('--ts', String(labelScale)); dispatchEvent(new Event('pps:labelscale')); });
  // A line is a list of runs { t, size, weight, cls, track }. Returns [width, height].
  // A run's size on screen: its role (reading, name, caption) at this screen's size, times the text size setting;
  // a presentation raises it to the projector's size (never below Explore's).
  const fontPx = (size) => rolePx(roleOf(size)) * labelScale * (projecting ? Math.max(1, Math.min(typeof projecting === 'number' ? projecting : 2, 2.2) / 1.5) : 1);
  const LINE_H = (line) => Math.max(...line.map((r) => fontPx(r.size))) * 1.24;
  const lineW = (line) => line.reduce((w, r, i) => w + textW(r.t, fontPx(r.size), r.weight, r.track || 0) + (i ? (r.gap ?? 3) * labelK : 0), 0);

  const pool = new Map(); // key → { g, sig, … }
  function blockEl(key, cls, interactiveNode, onClick) {
    let b = pool.get(key);
    if (b) return b;
    const g = s('g', { class: 'lb ' + cls, 'data-key': key });
    const act = onClick || (interactiveNode ? () => onSelect({ type: 'node', id: interactiveNode }) : null);
    if (act) {
      g.setAttribute('tabindex', '0'); g.setAttribute('role', 'button');
      g.addEventListener('click', act);
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); } });
    }
    gLabels.append(g);
    b = { g, sig: '', seen: 0 };
    pool.set(key, b);
    return b;
  }
  let frameNo = 0;
  // A label the layout moves (a slide's or a patient's change found it a new spot) glides there instead of jumping (17 Oct: "labels and
  // callouts all snap"). It keeps its offset from the point it names, so it still follows the camera exactly and only a change of that
  // offset eases; labels with no point (the organs' names, the lanes) glide only while the camera is still. A label just shown, or one
  // laid out while the figure is hidden (the presenter's camera move, the catheter, the lobule), takes its spot at once.
  let glideCam = '', glideRaf = 0;
  const glideAt = (g, now) => { const u = easeInOut(clamp((now - g.t0) / LABEL_GLIDE_MS, 0, 1)); return [g.fx + (g.tx - g.fx) * u, g.fy + (g.ty - g.fy) * u]; };
  function labelGlide(out) {
    const now = performance.now(), cam = [CTM.a, CTM.b, CTM.e, CTM.f].map((v) => v.toFixed(2)).join();
    const still = cam === glideCam;
    glideCam = cam;
    const snap = reduceMotion.matches || camMove || wrap.classList.contains('cam-move') || wrap.classList.contains('cath-on') || !!lz?.isOpen();
    let moving = false;
    for (const it of out) {
      const b = pool.get(it.key);   // (a label with no block yet is new: it fades in where it stands)
      if (!b) continue;
      if (it.hide || it.live || it.fixedLead || it.key === 'scan') { b.gl = null; b.at = null; continue; }
      const rel = Number.isFinite(it.ax) && Number.isFinite(it.ay) && it.cls !== 'organ' && it.cls !== 'lane';
      const ox = rel ? it.ax : 0, oy = rel ? it.ay : 0, tx = it.x - ox, ty = it.y - oy;
      if (!b.at || snap || b.rot !== !!it.rot || b.rel !== rel || (!rel && !still)) b.gl = null;
      else {
        let g = b.gl;
        const [px, py] = g ? [g.tx, g.ty] : b.at;
        if (Math.hypot(tx - px, ty - py) > 0.5) { const [sx, sy] = g ? glideAt(g, now) : b.at; g = b.gl = { fx: sx, fy: sy, tx, ty, t0: now }; }
        if (g && now - g.t0 >= LABEL_GLIDE_MS) b.gl = g = null;
        if (g) { g.tx = tx; g.ty = ty; const [sx, sy] = glideAt(g, now); it.x = ox + sx; it.y = oy + sy; moving = true; }
      }
      b.at = [tx, ty]; b.rel = rel; b.rot = !!it.rot;
    }
    // (Laid out again each frame until every glide lands; nothing else runs the layout while the figure is still.)
    if (moving && !glideRaf) glideRaf = nextFrame(() => { glideRaf = 0; if (F && !camMove) updateLabels(F, true); });
  }
  // The leader lines and their dots, kept by the label they belong to: a new one fades in, one no longer wanted fades out, and the
  // rest are moved in place (rebuilt wholesale, they popped in and out with every change).
  const leadEls = new Map();
  function paintLeaders(want) {
    const keep = new Set(want.map((w) => w.k)), els = [];
    for (const w of want) {
      let el = leadEls.get(w.k);
      if (el && el.tagName !== w.tag) { el.remove(); el = null; }
      if (!el) { el = s(w.tag, {}); leadEls.set(w.k, el); }
      if (el._gone) { clearTimeout(el._gone); el._gone = 0; el.classList.remove('ld-gone'); }
      for (const [a, v] of Object.entries(w.at)) setA(el, a, v);
      els.push(el);
    }
    // (A new one goes in just before the next one wanted that is already in, so every line still lies under every dot.)
    for (let i = els.length - 1, next = null; i >= 0; i--) { if (!els[i].isConnected) gLeaders.insertBefore(els[i], next); next = els[i]; }
    dprDots();
    for (const [k, el] of leadEls) {
      if (keep.has(k) || el._gone) continue;
      if (reduceMotion.matches) { el.remove(); leadEls.delete(k); continue; }
      el.classList.add('ld-gone');
      el._gone = setTimeout(() => { if (leadEls.get(k) === el && el._gone) { el.remove(); leadEls.delete(k); } }, 360);
    }
  }
  const termTone =(id) => { const st = store.get(); return (st.presenting && st.presentTerms?.[id]) || null; };
  function renderBlock(it) {
    const b = blockEl(it.key, it.cls, it.node, it.onClick);
    b.seen = frameNo;
    b.g.classList.toggle('ring', / ring\b/.test(it.cls));   // (a slide's pill that could find no spot off the vessels: see the focus callout)
    // A presenter slide's term (presentTerms): the station's label takes the term's colour, eased (.lb.term).
    const tone = it.node ? termTone(it.node) : null;
    if (tone !== (b.tone || null)) { b.tone = tone; b.g.classList.toggle('term', !!tone); if (tone) b.g.style.setProperty('--term', toneCol(tone)); }   // (a tone may name its own token, '--tour-sys' for the right atrium: as var(--tr---tour-sys) it was unset and the label fell back to black, dark on dark in the dark theme)
    if (!!it.onVessel !== !!b.onVessel) { b.onVessel = !!it.onVessel; b.g.classList.toggle('on-vessel', b.onVessel); }
    // Text and pressure colors change far more often than label structure.
    // Retain the text nodes (and keyboard focus) across numeric updates. (A run's class is its colour, as its fill is: a change
    // badge turning from + to − swaps its class on the same tspan rather than building the label again: 16 Oct.)
    // (A slide's mark is drawn afresh when its words change: a pill kept from another slide's longer mark could hold its old width
    // for a while after the new one was set: Review 16 Oct.)
    const sig = JSON.stringify([it.lines.map((line) => line.map(({ t, fill, cls, ...style }) => style)), it.align, !!it.swatch, it.bg, !!it.hit, it.cls, labelK, fontPx(14), it.fxw ?? (/^focus/.test(it.key) ? it.lines.map((line) => line.map((r) => r.t).join('')) : 0)]);
    if (sig !== b.sig) {
      b.sig = sig;
      const kids = [];
      b.spans = [];
      b.textLines = [];
      if (it.bg) kids.push(s('rect', { class: 'lb-bg', x: -it.padX, y: -it.padY, width: it.w + 2 * it.padX, height: it.h + 2 * it.padY, rx: it.pill ? (it.h + 2 * it.padY) / 2 : 6 }));
      // A clickable caption is a larger target than its small letters.
      if (it.hit) kids.push(s('rect', { class: 'lb-hit', x: -10, y: -8, width: it.w + 20, height: it.h + 16, rx: 8 }));
      let y = 0;
      const tx = it.swatch ? (it.align === 'end' ? it.w - 7 : 7) : 0;
      for (const line of it.lines) {
        const lh = LINE_H(line);
        const t = s('text', { x: it.align === 'end' ? it.w - (it.swatch ? 7 : 0) : it.align === 'middle' ? it.w / 2 : tx, y: y + lh * 0.78, 'text-anchor': it.align === 'end' ? 'end' : it.align === 'middle' ? 'middle' : 'start' });
        b.textLines.push(t);
        line.forEach((r, i) => {
          const sp = s('tspan', { class: r.cls || '', 'font-size': +fontPx(r.size).toFixed(2), 'font-weight': r.weight || 500 });
          if (i) sp.setAttribute('dx', +((r.gap ?? 3) * labelK).toFixed(2));
          if (r.track) sp.setAttribute('letter-spacing', `${r.track}em`);
          sp.textContent = r.t;
          b.spans.push(sp);
          t.append(sp);
        });
        kids.push(t);
        y += lh;
      }
      if (it.swatch) kids.unshift(s('rect', { class: 'lb-sw', x: it.align === 'end' ? it.w - 3 : 0, y: 1, width: 3, height: Math.max(8, it.h - 2), rx: 1.5 }));
      b.g.replaceChildren(...kids);
      // (A slide's mark that stays but takes new words fades the new words in, never swaps them in at once.)
      // (A live callout's words keep their shape as its numbers tick: it.fxw, so only a new slide's words fade in.)
      const words = it.fxw ?? (/^focus/.test(it.key) ? it.lines.map((line) => line.map((r) => r.t).join('')).join('\n') : null);
      if (words != null && b.words != null && words !== b.words && b.g.style.display !== 'none' && !reduceMotion.matches) b.g.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 400, easing: 'ease-out' });
      b.words = words;
      b.sw = it.swatch ? b.g.querySelector('.lb-sw') : null;
      b.bg = b.g.querySelector('.lb-bg');
    }
    let i = 0;
    for (const line of it.lines) for (const r of line) {
      const sp = b.spans[i++];
      putText(sp, r.t);
      if (sp.getAttribute('class') !== (r.cls || '')) sp.setAttribute('class', r.cls || '');
      if ((sp._fill || '') !== (r.fill || '')) { sp._fill = r.fill || ''; sp.style.fill = sp._fill; }
    }
    for (const text of b.textLines) setA(text, 'x', it.align === 'end' ? it.w - (it.swatch ? 7 : 0) : it.align === 'middle' ? it.w / 2 : it.swatch ? 7 : 0);
    if (b.bg) { setA(b.bg, 'width', it.w + 2 * it.padX); setA(b.bg, 'height', it.h + 2 * it.padY); }
    if (it.label) setA(b.g, 'aria-label', it.label);
    if (b.sw) { setA(b.sw, 'fill', it.swatch); setA(b.sw, 'x', it.align === 'end' ? it.w - 3 : 0); }
    b.g.classList.toggle('sel', !!it.sel);
    b.g.classList.toggle('lb-off', !!it.hide);
    if (it.key === 'liver') {
      glass.style.transform = `translate(${(it.x - it.padX).toFixed(1)}px, ${(it.y - it.padY).toFixed(1)}px)`;
      glass.style.width = `${(it.w + 2 * it.padX).toFixed(1)}px`; glass.style.height = `${(it.h + 2 * it.padY).toFixed(1)}px`;
    }
    // A turned caption reads bottom to top: its box's top-left is (x, y), and its text runs up from the bottom.
    setA(b.g, 'transform', it.rot ? `translate(${it.x.toFixed(1)} ${(it.y + it.w).toFixed(1)}) rotate(-90)` : `translate(${it.x.toFixed(1)} ${it.y.toFixed(1)})`);
    b.gone = null;
    b.g.style.display = '';
  }

  const rectOf = (it) => ({ x0: it.x - it.padX, y0: it.y - it.padY, x1: it.x + it.w + it.padX, y1: it.y + it.h + it.padY });
  const hits = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
  // Whether the segment (x0, y0) → (x1, y1) passes through the box (clipped against it, Liang–Barsky).
  const crosses = (x0, y0, x1, y1, b) => {
    let t0 = 0, t1 = 1;
    const dx = x1 - x0, dy = y1 - y0;
    for (const [p, q] of [[-dx, x0 - b.x0], [dx, b.x1 - x0], [-dy, y0 - b.y0], [dy, b.y1 - y0]]) {
      if (!p) { if (q < 0) return false; continue; }
      const r = q / p;
      if (p < 0) t0 = Math.max(t0, r); else t1 = Math.min(t1, r);
      if (t0 > t1) return false;
    }
    return true;
  };
  const within = (r, B) => r.x0 >= B.x0 && r.y0 >= B.y0 && r.x1 <= B.x1 && r.y1 <= B.y1;
  // Candidate offset of a block around its anchor.
  // A ring's sixteen spots, level ones first (east, west), then ever further from level.
  const RING_DIRS = [0, 8, 1, 15, 7, 9, 2, 14, 6, 10, 3, 13, 5, 11, 4, 12].map((k) => 'R' + k);
  // Spots for a mark's centre around its station, every 6 px out to 150, nearest first (see the focus callout).
  const MARK_GRID = [];
  for (let x = -150; x <= 150; x += 6) for (let y = -150; y <= 150; y += 6) if (Math.hypot(x, y) <= 150 && Math.hypot(x, y) >= 24) MARK_GRID.push([x, y]);
  MARK_GRID.sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
  // (Steps for a Circuit reading pulled onto a station's ring, every 4 px out to 120, nearest first: see layoutLabels.)
  const PULL_GRID = [];
  for (let x = -120; x <= 120; x += 4) for (let y = -120; y <= 120; y += 4) if ((x || y) && Math.hypot(x, y) <= 120) PULL_GRID.push([x, y]);
  PULL_GRID.sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
  function offset(dir, it, gap) {
    const { w, h: hh } = it;
    const d = gap * 0.72;
    switch (dir) {
      case 'N': return [-w / 2, -gap - hh];
      case 'S': return [-w / 2, gap];
      case 'E': return [gap, -hh / 2];
      case 'W': return [-gap - w, -hh / 2];
      case 'EL': return [gap, -hh * 0.2];   // (beside it, a little low: a one-line reading at the top edge of the free space)
      case 'WL': return [-gap - w, -hh * 0.2];
      case 'NE': return [d, -d - hh];
      case 'NW': return [-d - w, -d - hh];
      case 'SE': return [d, d];
      case 'SW': return [-d - w, d];
      default:
        // 'R<k>': centred on a ring of radius gap around the anchor, k sixteenths of a turn from due east (RING_DIRS)
        if (dir[0] === 'R') { const a = (+dir.slice(1) * Math.PI) / 8; return [gap * Math.cos(a) - w / 2, gap * Math.sin(a) - hh / 2]; }
        return [-w / 2, -hh / 2]; // 'C': centered on the anchor
    }
  }

  const REF = () => {
    const st = store.get();
    if (!st.compareSnap && st.presenting && st.colorMode === 'since') return sinceRef();
    return st.compareSnap ? st.compareSnap.P : st.healthy?.P;
  };
  // A "change since" slide's reference (deck visuals V11, ext-highlights.js: lens 'since'): the network its slide counts from
  // (changeRef), and until that is set the one the figure showed as the lens came in, so the colours move as the change lands.
  // It never touches Patients' pinned moment (compareSnap). A new reference recolours through the lens crossfade, as a jump does.
  const sinceRef = () => { if (!sinceP && F) sinceP = Float32Array.from(F.Pf || F.P); return sinceP || store.get().healthy?.P; };
  sinceSource(sinceRef);   // (the lobule's colours count from the same reference: since-ref.js)
  function changeRef(P) {
    const was = sinceP;
    sinceP = P ? Float32Array.from(P) : null;
    if (was === sinceP || store.get().colorMode !== 'since') return;
    if (shownCol.size && !reduceMotion.matches) { lensFrom = shownCol; lensT0 = performance.now(); }
    // (Cleared as a slide leaves, the next model frame takes the figure's state then as its reference: no redraw here.)
    if (P && F && !inUpdate) update(F);
  }
  // A slide's change ripple (deck visuals V6, ext-highlights.js: ripple): the vessels whose pressure moved between two of its
  // states glow warm (up) or cool (down) for a moment, as Patients' Δ glow does after a change, without its rings and numbers.
  // (Stronger, wider and held longer than Patients' Δ glow: on a slide the vessel under it often already wears the same blue or
  // red, from the Change colours, so only its halo shows it.)
  const RIPPLE_AMT = 2, RIPPLE_HOLD = 1600;
  let rippleT = 0;
  function ripple(from, to) {
    clearTimeout(rippleT);
    const list = from && to && !quietFx() ? rippleList(EDGES, NI, from, to, (e) => { const x = E[e.id]; return !!x?.vis && !x.isArt && !x.g.classList.contains('coll-ghost'); }) : [];
    const cs = getComputedStyle(svg), lift = clamp(cssNum(cs, '--ripple-lift', 0), 0, 1);
    const tone = (v) => { const c = mix3(toRGB(v, cs), [1, 1, 1], lift); return `rgb(${c.map((x) => Math.round(x * 255)).join(', ')})`; };   // colour-exempt: built from the glow tokens
    const up = tone('var(--glow-up)'), down = tone('var(--glow-down)');
    setGlowSrc('delta', list.map(([id, d]) => ({ id, col: d > 0 ? up : down, amt: RIPPLE_AMT, wide: 1.3, dur: 420 })));
    if (list.length) rippleT = setTimeout(() => setGlowSrc('delta', []), RIPPLE_HOLD);
  }
  const isImaging = () => !!store.get().imaging;
  // Captions of findings (varices, collaterals) can stay hidden until a test shows them.
  const labelHidden = (id) => !!store.get().hiddenLabels?.has(id);
  // The active data layer (what vessel color encodes).
  function layerMode() {
    const st = store.get();
    return isImaging() ? 'neutral' : st.compareSnap && st.compareView === 'D' ? 'delta' : st.colorMode;
  }
  // Mean velocity in a vessel, cm/s (flow mL/s over the lumen the probe sees: velNormal.js, shared with every readout).
  const edgeVel = meanVel;
  // Blood entering a node per minute (L/min), from every model vessel.
  function throughput(Q, id) {
    let sum = 0;
    for (let k = 0; k < EDGES.length; k++) {
      const e = EDGES[k];
      if (e.kind === 'wedge') continue;
      if (e.to === id && Q[k] > 0) sum += Q[k];
      else if (e.from === id && Q[k] < 0) sum -= Q[k];
    }
    return sum * 0.06;
  }

  // A change badge (+3) appears at `on` and goes only below `off`: a value hovering at the
  // threshold would otherwise add and drop the badge every beat, and its label would jump.
  const badges = new Map();
  const DELTA_MIN = 5;
  function badge(key, v, on, off) {
    const shown = v >= on || (badges.get(key) && v >= off);
    badges.set(key, shown);
    return shown;
  }
  function pressureRuns(P, id, compact) {
    if (!store.get().layers.chips || isImaging()) return null;
    const [v, u] = fp(P);
    const runs = [{ t: v, size: 14, weight: 650, cls: 'lb-val' }, { t: u, size: 10, weight: 500, cls: 'lb-unit', gap: 2.5 }];
    // A change from healthy is shown only once it matters clinically (5 mmHg, the upper limit
    // of a normal HVPG); while comparing, every change from the pinned moment is shown. Deltas
    // are neutral ink: red is kept for crossed thresholds.
    const ref = REF()?.[NI[id]], cmp = !!store.get().compareSnap;
    if (ref != null && deltaHere(id) && badge((cmp ? 'pc:' : 'p:') + id, Math.abs(P - ref), cmp ? 1 : DELTA_MIN, cmp ? 0.7 : DELTA_MIN - 1)) runs.push({ t: signed(P - ref, fmt(Math.abs(P - ref), 1)), size: 10.5, weight: 650, cls: 'lb-delta ' + (P > ref ? 'up' : 'down'), gap: 6 });
    return runs;
  }
  // A change reads "+7.9" or "−7.9", in the reading's own colour (17 Oct design review: an arrowed change beside every reading doubled the
  // numbers on the figure). On a slide only the stations its words point at carry it (presentTerms); every callout keeps its reading.
  const signed = (d, txt) => `${d > 0 ? '+' : '−'}${txt}`;
  const deltaHere = (id) => !store.get().presenting || !!termTone(id);

  // Flow layer: blood entering the station (L/min) and its change; velocity layer: the fastest
  // velocity in a vessel at the station as the Doppler reads it (peak, cm/s); oxygen layer: the blood's
  // oxygen saturation at the station (%), the value the lens colours by. Other layers read pressure.
  function layerRuns(f, id, compact) {
    const lm = layerMode();
    if (lm !== 'flow' && lm !== 'velocity' && lm !== 'oxygen') return null;
    if (!store.get().layers.chips) return null;
    const big = { size: 14, weight: 650, cls: 'lb-val' }, unit = { size: 10, weight: 500, cls: 'lb-unit', gap: 2.5 };
    if (lm === 'oxygen') {
      const sat = oxygenFor(EDGES, NODES, f).node[NI[id]];
      return { runs: [{ ...big, t: fmt(sat * 100, 0) }, { ...unit, t: '% O₂' }], color: oxygenColor(sat) };
    }
    if (lm === 'flow') {
      const v = throughput(f.Qf || f.Q, id);
      const runs = [{ ...big, t: fmtFlow(v) }, { ...unit, t: 'L/min' }];
      const refQ = store.get().healthy?.Q;
      if (refQ && !store.get().compareSnap) {
        const r = throughput(refQ, id);
        if (r > 0.02 && deltaHere(id) && badge('q:' + id, Math.abs(v - r) / r, 0.3, 0.25)) runs.push({ t: signed(v - r, `${Math.round(Math.abs(v - r) / r * 100)}%`), size: 10.5, weight: 650, cls: 'lb-delta ' + (v > r ? 'up' : 'down'), gap: 6 });
      }
      return { runs, color: flowColor(v) };
    }
    let best = 0, bestK = -1, tubes = 0, bed = false;
    for (const x of EV) {
      if (!x.vis || x.isArt || (x.e.from !== id && x.e.to !== id)) continue;
      if (x.e.kind === 'liver') { bed = true; continue; }
      if (x.g.classList.contains('coll-ghost') || x.e.id === 'TIPS' || x.e.id === 'DIPS') continue;   // the TIPS and DIPS shunts have their own velocity label
      tubes++;
      const v = Math.abs(edgeVel(f, EI[x.e.id])) * dopplerK(x.e);
      if (bestK < 0 || v > best) { best = v; bestK = EI[x.e.id]; }
    }
    // (A station named for a vessel reads that vessel, so "Portal v." is the portal vein the Doppler samples, not a faster
    // collateral or tributary joining it.)
    const own = STATION_VESSEL[id], ox = own && EV.find((x) => x.e.id === own && x.vis);
    if (ox) { bestK = EI[own]; best = Math.abs(edgeVel(f, bestK)) * dopplerK(EDGES[bestK]); }
    if (bestK >= 0) best = shownVelOf(EDGES[bestK].id, f, best);
    // A microvascular bed has no single velocity; a station whose only vessels are closed
    // collaterals carries no flow at all (not stasis in an open vessel).
    if (!tubes) return { runs: [{ ...unit, t: bed ? 'microcirculation' : 'collaterals closed', gap: 0 }], color: 'var(--lens-neutral)' };
    const runs = [{ ...big, t: fmt(best, 0) }, { ...unit, t: 'cm/s' }];
    // (Named as the Doppler names it: velNormal.js judgeFlow, under 1 cm/s no flow, under 9 stasis.)
    const jf = judgeFlow(best, null, null);
    if (jf.none || jf.stasis) runs.push({ t: jf.none ? 'no flow' : 'stasis', size: 10.5, weight: 650, cls: 'lb-alert', gap: 6 });
    return { runs, color: velColorOf(f, bestK, store.get().healthy) };
  }

  // A vessel's name read as its abbreviation ("Right portal vein" → "RPV"): false where it has none or already reads it.
  function abbrevName(it) {
    const a = !it.abbr && it.node && ABBR[it.node], r = a && it.lines[0][0], full = SHORT[it.node];
    if (!r || !r.t.startsWith(full)) return false;
    it.lines = [[{ ...r, t: a + r.t.slice(full.length) }, ...it.lines[0].slice(1)], ...it.lines.slice(1)];
    it.w = Math.max(...it.lines.map(lineW)); it.abbr = true;
    return true;
  }
  // Where a label has no room with its value, a vessel first takes its abbreviation (abbr: "RPV 9.8 mmHg"), then drops the unit
  // and change badge (keeping "Azygos 6.7"), then keeps the name alone (see placeMulti and the overlap pass). it.short: 1 trimmed,
  // 2 the name alone. (abbr false: the trimming steps only, as the circuit's one unit rule takes them.)
  function shortenItem(it, abbr = true) {
    if (abbr && abbrevName(it)) return true;
    if (it.short === 2 || (it.lines.length < 2 && it.lines[0].length < 2)) return false;
    const val = !it.short && it.lines.length === 2 ? it.lines[1].filter((r) => r.cls === 'lb-val') : [];
    if (val.length && val.length < it.lines[1].length) {
      it.lines = [it.lines[0], val]; it.w = Math.max(...it.lines.map(lineW)); it.h = it.lines.reduce((a, l) => a + LINE_H(l), 0); it.short = 1;
      return true;
    }
    it.lines = [[it.lines[0][0]]]; it.w = lineW(it.lines[0]); it.h = LINE_H(it.lines[0]); it.short = 2;
    return true;
  }
  const shortenTo = (it, lvl, abbr = false) => { if (abbr) abbrevName(it); while ((it.short || 0) < lvl && shortenItem(it, false)); };
  // A Circuit reading set on one line, its name then its value (a rescued reading where two lines have no room: layoutLabels).
  function oneLine(it) {
    if (it.lines.length !== 2) return;
    it.lines = [[...it.lines[0], ...it.lines[1].map((r, i) => (i ? r : { ...r, gap: 4 }))]]; it.w = lineW(it.lines[0]); it.h = LINE_H(it.lines[0]); it.one = true;
  }
  function nodeItem(id, f, mode, compact) {
    const st = store.get();
    const meta = ATLAS_LABELS[id];
    let P = (f.Pf || f.P)[NI[id]];
    // On a slide, a station the tiles and words also read shows their reading: the measured one (the wedge, not the
    // sinusoid node), and once it has settled, the slide's settled value itself, so the callouts, tiles and words agree.
    // (The right atrium is read over two breaths, as the tiles and the bar read it: its a and v waves swing the beat-by-beat
    // value 0.8 mmHg, which put "RA 3.6" beside a card and words saying 2.9 on the IVC web slide.)
    const pin = pinned(), mk = pin && LADDER_KEY[id], live = mk && (mk === 'ra' ? f.metrics?.vitals?.ra ?? f.metrics?.ra : f.metrics?.[mk]), fp = mk && pin[mk];
    if (Number.isFinite(live)) P = Number.isFinite(fp) && Math.abs(live - fp) < breath(fp) ? fp : live;
    else if (pin && Number.isFinite(P)) {   // (a station the tiles do not read: the slide's own number while the model agrees, else its mean over several breaths)
      const at = pin.at?.P[NI[id]];
      P = Number.isFinite(at) && Math.abs(P - at) < breath(at) ? at : beatMean('n:' + id, P, 6);
    }
    let name = mode === 'atlas' ? (meta?.name || NODES[NI[id]].label) : (SHORT[id] || id);
    // On a presenter's ladder and catheter slides, the stations the ladder names carry its name too (one vocabulary).
    if (st.presenting && st.presentNames && LADDER_TAG[id]) name += ` · ${LADDER_TAG[id]}`;
    // On a small screen an inline label is one quiet line (name, value) on a text halo, not a
    // two-line card: it covers as little of the anatomy as it can.
    const one = mode === 'inline';   // one line, no box, on every screen (as on a phone)
    const lines = [[{ t: name, size: 11.5, weight: one ? 600 : 500, cls: 'lb-name' }]];
    const sel = st.selection?.type === 'node' && st.selection.id === id;
    const lr = isImaging() ? null : layerRuns(f, id, compact);
    const pr = lr ? lr.runs : pressureRuns(P, id, compact);
    // A station whose own vessel's flow has reversed carries ⟲ after its value, in the reversed-flow orange (blueprint §6.2).
    const rev = !!pr && revShown.has(STATION_VESSEL[id]);
    if (rev) pr.push({ t: '⟲', size: 12, weight: 650, cls: 'lb-rev', gap: 5 });
    if (pr && one) lines[0].push(...pr.map((r, i) => (i ? r : { ...r, gap: 4 })));
    else if (pr) lines.push(pr);
    const w = Math.max(...lines.map(lineW)) + (mode === 'atlas' ? 7 : 0);
    const hh = lines.reduce((a, l) => a + LINE_H(l), 0);
    return { key: 'n:' + id, src: ['node', id, mode, compact], node: id, cls: 'node ' + mode + (one ? ' bare' : ''), lines, w, h: hh, sel, canShort: !!pr && mode !== 'atlas', label: `${NODES[NI[id]].label}${lr ? `: ${lr.runs.filter((r) => r.cls !== 'lb-rev').map((r) => r.t).join(' ')}` : pr ? `: ${fmt(P, 1)} millimeters of mercury` : ''}${rev ? ', flow reversed' : ''}`,
      swatch: mode === 'atlas' && pr ? (lr ? lr.color : layerMode() === 'heat' ? heatColor(P - (REF()?.[NI[id]] ?? P)) : pressureColor(P)) : null, bg: mode === 'inline' && !one, padX: mode === 'inline' && !one ? 6 : 3, padY: mode === 'inline' && !one ? 3 : 2 };
  }

  // A number that pulses with each beat, read as its mean over the last few seconds (as a tile or the Doppler shows it).
  const emas = new Map();
  function beatMean(key, x, tau) {
    if (!Number.isFinite(x)) return x;
    const now = performance.now(), e = emas.get(key);
    if (!e || now - e.t > 3000) { emas.set(key, { v: x, t: now, n: 1 }); return x; }
    e.n++; e.v += (x - e.v) * Math.max(1 / e.n, 1 - Math.exp(-(now - e.t) / 1000 / tau)); e.t = now;   // (a plain average until tau has passed: the first beats do not set it)
    return e.v;
  }
  // A vessel's velocity as a callout shows it (cm/s, Doppler peak; now: the live reading): the Doppler's own number while
  // it samples that vessel, else on a slide the slide's own velocity while the model agrees, else a mean over a few beats.
  // So a station's callout and the monitor beside it read one number.
  function shownVelOf(id, f, now) {
    const dop = shownVel.get(id);
    if (dop && !dop.seg && performance.now() - dop.t < 1000) return dop.v;
    const at = pinned()?.at, k = EI[id];
    const fixed = at && Math.abs(edgeVel(at, k)) * dopplerK(EDGES[k]);
    return Number.isFinite(fixed) && Math.abs(now - fixed) < Math.max(4, fixed * 0.12) ? fixed : beatMean('v:' + id, now, 6);
  }
  // A TIPS or DIPS shunt's callout: the velocity through it (cm/s), as Doppler reads it (its own mean while it is on that shunt).
  // point: one of the stent's three points ('proximal' | 'mid' | 'distal'), on a slide that calls out all three (dop.all); each
  // reads what the Doppler's tile for that point reads, and the sampled one is named in the Doppler's green.
  function velItem(sid, f, point = null) {
    const it = nodeItem('RPV', f, 'inline', stageBox().width < 700);
    const dop = shownVel.get(sid), at = pinned()?.at, now = Math.abs(edgeVel(f, EI[sid])) * dopplerK(EDGES[EI[sid]]);
    const fixed = at && Math.abs(edgeVel(at, EI[sid])) * dopplerK(EDGES[EI[sid]]);   // (the slide's own velocity, as its tiles read the slide)
    const live = Number.isFinite(fixed) && Math.abs(now - fixed) < Math.max(4, fixed * 0.12) ? fixed : beatMean('v:' + sid, now, 6);
    // (Between Doppler reports, the callout reads the third the Doppler samples itself, so it never falls back to the open stent's number.)
    const gated = dopGateOf(sid), p = f.viewParams || store.get().params, pt = point || gated, fresh = dop && performance.now() - dop.t < 1000;
    const factor = pt ? stentSegments(1, 1 - (1 - (p?.stenosis?.[sid] || 0)) * (1 - (p?.thrombus?.[sid] || 0)), stentSite(p, sid))[['proximal', 'mid', 'distal'].indexOf(pt)] : 1;
    // (The sampled point reads the monitor's own number; the other two, the open stent's velocity the monitor's tiles read them from.)
    const vel = fresh && pt === gated ? dop.v : (fresh && Number.isFinite(dop.open) ? dop.open : live) * factor;
    // (Read by the Doppler at one third of the stent, the callout names it: "TIPS distal".)
    const seg = pt ? ` ${pt}` : '', sampled = !!point && point === gated;
    // (A phone's three points read short, "Prox 99 cm/s", so the column fits beside a small stent.)
    const name = point && stageBox().width < 700 ? { proximal: 'Prox', mid: 'Mid', distal: 'Dist' }[point] : sid + seg;
    // (An occluded stent reads "No flow", as the Doppler's strip does, not "0 cm/s": under 2 cm/s the Doppler calls a stent occluded.)
    const none = judgeFlow(vel, null, null, { stent: true }).none;
    // (A stent's point: its number in the velocity colours against the stent's own normal, sand slow, teal normal, violet fast
    // (c8e89a6), drawn toward the text colour (--vel-ink) so it reads on the label's halo, 4.5:1 at least on the light stage; the point sampled is named in bold: Review 15 Oct.)
    const nv = point ? velNormal(EI[sid], f) : null, tint = nv && !none ? `color-mix(in srgb, ${velocityColor(vel, nv)} var(--vel-ink), var(--text))` : '';
    it.lines = [[{ ...it.lines[0][0], t: name, ...(sampled ? { weight: 750, cls: 'lb-name lb-gate' } : {}) }, ...(none ? [{ t: 'No flow', size: 14, weight: 650, cls: 'lb-val', gap: 4 }]
      : [{ t: fmt(vel, 0), size: 14, weight: 650, cls: 'lb-val', gap: 4, ...(tint ? { fill: tint } : {}) }, { size: 10, weight: 500, cls: 'lb-unit', gap: 2.5, t: 'cm/s' }])]];
    it.key = point ? `n:${sid}:${point}` : `n:${sid}`; it.src = ['vel', sid, point]; it.node = undefined; it.sel = false; it.swatch = null;
    it.w = lineW(it.lines[0]); it.h = LINE_H(it.lines[0]);
    it.label = (none ? `${sid}${seg}: no flow` : `${sid}${seg}: ${fmt(vel, 0)} centimeters per second`) + (sampled ? ', sampled by the Doppler' : '');
    return it;
  }
  // The FibroScan probe's callout: the live stiffness, beside the waves, in their orange. A fixed width (the digits are tabular
  // and the box is as wide as "88.8 kPa"), so the number eases without the pill ever resizing or moving.
  function scanItem() {
    const k = scan.k ?? F?.metrics?.lsm ?? 0, txt = k >= 100 ? String(Math.round(k)) : k.toFixed(1);
    const val = { size: 14, weight: 700, cls: 'lb-scan-val' }, unit = { size: 10, weight: 600, cls: 'lb-scan-unit', gap: 3, t: 'kPa' };
    const lines = [[{ ...val, t: txt }, unit]];
    return { key: 'scan', src: ['scan'], cls: 'scan', lines, w: lineW([{ ...val, t: '88.8' }, unit]), h: LINE_H(lines[0]), align: 'middle', bg: true, pill: true, padX: 8, padY: 3,
      label: `FibroScan stiffness ${txt} kPa`, pri: 20 };
  }
  const LADDER_TAG = { SIN_R: 'WHVP', RHV: 'FHVP' };
  const LADDER_KEY = { CONF: 'pv', SIN_R: 'whvp', RHV: 'fhvp', IVCS: 'ivc', RA: 'ra' };
  const ANAT_PRI = { CONF: 10, VAR: 9, SIN_R: 9, RHV: 8, RA: 8, SV: 7, SMV: 7, GV: 7, IVCS: 6, MHV: 5, LHV: 5, RPV: 5, LPV: 5, SIN_L: 5, IMV: 4, LGV: 4, W_R: 12, W_M: 12, W_L: 12 };
  // Stations labelled only when zoomed in enough to give them room, in this order (see updateLabels).
  const ANAT_EXTRA = ['MHV', 'LHV', 'RPV', 'LPV', 'SIN_L', 'IMV', 'LGV'];

  let blockerBoxes = null, blockersAt = -1e9, blockersStale = true;
  const staleBlockers = () => { blockersStale = true; };
  addEventListener('pps:occ', staleBlockers);
  addEventListener('resize', staleBlockers);
  const appStyle = document.getElementById('app')?.style;
  const pzInset = (k) => parseFloat(appStyle?.getPropertyValue(k)) || 0;
  // The readings drawn over the figure (a slide's measuring sites and resistors, the HVPG catheter's callouts): the figure's
  // labels keep clear of them. Their boxes are worked out where they are placed (calloutBox), so this reads no layout.
  function calloutBoxes() {
    const out = [];
    for (const el of sites.made.values()) if (el._box && !el.classList.contains('cath-pre')) out.push(el._box);
    if (cath.made && !cath.labels.hidden) for (const el of cath.made.values()) if (el._box) out.push(el._box);
    if (dpr.on && dpr.box) out.push(...[dpr.box, ...dpr.marks].map((b) => ({ ...b, probe: true })));   // (the Doppler probe's body and its line of sight)
    return out;
  }
  // What the labels' slots depend on: which readings show and how big they are (where they stand follows the camera, which
  // the labels' own key already holds). A new or resized reading lays the labels out afresh, so one under it moves aside.
  const calloutSig = () => [...sites.made.values(), ...(cath.made && !cath.labels.hidden ? cath.made.values() : [])]
    .map((el) => el._box ? `${el.className}:${Math.round(el._box.x1 - el._box.x0)}x${Math.round(el._box.y1 - el._box.y0)}` : '').join('|')
    + (dpr.on && dpr.box ? `|dpr:${Math.round((dpr.box.x1 - dpr.box.x0) / 8)}x${Math.round((dpr.box.y1 - dpr.box.y0) / 8)}` : '');
  function readBlockers() {
    const wr = stageBox();
    { const r = store.get().presenting && document.querySelector('.pz-bar.pzb-pill')?.getBoundingClientRect();
      pillEdge = r?.width ? { m: Math.max(6, Math.round(wr.right - r.right)), top: r.top - wr.top } : null; }
    // (The teaching card's glass, .pz-shade, too: on a phone it reaches 16 px above the words, and a label kept off only the words
    // tucked its top under the glass, SMALL BOWEL on PVT 5 and STOMACH on Variceal bleed 3.)
    // (And the view switcher's holder over the play bar while it holds the switcher: reading labels sat under Circuit / Anatomy /
    // Lobule. By id, not the .stage-blocker class, which the credit and pan starts also read; round 2 review, G3-7.)
    return [...document.querySelectorAll('.stage-blocker:not([hidden]), .pz-shade, #nbViews')].map((el) => {
      if (el.id === 'nbViews' && !el.querySelector('#viewSeg')) return null;
      // A closed card can stay in place, invisible (the patient chart does): it hides nothing. (So does a glass with no words on it.)
      if (getComputedStyle(el).visibility === 'hidden' || (el.classList.contains('pz-shade') && (el.style.opacity === '0' || el.classList.contains('pz-leave')))) return null;
      const r = el.getBoundingClientRect();
      return r.width ? { x0: r.left - wr.left - 4, y0: r.top - wr.top - 4, x1: r.right - wr.left + 4, y1: r.bottom - wr.top + 4 } : null;
    }).filter(Boolean);
  }
  // Where a station's callout attaches: the middle of the vessel it names when that vessel is drawn
  // (see LABEL_VESSEL), else the station itself. `tan` is the vessel's direction there, on screen.
  function labelAnchor(id, t) {
    const eid = LABEL_VESSEL[id], x = eid && E[eid];
    if (x && x.vis && !x.g.classList.contains('coll-ghost') && geo[eid]?.cur?.length > 1) {
      // The middle of the vessel along its course (the sinusoids too: the middle of their bed, not their venous half).
      const [wx, wy, tx, ty] = arcMid(geo[eid].cur);
      const [ax, ay] = worldToLocal(wx, wy), [bx, by] = worldToLocal(wx + tx, wy + ty);
      const n = Math.hypot(bx - ax, by - ay) || 1;
      return { ax, ay, mid: true, tan: [(bx - ax) / n, (by - ay) / n], w: x.width || 4 };
    }
    const [ax, ay] = worldToLocal(...nodePos(id, t));
    return { ax, ay, mid: false, tan: null, w: 0 };
  }
  // Whether the esophageal (VAR) or gastric (GV) varices exist yet (the app's "none" cut-off, 2.5 mm),
  // or the learner has selected that station.
  function hasVarices(id, f) {
    const sel = store.get().selection;
    if (id === 'GV' && f.metrics.gastricVarix.d <= 0) return false;   // no gastrorenal shunt: no fundal varices
    if (sel?.type === 'node' && sel.id === id) return true;
    return varicesPresent(f, id);
  }
  // Where a leader stops: it aims at the middle of the label, as if it ran behind the text, and is
  // cut off abruptly (no fade) at a small padding around the label's box.
  function leaderEnd(r, ax, ay, pad = 6) {
    const cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2;
    const hw = (r.x1 - r.x0) / 2 + pad, hh = (r.y1 - r.y0) / 2 + pad;
    const dx = ax - cx, dy = ay - cy;
    const t = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
    return t >= 1 ? { x: ax, y: ay } : { x: cx + dx * t, y: cy + dy * t };
  }
  // Where a drawn leader stops: on the edge of what is seen of its label (the pill, or the letters' own box), never short
  // of it and never in under the letters, at any zoom (leader-end.js). (leaderEnd above still decides whether one shows.)
  // A haloed label is seen as its letters: each run of text (a name, a number, a unit) from its tallest figures' tops
  // (0.72 of its font) down to the next line, the last line's to just below its baseline, as wide as the run, plus the halo.
  const inkRects = (it) => {
    const out = [], halo = 1;
    let y = it.y, prev = [];
    it.lines.forEach((line, li) => {
      const lh = LINE_H(line), lw = lineW(line) + (it.swatch ? 7 : 0), base = y + lh * 0.78;
      let x = (it.align === 'end' ? it.x + it.w - lw : it.align === 'middle' ? it.x + (it.w - lw) / 2 : it.x) + (it.swatch ? 7 : 0);
      const row = line.map((r, i) => {
        const f = fontPx(r.size), w = textW(r.t, f, r.weight, r.track || 0);
        if (i) x += (r.gap ?? 3) * labelK;
        const b = { x0: x - halo, x1: x + w + halo, y0: base - f * 0.72 - halo, y1: base + halo };
        x += w;
        return b;
      });
      const top = Math.min(...row.map((b) => b.y0));
      for (const b of prev) b.y1 = Math.max(b.y1, top);
      out.push(...row); prev = row; y += lh;
      if (li === it.lines.length - 1) for (const b of row) b.y1 = base + halo;
    });
    return out;
  };
  const seenEnd = (it) => {
    if (it.bg) return edgeOf(rectOf(it), it.ax, it.ay) || { x: it.ax, y: it.ay };
    const rs = inkRects(it), outer = { x0: Math.min(...rs.map((r) => r.x0)), y0: Math.min(...rs.map((r) => r.y0)), x1: Math.max(...rs.map((r) => r.x1)), y1: Math.max(...rs.map((r) => r.y1)) };
    return edgeOfRects(rs, outer, it.ax, it.ay) || { x: it.ax, y: it.ay };
  };
  // ── Label placement ──
  // A label's slot is solved in figure terms and then carried rigidly: it is stored as the figure
  // point it names (its anchor, in world coordinates) plus a fixed pixel offset to its box. A pan
  // therefore only translates every label, and a zoom moves each with its anchor. Nothing is
  // searched again until the layout or the zoom genuinely changes (see labelSig). When it is, the
  // solve is sticky: a label keeps its slot unless that slot now collides. Screen-fixed things
  // (panels, cards, the stage edge) never move a label: a label under one is hidden until it clears.
  let colResolve = 0;   // (when a carried stent column last asked to be placed again: see layoutLabels)
  let labelSol = new Map();   // key → solved slot { wx, wy, dx, dy, dir, pi, w, h, leader, lead } or { drop }
  let solvedFor = null;       // { sig, sc, th } the slots were solved for
  const labelVis = new Map(); // key → shown last frame (hysteresis against blockers)
  let labelTurned = false;   // labels remember their side; turning the circuit changes which side is right
  // Levels of detail (Blood menu › Labels). Key: at the home framing only the portal vein, the HVPG pair
  // (wedged sinusoids and the free hepatic vein) and the stations the model flags; zoomed in, every
  // station in view. All: every station at every zoom. None: only a selected station.
  const KEY_NODES = ['CONF', 'SIN_R', 'RHV'];
  const zoomedIn = () => vt.k > (homeAt?.k || 1) * 1.3;
  function flagged(f) {
    const st = store.get(), out = [];
    if (hasVarices('VAR', f)) out.push('VAR');
    if (hasVarices('GV', f)) out.push('GV');
    if (f.metrics?.ra > 10) out.push('RA');   // the Findings cut-off for a raised right atrial pressure
    // A narrowed vessel: the stations either side of it.
    for (const [id, v] of Object.entries((f.viewParams || st.params).stenosis || {})) {
      const e = v > 0 && EDGES[EI[id]];
      if (!e) continue;
      for (const n of [e.from, e.to]) if (CHIP_NODES.includes(n) && !out.includes(n)) out.push(n);
    }
    return out;
  }
  const SOLVE_ZOOM = 0.05, SOLVE_TURN = 0.03;   // re-solve after a 5 % zoom change or ~2 degrees of turn
  // A vessel's width as the labels see it: it moves only once the vessel has changed by 2 px, so a width
  // easing or hovering at a rounding edge does not lay the labels out again on every model update.
  const sigW = new Map();
  function sigWidth(x) {
    const w = x.width || 0, s = sigW.get(x.e.id);
    if (s != null && Math.abs(w - s) < 2) return s;
    sigW.set(x.e.id, Math.round(w));
    return Math.round(w);
  }
  // A stent's velocity callout waits until the stent has grown in and the flow through it has settled: while it draws on,
  // widens, or the presenter eases the model to a new patient, the reading swings through values no scan would show.
  const STENT_CALM_MS = 1200, stentCalm = new Map();
  function stentReady(sid, f) {
    const x = E[sid];
    if (!x?.vis) { stentCalm.delete(sid); return false; }
    const now = performance.now(), c = stentCalm.get(sid);
    if (!c || x.reveal || f.morphing || x.width !== x.wT) { stentCalm.set(sid, now); return false; }
    return now - c >= STENT_CALM_MS;
  }
  // The narrowings' part of the signature, kept per object: a change of parameters always makes new objects (updateParams
  // clones them, and each model frame brings its own), so the same object always gives the same text. The same holds for the
  // slide's marks and terms (the presenter sets new ones per slide) and the cards' boxes (readBlockers returns a new list):
  // their text is built once per object, not on every call (review item 25).
  const paramJSONs = new WeakMap();
  const paramJSON = (o) => { if (!o || typeof o !== 'object') return JSON.stringify(o); let j = paramJSONs.get(o); if (j === undefined) paramJSONs.set(o, (j = JSON.stringify(o))); return j; };
  function labelSig(f) {
    const st = store.get(), t = easeInOut(morph);
    const edges = EV.filter((x) => x.vis).map((x) => `${x.e.id}${sigWidth(x)}${x.g.classList.contains('coll-ghost') ? 'g' : ''}`).join(',');
    return [geometryVersion, t >= 0.5, rotU > 0.5, labelBase(), stageBox().width < 700, st.selection?.type + ':' + st.selection?.id, paramJSON((f.viewParams || st.params).stenosis), paramJSON((f.viewParams || st.params).stenosisSite),
      isImaging(), st.layers.labels, st.layers.chips, layerMode(), st.focus?.label, st.focus?.edges?.[0], st.focus?.marks && paramJSON(st.focus.marks), fxSig, fx?.steps && slideGlow.map((g) => g.id + g.at).join(), (fx?.organs.some((o) => o.organ === 'spleen') || fx?.calipers.some((c) => c.organ)) && Math.round((f.slow?.spleen ?? 11) * 2), vt.k > 1.35, st.labelLevel, st.presenting && st.presentLabels?.join(','), st.presenting && paramJSON(st.presentTerms || null), st.presenting && st.presentNames, scan.on, [...(st.hiddenLabels || [])].join(','), zoomedIn(), flagged(f).join(','), edges, ['TIPS', 'DIPS'].map((id) => +stentReady(id, f)).join(''), dop.key].join('|');
  }
  // Layout runs only when one of its inputs changed: the camera and stage box (the CTM), the label
  // signature (geometry, widths, selection, layers, levels...), the morph and turn, the floating panels,
  // fonts, theme and the presenter's insets. Otherwise the last layout stands, and only the live values
  // are refreshed in place (see refreshValues); a value whose text changes shape lays the labels out again.
  let labelKey = null, labelFonts = 0, labelShown = [], noChevBoxes = [];
  const stats = { layouts: 0, skips: 0, values: 0, ms: 0 };
  function updateLabels(f, force = false) {
    // Laid out once the presenter's camera settles (see camSettle), or at once if its glide was cut short.
    if (camMove) { if (!vtGliding) camSettle(); return; }
    const t0 = performance.now();
    refreshCTM();
    const st = store.get(), sig = labelSig(f), b = stageBox();
    const key = [[CTM.a, CTM.b, CTM.e, CTM.f].map((v) => v.toFixed(2)).join(), b.width, b.height, morph, rotU, labelFonts, document.documentElement.dataset.theme,
      pzInset('--pz-l'), pzInset('--pz-t'), st.mode, !!st.compareSnap, st.compareView, paramJSON(blockerBoxes), sig,
      calloutBoxes().map((b) => [b.x0, b.y0].map((v) => Math.round(v / 8)).join()).join(';')].join('|');
    if (!force && key === labelKey && refreshValues(f)) { stats.skips++; stats.ms += performance.now() - t0; }
    else {
      const sc = CTM.sc, th = Math.atan2(CTM.b, CTM.a);
      const csig = calloutSig();
      // (A stent called out at its three points is solved again when the presenter's cards move (the monitor folded or opened): carried,
      // its callouts and the slide's mark would hide under a card or keep spots chosen for another view: Review 16 Oct.)
      const ins = dop.all ? [...['--pz-t', '--pz-l', '--pz-b', '--pz-r'].map((k) => Math.round(pzInset(k) / 8)), ...(blockerBoxes || []).flatMap((o) => [o.x0, o.y0, o.x1, o.y1].map((v) => Math.round(v / 8)))].join() : '';   // (and the cards' boxes, which can arrive a frame after the insets)
      const solve = !solvedFor || solvedFor.sig !== sig || solvedFor.csig !== csig || solvedFor.ins !== ins || Math.abs(Math.log(sc / solvedFor.sc)) > SOLVE_ZOOM || Math.abs(th - solvedFor.th) > SOLVE_TURN;
      if (solve || layoutLabels(f, false) === false) { layoutLabels(f, true); solvedFor = { sig, sc, th, csig, ins }; }
      labelKey = key; stats.layouts++; stats.ms += performance.now() - t0;
    }
    if (sites.list) sitesPaint();
    if (scan.on) scanPaint();
    dprobePaint();
  }
  // The live values of the labels showing, rebuilt and written into their text in place. False when one
  // changed shape (a width, a run, a change badge): the caller then lays the labels out again.
  function refreshValues(f) {
    const next = [];
    for (const it of labelShown) {
      const [kind, id, mode, compact] = it.src;
      const n = kind === 'fx' ? fxBuild.get(id)?.() : kind === 'vel' ? velItem(id, f, mode) : kind === 'scan' ? scanItem() : nodeItem(id, f, mode, compact);
      if (!n) return false;   // (a slide's callout gone: lay out again)
      if (it.short || it.abbr) shortenTo(n, it.short || 0, it.abbr);
      if (n.lines.length !== it.lines.length || Math.abs(n.w - it.w) > 0.5 || Math.abs(n.h - it.h) > 0.5) return false;
      for (let i = 0; i < n.lines.length; i++) {
        const a = n.lines[i], o = it.lines[i];
        if (a.length !== o.length || a.some((r, j) => r.cls !== o[j].cls || r.size !== o[j].size)) return false;
      }
      next.push(n);
    }
    let changed = false;
    labelShown.forEach((it, i) => {
      const n = next[i];
      if (n.label === it.label && n.lines.every((l, j) => l.every((r, k) => r.t === it.lines[j][k].t))) return;
      it.lines = n.lines; it.label = n.label; changed = true;
      renderBlock(it);
    });
    if (changed) stats.values++;
    return true;
  }
  // Figure point under a local (stage) pixel.
  function localToWorld(x, y) {
    const X = x + wrapRect.left - CTM.e, Y = y + wrapRect.top - CTM.f, det = CTM.a * CTM.d - CTM.b * CTM.c;
    return [(CTM.d * X - CTM.c * Y) / det, (CTM.a * Y - CTM.b * X) / det];
  }
  // Vessel geometry as capsules in screen space, bucketed, so a label can ask exactly which vessels it touches.
  const SEG_CELL = 64;
  let segs = [], segGrid = new Map(), segStamp = 0;
  // (The vessels as drawn: every tube the GPU draws, the liver's grey branches, strands and tributaries included, each at its
  // drawn radius along its course plus its wall; a label kept clear of these is clear of the picture: Review 16 Oct.)
  function buildSegs() {
    segs = []; segGrid = new Map();
    const items = glWanted() ? glItems() : EV.filter((x) => x.vis && geo[x.e.id]?.cur).map((x) => ({ x, obj: x, pts: geo[x.e.id].cur, kind: 'v' }));
    // (A resistor's zigzag stands as a band as wide as its teeth: "4.1" had sat on the liver's.)
    const zz = [...resMade.values()].filter((g) => g._segs?.length).flatMap((g) => g._segs.map((pts) => ({ x: { width: 22 }, obj: { w: 22 }, pts, kind: 'z' })));
    for (const it of [...items, ...zz]) {
      const pts = it.pts, x = it.x;
      if (!pts || pts.length < 2) continue;
      const R = it.obj.glR, wall = x.isArt ? 0 : x.wallPx || 0, flat = it.kind === 'v' ? (x.width || 4) / 2 : (it.obj.w || 2) / 2;
      const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      const L = cum[cum.length - 1] || 1, rAt = (u) => (R ? R[Math.round(clamp(u, 0, 1) * (R.length - 1))] : flat);
      let prev = worldToLocal(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) {
        const cur = worldToLocal(pts[i][0], pts[i][1]);
        const hw = (Math.max(rAt(cum[i - 1] / L), rAt(cum[i] / L)) + wall) * CTM.sc;
        const sg = { x0: prev[0], y0: prev[1], x1: cur[0], y1: cur[1], hw, stamp: 0, id: x.e ? x.e.id : 'res' };   // (a resistor's zigzag has no vessel)
        segs.push(sg);
        for (let gx = Math.floor((Math.min(sg.x0, sg.x1) - hw) / SEG_CELL); gx <= Math.floor((Math.max(sg.x0, sg.x1) + hw) / SEG_CELL); gx++) {
          for (let gy = Math.floor((Math.min(sg.y0, sg.y1) - hw) / SEG_CELL); gy <= Math.floor((Math.max(sg.y0, sg.y1) + hw) / SEG_CELL); gy++) {
            const k = gx * 4096 + gy;
            (segGrid.get(k) || segGrid.set(k, []).get(k)).push(sg);
          }
        }
        prev = cur;
      }
    }
  }
  // How many vessel segments the box touches, a vessel's own width and `margin` px of air included (`skip`: true asks only whether
  // one does; a vessel's id leaves that one out; { only: id } counts just that one).
  const lineHits = (r, margin, skip = false) => {
    if (typeof skip === 'boolean') return gridHits(segGrid, SEG_CELL, r, margin, ++segStamp, skip);
    const stamp = ++segStamp;
    let n = 0;
    for (let gx = Math.floor((r.x0 - margin) / SEG_CELL); gx <= Math.floor((r.x1 + margin) / SEG_CELL); gx++) {
      for (let gy = Math.floor((r.y0 - margin) / SEG_CELL); gy <= Math.floor((r.y1 + margin) / SEG_CELL); gy++) {
        for (const sg of segGrid.get(gx * 4096 + gy) || []) {
          if (sg.stamp === stamp) continue;
          sg.stamp = stamp;
          if ((skip?.only ? sg.id === skip.only : sg.id !== skip) && segHitsBox(sg, r, sg.hw + margin)) n++;
        }
      }
    }
    return n;
  };
  // Do two segments [x0, y0, x1, y1] cross (or touch)?
  function segsCross(a, b) {
    const o = (px, py, qx, qy, rx, ry) => Math.sign((qx - px) * (ry - py) - (qy - py) * (rx - px));
    return o(a[0], a[1], a[2], a[3], b[0], b[1]) !== o(a[0], a[1], a[2], a[3], b[2], b[3]) && o(b[0], b[1], b[2], b[3], a[0], a[1]) !== o(b[0], b[1], b[2], b[3], a[2], a[3]);
  }
  // For the browser check (Review 16 Oct): every TIPS point callout, the slide's mark and the "60 %" on screen, with its drawn box
  // (halo or pill edge included) in screen px, its clearance from the nearest drawn vessel (negative: on it), the vessel, and for a
  // point how far its middle sits from its dot. The "60 %" leaves its own stent out; nothing else does.
  function clearanceReport() {
    if (!wrap.isConnected) return [];
    buildSegs();
    const wr = wrap.getBoundingClientRect(), out = [{ key: 'stage', top: wr.top, left: wr.left, dots: dop.id && geo[dop.id]?.cur?.length > 1 ? ['proximal', 'mid', 'distal'].map((pt) => worldToLocal(...pointAt(geo[dop.id].cur, STENT_SITES[pt]))) : [] }];
    const dist = (sg, r) => {
      if (segHitsBox(sg, r, 0)) return -sg.hw;
      const pd = (px, py) => { const dx = sg.x1 - sg.x0, dy = sg.y1 - sg.y0, L2 = dx * dx + dy * dy || 1, t = clamp(((px - sg.x0) * dx + (py - sg.y0) * dy) / L2, 0, 1); return Math.hypot(px - sg.x0 - dx * t, py - sg.y0 - dy * t); };
      const bd = (px, py) => Math.hypot(Math.max(r.x0 - px, 0, px - r.x1), Math.max(r.y0 - py, 0, py - r.y1));
      return Math.min(bd(sg.x0, sg.y0), bd(sg.x1, sg.y1), pd(r.x0, r.y0), pd(r.x1, r.y0), pd(r.x0, r.y1), pd(r.x1, r.y1)) - sg.hw;
    };
    const near = (r, skip) => { let best = { d: Infinity, id: null }; for (const sg of segs) { if (sg.id === skip) continue; const d = dist(sg, r); if (d < best.d) best = { d, id: sg.id }; } return best; };
    const box = (el, grow) => { const q = el.getBoundingClientRect(); return { x0: q.left - wr.left - grow, y0: q.top - wr.top - grow, x1: q.right - wr.left + grow, y1: q.bottom - wr.top + grow }; };
    const sid = dop.id, dots = sid && geo[sid]?.cur?.length > 1 ? Object.fromEntries(['proximal', 'mid', 'distal'].map((pt) => [pt, worldToLocal(...pointAt(geo[sid].cur, STENT_SITES[pt]))])) : {};
    for (const g of document.querySelectorAll('#labels g.lb')) {
      const key = g.dataset.key || '';
      if (!/^(n:TIPS:|n:DIPS:|focus)/.test(key)) continue;
      const shown = g.style.display !== 'none' && !g.classList.contains('lb-off');
      const pill = g.querySelector('rect.lb-bg'), t = g.querySelector('text');
      const halo = pill && /^focus/.test(key) ? 0 : (parseFloat(t && getComputedStyle(t).strokeWidth) || 0) / 2;
      const r = box(pill && /^focus/.test(key) ? pill : t || g, halo), n = near(r, null), pt = key.split(':')[2], d = dots[pt];
      out.push({ key, shown, box: [r.x0, r.y0, r.x1, r.y1].map((v) => +v.toFixed(1)), clear: +n.d.toFixed(2), vessel: n.id, level: d ? +((r.y0 + r.y1) / 2 - d[1]).toFixed(1) : null, ring: g.classList.contains('ring') ? (parseFloat(pill && getComputedStyle(pill).strokeWidth) || 0) / 2 : 0 });
    }
    for (const el of document.querySelectorAll('.clamp-label')) {
      if (!el.getClientRects().length || !el.textContent) continue;
      const r = box(el, (parseFloat(getComputedStyle(el).strokeWidth) || 0) * (CTM.sc || 1) / 2), n = near(r, el._c?.id);
      out.push({ key: `60%:${el._c?.id}`, shown: true, box: [r.x0, r.y0, r.x1, r.y1].map((v) => +v.toFixed(1)), clear: +n.d.toFixed(2), vessel: n.id, level: null });
    }
    return out;
  }
  // `solve`: search (stickily) and record the slots; otherwise carry the recorded slots. Returns false
  // when a label turned up that has no slot or no longer fits its slot: the caller then solves.
  function layoutLabels(f, solve) {
    frameNo++;
    const st = store.get();
    const t = easeInOut(morph);
    const circuit = t >= 0.5;
    if ((circuit && rotU > 0.5) !== labelTurned) { labelTurned = !labelTurned; labelSol = new Map(); if (!solve) return false; }
    labelK = labelBase() * (circuit ? CIRCUIT_LABEL_K : 1);
    const lbk = labelK.toFixed(2);
    if (gLabels.dataset.k !== lbk) { gLabels.dataset.k = lbk; gLabels.style.setProperty('--lbk', lbk); }
    const wr = stageBox();
    const W = wr.width, H = wr.height;
    // A solve prefers slots that sit inside the stage as it is now, but never depends on the panels, and a pan
    // alone never searches again. A label a pan later pushes past the edge is pulled back in (see below).
    // (On a wide screen's slide the readings keep the slides' one margin from every edge, as the cards do, and stay above the nav
    // pill's row: 17 Oct design review, a reading had stood 8 px from the right edge, and another level with the pill.)
    const M = st.presenting && pillEdge ? pillEdge.m : 6;
    const view = { x0: M, y0: M, x1: W - M, y1: H - M }, plain = { x0: 6, y0: 6, x1: W - 6, y1: H - 6 };   // plain: the whole stage, for the FibroScan callout, which keeps with its probe (see below)
    if (st.presenting && pillEdge) view.y1 = Math.max(H * 0.5, Math.min(view.y1, pillEdge.top - 8));
    // A presenter slide's words hold the left (a phone: the top) under a fading shade; labels keep clear of it.
    if (st.presenting) { view.x0 = Math.max(view.x0, pzInset('--pz-l') + 30); view.y0 = Math.max(view.y0, pzInset('--pz-t') + 12); }
    // (A stent's point, and the slide's mark beside it, come as near the top card as they may come to any card (4 px past its box, and
    // a pixel to spare), so the point nearest it can still stand level with its dot: Review 16 Oct.)
    const ptView = { ...view, y0: st.presenting ? Math.max(6, pzInset('--pz-t') + 5) : view.y0 };
    const viewOf = (it) => (it.key === 'scan' ? plain : it.point || (dop.all && /^focus/.test(it.key)) ? ptView : view);
    const compact = W < 700;
    // Floating panels over the figure (notifications, hint cards, banners): a label under one is hidden.
    // Their boxes are read before this frame's SVG changes (see updateInner), while layout is clean.
    const blockers = blockerBoxes || readBlockers();
    const callouts = calloutBoxes();
    const obstacles = [...blockers, ...callouts];   // what can hide a label this frame
    const placed = solve ? callouts.map((b) => ({ x0: b.x0 - 3, y0: b.y0 - 3, x1: b.x1 + 3, y1: b.y1 + 3, call: true, probe: !!b.probe })) : [];
    // (A slide's calipers and brackets (package F) are lines no label may sit on, their own readings included: boxes along each.)
    if (solve && fx) {
      const segBoxes = (p, q, pad) => {
        const [x0, y0] = worldToLocal(...p), [x1, y1] = worldToLocal(...q), n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 8));
        for (let i = 0; i < n; i++) {
          const u0 = i / n, u1 = (i + 1) / n, xa = x0 + (x1 - x0) * u0, xb = x0 + (x1 - x0) * u1, ya = y0 + (y1 - y0) * u0, yb = y0 + (y1 - y0) * u1;
          placed.push({ x0: Math.min(xa, xb) - pad, y0: Math.min(ya, yb) - pad, x1: Math.max(xa, xb) + pad, y1: Math.max(ya, yb) + pad, dot: true });
        }
      };
      if (!circuit) for (const c of fx.calipers) { const g = caliperSegs(c, f); if (g) for (const [p, q] of g.segs) segBoxes(p, q, 5); }
      if (circuit) for (const sp of fx.spans) {
        const at = spanOf(sp.from, sp.to, fxK());
        if (at) for (const [p, q] of [[[at.x0, at.y], [at.x1, at.y]], [[at.x0, at.y - SPAN_TICK], [at.x0, at.y]], [[at.x1, at.y - SPAN_TICK], [at.x1, at.y]]]) segBoxes(p, q, 5);
      }
    }
    // (The corner credit, where it shows: a stent's column and the slide's mark beside it keep off it where they can, so it holds its
    // spot when another point is picked. It moves whenever a label comes to cover it, and does not come back.)
    const creditBox = solve && dop.all ? (() => { const el = document.querySelector('.stage-credit'), r = el?.getBoundingClientRect(); return r?.width && getComputedStyle(el).opacity !== '0' ? { x0: r.left - wr.left - 10, y0: r.top - wr.top - 10, x1: r.right - wr.left + 10, y1: r.bottom - wr.top + 10 } : null; })() : null;
    const markDots = solve && dop.all && dop.id && geo[dop.id]?.cur?.length > 1 ? ['proximal', 'mid', 'distal'].map((pt) => worldToLocal(...pointAt(geo[dop.id].cur, STENT_SITES[pt]))) : null;   // (the stent's three dots)
    const later = [];   // labels placed after the slide's marks (a stent's points other than the sampled one)
    // Where a stent's point goes when nothing near its third is free: a little farther out on a leader that crosses no label (diagonal
    // first, which clears a narrowing's clamp above or below its "60 %"), then farther still.
    const FAR_DIRS = ['SE', 'NE', 'SW', 'NW', 'E', 'W', 'S', 'N'];
    // (A stent's point with still no room, on a phone's small stent beside its narrowing: the far spots slid up or down a
    // little, nearest first, so its leader can pass by the narrowing's clamp and its label sit in the gap that is left.)
    const SLID = (far) => [far + 12, far + 48, far + 84].flatMap((gap) => [-24, 24, -48, 48, -72, 72].map((y) => ({ gap, leader: true, uncrossed: true, shift: [0, y] })));
    let stale = false;
    const prevSol = labelSol, nextSol = solve ? new Map() : labelSol;
    const out = [];
    const leaders = [];   // { k, tag, at }: every line, then every dot (paintLeaders)
    let useLines = false, rings = [], ringXY = [];   // rings: the Circuit's stations with a reading (see placeMulti); ringXY: their dots
    let clampAlts = [];   // (the column's "60 %": other spots off the vessels, nearest first, for the slide's mark)
    const buildLines = () => { if (solve && !useLines) { useLines = true; buildSegs(); } };
    // A stent called out at its three points: the three stand in a column beside their own dots, distal to proximal in the stent's
    // own order, on the side with room (off the cards and the stage edge, over the fewest vessels). The side is chosen from the stent
    // and the screen alone, never from the point sampled, so nothing moves when another point is picked; the "60 %" takes the other side.
    if (solve) {
      const col = dop.all && dop.id && E[dop.id]?.vis && EI[dop.id] >= 0 && geo[dop.id]?.cur?.length > 1 ? dop.id : null;
      if (col) {
        buildLines();
        const tpl = velItem(col, f, 'distal'), h = tpl.h, G = colGap(col);
        const wT = lineW(tpl.lines[0].map((r) => (r.cls === 'lb-val' ? { ...r, t: '000' } : r)));
        const score = (side) => ['proximal', 'mid', 'distal'].reduce((n, pt) => {
          const [ax, ay] = worldToLocal(...pointAt(geo[col].cur, STENT_SITES[pt]));
          const r = rectOf({ x: side === 'E' ? ax + G : ax - G - wT, y: ay - h / 2, w: wT, h, padX: tpl.padX || 0, padY: tpl.padY || 0 });
          return n + (within(r, view) ? 0 : 1e3) + (obstacles.some((o) => !o.probe && hits(r, o)) ? 1e3 : 0) + lineHits(r, 2) * 10;
        }, 0);
        const e = score('E'), w = score('W');
        ptSide = clampFor === col && ptSide === 'W' ? (e + 5 < w ? 'E' : 'W') : (w + 5 < e ? 'W' : 'E');   // (a near tie keeps the side it had)
      } else ptSide = null;
      const away = col ? (ptSide === 'E' ? 'W' : 'E') : null;
      if (away !== clampAway || col !== clampFor) { clampAway = away; clampFor = col; for (const el of ov.clamps.querySelectorAll('.clamp-label')) clampLabelAt(el); }
      for (const el of ov.clamps.querySelectorAll('.clamp-label')) clampFontAt(el);
      // (The column's "60 %" stands off the vessels on its side (Review 15 Oct: it sat on the grey vein): the nearest spot clear of
      // every vessel but its stent and of the credit, a step farther out or slid along the stent at a time, up to 64 px each way;
      // failing that, the one over the fewest.)
      // (Where the slide's mark points at the narrowing, its leader can only leave along the stent, between the arrows and away from the
      // other dots: the "60 %" keeps out of that lane where it can, so the mark finds a spot there off the vessels: Review 16 Oct.)
      const lane = col && (() => {
        const m = (st.focus ? st.focus.marks || [st.focus] : []).find((k) => k.edges?.[0] === col);
        if (!m) return null;
        const pp = f.viewParams || st.params, [x, y, dx, dy] = pointAt(geo[col].cur, stenosisAt(col, pp));
        const [ox, oy] = worldToLocal(x, y), [mx, my] = worldToLocal(...pointAt(geo[col].cur, m.seg ? STENT_SITES[stentGate(m.seg, pp, col)] : 0.5));
        if (Math.hypot(mx - ox, my - oy) > 12) return null;
        const [tx, ty] = worldToLocal(x + dx, y + dy), n = Math.hypot(tx - ox, ty - oy) || 1, [cx, cy] = worldToLocal(...pointAt(geo[col].cur, STENT_SITES.mid));
        const sg = (cx - ox) * (tx - ox) + (cy - oy) * (ty - oy) > 0 ? -1 : 1;
        return { ox, oy, ux: (sg * (tx - ox)) / n, uy: (sg * (ty - oy)) / n };
      })();
      const inLane = (r) => {
        if (!lane) return false;
        const { ox, oy, ux, uy } = lane, sx = Math.max(1, (r.x1 - r.x0) / 8), sy = Math.max(1, (r.y1 - r.y0) / 4);
        for (let x = r.x0; x <= r.x1 + 0.01; x += sx) for (let y = r.y0; y <= r.y1 + 0.01; y += sy) {
          const a = (x - ox) * ux + (y - oy) * uy;
          if (a > 10 && a < 150 && Math.abs((y - oy) * ux - (x - ox) * uy) < 46) return true;
        }
        return false;
      };
      if (col) for (const el of ov.clamps.querySelectorAll('.clamp-label')) {
        if (el._c?.id !== col) continue;
        const k = 1 / Math.max(CTM.sc, 1e-3), steps = [];
        for (let px = 0; px <= 64; px += 4) for (let tp = -64; tp <= 64; tp += 8) steps.push([px, tp]);
        steps.sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
        let best = null;
        // (Where the slide's mark is on this stent, the next few spots off the vessels are kept too: the mark may need the one it takes,
        // and then the "60 %" moves to the nearest of them that frees it (see the focus callout).)
        const markOn = (st.focus ? st.focus.marks || [st.focus] : []).some((m) => m.edges?.[0] === col);
        clampAlts = [];
        // (Its box is measured once for each way its text can run; every other step only moves it, so the box moves by the
        // same amount: up to 289 forced layouts in one search had been one per step. Review item 24.)
        const measured = [null, null];
        for (const [px, tp] of steps) {
          if (best && !best.n && (!markOn || clampAlts.length >= 12)) break;
          el._d = 16 + px * k; el._t = tp * k;
          const q = clampLabelPos(el);
          if (!q) break;
          const qx = +q.x.toFixed(2), qy = +q.y.toFixed(2), ref = measured[+q.left];
          let bb;
          if (ref) bb = { x: ref.bb.x + (qx - ref.x), y: ref.bb.y + (qy - ref.y), width: ref.bb.width, height: ref.bb.height };
          else {
            clampLabelAt(el);
            try { bb = el.getBBox(); } catch { break; }
            measured[+q.left] = { x: qx, y: qy, bb: { x: bb.x, y: bb.y, width: bb.width, height: bb.height } };
          }
          const cs = [[bb.x, bb.y], [bb.x + bb.width, bb.y + bb.height]].map(([x, y]) => worldToLocal(x, y));
          const r = { x0: Math.min(cs[0][0], cs[1][0]), y0: Math.min(cs[0][1], cs[1][1]), x1: Math.max(cs[0][0], cs[1][0]), y1: Math.max(cs[0][1], cs[1][1]) };
          const n = lineHits(r, 8, col) + (within(r, view) ? 0 : 1e3) + (creditBox && hits(r, creditBox) ? 100 : 0) + (inLane(r) ? 0.5 : 0);   // (its 3.5 px halo and 2 px of air past it, and a pixel and a half to spare)
          if (n < 1 && best && best.n < 1) clampAlts.push({ d: el._d, t: el._t, el });
          if (!best || n < best.n) best = { n, d: el._d, t: el._t };
        }
        clampAlts = clampAlts.filter((a) => a.d !== best?.d || a.t !== best?.t);
        if (best) { clampD.set(col, { d: best.d, t: best.t }); el._d = el._t = undefined; clampLabelAt(el); }
      }
    }
    // Stenosis clamps and their percentages are drawn on the figure; keep labels off them. (Beside a stent called out in a column,
    // only the clamp's own arrows and its "60 %", so the callout at the narrowing can stand right by its dot.)
    const boxOfEl = (el, m = 2) => {
      let b; try { b = el.getBBox(); } catch { return null; }
      if (!b.width) return null;
      const cs = [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]].map(([x, y]) => worldToLocal(x, y));
      return { x0: Math.min(...cs.map((c) => c[0])) - m, y0: Math.min(...cs.map((c) => c[1])) - m, x1: Math.max(...cs.map((c) => c[0])) + m, y1: Math.max(...cs.map((c) => c[1])) + m };
    };
    if (solve && !isImaging()) for (const [id, v] of Object.entries((f.viewParams || st.params).stenosis)) {
      if (!(v > 0) || !E[id]?.vis) continue;
      if (id === clampFor && ptSide) { for (const el of ov.clamps.querySelectorAll(`.clamp[data-id="${id}"]`)) { const b = boxOfEl(el, 0); if (b) placed.push(b); } continue; }
      const [sx, sy] = worldToLocal(...pointAt(geo[id].cur, stenosisAt(id, f.viewParams || st.params)));
      placed.push({ x0: sx - 26, y0: sy - 22, x1: sx + 60, y1: sy + 22 });
    }
    // (The clamps' "60 %" again on its own: a station inside the clamp's box above may send a long leader out, but never through it,
    // and no leader passes nearer than 2 px to its halo: Review 15 Oct.)
    // The "60 %" the probe would cover steps out on a leader line (its fade out and in: clampStep); the leader is drawn from the
    // clamp's outer tip (clampLeads, below).
    if (solve && !isImaging()) {
      const probe = dpr.on && dpr.box ? [dpr.box, ...dpr.marks] : [], seen = new Set(), k = 1 / Math.max(CTM.sc, 1e-3);
      for (const el of ov.clamps.querySelectorAll('.clamp-label')) {
        const c = el._c, id = c?.id, m = clampMv.get(id);
        if (!c || id === clampFor || (!probe.length && !m?.cur)) continue;   // (a column's "60 %" has its own spot: clampD)
        seen.add(id);
        buildLines();
        // (The box at the usual spot once, then shifted: a move of d out and t along the vessel is the same move on screen.)
        el._d = 16; el._t = 0; clampLabelAt(el);
        const base = boxOfEl(el, 5), o = worldToLocal(c.x, c.y);
        el._d = el._t = undefined;
        const boxAt = (d, t) => {
          const [bx, by] = worldToLocal(c.x + c.nx * (d - 16) - c.ny * t, c.y + c.ny * (d - 16) + c.nx * t);
          return base && { x0: base.x0 + bx - o[0], y0: base.y0 + by - o[1], x1: base.x1 + bx - o[0], y1: base.y1 + by - o[1] };
        };
        const free = (b) => b && !probe.some((q) => hits(b, q)) && within(b, view) && lineHits(b, 6, id) < 1 && !(creditBox && hits(b, creditBox));
        let want = null;
        if (probe.some((q) => hits(boxAt(16, 0), q))) {
          const cur = m?.want;
          if (cur && free(boxAt(cur.d, cur.t))) want = cur;   // (a spot that still works is kept: nothing hops while the probe stays)
          else {
            const steps = [];
            for (let px = 0; px <= 80; px += 8) for (let tp = -88; tp <= 88; tp += 8) if (px || tp) steps.push([px, tp]);
            steps.sort((u, v) => Math.hypot(...u) - Math.hypot(...v));
            const hit = steps.find(([px, tp]) => free(boxAt(16 + px * k, tp * k)));
            if (hit) want = { d: 16 + hit[0] * k, t: hit[1] * k };
          }
        }
        clampStep(id, want);
        clampLabelAt(el);
      }
      for (const [id, m] of clampMv) if (!seen.has(id) && !m.busy) clampMv.delete(id);
    }
    if (solve && !isImaging()) for (const el of ov.clamps.querySelectorAll('.clamp-label')) { const b = boxOfEl(el, 6); if (b) placed.push(el._box = { ...b, lab: true }); }
    // (The column's narrowing arrows, for the slide's mark: its leader keeps 6 px off them, as drawn (their triangles, not their
    // boxes, so a leader straight up between them still passes): Review 16 Oct.)
    const markArrows = solve && dop.all && clampFor && ptSide ? [...ov.clamps.querySelectorAll(`.clamp[data-id="${clampFor}"]`)].map((el) => {
      const n = (el.getAttribute('d') || '').match(/-?[\d.]+(e-?\d+)?/g)?.map(Number) || [];
      return n.length >= 6 ? [0, 2, 4].map((k) => worldToLocal(n[k], n[k + 1])) : null;
    }).filter(Boolean) : [];
    const triDist = (x, y, tri) => {
      const side = (a, b) => (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]), s0 = side(tri[0], tri[1]), s1 = side(tri[1], tri[2]), s2 = side(tri[2], tri[0]);
      if ((s0 >= 0 && s1 >= 0 && s2 >= 0) || (s0 <= 0 && s1 <= 0 && s2 <= 0)) return 0;
      return Math.min(...[0, 1, 2].map((k) => {
        const a = tri[k], b = tri[(k + 1) % 3], ex = b[0] - a[0], ey = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (y - a[1]) * ey) / (ex * ex + ey * ey || 1)));
        return Math.hypot(x - a[0] - ex * t, y - a[1] - ey * t);
      }));
    };
    // Slots are searched over every (pass, direction) pair at once: an earlier pass always beats a
    // later one (nearer, no leader, clear of vessels), then the direction order decides. The slot a
    // label held before wins as long as it still collides with nothing: no label, no dot, and (in a
    // clear pass) no vessel. A fresh slot must keep 3 px of air from vessels, the held one needs none.
    // The width a label reserves only grows (a value ticking from 9.9 to 10.0, or a change gaining a
    // digit, would otherwise tip it to another side of its station and back).
    const place = (it, dirs, gap, leader, clear) => placeMulti(it, dirs, (Array.isArray(gap) ? gap : [gap]).map((g, gi) => ({ gap: g, leader, clear, bias: gi * 6 })));
    // (from, to: only those passes are searched this round; a round that is not final gives up without shortening or dropping.)
    const placeMulti = (it, dirs, passes, from = 0, to = passes.length, final = true, maxShort = final ? 2 : 0) => {
      const prev = prevSol.get(it.key);
      if (!solve) {
        // Carry: the label goes where it was put, relative to the figure point it names.
        if (!prev) { stale = true; return false; }
        if (prev.drop) return false;
        if ((prev.short || prev.abbr) && it.canShort) shortenTo(it, +prev.short || 0, prev.abbr);
        if (prev.one) oneLine(it);
        if (it.w > prev.w + 0.5 || it.h > prev.h + 0.5) { stale = true; return false; }
        const [ax, ay] = worldToLocal(prev.wx, prev.wy);
        it.ax = ax; it.ay = ay; it.dir = prev.dir; it.leader = prev.leader; it.onVessel = !!prev.onv;
        const slack = it.rot ? 0 : prev.w - it.w;
        it.x = ax + prev.dx + (prev.dir.includes('W') ? slack : prev.dir.includes('E') ? 0 : slack / 2);
        it.y = ay + prev.dy;
        // (A Circuit reading carried onto a station's ring is solved again: the figure eased a few per cent closer or farther since
        // it was solved, and the reading, kept as far from the middle of its vessel, came onto the station's ring at its end. One
        // the solve itself left on a ring (dot) is carried, or it would be solved again every frame.)
        if (circuit && it.key.startsWith('n:') && !prev.dot && placed.some((p) => p.dot && hits(rectOf(it), p))) { stale = true; return false; }
        placed.push(rectOf(it)); out.push(it);
        return true;
      }
      // (Not a rescued slot's width (pi -1, below): the reading takes its usual spots at its own width again.)
      const wRes = prev && !prev.drop && prev.pi !== -1 && it.w <= prev.w && it.w > prev.w - 28 ? prev.w : it.w;
      // A turned caption (see renderBlock) takes up a box as wide as its text is tall.
      const probe = it.rot ? { ...it, w: it.h, h: it.w } : { ...it, w: wRes };
      let best = null;
      passes.forEach((ps, pi) => pi >= from && pi < to && (ps.dirs || dirs).forEach((dir, i) => {
        // (A spot on the grid around the station is tried once, not per direction, and only until one is free: the grid runs nearest
        // first. The spot the label held is still tried, so it can hold it.)
        if (ps.skip || (ps.at && (i || (best && !(prev && prev.pi === pi))))) return;
        let [dx, dy] = ps.at ? [ps.at[0] - probe.w / 2, ps.at[1] - probe.h / 2] : offset(dir, probe, ps.gap);
        if (ps.shift) { dx += ps.shift[0]; dy += ps.shift[1]; }   // (a slot slid up or down from its compass spot)
        let r = rectOf({ ...probe, x: it.ax + dx, y: it.ay + dy });
        // (A stent's point past the stage's edge, or the slide's mark beside it, is tried where the last pass would pull it back to, so it
        // is never pushed onto its neighbour.)
        if (it.point || (dop.all && /^focus/.test(it.key))) {
          const cx = Math.max(ptView.x0 - r.x0, Math.min(0, ptView.x1 - r.x1)), cy = Math.max(ptView.y0 - r.y0, Math.min(0, ptView.y1 - r.y1));
          if (cx || cy) { dx += cx; dy += cy; r = rectOf({ ...probe, x: it.ax + dx, y: it.ay + dy }); }
        }
        if (placed.some((p) => !(it.point && p.probe) && (ps.callGap && p.call ? hits(r, { ...p, x0: p.x0 - ps.callGap, x1: p.x1 + ps.callGap }) : hits(r, p)) && !(ps.overZones && p.zone))) return;
        if (ps.credit && creditBox && hits(r, creditBox)) return;
        // (A stent's point, or the slide's mark beside it, never takes a spot a card covers, where it would only hide: the next spot that
        // shows is better.)
        // (It keeps 4 px off a card: with 10, a point near the card's edge was slid off its dot's line: Review 16 Oct.)
        if ((it.point || (dop.all && /^focus/.test(it.key))) && obstacles.some((o) => !(it.point && o.probe) && hits(r, { x0: o.x0 - 4, y0: o.y0 - 4, x1: o.x1 + 4, y1: o.y1 + 4 }))) return;
        // (A long leader may not run through another label: only boxes clear of its own station count, by 8 px, so a clamp's arrows at
        // the station do not.)
        if (ps.uncrossed && placed.some((p) => !(it.point && p.probe) && (p.lab || !(it.ax >= p.x0 - 8 && it.ax <= p.x1 + 8 && it.ay >= p.y0 - 8 && it.ay <= p.y1 + 8)) && crosses(it.ax, it.ay, (r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, p))) return;
        // (...nor, the slide's mark's, pass within 18 px of another of the stent's dots: Review 15 Oct.)
        if (markDots && /^focus/.test(it.key) && !ps.loose) {
          const le = leaderEnd(r, it.ax, it.ay), ex = le.x - it.ax, ey = le.y - it.ay, L2 = ex * ex + ey * ey || 1;
          if (markDots.some(([px, py]) => { if (Math.hypot(px - it.ax, py - it.ay) < 4) return false; const t = Math.max(0, Math.min(1, ((px - it.ax) * ex + (py - it.ay) * ey) / L2)); return Math.hypot(px - it.ax - ex * t, py - it.ay - ey * t) < 18; })) return;
          const L = Math.sqrt(L2);
          for (let u = 7; ps.clear && u < L && markArrows.length; u += 1.5) {
            const x = it.ax + (ex * u) / L, y = it.ay + (ey * u) / L;
            if (markArrows.some((tri) => triDist(x, y, tri) < 6)) return;
          }
        }
        // (The mark moves with the point sampled, so it holds its spot only while its dot stays put.)
        const moved = dop.all && /^focus/.test(it.key) && prev && Math.hypot(...worldToLocal(prev.wx, prev.wy).map((v, j) => v - (j ? it.ay : it.ax))) > 2;
        const V = viewOf(it), inside = within(r, V), held = !moved && !!prev && !prev.drop && prev.dir === dir && prev.pi === pi && (inside || !within({ x0: it.ax, y0: it.ay, x1: it.ax, y1: it.ay }, V));
        // (edge: px inside the stage it keeps; avoid: drawn shapes (an organ, a lit outline) it keeps off, by pad px.)
        if ((ps.edge && !insideBy(r, V, ps.edge)) || (ps.avoid && !clearOf(r, ps.avoid, ps.pad ?? 0))) return;
        // (fans: the targets of a numbered step's group, V10. Each of its leaders, from its target to the box, runs through no label and
        // crosses no other leader, a group's own included.)
        if (ps.fans) {
          const segs = out.flatMap((o) => [...(o.leader && !o.live ? [(() => { const e = leaderEnd(rectOf(o), o.ax, o.ay); return [o.ax, o.ay, e.x, e.y]; })()] : []), ...(o.fans || []).map(([fx, fy]) => { const e = leaderEnd(rectOf(o), fx, fy); return [fx, fy, e.x, e.y]; })]);
          if (ps.fans.some(([fx, fy]) => {
            const le = leaderEnd(r, fx, fy), L = Math.hypot(le.x - fx, le.y - fy);
            if (segs.some((sg) => segsCross(sg, [fx, fy, le.x, le.y]))) return true;
            for (let u = 6; u < L - 2; u += 3) {
              const px = fx + ((le.x - fx) * u) / L, py = fy + ((le.y - fy) * u) / L;
              if (placed.some((p) => !(it.point && p.probe) && !p.dot && hits({ x0: px - 3, y0: py - 3, x1: px + 3, y1: py + 3 }, p))) return true;
            }
            return false;
          })) return;
        }
        const om = ps.strict ? 10 : 0;
        if ((ps.inView && !inside) || ((ps.inView || ps.strict) && obstacles.some((o) => !(o.zone && ps.strict) && !(it.point && o.probe) && hits(r, { x0: o.x0 - om, y0: o.y0 - om, x1: o.x1 + om, y1: o.y1 + om })))) return;   // (in the free space: inside the stage, 10 px from any card, the margin a hidden label needs to show again)
        let onLine = 0;
        if (useLines) {
          // (A clear pass only asks whether any vessel is in the way. The slide's mark beside a stent's three points keeps 2 px off every
          // vessel as drawn (3 with a pixel to spare; a point's callout 4, its halo included), and its leader 2 px off every vessel but
          // its stent: Review 15-16 Oct.)
          const mk = dop.all && /^focus/.test(it.key);
          if (ps.clear) { if (ps.pad != null ? lineHits(r, ps.pad, true) : mk ? lineHits(r, 3, true) : it.point ? lineHits(r, 4, true) : held ? lineHits(r, 0, true) : lineHits(r, 3, true)) return; } else onLine = lineHits(r, 0);
          if (mk && dop.id && lineHits(r, 3, { only: dop.id })) return;   // (and in any pass, 2 px off its own stent as drawn)
          // (A reading out on a ring is joined to its station by a leader: one that would cross a vessel or a label is no use.)
          // A reading moving off its vessel or rescued (passes from 3 on, and the rescue's: strict) keeps 4 px from every other
          // reading, off every other station's ring and every other reading's leader, and its own leader, if it is far enough out
          // to have one, crosses no reading or leader.
          if (ps.inView || ps.strict) {
            // (Nor on another station's ring, where that reading's leader starts.)
            // (A rescued one keeps off its own ring too.)
            if ((ps.strict || ps.resc) && rings.some((o) => (o !== it || ps.resc) && o.ax > r.x0 - 7 && o.ax < r.x1 + 7 && o.ay > r.y0 - 7 && o.ay < r.y1 + 7)) return;
            // (No reading sits on another's leader: 2 px clear of its halo.)
            const others = out.filter((o) => o !== it && o.leader && !o.live).map((o) => { const e = leaderEnd(rectOf(o), o.ax, o.ay); return [o.ax, o.ay, e.x, e.y]; });
            if (others.some((sg) => segHitsBox({ x0: sg[0], y0: sg[1], x1: sg[2], y1: sg[3] }, r, ps.strict || ps.resc ? 5 : 2))) return;
            if (ps.inView && placed.some((p) => !(it.point && p.probe) && !p.dot && hits(r, { x0: p.x0 - 4, y0: p.y0 - 4, x1: p.x1 + 4, y1: p.y1 + 4 }))) return;
            const le = leaderEnd(r, it.ax, it.ay), ex = le.x, ey = le.y, L = Math.hypot(ex - it.ax, ey - it.ay);
            const gapPx = Math.hypot(Math.max(r.x0 - it.ax, 0, it.ax - r.x1), Math.max(r.y0 - it.ay, 0, it.ay - r.y1));
            if (gapPx > 10) {
              if (others.some((sg) => segsCross(sg, [it.ax, it.ay, ex, ey]))) return;
              // (A zone title's column that the station itself stands at the edge of (VAR beside "Portal veins" on a phone) does not
              // stop its leader: it starts there.)
              const own = (p) => p.zone && it.ax > p.x0 - 4 && it.ax < p.x1 + 4 && it.ay > p.y0 - 4 && it.ay < p.y1 + 4;
              for (let u = ps.strict || ps.resc ? 0 : 8, q = ps.strict || ps.resc ? 3 : 2; u < L - 2; u += ps.strict || ps.resc ? 2 : 3) {   // (rescued: from its station's ring on, the ring too kept clear)
                const px = it.ax + ((ex - it.ax) * u) / L, py = it.ay + ((ey - it.ay) * u) / L, pr = { x0: px - q, y0: py - q, x1: px + q, y1: py + q };
                if ((ps.ring === 'clean' && lineHits(pr, 0)) || placed.some((p) => !(it.point && p.probe) && !p.dot && !own(p) && hits(pr, p))) return;   // (a leader may pass a station's dot, never a reading)
              }
            }
          } else if (circuit && it.key.startsWith('n:')) {
            // (Beside its station too (passes 0-2), a Circuit reading sits on no other reading's leader, and where it stands far
            // enough out to take a leader (past 18 px: see below), its leader runs through no reading: on a sideways iPad, IVC's
            // leader had run through RA's.)
            const others = out.filter((o) => o !== it && o.leader && !o.live).map((o) => { const e = leaderEnd(rectOf(o), o.ax, o.ay); return { x0: o.ax, y0: o.ay, x1: e.x, y1: e.y }; });
            if (others.some((sg) => segHitsBox(sg, r, 2))) return;
            const gapPx = Math.hypot(Math.max(r.x0 - it.ax, 0, it.ax - r.x1), Math.max(r.y0 - it.ay, 0, it.ay - r.y1));
            if (gapPx > 18) {
              const le = leaderEnd(r, it.ax, it.ay), L = Math.hypot(le.x - it.ax, le.y - it.ay);
              for (let u = 8; u < L - 2; u += 3) {
                const px = it.ax + ((le.x - it.ax) * u) / L, py = it.ay + ((le.y - it.ay) * u) / L;
                if (placed.some((p) => !(it.point && p.probe) && !p.dot && !p.zone && hits({ x0: px - 2, y0: py - 2, x1: px + 2, y1: py + 2 }, p))) return;
              }
            }
          }
          if (ps.clear && mk && ps.lead) {
            const le = leaderEnd(r, it.ax, it.ay), L = Math.hypot(le.x - it.ax, le.y - it.ay);
            for (let u = 12; u < L; u += 3) {
              const x = it.ax + ((le.x - it.ax) * u) / L, y = it.ay + ((le.y - it.ay) * u) / L;
              if (lineHits({ x0: x, y0: y, x1: x, y1: y }, 2, dop.id)) return;
            }
          }
        }
        // (A clear pass may share its tier with others, and then the spot nearest its dot wins among them, whatever its direction.)
        // (A stent's point holds its spot only against others of the same pass: a slot it was slid to, while a card opened or the
        // figure moved, never outranks a level one that is free again: Review 16 Oct.)
        const near = ps.tier != null && ps.clear ? Math.hypot((r.x0 + r.x1) / 2 - it.ax, (r.y0 + r.y1) / 2 - it.ay) * 10 : 0;
        const cost = (ps.tier ?? pi) * 1e4 + (inside ? 0 : 2e3) + (ps.clear ? 0 : onLine * 12) + i + near + (ps.bias || 0) - (held ? (ps.clear ? (it.point && it.col ? 5e3 : 1e5) : 4) : 0);
        if (!best || cost < best.cost) best = { cost, dx, dy, r, dir, pi, leader: ps.leader };
      }));
      if (!best) {
        // No room with the value: try it without its units and change, then the name alone (up to maxShort), before giving the label up.
        if (it.canShort && (it.short || 0) < maxShort && shortenItem(it)) return placeMulti(it, dirs, passes, from, to, final, maxShort);
        if (!final) return false;
        nextSol.set(it.key, { drop: true }); return false;
      }
      // The text hugs the station side of its reserved box.
      const slack = it.rot ? 0 : wRes - it.w, dir = best.dir;
      it.x = it.ax + best.dx + (dir.includes('W') ? slack : dir.includes('E') ? 0 : slack / 2);
      it.y = it.ay + best.dy; it.dir = dir;
      // A leader line shows only when the label sits clearly away from its station: it appears past
      // 18 px and goes only below 10 px, so it cannot flicker as the view moves.
      const rr = best.r, gapPx = Math.hypot(Math.max(rr.x0 - it.ax, 0, it.ax - rr.x1), Math.max(rr.y0 - it.ay, 0, it.ay - rr.y1));
      const lead = gapPx > 18 || (!!prev?.lead && gapPx >= 10);
      it.leader = !!best.leader || lead;
      const [wx, wy] = localToWorld(it.ax, it.ay);
      nextSol.set(it.key, { wx, wy, dx: best.dx, dy: best.dy, dir, pi: best.pi, w: wRes, h: it.h, leader: it.leader, lead, short: it.short || 0, abbr: !!it.abbr });
      it._r = best.r; placed.push(best.r); out.push(it);
      return true;
    };

    if (!circuit) {
      // ── Anatomy ──
      // The FibroScan probe is screen furniture on the liver: no label sits on it or on the reading shown on its body.
      const tip = scanTipLocal();
      if (tip) placed.push({ x0: tip.tx - 74, y0: tip.y - 74, x1: tip.tx + 12, y1: tip.y + 12 });   // the probe and the reading on its body
      const lvl = st.labelLevel || 'key', zoomed = zoomedIn();
      // A presenter slide names exactly the stations it talks about (store.presentLabels).
      const pres = st.presenting && Array.isArray(st.presentLabels) ? st.presentLabels : null;
      const show = new Set(pres || (lvl === 'none' ? [] : lvl === 'key' && !zoomed ? [...KEY_NODES, ...flagged(f)] : CHIP_NODES));
      // No varices, no varices callout: in a healthy patient the node's pressure is just the balance
      // between the coronary vein and the azygos, and a "varices" label on it would mislead.
      if (!hasVarices('VAR', f)) show.delete('VAR');
      if (!pres && lvl !== 'none' && hasVarices('GV', f)) show.add('GV');
      if (pres && !hasVarices('GV', f)) show.delete('GV');
      // Key, at the home framing on a wide screen: the other major stations too, but only where one fits
      // beside its vessel without a leader (see `minor` below); a phone keeps to the key ones.
      const minor = new Set(!pres && lvl === 'key' && !zoomed && !compact ? CHIP_NODES.filter((id) => !show.has(id) && id !== 'VAR') : []);
      for (const id of minor) show.add(id);
      if (st.selection?.type === 'node') { show.add(st.selection.id); minor.delete(st.selection.id); }
      const [lx] = worldToLocal(ATLAS_COLUMNS[0], 500), [rx] = worldToLocal(ATLAS_COLUMNS[1], 500);
      const colW = 150;
      // Pressures sit beside their vessels at every size (no margin columns with long leaders).
      const atlas = false;
      const items = [];
      for (const id of show) {
        if (!NODE_POS[id] || labelHidden(id)) continue;
        const { ax, ay, mid, w: vw } = labelAnchor(id, t);
        const it = nodeItem(id, f, atlas ? 'atlas' : 'inline', compact);
        it.ax = ax; it.ay = ay; it.vw = mid ? vw * CTM.sc : 0; it.pri = it.sel ? 100 : minor.has(id) ? 1 : ANAT_PRI[id] || 5;
        it.minor = minor.has(id);
        if (it.minor) it.canShort = false;   // an optional label shows whole or not at all
        it.side = ATLAS_LABELS[id]?.side || (NODE_POS[id][0][0] < 700 ? 'L' : 'R');
        items.push(it);
      }
      // A TIPS or DIPS shunt gets its own callout: the velocity through it (cm/s), as Doppler reads it.
      for (const sid of ['TIPS', 'DIPS']) {
        if (stentReady(sid, f) && EI[sid] >= 0 && dop.all && dop.id === sid && geo[sid]?.cur?.length > 1) {
          // (A slide that reads the stent at its three points calls out all three, each at its own third, in a column beside their
          // dots, before the slide's mark, which finds its place around them.)
          const vw = labelAnchor(sid, t).w;
          for (const point of ['proximal', 'mid', 'distal']) {
            const [ax, ay] = worldToLocal(...pointAt(geo[sid].cur, STENT_SITES[point]));
            const it = velItem(sid, f, point);
            it.ax = ax; it.ay = ay; it.vw = vw * CTM.sc; it.pri = 8; it.side = 'R'; it.col = ptSide; it.colGap = colGap(sid);
            it.canShort = false; it.point = true;   // (a point's name without its number says nothing: whole, or not at all)
            // (Where a point finds no room in its column, the narrowing's jet tries the spots farther out first.)
            const pp = f.viewParams || st.params;
            it.jet = (pp.stenosis?.[sid] || 0) > 0 && stentSite(pp, sid) === point;
            it.later = false;
            items.push(it);
          }
        } else if (stentReady(sid, f) && EI[sid] >= 0) {
          let { ax, ay, mid, w: vw } = labelAnchor(sid, t);
          // (While the Doppler samples this stent, the callout points at the third its gate reads, where the stent glows.)
          if (dop.id === sid && dop.seg && geo[sid]?.cur?.length > 1) [ax, ay] = worldToLocal(...pointAt(geo[sid].cur, STENT_SITES[dop.seg]));
          const it = velItem(sid, f);
          it.ax = ax; it.ay = ay; it.vw = mid ? vw * CTM.sc : 0; it.pri = 9; it.side = 'R';
          items.push(it);
        }
      }
      // Zoomed in, the other stations in view get their pressure too (hepatic veins, portal branches,
      // the left sinusoids...), each only where it stands clear of the labels already there, so they
      // appear as the zoom makes room and the overview stays uncluttered.
      if (!atlas && !pres && lvl !== 'none' && (vt.k > 1.35 || zoomed || lvl === 'all')) {
        const room = compact ? 64 : 80;
        for (const id of ANAT_EXTRA) {
          if (show.has(id) || !NODE_POS[id] || !(NI[id] >= 0) || labelHidden(id)) continue;
          const { ax, ay, mid, w: vw } = labelAnchor(id, t);
          if (items.some((o) => Math.hypot(o.ax - ax, o.ay - ay) < room)) continue;
          const it = nodeItem(id, f, 'inline', compact);
          it.ax = ax; it.ay = ay; it.vw = mid ? vw * CTM.sc : 0; it.pri = ANAT_PRI[id] || 4;
          it.side = ATLAS_LABELS[id]?.side || (NODE_POS[id][0][0] < 700 ? 'L' : 'R');
          items.push(it);
        }
      }
      if (atlas) {
        for (const side of ['L', 'R']) {
          const col = items.filter((it) => it.side === side).sort((a, b) => a.ay - b.ay);
          const cx0 = side === 'L' ? lx - colW : rx, cx1 = side === 'L' ? lx : rx + colW;
          let top = 10, bottom = H - 10;
          for (const b of blockers) {
            if (b.x1 < cx0 || b.x0 > cx1) continue;
            if (b.y0 < H / 2) top = Math.max(top, b.y1 + 8); else bottom = Math.min(bottom, b.y0 - 8);
          }
          const gap = 8;
          const need = col.reduce((sum, it) => sum + it.h + gap, 0);
          if (bottom - top < need) { top = 10; bottom = Math.max(top + need, H - 10); }
          for (let i = 0; i < col.length; i++) col[i].y = Math.max(col[i].ay - col[i].h / 2, i ? col[i - 1].y + col[i - 1].h + gap : top);
          for (let i = col.length - 1; i >= 0; i--) col[i].y = Math.min(col[i].y, i < col.length - 1 ? col[i + 1].y - col[i].h - gap : bottom - col[i].h);
          const elbow = side === 'L' ? lx + 12 : rx - 12;
          for (const it of col) {
            it.x = side === 'L' ? lx - 8 - it.w : rx + 8;
            // A floating card over the column hides the labels it covers rather than sitting on them.
            if (blockers.some((b) => hits(rectOf(it), b))) continue;
            it.align = side === 'L' ? 'end' : 'start';
            // Left column: the line starts at the label's left edge, under the text, so it never ends at the right.
            const ly = side === 'L' ? it.y + it.h : it.y + Math.min(it.h / 2, 16);
            const x0 = side === 'L' ? it.x : rx + 4;
            leaders.push({ k: 'al:' + it.key, tag: 'path', at: { class: `leader${it.sel ? ' hl' : ''}`, d: `M${x0.toFixed(1)} ${ly.toFixed(1)} L${elbow.toFixed(1)} ${ly.toFixed(1)} L${it.ax.toFixed(1)} ${it.ay.toFixed(1)}` } },
              { k: 'ad:' + it.key, tag: 'circle', at: { class: 'leader-dot', cx: it.ax.toFixed(1), cy: it.ay.toFixed(1), r: '2.4' } });
            it.fixedLead = true;   // (its leader is drawn here, from where it stands now: it never glides away from it)
            placed.push(rectOf(it));
            out.push(it);
          }
        }
      } else {
        // Inline: dots on the anatomy, labels nearby with short leaders, most important first.
        buildLines();
        for (const it of items) placed.push({ x0: it.ax - 4, y0: it.ay - 4, x1: it.ax + 4, y1: it.ay + 4 });
        for (const it of items.sort((a, b) => b.pri - a.pri)) {
          it.align = 'start';
          if (it.later) { later.push(it); continue; }
          // (A stent's point: in its column, level with its dot (Review 15 Oct), a little farther out first (16 px at most) to clear its
          // narrowing's clamp, off the vessels where it can be; slid up or down only where its neighbour leaves no room level.)
          const COL = [0, -6, 6, -12, 12, -18, 18];
          // (The jet's dot has its narrowing's arrows beside it: level just past the arrow before sliding off its dot's line.)
          const level = [...new Set([it.colGap, 12, 14, 16, ...(it.jet ? [20, 24, 28, 32, 36, 40] : [])].filter((g) => g >= it.colGap))];
          const lv = (credit) => [true, false].flatMap((clear) => level.map((gap) => ({ gap, leader: true, clear, credit })));
          const sh = (credit) => [true, false].flatMap((clear) => COL.slice(1).map((y) => ({ gap: it.colGap, leader: true, clear, credit, shift: [0, y] })));
          if (it.point && it.col && placeMulti(it, [it.col], [...lv(true), ...lv(false), ...sh(true), ...sh(false)])) continue;
          const dirs = it.side === 'L' ? ['NW', 'W', 'SW', 'N', 'S', 'NE', 'E', 'SE'] : ['NE', 'E', 'SE', 'N', 'S', 'NW', 'W', 'SW'];
          // Prefer a spot touching no vessel at all, near first; only then accept one that crosses a vessel.
          const near = 8 + it.vw / 2, far = 24 + it.vw / 2;
          if (it.minor) { placeMulti(it, dirs, [{ gap: near, leader: false, clear: true }]); continue; }
          if (placeMulti(it, dirs, [{ gap: near, leader: false, clear: true }, { gap: far, leader: true, clear: true }, { gap: near, leader: false }, { gap: far, leader: true }])) continue;
          // (A sampled stent point, or the jet, with no room by its third tries again farther out, once the slide's mark has its place.)
          if (it.point) { later.unshift(it); continue; }
          if (it.sel) { place(it, ['C'], 0, false) || (out.push(Object.assign(it, { x: it.ax + 8, y: it.ay - it.h / 2 })), true); }
        }
      }
      // Organ names: fixed inside their organ, dropped where a label needs the room.
      if (st.layers.labels && t < 0.3) {
        for (const [txt, x, y] of ORGAN_LABELS) {
          const [ax, ay] = worldToLocal(x, y);
          const up = txt.toUpperCase();
          const it = { key: 'o:' + txt, cls: 'organ', lines: [[{ t: up, size: 9.5, weight: 600, cls: 'lb-organ', track: 0.06 }]], align: 'middle', padX: 2, padY: 1, ax, ay };
          it.w = lineW(it.lines[0]); it.h = LINE_H(it.lines[0]);
          place(it, ['C'], 0, false);
        }
      }
    } else {
      // ── Circuit: zone titles, then stations by priority, then resistances ──
      // Turned upright, a direction given on the map (N, E, ...) points somewhere else on the screen.
      const turned = rotU > 0.5, dirOf = (d) => (turned ? TURN_DIR[d] : d);
      for (const [txt, x0, x1] of CIRCUIT_ZONES) {
        const [a, ay0] = worldToLocal(x0, 60), [b, by] = worldToLocal(x1, 60);
        // The liver's and the heart's titles open their cards (there is no organ to click in the circuit).
        const organ = { 'Liver · sinusoids': 'liver', Heart: 'heart' }[txt];
        const it = { key: 'z:' + txt, cls: organ ? 'zonecap link' : 'zonecap', lines: [[{ t: txt, size: 10.5, weight: 650, cls: 'lb-zone' }]], align: 'middle', padX: 2, padY: 2 };
        if (organ) {
          it.onClick = () => onSelect({ type: 'organ', id: organ });
          it.label = `${txt}: open its card`; it.hit = true;
          it.sel = st.selection?.type === 'organ' && st.selection.id === organ;
        }
        it.w = lineW(it.lines[0]); it.h = LINE_H(it.lines[0]);
        // Zone titles are screen furniture (they keep to the map's top or left edge as it pans), so they are
        // set out every frame rather than solved. Figure labels were placed round their natural spot, and
        // one that a pan brings under a title is hidden.
        const zoneAt = (x, y) => { it.live = true; it.ax = x; it.ay = y; const bx = it.rot ? it.h : it.w, by2 = it.rot ? it.w : it.h; it.x = x - bx / 2; it.y = y - by2 / 2; return rectOf({ ...it, x: it.x, y: it.y, w: bx, h: by2 }); };
        // A narrow zone (a zoomed-out circuit, or large text) takes a shorter title rather than none; one that
        // still does not fit its band is left out rather than run into its neighbour's.
        const span = turned ? Math.abs(by - ay0) : b - a;
        for (const alt of ZONE_SHORT[txt] || []) {
          if (span > it.w + 6) break;
          it.lines = [[{ ...it.lines[0][0], t: alt }]]; it.w = lineW(it.lines[0]);
        }
        if (turned) {
          if (span <= it.w + 6) continue;
          // Upright, a zone is a horizontal band: its title runs up the map's left edge (text turned to read
          // bottom to top), centred on the band.
          it.rot = true;
          // (On a slide the readings keep out of the whole title column, not just the title's box: 17 Oct design review.)
          if (solve) { const zb = zoneAt((a + b) / 2, (ay0 + by) / 2); placed.push(st.presenting ? { x0: -1e4, y0: Math.min(ay0, by), x1: zb.x1 + 2, y1: Math.max(ay0, by), zone: true } : { ...zb, zone: true }); }
          const zx = Math.max(it.h / 2 + 8, (a + b) / 2), zr = zoneAt(zx, (ay0 + by) / 2);
          // (It may slide along its band: see the last pass.)
          it._slide = { at: (c) => zoneAt(zx, c), c: (ay0 + by) / 2, lo: Math.min(ay0, by) + it.w / 2 + 3, hi: Math.max(ay0, by) - it.w / 2 - 3 };
          if (within(zr, { x0: 6, y0: 6, x1: W - 6, y1: H - 6 }) && !blockers.some((o) => hits(zr, o)) && !callouts.some((o) => hits(zr, o))) { out.push(it); obstacles.push({ ...zr, zone: true }); it._zr = zr; }
          continue;
        }
        if (b - a > it.w + 6) {
          // (On a slide the readings keep out of the whole header row over the zone, not just the title's box: a reading and its
          // leader had crossed "Portal veins", and the resistances had sat in the row: 17 Oct design review.)
          if (solve) { const zb = zoneAt((a + b) / 2, by), y1 = Math.max(zb.y1, zoneAt((a + b) / 2, Math.max(14, by)).y1); placed.push(st.presenting ? { x0: a, y0: -1e4, x1: b, y1: y1 + 2, zone: true } : { ...zb, zone: true }); }
          const zy = Math.max(14, by), zr = zoneAt((a + b) / 2, zy);
          it._slide = { at: (c) => zoneAt(c, zy), c: (a + b) / 2, lo: a + it.w / 2 + 3, hi: b - it.w / 2 - 3 };
          if (within(zr, { x0: 6, y0: 6, x1: W - 6, y1: H - 6 }) && !blockers.some((o) => hits(zr, o)) && !callouts.some((o) => hits(zr, o))) { out.push(it); obstacles.push({ ...zr, zone: true }); it._zr = zr; }
        }
      }
      buildLines();
      // (A station's ring, 4 px round, stays clear of every reading's halo by 2 px. The halo widens with the text (styles/app.css,
      // #labels .lb.inline.bare text: 4 px a unit of --lbk; 7 px on a vessel, .on-vessel), and only the 3 px beside the words
      // (padX) leave less room than the line's own space above and below them, so the room kept to either side of the ring grows
      // with it: on an upright iPad, LHV's halo had covered its ring.)
      const ringR = 5, ringRX = 3.5 + Math.max(2 * labelK, 3.5);
      // The liver's stations show when zoomed in on it or when one is selected (there is no box to open them).
      const open = liverExpanded();
      const nodes = [], flagC = flagged(f);
      for (const n of NODES) {
        if (!nodeEls[n.id] || !CIRCUIT_LABELS[n.id]) continue;
        if (!nodeVisible(n.id) || labelHidden(n.id)) continue;
        if ((n.id === 'VAR' || n.id === 'GV') && !hasVarices(n.id, f)) continue;
        if (!open && LIVER_INNER.has(n.id) && !(st.selection?.type === 'node' && st.selection.id === n.id)) continue;
        // Levels of detail: none shows only a selected station; key, zoomed out, the major ones (and the flagged).
        const isSel = st.selection?.type === 'node' && st.selection.id === n.id, lvlC = st.labelLevel || 'key';
        if (!isSel && (lvlC === 'none' || (lvlC === 'key' && !zoomedIn() && CIRCUIT_LABELS[n.id].pri < (compact ? 8 : 5) && !flagC.includes(n.id)))) continue;
        const { ax, ay, mid, tan, w: vw } = labelAnchor(n.id, t);
        // The station dot stays where it is; a callout on a vessel also keeps clear of its own marker.
        const [sx, sy] = worldToLocal(...nodePos(n.id, t));
        placed.push({ x0: sx - ringRX, y0: sy - ringR, x1: sx + ringRX, y1: sy + ringR, dot: true }); ringXY.push([sx, sy, ringRX]);
        if (mid) placed.push({ x0: ax - 4, y0: ay - 4, x1: ax + 4, y1: ay + 4, dot: true });
        const it = nodeItem(n.id, f, 'station', compact);
        it.align = 'middle'; it.ax = ax; it.ay = ay; it.mid = mid; it.tan = tan; it.vw = vw * CTM.sc; it.pri = it.sel ? 100 : CIRCUIT_LABELS[n.id].pri;
        nodes.push(it);
      }
      // (Every other dot keeps clear of the readings too: a station whose reading is left out at this level of detail, or has none, still
      // has its dot, and a reading had sat on it: the colon bed's, under the spleen's.)
      const labelled = new Set(nodes.map((it) => it.node));
      for (const d of bareDots(NODES.filter((n) => nodeEls[n.id]), { labelled, shown: nodeVisible, at: (id) => worldToLocal(...nodePos(id, t)), scale: CTM.sc, minX: ringRX, minY: ringR })) {
        placed.push({ ...d.box, dot: true }); ringXY.push([d.x, d.y, ringRX]);
      }
      // Stations by priority, each beside its station: level with it first (beside a vertical run, over a horizontal one).
      // A minor station gives way rather than sit on a vessel or crowd its neighbours.
      const plan = nodes.sort((a, b) => b.pri - a.pri).map((it) => {
        const pref = it.mid ? (Math.abs(it.tan[0]) >= Math.abs(it.tan[1]) ? ['N', 'S'] : ['E', 'W']) : CIRCUIT_LABELS[it.node].dirs.map(dirOf);
        const dirs = [...pref, ...['N', 'S', 'E', 'W', 'NE', 'SE', 'NW', 'SW'].filter((d) => !pref.includes(d))];
        const half = it.vw / 2, minor = it.pri <= 4 && !it.sel, fine = [7, 12, 18, 24, 30, 36].map((g) => g + half), ring = [44, 54, 64, 76].map((g) => g + half);
        // (passes 0-2: beside the station, as always; from 3 on: a reading on a vessel looks for a clear spot, below)
        const passes = [...[7, 18, 30].map((g) => ({ gap: g + half, clear: minor })),
          ...fine.map((gap) => ({ gap, dirs: pref, clear: true, inView: true })), ...fine.map((gap) => ({ gap, clear: true, inView: true })),
          ...ring.map((gap) => ({ gap, dirs: RING_DIRS, ring: 'clean', clear: true, inView: true })), ...ring.map((gap) => ({ gap, dirs: RING_DIRS, ring: 'any', clear: true, inView: true }))].map((ps) => ({ ...ps, leader: false }));
        return { it, dirs, passes, half };
      });
      rings = plan.map(({ it }) => it);
      // As they were (v2): each beside its station, shortened, or given up, where there is no room.
      for (const { it, dirs, passes, half } of plan) {
        it._full = { lines: it.lines, w: it.w, h: it.h, short: it.short, abbr: it.abbr };   // (its whole form, for the rescue below)
        if (!placeMulti(it, dirs, passes, 0, 3) && it.sel) place(it, dirs, 40 + half, true);
      }
      // Then a reading that sits on a vessel moves to the nearest clear spot, the others staying where they are: beside its
      // station, else a little further out with a short leader (one that crosses no vessel first, then one that crosses no
      // label or leader); with no clear spot near it stays where it was, its halo solid and no flow arrowhead under it
      // (onVessel: renderBlock, noChevBoxes). (A nearer spot on a vessel used to beat a clear one a little further out:
      // "7.8 mmHg" ran into the portal trunk, "4.1" sat on the liver's zigzag, and RA's "mmHg" on its branch.)
      // (A spot outside the free space counts too: the reading is later pulled back into view, onto whatever is there.)
      // (All of them leave their spots first, so a reading moving out is not blocked by one that is about to move too.)
      // (So does one under a card, which the card would hide.)
      const onVessel = solve && useLines ? plan.filter(({ it }) => it._r && out.includes(it) && (lineHits(it._r, 2) || !within(it._r, view) || obstacles.some((o) => !o.zone && hits(it._r, o)))) : [];
      // (Each keeps its old spot reserved until it finds a new one, so one that finds none keeps it.)
      for (const { it } of onVessel) { it._keep = { x: it.x, y: it.y, dir: it.dir, leader: it.leader, sol: nextSol.get(it.key) }; it._r.old = true; out.splice(out.indexOf(it), 1); }
      for (const { it, dirs, passes } of onVessel) {
        const r0 = it._r;
        placed.splice(placed.indexOf(r0), 1);
        if (placeMulti(it, dirs, passes, 3, passes.length, false)) continue;
        const k = it._keep;
        const onv = lineHits(r0, 2) > 0;
        Object.assign(it, { x: k.x, y: k.y, dir: k.dir, leader: k.leader, _r: r0, onVessel: onv }); nextSol.set(it.key, { ...k.sol, onv }); placed.push(r0); out.push(it);
      }
      // Last, a reading given up or left without its value is rescued, the others staying where they are: whole (else without
      // its units and change) in the nearest free spot further out, with a leader; else a little further out than its usual
      // spots, on a vessel if it must (with the solid halo); else over a zone's title, which then moves along its band or,
      // with no room there, gives way (see the last pass). Kept 12 px from a callout's row (a lone "Splenic v." 7 px after
      // "R liver ×1.0" read as one line). With no room at all it stays as it was.
      // (Readings already hidden or without their value leave their spots first, as on a vessel above, so a rescue's leader may
      // cross where they were: RA under a phone's data card has room only past IVC's name. One of them that then finds no room
      // goes back to its spot where that is still free, else is given up: it showed no value there either.)
      const rescueOf = [];
      const segOf = (o) => { const e = leaderEnd(rectOf(o), o.ax, o.ay); return { x0: o.ax, y0: o.ay, x1: e.x, y1: e.y }; };
      const free = (r) => !placed.some((p) => !p.dot && hits(r, p)) && !out.some((o) => o.leader && !o.live && segHitsBox(segOf(o), r, 2));
      if (solve && useLines) for (const e of plan) {
        const { it } = e, shown = out.includes(it);
        // (Also one under a card or callout, which would hide it.)
        // (And one over a station's ring, its own included: a halo there hides the ring.)
        // (And one outside the free space, which the pull below would set down on whatever is there.)
        const atRisk = shown && it._r && (!within(it._r, view) || obstacles.some((o) => !o.zone && hits(it._r, o)) || rings.some((o) => o.ax > it._r.x0 - 7 && o.ax < it._r.x1 + 7 && o.ay > it._r.y0 - 7 && o.ay < it._r.y1 + 7));
        if (it.sel || (shown && (it.short || 0) < 2 && !atRisk) || !it._full || (it._full.short || 0) >= 2) continue;
        const was = { lines: it.lines, w: it.w, h: it.h, short: it.short, abbr: it.abbr, x: it.x, y: it.y, dir: it.dir, leader: it.leader, _r: it._r, sol: nextSol.get(it.key) };
        const early = shown && (it.short || 0) >= 2;   // (a name without its value: off its spot from the start)
        if (early) { out.splice(out.indexOf(it), 1); placed.splice(placed.indexOf(it._r), 1); }
        rescueOf.push({ e, was, shown, early });
      }
      for (const { e: { it, dirs, passes, half }, was, shown, early } of rescueOf) {
        if (shown && !early) { out.splice(out.indexOf(it), 1); placed.splice(placed.indexOf(it._r), 1); }
        // (Then further out still, on rings 90 to 118 px round: a station at the edge of the free space, RA under a phone's data card,
        // has no clear spot nearer.)
        const outer = [90, 104, 118].map((g) => g + half);
        const far = [...passes.slice(3), ...outer.map((gap) => ({ gap, dirs: RING_DIRS, ring: 'clean', clear: true, inView: true })), ...outer.map((gap) => ({ gap, dirs: RING_DIRS, ring: 'any', clear: true, inView: true }))].map((ps) => ({ ...ps, callGap: 12, resc: true }));
        const near = [...passes.slice(0, 3), { gap: passes[2].gap + 10 }, { gap: passes[2].gap + 18 }].map((ps) => ({ ...ps, clear: false, strict: true, inView: true, callGap: 12, resc: true }));
        // (Then out on the same rings over a vessel, with the solid halo: on a phone the free space round VAR is all vessels, and
        // nearer than the rings there is no room.)
        const farOn = far.map((ps) => ({ ...ps, clear: false, ring: 'any' }));
        const ok = [far, near, farOn, near.map((ps) => ({ ...ps, overZones: true }))].some((R) => {
          Object.assign(it, { lines: it._full.lines, w: it._full.w, h: it._full.h, short: it._full.short, abbr: it._full.abbr, one: false });   // (whole again for each try)
          return placeMulti(it, dirs, R, 0, R.length, false, 1);
        }) || [0, 1].some((sh) => [far, near, farOn, far.map((ps) => ({ ...ps, overZones: true })), near.map((ps) => ({ ...ps, overZones: true }))].some((R) => {
          // (Else on one line, name then value (then without its units): a station at the top of the free space, RA under a phone's
          // data card, has room beside it only for a reading one line tall.)
          Object.assign(it, { lines: it._full.lines, w: it._full.w, h: it._full.h, short: it._full.short, abbr: it._full.abbr, one: false });
          if (sh && !((it.short || 0) < 1 && shortenItem(it, false) && it.short === 1)) return false;
          oneLine(it);
          return it.one && placeMulti(it, [...dirs, 'EL', 'WL'], R, 0, R.length, false, it.short || 0);
        }));
        // (Its slot is not one of the usual passes': marked so the next layout does not take it for one held there.)
        if (ok) { it.onVessel = lineHits(it._r, 2) > 0; const sol = nextSol.get(it.key); if (sol) { sol.onv = it.onVessel; sol.pi = -1; sol.one = !!it.one; } continue; }
        Object.assign(it, { lines: was.lines, w: was.w, h: was.h, short: was.short, abbr: was.abbr, x: was.x, y: was.y, dir: was.dir, leader: was.leader, _r: was._r, one: false });
        if (was.sol) nextSol.set(it.key, was.sol);
        if (shown && (!early || free(was._r))) { out.push(it); placed.push(was._r); } else if (shown) nextSol.set(it.key, { drop: true });
      }
      // Any reading left touching a vessel (within 3 px) takes the solid halo.
      if (solve && useLines) for (const { it } of plan) if (out.includes(it) && it._r && !it.onVessel && lineHits(it._r, 3)) { it.onVessel = true; const sol = nextSol.get(it.key); if (sol) sol.onv = true; }
      // (And any left on a station's ring is marked, so the next frames carry it rather than solve again: see placeMulti.)
      if (solve) for (const { it } of plan) { const sol = nextSol.get(it.key); if (sol && !sol.drop && out.includes(it) && placed.some((p) => p.dot && p !== it._r && hits(rectOf(it), p))) sol.dot = true; }
      // One unit rule for the whole circuit (17 Oct design review): where any reading had to drop its unit for room, every reading
      // shows its number alone ("Gut bed 21.1" had stood beside "SMV 18.7 mmHg"). Each one only narrows, toward its station, so it
      // runs into nothing it had cleared; its slot keeps the width it reserved, so the next frames carry it unchanged.
      if (solve) {
        const shown = plan.map(({ it }) => it).filter((it) => out.includes(it) && it.canShort);
        const bare = (l) => l.some((r) => r.cls === 'lb-val') && l.some((r, i) => i && r.cls !== 'lb-val' && r.cls !== 'lb-name');
        if (shown.some((it) => it.short === 1)) for (const it of shown) {
          if (it.short) continue;
          const w0 = it.w;
          if (it.one && bare(it.lines[0])) { it.lines = [it.lines[0].filter((r, i) => !i || r.cls === 'lb-val')]; it.w = lineW(it.lines[0]); it.short = 1; }
          else if (!it.one && it.lines.length === 2 && bare([it.lines[0][0], ...it.lines[1]])) shortenItem(it, false);
          else continue;
          const dw = w0 - it.w;
          it.x += it.dir?.includes('W') ? dw : it.dir?.includes('E') ? 0 : dw / 2;
          const sol = nextSol.get(it.key);
          if (sol && !sol.drop) sol.short = 1;
        }
      }
      // Collateral and shunt lanes, captioned along their run.
      for (const [id, cap] of Object.entries(LANE_CAPTIONS)) {
        const x = E[id];
        if (!x?.vis || x.g.classList.contains('coll-ghost') || labelHidden(id)) continue;
        const it = { key: 'lane:' + id, cls: 'lane', lines: [[{ t: cap, size: 10, weight: 550, cls: 'lb-lane' }]], align: 'middle', padX: 2, padY: 1, ax: 0, ay: 0 };
        it.w = lineW(it.lines[0]); it.h = LINE_H(it.lines[0]);
        // Turned upright, a lane that runs up the screen is captioned along it (text turned to read bottom to top), beside it.
        const at = (u) => { const [lx, ly] = pointAt(geo[id].cur, u); [it.ax, it.ay] = worldToLocal(lx, ly); };
        let vertical = false;
        if (turned) {
          at(laneU[id]);
          const [bx, by] = worldToLocal(...pointAt(geo[id].cur, Math.min(1, laneU[id] + 0.03)));
          vertical = Math.abs(by - it.ay) > Math.abs(bx - it.ax) * 1.2;
        }
        if (vertical) it.rot = true;
        const dirs = vertical ? ['E', 'W'] : [dirOf('N'), dirOf('S')], gaps = [3 + (x.width || 4) / 2, 12 + (x.width || 4) / 2];
        // Try the spots along the lane that no other vessel touches, then settle for the first.
        const spots = [laneU[id], ...(laneAlt[id] || [])];
        // Failing that, the caption rides on its own lane (never on another line).
        if (!spots.some((u) => { at(u); return place(it, dirs, gaps, false, true); })) { at(laneU[id]); place(it, ['C'], 0, false); }
      }
    }
    // (Beside a stent's column of three points the slide's mark keeps off the whole column, the gaps between its callouts included, so
    // the three read as one block in order.)
    if (solve && ptSide) {
      const col = out.filter((o) => o.point).map(rectOf);
      if (col.length > 1) placed.push({ x0: Math.min(...col.map((r) => r.x0)), y0: Math.min(...col.map((r) => r.y0)), x1: Math.max(...col.map((r) => r.x1)), y1: Math.max(...col.map((r) => r.y1)) });
    }
    // Focus callout
    const foc = st.focus;
    (foc ? foc.marks || [foc] : []).forEach((m, i) => {
      if (!m.edges?.length || !E[m.edges[0]]?.vis || (i && !m.label)) return;
      // (A mark on one third of a stent points at that third.)
      const segAt = m.seg && isStent(EDGES[EI[m.edges[0]]]) ? STENT_SITES[stentGate(m.seg, f.viewParams || st.params, m.edges[0])] : 0.5;
      const [x, y] = pointAt(geo[m.edges[0]].cur, segAt);
      const [ax, ay] = worldToLocal(x, y);
      const key = i || m.kind ? `focus${i}${m.kind || ''}` : 'focus', cls = 'focus' + (m.kind ? ` k-${m.kind}` : '');
      // (A mark whose words carry live readings, deck visuals V8: its words come from the slide's callouts, filled as the model moves.)
      const lk = `${m.edges[0]}|${m.kind || 'block'}`, lv = fx?.live?.[lk];
      const it = lv ? fxPill(key, lv, cls, m.kind === 'note') : { key, cls, lines: [[{ t: m.label || 'Here', size: 11.5, weight: 650, cls: 'lb-focus' }]], align: 'start', bg: true, padX: 8, padY: 4 };
      Object.assign(it, { mk: m.kind, ax, ay });
      if (lv) { it.src = ['fx', key]; fxBuild.set(key, () => fx?.live?.[lk] && fxPill(key, fx.live[lk], cls, m.kind === 'note')); }
      else { it.w = lineW(it.lines[0]); it.h = LINE_H(it.lines[0]); }
      // (A free mark stands by itself, with no leader: it names a group of vessels, so a line to the first would single it out.)
      const gap = 18 + (E[m.edges[0]].width || 4);
      // (Beside a stent called out at all three points the mark may stand a little farther off, on a leader that crosses no label.)
      // (...off the vessels first, even where that takes the credit's corner (the credit finds another), then clear of the credit;
      // each spot also nudged 8 or 16 px each way, so a pill that would touch a vessel by a pixel or two slides clear; its leader crosses
      // no label, the "60 %" included, and at each reach it first tries for a leader over no vessel (past the dot's own junction): a
      // short leader beats a long clean one; within a reach, the spot nearest the dot, nudged or not: Review 15 Oct.)
      const NUDGE = [[0, 0], [-8, 0], [0, 8], [8, 0], [0, -8], [-16, 0], [0, 16], [16, 0], [0, -16]];
      // (Where no such spot is off the vessels, any spot within 150 px that is, nearest first, before one over a vessel: Review 16 Oct.)
      const reach = (clear) => [true, false].flatMap((credit) => [gap, gap + 20, gap + 52, gap + 84, gap + 120].flatMap((g) => (clear ? [true, false] : [false]).map((lead) => ({ gap: g, leader: true, uncrossed: true, clear, lead, credit }))));
      const passes = dop.all && [...reach(true), { grid: true }, ...reach(false)].flatMap((ps, tier) => (ps.grid ? MARK_GRID.map((at) => ({ at, gap: 0, leader: true, uncrossed: true, clear: true, tier })) : NUDGE.map((shift) => ({ ...ps, shift, tier }))));
      // (A mark with live readings (package F) keeps its side as its numbers and the vessels under it change: its side first, a little
      // farther out if need be, before it tries another.)
      const side = lv && !dop.all && prevSol.get(it.key);
      // (Its pill also touches nothing drawn: 6 px clear of every vessel, a varix's strands and glow included, and 12 px inside the stage.)
      const tidy = lv && !dop.all ? [gap, gap + 14, gap + 30, gap + 50].map((g) => ({ gap: g, leader: true, clear: true, inView: true, pad: 6, edge: 12 })) : null;
      if (tidy) buildLines();
      let marked = dop.all ? placeMulti(it, FAR_DIRS, passes) : (tidy && ((side && !side.drop && placeMulti(it, [side.dir], tidy)) || placeMulti(it, ['E', 'W', 'NE', 'SE', 'N', 'S', 'NW', 'SW'], tidy))) || (side && !side.drop && place(it, [side.dir], [gap, gap + 16, gap + 32], true)) || place(it, ['E', 'W', 'NE', 'SE', 'N', 'S'], gap, true);
      // (A mark that found no spot off the vessels, where the column's "60 %" blocks its way: the "60 %" tries its next spots off the
      // vessels, nearest first, and keeps the first that lets the mark stand clear; failing all, both stay as they were: Review 16 Oct.)
      if (marked && dop.all && clampAlts.length && clampAlts[0].el._box && placed.includes(clampAlts[0].el._box) && !passes[nextSol.get(it.key)?.pi]?.clear) {
        const el = clampAlts[0].el, keep = clampD.get(el._c.id), old = el._box, at = placed.indexOf(old), clearOnly = passes.map((ps) => (ps.clear ? ps : { ...ps, skip: true }));
        placed.pop(); out.pop();
        let freed = false;
        for (const a of clampAlts) {
          clampD.set(el._c.id, { d: a.d, t: a.t }); clampLabelAt(el);
          const b = boxOfEl(el, 6);
          if (!b || placed.some((p, j) => j !== at && hits(b, p))) continue;
          placed[at] = el._box = { ...b, lab: true };
          if (placeMulti(it, FAR_DIRS, clearOnly)) { freed = true; break; }
        }
        if (!freed) { clampD.set(el._c.id, keep); clampLabelAt(el); placed[at] = el._box = old; marked = placeMulti(it, FAR_DIRS, passes); }
      }
      // (Where no spot is off the vessels (a phone with the monitor open), the pill takes the one over the fewest, and a ring in the
      // stage's colour keeps them 2 px off its edge, as the column's halo does for its callouts: Review 16 Oct.)
      // (Nothing of the column hides: a mark with no spot under those rules takes one whose leader may cross a label or pass near
      // another dot, still off the cards, the labels and its own stent: Review 16 Oct.)
      if (!marked && dop.all) marked = placeMulti(it, FAR_DIRS, passes.map((ps) => (ps.clear ? { ...ps, skip: true } : { ...ps, uncrossed: false, loose: true })));
      const sol = marked && dop.all ? nextSol.get(it.key) : null;
      if (sol && solve) sol.ring = !passes[sol.pi]?.clear && useLines && lineHits(rectOf(it), 3) > 0;   // (only where a vessel comes within reach)
      if (sol?.ring) it.cls += ' ring';
      if (marked && !m.free) it.focusLeader = true;
      it.free = !!m.free;
    });
    // Deck visuals, package F (ext-callouts.js): the slide's marks on organs, its calipers' readings and its steps' numbers on the
    // anatomy, its brackets' readings on the circuit. Each keeps off the vessels where it can, as the stations' readings do.
    if (fx) {
      // (Each set of spots first in the free space only, inside the stage and off the cards, then anywhere.)
      const k = CTM.sc, roomy = (passes) => [...passes.map((ps) => ({ ...ps, inView: true })), ...passes];
      const nearFar = (near) => roomy([{ gap: near, leader: false, clear: true }, { gap: near + 16, leader: true, clear: true }, { gap: near, leader: false }, { gap: near + 16, leader: true }]);
      // A reading's pill touches nothing drawn: 5 px clear of every vessel as drawn (and the lines' boxes), of `avoid` (an organ),
      // and 12 px inside the stage, nearest first, on a short leader once it stands off; only where no such spot is left, the old
      // passes (it never vanishes).
      const clean = (near, avoid, rest) => [...[0, 10, 22, 36, 54, 78].map((d) => ({ gap: near + d, leader: d > 0, clear: true, inView: true, pad: 5, edge: 12, avoid })), ...rest];
      const organBox = (id) => { const a = organAnchor(id, (f.slow?.spleen ?? 11) / 11); if (!a) return null; const [x0, y0] = worldToLocal(a.at[0] - a.half[0], a.at[1] - a.half[1]), [x1, y1] = worldToLocal(a.at[0] + a.half[0], a.at[1] + a.half[1]); return { x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1) }; };
      if (!circuit) fx.organs.forEach((m, i) => {
        // A mark on an organ: off the organ's box, on a leader to its middle (the spleen's box grows with it).
        const a = organAnchor(m.organ, (f.slow?.spleen ?? 11) / 11);
        if (!a || (m.organ !== 'ascites' && !organEls[m.organ]) || (m.organ === 'spleen' && (f.viewParams || st.params)?.splenicRx === 2)) return;
        const key = `focusO${i}`, cls = `focus k-${m.kind}`, it = fxPill(key, m, cls, m.kind === 'note');
        const [ax, ay] = worldToLocal(...a.at), gx = a.half[0] * k + 12, gy = a.half[1] * k + 12, gd = Math.min(gx, gy);
        Object.assign(it, { mk: m.kind, ax, ay, src: ['fx', key] });
        fxBuild.set(key, () => fx?.organs?.[i] && fxPill(key, fx.organs[i], cls, m.kind === 'note'));
        const passes = roomy([true, false].flatMap((clear) => [0, 24, 56].flatMap((d) => [{ dirs: ['E', 'W'], gap: gx + d, leader: true, clear }, { dirs: ['N', 'S'], gap: gy + d, leader: true, clear }, { dirs: ['NE', 'SE', 'NW', 'SW'], gap: gd + d, leader: true, clear }])));
        const ob = m.organ !== 'ascites' && organBox(m.organ), av = ob ? [ob] : undefined;
        const tidy = [0, 24, 56].flatMap((d) => [{ dirs: ['E', 'W'], gap: gx + d, leader: true, clear: true, inView: true, pad: 5, edge: 12, avoid: av }, { dirs: ['N', 'S'], gap: gy + d, leader: true, clear: true, inView: true, pad: 5, edge: 12, avoid: av }, { dirs: ['NE', 'SE', 'NW', 'SW'], gap: gd + d, leader: true, clear: true, inView: true, pad: 5, edge: 12, avoid: av }]);
        buildLines();
        if (placeMulti(it, [], [...tidy, ...passes])) it.focusLeader = true;
      });
      if (!circuit) fx.calipers.forEach((c) => {
        // A caliper's reading at the line's middle, never an end: beside the middle where there is room, square to the line and 5 px
        // clear of it, its ticks, every vessel and the stage's edge (inside an organ it measures, as the spleen's); where there is no
        // room (across a narrow stent), called out on a leader from the middle, off the organ, as the slide's other callouts are.
        const g = caliperAt(c, f);
        if (!g) return;
        const [p0, p1] = [worldToLocal(...g.a), worldToLocal(...g.b)], mid = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
        const key = 'fxc:' + c.id, it = fxPill(key, c, 'fx-cal', true);
        Object.assign(it, { ax: mid[0], ay: mid[1], src: ['fx', key] });
        fxBuild.set(key, () => { const n = fx?.calipers?.find((x) => x.id === c.id); return n && fxPill(key, n, 'fx-cal', true); });
        buildLines();
        const ob = c.organ && organBox(c.organ), av = ob ? [ob] : undefined;
        const beside = [11, 16].map((gap) => ({ gap, leader: false, clear: true, inView: true, pad: 5, edge: 12 }));
        const out = [24, 36, 52, 72, 96].map((gap) => ({ gap, leader: true, clear: true, inView: true, pad: 5, edge: 12, avoid: av }));
        placeMulti(it, besideLine(p0, p1), [...beside, ...out, ...nearFar(24)]);
      });
      if (fx.steps) for (const g of stepGroups(slideGlow.filter((x) => E[x.id]?.vis), fx.steps)) {
        // A step's number by the middle of its vessel (the first of its vessels drawn), or on its organ, lit as its glow lights (V10).
        let ax, ay, near, fans = null;
        if (g.organ) {
          const a = !circuit && organEls[g.organ] && organAnchor(g.organ, (f.slow?.spleen ?? 11) / 11);
          if (!a) continue;
          [ax, ay] = worldToLocal(...a.at); near = 4;
        } else {
          const ids = g.ids.filter((x) => geo[x]?.cur?.length > 1 && !E[x].g.classList.contains('coll-ghost'));
          if (!ids.length) continue;
          // (A vein that fades out of its organ (TIP_FADE) is aimed at in the middle of its solid stretch, not at its middle, which is faint.)
          const mids = ids.map((x) => worldToLocal(...arcMid(geo[x].cur, TIP_FADE[x] > 0.5 ? (1 + TIP_FADE[x]) / 2 : 0.5)));
          // (A group's number stands between its vessels, on a leader to the middle of each: fans.)
          if (g.group && mids.length > 1) { fans = mids; ax = mids.reduce((a, p) => a + p[0], 0) / mids.length; ay = mids.reduce((a, p) => a + p[1], 0) / mids.length; near = 4; }
          else { [ax, ay] = mids[0]; near = 4 + ((E[ids[0]].width || 4) * k) / 2; }
        }
        const it = { key: 'fxs:' + g.n, cls: 'fx-step', lines: [[{ t: String(g.n), size: 11.5, weight: 750, cls: 'lb-step' }]], align: 'middle', bg: true, pill: true, padX: 5, padY: 2, ax, ay, pri: 20, delay: g.at, free: true, label: `Step ${g.n}` };   // (free: no dot on the vessel, only a leader when it stands off)
        it.h = LINE_H(it.lines[0]); it.w = Math.max(lineW(it.lines[0]), it.h - 4);
        buildLines();
        // (A group's spots keep its leaders clear first; where none does, it takes the usual ones, so the number never vanishes.)
        if (fans) it.fans = fans;
        placeMulti(it, ['NE', 'NW', 'SE', 'SW', 'N', 'S', 'E', 'W'], fans ? [...nearFar(near).map((ps) => ({ ...ps, fans })), ...nearFar(24).map((ps) => ({ ...ps, fans })), ...nearFar(near)] : nearFar(near));
      }
      if (circuit) fx.spans.forEach((sp, i) => {
        // A bracket's reading, under its middle (above it where the stage ends first).
        const at = spanOf(sp.from, sp.to, fxK());
        if (!at) return;
        // (Turned upright on a phone, the bracket runs down the circuit's right side, where one line of words has no room: the reading
        // then takes two, its words over its number.)
        const turned = rotU > 0.5, D = (d) => (turned ? TURN_DIR[d] : d), split = turned;
        const [ax, ay] = worldToLocal((at.x0 + at.x1) / 2, at.y), key = 'fxb:' + i, it = fxPill(key, sp, 'fx-span', true, split);
        Object.assign(it, { ax, ay, src: ['fx', key] });
        buildLines();
        fxBuild.set(key, () => fx?.spans?.[i] && fxPill(key, fx.spans[i], 'fx-span', true, split));
        // Under the bracket on a leader, kept inside the stage 12 px from its edges and off every vessel; then beside it.
        // (Turned upright there is no room beside the bracket: the reading stands past its lower end instead, on a leader.)
        if (turned) { const [ex, ey] = worldToLocal(at.x0, at.y); it.ax = ex; it.ay = ey; }
        const order = turned ? ['S', 'SW', 'SE', 'W', 'E'] : [D('S'), D('SE'), D('SW'), D('E'), D('W')];
        placeMulti(it, order, clean(18, undefined, roomy([{ gap: 18, leader: true, clear: true }, { gap: 40, leader: true, clear: true }, { gap: 18, leader: true }])));
      });
    }
    // A stent's other two points, where they fit around the sampled point's callout and the slide's mark: off the vessels if they can.
    later.sort((a, b) => (b.pri - a.pri) || (b.jet - a.jet));
    for (const it of later) {
      const near = 8 + it.vw / 2, far = 24 + it.vw / 2;
      placeMulti(it, ['NE', 'E', 'SE', 'NW', 'W', 'SW', 'N', 'S'], [{ gap: near, leader: false, clear: true }, { gap: far, leader: true, clear: true }, { gap: near, leader: false }, { gap: far, leader: true }])
        || placeMulti(it, FAR_DIRS, [{ gap: far + 12, leader: true, uncrossed: true }, { gap: far + 48, leader: true, uncrossed: true }])
        || placeMulti(it, FAR_DIRS, SLID(far));
    }
    if (stale) return false;
    if (solve) labelSol = nextSol;
    // (The stations' rings, and the readings given up for want of room with where their stations are, for the browser checks:
    // tests/e2e/smoke.mjs. Written at every layout, a carried one too: written only when solved, they lagged behind a pan since,
    // and a reading carried with its ring looked to stand on where the ring had been.)
    const at = new Map(out.concat(rings).map((o) => [o.key, o]));
    const ringsAt = ringXY.map(([x, y]) => `${Math.round(x)},${Math.round(y)}`).join(' ');
    if (gLabels.dataset.rings !== ringsAt) gLabels.dataset.rings = ringsAt;
    const droppedAt = [...labelSol].filter(([k, v]) => v.drop && k.startsWith('n:')).map(([k]) => { const o = at.get(k); return `${k.slice(2)}@${o ? `${Math.round(o.ax)},${Math.round(o.ay)}` : ''}`; }).join(' ');
    if (gLabels.dataset.dropped !== droppedAt) gLabels.dataset.dropped = droppedAt;
    // Which labels show this frame. A slot never moves for a screen-fixed obstacle: a label whose box a
    // panel, card or title covers (or that has panned off the stage) is hidden, and shown again once it is
    // clear of the obstacle by a margin, so it cannot flicker at the edge. A selected label always shows.
    const stage = { x0: 0, y0: 0, x1: W, y1: H };
    // (A Circuit reading that the pull below would set on a station's ring, its own included, where its halo would hide the ring,
    // slides the least it needs instead, any way within 120 px: into the free space, onto no other reading as they will stand, its
    // leader through none of them and none of theirs through it. Failing that it is pulled in as before.)
    if (circuit && ringXY.length) {
      const ns = out.filter((o) => o.key.startsWith('n:') && !o.live && o.ax >= -8 && o.ax <= W + 8 && o.ay >= -8 && o.ay <= H + 8);
      const pull = new Map(ns.map((o) => { const e = rectOf(o), V = viewOf(o); return [o, [Math.max(V.x0 - e.x0, Math.min(0, V.x1 - e.x1)), Math.max(V.y0 - e.y0, Math.min(0, V.y1 - e.y1))]]; }));
      const pulledBox = (o) => { const [cx, cy] = pull.get(o); return rectOf({ ...o, x: o.x + cx, y: o.y + cy }); };
      const onRing = (r) => ringXY.some(([x, y, rx]) => x > r.x0 - rx && x < r.x1 + rx && y > r.y0 - 5 && y < r.y1 + 5);
      for (const it of ns) {
        const [cx, cy] = pull.get(it);
        if ((!cx && !cy) || !onRing(pulledBox(it))) continue;
        const near = ns.filter((o) => o !== it), others = near.map(pulledBox), V = viewOf(it);
        const lines = near.filter((o) => o.leader || Math.hypot(...pull.get(o)) > 2).map((o) => { const r = pulledBox(o), e = leaderEnd(r, o.ax, o.ay); return { x0: o.ax, y0: o.ay, x1: e.x, y1: e.y }; });
        const step = PULL_GRID.find(([dx, dy]) => {
          const r = rectOf({ ...it, x: it.x + cx + dx, y: it.y + cy + dy });
          if (!within(r, V) || onRing(r) || others.some((o) => hits(r, o)) || lines.some((sg) => segHitsBox(sg, r, 2))) return false;
          const e = leaderEnd(r, it.ax, it.ay), sg = { x0: it.ax, y0: it.ay, x1: e.x, y1: e.y };
          return !others.some((o) => segHitsBox(sg, o, 2));
        });
        if (!step) continue;
        it.x += cx + step[0]; it.y += cy + step[1]; it.leader = true; pull.set(it, [0, 0]);
        if (solve && useLines && lineHits(rectOf(it), 2)) { it.onVessel = true; const sol = nextSol.get(it.key); if (sol) sol.onv = true; }   // (on a vessel: the solid halo)
      }
    }
    for (const it of out) {
      if (it.live) { it.hide = false; continue; }
      // A label a pan has pushed over the stage edge is pulled back inside (with a leader to its station)
      // so it is never cut off; once its station has left the stage the label goes too.
      const edge = rectOf(it), V = viewOf(it);
      // An organ's name is pinned inside its organ: where a card or the stage edge covers it, it hides with the organ, never slides.
      if (it.cls === 'organ') { const was = labelVis.get(it.key) !== false, m = was ? 0 : 10; it.hide = !within({ x0: edge.x0 - m, y0: edge.y0 - m, x1: edge.x1 + m, y1: edge.y1 + m }, V) || obstacles.some((o) => hits(edge, o)); labelVis.set(it.key, !it.hide); continue; }
      const cx = Math.max(V.x0 - edge.x0, Math.min(0, V.x1 - edge.x1)), cy = Math.max(V.y0 - edge.y0, Math.min(0, V.y1 - edge.y1));
      if (cx || cy) { it.x += cx; it.y += cy; if (Math.hypot(cx, cy) > 2) it.leader = true; }
      // (A reading pulled in onto a vessel takes the solid halo there too.)
      if ((cx || cy) && solve && useLines && it.key.startsWith('n:') && lineHits(rectOf(it), 2)) { it.onVessel = true; const sol = nextSol.get(it.key); if (sol) sol.onv = true; }
      if (!it.sel && (it.ax < -8 || it.ax > W + 8 || it.ay < -8 || it.ay > H + 8)) { it.hide = true; labelVis.set(it.key, false); continue; }
      if (it.sel) { it.hide = false; continue; }
      const r = it.rot ? rectOf({ ...it, w: it.h, h: it.w }) : rectOf(it), was = labelVis.get(it.key) !== false, m = was ? 0 : it.point || (dop.all && /^focus/.test(it.key)) ? 4 : 10;   // (a turned caption: its box turned too; a stent's point or its mark was placed 4 px off the cards)
      // A zone title is a label too: a reading is never hidden by one (the overlap pass below settles any
      // clash, and a reading outranks a zone title); other labels give way to it only where they truly overlap.
      it.hide = !hits(r, stage) || obstacles.some((o) => !(it.point && o.probe) && (o.zone ? !it.key.startsWith('n:') && hits(r, o) : hits(r, { x0: o.x0 - m, y0: o.y0 - m, x1: o.x1 + m, y1: o.y1 + m })));
      // (A stent's point, or the slide's mark beside it, that the figure's move carried under a card is placed again rather than hidden
      // (nothing of the column hides: Review 16 Oct); at most every quarter second, so a card still easing cannot keep it searching.)
      if (it.hide && !solve && dop.all && (it.point || /^focus/.test(it.key)) && performance.now() - colResolve > 250) { colResolve = performance.now(); return false; }
      labelVis.set(it.key, !it.hide);
    }
    // Last pass: no two labels showing may overlap. A pan can pull a label in from the stage edge onto
    // another, and carried slots are not searched again. The more important label keeps its place; the
    // other drops its value and, if that is not enough, hides until there is room.
    const rank = (it) => (it.sel ? 1e3 : it.key.startsWith('focus') ? 900 : it.cls === 'organ' ? 0 : it.cls === 'lane' ? 1 : it.key.startsWith('z:') && !it.sel ? 1.5 : (it.pri ?? 2) + 2);
    const kept = [];
    // A caption turned upright takes its box turned too (it cannot shorten, so it hides when crowded).
    const boxOf = (it) => (it.rot ? rectOf({ ...it, w: it.h, h: it.w }) : rectOf(it));
    for (const it of out.filter((o) => !o.hide && !o.live).sort((a, b) => rank(b) - rank(a))) {
      let r = boxOf(it);
      if (it.rot) { if (!it.sel && kept.some((k) => hits(r, k))) { it.hide = true; continue; } kept.push(r); continue; }
      if (kept.some((k) => hits(r, k))) {
        const d = it.dir || '';
        for (let w0 = it.w, h0 = it.h; it.canShort && kept.some((k) => hits(r, k)) && shortenItem(it); w0 = it.w, h0 = it.h) {
          it.x += d.includes('W') ? w0 - it.w : d.includes('E') ? 0 : (w0 - it.w) / 2;
          it.y += d.includes('N') ? h0 - it.h : d.includes('S') ? 0 : (h0 - it.h) / 2;
          r = rectOf(it);
        }
        if (!it.sel && kept.some((k) => hits(r, k))) { it.hide = true; continue; }
        // (Shortened where it stands, a reading may come to sit on a vessel: it takes the solid halo there.)
        if (solve && useLines && it.key.startsWith('n:') && !it.onVessel && lineHits(r, 2)) { it.onVessel = true; const sol = nextSol.get(it.key); if (sol) sol.onv = true; }
      }
      kept.push(r);
    }
    // A zone's title under a reading that had nowhere else to go (placeMulti's overZones) slides along its band to the nearest
    // free spot; with none, it gives way.
    const shownBoxes = () => out.filter((o) => !o.hide && !o.live).map(boxOf);
    for (const z of out) {
      if (!z._zr || z.sel || z.hide || !out.some((o) => o.key.startsWith('n:') && !o.hide && hits(rectOf(o), z._zr))) continue;
      const busy = shownBoxes(), { at, c, lo, hi } = z._slide;
      let spot = null;
      for (let d = 4; spot === null && (c - d >= lo || c + d <= hi); d += 4) {
        for (const cc of [c - d, c + d]) {
          if (cc < lo || cc > hi) continue;
          const zr = at(cc);
          if (within(zr, { x0: 6, y0: 6, x1: W - 6, y1: H - 6 }) && !busy.some((k) => hits(zr, { x0: k.x0 - 2, y0: k.y0 - 2, x1: k.x1 + 2, y1: k.y1 + 2 })) && !obstacles.some((o) => !o.zone && hits(zr, o))) { spot = cc; break; }
        }
      }
      if (spot !== null) z._zr = at(spot); else { at(c); z.hide = true; }
    }
    // Leader lines and anchor dots, for the labels showing. (Every line goes down before any dot, so no leader runs over a dot.)
    // (A stent's point: its dot sits on a solid disc of the stage's colour, and every leader that ends there, its own or the slide's
    // mark's, stops 2 px outside the disc; one left shorter than 4 px is not drawn: Review 15 Oct.)
    labelGlide(out);
    // No flow arrowhead runs under a reading that has to sit on its vessel (veins-gl.js noChev; world boxes, 3 px of air: its halo's reach).
    // (Taken where the label is drawn this frame, after its glide, not where it is going: the boxes ran ahead of a gliding
    // label; round 2 review, B8.)
    noChevBoxes = out.filter((it) => it.onVessel && !it.hide).slice(0, 12).map((it) => {
      const r = rectOf(it), c = [[r.x0 - 3, r.y0 - 3], [r.x1 + 3, r.y0 - 3], [r.x0 - 3, r.y1 + 3], [r.x1 + 3, r.y1 + 3]].map(([x, y]) => localToWorld(x, y));
      return [Math.min(...c.map((p) => p[0])), Math.min(...c.map((p) => p[1])), Math.max(...c.map((p) => p[0])), Math.max(...c.map((p) => p[1]))];
    });
    const DISC = 5, pts = out.filter((it) => it.point && !it.hide);
    const dots = [];
    const lineFrom = (it, le) => {
      let x0 = it.ax, y0 = it.ay;
      const d = pts.find((p) => Math.hypot(p.ax - x0, p.ay - y0) < DISC + 2);
      if (d) {
        const L = Math.hypot(le.x - d.ax, le.y - d.ay);
        if (L < DISC + 2 + 4) return null;
        x0 = d.ax + ((le.x - d.ax) / L) * (DISC + 2); y0 = d.ay + ((le.y - d.ay) / L) * (DISC + 2);
      }
      return `M${x0.toFixed(1)} ${y0.toFixed(1)} L${le.x.toFixed(1)} ${le.y.toFixed(1)}`;
    };
    for (const it of out) {
      if (it.hide || it.live || it.cls === 'organ' || it.cls === 'lane' || it.key === 'scan') continue;
      let r = rectOf(it);
      // (A numbered step's group: a leader from each of its vessels to the number, none to the point between them.)
      if (it.fans) {
        it.fans.forEach(([fx, fy], j) => {
          const le = leaderEnd(r, fx, fy, 6);
          if (Math.hypot(le.x - fx, le.y - fy) > 4) leaders.push({ k: `lf:${it.key}:${j}`, tag: 'path', at: { class: 'leader', 'data-k': it.key, d: `M${fx.toFixed(1)} ${fy.toFixed(1)} L${le.x.toFixed(1)} ${le.y.toFixed(1)}` }, fanOf: it });
        });
        continue;
      }
      // (A Circuit reading's leader reaches its text: the nearer of its lines, as wide as that line's words, not the block's box.)
      if (circuit && it.key.startsWith('n:')) {
        let y = it.y, best = null;
        for (const line of it.lines) {
          // (The words' own height, not the line's: from the cap height down to the baseline, as the glyphs stand (renderBlock's
          // baseline at 0.78 of the line).)
          const lh = LINE_H(line), lw = lineW(line), base = y + lh * 0.78, lx = it.align === 'end' ? it.x + it.w - lw : it.align === 'middle' ? it.x + (it.w - lw) / 2 : it.x;
          // (Word by word: a value's unit is smaller and sits lower than its number.)
          let x = lx;
          line.forEach((run, i) => {
            if (i) x += (run.gap ?? 3) * labelK;
            const fp = fontPx(run.size), rw = textW(run.t, fp, run.weight, run.track || 0);
            const lb = { x0: x, y0: base - 0.72 * fp, x1: x + rw, y1: base + 0.04 * fp };
            x += rw;
            const d = Math.hypot(Math.max(lb.y0 - it.ay, 0, it.ay - lb.y1), Math.max(lb.x0 - it.ax, 0, it.ax - lb.x1));
            if (!best || d < best.d) best = { d, lb };
          });
          y += lh;
        }
        r = best.lb;
      }
      // (Elsewhere the leader stops on the edge of the letters it meets first, run by run: seenEnd.)
      const le0 = leaderEnd(r, it.ax, it.ay, circuit ? 2 : 6), le = circuit ? le0 : seenEnd(it);
      const far = Math.hypot(le0.x - it.ax, le0.y - it.ay) > 5;
      // (In the Circuit a reading more than 10 px from its station is always joined to it, so its ring is never in doubt.)
      const dl = (it.focusLeader || (it.leader && (circuit || far)) || (circuit && Math.hypot(le.x - it.ax, le.y - it.ay) > 10)) && lineFrom(it, le);
      if (dl) leaders.push({ k: 'l:' + it.key, tag: 'path', at: { class: it.focusLeader ? `leader focus${it.mk ? ` k-${it.mk}` : ''}` : `leader${it.sel ? ' hl' : ''}`, 'data-k': it.key, d: dl } });
      if (it.focusLeader || it.free) continue;
      const cx = it.ax.toFixed(1), cy = it.ay.toFixed(1);
      if (it.point) dots.push({ k: 'h:' + it.key, tag: 'circle', at: { class: 'leader-dot-halo', cx, cy, r: String(DISC) } });
      if (!circuit || it.mid) dots.push({ k: 'd:' + it.key, tag: 'circle', at: { class: 'leader-dot', cx, cy, r: '2.4' } });
    }
    // (A "60 %" that stands off from its clamp, moved off the probe or put where the stent's column of callouts leaves room, is
    // joined to the clamp's nearer outer tip by a leader, fading with it; one at its usual spot has none. Read from the label as it
    // stands now, in a carried layout too, so a pan or a nudge of the figure keeps the line.)
    if (!isImaging()) for (const el of ov.clamps.querySelectorAll('.clamp-label')) {
      const c = el._c, m = c && clampMv.get(c.id), own = c && c.id === clampFor && ptSide && clampD.get(c.id);
      if (!c || m?.busy || !(m?.cur || own)) continue;
      const b = boxOfEl(el, (6 * clampBase) / 12);   // (the leader stops short of the text by the same 6 px at 12 px text, in step with its size)
      if (!b) continue;
      const tips = [[c.x + c.nx * (c.off + 8), c.y + c.ny * (c.off + 8)], [c.x - c.nx * (c.off + 8), c.y - c.ny * (c.off + 8)]].map((q) => worldToLocal(...q));
      const gap = (q) => Math.hypot(Math.max(b.x0 - q[0], 0, q[0] - b.x1), Math.max(b.y0 - q[1], 0, q[1] - b.y1));
      const [ax, ay] = gap(tips[1]) < gap(tips[0]) ? tips[1] : tips[0], le = leaderEnd(b, ax, ay, 1);
      if (Math.hypot(le.x - ax, le.y - ay) > (m?.cur ? 4 : 28)) leaders.push({ k: 'cl:' + c.id, tag: 'path', at: { class: 'leader', d: `M${ax.toFixed(1)} ${ay.toFixed(1)} L${le.x.toFixed(1)} ${le.y.toFixed(1)}` } });
    }
    leaders.push(...dots);
    // (The flow's arrowheads keep out from under the points' callouts, within 17 px of their dots, and 5 px either side of
    // every leader that ends at a point, the slide's mark's included, so no line runs through one: Review 15 Oct.)
    const holes = [], k = 1 / Math.max(CTM.sc, 1e-3);
    for (const it of pts) {
      const r = rectOf(it), [ax, ay] = localToWorld(r.x0, r.y0), [bx, by] = localToWorld(r.x1, r.y1), [dx, dy] = localToWorld(it.ax, it.ay);
      holes.push([Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by), 3 * k], [dx, dy, dx, dy, 17 * k]);
    }
    for (const it of out) {
      if (it.hide || it.live || !(it.point || it.focusLeader) || !pts.some((p) => Math.hypot(p.ax - it.ax, p.ay - it.ay) < DISC + 2)) continue;
      const le = leaderEnd(rectOf(it), it.ax, it.ay), [x0, y0] = localToWorld(it.ax, it.ay), [x1, y1] = localToWorld(le.x, le.y);
      holes.push([x0, y0, x1, y1, -5 * k]);
    }
    const hk = holes.map((h) => h.map((v) => v.toFixed(1)).join(',')).join(';');
    if (hk !== holesKey) { holesKey = hk; chevHoles = holes; }
    for (const it of out) renderBlock(it);
    lbRects = out.filter((it) => !it.hide && it.w && it.h).map((it) => it._r || rectOf(it));
    colShown = out.some((it) => it.point && !it.hide && it.w && it.h);
    // (A step's number comes in as its vessel lights, deck visuals V10; with reduced motion all at once.)
    for (const it of out) {
      if (it.delay == null || it.hide) continue;
      const b = pool.get(it.key), wait = it.delay - (performance.now() - glowSetAt);
      if (!b || b.fxIn) continue;
      b.fxIn = true;
      if (wait > 0 && !reduceMotion.matches) b.g.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 350, delay: wait, easing: 'ease-out', fill: 'backwards' });
    }
    const sit = out.find((o) => o.key === 'scan'), sblk = pool.get('scan');
    if (sit && !sit.hide) {
      const le = seenEnd(sit);
      const [lp, ld] = gScan.children;
      lp.setAttribute('d', `M${sit.ax.toFixed(1)} ${sit.ay.toFixed(1)} L${le.x.toFixed(1)} ${le.y.toFixed(1)}`);
      ld.setAttribute('cx', sit.ax.toFixed(1)); ld.setAttribute('cy', sit.ay.toFixed(1));
      gScan.classList.remove('off');
    } else { gScan.classList.add('off'); if (sblk && sblk.seen !== frameNo) sblk.g.classList.add('lb-off'); }   // no callout this frame (circuit view, covered): it fades, never pops
    labelShown = out.filter((it) => it.src && !it.hide);
    // A label no longer wanted fades out (lb-off), then leaves; one wanted again before then simply fades back (renderBlock).
    for (const [k, b] of pool) {
      if (b.seen === frameNo || (k === 'scan' && (scan.leaving || scan.on))) continue;
      b.at = null; b.gl = null;
      if (b.gone || b.g.style.display === 'none') continue;
      if (reduceMotion.matches || camMove) { b.g.style.display = 'none'; continue; }
      b.g.classList.add('lb-off');
      const tok = b.gone = {};
      setTimeout(() => { if (b.gone === tok) { b.gone = null; b.g.style.display = 'none'; } }, 360);
    }
    glass.hidden = !out.some((it) => it.key === 'liver' && !it.hide);
    paintLeaders(leaders);
    // (A group's leaders come in with its number, as its vessels light.)
    for (const w of leaders) {
      const el = w.fanOf && leadEls.get(w.k), wait = el && w.fanOf.delay - (performance.now() - glowSetAt);
      if (!el || el.fxIn) continue;
      el.fxIn = true;
      if (wait > 0 && !reduceMotion.matches) el.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 350, delay: wait, easing: 'ease-out', fill: 'backwards' });
    }
    return true;
  }
  // A station's marker (its dot, its label, the Δ ring) shows only while a vessel is drawn at it (circuit-nodes.js): a vessel the
  // plate leaves out, or one still closed, leaves no dot floating where it would end, and one that draws on or retracts brings
  // its far end's marker in once it has arrived and takes it away as it withdraws.
  const NODE_ENDS = nodeEnds(ALL_EDGES, (e) => E[e.id]);
  const nodeVisible = (id) => !(ANAT_HIDDEN_NODES.has(id) && morph < 0.5) && nodeDrawn(NODE_ENDS[id]);

  // ── Moving blood ──────────────────────────────────
  // What is kept true, and what is exaggerated, is set out in blood.js. Every model vessel has a
  // stream (hidden ones too: a dye bolus passes through them); each drawn vessel, strand and
  // tributary row gets FLOW_TEXELS texels for the GPU:
  //   0: stream distance (world, modulo PERIOD), display speed (signed, from → to), parcels a
  //      second, stasis (0–1)
  //   1: free at the from end, free at the to end (parcels fade there), strength, reversed (0–1, eased)
  //   2: fraction of its blood from the SMV, the IMV, the splenic vein and the hepatic artery (rest: systemic)
  //   3: chevron visibility (0–1, eased: Key chevrons only fades the rest); the still chevrons' spacing level (reduced motion,
  //      chevFlowLevel); the stagnant blood's drift (shimmer cells, blood.js drift)
  const flowData = new Float32Array(GL_ROWS * FLOW_TEXELS * 4);
  const dyeData = new Float32Array(GL_ROWS * DYE_BINS), dyeRow = new Float32Array(DYE_BINS);
  const streams = EDGES.map((e, k) => ({ seed: k + 1 }));
  const LARGE = EDGES.map((e) => (e.kind === 'vein' || e.kind === 'diode') && (e.d || 0) >= STASIS_MIN_D);
  const bolus = createBolus(EDGES, NODES);
  const net = { Q: new Float32Array(EDGES.length), vd: new Float32Array(EDGES.length), len: new Float32Array(EDGES.length) };
  let origins = null, originsF = null, bloodClock = 0, dyeShown = false;
  // In the imaging view the flow shows once a Doppler has looked at it (still in neutral colours: pressures stay unmeasured).
  const flowSeen = () => !store.get().imaging || !!store.get().found?.has('flow');
  const bloodOn = () => !!F && flowSeen() && store.get().layers.flow !== false;
  const chevOn = () => !!F && flowSeen() && !!store.get().blood?.chevrons;
  // Key chevrons only (Blood menu; always while presenting): chevrons keep to the portal story (the portal
  // inflow, the liver's beds, the hepatic veins, any open collateral or shunt) and to a lit vessel; the rest fade.
  // (Which vessels: keyChevron in blood.js; a vein in an open collateral's lane counts while it is open.)
  const laneOpen = (id) => !!E[id]?.vis && !E[id].g.classList.contains('coll-ghost');
  const keyOnly = () => !!store.get().presenting || !!store.get().blood?.keyChevrons;
  // The Blood origin lens colors each lumen by where its blood comes from (streams side by side).
  const originOn = () => !!F && layerMode() === 'origin';
  // Mean velocity (cm/s) for a flow (mL/s): flow over lumen area; the liver beds are not one tube.
  function velOf(k, q) {
    const D = Math.max(0.5, F.D[k]) / 10;
    return EDGES[k].kind === 'liver' ? q * 0.6 : q / (Math.PI * D * D / 4);
  }
  // A drawn end is free when no other drawn vessel ends there: parcels fade in or out at it.
  // (Versioned: the geometry, the morph to two places and which vessels count, compared in place instead of a list and a
  // joined key built every frame; round 2 review, P8.)
  let endsIn = null, endsGeo = -1, endsMorph = '';
  function syncEnds() {
    if (!endsIn || endsIn.length !== EV.length) { endsIn = new Uint8Array(EV.length); endsGeo = -1; }
    const mk = morph.toFixed(2);
    let same = endsGeo === geometryVersion && endsMorph === mk;
    for (let i = 0; i < EV.length; i++) {
      const x = EV[i], v = x.vis && !x.isArt && !x.g.classList.contains('coll-ghost') ? 1 : 0;
      if (endsIn[i] !== v) { endsIn[i] = v; same = false; }
    }
    if (same) return;
    endsGeo = geometryVersion; endsMorph = mk;
    const list = EV.filter((x, i) => endsIn[i]);
    const ends = new Map();
    for (const x of list) {
      const P = geo[x.e.id].cur;
      for (const [node, point] of [[x.e.from, P[0]], [x.e.to, P[P.length - 1]]]) {
        if (!ends.has(node)) ends.set(node, []);
        ends.get(node).push({ x, point });
      }
    }
    const joined = (x, node, point) => ends.get(node).some((o) => o.x !== x && Math.hypot(o.point[0] - point[0], o.point[1] - point[1]) < 20);
    for (const x of list) {
      const P = geo[x.e.id].cur;
      x.freeFrom = !joined(x, x.e.from, P[0]) && !x.feeders?.length;
      x.freeTo = !joined(x, x.e.to, P[P.length - 1]);
    }
  }
  const streamOpts = { phasic: false, speed: 1, large: true, still: false, rev: false };
  // Facts that change only with a model frame (or the healthy reference), kept per frame instead of worked out every display
  // frame: each vessel's reversed flag and its two velocities. Key chevrons: 1 for a vessel that always keeps them, 2 for one
  // that keeps them while an open collateral runs in its lane (asked each frame), 0 for none (round 2 review, P8).
  const velQf = new Float64Array(EDGES.length), velQ = new Float64Array(EDGES.length);
  let perF = null, perH = null;
  const KEY_K = EDGES.map((e) => (keyChevron(e) ? 1 : KEY_CHEV_LANES[e.id] ? 2 : 0));
  let bloodEasing = false;
  const blendA = { s: null, c: null, o: null };   // shown share of the streaks, the chevrons and the origin colours (stepBlood)
  const eased = (v, to, k) => { if (Math.abs(to - v) <= 0.002) return to; bloodEasing = true; return v + (to - v) * k; };
  function stepBlood(dt) {
    const st = store.get(), b = st.blood || {};
    const moving = st.running && !reduceMotion.matches;
    const speed = st.clock === 'hemo' ? clamp(Math.sqrt(st.speed), 0.5, 2) : 0.8;
    const Qf = F.Qf || F.Q;
    if (moving) bloodClock = (bloodClock + dt) % 10000;
    // Reversed flow (against the healthy direction, as the Direction lens has it) eases in and out.
    // (Reduced motion: the streams stand still but follow the flow's direction at once, and nothing eases.)
    const still = st.running && reduceMotion.matches;
    const ease = reduceMotion.matches ? 1 : -Math.expm1(-dt / 0.5);
    // (One options object and one key-chevrons answer for the whole loop, not one per vessel per frame: advanceStream reads
    // the options at once and keeps none of them.)
    const so = streamOpts, key = keyOnly();
    so.phasic = !!b.phasic; so.speed = speed; so.still = still;
    // (bloodEasing: a reversed colour or a chevron fade still on its way keeps the figure awake, paused too, so it never stops
    // part-way until Play; each lands exactly once within 0.002 of its end. Round 2 review, B10.)
    bloodEasing = false;
    const H = st.healthy;
    if (perF !== F || perH !== H) {
      perF = F; perH = H;
      holdReversals(F);
      for (let k = 0; k < EDGES.length; k++) { velQf[k] = velOf(k, Qf[k]); velQ[k] = velOf(k, F.Q[k]); }
    }
    for (let k = 0; k < EDGES.length; k++) {
      // One signal turns both: the reversed colour and the way the blood and its chevrons run (isReversed, held: B3).
      const rt = revHold[k];
      so.large = LARGE[k]; so.rev = !!rt;
      const sm = advanceStream(streams[k], velQf[k], velQ[k], moving ? dt : 0, so);
      sm.rev = sm.rev == null ? rt : eased(sm.rev, rt, ease);
      const ct = !key || KEY_K[k] === 1 || (KEY_K[k] === 2 && keyChevron(EDGES[k], laneOpen)) || (glow.lit.get(EDGES[k].id)?.to || 0) > 0 ? 1 : 0;
      sm.chevK = sm.chevK == null ? ct : eased(sm.chevK, ct, ease);
    }
    // The streaks, the chevrons and the origin colours fade in and out (0.15 s) when switched, by their toggles, the catheter
    // (which hides the chevrons while it is in) or the lens, instead of in one frame; Reduce Motion keeps fades (round 2
    // review, B4).
    const kF = -Math.expm1(-dt / 0.15), tS = bloodOn() ? 1 : 0, tC = chevOn() && !cath.st ? 1 : 0, tO = originOn() ? 1 : 0;
    blendA.s = blendA.s == null ? tS : eased(blendA.s, tS, kF);
    blendA.c = blendA.c == null ? tC : eased(blendA.c, tC, kF);
    blendA.o = blendA.o == null ? tO : eased(blendA.o, tO, kF);
    if (!veins) return;
    const on = blendA.s > 0 || blendA.c > 0 || blendA.o > 0;
    if (blendA.o > 0 && originsF !== F) { origins = originFractions(EDGES, NODES, Qf, F.Pf || F.P); originsF = F; }
    syncEnds();
    flowData.fill(0);
    const put = (row, k, q, f0, f1, strength) => {
      const o = row * FLOW_TEXELS * 4, sm = streams[k];
      flowData[o] = sm.D; flowData[o + 1] = sm.vd; flowData[o + 2] = KAPPA * Math.abs(q); flowData[o + 3] = sm.stasis;
      flowData[o + 4] = f0 ? 1 : 0; flowData[o + 5] = f1 ? 1 : 0; flowData[o + 6] = strength; flowData[o + 7] = sm.rev;
      if (origins) for (let c = 0; c < ORIGIN_N; c++) flowData[o + 8 + c] = origins[k * ORIGIN_N + c];
      flowData[o + 12] = sm.chevK ?? 1;
      // Reduced motion: the chevrons stand still, so their spacing carries the flow (veins-gl chevAt): a level of 0 (the
      // finest, 28 units) for 0.8 L/min or more, one level coarser for each halving, at most 3.
      flowData[o + 13] = chevFlowLevel(q);
      flowData[o + 14] = sm.drift || 0;
    };
    // A vessel drawing on (a TIPS, a new collateral) or retracting carries its blood in step with its stroke, and a strand or a
    // tributary as it comes and goes: a strength that follows them, instead of no blood until the end and then all of it in
    // one frame (round 2 review, B4).
    const tR = performance.now();
    if (on) for (const x of EV) {
      if (!x.vis || x.isArt || x.g.classList.contains('coll-ghost')) continue;
      const r = x.reveal, rs = r ? (r.out ? 1 - easeInOut(clamp((tR - r.t0) / r.dur, 0, 1)) : easeInOut(clamp((tR - r.t0) / r.dur, 0, 1))) : 1;
      const k = EI[x.e.id], q = Qf[k];
      // A braided collateral's channels share its flow by cross-section (a channel still coming in, by its share of it).
      const strands = morph < 0.5 ? (x.strands || []).filter((sd) => (sd.live ?? 1) > 0) : [];
      const area = 1 + strands.reduce((a, sd) => a + sd.k * sd.k * (sd.live ?? 1), 0);
      put(x.row, k, q / area, x.freeFrom, x.freeTo, rs);
      for (const sd of strands) put(sd.row, k, q * sd.k * sd.k / area, true, true, rs * (sd.live ?? 1));
      // Tributaries drawn into a trunk: a share of its flow by caliber.
      if (morph < 0.5) for (const fd of x.feeders || []) if ((fd.live ?? 1) > 0 && fd.w) put(fd.row, k, q * 0.5 * (fd.w / Math.max(1, x.width)) ** 2, true, false, rs * (fd.live ?? 1));
      // The liver's branches in the circuit: a share of the vessel's flow by caliber.
      if (morph >= 0.5) for (const cb of x.cbr || []) if (cb.w) put(cb.row, k, q * 0.5 * (cb.w / Math.max(1, x.width)) ** 2, true, true, rs);
    }
    veins.setFlow(flowData);
    // The dye bolus, through every vessel (hidden ones take a second each).
    if (bolus.active) {
      for (let k = 0; k < EDGES.length; k++) {
        const x = E[EDGES[k].id];
        net.Q[k] = Qf[k];
        net.vd[k] = Math.max(3, Math.abs(streams[k].vd)) * speed;
        net.len[k] = x?.vis && geo[x.e.id]?.len ? geo[x.e.id].len : Math.max(20, net.vd[k] * HIDDEN_SECONDS);
      }
      if (moving) bolus.step(dt, net);
      dyeData.fill(0);
      for (const x of EV) {
        if (!x.vis || x.isArt) continue;
        if (!bolus.field(EI[x.e.id], net, dyeRow)) continue;
        dyeData.set(dyeRow, x.row * DYE_BINS);
        for (const sd of x.strands || []) dyeData.set(dyeRow, sd.row * DYE_BINS);
      }
      veins.setDye(dyeData); dyeShown = true;
    } else if (dyeShown) { veins.setDye(null); dyeShown = false; }
  }
  /**
   * Starts a dye injection: into vessel `id` (default: the gut's veins, as in mesenteric
   * portography). `hold`: it goes on until releaseDye().
   */
  function injectDye(id, { hold = false } = {}) {
    const e = EDGES[EI[id]] ? id : 'V_INT';
    bolus.inject(EI[e], id && EDGES[EI[id]] ? 0.15 : 0, { hold });
    if (!store.get().running) store.set({ running: true });
  }

  // Active variceal bleeding: blood jets from the rupture into the lumen, four tapered streaks spurting in turn (still,
  // in the same four stages, while paused or with reduced motion), and pools in the stomach, the pool growing with the
  // square root of what has been lost. Each: [x0, y0, x1, y1, r0, r1, alpha, kind] (veins-gl.js): a jet (kind 1) from
  // its base (x0, y0; radius r0) to its tip (x1, y1; r1), or the pool (kind 0), an ellipse at (x0, y0) with radii x1, y1.
  // (It fades in on a rupture and out once the bleed stops, or as the circuit view takes over: sprayA, stepped in animate;
  // while it fades out the jets keep spurting from the last bleed seen.)
  let sprayA = 0, sprayLast = null;
  const sprayOn = () => !!F?.bleed?.active && morph < 0.5;
  const sprayFading = () => sprayA !== (sprayOn() ? 1 : 0);
  function stepSpray(dt) {
    if (sprayOn()) sprayLast = { bleed: F.bleed, rate: F.metrics.bleeding?.rate };
    sprayA = stepBleedFade(sprayA, sprayOn(), dt, reduceMotion.matches);
    if (sprayA <= 0) sprayLast = null;
  }
  function bleedSpray() {
    if (sprayA <= 0 || !sprayLast) return [];
    // (On the blood's own clock, which stands still while paused, so the jets hold where they are and carry on from there;
    // the wall clock made them jump on pause and play. Reduce Motion keeps the still four stages: B11.)
    return fadeBleedShapes(bleedShapes(sprayLast.bleed, sprayLast.rate, reduceMotion.matches ? 0 : bloodClock, SITES), sprayA);
  }
  function bloodLook() {
    const st = store.get(), b = st.blood || {};
    // (Each drawn while it shows at all, by its eased share: stepBlood's blendA; its own switch before the first step.)
    const sA = blendA.s ?? (bloodOn() ? 1 : 0), cA = blendA.c ?? (chevOn() && !cath.st ? 1 : 0), oA = blendA.o ?? (originOn() ? 1 : 0);
    return { on: sA > 0, still: reduceMotion.matches, chev: cA > 0, look: b.look, origin: oA > 0, streakA: sA, chevA: cA, originA: oA, clock: bloodClock, dye: !st.imaging, bleed: bleedSpray(), noChev: noChevBoxes, holes: chevHoles, vdpr, ...bloodColors() };
  }

  let lastT = performance.now(), lastDrawKey = null, lastDrawF = null, lastDrawCTM = null, lastAnim = true;
  // Whether the figure moves by itself while the model runs (see animate).
  function figureMoves(st) {
    if (!st.running || reduceMotion.matches) return false;
    return bloodOn() || (chevOn() && !cath.st) || fluidLook.ripple || sprayOn() || sprayA > 0;
  }
  let drawnView = -1;
  let flowGate = lastT;
  // On a software renderer only (WebGL drawn on the CPU), a vessel frame waits for the last to finish on the GPU and gives the
  // page as long again (see sw-yield.js); on a GPU there is no yield (null) and the loop below is unchanged.
  const swYield = softwareYield(SOFTWARE, SOFTWARE ? vCanvas.getContext('webgl2') : null);
  function animate(now) {
    // The blood moves by elapsed time, so speeds and transitions are the same at any frame rate.
    if (document.hidden || appEl?.classList.contains('home-open')) { lastT = flowGate = now; trimVeins(); sleep(); return; }
    // The dive magnifies the figure as it stands (a compositor scale): nothing under it is redrawn until it lands.
    if (diveT > 0 && diveT < 1 && !drawOnce && !forceDraw) {
      // (The plate holds still through the dive, measured before its zoom, but while the anatomy still shows, its blood keeps
      // moving: never frozen physiology. No update or refreshCTM here: the box measured under the zoom would be wrong.
      // Round 2 review, B9.)
      if (F && veins && !veins.lost && vLook && !diveHid && diveFadeO !== 0 && store.get().running) {
        stepBlood(Math.min(0.1, (now - lastT) / 1000));
        veins.composite(vLook, bloodLook(), false);
      }
      lastT = flowGate = now; nextFrame(animate); return;
    }
    // (Only the model's own motion waits its turn there: a pan, zoom, glide or forced draw is drawn in this frame, with the
    // rest of the figure that has already moved, never a frame behind it.)
    if (swYield && !swYield.ready(now, forceDraw || drawOnce || viewVersion !== drawnView)) { nextFrame(animate); return; }
    const interval = paceOf(quality);
    // A pan or zoom redraws at once (the picture must stay under the pointer); only the model's
    // own motion is paced, and only on a lower step (see QUALITY).
    const viewMoved = viewVersion !== drawnView;
    if (interval && !viewMoved && !forceDraw && now - flowGate < interval) { nextFrame(animate); return; }
    flowGate = interval ? now - ((now - flowGate) % interval) : now;
    const dt = Math.min(0.1, (now - lastT) / 1000);
    // (On a software renderer a frame waits its turn for up to 2 s: the fluid's ease catches up on the time that passed, so it
    // settles when it would on a GPU instead of crawling 50 ms per drawn frame, and a picture taken after it is always the same.)
    const easeDt = SOFTWARE ? Math.min(2, (now - lastT) / 1000) : dt;
    lastT = now;
    // Fully inside the lobule, the plate is covered (a pending redraw waits for the frame it can show in): the loop sleeps
    // there, and leaving the lobule (a store change) wakes it. While the lobule only covers it on the way in or out, it keeps looking.
    if (lz?.isOpen()) { trimVeins(); sleep(); return; }
    veinsTrimmed = false;   // (shown again: the next draw makes what trimVeins gave back)
    if (lz?.covers()) { nextFrame(animate); return; }
    forceDraw = false; drawOnce = false;
    const st = store.get();
    // Running, the figure moves by itself only through the blood (streaks, chevrons, a dye bolus), a bleed's spray and
    // the ascites' ripple. With none of them on screen, and none in the last frame drawn (it is drawn once more without
    // them), a running model is drawn like a paused one: only when something on the figure changed.
    const anim = figureMoves(st);
    const still = (!st.running || reduceMotion.matches || (!anim && !lastAnim)) && !bolus.active && !dyeShown;
    // A new model frame changes the figure only through the vessel layer (checked by syncVeins), or through the blood's
    // own data (flow, origin streams) and a bleed, while those are shown.
    const fSame = F === lastDrawF || (!lastAnim && !bloodOn() && !chevOn() && !originOn() && !F?.bleed?.active && sprayA <= 0);
    if (still && bloodKeyVer !== storeVer) { bloodKey = JSON.stringify(st.blood); bloodKeyVer = storeVer; }   // (the store sets blood whole: its text changes only with a store write)
    const key = still ? `${cathVer}|${morph}|${rotU}|${wrap.className}|${st.layers.flow}|${bloodKey}|${vCanvas.width}x${vCanvas.height}|${holesKey}` : null;
    // A plate raster that lands while the figure is still (paused, or reduced motion) marks the vessel layer dirty: draw it.
    if (still && !veinsDirty && !glowSync && !(glLines && olDirty) && (!glLines || marksKey() === mk.key) && !(glLines && olList.some((o) => o.a !== (o.on ? 1 : 0))) && !clampFading() && !widthEasing && !bloodEasing && !plateEasing() && !sprayFading() && !lensFrom && ascShown === ascTarget && morph === morphTarget && rotU === rotTarget && key === lastDrawKey && fSame && CTM === lastDrawCTM && !EV.some((x) => x.reveal)) { sleep(); return; }
    stepPlateEase();
    if (morph !== morphTarget) {
      morph = clamp(morph + Math.sign(morphTarget - morph) * dt / 0.6, 0, 1);
      if (F) update(F); else updateGeometry(true);
    } else if (widthEasing && F && !stepOrgans() && !stepWidths()) update(F);   // a width still easing to its target: one step a frame (stepWidths: the widths alone, when nothing else changed)
    if (rotU !== rotTarget) {
      rotU = clamp(rotU + Math.sign(rotTarget - rotU) * dt / 0.5, 0, 1);
      setViewBox(easeInOut(morph));
      if (rotHold) { holdView(rotHold); if (rotU === rotTarget) rotHold = null; }
      else if (rotU === rotTarget && morphTarget === 1) { vt = circWhole(); applyVT(); CTM = null; }
    }
    stepReveals(now);
    if (F) stepBlood(dt);
    stepSpray(dt);
    const fluidMoved = stepFluid(dt, st, easeDt);
    { const fe = fluidEasing(); if (fluidWas && !fe) fluidStillAt = now; fluidWas = fe; }
    // (For the ?perf readout: what eases while the organ picture is down, and whether the gut shows as its picture or its paths.)
    if (gpuProbe.on && !plateOn()) {
      gpuProbe.note(gutPicOn ? 'gut picture' : 'gut live');
      if (!gutPicOn) gpuProbe.note(`gut live: ${gutLiveWhy()}`);
      // (The scale the view needs, the pictures kept and the cap: the external review asked for them, 21 Oct.)
      if (!gutPicOn) gpuProbe.gauge('gut pictures', `view needs ${(vdpr * (CTM?.sc || 0)).toFixed(2)} px/unit, cap ${GUT_CAP.toFixed(2)}, kept ${gutPics.filter((p) => p.mut === gutMut).map((p) => `${p.k.toFixed(2)}${p.win ? ' (view part)' : ''}`).join(', ') || 'none'}`);
      if (lvMoving) gpuProbe.note('liver easing');
      if (fluidWas) gpuProbe.note('fluid easing');
      if (spleenMoving()) gpuProbe.note('spleen easing');
    }
    // The vessel layer is redrawn only when something in it changed; the blood every frame.
    if (glowSync && !syncGlowOnly(easeInOut(morph))) syncVeins(easeInOut(morph));
    olStep(now);
    if (drawVeins(fluidMoved)) { noteDraw('stage'); swYield?.drew(now); }
    else if (veins && !veins.lost && vLook && F) { veins.composite(vLook, bloodLook(), fluidMoved); noteDraw('stage'); swYield?.drew(now); }
    drawnView = viewVersion;
    lastDrawKey = key; lastDrawF = F; lastDrawCTM = CTM; lastAnim = anim || bolus.active || dyeShown;
    nextFrame(animate);
  }
  nextFrame(animate);
  // Nothing to draw: the loop stops asking for frames (so the screen can idle) until something changes, and looks
  // again once a second in case a change came by a path that does not wake it. (The store, the page's visibility, the
  // figure's classes, the camera, the glows and the organ pictures landing all wake it themselves.)
  let sleeping = false, sleepTimer = 0, bloodKey = '', bloodKeyVer = -1;
  // The figure is not shown (the page hidden, the home screen, or the lobule fully over it): the vessel framebuffer, the
  // outline layers and the organ stack (about 58 bytes a pixel of GPU memory) are given back; the first draw on the way
  // back makes them again, whole (veins-gl.js trim: ensureFBO and the layer keys). Once per sleep; the plates stay.
  let veinsTrimmed = false;
  function trimVeins() {
    if (veinsTrimmed || !veins || veins.lost || glowSync) return;
    veins.trim(); veinsTrimmed = true; veinsDirty = true;
  }
  function sleep() { sleeping = true; clearTimeout(sleepTimer); sleepTimer = setTimeout(wake, 1000); }
  function wake() { if (!sleeping) return; sleeping = false; clearTimeout(sleepTimer); nextFrame(animate); }
  stageWake = wake;
  store.on('*', wake);
  store.on('*', () => { storeVer++; });
  document.addEventListener('visibilitychange', wake);
  new MutationObserver(wake).observe(wrap, { attributes: true, attributeFilter: ['class'] });
  if (appEl) new MutationObserver(wake).observe(appEl, { attributes: true, attributeFilter: ['class'] });

  // Opaque organ shapes (anatomy), as canvas paths; built once, band widths read from the CSS.
  let organCovers = null;
  function getOrganCovers() {
    if (organCovers) return organCovers;
    organCovers = [];
    for (const o of ORGANS) {
      if (o.deco || o.noCover || !organEls[o.id]) continue;
      if (o.circle) { const p = new Path2D(); p.arc(o.circle[0], o.circle[1], o.circle[2], 0, Math.PI * 2); organCovers.push({ p, w: 0 }); continue; }
      // (The gut's tubes cover the vessels behind them along their earlier centre lines and widths: ORGANS cover.)
      if (o.cover) { organCovers.push({ p: new Path2D(o.cover.d), w: o.cover.w }); continue; }
      const w = o.band ? parseFloat(getComputedStyle(organEls[o.id]).strokeWidth) || 0 : 0;
      if (o.band && w < 4) continue; // the diaphragm is a hairline, not a cover
      organCovers.push({ p: new Path2D(o.d), w });
    }
    return organCovers;
  }

  // ── Interaction ───────────────────────────────────
  // A click picks a structure (a vessel, else the organ under the pointer, else nothing); a drag
  // pans. The only gestures that stay "armed" are the shunt (from its source to a drop target)
  // and the two paint brushes in the Draw menu, and each shows how to finish or cancel it.
  const pointers = new Map();
  let drag = null;
  let shunt = null; // { src, wx, wy, targets: Map(id → rule), hover }

  function edgeFromEvent(ev) {
    // While the pointer is captured, events retarget to the <svg>: hit-test the real point instead.
    const t = ev.target === svg && ev.clientX != null ? document.elementFromPoint(ev.clientX, ev.clientY) : ev.target;
    const el = t?.closest?.('.v-hit, .ghost-hit');
    return el ? el.getAttribute('data-id') : geomEdge(ev);
  }
  // Safari does not always report a transparent-stroke vessel as the element under the pointer (it works in Chrome),
  // so when the browser's own hit test finds no vessel, test the pointer against each vessel's hit stroke ourselves.
  function geomEdge(ev) {
    if (ev.clientX == null || ev.pointerType === 'touch' || lobuleOn) return null;
    let best = null;
    const inv = new Map();   // the pointer in each parent group's space: vessels share a few groups, so one getScreenCTM each
    for (const id of Object.keys(E)) {
      const h = E[id]?.hit;
      if (!h || !h.isConnected || h.getAttribute('aria-hidden') === 'true' || !h.hasAttribute('d') || h.parentNode?.classList?.contains('no-hit')) continue;
      if (best && !(best.compareDocumentPosition(h) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;   // only a vessel drawn above the best so far can beat it
      try {
        const g = h.transform.baseVal.length ? h : h.parentNode;
        let pt = inv.get(g);
        if (pt === undefined) { const m = h.getScreenCTM(); pt = m ? new DOMPoint(ev.clientX, ev.clientY).matrixTransform(m.inverse()) : null; inv.set(g, pt); }
        if (!pt) continue;
        if (h.isPointInStroke(pt) && getComputedStyle(h.parentNode).display !== 'none' && getComputedStyle(h).pointerEvents !== 'none') best = h;
      } catch { /* not rendered */ }
    }
    if (best) return best.getAttribute('data-id');
    return null;
  }

  // Organs under a point (anatomy only). The varices and fundus are small sites. The abdomen is
  // only the visible fluid itself, so the bowel and its vessels never open the ascites view by accident.
  const ORGAN_OF = { liver: 'liver', heart: 'heart', 'heart-ra': 'heart', spleen: 'spleen', stomach: null, esophagus: null, bowel: null, colon: null, appendix: null, duodenum: null, 'kidney-l': null };
  const ptIn = (el, x, y, stroke) => {
    if (!el) return false;
    const pt = svg.createSVGPoint(); pt.x = x; pt.y = y;
    try { return stroke ? el.isPointInStroke(pt) : el.isPointInFill(pt); } catch { return false; }
  };
  function organAt(wx, wy) {
    if (morph > 0.5) return null;
    for (const o of [...ORGANS].reverse()) {
      if (o.deco || !ORGAN_OF[o.id]) continue;
      const el = organEls[o.id];
      if (o.band ? ptIn(el, wx, wy, true) : ptIn(el, wx, wy)) return ORGAN_OF[o.id];
    }
    if (fluidSurf && ptIn(abdomenEl, wx, wy) && wy > fluidSurf(wx)) return 'abdomen';
    return null;
  }
  const abdomenEl = s('path', { d: ABDOMEN_CLIP, fill: 'none', stroke: 'none' });
  defs.append(abdomenEl);

  // The IVC is one vessel to the eye: hovering any stretch of it lights all of it.
  const vhEdges = (id) => (IVC_EDGES.has(id) ? [...IVC_EDGES] : [id]).filter((e) => E[e]?.vis);
  function setHover(id) {
    if (id === hoverId) return;
    hoverId = id;
    const on = id && store.get().tool === 'select' && !shunt ? id : null;
    if (on === vh.id) return;
    vh.id = on;
    setGlowSrc('hover', on ? vhEdges(on).map((id) => ({ id, col: null, amt: 1.0, wide: 0.5, dur: 280 })) : []);
    if (!vh.raf) { vh.t = performance.now(); vh.raf = nextFrame(vhStep); }
  }
  function vhStep(now) {
    const dt = Math.min(0.1, (now - vh.t) / 1000); vh.t = now;
    const want = new Set([...(vh.id ? vhEdges(vh.id) : []), ...vh.sel]);
    if (spotOn()) for (const id of spot.ids) want.add(id);   // (a slide's spotlit vessels brighten as a selected one: V2)
    for (const id of want) if (!vh.amt.has(id)) vh.amt.set(id, 0);
    let moving = false;
    for (const [id, v] of vh.amt) {
      const to = want.has(id) ? 1 : 0, nv = to > v ? Math.min(1, v + dt / 0.28) : Math.max(0, v - dt / 0.28);
      if (nv <= 0 && !to) vh.amt.delete(id); else vh.amt.set(id, nv);
      if (nv !== to) moving = true;
    }
    // (While a shunt is being made, its source and every vessel it can join stand out of the dimmed network too: NP3.)
    const out = shunt ? new Set([...vh.sel, shunt.src, ...shunt.targets.keys()].filter((id) => E[id]?.vis)) : vh.sel;
    // (A slide's spotlit vessels stand out the same way: deck visuals V2.)
    const lift = spotOn() && spot.ids.size ? new Set([...out, ...spot.ids]) : out;
    for (const id of lift) if (!vh.selA.has(id)) vh.selA.set(id, 0);
    for (const [id, v] of vh.selA) {
      const to = lift.has(id) ? 1 : 0, k = reduceMotion.matches ? 1 : dt / SEL_FADE, nv = to > v ? Math.min(1, v + k) : Math.max(0, v - k);
      if (nv <= 0 && !to) vh.selA.delete(id); else vh.selA.set(id, nv);
      if (nv !== to) moving = true;
    }
    glowSync = true; stageWake();
    vh.raf = moving ? nextFrame(vhStep) : 0;
  }

  // Organ and site hover: a soft version of the selection outline, never kept once the pointer is away.
  const gHovO = s('g', { id: 'organHover', 'aria-hidden': 'true' });
  gSelO.after(gHovO);
  let hovO = '';
  function setOrganHover(o, lobe) {
    const key = o ? o + (lobe || '') : '';
    if (key === hovO) return;
    hovO = key;
    gHovO.replaceChildren();
    const byOrgan = o && { liver: 'liver', heart: 'heart', spleen: 'spleen' }[o];
    if (glLines) olSet('hov', byOrgan || null);
    if (!o) return;
    if (byOrgan) {
      if (glLines) return;
      const d = organEls[byOrgan]?.getAttribute('d');
      if (!d) return;
      const el = s('path', { class: 'org-hov-line', d, style: `stroke: rgb(${orgTone(byOrgan).map((x) => Math.round(x * 255))})` }), tr = organG[byOrgan].getAttribute('transform');
      if (tr) el.setAttribute('transform', tr);
      gHovO.append(el);
      return;
    }
    if (o === 'abdomen') {   // the fluid itself, clipped as it is drawn, so it grows with the ascites
      const fd = ascitesPath.getAttribute('d');
      if (!fd) return;
      const cg = s('g', { 'clip-path': 'url(#abdomenClip)' });
      cg.append(s('path', { class: 'org-hov-fluid', d: fd }), s('path', { class: 'org-hov-line', d: ascitesLine.getAttribute('d') || '' }));
      gHovO.append(cg);
      return;
    }
    
  }
  // Nothing stays lit once the pointer is gone, cancelled or lifted (a finger has no hover).
  function clearHover() { hoverEv = null; setHover(null); setOrganHover(null); onHoverInfo(null); }
  svg.addEventListener('pointerover', (ev) => {
    if (ev.pointerType === 'touch') return;
    const id = edgeFromEvent(ev);
    if (id && EI[id] != null) {
      setHover(id);
      // The element under a still pointer can change (the figure redraws): show the readings then too, not only on a move.
      if (F && !shunt) { const r = wrap.getBoundingClientRect(); onHoverInfo({ id, x: ev.clientX - r.left, y: ev.clientY - r.top }); }
    }
  });
  svg.addEventListener('pointerout', (ev) => { if (edgeFromEvent(ev)) { setHover(null); onHoverInfo(null); } });
  svg.addEventListener('pointerleave', clearHover);
  svg.addEventListener('pointercancel', clearHover);
  svg.addEventListener('pointerup', (ev) => { if (ev.pointerType === 'touch') clearHover(); });
  svg.addEventListener('touchend', clearHover, { passive: true });
  svg.addEventListener('touchcancel', clearHover, { passive: true });
  document.documentElement.addEventListener('mouseleave', clearHover);
  window.addEventListener('blur', clearHover);
  // Hover is hit-tested once per frame (a mouse reports up to 1000 moves a second), and not at all while the figure is
  // being dragged (the view moves under the pointer and nothing is lit then).
  let hoverEv = null, hoverRaf = 0;
  svg.addEventListener('pointermove', (ev) => {
    if (shunt) shuntMove(ev);
    if (ev.pointerType === 'touch') return;   // a finger has no hover (a long press peeks instead)
    if (drag?.type === 'pan' && drag.moved && !drag.peeked) { if (hoverId) setHover(null); hoverEv = null; return; }
    hoverEv = ev;
    if (!hoverRaf) hoverRaf = nextFrame(() => { hoverRaf = 0; const e = hoverEv; hoverEv = null; if (e) hoverAt(e); });
  });
  function hoverAt(ev) {
    const id = edgeFromEvent(ev);
    if (id && EI[id] != null && F && !shunt) {
      const r = wrap.getBoundingClientRect();
      onHoverInfo({ id, x: ev.clientX - r.left, y: ev.clientY - r.top });
      setHover(id); setOrganHover(null);
      return;
    }
    if (hoverId) setHover(null);   // the pointer is over no vessel any more (also after a captured drag)
    if (!drag) onHoverInfo(null);
    if (!shunt && !drag && !lobuleOn && store.get().tool === 'select') {
      const [wx, wy] = clientToWorld(ev.clientX, ev.clientY), o = organAt(wx, wy);
      const sel = store.get().selection;
      const near = o ? nearbyEdge(ev) : null;   // a click here would pick this vessel, so the organ must not light
      if (near && EI[near] != null && F) { setHover(near); setOrganHover(null); return; }
      if (o && !(sel?.type === 'organ' && sel.id === o)) setOrganHover(o, o === 'liver' ? (wx < LIVER_SPLIT_X ? 'R' : 'L') : '');
      else setOrganHover(null);
    } else setOrganHover(null);
  }

  // ── Gestures: wheel, trackpad, mouse and touch ──
  // A mouse wheel zooms about the pointer. A trackpad's two-finger scroll pans and its pinch (a
  // wheel event with ctrlKey) zooms, as in maps and drawing apps; Ctrl/⌘ + wheel always zooms.
  // Trackpad scrolls are told from wheel notches once per gesture: Chrome and Safari report a
  // trackpad's legacy wheelDelta as exactly three times its delta, Firefox reports notches in lines.
  let wheelKind = null, wheelAt = 0, settleT = 0;
  const wheelPx = (ev, d) => d * (ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? stageBox().height : 1);
  const settleSoon = (ms = 220) => { clearTimeout(settleT); settleT = setTimeout(springBack, ms); };
  // A Mac trackpad keeps sending scroll events for a second or more after the fingers lift (momentum). Pressed in that
  // time, Fit (or a zoom button) used to glide to its framing and then the rest of the old scroll carried the figure off it
  // again. The button wins: the scroll under way when it was pressed is ignored until it stops; a new one works as usual.
  let wheelMute = false;
  function handsOff() {
    if (performance.now() - wheelAt < 250) wheelMute = true;
    stopGlide(); clearTimeout(settleT); panFit = null;
  }
  const onWheel = (ev) => {
    ev.preventDefault();
    const now = performance.now();
    if (wheelMute) { if (now - wheelAt < 250) { wheelAt = now; return; } wheelMute = false; }
    // The hand takes over from any camera glide (as a press does): the glide would overwrite each step of the scroll or pinch.
    if (vtGliding) { cancelFrame(vtAnim); vtGliding = false; camSettle(); }
    stopGlide(); userMoved = true; fitted = false;
    const dx = wheelPx(ev, ev.deltaX), dy = wheelPx(ev, ev.deltaY);
    if (ev.ctrlKey || ev.metaKey) { zoomAt(ev.clientX, ev.clientY, Math.exp(-clamp(dy, -50, 50) * 0.01), true); settleSoon(); return; }
    if (now - wheelAt > 250) {
      panFit = null;
      const pad = ev.deltaMode === 0 && (dx !== 0 || ev.wheelDeltaY == null || Math.abs(Math.abs(ev.wheelDeltaY) - Math.abs(ev.deltaY) * 3) < 1);
      wheelKind = pad ? 'pad' : 'wheel';
    }
    wheelAt = now;
    if (wheelKind === 'wheel' || lobuleOn) { zoomAt(ev.clientX, ev.clientY, Math.exp(-clamp(dy, -120, 120) * 0.0015)); if (!lobuleOn) settleSoon(); return; }   // (out past the whole figure, it springs back once the wheel stops, as a pinch does)
    const s = vbScale();
    const u0 = unsoftPan(vt);
    vt = softPan({ k: vt.k, x: u0.x - dx / s, y: u0.y - dy / s });
    applyVT(); CTM = null; settleSoon();
  };
  svg.addEventListener('wheel', onWheel, { passive: false });
  labelSvg.addEventListener('wheel', onWheel, { passive: false });
  // Safari on a Mac can report a trackpad pinch as gesture events instead of Ctrl + wheel. Left alone they magnified the
  // whole page, so the figure sat out of view and Fit (which frames the figure inside the page) could not bring it back.
  // The page never zooms: a pinch that comes with no Ctrl + wheel of its own is passed on as one, to the anatomy or the lobule.
  // On an iPhone or iPad a two-finger pinch sends these gesture events too, alongside the touches the figure (or the lobule)
  // already follows: passed on as well, each pinch was applied twice, a zoom about the gesture's centre on top of the
  // fingers' own, so the figure jumped between the two, zoomed in the wrong place and sprang back. While a finger is down,
  // the touches alone move the figure; the gesture events only keep the page from zooming.
  let gScale = 1, gWheel = false;
  const touchesDown = new Set();
  addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') touchesDown.add(e.pointerId); }, { capture: true, passive: true });
  for (const t of ['pointerup', 'pointercancel']) addEventListener(t, (e) => touchesDown.delete(e.pointerId), { capture: true, passive: true });
  wrap.addEventListener('wheel', (e) => { if (e.isTrusted && e.ctrlKey) gWheel = true; }, { capture: true, passive: true });
  wrap.addEventListener('gesturestart', (e) => { e.preventDefault(); gScale = 1; gWheel = false; }, { passive: false });
  wrap.addEventListener('gesturechange', (e) => {
    e.preventDefault();
    const r = e.scale / gScale, t = e.target, x = e.clientX, y = e.clientY;
    gScale = e.scale;
    if (!(r > 0) || r === 1 || touchesDown.size) return;
    nextFrame(() => { if (!gWheel && !touchesDown.size && t.isConnected) t.dispatchEvent(new WheelEvent('wheel', { deltaY: -Math.log(r) / 0.01, ctrlKey: true, clientX: x, clientY: y, bubbles: true, cancelable: true })); });
  }, { passive: false });
  wrap.addEventListener('gestureend', (e) => e.preventDefault(), { passive: false });

  // The figure never gets lost: past the zoom limits, or panned until its middle leaves the
  // view, it springs back once the gesture ends. During a pinch the limits stretch a little.
  const K_MIN = 0.6, K_MAX = 6;
  const softK = (k) => (k > K_MAX ? K_MAX * Math.pow(k / K_MAX, 0.3) : k < K_MIN ? K_MIN * Math.pow(k / K_MIN, 0.3) : k);
  function visibleVB() {
    const b = stageBox(), vb = svg.viewBox.baseVal, s = Math.min(b.sw / vb.width, b.sh / vb.height);
    return { x: vb.x - (b.sw - vb.width * s) / 2 / s, y: vb.y - (b.sh - vb.height * s) / 2 / s, w: b.sw / s, h: b.sh / s };
  }
  // Panning past the figure meets rising resistance, the lobule view's rubber band: a tanh band easing toward
  // 40% of the view, measured from where the middle of the view meets the figure's edge (at the fit zoom, from the fit framing).
  // hardPan is the nearest resting place; softPan puts a raw pan on the band, unsoftPan takes a banded pan back to raw.
  // The fit framing measures the page (the figure's boxes, every floating card): during a gesture it is read once and
  // held, so each move of a drag, wheel or flick is arithmetic only. A new gesture, a card or a resize reads it afresh.
  let panFit = null;
  const gestureOn = () => !!drag || !!glide || performance.now() - wheelAt < 250;
  function fitForPan() {
    const c = morphTarget === 1;
    if (!gestureOn()) { panFit = null; return defaultVT(c); }
    if (!panFit || panFit.c !== c || panFit.r !== rotTarget) panFit = { c, r: rotTarget, d: defaultVT(c) };
    return panFit.d;
  }
  addEventListener('pps:occ', () => { panFit = null; cath.lblKey = ''; });
  addEventListener('resize', () => { panFit = null; cath.lblKey = ''; });
  function hardPan(v) {
    const d = fitForPan();
    if (v.k <= d.k * 1.001) return { k: v.k, x: d.x, y: d.y };   // at the fit zoom the bounds are the fit position itself, as the lobule at its framing
    const c = morphTarget === 1 ? circVB() : VB_ANAT, vis = visibleVB();
    const x0 = c[0] * v.k + v.x, x1 = (c[0] + c[2]) * v.k + v.x, y0 = c[1] * v.k + v.y, y1 = (c[1] + c[3]) * v.k + v.y;
    const vx = vis.x + vis.w / 2, vy = vis.y + vis.h / 2;
    return { k: v.k, x: v.x + (vx < x0 ? vx - x0 : vx > x1 ? vx - x1 : 0), y: v.y + (vy < y0 ? vy - y0 : vy > y1 ? vy - y1 : 0) };
  }
  function bandPan(v, inv) {
    const h = hardPan(v), vis = visibleVB(), Lx = 0.4 * vis.w, Ly = 0.4 * vis.h;
    const f = (o, L) => (inv ? Math.atanh(clamp(o / L, -0.999, 0.999)) * L : L * Math.tanh(o / L));
    return { k: v.k, x: h.x + f(v.x - h.x, Lx), y: h.y + f(v.y - h.y, Ly) };
  }
  const softPan = (v) => bandPan(v, false), unsoftPan = (v) => bandPan(v, true);
  function springBack() {
    if (lobuleOn || vtGliding || drag || glide) return;
    let to = { ...vt };
    const k = clamp(vt.k, K_MIN, K_MAX);
    // At or past the fit zoom (zoomed out, or panned about at the fit), the view springs back to the fit framing, as in the lobule view.
    { const d = defaultVT(morphTarget === 1); if (vt.k <= d.k * 1.001) { fitted = true; if (!sameView(d, vt)) animateVT(d, 420); return; } }
    if (k !== vt.k) {
      const [cx, cy] = freeCentre(), [vx, vy] = clientToVB(cx, cy);
      to = { k, x: vx - ((vx - vt.x) / vt.k) * k, y: vy - ((vy - vt.y) / vt.k) * k };
    }
    // Lost means the middle of the view has left the figure: only then is it pulled back, and only as far as the
    // figure's edge. Zoomed in on any part (the spleen, a collateral), the view stays exactly where it was put.
    const c = morphTarget === 1 ? circVB() : VB_ANAT, vis = visibleVB();
    const x0 = c[0] * to.k + to.x, x1 = (c[0] + c[2]) * to.k + to.x, y0 = c[1] * to.k + to.y, y1 = (c[1] + c[3]) * to.k + to.y;
    const vx = vis.x + vis.w / 2, vy = vis.y + vis.h / 2;
    to.x += vx < x0 ? vx - x0 : vx > x1 ? vx - x1 : 0;
    to.y += vy < y0 ? vy - y0 : vy > y1 ? vy - y1 : 0;
    if (!sameView(to, vt)) animateVT(to, 380);
  }
  // A flick keeps the figure moving and slows it down, as a map does.
  let glide = 0;
  function stopGlide() { cancelFlick?.(); cancelFlick = null; glide = 0; }
  let cancelFlick = null;
  function fling(vx, vy) {
    if (reduceMotion.matches || Math.hypot(vx, vy) < FLICK.minSpeed) { springBack(); return; }
    const s0 = vbScale(), k = vt.k, h0 = hardPan(vt);
    // Let go past the bounds (always so at the fit zoom, where the drag rides the wide band): nothing to carry, so it eases home from
    // exactly where it is, as the lobule does at its framing. A flick would restart the stretch from a narrower band and jump.
    if (Math.abs(vt.x - h0.x) * s0 > 0.5 || Math.abs(vt.y - h0.y) * s0 > 0.5) { springBack(); return; }
    glide = 1;
    cancelFlick = runFlick({   // the lobule's flick, in screen pixels, bounded by the figure
      x: vt.x * s0, y: vt.y * s0, vx: vx, vy: vy,
      hard: (x, y) => { const h = hardPan({ k, x: x / s0, y: y / s0 }); return [h.x * s0, h.y * s0]; },
      apply: (x, y) => { vt = { k, x: x / s0, y: y / s0 }; applyVT(); CTM = null; },
      done: () => { glide = 0; cancelFlick = null; springBack(); },
    });
  }

  // Touch: every finger is captured by the figure, so a finger that lifts over a label or the
  // card still ends here (an uncaptured finger used to linger in `pointers` and turn the next
  // single touch into a pinch that jumped). Two fingers zoom and pan together: the point of the
  // figure under their midpoint stays under it. Lifting one finger hands over to a pan.
  // A double click zooms in about the point, Shift zooms out; a long press on a vessel shows its readings
  // without opening its card.
  const vbScale = () => { const b = stageBox(), vb = svg.viewBox.baseVal; return Math.min(b.sw / vb.width, b.sh / vb.height); };
  function clientToVBFast(cx, cy) {
    const b = stageBox(), vb = svg.viewBox.baseVal, s = Math.min(b.sw / vb.width, b.sh / vb.height);
    return [(cx - b.left - b.sx - (b.sw - vb.width * s) / 2) / s + vb.x, (cy - b.top - b.sy - (b.sh - vb.height * s) / 2) / s + vb.y];
  }
  const startPan = (x, y, id, moved = false) => ({ type: 'pan', x, y, vx: vt.x, vy: vt.y, s0: vbScale(), moved, id, trail: [[performance.now(), x, y]] });
  function startPinch() {
    const [a, b] = [...pointers.values()];
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, [vx, vy] = clientToVBFast(mx, my);
    return { type: 'pinchzoom', d0: Math.max(1, Math.hypot(a[0] - b[0], a[1] - b[1])), k0: vt.k, wx: (vx - vt.x) / vt.k, wy: (vy - vt.y) / vt.k, mx, my, t0: performance.now(), moved: false };
  }
  let pressT = 0, lastTap = null;
  const clearPress = () => { clearTimeout(pressT); pressT = 0; };
  // A finger (or the mouse) that lands on a label starts the same gesture as one on the figure: the labels cover
  // much of a phone's figure, and a pinch that began on one used to go unnoticed. A tap on a label still opens it.
  labelSvg.addEventListener('pointerdown', (ev) => { const lb = ev.target.closest?.('.lb'); if (lb) onDown(ev, lb); });
  svg.addEventListener('pointerdown', (ev) => onDown(ev, null));
  function onDown(ev, label) {
    if (systemEdge(ev)) return;
    // The first finger of a new gesture: nothing else can still be down.
    if (ev.isPrimary) pointers.clear();
    pointers.set(ev.pointerId, [ev.clientX, ev.clientY]);
    panFit = null;
    userMoved = true;
    cancelFrame(vtAnim); vtGliding = false; stopGlide(); clearTimeout(settleT);
    try { svg.setPointerCapture(ev.pointerId); } catch { /* pointer already gone */ }
    clearPress();
    if (pointers.size >= 2) {
      if (drag?.type === 'pan') wrap.classList.remove('panning');
      if (drag?.peeked) onHoverInfo(null);
      if (drag && drag.type !== 'pan' && drag.type !== 'pinchzoom') gGuides.innerHTML = '';
      drag = pointers.size === 2 ? startPinch() : drag;
      return;
    }
    if (ev.button === 2) return;   // the context menu opens the card instead
    drag = startPan(ev.clientX, ev.clientY, label ? null : edgeFromEvent(ev));
    drag.label = label;
    wrap.classList.add('panning');
    if (ev.pointerType === 'touch' && !shunt && !label) {
      const d = drag, x = ev.clientX, y = ev.clientY;
      pressT = setTimeout(() => {
        if (drag !== d || d.moved || pointers.size !== 1) return;
        const id = d.id && EI[d.id] != null ? d.id : nearbyEdge({ clientX: x, clientY: y, pointerType: 'touch' });
        if (!id) return;
        d.peeked = true;
        const r = wrap.getBoundingClientRect();
        onHoverInfo({ id, x: x - r.left, y: y - r.top, peek: true });
        navigator.vibrate?.(8);
      }, 480);
    }
  }
  svg.addEventListener('pointermove', (ev) => {
    if (!pointers.has(ev.pointerId)) return;
    pointers.set(ev.pointerId, [ev.clientX, ev.clientY]);
    if (!drag || drag.type === 'ignore') return;
    if (drag.type === 'pinchzoom') {
      if (pointers.size !== 2) return;
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      if (Math.abs(d - drag.d0) > 10 || Math.hypot(mx - drag.mx, my - drag.my) > 10) drag.moved = true;
      if (lobuleOn) return;
      const k = softK(drag.k0 * d / drag.d0);
      const [vx, vy] = clientToVBFast(mx, my);
      vt = { k, x: vx - drag.wx * k, y: vy - drag.wy * k }; fitted = false;
      applyVT(); CTM = null;
      return;
    }
    if (drag.type === 'pan') {
      // Once it counts as a pan the figure follows the finger from where it is then, rather than catching up the slop in one frame.
      if (Math.abs(ev.clientX - drag.x) + Math.abs(ev.clientY - drag.y) > (ev.pointerType === 'touch' ? 8 : 4)) { if (!drag.moved) { drag.moved = true; drag.x = ev.clientX; drag.y = ev.clientY; } clearPress(); }
      if (drag.peeked) {   // a long press then drag: the popup follows whichever vessel is under the finger
        const r = wrap.getBoundingClientRect();
        const id = edgeFromEvent(ev) || nearbyEdge(ev);
        if (id && EI[id] != null) onHoverInfo({ id, x: ev.clientX - r.left, y: ev.clientY - r.top, peek: true });
        else onHoverInfo(null);
        return;
      }
      if (drag.moved) {
        vt = softPan({ k: vt.k, x: drag.vx + (ev.clientX - drag.x) / drag.s0, y: drag.vy + (ev.clientY - drag.y) / drag.s0 }); fitted = false;
        applyVT(); CTM = null;
        const now = performance.now();
        drag.trail.push([now, ev.clientX, ev.clientY]);
        while (drag.trail.length > 2 && now - drag.trail[0][0] > 90) drag.trail.shift();
      }
      return;
    }
  });
  const endPointer = (ev) => {
    if (!pointers.delete(ev.pointerId)) return;
    clearPress();
    if (!drag) return;
    if (drag.type === 'ignore') { if (!pointers.size) { drag = null; springBack(); } return; }
    if (drag.type === 'pinchzoom') {
      // One finger stays down: it carries on as a pan (never as a click, never thrown on release).
      const rest = [...pointers.values()][0];
      drag = rest && pointers.size === 1 ? Object.assign(startPan(rest[0], rest[1], null, true), { noFling: true }) : pointers.size >= 2 ? startPinch() : null;
      if (!drag) springBack();
      return;
    }
    if (drag.type === 'pan') {
      wrap.classList.remove('panning');
      const d = drag;
      drag = null;
      if (d.peeked) { onHoverInfo(null); return; }
      if (!d.moved) {
        if (ev.type !== 'pointerup') return;
        if (shunt) { shuntDrop(ev); return; }
        const now = performance.now();
        // The second tap of a double tap zooms (and puts back whatever the first tap selected).
        // (Not by touch: there the first tap opens a card, whose sheet moves the figure, and the two moves fought.)
        if (ev.pointerType !== 'touch' && lastTap && now - lastTap.t < 320 && Math.hypot(ev.clientX - lastTap.x, ev.clientY - lastTap.y) < 30 && !lobuleOn) {
          const prev = lastTap.sel;
          lastTap = null;
          animZoomAt(ev.clientX, ev.clientY, ev.shiftKey ? 1 / 2 : 2);
          if (store.get().selection !== prev) onSelect(prev, { quiet: true });
          return;
        }
        lastTap = { t: now, x: ev.clientX, y: ev.clientY, sel: store.get().selection };
        if (d.label) { d.label.dispatchEvent(new MouseEvent('click', { bubbles: true })); return; }
        pick(d.id, ev);
        return;
      }
      // A real flick only: enough of a trail to measure, still moving at release, and capped, so a lift that
      // jitters never throws the figure.
      const tr = d.trail, a = tr[0], b = tr[tr.length - 1], dt = b[0] - a[0];
      if (!d.noFling && tr.length >= 3 && dt >= 30 && performance.now() - b[0] < 50) {
        const vx = (b[1] - a[1]) / dt, vy = (b[2] - a[2]) / dt, sp = Math.hypot(vx, vy), cap = Math.min(1, 2 / (sp || 1));
        fling(vx * cap, vy * cap);
      } else springBack();
      return;
    }
    drag = null;
    gGuides.innerHTML = '';
  };
  svg.addEventListener('pointerup', endPointer);
  svg.addEventListener('pointercancel', endPointer);
  svg.addEventListener('lostpointercapture', endPointer);
  // Right-click opens the card of what is under the pointer.
  svg.addEventListener('contextmenu', (ev) => {
    if (shunt || lobuleOn) return;
    ev.preventDefault();
    pick(edgeFromEvent(ev), ev);
  });

  // A tap that just misses a thin vessel still picks it: look around the point (out to ~14 px,
  // more on touch) for a vessel before falling back to the organ or the abdomen under it.
  function nearbyEdge(ev) {
    if (ev.clientX == null) return null;
    const R = ev.pointerType === 'touch' ? 18 : 12;
    for (const r of [R / 3, (2 * R) / 3, R]) {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const el = document.elementFromPoint(ev.clientX + Math.cos(a) * r, ev.clientY + Math.sin(a) * r)?.closest?.('.v-hit, .ghost-hit');
        const id = el?.getAttribute('data-id');
        if (id && EI[id] != null) return id;
      }
    }
    return null;
  }
  function pick(id, ev) {
    if (!(id && EI[id] != null)) id = nearbyEdge(ev);
    if (id && EI[id] != null) { onSelect({ type: 'edge', id }); return; }
    const [wx, wy] = clientToWorld(ev.clientX, ev.clientY);
    const o = organAt(wx, wy);
    onSelect(o ? { type: 'organ', id: o, at: [wx, wy], lobe: o === 'liver' ? (wx < LIVER_SPLIT_X ? 'R' : 'L') : undefined } : null);
  }


  // Keyboard: Tab reaches each vessel, Enter opens its card, arrows walk along the flow.
  svg.addEventListener('keydown', (ev) => {
    const org = ev.target.getAttribute?.('data-organ');
    if (org && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); if (shunt || morph > 0.5) return; setOrganHover(null); onSelect({ type: 'organ', id: org }, { keyboard: true }); return; }
    const id = ev.target.getAttribute?.('data-id');
    if (!id) return;
    if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); if (shunt) { shuntDropOn(id); return; } onSelect({ type: 'edge', id }, { keyboard: true }); }
    if ((ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') && F && EI[id] != null) {
      ev.preventDefault();
      const e = EDGES[EI[id]];
      const q = F.Q[EI[id]];
      const node = (ev.key === 'ArrowRight') === (q >= 0) ? e.to : e.from;
      const next = EDGES.find((x) => x.id !== id && E[x.id]?.vis && (x.from === node || x.to === node) && x.kind !== 'wedge');
      if (next) { E[next.id].hit.focus(); onSelect({ type: 'edge', id: next.id }, { quiet: true }); }
    }
  });
  svg.addEventListener('focusout', (ev) => { if (ev.target.getAttribute?.('data-organ')) setOrganHover(null); });
  svg.addEventListener('focusin', (ev) => {
    const org = ev.target.getAttribute?.('data-organ');
    if (org) { const sel = store.get().selection; setOrganHover(sel?.type === 'organ' && sel.id === org ? null : org); return; }
    const id = ev.target.getAttribute?.('data-id');
    if (id && F && EI[id] != null) {
      const e = EDGES[EI[id]], q = F.Q[EI[id]];
      ev.target.setAttribute('aria-label', `${e.label}: ${fmt(F.P[NI[e.from]], 1)} to ${fmt(F.P[NI[e.to]], 1)} millimeters of mercury, flow ${fmt(q * 0.06, 2)} liters per minute${E[id].rev ? ', reversed' : ''}. Press Enter for actions.`);
    }
  });

  // ── Shunts: from a source vessel to a drop target ──
  // Any portal vein to any systemic vein. The shunt joins each vessel at its end nearer the
  // other; when that pair is exactly a named procedure's (TIPS is right portal →
  // right hepatic vein), it is that procedure, otherwise a custom shunt between those two veins.
  const NAMED_RULES = {
    'RPV>RHV': { key: 'tips', label: 'TIPS' },
    'PVH>IVCI': { key: 'dips', label: 'DIPS' },
    'RPV>IVCS': { key: 'dips', label: 'DIPS' },
    'CONF>IVCI': { key: 'portocaval', label: 'Portocaval shunt' },
    'SV>LRV': { key: 'dsrs', label: 'Distal splenorenal shunt' },
    'SVD>LRV': { key: 'dsrs', label: 'Distal splenorenal shunt' },
    'SMV>IVCI': { key: 'mesocaval', label: 'Mesocaval shunt' },
  };
  function shuntRule(a, b, ax, ay, bx, by) {
    const t = easeInOut(morph);
    const ends = (id, set, x, y) => [E[id].e.from, E[id].e.to].filter((n) => set.includes(n))
      .sort((m, n) => Math.hypot(nodePos(m, t)[0] - x, nodePos(m, t)[1] - y) - Math.hypot(nodePos(n, t)[0] - x, nodePos(n, t)[1] - y))[0];
    for (const [pe, px, py, se, sx, sy] of [[a, ax, ay, b, bx, by], [b, bx, by, a, ax, ay]]) {
      // Each vessel is joined at its end nearer the other vessel.
      const pn = ends(pe, SHUNT_PORTAL, sx, sy), sn = ends(se, SHUNT_SYSTEMIC, px, py);
      if (!pn || !sn) continue;
      if (NAMED_RULES[`${pn}>${sn}`]) return NAMED_RULES[`${pn}>${sn}`];
      const id = customShuntId(pn, sn);
      if (EI[id] != null) return { key: 'custom', id, label: EDGES[EI[id]].label };
    }
    return null;
  }
  function startShunt(src, { only } = {}) {
    if (!E[src]?.vis) return false;
    cancelShunt(true);
    const [wx, wy] = pointAt(geo[src].cur, 0.5);
    const targets = new Map();
    for (const x of EV) {
      if (!x.vis || x.isArt || x.e.id === src || x.e.kind === 'shunt' || x.e.kind === 'liver') continue;
      const [tx, ty] = pointAt(geo[x.e.id].cur, 0.5);
      const r = shuntRule(src, x.e.id, wx, wy, tx, ty);
      if (r && (!only || r.key === only)) { targets.set(x.e.id, r); cls(x, 'shunt-target', true); }
    }
    if (!targets.size) { toast('No vessel on the other side of the circulation to connect this one to.'); return false; }
    shunt = { src, wx, wy, targets, hover: null };
    cls(E[src], 'shunt-src', true);
    wrap.classList.add('shunting');
    setHover(null);
    // On the GPU figure the targets glow and stand out of the dimmed network, as the SVG's do (the hint says "a glowing
    // vein"; they had shown nothing until hovered, and nothing on touch; round 2 review, NP3).
    shuntGlow(null);
    if (!vh.raf) { vh.t = performance.now(); vh.raf = nextFrame(vhStep); }
    syncPlateLook(); stageWake();
    store.set({ shunting: { src, only: only || null } });
    return true;
  }
  function cancelShunt(silent) {
    if (!shunt) return;
    for (const id of shunt.targets.keys()) if (E[id]) cls(E[id], 'shunt-target', false);
    if (E[shunt.src]) cls(E[shunt.src], 'shunt-src', false);
    shunt = null;
    gGuides.innerHTML = '';
    wrap.classList.remove('shunting');
    setGlowSrc('shunt', []);
    if (!vh.raf) { vh.t = performance.now(); vh.raf = nextFrame(vhStep); }
    syncPlateLook(); stageWake();
    if (!silent) store.set({ shunting: null });
  }
  // The shunt's targets in the accent, the one under the pointer stronger and wider.
  function shuntGlow(on) {
    if (!shunt) return;
    setGlowSrc('shunt', [...shunt.targets.keys()].map((id) => ({ id, col: 'var(--accent)', amt: id === on ? 1.4 : 0.9, wide: id === on ? 0.9 : 0.6, dur: 300 })));
  }
  function shuntMove(ev) {
    const [wx, wy] = clientToWorld(ev.clientX, ev.clientY);
    const tgt = edgeFromEvent(ev);
    const ok = tgt && shunt.targets.has(tgt);
    if ((ok ? tgt : null) !== shunt.hover) shuntGlow(ok ? tgt : null);
    shunt.hover = ok ? tgt : null;
    gGuides.innerHTML = '';
    gGuides.append(s('path', { class: 'stent-guide' + (tgt && !ok && tgt !== shunt.src ? ' invalid' : ''), d: `M${shunt.wx} ${shunt.wy} L ${wx} ${wy}` }));
    if (ok) {
      gGuides.append(s('path', { class: 'target-glow', d: E[tgt].wall.getAttribute('d'), 'stroke-width': E[tgt].width + 16 }));
      const r = shunt.targets.get(tgt);
      gGuides.append(s('text', { x: wx + 14, y: wy - 10, class: 'guide-label' }, document.createTextNode(r.label)));
    }
  }
  function shuntDrop(ev) {
    const tgt = edgeFromEvent(ev);
    if (tgt && shunt.targets.has(tgt)) { shuntDropOn(tgt); return; }
    if (!tgt) { cancelShunt(); toast('Shunt cancelled.'); }
  }
  function shuntDropOn(tgt) {
    const r = shunt?.targets.get(tgt);
    if (!r) return;
    cancelShunt();
    if (r.key === 'tips') updateParams({ tips: { on: true, d: store.get().params.tips.d || 8 } }, { label: 'TIPS' });
    else if (r.key === 'dips') updateParams({ dips: { on: true, d: store.get().params.dips.d || 8 } }, { label: 'DIPS' });
    else if (r.key === 'custom') updateParams((p) => { p.customShunts = { ...(p.customShunts || {}), [r.id]: 10 }; return p; }, { label: r.label });
    else updateParams({ [r.key]: true }, { label: r.label });
    toast(`${r.label} created.`);
    onSelect({ type: 'edge', id: r.key === 'tips' ? 'TIPS' : r.key === 'dips' ? 'DIPS' : r.key === 'custom' ? r.id : { portocaval: 'S_PC', dsrs: 'S_DSR', mesocaval: 'S_MC' }[r.key] });
  }

  // ── Anchors for the action card ───────────────────
  const ORGAN_ANCHOR = { liver: [470, 360], heart: [650, 118], spleen: [1052, 362], varices: SITES.varix, gastric: SITES.fundus, abdomen: [720, 770] };
  const anchorRings = { key: '', rings: [] };
  function anchorFor(sel) {
    if (!sel) return null;
    if (sel.type === 'lobule') return lz?.anchorFor(sel) || null;
    refreshCTM();
    if (sel.type === 'edge' && geo[sel.id] && E[sel.id]?.vis) {
      const pts = geo[sel.id].cur;
      const [x, y] = worldToLocal(...pointAt(pts, 0.5));
      // The tube and, for a braided bed (varices), each of its strands: the card keeps clear of all of them.
      const toPx = (line) => line.map((q) => worldToLocal(q[0], q[1]));
      const lines = [toPx(pts)];
      for (const sd of E[sel.id].strands || []) if (sd.cur && (sd.live ?? 1) >= 0.5) lines.push(toPx(sd.cur));
      const path = lines.flat();
      // The drawn half-width on screen (lumen and walls), so the card keeps clear of the whole tube (card-place.js).
      const r = (((E[sel.id].width ?? 8) + 3) / 2) * (CTM?.sc || 1);
      return { x, y, path, lines, r };
    }
    if (sel.type === 'organ') {
      const org = { liver: 'liver', heart: 'heart', spleen: 'spleen' }[sel.id];
      const hasLine = org && organEls[org]?.getAttribute('d');
      // An organ with an outline anchors at its own centre (not the clicked point); its leader starts on the outline.
      const w = (hasLine ? ORGAN_ANCHOR[sel.id] : null) || sel.at || ORGAN_ANCHOR[sel.id];
      if (!w) return null;
      const [x, y] = worldToLocal(w[0], w[1]);
      const path = [[x, y]];
      if (org && organEls[org]?.getBBox) {
        const b = organEls[org].getBBox();
        for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) path.push(worldToLocal(b.x + (b.width * i) / 4, b.y + (b.height * j) / 4));
      }
      let outline = null;
      if (hasLine) {
        // The same sampled rings the GPU outline draws (olRings), cached per shape, in screen space.
        const k = olKey(org);
        if (anchorRings.key !== k) { anchorRings.key = k; anchorRings.rings = olRings(org); }
        outline = [];
        for (const r of anchorRings.rings) for (let i = 0; i < r.length; i += 2) outline.push(worldToLocal(r[i][0], r[i][1]));
      }
      return { x, y, path, outline };
    }
    return null;
  }

  dpr.ready = true; dprobePaint();   // (a Doppler set while the stage was being built shows now)

  // ── Public API ────────────────────────────────────
  return {
    update,
    setView(v) {
      const target = v === 'circuit' ? 1 : 0;
      if (target === morphTarget) return;
      // (The dive into the lobule never moves the anatomy's own framing.)
      const fromLobule = lobuleOn || lobU > 0, at = vt;
      morphTarget = target;
      syncSemantic();
      // Zoomed out (or fitted) in the anatomy, the circuit opens zoomed out too: the whole map, not
      // the close-up it opens with on a phone. From a zoomed-in view it takes its usual framing.
      const wasOut = target === 1 && (fromLobule || at.k <= 1.001 || (homeAt && sameView(at, homeAt)));   // the whole plate (or less) is showing
      const d = wasOut ? circWhole() : defaultVT(target === 1);
      if (target === 0) { homeAt = d; fitted = true; }   // back to the anatomy: always its home framing
      if (d.k !== vt.k || d.x !== vt.x || d.y !== vt.y) animateVT(d, 600);
    },
    relayout() { refreshCTM(); if (F) updateLabels(F, true); },
    // How often the labels were laid out, skipped or only had their values refreshed, and the time spent (for perf checks).
    labelStats: () => ({ ...stats }),
    // The label slots as solved (key → side and pixel offset from the figure point it names), for tests.
    labelSlots: () => Object.fromEntries([...labelSol].filter(([, r]) => !r.drop).map(([k, r]) => [k, `${r.dir}/${r.pi}/${Math.round(r.dx)},${Math.round(r.dy)}`])),
    setSaver(on) {
      setFrameSaver(on);   // (the lobule, the sinusoid and the FibroScan read it each frame)
      if (!SOFTWARE) { quality = on ? Q_SAVER : 0; wrap.dataset.quality = String(quality); resizeCanvas(); }
    },
    labelScale: () => labelScale,
    labelEff: () => labelScale * deskK(),   // what the figure shows outside a presentation (a desktop's baseline included)
    /** The HVPG catheter: null removes it; else { u (0..1 of the way in), balloon, column (0..1), columnColor, ring, pulse,
     *  opacity, labels: [{ key, at: 'tip' | 'ahead', kicker, text, unit, cls }] }. route: 'tips' | 'brto' | 'bato' takes a
     *  treatment's route instead (PROC_ROUTES), where column is its sclerosant and balloonSpan names the stretch a long balloon fills. */
    setCatheter(st) {
      if (st) cathFade?.done();
      else if (cathFade || !cath.st) { cath.st = null; return; }
      cath.st = st; wrap.classList.toggle('cath-on', !!st);
      if (st && (st.route || 'hvpg') !== cath.kind) { cath.kind = st.route || 'hvpg'; cath.route = null; cath.rc = 0; }
      if (!st) { cath.rc = 0; cath.route = null; cathVer++; if (cathTint) { cathTint = null; cath.tintKey = ''; syncVeins(easeInOut(morph)); } cath.at = null; cathFadeOut(); return; }
      cathPaint();
    },
    /** A presenter slide's measuring sites, e.g. ['pv', 'ivc'] (see SITE_DEF), read from fp (the slide's numbers, so they
     *  match its ladder and tiles) or else the live figure; null removes them. */
    // A presenter slide's glows: vessels ([{ id, tone }], eased, in the station's colour) and organs (outlined, held).
    setGlow(list) { setGlow(list); },
    setResGlow(list) { resLit = new Map((list || []).map((r) => [r.id, r.tone])); if (sites.list) sitesPaint(); },
    pinOrgans(list) { pinOrgans(list); },
    // Organs eased in or out beside the slide's own pins (null: out): { id, tone, glow, fade } (ext-highlights.js, a meal's gut glow).
    glowOrgans(list) { pinOrgans(null, list || []); },
    // Deck visuals, package A (ext-highlights.js): a slide's spotlight ({ edges, organs: [{ id, tone }] } or null, V2), the
    // normal spleen's outline (['spleen'] or null, V18), its change ripple (two networks' node pressures, V6) and the network a
    // "change since" slide counts from (node pressures or null, V11).
    spotlight(sp) {
      spot.ids = new Set((sp?.edges || []).filter((id) => E[id]));
      spot.on = !!sp && (spot.ids.size > 0 || !!sp.organs?.length);
      if (spot.on) spot.live = true;
      spotOrgans(spot.on ? sp.organs : null);
      // (Each named vessel glows softly in its own colour, as a selected one does, so a pale one still reads against the dimmed rest.)
      setGlowSrc('spot', spotOn() ? [...spot.ids].map((id) => ({ id, col: null, amt: 1.7, wide: 0.9, dur: SEL_FADE * 1000 })) : []);
      if (!vh.raf) { vh.t = performance.now(); vh.raf = nextFrame(vhStep); }
      veinsDirty = true; stageWake();
    },
    // Deck visuals, package F (ext-callouts.js): a slide's figure callouts (live mark words, organ marks, calipers, step
    // numbers, the circuit's brackets and lit zone), or null.
    callouts(sp) { setCallouts(sp); },
    normalOutline(ids) { normal.want = !!ids?.includes('spleen'); normalSync(); },
    ripple(from, to) { ripple(from, to); },
    changeRef(P) { changeRef(P); },
    siteFp(fp) { slideFp = fp; if (sites.list) sites.fp = fp; },   // (the numbers the slide's tiles now show: a what-if, a time-lapse)
    setSites(list, fp = null) { sites.list = list?.length ? [...list] : null; sites.fp = fp; if (fp) slideFp = fp; if (!sites.list) for (const k of [...resMade.keys()]) resPaint(k, SITE_DEF[k], null); if (!sites.list) for (const [k, el] of [...sites.made]) siteLeave(k, el); else { refreshCTM(); sitesPaint(); } },
    /** Frame the catheter's route ('route'), its tip close up ('tip'), or go back to the view before ('home'). */
    cathFocus,
    /** A treatment route's named stretches as u (0..1 of the way in, as setCatheter takes it): { tract: [u0, u1], … }, or null. */
    cathStops() {
      const r = cathRoute();
      if (!r?.spans) return null;
      const u = (d) => (d - r.start) / (r.free - r.start || 1);
      return Object.fromEntries(Object.entries(r.spans).map(([k, [a, b]]) => [k, [u(a), u(b)]]));
    },
    cathFollow,
    /** Forget the view cathFocus would go back to (the presenter moves its own camera on). */
    cathForget() { cath.saved = null; cath.k0 = 0; },
    /** The vessel the Doppler is reading, glowing green while the Doppler instrument is open (null: none). */
    setDoppler(id) { dop.want = id; dopApply(); },
    /** The presenter's Doppler slide pins its vessel's glow, over whatever Explore's Doppler reads (null: unpin). points: on a
     *  stent, the figure calls out all three points it is sampled at, the sampled one named in the Doppler's green. */
    pinDoppler(id, { points = false } = {}) { dop.pin = id; dop.points = !!id && points; dopApply(); },
    setScanProbe,
    setLabelScale(v) {
      labelScale = clamp(Math.round(v * 100) / 100, LABEL_MIN, LABEL_MAX);
      try { localStorage.setItem('pps.labelScale', String(labelScale)); } catch { /* storage unavailable */ }
      if (!projecting) document.documentElement.style.setProperty('--label-k', String(labelScale * deskK())); document.documentElement.style.setProperty('--label-scale', String(labelScale)); document.documentElement.style.setProperty('--ts', String(labelScale));
      dispatchEvent(new Event('pps:labelscale'));
      if (F) updateLabels(F);
    },
    setProjection(on) { projecting = typeof on === 'number' ? on : !!on; if (F) updateLabels(F); },
    labelLayer: () => labelSvg,
    /** The layer the GPU's picture lies under (lesions, stents, halos), when the GPU draws. */
    overLayer: () => (veins && wrap.classList.contains('gl-on') ? svgOver : null),
    /** A vessel's stream (for tests): flow, display speed, stream distance, stasis. */
    flowDir(id) {
      const k = EI[id], sm = streams[k];
      if (k == null || !F || sm.vd == null) return null;
      return { q: (F.Qf || F.Q)[k], vd: sm.vd, D: sm.D, stasis: sm.stasis, dir: Math.sign(sm.vd) };
    },
    injectDye,
    releaseDye: () => bolus.release(),
    clearDye: () => bolus.clear(),
    dyeActive: () => bolus.active,
    dyeInjecting: () => bolus.injecting,
    svg,
    worldToLocal: (x, y) => { refreshCTM(); return worldToLocal(x, y); },
    anchorPos(anchor) {
      const t = easeInOut(morph);
      if (NODE_POS[anchor]) return nodePos(anchor, t);
      if (geo[anchor]) return pointAt(geo[anchor].cur, 0.5);
      return null;
    },
    // The zoom buttons zoom about the middle of the free space; in the lobule they drive its own view.
    zoomIn: () => { if (lobuleOn) { lz.zoomBy(1.4); return; } handsOff(); const c = freeCentre(); animZoomAt(c[0], c[1], 1.4); },
    zoomOut: () => {
      if (lobuleOn) { if (store.get().sinusoid) { store.set({ sinusoid: false }); return; } lz.zoomBy(1 / 1.4); return; }
      handsOff();
      // The last step out lands on the whole figure, centred (the circuit: its whole map), as the lobule's − stops at its framing.
      // (It used to shrink past it to 0.6× about the middle and stay there: a small figure off to one side that nothing put back.)
      const circuit = morphTarget === 1, d = defaultVT(circuit), whole = circuit ? circWhole() : d, lo = whole.k < d.k ? whole : d;
      const base = vtGliding && vtTarget ? vtTarget : vt;
      if (base.k / 1.4 <= lo.k * 1.001) { if (!circuit) homeAt = lo; fitted = true; if (!sameView(lo, base)) animateVT(lo, 260); return; }
      const c = freeCentre(); animZoomAt(c[0], c[1], 1 / 1.4);
    },
    fit, refit, closeView,
    keepView(on) { keptSpace = on ? spaceSig() : null; },
    reveal, unreveal,
    /** Changes whenever what is drawn where changes (a pan, a zoom, the morph): a cheap key for "did anything move". */
    layoutKey: () => `${viewVersion}|${geometryVersion}` + (lz?.isOpen() ? '|' + lz.viewKey() : ''),
    setCircuitRotated,
    circuitRotated: () => rotTarget === 1,
    zoomToBox, frameBox,
    /** While presenting: a function returning the free rectangles (wrap px, {l, t, r, b}) the camera frames a box into. */
    setFreeArea(fn) { freeArea = fn; },
    /** The free rectangle the last framed box was centred in (for the tests). */
    lastFree: () => lastFree,
    /** The plate box (world units) around organs and vessels as drawn now (an enlarged spleen at its size), or null. */
    focusBox({ organs = [], edges = [] } = {}) {
      let b = null;
      const add = (el, m) => {
        if (!el?.getBBox) return;
        let r; try { r = el.getBBox(); } catch { return; }
        if (!r.width && !r.height) return;
        for (const [x, y] of [[r.x, r.y], [r.x + r.width, r.y], [r.x, r.y + r.height], [r.x + r.width, r.y + r.height]]) {
          const X = m ? m.a * x + m.c * y + m.e : x, Y = m ? m.b * x + m.d * y + m.f : y;
          b = b ? [Math.min(b[0], X), Math.min(b[1], Y), Math.max(b[2], X), Math.max(b[3], Y)] : [X, Y, X, Y];
        }
      };
      for (const id of organs) if (organEls[id]?.getAttribute('d')) add(organEls[id], organG[id] && gMatrix(organG[id]));
      // (A vessel's wall is hidden while the GPU draws the vessels, so its drawn centreline gives the box.)
      for (const id of edges) {
        const P = geo[id]?.cur;
        if (P?.length) for (const [x, y] of P) b = b ? [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)] : [x, y, x, y];
        else if (E[id]?.vis) add(E[id].wall);
      }
      return b;
    },
    /** Fit with a chosen glide (the presenter's slower, calmer moves). */
    /** The camera's whole magnification (log scale: the plate's zoom plus the dive's), or null while the lobule fills the view. For the tests: a dive in or out must move it steadily, never stopping part way. */
    sinBusy: () => !!lz?.sinBusy(),
    cameraMoves: (clear) => (clear ? camMoves.splice(0) : [...camMoves]),
    /** The transform the GPU last drew the figure in, as [a, b, c, d, e, f] from world to stage px (null: not drawn on the GPU). */
    glMatrix: () => (veins && !veins.lost && wrap.classList.contains('gl-on') ? glM : null),
    /** For the checks: the vessel canvas as it stands (mid-gesture too), then after a whole redraw of it at the same view
     *  (PNG data URLs; equal when nothing on screen is stale, undrawn or softer), or null without the GPU figure. */
    /** For the checks: the organs' picture as the plate (one SVG of the whole plate) and as the layers the GPU draws instead
     *  (each layer's SVG, over its cropped rect on the plate's pixel grid), both of the state now (tests/e2e/plate-layers.mjs). */
    /** For the checks (tests/e2e/fluid-pool.mjs): frames that composited only the fluid's pool, and whether the level is easing. */
    poolFrames: () => poolFrames, fluidEasing: () => fluidEasing(), layerStarts: () => [layerStarts, layerStartsEasing],
    organLayersShown: () => plateOn() && gpuOrgansOn() && !!veins?.organs?.has(0),
    /** The ?perf switch "GPU organs", for the checks: true, false, or 'force' (on the software renderer too). */
    gpuOrgans(v) { gpuProbe.gpuOrgans = v; gpuProbe.onOrgans?.(); },
    plateLayersCheck() {
      const W = Math.round(PLATE_RECT[2] * PLATE_BASE), H = Math.round(PLATE_RECT[3] * PLATE_BASE), boxes = layerBoxes();
      const plate = plateMarkup(PLATE_RECT, W, H, true), layers = [];
      for (const L of ORGAN_LAYERS) {
        const r = cropToGrid(PLATE_RECT, boxes ? boxes.get(L) || [0, 0, 0, 0] : EVERYWHERE, PLATE_BASE);
        if (!r) continue;
        const w = Math.round(r[2] * PLATE_BASE), h = Math.round(r[3] * PLATE_BASE);
        layers.push({ name: L, x: Math.round((r[0] - PLATE_RECT[0]) * PLATE_BASE), y: Math.round((r[1] - PLATE_RECT[1]) * PLATE_BASE), w, h, svg: plateMarkup(r, w, h, false, false, L) });
      }
      return { W, H, plate, layers };
    },
    veinsCheck(compositeOnly = false) {
      if (!veins || veins.lost || !vLook || !F) return null;
      const now = veins.snapshot();
      // (compositeOnly: the picture composited again whole from the same vessel layer and look, as a partial composite stands in for.)
      if (compositeOnly) { veins.composite(vLook, bloodLook(), true); return { now, whole: veins.snapshot() }; }
      veinsDirty = true; drawVeins();
      return { now, whole: veins.snapshot() };
    },
    cameraZoom: () => ((diveT <= 0 || diveT >= 1) && !lz?.sinBusy() ? null : (refreshCTM(), Math.log(CTM.sc) + diveZ + lz.sinZoom() + zShift)),
    /** The next way out of the lobule lands on this box of the plate (or the fit, for null or 'fit'): one zoom, no stop between. */
    riseTo, holdHome, prepRise, riseReady,
    fitSlow(ms = 1300) { if (lobuleOn) return; const to = defaultVT(morphTarget === 1); if (morphTarget !== 1) homeAt = to; fitted = true; if (!sameView(to, vtGliding ? vtTarget : vt)) animateVT(to, ms); },
    /** The anatomy/circuit camera (where it is headed, if gliding), and a glide back to one saved earlier (the presenter puts the view back). */
    cameraState: () => ({ ...(vtGliding && vtTarget ? vtTarget : vt) }),
    /** The organs are drawn from the GPU copy again after a patient change (or never will be: no WebGL), so a camera move costs only the GPU's draw. */
    organsSettled: () => plateOn() || !glWanted(),
    /** The camera is still gliding (a slide's cards wait for it to land). */
    gliding: () => vtGliding,
    setCamera(to, ms = 900) { if (lobuleOn || !to || sameView(to, vtGliding ? vtTarget : vt)) return; fitted = false; animateVT({ ...to }, ms); },
    cameraKey: () => `${vt.k.toFixed(3)}|${vt.x.toFixed(1)}|${vt.y.toFixed(1)}`,
    zoomLobule, zoomLiver, lobuleOpen: () => !!lz?.isOpen(), lobuleViewKey: () => lz?.viewKey(),
    labelClearance: () => clearanceReport(),   // (the browser check's: see clearanceReport)
    lobuleSpot: () => lz?.spot() ?? null, lobuleLensFade: () => lz?.lensFade() ?? null, lobuleMem: (detail) => lz?.memBytes(detail) ?? 0, diveProgress: () => diveT, plateRasters: () => plateSeq,
    // (What the station labels' boxes follow: their layouts and the camera. The corner credit's poll looks again only when it changed.)
    labelStamp: () => `${stats.layouts}|${vt.k},${vt.x},${vt.y}|${morph}|${rotU}`,
    /** The stage's kept copy of its computed style, for the stage's own element (null for any other): read it instead of a live read. */
    keptStyle: (el) => (el === wrap ? wrapCS() : null),
    /** Where the sinusoid's reading and lesion pointer meet their sinusoid (see lobule-zoom sinAnchor). */
    lobuleSinAnchor: () => lz?.sinAnchor() ?? null,
    lobuleGlCheck: () => lz?.glCheck() ?? null, lobuleFxCheck: () => lz?.fxCheck() ?? null, lobuleLabelLayouts: () => lz?.labelLayouts() ?? 0,
    /** The lobule's outline in client px while it fills the view (see lobule-zoom ring), else null. */
    lobuleRing: () => (lobuleOn && diveT >= 1 ? lz?.ring() ?? null : null),
    /** The vessels lit by a glow that stays (a selection, a slide's or step's vessels, the Doppler's), as [id, band width ×]: the corner
     *  credit keeps off their glow too. (A hover's or a change's glow comes and goes; the credit does not move for it.) */
    steadyGlows: () => ['sel', 'dop', 'slide', 'focus'].flatMap((k) => [...(glow.src.get(k) || new Map()).values()].map((g) => [g.id, g.wide || 1])),
    /** Where a station's callout attaches, in client px (for the checks). */
    labelAnchorOf: (id) => { const a = labelAnchor(id, easeInOut(morph)), r = wrap.getBoundingClientRect(); return { x: a.ax + r.left, y: a.ay + r.top, mid: a.mid }; },
    /** The presenter's camera in the lobule: the whole lobule ('fit'), a portal tract ('triad'), the sinusoids ('sinusoid') or the central vein ('central'). */
    lobuleFocus: (part, opts) => !!lz?.focusOn(part, opts),
    /** Where the presenter's next lobule framing will be, so a dive lands on it in one move (see lobule-zoom aim). */
    lobuleAim: (part, opts) => { if (lz) lz.aim(part, opts); else { aimWait = [part, opts]; lobuleReady().catch(() => {}); } },
    /** The way out of the lobule begins (true: its framing stays in the space the leaving slide's cards left) or is called off (false). */
    lobuleHold: (on) => lz?.holdFrame(on),
    /** The dive into the lobule (or back out) has finished: the view is wholly the lobule, or wholly the anatomy. */
    lobuleSettled: () => !(lz?.sinBusy()) && (lobuleOn ? diveT >= 1 : diveT <= 0),
    /** From the anatomy to the sinusoid view in two zooms: into the lobule's normal framing, then into the sinusoid. In the lobule already, just the sinusoid. */
    async diveToSinusoid() {
      if (!lobuleOn && diveT === 0 && morphTarget === 0 && !reduceMotion.matches) {
        store.set({ lobule: true });
        const t0 = performance.now();
        while (!(lobuleOn && diveT >= 1 && lz?.isOpen()) && performance.now() - t0 < 12000) await new Promise((r) => setTimeout(r, 60));
        await new Promise((r) => setTimeout(r, 120));
        if (!lobuleOn) return;
      }
      store.set({ lobule: true, sinusoid: true });
    },
    /** From the sinusoid view out to the anatomy in three steps: out of the sinusoid, back to the lobule's normal framing, then out of the lobule. */
    async exitSinusoid() {
      if (!store.get().sinusoid || !lz?.sinusoidOpen()) { store.set({ sinusoid: false, lobule: false }); return; }
      store.set({ sinusoid: false });
      const t0 = performance.now(), wait = (ms) => new Promise((r) => setTimeout(r, ms));
      while ((lz.sinBusy() || lz.sinusoidOpen()) && performance.now() - t0 < 4000) await wait(60);
      if (lz.focusOn('fit', { ms: 900 })) await wait(900);
      if (store.get().lobule) store.set({ lobule: false });
    },
    /** True once the sinusoid view is wholly in. */
    sinusoidOpen: () => !!lz?.sinusoidOpen(),
    /** On-screen scale, px per world unit (for the tests: turning the circuit keeps it). */
    zoomLevel: () => { refreshCTM(); return CTM.sc; },
    focusEdge(id) { E[id]?.hit.focus(); },
    startShunt, cancelShunt, isShunting: () => !!shunt, anchorFor, organAt,
    /** Briefly glow the given vessels (where a readout is measured). */
    flash(ids) {
      setGlowSrc('flash', ids.filter((id) => E[id]?.vis).map((id) => ({ id, col: 'var(--accent)', amt: 1.3, dur: 380 })));
      clearTimeout(glow.flashT); glow.flashT = setTimeout(() => setGlowSrc('flash', []), 1000);
    },
    edgeMid: (id) => (geo[id] ? pointAt(geo[id].cur, 0.5) : null),
    /** The drawn network's box on screen (px, in the figure), for placing cards beside it. */
    contentRect() {
      if (netBoxFor !== geometryVersion) { try { netBox = gNet.getBBox(); } catch { netBox = null; } netBoxFor = geometryVersion; }
      if (!netBox?.width) return null;
      refreshCTM();
      const c = [[netBox.x, netBox.y], [netBox.x + netBox.width, netBox.y], [netBox.x, netBox.y + netBox.height], [netBox.x + netBox.width, netBox.y + netBox.height]].map(([x, y]) => worldToLocal(x, y));
      const xs = c.map((p) => p[0]), ys = c.map((p) => p[1]);
      return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
    },
    isVisible: (id) => E[id]?.vis,
  };
}
