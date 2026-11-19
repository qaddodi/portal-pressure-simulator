// Replaying a bug packet in Node, no browser: the page's own DOM (jsdom), the WebGL stand-in of the warm harness, a clock moved by hand (tests/gallery-node.js),
// the app's own model (the worker's core) and its own modules, then the screen report (src/ui/screen) and its rules over that page.
//
// What this can say: the patient, what was changed from it, the view, selection, lens, labels and look, the words and numbers of the cards (a teaching card of a
// slide, a Tests-card pane, a structure card), whatever the figure's, labels' and charts' readers take from the store and the painters' own records, and the rules over them.
// What it cannot: layout (jsdom has no boxes: the fit rules then say "no layout"), shaders, pictures, timing, the camera's glide. Those are the headless layout run's
// (scripts/packet-headless.mjs) or the device's (press the button again after the fix and run `compare`).
//
//   const env = await makeEnv({ packet }); await replayPacket(packet, env)
import { boot, mainRig, slideRig, run } from '../tests/gallery-node.js';

const noBox = () => ({ x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 });

export async function makeEnv({ packet } = {}) {
  const { page } = await boot();
  const { store } = await import('../src/ui/store.js');
  const { buildScreen } = await import('../src/ui/screen/build.js');
  const { applyLookAttrs } = await import('../src/ui/looks.js');
  const main = await mainRig();
  const x0 = packet?.state?.x || {};
  const vw = x0.vw || 1440, vh = x0.vh || 900;
  const win = globalThis.window;
  const io = { box: noBox, rects: () => [], style: (el) => getComputedStyle(el), metric: (el, k) => (el === win ? { innerWidth: vw, innerHeight: vh }[k] : el?.[k] ?? 0), ctm: () => null };
  let open = null, deckRig = null, position = null, sel = null;
  const pps = { store, get presenter() { return { position: () => position, busy: () => false }; }, card: main.card, dock: main.dock };

  async function apply(state) {
    const s = state.share || {}, x = state.x || {}, skipped = [];
    const preset = s.preset || 'healthy';
    if (open) { await open.close(); open = null; position = null; }
    if (state.script) {
      const { DECKS } = await import('../src/ui/decks.js');
      const deck = DECKS.find((d) => d.id === state.script) || (state.script === 'test-gallery' ? (await import('../src/ui/gallery/deck.js')).galleryDeck() : null);
      if (!deck) skipped.push(`the talk "${state.script}" is not in this build`);
      else {
        const { deckStatesFull } = await import('../tests/deck-states.js');
        deckRig = await slideRig(deck, await deckStatesFull(deck));
        const i = Math.min(Math.max(0, (state.slide || 1) - 1), deck.slides.length - 1);
        open = await deckRig.open(i);
        position = { id: deck.id, at: i };
        store.set({ presenting: true });
      }
    } else if (s.sel) { sel = await main.pick({ preset, params: s.params, sel: s.sel }); open = { close: sel.close }; }
    else if (x.dock?.length) await main.pane({ preset, params: s.params, pane: x.dock[0] });
    else await main.patient(preset, s.params);
    const { setViewKey } = await import('../src/ui/store.js');
    setViewKey(x.sinusoid ? 'sinusoid' : x.lobule ? 'lobule' : s.view === 'circuit' ? 'circuit' : 'anatomy');   // (the one writer of the view fields)
    const patch = {};
    if (x.lens) patch.colorMode = x.lens;
    if (x.labels) patch.labelLevel = x.labels;
    if (x.layers) patch.layers = { ...store.get().layers, ...x.layers };
    if (Object.keys(patch).length) store.set(patch);
    if (x.look) applyLookAttrs(page.document.documentElement, x.look);
    if (s.cam) skipped.push('camera: the stage is not built in Node (its framing is the headless run\'s)');
    return { skipped };
  }
  return {
    name: 'node', apply,
    settle: () => run(6),
    screen: () => buildScreen({ pps, io, doc: page.document, win, history: undefined }),
    async judgeHistory(history) { return (await import('../src/ui/watch/replay.js')).replayHistory(history); },
    async close() { if (open) await open.close(); },
  };
}
