// Every slide that names the caudate lobe shows it, whole (16 Nov 2026: Sites and causes, Budd–Chiari syndrome, drew it cut off by the
// bottom of the frame; the Budd–Chiari deck's imaging and DIPS slides declared the term but their words never named it, so they drew nothing).
// A slide shows the lobe when it pins it (slideTargets: its line links "caudate lobe", a term matches its line, or a mark names it) and the
// camera's frame holds the lobe at its fullest (stage.focusBox adds caudateBox, which presenter-proc camBox grows the region by).
import './dom-shim.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { DECKS, REGIONS } from '../src/ui/decks.js';
import { slideTargets } from '../src/ui/presenter.js';
import { regionBox, growBox } from '../src/ui/cam-frame.js';
import { caudateBox, caudateFocus } from '../src/ui/anatomy.js';

const slides = DECKS.flatMap((d) => d.slides.map((s) => ({ key: `${d.id}/${s.id}`, s })));
const termKeys = (s) => (Array.isArray(s.terms) ? s.terms : Object.values(s.terms || {}));
// (What a viewer reads on the slide: its title, its line, a mark's words and the case question; the notes are the speaker's.)
const shown = (s) => JSON.stringify([s.title, s.line, s.marks, s.mark, s.caseQ, s.vignette]);
const names = ({ s }) => /caudate/i.test(shown(s)) || termKeys(s).some((k) => /caudate/i.test(k));
const pins = (s) => slideTargets(s).organs.some((o) => o.id === 'caudate' || o.id === 'caudate-lobe');
const MAX_GROWTH = 1.75;

test('there are slides that name the caudate lobe (so the checks below look at something)', () => {
  assert.ok(slides.filter(names).length >= 4, 'Sites and causes, the Doppler outflow slide and two Budd–Chiari slides');
});

test('every slide that names the caudate lobe, or declares its term, draws it', () => {
  const missing = slides.filter(names).filter(({ s }) => !pins(s)).map(({ key }) => key);
  assert.deepEqual(missing, [], 'these slides name the caudate lobe but their words and marks never pin it, so nothing is drawn');
});

test('every slide that draws the caudate lobe frames it whole, without a frame past ' + MAX_GROWTH + 'x its region', () => {
  const box = caudateBox();
  for (const { key, s } of slides.filter(({ s }) => pins(s))) {
    const r = regionBox(s.cam, REGIONS), g = growBox(r, box, 30);   // (presenter-proc camBox: the region grown to hold what the slide draws)
    assert.ok(g[0] <= box[0] && g[1] <= box[1] && g[2] >= box[2] && g[3] >= box[3], `${key}: the frame misses the lobe`);
    assert.ok((g[2] - g[0]) / (r[2] - r[0]) <= MAX_GROWTH && (g[3] - g[1]) / (r[3] - r[1]) <= MAX_GROWTH, `${key}: the lobe needs a frame past ${MAX_GROWTH}x its region: name a wider region`);
  }
});

test('a frame for the caudate organs holds the lobe (what stage.focusBox adds), and one for no caudate adds nothing', () => {
  assert.deepEqual(caudateFocus(['liver', 'caudate']), caudateBox());
  assert.deepEqual(caudateFocus(['caudate-lobe']), caudateBox());
  assert.equal(caudateFocus(['liver', 'spleen']), null);
});
