// One alignment in a slide card's header (Mohammad, 17 Nov 2026, iPhone, Recompensation slide 11, "Who recompensates, and then"): the title stood
// at the left, its readings wrapped to a row of their own at the right (margin-left: auto), the lead line and the rule's pill sat centred under
// them, and a double gap came before the list. Four alignments in one header. The header's readings now go left when they wrap (the name grows
// to fill its row, so they stand at the right edge only when both share one row), and the criteria card's lead and rule go left with them; only
// the zones card, all on its centre line by design, keeps its centring. Run over the stylesheet and over every deck's criteria cards.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DECKS, withOverview } from '../src/ui/decks.js';

const css = readdirSync(new URL('../styles/', import.meta.url)).filter((f) => /^app-.*\.css$/.test(f)).map((f) => readFileSync(new URL(`../styles/${f}`, import.meta.url), 'utf8')).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
const rules = (sel) => [...css.matchAll(/(?<=^|[};])\s*([^{};@][^{};]*)\{([^}]*)\}/g)].filter((m) => m[1].split(',').some((x) => sel.test(x.trim()))).map((m) => m[2]);

test('the readings in a card header never take an auto margin or right-align a wrapped row: a wrapped row stands at the left under the name', () => {
  const own = rules(/^\.pz \.pz-data\.has-tool > \.pz-dh > \.pz-hr:not\(\[data-n="0"\]\)$/);
  assert.ok(own.length >= 1);
  for (const body of own) {
    assert.doesNotMatch(body, /margin-left:\s*auto/, 'an auto margin sends a wrapped row to the right');
    assert.doesNotMatch(body, /margin-inline-start:\s*auto/);
    assert.doesNotMatch(body, /justify-content:\s*(flex-end|end|right|center)/, 'the readings\' own rows start at the left');
  }
  assert.ok(own.some((b) => /justify-content:\s*flex-start/.test(b)));
  const name = rules(/^\.pz \.pz-data\.has-tool > \.pz-dh:has\(> \.pz-hr:not\(\[data-n="0"\]\)\) > span:first-child$/);
  assert.ok(name.some((b) => /flex:\s*1 1 auto/.test(b)), 'the name grows: that, not a margin, puts the readings at the right edge when they share its row');
});

test('no rule right-aligns a header\'s readings anywhere else in the stylesheet', () => {
  for (const sel of [/\.pz-hr\b/, /\.pz-dh\b[^,]*>\s*\.pz-hr\b/]) {
    for (const body of rules(sel)) {
      assert.doesNotMatch(body, /margin-left:\s*auto/);
      assert.doesNotMatch(body, /justify-content:\s*(flex-end|end|right)/);
    }
  }
});

test('the criteria card\'s lead line and rule pill go left with its title, and only the zones card centres them', () => {
  const top = rules(/^\.pzc-top$/).join(' '), lead = rules(/^\.pzc-lead$/).join(' ');
  assert.match(top, /justify-content:\s*flex-start/);
  assert.doesNotMatch(top, /justify-content:\s*center/);
  assert.match(lead, /text-align:\s*left/);
  assert.doesNotMatch(lead, /text-align:\s*center/);
  assert.match(rules(/^\.pz-crit\.has-zones \.pzc-top$/).join(' '), /justify-content:\s*center/, 'the zones card is all on its centre line (his pick G2)');
  assert.match(rules(/^\.pz-crit\.has-zones \.pzc-lead$/).join(' '), /text-align:\s*center/);
});

test('a criteria card\'s title is at the left on every screen but the zones card\'s, so its header is one alignment with the lead and the rule', () => {
  const all = rules(/^\.pz\.pz[^,]*\[data-tool\^="criteria:"\][^,]*> \.pz-dh$/).join(' ');
  assert.match(all, /text-align:\s*left/);
  const centred = css.match(/\.pz-data\.pz-data\[data-tool\^="criteria:"\]:has\(\.pz-crit\.has-zones\) > \.pz-dh \{[^}]*\}/)?.[0] || '';
  assert.match(centred, /text-align:\s*center/, 'the zones card centres its title with its lead');
});

test('the first row of a criteria list takes no full padding under the lead block: one gap before the list, not two', () => {
  const body = rules(/^\.pzc-top:not\(\[hidden\]\) \+ \.pzc-list > \.pzc-row:first-child:not\(\.pzc-hrow\)$/).join(' ');
  assert.match(body, /padding-top:\s*\.2em/);
});

test('every criteria card in every deck has its lead, rule and rows as plain text for the left-aligned header (nothing needs a centred header)', () => {
  let n = 0;
  for (const d of DECKS) for (const s of withOverview(d).slides) {
    const t = s.tool;
    if (t?.kind !== 'criteria') continue;
    n++;
    if (t.zones) continue;
    assert.equal(typeof t.title, 'string', `${d.id}/${s.id}: a criteria card has a title`);
    if (t.lead != null) assert.ok(String(t.lead).length < 120, `${d.id}/${s.id}: a lead line is one short line`);
    if (t.rule != null) assert.ok(String(t.rule).length < 80, `${d.id}/${s.id}: a rule pill is one short line`);
  }
  assert.ok(n >= 30, 'the sweep reaches the decks\' criteria cards');
});
