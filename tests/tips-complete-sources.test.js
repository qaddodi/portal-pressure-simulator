// The TIPS deck's sources (Mohammad's rule: Baveno VIII, never Baveno VII or earlier; AASLD, EASL and the studies are fine when named). Two checks hold it:
// no text cites an earlier Baveno consensus, and a typed clinical number (mmHg, cm/s, hours, percent) stands on a slide that names where it comes from.
// A number the model produces is a live token ({ppg}, {liver}) and needs none; a number inside braces is a rule pill and is typed, so it does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TIPS_COMPLETE as D } from '../src/ui/decks/tips-complete.js';

const strings = (o, out = []) => { if (typeof o === 'string') out.push(o); else if (Array.isArray(o)) o.forEach((x) => strings(x, out)); else if (o && typeof o === 'object') Object.values(o).forEach((x) => strings(x, out)); return out; };
const EARLIER = /\bBaveno\s+(?:I{1,3}|IV|V|VI|VII)\b(?!I)/;
const SOURCE = /Baveno VIII|AASLD 20\d\d|EASL 20\d\d|Mitchell|McNaughton|Conventional Doppler criteria/;
const NUM = /(?:[<>≥≤]=?\s?)?\d+(?:\.\d+)?\s?(?:mmHg|cm\/s|hours?|%)/g;
const typed = (t) => (t.replace(/\{(?:ppg|liver|shunt|asc|pv|he|tips\w*|dips\w*|hvpg|eus|gv|map|plt)(?:@[\w-]+)?(?::\d)?\}/g, '').match(NUM) || []);

test('no text cites Baveno VII or an earlier consensus', () => {
  for (const t of strings(D)) assert.ok(!EARLIER.test(t), `"${t.match(EARLIER)?.[0]}" in "${t.slice(0, 140)}"`);
});

test('the deck does cite Baveno VIII and AASLD (so the scan above holds something)', () => {
  const all = strings(D);
  assert.ok(all.filter((t) => /Baveno VIII/.test(t)).length >= 15);
  assert.ok(all.some((t) => /AASLD 2024/.test(t)) && all.some((t) => /AASLD 2021/.test(t)));
});

test('a slide that types a clinical number names its source in its notes or cite', () => {
  for (const s of D.slides) {
    const said = [s.title, s.line, ...(s.ask || [])].filter((t) => typeof t === 'string').flatMap(typed);
    if (!said.length || s.visual) continue;
    assert.ok(SOURCE.test(`${s.notes || ''} ${s.cite || ''}`), `${s.id}: types ${said.join(', ')} but its notes and cite name no source`);
  }
});

test('a check that types a clinical number names its source in the answer', () => {
  for (const [q, a] of D.checks) if (typed(`${q} ${a}`).length) assert.ok(SOURCE.test(a), `"${q.slice(0, 70)}": the answer types ${typed(`${q} ${a}`).join(', ')} with no source`);
});

test('12 mmHg is a reference for a variceal indication, never a target, and Table 3 is not its source', () => {
  for (const t of strings(D)) {
    assert.ok(!/12\s?mmHg\s+target|target[^.]{0,30}12\s?mmHg/i.test(t), `"${t.slice(0, 140)}"`);
    assert.ok(!/<\s?12 mmHg[^.]*Table 3|Table 3[^.]*<\s?12 mmHg/i.test(t), `Baveno VIII Table 3 holds no 12 mmHg line: "${t.slice(0, 140)}"`);
  }
});
