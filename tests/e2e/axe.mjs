// Accessibility pass (PR-24): axe-core on the live app, failing only on violations the baseline does not know, plus the twin check:
// every label the GPU draws (a `data-gl` element) must still carry its text in the page, because that hidden DOM element is what a
// screen reader reads. axe-core is installed by the CI step (npm i --no-save axe-core), not kept in package.json.
//
//   node tests/e2e/axe.mjs                  compare with tests/e2e/axe-baseline.json (no file: report only, pass)
//   AXE_WRITE=1 node tests/e2e/axe.mjs      write the baseline from what the page shows now
//   DEVS=mac,phone  THEMES=light,dark
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { openApp } from '../../scripts/shoot.mjs';

const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const BASE = new URL('./axe-baseline.json', import.meta.url).pathname;
const base = existsSync(BASE) ? JSON.parse(readFileSync(BASE, 'utf8')) : null;
const found = {};
let bad = 0;

for (const device of (process.env.DEVS || 'mac,phone').split(',')) {
  for (const theme of (process.env.THEMES || 'light,dark').split(',')) {
    const app = await openApp({ device, theme });
    try {
      await app.page.waitForTimeout(3000);
      await app.page.evaluate(AXE);
      const res = await app.page.evaluate(async () => {
        const r = await window.axe.run(document, { resultTypes: ['violations'] });
        return r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, sample: v.nodes[0]?.target?.join(' ') }));
      });
      const key = `${device}-${theme}`;
      found[key] = Object.fromEntries(res.map((v) => [v.id, v.nodes]));
      for (const v of res) {
        const known = base?.[key]?.[v.id];
        const fresh = base && (known === undefined || v.nodes > known);
        console.log(`${fresh ? 'NEW ' : '    '}${key} ${v.id} (${v.impact}) x${v.nodes} e.g. ${v.sample}`);
        if (fresh) bad++;
      }
      // The twin check: a drawn label with no text in the page is invisible to a screen reader.
      const empty = await app.page.evaluate(() => [...document.querySelectorAll('[data-gl]')].filter((e) => !(e.textContent || '').trim() && !e.getAttribute('aria-label')).map((e) => e.id || e.className?.baseVal || e.className || e.tagName).slice(0, 10));
      if (empty.length) { console.log(`NEW ${device}-${theme} twin: ${empty.length}+ drawn labels without text`, empty); bad++; }
    } finally { await app.close(); }
  }
}
if (process.env.AXE_WRITE) { writeFileSync(BASE, JSON.stringify(found, null, 1) + '\n'); console.log('baseline written'); }
else if (!base) console.log('no baseline yet: report only (AXE_WRITE=1 writes one)');
process.exit(bad ? 1 : 0);
