// The whole interface sets tabular figures (font-variant-numeric: tabular-nums) so numbers hold still. Inter's
// tabular feature also swapped the hyphen for a figure-wide one, so every word with a hyphen read with gaps round
// it ("Post - prandial", "End - stage"; sweep 01 #09, #13, #21). fonts/inter-latin.woff2 has the hyphen taken out
// of that feature (digits, the minus sign and the other marks keep it). This test reads the font's GSUB table and
// fails if a font update brings the wide hyphen back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { brotliDecompressSync } from 'node:zlib';

const TAGS = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill'];

// The decompressed tables of a WOFF2 file, by tag (glyf and loca stay transformed; they are not read here).
function woff2Tables(buf) {
  assert.equal(buf.toString('latin1', 0, 4), 'wOF2');
  const numTables = buf.readUInt16BE(12), compLen = buf.readUInt32BE(20);
  let p = 48;
  const base128 = () => { let v = 0; for (let i = 0; i < 5; i++) { const b = buf[p++]; v = v * 128 + (b & 127); if (!(b & 128)) return v; } throw new Error('bad UIntBase128'); };
  const dir = [];
  for (let i = 0; i < numTables; i++) {
    const flags = buf[p++], tag = (flags & 63) === 63 ? buf.toString('latin1', p, (p += 4)) : TAGS[flags & 63];
    const version = flags >> 6, origLength = base128();
    const transformed = (tag === 'glyf' || tag === 'loca') ? version === 0 : version !== 0;
    dir.push({ tag, length: transformed ? base128() : origLength });
  }
  const data = brotliDecompressSync(buf.subarray(p, p + compLen));
  const out = {};
  let o = 0;
  for (const t of dir) { out[t.tag] = data.subarray(o, o + t.length); o += t.length; }
  return out;
}

// The glyph id for a character, from a format 4 cmap subtable.
function glyphFor(cmap, code) {
  for (let i = 0, n = cmap.readUInt16BE(2); i < n; i++) {
    const off = cmap.readUInt32BE(4 + i * 8 + 4), t = cmap.subarray(off);
    if (t.readUInt16BE(0) !== 4) continue;
    const segX2 = t.readUInt16BE(6), ends = 14, starts = ends + segX2 + 2, deltas = starts + segX2, ranges = deltas + segX2;
    for (let s = 0; s < segX2; s += 2) {
      const end = t.readUInt16BE(ends + s), start = t.readUInt16BE(starts + s);
      if (code > end || code < start) continue;
      const delta = t.readInt16BE(deltas + s), ro = t.readUInt16BE(ranges + s);
      if (!ro) return (code + delta) & 0xffff;
      const g = t.readUInt16BE(ranges + s + ro + (code - start) * 2);
      return g ? (g + delta) & 0xffff : 0;
    }
  }
  return 0;
}

const covers = (cov, gid) => {
  const fmt = cov.readUInt16BE(0), n = cov.readUInt16BE(2);
  for (let i = 0; i < n; i++) {
    if (fmt === 1 && cov.readUInt16BE(4 + i * 2) === gid) return true;
    if (fmt === 2 && gid >= cov.readUInt16BE(4 + i * 6) && gid <= cov.readUInt16BE(6 + i * 6)) return true;
  }
  return false;
};

// Every glyph id that a feature's single substitutions replace.
function substituted(gsub, feature, gid) {
  const features = gsub.subarray(gsub.readUInt16BE(6)), lookups = gsub.subarray(gsub.readUInt16BE(8));
  let hit = false, seen = 0;
  for (let i = 0, n = features.readUInt16BE(0); i < n; i++) {
    if (features.toString('latin1', 2 + i * 6, 6 + i * 6) !== feature) continue;
    const f = features.subarray(features.readUInt16BE(6 + i * 6));
    for (let j = 0, m = f.readUInt16BE(2); j < m; j++) {
      const lk = lookups.subarray(lookups.readUInt16BE(2 + f.readUInt16BE(4 + j * 2) * 2));
      let type = lk.readUInt16BE(0);
      for (let k = 0, c = lk.readUInt16BE(4); k < c; k++) {
        let st = lk.subarray(lk.readUInt16BE(6 + k * 2));
        if (type === 7) { type = st.readUInt16BE(2); st = st.subarray(st.readUInt32BE(4)); }
        if (type !== 1) continue;
        seen++;
        hit ||= covers(st.subarray(st.readUInt16BE(2)), gid);
      }
    }
  }
  return { hit, seen };
}

test('tabular figures leave the hyphen its own width in Inter', () => {
  const t = woff2Tables(readFileSync(new URL('../fonts/inter-latin.woff2', import.meta.url)));
  const hyphen = glyphFor(t.cmap, 0x2d), zero = glyphFor(t.cmap, 0x30), minus = glyphFor(t.cmap, 0x2212);
  assert.ok(hyphen && zero && minus, 'the hyphen, zero and minus are in the font');
  assert.ok(substituted(t.GSUB, 'tnum', zero).hit, 'digits still turn tabular (the test reads the feature)');
  assert.ok(substituted(t.GSUB, 'tnum', minus).hit, 'the minus sign stays as wide as a digit');
  assert.equal(substituted(t.GSUB, 'tnum', hyphen).hit, false, 'the hyphen must not turn figure-wide under tabular-nums');
});

test('the interface still sets tabular figures (the reason for the font change)', () => {
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  assert.match(css, /font-variant-numeric: tabular-nums/);
});
