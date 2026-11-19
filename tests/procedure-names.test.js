// One table of procedure names (src/ui/procedure-names.js): the Treat › Procedures buttons, the play buttons of the Tests card, the palette, the timeline
// and the circuit all take their words from it (Mohammad, 16 Nov 2026: "Band (EVL)" everywhere; BRTO, DIPS and the rest spelled out; Warren shunt → distal
// splenorenal shunt (DSRS) for US physicians).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import './dom-shim.js';
import { PROCEDURES, procLabel, procLong, procPlay } from '../src/ui/procedure-names.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const walk = (d) => readdirSync(join(ROOT, d)).flatMap((f) => (statSync(join(ROOT, d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

test('every procedure has a short label and a full name that says what the letters stand for', () => {
  assert.equal(procLabel('band'), 'Band (EVL)');
  assert.equal(procLabel('dsrs'), 'Distal splenorenal shunt (DSRS)');
  for (const [id, p] of Object.entries(PROCEDURES)) assert.ok(p.label && p.long.length > p.label.length - 1, id);
  for (const id of ['tips', 'dips', 'brto', 'bato']) assert.match(procLong(id), new RegExp(`\\(${id.toUpperCase()}\\)$`), `${id} is spelled out`);
  assert.match(procLong('brto'), /Balloon-occluded retrograde transvenous obliteration/);
  assert.match(procLong('dips'), /Direct intrahepatic portosystemic shunt/);
  assert.match(procPlay('tips'), /^Play transjugular intrahepatic portosystemic shunt/);
});

test('the Tests card plays every procedure of the animation with its full name', async () => {
  const { PROC_KINDS } = await import('../src/ui/proc-anim.js');
  for (const k of PROC_KINDS) assert.ok(PROCEDURES[k], `${k} is in the table`);
  assert.match(read('src/ui/hvpg-proc.js'), /'aria-label': procPlay\(k\)/);
});

test('Treat › Procedures, the palette, the timeline and the circuit take the names from the table', () => {
  const chart = code(read('src/ui/chart.js'));
  for (const id of ['band', 'balloon', 'tips', 'dips', 'brto', 'paracentesis']) assert.match(chart, new RegExp(`proc\\('[a-z]+', '${id}'`), `Treat has ${id} by its id`);
  assert.ok(!/'Band ligation'/.test(chart + code(read('src/ui/palette.js')) + code(read('src/ui/main.js'))), 'no second spelling of Band (EVL)');
  assert.match(code(read('src/engine/topology.js')), new RegExp(`label: '${procLabel('dsrs').replace(/[()]/g, '\\$&')}'`), 'the circuit names the shunt as the table does');
});

test('nothing the learner reads calls the distal splenorenal shunt the Warren shunt, but the table that explains the alias', () => {
  const allowed = new Set(['src/ui/procedure-names.js']);
  for (const f of [...walk('src').filter((p) => p.endsWith('.js'))].map((p) => p.replaceAll('\\', '/'))) {
    if (allowed.has(f) || f.startsWith('src/ui/snapshots')) continue;
    const t = code(read(f));
    assert.ok(!/Warren/.test(t), `${f} still says "Warren" in a string`);
  }
});
