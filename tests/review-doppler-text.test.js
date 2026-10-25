// Code review of 15 Oct, items 3 to 5 and Mohammad's answer A: the Doppler never shows one vessel's samples under
// another's name, the Doppler teaching reads velocity (not a "mean") and draws its rules as cut-offs, and with a TIPS
// in a fast main portal vein is not flagged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCore } from '../src/worker-core.js';
import { Engine } from '../src/engine/engine.js';
import { velNormal, velPos, STENT_PV_NORMAL } from '../src/ui/velNormal.js';
import { DOPPLER } from '../src/ui/decks/doppler.js';

test('a new vessel never receives the old one\'s samples: they go out under the old name first', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  const frames = [];
  const core = createCore((m) => { if (m.type === 'frame') frames.push(structuredClone(m)); });
  t.after(() => core.dispose());
  const tick = () => { now += 33; t.mock.timers.tick(33); };
  core.handle({ type: 'init' });
  core.handle({ type: 'run', running: true });
  core.handle({ type: 'probe', id: 'RHV_IVC' });
  for (let i = 0; i < 12; i++) tick();
  // Switch between frames, with samples of the hepatic vein still pending (a tick after the last frame).
  const sent = frames.length; tick();
  if (frames.length > sent) tick();
  core.handle({ type: 'probe', id: 'PV_TRUNK' });
  for (let i = 0; i < 12; i++) tick();
  const tagged = frames.filter((f) => f.samples?.t.length);
  assert.ok(tagged.some((f) => f.probe === 'RHV_IVC') && tagged.some((f) => f.probe === 'PV_TRUNK'));
  for (const f of tagged) {
    const own = f.probe === 'PV_TRUNK' ? f.samples.pvVel : f.samples.hvVel;
    assert.deepEqual(f.samples.vel, own, `every ${f.probe} sample is that vessel's own`);
  }
});

test('the Doppler judges nothing until 1.5 s of the vessel is recorded, and a new vessel finds its own scale', () => {
  const src = readFileSync(new URL('../src/ui/doppler.js', import.meta.url), 'utf8');
  const reading = src.slice(src.indexOf('function reading()'), src.indexOf('function reading()') + 300);
  assert.match(reading, /if \(tNow - buf\[0\]\[0\] < SETTLE\) return null;/);
  assert.match(src, /const SETTLE = 1\.5;/);
  assert.match(src, /if \(f\.probe !== probe\) \{[^}]*scale = null;[^}]*steady\.probe = null;/);
});

test('Doppler teaching says velocity, not mean, and writes its rules as cut-offs', () => {
  const said = (d) => [...(d.checks || []).flat(), ...d.slides.flatMap((s) => [s.title, s.line, ...(s.ask || [])])].filter(Boolean);
  for (const d of [DOPPLER]) for (const t of said(d)) assert.doesNotMatch(t, /\bmean (velocity|portal|of)\b|\ba mean\b|\bthe mean\b/i, `${d.id}: ${t}`);
  for (const s of DOPPLER.slides) {
    if (!s.line) continue;
    // A cut-off beside a live monitor is outlined ({<15 cm/s}), never filled like the patient's own value.
    for (const m of s.line.matchAll(/\{([^}]*cm\/s)\}/g)) assert.match(m[1], /^[<>≥≤]/, `${s.id}: {${m[1]}}`);
  }
});

test('with a TIPS in, a fast main portal vein is normal: no ceiling, never coloured fast', () => {
  assert.equal(STENT_PV_NORMAL[0], 30);
  assert.equal(STENT_PV_NORMAL[1], Infinity);
  const e = new Engine(), k = e.ei.PV_TRUNK;
  const D = e.edges.map((x) => e.diameter(x.id));
  D[e.ei.TIPS] = 10;
  const n = velNormal(k, { Q: e.Q, D }, null);
  assert.deepEqual(n, STENT_PV_NORMAL);
  for (const v of [30, 40, 55, 80, 150]) { const u = velPos(v, n); assert.ok(u >= 0.33 && u <= 0.67, `${v} cm/s reads normal (${u})`); }
  assert.ok(velPos(20, n) < 0.33, 'under 30 with a stent is slow');
  assert.ok(velPos(45, n) > velPos(35, n), 'still a gradient inside the range');
  // Without a stent, the portal vein keeps its 15–40 range and over 40 is fast.
  assert.ok(velPos(50, velNormal(k, { Q: e.Q, D: e.edges.map((x) => e.diameter(x.id)) }, null)) > 0.67);
  // The Doppler monitor uses the same stent-aware range.
  const src = readFileSync(new URL('../src/ui/doppler.js', import.meta.url), 'utf8');
  assert.match(src, /const normalOf = \(p\) => \(p\.id === 'PV_TRUNK' && frame\?\.D \? velNormal\(EI\.PV_TRUNK, frame\) : null\) \|\| p\.normal;/);
  assert.doesNotMatch(src.slice(src.indexOf('function interpret'), src.indexOf('function setStat')), /p\.normal\[/);
});

// A station's velocity callout and the Doppler monitor beside it read one number: the callout is a Doppler (peak)
// velocity, of the vessel the station is named for, and while the Doppler samples that vessel it shows the monitor's
// own number (TIPS Doppler 5 read "Portal v. 18 cm/s", the lumen mean, beside a monitor at 34).
test('velocity callouts read the named vessel as the Doppler reads it, and its monitor\'s number', async () => {
  const { STATION_VESSEL } = await import('../src/ui/velNormal.js');
  const { EDGES } = await import('../src/engine/topology.js');
  for (const [n, id] of Object.entries(STATION_VESSEL)) {
    const e = EDGES.find((x) => x.id === id);
    assert.ok(e && (e.from === n || e.to === n), `${n} names ${id}, a vessel at that station`);
  }
  const src = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
  const runs = src.slice(src.indexOf('function layerRuns'), src.indexOf('function shortenItem'));
  assert.match(runs, /Math\.abs\(edgeVel\(f, EI\[x\.e\.id\]\)\) \* dopplerK\(x\.e\)/, 'peak, as the Doppler reads it');
  assert.match(runs, /STATION_VESSEL\[id\]/);
  assert.match(runs, /best = shownVelOf\(EDGES\[bestK\]\.id, f, best\)/);
  const own = src.slice(src.indexOf('function shownVelOf'), src.indexOf('function velItem'));
  assert.match(own, /shownVel\.get\(id\)/, 'the monitor\'s own number while it samples that vessel');
  assert.equal(STATION_VESSEL.CONF, 'PV_TRUNK', '"Portal v." is the portal vein, not the left gastric or a cavernoma');
});
