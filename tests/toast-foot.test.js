// A preset's note stands above every bottom sheet that rests on the thumb dock, not only the Tests sheet and a vessel's card (18 Nov 2026, the tester at 390 px: the note stood over Treat's buttons).
import { test } from 'node:test';
import assert from 'node:assert/strict';
const { toastFoot, NOTE_H } = await import('../src/ui/toast-foot.js');

const base = { thumb: true, tabOcc: 110, sheet: 0, bot: 0, ah: 844, tbH: 56 };

test('with no sheet open the note stands on the dock, as it did', () => {
  assert.equal(toastFoot({ ...base }), 110 + 50 + 8);
});

test('a docked vessel card, the Treat sheet and the History sheet each lift it above them', () => {
  assert.equal(toastFoot({ ...base, sheetsH: [217, 0] }), 110 + 50 + 8 + 217 + 8, 'a vessel card (as before: the card\'s height and a gap, over the dock)');
  const treat = toastFoot({ ...base, sheetsH: [0, 520] });
  assert.equal(treat, 110 + 50 + 8 + 520 + 8, 'Treat\'s 520 px sheet: the note stands on top of it, not in the middle of it');
  assert.ok(treat > toastFoot({ ...base, sheetsH: [217, 0] }));
});

test('the tallest of the sheets counts, never their sum', () => {
  assert.equal(toastFoot({ ...base, sheetsH: [217, 520] }), toastFoot({ ...base, sheetsH: [0, 520] }));
});

test('a sheet that fills the screen leaves the note at the top of what is left, under the top bars, not off the screen', () => {
  const f = toastFoot({ ...base, sheetsH: [0, 654] });
  assert.equal(f, 844 - 56 - NOTE_H - 8);
  assert.ok(f > 0 && 844 - f >= 56 + NOTE_H, 'its top edge is under the top bar');
});

test('without a thumb dock the foot is the layout\'s own', () => {
  assert.equal(toastFoot({ ...base, thumb: false, tabOcc: 0, bot: 90 }), 90 + 8);
  assert.equal(toastFoot({ ...base, sheet: 300 }), 110 + 300 + 8, 'the Tests sheet, with the dock under it');
});
