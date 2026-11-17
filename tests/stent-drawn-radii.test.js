// The stent's drawn lumen follows its geometry (17 Nov 2026): the radii the GPU gets (x.glR, which the stent's mesh follows too) narrow to the waist's
// diameter over the waist's length, mid stent, with its ends abrupt or tapered as set, and for an end stenosis at its end. The real stage in node (tests/stage-gl-boot.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { bootGL, pump } from './stage-gl-boot.js';

test('the drawn stent: waist diameter, length, mid position and ends in the radii', async () => {
  const { st, page } = await bootGL({ w: 1200, h: 800 });
  const { store } = await import('../src/ui/store.js');
  const { createCore } = await import('../src/worker-core.js');
  const tasks = () => new Promise((r) => setImmediate(r));
  let q = [];
  const core = createCore((m) => { if (m.type === 'frame') q.push(m); });
  await core.handle({ type: 'init' });
  await core.handle({ type: 'preset', id: 'cirr-decomp' });
  const base = JSON.parse(JSON.stringify(core.engine().params));
  const set = async (patch) => {
    const P = JSON.parse(JSON.stringify(base));
    Object.assign(P, { tips: { on: true, d: 10 }, stenosis: {}, stenosisSite: {} }, patch);
    await core.handle({ type: 'setParams', params: P, settle: true });
    store.set({ params: P });
  };
  let lastF = null;
  const step = async () => { pump(16.7); const f = q.at(-1); q = []; if (f) lastF = f; if (lastF) st.update(lastF); await tasks(); await tasks(); };
  const frames = async (n) => { for (let i = 0; i < n; i++) await step(); };
  await core.handle({ type: 'run', running: true });
  st.setView?.('anatomy');
  const radii = () => { const d = st.stentDrawn('TIPS', 63); return d?.r || null; };
  const norm = (r) => { const open = Math.max(...r.slice(8, r.length - 8)); return r.map((v) => v / open); };
  const narrowShare = (n, t = 0.8) => n.filter((v) => v < t).length / n.length;
  const centre = (n, t = 0.8) => { let a = 0, c = 0; n.forEach((v, i) => { if (v < t) { a += i; c++; } }); return c ? a / c / (n.length - 1) : -1; };

  const bracketRatio = (len) => {
    const d = page.document.querySelector('.clamp-span[data-id="TIPS~waist"]')?.getAttribute('d');
    if (!d) return 0;
    const pts = d.split(' M')[0].match(/-?[\d.]+/g).map(Number);
    let l = 0; for (let k = 2; k < pts.length; k += 2) l += Math.hypot(pts[k] - pts[k - 2], pts[k + 1] - pts[k - 1]);
    return l / len;
  };
  const both = (what) => {
    const d = st.stentDrawn('TIPS', 63), a = norm(d.r), m = norm(d.mesh);
    // The stent's mesh is as wide as the tube it sits in, sample by sample (within a little of the wall's half pixel).
    let worst = 0; for (let k = 0; k < a.length; k++) worst = Math.max(worst, Math.abs(a[k] - m[k]));
    if (worst >= 0.08) console.log("A", a.map((v) => v.toFixed(2)).join(" "), "\nM", m.map((v) => v.toFixed(2)).join(" "), "\nraw", d.r.length, d.r.slice(0, 5), d.mesh.slice(0, 5));
    assert.ok(worst < 0.08, `${what}: the stent's mesh follows the tube's radii, worst ${worst.toFixed(3)}`);
    // And what is drawn is what it is now: the stent's last build (its signature, the half-width at nine places) is the mesh's half-width at those places now.
    const drawn = d.meshSig.split('|').slice(2, 11).map(Number), R = d.mesh;
    assert.ok(drawn.length === 9 && drawn.every((v) => v > 0), `${what}: the stent is drawn (${d.meshSig})`);
    const hw = (u) => R[Math.round(u * 63)];
    const u0 = 1.5 / d.len;
    let stale = 0; drawn.forEach((v, i) => { stale = Math.max(stale, Math.abs(v - hw(u0 + (i / 8) * (1 - 2 * u0))) / Math.max(...R)); });
    assert.ok(stale < 0.12, `${what}: the drawn stent is not the one from before the change, ${stale.toFixed(3)}`);
    return { a, m, d };
  };
  const waistCase = async (waist, trans, red) => { await set({ stentGeom: { TIPS: { len: 8, waist, trans, red } } }); await frames(120); return both(`waist ${waist} trans ${trans}`); };

  // 1. A 4 cm waist at 60 %: half the stent, mid stent, down to 40 % of the lumen, the bracket as long, the mesh the same.
  let c = await waistCase(4, 0, 0.6);
  assert.ok(Math.abs(narrowShare(c.a) - 0.5) < 0.12, `a 4 cm waist of an 8 cm stent narrows half of it: ${narrowShare(c.a)}`);
  assert.ok(Math.abs(centre(c.a) - 0.5) < 0.08, `mid stent: ${centre(c.a)}`);
  assert.ok(Math.min(...c.a) < 0.5 && Math.min(...c.m) < 0.5, `down to the waist's lumen (40 %): ${Math.min(...c.a)}, mesh ${Math.min(...c.m)}`);
  // The bracket stands beside the narrowed stent, a hair off its drawn wall (it floated an open stent's width off it, 17 Nov): its middle point is near the mesh's half-width from the stent's centre.
  { const d = st.stentDrawn('TIPS', 63), br = page.document.querySelector('.clamp-span[data-id="TIPS~waist"]')?.getAttribute('d');
    assert.ok(br && d.centre, 'the bracket is drawn');
    const pts = br.split(' M')[0].match(/-?[\d.]+/g).map(Number), k = Math.floor(pts.length / 4) * 2;
    const dist = Math.hypot(pts[k] - d.centre[0], pts[k + 1] - d.centre[1]), hw = d.mesh[32];
    assert.ok(dist > hw && dist < hw + d.wall + 12, `the bracket is ${dist.toFixed(1)} from the centre line, the stent's half-width ${hw.toFixed(1)}`); }
  // 2. A 2 cm one: a quarter of it, and the stent's mesh follows the change (it was left as it was drawn, 17 Nov).
  c = await waistCase(2, 0, 0.6);
  assert.ok(Math.abs(narrowShare(c.a) - 0.25) < 0.1, `2 cm of 8: ${narrowShare(c.a)}`);
  assert.ok(Math.abs(narrowShare(c.m) - 0.25) < 0.1, `the mesh too: ${narrowShare(c.m)}`);
  assert.ok(Math.abs(centre(c.m) - 0.5) < 0.08, `still mid stent: ${centre(c.m)}`);
  // 3. Abrupt against tapered ends: the same waist with 1.5 cm of taper at each end has gentler steps and the mesh has them too.
  const steep = (n) => { let w = 0; for (let k = 1; k < n.length; k++) w = Math.max(w, Math.abs(n[k] - n[k - 1])); return w; };
  const abrupt = await waistCase(2, 0, 0.6), tapered = await waistCase(2, 1.5, 0.6);
  assert.ok(steep(tapered.a) < steep(abrupt.a) * 0.6, `tapered ends are gentler: ${steep(tapered.a).toFixed(3)} against ${steep(abrupt.a).toFixed(3)}`);
  assert.ok(steep(tapered.m) < steep(abrupt.m) * 0.6, `in the mesh too: ${steep(tapered.m).toFixed(3)} against ${steep(abrupt.m).toFixed(3)}`);
  assert.ok(narrowShare(tapered.a, 0.95) > narrowShare(abrupt.a, 0.95) + 0.1, 'the taper is longer');
  // 4. An end stenosis at the hepatic vein end narrows only that end, in the tube and in the mesh.
  await set({ stenosis: { TIPS: 0.5 }, stenosisSite: { TIPS: 'distal' }, stentGeom: { TIPS: { len: 8, waist: 0, trans: 0, red: 0 } } });
  await frames(120);
  c = both('distal stenosis');
  assert.ok(centre(c.a, 0.85) > 0.7, `the end's: ${centre(c.a, 0.85)}`);
  assert.ok(Math.min(...c.m) < 0.6, `the mesh narrows to half: ${Math.min(...c.m)}`);
  // 5. Both at once: the waist mid stent and the end stenosis at its end, each in the mesh.
  await set({ stenosis: { TIPS: 0.5 }, stenosisSite: { TIPS: 'distal' }, stentGeom: { TIPS: { len: 8, waist: 2, trans: 0, red: 0.6 } } });
  await frames(120);
  c = both('waist and stenosis');
  const endMin = Math.min(...c.m.slice(44)), midMin = Math.min(...c.m.slice(24, 40));
  assert.ok(midMin < 0.5 && endMin < 0.7, `the mesh has both: mid ${midMin}, end ${endMin}`);
});
