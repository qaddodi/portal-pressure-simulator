import { stageSource } from './stage-src.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const gl = readFileSync(new URL('../src/ui/label-gl.js', import.meta.url), 'utf8');
const st = stageSource();

test('step 1: pinned labels take a new offset at once (no glide, no held wait)', () => {
  for (const id of ['pinGlides', 'pinHeldNow', 'pinHeldFn', 'PIN_SNAP', 'pinWasHeld']) assert.ok(!gl.includes(id), `${id} is gone from label-gl.js`);
  assert.ok(!st.includes('pinHeldReady'));
});

test('step 1: a card zoom neither drifts nor settles, and the level of detail reads the rest camera', () => {
  const open = st.slice(st.indexOf('function zoomOpen()'), st.indexOf('function sceneStart('));
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
  assert.ok(/pwv: gw \? it\.aWv : null/.test(st) && /it\.aWv = live\.morph/.test(st), 'the world anchor and its view taken in the layout frame (stampAnchor)');
  assert.ok(/NO_ANCHOR = \/\^\(lane:/.test(st));
  assert.ok(gl.includes('s.pwv != null'));
});

test('Circuit: no label hide for a zoom', () => {
  assert.ok(!st.includes("wrap.classList.add('pinch-hide')"));
});

test('view switch: no hide, no rush, no wait for a draw: the old labels ride as ghosts and the new ones are already solved', () => {
  for (const w of ['morph-fade', 'afterDraw', 'morphFadeEnd', 'labelGL?.rush', 'labelGL.followStart']) assert.ok(!st.includes(w), w);
  assert.ok(st.includes('labelGL.freezeGhosts()') && st.includes('labelGL.crossfade('));
  assert.ok(!gl.includes('rushUntil') && !gl.includes('afterQ'));
});

test('view switch: only labels laid out for the shown view reach the GPU', () => {
  assert.ok(st.includes('b.pos.view === morphTarget'));
  assert.ok(/view: it\.aView, mA: null[ ,]/.test(st) && /it\.aView = live\.morphTarget/.test(st));
  assert.ok(!st.includes('NO_LABELS'));
});

test('view switch: no landing-time rebuild; a picture of the other view is kept as the label\'s alternative', () => {
  assert.ok(!st.includes('invalidate?.()') && !gl.includes('invalidate() {'));
  assert.ok(gl.includes('st.alt') && gl.includes('dropGhosts'));
});

test('step 2 (option C): a zone title is a world-anchored figure label, not placed per frame', () => {
  assert.ok(!st.includes('it._zone') && !st.includes('pz: !!zn') && !gl.includes('pinZoneAt'));
  assert.ok(!/NO_ANCHOR = \/\^\(z:/.test(st));
  assert.ok(!/const zoneAt = \(x, y\) => \{ it\.live/.test(st));
});

test('step 7 (option C): a zone title is set over the visible part of its band and keeps its place while it fits', () => {
  assert.ok(st.includes('const zoneKeep = ') && st.includes('const zoneStick = new Map()'));
  assert.ok(/const span = v1 - v0;/.test(st));
});

test('crowded labels: abbreviate first, never cover a vessel (Mohammad, 4 Nov)', () => {
  assert.ok(/best\.onLine > 0 && it\.key\.startsWith\('n:'\) && !it\.sel && !st\.presenting && !\(it\.node === 'HA' && it\.abbr\)\) best = null/.test(st));
  const an = readFileSync(new URL('../src/ui/anatomy.js', import.meta.url), 'utf8');
  for (const k of ['HA', 'CONF', 'RPV', 'LPV', 'SV', 'RHV', 'MHV', 'LHV']) assert.ok(new RegExp(`\\b${k}: '`).test(an.slice(an.indexOf('export const ABBR'))));
});

test('the hepatic artery label abbreviates to HA only when crowded', () => {
  assert.ok(st.includes("(!!pr || id === 'HA') && mode !== 'atlas'"));
  assert.ok(!st.includes("id === 'HA' ? 'HA' : (SHORT[id] || id)"));
});
