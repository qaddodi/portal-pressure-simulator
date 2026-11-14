// Short routes through the longest decks (src/ui/deck-routes.js, 14 Nov 2026). A route copies no slide: it names slide ids of a built-in deck,
// the presenter steps over the rest, and every slide id, handout figure and link stays as it was. The tests keep a route honest: each id is
// real and in order, no slide on it leans on a slide it skips, and the presenter, the deep link and the outline wire it in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DECKS, withOverview } from '../src/ui/decks.js';
import { ROUTES, routesOf, routeOf, routeChoices, routeIndices, routeAtOrAfter, routeMinutes, wholeSize, routeSize } from '../src/ui/deck-routes.js';
import { check, strings } from '../scripts/clinical-wording.mjs';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const deckOf = (id) => DECKS.find((d) => d.id === id);
const all = Object.entries(ROUTES).flatMap(([id, rs]) => rs.map((r) => [deckOf(id), r]));
const changes = (s) => !!(s.preset || s.params || s.action || s.days);   // (presenter.js changes: the slide moves the patient)

// The fields that name another slide of the deck (a change ghost, a table row, a chart's start or dots). Others that look like a slide id are
// names of a drug, a parameter or a tool (a trace's bands, a curve's x).
function* refs(s) {
  if (typeof s.delta === 'string') yield ['delta', s.delta];
  for (const k of ['since', 'hvpgResp']) if (typeof s[k] === 'string') yield [k, s[k]];
  for (const k of ['from', 'delta', 'since']) if (typeof s.tool?.[k] === 'string') yield [`tool.${k}`, s.tool[k]];
  for (const o of s.of || []) if (o?.id) yield ['of.id', o.id];
  for (const o of s.tool?.dots || []) if (o?.slide) yield ['tool.dots.slide', o.slide];
  for (const o of s.compare || []) if (o?.slide) yield ['compare.slide', o.slide];
  for (const [, t] of strings(s)) for (const m of t.matchAll(/\{[\w]+@([\w-]+)\}/g)) yield ['{x@id}', m[1]];
}

test('every route names real slides of its deck, once each, in the deck\'s order', () => {
  assert.ok(all.length >= 6, 'routes for the four longest decks');
  for (const id of Object.keys(ROUTES)) assert.ok(deckOf(id), `${id} is a built-in deck`);
  for (const [d, r] of all) {
    const ids = d.slides.map((s) => s.id), at = r.slides.map((x) => ids.indexOf(x));
    assert.ok(at.every((k) => k >= 0), `${d.id}/${r.id}: an id that is not a slide of the deck`);
    assert.deepEqual(at, [...at].sort((a, b) => a - b), `${d.id}/${r.id}: the deck's order`);
    assert.equal(new Set(at).size, at.length, `${d.id}/${r.id}: a slide twice`);
    assert.ok(r.slides.length >= 4 && r.slides.length <= d.slides.length * 0.65, `${d.id}/${r.id}: a route is a short one (${r.slides.length} of ${d.slides.length})`);
    assert.match(r.id, /^[a-z][a-z0-9-]*$/);
  }
  for (const id of Object.keys(ROUTES)) {
    const rs = ROUTES[id];
    assert.equal(new Set(rs.map((r) => r.id)).size, rs.length, `${id}: route ids are unique`);
    assert.ok(rs.length <= 3, `${id}: three routes at most, or the outline slide has no room for them`);
  }
});

test('goals and checks point at the deck\'s own objectives and questions; over only moves a change ghost', () => {
  for (const [d, r] of all) {
    for (const [k, list] of [['goals', d.objectives], ['checks', d.checks]]) {
      if (!r[k]) continue;
      assert.ok(r[k].length && r[k].every((i) => Number.isInteger(i) && i >= 0 && i < list.length) && new Set(r[k]).size === r[k].length, `${d.id}/${r.id}: ${k}`);
    }
    for (const [sid, fields] of Object.entries(r.over || {})) {
      assert.ok(r.slides.includes(sid), `${d.id}/${r.id}: over names a slide on the route`);
      assert.deepEqual(Object.keys(fields), ['delta'], `${d.id}/${r.id}: over may only point the ghost somewhere else`);
    }
  }
});

test('no slide on a route leans on a slide the route skips', () => {
  for (const [d, r] of all) {
    const on = new Set(r.slides), at = (id) => d.slides.findIndex((s) => s.id === id);
    r.slides.forEach((id, n) => {
      const i = at(id), s = { ...d.slides[i], ...(r.over?.[id] || {}) };
      for (const [how, to] of refs(s)) {
        if (!d.slides.some((x) => x.id === to)) continue;   // (a name that is not a slide)
        assert.ok(on.has(to), `${d.id}/${r.id}: "${id}" reads ${how} "${to}", which the route skips`);
      }
      // A change ghost against "the slide before" (delta true, or a slide that changes the patient) is the slide before it on the route,
      // so no skipped slide in between may have moved the patient: the listener never saw that state.
      const implicit = s.delta === true || (s.delta == null && !s.preset && changes(s));
      if (implicit && n > 0) {
        const between = d.slides.slice(at(r.slides[n - 1]) + 1, i);
        assert.ok(!between.some(changes), `${d.id}/${r.id}: "${id}" compares with a patient state the route skips (${between.filter(changes).map((x) => x.id)})`);
      }
      // A question stands with its answer, the next slide.
      if (s.question) assert.ok(on.has(d.slides[i + 1]?.id), `${d.id}/${r.id}: "${id}" asks a question, so the route keeps the slide that answers it`);
    });
  }
});

test('the overview of a route lists its sections, goals and questions; the slides stay the whole deck\'s', () => {
  for (const [d, r] of all) {
    const whole = withOverview(d), part = withOverview(d, r);
    assert.deepEqual(part.slides.map((s) => s.id), whole.slides.map((s) => s.id), `${d.id}/${r.id}: the slide ids and their order never change`);
    const [o0, o1] = [whole.slides[0], part.slides[0]];
    assert.ok(o1.outline.length >= 1 && o1.outline.length <= o0.outline.length && o1.outline.every((n) => o0.outline.includes(n)), `${d.id}/${r.id}: outline`);
    assert.equal(o1.objectives.length, (r.goals || d.objectives).length);
    assert.equal(part.slides.at(-1).checks.length, (r.checks || d.checks).length);
    assert.equal(part.slides.at(-1).id, 'check');
    assert.equal(o1.route, r.id);
    assert.equal(o0.route, '', 'the whole talk is the first choice');
    assert.deepEqual(o1.routes.map((x) => x.id), ['', ...routesOf(d).map((x) => x.id)]);
    const idx = routeIndices(part.slides, r);
    assert.equal(idx[0], 0); assert.equal(idx.at(-1), part.slides.length - 1); assert.equal(idx.length, routeSize(d, r));
    for (const [sid, f] of Object.entries(r.over || {})) assert.equal(part.slides.find((s) => s.id === sid).delta, f.delta, 'the ghost points where the route says');
  }
  // (A deck with no routes, and a script of the instructor's, get no choice.)
  assert.equal(withOverview(deckOf('circuit')).slides[0].routes, undefined);
  assert.equal(routesOf({ id: 'ascites', mine: true }).length, 0);
});

test('the choices list the whole talk, then each route, with its slides and minutes', () => {
  for (const [d, r] of all) {
    const c = routeChoices(d);
    assert.equal(c[0].n, wholeSize(d)); assert.equal(c[0].minutes, d.minutes);
    const mine = c.find((x) => x.id === r.id);
    assert.ok(mine.n < c[0].n && mine.minutes >= 1 && mine.minutes < d.minutes, `${d.id}/${r.id}: shorter than the whole`);
    assert.equal(mine.minutes, routeMinutes(d, r));
  }
  assert.equal(routeChoices(deckOf('circuit')), null);
  assert.equal(routeOf(deckOf('ascites'), 'nope'), null);
  assert.equal(routeOf(deckOf('ascites'), ''), null, 'no route: the whole talk');
});

test('a link to a slide the route skips opens the next slide on the route', () => {
  const keep = [0, 1, 4, 5, 9];
  assert.equal(routeAtOrAfter(keep, 0), 0); assert.equal(routeAtOrAfter(keep, 2), 4); assert.equal(routeAtOrAfter(keep, 5), 5); assert.equal(routeAtOrAfter(keep, 8), 9); assert.equal(routeAtOrAfter(keep, 30), 9);
});

test('route names and lines read as a clinician would say them, and fit the button', () => {
  for (const [d, r] of all) {
    assert.ok(r.name.length <= 32, `${r.name} is ${r.name.length} characters`);
    assert.ok(r.about.length <= 100, `${d.id}/${r.id}: one line under the name`);
    for (const t of [r.name, r.about]) assert.deepEqual(check(t), [], t);
    assert.ok(!/baveno vii\b/i.test(r.about + r.name), 'Baveno VIII only');
  }
});

test('the presenter steps over the slides a route skips, and the route rides in the links', () => {
  const p = read('src/ui/presenter.js'), main = read('src/ui/main.js'), prep = read('src/ui/slide-prep.js');
  assert.match(p, /const hop = \(i, d\) => \(keep \?/, 'one step function for the route');
  assert.match(p, /else if \(hop\(want, 1\) != null\) \{ firstBeat = true; go\(hop\(want, 1\)\); firstBeat = false; \} else stop\(\);/, 'Next');
  assert.match(p, /else if \(hop\(want, -1\) != null\) go\(hop\(want, -1\)\);/, 'Back');
  assert.match(p, /if \(!keep\) noteResume\(deck\.id, want, slides\.length\);/, 'a route\'s places are not the whole talk\'s resume point');
  assert.match(p, /const \[pk, pn\] = placeOf\(i\)|\[pk, pn\] = placeOf\(i\)/, 'the count is the place on the route');
  assert.match(p, /keep = rt \? routeIndices\(slides, rt\) : null/, 'start builds the route');
  assert.match(p, /go\(keep \? routeAtOrAfter\(keep, want0\)/, 'a link to a skipped slide');
  assert.match(p, /createSlidePrep\(\{ count: \(\) => slides\.length, hop:/, 'the slides ahead are the route\'s');
  assert.match(prep, /hop = \(k, d\) => k \+ d/);
  assert.match(p, /s\.routes \? h\('section', \{ class: 'pzo-routes' \}/, 'the outline offers the routes');
  assert.match(p, /start\(deck\.id, 0, \{ route: r\.id \}\)/);
  assert.match(main, /presenter\.start\(q\.get\('script'\), [^\n]*\{ route: q\.get\('route'\) \}\)/, '?route= opens a route');
  assert.match(main, /if \(pos\.route\) u\.searchParams\.set\('route', pos\.route\)/, 'the preview reload keeps the route');
  assert.match(p, /position: \(\) => \(deck \? \{ id: deck\.id, at: shown\?\.i \?\? want, route: routeId \}/);
  for (const f of ['index.html', 'scripts/build.mjs']) assert.match(read(f), /styles\/routes\.css/, `${f} loads the route buttons' style`);
});
