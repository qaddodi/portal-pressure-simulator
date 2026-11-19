// What each piece of a chart's model is FOR, read from the key it takes its look by (its `data-look`, chart-looks/index.js: <group>.<part>[.<sub>]).
// The screen report's chart reader (chart-reader.js) hands each piece one of these roles, and the chart rules (chart-rules.js) judge by role, never by a
// class name or a position. A key not listed here is 'other': listed pieces are the ones a rule needs to tell apart. Pure, no imports: node tests load it.
//
// roles
//   tick       a number written along an axis ("5", "10", "150K")
//   axis-name  an axis's name ("PPG (PV − IVC), mmHg")
//   zone-name  the name of a shaded zone ("Both raised"): the words a chart's legend gives when it has one
//   line-name  the words on a cut-off, a diagonal or a ray ("PPG ≥12", "R = 8")
//   point-name a point's name beside it
//   legend     a key drawn inside the chart (swatch words)
//   point      a dot for a patient or a reading
//   case       the slide's own case, the ring that moves to each new reading
//   cut        a cut-off line
//   axis       an axis or grid line
//   frame      a zone's fill, the plot's panel: what the plot's room is
//   other
export const ROLE_OF_LOOK = Object.freeze({
  // HVPG / PPG, CSPH and flow planes (visual-plane.js)
  'plane.t': 'tick', 'plane.ax': 'axis-name', 'plane.zt': 'zone-name', 'plane.gzt': 'zone-name', 'plane.ln': 'line-name', 'plane.dt': 'line-name', 'plane.isot': 'line-name',
  'plane.pt.name': 'point-name', 'plane.sn': 'point-name', 'plane.cut': 'cut', 'plane.axis': 'axis', 'plane.grid': 'axis', 'plane.zone': 'frame', 'plane.pt.dot': 'point',
  'plane.stop': 'point', 'plane.dot': 'case',
  // the SAAG and protein quadrant (presenter-visuals.js)
  'card.quad.t': 'tick', 'card.quad.ax': 'axis-name', 'card.quad.name': 'point-name', 'card.quad.cut': 'cut', 'card.quad.axis': 'axis', 'card.quad.rect': 'frame', 'card.quad.dot': 'point',
  // the lines over time (talk-trace.js, event-graph.js, flow-time.js, tool-course.js)
  'plot.grid.text': 'tick', 'plot.grid.line': 'axis', 'plot.ax': 'axis-name', 'plot.unit': 'axis-name', 'cv.ax': 'axis-name', 'time.grid.text': 'tick', 'time.axis.line': 'axis',
  'time.key.text': 'legend', 'stent.key.text': 'legend',
  // the guideline's zones (baveno-zones.js, tool-criteria.js)
  'crit.zone': 'frame',
});

/** The role of a piece by its look key; 'other' where none is listed. */
export const roleOf = (key) => ROLE_OF_LOOK[key] || 'other';

/** The file that owns a chart family, by the group of its look keys (the first part of `data-look`), for a finding to name. */
export const OWNER_OF_GROUP = Object.freeze({
  plane: 'src/ui/visual-plane.js', card: 'src/ui/presenter-visuals.js', talk: 'src/ui/talk-trace.js', plot: 'src/ui/talk-trace.js', time: 'src/ui/flow-time.js',
  cv: 'src/ui/tool-curve.js', ft: 'src/ui/flow-time.js', tf: 'src/ui/tips-figure.js', shift: 'src/ui/tool-shift.js', flows: 'src/ui/tool-flows.js',
  stent: 'src/ui/chart-looks/stent.js', crit: 'src/ui/baveno-zones.js', prof: 'src/ui/tool-profile.js',
});
/** The owner of a piece by its look key, or the chart-reader's own file where the family is not listed. */
export const ownerOf = (key) => OWNER_OF_GROUP[String(key || '').split('.')[0]] || 'src/ui/svg-gl.js';
