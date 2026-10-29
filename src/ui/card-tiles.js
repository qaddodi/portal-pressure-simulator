// What a slide's data card holds beside its instrument: the tiles it shows, and whether the card is the instrument alone.
// These are the pure parts, so a test can run them over every talk (presenter.js dataIn builds the card from them).

// (A chart over the days already draws its two lines from where they started to where they are, numbers and all: on a laptop
// or tablet, where the chart is always in view beside the tiles, tiles for those two would repeat it. A ladder already brackets the
// HVPG and PPG: tiles there would repeat them, rounded differently.)
export const ownKeys = (s, onPhone) => (s.tiles || []).filter((k) => !(s.tool?.kind === 'flowtime' && s.tool.lines?.includes(k) && !onPhone));
export const tileKeys = (s, onPhone) => [...ownKeys(s, onPhone), ...(s.hvpgResp && !s.tiles?.includes('hvpgFall') ? ['hvpgFall'] : [])];

// An instrument with no tiles to tuck behind it is a card of the instrument alone: no readings card, no handle, no stacked look.
// (Varices 3: a time-lapse chart whose tiles were its own two lines had `data: 'tiles'`, so the card stacked on a laptop with an
// empty readings card behind the chart; the handle opened nothing and only moved down.)
export const toolOnly = (s, onPhone) => !!s?.tool && !(s.data && tileKeys(s, onPhone).length);
