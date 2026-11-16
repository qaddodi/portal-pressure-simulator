# Play-test toolkit

Tester-side helpers for the play-test plan (`docs/play-test-plan.md`). Nothing here is part of the app, and nothing here is loaded by it.

How to load: copy the whole code block below and run it once with the built-in browser's JavaScript tool on the page you test. Run it again after every reload of the outer page (a reload of the app inside the frame keeps it). It defines `window.PT`; `PT.help()` lists the helpers.

Two ways to use it:

- **Phone, tablet or a fixed size (the usual way).** Open `https://qaddodi.github.io/portal-pressure-simulator/preview/preview-info.txt`, run the toolkit there, then `PT.frame(844, 390)` (or any width and height). The app loads in a frame of exactly that size, scaled down to fit the pane, so its media queries see the size you asked for. `PT.frame(844, 390, '?perf')` passes a query. Everything else in `PT` then works on the app inside the frame.
- **Desktop at the pane's own size.** Run the toolkit on the app page itself. `PT` then works on that page.

Limits: the frame emulates the viewport only. There is no touch (`pointer: coarse` stays off), no device pixel ratio and no safe-area insets. GPU-drawn things (vessels, station labels, tile digits, chevrons) are not in the DOM, so `PT.layout()` and `PT.pops()` cannot see them: judge those by eye. `PT.pops()` and `PT.layout()` read styles and boxes, which costs frame time, so never run them while you measure `?perf` or the camera gate.

```js
(() => {
  const PREVIEW = 'https://qaddodi.github.io/portal-pressure-simulator/preview/';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const app = () => document.getElementById('pt-vp')?.contentWindow || window;
  const doc = () => app().document;
  const pps = () => app().pps;
  const P = () => pps()?.presenter;
  const vis = (el) => (el.checkVisibility ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) : true);
  const txt = (el) => (el.textContent || '').trim().replace(/\s+/g, ' ');
  const name = (el) => `${el.id ? '#' + el.id : el.tagName.toLowerCase()}${[...el.classList].slice(0, 2).map((c) => '.' + c).join('')} "${txt(el).slice(0, 40)}"`;
  const ownText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
  const errs = [];
  const watch = () => {
    const w = app();
    if (w.__ptWatch) return;
    w.__ptWatch = true;
    w.addEventListener('error', (e) => errs.push(`${new Date().toISOString().slice(11, 19)} error: ${e.message} (${(e.filename || '').split('/').pop()}:${e.lineno})`));
    w.addEventListener('unhandledrejection', (e) => errs.push(`${new Date().toISOString().slice(11, 19)} rejection: ${e.reason?.message || e.reason}`));
  };
  const PT = {
    help: () => Object.keys(PT).join(', '),
    // The app in a W x H frame, scaled to fit the pane. Run on PREVIEW + 'preview-info.txt' (same origin, so PT reaches the frame).
    frame(W, H, q = '') {
      if (!/preview-info\.txt$/.test(location.pathname)) return `Open ${PREVIEW}preview-info.txt, run the toolkit there, then PT.frame(${W}, ${H})`;
      const s = Math.min(1, (innerWidth - 16) / W, (innerHeight - 16) / H);
      document.body.innerHTML = '';
      document.body.style.cssText = 'margin:0;background:#2b2b2b;overflow:hidden';
      const f = document.createElement('iframe');
      f.id = 'pt-vp';
      f.src = './' + q;
      f.style.cssText = `position:fixed;left:8px;top:8px;width:${W}px;height:${H}px;border:0;transform:scale(${s});transform-origin:0 0;background:#fff`;
      f.addEventListener('load', () => { app().__ptWatch = false; watch(); });
      document.body.append(f);
      return `frame ${W}x${H} at scale ${s.toFixed(2)} in a ${innerWidth}x${innerHeight} pane`;
    },
    // The build: preview-info.txt and the badge.
    async build() {
      const info = await (await fetch(PREVIEW + 'preview-info.txt', { cache: 'no-store' })).text();
      return `${info.trim().replace(/\n/g, ' | ')} | badge: ${txt(doc().getElementById('preview-badge') || doc().body).slice(0, 40)}`;
    },
    // Frames per second in the app over ms (0 when the page's frames are frozen). Below 50 on the Mac: your pane is hidden or throttled, so do no motion or timing checks.
    fps(ms = 1000) {
      const w = app();
      return new Promise((res) => { let n = 0, done = false; const t0 = performance.now(); const end = () => { if (!done) { done = true; res(Math.round((n * 1000) / ms)); } }; const f = () => { n++; if (performance.now() - t0 < ms) w.requestAnimationFrame(f); else end(); }; w.requestAnimationFrame(f); setTimeout(end, ms + 500); });
    },
    vis: () => `${doc().visibilityState}, ${app().innerWidth}x${app().innerHeight}, look ${PT.look()}`,
    look() { const d = doc().documentElement.dataset; return d.palette || d.theme || 'system'; },
    // Sets a look and reloads the app (the choice is stored, so a tester beside you sharing the browser sees it on their next reload).
    setLook(id) { app().localStorage.setItem('pps.theme', id); app().location.reload(); return `reloading in ${id}`; },
    where() { const p = P()?.position?.(); return p ? `${p.id} ${p.at + 1}/${P().count()}` : 'not presenting'; },
    // Waits until the slide has landed: no slide change, no camera glide, no loading cover, for `quiet` ms.
    // skip: speed a time-lapse to its end (content checks); lift: tap a case card away.
    async settle({ limit = 60000, quiet = 1200, skip = true, lift = false } = {}) {
      const t0 = performance.now(); let q = 0, lifted = false, sawCase = false;
      while (performance.now() - t0 < limit) {
        const card = doc().querySelector('.pz-case.on');
        if (card) sawCase = true;
        if (card && lift) { card.click(); lifted = true; }
        if (skip) P()?.skipLapse?.();
        const busy = P()?.busy?.() || pps()?.stage?.gliding?.() || doc().querySelector('.pz-load.on, .pz-cover');
        if (!busy) { q += 200; if (q >= quiet) return { ok: true, ms: Math.round(performance.now() - t0), caseCard: sawCase, lifted }; } else q = 0;
        await sleep(200);
      }
      return { ok: false, ms: limit, caseCard: sawCase, lifted };
    },
    async open(id, slide = 1, o) { watch(); await P().start(id, slide - 1); return PT.settle(o); },
    async go(n, o) { P().go(n - 1); return PT.settle(o); },
    // A real key press on the app (Next: 'ArrowRight', Back: 'ArrowLeft'), the path a presenter's clicker takes.
    press(key = 'ArrowRight') { const o = { key, bubbles: true, cancelable: true }; doc().body.dispatchEvent(new app().KeyboardEvent('keydown', o)); doc().body.dispatchEvent(new app().KeyboardEvent('keyup', o)); return key; },
    // What does not fit now: text off screen, text cut by its box, ellipses, and slide cards over each other or over the controls.
    layout() {
      const w = app(), d = doc(), W = w.innerWidth, H = w.innerHeight, out = [];
      const root = d.querySelector('.pz') || d.getElementById('app') || d.body;
      for (const el of root.querySelectorAll('*')) {
        if (!vis(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        if (ownText(el) && (r.left < -2 || r.top < -2 || r.right > W + 2 || r.bottom > H + 2)) out.push(`off screen: ${name(el)} box ${Math.round(r.left)},${Math.round(r.top)} to ${Math.round(r.right)},${Math.round(r.bottom)} in ${W}x${H}`);
        const s = w.getComputedStyle(el), scrolls = /(auto|scroll)/.test(s.overflowX + s.overflowY);
        if (!scrolls && /(hidden|clip)/.test(s.overflowX + s.overflowY) && txt(el) && (el.scrollHeight > el.clientHeight + 2 || el.scrollWidth > el.clientWidth + 2)) out.push(`cut: ${name(el)} content ${el.scrollWidth}x${el.scrollHeight} in ${el.clientWidth}x${el.clientHeight}`);
        if (s.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) out.push(`ellipsis: ${name(el)}`);
      }
      const boxes = [...d.querySelectorAll('.pz > *, #topbar, #zoomPill, #vdock, #dock, #treatCard, #historyCard, #panel, #preview-badge, .toast-wrap > *')]
        .filter((el) => vis(el) && txt(el)).map((el) => [el, el.getBoundingClientRect()]).filter(([, r]) => r.width > 4 && r.height > 4);
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const [a, ra] = boxes[i], [b, rb] = boxes[j];
        if (a.contains(b) || b.contains(a)) continue;
        const ow = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), oh = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
        if (ow > 8 && oh > 8) out.push(`overlap ${Math.round(ow)}x${Math.round(oh)}: ${name(a)} and ${name(b)}`);
      }
      const clipped = P()?.degraded?.().clipped || [];
      if (clipped.length) out.push(`app's own clipped list so far: ${clipped.join(', ')}`);
      return out;
    },
    // Walks a deck (slides from..to, 1-based) and lists the slides whose layout looks wrong, with a case card up and after it is tapped away.
    async walk(id, { from = 1, to = 999, wait = 60000 } = {}) {
      if (P()?.position?.()?.id !== id) await PT.open(id, from);
      const n = P().count(), found = [];
      for (let i = from; i <= Math.min(n, to); i++) {
        const before = (P().degraded().clipped || []).length;
        P().go(i - 1);
        let s = await PT.settle({ limit: wait });
        const issues = s.ok ? [] : [`did not settle in ${wait / 1000} s`];
        const fresh = (P().degraded().clipped || []).slice(before);
        if (fresh.length) issues.push(`app says clipped: ${fresh.join(', ')}`);
        issues.push(...PT.layout().filter((x) => !x.startsWith("app's own")));
        if (s.caseCard) { s = await PT.settle({ limit: wait, lift: true }); issues.push(...PT.layout().filter((x) => !x.startsWith("app's own")).map((x) => 'after the case card: ' + x)); }
        if (issues.length) found.push({ at: `${id} ${i}/${n}`, issues: [...new Set(issues)] });
      }
      return { deck: id, slides: n, suspects: found.length, text: found.map((f) => `${f.at}\n  ${f.issues.join('\n  ')}`).join('\n') || 'no suspects' };
    },
    // The slide's words against its tiles and the model's own values (probe): near misses are the "one rounding" check.
    numbers() {
      const d = doc(), grab = (sel) => [...d.querySelectorAll(sel)].filter(vis).map(txt).join(' | ');
      const words = grab('.pz-text, .pz-case.on, .pz-panel'), tiles = grab('.pz-tiles, .pz-tile');
      const nums = (s) => [...s.matchAll(/-?\d[\d,]*(?:\.\d+)?/g)].map((m) => m[0].replace(/,/g, ''));
      const probe = P()?.probe?.() || {};
      const want = (probe.keys || []).map((k, i) => `${k}=${probe.end?.[i]}`);
      const a = nums(words), b = [...nums(tiles), ...(probe.end || []).flatMap((v) => nums(String(v)))], near = new Set();
      for (const x of a) for (const y of b) {
        const dx = Math.abs(+x - +y), dec = (x.split('.')[1] || '').length !== (y.split('.')[1] || '').length;
        if (x !== y && ((dx > 0 && dx <= 0.11) || (Number.isInteger(+x) && Number.isInteger(+y) && +y >= 10 && dx === 1) || (dx < 1e-9 && dec))) near.add(`${x} vs ${y}`);
      }
      return { at: PT.where(), words, tiles, model: want, nearMisses: [...near] };
    },
    // Pop watch: every DOM card, control and slide part whose opacity goes from nothing to full (or full to nothing) in one frame.
    pops(ms = 5000) {
      const w = app(), sel = '.pz > *, .pz > * > *, .float-ui, .toast-wrap > *, .why-pop, .modal, .tooltip, #treatCard, #historyCard, #dock, #panel, .seg button, .chip-btn';
      const eff = (el) => { let o = 1; for (let e = el; e && e !== doc().documentElement; e = e.parentElement) { const s = w.getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden') return 0; o *= +s.opacity; } return o; };
      const last = new Map(), out = [], t0 = performance.now();
      return new Promise((res) => {
        const f = () => {
          const t = Math.round(performance.now() - t0), els = new Set(doc().querySelectorAll(sel));
          for (const el of last.keys()) els.add(el);
          for (const el of els) {
            const o = el.isConnected ? eff(el) : 0, p = last.get(el);
            const r = el.isConnected ? el.getBoundingClientRect() : { width: 9, height: 9 };
            if (p !== undefined && r.width > 4 && r.height > 4) {
              if (p < 0.02 && o >= 0.6) out.push(`${t} ms IN  ${name(el)} opacity ${p.toFixed(2)} to ${o.toFixed(2)} in one frame`);
              if (p >= 0.6 && o < 0.02) out.push(`${t} ms OUT ${name(el)} opacity ${p.toFixed(2)} to ${o.toFixed(2)} in one frame`);
            }
            last.set(el, o);
          }
          if (performance.now() - t0 < ms) w.requestAnimationFrame(f); else res(out.length ? out : ['no DOM pops']);
        };
        w.requestAnimationFrame(f);
      });
    },
    // One step with the pop watch running: PT.step('ArrowRight') or PT.step('ArrowLeft').
    async step(key = 'ArrowRight', ms = 6000) { const w = PT.pops(ms); await sleep(50); PT.press(key); const pops = await w; return { at: PT.where(), pops }; },
    // The camera gate for the named decks, one report line a failing move.
    async gate(decks, back = true) { const r = await pps().cameraGate({ decks: [].concat(decks), back }); return `${r.pass} pass, ${r.fail} fail\n${r.text}`; },
    // Errors since the toolkit loaded, the app's own counted errors and the device report's ring.
    errors() { let report = null; try { report = pps()?.report?.(); } catch (e) { report = String(e); } return { page: errs.slice(-20), caught: pps()?.caught?.() || {}, report }; },
    // Off-GPU work (open the app with ?offgpu=1 first): totals, in motion, red frames and the last sites.
    offgpu: () => pps()?.offgpu?.() || 'open the app with ?offgpu=1 (PT.frame(W, H, "?offgpu=1"))',
    clipped: () => P()?.degraded?.() || 'not presenting',
  };
  watch();
  window.PT = PT;
  return 'PT ready: ' + PT.help();
})();
```
