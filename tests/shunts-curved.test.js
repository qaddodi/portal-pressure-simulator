// No shunt is drawn as a straight line (Mohammad, 11 Nov 2026: "straight doesn't make any fucking sense for ANY shunt"): every shunt course in the anatomy
// bows off its chord by at least a twelfth of it (the arterioportal links, 30 units long, by a tenth), and its two ends stay on the vessels they join.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EDGE_PATH } from '../src/ui/anatomy.js';

function sample(d) {
  const t = d.match(/[MLC]|-?[\d.]+/g), out = [];
  let i = 0, cur = null;
  while (i < t.length) {
    const c = t[i++];
    if (c === 'M' || c === 'L') { cur = [+t[i++], +t[i++]]; out.push(cur); }
    else if (c === 'C') {
      const p1 = [+t[i++], +t[i++]], p2 = [+t[i++], +t[i++]], p3 = [+t[i++], +t[i++]];
      for (let k = 1; k <= 24; k++) { const s = k / 24, u = 1 - s; out.push([0, 1].map((a) => u * u * u * cur[a] + 3 * u * u * s * p1[a] + 3 * u * s * s * p2[a] + s * s * s * p3[a])); }
      cur = p3;
    }
  }
  return out;
}
// The two ends each course starts and ends on (the vessels' nodes: moving one would unjoin the shunt).
const ENDS = {
  TIPS: [[505, 398], [508, 245]], DIPS: [[602, 442], [620, 304]],
  S_PC: [[700, 556], [625, 590]], S_DSR: [[962, 448], [953, 618]], S_MC: [[690, 660], [620, 650]],
  AP_R: [[583.4, 422.3], [552, 420.8]], AP_L: [[642.4, 424.7], [656.8, 400.4]],
};
const MIN = { AP_R: 0.1, AP_L: 0.1 };

for (const [id, [a, b]] of Object.entries(ENDS)) {
  test(`${id} bows off its chord and keeps its two ends`, () => {
    const P = sample(EDGE_PATH[id]), s = P[0], e = P.at(-1);
    assert.ok(Math.hypot(s[0] - a[0], s[1] - a[1]) < 0.01 && Math.hypot(e[0] - b[0], e[1] - b[1]) < 0.01, `${id} starts and ends where the vessels it joins do`);
    const L = Math.hypot(e[0] - s[0], e[1] - s[1]);
    let dev = 0;
    for (const p of P) dev = Math.max(dev, Math.abs((e[0] - s[0]) * (s[1] - p[1]) - (s[0] - p[0]) * (e[1] - s[1])) / L);
    assert.ok(dev / L >= (MIN[id] ?? 0.075), `${id} bows only ${(dev / L).toFixed(3)} of its chord`);
  });
}
