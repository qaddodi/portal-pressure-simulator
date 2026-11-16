// The slide camera's wiring (16 Nov 2026 rewrite, slide-cam.js): while a slide's move runs it is the camera's one writer. Each rule keeps its reason.
export default [
  { file: 'src/ui/stage.js', need: [/function writeVT\(v\) \{\n\s+if \(!lockedWrite\(camLock, handNow\)\) return;/, 'the stage\'s one write of the view asks the slide camera\'s lock first: another\'s write during a slide\'s move is refused and named in its trace'] },
  { file: 'src/ui/stage-glide.js', need: [/if \(opt\.slide\) \{ slideGlide\(to, ms\); return; \}\n\s+if \(heldByLock\(to, ms, opt\)\) return;\n\s+live\.following = false;[^\n]*\n\s+cancelFrame\(live\.vtAnim\);/, 'a slide\'s move runs on its own (one plan, one path, one clock), and any other glide asks the lock before it stops or starts anything'] },
  { file: 'src/ui/stage-glide.js', between: ['function slideGlide(', 'function heldByLock('], forbid: [/alongPath|blendPaths|carriedCam|springSlope|lateShift|camPath/, 'a slide\'s move has no vessel path, no blended refit, no carried speed, no late-start shift and no pull-back: the even glide on its own clock'] },
  { file: 'src/ui/stage-gestures.js', need: [/live\.camLock\?\.release\('hand'\);[^\n]*\n\s+viewXfDetach\(live\.viewXf\);[^\n]*\n\s+cancelFrame\(live\.vtAnim\); driftEnd\(\); live\.vtGliding = false; stopGlide\(\); wheelGlide\.cancel\(\); hand\.begin\(\);/, 'a press takes the camera from a slide\'s move'] },
  { file: 'src/ui/stage-gestures.js', need: [/live\.camLock\?\.release\('hand'\);\n\s+viewXfDetach\(live\.viewXf\);[^\n]*\n\s+if \(live\.vtGliding\) \{ cancelFrame/, 'a wheel or a pinch takes the camera from a slide\'s move'] },
  { file: 'src/ui/stage-camera.js', need: [/function zoomAt\(cx, cy, factor, stretch = false\) \{\n\s+live\.camLock\?\.release\('hand'\);/, 'a zoom of the hand takes the camera from a slide\'s move'] },
  { file: 'src/ui/stage-camera.js', need: [/function animZoomAt\(cx, cy, factor\) \{\n[^\n]*\n\s+live\.camLock\?\.release\('hand'\);/, 'the zoom pill takes the camera from a slide\'s move'] },
  { file: 'src/ui/stage-fit.js', need: [/function setCircuitRotated\(on\) \{\n\s+live\.camLock\?\.release\('turn'\);/, 'turning the map takes the camera from a slide\'s move'] },
  { file: 'src/ui/stage-view.js', need: [/function viewXfStart\(d\) \{\n\s+live\.camLock\?\.release\('view'\);/, 'a change of view takes the camera on its own clock'] },
  { file: 'src/ui/stage-zoom.js', need: [/function zoomOpen\(\) \{\n\s+live\.camLock\?\.release\('card zoom'\);/, 'a card\'s zoom takes the camera'] },
  { file: 'src/ui/stage-view.js', need: [/function atTargetStage\([^\n]*camLock\.dry\(/, 'the change\'s dry label solve writes the view and puts it back: the lock lets it through'] },
  { file: 'src/ui/glide-labels.js', need: [/function atTargetVT\([^\n]*camLock\.dry\(/, 'the glide\'s dry label solve writes the view and puts it back: the lock lets it through'] },
  { file: 'src/ui/presenter.js', need: [/stage\.railEnd\?\.\(\);/, 'every slide change tells the camera (camLock.pressed): the last move lets go, and the next counts its start from the press'] },
];
