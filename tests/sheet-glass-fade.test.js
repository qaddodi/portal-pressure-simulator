// The split readings sheet's two glass panes are its ::before and ::after, which fade by their own CSS transitions (app.css
// .pz-sheet.pz-hide::before). Mohammad, 10 Nov 2026: "the glass cards when they appear and they disappear still glitch". A pane read at
// the start of its fade in (opacity 0) was left out, so the sheet came in as a solid card and turned to glass only at the end; now each
// pane is kept whatever its fade and names its pseudo-element, whose fade the glass follows each frame (glass-gl.js pseudoOf).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sheetPanes } from '../src/ui/sheet-glass.js';

const box = (l, t, w, h) => ({ left: l, top: t, width: w, height: h, right: l + w, bottom: t + h });
const pe = (o) => ({ content: '""', display: 'block', visibility: 'visible', opacity: '1', left: '0px', top: '0px', right: '0px', bottom: '0px', borderTopLeftRadius: '18px', borderTopRightRadius: '18px', borderBottomRightRadius: '18px', borderBottomLeftRadius: '18px', backgroundColor: 'rgba(0, 0, 0, 0)', getPropertyValue: (k) => (k === '--gl-tint' ? 'rgba(250, 250, 250, 0.58)' : ''), ...o });
const sheet = (before, after) => ({ offsetWidth: 300, classList: { contains: (c) => c === 'pz-sheet' }, closest: () => ({}), getBoundingClientRect: () => box(10, 100, 300, 200), ps: { '::before': before, '::after': after } });
const gcs = (e, p) => (p ? e.ps[p] : { borderLeftWidth: '0px', borderTopWidth: '0px', borderRightWidth: '0px', borderBottomWidth: '0px', getPropertyValue: () => '0' });

test('a sheet read at the start of its fade in keeps both panes, at their fade, each naming its pseudo-element', () => {
  const out = sheetPanes(sheet(pe({ opacity: '0', bottom: '40px' }), pe({ opacity: '0', top: '120px' })), gcs);
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((p) => p.pe), ['::after', '::before']);
  assert.deepEqual(out.map((p) => p.a), [0, 0]);
});

test('the readings\' card keeps the instrument card\'s cut while the instrument card is faded out', () => {
  const faded = sheetPanes(sheet(pe({ opacity: '0', bottom: '40px' }), pe({ top: '120px' })), gcs);
  const whole = sheetPanes(sheet(pe({ bottom: '40px' }), pe({ top: '120px' })), gcs);
  assert.equal(faded[0].d, whole[0].d);
});

test('a pane that is not laid out (content none, display none, hidden) is still left out', () => {
  assert.equal(sheetPanes(sheet(pe({ content: 'none' }), pe({ display: 'none' })), gcs).length, 0);
  assert.equal(sheetPanes(sheet(pe({ visibility: 'hidden' }), pe({ top: '120px' })), gcs).length, 1);
});
