// Production pass (31 Oct): localStorage and sessionStorage throw in a private window, with site data blocked, when the quota is full and
// under some embeds, so every access in the app sits inside a try (or a .catch). This reads every source file and names any that does not.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';

const files = (dir) => readdirSync(dir).flatMap((n) => { const p = `${dir}/${n}`; return statSync(p).isDirectory() ? files(p) : p.endsWith('.js') ? [p] : []; });
const root = new URL('../src', import.meta.url).pathname;

test('every localStorage and sessionStorage access in src/ is inside a try', () => {
  const bad = [];
  for (const p of files(root)) {
    const L = readFileSync(p, 'utf8').split('\n');
    L.forEach((l, i) => {
      if (!/\b(?:local|session)Storage\b\s*(?:\.\s*(?:getItem|setItem|removeItem|clear|key)\b|\[)/.test(l)) return;
      if (/^\s*(?:\/\/|\*)/.test(l)) return;
      const ctx = L.slice(Math.max(0, i - 6), i + 1).join('\n');
      if (!/\btry\b/.test(ctx) && !l.includes('.catch(')) bad.push(`${p.slice(root.length - 3)}:${i + 1}: ${l.trim().slice(0, 100)}`);
    });
  }
  assert.deepEqual(bad, []);
});

test('the scan itself sees accesses (it is not passing because it matches nothing)', () => {
  let n = 0;
  for (const p of files(root)) n += (readFileSync(p, 'utf8').match(/\b(?:local|session)Storage\b\s*\.\s*(?:getItem|setItem)\b/g) || []).length;
  assert.ok(n >= 20, `found ${n} accesses`);
});
