// The Glyph atlas bench (src/ui/gallery/benches/glyph-atlas.js): the PNG writer is checked by reading its output back with node:zlib, the missing-glyph
// check against the real atlas, outlines and decks (the missing characters are printed, never failed on).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync, crc32 as zcrc32 } from 'node:zlib';
import { DECKS } from '../src/ui/decks.js';
import { sdfAtlas } from '../src/ui/text-gl.js';
import glyphs, { encodePng, crc32, adler32, atlasStats, layoutPixels, glyphRows, missingGlyphs, missingIn, inEveryWeight, deckChars, dataUrlBytes, formatMissing, hex } from '../src/ui/gallery/benches/glyph-atlas.js';

function decode(png) {
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], 'signature');
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const chunks = [];
  for (let o = 8; o < png.length;) {
    const len = dv.getUint32(o), type = String.fromCharCode(...png.subarray(o + 4, o + 8)), data = png.subarray(o + 8, o + 8 + len), crc = dv.getUint32(o + 8 + len);
    assert.equal(crc, crc32(png.subarray(o + 4, o + 8 + len)) , `${type} crc`);
    if (zcrc32) assert.equal(crc, zcrc32(png.subarray(o + 4, o + 8 + len)), `${type} crc (node)`);
    chunks.push({ type, data }); o += 12 + len;
  }
  return chunks;
}

test('the bench is the one the list names', () => {
  assert.equal(glyphs.id, 'glyph-atlas');
  assert.equal(glyphs.title, 'Glyph atlas');
  assert.equal(typeof glyphs.mount, 'function');
});

test('crc32 and adler32 match the known values', () => {
  const t = new TextEncoder().encode('123456789');
  assert.equal(crc32(t), 0xcbf43926);
  assert.equal(adler32(t), 0x091e01de);
  assert.equal(adler32(new Uint8Array(0)), 1);
});

test('encodePng: signature, IHDR, IEND, CRCs, and the rows come back as written', () => {
  const w = 37, h = 11, gray = new Uint8Array(w * h).map((_, i) => (i * 7 + 3) & 255);
  const chunks = decode(encodePng(w, h, gray));
  assert.deepEqual(chunks.map((c) => c.type), ['IHDR', 'IDAT', 'IEND']);
  const ihdr = new DataView(chunks[0].data.buffer, chunks[0].data.byteOffset, 13);
  assert.equal(ihdr.getUint32(0), w); assert.equal(ihdr.getUint32(4), h);
  assert.deepEqual([...chunks[0].data.subarray(8)], [8, 0, 0, 0, 0], '8-bit gray, no interlace');
  const raw = inflateSync(chunks[1].data);
  assert.equal(raw.length, (w + 1) * h);
  for (let y = 0; y < h; y++) {
    assert.equal(raw[y * (w + 1)], 0, 'filter none');
    assert.deepEqual([...raw.subarray(y * (w + 1) + 1, (y + 1) * (w + 1))], [...gray.subarray(y * w, (y + 1) * w)], `row ${y}`);
  }
  assert.equal(chunks[2].data.length, 0);
});

test('encodePng: a picture bigger than one stored block (65535 bytes) splits and still inflates', () => {
  const w = 400, h = 300, gray = new Uint8Array(w * h).map((_, i) => (i ^ (i >> 8)) & 255);
  const raw = inflateSync(decode(encodePng(w, h, gray))[1].data);
  assert.equal(raw.length, (w + 1) * h);
  for (const y of [0, 163, 164, 299]) assert.deepEqual([...raw.subarray(y * (w + 1) + 1, (y + 1) * (w + 1))], [...gray.subarray(y * w, (y + 1) * w)], `row ${y}`);
});

test('encodePng: a bad size or a short picture throws', () => {
  assert.throws(() => encodePng(0, 4, new Uint8Array(0)), RangeError);
  assert.throws(() => encodePng(4, 4, new Uint8Array(15)), RangeError);
  assert.throws(() => encodePng(2.5, 4, new Uint8Array(40)), RangeError);
});

test('the real atlas: stats, a layout map that fits the picture, and a glyph table', () => {
  const s = atlasStats(sdfAtlas);
  assert.equal(s.width, 1024); assert.ok(s.height >= s.mainHeight); assert.ok(s.glyphs > 400); assert.ok(s.pngBytes > 10000); assert.ok(s.display.glyphs > 0);
  assert.equal(dataUrlBytes('data:image/png;base64,AAAA'), 3); assert.equal(dataUrlBytes('data:image/png;base64,AA=='), 1); assert.equal(dataUrlBytes('x'), 0);
  const map = layoutPixels(sdfAtlas);
  assert.equal(map.gray.length, map.width * map.height);
  assert.equal(map.offPicture, 0, 'every glyph cell stands inside the picture');
  assert.ok(map.cellPx > 0);
  console.log(`glyph atlas: ${s.glyphs} glyphs, ${s.width}x${s.height}, ${map.cellPx} cell texels, ${map.overlapPx} in overlapping cells`);
  const png = encodePng(map.width, map.height, map.gray);
  assert.equal(inflateSync(decode(png)[1].data).length, (map.width + 1) * map.height);
  const rows = glyphRows(sdfAtlas, 400);
  assert.ok(rows.length > 100 && rows.some((r) => r.ch === 'A'));
  assert.equal(hex('A'), 'U+0041');
});

test('missingGlyphs: whatever has no glyph, once each, counted', () => {
  assert.deepEqual(missingGlyphs('abc', (c) => c !== 'b').map((m) => m.ch), ['b']);
  assert.deepEqual(missingGlyphs('x\ny\tz', new Set(['x', 'y'])).map((m) => m.ch), ['z']);
  assert.deepEqual(missingGlyphs(new Map([['é', 3], ['e', 9]]), { e: 1 }), [{ ch: 'é', code: 233, hex: 'U+00E9', count: 3 }]);
  assert.deepEqual(missingGlyphs('', () => true), []);
  assert.equal(missingGlyphs('zzz', () => false)[0].count, 3);
});

test('the real decks against the real glyph sets (reported, never failed on)', async () => {
  const chars = deckChars(DECKS);
  assert.ok(chars.size > 60);
  assert.ok(chars.has('a') && chars.has('−') || chars.has('-'));
  const sdfHas = inEveryWeight(sdfAtlas.GLYPHS);
  assert.ok(sdfHas('A') && sdfHas('7') && !sdfHas('\u{1F600}'));
  const { GLYPHS } = await import('../src/ui/glyph-data.js');
  const olHas = inEveryWeight(GLYPHS, (s) => s.chars);
  assert.ok(olHas('A'));
  for (const [name, has] of [['SDF atlas', sdfHas], ['label outlines', olHas]]) for (const fieldsOnly of [false, true]) {
    const m = missingIn(DECKS, has, { fieldsOnly });
    console.log(`missing from the ${name}, ${fieldsOnly ? 'GPU fields' : 'every word'}: ${m.length}\n${formatMissing(m).split('\n').map((l) => `  ${l}`).join('\n')}`);
    assert.ok(Array.isArray(m));
  }
});
