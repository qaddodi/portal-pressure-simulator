// Accessibility beyond the keyboard (plan §6.1).
//
// Describe: a plain-language description of the current patient, generated from the model the
// same way the Story is, read out through the live region (key D, or the menu). The figure's
// accessible name is kept current with a one-line summary.
//
// Sonify: pressure as pitch. A soft tone follows the selected vessel (or the portal vein) from
// 220 Hz at 0 mmHg to 880 Hz at 30 mmHg, with a short tick when flow reverses. It never plays
// unless switched on, and stops with the page.

import { store } from './store.js?v=4bf5a96a9d';
import { fmt, clamp } from './util.js?v=d483888526';
import { EDGES, NODES } from '../engine/topology.js?v=6d79260961';

const NI = Object.fromEntries(NODES.map((n, i) => [n.id, i]));
const EI = Object.fromEntries(EDGES.map((e, i) => [e.id, i]));

export function describe(f) {
  if (!f) return 'The model is loading.';
  const st = store.get(), m = f.metrics, hidden = st.hiddenReadouts;
  const scen = st.presetList?.find((p) => p.id === st.presetId)?.label || 'Custom patient';
  const parts = [`${scen}.`];
  if (!hidden?.has('pv')) {
    parts.push(`Portal pressure ${fmt(m.pv, 0)} millimeters of mercury, ${m.pv <= 10 ? 'normal' : m.pv < 15 ? 'raised' : 'high'}.`);
    parts.push(`Portosystemic gradient ${fmt(m.ppg, 0)}${m.ppg >= 12 ? ', above the bleeding threshold of 12' : ''}.`);
  }
  if (!hidden?.has('trueHVPG')) parts.push(`HVPG ${fmt(m.hvpg, 0)}.`);
  const q = (f.Qf || f.Q)[EI.PV_TRUNK];
  parts.push(q < -0.05 ? 'Portal flow is reversed, away from the liver.' : Math.abs(m.pvVel) < 5 ? 'Portal flow is sluggish.' : `Portal flow ${fmt(m.pvFlow, 1)} liters per minute toward the liver.`);
  if (m.varix.d >= 2.5) parts.push(`Esophageal varices, ${m.varix.grade.label.toLowerCase()}${m.varix.redWale ? ', with red wale signs' : ''}.`);
  if (m.ascites.grade > 0) parts.push(`Ascites grade ${m.ascites.grade}, about ${fmt(m.ascites.volume / 1000, 1)} liters.`);
  if (!hidden?.has('model') && m.shuntFraction > 0.1) parts.push(`${Math.round(m.shuntFraction * 100)} percent of gut blood bypasses the liver.`);
  if (f.bleed?.active) parts.push(`Active variceal bleeding. Heart rate ${fmt(m.hr, 0)}, mean arterial pressure ${fmt(m.map, 0)}.`);
  else parts.push(`Heart rate ${fmt(m.hr, 0)}, mean arterial pressure ${fmt(m.map, 0)}.`);
  const sel = st.selection;
  if (sel?.type === 'edge') {
    const e = EDGES[EI[sel.id]];
    if (e && !hidden?.has('pv')) parts.push(`Selected: ${e.label}, ${fmt(f.P[NI[e.from]], 0)} to ${fmt(f.P[NI[e.to]], 0)} millimeters of mercury.`);
  }
  return parts.join(' ');
}

export function announce(text) {
  const el = document.getElementById('live');
  if (!el) return;
  el.textContent = '';
  setTimeout(() => { el.textContent = text; }, 60);
}

let ctx = null, osc = null, gain = null, on = false, lastSign = 1, lastTick = 0;
export const sonifying = () => on;
export function setSonify(v) {
  on = v;
  try { localStorage.setItem('pps.sonify', v ? '1' : '0'); } catch { /* storage unavailable */ }
  if (on) {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    ctx.resume?.();
    osc = ctx.createOscillator(); gain = ctx.createGain();
    osc.type = 'sine'; gain.gain.value = 0;
    osc.connect(gain).connect(ctx.destination); osc.start();
    gain.gain.setTargetAtTime(0.05, ctx.currentTime, 0.2);
  } else if (osc) {
    gain.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
    const o = osc; setTimeout(() => { try { o.stop(); } catch { /* already stopped */ } }, 300);
    osc = gain = null;
  }
}
export function sonifyFrame(f) {
  if (!on || !osc || !f) return;
  const st = store.get(), sel = st.selection;
  if (st.hiddenReadouts?.has('pv')) { gain.gain.setTargetAtTime(0, ctx.currentTime, 0.1); return; }
  const id = sel?.type === 'edge' && EI[sel.id] != null ? sel.id : 'PV_TRUNK';
  const e = EDGES[EI[id]];
  const p = (f.P[NI[e.from]] + f.P[NI[e.to]]) / 2;
  const hz = 220 * Math.pow(4, clamp(p / 30, 0, 1.2));
  osc.frequency.setTargetAtTime(hz, ctx.currentTime, 0.15);
  gain.gain.setTargetAtTime(0.05, ctx.currentTime, 0.2);
  const sign = (f.Qf || f.Q)[EI[id]] >= 0 ? 1 : -1;
  const now = performance.now();
  if (sign !== lastSign && now - lastTick > 800) {
    lastTick = now;
    const t = ctx.createOscillator(), g = ctx.createGain();
    t.frequency.value = 1320; g.gain.value = 0.08;
    t.connect(g).connect(ctx.destination); t.start(); g.gain.setTargetAtTime(0, ctx.currentTime, 0.04); t.stop(ctx.currentTime + 0.2);
  }
  lastSign = sign;
}
