// `npm run gallery:affected` (scripts/gallery-affected.mjs): which specimens a change touches, the links it prints, and that its tables keep up with the catalog.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { CATALOG } = await import('../src/ui/gallery/catalog.js');
const A = await import('../scripts/gallery-affected.mjs');
const { affected, buildGraph, inDegree, sourceSet, render, linkFor, sweepLink, sweepAllLink, FAMILY_ENTRY, SHARED_FILES, CSS_FAMILIES, HUB_DEGREE, MAX_LINKS, PREVIEW_URL } = A;
const graph = buildGraph();
const run = (files, extra = {}) => affected({ files, catalog: CATALOG, graph, ...extra });

// A small made-up tree: a -> b -> c -> d, and hub <- x1..x3 (hub degree 3 here).
const tiny = () => new Map([
  ['src/ui/a.js', new Set(['src/ui/b.js'])], ['src/ui/b.js', new Set(['src/ui/c.js', 'src/ui/hub.js'])], ['src/ui/c.js', new Set(['src/ui/d.js'])], ['src/ui/d.js', new Set()],
  ['src/ui/hub.js', new Set(['src/ui/deep.js'])], ['src/ui/deep.js', new Set()],
  ['src/ui/x1.js', new Set(['src/ui/hub.js'])], ['src/ui/x2.js', new Set(['src/ui/hub.js'])],
]);

test('the walk stops at a hub and at the depth limit', () => {
  const g = tiny(), d = inDegree(g);
  const set = sourceSet(['src/ui/a.js'], g, d, 3, 3);
  assert.ok(set.has('src/ui/b.js') && set.has('src/ui/c.js') && set.has('src/ui/d.js'));
  assert.ok(set.has('src/ui/hub.js'), 'a hub reached is in the set');
  assert.ok(!set.has('src/ui/deep.js'), 'but it is not opened');
  assert.ok(!sourceSet(['src/ui/a.js'], g, d, 99, 1).has('src/ui/c.js'), 'depth 1 reaches only the direct imports');
});

test('a change to an instrument names its family, and not the others', () => {
  const r = run(['src/ui/doppler.js']);
  assert.deepEqual(r.families.sort(), ['doppler', 'tests-doppler']);
  assert.ok(r.ids.includes('doppler/pv-color') && r.ids.includes('tests-doppler/healthy'));
  assert.ok(!r.ids.some((id) => id.startsWith('trace/') || id.startsWith('structure/')));
});

test('a stylesheet maps to the families it styles; an unlisted one is shared by everything', () => {
  assert.deepEqual(run(['styles/scope-card.css']).families.sort(), ['scope', 'tests-endoscopy', 'tests-scope']);
  assert.equal(run(['styles/tokens.css']).ids.length, CATALOG.length);
  assert.ok(run(['styles/app-09-tests.css']).ids.every((id) => id.startsWith('tests-')));
  assert.ok(run(['styles/app-05-presenter-cards.css']).ids.every((id) => CATALOG.find((e) => e.id === id).kind === 'slide'));
});

test('a deck is content, not specimen code: it is listed apart to test by hand', () => {
  const r = run(['src/ui/decks/albumin.js', 'src/ui/test-decks/demo-all-new-visuals.js']);
  assert.equal(r.ids.length, 0);
  assert.deepEqual(r.unmapped, ['src/ui/decks/albumin.js', 'src/ui/test-decks/demo-all-new-visuals.js']);
});

test('files that are not the app (tests, docs, scripts, the gallery page itself) name nothing and are not listed as unmapped', () => {
  const r = run(['tests/x.test.js', 'docs/card-gallery.md', 'scripts/gallery-affected.mjs', 'src/ui/gallery/sweep.js', 'src/ui/gallery/page.js', 'package.json']);
  assert.equal(r.ids.length, 0);
  assert.deepEqual(r.unmapped, []);
});

test('a catalog change names exactly the entries that differ, new ones included', () => {
  const before = CATALOG.filter((e) => e.id !== 'doppler/ivc').map((e) => (e.id === 'doppler/artery' ? { ...e, title: 'old title' } : e));
  const r = run(['src/ui/gallery/catalog.js'], { before });
  assert.deepEqual(r.ids.sort(), ['doppler/artery', 'doppler/ivc']);
  assert.deepEqual(r.changed.sort(), ['doppler/artery', 'doppler/ivc']);
  assert.equal(run(['src/ui/gallery/catalog.js'], { before: CATALOG }).ids.length, 0, 'a catalog file touched with no entry changed names none');
});

test('a hub change is broad and says to sweep everything', () => {
  const deg = inDegree(graph);
  const hubs = [...deg].filter(([, n]) => n >= HUB_DEGREE).map(([f]) => f);
  assert.ok(hubs.includes('src/ui/util.js'), 'util.js is a hub');
  const r = run(['src/ui/util.js']);
  const text = render(r, CATALOG, { changedCount: 1 });
  assert.ok(r.ids.length > CATALOG.length * 0.4);
  assert.match(text, /^Broad change: \d+ of \d+ specimens/m);
  assert.ok(text.includes(sweepAllLink()));
});

test('the output has the deep links, the sweep link and "and N more" past the cap', () => {
  const r = run(['src/ui/doppler.js']);
  const text = render(r, CATALOG, { changedCount: 1, baseName: 'origin/x', look: 'navy', looks: ['light', 'navy'] });
  const lines = text.split('\n');
  assert.match(lines[0], /^Gallery: what to test \(1 changed file against origin\/x\)$/);
  assert.ok(text.includes(`${PREVIEW_URL}?gallery&sweep=ids:doppler/pv-spectrum`));
  assert.ok(text.includes('&looks=light,navy&fresh=1'));
  assert.equal(lines.filter((l) => l.startsWith('  doppler/') || l.startsWith('  tests-doppler/')).length, MAX_LINKS);
  assert.ok(text.includes(`${PREVIEW_URL}?gallery&look=navy#doppler/pv-spectrum`));
  assert.match(text, new RegExp(`and ${r.ids.length - MAX_LINKS} more, all in the Sweep link`));
});

test('links: one specimen, a sweep over ids and over everything', () => {
  assert.equal(linkFor('doppler/pv-color'), `${PREVIEW_URL}?gallery#doppler/pv-color`);
  assert.equal(linkFor('doppler/pv-color', { look: 'dark' }), `${PREVIEW_URL}?gallery&look=dark#doppler/pv-color`);
  assert.equal(sweepLink(['a/b', 'c/d']), `${PREVIEW_URL}?gallery&sweep=ids:a/b,c/d&fresh=1`);
  assert.equal(sweepAllLink({ looks: ['navy'] }), `${PREVIEW_URL}?gallery&sweep=all&looks=navy&fresh=1`);
});

test('no changed gallery specimen is reported as such', () => {
  assert.match(render(run(['tests/a.test.js']), CATALOG, { changedCount: 1 }), /No gallery specimen uses the changed files\./);
});

test('every catalog family has its modules named, and every module pattern in the tables matches a real file', () => {
  const families = [...new Set(CATALOG.map((e) => e.family))];
  const missing = families.filter((f) => !FAMILY_ENTRY[f]?.length);
  assert.deepEqual(missing, [], `a new catalog family needs its modules in FAMILY_ENTRY (scripts/gallery-affected.mjs): ${missing.join(', ')}`);
  const stale = Object.keys(FAMILY_ENTRY).filter((f) => !families.includes(f));
  assert.deepEqual(stale, [], 'FAMILY_ENTRY names a family the catalog no longer has');
  const files = [...graph.keys()];
  const re = (g) => new RegExp(`^${g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')}$`);
  const dead = [];
  for (const [fam, globs] of Object.entries(FAMILY_ENTRY)) for (const g of globs) if (!files.some((f) => re(g).test(f))) dead.push(`${fam}: ${g}`);
  for (const [kind, globs] of Object.entries(SHARED_FILES)) for (const g of globs) if (!files.some((f) => re(g).test(f))) dead.push(`shared ${kind}: ${g}`);
  for (const css of Object.keys(CSS_FAMILIES)) if (!existsSync(resolve(ROOT, css))) dead.push(`css: ${css}`);
  assert.deepEqual(dead, [], 'a table names a file that is gone: fix scripts/gallery-affected.mjs');
});

test('the source-set walk reads the repository: the Doppler card reaches its GL drawing and the walk stays inside src', () => {
  const set = sourceSet(FAMILY_ENTRY.doppler, graph, inDegree(graph));
  assert.ok(set.has('src/ui/doppler.js'));
  assert.ok([...set].every((f) => f.startsWith('src/')));
  assert.ok(set.size > 3 && set.size < graph.size / 2, `a family should not reach half the app (${set.size} of ${graph.size})`);
});
