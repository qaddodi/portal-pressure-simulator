// Room for what a slide points at (src/ui/cam-room.js; camera critique 29 Oct, items A and H).
// The camera frames one region of the plate for each slide, and a mark's ring, a station's label, a vessel the words light or the
// vessel a Doppler probe lies on could stand outside it, off the screen, with nothing to say so. This walks every built-in slide
// the camera frames by region and names each one whose frame, as the region gives it, misses something it points at; the
// presenter's camBox then grows that frame to hold it, and the walk checks that it does and that no frame has to grow past
// MAX_GROWTH (a slide that needs more should name a wider region or drop what is out of reach).
// The frame here takes organs at their rest shape (the liver as its whole region); the live camera measures them as drawn.
import './dom-shim.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DECKS, REGIONS } from '../src/ui/decks.js';
import { slideTargets, camOn } from '../src/ui/presenter.js';
import { isCamOn, regionBox, unionBox, growBox } from '../src/ui/cam-frame.js';
import { ORGANS } from '../src/ui/anatomy.js';
import { pathCmds, flattenCmds } from '../src/ui/shape-gl.js';
import { beatCount, beatView } from '../src/ui/slide-beats.js';
import { anchorsOf, missed, roomFor, vesselRun, middleOf, stationAnchor, ROOM, INSET } from '../src/ui/cam-room.js';

const MAX_GROWTH = 1.75;   // (a frame may grow to this many times the region's width or height, no more)

const polyBox = (d) => {
  const pts = flattenCmds(pathCmds(d), 1).flatMap((p) => Array.from({ length: p.pts.length / 2 }, (_, i) => [p.pts[2 * i], p.pts[2 * i + 1]]));
  return [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))];
};
const organBox = (id) => (id === 'liver' ? REGIONS.liver : ORGANS.find((o) => o.id === id) ? polyBox(ORGANS.find((o) => o.id === id).d) : null);   // (the caudate lobe lies inside the liver's region)
const union = (boxes) => boxes.filter(Boolean).reduce((a, b) => (a ? [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])] : b), null);
const runBox = (id) => { const r = vesselRun(id); return r ? union(r.map(([x, y]) => [x, y, x, y])) : null; };

// What presenter.js camBox hands camFrame: the box round the slide's outlined organs and, when it lights a vessel softly, round every vessel it lights.
const focusOf = (tg) => union([...tg.organs.map((o) => organBox(o.id)), ...(tg.glow.some((g) => g.soft) ? tg.glow.map((g) => runBox(g.id)) : [])]);
// The region a slide's `cam` gives (camBox): a region, a list of regions, a box, or (cam: { on }) the box its names fill, grown from `near`.
function regionOf(cam) {
  let r = regionBox(isCamOn(cam) ? cam.near : cam, REGIONS);
  if (isCamOn(cam)) {
    const n = camOn(cam.on), pts = unionBox(n.points.map(([x, y]) => [x, y, x, y]));
    r = growBox(r, unionBox([union([...n.organs.map(organBox), ...n.edges.map(runBox)]), pts].filter(Boolean)), 30);
  }
  return r || REGIONS.route;
}

// Every slide the camera frames by region, and each of its beats (slide-beats.js): not a visual or a catheter slide (their own cameras), not the circuit, the whole figure or the lobule.
function framed() {
  const out = [];
  for (const d of DECKS) d.slides.flatMap((s0) => Array.from({ length: beatCount(s0) }, (_, b) => [beatView(s0, b), b])).forEach(([s, b], i) => {
    const cam = s.cam || 'fit';
    if (s.visual || s.cath || (s.view && s.view !== 'anatomic') || cam === 'fit' || (typeof cam === 'string' && /^(lobule|sinusoid)/.test(cam))) return;
    const tg = slideTargets(s);
    out.push({ name: `${d.id}/${s.id || i}${b ? ` beat ${b + 1}` : ''}`, cam, region: regionOf(cam), tg, anchors: anchorsOf(s, tg), focus: focusOf(tg) });
  });
  return out;
}
const camFrame = (region, focus, anchors) => roomFor(growBox(region, focus), anchors);   // (presenter.js camBox)
const ofRegion = (f) => camFrame(f.region, f.focus, []);   // (the frame the region and the organs give, before any room)
const sayCam = (c) => (typeof c === 'string' ? `'${c}'` : isCamOn(c) ? 'named' : Array.isArray(c) && typeof c[0] === 'string' ? `[${c.join(', ')}]` : 'its own box');
const say = (f, m) => `${f.name}: ${m.kind} ${m.name} is ${Number.isFinite(m.short) ? `${Math.round(m.short)} units outside` : 'not on the plate (unknown or undrawn id)'} the ${sayCam(f.cam)} frame`;

test('every built-in slide framed by region is walked (the count only moves when decks are added or taken out)', () => {
  const n = framed().length;
  assert.ok(n > 150, `only ${n} slides walked`);
});

test('every id a slide points at is drawn on the plate', () => {
  const bad = [];
  for (const f of framed()) for (const a of f.anchors) if (!a.at.length) bad.push(`${f.name}: ${a.kind} ${a.name}`);
  assert.deepEqual(bad, [], 'a mark, label, glow or probe names a vessel or station that is not on the plate');
});

test('the camera frame holds every mark, label, lit vessel, probe and reading a slide points at', () => {
  const left = [];
  for (const f of framed()) {
    const frame = camFrame(f.region, f.focus, f.anchors);
    for (const m of missed(frame, f.anchors)) left.push(say(f, m));
  }
  assert.deepEqual(left, [], 'the frame still misses what the slide points at');
});

test('no slide needs its frame grown past the limit to hold what it points at (name a wider region or drop what is out of reach)', () => {
  const wide = [];
  for (const f of framed()) {
    const base = ofRegion(f), frame = camFrame(f.region, f.focus, f.anchors);
    const gw = (frame[2] - frame[0]) / (base[2] - base[0]), gh = (frame[3] - frame[1]) / (base[3] - base[1]);
    if (Math.max(gw, gh) > MAX_GROWTH) wide.push(`${f.name}: holding ${missed(base, f.anchors).map((m) => `${m.kind} ${m.name}`).join(', ')} would grow the ${sayCam(f.cam)} frame ${Math.max(gw, gh).toFixed(2)}×`);
  }
  assert.deepEqual(wide, []);
});

// The slides whose region, as it stands, leaves something they point at outside the frame, and what. The camera grows the frame to
// hold it (camBox); the list is for the person reading a push, so a slide's framing never changes without somebody seeing why.
const ROOMED = {
  'ascites/bc': 'the sinusoids label hangs from the lower liver, at the bottom edge of the hepatic region',
  'choose-treatment/a3': 'the portal vein label hangs from the trunk, just left of the splenic region',
  'choose-treatment/a5': 'the IVC and right atrium labels sit above the DIPS region',
  'doppler/normal': 'the splenic vein label hangs from its splenic hilum stretch, past the portal region',
  'doppler/probe': 'the splenic vein label hangs from its splenic hilum stretch, past the portal region',
  'gastric-varices/shunt': 'the left renal vein label hangs at the left edge of the fundus region',
  'outflow/dips': 'the portal vein label hangs below the DIPS region and the IVC label above it',
  'pregnancy/inflow': 'the splenic vein label hangs from its splenic hilum stretch, past the portal region',
  'sites/cardiac': 'the sinusoids word lights the sinusoids and their label, below the heart region',
  'sites/pvt': 'the splenic vein label hangs from its splenic hilum stretch, past the portal region',
  'varices/burst': 'the varices label hangs from the varix vessel below the close-up box',
  'varices/eso': 'the left gastric vein label, and the vein it lights, hang below the varices region',
};
test('the slides whose region leaves something out are named, and the camera makes room for each', () => {
  const now = framed().flatMap((f) => (missed(ofRegion(f), f.anchors).length ? [f.name] : [])).sort();
  assert.deepEqual(now, Object.keys(ROOMED).sort(), 'a slide now needs (or no longer needs) room round what it points at: add or remove its line in ROOMED with the reason, after a look at the framing');
});

test('room: a frame that holds the anchor stays as it is; one that misses it grows by ROOM round the nearest place', () => {
  const box = [100, 100, 300, 300];
  assert.deepEqual(roomFor(box, [{ kind: 'label', name: 'in', at: [[200, 200]] }]), box);
  assert.deepEqual(roomFor(box, [{ kind: 'label', name: 'edge', at: [[300 - INSET + 1, 200]] }]), box.map((v, i) => (i === 2 ? 300 - INSET + 1 + ROOM : v)));
  // (a thing with two places is on screen when either is: no growth for the far one)
  assert.deepEqual(roomFor(box, [{ kind: 'lit vessels', name: 'two', at: [[200, 200], [900, 900]] }]), box);
  // (...and when neither is, the nearer one is taken in)
  assert.deepEqual(roomFor(box, [{ kind: 'lit vessels', name: 'far', at: [[900, 900], [400, 200]] }]), [100, 100, 400 + ROOM, 300]);
});

test('anchors sit where the stage hangs them: a label on the middle of its vessel, a mark on its first vessel', () => {
  const sv = vesselRun('V_SPL'), [mx, my] = middleOf(sv);
  assert.deepEqual(stationAnchor('SV'), [mx, my]);                   // (the splenic vein's label hangs from the middle of V_SPL, out by the spleen)
  assert.ok(mx > REGIONS.portal[2], 'the portal region ends before the splenic vein label');
  assert.deepEqual(stationAnchor('GV'), [876, 302]);                 // (a station with no vessel of its own keeps the station)
  const a = anchorsOf({ mark: { edges: ['C1a', 'C1b'], label: 'x' } }, { labels: [], groups: [], sites: [] });
  assert.equal(a.length, 1);
  assert.equal(a[0].at.length, 1, 'a mark rings its first vessel only');
  const f = anchorsOf({ mark: { edges: ['C1a', 'C1b'], label: 'x', free: true } }, { labels: [], groups: [], sites: [] });
  assert.equal(f[0].at.length, 2, 'a free mark names a group: either vessel shows it');
});

test('the presenter frames every slide through the room (camBox grows the frame by the room for every anchor)', () => {
  const src = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
  assert.match(src, /import \{ anchorsOf, roomFor \} from '\.\/cam-room\.js/);
  assert.match(src, /return roomFor\(growBox\(r \|\| REGIONS\.route, f\), anchorsOf\(s, tg\)\);/);
  // slideTargets keeps handing over the groups of vessels each term and glow lights, which the room reads
  assert.match(src, /sites: \[\.\.\.sites\], groups \};/);
});
