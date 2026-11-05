// A presenter's camera glide over one view: the new slide's labels solved as it sets off for where it lands, handed to the GPU, and crossed
// with the old slide's on the glide's own progress (label-system-review #6). The view switch's way (stage-view.js atTargetStage, solveTargetView,
// viewXfStart) with the glide's end camera in place of the target view, and the morph as it is.
import { cancelMay, mayTask } from './frame.js';
import { viewXfMix } from './view-xf.js';

export function createGlideLabels(st, live) {
  const { XF_SLICE_MS, handRideEnd, labelJobDrop, labelJobStep, labelSliceRun, labelTail, refreshCTM, sitesPaint, updateLabels, xfLayer } = st;
  // A presenter's glide over one view (label-system-review #6): the new slide's labels solved at its start for where it lands (the camera put to
  // the glide's end, the morph as it is: world anchors do not depend on the camera, so they stand on the figure under every frame of it), handed
  // to the GPU, and crossed with the old slide's, frozen as ghosts, on the glide's own progress. No timer. (to: the end; pending: the solve still
  // runs in slices, one a frame of the glide, at that end; landAt: the progress it was whole at; n: the new labels' share so far, never less.)
  const glideVT = { k: 1, x: 0, y: 0 };
  let glideXf = null;
  function atTargetVT(d, fn) {
    const keepVT = live.vt, keepGliding = live.vtGliding, keepMove = live.camMove;
    live.glSuppress = true;
    try {
      glideVT.k = d.k; glideVT.x = d.x; glideVT.y = d.y; live.vt = glideVT;
      live.vtGliding = false; live.camMove = false;   // (the labels' driver sees the camera at rest where the glide lands)
      live.CTM = null; refreshCTM();
      return fn();
    } finally {
      live.vt = keepVT; live.vtGliding = keepGliding; live.camMove = keepMove;
      live.CTM = null; refreshCTM();
      live.glSuppress = false;
    }
  }
  // (What the solve's tail painted under the end camera (callouts, the scan, the probe) is painted again under the camera as it stands.)
  function glideRepaint() { if (live.sites.list) sitesPaint(); if (live.scan.on) live.scanPaint(); live.dprobePaint(); }
  function glideSolve(x) {
    live.labelKey = null; live.solveAsked = true;
    live.xfSolving = true;   // (a short first slice: this is the glide's first frame)
    try { atTargetVT(x.to, () => updateLabels(live.F, true)); } finally { live.xfSolving = false; }
    cancelMay('label solve');   // (the job is the glide's: sliced at its end by glideXfStep, never by an idle slice under the moving camera)
    x.pending = !!live.labelJob;
    x.landAt = x.pending ? null : 0;
    glideRepaint();
    live.labelGlSync();
  }
  const glideOk = () => !!live.F && !!live.labelGL && !live.labelGL.lost && !live.viewXf && !live.cath.st && !live.zoomBase && !live.gestureOn() && !live.lobuleOn && !live.lz?.isOpen() && !(live.diveT > 0)
    && live.morph === live.morphTarget && (live.morph === 0 || live.morph === 1);
  // (Asked by animateVT as a presenter's glide sets off; false leaves the labels held till it lands, as before.)
  function glideXfStart(to) {
    if (glideXf) {
      // (A refit or a new framing while one runs: the ghosts stay the labels that stood when the first set off. A solve not yet whole is begun
      // again for the new end (the new labels are not shown yet); a whole one stands on its world anchors, and the landing settles it.)
      if (glideXf.pending) { labelJobDrop(); glideXf.to = { k: to.k, x: to.x, y: to.y }; glideSolve(glideXf); }
      return true;
    }
    if (!glideOk()) return false;
    live.xfHold = false;
    labelJobDrop();
    if (live.handRide) handRideEnd();
    live.labelGL.freezeGhosts();
    glideXf = { to: { k: to.k, x: to.x, y: to.y }, pending: false, landAt: 0, n: 0 };
    glideSolve(glideXf);
    live.xfOp = '';
    xfLayer(0); live.labelGL.crossfade(1, 0);
    return true;
  }
  const GLIDE_MIX = { o: 1, n: 0 };
  // (Each frame of the glide, its camera set: a slice of a pending solve at the glide's end, then the crossfade from u, its eased progress.)
  function glideXfStep(u) {
    const x = glideXf;
    if (!x) return;
    if (x.pending) {
      const j = live.labelJob;
      if (!j) { x.pending = false; x.landAt = u; }   // (dropped by another: laid out as it lands)
      else {
        let done = false;
        atTargetVT(x.to, () => {
          try { done = labelSliceRun(j.g, XF_SLICE_MS); } catch (e) { live.labelJob = null; live.labelKey = null; throw e; }
          if (!done) return;
          live.labelJob = null;
          live.solvedFor = j.solvedFor; live.solveAsked = false;
          live.labelKey = live.keyInto(live.labelKeyArr, j.key); live.stats.layouts++;
          labelTail();
        });
        if (done) { x.pending = false; x.landAt = u; glideRepaint(); live.labelGlSync(); }
      }
    }
    const m = viewXfMix(u, x.landAt, GLIDE_MIX);
    if (m.n > x.n) x.n = m.n;
    xfLayer(x.n);
    live.labelGL.crossfade(1 - x.n, x.n);
  }
  // (The camera is at rest (camSettle, or the glide cut short): a solve still running goes on at rest and the ghosts stay till it lands (labelTail,
  // xfRelease); a whole one takes over in full and the ghosts go.)
  function glideXfEnd() {
    const x = glideXf;
    if (!x || live.glSuppress) return;   // (not from the glide's own solve, which runs with the camera at rest at its end)
    glideXf = null;
    if (x.pending && live.labelJob) {
      live.labelJob.t0 = performance.now() - 1000;
      mayTask('label solve', labelJobStep, live.JOB_NOW);
      live.xfHold = true;
      xfLayer(0); live.labelGL.crossfade(1, 0);
    } else { xfLayer(1); live.labelGL.dropGhosts(); }
  }
  // (The change between the views begins over a presenter's glide: the glide's crossfade ends there, its new labels standing in full, so the
  // change freezes them, not the old ones.)
  function glideXfCut() { if (!glideXf) return; glideXf = null; xfLayer(1); live.labelGL.dropGhosts(); }
  return { glideXfCut, glideXfEnd, glideXfStart, glideXfStep };
}
