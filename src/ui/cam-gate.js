// The slide camera's gate on a real device (16 Nov 2026): window.pps.cameraGate() walks every deck (or the ones named), Next through every
// slide and Back to the first, as a presenter would, and judges every slide's camera move from what the stage recorded frame by frame
// (stage.cameraTraces: slide-cam.js), with the judge the unit gate uses. The unit gate replays the moves in Node; only a device shows its own
// frames, stalls and late starts, so this is how the camera is checked where it is seen.
//   await pps.cameraGate()                          every deck
//   await pps.cameraGate({ decks: ['variceal-bleed'] })
//   await pps.cameraGate({ decks: ['sites'], back: false })
// It answers { pass, fail, moves, text }: text is the report, one line a move that failed (and its stalls), ready to paste; it is also
// copied when the page may write the clipboard.
import { judgeSlideMove } from './slide-cam.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createCameraGate({ presenter, stage, decks }) {
  // (Waits until the slide has landed: no slide change running, no camera moving, for 400 ms. A case or question card is tapped away and a
  // time-lapse is sped to its end, as a person would; `lifted` says a card was, so its move's start is not counted from the press.)
  async function settled(limit = 30000) {
    const t0 = performance.now();
    let quiet = 0, lifted = false;
    while (performance.now() - t0 < limit) {
      const card = document.querySelector('.pz-case.on');
      if (card) { card.click(); lifted = true; }
      presenter.skipLapse?.();
      if (!presenter.busy() && !stage.gliding() && !document.querySelector('.pz-load.on, .pz-cover')) { quiet += 100; if (quiet >= 400) return { ok: true, lifted }; } else quiet = 0;
      await sleep(100);
    }
    return { ok: false, lifted };
  }
  const vbOf = (tr) => tr.vb || { w: 1, h: 0, cx: 0, cy: 0 };
  async function step(deckId, from, to, out) {
    stage.cameraTraces(true);
    presenter.go(to);
    const s = await settled();
    const traces = stage.cameraTraces(), at = `${deckId} ${from + 1}→${to + 1}`;
    if (!s.ok) out.push({ at, fails: ['did not land within 30 s'] });
    traces.forEach((tr, n) => {
      const fails = judgeSlideMove(tr, vbOf(tr), { lateMs: 120, pressMs: 900, press: s.lifted ? undefined : tr.press });
      if (s.lifted) for (let i = fails.length - 1; i >= 0; i--) if (/after the press/.test(fails[i])) fails.splice(i, 1);
      if (n > 0) fails.push('a second slide move for one press');
      if (tr.blocked.length) fails.push(`refused writes (no effect on the move, but someone tried): ${[...new Set(tr.blocked.map((b) => b.who))].join(', ')}`);
      out.push({ at, fails, ms: tr.plan?.ms, start: tr.press != null && tr.frames[0] ? Math.round(tr.frames[0][0] + tr.t0 - tr.press) : null, stalls: tr.stalls || [], held: tr.held.length, end: tr.end });
    });
  }
  return async function cameraGate({ decks: ids = null, back = true } = {}) {
    const list = (ids || Object.keys(decks)).filter((id) => decks[id]);
    const moves = [];
    for (const id of list) {
      await presenter.start(id, 0);
      await settled();
      const n = presenter.count?.() ?? (decks[id].slides || []).length;
      for (let i = 1; i < n; i++) await step(id, i - 1, i, moves);
      if (back) for (let i = n - 2; i >= 0; i--) await step(id, i + 1, i, moves);
    }
    presenter.stop?.();
    const bad = moves.filter((m) => m.fails.length);
    const text = [`Camera gate: ${moves.length - bad.length} of ${moves.length} slide moves pass (${list.length} decks${back ? ', Next and Back' : ''})`,
      ...bad.map((m) => `${m.at}: ${m.fails.join('; ')}${m.stalls?.length ? ` [stalls ${m.stalls.join(', ')} ms]` : ''}`),
      ...moves.filter((m) => !m.fails.length && m.stalls?.length).map((m) => `${m.at}: passes, stalls ${m.stalls.join(', ')} ms`)].join('\n');
    try { await navigator.clipboard?.writeText(text); } catch { /* (no clipboard here: the text is in the answer) */ }
    console.log(text);
    return { pass: moves.length - bad.length, fail: bad.length, moves, text };
  };
}
