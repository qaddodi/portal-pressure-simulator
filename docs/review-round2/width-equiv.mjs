// The breathing widths' fast path (stage.js stepWidths) draws the same figure as the full update would.
//
// Between model frames, while only vessel widths ease, each display frame runs the width step instead of the full update.
// This check catches the width step leaving something stale: right after a frame the width step drew, it runs the full
// update at the same instant (performance.now frozen, so no width moves on) and records what that changes. Every DOM
// attribute or text it changes, and every GPU tube or radius row it uploads with different data, is something the width
// step should have written and did not. If the two paths agree, both lists are empty.
//
// Covered: decompensated cirrhosis, healthy, a TIPS shown, a vessel selected, the flow lens, the circuit view.
// Differences under 0.02 (world units, colour or radius) are the last sub-pixel snap of an ease, which both paths make on
// their next step with the same code: they are counted apart and never fail the check.
// Not covered, by design: anything driven by the clock rather than by the widths (the frozen clock hides it), such as the
// SVG-only ascites ripple. Run this on the source tree, not dist: it hooks the page's own gpu-probe.js module.
//
//   node tests/e2e/width-equiv.mjs [dir]        N=30 checks per case (default)

import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { serve } from '../../scripts/serve.mjs';

const dir = process.argv[2] || '.';
const N = +(process.env.N || 30);
const TOL = 0.02;
// The page imports gpu-probe.js under a cache stamp; the check must import the very same module to hook its timer.
const stamp = readFileSync(join(dir, 'src/ui/stage.js'), 'utf8').match(/gpu-probe\.js\?v=([0-9a-f]+)/)?.[1];
if (!stamp) { console.log('FAIL no stamped gpu-probe.js import in src/ui/stage.js (run on the source tree, not dist)'); process.exit(1); }

const server = await serve(dir);
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-compositing'], ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) });
let failed = 0;

const CASES = [
  { name: 'cirrhosis', preset: 'cirr-decomp' },
  { name: 'healthy', preset: 'healthy' },
  { name: 'healthy, TIPS shown', preset: 'healthy', set: () => window.pps.updateParams({ tips: { on: true, d: 8 } }) },
  { name: 'healthy, IVC selected', preset: 'healthy', set: () => window.pps.store.set({ selection: { type: 'edge', id: 'IVC_IS' } }) },
  { name: 'cirrhosis, flow lens', preset: 'cirr-decomp', set: () => window.pps.store.set({ colorMode: 'flow' }) },
  { name: 'cirrhosis, circuit view', preset: 'cirr-decomp', set: () => window.pps.store.set({ view: 'circuit' }) },
];

try {
  for (const c of CASES) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    page.setDefaultTimeout(120000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => {
      // A hardware renderer's name, so the figure takes its GPU path on a machine without one; draws are skipped (this check
      // reads what is uploaded, not pixels), so frames come fast. Each 64-wide (radius) or 13-wide (tube) float upload is
      // kept per row, and while a check is open, any upload whose data differ from the row the GPU already holds is logged.
      window.__rows = new Map(); window.__upLog = null;
      for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
        if (!C) continue;
        const gp = C.prototype.getParameter;
        C.prototype.getParameter = function (p) { return p === 0x9246 || p === 0x1F01 ? 'Apple M2 GPU' : gp.call(this, p); };
        for (const f of ['drawArrays', 'drawArraysInstanced', 'drawElements', 'drawElementsInstanced', 'clear', 'blitFramebuffer']) C.prototype[f] = function () {};
        const ts = C.prototype.texSubImage2D;
        C.prototype.texSubImage2D = function (...a) {
          const d = a[8];
          if (d instanceof Float32Array && (a[4] === 64 || a[4] === 13)) {
            const key = `${a[4] === 64 ? 'radius' : 'tube'} row ${a[3]}`, prev = window.__rows.get(key);
            const copy = Float32Array.from(d.subarray(0, a[4] * a[5] * (a[4] === 13 ? 4 : 2)));
            if (window.__upLog) {
              let maxd = prev && prev.length === copy.length ? 0 : Infinity;
              if (maxd === 0) for (let i = 0; i < copy.length; i++) maxd = Math.max(maxd, Math.abs(copy[i] - prev[i]));
              if (maxd > 0) window.__upLog.push({ key, maxd });
            }
            window.__rows.set(key, copy);
          }
          return ts.apply(this, a);
        };
      }
    });
    await page.goto(server.url + '?preset=' + c.preset);
    await page.waitForFunction(() => window.pps?.store?.get().frame, null, { timeout: 120000 });
    await page.evaluate(() => window.pps.host.send({ type: 'run', running: true }));
    if (c.set) await page.evaluate(c.set);
    await page.waitForTimeout(8000);   // (landed: reveals, glides and the patient's first eases done; breathing goes on)

    const res = await page.evaluate(async ({ N, stamp, TOL }) => {
      const { gpuProbe: g } = await import(`/src/ui/gpu-probe.js?v=${stamp}`);
      const time = g.time.bind(g), now = performance.now.bind(performance);
      const wasOn = g.on; g.on = true;
      const out = [];
      let pending = false;
      const mo = new MutationObserver(() => {});
      mo.observe(document.documentElement, { subtree: true, attributes: true, attributeOldValue: true, childList: true, characterData: true, characterDataOldValue: true });
      const name = (el) => { if (!el || el.nodeType !== 1) return el?.nodeName || '?'; const id = el.id || el.closest?.('[data-id]')?.getAttribute('data-id') || ''; const cl = el.getAttribute('class'); return el.tagName.toLowerCase() + (cl ? '.' + cl.split(' ').join('.') : '') + (id ? '#' + id : ''); };
      // A change made of numbers that all moved by less than TOL (with the same text around them) is a residual snap.
      const nums = (s) => String(s).match(/-?\d+(\.\d+)?(e-?\d+)?/g) || [];
      const residual = (a, b) => { const x = nums(a), y = nums(b); return x.length === y.length && String(a).replace(/-?\d+(\.\d+)?(e-?\d+)?/g, '#') === String(b).replace(/-?\d+(\.\d+)?(e-?\d+)?/g, '#') && x.every((v, i) => Math.abs(v - y[i]) < TOL); };
      await new Promise((resolve) => {
        setTimeout(resolve, 90000);
        g.time = (gl, step, f) => {
          if (step !== 'width step (script)' || pending || out.length >= N) return time(gl, step, f);
          const T = now();
          performance.now = () => T;
          let r;
          try { r = time(gl, step, f); } finally { performance.now = now; }
          pending = true;
          // After the whole frame (the stage drew, the other surfaces ran): the full update at the same instant.
          queueMicrotask(() => {
            mo.takeRecords();
            window.__upLog = [];
            performance.now = () => T;
            try { window.pps.stage.update(window.pps.store.get().frame); } finally { performance.now = now; }
            const recs = mo.takeRecords(), ups = window.__upLog;
            window.__upLog = null;
            const diffs = new Set(), small = new Set();
            for (const rec of recs) {
              if (rec.type === 'childList') { if (rec.addedNodes.length || rec.removedNodes.length) diffs.add(`children of ${name(rec.target)} +${rec.addedNodes.length} -${rec.removedNodes.length}`); continue; }
              const el = rec.type === 'characterData' ? rec.target.parentElement : rec.target;
              const v = rec.type === 'characterData' ? rec.target.data : rec.target.getAttribute(rec.attributeName);
              if (rec.oldValue === v) continue;
              const what = `${name(el)} ${rec.type === 'characterData' ? 'text' : rec.attributeName}`;
              (residual(rec.oldValue, v) ? small : diffs).add(`${what}: ${String(rec.oldValue).slice(0, 50)} -> ${String(v).slice(0, 50)}`);
            }
            for (const u of ups) (u.maxd < TOL ? small : diffs).add(`${u.key} uploaded with data ${u.maxd === Infinity ? 'of another size' : `off by up to ${u.maxd.toPrecision(2)}`}`);
            out.push({ diffs: [...diffs], small: small.size });
            pending = false;
            if (out.length >= N) resolve();
          });
          return r;
        };
      });
      g.time = time; g.on = wasOn;
      mo.disconnect();
      return out;
    }, { N, stamp, TOL });

    const bad = res.filter((r) => r.diffs.length), smalls = res.filter((r) => r.small).length;
    const tally = new Map();
    for (const r of bad) for (const d of r.diffs) { const k = d.replace(/-?\d+(\.\d+)?(e-?\d+)?/g, '#'); tally.set(k, (tally.get(k) || 0) + 1); }
    console.log(`${c.name.padEnd(26)} ${res.length} checks: ${bad.length ? `${bad.length} DIFFER` : 'the width step wrote what the full update would'}${smalls ? ` (${smalls} with residual snaps under ${TOL})` : ''}`);
    if (res.length < Math.min(N, 5)) { failed++; console.log(`FAIL ${c.name}: only ${res.length} width steps ran (is the model running and breathing?)`); }
    if (bad.length) { failed++; for (const [k, n] of [...tally].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`  ${String(n).padStart(3)}× ${k}`); }
    if (errors.length) { failed++; console.log(`FAIL ${c.name}: page errors: ${[...new Set(errors)].slice(0, 3).join(' | ')}`); }
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close?.();
}
console.log(failed ? `width-equiv: ${failed} failure(s)` : 'width-equiv: passed');
process.exit(failed ? 1 : 0);
