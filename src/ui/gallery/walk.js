// The phone check's runner (19 Nov 2026): walks the journeys of journeys.js one step at a time on the device in hand, reads what the page holds after every step
// (the GPU estimate, its highest, the live contexts, who grew), and builds ONE report. The point is the order of things, not each card alone: the iPhone's tab
// kills came from a path (Tests pane to pane, a deck's slide 5 to 6), so the memory is read along the path, and the kill is named by the step it ended on.
// Pure promises and plain data: no DOM, no layout read, no page import. walk-exec.js plays a step on the real page, phone-check-panel.js is the button, the
// overlay and the clock; a unit test hands in fakes (tests/gallery-walk.test.js). Nothing here runs per frame: one await per step.
//
// io   { exec(step) -> { ok?, settled?, error? }      plays a step and waits until the page is still
//        read() -> { mb, peak, own, charts, live, lost, unmet, owners: [{ owner, mb }], heap }     what the page holds now (gpu-budget.js, gl-contexts.js)
//        judge() -> { problems: [{ kind, text, where }], findings: [{ rule, what, where, owner }] }     the fit rules and the self-check rules, at a stop
//        errors() -> number                           the app's counted errors so far (pps.caught)
//        errorTags() -> { tag: { n, last } }          the same by tag, with the last message (caught.js caughtNow), so the report can print the words
//        now(), wall(), storage, onProgress(p), shouldStop() }       all optional
// opts { deadlineMs, maxKills, fresh, envelope: { mb } }
//
// Resume. The place is kept in storage (sessionStorage) BEFORE each step starts and again after it. A reload that finds a step still open means the browser ended
// the tab on that step: it is the finding ("TAB ENDED on step k of journey J, after these steps, holding N MB at the last read"). The page that comes back is empty,
// so the journey that died is not repeated from the middle; the check goes on with the next journey from a clean page. After MAX_KILLS the check stops and reports.

export const WALK_KEY = 'pps.phonecheck';
export const MAX_KILLS = 3;
export const DEADLINE_MS = 200000;     // the soft limit: no journey starts after this much time (a journey that has started finishes); the report says what it dropped
export const NEAR_SHARE = 0.85;        // holding this share of the envelope is "near" it (the memory loop's own line)
export const LIMIT_SHARE = 0.92;       // and this share is "at the limit": the next instrument is the kill (the node path walker's own gate, tests/gpu-journeys.test.js: no peak above 92%)
export const REST_SHARE = 0.6;         // the page at rest, before a path begins, should hold no more than this (the same gate)
export const JUMP_MB = 25;             // one step that adds this much names the owners that grew
export const KEPT_MB = 15;             // a journey that ends this much above where it began, with everything put away, kept it
export const CTX_LIVE_WARN = 12;       // gl-contexts.js WARN_AT is 14 of about 16
export const OWNER_MB = 5;             // an owner holding this much is named on a step's line
export const CTX_OWN_MAX = 2;          // gpu-budget.js CTX_MAX
const STALE_MS = 15 * 60 * 1000;   // (a reload after a kill comes in seconds; an older place is another sitting)

const f0 = (x) => (Number.isFinite(x) ? Math.round(x) : '?');
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '?');
const pct = (x) => (Number.isFinite(x) ? `${Math.round(x * 100)}%` : '?');
const sig = (journeys) => journeys.map((j) => `${j.id}:${j.steps.length}`).join('|');

/** What grew between two owner lists ([{ owner, mb }]): [{ owner, mb }] of the owners that gained at least `min` MB, biggest first. */
export function grewOwners(before, after, min = 2) {
  const was = new Map((before || []).map((o) => [o.owner, o.mb]));
  return (after || []).map((o) => ({ owner: o.owner, mb: +(o.mb - (was.get(o.owner) || 0)).toFixed(1) })).filter((o) => o.mb >= min).sort((a, b) => b.mb - a.mb).slice(0, 4);
}

/** The flags one step earns, from its row and the row before it in the journey: [{ kind, sev: 'bad' | 'warn', text }]. Pure. */
export function flagsFor(row, prev, { envelopeMb, ctxOwnMax = CTX_OWN_MAX } = {}) {
  const out = [];
  if (row.error) out.push({ kind: 'failed', sev: 'bad', text: `the step failed: ${row.error}` });
  else if (row.settled === false) out.push({ kind: 'unsettled', sev: 'warn', text: 'the page was still moving when the wait ended' });
  const share = envelopeMb > 0 ? row.mb / envelopeMb : NaN;
  if (share >= 1) out.push({ kind: 'over', sev: 'bad', text: `${f0(row.mb)} MB is over the ${envelopeMb} MB envelope` });
  else if (share >= LIMIT_SHARE) out.push({ kind: 'limit', sev: 'bad', text: `${f0(row.mb)} MB is ${pct(share)} of the ${envelopeMb} MB envelope: ${f0(envelopeMb - row.mb)} MB of room` });
  else if (share >= NEAR_SHARE) out.push({ kind: 'near', sev: 'warn', text: `${f0(row.mb)} MB is ${pct(share)} of the envelope` });
  if (prev && Number.isFinite(row.mb) && Number.isFinite(prev.mb) && row.mb - prev.mb >= JUMP_MB) {
    const g = row.grew?.length ? `: ${row.grew.map((o) => `${o.owner} +${f0(o.mb)}`).join(', ')}` : '';
    out.push({ kind: 'jump', sev: 'warn', text: `this step added ${f0(row.mb - prev.mb)} MB${g}` });
  }
  if (row.maxShare > 0 && share > row.maxShare) out.push({ kind: 'gate', sev: 'bad', text: `${f0(row.mb)} MB is ${pct(share)} of the envelope; this step's gate is ${pct(row.maxShare)}` });
  if (row.unmet > 0) out.push({ kind: 'unmet', sev: 'bad', text: `the budget could not free ${f1(row.unmet)} MB it needed (holdersNow().unmetMB): the next instrument is over` });
  if (row.live >= CTX_LIVE_WARN) out.push({ kind: 'contexts', sev: 'bad', text: `${row.live} live WebGL contexts (the browser drops the oldest near 16)` });
  else if (row.own > ctxOwnMax) out.push({ kind: 'contexts', sev: 'warn', text: `${row.own} of the page's own contexts live (budget ${ctxOwnMax}, plus ${row.charts} for charts)` });
  if (prev && row.lost > (prev.lost || 0)) out.push({ kind: 'ctx-lost', sev: 'bad', text: `${row.lost - prev.lost} WebGL context${row.lost - prev.lost === 1 ? '' : 's'} lost on this step (the browser took one back)` });
  if (row.errors > 0) out.push({ kind: 'errors', sev: 'warn', text: `${row.errors} error${row.errors === 1 ? '' : 's'} counted (pps.caught)` });
  return out;
}

function read(storage, id, fresh, wall) {
  if (!storage || fresh) return null;
  try {
    const s = JSON.parse(storage.getItem(WALK_KEY) || 'null');
    if (!s || s.sig !== id || s.state !== 'running' || wall - s.wall > STALE_MS) return null;
    return s;
  } catch { return null; }
}
function save(storage, s) { try { storage?.setItem(WALK_KEY, JSON.stringify(s)); } catch { /* (storage full or refused: the check still runs, it just cannot resume) */ } }
/** A check the storage holds that was running when the page went away, or null. */
export function savedWalk(storage, wall = Date.now()) {
  try { const s = JSON.parse(storage?.getItem(WALK_KEY) || 'null'); return s && s.state === 'running' && wall - s.wall < STALE_MS ? s : null; } catch { return null; }
}
export function forgetWalk(storage) { try { storage?.removeItem(WALK_KEY); } catch { /* (nothing to forget) */ } }

/** Runs the journeys. Resolves with buildWalkReport's object. Never rejects: a step that throws is a row with `error`. */
export async function runWalk(journeys, io, opts = {}) {
  const now = io.now || (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  const wall = io.wall || (() => Date.now());
  const storage = io.storage || null;
  const envelopeMb = opts.envelope?.mb ?? 320;
  const maxKills = opts.maxKills ?? MAX_KILLS;
  const deadline = opts.deadlineMs === 0 || opts.deadlineMs === Infinity ? Infinity : opts.deadlineMs ?? DEADLINE_MS;
  const id = sig(journeys);
  const saved = read(storage, id, opts.fresh, wall());
  const t0 = now();
  const st = saved || { sig: id, state: 'running', rows: [], events: [], kills: 0, resumes: 0, elapsed: 0, jStart: {}, next: { j: 0, i: 0 }, open: null, wall: wall() };
  if (saved) {
    st.resumes = (saved.resumes || 0) + 1;
    if (st.open) {
      // The page went away while this step was open: that is the finding.
      const { j, i } = st.open, jr = journeys[j];
      const path = st.rows.filter((r) => r.j === j).map((r) => r.label);
      const last = st.rows.filter((r) => r.j === j).at(-1) || null;
      st.events.push({ type: 'kill', j, i, journey: jr?.id, label: st.open.label, path, last: last ? { mb: last.mb, peak: last.peak, own: last.own, charts: last.charts, live: last.live, label: last.label } : null, wasMb: st.open.mb ?? null });
      st.kills++;
      st.next = { j: j + 1, i: 0 };   // (a clean page: the journey that died is not played again from the middle)
      st.open = null;
    }
  }
  const base = st.elapsed || 0;
  const elapsed = () => base + (now() - t0);
  const persist = () => { st.elapsed = elapsed(); st.wall = wall(); save(storage, st); };
  persist();
  let stopped = false, dropped = [];
  let errBefore = io.errors?.() ?? 0;
  let tagsBefore = {};
  try { tagsBefore = io.errorTags?.() || {}; } catch { /* (no tag list) */ }

  for (let j = st.next.j; j < journeys.length; j++) {
    const jr = journeys[j];
    if (st.kills >= maxKills) { dropped = journeys.slice(j).map((x) => x.id); st.events.push({ type: 'stopped', why: `the tab was ended ${st.kills} times` }); break; }
    if (io.shouldStop?.()) { stopped = true; dropped = journeys.slice(j).map((x) => x.id); break; }
    if (elapsed() > deadline && st.next.i === 0) { dropped = journeys.slice(j).map((x) => x.id); st.events.push({ type: 'deadline', ms: Math.round(elapsed()), dropped }); break; }
    const start = st.next.j === j ? st.next.i : 0;
    let prev = null, first = null;
    try { prev = await io.read(); first = prev; } catch { /* (a page whose registry is not up reads nothing) */ }
    if (start === 0) st.jStart[jr.id] = { mb: first?.mb ?? null, owners: first?.owners || [], at: Math.round(elapsed()) };
    for (let i = start; i < jr.steps.length; i++) {
      if (io.shouldStop?.()) { stopped = true; break; }
      const step = jr.steps[i];
      st.open = { j, i, label: step.label, mb: prev?.mb ?? null }; st.next = { j, i }; persist();
      io.onProgress?.({ journey: jr, j, of: journeys.length, i, step, elapsed: elapsed(), rows: st.rows });
      const t1 = now();
      const row = { j, journey: jr.id, i, op: step.op, label: step.label, ok: true, settled: true, ms: 0, mb: NaN, peak: NaN, own: 0, charts: 0, live: 0, lost: 0, grew: [], unmet: 0, maxShare: step.maxShare || 0, errors: 0, errorTags: [], big: [], judgeMs: 0, problems: [], findings: [], flags: [] };
      try {
        const r = await io.exec(step);
        if (r?.ok === false) { row.ok = false; row.error = String(r.error || 'the step did not land'); }
        if (r?.settled === false) row.settled = false;
      } catch (err) { row.ok = false; row.error = String(err?.message || err); }
      row.ms = Math.round(now() - t1);
      let cur = null;
      try { cur = await io.read(); } catch { /* (no registry) */ }
      if (cur) { Object.assign(row, { mb: cur.mb, peak: cur.peak, own: cur.own, charts: cur.charts, live: cur.live, lost: cur.lost, unmet: cur.unmet || 0, heap: cur.heap ?? null, owners: cur.owners || [] }); row.grew = grewOwners(prev?.owners, cur.owners); }
      const e = io.errors?.() ?? 0; row.errors = Math.max(0, e - errBefore); errBefore = e;
      if (row.errors > 0) {
        try {
          const now2 = io.errorTags?.() || {};
          row.errorTags = Object.entries(now2).filter(([k, v]) => v.n > (tagsBefore[k]?.n || 0)).map(([k, v]) => ({ tag: k, n: v.n - (tagsBefore[k]?.n || 0), last: String(v.last ?? '').slice(0, 160) }));
          tagsBefore = now2;
        } catch { /* (the tag list is a nicety) */ }
      }
      row.big = (cur?.owners || []).filter((o) => o.mb >= OWNER_MB).slice(0, 5).map((o) => ({ owner: o.owner, mb: Math.round(o.mb) }));
      if (cur && i === jr.steps.length - 1) row.holders = (cur.holders || []).filter((h) => h.mb > 0).slice(0, 8);
      if (step.judge !== false && io.judge && row.ok) {
        const tj = now();
        try { const jd = await io.judge(); row.problems = (jd?.problems || []).map((p) => ({ kind: p.kind, text: p.text, where: p.where })); row.findings = (jd?.findings || []).map((f) => ({ rule: f.rule, what: f.what, where: f.where, owner: f.owner })); } catch (err) { row.findingsError = String(err?.message || err); }
        row.judgeMs = Math.round(now() - tj);
      }
      row.flags = flagsFor(row, prev, { envelopeMb });
      if (cur) prev = cur;
      st.rows.push(row); st.open = null; st.next = { j, i: i + 1 }; persist();
    }
    if (stopped) { dropped = journeys.slice(j + 1).map((x) => x.id); break; }
    st.next = { j: j + 1, i: 0 }; persist();
  }

  const report = buildWalkReport({ journeys, rows: st.rows, events: st.events, jStart: st.jStart, dropped, stopped, kills: st.kills, resumes: st.resumes, ms: Math.round(elapsed()), envelopeMb, when: opts.when || new Date().toLocaleString(), info: opts.info || {} });
  st.state = stopped ? 'stopped' : 'done'; st.open = null; persist();
  io.onProgress?.({ finished: true, report, rows: st.rows });
  return report;
}

/** Groups what the judges said over many stops: the same words at several stops are one line with the stops counted. [{ text, where, n, first, kind }]. */
export function groupProblems(rows) {
  const m = new Map();
  for (const r of rows) {
    for (const p of r.problems || []) { const k = `fit|${p.kind}|${p.text}`; const g = m.get(k) || { kind: `fit ${p.kind}`, text: p.text, where: p.where, n: 0, first: r.label }; g.n++; m.set(k, g); }
    for (const f of r.findings || []) { const k = `rule|${f.rule}|${f.what}|${f.where}`; const g = m.get(k) || { kind: `rule ${f.rule}`, text: `${f.what}${f.where ? `: ${f.where}` : ''}`, owner: f.owner, n: 0, first: r.label }; g.n++; m.set(k, g); }
  }
  return [...m.values()];
}

/** The report as data with `text` (what Copy puts on the clipboard) and `summary`. */
export function buildWalkReport({ journeys = [], rows = [], events = [], jStart = {}, dropped = [], stopped = false, kills = 0, resumes = 0, ms = 0, envelopeMb = 320, when = '', info = {} }) {
  const kill = events.filter((e) => e.type === 'kill');
  const peakRow = rows.filter((r) => Number.isFinite(r.mb)).sort((a, b) => b.mb - a.mb)[0] || null;
  const peakSeen = Math.max(0, ...rows.map((r) => (Number.isFinite(r.peak) ? r.peak : 0)));
  const failed = rows.filter((r) => r.error);
  const unsettled = rows.filter((r) => r.ok && r.settled === false);
  const limit = rows.filter((r) => r.flags.some((f) => f.kind === 'limit' || f.kind === 'over'));
  const near = rows.filter((r) => r.flags.some((f) => f.kind === 'near'));
  const jumps = rows.filter((r) => r.flags.some((f) => f.kind === 'jump'));
  const ctx = rows.filter((r) => r.flags.some((f) => f.kind === 'contexts' || f.kind === 'ctx-lost'));
  const gated = rows.filter((r) => r.flags.some((f) => f.kind === 'gate' || f.kind === 'unmet') && !limit.includes(r));
  const rest = journeys.filter((x) => Number.isFinite(jStart[x.id]?.mb) && jStart[x.id].mb / envelopeMb > REST_SHARE && rows.some((r) => r.journey === x.id));
  const errs = rows.filter((r) => r.errors > 0);
  const problems = groupProblems(rows);
  const byJ = new Map(journeys.map((j) => [j.id, j]));
  const jr = journeys.map((j) => {
    const rs = rows.filter((r) => r.journey === j.id);
    const last = rs.at(-1), s = jStart[j.id];
    const kept = last && s && Number.isFinite(last.mb) && Number.isFinite(s.mb) ? last.mb - s.mb : null;
    return { id: j.id, title: j.title, steps: j.steps.length, done: rs.length, startMb: s?.mb ?? null, endMb: last?.mb ?? null, maxMb: Math.max(-Infinity, ...rs.map((r) => r.mb).filter(Number.isFinite)), kept, ms: rs.reduce((n, r) => n + r.ms + r.judgeMs, 0), keptOwners: last && s ? grewOwners(s.owners, last.owners, 3) : [] };
  });
  const kept = jr.filter((x) => x.kept !== null && x.kept >= KEPT_MB && x.done === x.steps);
  const summary = { steps: rows.length, journeys: jr.filter((x) => x.done).length, killed: kill.length, atLimit: limit.length, near: near.length, jumps: jumps.length, contexts: ctx.length, gated: gated.length, rest: rest.length, failed: failed.length, unsettled: unsettled.length,
    problems: problems.length, errors: errs.length, kept: kept.length, dropped: dropped.length, peakMb: peakSeen || null, peakAt: peakRow ? peakRow.label : null, envelopeMb, ms };
  const hard = kill.length + limit.length + failed.length + ctx.length + gated.length;
  const bigTxt = (r) => (r.big?.length ? `; holding ${r.big.map((o) => `${o.owner} ${o.mb}`).join(', ')}` : '');
  const lines = [];
  lines.push(`Phone check: ${info.device || 'this device'}${info.look ? `, ${info.look} look` : ''}${info.build ? `, build ${info.build}` : ''}`);
  lines.push([when, `${Math.floor(ms / 60000)} min ${Math.round((ms % 60000) / 1000)} s`, `${rows.length} steps in ${summary.journeys} paths`, info.rate ? `test clock x${info.rate}` : info.rate === 0 ? 'real time (the test clock did not start)' : '', resumes ? `resumed ${resumes} time${resumes === 1 ? '' : 's'} after the tab ended` : ''].filter(Boolean).join(', '));
  lines.push('');
  if (!rows.length && !kill.length) lines.push('Nothing was walked.');
  else if (!hard && !problems.length && !kept.length && !rest.length && !unsettled.length && !errs.length && !near.length && !dropped.length) lines.push(`ALL CLEAR: no tab ended, no step above ${pct(NEAR_SHARE)} of the ${envelopeMb} MB envelope, no fit or self-check problem, nothing kept after closing.`);
  else lines.push(`${hard ? 'PROBLEMS' : 'WATCH'}: ${[kill.length && `${kill.length} tab ended`, limit.length && `${limit.length} step${limit.length === 1 ? '' : 's'} at the memory limit`, gated.length && `${gated.length} over a step's own gate`, rest.length && `rest above ${pct(REST_SHARE)} on ${rest.length} path${rest.length === 1 ? '' : 's'}`, ctx.length && `${ctx.length} on contexts`, failed.length && `${failed.length} step${failed.length === 1 ? '' : 's'} failed`, kept.length && `${kept.length} path${kept.length === 1 ? '' : 's'} kept memory`, problems.length && `${problems.length} fit or self-check finding${problems.length === 1 ? '' : 's'}`, near.length && `${near.length} step${near.length === 1 ? '' : 's'} above ${pct(NEAR_SHARE)}`, unsettled.length && `${unsettled.length} did not settle`, errs.length && `${errs.length} with errors`, dropped.length && `${dropped.length} path${dropped.length === 1 ? '' : 's'} not walked (time)`].filter(Boolean).join(', ')}`);
  if (peakRow) lines.push(`GPU memory: highest read ${f0(peakRow.mb)} MB of ${envelopeMb} (${pct(peakRow.mb / envelopeMb)}) at "${peakRow.journey} > ${peakRow.label}"; the page's own highest mark ${f0(peakSeen)} MB`);

  for (const k of kill) {
    lines.push('', `THE TAB WAS ENDED by the browser on "${byJ.get(k.journey)?.title || k.journey}", step ${k.i + 1}: ${k.label}`);
    if (k.last) lines.push(`  Last read before it: ${f0(k.last.mb)} MB (${pct(k.last.mb / envelopeMb)}), contexts ${k.last.own}+${k.last.charts}, after "${k.last.label}"`);
    if (k.path?.length) lines.push(`  Steps before it on this path: ${k.path.join(' > ')}`);
  }
  if (limit.length) {
    lines.push('', `AT THE LIMIT (${LIMIT_SHARE * 100}% of ${envelopeMb} MB or more):`);
    for (const r of limit.slice(0, 12)) lines.push(`  - ${r.journey} > ${r.label}: ${f0(r.mb)} MB${r.grew.length ? `; grew ${r.grew.map((o) => `${o.owner} +${f0(o.mb)}`).join(', ')}` : ''}${bigTxt(r)}`);
    if (limit.length > 12) lines.push(`  ... and ${limit.length - 12} more`);
  }
  if (gated.length) {
    lines.push('', 'OVER A STEP\'S OWN GATE (or the budget could not free what it needed):');
    for (const r of gated.slice(0, 10)) lines.push(`  - ${r.journey} > ${r.label}: ${r.flags.filter((f) => f.kind === 'gate' || f.kind === 'unmet').map((f) => f.text).join('; ')}${bigTxt(r)}`);
  }
  if (rest.length) {
    lines.push('', `REST (before a path began, with nothing open; the gate is ${pct(REST_SHARE)} of the envelope):`);
    for (const x of rest.slice(0, 6)) lines.push(`  - before "${x.title}": ${f0(jStart[x.id].mb)} MB (${pct(jStart[x.id].mb / envelopeMb)})${jStart[x.id].owners?.length ? `; ${jStart[x.id].owners.slice(0, 3).map((o) => `${o.owner} ${f0(o.mb)}`).join(', ')}` : ''}`);
  }
  const jmp = jumps.filter((r) => !limit.includes(r));
  if (jmp.length) {
    lines.push('', 'BIG STEPS (one step added 25 MB or more):');
    for (const r of jmp.slice(0, 10)) lines.push(`  - ${r.journey} > ${r.label}: ${r.flags.find((f) => f.kind === 'jump').text}${bigTxt(r)}`);
  }
  const ctxOnly = ctx.filter((r) => !limit.includes(r));
  if (ctxOnly.length) {
    lines.push('', 'CONTEXTS:');
    for (const r of ctxOnly.slice(0, 10)) lines.push(`  - ${r.journey} > ${r.label}: ${r.flags.filter((f) => f.kind === 'contexts' || f.kind === 'ctx-lost').map((f) => f.text).join('; ')}${bigTxt(r)}`);
  }
  if (kept.length) {
    lines.push('', 'KEPT AFTER CLOSING (memory at the end of a path, with everything put away, above where it began):');
    for (const x of kept) lines.push(`  - ${x.title}: ${f0(x.startMb)} to ${f0(x.endMb)} MB (+${f0(x.kept)})${x.keptOwners.length ? `; ${x.keptOwners.map((o) => `${o.owner} +${f0(o.mb)}`).join(', ')}` : ''}`);
  }
  if (failed.length) { lines.push('', 'STEPS THAT FAILED:'); for (const r of failed.slice(0, 15)) lines.push(`  - ${r.journey} > ${r.label}: ${r.error}`); }
  if (problems.length) {
    lines.push('', 'FIT AND SELF-CHECK (the same words at several stops are one line):');
    for (const p of problems.slice(0, 40)) lines.push(`  - [${p.kind}] ${p.text}${p.n > 1 ? ` (${p.n} stops)` : ''}; first at "${p.first}"${p.owner ? `; owner ${p.owner}` : ''}`);
    if (problems.length > 40) lines.push(`  ... and ${problems.length - 40} more`);
  }
  if (errs.length) {
    // (Once per distinct tag, with the words the app last caught under it and the first step it appeared on: from the words, an error of the app is told from the walker's own.)
    const tags = new Map();
    for (const r of errs) {
      if (!r.errorTags?.length) { const t = tags.get('(no tag)') || { tag: '(no tag)', n: 0, last: '', first: r.label, steps: 0 }; t.n += r.errors; t.steps++; tags.set('(no tag)', t); continue; }
      for (const e of r.errorTags) { const t = tags.get(e.tag) || { tag: e.tag, n: 0, last: '', first: `${r.journey} > ${r.label}`, steps: 0 }; t.n += e.n; t.steps++; t.last = e.last || t.last; tags.set(e.tag, t); }
    }
    lines.push('', `ERRORS COUNTED (pps.caught): ${[...tags.values()].reduce((n, t) => n + t.n, 0)} on ${errs.length} step${errs.length === 1 ? '' : 's'}, ${tags.size} distinct tag${tags.size === 1 ? '' : 's'}:`);
    for (const t of [...tags.values()].slice(0, 20)) lines.push(`  - ${t.tag}: ${t.last ? `"${t.last.slice(0, 160)}"` : '(no message)'} (${t.n}x on ${t.steps} step${t.steps === 1 ? '' : 's'}); first on ${t.first}`);
  }
  if (unsettled.length) lines.push('', `DID NOT SETTLE (still moving when the wait ended): ${unsettled.slice(0, 12).map((r) => `${r.journey} > ${r.label}`).join('; ')}${unsettled.length > 12 ? `; and ${unsettled.length - 12} more` : ''}`);
  if (near.length && !limit.length) lines.push('', `Above ${pct(NEAR_SHARE)} of the envelope on ${near.length} step${near.length === 1 ? '' : 's'}; the first is "${near[0].journey} > ${near[0].label}" at ${f0(near[0].mb)} MB.`);
  if (dropped.length) lines.push('', `NOT WALKED (${stopped ? 'stopped' : 'out of time'}): ${dropped.map((d) => byJ.get(d)?.title || d).join('; ')}`);
  lines.push('', 'PATHS (memory at the start, the highest read, the end; kept = end minus start):');
  for (const x of jr) if (x.done) lines.push(`  ${x.id.padEnd(17)} ${String(x.done).padStart(3)}/${x.steps} steps  ${f0(x.startMb)} > ${f0(x.maxMb)} > ${f0(x.endMb)} MB  kept ${x.kept === null ? '?' : `${x.kept >= 0 ? '+' : ''}${f0(x.kept)}`}  ${(x.ms / 1000).toFixed(0)} s`);
  const held = rows.filter((r) => r.holders?.length);
  if (held.length) {
    lines.push('', 'SOFT HOLDERS at the end of each path (what the budget keeps for later and could give back; holdersNow().list):');
    for (const r of held) lines.push(`  ${r.journey}: ${r.holders.map((h) => `${h.owner} ${h.kind} ${f1(h.mb)} MB`).join(', ')}`);
  }
  if (info.steps !== false && rows.length) {
    lines.push('', `EVERY STEP (MB held, change since the step before, live contexts own+charts, owners over ${OWNER_MB} MB, flags):`);
    let lastJ = null, prevMb = null;
    for (const r of rows) {
      if (r.journey !== lastJ) { lastJ = r.journey; prevMb = jStart[r.journey]?.mb ?? null; lines.push(`  [${r.journey}]`); }
      const d = Number.isFinite(r.mb) && Number.isFinite(prevMb) ? r.mb - prevMb : NaN;
      prevMb = Number.isFinite(r.mb) ? r.mb : prevMb;
      lines.push(`  ${String(r.i + 1).padStart(2)} ${r.label.slice(0, 60)}: ${f0(r.mb)} MB (${Number.isFinite(d) ? `${d >= 0 ? '+' : ''}${f0(d)}` : '?'}), ${r.own}+${r.charts}, ${r.big?.length ? r.big.map((o) => `${o.owner} ${o.mb}`).join(' ') : '-'}${r.flags.length ? `, ${r.flags.map((f) => f.kind).join(' ')}` : ''}${r.error ? `, ${r.error.slice(0, 80)}` : ''}`);
    }
  }
  for (const l of info.lastSeen || []) lines.push(`  the page's own record: ${l}`);
  lines.push('', 'NOT CHECKED HERE: how anything looks (pictures, colours, motion smoothness), wording, shaders other than the ones these steps compile, and any state no step reached. Layout across all 290 cards is the gallery Sweep (about an hour), or the headless layout sweep.');
  return { summary, rows, journeys: jr, events, text: lines.join('\n'), killed: kill, dropped };
}
