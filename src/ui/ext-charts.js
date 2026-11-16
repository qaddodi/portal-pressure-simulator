// Deck visuals, package B. Charts from the slide's numbers: V1, V14, V26 (review/deck-visuals-recs.md §9).
// What this package adds to slides, registered for slide-ext.js (see its header for each part's shape). A deck that sets
// none of its fields is unchanged.
//   tool: { kind: 'profile' }                    the pressure from gut to heart, eight stations, healthy dashed beneath,
//                                                HVPG and PPG brackets (tool-profile.js); from: true adds the state before
//                                                as a faint dotted line ('<slide id>' for that slide's)
//   tool: { kind: 'flows' }                      where the portal blood goes: one bar, the liver's segment and then each
//                                                shunt route's, largest first, names on the segments or, where too narrow,
//                                                in pills under it, a dashed Healthy bracket over it (tool-flows.js)
//   tool: { kind: 'flows', of: 'inflow' }        the same bar for the liver's inflow, portal against arterial
//   tool: { kind: 'menu' }                      every treatment this patient could get, run on the slide's own state: a dot for each at the PPG it
//                                                reaches against the sinusoidal flow it costs, sized by the blood that bypasses the liver (tool-menu.js)
//   tool: { kind: 'shift' }                     the circulation from healthy to each state of the talk, one chart that holds across its slides:
//                                                CO, SVR, MAP and blood volume as % of healthy over the portal pressure and the splanchnic inflow (tool-shift.js)
//   bands: ['carvedilol', 'anticoag', 'tips', …] on a trace or flowtime tool: the treatments shaded (rx-bands.js RX); drawn by
//                                                talk-trace.js and flow-time.js themselves
//   style: 'milestones' on a trace tool ('talk')  the HVPG line alone in its cut-off colours, the slides that set milestone:
//                                                'Dx' (a short name) named level above their points (talk-trace.js)
import { createProfileTool } from './tool-profile.js';
import { createFlowsTool } from './tool-flows.js';
import { createMenu, warmMenu } from './tool-menu.js';
import { createShiftTool, shiftTrail } from './tool-shift.js';

export default {
  tools: {
    profile: { make: () => createProfileTool(), title: () => 'Pressure, gut to heart', short: () => 'Gut to heart' },
    shift: { make: () => createShiftTool(), title: () => 'Change from healthy', short: () => 'From healthy', trail: (s) => shiftTrail(s) },
    menu: { make: () => createMenu(), warm: (t, ctx) => warmMenu(t, ctx), title: () => 'Every treatment option in this case', short: () => 'Treatment menu' },
    flows: {
      make: () => createFlowsTool(),
      title: (t) => (t.of === 'inflow' ? 'Hepatic inflow' : 'Where portal blood goes, % of portal flow'),
      short: (t) => (t.of === 'inflow' ? 'Hepatic inflow' : 'Portal flow'),
    },
  },
};
