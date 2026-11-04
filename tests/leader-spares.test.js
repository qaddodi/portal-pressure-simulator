import { stageSource } from './stage-src.js';
// A leader that finds no blank line or dot made ahead asks for the labels to be laid out again once the blanks are made: with the
// figure still, nothing else lays them out, and the circuit's leaders never came in (2 Nov 2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const st = stageSource();

test('a leader left without a blank marks the shortfall, and the refill lays the labels out again', () => {
  assert.match(st, /if \(!el\) \{ el = leadTake\(w\.tag\); if \(!el\) \{ leadShort = true; if \(!leadFill\) leadFill = restPass\(leadTop\); continue; \}/);
  assert.match(st, /if \(leadShort\) \{ leadShort = false; nextFrame\(\(\) => \{ if \(F\) updateLabels\(F, true\); \}\); \}/);
});
