// The figure's labels keep off the cards (3 Nov 2026: on the iPhone's Doppler slide 4, the organ label "SMALL BOWEL" stood over the
// teaching card's text). On a talk slide, in a real browser on the GPU path (scripts/shoot.mjs), once the slide's cards have landed:
// every figure label shown (an organ's name, a station's reading, a lane's caption) is clear of every card that is shown
// (.stage-blocker, .pz-shade: the same list the labels keep out of, stage.js BLOCKER_SEL), by at least 1 px. R17: the labels are the GPU's
// displayed pictures (stage.labelSnapshot: bounds and opacity of what the last frame drew), never the SVG groups' boxes. A snapshot with no
// label drawn is INCONCLUSIVE (exit 2), not a pass.
//
//   node tests/e2e/labels-off-cards.mjs                       (iPhone, tips-doppler slide 4, the repository's source)
//   DEV=mac SLIDE=3 DECK=hvpg DIR=dist node tests/e2e/labels-off-cards.mjs
import { openApp } from '../../scripts/shoot.mjs';
import { labelsOverCards } from './label-judge.mjs';

const DECKS = (process.env.DECK || 'tips-doppler').split(','), SLIDES = (process.env.SLIDE || '4').split(','), DEVS = (process.env.DEV || 'iphone').split(',');
const fails = [], unsure = [];

const READ = () => {
  const shown = (e) => { const cs = getComputedStyle(e); return !e.hidden && cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0.05; };
  const cards = [...document.querySelectorAll('.stage-blocker:not([hidden]), .pz-shade')].filter(shown).filter((e) => !e.classList.contains('pz-leave')).map((e) => {
    const r = e.getBoundingClientRect();
    return { cls: e.className.toString().split(' ').slice(0, 2).join('.'), x0: r.left, y0: r.top, x1: r.right, y1: r.bottom };
  }).filter((c) => c.x1 > c.x0 && c.y1 > c.y0);
  const snap = window.pps.stage.labelSnapshot();
  const labs = snap.items.filter((l) => l.a > 0.05);
  return { cards, labs, seq: snap.seq, gen: snap.gen, items: snap.items };
};

export function overlaps({ cards, items }, tag) {
  return labelsOverCards({ items }, cards).map((o) => `${tag}: label ${o.key} is over the card ${o.card}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const dev of DEVS) for (const deck of DECKS) for (const slide of SLIDES) {
    const app = await openApp({ device: dev, theme: 'dark', query: `?script=${deck}&slide=${slide}`, dir: process.env.DIR || '.' });
    try {
      await app.settle({ wait: 20, vessels: false });
      const r = await app.page.evaluate(READ);
      const o = overlaps(r, `${dev} ${deck} ${slide}`);
      if (!r.labs.length) { unsure.push(`${dev} ${deck} ${slide}: no label drawn in the snapshot (frame ${r.seq}), nothing to judge`); console.log(`INCONCLUSIVE ${unsure.at(-1)}`); }
      console.log(`${dev} ${deck} slide ${slide}: ${r.labs.length} labels, ${r.cards.length} cards, ${o.length} over a card`);
      for (const m of o) { fails.push(m); console.log(`FAIL ${m}`); }
      if (process.env.SHOT) await app.page.screenshot({ path: `${process.env.SHOT}-${dev}-${deck}-${slide}.png` });
    } finally { await app.close(); }
  }
  console.log(fails.length ? `${fails.length} problems` : unsure.length ? 'INCONCLUSIVE' : 'labels off the cards ok');
  process.exit(fails.length ? 1 : unsure.length ? 2 : 0);
}
