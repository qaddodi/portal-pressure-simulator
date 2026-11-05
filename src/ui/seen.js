// Is the stage seen at all? (Render-cost plan item 1, 5 Nov 2026: "stop rendering things that are hidden".) One answer for every loop that
// draws on the stage: the anatomy's, the lobule's and the sinusoid's. Each used to ask its own questions (the page hidden, the home screen),
// and none knew about the presenter's black screen (.pz-black, presenter.js toggleBlack: fixed, inset 0, opaque), under which the figure,
// the lobule, the sinusoid and the glass all kept drawing. A loop that finds the stage covered draws nothing and sleeps; it is woken by
// what uncovers it (the class change on #app, the page's visibility) or looks again a few times a second, and draws the state as it is
// then: the model runs on in its worker the whole time, so nothing is replayed and nothing jumps.

let appEl = null, appDoc = null;
const app = (doc) => (appDoc === doc && appEl?.isConnected ? appEl : ((appDoc = doc), (appEl = doc.getElementById?.('app') || null)));

/** Why the stage cannot be seen now ('' when it can): 'page hidden', 'home', 'black screen'. Reads classes only, never layout. */
export function stageCoveredBy(doc = globalThis.document) {
  if (!doc) return '';
  if (doc.hidden) return 'page hidden';
  const a = app(doc);
  if (!a) return '';
  const c = a.classList;
  if (c.contains('home-open')) return 'home';
  if (c.contains('pz-blacked')) return 'black screen';
  return '';
}
/** True when the stage is covered (stageCoveredBy says why). */
export const stageCovered = (doc) => stageCoveredBy(doc) !== '';
