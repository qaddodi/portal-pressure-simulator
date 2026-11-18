// Model table bench (card gallery, plan 1.5 and 2.8): each patient's settled pressures and flows from src/ui/snapshots.js (the engine's own numbers,
// written by scripts/snapshots.mjs and checked by tests/snapshots.test.js), and next to them the LIVE model's numbers for the patient that is loaded,
// read the way that script reads them (the pressures of the nodes of the pathway from the frame's shown pressures Pf, and the metrics the frame
// carries: hvpg, whvp, fhvp, ppg, ra, ivc, pvFlow, ascites). A number that differs by more than a tolerance is flagged as drift: the live model is
// not the settled one (a slider moved, a procedure done, or the model changed since snapshots.js was written).
// All numbers: pressures in mmHg, flows in mL/min (the snapshot holds the portal flow in L/min), ascites in mL.
//
// The pure parts (TOLERANCE, NUMBERS, snapshotRows, missingSnapshots, liveReading, compareSnapshot, tableText) have no DOM and are tested in node
// (tests/gallery-bench-model-table.test.js). mount only draws on open and on a tap; the one timer is a short setTimeout chain after a patient is
// loaded, cleared by dispose.
import { benchRoot, h, statusLine, ppsOf, copyButton } from './ui.js';
import { SNAPSHOTS, PATH } from '../../snapshots.js';
import { PRESETS } from '../../../engine/scenario.js';
import { NODES } from '../../../engine/topology.js';
import { HVPG_CUTS, PPG_CUTS, hvpgSev, ppgSev, PPG_LINE_NOTE } from '../../../engine/pressure-cuts.js';

/**
 * When a live number is "different from the snapshot": pressures by more than 0.5 mmHg; flows by more than 5 % (or the snapshot's own rounding step,
 * 10 mL/min: the portal flow is written to 0.01 L/min, so a flow of zero or a few hundred is not held to a smaller step than it was written with);
 * the ascites volume by more than 5 % (or 50 mL). The snapshot is one settled moment of a fresh load; a live model beats and breathes, so the flow is
 * the frame's own pvFlow, as the script reads it.
 */
export const TOLERANCE = Object.freeze({ pressureMmHg: 0.5, flowPct: 5, flowFloorMlMin: 10, volumePct: 5, volumeFloorMl: 50 });

const NODE_INDEX = Object.fromEntries(NODES.map((n, i) => [n.id, i]));
const finite = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const at = (arr, i) => (arr && i != null ? finite(Number(arr[i])) : null);

/**
 * The numbers of a patient, in the order the table lists them. kind: 'pressure' (mmHg), 'flow' (mL/min) or 'volume' (mL). snap(s) reads the snapshot
 * entry, live(frame) the live frame ({ P, Pf, metrics }); either gives null when the number is not there.
 */
export const NUMBERS = Object.freeze([
  ...PATH.map(([node, name], n) => ({ key: `P.${node}`, label: `${name} pressure`, unit: 'mmHg', kind: 'pressure',
    snap: (s) => finite(s?.P?.[n]), live: (f) => at(f?.Pf || f?.P, NODE_INDEX[node]) })),
  { key: 'whvp', label: 'WHVP (wedged hepatic venous pressure)', unit: 'mmHg', kind: 'pressure', snap: (s) => finite(s?.fp?.whvp), live: (f) => finite(f?.metrics?.whvp) },
  { key: 'fhvp', label: 'FHVP (free hepatic venous pressure)', unit: 'mmHg', kind: 'pressure', snap: (s) => finite(s?.fp?.fhvp), live: (f) => finite(f?.metrics?.fhvp) },
  { key: 'hvpg', label: 'HVPG (WHVP − FHVP)', unit: 'mmHg', kind: 'pressure', snap: (s) => finite(s?.hvpg ?? s?.fp?.hvpg), live: (f) => finite(f?.metrics?.hvpg), sev: hvpgSev },
  { key: 'ppg', label: 'PPG (PV − IVC)', unit: 'mmHg', kind: 'pressure', snap: (s) => finite(s?.fp?.ppg), live: (f) => finite(f?.metrics?.ppg), sev: ppgSev },
  { key: 'pvFlow', label: 'Portal vein flow', unit: 'mL/min', kind: 'flow',
    snap: (s) => (finite(s?.pvFlow) == null ? null : Math.round(s.pvFlow * 1000)), live: (f) => (finite(f?.metrics?.pvFlow) == null ? null : f.metrics.pvFlow * 1000) },
  { key: 'ascites', label: 'Ascites volume', unit: 'mL', kind: 'volume', snap: (s) => finite(s?.fp?.asc), live: (f) => finite(f?.metrics?.ascites?.volume) },
]);

/** One row per patient the engine has (PRESETS): { id, label, group, snap: the SNAPSHOTS entry | null, missing, summary }. A patient with no snapshot is listed as missing. */
export function snapshotRows(presets = PRESETS, snaps = SNAPSHOTS) {
  return presets.map((p) => {
    const snap = snaps[p.id] || null;
    const num = (key) => NUMBERS.find((x) => x.key === key).snap(snap);
    return { id: p.id, label: p.label, group: p.group, snap, missing: !snap,
      summary: snap ? { hvpg: num('hvpg'), ppg: num('ppg'), pv: finite(snap.pv), flow: num('pvFlow'), ascites: num('ascites') } : null };
  });
}
/** The ids of the patients that have no snapshot, and the snapshots that belong to no patient. */
export const missingSnapshots = (presets = PRESETS, snaps = SNAPSHOTS) => presets.filter((p) => !snaps[p.id]).map((p) => p.id);
export const orphanSnapshots = (presets = PRESETS, snaps = SNAPSHOTS) => Object.keys(snaps).filter((id) => !presets.some((p) => p.id === id));

const round3 = (v) => Math.round(v * 1000) / 1000 + 0;   // (+ 0: a tiny negative rounds to -0, which is printed and compared as 0)
/** The most a number may differ from its snapshot before it is drift, in its own unit, for a snapshot value. */
export function limitOf(kind, snapValue, tol = TOLERANCE) {
  const base = Math.abs(snapValue ?? 0);
  if (kind === 'pressure') return tol.pressureMmHg;
  if (kind === 'flow') return Math.max(tol.flowFloorMlMin, (tol.flowPct / 100) * base);
  return Math.max(tol.volumeFloorMl, (tol.volumePct / 100) * base);
}

/**
 * The live frame's numbers as the table reads them: { key: number | null } for every NUMBERS entry. frame is the store's frame
 * ({ P, Pf, metrics }); null (no frame yet) gives nulls.
 */
export function liveReading(frame) {
  return Object.fromEntries(NUMBERS.map((n) => [n.key, frame ? n.live(frame) : null]));
}

/**
 * Snapshot against live for one patient: snap is a SNAPSHOTS entry, live a frame ({ P, Pf, metrics }) or null. Rows: { key, label, unit, kind, snap,
 * live, diff (live − snap), limit, drift }. drift is true when |diff| is more than the limit; a number the live frame lacks is not drift (live null).
 * The result also has `drift` (any row), `drifted` (their keys) and `compared` (rows with both numbers).
 */
export function compareSnapshot(snap, live, tol = TOLERANCE) {
  const rows = NUMBERS.map((n) => {   // alloc-rare: a bench opening or a tap, never a frame
    const s = n.snap(snap), l = live ? n.live(live) : null;
    const diff = s == null || l == null ? null : round3(l - s);
    const limit = s == null ? null : limitOf(n.kind, s, tol);
    return { key: n.key, label: n.label, unit: n.unit, kind: n.kind, snap: s, live: l, diff, limit, drift: diff != null && Math.abs(diff) > limit };   // alloc-rare: a bench opening or a tap, never a frame
  });
  const drifted = rows.filter((r) => r.drift).map((r) => r.key);   // alloc-rare: a bench opening or a tap, never a frame
  return { rows, drift: drifted.length > 0, drifted, compared: rows.filter((r) => r.diff != null).length };   // alloc-rare: a bench opening or a tap, never a frame
}

/** A number as text: pressures to one decimal, mL/min and mL whole; null as an em dash. */
export function fmtNumber(v, kind) {
  if (v == null || !Number.isFinite(v)) return '—';
  return kind === 'pressure' ? v.toFixed(1) : String(Math.round(v));   // alloc-rare: a bench opening or a tap, never a frame
}
const signed = (d, kind) => (d == null ? '—' : `${d > 0 ? '+' : d < 0 ? '−' : ''}${fmtNumber(Math.abs(d), kind)}`);   // alloc-rare: a bench opening or a tap, never a frame
/** The limit as words: "0.5 mmHg", "5% (at least 10 mL/min)". */
export function limitText(kind, tol = TOLERANCE) {
  if (kind === 'pressure') return `${tol.pressureMmHg} mmHg`;   // alloc-rare: a bench opening or a tap, never a frame
  if (kind === 'flow') return `${tol.flowPct}% (at least ${tol.flowFloorMlMin} mL/min)`;   // alloc-rare: a bench opening or a tap, never a frame
  return `${tol.volumePct}% (at least ${tol.volumeFloorMl} mL)`;   // alloc-rare: a bench opening or a tap, never a frame
}

/** The comparison as tab-separated text, with a header naming the patient and whether the live numbers are for it. */
export function tableText(label, cmp, liveNote, tol = TOLERANCE) {
  const head = ['number', 'unit', 'snapshot', 'live', 'difference', 'allowed', 'drift'].join('\t');   // alloc-rare: a bench opening or a tap, never a frame
  const body = cmp.rows.map((r) => [r.label, r.unit, fmtNumber(r.snap, r.kind), fmtNumber(r.live, r.kind), signed(r.diff, r.kind), limitText(r.kind, tol), r.drift ? 'DRIFT' : r.diff == null ? '' : 'ok'].join('\t'));   // alloc-rare: a bench opening or a tap, never a frame
  return [`Model table: ${label}`, liveNote, '', head, ...body, '', cmp.drift ? `Drift in ${cmp.drifted.length} number${cmp.drifted.length > 1 ? 's' : ''}: ${cmp.drifted.join(', ')}` : cmp.compared ? 'No drift: every compared number is within its allowed difference.' : 'Nothing compared.'].join('\n');   // alloc-rare: a bench opening or a tap, never a frame
}

/** The patients' overview as tab-separated text (one row each, snapshot numbers). */
export function overviewText(rows) {
  const head = ['patient', 'group', 'HVPG (mmHg)', 'PPG (PV − IVC) (mmHg)', 'PV (mmHg)', 'portal flow (mL/min)', 'ascites (mL)'].join('\t');   // alloc-rare: a bench opening or a tap, never a frame
  return [head, ...rows.map((r) => [r.label, r.group, ...(r.summary ? [fmtNumber(r.summary.hvpg, 'pressure'), fmtNumber(r.summary.ppg, 'pressure'), fmtNumber(r.summary.pv, 'pressure'), fmtNumber(r.summary.flow, 'flow'), fmtNumber(r.summary.ascites, 'volume')] : ['no snapshot', '', '', '', ''])].join('\t'))].join('\n');   // alloc-rare: a bench opening or a tap, never a frame
}

const TONE = { ok: 'gb-ok', caution: 'gb-warn', danger: 'gb-bad' };
const RECHECK_MS = [1000, 2500];   // after a load: the first re-read, then a second a little later (the live model settles)

export default {
  id: 'model-table',
  title: 'Model table',
  mount(host, ctx) {
    const pps = ppsOf(ctx);
    benchRoot(host, 'Model table', 'Each patient\'s settled numbers from the model\'s snapshot file, and the live model\'s numbers for the patient that is loaded. A number that differs by more than the allowed difference is flagged as drift.');
    const say = statusLine();
    const rows = snapshotRows();
    let selected = null, gone = false, timers = [];

    const loaded = () => { try { return pps?.store?.get?.() || null; } catch { return null; } };
    const loadedId = () => loaded()?.presetId ?? null;
    const frame = () => loaded()?.frame || null;
    selected = rows.some((r) => r.id === loadedId()) ? loadedId() : rows[0]?.id;

    const picker = h('select', { 'aria-label': 'Patient' }, rows.map((r) => h('option', { value: r.id }, `${r.label} (${r.group})`)));
    picker.value = selected;
    picker.addEventListener('change', () => { selected = picker.value; draw(); });
    const detailBody = h('tbody'), detailNote = h('p', { class: 'gb-note' }), summary = h('p', null);
    const overBody = h('tbody');
    let lastText = '';

    function clear() { for (const t of timers) clearTimeout(t); timers = []; }
    function reread() { if (!gone) draw(); }
    function load(id) {
      if (typeof pps?.loadPreset !== 'function') { say.set('The app\'s loadPreset is not available here.', 'bad'); return; }
      selected = id; picker.value = id; say.set('Loading the patient...', 'warn'); clear();
      Promise.resolve(pps.loadPreset(id)).then(() => {
        // (a timeout chain, not an interval: the first re-read a second after the load, then once more as the model settles)
        let n = 0;
        const next = () => { if (gone || n >= RECHECK_MS.length) return; timers.push(setTimeout(() => { reread(); n++; next(); }, RECHECK_MS[n] - (n ? RECHECK_MS[n - 1] : 0))); };   // alloc-rare: a bench opening or a tap, never a frame
        next();
      }).catch((err) => { say.set(`The patient would not load: ${err?.message || err}`, 'bad'); });
    }

    function draw() {
      const row = rows.find((r) => r.id === selected);   // alloc-rare: a bench opening or a tap, never a frame
      const isLoaded = loadedId() === selected, fr = isLoaded ? frame() : null;
      const cmp = compareSnapshot(row?.snap, fr);
      // ---- the detail table ----
      detailBody.replaceChildren(...cmp.rows.map((r) => h('tr', null,   // alloc-rare: a bench opening or a tap, never a frame
        h('td', null, r.label), h('td', null, r.unit),
        h('td', { class: (NUMBERS.find((n) => n.key === r.key).sev && r.snap != null) ? TONE[NUMBERS.find((n) => n.key === r.key).sev(r.snap)] : '' }, fmtNumber(r.snap, r.kind)),   // alloc-rare: a bench opening or a tap, never a frame
        h('td', null, fmtNumber(r.live, r.kind)), h('td', null, signed(r.diff, r.kind)),
        h('td', { class: 'gb-note' }, r.snap == null ? '' : limitText(r.kind)),   // alloc-rare: a bench opening or a tap, never a frame
        h('td', { class: r.drift ? 'gb-bad' : r.diff != null ? 'gb-ok' : '' }, r.drift ? 'DRIFT' : r.diff != null ? 'ok' : ''))));   // alloc-rare: a bench opening or a tap, never a frame
      const liveNote = !row ? 'No patient.' : row.missing ? 'This patient has no snapshot yet (node scripts/snapshots.mjs writes them).'
        : !loadedId() ? 'No patient is loaded in the app, or the app is not here.' : isLoaded ? (fr ? 'Live numbers are for this patient (the loaded one).' : 'This patient is loaded but the model has sent no frame yet.')
          : `The loaded patient is ${rows.find((r) => r.id === loadedId())?.label ?? loadedId()}; press "Load this patient" to compare this one.`;   // alloc-rare: a bench opening or a tap, never a frame
      detailNote.textContent = liveNote;
      summary.className = cmp.drift ? 'gb-warn' : cmp.compared ? 'gb-ok' : 'gb-note';
      summary.textContent = cmp.drift ? `Drift in ${cmp.drifted.length} of ${cmp.compared} compared numbers.` : cmp.compared ? `No drift: ${cmp.compared} numbers within the allowed difference.` : 'Nothing compared yet.';   // alloc-rare: a bench opening or a tap, never a frame
      lastText = `${tableText(row?.label ?? '', cmp, liveNote)}\n\n${overviewText(rows)}`;   // alloc-rare: a bench opening or a tap, never a frame
      // ---- the overview, one row per patient ----
      overBody.replaceChildren(...rows.map((r) => {   // alloc-rare: a bench opening or a tap, never a frame
        const here = loadedId() === r.id;
        const sumCmp = here && frame() ? compareSnapshot(r.snap, frame()) : null;
        const s = r.summary;
        return h('tr', { class: r.id === selected ? 'on' : '' },   // alloc-rare: a bench opening or a tap, never a frame
          h('td', null, h('button', { type: 'button', onclick: () => { selected = r.id; picker.value = r.id; draw(); } }, r.label)), h('td', null, r.group),   // alloc-rare: a bench opening or a tap, never a frame
          s ? [h('td', { class: TONE[hvpgSev(s.hvpg)] }, fmtNumber(s.hvpg, 'pressure')), h('td', { class: TONE[ppgSev(s.ppg)] }, fmtNumber(s.ppg, 'pressure')), h('td', null, fmtNumber(s.pv, 'pressure')), h('td', null, fmtNumber(s.flow, 'flow')), h('td', null, fmtNumber(s.ascites, 'volume'))]   // alloc-rare: a bench opening or a tap, never a frame
            : h('td', { colspan: 5, class: 'gb-warn' }, 'no snapshot'),   // alloc-rare: a bench opening or a tap, never a frame
          h('td', { class: sumCmp ? (sumCmp.drift ? 'gb-bad' : 'gb-ok') : 'gb-note' }, here ? (sumCmp ? (sumCmp.drift ? `loaded, drift (${sumCmp.drifted.length})` : 'loaded, no drift') : 'loaded') : ''),   // alloc-rare: a bench opening or a tap, never a frame
          h('td', null, h('button', { type: 'button', onclick: () => load(r.id) }, 'Load this patient')));   // alloc-rare: a bench opening or a tap, never a frame
      }));
    }

    const missing = missingSnapshots(), orphans = orphanSnapshots();
    host.append(
      say,
      h('p', { class: 'gb-note' }, `Allowed difference: ${limitText('pressure')} for pressures, ${limitText('flow')} for flows, ${limitText('volume')} for ascites. HVPG is amber above ${HVPG_CUTS.amber} and red from ${HVPG_CUTS.red} mmHg; PPG amber from ${PPG_CUTS.amber} and red from ${PPG_CUTS.red} mmHg. ${PPG_LINE_NOTE}`),
      missing.length ? h('p', { class: 'gb-warn' }, `No snapshot for: ${missing.join(', ')}.`) : h('p', { class: 'gb-ok' }, `Every patient (${rows.length}) has a snapshot.`),
      orphans.length ? h('p', { class: 'gb-warn' }, `Snapshots with no patient: ${orphans.join(', ')}.`) : null,
      h('h3', null, 'Every patient (snapshot, settled)'),
      h('table', null, h('thead', null, h('tr', null, ['Patient', 'Group', 'HVPG (mmHg)', 'PPG (PV − IVC) (mmHg)', 'PV (mmHg)', 'Portal flow (mL/min)', 'Ascites (mL)', 'Live', ''].map((c) => h('th', null, c)))), overBody),
      h('h3', null, 'One patient, snapshot against live'),
      h('div', { class: 'gb-row' }, picker, h('button', { type: 'button', onclick: () => { draw(); say.set('Read again.', 'ok'); } }, 'Read live again'), h('button', { type: 'button', onclick: () => load(selected) }, 'Load this patient')),
      summary, detailNote,
      h('table', null, h('thead', null, h('tr', null, ['Number', 'Unit', 'Snapshot', 'Live', 'Difference', 'Allowed', 'Drift'].map((c) => h('th', null, c)))), detailBody),
      h('div', { class: 'gb-row' }, copyButton('Copy table', () => lastText, (m, t) => say.set(m, t), ctx)),
    );
    draw();
    return () => { gone = true; clear(); };
  },
};
