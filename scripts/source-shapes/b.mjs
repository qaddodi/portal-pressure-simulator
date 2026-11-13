// Source shapes of label-gl.js and its neighbours, moved out of label-gl-perf-b, label-move-fade, label-single-fade and vessel-knock-look (PR-02).
// A matcher with a test(src) method is allowed where a pattern is: the loader only calls re.test(src) (see rules-lint.mjs).

const LG = 'src/ui/label-gl.js';

// B5: the label loop of label-gl.js is the slice from its head to `const pinned = pinOf(s);` (as the old test cut it); an assertion on it holds only on that slice.
const loopOf = (src) => src.slice(src.indexOf('for (const s of last) {\n      const { g } = s, rot = !!s.rot;'), src.indexOf('const pinned = pinOf(s);'));
const inLoop = (re) => ({ test: (src) => re.test(loopOf(src)), toString: () => `in the label loop: ${re}` });
const loopLong = { test: (src) => loopOf(src).length > 500, toString: () => 'the label loop slice is longer than 500 chars (its head and its end are both found)' };
const twice = { test: (src) => (src.match(/for \(const s of last\) glDrop\(s\.g\);/g) || []).length === 2, toString: () => '/for (const s of last) glDrop\\(s.g\\);/ exactly twice' };

export default [
  // label-gl-perf-b, B5: data-gl is written through glSet, which skips an unchanged label; empty sets are not asked
  { file: LG, need: [/function glSet\(g, st, on\) \{\s*if \(st\) \{ if \(st\.glA === on\) return; st\.glA = on; \}/, 'B5: data-gl is written through glSet, which skips an unchanged label'] },
  { file: LG, need: [loopLong, 'B5: the label loop slice (head to `const pinned = pinOf(s);`) is found and long enough to be the loop'] },
  { file: LG, forbid: [inLoop(/hasAttribute\('data-gl'\)|setAttribute\('data-gl'|removeAttribute\('data-gl'/), 'B5: the label loop writes no data-gl attribute itself'] },
  { file: LG, need: [inLoop(/live\.size \? live\.get\(g\)/), 'B5: an empty live set is not asked per label'] },
  { file: LG, need: [inLoop(/exact\.size \? exact\.get\(g\)/), 'B5: an empty exact set is not asked per label'] },
  { file: LG, need: [inLoop(/dirty\.size > 0 && dirty\.has\(g\)/), 'B5: an empty dirty set is not asked per label'] },
  { file: LG, need: [inLoop(/pending\.size > 0 && pending\.has\(g\)/), 'B5: an empty pending set is not asked per label'] },
  { file: LG, need: [twice, 'B5: release and the loss give every label back through glDrop (every place that takes data-gl off a label without glSet drops the kept state with it)'] },
  // label-gl-perf-b, B6: the instance buffer is sized when it grows and written in place each draw
  { file: LG, need: [/if \(inst\.byteLength > abufCap\) \{ gl\.bufferData\(gl\.ARRAY_BUFFER, inst\.byteLength, gl\.DYNAMIC_DRAW\); abufCap = inst\.byteLength; \}/, 'B6: the instance buffer is allocated at capacity when it grows'] },
  { file: LG, need: [/gl\.bufferSubData\(gl\.ARRAY_BUFFER, 0, inst, 0, ni \* IF\);/, 'B6: the instance buffer is written in place with bufferSubData each draw'] },
  { file: LG, forbid: [/gl\.bufferData\(gl\.ARRAY_BUFFER, inst, gl\.DYNAMIC_DRAW/, 'B6: no re-specification of the instance buffer per draw'] },
  { file: LG, need: [/abuf = gl\.createBuffer\(\); abufCap = 0;/, 'B6: a new buffer (a restored context) owns nothing yet'] },

  // label-move-fade: the draw puts the old picture and its leader out and the new in, and the dot stays whole
  { file: LG, need: [/a \*= pr\.mf;/, 'the new picture comes in on the fade'] },
  { file: LG, need: [/a \* \(1 - pr\.mf\), st\)/, 'the old picture goes out on the fade'] },
  { file: LG, need: [/const ao = a \* \(1 - mf\);[\s\S]{0,300}pinMark\(lk\?\.line\?\.stroke \? lk\.line : defLine, PG, true, ao\)/, 'the old leader goes out on the fade'] },
  { file: LG, need: [/pinMark\(lk\?\.line\?\.stroke \? lk\.line : defLine, PG, true, al\)/, 'the new leader comes in on the fade'] },
  { file: LG, need: [/pinMark\(ds, PG, false, a \* \(ds\?\.op \?\? 1\)\)/, 'the dot on the point is not part of the fade'] },

  // label-single-fade: no writer of the change or of a presenter's glide fades the #labels root (the fade is written on the layer's groups; LA stays 1)
  { file: 'src/ui/stage-view.js', forbid: [/labelSvg\.style\.opacity/, 'no writer of the view change fades the #labels root: the GPU fades are the only ones and the layer alpha stays 1'] },
  { file: 'src/ui/glide-labels.js', forbid: [/labelSvg\.style\.opacity/, 'no writer of a presenter\'s glide fades the #labels root: the GPU fades are the only ones and the layer alpha stays 1'] },

  // vessel-knock-look: the vessel look reads the token
  { file: 'src/ui/stage-vessels.js', need: [/lookRgba\(vl\.paper, toRGB\('var\(--stage-bg\)', cs\), cssNum\(cs, '--vessel-knock-a', 1\)\)/, 'the vessel look reads the --vessel-knock-a token (the crossing gap is parked on every look)'] },
];
