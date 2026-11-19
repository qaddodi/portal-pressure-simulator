// The parity inventory (scripts/parity-inventory.mjs, plan /mnt/project-files/rebuild-3d/parity-plan.md section 2): the one file the 3D rebuild counts itself against.
// It must run, cover every deck and slide, and give every row a unique id and a batch. A change to the app that moves a row needs no edit here.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DECKS } from '../src/ui/decks.js';
import { PRESETS } from '../src/engine/portal/scenario.js';

const dir = mkdtempSync(join(tmpdir(), 'inv-'));
const out = join(dir, 'inventory.json');
const r = spawnSync(process.execPath, ['scripts/parity-inventory.mjs', '--out', out], { encoding: 'utf8' });
test.after(() => rmSync(dir, { recursive: true, force: true }));

test('the inventory script runs and writes the file', () => { assert.equal(r.status, 0, r.stderr); });

test('it names every deck, slide and patient the app has', () => {
  const inv = JSON.parse(readFileSync(out, 'utf8'));
  assert.equal(inv.decks.length, DECKS.length);
  assert.equal(inv.counts.slides, DECKS.reduce((n, d) => n + d.slides.length, 0));
  assert.equal(inv.presets.length, PRESETS.length);
  assert.equal(inv.rows.filter((x) => x.area === 'deck').length, DECKS.length);
  assert.equal(inv.rows.filter((x) => x.area === 'slide').length, inv.counts.slides);
});

test('every row has a unique id and a batch, and the shell sections are not empty', () => {
  const inv = JSON.parse(readFileSync(out, 'utf8'));
  const ids = new Set();
  for (const row of inv.rows) {
    assert.match(row.batch, /^B\d+$/, row.id);
    assert.ok(!ids.has(row.id), `duplicate row id ${row.id}`);
    ids.add(row.id);
  }
  for (const area of ['topbar', 'view', 'zoom', 'playbar', 'settings', 'help', 'shortcut', 'search', 'platform', 'look']) assert.ok(inv.rows.some((x) => x.area === area), `no ${area} rows`);
  assert.ok(inv.shell.settings.some((s) => s.label === 'Blur effect'), 'Settings › Blur effect is read from the app');
  assert.ok(inv.shell.shortcuts.some((s) => s.keys === 'Space'), 'the Space key is read from the guide');
});
