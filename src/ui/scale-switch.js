// The scale switch on a deck slide (slide field `scales`, opt-in): one pill, Anatomy, Lobule, Sinusoid in Explore's words and
// order, that lets the presenter flip the figure to another scale of the same patient and back. The slide opens on its own
// scale (its cam); a flip is a detour that is never remembered, so Next, Back and a jump always open a slide on its own scale.
// Each scale can be authored as a view of its own: where the camera goes and how close, and what it calls out there.
// No DOM here: what a slide offers and what each scale shows (presenter.js draws the pill and makes the moves).
//
//   scales: ['lobule', 'anatomy:fit']               short form: the scales offered, each optionally with where it lands
//   scales: { anatomy: { cam: 'fit', labels: ['PV'], mark: { ... } },
//             lobule: { cam: 'lobule:triad', zoom: 2.6, glow: ['lobule:triad'], callout: { ... } },
//             sinusoid: {} }                         full form: each scale's view (fields in VIEW_KEYS)

export const SCALES = ['anatomy', 'lobule', 'sinusoid'];
export const SCALE_NAME = { anatomy: 'Anatomy', lobule: 'Lobule', sinusoid: 'Sinusoid' };
// Where each scale lands when the slide names no framing for it: the liver from inside it, the whole lobule, the wall.
const DEFAULT_CAM = { anatomy: 'liver', lobule: 'lobule:fit', sinusoid: 'sinusoid' };
const STATIONS = ['fit', 'triad', 'sinusoid', 'central'];
// What a scale's view may set, as the slide fields of the same name: the camera (cam, zoom: the lobule's closeness, kMax: the
// anatomy's, clear), and what is called out there (labels: anatomy stations, mark/marks, sites: readings, glow: vessels on the
// anatomy and the lobule's lit readings ('lobule:triad', 'lobule:sinusoid', 'lobule:central'), callout: the lobule's callout,
// layers: ['zones']). A scale's view starts bare: nothing of the slide's own camera or call-outs is carried over.
export const VIEW_KEYS = ['cam', 'zoom', 'kMax', 'clear', 'labels', 'mark', 'marks', 'sites', 'glow', 'glowSeq', 'callout', 'layers'];
const OWN = ['zoom', 'kMax', 'clear', 'labels', 'mark', 'marks', 'sites', 'glow', 'glowSeq', 'callout'];   // (the slide's own call-outs, left behind on a flip)

// The scale a cam shows (a slide with no cam, or a visual, shows the anatomy).
export const scaleOfCam = (cam) => (cam === 'sinusoid' ? 'sinusoid' : typeof cam === 'string' && /^lobule/.test(cam) ? 'lobule' : 'anatomy');

/** The slide's own scale: the one its cam opens on. */
export const homeScale = (s) => scaleOfCam(s?.cam);

// The slide's scales as { scale: view }, from either form (a short entry 'lobule:triad' becomes { cam: 'lobule:triad' }).
export function scaleViews(s) {
  const x = s?.scales;
  if (Array.isArray(x)) {
    const out = {};
    for (const e of x) {
      const [k, at] = String(e).split(/:(.*)/s);
      out[k] = at ? { cam: k === 'anatomy' ? at : k === 'lobule' ? `lobule:${at}` : 'sinusoid' } : {};
    }
    return out;
  }
  return x && typeof x === 'object' ? { ...x } : {};
}

/** The scales the pill shows on slide s, in Explore's order (the slide's own always among them), or [] for none.
 *  The sinusoid view draws pressure colours only, so it is offered only on a pressure-lens slide (lens: the slide's lens,
 *  'pressure' when it names none), and only where the device can draw it (sinusoid: false). A slide offers nothing without
 *  `scales`, on a visual, a catheter slide, a slide with a Doppler probe or calipers (drawn on the anatomy only) or a
 *  non-anatomic view (the Circuit). Question slides are never given the field: a flip would give the answer away. */
export function offeredScales(s, { lens = 'pressure', sinusoid = true } = {}) {
  const v = scaleViews(s);
  if (!s || !Object.keys(v).length || s.visual || s.cath || s.calipers || s.tool?.kind === 'doppler' || (s.view && s.view !== 'anatomic')) return [];
  let home = homeScale(s);
  if (home === 'sinusoid' && !sinusoid) home = 'lobule';   // (without WebGL2 a sinusoid slide shows the lobule: camera())
  const want = new Set([home, ...Object.keys(v)]);
  const out = SCALES.filter((k) => want.has(k) && (k === home || k !== 'sinusoid' || (sinusoid && lens === 'pressure')));
  return out.length > 1 ? out : [];
}

/** The cam a flip to `scale` moves to on slide s: the slide's own cam for its own scale, else the one the scale's view names,
 *  else the default (the liver, the whole lobule, the wall). */
export function scaleCam(s, scale) {
  if (scale === homeScale(s)) return s.cam || 'fit';
  if (scale === 'sinusoid') return 'sinusoid';
  return scaleViews(s)[scale]?.cam || DEFAULT_CAM[scale];
}

/** What the figure shows at `scale` on slide s, as a slide: the slide itself at its own scale; at another, the slide's words
 *  and state with its own camera and call-outs left behind and the scale's view in their place. */
export function scaleView(s, scale) {
  if (scale === homeScale(s)) return s;
  const out = { ...s, view: 'anatomic' };
  for (const k of OWN) delete out[k];
  const v = scaleViews(s)[scale] || {};
  for (const k of VIEW_KEYS) if (v[k] !== undefined) out[k] = v[k];
  out.cam = scaleCam(s, scale);
  return out;
}

/** The scale the pill selects on slide i: the flip made on that same slide, else the slide's own. A flip on another slide is
 *  never carried over (pick: { i, scale } or null). */
export const pickedScale = (pick, i, s) => (pick && pick.i === i ? pick.scale : homeScale(s));

/** What is wrong with a slide's `scales` (deck checks): an unknown scale or view field, a cam of the wrong scale or one the
 *  anatomy has no region for, a scale listed twice, or a sinusoid on a slide that is not coloured by pressure. */
export function scalesProblems(s, regions = {}, lens = 'pressure') {
  const x = s.scales;
  if (x === undefined) return [];
  if (Array.isArray(x) ? !x.length : !x || typeof x !== 'object' || !Object.keys(x).length) return ['scales must list at least one scale'];
  const out = [];
  if (Array.isArray(x)) {
    const ks = x.map((e) => String(e).split(':')[0]);
    ks.forEach((k, i) => { if (ks.indexOf(k) !== i) out.push(`${k} listed twice`); });
    for (const e of x) { const [k, at] = String(e).split(/:(.*)/s); if (k === 'lobule' && at && !STATIONS.includes(at)) out.push(`no lobule station ${at}`); }
  }
  for (const [k, v] of Object.entries(scaleViews(s))) {
    if (!SCALES.includes(k)) { out.push(`unknown scale ${k}`); continue; }
    if (!v || typeof v !== 'object') { out.push(`${k}: a view must be an object`); continue; }
    for (const f of Object.keys(v)) if (!VIEW_KEYS.includes(f)) out.push(`${k}: unknown field ${f}`);
    const cam = v.cam;
    if (cam !== undefined) {
      if (k === 'sinusoid' && cam !== 'sinusoid') out.push('sinusoid: its cam is always the wall');
      if (k === 'lobule' && !(typeof cam === 'string' && STATIONS.includes(cam.replace(/^lobule:?/, '') || 'fit') && /^lobule/.test(cam))) out.push(`lobule: no station ${cam}`);
      if (k === 'anatomy' && !(Array.isArray(cam) ? cam.length === 4 && cam.every(Number.isFinite) : cam === 'fit' || !!regions[cam])) out.push(`anatomy: no region ${cam}`);
    }
    if (k === 'sinusoid' && lens !== 'pressure') out.push('sinusoid is offered only on a pressure-lens slide');
  }
  return out;
}
