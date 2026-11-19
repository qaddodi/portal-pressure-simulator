// Outline to the first slide (Mohammad's recording, 19 Nov 2026: "cards appear randomly"): the outline's panel leaves for a words slide with pz-leave and is not hidden until
// its fade is done (textIn, panelGoTok). cardsIn read pz-leave as "waiting to come in" and, when it ran before that timer, threw the old outline back in beside the new words for
// a few frames. A panel that is going away is never brought in; only a visual slide's panel (which clears panelGoTok) is. Moved here from tests/panel-leaving-not-thrown-in.test.js
// (a test that read the presenter's text: PR-02 keeps those as rules, with their reason).
const W = 'A panel leaving for a words slide is not thrown back in (19 Nov 2026):';
const cardsIn = (text) => { const i = text.indexOf('function cardsIn(at)'); return i < 0 ? null : text.slice(i, text.indexOf('// (A data card or panel coming in', i)); };
const inCardsIn = (re, want) => ({ test: (text) => { const b = cardsIn(text); return b !== null && re.test(b) === want; }, toString: () => `in cardsIn: ${want ? '' : 'no '}${re}` });
export default [
  { file: 'src/ui/presenter*', need: [inCardsIn(/if \(!panelGoTok\) cardIn\(ui\.panel, 'pz-leave'\);/, true), `${W} cardsIn brings the panel in only when no leave is under way`] },
  { file: 'src/ui/presenter*', need: [inCardsIn(/(?<!if \(!panelGoTok\) )cardIn\(ui\.panel/, false), `${W} no other cardIn of the panel in cardsIn`] },
  { file: 'src/ui/presenter*', need: [/const tok = live\.panelGoTok = \{\};/, `${W} the leaving panel's token is set when it leaves for a words slide`] },
  { file: 'src/ui/presenter*', need: [/live\.panelGoTok = null;\s*\/\/ \(a panel still fading out/, `${W} a visual slide taking the panel back clears the token`] },
  { file: 'src/ui/presenter*', need: [/if \(live\.panelGoTok !== tok\) return; live\.panelGoTok = null;/, `${W} the fade's end clears its own token only`] },
];
