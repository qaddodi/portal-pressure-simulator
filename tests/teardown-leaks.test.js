// Teardown leaks (bugs-recs B03 to B06, B29, 2 Nov 2026): what a view owns is let go when the view goes.
// - B29 vitals-gl: a disposed monitor creates no GPU object when its context is restored; it has no context or listeners of its own (it draws
//   in the chart pool, gpu-two-contexts-plan.md U1) and gives back what it made there.
// - B05 trace-gl: dispose removes both context listeners from the shared canvas, the size subscription and the atlas wait; idempotent.
// - B06 svg-gl: dispose is permanent; queued frames, rest passes and entrance timers are cancelled; mutators do nothing after.
// - B03 util.js/gl-words.js: putText's implicit wrappers can be released (releaseWords), and a sweep frees those that left the page.
// - B04 presenter.js/scope-tile.js: the tiles and the scope picture have an idempotent dispose that stopNow calls.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './dom-shim.js';

const src = (f) => readFileSync(new URL(`../src/ui/${f}`, import.meta.url), 'utf8');
const strip = (t) => t.replace(/\/\/.*$/gm, '');

// A WebGL2 stand-in that counts every object it is asked to create.
class W2 {}
globalThis.WebGL2RenderingContext = W2;
function fakeGL() {
  const made = { n: 0 };
  const gl = new Proxy(Object.create(W2.prototype), {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'isContextLost') return () => false;
      if (k === 'getExtension') return () => null;
      if (typeof k === 'string' && /^(create|new)/.test(k)) return () => { made.n++; return {}; };
      if (typeof k === 'string' && /^[A-Z_0-9]+$/.test(k)) return 1;
      return () => 1;
    },
  });
  return { gl, made };
}

test('B29: a disposed vitals monitor builds nothing in the pool, gives back what it made, and its chart drawer goes with it', () => {
  const t = strip(src('vitals-gl.js'));
  assert.doesNotMatch(t, /getContext\(|addEventListener|WEBGL_lose_context/, 'no context and no listeners of its own');
  assert.match(t, /cancelPub = publishWhenDone\(/, 'the publication handle is kept');
  assert.match(t, /if \(!dead && R === mine && !gl\.isContextLost\(\) && publish\(\)\)/, 'a publication that comes after disposal builds nothing');
  assert.match(t, /if \(dead \|\| !gl \|\| gl\.isContextLost\(\)\) return false;/, 'a disposed monitor builds nothing for a context');
  const d = t.slice(t.indexOf('dispose() {', t.indexOf('draw(s) {')));
  assert.match(d, /if \(dead\) return;\n\s+dead = true;\n\s+release\(\);\n\s+pen\.dispose\(\);/, 'idempotent: its objects in the pool deleted, the drawer disposed');
  assert.match(t, /gl\.deleteProgram\(r\.p\[k\]\)/);
  assert.match(t, /gl\.deleteVertexArray\(r\[k\]\.vao\); gl\.deleteBuffer\(r\[k\]\.buf\)/);
});

test('B05: a chart disposes its context listeners, size subscription and atlas wait once', () => {
  const t = strip(src('trace-gl.js'));
  const d = t.slice(t.indexOf('dispose() {', t.indexOf('get parked()')), t.indexOf('const shim = createShim(api)'));
  assert.match(d, /if \(dead\) return;/, 'idempotent');
  assert.match(d, /unsized\?\.\(\)/, 'the size subscription is released');
  assert.match(d, /waiting\.delete\(redraw\)/, 'the atlas-redraw wait is dropped');
  assert.match(d, /glCanvas\.removeEventListener\?\.\('webglcontextlost', onLost\)/);
  assert.match(d, /glCanvas\.removeEventListener\?\.\('webglcontextrestored', onRestored\)/);
  assert.match(t, /unsized = onCanvasSized\(host, redraw\)/, 'the unsubscribe is kept');
});

test('B06: a disposed SVG picture cancels its work and its mutators do nothing', () => {
  const t = strip(src('svg-gl.js'));
  const d = t.slice(t.indexOf('g.dispose = () => {'), t.indexOf('box._svgGL = g'));
  assert.match(d, /if \(g\.dead\) return;/);
  for (const k of ['cancelFrame(g.ask)', 'cancelRest(g.lookAsk)', 'cancelRest(g.connAsk)', 'clearTimeout(t)', 'g.pending = null', 'g.ins.clear()']) assert.ok(d.includes(k), k);
  assert.match(d, /for \(const k of \['paint', 'wake', 'relook', 'place', 'adopt', 'fadeEl', 'fadeIn', 'show', 'swap', 'clear'\]\) g\[k\] = \(\) => \{\};/);
  assert.match(t, /const connect = \(\) => \{ g\.connAsk = 0; if \(g\.dead\)/, 'a queued connection attaches no model after disposal');
  assert.match(t, /g\.ask = 0;\n {4}if \(g\.dead \|\| !cv\.isConnected\) return;/, 'a queued draw does not paint');
  assert.match(t, /function lookRead\(\) \{ g\.lookAsk = 0; if \(g\.dead\) return;/, 'a queued look read asks for nothing');
  assert.match(t, /g\.timers\.add\(t\)/, 'the entrance timer is tracked');
});

test('B03: putText wrappers are released with their view, and a sweep frees those that left the page', () => {
  const u = strip(src('util.js'));
  assert.match(u, /export function releaseWords\(root\)/);
  assert.match(u, /implicitW\.add\(el\)/, 'every implicit wrapper is registered');
  assert.match(u, /if \(!el\.isConnected\) dropWords\(el\)/, 'the sweep frees wrappers whose element left the page');
  assert.match(u, /w\.dispose\(\)/);
  assert.match(u, /releaseWords\(el\); restRemove\(el\)/, 'a closed menu releases its readouts');
  const c = strip(src('card.js'));
  assert.ok((c.match(/releaseWords\(/g) || []).length >= 4, 'the card releases the readouts it replaces or hides');
});

test('B04: tiles and the scope picture are disposed, and stopNow does it', () => {
  const p = strip(src('presenter.js'));
  const k = p.slice(p.indexOf('function bigTiles()'), p.indexOf('// The six levels along the route'));
  assert.match(k, /dispose\(\) \{\s*if \(dead\) return;/);
  assert.match(k, /p\.vw\?\.dispose\(\); p\.hw\?\.dispose\(\); p\.pic\?\.dispose\(\)/);
  assert.match(k, /tileRO\?\.disconnect\(\)/);
  assert.match(k, /picT\?\.stop\(\)/);
  assert.match(p, /ui\?\.tiles\?\.dispose\(\)/, 'stopNow disposes the tiles');
  const s = strip(src('scope-tile.js'));
  assert.match(s, /dispose\(\) \{\s*if \(dead\) return;/);
  assert.match(s, /wordW\.dispose\(\);\s*pen\?\.dispose\(\)/);
  assert.match(s, /clearT\(timer\)/);
  assert.match(s, /queue\.cancel\(\)/);
});
