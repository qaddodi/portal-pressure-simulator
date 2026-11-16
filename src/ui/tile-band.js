// A data card tile's band, applied: its word, and its colour on the tile and on the header reading (data-rate), and the GPU numbers told, which read their ink once
// and keep it. (A number drawn after its tile changed band was drawn in the colour of the band before: 16 Nov 2026, 35.5 in the green of Normal beside "High".)
// The band the number on show reads is the tile's own rating of it: a band that has waited long on a number that keeps moving is taken once the number is in it (band-settle.js).

/** Applies band `rate` and its `word` to the tile part p (presenter-cards.js buildTiles): p.tile, p.r (the word), p.hi (the header reading), p.vw and p.hw (their GPU words). */
export function paintBand(p, word, rate) {
  const changed = p.rate !== rate;
  p.rate = rate;
  if (p.r.textContent !== word) p.r.textContent = word;
  if (p.tile.getAttribute('data-rate') !== rate) p.tile.setAttribute('data-rate', rate);
  if (p.hi && p.hi.getAttribute('data-rate') !== rate) p.hi.setAttribute('data-rate', rate);
  if (changed) { p.vw?.recolor(); p.hw?.recolor(); }
}

/** The band the number v (the model's units) on tile part p reads: rated as the tile prints it, the slide's other readings as p.f has them. rated(k, f): the tile's rating, [band, word]. */
export function shownBand(p, v, rated, tileShown) {
  const sc = p.sc || (p.sc = {});   // alloc-rare: once per tile, only while a band waits on a number that keeps moving
  Object.assign(sc, p.f); sc[p.k] = tileShown(p.k, v);
  return rated(p.k, sc)[0] || 'plain';
}
