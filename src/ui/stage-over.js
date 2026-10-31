// The figure's overlays on the GPU (31 Oct, recs A1; ?stageover=gpu, off by default): the groups of #stageOver drawn by the organs'
// painter (organ-paint.js) into the vessel canvas, over the picture, at the canvas's own size (veins-gl overlay). A group drawn there
// is under every group still in the SVG, so the GPU takes them from the bottom only: the lowest run of shown groups it can read, up
// to the first shown group it cannot. That group and every one above it stay in the SVG, so the order is always the page's.

/**
 * The overlay units, bottom to top: the children of the overlays' world group, with the overlays' own group (gOver) taken as its
 * children, each a unit of its own (the caudate, the stents, the varices, ...).
 */
export function overUnits(worldOver, gOver) {
  const out = [];
  for (const k of worldOver.children) {
    if (k === gOver) out.push(...gOver.children);
    else out.push(k);
  }
  return out;
}

/**
 * The run the GPU paints: `read(unit)` gives a group's reading (organ-paint readGroup, strict), 'hidden' for a group that shows
 * nothing (it does not stop the run), or null for one that cannot be read. The units before the first null, the hidden ones left
 * out: [[unit, reading]].
 */
export function overRun(units, read) {
  const out = [];
  for (const u of units) {
    const r = read(u);
    if (r === 'hidden') continue;
    if (!r) break;
    out.push([u, r]);
  }
  return out;
}

/** The class that hides a unit's SVG copy while the GPU paints it (app.css: an empty clip, which no reading of its styles sees). */
export const OVER_CLASS = 'gpu-over';

/**
 * Whether a mutation record (of the overlays' SVG) can change what a unit paints in a way the painter does not read at each paint:
 * the painter reads an outline's `d`, a transform and the opacities from the page as it paints (organ-paint liveOf), so those alone
 * need no new reading; the hiding class's own coming and going is the overlays' own doing.
 */
export function needsReread(rec) {
  if (rec.type !== 'attributes') return true;
  const a = rec.attributeName;
  if (a === 'd' || a === 'transform' || a === 'opacity' || a === 'fill-opacity' || a === 'stroke-opacity') return false;
  if (a === 'class') {
    const strip = (v) => String(v || '').split(/\s+/).filter((c) => c && c !== OVER_CLASS).sort().join(' ');
    return strip(rec.oldValue) !== strip(rec.target.getAttribute('class'));
  }
  return true;
}
