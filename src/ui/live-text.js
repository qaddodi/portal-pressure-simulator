// Words in a card that change while they show: a what-if slider's value, a time-lapse's day count. They are set in a box as wide
// as the widest words they will ever take, the live words at its right, so the line they stand on never reflows as a digit comes
// or goes (Mohammad, 26 Oct: on a phone the teaching card's text jittered while a slider moved). The box's own words are a hidden
// copy of the widest text (the live ones are what a screen reader reads), laid over each other in one grid cell: styles/app.css .pzv.
import { h } from './util.js?v=8d39a24839';

/** The longest of some words (the first of equals): with the tabular figures every digit is as wide as another, so the longest
 *  string is the widest. */
export const widest = (texts) => texts.reduce((a, t) => (String(t).length > a.length ? String(t) : a), '');

/** A live words box: its element (tag, class) and a setter for the words that show. The box is as wide as the widest of `texts`. */
export function liveText(tag, cls, texts, first = '') {
  const live = h('span', { class: 'pzv-t' }, first);
  const el = h(tag, { class: `${cls} pzv` }, h('span', { class: 'pzv-s', 'aria-hidden': 'true' }, widest(texts)), live);
  return { el, set: (t) => { if (live.textContent !== t) live.textContent = t; } };
}

/** The words a card's fit depends on: its text with every live part left out (their box is reserved, so what they say never
 *  changes the card's layout, and a card is not fitted again for a digit). */
export function wordsOf(node) {
  let t = '';
  for (const n of node.childNodes) t += n.nodeType === 3 ? n.data : n.classList?.contains('pzv-t') ? '' : wordsOf(n);
  return t;
}
