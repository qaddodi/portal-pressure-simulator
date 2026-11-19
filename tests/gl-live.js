// What the page has made on the GPU and not yet let go, counted in node (the stub context of scripts/warm/gl-stub.mjs calls the hook below for every
// context it makes). Textures, framebuffers, renderbuffers, buffers, vertex arrays, programs and shaders are counted live (made minus deleted), and a texture's
// and buffer's size is kept as the page sets it (texImage2D, texStorage2D, copyTexImage2D, renderbufferStorage, bufferData), so a test can say "the figure
// holds this much after a lobule open and close, and no more after the tenth". Not a .test.js: imported by the tests that count.
// (Written for the iPhone crash audit, 18 Nov 2026: a phone's tab is killed for memory without a word, so growth over repeated navigation is the thing to catch.)

const KINDS = { Texture: 'texture', Framebuffer: 'framebuffer', Renderbuffer: 'renderbuffer', Buffer: 'buffer', VertexArray: 'vao', Program: 'program', Shader: 'shader' };
const live = new Map();   // kind -> Set of live objects
let made = 0, freed = 0;
const ctxs = [];
for (const k of Object.values(KINDS)) live.set(k, new Set());
const bytesOf = (o) => o.__bytes || 0;

function track(gl) {
  ctxs.push(gl);
  gl.__live = true;
  for (const [Name, kind] of Object.entries(KINDS)) {
    const create = `create${Name}`, del = `delete${Name}`;
    const mk = gl[create];
    gl[create] = function () { const o = mk.apply(this, arguments); o.__kind = kind; o.__gl = gl; o.__bytes = 0; live.get(kind).add(o); made++; return o; };
    gl[del] = function (o) { if (o && live.get(kind).delete(o)) { freed++; o.__bytes = 0; } };
  }
  // (what is bound, so a size lands on the right object)
  const bound = { tex: null, rb: null, buf: null, unit: 0 };
  const texAt = new Map();
  const bt = gl.bindTexture, br = gl.bindRenderbuffer, bb = gl.bindBuffer, at = gl.activeTexture;
  gl.activeTexture = function (u) { bound.unit = u; return at.apply(this, arguments); };
  gl.bindTexture = function (t, o) { if (t === gl.TEXTURE_2D) texAt.set(bound.unit, o); bound.tex = t === gl.TEXTURE_2D ? o : bound.tex; return bt.apply(this, arguments); };
  gl.bindRenderbuffer = function (t, o) { bound.rb = o; return br.apply(this, arguments); };
  gl.bindBuffer = function (t, o) { if (t === gl.ARRAY_BUFFER) bound.buf = o; return bb.apply(this, arguments); };
  const cur = () => texAt.get(bound.unit) || null;
  const size = (o, w, h, bpp) => { if (o) o.__bytes = Math.max(0, w | 0) * Math.max(0, h | 0) * bpp; };
  const ti = gl.texImage2D, ts = gl.texStorage2D, cti = gl.copyTexImage2D, rs = gl.renderbufferStorage, rsm = gl.renderbufferStorageMultisample, bd = gl.bufferData;
  gl.texImage2D = function (target, level, ifmt, w, h) { if (level === 0 && typeof w === 'number' && typeof h === 'number') size(cur(), w, h, 4); else if (level === 0 && w && w.width) size(cur(), w.width, w.height, 4); return ti.apply(this, arguments); };
  gl.texStorage2D = function (target, levels, ifmt, w, h) { size(cur(), w, h, 4 * 1.34); return ts.apply(this, arguments); };
  gl.copyTexImage2D = function (target, level, ifmt, x, y, w, h) { if (level === 0) size(cur(), w, h, 4); return cti.apply(this, arguments); };
  gl.renderbufferStorage = function (t, f, w, h) { size(bound.rb, w, h, 4); return rs.apply(this, arguments); };
  gl.renderbufferStorageMultisample = function (t, s, f, w, h) { size(bound.rb, w, h, 4 * (s || 1)); return rsm.apply(this, arguments); };
  gl.bufferData = function (t, d) { if (t === gl.ARRAY_BUFFER && bound.buf) bound.buf.__bytes = typeof d === 'number' ? d : d?.byteLength || 0; return bd.apply(this, arguments); };
}
globalThis.__glTrack = track;

/** Counts of what is live now, and the bytes of the textures, renderbuffers and buffers among it. */
export function snapshot() {
  const out = { bytes: 0 };
  for (const [kind, set] of live) { out[kind] = set.size; for (const o of set) out.bytes += bytesOf(o); }
  out.contexts = ctxs.length;
  out.made = made; out.freed = freed;
  return out;
}
/** The live objects of a kind, by the size they were last given (largest first): who holds the memory. */
export function biggest(kind = 'texture', n = 8) {
  return [...live.get(kind)].sort((a, b) => b.__bytes - a.__bytes).slice(0, n).map((o) => o.__bytes);
}
/** The difference of two snapshots, kinds that changed only. */
export function diff(a, b) {
  const d = {};
  for (const k of Object.keys(b)) if (k !== 'made' && k !== 'freed' && b[k] !== a[k]) d[k] = b[k] - a[k];
  return d;
}

/** What is live now on the contexts the page still holds: as snapshot(), leaving out what a context the page gave up (WEBGL_lose_context) held,
 *  since a lost context's objects go with it. `contexts` is the contexts made and not lost. */
export function snapshotLive() {
  const out = { bytes: 0 };
  for (const [kind, set] of live) { out[kind] = 0; for (const o of set) if (!o.__gl?.__lost) { out[kind]++; out.bytes += bytesOf(o); } }
  out.contexts = ctxs.filter((c) => !c.__lost).length;
  return out;
}
