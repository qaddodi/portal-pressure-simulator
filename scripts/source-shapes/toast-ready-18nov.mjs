// A toast is seen once its GPU picture is up (18 Nov 2026, the pane's first frame of a toast: visible, its words in the plain ink on the plain card, .wgl not yet .wgl-on, then the picture replaced them next frame).
// Held by widget-ready.js enterWhenReady like every other surface (cards, sheets, menus, the details face, the deck's cards): nothing is shown half-built.
export default [
  { file: 'src/ui/util.js', need: [/t\._wgl\?\.paint\(\);\s+\/\/ \(Seen once its picture is up[^\n]*\n\s+enterWhenReady\(t, \(\) => \{ t\.style\.visibility = ''; \}\);/, 'A toast is held unseen (prep-hold) until its picture is up, then shown (18 Nov 2026)'] },
];
