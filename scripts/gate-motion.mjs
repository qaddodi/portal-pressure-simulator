// The deck's motion on the GPU, in real time (recs R16, 3 Nov 2026). The slides stage of scripts/gate.mjs runs without WebGL, with
// reduced motion and the instant setup: it judges where a slide change ENDS, never how it moves. This check runs the other way round:
// software WebGL named as a GPU (the code path of the owner's devices), normal motion, real time, and it samples every frame the page
// paints while the cards are thrown out and in (frame.js onFrameEnd, after the glass has drawn in the final phase). In each frame the
// teaching card's words, its shade, the data card and the GPU glass under them must move as one: the glass where the card is drawn
// (card glass drawn(), glass-gl.js), the words and their shade the same distance apart as they were, and no glass shown alone under a
// card that has faded out. A move with too few sampled frames is INCONCLUSIVE, never a pass.
//
//   node scripts/gate.mjs --only motion                 (the stage; --decks hvpg narrows it, default hvpg)
//   motionIssues(samples)                               (the judgement alone: tests/gate-motion.test.js feeds it made-up frames)
//
// Run one GPU browser at a time (AGENTS.md): a second one starves the first and the frames sampled are not the page's own.

/** How far (CSS px) the glass or the shade may sit from where the card's own frame puts it, and the frames a move needs to be judged. */
export const MOTION_TOL = 1.5, MOTION_MIN_FRAMES = 4, ALONE_GLASS = 0.12, ALONE_CARD = 0.02;

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
const sameSize = (a, b) => Math.abs(a.w - b.w) <= 1 && Math.abs(a.h - b.h) <= 1;

/**
 * Judges sampled frames. Each sample: { n, els: { text, shade, data } each { x, y, w, h, o, moving } or null, glass: { seq, panes: { shade, data } each
 * { x, y, w, h, a } or null } or null }. A card is `moving` while card-throw writes its inline values (or another owner moves it).
 * Returns { issues: [text], frames: number of moving frames judged, inconclusive: bool, why }.
 */
export function motionIssues(samples, { tol = MOTION_TOL, min = MOTION_MIN_FRAMES } = {}) {
  const issues = [];
  let frames = 0;
  // (A pair (card, what must move with it) is judged over each run of frames in which the card moves at an unchanged size: their gap is
  // the run's own (padding, an edge), and any frame off it by more than tol is a frame in which the two parted.)
  const pair = (name, A, B) => {
    let run = [];
    const judge = () => {
      if (run.length >= 2) {
        const gx = median(run.map((r) => r.dx)), gy = median(run.map((r) => r.dy));
        for (const r of run) {
          const off = Math.hypot(r.dx - gx, r.dy - gy);
          if (off > tol) issues.push(`${name}: parted by ${off.toFixed(1)} px in frame ${r.n} (card at ${r.ax.toFixed(1)}, ${r.ay.toFixed(1)})`);
        }
      }
      run = [];
    };
    let prev = null;
    for (const s of samples) {
      const a = A(s), b = B(s);
      if (!a || !b || !a.moving || !(a.w > 0) || !(b.w > 0) || a.o <= ALONE_CARD) { judge(); prev = null; continue; }
      if (prev && (!sameSize(prev.a, a) || !sameSize(prev.b, b))) judge();
      run.push({ n: s.n, dx: b.x - a.x, dy: b.y - a.y, ax: a.x, ay: a.y });
      prev = { a, b };
    }
    judge();
    return run;
  };
  pair('teaching card glass vs its shade', (s) => s.els?.shade, (s) => s.glass?.panes?.shade);
  pair('data card glass vs the data card', (s) => s.els?.data, (s) => s.glass?.panes?.data);
  pair('teaching words vs their shade', (s) => s.els?.text, (s) => s.els?.shade);
  // (The glass alone: drawn under a card that is not there, the "glass appears alone then flashes off" of 2 Nov.)
  for (const s of samples) {
    for (const k of ['shade', 'data']) {
      const c = s.els?.[k], g = s.glass?.panes?.[k];
      if (c && g && g.a > ALONE_GLASS && (c.o <= ALONE_CARD || !(c.w > 0))) issues.push(`${k} glass drawn alone (glass ${g.a.toFixed(2)}, card ${c.o.toFixed(2)}) in frame ${s.n}`);
    }
    const moving = ['text', 'shade', 'data'].some((k) => s.els?.[k]?.moving && s.els[k].o > ALONE_CARD);
    if (moving && s.glass && (s.glass.panes?.shade || s.glass.panes?.data)) frames++;
  }
  const inconclusive = frames < min;
  return { issues, frames, inconclusive, why: inconclusive ? `only ${frames} moving frame(s) with the glass drawn were sampled (at least ${min} are needed)` : '' };
}

/** In the page (source build): starts sampling every frame end into window.__motion (cleared). Resolves true when the hooks are there. */
export const startSampler = async () => {
  const fr = await import('/src/ui/frame.js').catch(() => null);
  if (!fr?.onFrameEnd) return 'no frame.js onFrameEnd';
  window.__motionStop?.();
  const S = (window.__motion = []);
  const box = (el) => {
    if (!el || el.hidden) return null;
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    return { x: r.left, y: r.top, w: r.width, h: r.height, o: +cs.opacity * (cs.visibility === 'hidden' ? 0 : 1), moving: el.classList.contains('pz-throwing') || /translate/.test(el.style.transform || '') };
  };
  const pane = (d, el) => { const p = el && d?.panes?.find((q) => q.el === el); return p ? { x: p.x, y: p.y, w: p.w, h: p.h, a: p.a } : null; };
  window.__motionStop = fr.onFrameEnd(() => {
    const text = document.querySelector('.pz-text'), shade = document.querySelector('.pz-shade'), data = document.querySelector('.pz-data');
    const d = window.pps?.presenter?.glass?.()?.drawn?.() || null;
    S.push({ n: fr.frameCount(), els: { text: box(text), shade: box(shade), data: box(data) }, glass: d ? { seq: d.seq, panes: { shade: pane(d, shade), data: pane(d, data) } } : null });
    if (S.length > 4000) S.splice(0, 1000);
    window.__motionN = (window.__motionN || 0) + 1;
  });
  return window.pps?.presenter?.glass?.()?.drawn ? true : 'the card glass has no drawn() hook';
};
export const takeSamples = () => (window.__motion || []).splice(0);   // (emptied in place: the sampler keeps writing into the same list)
