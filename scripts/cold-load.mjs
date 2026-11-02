// Cold load probe: what the main thread does in the first minute after the page opens.
//   node scripts/cold-load.mjs [--device mac|iphone] [--secs 70] [--query "x=0"] [--dir .|dist] [--json out.json]
// CPU profile from navigation on; self time bucketed into 5 s windows, with the top functions per window; rAF gaps per window.
// Draws are stubbed (no GPU here), the renderer reads as a GPU, as in frame-budget.mjs. Report only.
import { writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';
import { DEVICES, CHROMIUM_ARGS } from './shoot.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const device = arg('device', 'mac'), secs = +arg('secs', 70), extra = arg('query', ''), out = arg('json', ''), WIN = +arg('win', 5);
const EXE = process.env.CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : '');
const INIT = () => {
  for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    if (!C) continue;
    const P = C.prototype, gp = P.getParameter;
    P.getParameter = function (p) { return p === 0x9246 || p === 0x1F01 ? 'Apple M2 GPU' : gp.call(this, p); };
    for (const k of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements', 'clear', 'blitFramebuffer']) if (P[k]) P[k] = function () {};
  }
  window.__gaps = [];
  let last = 0;
  const tick = (t) => { if (last) window.__gaps.push([t, t - last]); last = t; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
};
const shortUrl = (u) => (u || '').replace(/^.*\/(src|styles)\//, '$1/').replace(/\?v=[0-9a-f]+/, '') || '(native)';

const server = await serve(resolve(ROOT, arg('dir', '.')));
const browser = await chromium.launch({ args: [...CHROMIUM_ARGS, '--disable-gpu-compositing'], ...(EXE ? { executablePath: EXE } : {}) });
const ctx = await browser.newContext({ ...DEVICES[device], serviceWorkers: 'block' });
const page = await ctx.newPage();
await page.addInitScript(INIT);
page.on('pageerror', (e) => console.log('pageerror', e.message));
const cdp = await ctx.newCDPSession(page);
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
await cdp.send('Profiler.start');
const t0 = Date.now();
await page.goto(`${server.url}${extra ? `?${extra}` : ''}`);
await page.waitForTimeout(secs * 1000 - (Date.now() - t0));
const { profile } = await cdp.send('Profiler.stop');
const navStart = await page.evaluate(() => performance.timeOrigin);
const gaps = await page.evaluate(() => window.__gaps);
await browser.close(); server.close();

const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
const parent = new Map(); for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
const name = (n) => `${n.callFrame.functionName || '(anon)'} ${shortUrl(n.callFrame.url)}:${n.callFrame.lineNumber + 1}`;
// the app frame nearest the leaf (for native leaves)
const appName = (id) => { let n = nodes.get(id); const leaf = n; while (n && !/\/(src|styles)\//.test(n.callFrame.url)) n = nodes.get(parent.get(n.id)); return n && n !== leaf ? `${name(leaf)} < ${name(n)}` : name(leaf); };
const wins = [];
let t = profile.startTime;
const p0 = profile.startTime;
for (let i = 0; i < profile.samples.length; i++) {
  t += profile.timeDeltas[i];
  const dt = (profile.timeDeltas[i + 1] ?? 0) / 1000;
  const n = nodes.get(profile.samples[i]); const fn = n.callFrame.functionName;
  if (fn === '(idle)') continue;
  const w = Math.floor((t - p0) / 1e6 / WIN);
  const W = wins[w] || (wins[w] = { busy: 0, self: new Map() });
  W.busy += dt;
  const k = fn === '(program)' || fn === '(garbage collector)' ? fn : appName(n.id);
  W.self.set(k, (W.self.get(k) || 0) + dt);
}
const rows = [];
for (let w = 0; w < wins.length; w++) {
  const W = wins[w] || { busy: 0, self: new Map() };
  const g = gaps.filter(([tt]) => Math.floor(tt / 1000 / WIN) === w).map(([, d]) => d);
  const long = g.filter((d) => d > 50).length, worst = Math.max(0, ...g);
  console.log(`\n[${w * WIN}-${(w + 1) * WIN}s] busy ${(W.busy / (WIN * 10)).toFixed(0)}%  frames ${g.length}  >50ms ${long}  worst ${worst.toFixed(0)}ms`);
  const top = [...W.self].sort((a, b) => b[1] - a[1]).slice(0, 12);
  for (const [k, ms] of top) console.log(`   ${ms.toFixed(0).padStart(6)} ms  ${k}`);
  rows.push({ w, busy: W.busy, frames: g.length, long, worst, top });
}
if (out) writeFileSync(out, JSON.stringify(rows, null, 2));
if (arg('profile', '')) writeFileSync(arg('profile'), JSON.stringify(profile));
void navStart;
