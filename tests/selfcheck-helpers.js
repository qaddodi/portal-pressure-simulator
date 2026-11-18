// Helpers for the screen report and self-check tests (not a .test.js). A page whose layout is given in data attributes (data-box="l,t,r,b", data-<metric>,
// inline style) and whose globals the readers see; a rule is judged on a report with fires() and quiet(). Every rule ships with a quiet() case (a case that must
// not fire): a rule that fires wrongly wastes as much agent time as no rule.
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { buildScreen } from '../src/ui/screen/build.js';
import { runRules } from '../src/ui/selfcheck/rules.js';

const DEFAULTS = { display: 'block', visibility: 'visible', opacity: '1', overflow: 'visible', overflowX: 'visible', overflowY: 'visible', fontSize: '16px', zoom: '1', maxHeight: 'none' };
const camel = (k) => k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

/** A jsdom page with the layout reads from data attributes. Installs window and document as globals until restore(). */
export function page(html, { vw = 1440, vh = 900, bodyAttrs = '' } = {}) {
  const dom = new JSDOM(`<!doctype html><html ${bodyAttrs}><body><div id="app">${html}</div></body></html>`);
  const win = dom.window, doc = win.document;
  const style = (el) => {
    const o = { ...DEFAULTS };
    for (const d of (el.getAttribute('style') || '').split(';')) { const [k, v] = d.split(':'); if (k && v) o[camel(k.trim())] = v.trim(); }
    if (o.overflow !== 'visible') { if (o.overflowX === 'visible') o.overflowX = o.overflow; if (o.overflowY === 'visible') o.overflowY = o.overflow; }
    return o;
  };
  const rect = (el) => { const [l, t, r, b] = (el.dataset.box || '0,0,0,0').split(',').map(Number); return { left: l, top: t, right: r, bottom: b, width: r - l, height: b - t }; };
  const io = { box: rect, rects: (el) => [rect(el)], style, metric: (el, k) => (el === win ? { innerWidth: vw, innerHeight: vh }[k] : +(el.dataset[k] ?? 0)), ctm: () => null };
  const was = { window: globalThis.window, document: globalThis.document };
  const use = () => { globalThis.window = win; globalThis.document = doc; };
  use();
  const restore = () => { globalThis.window = was.window; globalThis.document = was.document; if (was.window === undefined) delete globalThis.window; if (was.document === undefined) delete globalThis.document; };
  return { dom, win, doc, io, use, restore };
}

/** The screen report of a page, with a fake `pps` (override any part). */
export function screenOf(p, opts = {}) {
  p.use();   // (several pages may be up in one test: the readers see the globals)
  const pps = { store: { get: () => ({ presetId: 'healthy', view: 'anatomic', tool: 'select' }) }, presenter: { position: () => ({ id: 'demo', at: 2 }) }, ...opts.pps };
  return buildScreen({ pps, io: p.io, doc: p.doc, win: p.win, ...opts });
}

/** The findings of one rule over a report (or a hand-made report object). */
export const findingsOf = (id, report) => runRules(report, { only: id, kinds: ['state'] });
export function fires(id, report, match) {
  const f = findingsOf(id, report);
  assert.ok(f.length > 0, `rule ${id} should fire`);
  if (match) assert.ok(f.some((x) => match.test(`${x.what} ${x.where}`)), `rule ${id} fired, but not about ${match}: ${JSON.stringify(f)}`);
  return f;
}
export function quiet(id, report) {
  const f = findingsOf(id, report);
  assert.deepEqual(f, [], `rule ${id} must not fire here`);
}
export const seriesFindings = (id, frames, opts = {}) => runRules(null, { only: id, kinds: ['series'], history: frames, ...opts });
