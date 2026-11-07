// Each lobule leader ends on its caption's box: no more than 5 px from it, judged from what the GPU drew (the caption snapshot) and the
// leaders' ends in the same px, at rest after the dive and after a zoom of the lobule's own camera (R17 caption half).
//
//   node tests/e2e/lobule-leaders.mjs [dir]       exit 1 on a leader more than 5 px from its caption; exit 2 when too little was drawn to judge
import { openApp } from '../../scripts/shoot.mjs';
import { leaderGaps } from './leader-gap.mjs';

const dir = process.argv[2] || '.';
const MAX = 5;
let failed = 0, inconclusive = 0;
const app = await openApp({ device: 'mac', theme: 'dark', query: '', dpr: 1, dir, timeout: 240000 });
const { page } = app;
try {
  await page.waitForFunction(() => !!window.pps?.store?.get().frame && !document.documentElement.dataset.boot, null, { timeout: 150000 });
  await page.evaluate(() => document.querySelector('#viewSeg [data-view=lobule]').click());
  await page.waitForFunction(() => window.pps.stage.lobuleOpen() && window.pps.stage.lobuleSettled(), null, { timeout: 240000, polling: 1000 });
  const judge = async (when, need = 2) => {
    // (Two snapshots a moment apart: the captions must have landed frames, and the same words must be drawn when the leaders are read.)
    await page.waitForFunction(() => (window.pps.stage.lobuleCaptions()?.items || []).filter((i) => i.a > 0.95).length >= 3, null, { timeout: 90000, polling: 500 }).catch(() => {});   // (software GL fades them in over several seconds)
    await page.waitForTimeout(1500);
    const r = await page.evaluate(() => ({ snap: window.pps.stage.lobuleCaptions(), ends: window.pps.stage.lobuleLeaderEnds() }));
    const { gaps, missing } = leaderGaps(r.snap, r.ends);
    if (!r.snap || !r.snap.seq || gaps.length < need) { inconclusive++; console.log(`INCONCLUSIVE ${when}: ${gaps.length} leader(s) with a caption drawn (seq ${r.snap?.seq ?? 0}; no caption for ${missing.join(', ') || 'none'})`); return; }
    for (const g of gaps) { if (g.gap > MAX) { failed++; console.log(`FAIL ${when}: ${g.key}'s leader ends ${g.gap.toFixed(1)} px from its caption (max ${MAX})`); } }
    console.log(`${when}: ${gaps.map((g) => `${g.key} ${g.gap.toFixed(1)}`).join(', ')}`);
  };
  await judge('at rest after the dive');
  await page.mouse.move(720, 450);
  await page.keyboard.down('Control');
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, -20); await page.waitForTimeout(250); }
  await page.keyboard.up('Control');
  await judge('after a zoom', 1);
} finally { await app.close(); }
console.log(failed ? `${failed} FAILED` : inconclusive ? 'INCONCLUSIVE' : 'ok');
process.exit(failed ? 1 : inconclusive ? 2 : 0);
