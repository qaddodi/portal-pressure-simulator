// The measuring sites: the HVPG catheter record, a slide's station readings (SITE_DEF), the resistors' glue and the sites' record.
// (moved out of stage.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)
import { withGlass } from './callout.js';
import { createResistors } from './stage-resistors.js';
import { cssRGB, cssVar, s } from './util.js';

export function createSites(st, live) {
  const { EI, NI, gOver, geo, nextFrame, overSend, pointAt, recOut, recs, toneCol, worldToLocalInto, wrap } = st;
  // ── The HVPG catheter (Measure › HVPG) ─────────────
  // A balloon catheter drawn along the real vessels: in from the neck, down the SVC, through the right
  // atrium into the IVC and out into the right hepatic vein, where its tip reads the pressure. In
  // front of the inflated balloon the still column fills with the wedged (sinusoidal) pressure. The
  // readings are labels at the tip, in screen pixels. hvpg-proc.js drives it frame by frame.
  const cath = (() => {
    const g = s('g', { class: 'cath', 'aria-hidden': 'true' });
    const column = s('path', { class: 'cath-column' }), column2 = s('path', { class: 'cath-column' });
    const shadow = s('path', { class: 'cath-shadow' }), body = s('path', { class: 'cath-body' });
    const balloon = s('path', { class: 'cath-balloon' }), ring = s('circle', { class: 'cath-ring' }), tip = s('circle', { class: 'cath-tip' });
    g.append(column, column2, shadow, body, balloon, ring, tip);
    g.style.display = 'none';
    gOver.append(g);
    const labels = document.createElement('div');
    labels.className = 'cath-labels'; labels.setAttribute('aria-hidden', 'true');
    wrap.append(labels);
    return { g, column, column2, shadow, body, balloon, ring, tip, labels, st: null, at: null, saved: null, kind: 'hvpg' };
  })();
  // A presenter slide's measuring sites (the PPG's portal vein and IVC): a pointer on each station with its reading,
  // drawn like the catheter's WHVP and FHVP callouts. It fades in, follows the camera and stays in the figure's free space.
  // (The portal vein's hangs below the confluence, clear of the trunk and its clot.)
  // rLiver, rColl: the circuit's resistors, the liver's and the collaterals', each against the healthy liver's
  // resistance (a zigzag drawn on the vessels, its stroke heavier as the resistance rises, and the ratio beside it).
  const SITE_DEF = { pv: { node: 'CONF', kicker: 'Portal vein', cls: 'pv', below: true }, ivc: { node: 'IVCS', kicker: 'IVC', cls: 'ivc' },
    ra: { node: 'RA', kicker: 'Right atrium', cls: 'ivc' },
    web: { node: 'IVCS', kicker: 'IVC, below the web', cls: 'ivc', below: true },   // (with ra above it: the two sides of an IVC web)
    // split: where portal blood goes, the share that bypasses the liver over a bar split into the liver's and the shunts' shares.
    split: { node: 'PVH', kicker: 'Portal blood', cls: 'split', split: true, below: true },
    // (Both readings stand above the liver's column, clear of the station labels; the zigzags mark where each resistor is.)
    // (Named in full, each ratio bare; "vs healthy liver" is said once, in the group's key: 17 Oct design review.)
    rLiver: { kicker: 'Liver resistance', cls: 'res', unit: '', res: 'liver' },
    rColl: { kicker: 'Collateral resistance', cls: 'res coll', unit: '', res: 'coll' },
    // The gut's arterioles (the splanchnic arteries in parallel), in series before the liver: most of the pressure falls here.
    rGut: { kicker: 'Gut arteriole resistance', cls: 'res gut', unit: '', res: 'gut' } };
  const { RES_BIT, resItem, resMade, resPaint, resPlace, resRatio } = createResistors({ EI, NI, SITE_DEF, geo, pointAt, recs, worldToLocalInto }, live);
  // (The readings' parts, made ahead: a frame clones them, never builds them.)
  // (A reading's own box, with its glass in it already for those that have one: cloned on a frame, nothing built there. callout.js withGlass)
  const SITE_EL = [document.createElement('div'), withGlass(document.createElement('div'))];
  const SITE_TPL = (() => { const e = document.createElement('div'); e.innerHTML = '<small></small><b></b><span></span><i class="res-k"></i>'; return e; })();
  const SPLIT_B = (() => { const e = document.createElement('b'); e.innerHTML = '<span class="sp-h"><em class="sp-n"></em>% bypasses the liver</span><span class="sp-bar"><i class="sp-l"></i><i class="sp-s"></i></span><span class="sp-cap"><em class="sp-lt"></em><em class="sp-st"></em></span>'; return e; })();
  const RES_LIVER = new Float32Array([812, 303, 888, 303, 812, 387, 888, 387]);
  const resNow = new Float32Array(64), resKey = new Float64Array(12);   // (a record's numbers worked out, and what makes a resistor look as it does: written in place)
  // The token a station's tone names (toneCol's own, var(--x) → --x): its colour is read from the theme's tokens, never from the page.
  const toneTokens = new Map();   // alloc-rare: one text for each tone, made the first time it is lit
  const toneToken = (tone) => { let t = toneTokens.get(tone); if (!t) toneTokens.set(tone, (t = toneCol(tone).slice(4, -1))); return t; };
  const tokenRGB = (name, into, o) => { const c = cssRGB(cssVar(name) ? name : '--text'); into[o] = c[0] / 255; into[o + 1] = c[1] / 255; into[o + 2] = c[2] / 255; };
  // The records ask the painter to draw them again: a changed set of shapes re-sends the overlays' groups (overSend), a changed opacity
  // writes the shapes in place and touches the painter (recStep); either way a frame is asked for.
  function recStep() {
    live.recAsk = 0;
    recs.step(performance.now(), recOut);
    recFlush(recOut.changed);
    if (recOut.moving) live.recAsk = nextFrame(recStep);
  }
  function recFlush(changed) {
    if (!changed && recs.ver === live.recVer) return;
    if (recLive()) {
      if (recs.ver !== live.recVer) { live.recVer = recs.ver; overSend(); }
      live.veins.overlay.touch();
    } else { live.recVer = recs.ver; recSvgSync(); }
    live.askAnimate();
  }
  const recKick = () => { recFlush(false); if (!live.recAsk) live.recAsk = nextFrame(recStep); };
  // Whether the overlay painter is drawing (the GPU draws the records) or the SVG stands in for it (a software renderer, a lost context).
  const recLive = () => live.OVER_ON && !!live.veins?.overlay && !live.veins.lost && wrap.classList.contains('gl-on');
  // The SVG that stands in for the records where the GPU does not draw them: made the first time it is needed, from the records as they
  // stand. (The GPU path never makes it.)
  let recSvgG = null;
  function recSvgSync() {   // alloc-rare: only where the overlay painter is not drawing (a software renderer, a lost context), never on the GPU path
    if (!recs.spec) { recSvgG?.replaceChildren(); return; }
    if (!recSvgG) { recSvgG = s('g', { class: 'res-zz', 'aria-hidden': 'true', fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }); gOver.append(recSvgG); }
    const ops = recs.spec.ops;
    recSvgG.replaceChildren();
    for (let n = 0; n < ops.length; n++) {
      const op = ops[n], poly = op.geom.poly;
      let d = '';
      for (let j = 0; j < poly.length; j++) { const pts = poly[j].pts; if (j) d += ' '; for (let i = 0; i < pts.length; i += 2) d += `${i ? 'L' : 'M'}${pts[i].toFixed(1)} ${pts[i + 1].toFixed(1)}`; }
      const c = op.paint.solid;
      recSvgG.append(s('path', { d, stroke: `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`, 'stroke-width': op.w, 'stroke-opacity': op.alpha, 'vector-effect': 'non-scaling-stroke' }));
    }
  }
  // A theme change: the resistors' tones are the theme's tokens, read again (the frame after, when the tokens have been read: util.js readVars).
  function resTheme() { for (const [k, st] of resMade) resPaint(k, st.d, st.ratio); }
  const sites = (() => {
    const el = document.createElement('div');
    el.className = 'cath-labels site-labels'; el.setAttribute('aria-hidden', 'true');
    wrap.append(el);
    return { el, list: null, fp: null, made: new Map(), dy: null, dyG: null };
  })();
  return { RES_BIT, RES_LIVER, SITE_DEF, SITE_EL, SITE_TPL, SPLIT_B, cath, recKick, recLive, resItem, resKey, resMade, resNow, resPaint, resPlace, resRatio, resTheme, sites, tokenRGB, toneToken };
}
