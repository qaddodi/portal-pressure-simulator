#!/usr/bin/env node
// The parity inventory: everything a person can see, read, tap or change in this app, as one JSON file, so the 3D rebuild
// (qaddodi/portal-pressure-sim-3d) can count what it has against what this app has ("x of y").
// Plan: /mnt/project-files/rebuild-3d/parity-plan.md section 2. READ-ONLY on the app: it imports data and reads source text, and writes
// only `parity/inventory.json` (or --out). Node only, no browser, about two seconds.
//
//   node scripts/parity-inventory.mjs [--out parity/inventory.json] [--check]
//
// --check writes nothing and exits 1 when the file on disk differs from what the source gives (so a change to the app that adds or
// removes a row says to run the script again). The 3D repo copies the file (`npm run sync:inventory` there).
//
// The file has `rows`: one per thing to match, { id, area, batch, label }, ids like `settings:Display/Blur effect`. `batch` is the
// parity plan's batch that closes the row (B1 to B15). The sections beside it (`decks`, `presets`, `settings`, ...) hold the detail
// the rows come from (words, numbers, the slide's fields), so a batch can read what it must build.

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const OUT = resolve(ROOT, args.includes('--out') ? args[args.indexOf('--out') + 1] : 'parity/inventory.json');

const uniq = (a) => [...new Set(a)];
const sortBy = (a, f) => [...a].sort((x, y) => String(f(x)).localeCompare(String(f(y))));
const unescape = (s) => s.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\u00a0/g, ' ').replace(/\\\\/g, '\\');

/** Source text between two markers (the first `from` to the first `to` after it). */
function between(text, from, to) {
  const a = text.indexOf(from);
  if (a < 0) throw new Error(`parity-inventory: "${from}" is not in the source any more (the script reads it by name)`);
  const b = to ? text.indexOf(to, a + from.length) : text.length;
  if (b < 0) throw new Error(`parity-inventory: "${to}" is not after "${from}" any more`);
  return text.slice(a, b);
}

// ---- data the app exports ----------------------------------------------------------------------------------------
await import(pathToFileURL(join(ROOT, 'tests/dom-shim.js')).href);   // decks.js is a UI module; Node has no DOM
const { PRESETS, DRUGS } = await import(pathToFileURL(join(ROOT, 'src/engine/portal/scenario.js')).href);
const { DECKS, TOPICS } = await import(pathToFileURL(join(ROOT, 'src/ui/decks.js')).href);
const { LOOKS } = await import(pathToFileURL(join(ROOT, 'src/ui/looks.js')).href);
const { LAPSES } = await import(pathToFileURL(join(ROOT, 'src/ui/timeline.js')).href);
const { TILES, LOBULE_TILES } = await import(pathToFileURL(join(ROOT, 'src/ui/dock.js')).href);
const { CATALOG } = await import(pathToFileURL(join(ROOT, 'src/ui/gallery/catalog.js')).href);
const { MAIN, TESTS_PANES, PANE_NAMES } = await import(pathToFileURL(join(ROOT, 'src/ui/gallery/catalog-main.js')).href);
const { TRIAL_IDS } = await import(pathToFileURL(join(ROOT, 'src/ui/trials.js')).href);
const { SURGICAL, shuntName } = await import(pathToFileURL(join(ROOT, 'src/ui/surgical-shunts.js')).href);
const { procLabel } = await import(pathToFileURL(join(ROOT, 'src/ui/procedure-names.js')).href);
const { EDGES } = await import(pathToFileURL(join(ROOT, 'src/engine/portal/topology.js')).href);
const { HIDDEN_EDGES } = await import(pathToFileURL(join(ROOT, 'src/ui/anatomy.js')).href);

const commit = (() => { try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return null; } })();

// ---- decks ------------------------------------------------------------------------------------------------------
const camName = (cam) => cam == null ? null : typeof cam === 'string' ? cam : Array.isArray(cam) ? cam.join('+') : cam.on ? `on:${[].concat(cam.on).join('+')}` : JSON.stringify(cam);
const topicOf = Object.fromEntries(DECKS.map((d) => [d.id, d.topic ?? null]));
const decks = DECKS.map((d) => ({
  id: d.id, title: d.title, topic: topicOf[d.id], level: d.level ?? null, minutes: d.minutes ?? null, objectives: (d.objectives || []).length,
  checks: (d.checks || []).length,
  slides: d.slides.map((s) => ({
    id: s.id ?? null, preset: s.preset ?? null, view: s.view ?? null, cam: camName(s.cam), lens: s.lens ?? null,
    data: s.data ?? null, tool: s.tool?.kind ?? null, cath: s.cath ?? null, visual: s.visual ?? null, procedure: typeof s.procedure === 'string' ? s.procedure : s.procedure?.kind ?? null,
    teaching: !!(s.title || s.line),
  })),
}));
const count = (list) => { const m = {}; for (const x of list) if (x != null) m[x] = (m[x] || 0) + 1; return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))); };
const allSlides = decks.flatMap((d) => d.slides);
const kinds = {
  tool: count(allSlides.map((s) => s.tool)), data: count(allSlides.map((s) => s.data)), lens: count(allSlides.map((s) => s.lens)),
  cam: count(allSlides.map((s) => s.cam && s.cam.split('+')[0].split(':')[0])), view: count(allSlides.map((s) => s.view)), cath: count(allSlides.map((s) => s.cath)),
  visual: count(allSlides.map((s) => s.visual)), procedure: count(allSlides.map((s) => s.procedure)),
};

// ---- presets and looks ------------------------------------------------------------------------------------------
const presets = PRESETS.map((p) => ({ id: p.id, group: p.group, label: p.label, days: p.days }));
const looks = LOOKS.map((l) => ({ id: l.id, name: l.name }));

// ---- the shell, from the source text ----------------------------------------------------------------------------
const html = read('index.html');
const tag = (re) => [...html.matchAll(re)];
const attr = (s, a) => (s.match(new RegExp(`${a}="([^"]*)"`)) || [])[1] ?? null;
const topbarHtml = between(html, '<header class="topbar', '<main class="stage-wrap"');
const topbar = [];
for (const m of topbarHtml.matchAll(/<(button|div)\b([^>]*)>(.*?)(?=<(?:button|div)\b|$)/gs)) {
  const a = m[2], id = attr(a, 'id'), label = attr(a, 'aria-label'), title = attr(a, 'title');
  if (!id || id === 'stageTop' || id === 'viewSeg') continue;
  const text = m[3].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  topbar.push({ id: id ?? `view-${attr(a, 'data-view')}`, label: label ?? (text || null), title, text: text || null });
}
const zoomGroup = tag(/<button[^>]*id="(zoomIn|zoomOut|zoomFit|rotateCircuit)"[^>]*>/g).map((m) => ({ id: attr(m[0], 'id'), label: attr(m[0], 'aria-label'), title: attr(m[0], 'title') }));
const views = tag(/<button data-view="([a-z]+)"[^>]*>([^<]+)</g).map((m) => ({ id: m[1], label: m[2] }));

const mainJs = read('src/ui/main.js');
const settingsSrc = between(mainJs, 'function openSettings(', 'function presenterSettings');
const settings = [];
{
  let section = null;
  const tokens = [...settingsSrc.matchAll(/menuSection\((null|'([^']*)')|menuItem\('([^']*)'|menuToggle\([^,]*,\s*'[a-z-]+',\s*'([^']*)',\s*'((?:[^'\\]|\\.)*)'|menu-title' \}, '([^']*)'/g)];
  for (const m of tokens) {
    if (m[1] !== undefined) section = m[2] ?? null;
    else if (m[3] !== undefined) settings.push({ section, label: m[3], kind: 'item' });
    else if (m[4] !== undefined) settings.push({ section, label: m[4], kind: 'switch', hint: unescape(m[5]) });
    else if (m[6] !== undefined) settings.push({ section, label: m[6], kind: 'title' });
  }
  // rows the source builds without a literal at the call: fullscreenControl() ("Enter full screen"), lookChooser (the looks), figureMpControl (the steps)
  settings.push({ section: null, label: 'Enter full screen', kind: 'item' });
  for (const l of LOOKS) settings.push({ section: 'Appearance', label: l.name, kind: 'look' });
  settings.push({ section: 'Appearance', label: 'System', kind: 'look' });
  settings.push({ section: 'Display', label: 'Figure detail: Less detail', kind: 'step' }, { section: 'Display', label: 'Figure detail: More detail', kind: 'step' });
}
const helpSrc = between(mainJs, 'function helpRows(', '\n}\n');
const helpPages = [...helpSrc.matchAll(/menuItem\('([^']*)'(?:,\s*\{[^}]*?kb: '([^']*)')?/g)].map((m) => ({ label: m[1], kb: m[2] ?? null }));

const pairs = (text) => [...text.matchAll(/\[\s*(?:keyLabel\()?'([^']+)'\)?,\s*'((?:[^'\\]|\\.)*)'\s*\]/g)].map((m) => ({ keys: m[1], what: unescape(m[2]) }));
const helpFn = between(mainJs, 'function openHelp(', "openModal('Guide'");
const shortcuts = [];
{
  const heads = ['Run the model', 'Change the view', 'Reach and act'].map((g) => ({ g, at: helpFn.indexOf(`['${g}', [`) }));
  if (heads.some((x) => x.at < 0)) throw new Error('parity-inventory: the Guide\'s key groups moved; update the script');
  heads.forEach((x, i) => { for (const p of pairs(helpFn.slice(x.at + x.g.length + 5, heads[i + 1]?.at ?? helpFn.length))) shortcuts.push({ group: x.g, ...p }); });
}
const presentKeys = pairs(between(mainJs, 'const PRESENT_KEYS = [', '];\nfunction openHelp'));
for (const p of presentKeys) shortcuts.push({ group: 'While presenting', ...p });

// play bar: the buttons and the jump and speed tables
const tl = read('src/ui/timeline.js');
const playbar = {
  controls: uniq([...tl.matchAll(/'aria-label': '([^']+)'/g)].map((m) => m[1])),
  speeds: JSON.parse(between(tl, 'const SPEEDS = ', ';').slice('const SPEEDS = '.length)),
  jumps: [...between(tl, 'const JUMPS = ', ';\n').matchAll(/\[(\d+), '([^']+)', '([^']+)'\]/g)].map((m) => ({ days: +m[1], short: m[2], long: m[3] })),
  lapses: LAPSES.map(([days, short, long]) => ({ days, short, long })),
  menu: ['Real time (every heartbeat)', 'Time-lapse (averaged, no beat)', 'Undo the last change', 'Jump ahead', 'Until something happens', 'Settle to equilibrium', 'Compare from here', 'Stop comparing'],
};

// search: the palette's commands, by group
const pal = read('src/ui/palette.js');
const lenses = [...between(mainJs, 'const LENSES = {', '};\n').matchAll(/^\s+([a-z]+): \['([^']+)', '([^']+)'/gm)].map((m) => ({ id: m[1], name: m[2], note: unescape(m[3]) }));
const firstList = (src, from) => [...between(src, from, ']]').matchAll(/\['([^']+)', '([^']+)'\]/g)].map((m) => m[2]);
const narrowNames = firstList(pal, "for (const [id, name] of [['PV_TRUNK'");
const removeNames = firstList(pal, "for (const [id, name] of [['warren'");
const goOrgans = firstList(pal, "for (const [id, t] of [['liver'");
const expand = (group, title) => {
  if (title.includes('${name}')) return (/^Remove/.test(title) ? removeNames : narrowNames).map((n) => title.replace('${name}', n));
  if (title === "procLabel('band')") return [procLabel('band')];
  if (title === 'shuntName(x)') return SURGICAL.map(shuntName);
  if (title.includes('${t.toLowerCase()}')) return lenses.map((l) => title.replace('${t.toLowerCase()}', l.name.toLowerCase()));
  if (title.includes('${l.name}')) return LOOKS.map((l) => title.replace('${l.name}', l.name));
  return [title];
};
const fixed = [...pal.matchAll(/\badd\('([A-Za-z ]+)', ('([^']+)'|`([^`]+)`|[A-Za-z.]+\([^)]*\))/g)].flatMap((m) => expand(m[1], m[3] ?? m[4] ?? m[2]).map((t) => ({ group: m[1], title: t })));
const dyn = [
  ...Object.values(DRUGS).map((d) => ({ group: 'Treat', title: d.label })),
  ...['+1 week', '+1 month', '+6 months', '+1 year'].map((t) => ({ group: 'Time', title: t })),
  ...EDGES.filter((e) => !HIDDEN_EDGES.has(e.id) && e.kind !== 'wedge' && e.kind !== 'shunt' && e.label).map((e) => ({ group: 'Go to', title: e.label })),
  ...goOrgans.map((t) => ({ group: 'Go to', title: t })),
];
const seenCmd = new Set();
const palette = {
  placeholder: between(pal, 'const placeholderFor', '\n').match(/'([^']*)'\s*:\s*'([^']*)'/)?.slice(1) ?? [],
  emptyOrder: JSON.parse(between(pal, 'const EMPTY_ORDER = ', ';').slice('const EMPTY_ORDER = '.length).replace(/'/g, '"')),
  groups: ['Change', 'Treat', 'Tests', 'Time', 'View', 'Go to', 'Patient', 'Present', 'App'],
  commands: [...fixed, ...dyn].filter((c) => { const k = `${c.group}|${c.title}`; if (seenCmd.has(k)) return false; seenCmd.add(k); return true; }),
  patients: 'every patient (group Patient)', presentations: 'every deck and script of the library (group Present)',
};

// every named control: aria-labels in the page and the source (templated ones, with ${…}, are listed apart)
const labelFiles = ['index.html', ...readdirSync(join(ROOT, 'src/ui')).filter((f) => f.endsWith('.js')).map((f) => `src/ui/${f}`)];
const plain = new Set(), templated = new Set();
for (const f of labelFiles) {
  const t = read(f);
  for (const m of t.matchAll(/aria-label(?:'|"|)\s*[:=]\s*(?:'((?:[^'\\]|\\.)*)'|"([^"]*)"|`([^`]*)`)/g)) {
    const v = unescape(m[1] ?? m[2] ?? m[3] ?? '');
    if (!v) continue;
    (m[3] !== undefined && m[3].includes('${') ? templated : plain).add(v);
  }
}
const controls = { plain: [...plain].sort(), templated: [...templated].sort() };

// deep links
const deepLinks = uniq([...between(mainJs, 'async function openDeepLink', '\n}\n').matchAll(/q\.get\('([a-z]+)'\)/g)].map((m) => m[1])).sort();
const manifest = JSON.parse(read('manifest.webmanifest'));
const platform = {
  deepLinks, pwa: { name: manifest.name, short_name: manifest.short_name, display: manifest.display, icons: manifest.icons.length },
  offline: true, noTrackers: true, keyboardAccess: ['Tab through vessels', 'arrows along the flow', 'Shift arrows follow the vessel'], liveDescription: true, reducedMotion: true, secondCue: true,
};

// Treat and Tests
const chartSrc = read('src/ui/chart.js');
const PROC_IDS = ['band', 'balloon', 'tips', 'dips', 'brto', 'bato', 'dsrs', 'paracentesis'];
const treat = {
  tabs: ['Drugs', 'Fluids', 'Procedures'],
  drugs: Object.entries(DRUGS).map(([k, v]) => ({ id: k, label: v.label })),
  procedures: uniq([...between(chartSrc, 'const procs = h(', "for (const b of procs.querySelectorAll").matchAll(/\bproc\('[a-z]+', '([^']+)'/g)].map((m) => PROC_IDS.includes(m[1]) ? procLabel(m[1]) : m[1])).concat(SURGICAL.map((s) => s.label)),
};
const tests = { panes: TESTS_PANES.map((id) => ({ id, name: PANE_NAMES[id] })), tiles: TILES.map((t) => ({ id: t.id, label: t.k })), lobuleTiles: LOBULE_TILES.map((t) => ({ id: t.id, label: t.k })), trials: TRIAL_IDS };

const gallery = [...CATALOG, ...MAIN].map((e) => ({ id: e.id, kind: e.kind, section: e.section, family: e.family }));

const chartLooks = readdirSync(join(ROOT, 'src/ui/chart-looks')).filter((f) => f.endsWith('.js')).map((f) => f.replace(/\.js$/, '')).sort();

// ---- the flat rows ---------------------------------------------------------------------------------------------------
const rows = [];
const row = (area, batch, path, label = path) => rows.push({ id: `${area}:${path}`, area, batch, label });
for (const t of topbar) row('topbar', 'B1', t.id, t.label || t.id);
for (const v of views) row('view', 'B1', v.id, v.label);
for (const z of zoomGroup) row('zoom', 'B1', z.id, z.label);
for (const c of playbar.controls) row('playbar', 'B1', c);
for (const j of playbar.jumps) row('playbar', 'B1', `jump ${j.short}`, `Jump ${j.long} ahead`);
for (const s of playbar.speeds) row('playbar', 'B1', `speed ${s}×`, `Playback speed ${s}×`);
for (const l of playbar.lapses) row('playbar', 'B1', `lapse ${l.short}`, l.long);
for (const s of settings) if (s.kind !== 'title') row('settings', 'B1', `${s.section ?? 'Top'}/${s.label}`, s.label);
for (const h of helpPages) row('help', 'B1', h.label);
for (const s of shortcuts) row('shortcut', 'B1', `${s.group}/${s.keys}`, `${s.keys}: ${s.what}`);
for (const c of palette.commands) row('search', c.group === 'App' || c.group === 'Time' || c.group === 'View' ? 'B1' : c.group === 'Go to' ? 'B6' : c.group === 'Tests' ? 'B11' : 'B9', `${c.group}/${c.title}`, c.title);
for (const d of platform.deepLinks) row('platform', 'B1', `deep link ?${d}=`);
row('platform', 'B1', 'installable PWA'); row('platform', 'B1', 'works offline');
for (const l of looks) row('look', 'B1', l.id, l.name);
for (const p of presets) row('preset', 'B2', p.id, p.label);
for (const d of decks) {
  row('deck', 'B13', d.id, d.title);
  for (let i = 0; i < d.slides.length; i++) row('slide', 'B13', `${d.id}/${d.slides[i].id ?? i + 1}`, `${d.title}, slide ${i + 1}`);
}
for (const [k] of Object.entries(kinds.tool)) row('tool', 'B10', k);
for (const l of uniq([...lenses.map((x) => x.id), ...Object.keys(kinds.lens)])) row('lens', 'B3', l, lenses.find((x) => x.id === l)?.name ?? l);
for (const [k] of Object.entries(kinds.cam)) row('camera', 'B13', k);
for (const d of treat.drugs) row('treat', 'B9', `drug/${d.label}`);
for (const p of treat.procedures) row('treat', 'B5', `procedure/${p}`);
for (const t of tests.panes) row('tests', 'B11', t.id, t.name);
for (const c of chartLooks) row('chart', 'B10', c);
for (const g of gallery) row('card', g.family && /^(tests|pane)/i.test(g.section || '') ? 'B11' : 'B12', g.id);

const seen = new Set();
for (const r of rows) { if (seen.has(r.id)) r.id += '#2'; seen.add(r.id); }   // (two sources naming one row twice: kept apart, never merged away)

const inventory = {
  generatedFrom: { repo: 'qaddodi/portal-pressure-simulator', commit },
  counts: { rows: rows.length, decks: decks.length, slides: allSlides.length, presets: presets.length, settings: settings.length, shortcuts: shortcuts.length, controls: controls.plain.length, gallery: gallery.length },
  rows,
  presets, looks, decks: sortBy(decks, (d) => d.id), topics: TOPICS.map(([topic, , list]) => ({ topic, decks: list.map((x) => x[0]) })), kinds,
  lenses,
  shell: { topbar, views, zoomGroup, playbar, settings, helpPages, shortcuts, palette, controls, platform },
  treat, tests, gallery, chartLooks,
};

const text = JSON.stringify(inventory, null, 1) + '\n';
if (CHECK) {
  let have = '';
  try { have = readFileSync(OUT, 'utf8'); } catch { /* none yet */ }
  const strip = (t) => t.replace(/"commit": "[0-9a-f]*"/, '"commit": ""');
  if (strip(have) !== strip(text)) { console.error(`parity-inventory: ${OUT} is out of date; run node scripts/parity-inventory.mjs`); process.exit(1); }
  console.log('parity-inventory: up to date');
} else {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, text);
  console.log(`parity-inventory: ${rows.length} rows (${decks.length} decks, ${allSlides.length} slides, ${presets.length} patients, ${settings.length} settings rows, ${shortcuts.length} shortcuts, ${controls.plain.length} named controls) → ${OUT}`);
}
