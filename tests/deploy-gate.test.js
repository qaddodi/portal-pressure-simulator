// The live site never deploys from a build that did not pass the gate (PROD-1, PROD-2, 15 Nov 2026).
//
// pages.yml's `gate` job is main's strict build plus the smoke on that build; its `deploy` job must need it and may run on main only when it succeeded.
// These tests read the workflow files (no YAML library in the repository, so jobs are cut by their two-space keys) and fail when:
//   - a deploy path exists outside the deploy job (another workflow that publishes to Pages or the gh-pages branch);
//   - the deploy job does not need `gate`, or an alternative of its `if` lets main through without `needs.gate.result == 'success'`;
//   - the gate stops being the strict build and the smoke, is allowed to fail (continue-on-error), or is skipped on main;
//   - ci.yml's smoke waits on anything but the build again (the lint failing at its first step hid it for five weeks).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const DIR = new URL('../.github/workflows/', import.meta.url);
const read = (f) => readFileSync(new URL(f, DIR), 'utf8');
const PREVIEW_BRANCH = 'claude/settings-topbar-icon-flvft1';

// { name: text } of the jobs under the top-level `jobs:` key (a job is a two-space key; its body is everything up to the next one).
function jobsOf(yml) {
  const lines = yml.split('\n');
  const at = lines.findIndex((l) => /^jobs:\s*$/.test(l));
  assert.ok(at >= 0, 'a workflow with no jobs: key');
  const jobs = {};
  let name = null;
  for (const l of lines.slice(at + 1)) {
    const m = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(l);
    if (m) { name = m[1]; jobs[name] = []; continue; }
    if (name) jobs[name].push(l);
  }
  return Object.fromEntries(Object.entries(jobs).map(([k, v]) => [k, v.join('\n')]));
}
// The text of a job's `if:` (a one-line value, or a `>-` block of lines indented deeper than the key), whitespace joined; null when it has none.
function ifOf(job) {
  const lines = job.split('\n');
  const i = lines.findIndex((l) => /^ {4}if:/.test(l));
  if (i < 0) return null;
  const first = lines[i].replace(/^ {4}if:\s*/, '');
  if (!/^[>|][-+]?\s*$/.test(first)) return first.trim();
  const out = [];
  for (const l of lines.slice(i + 1)) { if (/^ {6,}\S/.test(l)) out.push(l.trim()); else break; }
  return out.join(' ');
}
// The top-level `||` alternatives of an `if` expression of the form `!cancelled() && ((a && b) || (c && d))`.
function alternatives(expr) {
  const inner = expr.replace(/^!cancelled\(\)\s*&&\s*/, '').trim();
  const body = inner.startsWith('(') && inner.endsWith(')') ? inner.slice(1, -1) : inner;
  const parts = [];
  let depth = 0, cur = '';
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '(') depth++;
    if (c === ')') depth--;
    if (depth === 0 && body.startsWith('||', i)) { parts.push(cur); cur = ''; i++; continue; }
    cur += c;
  }
  parts.push(cur);
  return parts.map((p) => p.trim());
}
const needsOf = (job) => {
  const m = /^ {4}needs:\s*(.*)$/m.exec(job);
  if (!m) return [];
  return m[1].replace(/[[\]]/g, '').split(',').map((s) => s.trim()).filter(Boolean);
};

const pages = read('pages.yml');
const pageJobs = jobsOf(pages);

test('only the deploy job of pages.yml publishes the site', () => {
  const publishers = [];
  for (const f of readdirSync(DIR).filter((n) => /\.ya?ml$/.test(n))) {
    const text = read(f);
    for (const [name, body] of Object.entries(jobsOf(text))) {
      if (/deploy-pages@|upload-pages-artifact@|push[^\n]*gh-pages/.test(body)) publishers.push(`${f}:${name}`);
    }
  }
  assert.deepEqual(publishers, ['pages.yml:deploy'], 'another job publishes to Pages or the gh-pages branch, outside the gate');
});

test('the deploy job needs the gate, and main passes only on its success', () => {
  const deploy = pageJobs.deploy, gate = pageJobs.gate;
  assert.ok(deploy && gate, 'pages.yml has a gate job and a deploy job');
  assert.ok(needsOf(deploy).includes('gate'), 'deploy lists gate in needs');
  const expr = ifOf(deploy);
  assert.ok(expr, 'deploy has an if');
  assert.ok(!/always\(\)/.test(expr), 'always() would run the deploy after a failed gate');
  assert.ok(/^!cancelled\(\)/.test(expr), 'the deploy stops when the run is cancelled');
  const alts = alternatives(expr);
  assert.ok(alts.length >= 1);
  let mainAlts = 0;
  for (const alt of alts) {
    const onMain = /github\.ref_name == 'main'/.test(alt);
    const gateOk = /needs\.gate\.result == 'success'/.test(alt);
    const gateSkipped = /needs\.gate\.result == 'skipped'/.test(alt);
    if (onMain) {
      mainAlts++;
      assert.ok(gateOk, `main may deploy without a passing gate: (${alt})`);
      assert.ok(!gateSkipped, `main may deploy with the gate skipped: (${alt})`);
    } else {
      // Any other ref: only the preview branch, which the gate does not run for, so it must say the gate was skipped (never "any result").
      assert.ok(alt.includes(`github.ref_name == '${PREVIEW_BRANCH}'`), `an alternative that is neither main nor the preview branch: (${alt})`);
      assert.ok(gateSkipped && !gateOk, `the preview alternative must state the gate's result as skipped: (${alt})`);
    }
  }
  assert.equal(mainAlts, 1, 'exactly one alternative for main');
  assert.ok(!/\bfailure\b/.test(alts.filter((a) => /ref_name == 'main'/.test(a)).join('').replace(/needs\.validate\.result == 'failure'/g, '')), 'main tolerates no failure except the lint and unit tests (validate)');
  assert.ok(!/continue-on-error/.test(deploy.split('steps:')[0]), 'the deploy job itself may not continue on error');
});

test('the gate is the strict build and the smoke on it, for main, and may not fail quietly', () => {
  const gate = pageJobs.gate;
  assert.equal(ifOf(gate), "github.ref_name == 'main'", 'the gate runs exactly on main');
  assert.ok(!/continue-on-error/.test(gate), 'no step or job of the gate may continue on error');
  assert.ok(/BUILD_STRICT:\s*'1'/.test(gate) && /run:\s*npm run build\b/.test(gate), 'the gate builds with BUILD_STRICT');
  assert.ok(/run:\s*npm run smoke:lite -- dist\b/.test(gate), 'the gate runs the smoke on dist');
  assert.ok(gate.indexOf('npm run build') < gate.indexOf('smoke:lite'), 'the build comes before the smoke');
  assert.ok(/timeout-minutes:\s*\d+/.test(gate), 'the gate has a time limit');
  assert.ok(/\bsetup-browser\b/.test(gate), 'the gate has a browser for the smoke');
});

test('the preview branch deploys at once; the gate is main-only', () => {
  const deploy = pageJobs.deploy;
  assert.ok(alternativesOfPreview(deploy), 'the preview alternative stays');
  assert.ok(!needsOf(pageJobs.validate || '').length, 'validate needs nothing');
});
function alternativesOfPreview(deploy) {
  return alternatives(ifOf(deploy)).some((a) => a.includes(`github.ref_name == '${PREVIEW_BRANCH}'`) && /needs\.validate\.result == 'skipped'/.test(a));
}

test('the pull-request CI: the smoke waits for the build alone, so a lint failure cannot hide it', () => {
  const jobs = jobsOf(read('ci.yml'));
  assert.deepEqual(needsOf(jobs.smoke), ['build'], 'smoke needs the build only (not the lint or the unit tests)');
  assert.ok(/BUILD_STRICT:\s*'1'/.test(jobs.build) && /run:\s*npm run build\b/.test(jobs.build), 'CI builds strict');
  assert.ok(/run:\s*npm run smoke:lite -- dist\b/.test(jobs.smoke), 'CI runs the smoke on the build');
  assert.ok(!/continue-on-error/.test(jobs.smoke), 'the smoke may not continue on error');
  assert.ok(!/run:\s*npm run (build|smoke)/.test(jobs.quick), 'the lint job runs no build or smoke: they must not sit behind it');
});
