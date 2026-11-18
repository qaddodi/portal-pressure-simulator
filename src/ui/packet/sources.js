// What the page can say for a bug packet: the one place that reads window.pps and the page for it (state.js, the report, the recorder, the rules, the device).
// Everything is optional: a build without the screen report or the recorder still makes a packet, and the packet says what it lacks (packet.js `missing`).
// Runs on a tap, never in a frame; reads no layout (the screen report reads its own through layout-snap.js).

import { captureState, stateLink, baseOf } from './state.js';
import { buildPacket } from './packet.js';
import { RELEASE } from '../../version.js';

const last = (s) => String(s || '').trim().split(/\s+/).pop() || '';

export function buildInfo(doc = document) {
  const badge = doc.getElementById?.('preview-badge')?.textContent?.replace(/\s+/g, ' ').trim() || '';
  const hash = badge.match(/\b[0-9a-f]{7,40}\b/)?.[0] || (/^[0-9a-f]{7,40}$/.test(last(RELEASE)) ? last(RELEASE) : '');
  return { release: RELEASE, badge: badge || 'Live site', commit: hash };
}

export function deviceInfo(pps, { win = window, doc = document } = {}) {
  const tag = doc.querySelector?.('[data-renderer]');
  const root = doc.documentElement;
  return {
    ua: win.navigator?.userAgent || '', screen: `${win.innerWidth}x${win.innerHeight}`, dpr: win.devicePixelRatio || 1,
    renderer: tag?.dataset.renderer || '', quality: tag?.dataset.quality ?? null,
    look: root.getAttribute('data-palette') || root.getAttribute('data-theme') || 'system',
  };
}

export function healthInfo(pps) {
  const h = {};
  try { h.errors = Object.values(pps.caught?.() || {}).reduce((n, r) => n + (r.n || 0), 0); } catch { /* (no error log) */ }
  try { if (pps.budget?.memoryMB) { h.gpuMB = Math.round(pps.budget.memoryMB()); h.peakMB = Math.round(pps.budget.peakMB()); } } catch { /* (no budget) */ }
  return h;
}

/**
 * The packet for the screen as it is now. `rules(report, history)` (default: pps.selfcheck.run when the build has one) judges the report; without it the
 * packet carries the recorder's own findings only. note: what the person wrote.
 */
export async function packetNow(pps, { note = '', win = window, doc = document, rules } = {}) {
  const state = captureState(pps, { doc, win });
  const link = stateLink(state, baseOf(win.location));
  let screen = null, screenText = '', history = null, findings = null, watchFindings = [];
  try { if (typeof pps.screen === 'function') { screen = await pps.screen(); screenText = typeof pps.screen.text === 'function' ? pps.screen.text(screen) : ''; } } catch (e) { screenText = `(the screen report failed: ${e?.message || e})`; }
  try { if (typeof pps.watch?.history === 'function') history = await pps.watch.history({ seconds: 10 }); } catch { /* (the recorder is off) */ }
  try { if (typeof pps.watch?.findings === 'function') watchFindings = (await pps.watch.findings()) || []; } catch { /* (the recorder is off) */ }
  const judge = rules || pps.selfcheck?.run;
  try { if (screen && typeof judge === 'function') findings = (await judge(screen, { history })) || []; } catch (e) { watchFindings = [...watchFindings, { rule: 'selfcheck-failed', what: 'The rules could not run', where: String(e?.message || e), scope: 'state' }]; }
  return buildPacket({ state, link, screen, screenText, history, findings, watchFindings, device: deviceInfo(pps, { win, doc }), build: buildInfo(doc), health: healthInfo(pps) }, { note });
}
