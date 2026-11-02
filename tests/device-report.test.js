import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The device report's text (src/ui/device-report.js reportText): pure, so it is fed numbers here.
const { reportText } = await import('../src/ui/device-report.js');

test('device report: a clean minute reads zero on the three must lines', () => {
  const t = reportText({ gaps: [8.3, 8.4, 8.3], scripts: [1, 1.2, 0.9], overruns: [], shed: {}, aged: 0, reads: { read: 4, task: 2, early: 0, late: 0, final: 0, afterWrites: 0 }, header: ['Build: test'] });
  assert.match(t, /^Device report\nBuild: test/);
  assert.match(t, /shedStats\(\)\.byTag\): none: zero: passes/);
  assert.match(t, /mayStats\(\)\.aged\): 0: zero: passes/);
  assert.match(t, /afterWrites\): 0: zero: passes/);
  assert.match(t, /Missed: 0 over 1\.5/);
  assert.match(t, /Tier changes: none/);
});

test('device report: carried work, aged tasks and reads after writes fail by name', () => {
  const t = reportText({ gaps: [8.3, 20, 30], scripts: [1, 5, 9], overruns: [], shed: { labels: 3, glass: 7 }, aged: 2, reads: { read: 0, task: 0, early: 1, late: 2, final: 0, afterWrites: 3 }, tiers: [{ at: 1500, from: 0, to: 1, why: 'slow' }], t0: 0 });
  assert.match(t, /glass 7, labels 3: NOT zero: fails/);
  assert.match(t, /aged\): 2: NOT zero: fails/);
  assert.match(t, /afterWrites\): 3: NOT zero: fails/);
  assert.match(t, /Missed: 2 over 1\.5 × the frame, 2 over 2 ×/);
  assert.match(t, /1\.5 s 0→1 \(slow\)/);
});

test('device report: one tap in the Help menu, no new switch', () => {
  const src = readFileSync(new URL('../src/ui/main.js', import.meta.url), 'utf8');
  assert.match(src, /menuItem\(reportStop \? 'Device report: finish now' : 'Device report'/);
  assert.doesNotMatch(readFileSync(new URL('../src/ui/device-report.js', import.meta.url), 'utf8'), /location\.search/);
});
