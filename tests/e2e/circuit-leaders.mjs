// The Circuit's readings against the vessels (3 Nov 2026, "leaders crossing vessels": on the iPhone's zoomed Circuit, Azygos, MHV,
// Splenic vein, Spleen, Colon and Gut bed had leaders running through vessels and other readings, dots stood far from their words, and
// readings sat on vessels). In a real browser on the GPU path (software WebGL named as a GPU, scripts/shoot.mjs), at the Mac,
// the iPhone and the iPhone sideways, at the fitted view and zoomed in, with every station's reading on (labelLevel 'all'):
//   - no more than CROSS_MAX leaders run through a vessel they do not start on (seg-hits.js leaderVesselHits),
//   - no leader runs through another reading's words or crosses another leader,
//   - no two readings overlap,
//   - no leader is longer than LONG px (the farthest the solver sends a reading from its station),
//   - the readings that stand on a vessel (the solid halo, .on-vessel) number no more than the room leaves: ON_MAX per view.
//
//   node tests/e2e/circuit-leaders.mjs                       (all three devices, the repository's source)
//   DEV=iphone DIR=dist node tests/e2e/circuit-leaders.mjs   (one device, the build)
import { openApp } from '../../scripts/shoot.mjs';
import { leaderVesselHits, segSegDist } from '../../src/ui/seg-hits.js';

const LONG = 125, ON_MAX = Number(process.env.ON_MAX ?? 4);
// A station deep in the liver's bundle (MHV between RHV and LHV, an Azygos dot beside the great vein) cannot be reached by a leader that
// crosses no vessel at all, so a few leaders per view may cross one; no more. (3 Nov 2026: 3 on the iPhone sideways, zoomed. Lower it
// as the solver finds better spots.)
const CROSS_MAX = Number(process.env.CROSS_MAX ?? 3);
const DEVS = (process.env.DEV || 'mac,iphone,iphone-landscape').split(',');
const fails = [];
const fail = (m) => { fails.push(m); console.log(`FAIL ${m}`); };

/** Runs in the page: every shown station reading's box, its leader (as drawn), and the vessels, all in stage px. */
const READ = () => {
  const v = window.pps.stage.labelVessels();
  const labs = [...document.querySelectorAll('.lb-blocks g.lb')].filter((g) => /^n:/.test(g.dataset.key) && !g.classList.contains('lb-off') && g.style.display !== 'none').map((g) => {
    const b = g.getBoundingClientRect();
    return { key: g.dataset.key, x0: b.left - v.left, y0: b.top - v.top, x1: b.right - v.left, y1: b.bottom - v.top, onv: g.classList.contains('on-vessel') };
  });
  const leads = [...document.querySelectorAll('.lb-leaders path.leader')].filter((p) => /^n:/.test(p.dataset.k || '')).map((p) => {
    const n = (p.getAttribute('d').match(/-?[\d.]+/g) || []).map(Number);
    return { key: p.dataset.k, x0: n[0], y0: n[1], x1: n[2], y1: n[3] };
  });
  return { labs, leads, segs: v.segs, cam: window.pps.stage.cameraState() };
};

const crossBox = (sg, r, m) => {   // segment through the box shrunk by m (Liang-Barsky)
  const x0 = r.x0 + m, y0 = r.y0 + m, x1 = r.x1 - m, y1 = r.y1 - m;
  let t0 = 0, t1 = 1;
  const dx = sg.x1 - sg.x0, dy = sg.y1 - sg.y0;
  for (const [p, q] of [[-dx, sg.x0 - x0], [dx, x1 - sg.x0], [-dy, sg.y0 - y0], [dy, y1 - sg.y0]]) {
    if (!p) { if (q < 0) return false; continue; }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
    if (t0 > t1) return false;
  }
  return true;
};

export function audit({ labs, leads, segs }, tag) {
  const idx = { segs: segs.map(([x0, y0, x1, y1, hw, id]) => ({ x0, y0, x1, y1, hw, id })) };
  const out = [], crossing = [];
  for (const l of leads) {
    const len = Math.hypot(l.x1 - l.x0, l.y1 - l.y0);
    if (leaderVesselHits(idx, l.x0, l.y0, l.x1, l.y1, 1) > 0) crossing.push(l.key);
    if (len > LONG) out.push(`${tag}: ${l.key}'s leader is ${len.toFixed(0)} px (over ${LONG})`);
    for (const b of labs) if (b.key !== l.key && crossBox(l, b, 1)) out.push(`${tag}: ${l.key}'s leader runs through ${b.key}`);
    for (const o of leads) if (o.key < l.key && Math.hypot(o.x0 - l.x0, o.y0 - l.y0) > 4 && segSegDist(l.x0, l.y0, l.x1, l.y1, o.x0, o.y0, o.x1, o.y1) === 0) out.push(`${tag}: ${l.key}'s leader crosses ${o.key}'s`);
  }
  for (let i = 0; i < labs.length; i++) for (let j = i + 1; j < labs.length; j++) {
    const a = labs[i], b = labs[j];
    if (a.x0 < b.x1 - 1 && a.x1 > b.x0 + 1 && a.y0 < b.y1 - 1 && a.y1 > b.y0 + 1) out.push(`${tag}: ${a.key} and ${b.key} overlap`);
  }
  if (crossing.length > CROSS_MAX) out.push(`${tag}: ${crossing.length} leaders run through a vessel (most allowed ${CROSS_MAX}): ${crossing.join(' ')}`);
  const on = labs.filter((b) => b.onv).length;
  if (on > ON_MAX) out.push(`${tag}: ${on} readings stand on a vessel (most allowed ${ON_MAX}): ${labs.filter((b) => b.onv).map((b) => b.key).join(' ')}`);
  return { problems: out, summary: `${labs.length} readings, ${leads.length} leaders, ${crossing.length} through a vessel (${crossing.join(' ')}), ${on} on a vessel` };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const dev of DEVS) {
    const app = await openApp({ device: dev, theme: 'dark', query: '?preset=healthy', dir: process.env.DIR || '.' });
    const page = app.page;
    try {
      await page.evaluate(() => window.pps.store.set({ view: 'circuit', labelLevel: 'all' }));
      const vp = page.viewportSize();
      for (const [name, notches] of [['fit', 0], ['zoomed', 8]]) {
        await page.waitForFunction(() => !window.pps.stage.gliding() && document.querySelectorAll('.lb-blocks g.lb').length > 3, null, { timeout: 240000 });
        if (notches) {
          await page.mouse.move(vp.width * 0.75, vp.height * 0.5);
          for (let i = 0; i < notches; i++) { await page.mouse.wheel(0, -120); await page.waitForTimeout(400); }
        }
        await app.settle({ wait: 10, hold: true, max: 240 });
        const r = await page.evaluate(READ);
        const a = audit(r, `${dev} ${name}`);
        console.log(`${dev} ${name}: ${a.summary}`);
        for (const p of a.problems) fail(p);
        if (process.env.SHOT) await page.screenshot({ path: `${process.env.SHOT}-${dev}-${name}.png` });
        await page.evaluate(() => window.pps.host.send({ type: 'run', running: true }));
      }
    } finally { await app.close(); }
  }
  console.log(fails.length ? `${fails.length} problems` : 'circuit leaders ok');
  process.exit(fails.length ? 1 : 0);
}
