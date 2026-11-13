import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  WEB_ARC, WEB_PTS, WEB_KIND, WEB_VERTS, WEB_FILL, WEB_IN, WEB_OUT, WEB_FLOATS, WEB_LEVEL, WEB_MIN_DEG, WEB_TAPER_DEG, WEB_FAR_TAPER, WEB_MAX_DEG, WEB_FAR, WEB_CUT, WEB_LOOK,
  WEB_STRIP, WEB_STRIP_PTS, WEB_STRIP_LEVEL, webIndex, webGeometry, webVertex, legDirection, tubeWebVS,
} from '../src/ui/tube-joint.js';
import { webInstances } from '../src/ui/tube-data.js';
import { TUBE_LEVEL, TUBE_FADE, tubeStripVS } from '../src/ui/tube-geo.js';
import { N_SAMPLES, MIN_RADIUS, STRIP_VS_GLSL } from '../src/ui/veins-mesh.js';
import { MP } from '../src/ui/veins-mesh-glsl.js';
import { lintGLSL, uniformsOf } from './glsl-lint.js';
import { preprocess } from './glsl-pp.js';
import { compileVS } from './glsl-eval.js';
import { scene, straight, ray, polyline, polyDist, lineDist, DEG } from './tube-web-helpers.js';

// The Tube's webs (docs/recommendations/tube-renderer-stage2-3-plan.md, brief S2-J). Node only: the web's placement is judged on its JS twin (webGeometry,
// webVertex), the shader text on the GLSL lint, on what it exports and on a small interpreter (tests/glsl-eval.js) that runs its main on a table of
// vertices beside the twin.

const AA = 0.4;   // aaPad: two device pixels, world

/** The instance records of a scene's joins: [{ rec (Float32Array view of 12), A (row index), B, ... }]. */
function webs(sc) {
  const out = {};
  webInstances(sc.ent, sc.tube, sc.pts, out);
  const list = [];
  for (let n = 0; n < out.count; n++) {
    const rec = out.data.subarray(n * WEB_FLOATS, (n + 1) * WEB_FLOATS), a = rec[0], b = rec[4];
    list.push({ rec, a, b, PA: sc.P[a], RA: sc.R[a], PB: sc.P[b], RB: sc.R[b] });
  }
  return { out, list };
}
const geo = (w) => webGeometry(w.PA, w.RA, w.PB, w.RB, w.rec, AA);

// ---- the scenes -----------------------------------------------------------------------------------------------------------------

const T = 4;   // the trunk's radius
const SCENES = {
  't90': () => scene([straight(-100, 0, 100, 0, T), straight(0, 0, 0, 100, 2)], [{ x: 0, y: 0, reach: 14, k: 0.4, fillet: 1, members: [0, 1], trunk: 0 }]),
  't45': () => scene([straight(-100, 0, 100, 0, T), ray(0, 0, 45, 100, 2)], [{ x: 0, y: 0, reach: 14, k: 0.4, fillet: 1, members: [0, 1], trunk: 0 }]),
  'y': () => scene([ray(0, 0, 90, 80, 3), ray(0, 0, 210, 80, 3), ray(0, 0, 330, 80, 3.5)], [{ x: 0, y: 0, reach: 14, k: 0.5, fillet: 1, members: [0, 1, 2] }]),
  'elbow': () => scene([ray(0, 0, 0, 80, 3), ray(0, 0, 130, 80, 3)], [{ x: 0, y: 0, reach: 14, k: 0.5, fillet: 1, members: [0, 1] }]),
  'deep': () => scene([straight(-100, 0, 100, 0, 20), straight(0, -100, 0, -5, 3)], [{ x: 0, y: 0, reach: 30, k: 1.5, fillet: 1, members: [0, 1], trunk: 0 }]),
  'short': () => scene([straight(-100, 0, 100, 0, T), straight(0, 0, 0, 2, 1)], [{ x: 0, y: 0, reach: 30, k: 5, fillet: 1, members: [0, 1], trunk: 0 }]),   // a 2-long branch: 0.9 of it binds before the reach or the fillet asked for
  'fork': () => scene([straight(-100, 0, 100, 0, T), ray(0, 0, 60, 100, 2.5), ray(0, 0, 120, 100, 2.5)], [{ x: 0, y: 0, reach: 16, k: 0.5, fillet: 1, members: [0, 1, 2], trunk: 0, fork: true }]),
};

test('webIndex: counts, indices in range, no degenerate triangle, the attribute encoding', () => {
  const M = webIndex();
  assert.equal(M.nVerts, WEB_VERTS); assert.equal(WEB_VERTS, 22 + 2 * WEB_STRIP_PTS); assert.equal(M.attr.length, WEB_VERTS * 4);
  assert.equal(M.nIndex, 3 * WEB_ARC + 6 * WEB_ARC + 12); assert.equal(M.index.length, M.nIndex);
  assert.ok(M.index instanceof Uint16Array);
  for (let t = 0; t < M.nIndex; t += 3) {
    const a = M.index[t], b = M.index[t + 1], c = M.index[t + 2];
    assert.ok(a < WEB_VERTS && b < WEB_VERTS && c < WEB_VERTS);
    assert.ok(a !== b && b !== c && a !== c, `triangle ${t / 3} repeats a vertex`);
  }
  const kinds = {};
  for (let v = 0; v < WEB_VERTS; v++) kinds[M.attr[v * 4]] = (kinds[M.attr[v * 4]] || 0) + 1;
  assert.deepEqual(kinds, { [WEB_KIND.APEX]: 1, [WEB_KIND.FILL]: WEB_PTS, [WEB_KIND.IN]: WEB_PTS, [WEB_KIND.OUT]: WEB_PTS, [WEB_KIND.STRIP_A]: WEB_STRIP_PTS, [WEB_KIND.STRIP_B]: WEB_STRIP_PTS });
  assert.deepEqual(Array.from(M.attr.subarray(0, 4)), [0, 0, 0, 0]);
  for (let k = 0; k < WEB_PTS; k++) {
    assert.deepEqual(Array.from(M.attr.subarray((WEB_FILL + k) * 4, (WEB_FILL + k) * 4 + 2)), [WEB_KIND.FILL, k]);
    assert.deepEqual(Array.from(M.attr.subarray((WEB_IN + k) * 4, (WEB_IN + k) * 4 + 2)), [WEB_KIND.IN, k]);
    assert.deepEqual(Array.from(M.attr.subarray((WEB_OUT + k) * 4, (WEB_OUT + k) * 4 + 2)), [WEB_KIND.OUT, k]);
  }
  // the fan uses the apex and the fill arc only; the skirt only the in and out arcs
  for (let t = 0; t < 3 * WEB_ARC; t++) { const v = M.index[t]; assert.ok(v === 0 || (v >= WEB_FILL && v < WEB_FILL + WEB_PTS)); }
  for (let t = 3 * WEB_ARC; t < 9 * WEB_ARC; t++) { const v = M.index[t]; assert.ok(v >= WEB_IN && v < WEB_OUT + WEB_PTS); }
  for (let t = 9 * WEB_ARC; t < M.nIndex; t++) { const v = M.index[t]; assert.ok(v >= WEB_STRIP && v < WEB_VERTS); }   // the two wall strips: a quad each
  assert.equal(WEB_VERTS - 22, 8, 'a web costs 8 vertices and 12 indices more with its wall strips');
});

test('the levels: a web fill sits over every casing and fading lumen and under every opaque lumen', () => {
  assert.equal(WEB_LEVEL, 0.295);
  assert.ok(WEB_LEVEL >= TUBE_FADE.L0 + TUBE_FADE.H - 1e-12, 'under a fading lumen');
  assert.ok(WEB_LEVEL > TUBE_LEVEL.CASE1 && WEB_LEVEL < TUBE_LEVEL.LUMEN0);
  assert.ok(TUBE_LEVEL.CASE0 < TUBE_LEVEL.CASE1);
});

test('the legs: a direction looks past a zero-length segment, and an end with nowhere to look points along its direction', () => {
  const P = new Float64Array(N_SAMPLES * 2);
  for (let i = 0; i < N_SAMPLES; i++) { P[2 * i] = Math.max(3, i); P[2 * i + 1] = 0; }   // samples 0..3 sit on one point
  assert.deepEqual(legDirection(P, 0, 1), [1, 0]);
  assert.deepEqual(legDirection(P, 3, -1), [-1, 0]);
  assert.deepEqual(legDirection(P, N_SAMPLES - 1, 1), [1, 0]);
  assert.ok(WEB_LOOK >= 4);
});

test('synthetic joins: the number of webs and the corner each one fills', () => {
  const r = {};
  for (const [name, make] of Object.entries(SCENES)) { const w = webs(make()); r[name] = w.list.length; }
  assert.deepEqual(r, { t90: 2, t45: 1,  // (the 45 degree crotch of a branch ending on its trunk is a mouth: no web under MOUTH_WEB_DEG, 13 Nov 2026)
     y: 3, elbow: 1, deep: 2, short: 2, fork: 3 });
  // a T at 90 degrees with trunk radius 4 and branch radius 2: the corners are at (+-2, 4)
  const { list } = webs(SCENES.t90());
  const Cs = list.map((w) => geo(w).C.map((v) => +v.toFixed(6))).sort((a, b) => a[0] - b[0]);
  assert.deepEqual(Cs, [[-2, 4], [2, 4]]);
  // the owner of a T's web is the trunk (row 0); the Y has none, so the larger radius decides in the shader (owner 2)
  for (const w of list) assert.ok(w.rec[10] === 0 || w.rec[10] === 1);
  for (const w of list) { const g = geo(w); assert.equal(g.ownB ? w.b : w.a, 0, 'the web takes the trunk\'s row'); }
  for (const w of webs(SCENES.y()).list) assert.equal(w.rec[10], 2);
});

function checkWeb(w, g, label) {
  assert.equal(g.empty, false, `${label}: the web is empty`);
  const A = g.A, B = g.B;
  // tangent to both walls, within 1e-3
  const dA = lineDist(g.wa[0], g.wa[1], A.d[0], A.d[1], g.O[0], g.O[1]), dB = lineDist(g.wb[0], g.wb[1], B.d[0], B.d[1], g.O[0], g.O[1]);
  assert.ok(Math.abs(dA - g.rho) < 1e-3, `${label}: the arc is ${dA} from wall A, its radius ${g.rho}`);
  assert.ok(Math.abs(dB - g.rho) < 1e-3, `${label}: the arc is ${dB} from wall B, its radius ${g.rho}`);
  assert.ok(lineDist(g.wa[0], g.wa[1], A.d[0], A.d[1], g.Ta[0], g.Ta[1]) < 1e-9 && lineDist(g.wb[0], g.wb[1], B.d[0], B.d[1], g.Tb[0], g.Tb[1]) < 1e-9, `${label}: a tangent point is off its wall`);
  assert.ok(lineDist(g.wa[0], g.wa[1], A.d[0], A.d[1], g.C[0], g.C[1]) < 1e-9 && lineDist(g.wb[0], g.wb[1], B.d[0], B.d[1], g.C[0], g.C[1]) < 1e-9, `${label}: C is off a wall`);
  assert.deepEqual(g.arc[0], g.Ta); assert.ok(Math.hypot(g.arc[WEB_ARC][0] - g.Tb[0], g.arc[WEB_ARC][1] - g.Tb[1]) < 1e-9, `${label}: the arc does not end on Tb`);
  for (const q of g.arc) assert.ok(Math.abs(Math.hypot(q[0] - g.O[0], q[1] - g.O[1]) - g.rho) < 1e-9, `${label}: an arc point is off the circle`);
  // the tangent length: at most 0.9 of each leg's length and of the reach
  const t = Math.hypot(g.Ta[0] - g.C[0], g.Ta[1] - g.C[1]);
  assert.ok(t <= WEB_CUT * Math.min(A.len, B.len) + 1e-9 && t <= w.rec[9] + 1e-9, `${label}: the tangent length ${t} is over the leg or the reach`);
  assert.ok(g.rho <= w.rec[8] + 1e-12);
  // no fill vertex inside either member's lumen by more than 1e-3
  const rA = Math.max(A.r, MIN_RADIUS), rB = Math.max(B.r, MIN_RADIUS);
  for (const [name, q] of [['C', g.C], ...g.arc.map((a, i) => [`arc ${i}`, a])]) {
    assert.ok(polyDist(w.PA, q[0], q[1]) >= rA - 1e-3, `${label}: ${name} lies ${rA - polyDist(w.PA, q[0], q[1])} inside member A's lumen`);
    assert.ok(polyDist(w.PB, q[0], q[1]) >= rB - 1e-3, `${label}: ${name} lies ${rB - polyDist(w.PB, q[0], q[1])} inside member B's lumen`);
  }
  // the skirt never crosses O: each outer point lies between its arc point and O
  assert.ok(g.w > 0 && g.w <= 0.98 * g.rho + 1e-12, `${label}: the skirt is ${g.w} wide for a fillet of ${g.rho}`);
  const M = webIndex();
  for (let k = 0; k < WEB_PTS; k++) {
    const q = webVertex(w.PA, w.RA, w.PB, w.RB, w.rec, M.attr.subarray((WEB_OUT + k) * 4, (WEB_OUT + k) * 4 + 4), AA), a = g.arc[k];
    const along = (q.x - a[0]) * (g.O[0] - a[0]) + (q.y - a[1]) * (g.O[1] - a[1]);
    assert.ok(along > 0, `${label}: the skirt point ${k} is on the wrong side of its arc point`);
    assert.ok(Math.hypot(q.x - g.O[0], q.y - g.O[1]) >= 0.02 * g.rho - 1e-9, `${label}: the skirt reaches O`);
    assert.ok(Math.abs(Math.hypot(q.x - a[0], q.y - a[1]) - g.skirt(k)) < 1e-9, `${label}: the skirt's width follows the radius along the arc`);
  }
}

test('synthetic joins: every web\'s arc is tangent to both walls, none of its fill lies in a lumen, its skirt stops short of the centre', () => {
  let n = 0;
  for (const [name, make] of Object.entries(SCENES)) {
    for (const [i, w] of webs(make()).list.entries()) { checkWeb(w, geo(w), `${name} web ${i}`); n++; }
  }
  assert.equal(n, 14);
});

test('a T at 90 degrees: the fillet is the join\'s own (k times its fillet share), and the corner pocket is filled between the walls', () => {
  const { list } = webs(SCENES.t90());
  for (const w of list) {
    const g = geo(w);
    assert.ok(Math.abs(w.rec[8] - 0.4) < 1e-6, 'rho0 = k * fillet share');
    assert.ok(Math.abs(g.rho - 0.4) < 1e-6, 'a right-angle corner takes the whole fillet');
    assert.ok(Math.abs(g.theta - 90 * DEG) < 1e-9);
    // the tangent length of a right angle is rho
    assert.ok(Math.abs(Math.hypot(g.Ta[0] - g.C[0], g.Ta[1] - g.C[1]) - 0.4) < 1e-6);
    assert.ok(Math.abs(Math.hypot(g.O[0] - g.C[0], g.O[1] - g.C[1]) - 0.4 * Math.SQRT2) < 1e-6);
  }
});

test('a fillet asked for more than the join allows is cut to its reach and to 0.9 of the shorter leg', () => {
  const sc = scene([straight(-100, 0, 100, 0, T), straight(0, 0, 0, 6, 2)], [{ x: 0, y: 0, reach: 3, k: 5, fillet: 1, members: [0, 1], trunk: 0 }]);   // a 6-long branch, a 3 reach, rho0 = 5
  const { list } = webs(sc);
  assert.equal(list.length, 2);
  for (const w of list) {
    const g = geo(w), t = Math.hypot(g.Ta[0] - g.C[0], g.Ta[1] - g.C[1]);
    assert.ok(t <= 3 + 1e-9 && g.rho < 5, `tangent length ${t} over the reach 3`);
    checkWeb(w, g, 'cut');
  }
});

test('the 0.9 cut binds on a short leg: the tangent length is exactly 0.9 of the branch', () => {
  for (const w of webs(SCENES.short()).list) {
    const g = geo(w), t = Math.hypot(g.Ta[0] - g.C[0], g.Ta[1] - g.C[1]);
    assert.ok(Math.abs(t - WEB_CUT * 2) < 1e-6, `tangent length ${t}`);
    assert.ok(g.rho < w.rec[8]);
    checkWeb(w, g, 'short');
  }
});

test('empty webs have zero area: parallel legs, a straight run, a distant corner, no fillet', () => {
  const M = webIndex();
  const area = (w) => {
    let sum = 0;
    const V = [];
    for (let v = 0; v < WEB_VERTS; v++) V.push(webVertex(w.PA, w.RA, w.PB, w.RB, w.rec, M.attr.subarray(v * 4, v * 4 + 4), AA));
    for (let t = 0; t < M.nIndex; t += 3) {
      const a = V[M.index[t]], b = V[M.index[t + 1]], c = V[M.index[t + 2]];
      sum += Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
    }
    return sum;
  };
  const rec = (a, b, over = {}) => {
    const r = new Float32Array(WEB_FLOATS);
    r.set([0, a.sample, a.dir, 1, 1, b.sample, b.dir, -1, 0.4, 14, 2, 0]);
    for (const [k, v] of Object.entries(over)) r[k] = v;
    return r;
  };
  const mk = (rowA, rowB, over) => {
    const sc = scene([rowA, rowB], []);
    return { rec: rec({ sample: 0, dir: 1 }, { sample: 0, dir: 1 }, over), PA: sc.P[0], RA: sc.R[0], PB: sc.P[1], RB: sc.R[1] };
  };
  // two legs 1 degree apart, and 4 degrees apart (under WEB_TAPER_DEG)
  const par = mk(ray(0, 0, 90, 80, 3), ray(2, 0, 91, 80, 3));
  const shallow = mk(ray(0, 0, 90, 80, 3), ray(0, 0, 94, 80, 3));
  assert.equal(geo(shallow).empty, true); assert.ok(area(shallow) < 1e-9);
  assert.equal(geo(par).empty, true); assert.ok(area(par) < 1e-9);
  // 177 degrees apart (a nearly straight run)
  const str = mk(ray(0, 0, 0, 80, 3), ray(0, 0, 177, 80, 3));
  assert.equal(geo(str).empty, true); assert.ok(area(str) < 1e-9);
  // the walls meet far away: two legs 25 degrees apart but 400 units off, C beyond 4 radii
  const far = mk(ray(0, 0, 90, 80, 3), ray(400, 0, 115, 80, 3));
  assert.equal(geo(far).empty, true); assert.ok(area(far) < 1e-9);
  // a join with no fillet
  const none = mk(ray(0, 0, 0, 80, 3), ray(0, 0, 90, 80, 3), { 8: 0 });
  assert.equal(geo(none).empty, true); assert.ok(area(none) < 1e-9);
  // and one that does draw
  const ok = mk(ray(0, 0, 0, 80, 3), ray(0, 0, 90, 80, 3));
  assert.equal(geo(ok).empty, false); assert.ok(area(ok) > 0.01);
  assert.ok(WEB_MIN_DEG === 20 && WEB_TAPER_DEG === 6 && WEB_MAX_DEG === 170 && WEB_FAR === 4 && WEB_FAR_TAPER === 14);
});

test('a taper: legs 6 to 20 degrees apart get a long thin web that rounds the notch where their walls cross, tangent to both walls and within the reach', () => {
  const M = webIndex();
  const mk = (deg, r2 = 3) => {
    const sc = scene([ray(0, 0, 90, 120, 3), ray(0, 0, 90 + deg, 120, r2)], []);
    const r = new Float32Array(WEB_FLOATS);
    r.set([0, 0, 1, 1, 1, 0, 1, -1, 3, 20, 2, 1]);   // (the last float: a taper)
    return { rec: r, PA: sc.P[0], RA: sc.R[0], PB: sc.P[1], RB: sc.R[1] };
  };
  for (const deg of [10, 14, 19]) {
    const w = mk(deg), g = geo(w);
    assert.equal(g.empty, false, `${deg} degrees`);
    assert.ok(Math.abs(g.theta - deg * DEG) < 1e-6);
    const tl = Math.hypot(g.Ta[0] - g.C[0], g.Ta[1] - g.C[1]);
    assert.ok(tl <= 20 + 1e-6, `tangent length ${tl} within the reach 20`);
    assert.ok(g.rho > 0 && g.rho <= 3 + 1e-9, `the arc is no larger than the join asks: ${g.rho}`);
    assert.ok(Math.abs(g.rho / Math.tan(0.5 * g.theta) - tl) < 1e-6, 'rho and the tangent length agree');
    // the web's vertices stay near the corner: nothing flies off
    for (let v = 0; v < WEB_VERTS; v++) {
      const p = webVertex(w.PA, w.RA, w.PB, w.RB, w.rec, M.attr.subarray(v * 4, v * 4 + 4), AA);
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
      assert.ok(Math.hypot(p.x - g.C[0], p.y - g.C[1]) <= tl + 1 + 3 * g.rho, `vertex ${v} within the tangent length of the corner`);
    }
  }
  // below the taper's angle nothing; with the corner farther than WEB_FAR_TAPER radii, nothing
  assert.equal(geo(mk(5)).empty, true);
  const plain = mk(15); plain.rec[11] = 0;
  assert.equal(geo(plain).empty, true, 'a record that is not a taper keeps the 20 degree floor');
  const farOff = (() => { const sc = scene([ray(0, 0, 90, 200, 3), ray(120, 0, 100, 200, 3)], []); const r = new Float32Array(WEB_FLOATS); r.set([0, 0, 1, 1, 1, 0, 1, -1, 3, 20, 2, 1]); return { rec: r, PA: sc.P[0], RA: sc.R[0], PB: sc.P[1], RB: sc.R[1] }; })();
  assert.equal(geo(farOff).empty, true);
  // a thick leg and a thin one close together: the corner is near, so the web draws
  assert.equal(geo(mk(9, 1.2)).empty, false);
});

test('vertex values: levels, vD, vG, vRad as the contract has them', () => {
  const { list } = webs(SCENES.t90());
  const M = webIndex(), w = list[0], g = geo(w);
  const V = Array.from({ length: WEB_VERTS }, (_, v) => webVertex(w.PA, w.RA, w.PB, w.RB, w.rec, M.attr.subarray(v * 4, v * 4 + 4), AA));
  assert.equal(V[0].f, WEB_LEVEL); assert.ok(V[0].vD <= -2 * AA + 1e-12, 'the fill is solid at C');
  // (the apex's tone vector is 0 in a fork, so each ray of the fan takes the tone of the arc point it runs to and the fan matches the leg beside it along each edge; a mouth, a marked trunk's web, has the trunk's wall normal, one unit long: 13 Nov 2026)
  const apLen = Math.hypot(V[0].gx, V[0].gy);
  assert.ok(w.rec[10] < 1.5 ? Math.abs(apLen - 1) < 1e-9 : apLen < 1e-12);
  for (let k = 0; k < WEB_PTS; k++) {
    assert.equal(V[WEB_FILL + k].f, WEB_LEVEL); assert.equal(V[WEB_FILL + k].vD, 0);
    assert.equal(V[WEB_IN + k].f, TUBE_LEVEL.CASE1); assert.equal(V[WEB_IN + k].vD, 0);
    assert.equal(V[WEB_OUT + k].f, TUBE_LEVEL.CASE0); assert.ok(Math.abs(V[WEB_OUT + k].vD - g.skirt(k)) < 1e-12);
    // vG points from the arc toward O (a fork); a mouth's, a marked trunk's web, is the trunk's wall normal, one unit long, all over the web
    const q = V[WEB_FILL + k];
    if (w.rec[10] < 1.5) assert.ok(Math.abs(Math.hypot(q.gx, q.gy) - 1) < 1e-9);
    else assert.ok((g.O[0] - q.x) * q.gx + (g.O[1] - q.y) * q.gy > 0);
    assert.equal(V[WEB_IN + k].x, q.x); assert.equal(V[WEB_OUT + k].gx, q.gx);
  }
  for (const v of V) { assert.equal(v.rad, 4 * g.Rm); assert.equal(v.sample, g.ownB ? w.rec[5] : w.rec[1]); }
});

// ---- the shader -------------------------------------------------------------------------------------------------------------

// (The lint does not know `invariant gl_Position;`, a statement of its own: it is checked for below and taken out for the lint.)
const expanded = (s) => preprocess(s).replace('invariant gl_Position;', '');
const VS = tubeWebVS(STRIP_VS_GLSL);

test('the shader text: lints clean (the strip text it includes, too), declares the plan\'s varyings and the strip\'s uniforms', () => {
  assert.deepEqual(lintGLSL(expanded(VS)), []);
  assert.match(VS, /^#version 300 es/);
  for (const v of ['out float vI;', 'flat out int vRow;', 'out float vD;', 'out vec2 vG;', 'out float vRad;', 'flat out vec2 vEnd;', 'invariant gl_Position;']) assert.ok(VS.includes(v), v);
  assert.ok(!VS.includes('gl_FragDepth'));
  const web = new Set(uniformsOf(VS));
  for (const u of uniformsOf(tubeStripVS(STRIP_VS_GLSL))) assert.ok(web.has(u), `the strip's uniform ${u} is not declared by the web shader`);
  assert.ok(VS.includes(`mPass < ${MP.SHAPE_K}`));
});

test('the zoom numbers: tubeWebVS given the host\'s ZOOM_VS includes it and calls zoomOut() right after vRow, before any early return; given none its text is unchanged', () => {
  const ZOOM = 'precision highp float;\nuniform float pxW;\nflat out vec4 zoomA;\nflat out vec3 zoomB;\nvoid zoomOut() {\n  zoomA = vec4(pxW);\n  zoomB = vec3(pxW);\n}';
  const z = tubeWebVS(STRIP_VS_GLSL, 1, ZOOM);
  assert.ok(z.includes(ZOOM) && z.indexOf(ZOOM) < z.indexOf('out float vI;') && z.indexOf('void main() {') > z.indexOf('zoomOut() {'));
  assert.ok(/vRow = int\(\(ownB \? aLegB\.x : aLegA\.x\) \+ 0\.5\);\n {2}zoomOut\(\);\n/.test(z), 'written before any early return');
  assert.ok(z.indexOf('zoomOut();') < z.indexOf('return;'));
  assert.deepEqual(lintGLSL(expanded(z)), []);
  assert.equal(tubeWebVS(STRIP_VS_GLSL, 1, ''), VS);
  assert.ok(!VS.includes('zoomOut') && !VS.includes('zoomA'));
});

// A stand-in for what STRIP_VS_GLSL gives (the constants; PT and mRW come from the harness), so the interpreter runs the web's own code.
const STUB = 'const int N_SAMPLES = 64;\nconst float M_PI = 3.14159265358979;\n';
const prog = compileVS(tubeWebVS(STUB));
const SIZE = [800, 600];
const IDENT = { mat: true, m: [1, 0, 0, 0, 1, 0, 0, 0, 1] };
function runVertex(w, attr, { mPass = MP.SHAPE, base = 0.25, H = 0.1, zo = {} } = {}) {
  const rows = [w.PA, w.PB], rads = [w.RA, w.RB], ids = [w.rec[0], w.rec[4]];
  const P = (id, i) => { const r = ids.indexOf(id); return [rows[r][2 * i], rows[r][2 * i + 1]]; };
  const res = prog.run({
    attrs: { aV: [...attr], aLegA: [...w.rec.subarray(0, 4)], aLegB: [...w.rec.subarray(4, 8)], aWeb: [...w.rec.subarray(8, 12)] },
    uniforms: { world: IDENT, size: SIZE, lOff: [0, 0], mPass, tubeBase: base, tubeH: H, aaPad: AA, zK: zo.zK ?? 0, tube: 0 },
    natives: { ivec2: (a, b) => [a, b], texelFetch: (_t, at) => [0, (at[0] === 2 ? (at[1] === ids[1] ? zo.zB : zo.zA) : 0) ?? 0, 0, 0], PT: (id, i) => P(id, i), mRW: (id, i, pad) => Math.max(rads[ids.indexOf(id)][i], MIN_RADIUS) + pad },
  });
  const gp = res.gl_Position;
  return { x: ((gp[0] + 1) / 2) * SIZE[0], y: ((1 - gp[1]) / 2) * SIZE[1], f: 1 - ((gp[2] + 1) / 2 - base) / H, res, gp };
}

test('the interpreter reads the shader: its declarations and outputs', () => {
  assert.deepEqual(prog.outs.sort(), ['vC0', 'vC1', 'vD', 'vEnd', 'vG', 'vI', 'vJ0', 'vJ1', 'vJK', 'vMouthA', 'vMouthB', 'vRad', 'vRow']);
  assert.deepEqual(prog.attrs.sort(), ['aLegA', 'aLegB', 'aV', 'aWeb']);
});

test('the shader text and the JS twin agree on a table of vertices (every vertex of every synthetic web, and an empty web)', () => {
  const M = webIndex();
  let n = 0, worst = 0;
  const cases = [];
  for (const [name, make] of Object.entries(SCENES)) for (const w of webs(make()).list) cases.push([name, w]);
  // an empty web, and a record whose owner is forced to each leg
  const sc = scene([ray(0, 0, 90, 80, 3), ray(2, 0, 91, 80, 5)], []);
  const base = { PA: sc.P[0], RA: sc.R[0], PB: sc.P[1], RB: sc.R[1] };
  cases.push(['parallel', { ...base, rec: Float32Array.from([0, 0, 1, 1, 1, 0, 1, -1, 0.4, 14, 2, 0]) }]);
  const sc2 = scene([ray(0, 0, 0, 80, 3), ray(0, 0, 90, 80, 5)], []);
  for (const owner of [0, 1, 2]) cases.push([`owner ${owner}`, { PA: sc2.P[0], RA: sc2.R[0], PB: sc2.P[1], RB: sc2.R[1], rec: Float32Array.from([0, 0, 1, 1, 1, 0, 1, -1, 0.7, 14, owner, 0]) }]);
  for (const [name, w] of cases) {
    for (let v = 0; v < WEB_VERTS; v++) {
      const a = M.attr.subarray(v * 4, v * 4 + 4), zo = { zK: v >= WEB_STRIP ? 1 : 0, zA: 0.2, zB: 0.45 }, t = webVertex(w.PA, w.RA, w.PB, w.RB, w.rec, a, AA, zo), s = runVertex(w, a, { zo });
      const tag = `${name} vertex ${v}`;
      const near = (x, y, what) => { const e = Math.abs(x - y); worst = Math.max(worst, e); assert.ok(e < 1e-6, `${tag}: ${what} ${x} (shader) against ${y} (twin)`); };
      near(s.x, t.x, 'x'); near(s.y, t.y, 'y'); near(s.f, t.f, 'level');
      near(s.res.vD, t.vD, 'vD'); near(s.res.vG[0], t.gx, 'vG.x'); near(s.res.vG[1], t.gy, 'vG.y'); near(s.res.vRad, t.rad, 'vRad');
      assert.equal(s.res.vI, t.sample, `${tag}: vI`); assert.equal(s.res.vRow, t.ownB ? w.rec[4] : w.rec[0], `${tag}: vRow`);
      assert.deepEqual(s.res.vEnd, [-1, -1], `${tag}: vEnd`);
      n++;
    }
  }
  assert.ok(n >= 28 * 19);
  assert.ok(worst < 1e-6);
});

test('the shader draws no web in the glow, up-glow and shadow passes, and every web in the shape and lift passes', () => {
  const w = webs(SCENES.t90()).list[0], a = webIndex().attr.subarray(4, 8);
  for (const p of [MP.GLOW_K, MP.GLOW, MP.UP_K, MP.UP, MP.SHADOW_K, MP.SHADOW]) assert.deepEqual(runVertex(w, a, { mPass: p }).gp, [2, 2, 2, 1], `pass ${p}`);
  for (const p of [MP.SHAPE_K, MP.SHAPE, MP.LIFT]) assert.notDeepEqual(runVertex(w, a, { mPass: p }).gp, [2, 2, 2, 1], `pass ${p}`);
});

test('the polyline helper agrees with a 2-point case (the test helpers themselves)', () => {
  const p = polyline([[0, 0], [10, 0], [10, 10]], 1);
  assert.equal(p.P.length, N_SAMPLES * 2);
  assert.ok(polyDist(p.P, 5, 3) <= 3.2 && polyDist(p.P, 5, 3) >= 2.8);
});

test('the web shader writes exactly the varyings the lean fragment shader reads (name, type, flat)', async () => {
  const { tubeLeanFS } = await import('../src/ui/tube-lean-glsl.js');
  const K = { F_DIFFUSE: 2, F_EDGE: 64, F_SHADOW: 4, F_SPEC: 32, F_VEIL: 128, F_WHOLE: 256, F_SEL: 1, F_DOTTED: 8, F_NOCASE: 16, LIFT_EASE_MAX: 1, LIFT_EASE_SHARE: 1, LUMEN2: 32768, ROW2_BITS: 11, VEIL_K: 0.6, EDGE: '', ENT_W: 2048, N_SAMPLES: 64, MAX_TIERS: 20, S_OFF: 96, ALONG_GLSL: '' };
  const decl = (src, q) => [...src.matchAll(new RegExp(`^(flat )?${q} (\\w+) (\\w+);`, 'gm'))].map((m) => `${m[1] || ''}${m[2]} ${m[3]}`).sort();
  const ins = decl(tubeLeanFS(K), 'in'), outs = decl(VS, 'out');
  assert.ok(ins.length >= 6, `read ${ins}`);
  assert.deepEqual(outs, ins);
});

test('the wall strips: each fan edge from C to its tangent point is doubled two device pixels into its own leg, just over a lumen\'s level at its wall and under every taller lumen', () => {
  const M = webIndex();
  for (const name of ['t90', 'elbow', 'y']) for (const w of webs(SCENES[name]()).list) {
    const g = webGeometry(w.PA, w.RA, w.PB, w.RB, w.rec, AA);
    if (g.empty) continue;
    const V = (s, k) => webVertex(w.PA, w.RA, w.PB, w.RB, w.rec, M.attr.subarray((WEB_STRIP + s * WEB_STRIP_PTS + k) * 4, (WEB_STRIP + s * WEB_STRIP_PTS + k) * 4 + 4), AA);
    for (const [s, leg, T] of [[0, g.A, g.Ta], [1, g.B, g.Tb]]) {
      const c = V(s, 0), t = V(s, 1), ti = V(s, 2), ci = V(s, 3);
      assert.ok(Math.hypot(c.x - g.C[0], c.y - g.C[1]) < 1e-9, 'corner on C');
      assert.ok(Math.hypot(t.x - T[0], t.y - T[1]) < 1e-9, 'far edge on the arc\'s tangent point');
      // inside its leg: AA closer to the leg's centreline than its wall, perpendicular to the wall line
      const off = (q, p) => (q.x - p.x) * leg.n[0] + (q.y - p.y) * leg.n[1];
      assert.ok(Math.abs(off(ti, t) + AA) < 1e-9 && Math.abs(off(ci, c) + AA) < 1e-9, 'two device pixels inward');
      assert.ok(Math.abs((ti.x - t.x) * leg.d[0] + (ti.y - t.y) * leg.d[1]) < 1e-9, 'straight in');
      for (const q of [c, t, ti, ci]) { assert.equal(q.f, WEB_STRIP_LEVEL); assert.equal(q.vD, -AA); assert.ok(q.empty === false); }
    }
  }
  assert.ok(WEB_STRIP_LEVEL > WEB_LEVEL + 0.01 - 1e-12 && WEB_STRIP_LEVEL < TUBE_LEVEL.LUMEN0 + 0.02, 'over the fade band and the fan, within a hair of a lumen\'s wall level');
  const w = webs(SCENES.t90()).list[0], a = M.attr.subarray(WEB_STRIP * 4, WEB_STRIP * 4 + 4);
  assert.equal(webVertex(w.PA, w.RA, w.PB, w.RB, w.rec, a, AA, { zK: 1, zA: 0.4, zB: 0 }).f, WEB_STRIP_LEVEL + TUBE_LEVEL.LUMEN_H * 0.4, 'in the lobule it follows its own leg\'s z');
});
