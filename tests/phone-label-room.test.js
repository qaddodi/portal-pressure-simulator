// iPhone with the Tests card open (11 Nov 2026, 390 x 844, decompensated cirrhosis, Anatomy): the figure fitted above the card left the hepatic
// artery's dot 8 px above the portal vein's (the two read as an "8" beside "HA"), and an organ name could stand on a station's leader (the
// portal vein's through LIVER). Station dots keep DOT_ROOM apart (label-dots.js: the lower ranked slides along its vessel), and organ names keep
// off every shown leader (stage-label-solve.js, the organ names' spots).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOT_ROOM, spreadDots } from '../src/ui/label-dots.js';
import { OFF_NEAR, nameSpots, onOtherOrgan } from '../src/ui/organ-names.js';
import { ORGAN_LABELS } from '../src/ui/anatomy.js';
import { bootGL, pump } from './stage-gl-boot.js';

test('a dot too near another slides along its own vessel, the lower ranked one, and only as far as it must', () => {
  const line = [[0, 100], [200, 100]], at = (P, u) => [P[0][0] + (P[1][0] - P[0][0]) * u, P[0][1]];
  const pv = { key: 'n:CONF', ax: 100, ay: 108, pri: 10 }, ha = { key: 'n:HA', ax: 100, ay: 100, pri: 3 }, far = { key: 'n:RHV', ax: 300, ay: 300, pri: 8 };
  spreadDots([pv, ha, far], (it) => (it === ha ? line : null), at);
  assert.deepEqual([pv.ax, pv.ay], [100, 108], 'the higher ranked dot stays');
  assert.ok(Math.hypot(ha.ax - pv.ax, ha.ay - pv.ay) >= DOT_ROOM, 'the other clears it');
  assert.equal(ha.au, 0.42, 'at the nearest step along its vessel that does');
  assert.equal(far.au, undefined, 'a dot with room is left alone');
  const stuck = { key: 'n:X', ax: 100, ay: 104, pri: 1 };
  spreadDots([pv, stuck], () => null, at);
  assert.deepEqual([stuck.ax, stuck.ay, stuck.au], [100, 104, undefined], 'a dot that cannot slide stays');
});

test('an organ name knows when it lies on another organ, and has a spot near its own place off them (RIGHT ATRIUM off the esophagus)', () => {
  const [ex, ey] = [788, 60];   // (on the esophagus's strip, anatomy.js ORGANS: x 776 to 800 up there)
  const box = (x, y) => [x - 27, y - 18, x + 27, y + 18];   // (about RIGHT ATRIUM's two lines, world units)
  assert.equal(onOtherOrgan('Right atrium', ...box(ex, ey)), true, 'on the esophagus: another organ');
  assert.equal(onOtherOrgan('Esophagus', ...box(ex, ey)), false, 'its own organ is not');
  assert.equal(onOtherOrgan('Right atrium', 2000, 2000, 2010, 2010), false, 'nothing out there');
  const [, rx, ry] = ORGAN_LABELS.find((q) => q[0] === 'Right atrium');
  assert.ok(nameSpots('Right atrium').some(([x, y]) => Math.hypot(x - rx, y - ry) <= OFF_NEAR && !onOtherOrgan('Right atrium', ...box(x, y))), 'a spot near its place clear of the esophagus');
});

const H = 844, CARD = 380;
test('iPhone, Tests card open: no two station dots read as one, no leader through an organ name', async () => {
  const { st, page } = await bootGL({ w: 390, h: H, dpr: 3, coarse: true });
  const { createCore } = await import('../src/worker-core.js');
  const tasks = () => new Promise((r) => setImmediate(r));
  let q = [], last = null;
  const core = createCore((m) => { if (m.type === 'frame') q.push(m); });
  await core.handle({ type: 'init' });
  await core.handle({ type: 'preset', id: 'cirr-decomp' });
  await core.handle({ type: 'run', running: true });
  const step = async () => { pump(16.7); const f = q.at(-1); q = []; if (f) last = f; if (last) st.update(last); await tasks(); await tasks(); };
  st.setView?.('anatomy');
  // (The Tests card as the bottom card the camera fits the figure above: stage-fit.js reads [data-safe] blockers.)
  const d = page.document.createElement('section');
  Object.assign(d, { className: 'dock stage-blocker', id: 'dock', textContent: 'Tests' }); d.dataset.safe = 'bottom';
  d.getBoundingClientRect = () => ({ left: 0, top: H - CARD, right: 390, bottom: H, width: 390, height: CARD, x: 0, y: H - CARD });
  (page.document.querySelector('.app') || page.document.body).appendChild(d);
  dispatchEvent(new Event('resize'));
  for (let i = 0; i < 30; i++) await step();
  st.refit?.(); st.fit?.();
  for (let i = 0; i < 200; i++) await step();
  const sn = st.labelSnapshot();
  const items = sn.items.filter((x) => x.a > 0.5).map((x) => ({ k: x.key, b: [x.x, x.y, x.x + x.w, x.y + x.h], pin: x.pin ? [x.px, x.py] : null }));
  const dots = items.filter((o) => o.pin && o.k.startsWith('n:'));
  assert.ok(dots.some((o) => o.k === 'n:HA') && dots.some((o) => o.k === 'n:CONF'), `the hepatic artery and the portal vein are both called out (${JSON.stringify(items)})`);
  for (const a of dots) for (const b of dots) if (a.k < b.k) assert.ok(Math.hypot(a.pin[0] - b.pin[0], a.pin[1] - b.pin[1]) >= DOT_ROOM - 0.5, `${a.k} and ${b.k}: dots ${JSON.stringify([a.pin, b.pin])}`);
  const inBox = (x, y, b) => x > b[0] && x < b[2] && y > b[1] && y < b[3];
  for (const m of (sn.marks || []).filter((m) => m.a > 0.5 && m.kind === 'line')) {
    for (const o of items.filter((o) => o.k.startsWith('o:'))) {
      for (let t = 0; t <= 1; t += 0.02) assert.ok(!inBox(m.x0 + (m.x1 - m.x0) * t, m.y0 + (m.y1 - m.y0) * t, o.b), `${m.k}'s leader runs through ${o.k}`);
    }
  }
});
