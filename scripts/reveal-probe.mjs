// Headless check of a revealing line (N3, src/ui/reveal.js) on the Circulation deck's first slide (software GL):
// each Next shows exactly one more clause, the lit labels grow with it, no card moves, Back takes the last clause away, a jump shows all.
//   node scripts/reveal-probe.mjs [--device mac|iphone] [--shots <dir>]
import { openApp } from './shoot.mjs';
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const app = await openApp({ device: arg('device', 'mac'), query: '?script=circulation&slide=1' });
const bad = [];
try {
  const pg = app.page;
  await app.settle({ vessels: false, wait: 15 });
  console.log('on', await pg.evaluate(() => document.querySelector('.pz-h')?.textContent));
  const read = () => pg.evaluate(() => {
    const box = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return [b.left, b.top, b.width, b.height].map((v) => +v.toFixed(1)); };
    const cl = [...document.querySelectorAll('.pz-line .pz-cl')];
    return { on: cl.filter((c) => c.classList.contains('on')).length, all: cl.length, hidden: cl.filter((c) => c.getAttribute('aria-hidden')).length,
      shownText: cl.filter((c) => c.classList.contains('on')).map((c) => c.textContent).join(''),
      op: cl.map((c) => +getComputedStyle(c).opacity), lit: document.querySelector('.app, #app')?.dataset.lit ?? null,
      labels: Object.keys(window.pps.store.get().presentTerms || {}).sort().join(','), line: box(document.querySelector('.pz-line')), text: box(document.querySelector('.pz-text')), data: box(document.querySelector('.pz-data')),
      pills: [...document.querySelectorAll('.pz-line .pz-cl.on .pz-term')].map((e) => e.textContent), bars: /\|/.test(document.querySelector('.pz-line')?.textContent || '') };
  });
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const check = (ok, msg) => { console.log(ok ? '  ok ' : '  BAD', msg); if (!ok) bad.push(msg); };
  const wait = (ms) => pg.waitForTimeout(ms);
  // (Opened on the outline; the first Next steps onto the slide going forward, which shows its first clause. Opened by a jump it shows all three.)
  const onSlide = (re) => pg.waitForFunction((src) => new RegExp(src).test(document.querySelector('.pz-h')?.textContent || '') && !document.querySelector('.pz-prep'), re.source, { timeout: 120000 });
  await pg.keyboard.press('ArrowRight');
  await onSlide(/Portal blood comes/); await wait(4000);
  const s0 = await read();
  console.log('opened', JSON.stringify({ on: s0.on, all: s0.all, labels: s0.labels, pills: s0.pills }));
  check(s0.all === 3 && s0.on === 1 && s0.hidden === 2, 'opens with clause 1 of 3 shown, the others transparent and hidden from a reader');
  check(!s0.bars, 'the | cuts do not show');
  check(s0.op[0] === 1 && s0.op[1] === 0 && s0.op[2] === 0, `opacity ${s0.op}`);
  const shots = arg('shots', '');
  if (shots) await pg.screenshot({ path: `${shots}/reveal-1.png` });
  let prev = s0;
  for (const k of [2, 3]) {
    await pg.keyboard.press('ArrowRight');
    await wait(1800);
    // (Software GL draws a frame in a second or more, and the fade runs on the frames: wait for it to end, up to 20 s.)
    await pg.waitForFunction((n) => [...document.querySelectorAll('.pz-line .pz-cl')].every((c, i) => +getComputedStyle(c).opacity === (i < n ? 1 : 0)), k, { timeout: 20000 }).catch(() => {});
    const s = await read();
    console.log(`Next -> clause ${k}`, JSON.stringify({ on: s.on, labels: s.labels, pills: s.pills, lit: s.lit }));
    check(s.on === k && s.all === 3, `Next ${k - 1}: exactly ${k} clauses shown`);
    check(s.shownText.length > prev.shownText.length && s.shownText.startsWith(prev.shownText), 'the new clause is added after the old, which stay');
    check(same(s.line, s0.line) && same(s.text, s0.text) && same(s.data, s0.data), 'no card moved or resized, the line did not reflow');
    check(s.op.slice(0, k).every((o) => o === 1) && s.op.slice(k).every((o) => o === 0), `settled opacities ${s.op}`);
    if (k === 2) check(s.labels.split(',').length > prev.labels.split(',').length && s.labels.includes('CONF'), `the lit station grew with the clause (${prev.labels} -> ${s.labels})`);
    if (shots) await pg.screenshot({ path: `${shots}/reveal-${k}.png` });
    prev = s;
  }
  await pg.keyboard.press('ArrowLeft');
  await wait(1800);
  const b = await read();
  console.log('Back', JSON.stringify({ on: b.on, labels: b.labels, pills: b.pills }));
  check(b.on === 2 && b.labels === prev.labels, 'Back takes the last clause away and stays on the slide (the pv term is still named by clause 2)');
  check(same(b.text, s0.text) && same(b.data, s0.data), 'no card moved on Back');
  const slideNow = await pg.evaluate(() => document.querySelector('.pz-h')?.textContent);
  check(/Portal blood comes/.test(slideNow), `still on the slide: ${slideNow}`);
  // rapid presses: Next Next lands on the last clause
  await pg.keyboard.press('ArrowLeft'); await pg.keyboard.press('ArrowRight'); await pg.keyboard.press('ArrowRight');
  await wait(2500);
  const r = await read();
  check(r.on === 3, `Back, Next, Next quickly lands whole: ${r.on} of 3`);
  // a fourth Next leaves the slide; coming back by Back shows it whole
  await pg.keyboard.press('ArrowRight'); await onSlide(/Gut blood crosses/); await wait(2000);
  await pg.keyboard.press('ArrowLeft'); await onSlide(/Portal blood comes/); await wait(3000);
  const j = await read();
  check(j.on === 3 && /Portal blood comes/.test(await pg.evaluate(() => document.querySelector('.pz-h')?.textContent)), `Back from the next slide opens it whole (${j.on} of 3)`);
} finally { await app.close(); }
if (bad.length) { console.log(`\n${bad.length} problem(s)`); process.exit(1); }
console.log('\nreveal probe: all fine (headless, software GL)');
