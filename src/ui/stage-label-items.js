// What a label says and where it attaches: change references, pressure runs, node, velocity and scan items, blockers and the label anchor.
// (moved out of stage.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)
import { EDGES, NODES, dopplerK, stentSegments, stentSite, tiedOff } from '../engine/topology.js';
import { ABBR, ATLAS_LABELS, LABEL_VESSEL, SHORT } from './anatomy.js';
import { oxygenFor } from './blood.js';
import { flowColor, heatColor, oxygenColor, pressureColor, velColorOf, velocityColor } from './colormap.js';
import { rippleList } from './highlight-math.js';
import { explainText } from './label-explain.js';
import { leaderEnd as edgeOf, leaderEndRects as edgeOfRects } from './leader-end.js';
import { D_SURFACE } from './ease.js';
import { reduceMotionMQ as reduceMotion } from './motion.js';
import { restPass } from './rest-pass.js';
import { sceneBegin, sceneStyle } from './scene-store.js';
import { shownVel, store, varicesPresent } from './store.js';
import { clamp, fmt, fmtFlow, fp } from './util.js';
import { STATION_VESSEL, judgeFlow, meanVel, velNormal } from './velNormal.js';

// The vessels whose reversed flow a station's label tells with ⟲: the one the velocity layer reads there, the one its label is anchored on, and, for the
// Circuit's stations that stand at a vein's end, that vein (the splenic vein and its middle, the jejunal and ileal vein, the gastric vein).
const REV_EXTRA = { SV: ['V_SPL', 'SV_MID'], SPL: ['V_SPL'], INT: ['V_INT'], STO: ['V_STO'] };
const REV_OF = new Map();
function revVessels(id) {
  let a = REV_OF.get(id);
  if (!a) REV_OF.set(id, a = [...new Set([STATION_VESSEL[id], LABEL_VESSEL[id], ...(REV_EXTRA[id] || [])].filter(Boolean))]);
  return a;
}
export function createLabelItems(st, live) {
  const { E, EI, EV, LINE_H, NI, REF, STENT_FACTORS, arcMid, breath, cath, cssNum, dopGateOf, dpr, explain, fontPx, geo, lensNow, lineW, mix3, nextFrame, noGlows, nodePos, pinned, quietFx, revShown, scan, setGlowSrc, sites, stageBox, svg, termTone, textW, toRGB, update, updateLabels, worldToLocalInto, wrap } = st;
  function changeRef(P) {
    const was = live.sinceP;
    live.sinceP = P ? Float32Array.from(P) : null;
    if (was === live.sinceP || store.get().colorMode !== 'since') return;
    if (live.shownCol.size && !reduceMotion.matches) { live.lensFrom = live.shownCol; live.lensT0 = lensNow(); }
    // (Cleared as a slide leaves, the next model frame takes the figure's state then as its reference: no redraw here.)
    if (P && live.F && !live.inUpdate) update(live.F);
  }
  // A slide's change ripple (deck visuals V6, ext-highlights.js: ripple): the vessels whose pressure moved between two of its
  // states glow warm (up) or cool (down) for a moment, as Patients' Δ glow does after a change, without its rings and numbers.
  // (Stronger, wider and held longer than Patients' Δ glow: on a slide the vessel under it often already wears the same blue or
  // red, from the Change colours, so only its halo shows it.)
  const RIPPLE_AMT = 2, RIPPLE_HOLD = 1600;
  let rippleT = 0;
  function ripple(from, to) {
    clearTimeout(rippleT);
    const list = from && to && !quietFx() ? rippleList(EDGES, NI, from, to, (e) => { const x = E[e.id]; return !!x?.vis && !x.isArt && !x.ghost; }) : [];
    sceneBegin();
    const cs = sceneStyle(svg) || getComputedStyle(svg), lift = clamp(cssNum(cs, '--ripple-lift', 0), 0, 1);
    const tone = (v) => { const c = mix3(toRGB(v, cs), [1, 1, 1], lift); return `rgb(${c.map((x) => Math.round(x * 255)).join(', ')})`; };   // colour-exempt: built from the glow tokens
    const up = tone('var(--glow-up)'), down = tone('var(--glow-down)');
    setGlowSrc('delta', list.map(([id, d]) => ({ id, col: d > 0 ? up : down, amt: RIPPLE_AMT, wide: 1.3, dur: D_SURFACE })));
    if (list.length) rippleT = setTimeout(setGlowSrc, RIPPLE_HOLD, 'delta', noGlows);
  }
  // Whether a station's own vessel runs against its healthy direction, as shown (the figure's chevrons turn orange on it).
  const stationRev = (id) => { const a = revVessels(id); for (let i = 0; i < a.length; i++) if (revShown.has(a[i])) return true; return false; };   // (no closure: the labels' signature asks on every frame)
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
    const runs = [{ t: v, size: 14, weight: 650, cls: 'lb-val' }];
    if (unitHere(id, u)) runs.push({ t: u, size: 10, weight: 500, cls: 'lb-unit', gap: 2.5 });
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
  // Where the change shows (looks review L2, 31 Oct: a label is a name and a value; the change only where it is asked for): on the
  // selected station, in the Change lens, while comparing with a pinned moment, and on a slide at the stations its words point at.
  const selStation = (id) => { const sl = store.get().selection; return sl?.type === 'node' && sl.id === id; };
  const deltaHere = (id) => { const st = store.get(); return st.presenting ? !!termTone(id) : selStation(id) || st.colorMode === 'delta' || !!st.compareSnap; };
  // The unit is said once, in the lens legend ("Pressure mmHg"); a label carries it only when it differs from the legend's (the
  // pressure unit setting) or when the label is selected. (Not a teaching-number change: every number stays; the unit moves.)
  const unitHere = (id, u) => u !== 'mmHg' || selStation(id);
  // Flow layer: blood entering the station (L/min) and its change; velocity layer: the fastest
  // velocity in a vessel at the station as the Doppler reads it (peak, cm/s); oxygen layer: the blood's
  // oxygen saturation at the station (%), the value the lens colours by. Other layers read pressure.
  function layerRuns(f, id, compact) {
    const lm = layerMode();
    if (lm !== 'flow' && lm !== 'velocity' && lm !== 'oxygen') return null;
    if (!store.get().layers.chips) return null;
    const big = { size: 14, weight: 650, cls: 'lb-val' }, unit = { size: 10, weight: 500, cls: 'lb-unit', gap: 2.5 };
    // (These lenses' legends name their unit too (L/min, cm/s, % O₂), so the label says it only when selected.)
    const withUnit = (t) => (selStation(id) ? [{ ...unit, t }] : []);
    if (lm === 'oxygen') {
      const sat = oxygenFor(EDGES, NODES, f).node[NI[id]];
      return { runs: [{ ...big, t: fmt(sat * 100, 0), pad: 3 }, ...withUnit('% O₂')], color: oxygenColor(sat) };
    }
    if (lm === 'flow') {
      const v = throughput(f.Qf || f.Q, id);
      const runs = [{ ...big, t: fmtFlow(v) }, ...withUnit('L/min')];
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
      if (x.ghost || x.e.id === 'TIPS' || x.e.id === 'DIPS') continue;   // the TIPS and DIPS shunts have their own velocity label
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
    const runs = [{ ...big, t: fmt(best, 0), pad: 3 }, { ...unit, t: 'cm/s' }];   // (pad: laid out as wide as three digits, stage-label-size.js lineW)
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
    // (The reversal icon stays through every step: a label may lose its unit, change and number, never the news that the flow turned.)
    const val = !it.short && it.lines.length === 2 ? it.lines[1].filter((r) => r.cls === 'lb-val' || r.cls === 'lb-rev') : [];
    if (val.length && val.length < it.lines[1].length) {
      it.lines = [it.lines[0], val]; it.w = Math.max(...it.lines.map(lineW)); it.h = it.lines.reduce((a, l) => a + LINE_H(l), 0); it.short = 1;
      return true;
    }
    const rev = it.lines.flat().find((r) => r.cls === 'lb-rev');
    it.lines = [[it.lines[0][0], ...(rev ? [{ ...rev, gap: 4 }] : [])]]; it.w = lineW(it.lines[0]); it.h = LINE_H(it.lines[0]); it.short = 2;
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
    // (The hepatic artery's label is its name only: its pressure sits off the venous scale and says little; its flow is in the selection card.)
    // (The coronary vein a Warren shunt has tied off reads "—": the stomach side's own pressure is not the vein's.)
    const tied = tiedOff(f.viewParams || st.params, id);
    const lr = isImaging() || id === 'HA' || tied ? null : layerRuns(f, id, compact);
    const pr = id === 'HA' ? null : tied ? [{ t: '—', size: 14, weight: 650, cls: 'lb-val' }] : lr ? lr.runs : pressureRuns(P, id, compact);
    // A station whose own vessel's flow has reversed carries ⟲ after its value, in the reversed-flow orange (blueprint §6.2).
    // (Any vessel the station stands on or names (revVessels), and with or without a number: the figure's chevrons turn orange on every
    // such vessel, so every label on one says so, even where the readings are off. 13 Nov 2026, "PV doesn't have the reversal icon".)
    const rev = stationRev(id);
    if (rev && pr) pr.push({ t: '⟲', size: 12, weight: 650, cls: 'lb-rev', gap: 5 });
    if (pr && one) lines[0].push(...pr.map((r, i) => (i ? r : { ...r, gap: 4 })));
    else if (pr) lines.push(pr);
    else if (rev && one) lines[0].push({ t: '⟲', size: 12, weight: 650, cls: 'lb-rev', gap: 4 });
    else if (rev) lines.push([{ t: '⟲', size: 12, weight: 650, cls: 'lb-rev' }]);
    // The explained label (tap, label-explain.js) carries its structure's name and live readings as one more line of its own picture.
    const exp = explain.key === 'n:' + id && mode !== 'atlas';
    if (exp) lines.push([{ t: explainText({ name: (meta?.name || NODES[NI[id]].label) !== name ? meta?.name || NODES[NI[id]].label : '', what: 'mean', value: Number.isFinite(P) ? P : NaN, flow: throughput(f.Qf || f.Q, id) }), size: 12, weight: 600, cls: 'lb-explain' }]);
    const w = Math.max(...lines.map(lineW)) + (mode === 'atlas' ? 7 : 0);
    const hh = lines.reduce((a, l) => a + LINE_H(l), 0);
    return { key: 'n:' + id, src: ['node', id, mode, compact], node: id, cls: 'node ' + mode + (one ? ' bare' : ''), lines, w, h: hh, sel, rev, canShort: (!!pr || id === 'HA') && mode !== 'atlas' && !exp,   // (the hepatic artery has no number to drop, but takes its abbreviation, "HA", where it is crowded)
 label: `${NODES[NI[id]].label}${tied ? ': tied off, no pressure' : lr ? `: ${lr.runs.filter((r) => r.cls !== 'lb-rev').map((r) => r.t).join(' ')}` : pr ? `: ${fmt(P, 1)} millimeters of mercury` : ''}${rev ? ', flow reversed' : ''}`,
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
    const factor = pt ? stentSegments(1, 1 - (1 - (p?.stenosis?.[sid] || 0)) * (1 - (p?.thrombus?.[sid] || 0)), stentSite(p, sid), STENT_FACTORS)[pt === 'proximal' ? 0 : pt === 'mid' ? 1 : 2] : 1;
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
      : [{ t: fmt(vel, 0), size: 14, weight: 650, cls: 'lb-val', gap: 4, pad: 3, ...(tint ? { fill: tint } : {}) }, { size: 10, weight: 500, cls: 'lb-unit', gap: 2.5, t: 'cm/s' }])]];
    it.key = point ? `n:${sid}:${point}` : `n:${sid}`; it.src = ['vel', sid, point]; it.node = undefined; it.sel = false; it.swatch = null;
    it.w = lineW(it.lines[0]); it.h = LINE_H(it.lines[0]);
    it.label = (none ? `${sid}${seg}: no flow` : `${sid}${seg}: ${fmt(vel, 0)} centimeters per second`) + (sampled ? ', sampled by the Doppler' : '');
    return it;
  }
  // The FibroScan probe's callout: the live stiffness, beside the waves, in their orange. A fixed width (the digits are tabular
  // and the box is as wide as "88.8 kPa"), so the number eases without the pill ever resizing or moving.
  function scanItem() {
    const k = scan.k ?? live.F?.metrics?.lsm ?? 0, txt = k >= 100 ? String(Math.round(k)) : k.toFixed(1);
    const val = { size: 14, weight: 700, cls: 'lb-scan-val' }, unit = { size: 10, weight: 600, cls: 'lb-scan-unit', gap: 3, t: 'kPa' };
    const lines = [[{ ...val, t: txt }, unit]];
    return { key: 'scan', src: ['scan'], cls: 'scan', lines, w: lineW([{ ...val, t: '88.8' }, unit]), h: LINE_H(lines[0]), align: 'middle', bg: true, padX: 8, padY: 3,
      label: `FibroScan stiffness ${txt} kPa`, pri: 20 };
  }
  const LADDER_TAG = { SIN_R: 'WHVP', RHV: 'FHVP' };
  const LADDER_KEY = { CONF: 'pv', SIN_R: 'whvp', RHV: 'fhvp', IVCS: 'ivc', RA: 'ra' };
  const ANAT_PRI = { HA: 3, CONF: 10, VAR: 9, SIN_R: 9, RHV: 8, RA: 8, SV: 7, SMV: 7, GV: 7, IVCS: 6, MHV: 5, LHV: 5, RPV: 5, LPV: 5, SIN_L: 5, IMV: 4, LGV: 4, W_R: 12, W_M: 12, W_L: 12 };
  // Stations labelled only when zoomed in enough to give them room, in this order (see updateLabels).
  const ANAT_EXTRA = ['MHV', 'LHV', 'RPV', 'LPV', 'SIN_L', 'IMV', 'LGV'];
  const staleBlockers = () => { live.blockersStale = true; };
  addEventListener('pps:occ', staleBlockers);
  addEventListener('resize', staleBlockers);
  const appStyle = document.getElementById('app')?.style;
  const pzInset = (k) => parseFloat(appStyle?.getPropertyValue(k)) || 0;
  // The readings drawn over the figure (a slide's measuring sites and resistors, the HVPG catheter's callouts): the figure's
  // labels keep clear of them. Their boxes are worked out where they are placed (calloutBox), so this reads no layout.
  // (The list is kept and written in place: the one layout that runs reads it, a solve in slices across its frames included, and a layout
  // that begins ends any other first. The probe's boxes are copies, from a pool made once, as many as the probe's own lists hold.)
  const calloutBuf = [], PROBE_BOXES = [];
  for (let i = 0; i < 1600; i++) PROBE_BOXES.push({ x0: 0, y0: 0, x1: 0, y1: 0, probe: true });
  const PLATE_BOX = { x0: 0, y0: 0, x1: 0, y1: 0 };
  function calloutBoxes() {
    const out = calloutBuf;
    let n = 0;
    for (const el of sites.made.values()) if (el._box && !el.classList.contains('cath-pre')) out[n++] = el._box;
    if (cath.made && !cath.labels.hidden) for (const el of cath.made.values()) if (el._box) out[n++] = el._box;
    if (dpr.on && dpr.box) {   // (the Doppler probe's body and its line of sight)
      const marks = dpr.marks;
      for (let i = -1; i < marks.length; i++) {
        const b = i < 0 ? dpr.box : marks[i], c = PROBE_BOXES[i + 1];
        c.x0 = b.x0; c.y0 = b.y0; c.x1 = b.x1; c.y1 = b.y1;
        out[n++] = c;
      }
    }
    if (live.plateBox?.(PLATE_BOX)) out[n++] = PLATE_BOX;   // (the cutouts plate's ring on the liver, a button: no label covers it)
    out.length = n;
    return out;
  }
  // What the labels' slots depend on: which readings show and how big they are (where they stand follows the camera, which
  // the labels' own key already holds). A new or resized reading lays the labels out afresh, so one under it moves aside.
  // (A number folded from the same things the text was: each reading's class and rounded size in order, then the probe's, so a callout that
  // comes, goes or is resized changes it. No text is made.)
  const sigFold = (h, v) => Math.imul(h ^ (v | 0), 16777619);
  const sigFoldEl = (h, el) => {
    h = sigFold(h, 124);
    const b = el._box;
    if (!b) return h;
    const c = el.className;
    if (typeof c === 'string') for (let i = 0; i < c.length; i++) h = sigFold(h, c.charCodeAt(i));
    return sigFold(sigFold(sigFold(h, 58), Math.round(b.x1 - b.x0)), Math.round(b.y1 - b.y0));
  };
  const calloutSig = () => {
    let h = 2166136261;
    for (const el of sites.made.values()) h = sigFoldEl(h, el);
    if (cath.made && !cath.labels.hidden) for (const el of cath.made.values()) h = sigFoldEl(h, el);
    if (live.plateBox) h = sigFold(h, 77);   // (the plate stands: its ring is a box the labels keep clear of; where it is, a solve reads afresh)
    if (dpr.on && dpr.box) h = sigFold(sigFold(sigFold(h, 100), Math.round((dpr.box.x1 - dpr.box.x0) / 8)), Math.round((dpr.box.y1 - dpr.box.y0) / 8));
    return h;
  };
  // The boxes come from a fresh IntersectionObserver's first report: the browser hands every box over after its own layout of the
  // frame, so reading them forces no layout (a slide change read them ten times a second, ~385 forced layouts: 2 Nov 2026, "Move
  // everything to GPU").
  const BLOCK_IO = typeof IntersectionObserver === 'function';
  function blockersRead() {
    if (!BLOCK_IO) { live.blockersAsk = 0; blockersGot(readBlockersRead((el) => el.getBoundingClientRect(), stageBox())); return; }
    const els = [wrap, ...blockerEls()];
    const io = new IntersectionObserver((es) => {
      io.disconnect();
      const rects = new Map(es.map((e) => [e.target, e.boundingClientRect]));
      // (The reading of the boxes, with its style read of the credit, waits for a rest pass: not in the observer's delivery mid-frame.)
      restPass(() => { live.blockersAsk = 0; blockersGot(readBlockersRead((el) => rects.get(el) || el.getBoundingClientRect(), rects.get(wrap) || stageBox(), els)); });
    });
    for (const el of els) io.observe(el);
  }
  function blockersGot(boxes) {
    live.blockerBoxes = boxes; live.blockersAt = performance.now(); live.blockersStale = false;
    nextFrame(() => { if (live.F && !live.camMove && !live.lz?.isOpen()) updateLabels(live.F); });   // (a new list: the labels' key changes with it)
  }
  // (Everything whose box the labels keep clear of: the credit, the presenter's pill, the cards and the clock.)
  // (One list of what is chrome over the figure, read by both the observer's targets and the boxes made from them: they must never differ,
  // or a piece one of them forgets, like the view switcher that sits outside its holder's box, is drawn under by a label. 3 Nov 2026.)
  const BLOCKER_SEL = '.stage-blocker:not([hidden]), .pz-shade, #nbViews, .stage-clock';
  const blockerEls = () => [document.querySelector('.stage-credit'), store.get().presenting && document.querySelector('.pz-bar.pzb-pill'),
    ...document.querySelectorAll(BLOCKER_SEL)].filter(Boolean);
  function readBlockersRead(rectOf, wr, els = null) {
    { const el = document.querySelector('.stage-credit'), r = el && (!els || els.includes(el)) ? rectOf(el) : null;
      live.creditKept = r?.width && getComputedStyle(el).opacity !== '0' ? { x0: r.left - wr.left - 10, y0: r.top - wr.top - 10, x1: r.right - wr.left + 10, y1: r.bottom - wr.top + 10 } : null; }
    { const el = store.get().presenting && document.querySelector('.pz-bar.pzb-pill'), r = el && (!els || els.includes(el)) ? rectOf(el) : null;
      live.pillEdge = r?.width ? { m: Math.max(6, Math.round(wr.right - r.right)), top: r.top - wr.top } : null; }
    // (The teaching card's glass, .pz-shade, too: on a phone it reaches 16 px above the words, and a label kept off only the words
    // tucked its top under the glass, SMALL BOWEL on PVT 5 and STOMACH on Variceal bleed 3.)
    // (And the view switcher's holder over the play bar while it holds the switcher: reading labels sat under Circuit / Anatomy /
    // Lobule. By id, not the .stage-blocker class, which the credit and pan starts also read; round 2 review, G3-7.)
    // (And the phone's clock at the bottom left, "Day 30": a label there sat under it. It is display: none off the phone, so no box.)
    return [...document.querySelectorAll(BLOCKER_SEL)].map((el) => {
      if (el.id === 'nbViews' && !el.querySelector('#viewSeg')) return null;
      // A closed card can stay in place, invisible (the patient chart does): it hides nothing. (So does a glass with no words on it.)
      // (Nor does a card on its way out, a panel included: 2 Nov, the organs' names went off for half a second as a slide's panel left,
      // and came back once it had gone.)
      if (getComputedStyle(el).visibility === 'hidden' || (el.classList.contains('pz-shade') && (el.style.opacity === '0' || el.classList.contains('pz-leave'))) || el.classList.contains('pz-leave')) return null;
      if (els && !els.includes(el)) return null;   // (come in since the boxes were asked for: read with the next ask)
      const r = rectOf(el);
      return r.width ? { x0: r.left - wr.left - 4, y0: r.top - wr.top - 4, x1: r.right - wr.left + 4, y1: r.bottom - wr.top + 4 } : null;
    }).filter(Boolean);
  }
  // Where a station's callout attaches: the middle of the vessel it names when that vessel is drawn
  // (see LABEL_VESSEL), else the station itself. `tan` is the vessel's direction there, on screen.
  // (The anchor is one kept record, read at once by every caller; the direction a label keeps is a pair kept for its station, which the
  // layout in hand rewrites for the labels it makes.)
  const ANCHOR = { ax: 0, ay: 0, mid: false, tan: null, w: 0 }, ANCHOR_P = [0, 0], ANCHOR_Q = [0, 0], ANCHOR_TANS = new Map();
  function labelAnchor(id, t) {
    const eid = LABEL_VESSEL[id], x = eid && E[eid], a = ANCHOR;
    if (x && x.vis && !x.ghost && geo[eid]?.cur?.length > 1) {
      // The middle of the vessel along its course (the sinusoids too: the middle of their bed, not their venous half).
      const m = arcMid(geo[eid].cur), wx = m[0], wy = m[1], tx = m[2], ty = m[3];
      worldToLocalInto(ANCHOR_P, wx, wy); worldToLocalInto(ANCHOR_Q, wx + tx, wy + ty);
      const ax = ANCHOR_P[0], ay = ANCHOR_P[1], bx = ANCHOR_Q[0], by = ANCHOR_Q[1];
      const n = Math.hypot(bx - ax, by - ay) || 1;
      let tn = ANCHOR_TANS.get(id);
      if (!tn) ANCHOR_TANS.set(id, tn = [0, 0]);
      tn[0] = (bx - ax) / n; tn[1] = (by - ay) / n;
      a.ax = ax; a.ay = ay; a.mid = true; a.tan = tn; a.w = x.width || 4;
      return a;
    }
    const p = nodePos(id, t);
    worldToLocalInto(ANCHOR_P, p[0], p[1]);
    a.ax = ANCHOR_P[0]; a.ay = ANCHOR_P[1]; a.mid = false; a.tan = null; a.w = 0;
    return a;
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
  // (The point is one kept record, written anew by each call: every caller reads its x and y before it asks again.)
  const LEAD_XY = { x: 0, y: 0 };
  function leaderEnd(r, ax, ay, pad = 6) {
    const cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2;
    const hw = (r.x1 - r.x0) / 2 + pad, hh = (r.y1 - r.y0) / 2 + pad;
    const dx = ax - cx, dy = ay - cy;
    const t = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
    if (t >= 1) { LEAD_XY.x = ax; LEAD_XY.y = ay; } else { LEAD_XY.x = cx + dx * t; LEAD_XY.y = cy + dy * t; }
    return LEAD_XY;
  }
  // The words a Circuit reading's leader reaches, when the reading's text stands at (x, y): the nearer of its lines' runs (a name, a
  // number, a unit), each as wide as its words, to the anchor (ax, ay). The drawn leader and the tidy's trial ones both end on it.
  function leadRectOf(it, x, y, ax, ay) {
    let yy = y, best = null;
    for (const line of it.lines) {
      const lh = LINE_H(line), lw = lineW(line), base = yy + lh * 0.78, lx = it.align === 'end' ? x + it.w - lw : it.align === 'middle' ? x + (it.w - lw) / 2 : x;
      let xx = lx;
      line.forEach((run, i) => {
        if (i) xx += (run.gap ?? 3) * live.labelK;
        const fp = fontPx(run.size), rw = textW(run.t, fp, run.weight, run.track || 0);
        const lb = { x0: xx, y0: base - 0.72 * fp, x1: xx + rw, y1: base + 0.04 * fp };
        xx += rw;
        const d = Math.hypot(Math.max(lb.y0 - ay, 0, ay - lb.y1), Math.max(lb.x0 - ax, 0, ax - lb.x1));
        if (!best || d < best.d) best = { d, lb };
      });
      yy += lh;
    }
    return best.lb;
  }
  // Where a drawn leader stops: on the edge of what is seen of its label (the pill, or the letters' own box), never short
  // of it and never in under the letters, at any zoom (leader-end.js). (leaderEnd above still decides whether one shows.)
  // A haloed label is seen as its letters: each run of text (a name, a number, a unit) from its tallest figures' tops
  // (0.72 of its font) down to the next line, the last line's to just below its baseline, as wide as the run, plus the halo.
  const LOW = /[acegmnopqrsuvwxyz]/, X_HEIGHT = 0.55;   // (Inter's x-height, 0.546 of its size; its round letters overshoot it a little)
  // (The boxes are a kept pool, written in place, and the list of them a kept list: seenEnd, their one caller, reads them at once.)
  const inkOut = [], inkPool = [];
  for (let i = 0; i < 256; i++) inkPool.push({ x0: 0, y0: 0, x1: 0, y1: 0 });
  const inkBox = (n, x0, y0, x1, y1) => {
    const b = inkPool[n] || (inkPool[n] = { x0: 0, y0: 0, x1: 0, y1: 0 });   // (more than a label has ever held: one more is made)
    b.x0 = x0; b.y0 = y0; b.x1 = x1; b.y1 = y1;
    return b;
  };
  const inkRects = (it) => {
    const out = inkOut, halo = 1, lines = it.lines;
    let y = it.y, n = 0, prevFrom = 0, prevTo = 0;
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      const lh = LINE_H(line), lw = lineW(line) + (it.swatch ? 7 : 0), base = y + lh * 0.78;
      let x = (it.align === 'end' ? it.x + it.w - lw : it.align === 'middle' ? it.x + (it.w - lw) / 2 : it.x) + (it.swatch ? 7 : 0);
      // (Within a run, letters that stand only to the x-height (a, e, o, v, …) are a box of their own that high: a leader coming down
      // on "vein" from above stopped at the capitals' height, 3 px over the letters it met, as the zoom landed.)
      const rowFrom = n;
      for (let i = 0; i < line.length; i++) {
        const r = line[i];
        if (r.sfx) continue;   // (the heart's reading after a label is not what its leader aims at: heart-label.js)
        const f = fontPx(r.size), tr = r.track || 0, w = textW(r.t, f, r.weight, tr);
        if (i) x += (r.gap ?? 3) * live.labelK;
        let from = 0;
        if (!r.t.length) { out[n] = inkBox(n, x - halo, base - f * 0.72 - halo, x + w + halo, base + halo); n++; }
        for (let j = 1; j <= r.t.length; j++) {
          if (j < r.t.length && LOW.test(r.t[j]) === LOW.test(r.t[from])) continue;
          const a = from ? textW(r.t.slice(0, from), f, r.weight, tr) : 0, e = j === r.t.length ? w : textW(r.t.slice(0, j), f, r.weight, tr);
          out[n] = inkBox(n, x + a - halo, base - f * (LOW.test(r.t[from]) ? X_HEIGHT : 0.72) - halo, x + e + halo, base + halo); n++;
          from = j;
        }
        x += w;
      }
      let top = Infinity;
      for (let k = rowFrom; k < n; k++) top = Math.min(top, out[k].y0);
      for (let k = prevFrom; k < prevTo; k++) out[k].y1 = Math.max(out[k].y1, top);
      prevFrom = rowFrom; prevTo = n; y += lh;
      if (li === lines.length - 1) for (let k = rowFrom; k < n; k++) out[k].y1 = base + halo;
    }
    out.length = n;
    return out;
  };
  // (The box of a pill and the outer box of the letters, and the point a leader falls back to: kept, read by seenEnd's caller at once.)
  const SEEN_R = { x0: 0, y0: 0, x1: 0, y1: 0 }, SEEN_OUTER = { x0: 0, y0: 0, x1: 0, y1: 0 }, SEEN_XY = { x: 0, y: 0 };
  const seenEnd = (it) => {
    if (it.bg) {
      SEEN_R.x0 = it.x - it.padX; SEEN_R.y0 = it.y - it.padY; SEEN_R.x1 = it.x + it.w + it.padX; SEEN_R.y1 = it.y + it.h + it.padY;
      return edgeOf(SEEN_R, it.ax, it.ay) || (SEEN_XY.x = it.ax, SEEN_XY.y = it.ay, SEEN_XY);
    }
    const rs = inkRects(it), outer = SEEN_OUTER;
    outer.x0 = Infinity; outer.y0 = Infinity; outer.x1 = -Infinity; outer.y1 = -Infinity;
    for (let k = 0; k < rs.length; k++) { const r = rs[k]; outer.x0 = Math.min(outer.x0, r.x0); outer.y0 = Math.min(outer.y0, r.y0); outer.x1 = Math.max(outer.x1, r.x1); outer.y1 = Math.max(outer.y1, r.y1); }
    return edgeOfRects(rs, outer, it.ax, it.ay) || (SEEN_XY.x = it.ax, SEEN_XY.y = it.ay, SEEN_XY);
  };
  return { ANAT_EXTRA, ANAT_PRI, BLOCK_IO, beatMean, blockersRead, calloutBoxes, calloutSig, changeRef, hasVarices, isImaging, labelAnchor, labelHidden, layerMode, leadRectOf, leaderEnd, nodeItem, oneLine, pzInset, readBlockersRead, ripple, scanItem, seenEnd, shortenItem, shortenTo, sigFold, stationRev, velItem };
}
