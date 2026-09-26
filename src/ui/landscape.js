// Pressure landscape: the circuit map raised into 2.5D, height = mean pressure. Blood runs
// downhill; a plateau is a compartment and a cliff is a resistance, so the site of portal
// hypertension (before, within or after the sinusoids, or beyond the liver) is visible as where
// the land falls. Drag to tilt and turn. The side panel names the steepest fall on the portal
// pathway, live.

import { store } from './store.js?v=e9304c5ee2';
import { h, fmt, clamp, fitCanvas } from './util.js?v=13768f12bf';
import { NODES, EDGES } from '../engine/topology.js?v=44e0aca402';
import { NODE_POS, HIDDEN_EDGES, HIDDEN_NODES, CIRCUIT_ZONES, SHORT } from './anatomy.js?v=9a27037e31';
import { pressureColor } from './colormap.js?v=fa78a29bc0';
import { theme, FONT } from './charts.js?v=af67e3e2ae';

const NI = Object.fromEntries(NODES.map((n, i) => [n.id, i]));
// The portal pathway, gut to heart, and what a fall across each step means.
const PATH = ['INT', 'SMV', 'CONF', 'SIN_R', 'CV_R', 'RHV', 'IVCS', 'RA'];
const STEP = {
  SMV: ['Splanchnic veins', 'prehepatic'], CONF: ['Portal vein', 'prehepatic (portal vein)'], SIN_R: ['Portal tracts', 'presinusoidal'],
  CV_R: ['Sinusoids', 'sinusoidal'], RHV: ['Central veins', 'postsinusoidal'], IVCS: ['Hepatic veins', 'posthepatic (hepatic veins)'], RA: ['IVC', 'posthepatic (IVC)'],
};
const LABELED = ['CONF', 'SIN_R', 'RA', 'RHV', 'SMV', 'SPL', 'VAR', 'IVCS', 'INT', 'KID_L']; // in priority order
const X0 = 30, X1 = 1340, Y0 = 30, Y1 = 730, MAXP = 30;

export function createLandscape() {
  const el = h('div', { class: 'dock-pane', 'data-pane': 'landscape' });
  const box = h('div', { class: 'chart-box land-box' });
  const cv = h('canvas', { role: 'img', 'aria-label': 'Pressure landscape: the circulation raised by pressure' });
  box.append(cv);
  const verdict = h('div', { class: 'land-verdict' });
  const side = h('div', { class: 'chart-side' },
    h('div', { class: 'side-title' }, 'Pressure landscape'),
    h('div', { class: 'sub' }, 'The circuit raised by mean pressure. Blood runs downhill: plateaus are compartments, cliffs are resistances. Drag to tilt and turn.'),
    verdict);
  el.append(box, side);

  let F = null, yaw = 0.3, tilt = 0.3, raf = 0, lastT = 0, phase = 0;
  const edges = EDGES.filter((e) => e.kind !== 'wedge' && !HIDDEN_EDGES.has(e.id) && NODE_POS[e.from] && NODE_POS[e.to] && !HIDDEN_NODES.has(e.from) && !HIDDEN_NODES.has(e.to));
  const EI = Object.fromEntries(EDGES.map((e, i) => [e.id, i]));

  // Drag: horizontal turns (shear), vertical tilts (depth foreshortening).
  let drag = null;
  cv.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, yaw, tilt }; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', (e) => {
    if (!drag) return;
    yaw = clamp(drag.yaw + (e.clientX - drag.x) / 400, -0.8, 0.8);
    tilt = clamp(drag.tilt - (e.clientY - drag.y) / 300, 0.18, 0.8);
    draw();
  });
  const end = () => { drag = null; };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  cv.style.touchAction = 'none'; cv.style.cursor = 'grab';

  function visible(e, f) {
    const k = EI[e.id], q = Math.abs(f.Qf ? f.Qf[k] : f.Q[k]);
    if (e.kind === 'collateral') return q > 0.3;
    if (e.kind === 'shunt') return f.D[k] > 0 && q > 0.1;
    return true;
  }

  function draw() {
    if (!F || !el.isConnected || !el.offsetParent) return;
    const c = theme();
    const { ctx, w, h: hh } = fitCanvas(cv);
    ctx.clearRect(0, 0, w, hh);
    if (store.get().imaging) {
      ctx.fillStyle = c.faint; ctx.font = FONT(500, 12); ctx.textAlign = 'center';
      ctx.fillText('Pressures are unmeasured in this case.', w / 2, hh / 2);
      return;
    }
    const P = F.Pf || F.P;
    // Ground: an oblique parallelogram. Depth is foreshortened by `tilt`, turned by `yaw`.
    const padX = 34, top = 30, bottom = 22;
    const depthPx = (hh - top - bottom) * tilt;
    const heightPx = hh - top - bottom - depthPx;
    const shear = yaw * depthPx * 1.4;
    const gw = w - 2 * padX - Math.abs(shear);
    const ox = padX + Math.max(0, -shear);
    const proj = (x, y, p) => {
      const u = (x - X0) / (X1 - X0), v = (y - Y0) / (Y1 - Y0);
      return [ox + u * gw + (1 - v) * shear, top + heightPx + v * depthPx - (clamp(p, -2, MAXP + 6) / MAXP) * heightPx];
    };
    const at = (id, p) => { const [, pos] = NODE_POS[id]; return proj(pos[0], pos[1], p); };
    // Floor with the zone bands of the circuit.
    const corner = (u, v) => proj(X0 + u * (X1 - X0), Y0 + v * (Y1 - Y0), 0);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    CIRCUIT_ZONES.forEach(([name, x0, x1], i) => {
      const a = proj(x0, Y0, 0), b = proj(x1, Y0, 0), d = proj(x1, Y1, 0), e2 = proj(x0, Y1, 0);
      ctx.fillStyle = i % 2 ? c.surface2 : 'transparent';
      ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.lineTo(...d); ctx.lineTo(...e2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = c.faint; ctx.font = FONT(600, 9.5); ctx.textAlign = 'center';
      const m = proj((x0 + x1) / 2, Y1, 0);
      ctx.fillText(name.toUpperCase(), m[0], Math.min(hh - 6, m[1] + 14));
    });
    ctx.strokeStyle = c.border; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(...corner(0, 0)); ctx.lineTo(...corner(1, 0)); ctx.lineTo(...corner(1, 1)); ctx.lineTo(...corner(0, 1)); ctx.closePath(); ctx.stroke();
    // Reference planes: CSPH (10) and the bleeding threshold (12), as outlines at their height.
    for (const [pv, col, lab] of [[10, c.axis, '10'], [12, c.danger, '12 mmHg']]) {
      const q = [proj(X0, Y0, pv), proj(X1, Y0, pv), proj(X1, Y1, pv), proj(X0, Y1, pv)];
      ctx.setLineDash([3, 4]); ctx.strokeStyle = col; ctx.globalAlpha = pv === 12 ? 0.55 : 0.8;
      ctx.beginPath(); ctx.moveTo(...q[0]); for (const p of q.slice(1)) ctx.lineTo(...p); ctx.closePath(); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
      if (pv === 12) { ctx.fillStyle = c.danger; ctx.font = FONT(600, 9.5); ctx.textAlign = 'right'; ctx.fillText(lab, q[0][0] - 4, q[0][1] + 3); }
    }
    // Vessels, back to front: a translucent curtain down to the floor, then the ribbon at its
    // pressure, colored by the pressure scale; width follows diameter.
    const list = edges.filter((e) => visible(e, F)).map((e) => {
      const a = NODE_POS[e.from][1], b = NODE_POS[e.to][1];
      return { e, depth: (a[1] + b[1]) / 2, P1: P[NI[e.from]], P2: P[NI[e.to]] };
    }).sort((x, y) => x.depth - y.depth);
    for (const { e, P1, P2 } of list) {
      const a0 = at(e.from, 0), b0 = at(e.to, 0), a = at(e.from, P1), b = at(e.to, P2);
      const g = ctx.createLinearGradient(a[0], a[1], b[0], b[1]);
      g.addColorStop(0, pressureColor(P1)); g.addColorStop(1, pressureColor(P2));
      ctx.fillStyle = g; ctx.globalAlpha = e.kind === 'collateral' || e.kind === 'shunt' ? 0.05 : 0.1;
      ctx.beginPath(); ctx.moveTo(...a0); ctx.lineTo(...b0); ctx.lineTo(...b); ctx.lineTo(...a); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
      const k = EI[e.id];
      const lw = clamp(1.2 + Math.sqrt(Math.max(0.1, F.D[k])) * 0.9, 1.4, 5);
      ctx.strokeStyle = c.surface; ctx.lineWidth = lw + 2.5;
      ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke();
      ctx.strokeStyle = g; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke();
      // Flow: dashes running downstream (the way blood actually moves in the model).
      const q = F.Qf ? F.Qf[k] : F.Q[k];
      if (Math.abs(q) > 0.2 && lw > 1.6) {
        ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = Math.max(1, lw * 0.34);
        ctx.setLineDash([2, 9]); ctx.lineDashOffset = -phase * 11 * Math.sign(q);
        ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    // Stations: a post down to the floor and a name with the value.
    ctx.font = FONT(600, 10.5); ctx.textAlign = 'center';
    const boxes = [];
    for (const id of LABELED) {
      if (!NODE_POS[id]) continue;
      const p = P[NI[id]], t = at(id, p), f0 = at(id, 0);
      ctx.strokeStyle = c.axis; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(...f0); ctx.lineTo(...t); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = pressureColor(p); ctx.strokeStyle = c.surface; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(t[0], t[1], 3.6, 0, 7); ctx.fill(); ctx.stroke();
      const txt = `${SHORT[id] || NODES[NI[id]].label} ${fmt(p, 0)}`;
      const tw = ctx.measureText(txt).width, bx = { x0: t[0] - tw / 2 - 3, x1: t[0] + tw / 2 + 3, y0: t[1] - 20, y1: t[1] - 5 };
      if (boxes.some((o) => bx.x0 < o.x1 && bx.x1 > o.x0 && bx.y0 < o.y1 && bx.y1 > o.y0)) continue;
      boxes.push(bx);
      ctx.lineWidth = 3; ctx.strokeStyle = c.surface; ctx.strokeText(txt, t[0], t[1] - 8);
      ctx.fillStyle = c.muted; ctx.fillText(txt, t[0], t[1] - 8);
    }
    // Verdict: the steepest fall on the portal pathway.
    let best = null;
    for (let i = 1; i < PATH.length; i++) {
      const d = P[NI[PATH[i - 1]]] - P[NI[PATH[i]]];
      if (!best || d > best.d) best = { d, id: PATH[i] };
    }
    const [where, kind] = STEP[best.id];
    const key = `${best.id}|${fmt(best.d, 0)}`;
    if (verdict._k !== key) {
      verdict._k = key;
      const normal = best.d < 6;
      verdict.replaceChildren(
        h('div', { class: 'lv-k' }, 'Steepest fall'),
        h('div', { class: 'lv-v' }, where, h('b', {}, ` −${fmt(best.d, 0)} mmHg`)),
        h('div', { class: 'lv-d' }, normal ? 'No dominant resistance: pressure falls gently to the heart.' : `Resistance: ${kind}.`));
    }
  }

  // Animate the flow while the pane is on screen and the model runs (≈30 fps).
  function loop(t) {
    raf = 0;
    if (!el.isConnected || !el.offsetParent || !store.get().running || document.hidden) return;
    if (t - lastT > 33) { phase = (phase + (t - lastT) / 1000) % 1000; lastT = t; draw(); }
    raf = requestAnimationFrame(loop);
  }
  function update(f) {
    F = f;
    draw();
    if (!raf && store.get().running && !matchMedia('(prefers-reduced-motion: reduce)').matches) { lastT = performance.now(); raf = requestAnimationFrame(loop); }
  }
  return { id: 'landscape', label: 'Pressure landscape', el, update };
}
