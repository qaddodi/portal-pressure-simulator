// A WebGL2 context that does nothing, for the warm-frame harness: every call is accepted and costs nothing, objects are plain, shaders
// "compile", and the questions the app asks of the driver get plain answers (a GPU named as the owner's Mac, big limits, float targets).
// Nothing is drawn; what runs is the app's own side of every GL call, which is what the harness measures.
const KNOWN = {
  NO_ERROR: 0, FALSE: 0, TRUE: 1, ZERO: 0, ONE: 1, NONE: 0,
  COMPILE_STATUS: 0x8B81, LINK_STATUS: 0x8B82, FRAMEBUFFER_COMPLETE: 0x8CD5, MAX_TEXTURE_SIZE: 0x0D33, VERSION: 0x1F02, RENDERER: 0x1F01, VENDOR: 0x1F00,
  TEXTURE0: 0x84C0, COLOR_ATTACHMENT0: 0x8CE0, FRAMEBUFFER: 0x8D40, ARRAY_BUFFER: 0x8892, TEXTURE_2D: 0x0DE1, FLOAT: 0x1406, UNSIGNED_BYTE: 0x1401,
  MAX_TEXTURE_IMAGE_UNITS: 0x8872, MAX_VERTEX_TEXTURE_IMAGE_UNITS: 0x8B4C, MAX_COMBINED_TEXTURE_IMAGE_UNITS: 0x8B4D, MAX_RENDERBUFFER_SIZE: 0x84E8,
  MAX_DRAW_BUFFERS: 0x8824, MAX_COLOR_ATTACHMENTS: 0x8CDF, MAX_SAMPLES: 0x8D57, MAX_VIEWPORT_DIMS: 0x0D3A, MAX_UNIFORM_BLOCK_SIZE: 0x8A30,
};
// The names the app uses on a context, found in its source: every `.name(` is a method that does nothing unless answered below, every
// `.NAME` in capitals a constant. A plain object (a Proxy would run its trap, and allocate, on every one of the thousands of calls a frame).
import { readFileSync, readdirSync } from 'node:fs';
const SRC = new URL('../../src/ui/', import.meta.url);
const METHODS = new Set(), CONSTS = new Set();
for (const f of readdirSync(SRC)) {
  if (!f.endsWith('.js')) continue;
  const text = readFileSync(new URL(f, SRC), 'utf8');
  for (const m of text.matchAll(/\.([a-z][A-Za-z0-9]*)\(/g)) METHODS.add(m[1]);
  for (const m of text.matchAll(/\.([A-Z][A-Z0-9_]{2,})\b/g)) CONSTS.add(m[1]);
}
for (const k of Object.keys(KNOWN)) CONSTS.add(k);
const noop = () => undefined;
const fresh = () => ({});
const ONE_OF = new Set(['createShader', 'createProgram', 'createBuffer', 'createTexture', 'createFramebuffer', 'createVertexArray', 'createRenderbuffer', 'createQuery', 'createSampler', 'createTransformFeedback', 'getUniformLocation', 'getUniformBlockIndex', 'fenceSync']);
// The uniforms a program has are the ones its shaders declare (so the app sets what it sets): found in the source given to shaderSource.
const UNIFORM = /uniform\s+(?:(?:highp|mediump|lowp)\s+)?\w+\s+([^;]+);/g;
const declared = (src) => {
  const out = [];
  for (const m of String(src).replace(/\/\/.*$/gm, '').matchAll(UNIFORM)) for (const part of m[1].split(',')) { const n = part.trim().match(/^(\w+)/); if (n) out.push(n[1]); }
  return out;
};
const PROTO = {};
let next = 0x20000;
for (const k of CONSTS) PROTO[k] = k in KNOWN ? KNOWN[k] : next++;
for (const k of METHODS) if (!(k in PROTO)) PROTO[k] = ONE_OF.has(k) ? fresh : noop;
const ACTIVE_UNIFORMS = PROTO.ACTIVE_UNIFORMS;
Object.assign(PROTO, {
  getShaderParameter: () => true, getProgramParameter: (p, what) => (what === ACTIVE_UNIFORMS ? (p.names || []).length : true), getShaderInfoLog: () => '', getProgramInfoLog: () => '', getError: () => 0,
  checkFramebufferStatus: () => 0x8CD5, isContextLost: () => false, getContextAttributes: () => ({ alpha: true, antialias: false, depth: false, stencil: true, premultipliedAlpha: true }),
  getExtension: (n) => (n === 'WEBGL_debug_renderer_info' ? { UNMASKED_RENDERER_WEBGL: 0x9246, UNMASKED_VENDOR_WEBGL: 0x9245 } : n === 'EXT_color_buffer_float' || n === 'OES_texture_float_linear' || n === 'EXT_color_buffer_half_float' ? {} : null),
  getSupportedExtensions: () => ['EXT_color_buffer_float', 'OES_texture_float_linear', 'WEBGL_debug_renderer_info'],
  getAttribLocation: () => 0, getFragDataLocation: () => 0, getShaderPrecisionFormat: () => ({ rangeMin: 127, rangeMax: 127, precision: 23 }),
  getBufferParameter: () => 0, getTexParameter: () => 0, getFramebufferAttachmentParameter: () => 0, getInternalformatParameter: () => [4],
  clientWaitSync: () => 0x911A, getSyncParameter: () => 0x9119, getQueryParameter: () => 0, getUniform: () => 0,
  getParameter: (p) => (p === 0x9246 || p === 0x1F01 ? 'Apple M2 GPU' : p === 0x1F00 ? 'Apple' : p === 0x1F02 ? 'WebGL 2.0' : p === 0x0D3A ? [16384, 16384] : p === KNOWN.MAX_TEXTURE_SIZE || p === KNOWN.MAX_RENDERBUFFER_SIZE ? 16384 : 32),
  shaderSource: (sh, src) => { sh.src = src; },
  attachShader: (p, sh) => { (p.shaders ??= []).push(sh); },
  linkProgram: (p) => { p.names = [...new Set((p.shaders || []).flatMap((sh) => declared(sh.src)))]; },
  getActiveUniform: (p, i) => ({ name: (p.names || [])[i] ?? '', size: 1, type: 0 }),
});
export function makeGL(canvas) {
  const gl = Object.create(PROTO);
  gl.canvas = canvas; gl.draws = 0; gl.drawingBufferWidth = canvas.width || 1280; gl.drawingBufferHeight = canvas.height || 800;
  const count = () => { gl.draws++; };
  for (const k of ['drawArrays', 'drawArraysInstanced', 'drawElements', 'drawElementsInstanced', 'clear']) gl[k] = count;
  return gl;
}
export function installGL(win) {
  const proto = win.HTMLCanvasElement.prototype;
  proto.getContext = function (type) { return type === 'webgl2' ? (this.__gl ??= makeGL(this)) : null; };
}
