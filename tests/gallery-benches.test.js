// The gallery's debug benches (src/ui/gallery/benches/index.js): the list is the one list, every entry loads a module whose default export matches it,
// every bench is registered with the page, and the live app never imports any of it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { BENCHES } from '../src/ui/gallery/benches/index.js';
import { benchList, clashes } from '../src/ui/gallery/registry.js';
import { SPEEDS, describe, realSecondsPer } from '../src/ui/gallery/benches/slow-motion.js';

test('the bench list: unique lower-case ids, a group, a blurb, and a loader each', () => {
  assert.ok(BENCHES.length >= 9);
  assert.equal(new Set(BENCHES.map((b) => b.id)).size, BENCHES.length);
  for (const b of BENCHES) {
    assert.match(b.id, /^[a-z0-9][a-z0-9-]*$/);
    assert.ok(b.title && b.group && b.blurb, b.id);
    assert.equal(typeof b.load, 'function');
  }
});

test('every bench module loads and its default export is the bench the list names', async () => {
  for (const b of BENCHES) {
    const m = await b.load();
    assert.equal(m.default?.id, b.id, `${b.id}: default export id`);
    assert.equal(typeof m.default.mount, 'function', `${b.id}: mount`);
    assert.ok(m.default.title, `${b.id}: title`);
  }
});

test('every bench is registered with the page, once', () => {
  const ids = benchList().map((b) => b.id);
  for (const b of BENCHES) assert.ok(ids.includes(b.id), b.id);
  assert.deepEqual(clashes(), []);
});

test('the live app never imports the gallery (src outside src/ui/gallery, and index.html)', () => {
  const bad = [];
  const walk = (dir) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) { if (p.endsWith(join('src', 'ui', 'gallery'))) continue; walk(p); continue; }
      if (!/\.js$/.test(f)) continue;
      if (/gallery\/(benches|registry|plugins|page)/.test(readFileSync(p, 'utf8').replace(/\/\/.*$/gm, ''))) bad.push(p);
    }
  };
  walk('src');
  assert.deepEqual(bad.filter((p) => !/main\.js$/.test(p) && !/test-mode\.js$/.test(p) && !/packet[\/]gallery-panel\.js$/.test(p)), [], 'only the page loader (main.js, ?gallery on the preview) may name the gallery');
});

test('slow motion: the speeds are ordered fast to held, the words say what the clock does', () => {
  const sp = SPEEDS.map((s) => s.speed);
  assert.deepEqual(sp, [...sp].sort((a, b) => b - a));
  assert.equal(sp[0], 1); assert.equal(sp.at(-1), 0);
  assert.equal(realSecondsPer(0.25), '4 s');
  assert.equal(realSecondsPer(0.1), '10 s');
  assert.equal(realSecondsPer(0), 'held');
  assert.match(describe({ on: false }), /off/);
  assert.match(describe({ on: true, speed: 0 }), /Held/);
  assert.match(describe({ on: true, speed: 0.25 }), /0\.25.*4 s/);
});
