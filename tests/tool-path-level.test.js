import './dom-shim.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { treeLeadExtra } from '../src/ui/tool-path.js';

// Stiffness 9, Rule of five (19 Nov 2026, play-test): "LSM <15 and platelets ≥150" wrapped to two lines and left "CSPH excluded" 15 px under "CSPH presumed" and "Not settled".
const tree = { id: 'root', kids: [{ id: 'in' }, { id: 'gray' }, { id: 'out' }] };
const boxes = new Map(['root', 'in', 'gray', 'out'].map((id) => [id, { w: 120 }]));
const paras = (id) => (id === 'root' ? [[{ text: 'root', face: 'r' }]] : [[{ text: id, face: 't' }], [{ text: 'verdict', face: 'r' }]]);

test('each row\'s conditions take the room of the tallest, so the verdicts under them stand level', () => {
  const lines = { in: 1, gray: 1, out: 2 };
  const ex = treeLeadExtra(tree, boxes, paras, (ps) => lines[ps[0][0].text] * 15);
  assert.equal(ex.get('out'), 0, 'the tallest takes nothing');
  assert.equal(ex.get('in'), 15); assert.equal(ex.get('gray'), 15);
  assert.equal(ex.has('root'), false, 'a root with no verdict under its words is left as it is');
  for (const id of ['in', 'gray', 'out']) assert.equal(lines[id] * 15 + ex.get(id), 30, `${id}'s verdict starts at the row's one line`);
});

test('a row whose conditions are all one line adds nothing', () => {
  const ex = treeLeadExtra(tree, boxes, paras, () => 15);
  for (const v of ex.values()) assert.equal(v, 0);
});
