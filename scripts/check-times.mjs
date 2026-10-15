// Refreshes tests/e2e/check-times.json, each browser check's own time on a CI runner, from the logs of a checks run.
// smoke.mjs fills its shares from these times, so a share's length on a runner matches its plan.
//
//   node scripts/check-times.mjs job1.txt job2.txt ...   (the browser-checks jobs' logs, as GitHub serves them: timestamped lines)
//
// A passing check counts its own "(N ms)"; a failing one the time since the line before it, its retry included, since a check
// that fails costs that much on every run until it is fixed. Checks not in the logs keep their old time.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const file = new URL('../tests/e2e/check-times.json', import.meta.url);
const times = JSON.parse(readFileSync(file, 'utf8'));
// Every check's name, from the plan itself (SMOKE_PLAN=list prints "share minutes name" without opening a browser).
const names = { desktop: [], phone: [] };
for (const device of Object.keys(names)) {
  const out = execFileSync('node', [new URL('../tests/e2e/smoke.mjs', import.meta.url).pathname], { env: { ...process.env, SMOKE_PLAN: 'list', SMOKE_DEVICE: device }, encoding: 'utf8' });
  names[device] = out.split('\n').slice(1).map((l) => l.split(' ').slice(2).join(' ')).filter(Boolean).sort((a, b) => b.length - a.length);
}
const fresh = {};
for (const path of process.argv.slice(2)) {
  let last = null;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const ts = Date.parse(line.slice(0, 23) + 'Z');   // (GitHub's stamps carry seven decimals: milliseconds are enough)
    if (/Run npm run smoke|> node tests\/e2e\/smoke\.mjs/.test(line)) { last = ts; continue; }
    const m = /^\S+ (ok|FAIL|RETRY)\s+(desktop|phone)\s+(.*)$/.exec(line);
    if (!m) continue;
    const [, how, device, rest] = m, name = names[device].find((n) => rest.startsWith(n));
    const own = how === 'ok' && /\((\d+) ms\)$/.exec(rest);
    const ms = own ? +own[1] : Number.isFinite(last) && Number.isFinite(ts) ? ts - last : 0;
    last = ts;   // (also after a check no longer in the plan, renamed or split: the next one's time starts here)
    if (!name) continue;
    fresh[`${device} ${name}`] = (fresh[`${device} ${name}`] || 0) + ms / 1000;
  }
}
for (const [k, v] of Object.entries(fresh)) times[k] = Math.round(v);
writeFileSync(file, JSON.stringify(Object.fromEntries(Object.entries(times).sort()), null, 0).replace(/^\{/, '{\n').replace(/,"/g, ',\n"').replace(/\}$/, '\n}') + '\n');
console.log(`${Object.keys(fresh).length} checks timed from ${process.argv.length - 2} log(s)`);
