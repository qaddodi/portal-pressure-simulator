// Browser checks 7 of 9, run for each device by smoke.mjs (PR-20: split from one 5,000-line file; the order of the checks is unchanged).
// From "thumb dock: the Tests card pulls up to Full and stays, and keeps its height across tabs" to "readout row: no word runs past the row, the bar or the screen, or under 12 px, and the readings spaced evenly, in Explore and the lobule".
// Run just these: SMOKE_MATCH='<part of a name>' node tests/e2e/smoke.mjs, or the whole set with SMOKE_DEVICE and SMOKE_SHARD (see smoke.mjs).
// Everything shared (the runner, the page helpers, the deck lists) arrives in the one argument; nothing here opens a browser itself.

export default async function register({ check, device, open, quiet, shot, tapTool }) {
  // A Tests card over the thumb dock has two heights, Half and Full, at any phone height (Safari's bars leave about 660 px): pulled
  // up from its tabs it stays at Full instead of snapping back, the grabber toggles Half and Full, and a tab keeps the height.
  if (device === 'phone') await check(device, 'thumb dock: the Tests card pulls up to Full and stays, and keeps its height across tabs', async (page) => {
    await page.setViewportSize({ width: 390, height: 664 });
    await open(page, '?preset=cirr-decomp');
    await page.waitForTimeout(800);
    await page.click('#thumbBar [data-tab="tests"]');
    await page.waitForTimeout(900);
    const box = () => page.evaluate(() => { const r = document.querySelector('#dock').getBoundingClientRect(); return { top: r.top, h: r.height }; });
    const full = await page.evaluate(() => { const a = document.querySelector('#app'), v = (k) => parseFloat(a.style.getPropertyValue(k)) || 0; return a.clientHeight - v('--top-safe') - v('--nb-occ') - 22; });
    const half = (await box()).h;
    // No grabber over the title or the tabs: the button is unseen and the head under it takes the touch.
    const grab = await page.evaluate(() => { const g = document.querySelector('#dock .sheet-grab'), r = g.getBoundingClientRect(), cs = getComputedStyle(g); return { op: +cs.opacity, hit: document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === g }; });
    if (grab.op > 0.01 || grab.hit) throw new Error(`the Tests card still shows a grabber over its head: ${JSON.stringify(grab)}`);
    if (half > full * 0.75 || half < full * 0.5) throw new Error(`Half is ${half} px of ${full}`);
    const tab = await page.evaluate(() => { const r = document.querySelectorAll('#dock [role=tab]')[2].getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
    await page.mouse.move(tab[0], tab[1]); await page.mouse.down();
    for (let i = 1; i <= 60; i++) await page.mouse.move(tab[0], tab[1] - 5 * i);   // (small steps: a mouse is not captured until the sheet moves)
    await page.mouse.up();
    await page.waitForTimeout(600);
    if (Math.abs((await box()).h - full) > 2) throw new Error(`pulled up, the card settled at ${(await box()).h} px, not ${full}`);
    await page.$eval('#dock .sheet-grab', (b) => b.click());   // (the keyboard's Half/Full button: no touch reaches it)
    await page.waitForFunction(() => !document.querySelector('#dock').getAnimations().length);   // (its height has finished easing)
    await page.waitForTimeout(600);
    if (Math.abs((await box()).h - half) > 2) throw new Error('the grabber does not return the card to Half');
    const before = await box();
    await page.evaluate(() => document.querySelector('#dock [data-instrument="abdomen"]').click());
    await page.waitForTimeout(800);
    const after = await box();
    if (Math.abs(after.top - before.top) > 1) throw new Error(`switching tab moved the card's top edge by ${after.top - before.top} px`);
  });
  // From Full a pull down settles the Tests card at Half, however fast (a flick included); only a second pull closes it. After the
  // finger lifts, every frame the card's slide and its cut are the same length (one value, --sink), so the part that would pass
  // the tab row is never drawn: on iOS a transform animated beside a clip-path ran ahead of it and showed over the tab row.
  if (device === 'phone') await check(device, 'thumb dock: a fast pull from Full settles at Half, a second pull closes, and the slide never outruns its cut', async (page) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, '?preset=cirr-decomp');
    await page.waitForTimeout(800);
    await page.click('#thumbBar [data-tab="tests"]');
    await page.waitForTimeout(900);
    const halfH = await page.evaluate(() => document.querySelector('#dock').getBoundingClientRect().height);
    await page.$eval('#dock .sheet-grab', (b) => b.click());   // (the keyboard's Half/Full button: no touch reaches it)
    await page.waitForFunction(() => !document.querySelector('#dock').getAnimations().length);   // (its height has finished easing)
    await page.waitForTimeout(600);
    const fullH = await page.evaluate(() => document.querySelector('#dock').getBoundingClientRect().height);
    await page.evaluate(() => {
      window.__bad = [];
      const cutLine = (cp) => { const i = cp.indexOf('polygon('); if (i < 0) return ''; const t = cp.slice(i + 8, cp.lastIndexOf(')')), pts = []; let d = 0, cur = '';
        for (const ch of t) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && !d) { pts.push(cur.trim()); cur = ''; } else cur += ch; } pts.push(cur.trim());
        const p = pts[7] || ''; let k = 0, sp = -1; for (let j = 0; j < p.length && sp < 0; j++) { if (p[j] === '(') k++; else if (p[j] === ')') k--; else if (p[j] === ' ' && !k) sp = j; } return sp < 0 ? '' : p.slice(sp + 1); };   // (the cut's y, from the card's top: the end of its straight run, where the right corner's arc meets it)
      // (a length, a percentage of the card's height, or a calc() of them with max()/min(), as a computed cut reads)
      const px = (v, el) => Function(`return ${String(v).trim().replace(/calc\(/g, '(').replace(/(max|min)\(/g, 'Math.$1(').replace(/(-?[\d.]+)%/g, `($1 / 100 * ${el.offsetHeight})`).replace(/(-?[\d.]+)px/g, '$1')}`)() || 0;
      const tick = () => { const c = document.querySelector('#dock'), cs = getComputedStyle(c);
        if (c.offsetParent) {
          const ty = px(cs.translate.split(' ')[1] || '0', c), cut = c.offsetHeight - px(cutLine(cs.clipPath), c) + 8;
          if (Math.abs(ty - cut) > 0.5) window.__bad.push(`slide ${ty} vs cut ${cut} (the line 8 px under the card's edge)`);
        }
        window.__sinkRaf = requestAnimationFrame(tick); };
      tick();
    });
    const flick = async () => {
      const g = await page.evaluate(() => { const r = document.querySelector('#dock .sheet-grab').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
      await page.mouse.move(g[0], g[1]); await page.mouse.down();
      for (let i = 1; i <= 4; i++) await page.mouse.move(g[0], g[1] + 8 + 60 * i);
      await page.mouse.up();
      await page.waitForTimeout(700);
    };
    // A slow pull from Full shrinks the card: its foot stays on the tab row and its top follows the finger (it never slides down).
    {
      const r0 = await page.evaluate(() => { const r = document.querySelector('#dock').getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; });
      const x = 195, y = r0.top + 30;
      await page.mouse.move(x, y); await page.mouse.down();
      for (let i = 1; i <= 10; i++) await page.mouse.move(x, y + 8 * i);
      await page.waitForTimeout(50);
      const mid = await page.evaluate(() => { const c = document.querySelector('#dock'), r = c.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, ty: parseFloat(getComputedStyle(c).translate.split(' ')[1]) || 0 }; });
      if (Math.abs(mid.bottom - r0.bottom) > 1 || Math.abs(mid.ty) > 0.5) throw new Error(`a pull from Full slid the card down instead of shrinking it: ${JSON.stringify({ r0, mid })}`);
      if (Math.abs(mid.top - (r0.top + 80)) > 3) throw new Error(`the card's top did not follow the finger: ${mid.top - r0.top} px for 80`);
      for (let i = 11; i <= 4 * 10 + 30; i++) await page.mouse.move(x, y + 8 * i);
      await page.mouse.up();
      await page.waitForTimeout(700);
      const h = await page.evaluate(() => document.querySelector('#dock').getBoundingClientRect().height);
      if (Math.abs(h - halfH) > 2) throw new Error(`released past Half, the card settled at ${h} px, not Half (${halfH})`);
      await page.$eval('#dock .sheet-grab', (b) => b.click());
      await page.waitForFunction(() => !document.querySelector('#dock').getAnimations().length);
      await page.waitForTimeout(600);
    }
    await flick();
    const st = await page.evaluate(() => ({ open: document.querySelector('#app').classList.contains('dock-open'), h: document.querySelector('#dock').getBoundingClientRect().height }));
    if (!st.open) throw new Error('a fast pull from Full closed the Tests card instead of settling at Half');
    if (Math.abs(st.h - halfH) > Math.abs(st.h - fullH)) throw new Error(`a pull from Full settled at ${st.h} px, not Half (${halfH}; Full ${fullH})`);
    await flick();
    // (The close lands when the card's 220 ms sink ends, by its frames or its timer: on a CI runner whose frames take seconds
    // that can be later than the flick's fixed 700 ms wait, which had failed this check on a card that did close. It must
    // still close, within a few seconds.)
    if (!(await page.waitForFunction(() => !document.querySelector('#app').classList.contains('dock-open'), null, { timeout: 5000 }).then(() => true, () => false))) throw new Error('a second pull, from Half, did not close the Tests card');
    const bad = await page.evaluate(() => { cancelAnimationFrame(window.__sinkRaf); return [...new Set(window.__bad)].slice(0, 3); });
    if (bad.length) throw new Error(`the card's slide and cut came apart: ${bad.join('; ')}`);
  });

  // A stent's Proximal, Mid and Distal tiles under the Doppler trace are the sample-spot buttons (no dropdown); a tap or Enter moves the gate.
  await check(device, 'Doppler stent tiles pick the sample spot', async (page) => {
    await open(page, '?preset=cirr-decomp');
    await page.waitForTimeout(800);
    await page.evaluate(() => window.pps.updateParams((p) => { p.tips.on = true; return p; }, { label: 'TIPS' }));
    if (device === 'phone') { await page.click('#thumbBar [data-tab="tests"]'); await page.waitForTimeout(900); await page.evaluate(() => document.querySelector('#dock [data-instrument="doppler"]').click()); }
    else await page.evaluate(() => window.pps.dock.show('doppler'));
    await page.waitForTimeout(1200);
    await page.selectOption('#pane-doppler .dop-vessel', 'TIPS');
    await page.waitForFunction(() => window.pps.store.get().frame.probe === 'TIPS' && document.querySelector('#pane-doppler .dop-seg').closest('div').offsetParent, null, { timeout: 30000 });
    if (await page.$('#pane-doppler .dop-gate')) throw new Error('the stent Doppler still has a separate spot dropdown');
    const tap = (sel) => (device === 'phone' ? page.tap(sel) : page.click(sel));
    // (The figure's TIPS callout points at the sampled third: its anchor dot moves along the stent with the gate.)
    const dots = () => page.evaluate(() => [...document.querySelectorAll('circle.leader-dot:not(.ld-gone)')].map((c) => `${c.getAttribute('cx')},${c.getAttribute('cy')}`).join(' '));
    const anchors = {};
    for (const seg of ['proximal', 'distal', 'mid']) {
      await tap(`#pane-doppler .dop-seg[title*="${seg}"]`);
      await page.waitForFunction((x) => window.pps.store.get().dopGate === x && document.querySelector(`#pane-doppler .dop-seg[title*="${x}"]`).getAttribute('aria-pressed') === 'true', seg, { timeout: 8000 });
      if (device !== 'phone') {
        await page.waitForFunction((x) => document.querySelector('[data-key="n:TIPS"]')?.textContent.includes(`TIPS ${x}`), seg, { timeout: 8000 });
        await page.waitForTimeout(300);
        anchors[seg] = await dots();
      }
    }
    if (device !== 'phone' && (anchors.proximal === anchors.distal || anchors.mid === anchors.distal)) throw new Error('the TIPS callout stays put when the Doppler gate moves along the stent');
    await page.focus('#pane-doppler .dop-seg[title*="distal"]');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.pps.store.get().dopGate === 'distal', null, { timeout: 8000 });
    await page.waitForTimeout(400);
    await shot(page, `${device}-doppler-stent-tiles`);
  });
  // TIPS Doppler's stent slides (the three points, the narrowed stent, where it narrows, the reopened stent) call out the stent's
  // velocity at all three points, each reading what the Doppler's tile for that point reads, and only the sampled one in green.
  await check(device, 'presenter TIPS Doppler: the stent slides call out all three points, matching the Doppler tiles', async (page) => {
    // (On a phone, each slide twice: as it opens, and with its data card's monitor open, which moves the figure: a point slid off its
    // dot's line by the open card got past the check once: Review 16 Oct.)
    // (The slides are found by name: their numbers went stale when two slides were added before them (the check then stood on slides with
    // no points and found nothing to fail on), and the presenter's buttons are waited for, as they arrive after the figure.)
    const { DECKS, withOverview } = await import(new URL('../../src/ui/decks.js', import.meta.url));
    const tips = withOverview(DECKS.find((d) => d.id === 'tips-doppler'));
    for (const id of ['jet', 'narrow', 'fix']) for (const unfold of device === 'phone' ? [false, true] : [false]) {
      const n = tips.slides.findIndex((s) => s.id === id) + 1;
      if (!n) throw new Error(`TIPS Doppler has no slide "${id}"`);
      await open(page, `?script=tips-doppler&slide=${n}`);
      await page.waitForFunction(() => document.querySelectorAll('.pz-abb').length > 0, null, { timeout: 60000 });
      if (unfold) {
        const folded = await page.evaluate(() => { const f = document.querySelector('.pz-data:not(.pz-hide):not([hidden]) .pz-fold'); if (!f?.getClientRects().length || f.getAttribute('aria-expanded') !== 'false') return false; f.click(); return true; });
        if (!folded) continue;
        await page.waitForFunction(() => document.querySelector('.pz-data .pz-fold')?.getAttribute('aria-expanded') === 'true');
        await quiet(page);
      }
      const at = unfold ? `slide ${n} (monitor open)` : `slide ${n}`;
      const picks = await page.$$eval('.pz-abb', (b) => b.length);
      let first = null;
      for (let k = 0; k < picks; k++) {
        await page.evaluate((k) => document.querySelectorAll('.pz-abb')[k].click(), k);
        // (A phone's data card may fold behind its Show control on a slide whose words are long: the callouts are then only counted.)
        const ok = await page.waitForFunction((phone) => {
          const tiles = Object.fromEntries([...document.querySelectorAll('.pz-data .dop-stats > div')].filter((d) => !d.hidden && d.getClientRects().length)
            .map((d) => [d.querySelector('dt').textContent.trim().toLowerCase(), parseFloat(d.querySelector('dd').textContent)]));
          const shown = [...document.querySelectorAll('#labels g.lb[data-key^="n:TIPS:"]')].filter((g) => g.style.display !== 'none' && !g.classList.contains('lb-off'));
          if (shown.length !== 3 || shown.filter((g) => g.querySelector('.lb-gate')).length !== 1) return false;
          // (Where no tiles show (a phone's folded card; the Mac's and iPad's card now shows the monitor alone) there is nothing to match them to, and
          // the callouts are only counted, once the green one is the point just picked; the monitor's own number is matched to it below.)
          if (!Object.keys(tiles).length) { const st = window.pps.store.get(), gate = st.dopGate === 'site' ? st.params.stenosisSite?.TIPS || 'distal' : st.dopGate; return !!shown.find((g) => g.querySelector('.lb-gate'))?.dataset.key.endsWith(gate); }
          // (A phone names them short: "Prox 99 cm/s".)
          const names = { tipsproximal: 'proximal', tipsmid: 'mid', tipsdistal: 'distal', prox: 'proximal', mid: 'mid', dist: 'distal' };
          return shown.every((g) => { const m = g.textContent.match(/^(TIPS ?(?:proximal|mid|distal)|Prox|Mid|Dist)\s*([\d.]+)/); return m && tiles[names[m[1].replace(/ /g, '').toLowerCase()]] === parseFloat(m[2]); });
        }, device === 'phone', { timeout: 30000 }).then(() => true, () => false);
        if (!ok) {
          const got = await page.evaluate(() => [...document.querySelectorAll('#labels g.lb[data-key^="n:TIPS"]')].map((g) => `${g.textContent}${g.classList.contains('lb-off') || g.style.display === 'none' ? ' (hidden)' : ''}`).join(', '));
          throw new Error(`TIPS Doppler ${at}, button ${k + 1}: the stent's three callouts are not all shown or disagree with the Doppler tiles (${got || 'none'})`);
        }
        // (Measured once the labels hold still: two readings half a second apart agree, so a camera still gliding is not measured.)
        await page.waitForFunction(() => { const now = JSON.stringify(window.pps.stage.labelClearance()), same = now === window.__tipsClear; window.__tipsClear = now; return same; }, null, { polling: 500, timeout: 30000 }).catch(() => {});
        // (The green name is the point the Doppler samples. After review, 15 Oct: the three stand in order on one side of the stent,
        // distal at the top, each 16 px at most from its own dot, and none covers another label, a mark or the "60 %", which reads 12 px
        // at least; and they keep their places when another point is picked.)
        const got = await page.evaluate(() => {
          const g = document.querySelector('#labels g.lb[data-key^="n:TIPS:"] .lb-gate')?.closest('g.lb'), st = window.pps.store.get();
          const gate = st.dopGate === 'site' ? st.params.stenosisSite?.TIPS || 'distal' : st.dopGate;   // (a gate on the narrowing samples the third it sits in)
          const box = (e) => e.getBoundingClientRect(), meet = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
          const pts = Object.fromEntries(['proximal', 'mid', 'distal'].map((p) => [p, document.querySelector(`#labels g.lb[data-key="n:TIPS:${p}"]`)]));
          const rs = Object.fromEntries(Object.entries(pts).map(([p, e]) => [p, box(e)]));
          const others = [...document.querySelectorAll('#labels g.lb:not(.lb-off)')].filter((e) => !e.dataset.key?.startsWith('n:TIPS:') && e.style.display !== 'none' && !e.dataset.key?.startsWith('o:'));
          const clamps = [...document.querySelectorAll('.clamp-label')];
          // (The figure's own leader dots: the lobule view's, hidden behind it, stand wherever its labels would and are none of the stent's.)
          const dots = [...document.querySelectorAll('.lb-leaders .leader-dot:not(.ld-gone)')].map((d) => { const r = box(d); return [(r.left + r.right) / 2, (r.top + r.bottom) / 2]; });
          const far = (r) => Math.min(...dots.map(([x, y]) => Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom))));
          const err = [], list = Object.values(rs), cx = (r) => (r.left + r.right) / 2;
          if (list.some((a, i) => list.some((b, j) => j > i && meet(a, b)))) err.push('two callouts overlap');
          if (!(rs.distal.top < rs.mid.top && rs.mid.top < rs.proximal.top)) err.push('the callouts are not in order, distal at the top');
          const own = (r) => dots.reduce((m, d) => (Math.hypot(Math.max(r.left - d[0], 0, d[0] - r.right), Math.max(r.top - d[1], 0, d[1] - r.bottom)) < Math.hypot(Math.max(r.left - m[0], 0, m[0] - r.right), Math.max(r.top - m[1], 0, m[1] - r.bottom)) ? d : m), dots[0] || [0, 0]);
          const sides = list.map((r) => Math.sign(cx(r) - own(r)[0]));
          if (new Set(sides).size > 1) err.push('the callouts are not all on one side of the stent');
          // (Only the jet may stand farther, just past its narrowing's arrow on its dot's line: 8 px beyond the arrow at most. An arrow's box
          // reaches the dot's line from one side, so it counts within 2 px of it.)
          const arrows = [...document.querySelectorAll('path.clamp')].map(box);
          const reach = (r) => { const [x, y] = own(r); return Math.max(16.5, ...arrows.filter((a) => a.top - 2 <= y && y <= a.bottom + 2 && (cx(r) > x ? a.left >= x - 2 && a.left < r.left : a.right <= x + 2 && a.right > r.right)).map((a) => (cx(r) > x ? a.right - x : x - a.left) + 8)); };
          for (const [p, r] of Object.entries(rs)) if (far(r) > reach(r)) err.push(`${p} stands ${Math.round(far(r))} px from its dot`);
          // (Level with its own dot, where the dots stand far enough apart for three level callouts.)
          const ys = list.map((r) => own(r)[1]).sort((a, b) => a - b);
          if (ys.every((y, i) => !i || y - ys[i - 1] >= 28)) for (const [p, r] of Object.entries(rs)) if (Math.abs((r.top + r.bottom) / 2 - own(r)[1]) > 4) err.push(`${p} is not level with its dot (${Math.round((r.top + r.bottom) / 2 - own(r)[1])} px)`);
          // (The slide's mark (Narrowing, Stent) still shows, moved off the column, not dropped or under a card.)
          const mk = [...document.querySelectorAll('#labels g.lb[data-key^="focus"]')].filter((e) => e.style.display !== 'none');
          if (st.focus && !mk.some((e) => !e.classList.contains('lb-off'))) err.push("the slide's mark is not shown");
          for (const [p, r] of Object.entries(rs)) for (const o of [...others, ...clamps]) if (meet(r, box(o))) err.push(`${p} covers "${o.textContent.trim().slice(0, 16)}"`);
          for (const c of clamps) if (box(c).height && parseFloat(getComputedStyle(c).fontSize) * (c.getScreenCTM()?.a || 1) < 11.5) err.push('the "60 %" reads under 12 px');
          if (!g.dataset.key.endsWith(gate)) err.push(`the green callout (${g.textContent}) is not the sampled ${gate}`);
          // (Review 16 Oct: the slide's pill and the "60 %" keep 2 px off every vessel as drawn; a pill with no such spot is ringed in the
          // stage's colour instead, 2 px at least. The three callouts read through their own solid halo.)
          for (const r of window.pps.stage.labelClearance()) {
            if (!r.shown || /^n:(TIPS|DIPS):/.test(r.key)) continue;
            if (r.ring ? r.ring < 2 : r.clear < 2) err.push(`${r.key.replace(/^focus\d*/, 'the mark ').replace(/^60%:.*/, 'the "60 %"')} is ${r.clear} px from ${r.vessel}${r.ring ? ` with a ${r.ring} px ring` : ''}`);
          }
          return { err, at: Object.fromEntries(Object.entries(rs).map(([p, r]) => [p, [Math.round(r.left), Math.round(r.top)]])) };
        });
        // (The monitor's number is the green callout's. Both follow the live trace and tick a moment apart, so they are read until they agree
        // at one reading, ten seconds at most, then no longer.)
        const agree = () => { const mon = document.querySelector('.pz-data .dop-vel > b'), g = document.querySelector('#labels g.lb[data-key^="n:TIPS:"] .lb-gate')?.closest('g.lb'); return !mon?.getClientRects().length || !g || Math.abs(parseFloat(mon.textContent.replace('−', '-'))) === parseFloat(g.querySelector('.lb-val')?.textContent); };
        const apart = await page.waitForFunction(agree, null, { polling: 'raf', timeout: 10000 }).then(() => '', () => page.evaluate(() => `the monitor reads ${document.querySelector('.pz-data .dop-vel > b').textContent}, the green callout ${document.querySelector('#labels g.lb[data-key^="n:TIPS:"] .lb-gate').closest('g.lb').textContent}`));
        if (apart) got.err.push(apart);
        if (got.err.length) throw new Error(`TIPS Doppler ${at}, button ${k + 1}: ${[...new Set(got.err)].join('; ')}`);
        // (The "narrow" and "fix" slides move or open the narrowing itself with the pick; elsewhere only the sampled point changes, and nothing moves.)
        if (id !== 'narrow' && id !== 'fix' && k && Object.entries(got.at).some(([p, [x, y]]) => Math.abs(x - first[p][0]) > 2 || Math.abs(y - first[p][1]) > 2)) throw new Error(`TIPS Doppler ${at}, button ${k + 1}: a callout moved when another point was picked (${JSON.stringify(first)} → ${JSON.stringify(got.at)})`);
        if (!k) first = got.at;
      }
    }
  });
  // A narrowing's "60 %" stands whole, 2 px clear of every callout, label and arrow on the figure, and inside the stage: on the TIPS
  // slides with a narrowing (a stent called out at its three points puts the "60 %" on the side the callouts leave free; a redraw of the
  // marks had put it back beside the arrows, under the distal callout, with its "%" hidden: Mohammad, 22 Oct). The slides are found by
  // name, and the check waits for the labels to hold still, as the callout check above does.
  await check(device, 'presenter TIPS Doppler: the narrowing\'s "60 %" keeps clear of every callout, label and arrow', async (page) => {
    const { DECKS, withOverview } = await import(new URL('../../src/ui/decks.js', import.meta.url));
    const tips = withOverview(DECKS.find((d) => d.id === 'tips-doppler'));
    for (const id of ['narrow']) {
      await open(page, `?script=tips-doppler&slide=${tips.slides.findIndex((s) => s.id === id) + 1}`);
      await page.waitForFunction(() => document.querySelector('.clamp-label') && document.querySelectorAll('#labels g.lb[data-key^="n:TIPS:"]:not(.lb-off)').length === 3, null, { timeout: 60000 });
      await page.waitForFunction(() => { const now = JSON.stringify(window.pps.stage.labelClearance()), same = now === window.__tipsClear; window.__tipsClear = now; return same; }, null, { polling: 500, timeout: 30000 }).catch(() => {});
      const bad = await page.evaluate(() => {
        const box = (e) => e.getBoundingClientRect(), meet = (a, b, g) => a.left - g < b.right && b.left - g < a.right && a.top - g < b.bottom && b.top - g < a.bottom;
        const lab = document.querySelector('.clamp-label'), r = box(lab), err = [], st = box(document.querySelector('#labels'));
        if (lab.textContent.trim() !== '60%') err.push(`the label reads "${lab.textContent}"`);
        // (The "60 %" reads in the labels' own name size: the same as "TIPS distal" beside it, 12 px at least, at the text size set.)
        const px = parseFloat(getComputedStyle(lab).fontSize) * lab.getScreenCTM().a, name = parseFloat(document.querySelector('#labels g.lb[data-key="n:TIPS:distal"] tspan')?.getAttribute('font-size'));
        if (!(Math.abs(px - name) < 0.5 && px >= 11.95)) err.push(`the "60 %" reads ${px.toFixed(1)} px, the callouts' names ${name} px`);
        if (getComputedStyle(lab).fontWeight !== '600') err.push(`the "60 %" is weight ${getComputedStyle(lab).fontWeight}, the names 600`);
        if (r.left < st.left || r.right > st.right || r.top < st.top || r.bottom > st.bottom) err.push('the "60 %" is not inside the stage');
        const others = [...document.querySelectorAll('#labels g.lb')].filter((e) => e.style.display !== 'none' && !e.classList.contains('lb-off'));
        for (const o of others) if (meet(r, box(o), 2)) err.push(`the "60 %" touches "${o.textContent.trim().slice(0, 20)}"`);
        for (const a of document.querySelectorAll('path.clamp')) if (meet(r, box(a), 2)) err.push('the "60 %" touches an arrow of its clamp');
        return err;
      });
      if (bad.length) throw new Error(`TIPS Doppler "${id}": ${[...new Set(bad)].join('; ')}`);
    }
  });
  // Every phone card and sheet, driven by real touches (the path iOS takes), at the Home Screen app's height and Safari's: a short
  // pull eases back, a pull from Full (slow or a flick) settles at Half, a pull or flick from Half closes, and a new touch while the
  // card is still easing (back, to Half, or away) takes it over. Every frame, every card's slide equals its cut and nothing of a
  // card is drawn on the tab row or below it (the cut is the tab row's top, 8 px under the card's resting edge).
  for (const H of [844, 664]) if (device === 'phone') await check(device, `thumb dock: every card and sheet pulls, flicks and closes by touch behind the tab row (${H} px)`, async (page) => {
    await page.setViewportSize({ width: 390, height: H });
    await open(page, '?preset=cirr-decomp');
    await page.waitForTimeout(800);
    await page.evaluate(() => window.pps.store.set({ role: 'instructor' }));
    const cdp = await page.context().newCDPSession(page);
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    await page.evaluate(() => {
      window.__bad = [];
      const cutLine = (cp) => { const i = cp.indexOf('polygon('); if (i < 0) return ''; const t = cp.slice(i + 8, cp.lastIndexOf(')')), pts = []; let d = 0, cur = '';
        for (const ch of t) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && !d) { pts.push(cur.trim()); cur = ''; } else cur += ch; } pts.push(cur.trim());
        const p = pts[7] || ''; let k = 0, sp = -1; for (let j = 0; j < p.length && sp < 0; j++) { if (p[j] === '(') k++; else if (p[j] === ')') k--; else if (p[j] === ' ' && !k) sp = j; } return sp < 0 ? '' : p.slice(sp + 1); };   // (the cut's y, from the card's top: the end of its straight run, where the right corner's arc meets it)
      // (a length, a percentage of the card's height, or a calc() of them with max()/min(), as a computed cut reads)
      const px = (v, el) => Function(`return ${String(v).trim().replace(/calc\(/g, '(').replace(/(max|min)\(/g, 'Math.$1(').replace(/(-?[\d.]+)%/g, `($1 / 100 * ${el.offsetHeight})`).replace(/(-?[\d.]+)px/g, '$1')}`)() || 0;
      const tick = () => {
        const b = document.querySelector('#thumbBar').getBoundingClientRect();
        for (const f of [0.1, 0.5, 0.9]) for (const y of [b.top + 4, b.bottom + 3, innerHeight - 1]) { const e = document.elementFromPoint(b.left + b.width * f, y); const c = e?.closest('#treatCard, #dock, #panel, .menu, .action-card'); if (c) window.__bad.push(`${c.id || c.className} on the tab row`); }
        for (const c of document.querySelectorAll('#treatCard:not([hidden]), #app.dock-open #dock, #app.panel-open #panel, .menu.as-sheet, .action-card.docked:not([hidden])')) {
          const cs = getComputedStyle(c), cut = cutLine(cs.clipPath), ty = px(cs.translate.split(' ')[1] || '0', c);
          if (Math.abs(ty - (c.offsetHeight - px(cut, c) + 8)) > 0.5) window.__bad.push(`${c.id || c.className}: slide ${cs.translate} vs cut ${cut} (the line 8 px under the card's edge)`);
        }
        window.__raf = requestAnimationFrame(tick);
      };
      tick();
    });
    const CARDS = [['tests', '#dock', true], ['treat', '#treatCard', true], ['details', '#panel', true], ['history', '.menu.as-sheet:not(.leaving)', false], ['layers', '.menu.as-sheet:not(.leaving)', false], ['settings', '.menu.as-sheet:not(.leaving)', false]];
    const isOpen = (sel) => page.evaluate((sel) => { const c = document.querySelector(sel); return !!c && !c.hidden && (c.id !== 'dock' || document.querySelector('#app').classList.contains('dock-open')) && (c.id !== 'panel' || document.querySelector('#app').classList.contains('panel-open')); }, sel);
    const height = (sel) => page.evaluate((sel) => document.querySelector(sel).getBoundingClientRect().height, sel);
    const openIt = async (tab, sel) => {
      if (tab === 'details') { await page.click('#thumbBar [data-tab="settings"]'); await page.locator('.menu-item', { hasText: 'Advanced physiology' }).click(); }
      else await page.click(`#thumbBar [data-tab="${tab}"]`);
      await page.waitForFunction((sel) => { const c = document.querySelector(sel); return c && !c.getAnimations().length; }, sel);
      await page.waitForTimeout(500);
    };
    // A pull from near the card's top edge (the grabber or the sheet's padding), in `steps` moves `ms` apart; `hold` keeps the
    // finger down at the end before lifting (so it is not a flick).
    const pull = async (sel, dy, { steps = 12, ms = 25, hold = 0 } = {}) => {
      const r = await page.evaluate((sel) => { const b = document.querySelector(sel).getBoundingClientRect(); return [b.left + b.width / 2, b.top + 16]; }, sel);   // (the card's head: no grabber takes a touch)
      await touch('touchStart', r[0], r[1]);
      for (let i = 1; i <= steps; i++) { await touch('touchMove', r[0], r[1] + dy * i / steps); if (ms) await page.waitForTimeout(ms); }
      if (hold) await page.waitForTimeout(hold);
      await touch('touchEnd');
    };
    const flick = (sel, dy = 260) => pull(sel, dy, { steps: 4, ms: 0 });
    const expectOpen = async (sel, want, what) => {
      // (a busy browser can take a while to finish easing: wait up to 5 s for the state, then a moment for it to hold)
      for (let t = 0; t < 50 && (await isOpen(sel)) !== want; t++) await page.waitForTimeout(100);
      await page.waitForTimeout(300);
      if ((await isOpen(sel)) === want) return;
      const st = await page.evaluate((sel) => { const c = document.querySelector(sel), r = c?.getBoundingClientRect(); return c ? `top ${Math.round(r.top)}, height ${Math.round(r.height)}, sink ${c.style.getPropertyValue('--sink') || 0}` : 'gone'; }, sel);
      throw new Error(`${what}: the card is ${want ? 'closed' : 'still open'} (${st})`);
    };
    // A vessel's and an organ's card: whole, 8 px above the tab row, with the play bar stepped aside; it closes behind its own edge.
    for (const sel of [{ type: 'edge', id: 'SV_MID' }, { type: 'organ', id: 'liver' }, { type: 'organ', id: 'spleen' }]) {
      await page.evaluate((s) => window.pps.store.set({ selection: s }), sel);
      await page.waitForFunction(() => { const c = document.querySelector('.action-card'); return !c.hidden && !c.getAnimations().length; });
      const v = await page.evaluate(() => { const c = document.querySelector('.action-card').getBoundingClientRect(), t = document.querySelector('#thumbBar').getBoundingClientRect(); return { gap: Math.round(t.top - c.bottom), top: Math.round(c.top), bar: [...document.querySelectorAll('#vdock > :not(.thumb-bar):not(.vd-status)')].some((e) => +getComputedStyle(e).opacity > 0.05) }; });
      if (Math.abs(v.gap - 8) > 1) throw new Error(`the ${sel.id} card ends ${v.gap} px above the tab row, not 8`);
      if (v.top < 60) throw new Error(`the ${sel.id} card runs up to ${v.top} px`);
      if (v.bar) throw new Error(`the play bar shows over the ${sel.id} card`);
      // (Fit is in the Layers tab's menu and the view switch is the dock's first line, under the card, so nothing floats over the figure above it.)
      if (await page.evaluate(() => !!document.querySelector('#zoomPill')?.offsetParent || !document.querySelector('#nbViews').contains(document.querySelector('#viewSeg')))) throw new Error(`Fit floats above the ${sel.id} card, or the view switch left the dock`);
      if (await page.evaluate(() => getComputedStyle(document.querySelector('.action-card .ac-close')).display !== 'none')) throw new Error(`the ${sel.id} card has an X`);
      await pull('.action-card .ac-top', 160, { hold: 100 });   // (no X: a pull down puts it away)
      await page.waitForFunction(() => document.querySelector('.action-card').hidden, null, { timeout: 10000 })
        .catch(() => { throw new Error(`a pull down did not close the ${sel.id} card`); });
    }
    for (const [tab, sel, sizes] of CARDS.filter(([t]) => !process.env.SMOKE_CARDS || process.env.SMOKE_CARDS.includes(t))) {
      const name = `${tab} at ${H} px`;
      await openIt(tab, sel);
      const h0 = await height(sel);
      await pull(sel, 24, { hold: 150 });
      await expectOpen(sel, true, `${name}, a short pull`);
      if (Math.abs((await height(sel)) - h0) > 2) throw new Error(`${name}: a short pull changed the height`);
      if (sizes) {
        for (const how of ['slow', 'flick', 'regrab']) {
          await page.$eval(`${sel} :is(.sheet-grab, .panel-grab)`, (b) => b.click());   // (the keyboard's Half/Full button)
          await page.waitForFunction((sel) => !document.querySelector(sel).getAnimations().length, sel);   // (its height has finished easing)
          await page.waitForTimeout(500);
          // (Full, waited for: a slow runner's frames can run late; it still has to get there, and to stay.)
          await page.waitForFunction(([sel, h0]) => document.querySelector(sel).getBoundingClientRect().height >= h0 + 20, [sel, h0], { timeout: 5000 }).catch(() => {});
          const full = await height(sel);
          if (full < h0 + 20) throw new Error(`${name}: the grabber did not open Full (${Math.round(full)} px, Half ${Math.round(h0)})`);
          if (how === 'slow') await pull(sel, 300, { steps: 20, hold: 150 });
          else await flick(sel);
          if (how === 'regrab') { await page.waitForTimeout(60); await pull(sel, 20, { hold: 150 }); }   // (caught while it eases to Half)
          await expectOpen(sel, true, `${name}, a ${how} pull from Full`);
          const h = await height(sel);
          if (Math.abs(h - h0) > Math.abs(h - full)) throw new Error(`${name}: a ${how} pull from Full settled at ${h} px, not Half (${h0})`);
        }
      }
      // From Half (or a sheet's one height): a short pull caught again while it eases back and pulled on closes it.
      await pull(sel, 30, { hold: 150 });
      await page.waitForTimeout(60);
      if (sizes || tab !== 'history') await pull(sel, 320, { steps: 20, hold: 150 });
      else await flick(sel);
      await expectOpen(sel, false, `${name}, a pull from Half`);
      // And a flick from Half closes it.
      await openIt(tab, sel);
      await flick(sel);
      await expectOpen(sel, false, `${name}, a flick from Half`);
    }
    const bad = await page.evaluate(() => { cancelAnimationFrame(window.__raf); return [...new Set(window.__bad)].slice(0, 4); });
    if (bad.length) throw new Error(bad.join('; '));
  });
  // The Doppler tab of a phone's Tests card: the Peak, Trough, Pulsatility and CI tiles are on top of the play bar at Half and at Full
  // (the play bar once covered the card's bottom edge), and the one-line note under them shows only at Full.
  if (device === 'phone') await check(device, 'thumb dock: Doppler tiles show at Half and Full, the note only at Full', async (page) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, '?preset=cirr-decomp');
    await page.waitForTimeout(800);
    await page.click('#thumbBar [data-tab="tests"]');
    await page.waitForTimeout(900);
    await page.evaluate(() => document.querySelector('#dock [data-instrument="doppler"]').click());
    await page.waitForFunction(() => document.querySelector('#dock .dop-stats > div:not([hidden]) dd')?.textContent.trim(), null, { timeout: 60000 });
    const look = () => page.evaluate(() => {
      const tiles = [...document.querySelectorAll('#dock .dop-stats > div:not([hidden])')], note = document.querySelector('#dock .dop-note');
      // (the play bar's parts and the tab row are what could be drawn over a tile: each must be clear of it or invisible)
      const over = (t) => { const a = t.getBoundingClientRect(); return [...document.querySelectorAll('.vdock > *')].some((e) => { const r = e.getBoundingClientRect(); return +getComputedStyle(e).opacity > 0.05 && r.width && r.top < a.bottom && r.bottom > a.top; }); };
      return { n: tiles.length, covered: tiles.filter(over).length, note: note.textContent.trim() && getComputedStyle(note).display !== 'none' };
    });
    await page.waitForTimeout(600);
    let v = await look();
    if (v.n < 4 || v.covered) throw new Error(`at Half ${v.n} Doppler tiles, ${v.covered} covered`);
    if (v.note) throw new Error('the Doppler note shows at Half');
    await page.$eval('#dock .sheet-grab', (b) => b.click());   // (the keyboard's Half/Full button: no touch reaches it)
    await page.waitForFunction(() => !document.querySelector('#dock').getAnimations().length);   // (its height has finished easing)
    await page.waitForTimeout(900);
    v = await look();
    if (v.n < 4 || v.covered) throw new Error(`at Full ${v.n} Doppler tiles, ${v.covered} covered`);
    if (!v.note) throw new Error('the Doppler note is missing at Full');
  });
  // History sits beside Treat and Tests in a laptop's top bar (not in the play bar) and opens as a card on the right, in Treat's place.
  if (device === 'desktop') await check(device, 'History: a top-bar button beside Tests, its card on the right in Treat\'s place', async (page) => {
    await open(page, '?preset=cirr-decomp');
    await page.waitForTimeout(800);
    if (await page.evaluate(() => !!document.querySelector('.vdock .tl-hist')?.offsetParent)) throw new Error('History is still in the play bar');
    const order = await page.$$eval('.top-right > button', (els) => els.filter((e) => e.offsetParent).map((e) => e.id));
    if (order.indexOf('btnHistory') !== order.indexOf('tabInstruments') + 1) throw new Error(`History is not beside Tests: ${order.join(', ')}`);
    await page.click('#btnHistory');
    await page.waitForSelector('#historyCard:not([hidden]) :is(.tl-pop-row, .tl-pop-empty)');   // (a new patient may have no event yet: events wait for breath-averaged readings)
    const r = await page.evaluate(() => { const c = document.querySelector('#historyCard').getBoundingClientRect(); return innerWidth - c.right; });
    if (r > 40) throw new Error(`the History card sits ${Math.round(r)} px from the right edge`);
    await tapTool(page, '#btnTreat');
    await page.waitForSelector('#treatCard:not([hidden])');
    if (await page.evaluate(() => !document.querySelector('#historyCard').hidden)) throw new Error('History stayed open under Treat');
    await page.click('#btnHistory');
    await page.waitForSelector('#treatCard', { state: 'hidden' });
    await page.keyboard.press('Escape');
    await page.waitForSelector('#historyCard', { state: 'hidden' });
  });
  // Nothing that floats over the figure may cover another floating piece, or leave the screen, at the
  // sizes the owner tests on (laptop, iPad both ways, iPhone both ways), in Explore, with the
  // instruments, and with the patient chart and the instruments together.
  // The bottom bar's key readouts: every name, value and rating stays on one line inside its tile, the lines under each other never
  // overlap, on a phone the ratings sit left-aligned under their values with the tiles side by side at one height, and different
  // readings (a healthy patient, a decompensated one) never change a tile's size or place.
  await check(device, 'bottom bar: nothing wraps, clips or overlaps, and the readouts keep their place as values change', async (page) => {
    const sizes = device === 'desktop' ? [[1440, 900], [1180, 820], [1024, 768], [820, 1180]] : [[390, 844], [360, 740], [320, 568], [375, 667], [430, 932], [844, 390]];
    const read = () => page.evaluate(() => {
      const strip = document.querySelector('#strip');
      const tiles = [...strip.querySelectorAll('.metric')].filter((e) => e.offsetWidth && getComputedStyle(e).display !== 'none');
      const R = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; };
      return { tiles: tiles.map((m) => {
        const parts = ['.k', '.v', '.rb', '.s'].map((q) => m.querySelector(q)).filter((e) => e && e.offsetWidth).map((e) => ({ q: e.className.split(' ')[0], ...R(e), clip: e.scrollWidth > e.clientWidth + 1 && !e.classList.contains('rb') }));
        return { id: m.dataset.id, ...R(m), parts, sNode: R(m.querySelector('.s .status') || m.querySelector('.s')) };
      }), strip: R(strip) };
    });
    for (const [w, hgt] of sizes) {
      await page.setViewportSize({ width: w, height: hgt });
      const seen = [];
      for (const q of ['?preset=cirr-decomp', '?preset=healthy']) {
        await open(page, q);
        await page.waitForTimeout(900);
        const r = await read();
        const where = `${w}x${hgt} ${q}`;
        if (r.tiles.length < 2) throw new Error(`${where}: fewer than two readouts show`);
        for (const t of r.tiles) {
          for (const p of t.parts) if (p.clip) throw new Error(`${where}: the ${p.q} of "${t.id}" is clipped or wraps (${Math.round(p.w)} px)`);
          // (Side by side on one line, as on a Mac's slim play row, or stacked: two lines overlap only where their boxes cross.)
          for (let i = 1; i < t.parts.length; i++) if (t.parts[i].t < t.parts[i - 1].b - 0.5 && t.parts[i].l < t.parts[i - 1].r - 0.5 && t.parts[i].r > t.parts[i - 1].l + 0.5) throw new Error(`${where}: "${t.id}" ${t.parts[i].q} overlaps ${t.parts[i - 1].q}`);
          if (t.parts.some((p) => p.l < t.l - 0.5 || p.r > t.r + 0.5)) throw new Error(`${where}: a line of "${t.id}" sticks out of its tile`);
        }
        for (let i = 1; i < r.tiles.length; i++) if (r.tiles[i].l < r.tiles[i - 1].r - 0.5 && r.tiles[i].t < r.tiles[i - 1].b - 0.5 && r.tiles[i].b > r.tiles[i - 1].t + 0.5) throw new Error(`${where}: readouts "${r.tiles[i - 1].id}" and "${r.tiles[i].id}" overlap`);
        if (r.tiles.some((t) => t.r > r.strip.r + 0.5)) throw new Error(`${where}: a readout runs out of the strip`);
        // The rest of the bar: the play row's parts stay inside the bar, never overlap, and the buttons are touch-sized. No pill floats above it.
        const bar = await page.evaluate(() => {
          const dock = document.querySelector('#vdock').getBoundingClientRect();
          const parts = ['.tl-split', '.tl-time', '.tl-ff', '.tl-hist', '.tl-pin'].map((q) => [q, document.querySelector(q)])
            .filter(([, e]) => e && e.offsetWidth && !e.closest('[hidden]') && getComputedStyle(e).opacity !== '0')
            .map(([q, e]) => { const b = e.getBoundingClientRect(); return { q, l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height }; });
          return { dock: { l: dock.left, r: dock.right, t: dock.top, b: dock.bottom }, parts, floaters: document.querySelectorAll('.tl-latest, .narrator, .bleed-pill, .vd-note, #vdStatus').length, thumb: document.querySelector('#app').classList.contains('thumb') };
        });
        if (bar.floaters) throw new Error(`${where}: a pill (event, narrator, bleed or note) is back above the timeline`);
        for (const p of bar.parts) {
          const box = bar.dock;
          if (p.l < box.l - 0.5 || p.r > box.r + 0.5 || p.t < box.t - 0.5 || p.b > box.b + 0.5) throw new Error(`${where}: ${p.q} sticks out of the bottom bar`);
          // (The Mac's Pin carries its word in a 34 px bordered button on the one-line play row, 29f1d0f; the icons are 36 px.)
          // (and a 320 px phone narrows the jump button to 30 px so both readings fit, f2d0dbd)
          const minH = p.q === '.tl-pin' && p.w > 40 ? 33.5 : 35.5, minW = p.q === '.tl-ff' && w < 360 ? 29.5 : 35.5;
          if (/tl-(ff|hist|pin)/.test(p.q) && (p.w < minW || p.h < minH)) throw new Error(`${where}: ${p.q} is smaller than a 36 px button`);
        }
        for (let i = 0; i < bar.parts.length; i++) for (let j = i + 1; j < bar.parts.length; j++) { const a = bar.parts[i], c = bar.parts[j]; if (a.l < c.r - 0.5 && c.l < a.r - 0.5 && a.t < c.b - 0.5 && c.t < a.b - 0.5) throw new Error(`${where}: ${a.q} overlaps ${c.q}`); }
        if (w < 768 && hgt > 500) {
          if (new Set(r.tiles.map((t) => Math.round(t.t))).size > 1) throw new Error(`${where}: the readouts do not line up (tops ${r.tiles.map((t) => Math.round(t.t))})`);
          if (new Set(r.tiles.map((t) => Math.round(t.h))).size > 1) throw new Error(`${where}: the readouts differ in height`);
          // (The one-line play row, 29f1d0f, shows no rating under a value; where one shows, it sits under it.)
          for (const t of r.tiles) { const v = t.parts.find((p) => p.q === 'v'), s = t.parts.find((p) => p.q === 's') || t.parts.find((p) => p.q === 'rb'); if (v && s && Math.abs(v.l - s.l) > 1) throw new Error(`${where}: the rating of "${t.id}" is not under its value`); }
        }
        seen.push({ q, tiles: r.tiles.map((t) => [t.id, Math.round(t.l), Math.round(t.t), Math.round(t.w), Math.round(t.h)].join(':')).join(' '), strip: Math.round(r.strip.h) });
      }
      if (seen[0].tiles !== seen[1].tiles || seen[0].strip !== seen[1].strip) throw new Error(`${w}x${hgt}: the readouts moved or resized between two patients (${seen[0].tiles} | ${seen[1].tiles})`);
    }
  });

  // Every word in the bottom bar's readout row stays inside the row, the bar and the screen, in Explore and in the lobule view
  // (16 Oct: a reserved width for the readings pushed the lobule's "Portal in 36" 6 px past a 390 px phone's bar).
  // (and the readings share the room right of the play row evenly: no empty run there, before the first reading, between two or
  // after the last, is wider than the gap between two readings, measured on the letters' ink; a name over its number keeps
  // 16 px or more from the next reading on both lines. 16 Oct: it had piled up past the last reading, and the tiles crowded.)
  await check(device, 'readout row: no word runs past the row, the bar or the screen, or under 12 px, and the readings spaced evenly, in Explore and the lobule', async (page) => {
    const sizes = device === 'desktop' ? [[1440, 900], [1180, 820], [1024, 768], [820, 1180], [768, 1024]] : [[320, 568], [360, 780], [375, 667], [390, 844], [430, 932], [844, 390], [667, 375]];
    const bad = [];
    for (const [w, hgt] of sizes) for (const q of ['?preset=cirr-decomp', '?preset=healthy']) for (const lob of [false, true]) {
      await page.setViewportSize({ width: w, height: hgt });
      await open(page, q);
      if (lob) { await page.evaluate(() => window.pps.store.set({ lobule: true })); await page.waitForFunction(() => window.pps.stage.lobuleOpen(), null, { timeout: 30000 }); }
      await page.waitForTimeout(900);
      const out = await page.evaluate(() => {
        const strip = document.querySelector('#strip'), vd = document.querySelector('#vdock');
        if (!strip?.offsetWidth || !vd?.offsetWidth) return [];
        const sr = strip.getBoundingClientRect(), dr = vd.getBoundingClientRect(), right = Math.min(sr.right, dr.right, innerWidth), res = [];
        // (the row's room starts where the play row's last button ends: the readings may use the strip's edge, not a button)
        const playEnd = Math.max(-Infinity, ...[...vd.querySelectorAll('.timeline :is(button, .tl-time)')].filter((e) => e.checkVisibility()).map((e) => e.getBoundingClientRect().right));
        const left = Math.max(playEnd > -Infinity ? playEnd : sr.left, dr.left, 0);
        const walk = document.createTreeWalker(strip, NodeFilter.SHOW_TEXT);
        for (let t = walk.nextNode(); t; t = walk.nextNode()) {
          if (!t.textContent.trim() || !t.parentElement.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
          const g = document.createRange(); g.selectNodeContents(t); const b = g.getBoundingClientRect();
          if (b.width && (b.right > right + 0.5 || b.left < left - 0.5)) res.push(`"${t.textContent.trim()}" ${Math.round(Math.max(b.right - right, left - b.left))} px out`);
          if (b.width && parseFloat(getComputedStyle(t.parentElement).fontSize) < 11.95) res.push(`"${t.textContent.trim()}" at ${getComputedStyle(t.parentElement).fontSize}`);   // (and at 12 px or more)
        }
        // The spacing, on ink: a word's ink from its baseline and the font's measured glyphs; an icon button's from its icon; a
        // reading's slot (the room kept for its usual value) counts as taken.
        const vis = (e) => e.checkVisibility({ opacityProperty: true, visibilityProperty: true }), cv = document.createElement('canvas').getContext('2d');
        const ink = (el) => {
          const g = document.createRange(); g.selectNodeContents(el); const b = g.getBoundingClientRect(), s = getComputedStyle(el);
          cv.font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`; cv.letterSpacing = s.letterSpacing;
          const m = document.createElement('span'); m.style.cssText = 'display:inline-block;width:0;height:0'; el.appendChild(m); const base = m.getBoundingClientRect().bottom; m.remove();
          const t = cv.measureText(el.textContent); return { l: b.left + Math.max(0, -t.actualBoundingBoxLeft), r: b.left + t.actualBoundingBoxRight, t: base - t.actualBoundingBoxAscent, b: base + t.actualBoundingBoxDescent };
        };
        let start = -Infinity;   // the play row's last ink, or the hairline before the readings
        for (const el of vd.querySelectorAll('.timeline :is(button, .tl-time)')) {
          if (!vis(el)) continue;
          const lab = [...el.querySelectorAll('span')].find((e) => vis(e) && e.getBoundingClientRect().width && e.textContent.trim());
          const r = el.matches('.tl-time') && lab ? ink(lab) : lab ? el.getBoundingClientRect() : (el.querySelector('svg use, svg') || el).getBoundingClientRect();
          if (r.right > r.left || r.r > r.l) start = Math.max(start, r.r ?? r.right);
        }
        const ro = strip.closest('.readouts') || strip; if (parseFloat(getComputedStyle(ro).borderLeftWidth) > 0) start = Math.max(start, ro.getBoundingClientRect().left + 1);
        const tiles = [...strip.querySelectorAll('.metric')].filter((m) => m.offsetWidth && vis(m)).map((m) => {
          const k = [...m.querySelectorAll('.k > *, .k')].find((e) => e.offsetWidth && !e.children.length && vis(e)), v = m.querySelector('.val'), u = m.querySelector('.v .unit'), vv = m.querySelector('.v');
          const kb = ink(k), vb = ink(v); let r = Math.max(vb.r, v.getBoundingClientRect().right);
          if (u && vis(u) && u.getBoundingClientRect().width) r = Math.max(r, ink(u).r);
          if (parseFloat(getComputedStyle(vv).minWidth) > 0) r = Math.max(r, vv.getBoundingClientRect().right);
          return { id: m.dataset.id, l: Math.min(kb.l, vb.l), r: Math.max(kb.r, r), k: kb, v: { l: vb.l, r, t: vb.t } };
        }).sort((a, b) => a.l - b.l);
        if (tiles.length > 1 && start > -Infinity) {
          const gaps = tiles.slice(1).map((t, i) => t.l - tiles[i].r), gap = Math.min(...gaps);
          const runs = [['before the first', tiles[0].l - start], ['after the last', dr.right - tiles[tiles.length - 1].r]];
          for (const [where, run] of runs) if (run > gap + 0.5) res.push(`${Math.round(run)} px empty ${where} reading, more than the ${Math.round(gap)} px between readings`);
          if (gap < 4) res.push(`readings ${Math.round(gap)} px apart`);
          if (tiles[0].k.b <= tiles[0].v.t + 1)   // (a name over its number)
            tiles.slice(1).forEach((t, i) => { const a = tiles[i]; const gk = t.k.l - a.k.r, gv = t.v.l - a.v.r; if (Math.min(gk, gv) < 15.5) res.push(`${a.id} and ${t.id} ${Math.round(Math.min(gk, gv))} px apart`); });
        }
        return res;
      });
      if (out.length) bad.push(`${w}x${hgt} ${q}${lob ? ' lobule' : ''}: ${out.join(', ')}`);
    }
    if (bad.length) throw new Error(bad.slice(0, 4).join('; '));
  });
}
