// Loading the lobule: code, ready, lost
// (moved out of stage.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)

export function createLobuleLoad(_st, live) {
  // (The code is fetched as soon as the figure is shown; the layer is built a moment later, when the page is quiet, or at once for a dive.)
  const lobuleCodeLost = (err) => { live.lzCode = null; throw err; };
  const lobuleCode = () => (live.lzCode ||= import('./lobule-zoom.js').catch(lobuleCodeLost));
  const lobuleLoadLost = (err) => { live.lzLoad = null; throw err; };
  function lobuleReady() {
    return (live.lzLoad ||= lobuleCode().then(live.lobuleBuilt, lobuleLoadLost));
  }
  return { lobuleCode, lobuleReady };
}
