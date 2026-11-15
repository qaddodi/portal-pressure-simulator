// Reduce Motion rules that kill a fade (owner, 15 Nov 2026: nothing pops in or out). app.css keeps every transition's opacity under Reduce
// Motion (`transition-property: opacity, visibility !important`) and remaps the entrance keyframes to fades, so a reduced-motion rule that
// writes `transition: none`, a zero duration or `animation: none` turns that fade into an instant swap. Such a rule is allowed only for a piece
// that moves and never appears or disappears by it: MOVES_ONLY, each with its reason. Run by scripts/rules-lint.mjs (npm run lint).
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const MOVES_ONLY = new Map([
  ['html.chip-open :is(.chip-btn, .lens-btn) .chev', 'a chevron turning'],
  ['.seg-glide.glide-still::before', 'the segment pill held still on a resize (it is shown, not shown again)'],
  ['input[type=range]::-webkit-slider-thumb', 'the slider thumb moving'],
  ['input[type=range]::-moz-range-thumb', 'the slider thumb moving'],
  ['.ac-info', 'the info chevron turning'],
  ['.pal-glide', 'the palette highlight gliding between rows'],
  ['.halo circle, .halo text', 'a halo ring that grows (skipped, not faded: an attention cue)'],
  ['.mon.bad .mv', 'a blinking alarm (underlined instead)'],
  ['.workspace-divider span', 'the divider grip moving'],
  ['.scan-probe.tap .sp-tip, .scan-probe.tap2 .sp-tip', 'the probe tapping'],
  ['.instrument-workspace.float-ui.fit', 'the card resizing to fit'],
  ['.lens-opt .mt-sw, .lens-opt .mt-sw::after', 'a switch knob sliding'],
  ['.app:not(.presenting) #labels.hovlink .lb :is(.lb-name, .lb-unit), .app:not(.presenting) #labels.hovlink .lb-leaders > .leader', 'a hover tint, never an appearance'],
  ['.section > summary .chev, .switch span::after, .ac-toggle .switch-vis i, .ab-tg .switch-vis i, .ab-dp-alb .switch-vis i, .menu-btn .chev, .workspace-divider span, .scan-probe .sp-svg,\n  .ab-belly-fill, .ab-iap-fill, .dop-band, .dop-band-caps > i, .dop-mark, .dop-ticks > span, .stage-clock', 'chevrons turning, knobs sliding, fills and marks moving along their scales'],
  ['.ab :is(*, *::before)', 'the ascites belly and gauges filling (a level, never an appearance)'],
  ['.pz-load i', 'the loading arc turning (a breathing fade instead)'],
  ['.menu-btn .chev', 'a chevron turning'],
  ['.endo-bar i', 'a bar filling'],
  ['.pz.stack.stack > .pz-data.pz-sheet.pz-hide', 'its visibility waits for the fade (a delayed visibility, not an instant one)'],
  ['.pz.pz-wide.pz-wide > .pz-data.pz-sheet.pz-hide', 'its visibility waits for the fade (a delayed visibility, not an instant one)'],
  ['.um-pv', 'the menu preview sliding'],
  ['.pz-case', 'the case card sliding'],
  ['.treat-pane > *, .treat-pane > .tp-off', 'the Treat pane sliding'],
  ['html.thumb-ui :is(.menu.as-sheet, .why-pop.as-sheet):is(.leaving[data-swiped], .pulling)', 'a sheet under the finger (it follows the hand)'],
  ['.pz-cover i', 'a delayed spinner'],
  ['.pz > :is(.pz-text, .pz-data, .pz-panel), .pz-text > .pz-leave, .pz-shade', 'transform only'],
  ['.pz > .pz-lip', 'transform only'],
  ['.tooltip, .tooltip.show', 'transform only'],
  ['.hover-tip, .hover-tip.on', 'transform only'],
]);
const KILL = /(?:^|;|\{)\s*(?:transition\s*:\s*none|transition-duration\s*:\s*0m?s|animation\s*:\s*none|animation-duration\s*:\s*0m?s)\b/;

export function reducedBlocks(css) {
  const out = [];
  const re = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{/g;
  let m;
  while ((m = re.exec(css))) {
    let i = m.index + m[0].length, depth = 1;
    const start = i;
    while (i < css.length && depth) { if (css[i] === '{') depth++; else if (css[i] === '}') depth--; i++; }
    out.push(css.slice(start, i - 1));
  }
  return out;
}
export const rules = (block) => [...block.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((r) => ({ sel: r[1].trim(), body: r[2] }));


const parts = (sel) => sel.split(/,(?![^(]*\))/).map((x) => x.trim());
const ALLOWED = new Set([...MOVES_ONLY.keys()].flatMap(parts));
/** The rules in `css` (one stylesheet's text) that kill a fade under Reduce Motion, as text. */
export function killedFades(css) {
  const bad = [];
  for (const b of reducedBlocks(css)) for (const r of rules(b)) {
    if (r.sel.startsWith('@keyframes') || /^(from|to|\d)/.test(r.sel)) continue;
    if (!KILL.test(`;${r.body}`)) continue;
    if (MOVES_ONLY.has(r.sel) || parts(r.sel).every((p) => ALLOWED.has(p))) continue;
    bad.push(`${r.sel.replace(/\s+/g, ' ')} { ${r.body.trim().slice(0, 120)} }`);
  }
  return bad;
}
export function reducedCssProblems(root = '.') {
  const dir = join(root, 'styles');
  return readdirSync(dir).filter((n) => n.endsWith('.css')).flatMap((n) => killedFades(readFileSync(join(dir, n), 'utf8')).map((x) => `styles/${n}: ${x}`));
}
