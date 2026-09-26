// Production build: the same app as the repository root, bundled, minified and content-hashed.
//
// The repository root stays a working, build-free site (GitHub Pages serves it as is, and
// `npm start` runs it). This script writes an optimized copy to dist/ for hosts that can serve a
// build output, and for the SCORM package:
//
//   - one module graph per entry (the app, the engine worker), split so the command palette,
//     the figure plate and the presenter stay separate chunks loaded on first use;
//   - CSS (fonts, tokens, layout) in one minified, hashed file; fonts hashed;
//   - every file name carries its content hash, so caches can keep them forever;
//   - a service worker that precaches the whole app for offline use.
//
//   node scripts/build.mjs      → dist/

import { build } from 'esbuild';
import { readFileSync, writeFileSync, rmSync, mkdirSync, cpSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, resolve, relative, basename, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'dist');
const ASSETS = join(OUT, 'assets');
const sha = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 10);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(ASSETS, { recursive: true });

// Source imports carry cache stamps (./x.js?v=hash); in a bundle they are just files.
const stripStamps = {
  name: 'strip-stamps',
  setup(b) {
    b.onResolve({ filter: /\?v=/ }, (args) => ({ path: resolve(args.resolveDir, args.path.replace(/\?v=[0-9a-f]+$/, '')) }));
  },
};
const common = { bundle: true, format: 'esm', minify: true, target: ['es2022'], legalComments: 'none', logLevel: 'warning', plugins: [stripStamps] };

// 1. The engine worker, as one self-contained module.
const worker = await build({ ...common, entryPoints: [join(ROOT, 'src/worker.js')], outdir: ASSETS, entryNames: 'worker-[hash]', write: true, metafile: true });
const workerFile = basename(Object.keys(worker.metafile.outputs).find((f) => f.endsWith('.js')));

// 2. The app. host.js points the Worker at the bundled worker file.
const workerUrl = {
  name: 'worker-url',
  setup(b) {
    b.onLoad({ filter: /[\\/]src[\\/]ui[\\/]host\.js$/ }, (args) => ({
      contents: readFileSync(args.path, 'utf8').replace(/new URL\('\.\.\/worker\.js(\?v=[0-9a-f]+)?', import\.meta\.url\)/, `new URL('./${workerFile}', import.meta.url)`),
      loader: 'js',
    }));
  },
};
const app = await build({ ...common, plugins: [stripStamps, workerUrl], entryPoints: [join(ROOT, 'src/ui/main.js')], outdir: ASSETS, splitting: true, entryNames: 'app-[hash]', chunkNames: 'chunk-[hash]', write: true, metafile: true });
const appFile = basename(Object.keys(app.metafile.outputs).find((f) => app.metafile.outputs[f].entryPoint));
// Chunks the entry imports statically: preload them alongside it.
const appOut = Object.entries(app.metafile.outputs).find(([, o]) => o.entryPoint)[1];
const staticChunks = appOut.imports.filter((i) => i.kind === 'import-statement').map((i) => basename(i.path));

// 3. Styles: fonts, tokens and layout in one file; fonts get hashed names.
const cssEntry = join(OUT, '_entry.css');
writeFileSync(cssEntry, ['fonts/fonts.css', 'styles/tokens.css', 'styles/app.css'].map((f) => `@import "${relative(OUT, join(ROOT, f)).split(sep).join('/')}";`).join('\n'));
const css = await build({ ...common, plugins: [], entryPoints: [cssEntry], outdir: ASSETS, entryNames: 'app-[hash]', assetNames: '[name]-[hash]', loader: { '.woff2': 'file' }, write: true, metafile: true });
rmSync(cssEntry);
const cssFile = basename(Object.keys(css.metafile.outputs).find((f) => f.endsWith('.css')));
const fontFiles = Object.keys(css.metafile.outputs).filter((f) => f.endsWith('.woff2')).map((f) => basename(f));
const interLatin = fontFiles.find((f) => f.startsWith('inter-latin-') && !f.startsWith('inter-latin-ext'));

// 4. Static files.
for (const d of ['brand']) cpSync(join(ROOT, d), join(OUT, d), { recursive: true });
cpSync(join(ROOT, 'manifest.webmanifest'), join(OUT, 'manifest.webmanifest'));

// 5. index.html: the source page with its local styles, preloads and entry swapped for the build.
let html = readFileSync(join(ROOT, 'index.html'), 'utf8');
html = html
  .replace(/\s*<link rel="preload" href="fonts\/[^"]+"[^>]*>/, '')
  .replace(/\s*<link rel="stylesheet" href="(?:fonts|styles)\/[^"]+" \/>/g, '')
  .replace(/\s*<link rel="modulepreload" href="src\/[^"]+" \/>/g, '')
  .replace(/\s*<script type="module" src="src\/ui\/main\.js[^"]*"><\/script>/, '');
const head = [
  interLatin ? `<link rel="preload" href="assets/${interLatin}" as="font" type="font/woff2" crossorigin />` : '',
  `<link rel="stylesheet" href="assets/${cssFile}" />`,
  ...staticChunks.map((c) => `<link rel="modulepreload" href="assets/${c}" />`),
  `<script type="module" src="assets/${appFile}"></script>`,
].filter(Boolean).map((l) => '  ' + l).join('\n');
html = html.replace('</head>', `${head}\n</head>`);
writeFileSync(join(OUT, 'index.html'), html);

// 6. Service worker: precache everything; hashed assets never change, so cache-first is safe.
const walk = (p) => (statSync(p).isDirectory() ? readdirSync(p).flatMap((f) => walk(join(p, f))) : [p]);
const files = walk(OUT).map((p) => relative(OUT, p).split(sep).join('/')).filter((f) => f !== 'sw.js').sort();
const version = sha(files.map((f) => f + ':' + sha(readFileSync(join(OUT, f)))).join('\n'));
writeFileSync(join(OUT, 'sw.js'), `// Generated by scripts/build.mjs. Precaches the whole app; hashed assets are cache-first.
const CACHE = 'pps-${version}';
const FILES = ${JSON.stringify(['./', ...files])};
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (new URL(req.url).pathname.includes('/assets/')) { e.respondWith(caches.match(req).then((hit) => hit || fetch(req))); return; }
  e.respondWith(fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return res; })
    .catch(() => caches.match(req).then((hit) => hit || (req.mode === 'navigate' ? caches.match('./') : Response.error()))));
});
`);

// Report.
const size = (f) => statSync(join(OUT, f)).size;
const kb = (n) => (n / 1024).toFixed(1).padStart(7) + ' KB';
const js = files.filter((f) => f.endsWith('.js'));
console.log('dist/');
for (const f of [...js, `assets/${cssFile}`]) console.log(kb(size(f)), f);
console.log(kb(files.reduce((a, f) => a + size(f), 0)), `total (${files.length} files)`);
