// The page part of the screen report: device size, look, view, patient, deck and slide, what is open, the build. From the store, the presenter's own
// position and the page's attributes: nothing worked out a second way.
import { registerReader } from './registry.js';
import { viewKey } from '../store.js';
import { currentLook } from '../looks.js';
import { RELEASE } from '../../version.js';

export function readPage(ctx) {
  const { pps, io, doc, win } = ctx;
  const root = doc?.documentElement;
  const st = pps?.store?.get?.() || {};
  let pos = null;
  try { pos = pps?.presenter?.position?.() || null; } catch { /* (no presenter yet) */ }
  const card = pps?.card?.el;
  return {
    commit: RELEASE,
    vw: Math.round(io.metric(win, 'innerWidth') || 0), vh: Math.round(io.metric(win, 'innerHeight') || 0),
    touch: !!win?.matchMedia?.('(pointer: coarse)')?.matches,
    look: (root && currentLook(root)) || 'system',
    view: viewKey(st),
    patient: st.presetId ?? null,
    tool: st.tool ?? null,
    deck: pos ? pos.id : null,
    slide: pos ? (Number.isFinite(pos.at) ? pos.at + 1 : null) : null,
    sheets: { card: !!(card && !card.hidden), dock: !!doc?.querySelector?.('#dock:not([hidden])') },
    galleryId: root?.getAttribute?.('data-gallery-id') || null,
  };
}

registerReader({
  id: 'page', owner: 'src/ui/main.js', order: 10, read: readPage,
  text(p) {
    const where = p.deck ? `Deck ${p.deck}, slide ${p.slide}` : 'Explore (no deck)';
    return [`Screen ${p.vw}×${p.vh}${p.touch ? ' (touch)' : ''}, look ${p.look}, view ${p.view}, patient ${p.patient ?? 'unknown'}, ${where}, build ${p.commit}.`
      + `${p.sheets.card ? ' A structure card is open.' : ''}${p.galleryId ? ` Gallery specimen ${p.galleryId}.` : ''}`];
  },
});
