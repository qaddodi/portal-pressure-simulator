// The self-check rules registry (src/ui/selfcheck/rules.js): registration, kinds, only/skip, findings with the rule's why and owner, a rule that throws.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerRule, runRules, RULES, ruleIds, ruleList, clashes, rulesOwning, findingText } from '../src/ui/selfcheck/rules.js';
import '../src/ui/selfcheck/plugins.js';
import { quiet, fires, seriesFindings } from './selfcheck-helpers.js';

const good = { id: 'zt-label-under-card', owner: 'src/ui/label-gl.js', why: 'Labels stay clear of cards (17 Nov)', check: (r) => (r.labels || []).filter((l) => l.under).map((l) => ({ what: `Label "${l.t}"`, where: 'under the Doppler card', at: '12.4 s' })) };

test('a rule needs a dashed id, an owner file, a why and a check; a taken id is ignored and counted', () => {
  assert.throws(() => registerRule({ ...good, id: 'Bad Id' }), /id must be/);
  assert.throws(() => registerRule({ ...good, owner: '' }), /owner/);
  assert.throws(() => registerRule({ ...good, why: '' }), /why/);
  assert.throws(() => registerRule({ ...good, check: null }), /check/);
  assert.throws(() => registerRule({ ...good, kind: 'frames' }), /kind/);
  assert.equal(registerRule(good), true);
  assert.equal(registerRule(good), false);
  assert.ok(clashes().includes('zt-label-under-card'));
  assert.ok(ruleIds().includes('zt-label-under-card'));
  assert.deepEqual(rulesOwning('src/ui/label-gl.js').map((r) => r.id).filter((id) => id.startsWith('zt-')), ['zt-label-under-card']);
  assert.ok(RULES.some((r) => r.id === 'zt-label-under-card'), 'RULES is live');
});

test('a finding carries its rule, why and owner; the rule only says what and where', () => {
  const f = fires('zt-label-under-card', { labels: [{ t: 'Splenic vein', under: true }] }, /Splenic vein/);
  assert.deepEqual(f, [{ rule: 'zt-label-under-card', why: 'Labels stay clear of cards (17 Nov)', owner: 'src/ui/label-gl.js', what: 'Label "Splenic vein"', where: 'under the Doppler card', at: '12.4 s' }]);
  assert.equal(findingText(f[0]), '[zt-label-under-card] Label "Splenic vein": under the Doppler card (12.4 s) - src/ui/label-gl.js');
  quiet('zt-label-under-card', { labels: [{ t: 'Splenic vein', under: false }] });   // (the case that must not fire)
  quiet('zt-label-under-card', {});
});

test('state rules read a report and series rules read the history; each is skipped when its input is missing', () => {
  registerRule({ id: 'zt-flash', kind: 'series', owner: 'src/ui/label-gl.js', why: 'Nothing pops (17 Nov)', judge: (frames) => (frames.length > 2 ? [{ what: 'a label', where: 'flashed', from: 1, to: 0.1 }] : []) });
  assert.deepEqual(seriesFindings('zt-flash', [{ t: 0 }, { t: 1 }]), []);
  const f = seriesFindings('zt-flash', [{ t: 0 }, { t: 1 }, { t: 2 }]);
  assert.equal(f.length, 1); assert.equal(f[0].from, 1);
  assert.deepEqual(runRules({}, { only: 'zt-flash' }), [], 'no history: a series rule does not run');
  assert.deepEqual(runRules(null, { only: 'zt-label-under-card', history: [{ t: 0 }] }), [], 'no report: a state rule does not run');
});

test('only, skip and kinds choose the rules', () => {
  const report = { labels: [{ t: 'A', under: true }] };
  assert.equal(runRules(report, { only: 'zt-label-under-card' }).length, 1);
  assert.equal(runRules(report, { only: ['zt-label-under-card'], skip: 'zt-label-under-card' }).length, 0);
  assert.equal(runRules(report, { only: 'zt-label-under-card', kinds: ['series'] }).length, 0);
});

test('a rule that throws becomes one rule-error finding and the other rules still run', () => {
  registerRule({ id: 'zt-throws', owner: 'src/ui/x.js', why: 'a broken rule', check() { throw new Error('boom'); } });
  const f = runRules({ labels: [{ t: 'A', under: true }] }, { only: ['zt-throws', 'zt-label-under-card'] });
  assert.deepEqual(f.map((x) => x.rule).sort(), ['rule-error', 'zt-label-under-card']);
  assert.match(f.find((x) => x.rule === 'rule-error').where, /boom/);
});

test('the built-in fit rules are registered with an owner file that exists', async () => {
  const { existsSync } = await import('node:fs');
  for (const r of ruleList().filter((x) => x.id.startsWith('fit-'))) assert.ok(existsSync(new URL(`../${r.owner}`, import.meta.url)), `${r.id}: ${r.owner}`);
});
