// The figure's labels keep off the cards (3 Nov 2026: on the iPhone's Doppler slide 4, the organ label "SMALL BOWEL" stood over the
// teaching card's text). On a talk slide, in a real browser on the GPU path (scripts/shoot.mjs), once the slide's cards have landed:
// every figure label shown (an organ's name, a station's reading, a lane's caption) is clear of every card that is shown
// (.stage-blocker, .pz-shade: the same list the labels keep out of, stage.js BLOCKER_SEL), by at least 1 px.
//
//   node tests/e2e/labels-off-cards.mjs                       (iPhone, tips-doppler slide 4, the repository's source)
//   DEV=mac SLIDE=3 DECK=hvpg DIR=dist node tests/e2e/labels-off-cards.mjs
import { openApp } from '../../scripts/shoot.mjs';

const DECKS = (process.env.DECK || 'tips-doppler').split(','), SLIDES = (process.env.SLIDE || '4').split(','), DEVS = (process.env.DEV || 'iphone').split(',');
const fails = [];

const READ = () => {
  const shown = (e) => { const cs = getComputedStyle(e); return !e.hidden && cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0.05; };
  const cards = [...document.querySelectorAll('.stage-blocker:not([hidden]), .pz-shade')].filter(shown).filter((e) => !e.classList.contains('pz-leave')).map((e) => {
    const r = e.getBoundingClientRect();
    return { cls: e.className.toString().split(' ').slice(0, 2).join('.'), x0: r.left, y0: r.top, x1: r.right, y1: r.bottom };
  }).filter((c) => c.x1 > c.x0 && c.y1 > c.y0);
  const labs = [...document.querySelectorAll('.lb-blocks g.lb')].filter((g) => !g.classList.contains('lb-off') && g.style.display !== 'none' && !g.classList.contains('hide') && +getComputedStyle(g).opacity > 0.05).map((g) => {
    const r = g.getBoundingClientRect();
    return { key: g.dataset.key, text: g.textContent.slice(0, 24), x0: r.left, y0: r.top, x1: r.right, y1: r.bottom };
  }).filter((l) => l.x1 > l.x0);
  return { cards, labs };
};

export function overlaps({ cards, labs }, tag) {
  const out = [];
  for (const l of labs) for (const c of cards) {
    if (l.x0 < c.x1 - 1 && l.x1 > c.x0 + 1 && l.y0 < c.y1 - 1 && l.y1 > c.y0 + 1) out.push(`${tag}: label "${l.text}" (${l.key}) is over the card ${c.cls}`);
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const dev of DEVS) for (const deck of DECKS) for (const slide of SLIDES) {
    const app = await openApp({ device: dev, theme: 'dark', query: `?script=${deck}&slide=${slide}`, dir: process.env.DIR || '.' });
    try {
      await app.settle({ wait: 20, vessels: false });
      const r = await app.page.evaluate(READ);
      const o = overlaps(r, `${dev} ${deck} ${slide}`);
      console.log(`${dev} ${deck} slide ${slide}: ${r.labs.length} labels, ${r.cards.length} cards, ${o.length} over a card`);
      for (const m of o) { fails.push(m); console.log(`FAIL ${m}`); }
      if (process.env.SHOT) await app.page.screenshot({ path: `${process.env.SHOT}-${dev}-${deck}-${slide}.png` });
    } finally { await app.close(); }
  }
  console.log(fails.length ? `${fails.length} problems` : 'labels off the cards ok');
  process.exit(fails.length ? 1 : 0);
}
