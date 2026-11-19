// The model from a terminal: a patient, a treatment and some days go in; the model's numbers come out as text or JSON.
// It runs the same engine and the same step chain as the app's slides (worker-core.js 'sequence': preset → params → settle →
// actions → days → settle), so a number here is the number the app shows for that state. No browser, no pictures, no timing.
//
//   npm run model -- --preset cirr-decomp --carvedilol --days 30
//   npm run model -- --preset cirr-decomp --tips 8 --compare           before and after, with the change
//   npm run model -- --preset csph --set albumin=3 --params '{"cirrhosis":0.7}' --json
//   npm run model -- --deck carvedilol --slide 3                        what the app shows on that slide
//   npm run model -- --list                                             presets, decks, shortcuts
//
// docs/model-cli.md lists every option. Exit 0 on success, 2 on a bad option (the message says which).

import { createCore } from '../src/worker-core.js';
import { PRESETS, DRUGS, defaultParams, sanitizeParams, deepMerge } from '../src/engine/scenario.js';
import { EDGES } from '../src/engine/topology.js';
import { hvpgSev, ppgSev, hvpgWord, ppgWord, hvBlocked, HVPG_CUTS, PPG_CUTS, NOT_MEASURABLE, NOT_SHOWN } from '../src/engine/pressure-cuts.js';
import { varixGrade, ascitesGrade } from '../src/engine/metrics.js';

// ---- options ---------------------------------------------------------------------------------------------------------------
const VALUE = new Set(['preset', 'preset-days', 'days', 'params', 'set', 'action', 'albumin', 'cirrhosis', 'meal', 'gestation', 'splenic-rx', 'nsbb-gain', 'paracentesis', 'deck', 'slide']);
const OPTIONAL_NUMBER = new Set(['tips', 'dips']);   // --tips alone is the default 8 mm; --tips 10 is a 10 mm stent
const SWITCH = new Set(['json', 'compare', 'list', 'help', 'band', 'diuretics', 'anticoag', 'splenectomy', ...Object.keys(DRUGS)]);
const REPEAT = new Set(['set', 'action']);

class UsageError extends Error {}
const fail = (msg) => { throw new UsageError(msg); };

export function parseArgs(argv) {
  const o = { set: [], action: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) fail(`Unexpected "${a}". Options start with --; try --help.`);
    const [name, inline] = a.slice(2).split(/=(.*)/s, 2);
    if (VALUE.has(name)) {
      const v = inline ?? argv[++i];
      if (v === undefined || (inline === undefined && v.startsWith('--') && !REPEAT.has(name) && Number.isNaN(Number(v)))) fail(`--${name} needs a value.`);
      if (REPEAT.has(name)) o[name].push(v); else o[name] = v;
    } else if (OPTIONAL_NUMBER.has(name)) {
      const v = inline ?? (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[++i] : undefined);
      if (v !== undefined && !Number.isFinite(Number(v))) fail(`--${name} takes a diameter in mm (for example --${name} 8), not "${v}".`);
      o[name] = v === undefined ? 8 : Number(v);
    } else if (SWITCH.has(name)) {
      if (inline !== undefined) fail(`--${name} takes no value.`);
      o[name] = true;
    } else fail(`Unknown option --${name}. Try --help.`);
  }
  return o;
}

const numberOpt = (o, name) => {
  if (o[name] === undefined) return undefined;
  const n = Number(o[name]);
  if (!Number.isFinite(n)) fail(`--${name} needs a number, not "${o[name]}".`);
  return n;
};
const parseJson = (text, what) => { try { return JSON.parse(text); } catch (e) { return fail(`${what} is not valid JSON (${e.message}). Quote it: --${what.replace(/^--/, '')} '{"cirrhosis":0.7}'`); } };

// ---- the change a command asks for ---------------------------------------------------------------------------------------
// Everything but the preset is one "change" step that follows the preset's own settled state, so --compare's "before" is the
// preset as loaded and "after" is the change plus the days.
const CHANGE_RANGES = { days: [0, 36500] };

/** The parameter patch the options make: --params first, then the shortcuts, then --set (the most specific wins). */
export function patchOf(o) {
  let patch = {};
  if (o.params !== undefined) {
    const j = parseJson(o.params, '--params');
    if (!j || typeof j !== 'object' || Array.isArray(j)) fail('--params must be a JSON object, for example \'{"cirrhosis":0.7}\'.');
    patch = deepMerge(patch, j);
  }
  const short = {};
  for (const d of Object.keys(DRUGS)) if (o[d]) (short.drugs ||= {})[d] = true;
  if (o.tips !== undefined) short.tips = { on: true, d: o.tips };
  if (o.dips !== undefined) short.dips = { on: true, d: o.dips };
  if (o.diuretics) short.diuretics = true;
  if (o.anticoag) short.anticoag = true;
  for (const [flag, key] of [['albumin', 'albumin'], ['cirrhosis', 'cirrhosis'], ['meal', 'meal'], ['gestation', 'gestation'], ['nsbb-gain', 'nsbbGain'], ['splenic-rx', 'splenicRx']]) {
    const n = numberOpt(o, flag);
    if (n !== undefined) short[key] = n;
  }
  if (o.splenectomy) short.splenicRx = 2;
  patch = deepMerge(patch, short);
  for (const s of o.set) {
    const eq = s.indexOf('=');
    if (eq < 1) fail(`--set needs path=value (for example --set fibrosis.R.sin=3), not "${s}".`);
    const path = s.slice(0, eq).split('.'), raw = s.slice(eq + 1);
    let value; try { value = JSON.parse(raw); } catch { value = raw; }
    const nest = path.reduceRight((v, k) => ({ [k]: v }), value);
    patch = deepMerge(patch, nest);
  }
  checkPatch(patch);
  return patch;
}

const DICT_PARAMS = new Set(['stenosis', 'stenosisSite', 'thrombus', 'occluded', 'customShunts', 'spontaneous']);
const EDGE_IDS = new Set(EDGES.map((e) => e.id));
const near = (word, list) => { const w = word.toLowerCase(); return list.filter((x) => x.toLowerCase().startsWith(w.slice(0, 3)) || w.startsWith(x.toLowerCase().slice(0, 3))).slice(0, 4); };

/** Fails, naming the key, on a parameter the model does not have or a value outside its range: the engine would drop or clamp them silently. */
function checkPatch(patch) {
  const base = defaultParams(), clean = sanitizeParams(deepMerge(base, patch));
  const walk = (p, d, c, path) => {
    for (const [k, v] of Object.entries(p)) {
      const at = [...path, k].join('.');
      const isDict = path.length === 1 && DICT_PARAMS.has(path[0]);
      if (isDict) { if (!EDGE_IDS.has(k)) fail(`${at}: "${k}" is not a vessel of the model.`); }
      else if (!d || !Object.hasOwn(d, k)) fail(`${at}: the model has no parameter "${k}"${path.length ? '' : `. Close names: ${near(k, Object.keys(base)).join(', ') || 'none'}; see src/engine/scenario.js defaultParams()`}.`);
      if (v && typeof v === 'object' && !Array.isArray(v)) { walk(v, d?.[k], c?.[k], [...path, k]); continue; }
      const kept = c?.[k];
      const same = typeof v === 'number' && typeof kept === 'number' ? Math.abs(v - kept) < 1e-9 : v === kept;
      if (!same) fail(`${at}=${JSON.stringify(v)} is outside what the model accepts (it would become ${JSON.stringify(kept)}).`);
    }
  };
  walk(patch, base, clean, []);
}

export function actionsOf(o) {
  const list = o.action.map((a) => {
    const j = parseJson(a, '--action');
    if (!j || typeof j.kind !== 'string') fail('--action needs a JSON object with a "kind", for example \'{"kind":"band"}\' (kinds: infuse, hemorrhage, band, paracentesis, valsalva, strain, rupture, stopBleed).');
    return j;
  });
  if (o.band) list.push({ kind: 'band' });
  if (o.paracentesis !== undefined) {
    const mL = numberOpt(o, 'paracentesis');
    if (mL <= 0) fail('--paracentesis needs a volume in mL above 0.');
    list.push({ kind: 'paracentesis', mL, albumin: true });
  }
  return list;
}

// ---- running the model -------------------------------------------------------------------------------------------------------
/** Runs steps through the worker's own step chain; one {fp, params} per step. */
export async function runSteps(steps) {
  const out = [];
  const core = createCore((m) => { if (m.type === 'seqStep') out[m.i] = { fp: m.fp, params: m.params }; });
  core.handle({ type: 'run', running: false });   // (no live clock left ticking)
  await core.handle({ type: 'sequence', steps, reqId: 1 });
  core.dispose();
  return out;
}

// ---- reading the numbers --------------------------------------------------------------------------------------------------------
const r = (v, n = 4) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 10 ** n) / 10 ** n : v);

/** One state as data: every fingerprint number, plus the words the app puts beside them (cut-offs from pressure-cuts.js). */
export function describe(fp, params) {
  const blocked = hvBlocked(params);
  const flat = {};
  for (const [k, v] of Object.entries(fp)) if (k !== 'at' && v !== undefined) flat[k] = r(v);
  const hv = fp.hvpg, pp = fp.ppg;
  return {
    fingerprint: flat,
    readout: {
      hvpg: blocked ? { measurable: false, text: NOT_MEASURABLE } : { measurable: true, value: r(hv, 1), status: hvpgSev(hv), word: hvpgWord(hv, true) },
      ppg: { value: r(pp, 1), status: ppgSev(pp), word: ppgWord(pp, true) },
      varices: varixGrade(fp.varix).label,
      ascites: ascitesGrade(fp.asc).label,
    },
  };
}

const f1 = (v) => (v == null || !Number.isFinite(v) ? NOT_SHOWN : v.toFixed(1));
const f2 = (v) => (v == null || !Number.isFinite(v) ? NOT_SHOWN : v.toFixed(2));
const f0 = (v) => (v == null || !Number.isFinite(v) ? NOT_SHOWN : String(Math.round(v)));
// [label, unit, value, digits]: the rows of the text report, grouped as the app's tiles are.
const SECTIONS = [
  ['Pressures', [['Portal vein', 'mmHg', 'pv', f1], ['WHVP', 'mmHg', 'whvp', f1], ['FHVP', 'mmHg', 'fhvp', f1], ['HVPG', 'mmHg', 'hvpg', f1, 'hvpg'],
    ['PPG (PV − IVC)', 'mmHg', 'ppg', f1, 'ppg'], ['Right atrium', 'mmHg', 'ra', f1], ['IVC', 'mmHg', 'ivc', f1], ['Sinusoid', 'mmHg', 'sin', f1]]],
  ['Flow', [['Portal flow', 'L/min', 'pvFlow', f2], ['Portal velocity', 'cm/s', 'pvVel', f1], ['Liver perfusion', '% of normal', 'liver', f0], ['Shunted past the liver', '%', (f) => f.shunt * 100, f0]]],
  ['Ascites', [['Volume', 'L', (f) => f.asc / 1000, f1, 'asc'], ['SAAG', 'g/dL', 'saag', f1], ['Ascitic protein', 'g/dL', 'tp', f1]]],
  ['Varices and spleen', [['Esophageal varix', 'mm', 'varix', f1, 'varix'], ['Varix wall stress', '% of rupture', (f) => f.wall * 100, f0], ['Gastric varix', 'mm', 'gv', f1],
    ['Spleen length', 'cm', 'spleen', f1], ['Platelets', '×10³/µL', 'plt', f0]]],
  ['Stiffness', [['Liver (LSM)', 'kPa', 'lsm', f1], ['Spleen (SSM)', 'kPa', 'ssm', f1]]],
  ['Circulation', [['MAP', 'mmHg', 'map', f0], ['Systolic / diastolic', 'mmHg', (f) => `${f0(f.sbp)}/${f0(f.dbp)}`, (v) => v], ['Heart rate', '/min', 'hr', f0], ['Cardiac output', 'L/min', 'co', f1],
    ['Encephalopathy risk index', '0 to 1', 'he', f2]]],
];
const val = (row, fp) => (typeof row[2] === 'function' ? row[2](fp) : fp[row[2]]);
const num = (row, fp) => { const v = val(row, fp); return typeof v === 'number' ? v : null; };

function words(row, fp, d) {
  const tag = row[4];
  if (tag === 'hvpg') return d.readout.hvpg.measurable ? d.readout.hvpg.word : '';   // (the cell already says Not measurable)
  if (tag === 'ppg') return d.readout.ppg.word;
  if (tag === 'varix') return d.readout.varices;
  if (tag === 'asc') return d.readout.ascites;
  return '';
}

/** The text report for one state, or two (before, after) with the change. */
export function renderText(title, states) {
  const lines = [title, ''];
  const cols = states.map((s) => s.label);
  const pad = (s, n) => String(s).padEnd(n), padL = (s, n) => String(s).padStart(n);
  for (const [name, rows] of SECTIONS) {
    lines.push(name);
    for (const row of rows) {
      const cells = states.map((s) => {
        const raw = val(row, s.fp), v = row[3](raw);
        return row[2] === 'hvpg' && !s.d.readout.hvpg.measurable ? NOT_MEASURABLE : v;
      });
      let line = `  ${pad(row[0], 27)}${cells.map((c) => padL(c, 11)).join('')}  ${pad(row[1], 12)}`;
      if (states.length === 2) {
        const a = num(row, states[0].fp), b = num(row, states[1].fp);
        const shown = a != null && b != null ? row[3](Math.abs(b - a)) : '';
        line += shown && /[1-9]/.test(shown) ? ` ${padL(((b - a) > 0 ? '+' : '−') + shown, 8)}` : `${' '.repeat(9)}`;   // (a change that prints as 0.0 is blank)
      }
      const w = words(row, states[states.length - 1].fp, states[states.length - 1].d);
      lines.push(`${line}${w ? `  ${w}` : ''}`.trimEnd());
    }
    lines.push('');
  }
  lines.splice(2, 0, `  ${' '.repeat(27)}${cols.map((c) => padL(c, 11)).join('')}${states.length === 2 ? `${' '.repeat(13)}${padL('change', 8)}` : ''}`, '');
  lines.push(`Cut-offs: HVPG amber ${HVPG_CUTS.amber}, red ${HVPG_CUTS.red} mmHg; PPG amber ${PPG_CUTS.amber}, red ${PPG_CUTS.red} mmHg (src/engine/pressure-cuts.js).`);
  return lines.join('\n');
}

// ---- lists -------------------------------------------------------------------------------------------------------------------------
const SHORTCUTS = [
  ['--propranolol --carvedilol --terlipressin --octreotide', 'drugs on'], ['--tips [mm]  --dips [mm]', 'a TIPS or DIPS stent, default 8 mm (6 to 12)'],
  ['--diuretics  --anticoag  --splenectomy', 'switches'], ['--albumin g/dL  --cirrhosis 0..1  --meal 0..1  --gestation weeks  --splenic-rx 0|1|2  --nsbb-gain x', 'numbers (clamped ranges are refused, not clamped)'],
  ['--band  --paracentesis mL  --action \'{"kind":"infuse","fluid":"prbc"}\'', 'actions, run after the change and before the days'],
  ['--set path=value (repeat)  --params \'<json>\'', 'any parameter in src/engine/scenario.js defaultParams(), for example fibrosis.R.sin=3'],
];

async function loadDecks() {
  await import('../tests/dom-shim.js');   // (decks.js is a UI module; Node has no DOM)
  const { DECKS, DECK_ALIAS, withOverview } = await import('../src/ui/decks.js');
  return { DECKS, DECK_ALIAS, withOverview };
}

async function listAll(json) {
  const { DECKS } = await loadDecks();
  const presets = PRESETS.map((p) => ({ id: p.id, group: p.group, label: p.label, days: p.days }));
  const decks = DECKS.map((d) => ({ id: d.id, title: d.title, slides: d.slides.length + 1 }));
  if (json) return JSON.stringify({ presets, decks, drugs: Object.keys(DRUGS), shortcuts: SHORTCUTS.map(([flag, what]) => ({ flag, what })) }, null, 2);
  const out = ['Presets (--preset <id>)'];
  for (const p of presets) out.push(`  ${p.id.padEnd(18)}${p.label}  [${p.group}, ${p.days} days]`);
  out.push('', 'Decks (--deck <id> [--slide <n>])');
  for (const d of decks) out.push(`  ${d.id.padEnd(18)}${d.title}  (${d.slides} slides)`);
  out.push('', 'Shortcuts');
  for (const [flag, what] of SHORTCUTS) out.push(`  ${flag}\n      ${what}`);
  return out.join('\n');
}

const HELP = `Run the portal pressure model from a terminal and print its numbers.

  npm run model -- --preset <id> [changes] [--days N] [--compare] [--json]
  npm run model -- --deck <id> [--slide <n>] [--json]
  npm run model -- --list

--preset <id>        the patient (see --list); --preset-days N adds disease days before the change
changes              ${SHORTCUTS.map(([f]) => f).join('\n                     ')}
--days N             days that pass after the change (the model's disease clock)
--compare            print the preset as loaded beside the changed state, with the change
--deck <id>          a deck's own model state, slide by slide as the app presents it (slide 1 is the outline); --slide n picks one
--json               machine-readable output (every fingerprint number, plus the app's words for HVPG and PPG)
--list               presets, decks and shortcuts
The same engine and step chain as the app's slides; nothing here opens a browser.`;

// ---- main --------------------------------------------------------------------------------------------------------------------------
export async function main(argv, write = (s) => process.stdout.write(`${s}\n`)) {
  const o = parseArgs(argv);
  if (o.help || !argv.length) { write(HELP); return; }
  if (o.list) { write(await listAll(o.json)); return; }
  if (o.deck !== undefined) { write(await deckReport(o)); return; }
  if (o.preset === undefined) fail('Name a patient with --preset <id> (see --list), or a deck with --deck <id>.');
  const preset = PRESETS.find((p) => p.id === o.preset);
  if (!preset) fail(`No preset "${o.preset}". Close ids: ${near(o.preset, PRESETS.map((p) => p.id)).join(', ') || 'none'}. See --list.`);
  const patch = patchOf(o), action = actionsOf(o);
  const days = numberOpt(o, 'days') ?? 0, presetDays = numberOpt(o, 'preset-days');
  if (!(days >= 0 && days <= CHANGE_RANGES.days[1] && Number.isInteger(days))) fail('--days needs a whole number of days from 0 to 36500.');
  if (presetDays !== undefined && !(presetDays >= 0 && Number.isInteger(presetDays))) fail('--preset-days needs a whole number of days.');
  const changed = Object.keys(patch).length > 0 || action.length > 0 || days > 0;
  if (o.compare && !changed) fail('--compare needs a change to compare: add a treatment, --set/--params, an action or --days.');

  const steps = [{ preset: preset.id, ...(presetDays ? { presetDays } : {}) }];
  if (changed) steps.push({ ...(Object.keys(patch).length ? { params: patch } : {}), ...(action.length ? { action } : {}), ...(days ? { days } : {}) });
  const ran = await runSteps(steps);
  const stateOf = (label, x) => ({ label, fp: x.fp, d: describe(x.fp, x.params) });
  const before = stateOf('Before', ran[0]), after = stateOf(changed ? 'After' : 'Settled', ran[ran.length - 1]);
  const input = { preset: preset.id, presetLabel: preset.label, ...(presetDays ? { presetDays } : {}), params: patch, action, days };
  const title = `${preset.label}  [${preset.id}]${changed ? `  ·  ${describeChange(patch, action, days)}` : ''}`;

  if (o.json) {
    const out = { input, ...(o.compare ? { before: before.d } : {}), after: after.d };
    if (o.compare) out.change = Object.fromEntries(Object.keys(after.d.fingerprint).filter((k) => typeof after.d.fingerprint[k] === 'number' && typeof before.d.fingerprint[k] === 'number').map((k) => [k, r(after.d.fingerprint[k] - before.d.fingerprint[k])]));
    write(JSON.stringify(out, null, 2));
  } else write(renderText(title, o.compare ? [before, after] : [after]));
}

function describeChange(patch, action, days) {
  const bits = [];
  const drugs = Object.keys(patch.drugs || {}).filter((k) => patch.drugs[k]);
  bits.push(...drugs);
  if (patch.tips?.on) bits.push(`TIPS ${patch.tips.d} mm`);
  if (patch.dips?.on) bits.push(`DIPS ${patch.dips.d} mm`);
  const other = Object.keys(patch).filter((k) => !['drugs', 'tips', 'dips'].includes(k));
  if (other.length) bits.push(other.map((k) => (typeof patch[k] === 'object' ? k : `${k}=${patch[k]}`)).join(', '));
  if (action.length) bits.push(action.map((a) => a.kind).join(', '));
  if (days) bits.push(`${days} days`);
  return bits.join(', ');
}

async function deckReport(o) {
  const { DECKS, DECK_ALIAS, withOverview } = await loadDecks();
  const id = DECK_ALIAS[o.deck] || o.deck;
  const deck = DECKS.find((d) => d.id === id);
  if (!deck) fail(`No deck "${o.deck}". Close ids: ${near(o.deck, DECKS.map((d) => d.id)).join(', ') || 'none'}. See --list.`);
  const { deckStates } = await import('../tests/deck-states.js');
  const shown = withOverview(deck);   // (the slides as the presenter numbers them: the outline is slide 1)
  const fps = await deckStates(shown);
  let from = 0, to = fps.length;
  if (o.slide !== undefined) {
    const n = Number(o.slide), byId = shown.slides.findIndex((s) => s.id === o.slide);
    const i = Number.isInteger(n) && n >= 1 ? n - 1 : byId;
    if (i < 0 || i >= fps.length) fail(`${deck.id} has slides 1 to ${fps.length} (or a slide id: ${shown.slides.map((s) => s.id).filter(Boolean).join(', ')}).`);
    from = i; to = i + 1;
  }
  // (A deck's slides do not keep their params in deckStates; the hepatic-vein block is the one param the words need, and it is in the slide's own params.)
  const states = [];
  for (let i = from; i < to; i++) {
    const s = shown.slides[i], p = blockedParams(shown.slides, i);
    states.push({ n: i + 1, id: s.id || null, kicker: s.kicker || null, title: s.title || null, d: describe(fps[i], p), fp: fps[i], label: `Slide ${i + 1}` });
  }
  if (o.json) return JSON.stringify({ deck: deck.id, title: deck.title, slides: states.map(({ n, id: sid, kicker, title, d }) => ({ n, id: sid, kicker, title, ...d })) }, null, 2);
  return states.map((s) => renderText(`${deck.title}  ·  slide ${s.n}${s.title ? `: ${s.title}` : ''}${s.id ? `  [${s.id}]` : ''}`, [s])).join('\n\n');
}

// The params a deck slide has set so far (for the one question the words ask of them: is the hepatic vein blocked).
function blockedParams(slides, i) {
  let p = {};
  for (let k = 0; k <= i; k++) if (slides[k].preset) p = {}; else if (slides[k].params) p = deepMerge(p, slides[k].params);
  const t = slides.slice(0, i + 1).reverse().find((s) => s.preset);
  const preset = t && PRESETS.find((x) => x.id === t.preset);
  return preset ? deepMerge(preset.apply(defaultParams()), p) : p;
}

if (process.argv[1]?.endsWith('model-cli.mjs')) {
  main(process.argv.slice(2)).then(() => process.exit(0), (e) => {
    if (e instanceof UsageError) { console.error(`model: ${e.message}`); process.exit(2); }
    console.error(e); process.exit(1);
  });
}
