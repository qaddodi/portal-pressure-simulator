// The figure's overlays on the GPU (31 Oct, recs A1; ?stageover=gpu, off by default): the groups of #stageOver drawn by the organs'
// painter (organ-paint.js) into the vessel canvas, over the picture, at the canvas's own size (veins-gl overlay). A group drawn there
// is under every group still in the SVG, so the GPU takes them from the bottom only: the lowest run of shown groups it can read, up
// to the first shown group it cannot. That group and every one above it stay in the SVG, so the order is always the page's.

/**
 * The overlay units, bottom to top: the children of the overlays' world group, with the overlays' own group (gOver) taken as its
 * children, each a unit of its own (the caudate, the stents, the varices, ...).
 */
const UNITS = [];   // alloc-rare: made once
export function overUnits(worldOver, gOver) {
  const out = UNITS;
  out.length = 0;
  for (const k of worldOver.children) {
    if (k === gOver) { for (const c of gOver.children) out.push(c); }
    else out.push(k);
  }
  return out;
}

/**
 * The run the GPU paints: `read(unit)` gives a group's reading (organ-paint readGroup, strict), 'hidden' for a group that shows
 * nothing (it does not stop the run), or null for one that cannot be read. The units before the first null, the hidden ones left
 * out: [[unit, reading]], with `whole` true when no unit stopped it (everything the overlays show is painted), and `stop` the unit that did.
 */
export function overRun(units, read) {
  const out = [];
  out.whole = true;
  for (const u of units) {
    const r = read(u);
    if (r === 'hidden') continue;
    if (!r) { out.whole = false; out.stop = u; break; }
    out.push([u, r]);
  }
  return out;
}

/** The class that hides a unit's SVG copy while the GPU paints it (app.css: an empty clip, which no reading of its styles sees). */
export const OVER_CLASS = 'gpu-over';
/**
 * The class on the overlays' SVG itself while the GPU paints all they show (a whole run): the SVG at no opacity, so the browser
 * composites nothing for it (its groups still ease, are read and picked as before; an opacity on the root is read by none of them).
 */
export const OVER_ALL = 'gpu-all';

/**
 * Whether a mutation record (of the overlays' SVG) can change what a unit paints in a way the painter does not read at each paint:
 * the painter reads an outline's `d`, a transform and the opacities from the page as it paints (organ-paint liveOf), so those alone
 * need no new reading; the hiding classes' own coming and going is the overlays' own doing.
 */
export function needsReread(rec) {
  if (rec.type !== 'attributes') return true;
  const a = rec.attributeName;
  if (a === 'd' || a === 'transform' || a === 'opacity' || a === 'fill-opacity' || a === 'stroke-opacity') return false;
  // (The overlays' own view box, written on every frame the camera or a change between the views moves: no group's reading holds it. The painter takes each
  // group's frame from the page at each paint, and the frames it undoes by a parent's (getCTM against getCTM) both hold the view box. Left to the rule below
  // it dropped every kept reading of every group on every frame of a move: a read of each overlay element's styles at the start of each frame, 40 to 400 ms
  // at the play-tester's Mac and iPhone, 18 Nov 2026, in view changes, presets, deck slides, zoom and pan.)
  if (a === 'viewBox') return rec.target?.ownerSVGElement != null;   // (a nested svg's own view box is a group's frame: read again)
  // (An inline style whose only change is an opacity the painter reads at each paint, the calipers' fade: the same as the attributes above.)
  // (The overlays' root svg: a zoom's, a dive's and a card's camera frames write its transform, its origin, its will-change and its transition; none is part of any group's reading, which holds the group's own frame.)
  if (a === 'style' && rec.oldValue != null) { const root = rec.target?.localName === 'svg' && rec.target.ownerSVGElement == null; return styleKey(rec.oldValue, root) !== styleKey(rec.target.getAttribute('style'), root); }
  if (a === 'class') {
    const strip = (v) => String(v || '').split(/\s+/).filter((c) => c && c !== OVER_CLASS && c !== OVER_ALL).sort().join(' ');
    return strip(rec.oldValue) !== strip(rec.target.getAttribute('class'));
  }
  return true;
}

// An inline style as what a reading depends on: each declaration, the three opacities the painter reads at each paint (liveOf) by name alone
// (whether the element sets one or not decides where the painter takes it from, the page's computed value or its own).
const PAINT_READ = new Set(['opacity', 'fill-opacity', 'stroke-opacity']);
// The three sizes on screen the camera writes to the clamps' and halos' groups on every step of a zoom (stage-camera.js applyClampFs). Their only readers are
// the clamp and guide labels' text (never painted by the GPU: a group holding one is not read at all) and the SVG halos' css scale (the GPU's halos carry the
// scale as an attribute), so a zoom that wrote them dropped those groups' readings on every frame, and each was read again (the picking and zooming judder,
// 18 Nov 2026). tests/stage-over.test.js reads the stylesheets for any other reader.
export const CAMERA_SIZES = new Set(['--clamp-sw', '--clamp-fs', '--halo-k']);
const ROOT_FREE = new Set(['transform', 'transform-origin', 'will-change', 'transition']);
export function styleKey(text, root = false) {
  const out = [];
  for (const d of String(text || '').split(';')) {
    const i = d.indexOf(':');
    if (i < 0) continue;
    const name = d.slice(0, i).trim().toLowerCase();
    if (CAMERA_SIZES.has(name) || (root && ROOT_FREE.has(name))) continue;
    if (name) out.push(PAINT_READ.has(name) ? name : `${name}:${d.slice(i + 1).trim()}`);
  }
  return out.sort().join(';');
}

/**
 * A batch of mutation records with what came to nothing left out: per element and attribute, the first record (it holds the value
 * before the batch), kept only when the value now differs from it (an attribute written again with its value, or taken off and put
 * back, as the vessel marks' rebuild does with data-gl, changes nothing). Records of any other type are all kept.
 */
export function netChanges(records) {
  const out = [], first = new Map();
  for (const r of records) {
    if (r.type !== 'attributes') { out.push(r); continue; }
    let m = first.get(r.target);
    if (!m) first.set(r.target, (m = new Map()));
    if (!m.has(r.attributeName)) m.set(r.attributeName, r);
  }
  for (const m of first.values()) for (const [a, r] of m) if (r.target.getAttribute(a) !== r.oldValue) out.push(r);
  return out;
}

/**
 * The classes of an open card or sheet, and of a deck being on (presenting, its hush and cover, a held figure, the black screen, the projector), on the page or
 * the app: nothing they select is part of the figure's groups (see stage.js overKey). A deck's start and stop put several of them on or off at once, and each read
 * every overlay group again (167 ms, then 91 ms; 83 ms twice at a stop, 18 Nov 2026).
 */
export const OVER_CARD_CLASSES = ['vessel-card', 'dock-open', 'panel-open', 'menu-sheet-open', 'presenting', 'pz-hush', 'pz-hush-in', 'pz-held', 'pz-blacked', 'pz-covered', 'projector', 'thumb', 'thumb-ui'];
export const OVER_CARD_RE = new RegExp(`(?:^|\\s)(?:${OVER_CARD_CLASSES.join('|')})(?=\\s|$)`, 'g');
