// Production build: the same app as the repository root, bundled, minified and content-hashed.
//
// The repository root stays a working, build-free site (GitHub Pages serves it as is, and
// `npm start` runs it). This script writes an optimized copy to dist/ for hosts that can serve a
// build output, and for the SCORM package:
//
//   - one module graph per entry (the app, the engine worker), split so the command palette
//     and the presenter stay separate chunks loaded on first use;
//   - CSS (fonts, tokens, layout) in one minified, hashed file; fonts hashed;
//   - every file name carries its content hash, so caches can keep them forever;
//   - a service worker that precaches the whole app for offline use.
//
//   node scripts/build.mjs      → dist/
//
// GitHub Pages also serves this build (.github/workflows/pages.yml): one bundled script and one
// stylesheet load far faster than ~60 source files on a slow or filtered network (pages-build: 1).

import { build as esbuild } from 'esbuild';
import { readFileSync, writeFileSync, rmSync, mkdirSync, cpSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, resolve, relative, basename, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { execSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { withCsp } from './csp.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'dist');
const ASSETS = join(OUT, 'assets');
const sha = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 10);

// A commit that kept git's conflict markers (3207b43b, 2 Nov) is refused before anything is bundled or deployed, naming each line.
// (The same check runs as a unit test, tests/no-merge-markers.test.js; the build is what the preview deploy always runs.)
{
  const MARK = new RegExp('^(' + '<'.repeat(7) + '( |$)|' + '='.repeat(7) + '\\s*$|' + '>'.repeat(7) + '( |$))');
  const bad = [];
  const scan = (d) => { for (const n of readdirSync(d)) { if (n === 'node_modules' || n.startsWith('.')) continue; const f = join(d, n);
    if (statSync(f).isDirectory()) scan(f); else if (/\.(js|mjs|css|html|json)$/.test(n)) readFileSync(f, 'utf8').split('\n').forEach((l, i) => { if (MARK.test(l)) bad.push(`  ${relative(ROOT, f)}:${i + 1}`); }); } };
  for (const d of ['src', 'styles', 'scripts']) scan(join(ROOT, d));
  if (bad.length) throw new Error('Build refused, merge conflict markers are left in:\n' + bad.join('\n'));
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(ASSETS, { recursive: true });

// The source imports plain addresses; a `?v=hash` left by an old branch is taken off here, so a bundle never sees one.
const stripStamps = {
  name: 'strip-stamps',
  setup(b) {
    b.onResolve({ filter: /\?v=/ }, (args) => ({ path: resolve(args.resolveDir, args.path.replace(/\?v=[0-9a-f]+$/, '')) }));
  },
};
// An import esbuild can only make `undefined` (the module is empty, or exports nothing) minifies to `(void 0)(...)` and the page dies at
// boot ("(void 0) is not a function", preview c3fb93ed, when a conflict emptied glass-gl.js). esbuild only warns, so the build fails on it.
const build = async (opts) => {
  const r = await esbuild(opts);
  const bad = r.warnings.filter((w) => w.id === 'import-is-undefined');
  if (bad.length) throw new Error('Build refused, an import is always undefined:\n' + bad.map((w) => `  ${w.location?.file}:${w.location?.line} ${w.text}`).join('\n'));
  return r;
};
// Release identity (PR-04): the newest v2026.11.N tag (when the checkout has tags) plus the short commit, so a tester's "which version?"
// has an answer and a bad merge has a rollback target. PPS_RELEASE overrides it; a checkout with no git says "build".
const RELEASE = (() => {
  if (process.env.PPS_RELEASE) return process.env.PPS_RELEASE;
  const git = (a) => { try { return execSync('git ' + a, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return ''; } };
  const tag = git('describe --tags --abbrev=0 --match "v20*"');
  const hash = (process.env.GITHUB_SHA || git('rev-parse HEAD')).slice(0, 8);
  return [tag, hash].filter(Boolean).join(' · ') || 'build';
})();
const common = { define: { __PPS_RELEASE__: JSON.stringify(RELEASE) }, bundle: true, format: 'esm', minify: true, target: ['es2022'], legalComments: 'none', logLevel: 'warning', plugins: [stripStamps] };

// 1. The engine worker, as one self-contained module.
const worker = await build({ ...common, entryPoints: [join(ROOT, 'src/worker.js')], outdir: ASSETS, entryNames: 'worker-[hash]', write: true, metafile: true });
const workerFile = basename(Object.keys(worker.metafile.outputs).find((f) => f.endsWith('.js')));

// 1b. The stage's binning worker (sweep-worker.js: the change between the views), the same way.
const sweep = await build({ ...common, entryPoints: [join(ROOT, 'src/ui/sweep-worker.js')], outdir: ASSETS, entryNames: 'sweep-[hash]', write: true, metafile: true });
const sweepFile = basename(Object.keys(sweep.metafile.outputs).find((f) => f.endsWith('.js')));
// 1c. The dye bolus's worker (dye-worker.js: the slugs' advance), the same way.
const dye = await build({ ...common, entryPoints: [join(ROOT, 'src/ui/dye-worker.js')], outdir: ASSETS, entryNames: 'dye-[hash]', write: true, metafile: true });
const dyeFile = basename(Object.keys(dye.metafile.outputs).find((f) => f.endsWith('.js')));

// 2. The app. Every module that starts a worker (host.js, presenter-visuals.js: the engine; stage-vessels.js: the binning; stage-blood.js:
// the dye) points the Worker at the bundled worker file. The modules are found by what they hold, not by name: when the stage split
// moved the binning and dye workers out of stage.js, a filter naming stage.js left the shipped build asking for ./sweep-worker.js, which
// is not there, so every stretch of the change between the views failed and each of its frames was binned on the CPU (his Mac, 8 Nov
// 2026: "stretches ready 0 of 6", 5 to 10 fps). The build also refuses an output that still names a source worker (see below).
const WORKER_SRC = [
  [/new URL\('\.\.\/worker\.js(\?v=[0-9a-f]+)?', import\.meta\.url\)/g, `new URL('./${workerFile}', import.meta.url)`],
  [/new URL\('\.\/sweep-worker\.js(\?v=[0-9a-f]+)?', import\.meta\.url\)/g, `new URL('./${sweepFile}', import.meta.url)`],
  [/new URL\('\.\/dye-worker\.js(\?v=[0-9a-f]+)?', import\.meta\.url\)/g, `new URL('./${dyeFile}', import.meta.url)`],
];
const workerHolders = new Set(readdirSync(join(ROOT, 'src/ui')).filter((f) => f.endsWith('.js')).map((f) => join(ROOT, 'src/ui', f))
  .filter((f) => WORKER_SRC.some(([re]) => { re.lastIndex = 0; return re.test(readFileSync(f, 'utf8')); })));
const workerUrl = {
  name: 'worker-url',
  setup(b) {
    b.onLoad({ filter: /[\\/]src[\\/]ui[\\/][\w-]+\.js$/ }, (args) => {
      if (!workerHolders.has(resolve(args.path))) return undefined;   // (left to the next plugin and esbuild's own loading)
      let contents = readFileSync(args.path, 'utf8');
      for (const [re, to] of WORKER_SRC) contents = contents.replace(re, to);
      return { contents, loader: 'js' };
    });
  },
};
// Picture and glyph data (plain literals, nothing to run) ships as data, not script (Holding 120 Hz §2.9): a JSON file parses several
// times faster than the same object written as JavaScript, and is not counted, compiled or kept as code. Each module becomes a two-line
// loader that fetches its hashed .json (preloaded in the head for the ones the first screen needs, so the fetch runs beside the scripts),
// and the SDF atlas's base64 PNG becomes a real .png the browser decodes off the main thread. The source modules stay as they are: the
// repository root runs them as is. The build fails if a value does not come back from JSON exactly as it was.
const DATA_MODULES = /[\\/]src[\\/]ui[\\/](organ-art|organ-art-lite|glyph-data|glyph-data-opsz|glyphs-inter|glyphs-inter-png|glyphs-inter-display|glyphs-inter-display-png|glyph-metrics|liver-geo-data)\.js$/;
const dataOut = new Map();   // module name → the file it became
const dataFiles = {
  name: 'data-files',
  setup(b) {
    b.onLoad({ filter: DATA_MODULES }, async (args) => {
      const name = basename(args.path, '.js');
      const m = { ...(await import(pathToFileURL(args.path).href)) };
      if (name.endsWith('-png')) {
        // (an SDF atlas's base64 PNG, its one export: ATLAS_PNG, or DISPLAY_PNG for the big readouts' field)
        const [key] = Object.keys(m), url = m[key];
        const png = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
        const file = `${name}-${sha(png)}.png`;
        writeFileSync(join(ASSETS, file), png); dataOut.set(name, file);
        return { contents: `export const ${key} = new URL('./${file}', import.meta.url).href;`, loader: 'js' };
      }
      const json = JSON.stringify(m);
      if (!isDeepStrictEqual(JSON.parse(json), m)) throw new Error(`${name}.js does not survive JSON: ship it as script`);
      const file = `${name}-${sha(json)}.json`;
      writeFileSync(join(ASSETS, file), json); dataOut.set(name, file);
      return { contents: `const r = await fetch(new URL('./${file}', import.meta.url));\nif (!r.ok) throw new Error('${file}: ' + r.status);\nexport const { ${Object.keys(m).join(', ')} } = await r.json();`, loader: 'js' };
    });
  },
};
// No script file over 200 KB (Holding 120 Hz §2.9): esbuild splits only where import() does, so a chunk is every module the same entries
// reach. A chunk over the limit made of more than one module has its largest module made an entry of its own, which gives that module a
// file of its own, and the build runs again until no such chunk is left. (A single module over the limit has to be split in its source.)
const CHUNK_LIMIT = 200 * 1024;
const appEntries = new Set([join(ROOT, 'src/ui/main.js')]);
// The module to make an entry next: the one that takes the most bytes out of the chunk with it, meaning itself and every module of the chunk
// that is reached only through it (it dominates them), so one new file carries a whole subtree. The largest single module (the old rule) took the
// chunk down a few KB a file: the presenter's chunk held ~40 small modules besides the presenter, 60 rounds ran out, and ~50 more files would have
// broken the first-load file ceiling. Roots of the chunk: its entry module, and any module an importer outside the chunk reaches.
function subtreeEntry(meta, inChunk, mods, out) {
  const size = new Map(mods);
  const edges = (i) => (meta.inputs[i]?.imports || []).filter((e) => e.kind === 'import-statement' && inChunk.has(e.path)).map((e) => e.path);
  const roots = new Set(out.entryPoint ? [out.entryPoint] : []);
  for (const [i, x] of Object.entries(meta.inputs)) if (!inChunk.has(i)) for (const e of x.imports || []) if (e.kind === 'import-statement' && inChunk.has(e.path)) roots.add(e.path);
  const reach = (skip) => {
    const seen = new Set(), stack = [...roots].filter((r) => r !== skip && inChunk.has(r));
    while (stack.length) { const n = stack.pop(); if (seen.has(n)) continue; seen.add(n); for (const m of edges(n)) if (m !== skip) stack.push(m); }
    return seen;
  };
  const all = reach(null);
  let best = null, bestBytes = 0;
  for (const x of all) {
    if (appEntries.has(resolve(ROOT, x)) || roots.has(x)) continue;
    const after = reach(x);
    let bytes = 0;
    for (const n of all) if (!after.has(n)) bytes += size.get(n) || 0;
    if (bytes > bestBytes) { best = x; bestBytes = bytes; }
  }
  return best && resolve(ROOT, best);
}
const appOpts = () => ({ ...common, plugins: [stripStamps, workerUrl, dataFiles], entryPoints: [...appEntries], outdir: ASSETS, splitting: true, entryNames: '[name]-[hash]', chunkNames: 'chunk-[hash]', metafile: true });
for (let round = 0; round < 60; round++) {
  const trial = await build({ ...appOpts(), write: false });
  const over = Object.values(trial.metafile.outputs).filter((o) => o.bytes > CHUNK_LIMIT && Object.values(o.inputs).filter((i) => i.bytesInOutput > 0).length > 1);
  if (!over.length) break;
  for (const o of over) {
    const mods = Object.entries(o.inputs).filter(([, x]) => x.bytesInOutput > 0).map(([i, x]) => [i, x.bytesInOutput]);
    const picked = subtreeEntry(trial.metafile, new Set(mods.map(([i]) => i)), mods, o);
    const top = picked || Object.entries(o.inputs).sort((a, b) => b[1].bytesInOutput - a[1].bytesInOutput).map(([i]) => resolve(ROOT, i)).find((i) => !appEntries.has(i));
    if (top) appEntries.add(top);
  }
}
const app = await build({ ...appOpts(), write: true });
if (process.env.PPS_META) writeFileSync(process.env.PPS_META, JSON.stringify(app.metafile));   // (the size breakdown by source module: scripts/first-load.mjs reads it)
// (No shipped file may still start a worker from its source address: the bundle has no such file, the worker fails to load, and its
// callers fall back to the main thread without a word. Always refused, preview builds too.)
for (const f of Object.keys(app.metafile.outputs).filter((x) => x.endsWith('.js'))) {
  const left = readFileSync(resolve(f), 'utf8').match(/new URL\(["'`](?:\.\.\/worker|\.\/sweep-worker|\.\/dye-worker)\.js/);
  if (left) throw new Error(`Build refused: ${basename(f)} still starts a worker from its source address (${left[0]}): add its module to the worker-url plugin`);
}
// A module made an entry above also gets an entry file that only re-exports it; the app imports the shared chunk instead, so a re-export
// file nothing imports (and that is not the app itself or an import() target) is left out.
const reached = new Set(Object.values(app.metafile.outputs).flatMap((o) => o.imports.map((i) => i.path)));
for (const [f, o] of Object.entries(app.metafile.outputs)) {
  if (o.entryPoint && !o.entryPoint.endsWith('src/ui/main.js') && !reached.has(f)) { rmSync(resolve(f), { force: true }); delete app.metafile.outputs[f]; }
}
// (The limit holds where BUILD_STRICT is set (main's deploy, CI): the build fails on a chunk over it. Without BUILD_STRICT (the preview
// deploy, a local build) an over-limit chunk is a warning, so a few KB never keep a preview off the devices. The stage no longer needs an
// allowance (PR-18): it is split into parts, and the bundler shares them out into chunks under the limit.)
for (const [f, o] of Object.entries(app.metafile.outputs)) {
  if (!f.endsWith('.js') || o.bytes <= CHUNK_LIMIT) continue;
  const mods = Object.entries(o.inputs).filter(([, i]) => i.bytesInOutput > 0).map(([i]) => i);
  const msg = `${basename(f)} is ${(o.bytes / 1024).toFixed(0)} KB (${mods.slice(0, 4).join(', ')}): no chunk over ${CHUNK_LIMIT / 1024} KB`;
  if (process.env.BUILD_STRICT) throw new Error(msg);
  console.warn(`::warning title=Chunk over the size limit::${msg}`);
}
// (esbuild lists a module that is only import()ed with an entryPoint too, so the page's script is the one made from main.js, not the first listed.)
const isApp = (o) => o.entryPoint?.endsWith('src/ui/main.js');
const appFile = basename(Object.keys(app.metafile.outputs).find((f) => isApp(app.metafile.outputs[f])));
// Chunks the entry imports statically: preload them alongside it.
const appOut = Object.values(app.metafile.outputs).find(isApp);
// (Every chunk the first screen runs, the chunks' own imports included, so none waits for the one that names it.)
const staticChunks = [];
for (const queue = [appOut]; queue.length;) {
  for (const i of queue.shift().imports) {
    if (i.kind !== 'import-statement' || staticChunks.includes(basename(i.path))) continue;
    staticChunks.push(basename(i.path)); queue.push(app.metafile.outputs[i.path]);
  }
}

// 3. Styles: fonts, tokens and layout in one file; fonts get hashed names.
const cssEntry = join(OUT, '_entry.css');
writeFileSync(cssEntry, ['fonts/fonts.css', 'styles/tokens.css', 'styles/icons.css', 'styles/app.css', 'styles/path.css', 'styles/scope-card.css', 'styles/tests-card.css', 'styles/routes.css'].map((f) => `@import "${relative(OUT, join(ROOT, f)).split(sep).join('/')}";`).join('\n'));
const css = await build({ ...common, plugins: [], entryPoints: [cssEntry], outdir: ASSETS, entryNames: 'app-[hash]', assetNames: '[name]-[hash]', loader: { '.woff2': 'file', '.png': 'file' }, write: true, metafile: true });
rmSync(cssEntry);
const cssFile = basename(Object.keys(css.metafile.outputs).find((f) => f.endsWith('.css')));
const fontFiles = Object.keys(css.metafile.outputs).filter((f) => f.endsWith('.woff2')).map((f) => basename(f));
const interLatin = fontFiles.find((f) => f.startsWith('inter-latin-') && !f.startsWith('inter-latin-ext'));
const serifLatin = fontFiles.find((f) => f.startsWith('source-serif-4-latin-') && !f.startsWith('source-serif-4-latin-ext'));
const monoLatin = fontFiles.find((f) => f.startsWith('jetbrains-mono-latin-') && !f.startsWith('jetbrains-mono-latin-ext'));

// 4. Static files.
for (const d of ['brand', 'guides']) cpSync(join(ROOT, d), join(OUT, d), { recursive: true });
cpSync(join(ROOT, 'manifest.webmanifest'), join(OUT, 'manifest.webmanifest'));

// 5. index.html: the source page with its local styles, preloads and entry swapped for the build.
let html = readFileSync(join(ROOT, 'index.html'), 'utf8');
html = html
  .replace(/\s*<link rel="preload" href="fonts\/[^"]+"[^>]*>/g, '')
  .replace(/\s*<link rel="stylesheet" href="(?:fonts|styles)\/[^"]+" \/>/g, '')
  .replace(/\s*<link rel="modulepreload" href="src\/[^"]+" \/>/g, '')
  .replace(/\s*<script type="module" src="src\/ui\/main\.js[^"]*"><\/script>/, '');
const head = [
  interLatin ? `<link rel="preload" href="assets/${interLatin}" as="font" type="font/woff2" crossorigin />` : '',
  serifLatin ? `<link rel="preload" href="assets/${serifLatin}" as="font" type="font/woff2" crossorigin />` : '',
  monoLatin ? `<link rel="preload" href="assets/${monoLatin}" as="font" type="font/woff2" crossorigin />` : '',
  `<link rel="stylesheet" href="assets/${cssFile}" />`,
  // (The data the first screen's scripts wait for: fetched beside them, not after them.)
  ...['organ-art', 'liver-geo-data', 'glyphs-inter', 'glyphs-inter-display'].filter((n) => dataOut.has(n)).map((n) => `<link rel="preload" href="assets/${dataOut.get(n)}" as="fetch" crossorigin />`),
  dataOut.has('glyphs-inter-png') ? `<link rel="preload" href="assets/${dataOut.get('glyphs-inter-png')}" as="image" />` : '',
  dataOut.has('glyphs-inter-display-png') ? `<link rel="preload" href="assets/${dataOut.get('glyphs-inter-display-png')}" as="image" />` : '',
  ...staticChunks.map((c) => `<link rel="modulepreload" href="assets/${c}" />`),
  `<script type="module" src="assets/${appFile}"></script>`,
].filter(Boolean).map((l) => '  ' + l).join('\n');
html = html.replace('</head>', `${head}\n</head>`);
writeFileSync(join(OUT, 'index.html'), withCsp(html));   // (the policy hashes the page's inline scripts, so it is added last)
writeFileSync(join(OUT, 'release.txt'), RELEASE + '\n');

// 6. Service worker: precache everything; hashed assets never change, so cache-first is safe.
const walk = (p) => (statSync(p).isDirectory() ? readdirSync(p).flatMap((f) => walk(join(p, f))) : [p]);
const files = walk(OUT).map((p) => relative(OUT, p).split(sep).join('/')).filter((f) => f !== 'sw.js').sort();
// (The handout figures, deck stills and tester guide PDFs are left to load when used, so installing offline support stays light.)
// (The "Lighter organ art" switch's lines load only when it is turned on (stage.js syncArtLite), so the switch left off downloads nothing new.)
const liteChunks = Object.entries(app.metafile.outputs).filter(([, o]) => Object.keys(o.inputs).some((i) => i.endsWith('src/ui/organ-art-lite.js'))).map(([f]) => 'assets/' + basename(f));
const cached = files.filter((f) => !/^(brand\/(handout|decks|share)|guides)\//.test(f) && !liteChunks.includes(f));
// (The fonts' Greek and extended-Latin subsets are drawn only where a word needs them, and the browser fetches one by its unicode-range
// at that moment. A first visit's install does not fetch them with the rest: they are cached once the page is quiet (the page asks,
// 'pps:fill'), or when first used, so a person who never meets one never downloads it, and the install does not compete with the first
// screen for 400 KB of them. Offline, they are there after that first quiet moment.)
const later = cached.filter((f) => /^assets\/(?:inter|source-serif-4|jetbrains-mono)-(?:latin-ext|greek-ext|greek)-[^/]*\.woff2$/.test(f));
const install = cached.filter((f) => !later.includes(f));
const version = sha(files.map((f) => f + ':' + sha(readFileSync(join(OUT, f)))).join('\n'));
writeFileSync(join(OUT, 'sw.js'), `// Generated by scripts/build.mjs. Precaches the whole app; hashed assets are cache-first.
// One cache per copy of the site (Pages serves the live site at / and the preview at /preview/ on one origin):
// a copy drops only its own older caches and the source site's (pps-v3, no scope in the name), never the other copy's, and never a
// cache that belongs to another app on this origin (github.io hosts the author's other tools: their offline caches are theirs).
const SCOPE = 'pps@' + new URL(self.registration.scope).pathname + '@';
const CACHE = SCOPE + '${version}';
const FILES = ${JSON.stringify(['./', ...install])};
const LATER = ${JSON.stringify(later)};
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
// The page asks for the rest once it has been left alone (src/ui/main.js): the fonts' other subsets, for offline use.
// ('pps:files': a page that sees a new worker take over asks which files it holds, to tell an update that changed its own files from one it already has.)
self.addEventListener('message', (e) => { if (e.data === 'pps:files' && e.ports[0]) e.ports[0].postMessage(FILES); else if (e.data === 'pps:fill') e.waitUntil(caches.open(CACHE).then(async (c) => { for (const f of LATER) if (!(await c.match(f))) await c.add(f); }).catch(() => {})); });
// The previous version's cache is kept (keys() lists caches oldest first): a tab left open across an update still finds
// its own hashed files (the server has only the new ones), so it can start a presentation; any older cache goes.
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => { const prev = ks.filter((k) => k !== CACHE && k.startsWith(SCOPE)).at(-1); return Promise.all(ks.filter((k) => k !== CACHE && k !== prev && (k.startsWith(SCOPE) || k.startsWith('pps-'))).map((k) => caches.delete(k))); }).then(() => self.clients.claim())); });
// (A response is stored under waitUntil, so the worker is kept alive until the write ends; a storage failure is swallowed, the response is still served.)
const keep = (e, req, res) => { if (res.status === 200) { const copy = res.clone(); e.waitUntil(caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {})); } };
// A hashed file the page's fresh HTML names can be missing for a moment right after a deploy (an edge of the host still on the old site, or a 404 it
// remembered): the page would then stop with "Could not load main-HASH.js". So a failed fetch of one is asked again, up to three more times, bypassing the HTTP cache.
const pull = async (req) => { let res; for (let i = 0; i < 4; i++) { try { res = await fetch(i ? req.url : req, i ? { cache: 'reload' } : undefined); if (res.status < 400) return res; } catch (err) { if (i === 3) throw err; } await new Promise((r) => setTimeout(r, 400 * 2 ** i)); } return res; };
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (new URL(req.url).pathname.includes('/assets/')) { e.respondWith(caches.match(req).then((hit) => hit || pull(req).then((res) => { keep(e, req, res); return res; }))); return; }
  const fresh = req.mode === 'navigate' ? fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }) : fetch(req, { cache: 'no-cache' });
  e.respondWith(fresh.then((res) => { keep(e, req, res); return res; })
    .catch(() => caches.match(req).then((hit) => hit || (req.mode === 'navigate' ? caches.match('./') : Response.error()))));
});
`);

// First load (P3, 13 Nov 2026): what a person's first visit must fetch before the first picture: the entry and every chunk it imports
// statically (all preloaded in the page's head), the style sheet, the picture and glyph data the head preloads and the fonts it preloads.
// Raw and gzip (GitHub Pages serves gzip). The target, under 1 MB of script and 150 KB of CSS as sent (gzip), is the ceiling the build holds
// (scripts/size-budget.json firstLoad; the raw ceilings sit just above today's and only come down): over one, a warning, and an error where
// BUILD_STRICT is set.
{
  const gz = (f) => gzipSync(readFileSync(join(OUT, f)), { level: 6 }).length;
  const sum = (list) => list.reduce((a, f) => ({ raw: a.raw + statSync(join(OUT, f)).size, gz: a.gz + gz(f) }), { raw: 0, gz: 0 });
  const script = sum([`assets/${appFile}`, ...staticChunks.map((c) => `assets/${c}`)]);
  const style = sum([`assets/${cssFile}`]);
  const data = sum(['organ-art', 'liver-geo-data', 'glyphs-inter', 'glyphs-inter-display', 'glyphs-inter-png', 'glyphs-inter-display-png'].filter((n) => dataOut.has(n)).map((n) => `assets/${dataOut.get(n)}`));
  const fonts = sum([interLatin, serifLatin, monoLatin].filter(Boolean).map((f) => `assets/${f}`));
  const k = (n) => (n / 1024).toFixed(0);
  const line = (what, v, n) => `${what.padEnd(24)} ${k(v.raw).padStart(6)} KB raw, ${k(v.gz).padStart(6)} KB gzip${n ? `  (${n})` : ''}`;
  const firstLoad = { script, style, data, fonts, modules: staticChunks.length + 1 };
  writeFileSync(join(OUT, 'first-load.json'), JSON.stringify(firstLoad));
  console.log('first load (before the first picture):');
  console.log('  ' + line('script', script, `${staticChunks.length + 1} files preloaded`));
  console.log('  ' + line('style sheet', style));
  console.log('  ' + line('picture + glyph data', data));
  console.log('  ' + line('fonts', fonts));
  const budget = JSON.parse(readFileSync(join(ROOT, 'scripts/size-budget.json'), 'utf8')).firstLoad;
  if (budget) {
    const over = [['script (raw KB)', script.raw / 1024, budget.scriptKB], ['script (gzip KB)', script.gz / 1024, budget.scriptGzKB], ['style sheet (raw KB)', style.raw / 1024, budget.cssKB],
      ['style sheet (gzip KB)', style.gz / 1024, budget.cssGzKB], ['preloaded files', staticChunks.length + 1, budget.preloads]].filter(([, v, max]) => max && v > max);
    for (const [what, v, max] of over) {
      const msg = `first load: ${what} is ${v.toFixed(0)}, over its ceiling of ${max} in scripts/size-budget.json (firstLoad): load it later, or lower something else first`;
      if (process.env.BUILD_STRICT) throw new Error(msg);
      console.warn(`::warning title=First load::${msg}`);
    }
  }
}

// Report.
const size = (f) => statSync(join(OUT, f)).size;
const kb = (n) => (n / 1024).toFixed(1).padStart(7) + ' KB';
const js = files.filter((f) => f.endsWith('.js'));
console.log('dist/');
for (const f of [...js, `assets/${cssFile}`]) console.log(kb(size(f)), f);
console.log(kb(files.reduce((a, f) => a + size(f), 0)), `total (${files.length} files)`);
