// The HVPG catheter stays in place through a slide between two of its steps (Mohammad, 18 Nov 2026, HVPG and PPG slide 6: "when we zoom out, the whole
// animation of the catheter replays, instead of the catheter being in place still"). A slide with no catheter of its own sends it out under its camera move,
// and the next catheter slide then ran the whole route in again. A slide between the wedge and the HVPG (the dive into the lobule) says cathKeep: the catheter
// goes out as ever, the step it had reached is remembered, and the slide after it brings it back in place, balloon up, and goes on to its own step.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const dir = new URL('../src/ui/decks/', import.meta.url);
const decks = [];
for (const f of readdirSync(dir)) {
  if (!f.endsWith('.js')) continue;
  for (const d of Object.values(await import(new URL(f, dir)))) if (d?.slides) decks.push(d);
}
const BALLOON_UP = (s) => s.cath === 'wedge' || s.cath === 'result';

test('every slide between a wedge or result catheter slide and the next one with the balloon up says cathKeep, and no other slide does', () => {
  let gaps = 0;
  for (const d of decks) {
    const S = d.slides;
    S.forEach((s, i) => {
      if (!BALLOON_UP(s)) return;
      for (let j = i + 1; j < S.length; j++) {
        if (!S[j].cath) continue;
        if (BALLOON_UP(S[j])) for (const g of S.slice(i + 1, j)) { gaps++; assert.ok(g.cathKeep || j - i > 2, `${d.id}: ${g.id} stands between ${s.id} and ${S[j].id} and must keep the catheter`); }
        break;
      }
    });
    for (const s of S) if (s.cathKeep) {
      const i = S.indexOf(s), before = S[i - 1], after = S[i + 1];
      assert.ok(before && BALLOON_UP(before) && after && BALLOON_UP(after), `${d.id}: ${s.id} keeps a catheter that no step before and after it has up`);
    }
  }
  assert.ok(gaps >= 1, 'the HVPG deck has its dive between the wedge and the HVPG');
});

test('the presenter sends the kept step to the catheter and the next slide resumes it instead of running the route again', () => {
  const pres = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
  const lapse = readFileSync(new URL('../src/ui/presenter-lapse.js', import.meta.url), 'utf8');
  assert.match(pres, /s\.cathKeep && !ct \? to : -1/, 'a slide with cathKeep parks the catheter under its own index');
  assert.match(pres, /cathTo\(ct, st\.fp, cut, cathInstant\(to, lastAt\), lastAt\)/, 'the next slide says which slide it comes from');
  assert.match(lapse, /back\.at === from/, 'only the slide right after the keeping one takes the catheter back');
  assert.match(lapse, /parked = null;\s*\n\s*const resume/, 'the parked catheter is taken once');
  // the resumed catheter is in place at once: route done, balloon up, column filled, and no replay of the route's glide
  const body = lapse.slice(lapse.indexOf('if (resume) {'), lapse.indexOf('if (resume) {') + 1500);
  assert.match(body, /u: 1, balloon: 1, column: 1/);
  assert.ok(!/cathTrack\('u'/.test(body), 'the route is not run in again');
  assert.match(body, /cath\.show = \['sum'\]/, 'the HVPG slide goes on to the subtraction');
});

test('the monitor waits for the subtraction while the catheter is being put back', () => {
  const proc = readFileSync(new URL('../src/ui/presenter-proc.js', import.meta.url), 'utf8');
  assert.match(proc, /tools\.reach\(v\.u >= 0\.999 && cath\.show\.length > 0 && !cath\.hold\)/);
});
