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
  if (!presenter || !stage) throw new Error('cameraGate: the presenter and the stage are not ready yet');
  // (Waits until the slide has landed: no slide change running, no camera moving, for 400 ms. A case or question card is tapped away and a
  // time-lapse is sped to its end, as a person would; `lifted` says a card was, so its move's start is not counted from the press.)
  // (hidden: the page was hidden at some look, or a 100 ms timer took over 400 ms, or the move's frames kept landing a second apart, where the browser draws about one frame a second and stretches every timer to a second: a
  // change's frame waits, a few frames and timers of about 300 ms in all on a shown screen, then take seconds. 16 Nov 2026: a run in a
  // hidden pane reported late starts of 1 to 6 s whose steps were each one throttled second.)
  let hidden = false;
  const look = () => { if (document.visibilityState === 'hidden') hidden = true; };
  async function settled(limit = 30000) {
    const t0 = performance.now();
    let quiet = 0, lifted = false;
    while (performance.now() - t0 < limit) {
      look();
      const card = document.querySelector('.pz-case.on');
      if (card) { card.click(); lifted = true; }
      presenter.skipLapse?.();
      if (!presenter.busy() && !stage.gliding() && !document.querySelector('.pz-load.on, .pz-cover')) { quiet += 100; if (quiet >= 400) return { ok: true, lifted }; } else quiet = 0;
      const t = performance.now(); await sleep(100); if (performance.now() - t > 400) hidden = true;   // (a 100 ms timer that took four times as long: timers are throttled here)
    }
    return { ok: false, lifted };
  }
  const vbOf = (tr) => tr.vb || { w: 1, h: 0, cx: 0, cy: 0 };
  async function step(deckId, from, to, out) {
    stage.cameraTraces(true);
    hidden = false; look();
    presenter.go(to);
    const s = await settled();
    const traces = stage.cameraTraces(), at = `${deckId} ${from + 1}→${to + 1}`;
    if (!s.ok) out.push({ at, fails: ['did not land within 30 s'] });
    traces.forEach((tr, n) => {
      // (A way out of the lobule is a move of its own (the rise, stage.riseTo) that the slide's move follows: its start is counted from the
      // rise's end, the step after to-anatomy, not from the press.)
      const st = tr.steps || [], ri = st.findIndex(([p]) => p === 'to-anatomy'), rise = ri >= 0 && st[ri + 1] && st[ri + 1][1] - st[ri][1] > 300 ? st[ri + 1][1] : 0;
      const press = s.lifted || tr.press == null ? undefined : tr.press + rise;
      const fails = judgeSlideMove(tr, vbOf(tr), { lateMs: 120, pressMs: 900, press });
      // (Frames about a second apart are a hidden or throttled page, not the app: its start times are not judged, and the report says so.)
      // (Or frames that keep landing about a second apart, the throttle's own tick, even between quicker ones: a hidden pane at 2 to 11 frames a
      // second showed stalls of 1000 to 1050 ms on every move and was never caught by the median, 16 Nov 2026.)
      const gaps = tr.frames.slice(1).map((f, i) => f[0] - tr.frames[i][0]).sort((x, y) => x - y), ticks = gaps.filter((g) => g >= 900 && g <= 1150).length;
      const slow = (gaps.length > 2 && gaps[gaps.length >> 1] > 400) || ticks >= 2;
      const timed = !(hidden || slow);
      const untimed = [];
      for (let i = fails.length - 1; i >= 0; i--) if ((s.lifted && /after the press/.test(fails[i])) || (!timed && /after (the press|it was asked)/.test(fails[i]))) { if (!s.lifted || !/after the press/.test(fails[i])) untimed.unshift(fails[i]); fails.splice(i, 1); }
      if (n > 0) fails.push('a second slide move for one press');
      if (tr.blocked.length) fails.push(`refused writes (no effect on the move, but someone tried): ${[...new Set(tr.blocked.map((b) => b.who))].join(', ')}`);
      // (a late start lists the change's steps, each from the press, so the step that held it is named)
      if (fails.some((f) => /after the press/.test(f)) && tr.steps?.length) fails.push(`steps: ${tr.steps.map(([p, t]) => `${p} ${t}`).join(', ')}, camera ${Math.round(tr.t0 - tr.press)}`);
      out.push({ at, fails, untimed, timed, rise: rise || null, ms: tr.plan?.ms, start: tr.press != null && tr.frames[0] ? Math.round(tr.frames[0][0] + tr.t0 - tr.press) : null, stalls: tr.stalls || [], held: tr.held.length, end: tr.end, steps: tr.steps || null });
    });
  }
  // (decks: the app's list of decks (decks.js DECKS, an array) or a map by id; each named by its own id.)
  const byId = new Map((Array.isArray(decks) ? decks : Object.values(decks)).filter((d) => d?.id).map((d) => [d.id, d]));
  return async function cameraGate({ decks: ids = null, back = true } = {}) {
    // (a deck is named by its id, its title (any case) or its number in the list, 1 first: pps.decks() lists them)
    const all = [...byId.values()], name = (x) => (byId.has(x) ? x : typeof x === 'number' || /^\d+$/.test(x) ? all[Number(x) - 1]?.id : all.find((d) => String(d.title || '').toLowerCase() === String(x).toLowerCase())?.id) ?? x;
    const list = [].concat(ids || [...byId.keys()]).map(name);
    const unknown = list.filter((id) => !byId.has(id));
    if (unknown.length) throw new Error(`cameraGate: no deck named ${unknown.join(', ')} (the ids: ${[...byId.keys()].join(', ')})`);
    const moves = [];
    for (const id of list) {
      // (a deck that does not open within a minute is reported, and the walk goes on to the next)
      const opened = await Promise.race([Promise.resolve(presenter.start(id, 0)).then(() => true, () => false), sleep(60000).then(() => false)]);
      if (!opened || !(await settled(60000)).ok || presenter.position?.()?.id !== id) { moves.push({ at: `${id}`, fails: ['the deck did not open'] }); continue; }
      const n = presenter.count?.() ?? 0;
      if (n < 2) throw new Error(`cameraGate: ${id} opened with ${n} slides: the presenter handed to the gate cannot count them`);   // (16 Nov 2026: main.js's facade had no count, and every deck was walked over 0 slides, "0 of 0" with no error)
      for (let i = 1; i < n; i++) await step(id, i - 1, i, moves);
      if (back) for (let i = n - 2; i >= 0; i--) await step(id, i + 1, i, moves);
      console.log(`cameraGate: ${id} done (${moves.filter((m) => m.at.startsWith(id + ' ') && m.fails.length).length} failing)`);
    }
    presenter.stop?.();
    const bad = moves.filter((m) => m.fails.length), off = moves.filter((m) => m.timed === false);
    const text = [`Camera gate: ${moves.length - bad.length} of ${moves.length} slide moves pass (${list.length} decks${back ? ', Next and Back' : ''})`,
      ...(off.length ? [`NOT TIMED: ${off.length} moves ran while the page was hidden or drew about a frame a second (a hidden pane or tab), so their start times say nothing about the app and were not judged. Keep the page in front and run again to judge them. Their shapes (one straight path, no second move) were judged.`] : []),
      ...bad.map((m) => `${m.at}: ${m.fails.join('; ')}${m.stalls?.length ? ` [stalls ${m.stalls.join(', ')} ms]` : ''}`),
      ...moves.filter((m) => m.untimed?.length).map((m) => `${m.at}: not timed (page hidden or throttled): ${m.untimed.join('; ')}`),
      ...moves.filter((m) => !m.fails.length && m.stalls?.length).map((m) => `${m.at}: passes, stalls ${m.stalls.join(', ')} ms`)].join('\n');
    try { await navigator.clipboard?.writeText(text); } catch { /* (no clipboard here: the text is in the answer) */ }
    console.log(text);
    return { pass: moves.length - bad.length, fail: bad.length, moves, text };
  };
}
