// A tile's name never runs out of its tile (17 Nov 2026, play-test finding 7): the fit goes long name, short name, then wraps. Pattern gone = the code changed: look before editing.
export default [
  { file: 'src/ui/presenter-zoom.js', need: [/classList\.remove\('short', 'wrap'\)/, 'The fit clears both steps before it measures a tile name again'] },
  { file: 'src/ui/presenter-zoom.js', need: [/for \(const k of wraps\) k\.classList\.add\('wrap'\)/, 'A name still wider than its tile in its short form wraps instead of clipping on both sides ("Liver blood flow, % of healthy" beside "Encephalopathy risk")'] },
  { file: 'styles/app-09-tests.css', need: [/\.pzt-k\.wrap \{ --tk-ws: normal;[^}]*overflow-wrap: anywhere/, 'The wrapped name breaks inside its tile (the one white-space rule reads --tk-ws, so no second !important)'] },
];
