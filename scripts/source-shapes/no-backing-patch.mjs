// No halo, glow or backing patch behind vessels (Mohammad, 15 Nov 2026: "a halo or patch of skin around the umbilicus"; 13 Nov: no glows or halos on vessels).
// The caput medusae's veins stand on the bare figure. The cause was an SVG ellipse filled with a radial skin gradient (stage.js abdWall, eased in with
// the caput by abdTo); a patch of that kind, or any new radial gradient in the figure's defs, fails lint.
export default [
  { file: 'src/ui/stage*', forbid: [/abd-wall|abdWall|abdTo|abdFade|url\(#skin\)|id="skin"/, 'no abdominal-wall skin tint under the caput medusae'] },
  { file: 'styles/app.css', forbid: [/\.abd-wall|\.sk-(in|mid|out)\b/, 'no skin-tint rules'] },
  { file: 'styles/tokens.css', forbid: [/--skin\b/, 'no skin colour token (nothing is tinted round the navel)'] },
  { file: 'src/ui/theme-tokens.js', forbid: [/'skin'\s*:/, 'no skin colour token (nothing is tinted round the navel)'] },
  // Every radial gradient in the figure is an organ's own shading (congest, orgForm, ogVol, caudDome, lvSheen): a new one, a disc behind vessels, must be named here on purpose.
  { file: ['src/ui/stage.js', 'src/ui/stage-organs.js'], forbid: [/<radialGradient id="(?!congest"|orgForm"|ogVol"|caudDome"|lvSheen")/, 'a radial gradient that is not an organ\'s shading: no backing patch, disc or halo under vessels'] },
  // The navel is a small ring only; caputK drives the ring and the veins, never a tint.
  { file: 'src/ui/anatomy.js', need: [/id: 'umbilicus', cls: 'org-umbilicus', circle: \[\d+, \d+, [1-6]\]/, 'the navel is a ring of a few units, not a disc'] },
  { file: 'src/ui/stage-diaphragm.js', forbid: [/caputK[^;\n]*(opacity|tint|glow|fade)/i, 'caputK drives the navel ring and the veins only'] },
];
