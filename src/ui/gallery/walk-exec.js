// Plays one step of a journey (journeys.js) on the real page, and reads what the page holds (walk.js asks for both). Uses the app's own controls only
// (window.pps, the stage's own view calls, the gallery API), the way the camera bench, the procedures bench and the specimen openers do; nothing is copied.
// Every step ends by waiting until the page is still: no camera move, no card arriving, no talk changing slides. Runs on a step, never in a frame.
import { appMove, createSettler } from './benches/camera-grid.js';
import { clearAll } from './openers.js';
import { viewKey } from '../store.js';
import { memoryMB, peakMB, contextCount, budget, holdersNow } from '../gpu-budget.js';
import { contextStats } from '../gl-contexts.js';

const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
export const STEP_LIMIT_MS = 15000;   // the longest a step may take to come to rest before the walk calls it "not settled" and goes on

/** What the page holds now, as walk.js reads it: { mb, peak, own, charts, live, lost, unmet, heap, owners: [{ owner, mb }], holders: [{ owner, kind, mb }] }. One read per step. */
export function readDevice() {
  let heap = null;
  try { const u = globalThis.performance?.memory?.usedJSHeapSize; if (Number.isFinite(u)) heap = u / 1e6; } catch { /* (Safari has no heap figure) */ }
  let own = 0, charts = 0, live = 0, lost = 0, unmet = 0, owners = [];
  try { const c = contextCount(); own = c.own; charts = c.charts; } catch { /* (the registry is not up) */ }
  try { const s = contextStats(); live = s.live; lost = s.lost; } catch { /* (the registry is not up) */ }
  try { owners = budget().owners.map((o) => ({ owner: o.owner, mb: o.mb })); } catch { /* (the registry is not up) */ }
  try { unmet = holdersNow().unmetMB; } catch { /* (the registry is not up) */ }
  let holders = [];
  try { holders = holdersNow().list; } catch { /* (the registry is not up) */ }
  return { mb: memoryMB(), peak: peakMB(), own, charts, live, lost, unmet, heap, owners, holders };
}

/** The executor for walk.js: exec(step) plays it and waits for rest. `api` is the gallery API (pps.gallery) when the page has one. */
export function createExecutor({ pps, api, limitMs = STEP_LIMIT_MS }) {
  const settler = createSettler(pps, { quietMs: 250 });
  async function still() {
    const s = await settler.wait(limitMs);
    let more = { settled: true };
    if (api?.settled) more = await api.settled({ timeoutMs: Math.max(2000, Math.round(limitMs / 2)), quietMs: 200 });
    return { settled: !!s.ok && !!more.settled };
  }
  const presenter = () => pps?.presenter || null;

  async function exec(step) {
    switch (step.op) {
      case 'preset': await pps.loadPreset(step.id); break;
      case 'view': {
        appMove(pps, viewKey(), step.to);
        await sleep(120);
        const r = await still();
        if (viewKey() !== step.to) return { ok: false, settled: r.settled, error: `the app is in ${viewKey()}, not ${step.to}` };
        return r;
      }
      case 'camera': pps.stage.setCamera({ k: step.k, x: step.x, y: step.y }, step.ms || 600); await sleep(150); return still();
      case 'pane': pps.dock.show(step.pane); break;
      case 'organ': document.querySelector(`#dock .ps-btn[data-organ="${step.organ}"]`)?.click(); break;
      case 'pick':
        pps.store.set({ selection: step.sel });
        if (step.details) { await sleep(200); await still(); pps.card?.el?.querySelector('.ac-name')?.click(); }
        break;
      case 'clear': await clearAll(pps); break;
      case 'slide': {
        const p = presenter();
        if (!p?.start) return { ok: false, error: 'the presenter is not available (pps.presenter)' };
        const pos = p.position?.();
        if (pos && pos.id === step.deck) p.go(step.at);
        else { if (pos) { p.stop?.(); await sleep(200); } await p.start(step.deck, step.at); }
        break;
      }
      case 'talk-end': if (presenter()?.position?.()) presenter().stop?.(); break;
      case 'entry': {
        if (!api?.open) return { ok: false, error: 'the gallery API is not up (pps.gallery)' };
        const o = await api.open(step.id, { timeoutMs: limitMs });
        return { ok: o.ok || o.error === 'did not settle in time', settled: !!o.settled, error: o.ok ? undefined : o.error };
      }
      default: return { ok: false, error: `unknown step "${step.op}"` };
    }
    await sleep(120);   // (the page takes an ask on its next frame: look for rest after that)
    return still();
  }
  return { exec, still, cancel: () => settler.cancel() };
}

/** The judges at a stop: the shared fit rules (pps.gallery.check) and the self-check rules over pps.screen (docs/screen-report.md). Each is optional. */
export async function judgeHere(pps, api) {
  const out = { problems: [], findings: [] };
  try { out.problems = api?.check?.().problems || []; } catch { /* (no card up: nothing to fit) */ }
  try { const r = await pps?.screen?.({ detail: 'summary' }); out.findings = r?.findings || []; } catch { /* (the report part that failed is in the report's own errors) */ }
  return out;
}
