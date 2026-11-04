// The text-size settings: a run's size on screen and a line's width.
// (moved out of stage.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)
import { roleOf, rolePx } from './type-scale.js';

export function createLabelSize(st, live) {
  const { deskK, deskMQ, textW } = st;
  // (Projecting, the projector's size times the viewer's own text size from Settings.)
  const labelBase = () => (live.projecting ? (typeof live.projecting === 'number' ? live.projecting : 2) * live.labelScale : live.labelScale * deskK());
  // (A window dragged between a desktop's width and a narrow one: the labels follow; a presentation sets its own.)
  deskMQ.addEventListener?.('change', () => { if (live.projecting) return; document.documentElement.style.setProperty('--label-k', String(live.labelScale * deskK())); document.documentElement.style.setProperty('--label-scale', String(live.labelScale)); document.documentElement.style.setProperty('--ts', String(live.labelScale)); dispatchEvent(new Event('pps:labelscale')); });
  // A line is a list of runs { t, size, weight, cls, track }. Returns [width, height].
  // A run's size on screen: its role (reading, name, caption) at this screen's size, times the text size setting;
  // a presentation raises it to the projector's size (never below Explore's).
  const fontPx = (size) => rolePx(roleOf(size)) * live.labelScale * (live.projecting ? Math.max(1, Math.min(typeof live.projecting === 'number' ? live.projecting : 2, 2.2) / 1.5) : 1);
  const LINE_H = (line) => { let m = -Infinity; for (let i = 0; i < line.length; i++) m = Math.max(m, fontPx(line[i].size)); return m * 1.24; };
  const lineW = (line) => { let w = 0; for (let i = 0; i < line.length; i++) { const r = line[i]; w = w + textW(r.t, fontPx(r.size), r.weight, r.track || 0) + (i ? (r.gap ?? 3) * live.labelK : 0); } return w; };
  return { LINE_H, fontPx, labelBase, lineW };
}
