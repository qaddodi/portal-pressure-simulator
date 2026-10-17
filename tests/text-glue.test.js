// Words that belong together stay on one line in a slide's text (src/ui/glue.js; design critique 17 Oct, I3, I18, I21).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nb, listCase, plateletText } from '../src/ui/glue.js';

const NB = ' ';
const SRC = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');

test('a number never breaks from its unit, and a range keeps its ends and unit together', () => {
  assert.equal(nb('An HVPG of 6 to 9 mmHg is subclinical'), `An HVPG of 6${NB}to${NB}9${NB}mmHg is subclinical`);
  assert.equal(nb('a total protein of 4.3 g/dL'), `a total protein of 4.3${NB}g/dL`);
  assert.equal(nb('over 190 cm/s and 25 kPa or more'), `over 190${NB}cm/s and 25${NB}kPa or more`);
  assert.equal(nb('Child–Pugh C, 10 to 13 points'), `Child–⁠Pugh C, 10${NB}to${NB}13${NB}points`);
  assert.equal(nb('2 L of fluid, 7 mm varices'), `2${NB}L of fluid, 7${NB}mm varices`);
  // (A number with no unit, or a word that only starts like one, is left alone.)
  assert.equal(nb('HVPG 10 or more, at 2 grams'), 'HVPG 10 or more, at 2 grams');
});

test('a list reads in sentence case after its first item, abbreviations and names kept', () => {
  assert.equal(listCase(['Porto-sinusoidal vascular disorder', 'Early primary biliary cholangitis', 'Sarcoidosis']),
    'Porto-sinusoidal vascular disorder, early primary biliary cholangitis, sarcoidosis');
  assert.equal(listCase(['Thiopurines', 'HIV, didanosine', 'IVC web', 'Child–Pugh B']), 'Thiopurines, HIV, didanosine, IVC web, Child–Pugh B');
});

test('running text writes a platelet count in full, the tiles keep thousands', () => {
  assert.equal(plateletText(88.4), '88,000/µL');
  assert.equal(plateletText(150), '150,000/µL');
  assert.match(SRC, /if \(k === 'plt'\) return plateletText\(v\);/);
  assert.match(SRC, /T\.u === '%' \? '%'/, 'no space before a percent sign');
});

test('the slide text glues units, the case card and the causes too', () => {
  assert.match(SRC, /h\('p', \{ class: 'pz-case-p' \}, nb\(s\.vignette\)\)/);
  assert.match(SRC, /nb\(listCase\(s\.causes\)\)/);
  assert.match(SRC, /class: stop \? 'pz-nw pz-stop' : 'pz-nw'/, 'a pill followed by its stop is marked so the stop sits close');
  assert.match(SRC, /dz\.length <= 25 \? 'pz-dz pz-nw' : 'pz-dz'/, 'a disease name never splits across two lines');
});
