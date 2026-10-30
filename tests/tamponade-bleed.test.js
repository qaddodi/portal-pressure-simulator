// A tamponade balloon that is up over the tear stops the bleed: the model ends it a moment after the balloon is on (engine.js
// BALLOON_SEAL_S), and the figure and the scope ease the spray out as the balloon on screen fills. The balloon slide of the bleed talk
// (variceal-bleed/bridge) frames the balloon and the varix closely.
import './dom-shim.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Engine, BALLOON_SEAL_S } from '../src/engine/engine.js';
import { BALLOON, BALLOON_MS, esoAt } from '../src/ui/balloon-eso.js';
import { BLEED } from '../src/ui/decks/variceal-bleed.js';
import { REGIONS } from '../src/ui/decks.js';
import { slideTargets } from '../src/ui/presenter.js';
import { anchorsOf, missed, roomFor } from '../src/ui/cam-room.js';
import { SITES } from '../src/ui/anatomy.js';

const patient = (id = 'cirr-decomp') => { const e = new Engine(); e.loadPreset(id); return e; };
const run = (e, secs) => { for (let i = 0; i < Math.round(secs * 10); i++) e.step(0.1); };
const events = (e) => e.eventLog.filter((x) => x.id === 'BLEED_STOPPED');

test('the seal outlasts the balloon going in and filling on screen, and not by much', () => {
  const fill = (BALLOON_MS.adv + BALLOON_MS.inflate) / 1000;
  assert.ok(BALLOON_SEAL_S > fill, `seal ${BALLOON_SEAL_S} s against ${fill} s on screen`);
  assert.ok(BALLOON_SEAL_S < fill + 1.5, 'the bleed does not go on long after the balloon is up');
});

test('an esophageal balloon stops an esophageal bleed once it has had time to go in and fill, and the bleed does not flow meanwhile', () => {
  const e = patient();
  e.rupture('VAR', 0.6);
  run(e, 10);
  assert.ok(e.bleed.active && e.Qbleed > 0, 'bleeding before the balloon');
  e.setParams({ ...e.params, balloonEso: true });
  run(e, BALLOON_SEAL_S - 0.5);
  assert.ok(e.bleed.active, 'still open while the balloon goes in');
  assert.equal(e.Qbleed, 0, 'no blood flows once the balloon presses');
  run(e, 1);
  assert.ok(!e.bleed.active, 'stopped once the balloon is up');
  const stopped = events(e);
  assert.equal(stopped.length, 1);
  assert.match(stopped[0].title, /balloon/);
  assert.equal(stopped[0].anchor, 'VAR');
});

test('a balloon let down before it has sealed starts the count again', () => {
  const e = patient();
  e.rupture('VAR', 0.6);
  e.setParams({ ...e.params, balloonEso: true });
  run(e, BALLOON_SEAL_S - 1);
  e.setParams({ ...e.params, balloonEso: false });
  run(e, 2);
  assert.ok(e.bleed.active, 'open again, nothing has sealed it');
  assert.equal(e.bleed.press, 0);
  e.setParams({ ...e.params, balloonEso: true });
  run(e, BALLOON_SEAL_S - 1);
  assert.ok(e.bleed.active, 'the earlier seconds do not count');
  run(e, 2);
  assert.ok(!e.bleed.active);
});

test('the other balloon does not press on this tear', () => {
  const eso = patient();
  eso.rupture('VAR', 0.6);
  eso.setParams({ ...eso.params, balloonGas: true });
  run(eso, BALLOON_SEAL_S + 2);
  assert.ok(eso.bleed.active, 'a gastric balloon leaves an esophageal tear open');
  const gv = patient('gastric-varix');
  gv.rupture('GV', 0.6);
  gv.setParams({ ...gv.params, balloonEso: true });
  run(gv, BALLOON_SEAL_S + 2);
  assert.ok(gv.bleed.active, 'an esophageal balloon leaves a gastric tear open');
});

test('a gastric balloon stops a gastric bleed the same way, and the event points at the gastric varices', () => {
  const e = patient('gastric-varix');
  e.rupture('GV', 0.6);
  run(e, 5);
  assert.ok(e.bleed.active && e.Qbleed > 0, 'bleeding before the balloon');
  e.setParams({ ...e.params, balloonGas: true });
  run(e, BALLOON_SEAL_S + 1);
  assert.equal(e.Qbleed, 0);
  assert.ok(!e.bleed.active);
  assert.equal(events(e)[0].anchor, 'GV');
});

test('banding and the clot still stop a bleed their own way, with no balloon', () => {
  const band = patient();
  band.rupture('VAR', 0.6);
  band.band();
  assert.ok(!band.bleed.active);
  assert.match(events(band)[0].title, /banding/);
  const open = patient();
  open.rupture('VAR', 0.35);
  run(open, BALLOON_SEAL_S + 5);
  assert.equal(open.bleed.press, 0, 'no balloon, no count');
});

test('a snapshot from before the seal (a bleed with no count) carries on', () => {
  const e = patient();
  e.rupture('VAR', 0.6);
  const snap = e.snapshot();
  delete snap.bleed.press;
  const f = new Engine();
  f.restore(snap);
  f.setParams({ ...f.params, balloonEso: true });
  run(f, BALLOON_SEAL_S + 1);
  assert.ok(!f.bleed.active);
});

test('the figure eases the spray out as its balloon fills, and the scope as its own does', () => {
  const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
  assert.match(stage, /const BAL_ADV_MS = BALLOON_MS\.adv, BAL_INF_MS = BALLOON_MS\.inflate;/, 'the figure fills its balloon over the times the seal is held to');
  assert.match(stage, /const pressedShut = \(\) => \{ const id = F\.bleed\.site === 'GV' \? 'gas' : 'eso'; return bal\.on\[id\] && bal\[id\]\.k >= 1; \};/);
  assert.match(stage, /const sprayOn = \(\) => !!F\?\.bleed\?\.active && morph < 0\.5 && !pressedShut\(\);/, 'full balloon, no spray; the fade out is stepBleedFade');
  const scope = readFileSync(new URL('../src/ui/instruments.js', import.meta.url), 'utf8');
  assert.match(scope, /const bleeding = bleedNow && !\(balloon && balA >= 1\);/);
  assert.match(scope, /jetA = glide\(jetA, \+bleeding, du\)/, 'the jet eases out');
});

test('the balloon slide frames the balloon, the varix and the tear closely, with the ring and label inside and no room added', () => {
  const s = BLEED.slides.find((x) => x.id === 'bridge');
  assert.ok(Array.isArray(s.cam) && s.cam.length === 4, 'its own box');
  const [x0, y0, x1, y1] = s.cam, area = (b) => (b[2] - b[0]) * (b[3] - b[1]);
  // The balloon's whole length and the centre of the esophagus there, the tear at its foot, with room above and below.
  assert.ok(y0 <= BALLOON.top - 60 && y1 >= BALLOON.bottom + 60, 'room above and below the balloon');
  for (const y of [BALLOON.top, BALLOON.bottom]) { const e = esoAt(y); assert.ok(x0 <= e.c - 60 && x1 >= e.c + 60, `room each side of the esophagus at ${y}`); }
  assert.ok(x0 < SITES.varix[0] && SITES.varix[0] < x1 && y0 < SITES.varix[1] && SITES.varix[1] < y1, 'the tear is in');
  // Closer than the region it used: the box a little over half its area, so about twice the zoom where the width is what limits it.
  assert.ok(area(s.cam) < 0.6 * area(REGIONS.varices), `${Math.round(area(s.cam))} against ${Math.round(area(REGIONS.varices))}`);
  assert.ok((x1 - x0) <= 0.55 * (REGIONS.varices[2] - REGIONS.varices[0]), 'half the width');
  // The slide's ring and the esophageal varices' label stand inside it as it is, so the camera adds nothing (cam-room.js).
  const tg = slideTargets(s), anchors = anchorsOf(s, tg);
  assert.ok(anchors.some((a) => a.kind === 'mark') && anchors.some((a) => a.kind === 'label'));
  assert.deepEqual(missed(s.cam, anchors).map((a) => `${a.kind} ${a.name}`), []);
  assert.deepEqual(roomFor(s.cam, anchors), s.cam);
});

test('the slides around it keep the bleed region, so the stream into the stomach still shows', () => {
  for (const id of ['failure', 'rebleed', 'tear']) assert.equal(BLEED.slides.find((x) => x.id === id).cam, 'bleed', id);
});
