// The motion budget, headless (merged GPU plan, item 1): for each motion in a list (a slide change in a deck, the Anatomy to Circuit
// switch), what the page asked of the main thread between the press and the settle: style and layout reads, DOM writes, WebGL contexts
// made and lost, and bytes uploaded, with the top readers and writes named (src/ui/motion-budget.js, on with ?budget=1). These are the
// app's own calls, the same on any engine, so a headless count stands for the phone's; its timings would not, and none are given.
//
//   node scripts/motion-budget.mjs [--device iphone|mac|...] [--only <name>] [--json <file>] [--check]
// --check compares each motion with tests/motion-budget.json and exits non-zero when one asks for more than its ceiling. The ceilings
// only go down (Mohammad, 2 Nov: "How can we have SVG and CPU do nothing!!!!"): the goal for every motion is 0 / 0 / 0.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openApp, CARDS_LANDED } from './shoot.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const device = arg('device', 'iphone'), only = arg('only', ''), out = arg('json', ''), check = process.argv.includes('--check');

// Each motion: the page to open, and the press. A deck's slide change waits for the cards before and after (they take a minute or
// more on software GL); the view switch waits a fixed 20 s, its morph's frames long done by then even at a frame a second.
export const MOTIONS = [
  { name: 'varices 2 to 3', query: '?script=varices&slide=2', press: 'ArrowRight' },
  { name: 'circuit 2 to 3', query: '?script=circuit&slide=2', press: 'ArrowRight' },
  { name: 'hvpg 3 to 4', query: '?script=hvpg&slide=3', press: 'ArrowRight' },
  { name: 'anatomy to circuit', query: '?preset=cirr-decomp', view: 'circuit' },
];

// (Before the press the organs' GPU picture must be up (gl-plate): until it lands the page shows its SVG organs, and a slide change then
// counts the SVG's greying and the organs' reading as if they were the change's own. On software GL the picture takes minutes.)
const plated = (page, max = 1200) => page.waitForFunction(() => document.querySelector('#stageView')?.classList.contains('gl-plate'), null, { timeout: max * 1000, polling: 1000 }).then(() => true, () => false);
const landed = async (page, max = 300) => {
  for (let ok = 0, t0 = Date.now(); Date.now() - t0 < max * 1000; await page.waitForTimeout(1000)) if ((ok = (await page.evaluate(CARDS_LANDED)) ? ok + 1 : 0) >= 2) return true;
  return false;
};

async function measure(m) {
  const q = `${m.query}${m.query.includes('?') ? '&' : '?'}budget=1`;
  const app = await openApp({ device, query: q, timeout: 300000 });
  try {
    await app.freeze();
    if (m.press) await landed(app.page); else await app.page.waitForTimeout(15000);
    const plate = await plated(app.page);
    // (And their pictures in: the switch from the organs painted live to their pictures reads every organ once, and a window that caught
    // it counted 556 reads for the view switch where one that did not counted 60. Not every deck gives the quiet frames they need.)
    await app.page.waitForFunction(() => window.pps.stage.organsPictured?.(), null, { timeout: 600000, polling: 1000 }).catch(() => {});
    await app.page.waitForTimeout(3000);   // (the slide's own settle: anything still easing finishes before the window opens)
    await app.page.evaluate(() => { window.__mb = window.pps.motionBudget.start('motion'); });
    if (m.press) { await app.page.keyboard.press(m.press); await app.page.waitForTimeout(2000); await landed(app.page); }
    else { await app.page.evaluate((v) => window.pps.store.set({ view: v }), m.view); await app.page.waitForTimeout(20000); }
    await app.page.waitForTimeout(1500);
    const r = await app.page.evaluate(() => window.pps.motionBudget.stop(window.__mb, 12));
    return { name: m.name, device, plate, ...r };
  } finally { await app.close(); }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const rows = [];
  for (const m of MOTIONS.filter((x) => !only || x.name === only)) {
    const r = await measure(m);
    rows.push(r);
    console.log(`${r.name} (${device}${r.plate ? '' : ', organs still on SVG at the press'}): ${r.reads} reads, ${r.writes} writes, ${r.made} contexts made (${r.lost} lost), ${(r.upload / 1024).toFixed(0)} KB in ${r.uploads} uploads, ${((r.alloc || 0) / 1024).toFixed(0)} KB of GPU room made in ${r.allocs || 0}`);
    console.log(`  readers: ${r.readers.map(([k, v]) => `${k} ${v}`).join(', ')}`);
    console.log(`  written: ${r.written.map(([k, v]) => `${k} ${v}`).join(', ')}`);
    console.log(`  uploaded (KB): ${(r.uploaders || []).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  }
  if (out) writeFileSync(out, JSON.stringify(rows, null, 2));
  if (check) {
    const caps = JSON.parse(readFileSync(resolve(ROOT, 'tests/motion-budget.json'), 'utf8'));
    const over = [];
    for (const r of rows) {
      const c = caps[device]?.[r.name];
      if (!c) { over.push(`${r.name}: no ceiling in tests/motion-budget.json`); continue; }
      for (const k of ['reads', 'writes', 'made']) if (r[k] > c[k]) over.push(`${r.name}: ${r[k]} ${k}, ceiling ${c[k]}`);
    }
    if (over.length) { console.error(`Motion budget over its ceiling:\n  ${over.join('\n  ')}`); process.exit(1); }
    console.log('Motion budget: every motion within its ceiling.');
  }
}
