import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const gl = readFileSync(new URL('../src/ui/label-gl.js', import.meta.url), 'utf8');
const st = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');

test('step 1: pinned labels take a new offset at once (no glide, no held wait)', () => {
  for (const id of ['pinGlides', 'pinHeldNow', 'pinHeldFn', 'PIN_SNAP', 'pinWasHeld']) assert.ok(!gl.includes(id), `${id} is gone from label-gl.js`);
  assert.ok(!st.includes('pinHeldReady'));
});

test('step 1: a card zoom neither drifts nor settles, and the level of detail reads the rest camera', () => {
  const open = st.slice(st.indexOf('function zoomOpen()'), st.indexOf('function zoomAt('));
  assert.ok(!/driftEnd|drifting\s*=\s*true/.test(open));
  const end = st.slice(st.indexOf('function zoomEnd()'), st.indexOf('function followEnd()'));
  assert.ok(!/driftEnd|labelSettleSoon/.test(end));
  assert.ok(st.includes('d[7] = labelRestK() > 1.35'));
  assert.ok(/const zoomedIn = \(\) => labelRestK\(\)/.test(st));
});

test('step 1: no 260 ms settle timer', () => {
  assert.ok(!/setTimeout\(labelSettle/.test(st));
});

test('section 8: zone titles are not carried by a ride, and every zoom rule reads the rest camera', () => {
  assert.ok(/startsWith\('z:'\)\) a = 0/.test(gl));
  assert.ok(/function liverExpanded\(\) \{\s*const sel = store.get\(\).selection;\s*return labelRestK\(\) >= 1\.9/.test(st));
  assert.ok(st.includes('d[19] = labelRestK() >= 1.9'));
  assert.ok(st.includes('LABEL_REST_SLICE_MS = 8'));
});

test('step 3: figure labels carry a world anchor and label-gl pins by it', () => {
  assert.ok(st.includes('function localToWorldInto'));
  assert.ok(/pwv: gw || zn \? morph : null/.test(st));
  assert.ok(/NO_ANCHOR = \/\^\(z:\|lane:/.test(st));
  assert.ok(gl.includes('s.pwv != null'));
});

test('Circuit: no label hide for a zoom', () => {
  assert.ok(!st.includes("wrap.classList.add('pinch-hide')"));
});

test('view switch: the new view solve is finished in the frame the morph lands', () => {
  assert.ok(/camSettle\(\);\s*\/\/[^\n]*\n\s*if \(labelJob\) labelJobFinish\(\);/.test(st));
});

test('view switch: no hide, no rush, no wait for a draw: the old labels ride as ghosts and the new ones are already solved', () => {
  for (const w of ['morph-fade', 'afterDraw', 'morphFadeEnd', 'labelGL?.rush', 'labelGL.followStart']) assert.ok(!st.includes(w), w);
  assert.ok(st.includes('labelGL.freezeGhosts()') && st.includes('labelGL.crossfade('));
  assert.ok(!gl.includes('rushUntil') && !gl.includes('afterQ'));
});

test('view switch: only labels laid out for the shown view reach the GPU', () => {
  assert.ok(st.includes('b.pos.view === morphTarget'));
  assert.ok(/view: morphTarget, mA: null \}/.test(st));
  assert.ok(!st.includes('NO_LABELS'));
});

test('view switch: no landing-time rebuild; a picture of the other view is kept as the label\'s alternative', () => {
  assert.ok(!st.includes('invalidate?.()') && !gl.includes('invalidate() {'));
  assert.ok(gl.includes('st.alt') && gl.includes('dropGhosts'));
});

test('step 3b: zone titles are placed every frame by the GPU from their band', () => {
  assert.ok(st.includes('it._zone = [x0, x1, turned]'));
  assert.ok(st.includes('pz: !!zn'));
  assert.ok(gl.includes('s.pz && pinZoneAt'));
  assert.ok(gl.includes('if (pinned && PIN_HID) continue;'));
});
