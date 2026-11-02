// Preview c3fb93ed: a bad conflict resolution emptied src/ui/glass-gl.js, esbuild only warned ("Import will always be undefined"), the
// bundle held `(void 0)(wrap, vCanvas, ...)` and the simulator did not start ("(void 0) is not a function") on the owner's iPhone.
// The source import check passed it through nowhere, so this bundles the real entry as the build does and refuses that warning.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const undefinedImports = async (entry) => {
  const r = await build({
    entryPoints: [entry], bundle: true, format: 'esm', write: false, logLevel: 'silent', splitting: true, outdir: join(tmpdir(), 'pps-undef'),
    plugins: [{ name: 'strip-stamps', setup(b) { b.onResolve({ filter: /\?v=/ }, (a) => ({ path: resolve(a.resolveDir, a.path.replace(/\?v=[0-9a-f]+$/, '')) })); } }],
    loader: { '.woff2': 'empty', '.png': 'empty', '.json': 'json' },
  });
  return r.warnings.filter((w) => w.id === 'import-is-undefined').map((w) => `${w.location?.file}:${w.location?.line} ${w.text}`);
};

test('the app bundles with no import that can only be undefined', async () => {
  assert.deepEqual(await undefinedImports(join(ROOT, 'src/ui/main.js')), []);
});

test('the check catches an emptied module (the (void 0) boot failure)', async () => {
  const d = mkdtempSync(join(tmpdir(), 'pps-fx-'));
  try {
    writeFileSync(join(d, 'a.js'), "import { createGlassGL } from './b.js';\ncreateGlassGL();\n");
    writeFileSync(join(d, 'b.js'), '');
    const bad = await undefinedImports(join(d, 'a.js'));
    assert.equal(bad.length, 1);
    assert.match(bad[0], /createGlassGL/);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('no source file is empty (a failed merge leaves one blank and every import of it becomes undefined)', async () => {
  const { readdirSync, readFileSync, statSync } = await import('node:fs');
  const empty = [];
  const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (/\.m?js$/.test(n) && !readFileSync(p, 'utf8').trim()) empty.push(p.slice(ROOT.length + 1)); } };
  walk(join(ROOT, 'src'));
  assert.deepEqual(empty, []);
});
