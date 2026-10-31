// The link between the page and the vessel renderer when the renderer runs in a worker (worker plan, steps 1 and 3). Touches no browser
// global, so tests drive both ends in one process.
//
// The page side (createFigureProxy) has the renderer's calls. A call that only sends something is queued; flush() posts the queue
// as one message, its typed arrays transferred, not copied. What the renderer answers (lost, software, rowsStatus, drawSeq, which
// plates it holds, what it can draw) comes back as a `state` message and is read from the copy, so those reads are at most a frame old.
// Texture jobs (plateJob) get an id here; the worker keeps the texture behind it.
// The worker side (serveFigure) applies a queue to the real renderer in order, then answers with its state.

/** The calls that only send. */
export const SENDS = ['setGeometry', 'patchGeometry', 'setRadii', 'setBend', 'setTubes', 'setOrgans', 'plateRows', 'setPlate', 'dropJob',
  'setFluidSpans', 'setFluidLiver', 'setFluidCells', 'dropPlate', 'setFlow', 'setDye', 'draw', 'composite', 'setLines', 'setCath', 'clear', 'trim', 'resize', 'setPicture', 'setLayerScale', 'setReuse', 'setLow'];
/** The organ stack's calls that only send. */
export const ORGAN_SENDS = ['stage', 'dropKept', 'commit', 'dropStaged', 'setLive', 'setOrder', 'shift'];
const JOB_ARGS = { plateRows: 0, setPlate: 1, dropJob: 0 };   // which argument of these calls is a job handle

// The transferable buffers of a call's arguments (a typed array's buffer, an ImageBitmap), found one level into plain objects and arrays.
export function transfers(args) {
  const out = new Set();
  const see = (v, depth) => {
    if (!v || typeof v !== 'object') return;
    if (ArrayBuffer.isView(v)) { if (v.buffer instanceof ArrayBuffer && v.byteLength === v.buffer.byteLength) out.add(v.buffer); return; }
    if (typeof v.close === 'function' && typeof v.width === 'number') { out.add(v); return; }
    if (depth < 2) for (const k of Object.keys(v)) see(v[k], depth + 1);
  };
  for (const a of args) see(a, 0);
  return [...out];
}

/** `caps`: what the worker's renderer reported when it was probed (software, canLines, canCath, canLive, hasOrgans): the page decides its drawing mode from these at once, before any frame. */
export function createFigureProxy(post, caps = {}, { auto = false } = {}) {
  let queue = [], jobs = 0, due = false;
  const local = [false, false];   // which plates were shown or dropped here (the page's own account, not a frame behind)
  let st = { lost: false, software: false, canLines: false, canCath: false, canLive: false, hasOrgans: true, rowsStatus: '', soft: false, reused: false, pic: [0, 0], drawSeq: 0, plates: [false, false], stack: [false, false], nCells: 0, ...caps };
  const picture = new Set();
  const send = (m, args) => {
    queue.push({ m, args });
    // (Every call made in a task goes in one message, sent when the task ends.)
    if (auto && !due) { due = true; queueMicrotask(() => { due = false; p.flush(); }); }
  };
  const p = {
    get lost() { return st.lost; },
    get software() { return st.software; },
    get canLines() { return st.canLines; },
    get canCath() { return st.canCath; },
    get rowsStatus() { return st.rowsStatus; },
    get drawSeq() { return st.drawSeq; },
    get nCells() { return st.nCells; },
    get soft() { return st.soft; },
    get reused() { return st.reused; },
    picSize: () => st.pic,
    // (Not across the worker: the overlays and the labels drawn into the renderer's own context stay with the page's, ?figworker=on forces the older split.)
    overlay: null,
    top: null,
    hasPlate: (slot) => (auto ? !!local[slot] : !!st.plates[slot] || !!st.stack[slot]),
    present() {},
    dispose() { p.stop?.(); },
    onPicture(f) { picture.add(f); return () => picture.delete(f); },
    plateJob(W, H) { const id = ++jobs; send('plateJob', [id, W, H]); return { id, W }; },
    /** The state the worker last sent; true when it changed the picture count (the glass wakes then). */
    take(next) {
      const was = st.drawSeq;
      st = { ...st, ...next };
      if (st.drawSeq !== was) for (const f of picture) f();
    },
    /** Posts what was queued since the last flush: one message. */
    flush() {
      if (!queue.length) return false;
      const q = queue; queue = [];
      post({ type: 'calls', calls: q }, q.flatMap((c) => transfers(c.args)));
      return true;
    },
    get queued() { return queue.length; },
  };
  for (const m of SENDS) {
    p[m] = (...args) => {
      if (m === 'setPlate') local[args[0]] = true;
      if (m === 'dropPlate') local[args[0]] = false;
      const j = JOB_ARGS[m];
      if (j !== undefined) args = args.map((a, i) => (i === j ? a.id : a));
      send(m, args);
    };
  }
  // The organ cover is a canvas on the page: it crosses as a bitmap, made now and sent when ready (the draws queued meanwhile use the cover before).
  const sendOrgans = p.setOrgans;
  p.setOrgans = (bitmap, rect) => {
    if (typeof createImageBitmap === 'function' && bitmap && typeof bitmap.getContext === 'function') createImageBitmap(bitmap).then((bm) => { sendOrgans(bm, rect); }, () => {});
    else sendOrgans(bitmap, rect);
  };
  // draw/composite/drawRows hand back nothing here: drawRows' refusal is decided in the worker, which falls back to a whole draw itself.
  p.drawRows = (m, look, blood, rows, full = false) => { send('drawRows', [m, look, blood, rows, full]); return true; };
  p.fluidPool = (top) => { send('fluidPool', [top]); return st.hasFluid !== false; };
  p.organs = st.hasOrgans === false ? null : {
    get canLive() { return st.canLive; },
    has: (slot) => !!st.stack[slot],
    stage(slot, name, job, rect, at = 0) { send('organs.stage', [slot, name, job.id, rect, at]); },
    bake(slot, name, groups, rect, scale, at = 0) { const id = ++jobs; send('organs.bake', [id, slot, name, groups, rect, scale, at]); return { id }; },
  };
  if (p.organs) for (const m of ORGAN_SENDS) if (!p.organs[m]) p.organs[m] = (...args) => { send('organs.' + m, args); };
  return p;
}

/** The worker end: applies the queues to `api` (a veins-gl renderer), keeping the textures behind job ids, and answers with its state. */
export function serveFigure(api, reply, canvas = null) {
  const jobs = new Map();
  const snapshot = () => ({
    lost: api.lost, software: api.software, canLines: api.canLines, canCath: api.canCath, rowsStatus: api.rowsStatus, drawSeq: api.drawSeq, nCells: api.nCells, soft: api.soft, reused: api.reused, pic: api.picSize(),
    hasOrgans: !!api.organs, canLive: !!api.organs?.canLive, hasFluid: true,
    plates: [api.hasPlate(0), api.hasPlate(1)], stack: [!!api.organs?.has(0), !!api.organs?.has(1)],
  });
  function apply({ m, args }) {
    if (m === 'resize') { if (canvas) { canvas.width = args[0]; canvas.height = args[1]; } return; }
    if (m === 'plateJob') { const [id, W, H] = args; jobs.set(id, api.plateJob(W, H)); return; }
    if (m === 'plateRows') { const [id, ...r] = args; return api.plateRows(jobs.get(id), ...r); }
    if (m === 'setPlate') { const [slot, id, rect] = args; const j = jobs.get(id); jobs.delete(id); return api.setPlate(slot, j, rect); }
    if (m === 'dropJob') { const j = jobs.get(args[0]); jobs.delete(args[0]); return j && api.dropJob(j); }
    if (m === 'drawRows') {
      const [mat, look, blood, rows, full] = args;
      // (A refusal is the renderer's own to settle: the same rows go to a whole draw, as stage.js does.)
      if (!api.drawRows(mat, look, blood, rows, full)) api.draw(mat, look, blood, rows);
      return;
    }
    if (m === 'organs.stage') { const [slot, name, id, rect, at] = args; return api.organs.stage(slot, name, jobs.get(id), rect, at); }
    if (m === 'organs.bake') { const [id, ...r] = args; jobs.set(id, api.organs.bake(...r)); return; }
    if (m.startsWith('organs.')) return api.organs[m.slice(7)](...args);
    return api[m](...args);
  }
  return {
    handle(msg) {
      if (msg.type !== 'calls') return;
      for (const c of msg.calls) apply(c);
      reply({ type: 'state', state: snapshot() });
    },
    snapshot,
  };
}
