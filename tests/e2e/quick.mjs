// Quick presenter layout check before a push: the words' card and data card (text-card.mjs) and the framing (frame-centre.mjs)
// on a few decks at Mac and upright iPad sizes, motion instant and each slide reached directly (fast.mjs). CI runs the rest.
//
//   npm run smoke:quick                         (doppler, hvpg, ascites at mac,ipad)
//   DECKS=circuit,shunts DEVS=mac,ipadL npm run smoke:quick
import { spawnSync } from 'node:child_process';
const env = { ...process.env, DECKS: process.env.DECKS || 'doppler,hvpg,ascites', DEVS: process.env.DEVS || 'mac,ipad' };
let code = 0;
for (const f of ['text-card.mjs', 'frame-centre.mjs']) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [new URL(f, import.meta.url).pathname], { env, stdio: 'inherit' });
  console.log(`${f}: ${r.status ? 'FAILED' : 'passed'} in ${Math.round((Date.now() - t0) / 1000)} s (${env.DECKS} at ${env.DEVS})`);
  code ||= r.status ?? 1;
}
process.exit(code);
