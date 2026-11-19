#!/usr/bin/env node
// `npm run gallery:affected` (faster-checks plan, step 3): which gallery specimens does this change touch? Prints deep links to exactly those, and one
// Sweep link that runs the fit rules over them on a device, for a thread to paste into its push message ("what to test").
//
//   npm run gallery:affected                      the files changed since the branch's upstream (or the integration branch), plus uncommitted ones
//   npm run gallery:affected -- --base <ref>      against another ref
//   npm run gallery:affected -- --files a.js,b.js the files named (no git)
//   npm run gallery:affected -- --look navy --looks light,navy --json
//   npm run gallery:affected -- --write dist/gallery-affected.json    also writes the ids as a JSON array (what `?gallery&sweep=affected` reads beside the page, on a local run that serves it; a deploy does not write it)
//
// How a file maps to specimens (nothing is run, nothing is opened in a browser):
//   1. FAMILY_ENTRY names the module(s) that make each catalog family (the instrument of a tool kind, a Tests pane, the structure card ...).
//      The family's source set is those modules and everything they import, but the walk does not go through a HUB (a module a dozen others
//      import: util.js, store.js, frame.js ...). A hub is in the set of each family that imports it directly, so changing util.js touches most
//      families and the output says "broad change".
//   2. SHARED_FILES names the files every specimen of a kind goes through (the presenter's card shell for a teaching card, the dock for a Tests pane).
//   3. A stylesheet maps by CSS_FAMILIES; one not listed there is shared by everything.
//   4. A change to a catalog file names its specimens exactly: the catalog before and after are compared entry by entry.
// A file under src/ that no specimen uses (a deck, the engine's worker ...) is listed apart so the push message can say what to test by hand.
// It errs toward naming too many specimens, never too few; a wrong map is fixed here, in the tables, and tests/gallery-affected.test.js pins them.
import { readFileSync, writeFileSync, readdirSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname, relative, resolve, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const PREVIEW_URL = 'https://qaddodi.github.io/portal-pressure-simulator/preview/';
export const INTEGRATION_BRANCH = 'origin/claude/settings-topbar-icon-flvft1';
/** A module imported by this many others is a hub: the walk stops at it. */
export const HUB_DEGREE = 14;
/** How many imports away from a family's own modules still count as its source. */
export const WALK_DEPTH = 3;
/** Deck files are content the presenter plays, not specimen code: a change to one is tested by playing that deck. */
const DECK_FILES = /^src\/ui\/(decks|test-decks)\//;
/** More than this share of the catalog is "a broad change": the output says to sweep everything instead of listing links. */
export const BROAD_SHARE = 0.4;
/** The deep links printed one by one (the rest are in the Sweep link). */
export const MAX_LINKS = 10;

// ── Tables ──
/** family -> the modules that make it (paths from the repository root; `*` matches within one folder level). */
export const FAMILY_ENTRY = {
  doppler: ['src/ui/doppler.js'],
  trace: ['src/ui/pressure-time.js', 'src/ui/talk-trace.js'],
  vitals: ['src/ui/vitals-monitor.js'],
  hvpg: ['src/ui/tool-hvpg.js', 'src/ui/hvpg-*.js'],
  reading: ['src/ui/tool-reading.js'],
  fibroscan: ['src/ui/fibroscan.js'],
  scope: ['src/ui/instruments.js', 'src/ui/scope*.js'],
  abdomen: ['src/ui/instruments.js'],
  wall: ['src/ui/instruments.js'],
  lumen: ['src/ui/tool-lumen.js', 'src/ui/ext-instruments.js'],
  profile: ['src/ui/tool-profile.js', 'src/ui/ext-charts.js'],
  flowtime: ['src/ui/flow-time.js'],
  curve: ['src/ui/tool-curve.js', 'src/ui/ext-model.js'],
  course: ['src/ui/tool-course.js'],
  flows: ['src/ui/tool-flows.js'],
  shift: ['src/ui/tool-shift.js', 'src/ui/ext-charts.js'],
  menu: ['src/ui/tool-menu.js', 'src/ui/ext-charts.js'],
  stent: ['src/ui/tool-stent.js', 'src/ui/ext-stent.js', 'src/ui/stent-*.js'],
  evgraph: ['src/ui/event-graph.js'],
  path: ['src/ui/tool-path.js', 'src/ui/path-*.js', 'src/ui/path-algos/*.js'],
  criteria: ['src/ui/tool-criteria.js'],
  trial: ['src/ui/tool-trial.js', 'src/ui/trials.js'],
  forest: ['src/ui/trial-forest.js'],
  saag: ['src/ui/tool-saag.js'],
  fluid: ['src/ui/tool-fluid.js', 'src/ui/ext-instruments.js'],
  plane: ['src/ui/visual-plane.js', 'src/ui/ext-panels.js'],
  visual: ['src/ui/presenter-visuals.js', 'src/ui/visual-*.js'],
  tiles: ['src/ui/card-tiles.js', 'src/ui/tile-*.js'],
  teaching: ['src/ui/presenter-cards.js', 'src/ui/presenter-words.js'],
  'tests-profile': ['src/ui/pressure-along.js'],
  'tests-scope': ['src/ui/scope.js'],
  'tests-hvpg': ['src/ui/hvpg-*.js'],
  'tests-doppler': ['src/ui/doppler.js'],
  'tests-endoscopy': ['src/ui/instruments.js', 'src/ui/endo-*.js'],
  'tests-abdomen': ['src/ui/instruments.js'],
  'tests-fibroscan': ['src/ui/fibroscan.js'],
  'tests-readouts': ['src/ui/readouts-pane.js', 'src/ui/readouts-text.js'],
  'tests-trials': ['src/ui/trials-pane.js'],
  structure: ['src/ui/card.js', 'src/ui/card-details.js', 'src/ui/card-tiles.js', 'src/ui/part-names.js', 'src/ui/selection-live.js'],
  sheet: ['src/ui/menu.js', 'src/ui/palette.js', 'src/ui/treat-page.js', 'src/ui/compare.js', 'src/ui/timeline.js', 'src/ui/dock-sheet.js'],
};
/** Files every specimen of a kind goes through: kind (or `slide` for the teaching cards) -> paths (same `*` rule). */
export const SHARED_FILES = {
  slide: ['src/ui/presenter.js', 'src/ui/presenter-*.js', 'src/ui/slide-*.js', 'src/ui/decks.js', 'src/ui/gallery/deck.js', 'src/ui/card-glide.js', 'src/ui/card-scale.js', 'src/ui/card-type.js', 'src/ui/fit-box.js'],
  pane: ['src/ui/dock.js', 'src/ui/dock-*.js', 'src/ui/gallery/openers.js'],
  pick: ['src/ui/card-*.js', 'src/ui/anatomy.js', 'src/ui/gallery/openers.js'],
  sheet: ['src/ui/gallery/openers.js', 'src/ui/sheet-*.js', 'src/ui/menu-*.js'],
};
/** A stylesheet -> the families (or `slide` / `pane` / `pick` / `sheet`, a whole kind) it styles. A sheet not listed here is shared by everything. */
export const CSS_FAMILIES = {
  'styles/app-04-presenter.css': ['slide'],
  'styles/app-05-presenter-cards.css': ['slide'],
  'styles/app-11-deck-visuals.css': ['visual', 'plane', 'slide'],
  'styles/app-08-cards.css': ['pick', 'sheet'],
  'styles/app-09-tests.css': ['pane'],
  'styles/tests-card.css': ['pane'],
  'styles/scope-card.css': ['scope', 'tests-endoscopy', 'tests-scope'],
  'styles/path.css': ['path'],
  'styles/from-readings.css': ['reading', 'profile'],
};
/** The catalog files: a change names its specimens by comparing the catalog before and after. */
export const CATALOG_FILES = ['src/ui/gallery/catalog.js', 'src/ui/gallery/catalog-main.js'];
/** Gallery page code: it changes the page, not a specimen. */
const PAGE_FILES = [/^src\/ui\/gallery\/(page|plugins|registry|sweep.*|fit-.*|device-frame|api|readers)\.js$/];

// ── Paths and globs ──
const toRe = (g) => new RegExp(`^${g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')}$`);
const matches = (globs, file) => globs.some((g) => toRe(g).test(file));
const norm = (p) => p.split(sep).join('/');

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out); else if (n.endsWith('.js')) out.push(p);
  }
  return out;
}

const IMPORT_RE = /(?:^|[\s;}])(?:import|export)\s[^'"`;]*?from\s*['"](\.[^'"]+)['"]|(?:^|[\s;}])import\s*['"](\.[^'"]+)['"]|\bimport\(\s*['"](\.[^'"]+)['"]\s*\)/g;

/** The import graph of a source folder: Map(file -> Set(files it imports)), paths relative to `root`, with `/` separators. */
export function buildGraph(root = ROOT, dir = 'src') {
  const files = walk(join(root, dir)).map((f) => norm(relative(root, f)));
  const have = new Set(files);
  const graph = new Map();
  for (const f of files) {
    const src = readFileSync(join(root, f), 'utf8');
    const deps = new Set();
    for (const m of src.matchAll(IMPORT_RE)) {
      const rel = m[1] || m[2] || m[3];
      const target = norm(join(dirname(f), rel));
      if (have.has(target)) deps.add(target);
    }
    graph.set(f, deps);
  }
  return graph;
}

/** How many modules import each module. */
export function inDegree(graph) {
  const d = new Map();
  for (const deps of graph.values()) for (const t of deps) d.set(t, (d.get(t) || 0) + 1);
  return d;
}

/** The files a family's modules reach, at most `depth` imports away and not walking through a hub (a hub reached is in the set but not opened). */
export function sourceSet(entries, graph, degree, hub = HUB_DEGREE, depth = WALK_DEPTH) {
  const files = [...graph.keys()];
  const seeds = files.filter((f) => matches(entries, f));
  const seen = new Set(seeds);
  let level = seeds;
  for (let d = 0; d < depth && level.length; d++) {
    const next = [];
    for (const f of level) {
      for (const t of graph.get(f) || []) {
        if (seen.has(t)) continue;
        seen.add(t);
        if ((degree.get(t) || 0) < hub) next.push(t);
      }
    }
    level = next;
  }
  return seen;
}

const specKind = (e) => (e.kind === 'slide' ? 'slide' : e.kind);

/**
 * The specimens a list of changed files touches. `catalog`: the entries now; `before`: the entries at the base (or null when the catalog did not change).
 * Returns { ids, families, byFile: Map(file -> ids), unmapped: files under src/ or styles/ no specimen uses, changed: ids named by a catalog change }.
 */
export function affected({ files, catalog, before = null, graph, hub = HUB_DEGREE }) {
  const degree = inDegree(graph);
  const families = [...new Set(catalog.map((e) => e.family))];
  const sets = new Map(families.map((f) => [f, sourceSet(FAMILY_ENTRY[f] || [], graph, degree, hub)]));
  const byFile = new Map(), unmapped = [], named = new Set();
  const add = (file, ids) => { const s = byFile.get(file) || new Set(); for (const i of ids) s.add(i); byFile.set(file, s); };

  if (before) {
    const was = new Map(before.map((e) => [e.id, JSON.stringify(e)]));
    for (const e of catalog) if (was.get(e.id) !== JSON.stringify(e)) named.add(e.id);
  }
  for (const file of files) {
    if (CATALOG_FILES.includes(file)) { add(file, named); continue; }
    if (PAGE_FILES.some((re) => re.test(file))) continue;   // the page's own code: not a specimen (its tests cover it)
    if (!/^(src|styles)\//.test(file)) continue;
    if (DECK_FILES.test(file)) { unmapped.push(file); continue; }
    let ids = [];
    if (file.startsWith('styles/')) {
      const target = CSS_FAMILIES[file];
      ids = target ? catalog.filter((e) => target.includes(e.family) || target.includes(specKind(e))).map((e) => e.id) : catalog.map((e) => e.id);
    } else {
      for (const e of catalog) {
        if (sets.get(e.family)?.has(file) || matches(SHARED_FILES[specKind(e)] || [], file)) ids.push(e.id);
      }
    }
    if (ids.length) add(file, ids); else unmapped.push(file);
  }
  const ids = catalog.map((e) => e.id).filter((id) => [...byFile.values()].some((s) => s.has(id)));
  const fams = [...new Set(ids.map((id) => catalog.find((e) => e.id === id).family))];
  return { ids, families: fams, byFile, unmapped, changed: [...named] };
}

/** The address that opens a specimen. */
export const linkFor = (id, { base = PREVIEW_URL, look = '' } = {}) => `${base}?gallery${look ? `&look=${look}` : ''}#${id}`;
/** The address that starts a Sweep over these specimens on the device that opens it. */
export const sweepLink = (ids, { base = PREVIEW_URL, looks = [] } = {}) => `${base}?gallery&sweep=ids:${ids.join(',')}${looks.length ? `&looks=${looks.join(',')}` : ''}&fresh=1`;
export const sweepAllLink = ({ base = PREVIEW_URL, looks = [] } = {}) => `${base}?gallery&sweep=all${looks.length ? `&looks=${looks.join(',')}` : ''}&fresh=1`;

/** The push message's "what to test" text. */
export function render(result, catalog, { base = PREVIEW_URL, look = '', looks = [], changedCount = 0, baseName = '' } = {}) {
  const { ids, families, unmapped } = result;
  const lines = [`Gallery: what to test (${changedCount} changed file${changedCount === 1 ? '' : 's'}${baseName ? ` against ${baseName}` : ''})`];
  if (!ids.length) {
    lines.push('No gallery specimen uses the changed files.');
  } else if (ids.length > catalog.length * BROAD_SHARE) {
    lines.push(`Broad change: ${ids.length} of ${catalog.length} specimens in ${families.length} families. Sweep everything on a device: ${sweepAllLink({ base, looks })}`);
    lines.push(`Families: ${families.join(', ')}`);
  } else {
    lines.push(`${ids.length} specimen${ids.length === 1 ? '' : 's'} in ${families.length} ${families.length === 1 ? 'family' : 'families'}: ${families.join(', ')}`);
    lines.push(`Sweep these on a device (one tap): ${sweepLink(ids, { base, looks })}`);
    const shown = ids.slice(0, MAX_LINKS);
    for (const id of shown) lines.push(`  ${id}  ${linkFor(id, { base, look })}`);
    if (ids.length > shown.length) lines.push(`  and ${ids.length - shown.length} more, all in the Sweep link`);
  }
  if (unmapped.length) lines.push(`No specimen for: ${unmapped.join(', ')} (test those by hand)`);
  return lines.join('\n');
}

// ── Git and the catalog at the base ──
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const tryGit = (...args) => { try { return git(...args); } catch { return ''; } };

/** The ref to compare with: the upstream of this branch, else the integration branch. */
export function defaultBase() {
  return tryGit('rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}') || INTEGRATION_BRANCH;
}
/** Changed files (committed since the base, uncommitted, and new) with `/` separators. */
export function changedFiles(base) {
  const out = new Set();
  for (const cmd of [['diff', '--name-only', base], ['ls-files', '--others', '--exclude-standard']]) {
    for (const l of tryGit(...cmd).split('\n')) if (l.trim()) out.add(l.trim());
  }
  return [...out];
}

/** The catalog as it was at `base`: the source tree is written to a temp folder, because the catalog imports its neighbours. Null when it cannot be read. */
export async function catalogAt(base) {
  const dir = mkdtempSync(join(tmpdir(), 'gallery-base-'));
  try {
    execFileSync('sh', ['-c', `git archive ${JSON.stringify(base)} src | tar -x -C ${JSON.stringify(dir)}`], { cwd: ROOT, stdio: 'ignore' });
    const m = await import(pathToFileURL(join(dir, 'src/ui/gallery/catalog.js')).href);
    return m.CATALOG;
  } catch { return null; } finally { rmSync(dir, { recursive: true, force: true }); }
}

async function main() {
  const argv = process.argv.slice(2);
  const opt = (name, d = '') => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : d; };
  const base = opt('base') || defaultBase();
  const filesArg = opt('files');
  const files = filesArg ? filesArg.split(',').map((s) => s.trim()).filter(Boolean) : changedFiles(base);
  const look = opt('look'), looks = opt('looks').split(',').filter(Boolean);
  const { CATALOG } = await import(pathToFileURL(join(ROOT, 'src/ui/gallery/catalog.js')).href);
  const before = !filesArg && files.some((f) => CATALOG_FILES.includes(f)) ? await catalogAt(base) : null;
  const result = affected({ files, catalog: CATALOG, before: before || (files.some((f) => CATALOG_FILES.includes(f)) ? [] : null), graph: buildGraph() });
  if (argv.includes('--json')) { console.log(JSON.stringify({ base, files, ids: result.ids, families: result.families, unmapped: result.unmapped, sweep: result.ids.length ? sweepLink(result.ids, { looks }) : null }, null, 1)); return; }
  const out = opt('write');
  if (out) writeFileSync(out, `${JSON.stringify(result.ids)}\n`);
  console.log(render(result, CATALOG, { look, looks, changedCount: files.length, baseName: filesArg ? '' : base }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error(e); process.exit(1); });
