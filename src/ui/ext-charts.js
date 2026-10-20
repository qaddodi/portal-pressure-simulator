// Deck visuals, package B. Charts from the slide's numbers: V1, V14, V26 (review/deck-visuals-recs.md §9).
// What this package adds to slides, registered for slide-ext.js (see its header for each part's shape). A deck that sets
// none of its fields is unchanged.
//   tool: { kind: 'profile' }                    the pressure from gut to heart, eight stations, healthy dashed beneath,
//                                                HVPG and PPG brackets (tool-profile.js); from: true adds the state before
//                                                as a faint dotted line ('<slide id>' for that slide's)
//   tool: { kind: 'flows' }                      where the portal blood goes: one bar, the liver's segment and then each
//                                                shunt route's, largest first, names on the segments, a Healthy bar just
//                                                above it for comparison (tool-flows.js)
//   tool: { kind: 'flows', of: 'inflow' }        the same bar for the liver's inflow, portal against arterial
//   bands: ['carvedilol', 'anticoag', 'tips', …] on a trace or flowtime tool: the treatments shaded (rx-bands.js RX); drawn by
//                                                talk-trace.js and flow-time.js themselves
//   style: 'milestones' on a trace tool ('talk')  the HVPG line alone in its cut-off colours, the slides that set milestone:
//                                                'Dx' (a short name) named level above their points (talk-trace.js)
import { createProfileTool } from './tool-profile.js?v=61151be2b1';
import { createFlowsTool } from './tool-flows.js?v=b4576e1b21';

export default {
  tools: {
    profile: { make: () => createProfileTool(), title: () => 'Pressure, gut to heart', short: () => 'Gut to heart' },
    flows: {
      make: () => createFlowsTool(),
      title: (t) => (t.of === 'inflow' ? 'Blood into the liver' : 'Where the portal blood goes'),
      short: (t) => (t.of === 'inflow' ? 'Liver inflow' : 'Portal blood'),
    },
  },
};
