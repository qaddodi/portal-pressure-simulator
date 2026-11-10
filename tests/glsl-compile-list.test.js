// The shader compile check's list (scripts/glsl-compile-list.mjs, brief S0-K): it builds, and every program it names has real GLSL ES 3.00
// text. The browser run (scripts/glsl-compile.mjs) is not part of this test, lint, CI or any workflow: this judges only what node can.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { programs } = await import('../scripts/glsl-compile-list.mjs');
const { numbered } = await import('../scripts/glsl-compile.mjs');

test('the list builds, with no entry whose strings could not be made', () => {
  const list = programs();
  assert.ok(list.length >= 6, 'the known-good programs are named');
  for (const p of list) assert.equal(p.error, undefined, `${p.name}: ${p.error}`);
});

test('every entry has non-empty #version 300 es text, and names are unique', () => {
  const list = programs();
  const names = new Set();
  for (const p of list) {
    assert.ok(!names.has(p.name), `${p.name} is listed twice`);
    names.add(p.name);
    assert.equal(typeof p.fs, 'string', `${p.name}: fs`);
    // 30, not 100: the depth prepass fragment shader is four lines (version, precision, an empty main).
    assert.ok(p.fs.startsWith('#version 300 es') && p.fs.length > 30, `${p.name}: fs is #version 300 es text`);
    if (p.vs === null) assert.ok(p.note && p.note.includes('fragment only'), `${p.name}: a missing vertex shader says why`);
    else assert.ok(p.vs.startsWith('#version 300 es') && p.vs.length > 50, `${p.name}: vs is #version 300 es text`);
  }
});

test('the list names the stage 1 programs the devices already run', () => {
  const names = programs().map((p) => p.name);
  for (const w of ['mesh strip', 'mesh patch', 'tube strip', 'tube patch', 'COMP_FS()']) assert.ok(names.some((n) => n.includes(w)), `${w} is in the list`);
});

test('numbered() shows the failing line of a shader log with its neighbours', () => {
  const src = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].join('\n');
  const out = numbered(src, "ERROR: 0:4: 'x' : undeclared identifier");
  assert.match(out, />>\s+4 \| d/);
  assert.match(out, /\s2 \| b/);
  assert.match(out, /\s6 \| f/);
  assert.ok(!/\s7 \| g/.test(out));
  assert.equal(numbered(src, 'no line numbers here'), '');
});
