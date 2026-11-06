// The organs and the liver shape: organ masks and cuts, sampling and morphing the liver, the diaphragm, ease and update of the organs.
// (moved out of stage.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)
import { ORGANS, SEAM_D } from './anatomy.js';
import { gpuProbe } from './gpu-probe.js';
import { LIVER_GEO } from './liver-geo-data.js';
import { nodularCells, nodularSites, seeded, strHash } from './liver-geo.js';
import { CIRR, contourNodules, fix1, liverField, liverSurface, morphOutline, outlineNormals, smooth01 } from './liver-morph.js';
import { DUO_A } from './organ-art.js';
import { bindShape, reshape, shapeSource } from './organ-paint.js';
import { cmdL, cmdM, cmdQ, cmdZ, cmdsReset, measurePath, newCmds, pathCmds } from './shape-gl.js';
import { clamp, s } from './util.js';

export function createOrgans(st, live) {
  const { FLUID_COLS, FLUID_R, GUT_DRAW, ascLvCut, defs, detailFor, frontCut, gOrgans, ghostCut, gutCut, organEls, organG, svg, thinCut } = st;
  for (const o of ORGANS) {
    const g = s('g', { class: 'organ organ-' + o.id + (o.tone ? ' tone-' + o.tone : '') });
    let el;
    if (o.circle) { const [cx, cy, r] = o.circle; el = s('circle', { cx, cy, r, class: o.cls, opacity: o.id === 'umbilicus' ? 0 : null }); g.append(el); }
    else if (o.art || o.id === 'esophagus') {
      // Drawn from its markup (the esophagus with the stomach, as one shape): the organ's own path stays, unpainted.
      el = s('path', { d: o.d, class: o.cls + ' org-key-path' });
      g.append(el);
      if (o.art) g.insertAdjacentHTML('beforeend', GUT_DRAW[o.art]);
      if (o.id === 'colon') g.setAttribute('mask', 'url(#rectFade)');   // the rectum runs down out of the frame: it fades away, as the esophagus does at the top
    } else if (o.band) {
      // Tubes (the appendix): a soft contact edge, the wall, the lumen in the tissue tone, a shaded underside.
      el = s('path', { d: o.d, class: o.cls + ' band-body' });
      g.append(s('path', { d: o.d, class: o.cls + ' band-ao' }), s('path', { d: o.d, class: o.cls + ' band-edge' }), el,
        s('path', { d: o.d, class: o.cls + ' band-under', transform: 'translate(1.5 3)' }));
    } else if (o.deco) { el = s('path', { d: o.d, class: o.cls }); g.append(el); }
    else {
      // The stomach is painted as one shape with the esophagus (SEAM_D); its own outline stays its organ path.
      const seam = o.id === 'stomach', d = seam ? SEAM_D : o.d;
      el = s('path', { d, class: o.cls + ' org-fill', fill: o.tone ? `url(#og-${o.tone})` : null });
      defs.insertAdjacentHTML('beforeend', `<clipPath id="clip-${o.id}"><path d="${d}"/></clipPath>`);
      const clip = `url(#clip-${o.id})`;
      g.append(s('path', { d, class: 'org-ao' }));
      if (seam) {
        // A base over all of it, the stomach's fill and volume on its own outline, then the esophagus's, fading over the cardia.
        const eso = ORGANS.find((q) => q.id === 'esophagus').d.replace('L 792 251', 'L 813 266 L 792 266');
        const sg = s('g', { 'clip-path': clip }), fade = s('g', { mask: 'url(#seamFade)' });
        el = s('path', { d: o.d, class: o.cls + ' org-fill', fill: `url(#og-${o.tone})` });
        fade.append(s('path', { d: eso, class: 'org-eso-fill', fill: 'url(#og-eso)' }), s('path', { d: eso, class: 'org-form', fill: 'url(#ogVol)' }));
        sg.append(el, s('path', { d: o.d, class: 'org-form', fill: 'url(#ogVol)' }), fade);
        g.append(s('path', { d, class: 'org-seam-base', fill: 'url(#seamS)' }), sg);
      } else g.append(el, s('path', { d, class: 'org-form', fill: 'url(#ogVol)' }));
      const dg = detailFor(o);
      if (dg) g.append(dg);
      // The inner shade is a soft ramp (three widening, fading strokes), never a hard band.
      for (const k of [1, 2, 3]) g.append(s('path', { d, class: 'org-shade s' + k, 'clip-path': clip, transform: 'translate(-3.5 -5)' }));
      g.append(
        s('path', { d, class: 'org-rimlight', 'clip-path': clip, transform: 'translate(2 3)' }),
        s('path', { d, class: o.cls + ' org-line' }));
      // The duodenum's first part lies over the stomach's tip in the stomach's own group, so stomach and duodenum read as one tube.
      if (seam) g.insertAdjacentHTML('beforeend', `<g clip-path="url(#du-Ac)"><g mask="url(#duFade)">${DUO_A}</g></g>`);
      if (seam) g.setAttribute('mask', 'url(#frontM)');
    }
    organEls[o.id] = el; organG[o.id] = g;
    if (o.art) {
      if (!live.gGut) { live.gGut = s('g', { class: 'organ organ-gut tone-gut', mask: 'url(#gutHide)' }); gOrgans.append(live.gGut); }
      live.gGut.append(g);
    } else gOrgans.append(g);
  }
  // (The gut's groups, in order, in one kept list: read at once by each caller, never kept.)
  const gutKidsOut = [];
  const gutKids = () => { gutKidsOut.length = 0; if (live.gGut) for (let k = live.gGut.firstElementChild; k; k = k.nextElementSibling) gutKidsOut.push(k); return gutKidsOut; };
  // The stomach's outline traced over the liver where the liver covers it (cirrhosis only: morphLiver), after the liver.
  const ghost = s('g', { class: 'org-ghost', mask: 'url(#ghostM)', style: 'display:none' });
  ghost.append(s('path', { d: SEAM_D, class: 'org-ghost-line' }));
  organG.liver.after(ghost);
  // The masks' copies of the liver and spleen follow them as they change size, every frame (as the diaphragm's cuts do).
  const liverCuts = [gutCut.liver, frontCut, ghostCut, ascLvCut];
  let maskShrink = NaN, maskLt = '', maskThin = '';   // (the shrink the transforms below were last made for, and their text)
  function syncOrganMasks(shrink, spleenT) {
    if (shrink !== maskShrink) {
      maskShrink = shrink;
      maskLt = `translate(560 350) scale(${shrink.toFixed(4)}) translate(-560 -350)`;
      maskThin = `translate(560 350) scale(${(1 / shrink).toFixed(5)}) translate(-560 -350)`;
    }
    for (let i = 0; i < liverCuts.length; i++) live.putA(liverCuts[i], 'transform', maskLt);
    live.putA(gutCut.spleen, 'transform', spleenT || '');
    // (lvThin is the liver's own mask, read in the liver's frame: the stomach's copy takes the shrink's inverse.)
    live.putA(thinCut, 'transform', maskThin);
  }
  // The organs a tap opens, as keyboard items of the figure (figKeys below): their focus shows as the organ's hover outline.
  const ORGAN_KEYS = [['heart', 'Right heart'], ['liver', 'Liver'], ['spleen', 'Spleen']];   // (the names the palette uses)
  svg.setAttribute('tabindex', '0');   // (the figure is one Tab stop: figKeys walks its vessels and organs)
  // The liver shows its disease in its form and surface, never as a pressure hue (hue is kept for
  // data). Healthy: a smooth, glossy capsule and a thin, sharp inferior edge. Congested: a
  // swollen, rounder, darker organ with a faint nutmeg mottle. Cirrhotic: a shrunken right lobe,
  // a larger left lobe, blunt edges, a tawny cast and a surface of regenerative nodules parted by
  // pale fibrous septa, firmer with severity. Shape and surface are drawn from one displacement
  // field, so every state blends continuously into the next.
  const liverD = ORGANS.find((o) => o.id === 'liver').d;
  const liverTint = s('path', { d: liverD, fill: 'url(#congest)', class: 'liver-tint' });
  // The liver's nodules, septa and congestion fade in with the disease; at 0 they are hidden too: at opacity 0 a clipped path
  // was still drawn into its own layer, the liver's size, on every repaint (the same pixels).
  const lvFade = (el, a) => { const o = a.toFixed(3), v = +o > 0 ? '' : 'hidden'; el.style.opacity = o; if (el.style.visibility !== v) el.style.visibility = v; };
  const lv = {
    gloss: s('g', { class: 'lv-gloss', 'clip-path': 'url(#clip-liver)' }),
    cong: s('path', { d: liverD, class: 'lv-cong', 'clip-path': 'url(#clip-liver)', style: 'opacity:0;visibility:hidden' }),
    isl: s('path', { class: 'lv-isl', 'clip-path': 'url(#clip-liver)', style: 'opacity:0;visibility:hidden' }),
    sep: s('path', { d: liverD, class: 'lv-sep', 'clip-path': 'url(#clip-liver)', style: 'opacity:0;visibility:hidden' }),
    nod: s('path', { class: 'lv-nod', 'clip-path': 'url(#clip-liver)', style: 'opacity:0;visibility:hidden' }),
  };
  // The capsule's sheen: broad soft reflections on the domes of both lobes.
  // The organs' dim and grey on the live drawing (syncOrganDim), over the plate's rectangle (PLATE_RECT), as the GPU copy has it.
  defs.insertAdjacentHTML('beforeend', '<filter id="organDim" filterUnits="userSpaceOnUse" x="200" y="-200" width="1020" height="1320" color-interpolation-filters="sRGB"><feColorMatrix type="matrix"/></filter>');
  defs.insertAdjacentHTML('beforeend', '<radialGradient id="lvSheen"><stop offset="0" class="lv-sh0"/><stop offset=".55" class="lv-sh1"/><stop offset="1" class="lv-sh2"/></radialGradient>');
  lv.gloss.append(s('ellipse', { cx: 468, cy: 236, rx: 118, ry: 34, transform: 'rotate(-6 468 236)', fill: 'url(#lvSheen)' }),
    s('ellipse', { cx: 752, cy: 262, rx: 66, ry: 16, transform: 'rotate(22 752 262)', fill: 'url(#lvSheen)' }));
  const shadeAt = organG.liver.querySelector('.org-shade');
  for (const el of [liverTint, lv.cong, lv.isl, lv.sep, lv.nod, lv.gloss]) organG.liver.insertBefore(el, shadeAt);
  const liverPaths = [...organG.liver.querySelectorAll('path')].filter((el) => el.getAttribute('d') === liverD);
  const liverClip = defs.querySelector('#clip-liver path');
  if (liverClip) liverPaths.push(liverClip);
  liverPaths.push(lv.sep);
  // The diaphragm is hidden under every organ it passes behind (the organs are see-through, and a
  // line showing through the heart or liver reads as a stray arc), with a little clearance. The
  // liver and spleen copies follow their organ's shape and size (liftDiaphragm).
  const diaMask = defs.querySelector('#diaMask');
  const diaCut = {};
  for (const o of ORGANS) if (['heart', 'heart-ra', 'esophagus', 'liver', 'stomach', 'spleen'].includes(o.id)) {
    diaCut[o.id] = s('path', { d: o.d, fill: '#000', stroke: '#000', 'stroke-width': 5, 'stroke-linejoin': 'round', 'data-cut': o.id });   // colour-exempt: a mask (black hides)
    diaMask.append(diaCut[o.id]);
  }
  liverPaths.push(diaCut.liver);
  liverPaths.push(gutCut.liver, frontCut, ghostCut, ascLvCut);   // (the masks' copies: the gut's cut, the stomach's see-through, the ghost line's, the ascites')
  // (Cirrhosis's reshaping of the liver, CIRR and liverField: liver-morph.js.)
  let liverKeyC = NaN, liverKeyG = NaN;   // (the two numbers liverKey was made of)
  const liverCmds = pathCmds(liverD);   // (the healthy outline as numbers, for the GPU painter: read once)
  // (The morphing outline's and nodules' numbers, and the records the painter is given them under, one each for every step of the morph, written in place.)
  const liverMorphCmds = newCmds(), nodMorphCmds = newCmds(), liverSrc = shapeSource(liverD, liverCmds), nodSrc = shapeSource('', nodMorphCmds);
  function sampleLiver() {
    // The outline and the nodules' sites, computed ahead for this artwork (liver-geo.js); live if the outline changed.
    const pre = LIVER_GEO.key === strHash(liverD) ? LIVER_GEO : null, n = 360;
    let L, pts = [];
    if (pre) { L = pre.L; for (let i = 0; i < n; i++) pts.push([pre.pts[i * 2], pre.pts[i * 2 + 1]]); }
    else {
      // (Measured in script (shape-gl.js measurePath), not by an element put in the page: 2 Nov 2026, no layout in a frame.)
      const mp = measurePath(liverD);
      L = mp.L;
      for (let i = 0; i < n; i++) pts.push(mp.at((L * i) / n));
    }
    const nm = outlineNormals(pts), nod = contourNodules(L, n);
    const sites = [];
    if (pre) for (let i = 0; i < pre.sites.length; i += 2) sites.push([pre.sites[i], pre.sites[i + 1]]);
    else sites.push(...nodularSites(pts));
    return { pts, nm, nod, cells: nodularCells(sites), isl: nutmegIslands(sites) };
  }
  // Congestion's nutmeg (organ picks, 20 Oct, "even dusk"): blood pools round each lobule's central vein and those dark zones
  // join from lobule to lobule, so the dark tone lies evenly over the whole liver (lv.cong); what stays pale are islands round
  // the portal tracts, at the lobules' corners. The lobules are the cells of the nodules' sites; the sites stop at y 540 (the
  // cirrhotic liver never reaches lower) but the congested liver reaches about 575, so the band just above that line is
  // mirrored below it. Each island is three-lobed, as the pale zone reaches out along the lobules' edges.
  function nutmegIslands(sites0) {
    const sites = sites0.slice();
    for (const [x, y] of sites0) if (y > 505 && y < 540) sites.push([x, 1080 - y]);
    const cells = nodularCells(sites), r = seeded(29);
    for (let i = 0; i < 36; i++) r();   // (the stream as the mock-up drew it: its first draws placed a size drift, unused here)
    const seen = new Map(), isl = [];
    for (const cl of cells) {
      let Rsum = 0;
      for (let i = 0; i < cl.v.length; i++) Rsum += Math.hypot(cl.v[i][0] - cl.x, cl.v[i][1] - cl.y);
      const R = Rsum / cl.v.length;
      for (const [x, y] of cl.v) {
        // corners the neighbouring lobules share come out a little apart: merge those within 2 units
        const gx = Math.floor(x / 3), gy = Math.floor(y / 3);
        let hit = null;
        for (let i = -1; i <= 1 && !hit; i++) for (let j = -1; j <= 1 && !hit; j++) { const bucket = seen.get((gx + i) * 10000 + gy + j); if (bucket) for (const o of bucket) if (Math.hypot(o.x - x, o.y - y) < 2) { hit = o; break; } }
        if (hit) continue;
        const o = { x, y, R }, key = gx * 10000 + gy;
        if (seen.has(key)) seen.get(key).push(o); else seen.set(key, [o]);
        isl.push(o);
      }
    }
    // lobules on the rim are cut open (no neighbour on one side), so their size overstates: capped near the typical one
    const Rs = isl.map((o) => o.R).sort((a, b) => a - b), Rcap = Rs[Math.floor(Rs.length / 2)] * 1.15;
    let d = '';
    for (const o of isl) {
      const rr = Math.min(o.R, Rcap) * 0.7 * (0.75 + 0.5 * r());
      if (rr < 0.6) continue;
      for (let j = 0; j < 6; j++) blobShape.k[j] = (j % 3 === 0 ? 1.15 : 0.62) + 0.45 * r();
      blobShape.a = r() * Math.PI;
      d += blobPath(blobShape, o.x, o.y, rr);
    }
    return d;
  }
  // A cell drawn as a rounded nodule: corners pulled in toward the site by the septum's half
  // width, then smoothed (quadratics through the edge midpoints).
  // (cmds: the same shape as numbers, for the GPU painter (organ-paint shapeSource), each the number its text says.)
  const cellPts = [];   // (a cell's corners pulled in, x then y, worked out for one cell at a time)
  let cellMx = '', cellMy = '';
  function cellMid(j, n) { const a = (j % n) * 2, q = ((j + 1) % n) * 2; cellMx = fix1((cellPts[a] + cellPts[q]) / 2); cellMy = fix1((cellPts[a + 1] + cellPts[q + 1]) / 2); }
  function cellPath(cl, c, w, cmds) {
    const [sx, sy] = liverField(cl.x, cl.y, c);
    const n = cl.v.length;
    for (let i = 0; i < n; i++) {
      const [x, y] = liverField(cl.v[i][0], cl.v[i][1], c), dx = x - sx, dy = y - sy, l = Math.hypot(dx, dy) || 1, k = Math.max(0.35, 1 - w / l);
      cellPts[i * 2] = sx + dx * k; cellPts[i * 2 + 1] = sy + dy * k;
    }
    cellMid(n - 1, n);
    let mx = cellMx, my = cellMy, d = `M${mx} ${my}`;
    cmdM(cmds, +mx, +my);
    for (let j = 0; j < n; j++) {
      const qx = fix1(cellPts[j * 2]), qy = fix1(cellPts[j * 2 + 1]);
      cellMid(j, n); mx = cellMx; my = cellMy;
      d += `Q${qx} ${qy} ${mx} ${my}`;
      cmdQ(cmds, +qx, +qy, +mx, +my);
    }
    cmdZ(cmds);
    return d + 'Z';
  }
  // A closed smooth blob (quadratics through the edge midpoints) of radius r at (x, y).
  const blobShape = { k: [0, 0, 0, 0, 0, 0], a: 0 };   // (the one blob nutmegIslands makes at a time: its six radii and its turn)
  const blobPts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  function blobMid(j) { const a = (j % 6) * 2, q = ((j + 1) % 6) * 2; return `${((blobPts[a] + blobPts[q]) / 2).toFixed(1)} ${((blobPts[a + 1] + blobPts[q + 1]) / 2).toFixed(1)}`; }
  function blobPath(b, x, y, r, sx = 1, sy = 1) {
    for (let j = 0; j < 6; j++) { const t = b.a + (j * Math.PI) / 3; blobPts[j * 2] = x + Math.cos(t) * r * b.k[j] * sx; blobPts[j * 2 + 1] = y + Math.sin(t) * r * b.k[j] * sy; }
    let d = 'M' + blobMid(5);
    for (let j = 0; j < 6; j++) d += `Q${blobPts[j * 2].toFixed(1)} ${blobPts[j * 2 + 1].toFixed(1)} ${blobMid(j)}`;
    return d + 'Z';
  }
  // (One kept buffer: the GPU is sent it whole each time it is written, and keeps no copy, setFluidLiver.)
  const lowerEdgeOut = new Float32Array(FLUID_COLS);
  function lowerEdge(P) {
    const out = lowerEdgeOut.fill(-1e4), k = (FLUID_COLS - 1) / FLUID_R[2];
    for (let i = 0; i < P.length; i++) {
      const [ax, ay] = P[i], [bx, by] = P[(i + 1) % P.length];
      const u0 = Math.ceil((Math.min(ax, bx) - FLUID_R[0]) * k), u1 = Math.floor((Math.max(ax, bx) - FLUID_R[0]) * k);
      for (let u = Math.max(0, u0); u <= Math.min(FLUID_COLS - 1, u1); u++) {
        const x = FLUID_R[0] + u / k, y = bx === ax ? Math.max(ay, by) : ay + (by - ay) * (x - ax) / (bx - ax);
        if (y > out[u]) out[u] = y;
      }
    }
    return out;
  }
  // (The steps morphLiver times, as functions taking their numbers as arguments: no closure is made for each step of an ease.)
  function liverWrite(d, src) { for (const el of liverPaths) { el.setAttribute('d', d); bindShape(el, src); } }
  function liverNodules(cn, c, nodCmds) {
    if (!(cn > 0.01)) return '';
    const cells = live.baseLiver.cells, w = (0.3 + 0.45 * c) * CIRR.sep;
    let nod = '';
    for (let i = 0; i < cells.length; i++) nod += cellPath(cells[i], c, w, nodCmds);
    return nod;
  }
  function nodWrite(nod, nodCmds) { lv.nod.setAttribute('d', nod); bindShape(lv.nod, reshape(nodSrc, nod, nodCmds)); }
  function morphLiver(cirr, cong, fine) {
    const q = fine ? 200 : 40;
    const c = Math.round(clamp(cirr, 0, 1) * q) / q, g = Math.round(clamp(cong, 0, 1) * q) / q;
    if (live.liverKey !== '' && c === liverKeyC && g === liverKeyG) return;   // (the key's text is made only when it moved)
    if (!live.baseLiver) { try { live.baseLiver = sampleLiver(); } catch { return; } if (!live.baseLiver.pts.length) { live.baseLiver = null; return; } }
    live.liverKey = c + ',' + g; liverKeyC = c; liverKeyG = g;
    // (?perf: the outline and nodules worked out, apart from writing them into the page: the browser's own work on them comes later.)
    const { out, dome } = gpuProbe.time(null, 'liver: outline (maths)', morphOutline, live.baseLiver, c, g);
    const f1 = fix1;
    // (Its commands too, for the GPU painter: the liver is painted from these numbers, never parsing or hashing the text.)
    let d = liverD, cmds = liverCmds;
    if (c + g > 0) {
      const xy = out.map(([x, y]) => [f1(x), f1(y)]);
      d = 'M' + xy.map(([x, y]) => `${x} ${y}`).join(' L') + ' Z';
      cmds = cmdsReset(liverMorphCmds);
      for (let i = 0; i < xy.length; i++) (i ? cmdL : cmdM)(cmds, +xy[i][0], +xy[i][1]);
      cmdZ(cmds);
    }
    const src = reshape(liverSrc, d, cmds);
    gpuProbe.time(null, 'liver: writes', liverWrite, d, src);
    live.liverDome = c + g > 0 ? dome : null;
    live.liverFloor = lowerEdge(c + g > 0 ? out : live.baseLiver.pts);
    if (live.veins && !live.veins.lost) live.veins.setFluidLiver(live.liverFloor);
    const surf = liverSurface(c);
    lv.gloss.style.opacity = surf.gloss.toFixed(3);
    // Regenerative nodules: tawny islands of mixed size parted by a network of pale fibrous
    // septa (the liver shows through the gaps, lightened). Flat, no shading; the septa widen and
    // the contrast firms with severity.
    const cn = surf.nod;
    // (They follow the cirrhosis alone: while only the congestion eases, they are neither worked out nor written again; recs B6.)
    const nk = cn > 0.01 ? c : -1;
    if (nk !== live.nodKey) {
      live.nodKey = nk;
      const nodCmds = cmdsReset(nodMorphCmds);
      const nod = gpuProbe.time(null, 'liver: nodules (maths)', liverNodules, cn, c, nodCmds);
      gpuProbe.time(null, 'liver: writes', nodWrite, nod, nodCmds);
    }
    // (The nodules show only while they have a shape (cn > 0.01, as liverNodules): shown with an empty d, the GPU's reading of the liver
    // took them as nothing and only another change of the liver's look read them again.)
    lvFade(lv.sep, cn); lvFade(lv.nod, cn > 0.01 ? cn : 0);
    // Nutmeg: the even dusky tone and its pale islands, fading in as congestion deepens.
    // (Written only when they come or go: the same islands throughout.)
    if ((g > 0.01) !== live.islOn) {
      live.islOn = g > 0.01;
      lv.isl.setAttribute('d', live.islOn ? live.baseLiver.isl : '');
      if (live.islOn) bindShape(lv.isl, (live.islSrc ||= shapeSource(live.baseLiver.isl, pathCmds(live.baseLiver.isl))));   // (read once)
    }
    const gn = smooth01(g / 0.5); lvFade(lv.cong, gn); lvFade(lv.isl, gn);
    // The ascites is kept off the liver as its congestion shows (over the dusky liver its straw turned the lower lobe into a
    // brown blotch; organ picks, round 26).
    live.liverFluidCut = smooth01(g / 0.5);
    ascLvCut.setAttribute('fill-opacity', live.liverFluidCut.toFixed(3));
    // (Only while it cuts anything: an unused mask would still be rasterized with the fluid on every frame it eases.)
    for (let i = 0; i < live.ascEls.length; i++) if (live.liverFluidCut > 0.001) live.putA(live.ascEls[i], 'mask', 'url(#ascLv)'); else live.ascEls[i].removeAttribute('mask');
    // The liver lies in front of the stomach and esophagus, which show through it at .65; as cirrhosis comes in (the
    // shrunken liver leaves them in plain view) they come back to full strength under it, the liver goes lighter over them
    // and their outline is traced over it (organ picks, 20 Oct).
    frontCut.setAttribute('fill-opacity', (0.35 * (1 - cn)).toFixed(3));
    thinCut.setAttribute('fill-opacity', (0.5 * cn).toFixed(3));
    if (cn > 0.01) organG.liver.setAttribute('mask', 'url(#lvThin)'); else organG.liver.removeAttribute('mask');
    ghost.style.display = cn > 0.01 ? '' : 'none';
    ghost.style.opacity = (0.55 * cn).toFixed(3);
  }
  return { ORGAN_KEYS, diaCut, ghost, gutKids, liverTint, lv, morphLiver, syncOrganMasks };
}
