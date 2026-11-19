// Glyph atlas bench (card gallery, plan 2.8): the GPU's text atlas as a picture, for the "black box behind a label" class of bugs.
//
// WHAT EXISTS ON THE CPU (read from the code, not run): the app keeps two glyph sets for GPU text, both as data in the bundle.
//   - the SDF atlas (glyphs-inter.js, its PNG in glyphs-inter-png.js, the big readouts' field in glyphs-inter-display*.js), read only through
//     text-gl.js `sdfAtlas`: a real picture (PNG data URL, 1024 px wide), the metrics of each glyph's cell in it, and each glyph's ink in bands.
//     The chart and readout text (trace-gl.js, vitals-gl.js) is drawn from it, uploaded once as a texture.
//   - Inter's outlines (glyph-data.js), which the shape drawer fills for the figure's labels (label-gl.js, text-gl.js textPolys).
// The LABEL pictures' atlas (label-gl.js, atlas-pack.js: two 2048 px pages) is painted on the GPU and copied on the GPU (copyTexSubImage2D);
// no pixel of it ever exists on the CPU, and reading one back needs readPixels, which this page does not do (nor does it make a GL context:
// WebKit keeps about 16). So this bench shows the SDF picture the app itself holds, plus a second picture made here from the metrics.
//
// The second picture is a raster of CPU data written by encodePng below (grayscale PNG, stored deflate blocks) and shown as an <img> from a
// Blob URL of type image/png (revoked on dispose). It is not a canvas 2D drawing and not SVG, so the off-GPU scan has nothing to list.
//
// Pure part (runs in node, tests/gallery-bench-glyph-atlas.test.js): encodePng, crc32, adler32, atlasStats, layoutPixels, glyphRows,
// missingGlyphs, deckChars. The page part is mount.
import { sdfAtlas } from '../../text-gl.js';
import { DECKS } from '../../decks.js';
import { collectWords } from './words-dump.js';
import { benchRoot, h, statusLine, copyButton, table } from './ui.js';

// ---- a tiny PNG writer ----------------------------------------------------------------------------------------------------------------

const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();

/** The CRC-32 of bytes (the PNG chunk checksum), optionally continuing from a earlier crc. */
export function crc32(bytes, from = 0) {
  let c = ~from >>> 0;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}
/** The Adler-32 of bytes (the zlib stream's checksum). */
export function adler32(bytes) {
  let a = 1, b = 0;
  // (blocks of 5552 bytes keep the sums inside 32 bits until the modulo)
  for (let i = 0; i < bytes.length;) {
    const end = Math.min(i + 5552, bytes.length);
    for (; i < end; i++) { a += bytes[i]; b += a; }
    a %= 65521; b %= 65521;
  }
  return ((b << 16) | a) >>> 0;
}
const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];

/** A PNG file (Uint8Array) of a grayscale 8-bit picture: gray is width * height bytes, row by row, top first. Rows are written unfiltered
 *  and the zlib stream is stored (uncompressed) blocks, so no compressor is needed; the file is a little over width * height bytes. */
export function encodePng(width, height, gray) {
  if (!(width > 0 && height > 0) || !Number.isInteger(width) || !Number.isInteger(height)) throw new RangeError('encodePng: a whole width and height are needed');
  if (!gray || gray.length < width * height) throw new RangeError('encodePng: gray must hold width * height bytes');
  const stride = width + 1, raw = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) { raw[y * stride] = 0; raw.set(gray.subarray ? gray.subarray(y * width, (y + 1) * width) : gray.slice(y * width, (y + 1) * width), y * stride + 1); }
  // zlib: header 78 01, stored blocks of at most 65535 bytes (the last one marked final), then the Adler-32 of the raw data.
  const blocks = Math.max(1, Math.ceil(raw.length / 65535));
  const z = new Uint8Array(2 + raw.length + blocks * 5 + 4);
  let o = 0;
  z[o++] = 0x78; z[o++] = 0x01;
  for (let b = 0; b < blocks; b++) {
    const from = b * 65535, n = Math.min(65535, raw.length - from);
    z[o++] = b === blocks - 1 ? 1 : 0;
    z[o++] = n & 255; z[o++] = n >>> 8; z[o++] = ~n & 255; z[o++] = (~n >>> 8) & 255;
    z.set(raw.subarray(from, from + n), o); o += n;
  }
  z.set(u32(adler32(raw)), o);
  const chunk = (type, data) => {
    const out = new Uint8Array(12 + data.length), t = [...type].map((c) => c.charCodeAt(0));
    out.set(u32(data.length), 0); out.set(t, 4); out.set(data, 8);
    out.set(u32(crc32(out.subarray(4, 8 + data.length))), 8 + data.length);
    return out;
  };
  const ihdr = new Uint8Array([...u32(width), ...u32(height), 8, 0, 0, 0, 0]);   // 8 bits, gray, deflate, no filter method, no interlace
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', z), chunk('IEND', new Uint8Array(0))];
  const png = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0; for (const p of parts) { png.set(p, at); at += p.length; }
  return png;
}

// ---- the atlas as data ------------------------------------------------------------------------------------------------------------------

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const PAD = 9;   // (the atlas's padding round each glyph's ink, atlas px: scripts/glyph-atlas.mjs PAD, glyph-measure.js)

/** The bytes a data URL holds (base64). */
export const dataUrlBytes = (url) => { const m = /;base64,(.*)$/.exec(String(url || '')); if (!m) return 0; const b = m[1]; return Math.floor(b.length * 3 / 4) - (b.endsWith('==') ? 2 : b.endsWith('=') ? 1 : 0); };

/** Every glyph cell of the atlas: { field: 'main' | 'display', weight, ch, x, y, w, h, adv, ink } (atlas px). The display field's cells sit below the main field. */
export function* cells(atlas) {
  for (const [w, set] of Object.entries(atlas.GLYPHS || {})) for (const [ch, e] of Object.entries(set)) yield { field: 'main', weight: +w, ch, adv: e[0], x: e[1], y: e[2], w: e[3], h: e[4], ink: e[7] || '' };
  const d = atlas.DISPLAY;
  if (d) for (const [w, set] of Object.entries(d.GLYPHS || {})) for (const [ch, e] of Object.entries(set)) yield { field: 'display', weight: +w, ch, adv: null, x: e[0], y: d.Y0 + e[1], w: e[2], h: e[3], ink: '' };
}

/** What the atlas holds: its size, weights, glyph counts, bytes of its pictures and kerning pairs. `atlas` is text-gl.js sdfAtlas. */
export function atlasStats(atlas) {
  const weights = Object.keys(atlas.GLYPHS || {}).map(Number);
  const count = (set) => Object.values(set || {}).reduce((n, s) => n + Object.keys(s).length, 0);
  const d = atlas.DISPLAY;
  return {
    width: atlas.ATLAS_W, height: atlas.ATLAS_H, mainHeight: atlas.MAIN_H, base: atlas.BASE, radius: atlas.RADIUS, cutoff: atlas.CUTOFF,
    weights, glyphs: count(atlas.GLYPHS), glyphsByWeight: Object.fromEntries(weights.map((w) => [w, Object.keys(atlas.GLYPHS[w]).length])),
    kernPairs: count(atlas.KERN), pngBytes: dataUrlBytes(atlas.ATLAS_PNG),
    display: d ? { base: d.BASE, radius: d.RADIUS, y0: d.Y0, height: d.H, glyphs: count(d.GLYPHS), pngBytes: dataUrlBytes(d.PNG) } : null,
    textureBytes: atlas.ATLAS_W * atlas.ATLAS_H,   // (one byte a texel when it is the one-channel field the PNG holds; the page's upload may widen it)
  };
}

/** The atlas's layout as a gray picture: black where no glyph has a cell, gray where one does, bright where two cells overlap (a glyph
 *  would read its neighbour's texels), white where the ink bands say the glyph's ink is. Also counts: cell texels, overlap texels, and the
 *  cells that stand off the picture. Returns { width, height, gray, cellPx, overlapPx, offPicture }. */
export function layoutPixels(atlas) {
  const W = atlas.ATLAS_W, H = atlas.ATLAS_H, hit = new Uint8Array(W * H), inkPx = new Uint8Array(W * H);
  let offPicture = 0;
  for (const c of cells(atlas)) {
    if (c.x < 0 || c.y < 0 || c.x + c.w > W || c.y + c.h > H) offPicture++;
    const x1 = Math.min(W, c.x + c.w), y1 = Math.min(H, c.y + c.h);
    for (let y = Math.max(0, c.y); y < y1; y++) for (let x = Math.max(0, c.x); x < x1; x++) { const i = y * W + x; if (hit[i] < 255) hit[i]++; }
    // (the ink: band k is the two rows from PAD + 2k down in the cell; its first and last column + 1 from PAD across, each as one B64 character)
    for (let k = 0; k * 2 < c.ink.length; k++) {
      const a = B64.indexOf(c.ink[k * 2]), b = B64.indexOf(c.ink[k * 2 + 1]);
      if (a <= 0 && b <= 0) continue;
      for (let dy = 0; dy < 2; dy++) {
        const y = c.y + PAD + k * 2 + dy;
        if (y < 0 || y >= H) continue;
        for (let x = c.x + PAD + a - 1; x < c.x + PAD + b; x++) if (x >= 0 && x < W) inkPx[y * W + x] = 1;
      }
    }
  }
  const gray = new Uint8Array(W * H);
  let cellPx = 0, overlapPx = 0;
  for (let i = 0; i < gray.length; i++) {
    const n = hit[i];
    if (n) cellPx++;
    if (n > 1) overlapPx++;
    gray[i] = inkPx[i] ? 255 : n > 1 ? 150 : n ? 70 : 0;
  }
  return { width: W, height: H, gray, cellPx, overlapPx, offPicture };
}

/** The glyph table of one weight: [{ ch, code, adv, x, y, w, h }] in code point order (adv in em). */
export function glyphRows(atlas, weight = 400) {
  const set = atlas.GLYPHS?.[weight] || {};
  return Object.keys(set).map((ch) => ({ ch, code: ch.codePointAt(0), adv: set[ch][0], x: set[ch][1], y: set[ch][2], w: set[ch][3], h: set[ch][4] })).sort((a, b) => a.code - b.code);
}

/** The code point as U+XXXX. */
export const hex = (ch) => `U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`;

/** The characters of `chars` (a string, or any iterable of characters) that `has` says have no glyph: [{ ch, code, hex, count }] in code point
 *  order, each once. `has` is a function (ch) => boolean, a Set, or an object keyed by character. Line breaks and tabs are not characters to draw. */
export function missingGlyphs(chars, has) {
  const test = typeof has === 'function' ? has : has instanceof Set || has instanceof Map ? (c) => has.has(c) : (c) => !!has?.[c];
  const seen = new Map();
  const src = chars instanceof Map ? chars.keys() : chars;
  for (const ch of src) {
    if (ch === '\n' || ch === '\r' || ch === '\t') continue;
    const n = chars instanceof Map ? chars.get(ch) : 1;
    seen.set(ch, (seen.get(ch) || 0) + n);
  }
  const out = [];
  for (const [ch, count] of seen) if (!test(ch)) out.push({ ch, code: ch.codePointAt(0), hex: hex(ch), count });
  return out.sort((a, b) => a.code - b.code);
}

/** Whether a character has a glyph at every weight of a { weight: { char: ... } } set (a weight without it would draw blank or boxed). */
export const inEveryWeight = (byWeight, pick = (s) => s) => (ch) => { const ws = Object.values(byWeight || {}); return ws.length > 0 && ws.every((s) => !!pick(s)?.[ch]); };

// The fields of a slide that a GPU surface can draw (chart and instrument text, figure marks and callouts, the time-lapse's end labels):
// a guess from the paths, shown as "GPU fields" next to "every word". The cards' own words are page text in the browser's font.
const GPU_FIELD = /^(?:tool\.|plane\.|mark\.|marks\[|callout\.|span\[|beats\[|lapse\.|tick$|milestone$|whatIf\.|compare\[\d+\]\.short|of\[\d+\]\.(?:short|name))/;

/** The characters of the decks' words (collectWords) with how many times each stands, and for the first one where: Map ch -> { count, where }.
 *  fieldsOnly keeps the fields a GPU surface can draw. */
export function deckChars(decks, { fieldsOnly = false } = {}) {
  const out = new Map();
  for (const r of collectWords(decks)) {
    if (fieldsOnly && !GPU_FIELD.test(r.path)) continue;
    for (const ch of r.text) {
      const e = out.get(ch);
      if (e) e.count++; else out.set(ch, { count: 1, where: `${r.deck} / ${r.slide} / ${r.path}` });
    }
  }
  return out;
}
/** The same as the Map of counts missingGlyphs reads, with each missing character's first place added. */
export function missingIn(decks, has, opts) {
  const chars = deckChars(decks, opts);
  return missingGlyphs(new Map([...chars].map(([c, e]) => [c, e.count])), has).map((m) => ({ ...m, where: chars.get(m.ch).where }));
}

/** The text of a missing-glyph list, one character a line. */
export const formatMissing = (list) => (list.length ? list.map((m) => `${m.ch}  ${m.hex}  x${m.count}  ${m.where || ''}`.trimEnd()).join('\n') : 'none');

// ---- the page --------------------------------------------------------------------------------------------------------------------------

export default {
  id: 'glyph-atlas',
  title: 'Glyph atlas',
  mount(host, ctx) {
    benchRoot(host, 'Glyph atlas', 'The SDF picture the GPU draws chart and readout text from, the layout of its glyph cells, and the characters the decks use that it (or the figure labels\' outlines) lacks. A missing character shows as a blank or a box.');
    const say = statusLine();
    const urls = [];
    let gone = false;
    const atlas = sdfAtlas, stats = atlasStats(atlas);
    const wMain = (Object.keys(atlas.GLYPHS).includes('400') ? 400 : stats.weights[0]);

    host.append(say, h('p', { class: 'gb-note' }, 'The labels\' own picture pages (label-gl.js) are painted and copied on the GPU, so no pixel of them exists on the CPU; this page does not read them back (that needs readPixels) and makes no GL context of its own.'));

    // 1. The numbers.
    const overall = h('p', { class: 'gb-note' });
    host.append(h('h3', null, 'The atlas'), table(['', ''], [
      ['Size', `${stats.width} × ${stats.height} texels (main field ${stats.mainHeight} rows, big readouts' field ${stats.display ? stats.display.height : 0} rows below)`],
      ['Glyph pictures', `${stats.glyphs} in ${stats.weights.length} weights (${stats.weights.map((w) => `${w}: ${stats.glyphsByWeight[w]}`).join(', ')}); big readouts' field ${stats.display ? stats.display.glyphs : 0}`],
      ['Field', `distance field at ${stats.base} px, radius ${stats.radius}, edge at ${stats.cutoff}${stats.display ? `; readouts' field at ${stats.display.base} px, radius ${stats.display.radius}` : ''}`],
      ['Bytes', `${(stats.pngBytes / 1024).toFixed(0)} KB main PNG${stats.display ? ` + ${(stats.display.pngBytes / 1024).toFixed(0)} KB readouts' PNG` : ''}; about ${(stats.textureBytes / 1048576).toFixed(1)} MB as one texture (1 byte a texel)`],
      ['Kerning pairs', String(stats.kernPairs)],
    ]), overall);

    // 2. The picture the app holds (a PNG data URL: a raster, not SVG or canvas).
    const realImg = h('img', { src: atlas.ATLAS_PNG, alt: 'The SDF text atlas as the app stores it', style: 'max-width:100%;height:auto;background:black;border:1px solid var(--border)', width: stats.width, height: stats.mainHeight });
    host.append(h('h3', null, 'The picture the app uploads (main field)'), h('p', { class: 'gb-note' }, 'The PNG in glyphs-inter-png.js, as stored. A glyph reads from its own cell only; a cell that is solid, or a stray block, here is a box on a label.'), realImg);
    if (atlas.DISPLAY?.PNG) host.append(h('h3', null, 'The big readouts\' field'), h('img', { src: atlas.DISPLAY.PNG, alt: 'The readouts\' SDF field', style: 'max-width:100%;height:auto;background:black;border:1px solid var(--border)', width: stats.width, height: stats.display.height }));

    // 3. The layout map, from the metrics, written here as a PNG.
    try {
      const map = layoutPixels(atlas);
      const png = encodePng(map.width, map.height, map.gray);
      const url = URL.createObjectURL(new Blob([png], { type: 'image/png' }));
      urls.push(url);
      overall.textContent = `Layout from the metrics: ${map.cellPx} texels sit in a glyph cell, ${map.overlapPx} in two or more (${map.overlapPx ? 'cells overlap: a glyph can read its neighbour' : 'no overlap'}), ${map.offPicture} cell${map.offPicture === 1 ? '' : 's'} off the picture.`;
      overall.className = map.overlapPx || map.offPicture ? 'gb-warn' : 'gb-ok';
      host.append(h('h3', null, 'Layout map'), h('p', { class: 'gb-note' }, 'Made here from the glyph metrics: black is unused, gray a glyph cell, bright two cells overlapping, white the glyph\'s ink (its recorded bands).'),
        h('img', { src: url, alt: 'The atlas layout: glyph cells in gray, overlaps bright, ink white', style: 'max-width:100%;height:auto;background:black;border:1px solid var(--border)', width: map.width, height: map.height }));
    } catch (err) { say.set(`The layout map could not be made: ${err?.message || err}`, 'bad'); }

    // 4. Missing glyphs.
    const missBox = h('div'), missText = { v: '' };
    host.append(h('h3', null, 'Missing glyphs'), h('p', { class: 'gb-note' }, 'Every character in the decks\' words against the SDF atlas (all weights) and against the outlines the figure labels use (glyph-data.js). "GPU fields" are the chart, instrument and mark fields; the cards\' own words are page text in the browser\'s font and need neither.'),
      missBox, h('div', { class: 'gb-row' }, copyButton('Copy the missing list', () => missText.v, (t, tone) => say.set(t, tone), ctx)));
    const sdfHas = inEveryWeight(atlas.GLYPHS);
    const showMissing = (outlineHas) => {
      if (gone) return;
      const sets = [
        ['SDF atlas, every word', missingIn(DECKS, sdfHas)],
        ['SDF atlas, GPU fields', missingIn(DECKS, sdfHas, { fieldsOnly: true })],
      ];
      if (outlineHas) sets.push(['Outlines (labels), every word', missingIn(DECKS, outlineHas)], ['Outlines (labels), GPU fields', missingIn(DECKS, outlineHas, { fieldsOnly: true })]);
      missText.v = sets.map(([t, l]) => `${t}: ${l.length}\n${formatMissing(l)}`).join('\n\n');
      missBox.replaceChildren(...sets.map(([t, l]) => h('div', null, h('p', { class: l.length ? 'gb-warn' : 'gb-ok' }, `${t}: ${l.length ? `${l.length} missing` : 'none missing'}`), l.length ? h('pre', null, formatMissing(l)) : null)));
    };
    showMissing(null);
    import('../../glyph-data.js').then((m) => { showMissing(inEveryWeight(m.GLYPHS, (s) => s.chars)); }).catch((err) => { say.set(`The label outlines could not be read: ${err?.message || err}`, 'warn'); });   // alloc-rare: once, when the bench opens

    // 5. The glyph table and a character lookup.
    const out = h('pre', { tabindex: '0', 'aria-label': 'Glyph metrics' });
    const find = h('input', { type: 'text', placeholder: 'Type characters to look up', 'aria-label': 'Characters to look up', oninput: () => draw() });
    const wSel = h('select', { 'aria-label': 'Weight', onchange: () => draw() }, stats.weights.map((w) => h('option', { value: w, selected: w === wMain }, String(w))));
    const lines = (rows) => rows.map((r) => `${r.ch === ' ' ? '␠' : r.ch}  ${hex(r.ch)}  adv ${r.adv.toFixed(4)} em  cell ${r.x},${r.y} ${r.w}×${r.h}`).join('\n');
    function draw() {
      if (gone) return;
      const w = +wSel.value, rows = glyphRows(atlas, w), typed = [...new Set([...find.value])];
      if (typed.length) {
        const by = new Map(rows.map((r) => [r.ch, r]));
        out.textContent = typed.map((ch) => (by.has(ch) ? lines([by.get(ch)]) : `${ch}  ${hex(ch)}  no glyph at weight ${w}`)).join('\n');
      } else out.textContent = `${rows.length} glyphs at weight ${w}\n${lines(rows)}`;
    }
    host.append(h('h3', null, 'Glyph table'), h('div', { class: 'gb-row' }, find, wSel, copyButton('Copy the table', () => lines(glyphRows(atlas, +wSel.value)), (t, tone) => say.set(t, tone), ctx)), out);
    draw();

    return () => { gone = true; for (const u of urls) URL.revokeObjectURL(u); urls.length = 0; };
  },
};
