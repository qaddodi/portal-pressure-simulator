// Rules moved from tests: boot-overlap, doppler-away-key, lobule-callout-leader-gap, menu-preview-one-card, modal-veil.
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// boot-overlap: order of first occurrences inside main() (the text from 'async function main() {' on).
const MAIN = 'async function main() {';
const main = (...parts) => new RegExp(esc(MAIN) + parts.join(''));
// A's first occurrence in main() comes before B's first occurrence (both present).
const before = (a, b) => main(`(?:(?!${esc(b)})[\\s\\S])*?`, esc(a), '[\\s\\S]*', esc(b));
const BOOT = 'the engine\'s worker starts first and loads while the figure is built; no model frame is taken in before the healthy reference is set';
const order = ['const engineUp = startHost();', 'stage = createStage({', 'await engineUp;', "host.request('healthyProfile')", 'store.set({ healthy:'];

// modal-veil: the first `sel {` rule block of app.css (up to its first closing brace).
const first = (sel) => `^(?:(?!\\n${esc(sel)} \\{)[\\s\\S])*\\n${esc(sel)} \\{`;

export default [
  // boot-overlap
  ...order.slice(0, -1).map((s, i) => ({ file: 'src/ui/main.js', need: [before(s, order[i + 1]), `boot order: ${s} comes before ${order[i + 1]} (${BOOT})`] })),
  { file: 'src/ui/main.js', forbid: [main('[\\s\\S]*', esc('await startHost()')), 'main() no longer waits on the worker before the stage'] },
  { file: 'src/ui/main.js', need: [before('store.set({ healthy:', "host.on('frame', onFrame)"), 'the healthy reference is in the store before the first model frame is taken in'] },
  { file: 'src/ui/main.js', need: [before('store.set({ presetList: presets })', "host.on('frame', onFrame)"), 'the preset list is in the store before the first model frame is taken in'] },
  { file: 'src/ui/main.js', need: [before('createStage({', "host.on('frame', onFrame)"), 'the stage is created before the first model frame is taken in'] },
  { file: 'src/ui/main.js', need: [before("host.on('frame', onFrame)", "performance.mark?.('pps:booted')"), 'the marks stay meaningful: booted is marked at the end of main()'] },
  { file: 'src/ui/stage-tubes.js', need: [/performance\.mark\?\.\('pps:figure-ready'\)/, 'the marks stay meaningful: figure-ready is marked by the stage on its first drawn frame'] },

  // doppler-away-key
  { file: 'src/ui/doppler.js', forbid: [/awayKey|SL\.key/, 'the colour modes carry no caption under the baseline (Mohammad, 8 Nov: remove "below the line: away from the probe...")'] },
  { file: 'styles/tokens.css', need: [/--dop-away: #5072E0;/, 'away is the brighter blue, a token'] },
  { file: 'styles/tokens.css', need: [/--red-wale: #E8404A;/, 'the red wale is one cherry red, a token'] },
  { file: 'styles/tokens.css', forbid: [/--endo-red-wale/, 'one token for the figure and the scope'] },

  // lobule-callout-leader-gap
  { file: 'src/ui/lobule-zoom.js', need: [/const le = leaderEnd\(ink, a\[0\], a\[1\]\);/, 'lobule-zoom ends the pointer leader on the letters box grown by a gap'] },
  { file: 'src/ui/lobule-zoom.js', need: [/setGeo\(callLine, 'x2', ex\); setGeo\(callLine, 'y2', ey\)/, 'lobule-zoom ends the pointer leader on the letters box grown by a gap'] },
  { file: 'src/ui/lobule-zoom.js', forbid: [/setGeo\(callLine, 'x2', bx\)/, 'the leader no longer runs to the pill\'s middle'] },

  // menu-preview-one-card
  { file: 'src/ui/menu.js', need: [/for \(let i = olds\.length - 1; i >= 0; i--\)/, 'every card of words still in the preview leaves the flow at once, not only the first'] },
  { file: 'src/ui/menu.js', need: [/classNow\(o, 'um-pv-old', true\)/, 'every card of words still in the preview leaves the flow at once, not only the first'] },
  { file: 'src/ui/menu.js', forbid: [/classSoon\(old, 'um-pv-old'/, 'every card of words still in the preview leaves the flow at once, not only the first'] },
  { file: 'src/ui/menu.js', need: [/pvGone\?\.remove\(\); pvGone = null;/, 'a preview card still going out is taken off when a new one is made'] },
  { file: 'src/ui/menu.js', need: [/if \(!fade\) next\.style\.animation = 'none';/, 'the first words do not fade in twice'] },

  // modal-veil
  { file: 'styles/app.css', need: [/\n\.modal-back \{/, '.modal-back rule exists'] },
  { file: 'styles/app.css', forbid: [new RegExp(first('.modal-back') + '[^}]*background'), '.modal-back paints no veil over the dialog\'s glass (the veil is the dialog\'s own outer shadow; a GPU frost is drawn under .modal-back)'] },
  { file: 'styles/app.css', need: [new RegExp(first('.modal') + '[^}]*--modal-veil: 0 0 0 100vmax var\\(--scrim\\)'), 'the veil is the dialog\'s outer shadow'] },
  { file: 'styles/app.css', need: [new RegExp(first('.modal') + '[^}]*box-shadow:[^;}]*var\\(--modal-veil\\)'), 'the dialog\'s box-shadow carries the veil'] },
  { file: 'styles/app.css', need: [/:root:root \.modal\[data-gl\] \{ box-shadow: var\(--modal-veil\); \}/, 'the veil is kept when the GPU draws the glass'] },
];
