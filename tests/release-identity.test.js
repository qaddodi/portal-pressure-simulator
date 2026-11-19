// One release identity per checkout (SHL-3, 19 Nov 2026): a field report can be tied to the build it came from, the stack names a column,
// and the console handle keeps what the modules put there before main.js filled it.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { releaseName } from '../scripts/release-name.mjs';
import { extendHandle } from '../src/ui/pps-handle.js';
import { whereFrom } from '../src/ui/report.js';

const gitOf = (answers) => (a) => answers[a.split(' ')[0]] ?? '';
const HEAD = 'ff9c75dfe0000000000000000000000000000000';

test('the release names this checkout\'s own commit, even when GITHUB_SHA names another', () => {
  const git = gitOf({ describe: 'v2026.11.3', 'rev-parse': HEAD });
  assert.equal(releaseName(git, { GITHUB_SHA: '1234567890abcdef' }), 'v2026.11.3 · ff9c75df');
});
test('PPS_RELEASE overrides; a checkout without git or tags still says something true', () => {
  assert.equal(releaseName(gitOf({}), { PPS_RELEASE: 'v2026.11.9 · aabbccdd' }), 'v2026.11.9 · aabbccdd');
  assert.equal(releaseName(gitOf({ 'rev-parse': HEAD }), {}), 'ff9c75df', 'no tag: the commit alone');
  assert.equal(releaseName(gitOf({}), {}), 'build');
});

test('an error report names the file, the line AND the column, then up to two more frames (a minified chunk is one line)', () => {
  const e = { stack: ['Error: boom', '    at f (https://x.github.io/portal/assets/chunk-AB12.js:1:48213)', '    at https://x.github.io/portal/assets/main-ZZ99.js:1:911', '    at g (https://x.github.io/portal/assets/chunk-CD34.js?r=5:2:7)', '    at h (https://x.github.io/portal/assets/chunk-EE55.js:9:9)'].join('\n') };
  assert.equal(whereFrom(e), 'chunk-AB12.js:1:48213 < main-ZZ99.js:1:911 < chunk-CD34.js:2:7');
  assert.equal(whereFrom('not an error'), '');
  assert.equal(whereFrom(undefined), '');
  assert.equal(whereFrom({ stack: 'Error: x\n    at <anonymous>' }), '');
});

test('filling window.pps keeps pps.report and pps.contexts from before, and a getter stays lazy', () => {
  let reads = 0;
  const handle = { report: () => ['a line'], contexts: () => 3, caught: () => ({}) };
  extendHandle(handle, { store: 'S', get perf() { reads++; return 'P'; }, caught: () => ({ n: 1 }) });
  assert.equal(handle.report()[0], 'a line');
  assert.equal(handle.contexts(), 3);
  assert.equal(handle.store, 'S');
  assert.equal(reads, 0, 'the getter was not called while filling the handle');
  assert.equal(handle.perf, 'P');
  assert.equal(reads, 1);
  assert.deepEqual(handle.caught(), { n: 1 }, 'a name the new props give wins');
});
