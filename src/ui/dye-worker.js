// The dye bolus off the main thread (recs-2 §3.1; 2 Nov 2026, Mohammad: "how about production quality engine 120+hz"). The slugs'
// advance through the network (blood.js createBolus: objects per slug, a junction map and sorts each step) runs here; the figure gets
// back one table of every vessel's dye bins a step (dye-remote.js), which it lays on the GPU as before.
import { createBolus, DYE_BINS } from './blood.js';

let bolus = null, nE = 0, row = null;
self.onmessage = (e) => {
  const m = e.data;
  if (m.t === 'init') { bolus = createBolus(m.edges, m.nodes); nE = m.edges.length; row = new Float32Array(DYE_BINS); return; }
  if (!bolus) return;
  if (m.t === 'inject') { bolus.inject(m.k, m.at, m.opts); return; }
  if (m.t === 'release') { bolus.release(); return; }
  if (m.t === 'clear') { bolus.clear(); return; }
  if (m.t === 'step') {
    const net = { Q: m.Q, vd: m.vd, len: m.len };
    // (A step of no time is the fields only: createBolus.step(0) would lay a slug of no length at each injection point.)
    if (m.dt > 0) bolus.step(m.dt, net);
    const fields = new Float32Array(nE * DYE_BINS), has = new Uint8Array(nE);
    if (bolus.count) for (let k = 0; k < nE; k++) if (bolus.field(k, net, row)) { has[k] = 1; fields.set(row, k * DYE_BINS); }
    self.postMessage({ seq: m.seq, fields, has, active: bolus.active, injecting: bolus.injecting }, [fields.buffer, has.buffer]);
  }
};
