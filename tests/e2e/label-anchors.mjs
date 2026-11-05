// After a view is settled, every label's anchor dot stands on its station, on the vessel it names, and every leader joins its dot to its
// label (3 Nov 2026: after Anatomy -> Circuit the dots stood in empty space and the labels at the other view's places, leaders pointing at nothing).
// Read from what the page holds at rest: the leaders' and dots' attributes (the GPU draws them from these, no ride or carry at rest), the GPU
// label snapshot (stage.labelSnapshot), the station's point (stage.labelAnchorOf) and the vessels as the solver sees them (stage.labelVessels).
//
//   node tests/e2e/label-anchors.mjs [dir]       (cold Circuit load, then Anatomy -> Circuit, then Circuit -> Anatomy -> Circuit)
//   DEV=mac node tests/e2e/label-anchors.mjs
// Exit 1 on a failure; exit 2 (INCONCLUSIVE) when there was nothing to judge.
import { openApp } from '../../scripts/shoot.mjs';

const dir = process.argv[2] || '.', dev = process.env.DEV || 'mac';
let failed = 0, inconclusive = 0;
const fail = (m) => { failed++; console.log(`FAIL ${m}`); };

const READ = () => {
  const s = window.pps.stage, v = s.labelVessels(), snap = s.labelSnapshot();
  const dots = [...document.querySelectorAll('#labels .lb-leaders circle.leader-dot')].map((c) => ({ k: c.getAttribute('data-k'), x: +c.getAttribute('cx') + v.left, y: +c.getAttribute('cy') + v.top }));
  const lines = [...document.querySelectorAll('#labels .lb-leaders path.leader')].map((p) => {
    const m = /^M\s*([-\d.]+)\s+([-\d.]+)\s*L\s*([-\d.]+)\s+([-\d.]+)/.exec(p.getAttribute('d') || '');
    return m ? { k: p.getAttribute('data-k'), x0: +m[1] + v.left, y0: +m[2] + v.top, x1: +m[3] + v.left, y1: +m[4] + v.top } : null;
  }).filter(Boolean);
  const anchors = {};
  for (const d of dots) { const id = /^n:([A-Z_0-9]+)$/.exec(d.k || '')?.[1]; if (id) anchors[d.k] = s.labelAnchorOf(id); }
  return { dots, lines, anchors, segs: v.segs.map((q) => [q[0] + v.left, q[1] + v.top, q[2] + v.left, q[3] + v.top, q[4], q[5]]), items: snap.items, seq: snap.seq };
};

// Distance from a point to a segment.
const dseg = (px, py, [x0, y0, x1, y1]) => {
  const dx = x1 - x0, dy = y1 - y0, L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / L)) : 0;
  return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
};
export function judge(r, tag, { onVessel = true } = {}) {
  const out = [];
  const keyed = r.dots.filter((d) => r.anchors[d.k]);
  for (const d of keyed) {
    const a = r.anchors[d.k];
    if (Math.hypot(d.x - a.x, d.y - a.y) > 2.5) out.push(`${tag}: the dot of ${d.k} stands ${Math.hypot(d.x - a.x, d.y - a.y).toFixed(0)} px from its station`);
    else if (onVessel && r.segs.length) {
      const id = d.k.slice(2), near = Math.min(...r.segs.map((q) => dseg(a.x, a.y, q) - (q[4] || 0)));
      if (near > 12) out.push(`${tag}: the dot of ${d.k} (${id}) is ${near.toFixed(0)} px from any vessel`);
    }
  }
  for (const l of r.lines) {
    const dot = r.dots.find((d) => d.k === l.k && Math.hypot(d.x - l.x0, d.y - l.y0) < 14);
    const lab = r.items.find((i) => i.key === l.k);
    if (!dot && r.dots.some((d) => d.k === l.k)) out.push(`${tag}: the leader of ${l.k} does not start at its dot`);
    if (lab && (l.x1 < lab.x - 10 || l.x1 > lab.x + lab.w + 10 || l.y1 < lab.y - 10 || l.y1 > lab.y + lab.h + 10)) out.push(`${tag}: the leader of ${l.k} ends ${Math.round(Math.hypot(l.x1 - (lab.x + lab.w / 2), l.y1 - (lab.y + lab.h / 2)))} px from its label`);
    if (!lab) out.push(`${tag}: the leader of ${l.k} has no label drawn`);
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = await openApp({ device: dev, theme: 'dark', query: '?preset=healthy&view=circuit', dpr: 1, dir, timeout: 240000 });
  const page = app.page;
  page.setDefaultTimeout(240000);
  page.on('pageerror', (e) => fail(`page error: ${e.message}`));
  const settle = async () => {
    // (Until the labels' layout has landed and the frames agree: two reads of the same frame count are not a settle on software GL.)
    let last = -1, same = 0;
    for (let i = 0; i < 90 && same < 2; i++) {
      await page.waitForTimeout(1000);
      const s = await page.evaluate(() => { const c = window.pps.stage.labelCarry(); return [window.pps.stage.labelSnapshot().seq, c.laid, c.job]; });
      same = s[0] === last && s[1] && !s[2] ? same + 1 : 0; last = s[0];
    }
  };
  const view = (v) => page.evaluate((v) => document.querySelector(`#viewSeg [data-view="${v}"]`)?.click(), v);
  const check = async (tag) => {
    await settle();
    const r = await page.evaluate(READ);
    const o = judge(r, tag);
    console.log(`${tag}: ${r.dots.length} dots, ${r.lines.length} leaders, ${r.items.length} labels drawn, ${o.length} problems`);
    if (!r.dots.length || !r.items.length) { inconclusive++; console.log(`INCONCLUSIVE ${tag}: nothing drawn to judge`); }
    for (const m of o) fail(m);
  };
  try {
    await check('circuit, cold load');
    await view('anatomic'); await check('anatomy');
    await view('circuit'); await check('circuit after anatomy');
  } finally { await app.close().catch(() => {}); }
  console.log(failed ? `\n${failed} failed` : inconclusive ? '\nINCONCLUSIVE' : '\nlabel anchors and leaders ok');
  process.exit(failed ? 1 : inconclusive ? 2 : 0);
}
