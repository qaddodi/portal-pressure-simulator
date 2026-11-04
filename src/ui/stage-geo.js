// The vessel geometry tables: each edge's anatomic and circuit course sampled once, tributary and branch courses, fade and join tables, the custom shunt router, and the divided-vein length.
// (moved out of stage.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)
import { EDGES, NODES } from '../engine/topology.js';
import { CIRCUIT_PATH, CIRCUIT_TREES, EDGE_PATH, FEEDERS, HIDDEN_NODES, IVC_EDGES, NODE_POS, SIN_EDGES, VB_CIRC, fanFeeders, metroPath, route as metroRoute } from './anatomy.js';
import { createRouter } from './circuit-router.js';
import { store } from './store.js';
import { clamp } from './util.js';

export function createGeo(st, live) {
  const { ALL_EDGES, EI, N_SAMPLES, meander, sample, scratchG, svg, wiggle } = st;
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
    geo[e.id] = { dA, dC, A, C: sample(dC), cur: null, mix: null, mixI: 0, len: 0, wig: 0, lit: Array.from({ length: N_SAMPLES }, () => [0, 0, 0]) };   // (lit: the lit normals, one triple a sample, written in place by litNormals)
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
  // The ascending lumbar collateral (C9) climbs behind the liver and comes out above the dome, and joins it from the lower left at
  // y 108, just under where this fade starts, so the trunk fades out below the join on its own, behind the liver's dome. (A feeder listed in
  // FEEDER_CONNECTOR is drawn solid to its end while that collateral is open.)
  const FEEDER_FADE_Y = { AZY_SVC: [110, 176] };
  const FEEDER_CONNECTOR = {};
  // The IVC narrows to the SVC's caliber at the right atrium on the GPU too, so its end never
  // shows as a rounded cap inside the narrower SVC.
  const GPU_EASE = { IVCS_RA: 'RA' };
  // Shunts that leave and join a vein part-way along it, not at a node: the veins at each end ([from end], [to end]).
  // (The ascending lumbar collateral, C9, joins the azygos trunk from the side, below the arch: the trunk is drawn at the
  // azygos's own width, so the azygos is its host there.)
  const SIDE_HOSTS = { C6: [['V_SPL', 'SV_MID'], ['V_KID_L']], S_DSR: [['V_SPL', 'SV_MID'], ['V_KID_L']], C9: [[], ['AZY_SVC']] };
  // The ends of those that lie inside the vein's lumen, as a side branch (the Warren shunt's start runs on from the
  // divided splenic vein instead): narrowed there on the GPU (renderTube).
  const SIDE_INSIDE = { C6: [true, true], S_DSR: [false, true], C9: [false, true] };
  // Surgical shunts and the vein each one divides (engine.js closes the same vessels): the Warren shunt the splenic
  // vein, the portocaval shunt the portal trunk. The vein's first stretch, at the shunt, is not drawn, so the shunt
  // side and the tied-off stump stand apart with a clear gap, each ending in a rounded cap.
  const LIGATED = [['S_DSR', 'SV_MID'], ['S_PC', 'PV_TRUNK']];
  // How much of the divided vein is cut away (arc length, world units): the clear gap plus both rounded ends.
  // It opens and closes as the shunt draws on or retracts; 0 without the shunt.
  function divideLen(vein) {
    let sh;
    for (let i = 0; i < LIGATED.length; i++) if (LIGATED[i][1] === vein) { sh = LIGATED[i]; break; }
    const x = sh && live.E[sh[0]], v = live.E[vein];
    if (!x?.vis || !v?.vis) return 0;
    let k = 1;
    if (x.reveal) { const u = clamp((performance.now() - x.reveal.t0) / x.reveal.dur, 0, 1); k = x.reveal.out ? 1 - live.easeInOut(u) : live.easeInOut(u); }
    return k * (v.width * 2.2 + 2 * (v.wallPx || 1));
  }
  // The ascending lumbar–azygos channel runs a smooth course of its own, up behind the liver, so it is not coiled.
  const STRAIGHT_COLL = new Set(['C9']);
  // Veins that fade into the vessel they sink into: a linear mask [x1, y1, x2, y2, offset], from
  // solid at the offset to 30 % at the end (the caudate vein into the IVC, C5 into the renal vein).
  const FADE_IN = { RHV_IVC: [604, 226, 616, 204, 0, 0.5], MHV_IVC: [604, 246, 615, 228, 0, 0.5], LHV_IVC: [641, 206, 630, 192, 0, 0.5], LRV_IVC: [642, 625, 624, 625, 0, 0.5 / 0.6], RRV_IVC: [602, 660, 615, 673, 0, 0], CAUD: [566, 326, 620, 350, 0.45], C5: [852, 520, 862, 618, 0.6] };
  // The sinusoids lie inside the liver: faded along their course, most in the middle of the lobe, clearing as
  // they gather into the central and hepatic veins. Linear from the portal end to the venous end, [offset of
  // the faintest point, alpha at the start, there, mode 3] (the end is solid).
  const SIN_FADE = {};
  for (const id of SIN_EDGES) {
    const e = ALL_EDGES.find((q) => q.id === id), a = NODE_POS[e.from][0], b = NODE_POS[e.to][0];
    SIN_FADE[id] = [a[0], a[1], b[0], b[1], 0.5, 0.8, 0.36, 3];
  }
  // The ascending lumbar collateral (C9) runs up behind the liver, so it is a faint ghost there and solid again where it comes out
  // above the dome (Mohammad, 31 Oct: "I like behind the liver fade"): the same dip, along y, from solid under the liver's lower
  // edge to its faintest where the lane crosses the hepatic veins, back to solid at the diaphragm (liver top y 189, diaphragm
  // y 170). The organ's own veil (veins-gl, BACK_EDGES, VEIL_K) comes on top of it, so behind the liver it is about a fifth of full.
  SIN_FADE.C9 = [0, 520, 0, 172, 0.65, 1, 0.55, 3];
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
  const routeOpen = [], routeFresh = [];   // (the shunts open, and those to route now: kept, written in place)
  const routerOpts = { lines: routerLines, stations: routerStations, bounds: [VB_CIRC[0], 100, VB_CIRC[0] + VB_CIRC[2], VB_CIRC[1] + VB_CIRC[3] + 10] };   // (read by createRouter, not kept)
  function routeCustomShunts(p) {
    routeOpen.length = 0; routeFresh.length = 0;
    const cs = p.customShunts;
    if (cs) for (const id in cs) if (cs[id] > 0 && geo[id]) routeOpen.push(id);
    routeOpen.sort();
    // (A Map's entry deleted while it is walked is simply not visited again: no copy of the keys is needed.)
    for (const id of customRoutes.keys()) if (!routeOpen.includes(id)) customRoutes.delete(id);
    // Past a dozen at once there is no room left to route another clear of the rest (and the search
    // would stall the page); those stay as plain bypass arcs.
    const room = Math.max(0, 12 - customRoutes.size);
    for (let i = 0; i < routeOpen.length && routeFresh.length < room; i++) if (!customRoutes.has(routeOpen[i])) routeFresh.push(routeOpen[i]);
    const fresh = routeFresh;
    if (!fresh.length) return false;
    const router = createRouter(routerOpts);
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
  return { FADE_DOWN_Y, FADE_IN, FEEDER_CONNECTOR, FEEDER_FADE_Y, GPU_EASE, IVC_JOIN, LIGATED, SIDE_HOSTS, SIDE_INSIDE, SIN_FADE, STRAIGHT_COLL, divideLen, feedGeo, geo, routeCustomShunts, treeGeo };
}
