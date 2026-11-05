// A pinned label's default dot (label-gl.js drawPins, drawn before any dot of the page's has been read) takes its ink and ground from the
// page's tokens as written, --text-2 and --stage-bg: hex colours ('#B7B1A8'), not a computed rgb(). Read as nothing, the dot was drawn clear,
// its ring and fill both see-through: a dot the layout asked for that showed nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { installPage } = await import('../scripts/warm/dom.mjs');
installPage();
const { rgba } = await import('../src/ui/label-gl.js');
const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-3);

test('a token colour read as written (hex) is the colour it names, premultiplied', () => {
  assert.ok(near(rgba('#B7B1A8'), [0xB7 / 255, 0xB1 / 255, 0xA8 / 255, 1]), String(rgba('#B7B1A8')));
  assert.ok(near(rgba(' #1A1917'), [0x1A / 255, 0x19 / 255, 0x17 / 255, 1]), 'with the space a custom property keeps');
  assert.ok(near(rgba('#fff'), [1, 1, 1, 1]));
  assert.ok(near(rgba('#00000080'), [0, 0, 0, 128 / 255]));
  assert.ok(near(rgba('#ff000080'), [128 / 255, 0, 0, 128 / 255]), 'premultiplied by its alpha');
  assert.ok(near(rgba('rgba(236, 228, 214, 0.42)'), [236 / 255 * 0.42, 228 / 255 * 0.42, 214 / 255 * 0.42, 0.42]), 'a computed colour as before');
  assert.ok(near(rgba('#zzz'), [0, 0, 0, 0]), 'not a colour: clear');
});
