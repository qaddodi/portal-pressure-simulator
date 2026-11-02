// Bug sweep, 2 Nov 2026: e3946da6 stopped exporting MAY_ON from frame.js while main.js still imported it, and the page did not start
// at all (fixed in 4110daaf); lint and the unit tests were green. Every named import between the app's own modules must name an export
// the module has, and every relative module imported must exist.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = [];
const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (/\.m?js$/.test(n)) files.push(p); } };
walk(join(ROOT, 'src'));

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\'"`])\/\/.*$/gm, '$1');
const exportsOf = new Map();
function namesOf(file) {
  if (exportsOf.has(file)) return exportsOf.get(file);
  const s = strip(readFileSync(file, 'utf8')), names = new Set();
  for (const m of s.matchAll(/export\s+(?:async\s+)?(?:const|let|var|function\*?|class)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  // (export const a = 1, b = 2: every name declared at that statement's top level)
  for (const m of s.matchAll(/export\s+(?:const|let|var)\s+([^;]*?)(?:;|\n\S)/g)) for (const n of m[1].matchAll(/(?:^|,)\s*([A-Za-z_$][\w$]*)\s*=/g)) names.add(n[1]);
  for (const m of s.matchAll(/export\s*\{([^}]*)\}/g)) for (const part of m[1].split(',')) { const n = part.trim().split(/\s+as\s+/).pop().trim(); if (n) names.add(n); }
  if (/export\s+default\b/.test(s)) names.add('default');
  const star = [...s.matchAll(/export\s*\*\s*from\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
  const out = { names, star, file };
  exportsOf.set(file, out);
  return out;
}
const has = (file, name, seen = new Set()) => {
  if (seen.has(file)) return false; seen.add(file);
  const e = namesOf(file);
  if (e.names.has(name)) return true;
  return e.star.some((sp) => has(resolve(dirname(file), sp.split('?')[0]), name, seen));
};

test('every named import between the app\'s modules names an export that module has', () => {
  const bad = [];
  for (const f of files) {
    const s = strip(readFileSync(f, 'utf8'));
    for (const m of s.matchAll(/import\s*(?:([A-Za-z_$][\w$]*)\s*,?\s*)?(?:\{([^}]*)\})?\s*from\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
      const target = resolve(dirname(f), m[3].split('?')[0]);
      if (!existsSync(target)) { bad.push(`${relative(ROOT, f)}: ${m[3]} does not exist`); continue; }
      if (!/\.m?js$/.test(target)) continue;
      if (m[1] && !has(target, 'default')) bad.push(`${relative(ROOT, f)}: no default export in ${m[3]}`);
      for (const part of (m[2] || '').split(',')) {
        const name = part.trim().split(/\s+as\s+/)[0].trim();
        if (name && !has(target, name)) bad.push(`${relative(ROOT, f)}: ${name} is not exported by ${m[3].split('?')[0]}`);
      }
    }
  }
  assert.deepEqual(bad, []);
});

test('the check catches a missing export (the MAY_ON boot failure)', () => {
  assert.ok(has(join(ROOT, 'src/ui/frame.js'), 'mayTask'));
  assert.ok(!has(join(ROOT, 'src/ui/frame.js'), 'MAY_ON_NOT_A_NAME'));
});
