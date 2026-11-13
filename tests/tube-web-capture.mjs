// The real figure's and the real lobule's rows and joins, for the Tube's web tests (tests/tube-web-real.test.js, brief S2-J). Node only: the real stage (or the
// real lobule layer) is booted in jsdom with the GL stub, as tests/stage-gl-boot.js and scripts/lobule-joins.mjs do, and what it hands binVeins is kept.
//
//   node tests/tube-web-capture.mjs figure|lobule [--lymph]      prints one line of JSON: { rows: [{ id, P (128 numbers), R (64) }], joins: [entry (8)...], tube (the tube attributes, flat), nRows }
//
// The join entries are binVeins' own (writeJoin's layout, one per join entry the cells list, repeats included); P are the points the binning holds.
import { register } from 'node:module';

const mode = process.argv[2], lymph = process.argv.includes('--lymph');
const ROOT = new URL('../', import.meta.url).pathname;
const N = 64, TF = 52;

function pack(tubes, joins, rad, tube, nRows) {
  return Promise.all([import(ROOT + 'src/ui/veins-bin.js'), import(ROOT + 'src/ui/veins-mesh-data.js')]).then(([bin, md]) => {
    const bins = bin.binVeins(tubes, joins);
    const list = md.joinEntryList(bins.cells, bins.nCells, {});
    const entries = [];
    for (const e of list) entries.push(Array.from(bins.ent.subarray(e * 8, e * 8 + 8)));
    const rows = tubes.map((t) => {
      const P = []; for (let i = 0; i < N; i++) P.push(t.pts[i][0], t.pts[i][1]);
      const R = []; for (let i = 0; i < N; i++) R.push(rad[(t.id * N + i) * 4]);
      return { id: t.id, P, R };
    });
    return { rows, joins: entries, tube: Array.from(tube.subarray(0, nRows * TF)), nRows };
  });
}

if (mode === 'lobule') {
  const { captureLobule } = await import(ROOT + 'scripts/lobule-joins.mjs');
  const cap = await captureLobule({ lymph });
  const out = await pack(cap.tubes, cap.joins, cap.up.rad, cap.up.tube, cap.up.tube.length / TF);
  process.stdout.write(JSON.stringify(out) + '\n', () => process.exit(0));
} else if (mode === 'figure') {
  register(new URL('./tube-web-hooks.mjs', import.meta.url));
  const page = (await import(ROOT + 'scripts/warm/dom.mjs')).installPage();
  const proto = page.dom.window.HTMLCanvasElement.prototype;
  const up = { rad: null, tube: null };
  let wrapped = proto.getContext;
  Object.defineProperty(proto, 'getContext', {
    configurable: true,
    get() { return wrapped; },
    set(fn) {
      wrapped = function (type, ...a) {
        const gl = fn.call(this, type, ...a);
        if (gl && !gl.__tubeWeb) {
          gl.__tubeWeb = true;
          const was = gl.texSubImage2D;
          gl.texSubImage2D = function (...args) {
            const [, , , , w, h, , , data] = args;
            if (data instanceof Float32Array) {
              if (w === N && data.length >= h * N * 4 && data.length % (N * 4) === 0 && (!up.rad || data.length >= up.rad.length)) up.rad = data;   // flushRadii: the kept mirror of every row's radii
              else if (w === 13 && data.length % TF === 0) {   // setTubes: the rows that changed (heat D-4, 13 Nov 2026), from row args[3], at data's offset args[9]: kept as the whole table the texture holds
                if (!up.tube || up.tube.length !== data.length) up.tube = new Float32Array(data.length);
                const off = args[9] || 0; up.tube.set(data.subarray(off, off + h * TF), args[3] * TF);
              }
            }
            return was.apply(this, args);
          };
        }
        return gl;
      };
    },
  });
  globalThis.__binSpy = [];
  const { bootGL } = await import(ROOT + 'tests/stage-gl-boot.js');
  const { st, frame } = await bootGL({ w: 1200, h: 800, labels: 'none' });
  const outs = {};
  for (const view of ['anatomy', 'circuit']) {
    if (view === 'circuit') st.setView('circuit');
    if (view === 'circuit') globalThis.__binSpy = [];
    for (let i = 0; i < 80; i++) await frame();
    const spy = globalThis.__binSpy.at(-1) || null;
    if (!spy || !up.rad || !up.tube) { console.error('no binning seen', !!spy, !!up.rad, !!up.tube); process.exit(2); }
    outs[view] = await pack(spy.tubes, spy.joins, up.rad, up.tube, up.tube.length / TF);
  }
  process.stdout.write(JSON.stringify(outs) + '\n', () => process.exit(0));
} else {
  console.error('usage: node tests/tube-web-capture.mjs figure|lobule [--lymph]');
  process.exit(1);
}
