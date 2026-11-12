// The splenorenal shunts (the spontaneous C6, the Warren shunt S_DSR) leave the splenic vein, which sits in the portal tree's tier. In a lower tier their end ran under the vein's wall and the
// wall's dark outline crossed the mouth (Mohammad, 12 Nov 2026: "should be connected at its ends, not separated by lines"). They are drawn in the vein's tier, as the TIPS is (`over`).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('C6 and S_DSR are drawn over the network, in the portal tree\'s tier, like the TIPS and the DIPS', () => {
  const s = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
  assert.match(s, /for \(const id of \['TIPS', 'DIPS', 'C6', 'S_DSR'\]\) if \(E\[id\]\) E\[id\]\.over = true;/);
  assert.match(s, /x\.front \|\| x\.over \? TIER_FRONT : TIER_NET/, 'over puts a vessel in the front tier');
});
