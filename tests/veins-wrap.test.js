import { test } from 'node:test';
import assert from 'node:assert/strict';

// A pan moves no target (31 Oct, recs A4b): the vessel layer wraps round at its edges, a pan moves the wrap, and only the strips it
// uncovers are drawn, into the texels the strips it hid gave up. These tests run the renderer on a stand-in WebGL that keeps, for
// every texel of the layer's colour target, which spot of the figure the vessel pass drew there (worked out as the shaders work it
// out: the vertex shader's lOff, the fragment shader's q, the scissor and the viewport), and check at every composite that each
// screen pixel reads, through lWrap as the composite reads it, the texel drawn for its own spot of the figure now.
// The layer is as large as the figure where that is less than the picture (31 Oct, recs A4c): its window follows the figure on such
// an axis, so the same check runs on pictures larger than the figure, where every pixel outside the figure's cells must read empty.

globalThis.ResizeObserver ??= class { observe() {} };
globalThis.MutationObserver ??= class { observe() {} };
globalThis.window ??= globalThis;
globalThis.Element ??= class {};
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.document ??= { documentElement: { dataset: {}, style: { setProperty() {} } }, addEventListener() {}, createElement: () => ({ getContext: () => ({}) }) };
globalThis.addEventListener ??= () => {};
globalThis.getComputedStyle ??= () => ({ getPropertyValue: () => '' });

const { wrapPieces, boxOfCells, createVeinsGL, binVeins, N_SAMPLES, MAX_TIERS } = await import('../src/ui/veins-gl.js');
const { CELL } = await import('../src/ui/veins-bin.js');

test('wrapPieces: every pixel of the rectangle once, each in the texel (s + o) mod size, shifted by that', () => {
  for (const [W, H] of [[7, 5], [16, 9], [1, 1], [3, 8]]) {
    for (let ox = 0; ox < W; ox++) for (let oy = 0; oy < H; oy++) {
      for (const r of [[0, 0, W, H], [0, 0, Math.ceil(W / 2), H], [W - 1, 0, 1, H], [0, H - 2 > 0 ? H - 2 : 0, W, Math.min(2, H)], [1 % W, 1 % H, Math.max(1, W - 2), Math.max(1, H - 2)]]) {
        const ps = wrapPieces(r, [ox, oy], W, H), seen = new Map();
        assert.ok(ps.length >= 1 && ps.length <= 4);
        for (const [x, y, w, h, sx, sy] of ps) {
          assert.ok(w > 0 && h > 0 && x >= 0 && y >= 0 && x + w <= W && y + h <= H, 'inside the layer');
          assert.ok((sx === ox || sx === ox - W) && (sy === oy || sy === oy - H));
          for (let i = x; i < x + w; i++) for (let j = y; j < y + h; j++) {
            const s = [i - sx, j - sy];
            assert.ok(s[0] >= r[0] && s[0] < r[0] + r[2] && s[1] >= r[1] && s[1] < r[1] + r[3], 'its screen pixel is in the rectangle');
            assert.equal(i, (s[0] + ox) % W); assert.equal(j, (s[1] + oy) % H);
            const k = `${s}`;
            assert.ok(!seen.has(k), 'once'); seen.set(k, 1);
          }
        }
        assert.equal(seen.size, r[2] * r[3], 'every pixel');
      }
    }
  }
  assert.deepEqual(wrapPieces([0, 0, 0, 5], [1, 1], 4, 5), []);
});

// ── The stand-in WebGL ──
function emulator(W, H) {
  const enums = new Map(), srcOf = new Map(), progSh = new Map(), uni = new Map();
  let nextObj = 1, prog = null, drawFb = null, unit = 0, scissorOn = false, scissor = [0, 0, 0, 0], viewport = [0, 0, W, H];
  const units = new Map(), boundTex = () => units.get(unit), att = new Map(), model = new Map(), size = new Map();
  // (cells: the figure's cell origins, "x,y" in world units; a screen pixel whose spot of the figure lies in none has no quad over it.)
  // (expect: the view the composite should show, [x, y, scale]: its translation, whole pixels, and its scale, 1 unless given.)
  const st = { expect: null, checked: 0, failures: [], vessel: 0, cells: new Set(), empty: 0 };
  const spotIn = (M, x, y) => {   // (M: a world matrix of scale and whole-pixel translation only, as these scenes use)
    const wx = (x - M[6]) / M[0], wy = (y - M[7]) / M[4];
    return st.cells.has(`${Math.floor(wx / CELL) * CELL},${Math.floor(wy / CELL) * CELL}`);
  };
  const E = (k) => { if (!enums.has(k)) enums.set(k, 0x10000 + enums.size); return enums.get(k); };
  const fsOf = (p) => srcOf.get((progSh.get(p) || []).find((s) => s.type === E('FRAGMENT_SHADER'))) || '';
  const srcs = (p) => (progSh.get(p) || []).map((s) => srcOf.get(s) || '').join('\n');
  const U = (p, n) => uni.get(p)?.[n];
  const inBox = (i, j, b) => i >= b[0] && i < b[0] + b[2] && j >= b[1] && j < b[1] + b[3];
  const target = () => att.get(drawFb)?.get(E('COLOR_ATTACHMENT0'));
  const gl = new Proxy({}, {
    get(_, k) {
      if (typeof k !== 'string') return undefined;
      if (/^[A-Z0-9_]+$/.test(k)) return E(k);
      return (...a) => {
        switch (k) {
          case 'createShader': return { obj: nextObj++, kind: k, type: a[0] };
          case 'createProgram': case 'createTexture': case 'createFramebuffer': case 'createBuffer': case 'createVertexArray': case 'createRenderbuffer': case 'createQuery':
            return { obj: nextObj++, kind: k };
          case 'shaderSource': srcOf.set(a[0], a[1]); return undefined;
          case 'attachShader': progSh.set(a[0], [...(progSh.get(a[0]) || []), a[1]]); return undefined;
          case 'getShaderParameter': return true;
          case 'getProgramParameter': {
            if (a[1] !== E('ACTIVE_UNIFORMS')) return true;
            const names = [...srcs(a[0]).matchAll(/^uniform [^;]*?(\w+)\s+([\w\s,[\]]+);/gm)].flatMap((m) => m[2].split(',').map((x) => x.trim().replace(/\[.*$/, '')));
            a[0].names = [...new Set(names)];
            return a[0].names.length;
          }
          case 'getActiveUniform': return { name: a[0].names[a[1]] };
          case 'getUniformLocation': return { p: a[0], name: a[1] };
          case 'getContextAttributes': return { stencil: true };
          case 'getExtension': return null;
          case 'getParameter': return 'stand-in';
          case 'useProgram': prog = a[0]; return undefined;
          case 'bindFramebuffer':
            if (a[0] === E('FRAMEBUFFER') || a[0] === E('DRAW_FRAMEBUFFER')) drawFb = a[1];
            return undefined;
          case 'framebufferTexture2D': { const fb = drawFb; if (!att.has(fb)) att.set(fb, new Map()); att.get(fb).set(a[1], a[3]); return undefined; }
          case 'activeTexture': unit = a[0] - E('TEXTURE0'); return undefined;
          case 'bindTexture': units.set(unit, a[1]); return undefined;
          case 'texImage2D': { const t = boundTex(); if (t) { size.set(t, [a[3], a[4]]); model.set(t, new Array(a[3] * a[4]).fill(null)); } return undefined; }
          case 'enable': if (a[0] === E('SCISSOR_TEST')) scissorOn = true; return undefined;
          case 'disable': if (a[0] === E('SCISSOR_TEST')) scissorOn = false; return undefined;
          case 'scissor': scissor = a.slice(0, 4); return undefined;
          case 'viewport': viewport = a.slice(0, 4); return undefined;
          case 'uniform1f': case 'uniform2f': case 'uniform3f': case 'uniform4f': case 'uniform1i': case 'uniform2i': case 'uniformMatrix3fv': case 'uniform1fv': case 'uniform1iv': case 'uniform4fv':
            if (a[0]) { if (!uni.has(a[0].p)) uni.set(a[0].p, {}); uni.get(a[0].p)[a[0].name] = k.startsWith('uniformMatrix') ? a[2] : a.slice(1); }
            return undefined;
          case 'blitFramebuffer': if (drawFb !== null) st.failures.push('a copy of a target'); return undefined;   // (the kept picture onto the canvas is no target)
          case 'clearBufferfv': {
            if (a[0] !== E('COLOR') || a[1] !== 0) return undefined;
            const t = target(), m = t && model.get(t), [tw, th] = size.get(t) || [0, 0];
            if (!m) return undefined;
            for (let j = 0; j < th; j++) for (let i = 0; i < tw; i++) if (!scissorOn || inBox(i, j, scissor)) m[i + j * tw] = null;
            return undefined;
          }
          case 'drawArraysInstanced': case 'drawArrays': {
            const fs = fsOf(prog);
            if (/uniform vec2 lOff;/.test(fs) && /outFlow/.test(fs)) {
              // A vessel pass: each texel it covers (inside the viewport, the scissor and the cells' quads, moved by lOff) holds the
              // spot of the figure the fragment shader works out for it.
              const t = target(), m = t && model.get(t), [tw, th] = size.get(t) || [0, 0];
              if (!m) return undefined;
              st.vessel++;
              const [lx, ly] = U(prog, 'lOff') || [0, 0], [tx, ty] = U(prog, 'tOff'), [SW, SH] = U(prog, 'sizeF');
              if (SW !== tw || SH !== th) st.failures.push(`a vessel pass sized ${SW} × ${SH} on a ${tw} × ${th} layer`);
              for (let j = 0; j < th; j++) for (let i = 0; i < tw; i++) {
                if (!inBox(i, j, viewport) || (scissorOn && !inBox(i, j, scissor))) continue;
                const fx = i + 0.5, fy = j + 0.5, qx = fx - lx, qy = SH - fy - ly;   // (the screen pixel: q before the translation)
                if (!spotIn(U(prog, 'world'), qx, qy)) continue;   // (no quad there)
                m[i + j * tw] = [qx - tx, qy - ty];
              }
            } else if (/uniform ivec2 lA, lWrap, lSize;/.test(fs) && st.expect) {
              // A composite: every screen pixel reads its layer texel as the composite finds it (the window lA, the wrap, the layer's
              // size; GL's rows run up), and finds its own spot of the figure there, or nothing where no cell is.
              const [ax, ay] = U(prog, 'lA'), [wx, wy] = U(prog, 'lWrap'), [sw, sh] = U(prog, 'lSize'), [lH] = U(prog, 'lH'), baseUnit = U(prog, 'base')[0];
              const t = units.get(baseUnit), m = model.get(t), [tw, th] = size.get(t) || [0, 0];
              if (tw !== sw || th !== sh) st.failures.push(`the composite's lSize ${sw} × ${sh} on a ${tw} × ${th} layer`);
              if (lH !== H) st.failures.push(`lH ${lH}`);
              const [ex, ey, k = 1] = st.expect, view = [k, 0, 0, 0, k, 0, ex, ey, 1];
              let bad = 0, empty = 0;
              for (let sy = 0; sy < H; sy++) for (let sx = 0; sx < W; sx++) {
                const ip = [sx, H - 1 - sy];
                const rx = ip[0] - ax, ry = lH - 1 - ip[1] - ay;
                const inL = rx >= 0 && ry >= 0 && rx < sw && ry < sh;
                let tx = rx + wx, ty = ry + wy;
                if (tx >= sw) tx -= sw;
                if (ty >= sh) ty -= sh;
                const v = inL ? m?.[tx + (sh - 1 - ty) * sw] : null;
                if (spotIn(view, sx + 0.5, sy + 0.5)) { if (!v || v[0] !== sx + 0.5 - ex || v[1] !== sy + 0.5 - ey) bad++; }
                else if (v) bad++;
                else empty++;
              }
              // And every texel of the layer, on the screen or off it: it holds the screen pixel la + ((t − wrap) mod size) (y down), and
              // that pixel's spot of the figure where a cell is, nothing elsewhere (a pan off the edge brings those pixels in as they are).
              for (let ty = 0; ty < sh; ty++) for (let tx = 0; tx < sw; tx++) {
                const sx = ax + ((((tx - wx) % sw) + sw) % sw), sy = ay + ((((ty - wy) % sh) + sh) % sh);
                const v = m?.[tx + (sh - 1 - ty) * sw];
                if (spotIn(view, sx + 0.5, sy + 0.5) ? !v || v[0] !== sx + 0.5 - ex || v[1] !== sy + 0.5 - ey : v) bad++;
              }
              st.checked++;
              st.empty += empty;
              if (bad) st.failures.push(`composite ${st.checked}: ${bad} of ${W * H} pixels read another spot (view ${ex}, ${ey}; window ${ax}, ${ay}; wrap ${wx}, ${wy}; layer ${sw} × ${sh})`);
            }
            return undefined;
          }
          default: return undefined;
        }
      };
    },
  });
  return { gl, st };
}

function scene(W, H) {
  const { gl, st } = emulator(W, H);
  const canvas = { width: W, height: H, getContext: () => gl, addEventListener() {}, removeEventListener() {}, toDataURL: () => 'data:' };
  const g = createVeinsGL(canvas, { tubes: 4, force: true });
  const line = (y) => Array.from({ length: N_SAMPLES }, (_, i) => [i * 4, y]);
  const bins = binVeins([{ id: 0, pts: line(10), reach: 6 }, { id: 1, pts: line(40), reach: 6 }], []);
  for (let c = 0; c < bins.nCells; c++) st.cells.add(`${bins.cells[c * 6]},${bins.cells[c * 6 + 1]}`);
  g.setGeometry(bins);
  const look = { shOff: [0, 0], light: [0, -1], reach: 3, organs: 0, casing: [0, 0, 0, 1], shadow: [0, 0, 0, 0], sheen: [1, 1, 1, 0], shade: [0, 0, 0, 0], ring: [0, 0, 0, 0], netAlpha: 1, fx: true, tierAlpha: Array(MAX_TIERS).fill(1), tierGroup: Array(MAX_TIERS).fill(1) };
  return { g, st, look, bins };
}

test('pans of every size and direction, on layers of odd and even sizes: each composite reads every pixel\'s own spot, and nothing is copied', () => {
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (const [W, H] of [[37, 23], [40, 30], [31, 64]]) {
    const { g, st, look } = scene(W, H);
    let x = 3, y = -2;
    st.expect = [x, y];
    g.draw([1, 0, 0, 1, x, y], look, { on: false });
    const pans = [[1, 0], [0, 1], [-1, 0], [0, -1], [5, -3], [-7, 4], [Math.floor(W / 2) - 1, 0], [0, -(Math.floor(H / 2) - 1)]];
    for (let i = 0; i < 40; i++) pans.push([Math.round((rnd() - 0.5) * (W - 2)), Math.round((rnd() - 0.5) * (H - 2))]);
    for (const [dx, dy] of pans) {
      if (!dx && !dy) continue;
      x += dx; y += dy;
      st.expect = [x, y];
      g.draw([1, 0, 0, 1, x, y], look, { on: false });
      // A blood frame between pans reads through the same wrap.
      g.composite(look, { on: true });
    }
    assert.ok(st.vessel > pans.length, 'the strips were drawn');
    assert.ok(st.checked >= 2 * pans.length - 2, `every frame checked (${st.checked})`);
    assert.deepEqual(st.failures, [], `${W} × ${H}`);
  }
});

test('a whole draw after pans lays the layer back with no wrap', () => {
  const { g, st, look } = scene(29, 17);
  st.expect = [0, 0];
  g.draw([1, 0, 0, 1, 0, 0], look, { on: false });
  st.expect = [6, 4];
  g.draw([1, 0, 0, 1, 6, 4], look, { on: false });
  // (A zoom and back: one-pass frames, which draw the vessels in the picture itself and leave the layer empty, so they are not
  // checked against it. The next draw at that view finds no kept layer and draws it whole, with no wrap.)
  st.expect = null;
  g.draw([1.25, 0, 0, 1.25, 6, 4], look, { on: false });
  g.draw([1, 0, 0, 1, 6, 4], look, { on: false });
  const n = st.checked;
  st.expect = [6, 4];
  g.draw([1, 0, 0, 1, 6, 4], look, { on: false });
  st.expect = [-3, 9];
  g.draw([1, 0, 0, 1, -3, 9], look, { on: false });
  assert.equal(st.checked, n + 2);
  assert.deepEqual(st.failures, []);
});

test('a figure smaller than the picture: the layer as large as the figure, following it on that axis; pans of any length read right', () => {
  let seed = 11;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  // (The figure's cells: about 290 × 80 px at scale 1. On 200 × 150 it is wider than the picture and shorter, on 400 × 40 narrower
  // and taller, on 400 × 300 smaller both ways.)
  for (const [W, H, follows] of [[200, 150, [false, true]], [400, 40, [true, false]], [400, 300, [true, true]]]) {
    const { g, st, look, bins } = scene(W, H);
    let x = 5, y = 20;
    st.expect = [x, y];
    g.draw([1, 0, 0, 1, x, y], look, { on: false });
    const L = g.layerLayout;
    assert.deepEqual(L.follows, follows, `${W} × ${H}`);
    const box = boxOfCells(bins.cells, bins.nCells, CELL);
    for (const k of [0, 1]) {
      const P = [W, H][k], ext = box[k + 2] - box[k] + 2;
      if (follows[k]) {
        assert.equal(L.size[k], Math.ceil(ext * 1.25 / 64) * 64, 'the figure\'s extent and a quarter, to 64 px');
        assert.ok(L.size[k] < P);
        assert.equal(L.at[k], box[k] + [x, y][k] - 1, 'from a pixel before the figure');
      } else assert.equal(L.size[k], P);
    }
    const pans = [[1, 0], [0, 1], [-3, 2], [W, 0], [0, -H], [-W - 40, H + 30], [W + 20, -H - 10], [0, -400], [0, 420]];
    for (let i = 0; i < 40; i++) pans.push([Math.round((rnd() - 0.5) * (W - 2)), Math.round((rnd() - 0.5) * (H - 2))]);
    let n = 0;
    for (const [dx, dy] of pans) {
      if (!dx && !dy) continue;
      // (A pan that far on a picture-wide axis is a whole draw: covered above.)
      if ((!follows[0] && Math.abs(dx) >= W / 2) || (!follows[1] && Math.abs(dy) >= H / 2)) continue;
      x += dx; y += dy; n++;
      st.expect = [x, y];
      const v0 = st.vessel;
      g.draw([1, 0, 0, 1, x, y], look, { on: false });
      assert.deepEqual(g.layerLayout.size, L.size, 'a pan keeps the layer');
      if ((follows[0] || !dx) && (follows[1] || !dy)) assert.equal(st.vessel, v0, 'moved with the figure: nothing drawn');
      g.composite(look, { on: true });
    }
    assert.ok(st.checked >= 2 * n, `every frame checked (${st.checked})`);
    assert.ok(st.empty > W * H * n / 2, 'the pixels outside the figure checked as empty');
    assert.deepEqual(st.failures, [], `${W} × ${H}`);
    // A zoom (one-pass frames, not checked) and a whole draw at it: the layer laid out again for the larger figure.
    st.expect = null;
    g.draw([1.5, 0, 0, 1.5, 0, 0], look, { on: false });
    st.expect = [0, 0, 1.5];
    g.draw([1.5, 0, 0, 1.5, 0, 0], look, { on: false });
    st.expect = [-6, 7, 1.5];
    g.draw([1.5, 0, 0, 1.5, -6, 7], look, { on: false });
    assert.deepEqual(st.failures, [], `${W} × ${H} at 1.5`);
  }
});

test('the layer\'s size keeps through zoom steps while it holds the figure and is at most twice what it needs', () => {
  const { g, st, look } = scene(1000, 800);
  const sizes = [];
  for (let k = 1; k < 2.6; k *= 1.06) {
    st.expect = null;
    g.draw([k, 0, 0, k, 0, 0], look, { on: false });
    st.expect = [0, 0, k];
    g.draw([k, 0, 0, k, 0, 0], look, { on: false });
    sizes.push(g.layerLayout.size.join(' × '));
  }
  assert.deepEqual(st.failures, []);
  assert.ok(new Set(sizes).size < sizes.length, `some steps keep the layer (${sizes.join(', ')})`);
  assert.ok(st.checked >= sizes.length);
});

test('cells drawn again or recoloured on a wrapped layer land in their own texels, alone and along with a pan', async () => {
  const { TUBE_TEXELS } = await import('../src/ui/veins-gl.js');
  const { g, st, look } = scene(33, 21);
  const data = new Float32Array(4 * TUBE_TEXELS * 4);
  const put = (i, c) => { const o = i * TUBE_TEXELS * 4; data.set([...c, 3, ...c, 1, 1, 0.1 * i, 6, 0], o); data.set([0, 1, 500, 0], o + 20); };
  for (let i = 0; i < 4; i++) put(i, [0.2 + 0.1 * i, 0.4, 0.8]);
  g.setTubes(data);
  st.expect = [0, 0];
  g.draw([1, 0, 0, 1, 0, 0], look, { on: false });
  st.expect = [7, -5];
  g.draw([1, 0, 0, 1, 7, -5], look, { on: false });
  const v0 = st.vessel;
  // A colour change alone: drawRows, on the wrapped layer.
  put(0, [0.9, 0.9, 0.2]); g.setTubes(data);
  assert.equal(g.drawRows([1, 0, 0, 1, 7, -5], look, { on: false }, [0]), true);
  // And one with a pan: the strips, then the changed rows' cells.
  put(1, [0.1, 0.9, 0.3]); g.setTubes(data);
  st.expect = [-4, 6];
  g.draw([1, 0, 0, 1, -4, 6], look, { on: false }, [1]);
  assert.ok(st.vessel - v0 >= 4, 'the cells drawn in pieces');
  assert.deepEqual(st.failures, []);
});

test('the vessel cells\' quads are moved by the same lOff the fragment shader takes off', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');
  const vs = src.slice(src.indexOf('const VS = `'), src.indexOf('// Tube attributes'));
  assert.match(vs, /uniform vec2 lOff;[^\n]*\n[\s\S]*vec3 d = world \* vec3\(w, 1\.0\);\n {2}d\.xy \+= lOff;\n {2}gl_Position = vec4\(d\.x \/ size\.x \* 2\.0 - 1\.0, 1\.0 - d\.y \/ size\.y \* 2\.0, 0\.0, 1\.0\);/);
  assert.match(src, /vec2 q = vec2\(gl_FragCoord\.x, sizeF\.y - gl_FragCoord\.y\) - lOff - tOff;/);
  // (Zero outside the pieces: a one-pass frame, the lower layer, the warm-up and every whole draw read the layer as it shows.)
  assert.match(src, /lOffNow = \[q\[4\], q\[5\]\];\n\s+fn\(\);\n\s+\}\n\s+lOffNow = \[0, 0\];/);
});
