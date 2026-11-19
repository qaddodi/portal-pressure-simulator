// The one place the page's address is read (19 Nov 2026, DBG-4 of the bible review). Every diagnostic flag is a row of FLAGS (the ones a toggle can set) or EXTRA (addresses
// the app reads that no toggle writes), each with where it works (`gate`: 'live' everywhere, 'preview' the /preview/ copy, 'local' the preview copy or a local run) and its old
// spellings (`aliases`). A file asks `flagOn('perf')` or `flagValue('fps')`; it never matches location.search itself (tests/flags.test.js counts such reads and the allowance only
// shrinks, the way tests/no-raw-raf.test.js guards requestAnimationFrame). `?offgpu` and `?offgpu=1` mean the same, `?offgpu=0` is off; the test clock is `testclock` everywhere
// (`rate` is its old spelling on the Phone check). Pure and dependency-free: the earliest modules (frame.js, caught.js) import it, and a node test loads it.
//
//   flagOn(id, at?)       true when the flag is in the address, in a form that turns it on, and its gate is open here
//   flagValue(id, at?)    the text after "=" (decoded), '' for a bare flag, null when absent or its gate is shut
//   flagNumber(id, at?)   flagValue as a finite number, or null
//   searchNow()           the page's raw search text (for the one module that hands the whole query on)
//   `at` is a Location-like ({ search, pathname, hostname }) or a plain search string (no gate then); it defaults to the page's own location.

/**
 * The diagnostic flags. kind: 'bare' (on when present, as ?perf), 'fixed' (on only with that value, as ?offgpu=1), 'value' (on with a valid value,
 * as ?fps=120) or 'bare-or-value' (?testclock or ?testclock=4). `on` is the form a toggle writes; `valid` judges a typed value.
 */
export const FLAGS = Object.freeze([
  { id: 'perf', group: 'Measure', kind: 'bare', meaning: 'The frame panel and the lag readout after a pan or pinch (frame-hud.js, perf-readout.js); also counts GL budget sites, layout reads and caught errors in the console.' },
  { id: 'fps', group: 'Measure', kind: 'value', def: '120', valid: /^\d+$/, meaning: 'Frames asked for every refresh while the page shows, and every overrun written to the console with its surfaces. It keeps the page drawing.' },
  { id: 'offgpu', group: 'Measure', kind: 'fixed', fixed: '1', bare: true, meaning: 'A live count of work that is not on the GPU, per frame, flashing red when any happens while something moves.' },
  { id: 'watch', group: 'Measure', kind: 'bare', meaning: 'The motion recorder (preview copy or a local run): keeps 20 seconds of camera, label and card numbers, judges them with the motion rules and shows a red dot with the findings (src/ui/watch, docs/watch.md).' },
  { id: 'budget', group: 'Measure', kind: 'fixed', fixed: '1', bare: true, meaning: 'Counts the motion budget only, with no readout, for a run that reads pps.motionBudget.' },
  { id: 'lap', group: 'Measure', kind: 'bare', meaning: 'The device lap: a fixed route of about 90 seconds the page drives itself and writes up as one block of text to paste back.' },
  { id: 'inputs', group: 'Measure', kind: 'bare', meaning: 'Starts the input-to-paint tracker at load (tap, press or key to the first changed frame, last 200 inputs).' },
  { id: 'testclock', group: 'Measure', kind: 'bare-or-value', def: '1', valid: /^\d+(\.\d+)?$/, meaning: 'Starts the page on the test clock before any other module reads the time (the number is the rate; none means the default).' },
  { id: 'rest', group: 'Compare', kind: 'fixed', fixed: 'off', meaning: 'Turns the rest pacing off (frames at a lower rate when nothing moves), for comparing.' },
  { id: 'scene', group: 'Compare', kind: 'fixed', fixed: 'dom', meaning: 'Turns the page\'s own layout engine off, so every element is asked of the browser.' },
  { id: 'scenecheck', group: 'Compare', kind: 'bare', meaning: 'Compares every answer of the page\'s own layout engine with the browser\'s and logs a difference.' },
  { id: 'swblur', group: 'Compare', kind: 'fixed', fixed: '1', bare: true, meaning: 'Leaves the blur effect on a software renderer (it is dropped by default there).' },
  { id: 'stageover', group: 'Compare', kind: 'fixed', fixed: 'gpu', meaning: 'Draws the figure\'s overlays on the GPU (off by default; on a software renderer only when asked for).' },
  { id: 'gpuorgans', group: 'Compare', kind: 'fixed', fixed: 'force', meaning: 'Organs on the GPU on the software renderer too, for the browser check of the plate layers.' },
  { id: 'lumen', group: 'Compare', kind: 'fixed', fixed: 'off', meaning: 'No lumen pass and no blood drawn by the Tube renderer (a device A/B that proves or clears the lumen pass).' },
  { id: 'lumenscale', group: 'Compare', kind: 'value', def: '0.5', valid: /^(0?\.\d+|1(\.0+)?)$/, meaning: 'The lumen layer\'s size as a share of the vessel layer (0.25 to 1) for every instance.' },
]);

const byId = new Map(FLAGS.map((f) => [f.id, f]));

const dec = (s) => { try { return decodeURIComponent(s.replace(/\+/g, ' ')); } catch { return s; } };
/** Splits an address tail ('?a&b=1#x', the search with or without its hash) into { items: [{ key, value|null, raw }], hash }. */
function parse(search) {
  let s = String(search ?? ''), hash = '';
  const at = s.indexOf('#');
  if (at >= 0) { hash = s.slice(at); s = s.slice(0, at); }
  if (s.startsWith('?')) s = s.slice(1);
  const items = [];
  for (const raw of s.split('&')) {
    if (!raw) continue;
    const eq = raw.indexOf('=');
    items.push({ key: dec(eq < 0 ? raw : raw.slice(0, eq)), value: eq < 0 ? null : dec(raw.slice(eq + 1)), raw });
  }
  return { items, hash };
}
const build = (items, hash) => (items.length ? `?${items.map((i) => i.raw).join('&')}` : '') + hash;

const OFF_WORDS = new Set(['0', 'off', 'false', 'no']);
function isOn(flag, value) {
  switch (flag.kind) {
    case 'bare': return !OFF_WORDS.has(String(value ?? '').toLowerCase());
    case 'fixed': return value === flag.fixed || (!!flag.bare && (value == null || value === ''));   // (?offgpu and ?offgpu=1 are one thing; ?offgpu=0 is off)
    case 'value': return value != null && flag.valid.test(value);
    case 'bare-or-value': return value == null || value === '' || flag.valid.test(value);
    default: return false;
  }
}

/** Which flags an address has: { perf: { on, value }, ... } for every flag of FLAGS (value is the text after "=", or null for a bare one). */
export function flagState(search) {
  const { items } = parse(search);
  const out = {};
  for (const f of FLAGS) {
    const it = items.find((i) => i.key === f.id);
    out[f.id] = it ? { on: isOn(f, it.value), value: it.value } : { on: false, value: null };
  }
  return out;
}

/** The parameters of an address that are not diagnostic flags of FLAGS (?gallery, ?preset=... and the like), as their text. */
export function otherParams(search) {
  return parse(search).items.filter((i) => !byId.has(i.key)).map((i) => i.raw);
}

/** The text a toggle writes for a flag: 'perf', 'offgpu=1', 'fps=120'. A value (string or number) replaces the default. */
export function flagText(flag, value) {
  const f = byId.get(flag);
  const v = value === true || value == null ? undefined : String(value);
  if (v !== undefined) return v === '' ? flag : `${flag}=${encodeURIComponent(v)}`;
  if (!f) return flag;
  if (f.kind === 'fixed') return `${flag}=${f.fixed}`;
  if (f.kind === 'value') return `${flag}=${f.def}`;
  return flag;   // bare, and testclock with no rate
}

/**
 * The address tail (search plus hash) with a flag set or cleared. value: false/null clears it (every copy), true writes its own form (?perf,
 * ?offgpu=1, ?fps=120), a string or number writes flag=value. Every other parameter keeps its text and its place, the flag keeps its place
 * when it was there and goes last when it was not, and the hash is kept. '' when nothing is left.
 */
export function withFlag(search, flag, value) {
  const { items, hash } = parse(search);
  const key = String(flag);
  if (value === false || value == null) return build(items.filter((i) => i.key !== key), hash);
  const raw = flagText(key, value);
  const eq = raw.indexOf('=');
  const made = { key, value: eq < 0 ? null : dec(raw.slice(eq + 1)), raw };
  const at = items.findIndex((i) => i.key === key);
  const next = [];
  items.forEach((i, n) => { if (i.key !== key) next.push(i); else if (n === at) next.push(made); });
  if (at < 0) next.push(made);
  return build(next, hash);
}

/** Whether a typed value is fine for a flag that takes one. */
export const validValue = (flag, v) => { const f = byId.get(flag); return !!f && (f.kind === 'value' || f.kind === 'bare-or-value') && f.valid.test(String(v)); };

/** Addresses the app reads that no toggle writes (so not in FLAGS, the bench's rows): content, the debug page and its walks. `gate` as for FLAGS. */
export const EXTRA = Object.freeze([
  { id: 'debug', group: 'Pages', gate: 'local', meaning: 'The debug page (the card gallery, with Report and Full check on its bar; the motion recorder is on by default). ?debug=check is the Phone check, ?debug=full its long walk, ?debug=frame the device frame.' },
  { id: 'gallery', group: 'Pages', gate: 'local', meaning: 'The old spelling of ?debug (?gallery=frame is the phone frame, ?gallery&sweep=... runs the Sweep; the sweeps still open it so).' },
  { id: 'check', group: 'Pages', gate: 'local', meaning: 'The old spelling of ?debug=check, the Phone check (?check=full for the long walk).' },
  { id: 'rate', group: 'Pages', alias: 'testclock', meaning: 'The Phone check\'s old spelling of the test clock\'s rate: the same as ?testclock=N.' },
  { id: 'only', group: 'Pages', meaning: 'The Phone check or the Sweep: just these journeys or specimens (comma list).' },
  { id: 'steps', group: 'Pages', meaning: 'The Phone check: steps=0 leaves out the per-step rows.' },
  { id: 'fresh', group: 'Pages', meaning: 'The Phone check: fresh=1 forgets a walk the browser was part way through.' },
  { id: 'sweep', group: 'Pages', gate: 'local', meaning: 'The gallery page: run the Sweep over these specimens (a list, or affected).' },
  { id: 'testframe', group: 'Measure', meaning: 'The test clock\'s frame length in ms (with ?testclock).' },
  { id: 'presenter-view', group: 'Pages', meaning: 'The presenter\'s second window; the value names the talk it follows.' },
  { id: 'script', group: 'Open', meaning: 'Open this deck (with ?slide=N).' },
  { id: 'slide', group: 'Open', meaning: 'Open this slide of ?script.' },
  { id: 'preset', group: 'Open', meaning: 'Open this patient preset.' },
  { id: 'home', group: 'Open', meaning: 'Open Patients or Present (?home=explore|present).' },
  { id: 'back', group: 'Open', meaning: 'Open quietly (no case card, no shared-scenario toast): a replay or a back link.' },
]);

/** The new spelling of the debug page's three forms: `?debug` is `?gallery`, `?debug=check` is `?check`, `?debug=full` is `?check=full`, `?debug=frame` is `?gallery=frame`. Asking for an old name also hears the new one. */
const DEBUG_FORMS = Object.freeze({ gallery: { '': '', gallery: '', frame: 'frame' }, check: { check: '', full: 'full' } });

/** Where a flag works. Unlisted flags are 'live'. (The recorder, the bug packet and the gallery are preview and local only; the measuring flags work on the live site too.) */
const GATES = Object.freeze({ watch: 'local' });
const OPEN = { live: () => true, preview: (l) => /\/preview\//.test(l.pathname || ''), local: (l) => /\/preview\//.test(l.pathname || '') || /^(localhost|127\.0\.0\.1)$/.test(l.hostname || '') };
/** The gate of a flag id. */
export const gateOf = (id) => GATES[id] || EXTRA.find((e) => e.id === id)?.gate || 'live';
/** The flag ids that are old spellings: { rate: 'testclock' }. A reader that takes both asks for both (`flagNumber('testclock', at) ?? flagNumber('rate', at)`): ?rate alone must not start the test clock at boot, which ?testclock does. */
export const ALIASES = Object.freeze(Object.fromEntries(EXTRA.filter((e) => e.alias).map((e) => [e.id, e.alias])));

const KNOWN = new Map([...FLAGS, ...EXTRA].map((f) => [f.id, f]));
const here = () => (typeof location !== 'undefined' && location ? location : { search: '', pathname: '', hostname: '' });
const parts = (at) => (typeof at === 'string' ? { search: at, gated: false } : { search: (at || here()).search || '', loc: at || here(), gated: true });
/** The page's raw search text. */
export const searchNow = () => here().search || '';

function item(id, search) { return parse(search).items.find((i) => i.key === id) || null; }
const shut = (id, p) => p.gated && !OPEN[gateOf(id)](p.loc);

/** The text after "=" (decoded; '' for a bare flag), or null when the flag is absent or its gate is shut here. */
export function flagValue(id, at) {
  const p = parts(at); if (shut(id, p)) return null;
  const it = item(id, p.search);
  if (it) return it.value == null ? '' : it.value;
  const d = DEBUG_FORMS[id] && item('debug', p.search);   // (?debug, the one name for the debug page: its value says which form)
  const v = d ? DEBUG_FORMS[id][d.value == null ? '' : d.value] : undefined;
  return v === undefined ? null : v;
}
/** True when the flag is in the address in a form that turns it on (bare ?perf, ?offgpu or ?offgpu=1, ?fps=120, ?rest=off ...) and its gate is open here. Flags that are not in FLAGS (EXTRA) are on when present. */
export function flagOn(id, at) {
  if (DEBUG_FORMS[id]) return flagValue(id, at) !== null;
  const p = parts(at); if (shut(id, p)) return false;
  const it = item(id, p.search); if (!it) return false;
  const f = FLAGS.find((x) => x.id === id);
  return f ? isOn(f, it.value) : true;
}
/** flagValue as a finite number, or null. */
export function flagNumber(id, at) { const v = flagValue(id, at); const n = v === null || v === '' ? NaN : Number(v); return Number.isFinite(n) ? n : null; }
/** Every flag id this module knows (FLAGS and EXTRA), for the doc table and the tests. */
export const knownFlags = () => [...KNOWN.values()].map((f) => ({ id: f.id, group: f.group, gate: gateOf(f.id), meaning: f.meaning, alias: f.alias || null }));
