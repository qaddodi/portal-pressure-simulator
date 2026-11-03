// The pre-push gate's static checks (scripts/gate-static.mjs) catch the breaks they exist for.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { markersIn, checkBundle } from '../scripts/gate-static.mjs';

const MARK = ['<'.repeat(7) + ' HEAD', 'a', '='.repeat(7), 'b', '>'.repeat(7) + ' branch'].join('\n');

test('a conflict marker is found in code, and in prose only when it names a branch', () => {
  assert.equal(markersIn('src/a.js', MARK).length, 3);
  assert.equal(markersIn('docs/a.md', MARK).length, 2);
  assert.equal(markersIn('docs/a.md', 'Title\n' + '='.repeat(7) + '\ntext').length, 0);
  assert.equal(markersIn('src/a.js', 'const a = "<<<<<<<";').length, 0);
  assert.equal(markersIn('logo.png', MARK).length, 0);
});

test('the bundle check fails on a missing export, a missing file and a syntax error, and passes on a sound app', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gate-bundle-'));
  try {
    mkdirSync(join(dir, 'src/ui'), { recursive: true });
    writeFileSync(join(dir, 'src/worker.js'), 'export const w = 1;\n');
    writeFileSync(join(dir, 'src/ui/frame.js'), 'export const mayTask = () => 1;\n');
    writeFileSync(join(dir, 'src/ui/main.js'), "import { mayTask } from './frame.js?v=0123456789';\nmayTask();\n");
    assert.deepEqual(await checkBundle(dir), []);
    writeFileSync(join(dir, 'src/ui/main.js'), "import { MAY_ON } from './frame.js';\nconsole.log(MAY_ON);\n");
    assert.match((await checkBundle(dir)).map((p) => p.text).join('\n'), /MAY_ON/);
    writeFileSync(join(dir, 'src/ui/main.js'), "import './gone.js';\n");
    assert.match((await checkBundle(dir)).map((p) => p.text).join('\n'), /resolve/i);
    writeFileSync(join(dir, 'src/ui/main.js'), 'const = ;\n');
    assert.ok((await checkBundle(dir)).length > 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
