// The pick, the figure's keyboard items and the action-card anchors.
// (moved out of stage.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)
import { EDGES } from '../engine/topology.js';
import { SITES } from './anatomy.js';
import { D_FLIP } from './ease.js';
import { elBoxInto } from './shape-gl.js';
import { store } from './store.js';
import { fmt } from './util.js';

export function createPick(st, live) {
  const { E, EBOX, EI, EV, NI, ORGAN_KEYS, geo, olKey, olRings, organEls, pointAt, refreshCTM, setGlowSrc, setOrganHover, svg, worldToLocal } = st;
  // Keyboard: the figure is one Tab stop (no element per vessel). Inside it Tab and Shift+Tab walk its items (every vessel shown, then,
  // in the anatomy, the organs a tap opens) and leave it at either end, Enter or Space acts on the item, and the arrows walk along the
  // flow. The item in focus glows as the GPU draws it (the 'key' glow; an organ takes its hover outline) and is read out through #live.
  const figKeys = { cur: null, tabAt: -Infinity, back: false };
  const ORGAN_NAME = new Map(ORGAN_KEYS);
  function figItems() {
    const out = [];
    if (live.lobuleOn) return out;
    for (const x of EV) if (x.vis && !x.noHit) out.push(x.e.id);
    if (live.morph < 0.5) for (const [id] of ORGAN_KEYS) out.push('organ:' + id);
    return out;
  }
  const figSay = (msg) => { const el = document.getElementById('live'); if (el && msg) el.textContent = msg; };
  function figWords(item) {
    if (item.startsWith('organ:')) return `${ORGAN_NAME.get(item.slice(6))}. Press Enter for its card.`;
    const e = EI[item] != null ? EDGES[EI[item]] : E[item]?.e;
    if (!e) return '';
    if (!live.F || EI[item] == null) return `${e.label || item}. Press Enter for actions.`;
    const q = live.F.Q[EI[item]];
    return `${e.label}: ${fmt(live.F.P[NI[e.from]], 1)} to ${fmt(live.F.P[NI[e.to]], 1)} millimeters of mercury, flow ${fmt(q * 0.06, 2)} liters per minute${E[item].rev ? ', reversed' : ''}. Press Enter for actions.`;
  }
  function figShow(item, say = true) {
    const was = figKeys.cur;
    figKeys.cur = item;
    if (was?.startsWith('organ:') && was !== item) setOrganHover(null);
    if (item?.startsWith('organ:')) {
      const org = item.slice(6), sel = store.get().selection;
      setGlowSrc('key', []);
      setOrganHover(sel?.type === 'organ' && sel.id === org ? null : org);
    } else setGlowSrc('key', item ? [{ id: item, col: 'var(--accent)', amt: 1.8, wide: 1.25, top: true, dur: D_FLIP }] : []);
    if (item && say) figSay(figWords(item));
  }
  // (Which way Tab came in: a Tab pressed anywhere just before the figure took focus.)
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Tab') { figKeys.tabAt = performance.now(); figKeys.back = ev.shiftKey; } }, true);
  svg.addEventListener('focus', () => {
    if (!live.keyStops) return;
    const items = figItems();
    if (performance.now() - figKeys.tabAt < 400) figShow(items.length ? items[figKeys.back ? items.length - 1 : 0] : null);
    else if (figKeys.cur && items.includes(figKeys.cur) && focusSeen()) figShow(figKeys.cur);   // (focus handed back from the keyboard, a closed card's: the item it was on)
  });
  const focusSeen = () => { try { return svg.matches(':focus-visible'); } catch { return true; } };
  // (A pointer on the figure lets go of the keyboard's item: its glow goes, Space is the app's again, and the next Tab starts afresh.)
  svg.addEventListener('pointerdown', () => { if (figKeys.cur) figShow(null, false); });
  svg.addEventListener('blur', () => { if (figKeys.cur) { setGlowSrc('key', []); if (figKeys.cur.startsWith('organ:')) setOrganHover(null); } });
  // ── Anchors for the action card ───────────────────
  const ORGAN_ANCHOR = { liver: [470, 360], heart: [650, 118], spleen: [1052, 362], varices: SITES.varix, gastric: SITES.fundus, abdomen: [720, 770] };
  const anchorRings = { key: '', rings: [] };
  function anchorFor(sel) {
    if (!sel) return null;
    if (sel.type === 'lobule') return live.lz?.anchorFor(sel) || null;
    refreshCTM();
    if (sel.type === 'edge' && geo[sel.id] && E[sel.id]?.vis) {
      const pts = geo[sel.id].cur;
      const [x, y] = worldToLocal(...pointAt(pts, 0.5));
      // The tube and, for a braided bed (varices), each of its strands: the card keeps clear of all of them.
      const toPx = (line) => line.map((q) => worldToLocal(q[0], q[1]));
      const lines = [toPx(pts)];
      for (const sd of E[sel.id].strands || []) if (sd.cur && (sd.live ?? 1) >= 0.5) lines.push(toPx(sd.cur));
      const path = lines.flat();
      // The drawn half-width on screen (lumen and walls), so the card keeps clear of the whole tube (card-place.js).
      const r = (((E[sel.id].width ?? 8) + 3) / 2) * (live.CTM?.sc || 1);
      return { x, y, path, lines, r };
    }
    if (sel.type === 'organ') {
      const org = { liver: 'liver', heart: 'heart', spleen: 'spleen' }[sel.id];
      const hasLine = org && organEls[org]?.getAttribute('d');
      // An organ with an outline anchors at its own centre (not the clicked point); its leader starts on the outline.
      const w = (hasLine ? ORGAN_ANCHOR[sel.id] : null) || sel.at || ORGAN_ANCHOR[sel.id];
      if (!w) return null;
      const [x, y] = worldToLocal(w[0], w[1]);
      const path = [[x, y]];
      const b = org && organEls[org] ? elBoxInto(organEls[org], EBOX) : null;   // (in script: elBox)
      if (b) {
        for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) path.push(worldToLocal(b.x + (b.width * i) / 4, b.y + (b.height * j) / 4));
      }
      let outline = null;
      if (hasLine) {
        // The same sampled rings the GPU outline draws (olRings), cached per shape, in screen space.
        const k = olKey(org);
        if (anchorRings.key !== k) { anchorRings.key = k; anchorRings.rings = olRings(org); }
        outline = [];
        for (const r of anchorRings.rings) for (let i = 0; i < r.length; i += 2) outline.push(worldToLocal(r[i][0], r[i][1]));
      }
      return { x, y, path, outline };
    }
    return null;
  }
  return { anchorFor, figItems, figKeys, figShow };
}
