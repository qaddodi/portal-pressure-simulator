// Deck visuals, package A (figure highlights): the sums behind the slide fields, kept apart from the stage and the presenter so
// unit tests can load them (review/deck-visuals-recs.md §9). Nothing here touches the page.

// Named sets of vessels ('@name' in a slide's glow, spot or a mark's edges; slide-ext.js expandIds). Every id is a vessel in
// the model's topology (tests/highlights.test.js).
export const SETS = {
  portal: ['V_INT', 'SMV_CONF', 'V_COL', 'V_IMV', 'V_SPL', 'SV_MID', 'SV_CONF', 'V_STO', 'LGV_CONF', 'PV_TRUNK', 'PVH_R', 'PVH_L'],
  'hepatic-veins': ['RHV_IVC', 'MHV_IVC', 'LHV_IVC'],
  collaterals: ['C1a', 'C1b', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9'],
  esophageal: ['LGV_CONF', 'C1a', 'C1b', 'AZY_SVC'],
  gastrorenal: ['C2', 'C5', 'LRV_IVC'],
  splenorenal: ['C6', 'LRV_IVC'],
  shunts: ['TIPS', 'DIPS', 'S_PC', 'S_DSR', 'S_MC'],
  caval: ['ILI_IVC', 'IVC_IS', 'IVCS_RA', 'LRV_IVC', 'AZY_SVC', 'SVC_RA'],
  'gut-arteries': ['A_SMA', 'A_IMA', 'A_SPL', 'A_LGA'],
};

// The organs a slide can now outline and name (V3). These have no station colour, so all take one neutral ink (--text-2, set
// for every theme): an organ's own deep tone vanished into the line the figure already draws round it. The figure draws each one
// (anatomy.js ORGANS).
export const ORGAN_TARGETS = {
  bowel: { organ: 'bowel', tone: '--text-2', words: 'small bowel|small intestine|bowel' },
  colon: { organ: 'colon', tone: '--text-2', words: 'colon|large bowel' },
  duodenum: { organ: 'duodenum', tone: '--text-2', words: 'duodenum' },
  kidney: { organ: 'kidney-l', tone: '--text-2', words: 'left kidney|kidney' },
};
export const NEW_ORGANS = ['bowel', 'colon', 'duodenum', 'kidney-l'];
// The organs the presenter already outlines, with the colour their target gives them (presenter.js TARGETS).
const OLD_ORGANS = { liver: 'wedge', caudate: 'hv', 'caudate-lobe': 'hv', spleen: 'sv', heart: '--tour-sys', 'heart-ra': '--tour-sys' };

/** A slide's spot list (V2: vessel ids, organ ids and '@sets', already expanded) as { edges, organs: [{ id, tone }] }.
 *  vessel(id): whether the id is a vessel of the model. An id that is neither is left out. */
export function spotOf(list, vessel) {
  const edges = [], organs = [], seen = new Set();
  for (const g of Array.isArray(list) ? list : []) {
    const id = typeof g === 'string' ? g : g?.id;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const t = ORGAN_TARGETS[id];
    if (t) organs.push({ id: t.organ, tone: t.tone });
    else if (NEW_ORGANS.includes(id)) organs.push({ id, tone: ORGAN_TARGETS.bowel.tone });
    else if (OLD_ORGANS[id]) organs.push({ id, tone: OLD_ORGANS[id] });
    else if (vessel(id)) edges.push(id);
  }
  return { edges, organs };
}

// ── Outlines ──
/** A stroked tube's outline (the bowel, colon and duodenum are drawn as a stroke along a centre line): the line offset by
 *  half the tube's width to each side, joined round its two ends, as one closed ring. */
export function bandRing(line, half) {
  const n = line.length;
  if (n < 2 || !(half > 0)) return [];
  const nrm = line.map((p, i) => {
    const a = line[Math.max(0, i - 1)], b = line[Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    return [-dy / l, dx / l];
  });
  const side = (s) => line.map((p, i) => [p[0] + s * half * nrm[i][0], p[1] + s * half * nrm[i][1]]);
  // A cap: a half circle from one side to the other about the end point, on the outer side.
  const cap = (p, from, steps = 8) => {
    const a0 = Math.atan2(from[1] - p[1], from[0] - p[0]), out = [];
    for (let k = 1; k < steps; k++) { const a = a0 - (Math.PI * k) / steps; out.push([p[0] + half * Math.cos(a), p[1] + half * Math.sin(a)]); }
    return out;
  };
  const L = side(1), R = side(-1).reverse();
  // (The left side runs forward, its end cap turns over to the right side, which runs back, and the start cap closes it.)
  const ring = [...L, ...cap(line[n - 1], L[n - 1]), ...R, ...cap(line[0], R[n - 1])];
  ring.push([...ring[0]]);
  return ring;
}
/** Rings drawn as a dashed line: runs of on units with gaps of off between them, measured along each ring (the normal spleen's
 *  outline, V18, so it reads as a reference and not as a second organ). */
export function dashRings(rings, on, off) {
  const out = [];
  if (!(on > 0) || !(off >= 0)) return out;
  for (const r of rings) {
    let cur = null, at = 0;   // at: how far along the current dash or gap this point is
    let inDash = true;
    for (let i = 0; i < r.length; i++) {
      const p = r[i];
      if (i === 0) { cur = [[...p]]; continue; }
      const a = r[i - 1];
      let len = Math.hypot(p[0] - a[0], p[1] - a[1]), done = 0;
      while (len - done > 1e-9) {
        const left = (inDash ? on : off) - at, step = Math.min(left, len - done);
        done += step; at += step;
        const t = done / len, q = [a[0] + (p[0] - a[0]) * t, a[1] + (p[1] - a[1]) * t];
        if (inDash) cur.push(q);
        if (at >= (inDash ? on : off) - 1e-9) {
          if (inDash) { if (cur.length > 1) out.push(cur); cur = null; } else cur = [q];
          inDash = !inDash; at = 0;
        }
      }
    }
    if (inDash && cur?.length > 1) out.push(cur);
  }
  return out;
}
// The normal spleen's outline (V18) shows once the spleen is clearly larger than normal, and goes only once it is nearly back
// (so a spleen hovering at the threshold does not blink): its drawn scale is its length over 11 cm.
export const NORMAL_ON = 1.08, NORMAL_OFF = 1.04;
export const normalShown = (scale, was) => scale >= NORMAL_ON || (was && scale >= NORMAL_OFF);

// ── The change ripple (V6) ──
// As Patients' Δ glow (stage.js stepHalos): the vessels whose mean pressure moved by 2 mmHg or more, the 16 that moved most.
export const RIPPLE_MIN = 2, RIPPLE_MAX = 16;
/** [[vessel id, change]] from one network's node pressures to another's. edges: the topology's; ni: node id to index;
 *  shown(edge): whether the figure shows it now. */
export function rippleList(edges, ni, from, to, shown = () => true) {
  if (!from || !to || from.length !== to.length) return [];
  const out = [];
  for (const e of edges) {
    if (e.kind === 'wedge' || !shown(e)) continue;
    const a = ni[e.from], b = ni[e.to];
    if (a == null || b == null) continue;
    const d = (to[a] + to[b] - from[a] - from[b]) / 2;
    if (Math.abs(d) >= RIPPLE_MIN) out.push([e.id, d]);
  }
  out.sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]));
  return out.slice(0, RIPPLE_MAX);
}

// ── The vein system (V7) ──
/** Which system a vessel belongs to: 'pv' (portal), 'ivc' (systemic) or 'var' (a collateral or shunt between them).
 *  portal: the set of portal-territory node ids (topology.js PORTAL_TERRITORY). */
export function systemOf(e, portal) {
  if (e.kind === 'collateral' || e.kind === 'shunt') return 'var';
  return portal.has(e.from) || portal.has(e.to) ? 'pv' : 'ivc';
}
export const SYSTEM_COLOR = { pv: 'var(--tr-pv)', ivc: 'var(--tr-ivc)', var: 'var(--tr-var)' };

// ── Slides and their states ──
// As the presenter: a slide that loads a patient or changes it (preset, params, action, days) has its own model state; any other
// shows the last one before it (presenter.js prepare).
const changes = (s) => !!(s?.preset || s?.params || s?.action || s?.days);
/** stateOf[i]: the slide whose state slide i shows. */
export function stateIndex(slides) {
  const out = [];
  let last = 0;
  (slides || []).forEach((s, i) => { if (changes(s) || i === 0) last = i; out[i] = last; });
  return out;
}
/** The key's words for a "change since" slide (V11): what it compares with. */
export function sinceWords(s) {
  if (s?.sinceLabel) return `change vs ${s.sinceLabel}`;
  if (s?.lapse) return 'change over these days';
  return typeof s?.since === 'string' ? 'change vs earlier' : 'change vs last slide';
}
