// Source shapes of the Doppler's unification (unification audit §4, 13 Nov 2026): one spectrum style, one synthesiser, one table of normals.
// The behaviour is tested in tests/doppler-fill.test.js and tests/doppler-normals.test.js; these are the shapes a module test cannot see.

const DOP = 'src/ui/doppler.js', DGL = 'src/ui/doppler-gl.js', SYN = 'src/ui/doppler-synth.js';
// (doppler.js's PROBES list and its stent reading, cut as the rules read them)
const slice = (a, b) => (text) => { const i = text.indexOf(a), j = text.indexOf(b, i + 1); return i < 0 || j < 0 ? null : text.slice(i, j); };
const probes = slice('const PROBES = [', '];'), tipsRead = slice("} else if (p.kind === 'tips') {", "} else if (p.kind === 'ivc') {");
const inPart = (cut, what, check) => ({ test: (text) => { const s = cut(text); return s != null && check(s); }, toString: () => what });

export default [
  // Every vessel in the main portal vein's style (the owner's standing rule): no flag picks another band shape or brightness curve.
  { file: DOP, forbid: [/venous/i, 'every vessel is drawn in the main portal vein\'s style: no venous flag picks another band'] },
  { file: DGL, forbid: [/venous/i, 'no venous uniform: the line shader has one band shape'] },
  { file: SYN, forbid: [/venous/i, 'the line shader has one band shape, the vein\'s'] },
  { file: DOP, need: ['const b = lineBand(av, g.k, jit, BAND), P = b.P;', 'lineParams takes its band from lineBand, which takes no vessel kind'] },
  { file: DOP, need: ['gpu.setCol(x, P, b.L, b.sigHi, b.sigLo,', 'the drawer is given lineBand\'s band as it is'] },
  // One synthesiser, the GPU's: no CPU line writer, ImageData ring or pixel upload of the spectrum.
  { file: DOP, forbid: [/function writeLine\(|new ImageData|ringCols|ringAll|const power = /, 'the spectrum\'s lines are made on the GPU alone (doppler-synth.js)'] },
  { file: DGL, forbid: [/ImageData|ringCols\(|ringAll\(/, 'no pixels of the spectrum sent up from the CPU'] },
  { file: DOP, need: ['const gs = onGpu && gpu.canSynth();', 'lines are drawn only where the GPU makes them; elsewhere the trace is black'] },
  { file: DGL, need: [/if \(stillCompiling\(gl, startedL2\(\)\)\) \{ waitingSynth = true;/, 'a frame that finds the line shader compiling marks that it drew no lines'] },
  { file: DGL, need: [/if \(waitingSynth\) \{ waitingSynth = false; try \{ onReady\?\.\(\); \}/, 'the monitor is drawn again once the line shader is published (a paused model has no next frame)'] },
  // A backfill's history is drawn into the ring's columns before the record (they were drawn black, with no sample), whatever order the
  // history and the first full draw come in: before, the left of a slide's sweep could stay black until it scrolled off (13 Nov 2026 shot).
  { file: DOP, need: ['if (buf.length) backTo = Math.max(backTo ?? -Infinity, buf[0][0]); else RK.ok = false;', 'a backfill marks the history\'s columns to be drawn again'] },
  { file: DOP, need: [/hTo = !full && backTo != null \? Math\.min\(lastCol, Math\.ceil\(backTo \* g\.cps\)\) : hFrom - 1;[\s\S]*?if \(hTo >= hFrom\) synthCols\(hFrom, hTo, g\);/, 'the next frame draws those columns again from the history'] },
  // One table of normals (velNormal.js PROBE_NORMAL): PROBES read it, and the stent's limits are its probe's normal.
  { file: DOP, need: [inPart(probes, 'every ranged probe reads PROBE_NORMAL by its own id', (s) => [...s.matchAll(/\{ id: '(\w+)'[^\n]*?normal: ([^,}]+)/g)].every((m) => m[2].trim() === 'null' || m[2].trim() === `PROBE_NORMAL.${m[1]}`)), 'the Doppler\'s ranges are the one table\'s'] },
  { file: DOP, forbid: [inPart(probes, 'a range literal in PROBES', (s) => /normal: \[/.test(s)), 'no range written again in PROBES'] },
  { file: DOP, forbid: [inPart(tipsRead, 'a literal stent limit in the stent reading', (s) => /\b190\b|\b90\b/.test(s)), 'the stent\'s limits are its probe\'s normal'] },
  { file: DOP, need: [inPart(tipsRead, 'hiV = normal[1] and jet > hiV in the stent reading', (s) => s.includes('const hiV = normal[1];') && s.includes('jet > hiV')), 'the stent\'s ceiling is read from its normal'] },
  { file: DOP, need: ['p.rangeNote = `Stent velocities <${p.normal[0]} or >${p.normal[1]} cm/s, or a change of >50 cm/s from the baseline scan, suggest stenosis.`', 'the stent note is made from its normal'] },
];
