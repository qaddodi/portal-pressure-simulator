// What a slide's data card holds beside its instrument: the tiles it shows, and whether the card is the instrument alone.
// These are the pure parts, so a test can run them over every talk (presenter.js dataIn builds the card from them).

// (A chart over the days already draws its two lines from where they started to where they are, numbers and all: on a laptop
// or tablet, where the chart is always in view beside the tiles, tiles for those two would repeat it. A ladder already brackets the
// HVPG and PPG: tiles there would repeat them, rounded differently.)
// (An instrument that already shows a number large, in its own picture, never has that number again in its card's header row (Mohammad, 7 Nov 2026:
// "for fibroscan instrument cards, no need to remention the stiffness in the numbers above; redundant"): the FibroScan its stiffness (the liver's
// lsm, or on the spleen probe the spleen's ssm), the bedside monitor each of the vitals it shows. On a phone too: there the number is as big.)
export const shownBy = (s) => {
  const t = s?.tool;
  if (!t) return [];
  if (t.kind === 'fibroscan') return [t.organ === 'spleen' ? 'ssm' : 'lsm'];
  if (t.kind === 'vitals') return Array.isArray(t.show) ? t.show : [];
  return [];
};
export const ownKeys = (s, onPhone) => (s.tiles || []).filter((k) => !(s.tool?.kind === 'flowtime' && s.tool.lines?.includes(k) && !onPhone && !s.tool.keepTiles) && !shownBy(s).includes(k));
export const tileKeys = (s, onPhone) => [...ownKeys(s, onPhone), ...(s.scopeTile ? ['scope'] : []), ...(s.hvpgResp && !s.tiles?.includes('hvpgFall') ? ['hvpgFall'] : [])];

// An instrument card is one card, one fixed size, whatever readings go with it (Mohammad, 7 Nov 2026: "get rid of tucking untucking card").
// Its readings are numbers only in the card's header row, beside its name (headKeys, bigTiles' head); no readings card stands behind it,
// there is no handle, and nothing slides out or away. So every slide with an instrument is an instrument card.
export const toolOnly = (s) => !!s?.tool;
/** The readings that stand in an instrument card's header row: its tiles but for the endoscopic view, a picture (the scope ring gives that). */
export const headKeys = (s, onPhone) => (s?.tool && s.data ? tileKeys(s, onPhone).filter((k) => k !== 'scope') : []);
