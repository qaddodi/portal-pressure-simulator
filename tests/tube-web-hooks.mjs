// A module-loader hook for tests/tube-web-capture.mjs (brief S2-J): it adds one line to the stage's vessel layer as it is loaded in a node process, handing the
// tubes and joins it gives binVeins to a global the capture reads. The app's files on disk are not touched; nothing here runs in the app.
export async function load(url, context, nextLoad) {
  const res = await nextLoad(url, context);
  if (!url.endsWith('/src/ui/stage-vessels.js')) return res;
  const src = String(res.source);
  const at = 'const bins = binVeins(binList, J, binMemo);';
  if (!src.includes(at)) throw new Error('tube-web-hooks: stage-vessels.js no longer calls binVeins as expected');
  const spy = `${at} (globalThis.__binSpy ||= []).push({ tubes: binList.map((t) => ({ id: t.id, pts: t.pts.map((p) => [p[0], p[1]]), reach: t.reach })), joins: J.map((j) => ({ x: j.x, y: j.y, reach: j.reach, k: j.k, fillet: j.fillet, members: j.members.slice(), trunk: j.trunk, fork: j.fork })) });`;
  return { ...res, source: src.replace(at, spy) };
}
