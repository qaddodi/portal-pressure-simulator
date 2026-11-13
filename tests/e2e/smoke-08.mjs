// Browser checks 8 of 9, run for each device by smoke.mjs (PR-20: split from one 5,000-line file; the order of the checks is unchanged).
// From "floating pieces never overlap" to "FibroScan reading on the probe body, clear of labels and the credit".
// Run just these: SMOKE_MATCH='<part of a name>' node tests/e2e/smoke.mjs, or the whole set with SMOKE_DEVICE and SMOKE_SHARD (see smoke.mjs).
// Everything shared (the runner, the page helpers, the deck lists) arrives in the one argument; nothing here opens a browser itself.

export default async function register({ check, device, instantMotionOn, open, quiet, tapTool }) {
  await check(device, 'floating pieces never overlap', async (page) => {
    const sizes = device === 'desktop' ? [[1440, 900], [1180, 820], [820, 1180]] : [[390, 844], [844, 390]];
    const states = [['?preset=cirr-decomp', null], ['?preset=cirr-decomp', 'measure'], ['?preset=cirr-decomp', 'both'], ['?preset=cirr-decomp', 'card'], ['?preset=cirr-decomp', 'lobule']];
    for (const [w, hgt] of sizes) for (const [q, act] of states) {
      await page.setViewportSize({ width: w, height: hgt });
      await open(page, q);
      if (act === 'measure' || act === 'both') { await tapTool(page, '#tabInstruments'); await page.waitForSelector('#dockBody .dock-pane.active'); }
      if (act === 'both') await page.evaluate(() => window.pps.details({ type: 'edge', id: 'PV_TRUNK' }));
      if (act === 'lobule') {
        await page.evaluate(() => window.pps.store.set({ lobule: true }));
        await page.waitForFunction(() => window.pps.stage.lobuleOpen(), null, { timeout: 15000 });
        await page.waitForTimeout(600);
      }
      if (act === 'card') { await page.evaluate(() => window.pps.store.set({ selection: { type: 'edge', id: 'PV_TRUNK' } })); await page.waitForSelector('.action-card:not([hidden])'); }
      await page.waitForTimeout(700);
      // The floating pieces follow each other's sizes a frame later (main.js publishes them on the next
      // animation frame), and the model keeps changing them (a bleed adds a line to the dock): an overlap
      // counts only if it is still there a few frames later.
      const frames = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));
      const measure = () => page.evaluate(() => {
        const SEL = ['.tb-id', '.top-right', '#viewSeg', '.topbar .sb-right', '.sb-center.float-ui', '#vdock', '#panel', '#treatCard:not([hidden])', '#dock', '#zoomPill', '.action-card:not([hidden])'];
        // (A piece whose holder is faded out counts as hidden: the view switch's pill fades while a card is open.)
        const vis = (el) => { const st = getComputedStyle(el), r = el.getBoundingClientRect(); return st.display !== 'none' && st.visibility !== 'hidden' && el.checkVisibility({ opacityProperty: true }) && +st.opacity > 0.05 && r.width > 2 && r.height > 2; };
        // On a phone, and in the thumb layout (an upright iPad), the chart, Treat, the instruments and a vessel's card are sheets
        // that rise from behind the tab row by design.
        const sheet = (el) => el.classList.contains('docked') || ((document.querySelector('#app').classList.contains('thumb') || matchMedia('(max-width: 767px), (max-width: 1023px) and (max-height: 500px)').matches) && (el.id === 'panel' || el.id === 'treatCard' || (el.id === 'dock' && !el.classList.contains('side'))));
        const items = SEL.flatMap((s) => [...document.querySelectorAll(s)].filter(vis).map((el) => [s, el.getBoundingClientRect(), el]));
        const out = [];
        for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
          const [a, A, ea] = items[i], [c, C, ec] = items[j];
          if ((sheet(ea) || sheet(ec)) && [a, c].some((x) => x === '#vdock' || x === '#zoomPill')) continue;
          const x = Math.min(A.right, C.right) - Math.max(A.left, C.left), y = Math.min(A.bottom, C.bottom) - Math.max(A.top, C.top);
          if (x > 1 && y > 1) out.push(`${a} covers ${c}`);
        }
        for (const [s, r] of items) if (r.right > innerWidth + 1 || r.left < -1 || r.bottom > innerHeight + 1 || r.top < -1) out.push(`${s} is off screen`);
        return out;
      });
      // The cards slide in: measure where they settle, not where they are on the way.
      await page.waitForFunction(() => !document.getAnimations().some((a) => a.playState === 'running' && ['panel', 'treatCard', 'dock'].includes(a.effect?.target?.id)), null, { timeout: 60000 });
      let bad = await measure();
      // A slow machine can take several frames to follow a change in size (a bleed adds a line to the dock).
      for (let i = 0; i < 4 && bad.length; i++) { await frames(); bad = await measure(); }
      if (bad.length) throw new Error(`${w}×${hgt} ${q}${act ? ' + ' + act : ''}: ${bad.join('; ')}`);
    }
  });
  // A vessel's or organ's card open first, then Tests, Treat or History opened over it (Mac, iPad): the card moves clear of them,
  // with its leader, never left under one (it used to stay put, hidden under the Tests card with its dashed line still pointing at it).
  if (device === 'desktop') await check(device, 'an open vessel card moves clear of Tests, Treat and History', async (page) => {
    const out = [];
    for (const [w, hgt] of [[1440, 900], [1280, 800], [1024, 768], [1180, 820], [820, 1180]]) {
      await page.setViewportSize({ width: w, height: hgt });
      for (const sel of [{ type: 'edge', id: 'PV_TRUNK' }, { type: 'edge', id: 'V_SPL' }, { type: 'organ', id: 'liver' }]) for (const [btn, card] of [['#tabInstruments', '#dock'], ['#btnTreat', '#treatCard'], ['#btnHistory', '#historyCard']]) {
        await open(page, '?preset=cirr-decomp');
        await page.evaluate((s) => window.pps.store.set({ selection: s }), sel);
        await page.waitForSelector('.action-card:not([hidden])'); await page.waitForTimeout(700);
        await page.evaluate((b) => document.querySelector(b).click(), btn);   // (the top bar's buttons, as a click; History has no tab of its own)
        await page.waitForSelector(`${card}:not([hidden])`).catch((e) => { throw new Error(`${w}x${hgt} ${sel.id}: ${btn} opened no ${card}`, { cause: e }); });
        await page.waitForFunction(() => !document.getAnimations().some((a) => a.playState === 'running' && ['panel', 'treatCard', 'historyCard', 'dock'].includes(a.effect?.target?.id)), null, { timeout: 60000 });
        let bad = null;
        for (let i = 0; i < 20; i++) {
          await page.waitForTimeout(150);
          bad = await page.evaluate((cs) => {
            const a = document.querySelector('.action-card:not([hidden])'), c = document.querySelector(cs);
            if (!a) return null;
            const A = a.getBoundingClientRect(), C = c.getBoundingClientRect();
            return Math.min(A.right, C.right) - Math.max(A.left, C.left) > 1 && Math.min(A.bottom, C.bottom) - Math.max(A.top, C.top) > 1 ? `${Math.round(Math.min(A.right, C.right) - Math.max(A.left, C.left))} px` : null;
          }, card);
          if (!bad) break;
        }
        if (bad) out.push(`${w}x${hgt} ${sel.id} + ${btn}: the card is ${bad} under ${card}`);
      }
    }
    if (out.length) throw new Error(out.join('; '));
  });
  // The corner credit never sits on or touches a card, a sheet, a bar or a slide's panels, in every mode and on every
  // slide of a deck; it may fade out only when no figure is left (src/ui/credit.js).
  await check(device, 'corner credit never touches a card', async (page) => {
    // (A phone held sideways too: the words' glass pane (.pz-shade) is a card like the others.)
    const sizes = device === 'desktop' ? [[1440, 900], [820, 1180]] : [[390, 844], [844, 390], [667, 375], [932, 430]];
    const creditHits = () => page.evaluate(() => {
      const c = document.querySelector('.stage-credit'), r = c.getBoundingClientRect();
      if (+getComputedStyle(c).opacity < 0.5) return [];
      const out = [];
      if (r.left < 0 || r.top < 0 || r.right > innerWidth + 0.5 || r.bottom > innerHeight + 0.5) out.push('the screen edge');
      // The figure's own labels (station values, organ captions): never under the credit either.
      for (const g of document.querySelectorAll('#labels .lb:not(.lb-off)')) {
        let o = 1;
        for (let el = g; el && el !== document.body; el = el.parentElement) { const st = getComputedStyle(el); if (st.display === 'none' || st.visibility === 'hidden') o = 0; o *= +st.opacity; }
        if (o < 0.05) continue;
        for (const t of g.querySelectorAll('text, .lb-bg')) {
          const q = t.getBoundingClientRect();
          if (q.width > 1 && q.left < r.right + 2 && q.right > r.left - 2 && q.top < r.bottom + 2 && q.bottom > r.top - 2) { out.push(`label ${g.dataset.key}`); break; }
        }
      }
      for (const el of document.querySelectorAll('.stage-blocker:not([hidden]), .menu, .pz-text, .pz-data, .pz-panel, .pz-bar, .pz-shade')) {
        const st = getComputedStyle(el), q = el.getBoundingClientRect();
        if (st.display === 'none' || st.visibility === 'hidden' || +st.opacity < 0.05 || !q.width) continue;
        if (q.left < r.right + 4 && q.right > r.left - 4 && q.top < r.bottom + 4 && q.bottom > r.top - 4) out.push(el.id || el.className.split(' ')[0]);
      }
      return out;
    });
    const settle = async () => { await page.waitForTimeout(900); await page.waitForFunction(() => !document.querySelector('.stage-credit.moving'), null, { timeout: 5000 }).catch(() => {}); };
    const verify = async (what) => {
      await settle();
      let bad = await creditHits();
      for (let i = 0; i < 3 && bad.length; i++) { await settle(); bad = await creditHits(); }
      if (bad.length) throw new Error(`${what}: the credit touches ${bad.join(', ')}`);
    };
    for (const [w, hgt] of sizes) {
      await page.setViewportSize({ width: w, height: hgt });
      const at = `${w}×${hgt}`;
      await open(page, '?preset=cirr-decomp'); await verify(`${at} explore`);
      await page.evaluate(() => window.pps.store.set({ selection: { type: 'edge', id: 'PV_TRUNK' } })); await verify(`${at} vessel card`);
      await open(page, '?preset=cirr-decomp'); await tapTool(page, '#tabInstruments'); await verify(`${at} tests`);
      await page.evaluate(() => window.pps.details({ type: 'edge', id: 'PV_TRUNK' })); await verify(`${at} tests + details`);
      await open(page, '?script=circulation');
      for (let i = 0; i < 8; i++) { await verify(`${at} slide ${i + 1}`); await page.keyboard.press('ArrowRight'); }
    }
  });
  // A phone held sideways is laid out like a narrow iPad: one bar row, Tests docked on the right at full height, the
  // play bar ending at the card, the figure framed in the space left of it, and every test's controls and heading
  // inside the card (styles/app.css, sideways block; dock.js isSide).
  if (device === 'phone') await check(device, 'sideways phone docks Tests on the right', async (page) => {
    for (const [w, hgt] of [[844, 390], [667, 375]]) {
      await page.setViewportSize({ width: w, height: hgt });
      await open(page);
      for (const id of ['profile', 'hvpg', 'doppler', 'endoscopy', 'abdomen', 'fibroscan']) {
        await page.evaluate((i) => window.pps.dock.show(i, { reveal: true }), id);
        await page.waitForTimeout(700);
        await page.waitForFunction(() => !document.querySelector('#dock').getAnimations({ subtree: false }).some((a) => a.playState === 'running') && document.querySelector('#dock').getBoundingClientRect().right <= innerWidth, null, { timeout: 5000 }).catch(() => {});
        const bad = await page.evaluate(() => {
          const out = [], R = (s) => document.querySelector(s).getBoundingClientRect();
          const tb = document.querySelector('#topbar'), dock = R('#dock'), vd = R('#vdock');
          if (tb.classList.contains('two-rows') || tb.offsetHeight > 60) out.push(`top bar takes ${tb.offsetHeight} px`);
          if (!document.querySelector('#dock').classList.contains('side')) out.push('Tests is not docked at the side');
          if (dock.right > innerWidth + 1 || dock.top > tb.offsetHeight + 8 || dock.bottom < innerHeight - 20) out.push(`Tests card ${Math.round(dock.top)}-${Math.round(dock.bottom)} right ${Math.round(dock.right)}/${innerWidth}, bar ${tb.offsetHeight}, not full height`);
          if (vd.right > dock.left) out.push('the play bar runs under the Tests card');
          const pane = document.querySelector('#dock .dock-pane.active');
          for (const el of pane.querySelectorAll('*')) {
            const st = getComputedStyle(el);
            if (!el.offsetWidth || st.overflowX === 'auto' || st.overflowX === 'scroll') continue;
            if (/^(h3|h4)$/i.test(el.tagName) || el.matches('[class*="-head"]')) {
              const q = el.getBoundingClientRect();
              if (q.left < dock.left - 1 || q.right > dock.right + 1) out.push(`${el.className || el.tagName} spills out of the card`);
              if (el.scrollWidth > el.clientWidth + 2 && st.overflowX !== 'hidden') out.push(`${el.className || el.tagName} overflows by ${el.scrollWidth - el.clientWidth} px`);
            }
          }
          // The figure is framed left of the card: its labels sit in the space the card leaves.
          const lbs = [...document.querySelectorAll('#labels .lb:not(.lb-off) text')].map((t) => t.getBoundingClientRect()).filter((q) => q.width > 1);
          const under = lbs.filter((q) => q.left + q.width / 2 > dock.left);
          if (!lbs.length || under.length > lbs.length / 3) out.push(`figure framed under the card (${under.length}/${lbs.length} labels)`);
          return out;
        });
        if (bad.length) throw new Error(`${w}×${hgt} ${id}: ${bad.join('; ')}`);
      }
    }
  });
  // Every Tests picture fits its pane on an iPad, upright and sideways, at the card's default and a low dragged height:
  // no chart box taller than the pane, and no block of the pane drawn over another.
  if (device === 'desktop') await check(device, 'Tests pictures fit their pane on an iPad', async (page) => {
    for (const [w, hgt] of [[820, 1180], [1180, 820]]) for (const hr of [null, 0.25]) {
      await page.setViewportSize({ width: w, height: hgt });
      await open(page);
      await page.evaluate((v) => { if (v == null) localStorage.removeItem('pps.instruments'); else localStorage.setItem('pps.instruments', JSON.stringify({ open: ['profile'], h: v })); }, hr);
      await open(page);
      for (const id of ['profile', 'hvpg', 'doppler', 'endoscopy', 'abdomen', 'fibroscan']) {
        await page.evaluate((i) => window.pps.dock.show(i, { reveal: true }), id);
        await page.waitForTimeout(800);
        const bad = await page.evaluate(() => {
          const pane = document.querySelector('#dock .dock-pane.active'), pr = pane.getBoundingClientRect(), out = [];
          const els = [...pane.querySelectorAll('.instrument-view > *, .chart-box')].filter((e) => e.offsetHeight > 0);
          for (const e of els) { const q = e.getBoundingClientRect(); if (e.matches('.chart-box') && q.height > pr.height + 2) out.push(`chart ${Math.round(q.height)} px in a ${Math.round(pr.height)} px pane`); }
          for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
            if (els[i].contains(els[j]) || els[j].contains(els[i])) continue;
            const a = els[i].getBoundingClientRect(), c = els[j].getBoundingClientRect();
            if (c.top < a.bottom - 2 && c.bottom > a.top + 2 && c.left < a.right - 2 && c.right > a.left + 2) out.push(`${els[i].className.split(' ')[0]} under ${els[j].className.split(' ')[0]}`);
          }
          return out;
        });
        if (bad.length) throw new Error(`${w}×${hgt}${hr ? ' low card' : ''} ${id}: ${bad.join('; ')}`);
      }
    }
    await page.evaluate(() => localStorage.removeItem('pps.instruments'));
  });
  // The figure's labels never sit on each other: at the home framing, for every patient, on a phone, an iPad
  // held upright and a laptop, in the anatomy and the circuit (stage.js layoutLabels, its last overlap pass).
  await check(device, 'figure labels never overlap', async (page) => {
    const sizes = device === 'desktop' ? [[1440, 900], [820, 1180]] : [[390, 844]];
    const presets = ['healthy', 'postprandial', 'pvt-acute', 'pvt-chronic', 'svt', 'schisto', 'cirr-comp', 'csph', 'cirr-decomp', 'cirr-hepatofugal', 'gastric-varix', 'sos', 'budd-chiari', 'ivc-web', 'rhf', 'constrictive'];
    await open(page);
    const overlaps = () => page.evaluate(() => {
      const boxes = [...document.querySelectorAll('#labels .lb:not(.lb-off)')].filter((g) => getComputedStyle(g).display !== 'none' && +getComputedStyle(g).opacity > 0.05)
        .map((g) => [g.dataset.key, [...g.querySelectorAll('text')].map((t) => t.getBoundingClientRect()).filter((r) => r.width > 1)]).filter(([, rs]) => rs.length);
      const out = [];
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        for (const A of boxes[i][1]) for (const C of boxes[j][1]) {
          const x = Math.min(A.right, C.right) - Math.max(A.left, C.left), y = Math.min(A.bottom, C.bottom) - Math.max(A.top, C.top);
          if (x > 1.5 && y > 1.5) out.push(`${boxes[i][0]} × ${boxes[j][0]}`);
        }
      }
      return [...new Set(out)];
    });
    for (const [w, hgt] of sizes) {
      await page.setViewportSize({ width: w, height: hgt });
      for (const id of presets) {
        await page.evaluate((p) => window.pps.loadPreset(p), id);
        for (const view of ['anatomic', 'circuit']) {
          await page.evaluate((v) => window.pps.store.set({ view: v }), view);
          await page.waitForTimeout(1200);
          const bad = await overlaps();
          // The sinusoids' callout hangs from the middle of their bed (half way along the drawn vessel), in both views.
          bad.push(...await page.evaluate(() => ['SIN_R', 'SIN_L'].flatMap((id) => {
            const a = window.pps.stage.labelAnchorOf(id), eid = { SIN_R: 'SIN_RR', SIN_L: 'SIN_LL' }[id];
            const m = window.pps.stage.vesselMid(eid);
            if (!a?.mid || !m) return [];
            const d = Math.hypot(m.x - a.x, m.y - a.y), len = m.len;
            return d > Math.max(6, len * 0.08) ? [`${id} anchor ${Math.round(d)}px from the bed's middle`] : [];
          })));
        if (bad.length) throw new Error(`${w}×${hgt} ${id} ${view}: ${bad.join('; ')}`);
        }
        await page.evaluate(() => window.pps.store.set({ view: 'anatomic' }));
      }
    }
  });
  // A Circuit station's reading never prints over a vessel: the figure is drawn with its labels hidden, and under each word of a reading
  // no vessel's colour shows (stage.js layoutLabels moves a reading off its vessel to a near clear spot, with a short leader). One with
  // no clear spot near its station stays, knocked out of its vessel by a solid halo with no flow arrowhead under it (.on-vessel).
  // (On 612a1c5 "4.1" sat on the liver's zigzag, RA's "mmHg" on its branch and Portal v.'s "mmHg" on the trunk at 375.)
  await check(device, 'presenter: Circuit readings sit clear of the vessels', async (page) => {
    const cases = device === 'desktop' ? [[820, 1180, [2, 4, 6]]] : [[375, 667, [2, 4, 6]], [390, 844, [2, 4, 6]], [320, 568, [2, 4]]];
    const out = [];
    for (const [w, hgt, list] of cases) {
      await page.setViewportSize({ width: w, height: hgt });
      await open(page);
      let started = false;
      for (const n of list) {
        if (!started) { await page.evaluate((k) => window.pps.presenter.start('circuit', k), n - 1); started = true; } else await page.evaluate((k) => window.pps.presenter.go(k), n - 1);
        await page.waitForFunction((k) => Number(document.querySelector('.pzb-n')?.textContent.split('/')[0]) === k && !window.pps.presenter.busy() && !document.querySelector('.pz-load.on, .pz-cover'), n, { timeout: 120000 });
        await page.waitForTimeout(5000);
        const boxes = await page.evaluate(() => {
          const res = [];
          for (const g of document.querySelectorAll('#labels g.lb[data-key^="n:"]')) {
            if (getComputedStyle(g).display === 'none' || +getComputedStyle(g).opacity < 0.5) continue;
            if (g.classList.contains('on-vessel')) { if ([...g.querySelectorAll('text')].some((t) => parseFloat(getComputedStyle(t).strokeWidth) < 7 || getComputedStyle(t).stroke === 'none')) res.push({ k: g.dataset.key.slice(2), t: 'halo', x: 0, y: 0, w: 0, h: 0, thin: true }); continue; }
            for (const sp of g.querySelectorAll('tspan')) { const b = sp.getBoundingClientRect(); if (b.width > 1) res.push({ k: g.dataset.key.slice(2), t: sp.textContent, x: b.left, y: b.top + b.height * 0.22, w: b.width, h: b.height * 0.62 }); }
          }
          for (const e of document.querySelectorAll('#labels, .cath-labels')) e.style.visibility = 'hidden';
          return res;
        });
        await page.waitForTimeout(300);
        const png = (await page.screenshot({ scale: 'css' })).toString('base64');
        out.push(...await page.evaluate(async ({ png, boxes, at }) => {
          for (const e of document.querySelectorAll('#labels, .cath-labels')) e.style.visibility = '';
          const img = new Image(); img.src = 'data:image/png;base64,' + png; await img.decode();
          const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
          const bad = [];
          for (const b of boxes) {
            if (b.thin) { bad.push(`${at}: ${b.k} sits on its vessel without its solid halo`); continue; }
            const d = x.getImageData(Math.round(b.x), Math.round(b.y), Math.max(1, Math.round(b.w)), Math.max(1, Math.round(b.h))).data;
            let n = 0; for (let i = 0; i < d.length; i += 4) if (Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]) > 50) n++;
            if (n / (d.length / 4) > 0.02) bad.push(`${at}: ${b.k} "${b.t}" prints on a vessel (${Math.round((100 * n) / (d.length / 4))}% of it)`);
          }
          return bad;
        }, { png, boxes, at: `${w}x${hgt} Circuit ${n}` }));
      }
    }
    if (out.length) throw new Error(out.join('; '));
  });
  // Every Circuit slide at every size: every station's reading shows whole (its value too) unless a card covers its station, and no
  // leader, nor the station ring it starts from, runs within 2 px of another reading's halo (stage.js layoutLabels: the passes from 3
  // on, and the fallbacks after them). (Before this, "Esoph. varices" and its value went missing at 375 and 390 on slides 5, 6 and 9,
  // and RHV's leader ran under RA's "3.7" at 375.)
  // Not every reading has room yet on a small phone: the ones still hidden or without their value are counted, and the count may only
  // fall (MISSING_MAX: lower it with each round that shows more). The ones fixed so far must show: STRICT.
  const MISSING_MAX = { phone: 38, desktop: 23 }[device];
  const STRICT = { '375x667': { 5: ['VAR'], 6: ['VAR'] }, '390x844': { 5: ['VAR'], 6: ['VAR'], 9: ['VAR'] } };
  await check(device, 'presenter: every Circuit reading shows, and no leader runs into another reading', async (page) => {
    const cases = device === 'desktop' ? [[820, 1180], [1180, 820]] : [[375, 667], [390, 844], [320, 568]];
    const out = [], missing = [];
    for (const [w, hgt] of cases) {
      await page.setViewportSize({ width: w, height: hgt });
      await open(page);
      for (let n = 1; n <= 10; n++) {
        if (n === 1) await page.evaluate(() => window.pps.presenter.start('circuit', 0)); else await page.evaluate((k) => window.pps.presenter.go(k), n - 1);
        await page.waitForFunction((k) => Number(document.querySelector('.pzb-n')?.textContent.split('/')[0]) === k && !window.pps.presenter.busy() && !document.querySelector('.pz-load.on, .pz-cover'), n, { timeout: 120000 });
        await page.waitForTimeout(4000);
        const found = await page.evaluate((at) => {
          const bad = [], miss = [], boxes = [];
          // (Covered: the point is under something other than the figure, a card, the slide's words or a callout on the figure, or
          // off the screen.)
          const calls = [...document.querySelectorAll('.cath-labels:not([hidden]) > *')].filter((c) => !c.classList.contains('off') && +getComputedStyle(c).opacity > 0.5).map((c) => c.getBoundingClientRect());
          const covered = (x, y) => { const e = document.elementFromPoint(x, y); return !e || !e.closest('#stageView') || calls.some((c) => x > c.left && x < c.right && y > c.top && y < c.bottom); };
          for (const g of document.querySelectorAll('#labels g.lb[data-key^="n:"]')) {
            const k = g.dataset.key.slice(2), r = g.getBoundingClientRect(), cs = getComputedStyle(g);
            const shown = cs.display !== 'none' && +cs.opacity >= 0.5 && r.width > 1;
            if (!shown) { if (r.width > 1 && !covered(r.left + r.width / 2, r.top + r.height / 2)) miss.push([k, `${at}: ${k} is hidden`]); continue; }
            if (!/\d/.test(g.textContent) && !covered(r.left + r.width / 2, r.top + r.height / 2)) miss.push([k, `${at}: ${k} shows "${g.textContent}" without its value`]);
            const t = g.querySelector('text'), m = parseFloat(getComputedStyle(t).strokeWidth) / 2 + 2;
            for (const sp of g.querySelectorAll('tspan')) { const b = sp.getBoundingClientRect(); if (b.width > 1) boxes.push({ k, x0: b.left - m, y0: b.top + b.height * 0.15 - m, x1: b.right + m, y1: b.top + b.height * 0.85 + m }); }
          }
          // (A reading given up for want of room is not drawn at all: stage.js lists it.)
          // (Its station under a card or off the screen excuses it, as for one hidden.)
          const lr = document.querySelector('#labels').getBoundingClientRect();
          for (const d of (document.querySelector('#labels .lb-blocks')?.dataset.dropped || '').split(' ').filter(Boolean)) {
            const [k, xy] = d.split('@'), [x, y] = (xy || '').split(',').map(Number);
            if (xy && !covered(lr.left + x, lr.top + y)) miss.push([k, `${at}: ${k} is left out`]);
          }
          const inBox = (x, y, b) => x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1;
          for (const p of document.querySelectorAll('#labels path.leader:not(.ld-gone)')) {
            const L = p.getTotalLength(), ctm = p.getScreenCTM();
            if (L < 1) continue;
            const pt = (u) => { const q = p.getPointAtLength(u); return new DOMPoint(q.x, q.y).matrixTransform(ctm); };
            const a = pt(0), e = pt(L);
            // (Its own reading: the one nearest its far end, which stops a few px short of it: stage.js leaderEnd.)
            const gap = (b) => Math.hypot(Math.max(b.x0 - e.x, 0, e.x - b.x1), Math.max(b.y0 - e.y, 0, e.y - b.y1));
            const near = boxes.reduce((m, b) => (!m || gap(b) < gap(m) ? b : m), null);
            const own = near && gap(near) < 14 ? [near.k] : [];
            const hit = new Set();
            for (let u = 0; u <= L; u += 1.5) { const q = pt(u); for (const b of boxes) if (!own.includes(b.k) && inBox(q.x, q.y, b)) hit.add(b.k); }
            for (const b of boxes) if (!own.includes(b.k) && inBox(a.x, a.y, { x0: b.x0 - 3, y0: b.y0 - 3, x1: b.x1 + 3, y1: b.y1 + 3 })) hit.add(b.k);   // (the station ring, 3 px round)
            if (hit.size) bad.push(`${at}: the leader of ${own.join('/') || '?'} from (${Math.round(a.x)},${Math.round(a.y)}) runs into ${[...hit].join(', ')}`);
            // (It reaches its text: within 3 px of the words, as near as the glyph boxes measure.)
            const ownBoxes = [...document.querySelectorAll('#labels g.lb[data-key="n:' + own[0] + '"] tspan')].map((t) => t.getBoundingClientRect()).filter((b) => b.width > 1);
            const reach = Math.min(...ownBoxes.map((b) => Math.hypot(Math.max(b.left - e.x, 0, e.x - b.right), Math.max(b.top + b.height * 0.15 - e.y, 0, e.y - b.top - b.height * 0.85))));
            if (own.length && ownBoxes.length && reach > 4) bad.push(`${at}: the leader of ${own[0]} stops ${Math.round(reach)} px short of its text`);
          }
          // No reading's halo covers a station's ring (its own too), 2 px clear of the ring's 4 px radius. (Every visible dot has one in the list,
          // a station without a reading beside it too: the colon bed's, under the spleen's reading.)
          for (const xy of (document.querySelector('#labels .lb-blocks')?.dataset.rings || '').split(' ').filter(Boolean)) {
            const [x, y] = xy.split(',').map(Number), lr = document.querySelector('#labels').getBoundingClientRect(), cx = lr.left + x, cy = lr.top + y;
            const on = boxes.filter((b) => Math.hypot(Math.max(b.x0 - cx, 0, cx - b.x1), Math.max(b.y0 - cy, 0, cy - b.y1)) < 4).map((b) => b.k);
            if (on.length) bad.push(`${at}: ${[...new Set(on)].join(', ')} covers the station ring or dot at (${Math.round(cx)},${Math.round(cy)})`);
          }
          return { bad, miss };
        }, `${w}x${hgt} Circuit ${n}`);
        out.push(...found.bad);
        for (const [k, m] of found.miss) (STRICT[`${w}x${hgt}`]?.[n]?.includes(k) ? out : missing).push(m);
      }
    }
    if (missing.length > MISSING_MAX) out.push(`${missing.length} readings hidden or without their value, more than ${MISSING_MAX}: ${missing.join('; ')}`);
    if (out.length) throw new Error(out.join('; '));
    if (missing.length < MISSING_MAX) console.log(`  (${device}: ${missing.length} readings still hidden or without their value; lower MISSING_MAX to ${missing.length})`);
  });
  // The readings over the figure (the Circuit deck's resistors, a slide's measuring sites, the HVPG catheter's callouts) on a phone and
  // an iPad: every resistor with a ratio shows, whole on screen and clear of the slide's cards, and no figure label prints on any reading.
  // A 320 px phone's data card folded behind Show keeps its whole header: the title never cut (it had read "DOPPLER, THE ..." in a
  // card squeezed to 27 px, the title cut through), and the figure key's words are 12 px or more (they had read 11 px).
  if (device === 'phone') await check(device, 'presenter: a folded data card on a 320 px phone shows its whole title, and the key is 12 px', async (page) => {
    const out = [];
    for (const [w, hgt] of [[320, 568], [375, 667]]) {
      await page.setViewportSize({ width: w, height: hgt });
      await open(page);
      const restore = await instantMotionOn(page);
      let started = false;
      for (const k of [2, 5, 8]) {   // (TIPS Doppler 3, 6 and 9: an instrument folded, and the velocity and direction keys)
        if (!started) { await page.evaluate((n) => window.pps.presenter.start('tips-doppler', n), k); started = true; }
        else await page.evaluate((n) => window.pps.presenter.go(n), k);
        await page.waitForFunction((n) => Number(document.querySelector('.pzb-n')?.textContent.split('/')[0]) === n + 1 && !window.pps.presenter.busy(), k, { timeout: 60000 });
        await quiet(page); await page.waitForTimeout(600);
        out.push(...await page.evaluate((at) => {
          const bad = [], R = (e) => e.getBoundingClientRect();
          const dc = document.querySelector('.pz-data:not(.pz-hide):not([hidden])'), dh = dc?.querySelector('.pz-dh'), t = dh?.querySelector(':scope > span:first-child');
          if (t && getComputedStyle(dc).display !== 'none') {
            if (t.scrollWidth > t.clientWidth + 1) bad.push(`${at}: the card title "${t.textContent}" is cut (${t.scrollWidth} px in ${t.clientWidth})`);
            if (R(dh).bottom > R(dc).bottom + 0.5 || R(t).bottom > R(dc).bottom - 2) bad.push(`${at}: the card (to ${Math.round(R(dc).bottom)}) cuts its header (to ${Math.round(R(dh).bottom)})`);
          }
          const fk = document.querySelector('.pz-fk');
          if (fk && !fk.hidden && getComputedStyle(fk).display !== 'none') {
            let k = 1; for (let q = fk; q; q = q.parentElement) { const sc = getComputedStyle(q).scale; if (sc && sc !== 'none') k *= parseFloat(sc); }
            for (const e of [fk, ...fk.querySelectorAll('*')]) {
              if (![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
              const px = parseFloat(getComputedStyle(e).fontSize) * k;
              if (px < 11.95) bad.push(`${at}: the key's "${e.textContent.trim().slice(0, 16)}" is ${px.toFixed(1)} px`);
            }
            if (R(fk).right > innerWidth || R(fk).left < 0) bad.push(`${at}: the key runs off the screen`);
          }
          return bad;
        }, `${w}x${hgt} tips-doppler ${k + 1}`));
      }
      await page.keyboard.press('Escape');
      await restore?.();
    }
    if (out.length) throw new Error(out.slice(0, 6).join('; '));
  });
  await check(device, 'presenter: resistance readings and callouts show, clear of the cards and the figure labels', async (page) => {
    const sizes = device === 'desktop' ? [[820, 1180], [1180, 820], [1440, 900]] : [[390, 844], [375, 667], [320, 568]];
    // (Plus every other slide with a reading on the figure, and every slide whose words a 320 px phone had fitted under 12 px.)
    const more = 'hvpg 4,5,7,9;right-heart 3,5,7;shunts 2,5,6,8,9;stiffness 7;treatment 10;two-inflows 8;lobule 6;ncph 4;outflow 6,8;prehepatic 3,6;doppler 2,8;sites 3,8';
    const slides = [...Array.from({ length: 10 }, (_, i) => ['circuit', i]), ['hvpg', 2],
      ...more.split(';').flatMap((x) => { const [d, n] = x.split(' '); return n.split(',').map((k) => [d, k - 1]); })];
    const out = [];
    for (const [w, hgt] of sizes) {
      await page.setViewportSize({ width: w, height: hgt });
      await open(page);
      const restore = await instantMotionOn(page);
      let deck = null;
      for (const [id, k] of slides) {
        if (deck !== id) { await page.evaluate(([d, n]) => window.pps.presenter.start(d, n), [id, k]); deck = id; }
        else await page.evaluate((n) => window.pps.presenter.go(n), k);
        await page.waitForFunction((n) => { window.pps.presenter.skipLapse?.(); document.querySelector('.pz-case.on')?.click(); return Number(document.querySelector('.pzb-n')?.textContent.split('/')[0]) === n + 1 && !window.pps.presenter.busy() && !document.querySelector('.pz-load.on, .pz-cover'); }, k, { timeout: 60000, polling: 100 })
          .catch((e) => { throw new Error(`${w}x${hgt} ${id} ${k + 1}: the slide never arrived`, { cause: e }); });
        await quiet(page); await page.waitForTimeout(600);
        out.push(...await page.evaluate((at) => {
          const bad = [], rect = (e) => e.getBoundingClientRect(), hit = (a, b, m = 1) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > m && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > m;
          const shown = (e) => { const st = getComputedStyle(e); return st.display !== 'none' && st.visibility !== 'hidden' && rect(e).width > 1; };
          // A phone keeps the figure a fixed share of its height between the data card and the words' glass (presenter.js FIG_MIN),
          // or a little less (FIG_REG) where that keeps the words at Regular.
          const sh = document.querySelector('.pz-shade.stack'), dc = document.querySelector('.pz-data'), reg = !document.querySelector('.pz-text')?.style.getPropertyValue('--pz-fit');
          if (sh && dc && shown(dc) && !dc.classList.contains('pz-hide') && +getComputedStyle(sh).opacity > 0.5) {
            const room = rect(sh).top - rect(dc).bottom, need = Math.round(Math.max(170, (reg ? 0.25 : 0.3) * innerHeight)) - 2;
            if (room < need) bad.push(`${at}: the cards leave ${Math.round(room)} px of figure (at least ${Math.round(need + 2)})`);
          }
          // A phone's words never fit below 12 px (their body size times the card's fit).
          const tx = document.querySelector('.pz-text'), ln = tx && shown(tx) && tx.querySelector('.pz-line');
          if (sh && ln) { const px = parseFloat(getComputedStyle(ln).fontSize) * (parseFloat(tx.style.getPropertyValue('--pz-fit')) || 1) * (parseFloat(tx.style.getPropertyValue('--pz-z')) || 1); if (px < 11.95) bad.push(`${at}: the words are ${px.toFixed(1)} px`); }
          const cards = [...document.querySelectorAll('.stage-blocker:not([hidden])')].filter((e) => shown(e) && +getComputedStyle(e).opacity > 0.5 && !e.classList.contains('pz-hide'));
          const texts = [...document.querySelectorAll('#labels .lb:not(.lb-off)')].filter((g) => +getComputedStyle(g).opacity > 0.05)
            .flatMap((g) => [...g.querySelectorAll('text')].map((t) => [t.textContent.trim().slice(0, 18), rect(t)]).filter(([, r]) => r.width > 1));
          for (const el of document.querySelectorAll('.cath-label')) {
            if (el.closest('[hidden]') || el.classList.contains('cath-pre') || el.classList.contains('cath-out') || el.classList.contains('in-sum') || !shown(el)) continue;
            const name = `${el.querySelector('small')?.textContent} ${el.querySelector('b')?.textContent}`.trim(), res = el.classList.contains('res');
            if (res && el.classList.contains('off')) { if (el.querySelector('b').textContent) bad.push(`${at}: "${name}" is hidden`); continue; }
            if (el.classList.contains('off')) continue;
            const r = rect(el);
            if (r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1) bad.push(`${at}: "${name}" runs off screen`);
            if (res) for (const c of cards) if (hit(r, rect(c))) bad.push(`${at}: "${name}" is under ${c.className.split(' ')[0]}`);
            for (const [t, q] of texts) if (hit(r, q, 1.5)) bad.push(`${at}: the "${t}" label prints on "${name}"`);
          }
          return bad;
        }, `${w}x${hgt} ${id} ${k + 1}`));
      }
      await restore();
    }
    if (out.length) throw new Error([...new Set(out)].join('; '));
  });
  // Scale and tick labels: the numbers under the lens pill's colour scale (and the other tick rows) never overlap, in any view,
  // lens or width; a scale too narrow for its numbers drops the ones between its ends first (styles: .lg-scale container queries).
  await check(device, 'tick labels clear of each other in every view', async (page) => {
    const sizes = device === 'desktop' ? [[1440, 900], [1024, 768], [768, 1024]] : [[390, 844], [360, 740], [320, 640], [844, 390]];
    const clash = () => page.evaluate(() => {
      const out = [];
      for (const g of document.querySelectorAll('.lg-scale, .pzk-axis, .dop-ticks')) {
        const gr = g.getBoundingClientRect();
        if (!gr.width || !gr.height) continue;
        const rs = [...g.children].filter((c) => c.textContent.trim() && getComputedStyle(c).display !== 'none').map((c) => { const r = document.createRange(); r.selectNodeContents(c); const b = r.getBoundingClientRect(); return { t: c.textContent.trim(), l: b.left, r: b.right }; }).filter((x) => x.r > x.l).sort((a, b) => a.l - b.l);
        for (let i = 1; i < rs.length; i++) if (rs[i].l < rs[i - 1].r + 1) out.push(`"${rs[i - 1].t}" and "${rs[i].t}" overlap in a ${Math.round(gr.width)} px scale`);
      }
      return out;
    });
    await open(page, '?preset=cirr-decomp');
    for (const [w, hgt] of sizes) {
      await page.setViewportSize({ width: w, height: hgt });
      const steps = [['anatomic', 'pressure'], ['anatomic', 'flow'], ['circuit', 'pressure'], ['lobule', 'pressure'], ['sinusoid', 'pressure']];
      for (const [view, lens] of steps) {
        await page.evaluate(([v, l]) => { window.pps.store.set({ colorMode: l }); const b = document.querySelector(`#viewSeg [data-view="${v}"]`); if (b && !b.hidden) b.click(); }, [view, lens]);
        await page.waitForTimeout(1300);
        const bad = await clash();
        if (bad.length) throw new Error(`${w}×${hgt} ${view} (${lens}): ${bad.join('; ')}`);
      }
      await page.evaluate(() => document.querySelector('#viewSeg [data-view="anatomic"]')?.click());
    }
  });
  // The FibroScan probe's callout (its live kPa beside the waves): wherever the probe shows on the figure, in Explore with the FibroScan
  // card open and on every FibroScan slide, the callout shows too, inside the stage, and sits on no other label, the probe or its caption,
  // a site callout, a card, a bar or the credit (stage.js scanItem and layoutLabels place it before the other labels).
  await check(device, 'FibroScan reading on the probe body, clear of labels and the credit', async (page) => {
    const sizes = device === 'desktop' ? [[1440, 900], [820, 1180]] : [[390, 844]];
    const inspect = () => page.evaluate(() => {
      const probe = document.querySelector('.scan-probe:not(.off):not(.cath-pre)');
      const tool = !!document.querySelector('.pz-tool[data-kind="fibroscan"]');
      if (!probe) return { probe: false, tool };
      const wr = document.querySelector('#stageWrap').getBoundingClientRect(), tip = probe.querySelector('.sp-tip').getBoundingClientRect();
      if (tip.left < wr.left + 4 || tip.right > wr.right - 4 || tip.top < wr.top + 4 || tip.bottom > wr.bottom - 4) return { probe: false, tool };   // the camera has taken the liver off the stage
      const covered = [...document.querySelectorAll('.stage-blocker:not([hidden]), .pz-text, .pz-data, #dock, #panel')].some((e) => { const r = e.getBoundingClientRect(), st = getComputedStyle(e); return st.visibility !== 'hidden' && +st.opacity > 0.5 && r.width > 2 && tip.left < r.right && tip.right > r.left && tip.top < r.bottom && tip.bottom > r.top; });
      if (covered) return { probe: false, tool };   // the slide's own card sits over the probe: nothing to name
      const R = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
      const vis = (e) => { const st = getComputedStyle(e); return st.display !== 'none' && st.visibility !== 'hidden' && +st.opacity > 0.05; };
      const g = probe.querySelector('.sp-read');
      if (!g || !vis(probe)) return { probe: true, tool, shown: false };
      const pill = R(probe.querySelector('.sp-screen')), bad = [], others = [];
      const hit = (a, b) => a.l < b.r - 0.5 && a.r > b.l + 0.5 && a.t < b.b - 0.5 && a.b > b.t + 0.5;
      const head = R(probe.querySelector('.sp-body'));
      if (pill.l < head.l - 1 || pill.r > head.r + 1 || pill.t < head.t - 1 || pill.b > head.b + 1) bad.push('reading off the probe body');
      // (At 45°, steeper beside the left edge and flatter below the top one, a0a9590e and e948cbf: the angle the probe was
      // given, --sp-turn, is the one it shows.)
      const m = new DOMMatrix(getComputedStyle(probe.querySelector('svg')).transform), turn = parseFloat(getComputedStyle(probe).getPropertyValue('--sp-turn')) || 45;
      if (Math.abs(Math.atan2(m.b, m.a) * 180 / Math.PI - turn) > 0.5) bad.push(`probe not at its ${turn}° (${m.a.toFixed(2)}, ${m.b.toFixed(2)})`);
      if (turn < 10 || turn > 80) bad.push(`probe turned ${turn}°, outside 10° to 80°`);
      if (parseFloat(getComputedStyle(probe.querySelector('.sp-unit')).fontSize) < 11) bad.push('reading smaller than 11 px');
      for (const e of document.querySelectorAll('#labels .lb:not(.lb-off)')) if (vis(e)) for (const t of e.querySelectorAll('text')) { const r = R(t); if (r.r - r.l > 1) others.push([`label ${e.dataset.key}`, r]); }
      for (const e of document.querySelectorAll('.cath-label.site, .stage-credit')) if (vis(e)) { const r = R(e); if (r.r - r.l > 2) others.push([e.id || e.className.split(' ')[0], r]); }
      for (const [n, r] of others) if (hit(pill, r)) bad.push(n);
      if (document.querySelector('#labels .lb[data-key="scan"]:not(.lb-off)')) bad.push('the old kPa pill still shows');
      const txt = g.textContent;
      const card = [...document.querySelectorAll('canvas[data-reading]')].find((c) => c.offsetParent !== null && c.getBoundingClientRect().width > 0);
      const val = probe.querySelector('.sp-val').textContent;
      if (card && val !== '\u2014' && card.dataset.reading !== val) bad.push(`probe reads ${val}, card reads ${card.dataset.reading}`);   // same number, same rounding (read in one frame)
      if (!/(\d|\u2014)/.test(txt) || !/kPa/.test(txt)) bad.push(`text "${txt}"`);
      return { probe: true, tool, shown: true, bad };
    });
    // The callout fades in with the probe, and a slide's camera glides first: it counts only if it is still wrong a few seconds later.
    // A slide that carries the FibroScan card (data-kind) shows the probe; one without it may still be fading the last one out.
    const settle = async (what, needTool, needProbe) => {   // needProbe: Explore must show the probe, so a first look while it is still fading in or the sheet is opening is not the answer
      let r = null;
      for (let i = 0; i < 48; i++) {
        await page.waitForTimeout(500); r = await inspect();
        if (needTool && !r.tool) continue;
        if (needProbe && !r.probe && i < 30) continue;
        if (!r.probe && needTool) { if (i > 30) return false; continue; }   // covered by the slide's own card, or off the stage: nothing to name
        if (!r.probe || (r.shown && !r.bad.length)) return r.probe;
      }
      if (!needTool && !r.tool) return false;
      throw new Error(`${what}: ${r.shown ? `callout touches ${r.bad.join(', ')}` : needTool && !r.tool ? 'the FibroScan card never showed' : 'the probe shows but its reading does not'}`);
    };
    for (const [w, hgt] of sizes) {
      await page.setViewportSize({ width: w, height: hgt });
      const at = `${w}×${hgt}`;
      await open(page, '?preset=cirr-comp');
      await tapTool(page, '#tabInstruments'); await page.waitForSelector('#dockBody .dock-pane.active');
      await page.evaluate(() => window.pps.dock.show('fibroscan', { reveal: true }));
      if (!(await settle(`${at} explore`, false, true))) throw new Error(`${at} explore: no probe on the figure ${JSON.stringify(await inspect())}`);
      await open(page, '?script=stiffness');
      await page.waitForSelector('.pz-h'); await page.waitForTimeout(2000);
      let withProbe = 0;
      const FIBRO = [2, 3, 11];   // the stiffness deck's slides with the FibroScan card (the overview is slide 1; 12 slides in all)
      for (let n = 1; n <= 12; n++) {
        if (n > 1) { await page.keyboard.type(String(n)); await page.keyboard.press('Enter'); }
        if (await settle(`${at} slide ${n}`, FIBRO.includes(n))) withProbe++;
      }
      if (withProbe < Math.ceil(FIBRO.length / 2)) throw new Error(`${at}: only ${withProbe} of ${FIBRO.length} FibroScan slides showed the probe`);
    }
  });
}
