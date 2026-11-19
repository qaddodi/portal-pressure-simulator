// The card fit rules, in one place (docs/card-gallery.md, plan 2.7). The judging that scripts/card-fit.mjs and (until 19 Nov 2026) scripts/phone-card-fit.mjs used
// to keep to themselves, and four checks from Mohammad's standing rules, so a script in headless Chromium and the Check button on the device in
// his hand give the same verdict:
//
//   scroll    a card whose content runs past its box (its last lines are hidden from view)
//   clipped   a text element wider than a box that clips (a cut or ellipsised word)
//   off       text partly outside the screen (and not inside something that scrolls on purpose)
//   enlarged  a card already enlarged when nothing asked for it
//   zoomed    an enlarged card that did not grow or stands off the screen
//   small     lettering under 12 px on the screen (17 Nov, "data-card text >= 12 px", WORDS_MIN_PX)
//   ratio     a slide title under 1.4 times the words under it (17 Nov, TITLE_RATIO); 1.3 on a phone's slide (19 Nov, PHONE_TITLE_RATIO)
//   sideways  anything inside a card that scrolls sideways (a phone's swipe would open the next card instead)
//   chart     a word of a chart drawn on the GPU placed outside its own box (the legend and the time row of a card too short for them: Next bleed 6 on a
//             phone, 18 Nov 2026). Those words are a hidden model, not page text, so no rule above ever saw them; this one reads the model's own numbers.
//   styled    a card shown before it was whole: still being laid out, words standing before their backing, fonts still loading, a card with a tag and no words
//   blank, cut, tall   (a structure card on a phone) empty glass above or below its words, a line past its box, a scroller while the words fit
//
// Two halves, so the rules live once:
//  - READERS (readCards, readZoom, readStructureCard) look at the page and return plain data. Each is ONE SELF-CONTAINED FUNCTION: it uses nothing
//    outside its own body but the `io` it is handed, so a script can send `fn.toString()` into headless Chromium (scripts/fit-io.mjs) and the
//    page can call it as it is. Every layout read goes through `io` (the page hands it layout-snap.js's readBox, readStyle, readMetric...; the
//    script hands it plain DOM reads), so the off-GPU layout-read allowance is untouched. A test runs each reader from its source text, as the
//    scripts do, to hold that (tests/fit-rules.test.js).
//  - JUDGES (judgeCards, judgeZoom, judgeStructureCard) are pure functions of what a reader returned.
//
// io = { box(el), rects(el), style(el), metric(el, key), ctm(el), seen?(key, el) }   (seen: optional, tells the caller which element a finding is about)
//
// No DOM import at top level: a unit test loads this in node.
import { TITLE_RATIO, WORDS_MIN_PX } from '../card-type.js';
import { EDGE_KINDS, EDGE_WORDS } from './edge-rules.js';

export { TITLE_RATIO, WORDS_MIN_PX };

/** Every category a judge may name, in the order a list shows them. */
export const KINDS = ['enlarged', 'zoomed', 'scroll', 'clipped', 'off', 'small', 'ratio', 'sideways', 'styled', 'chart', 'blank', 'cut', 'tall', 'sheet'];
/** What each kind means, one line, for the list the Check button copies. */
export const KIND_WORDS = {
  enlarged: 'a card up while nothing asked for it',
  zoomed: 'an enlarged card that did not grow or stands off the screen',
  scroll: 'words run past the card',
  clipped: 'a word is cut by its box',
  off: 'text stands partly off the screen',
  small: 'lettering under 12 px',
  ratio: 'the title is under 1.4 times the words',
  sideways: 'something in the card scrolls sideways',
  styled: 'the card showed before it was whole',
  chart: 'a word of a chart stands outside its box',
  blank: 'empty glass above or below the words',
  cut: 'a line runs past the card',
  tall: 'the card scrolls though its words fit the space',
  sheet: 'a phone sheet scrolls while it stops short of the room under the top bar',
};
/** The four kinds that are new (the checks from the standing rules); scripts can leave them out with --old-rules. */
export const NEW_KINDS = ['small', 'ratio', 'sideways', 'styled', 'chart'];

/** The selectors of the presenter's cards. */
export const PRESENTER_CARDS = ['.pz-text', '.pz-data', '.pz-panel'];

// ---------------------------------------------------------------------------------------------------------------------------------------------
// READERS
// ---------------------------------------------------------------------------------------------------------------------------------------------

/**
 * What does not fit right now on the slide's cards (the presenter's `.pz`). Layout only: the page's words and boxes, never a picture.
 * env.minPx: the least a letter may be on the screen (default WORDS_MIN_PX, 12).
 * Returns { n, vw, vh, shown (cards in view), enlarged[], clipped[], off[], scroll[], small[], sideways[], styled[], title, body, fonts }; every list holds strings.
 */
export function readCards(io, env) {
  const minPx = (env && env.minPx) || 12;
  const cards = ['.pz-text', '.pz-data', '.pz-panel'];
  const cardSel = cards.join(',');
  const seen = io.seen || (() => {});
  const vw = io.metric(window, 'innerWidth'), vh = io.metric(window, 'innerHeight');
  const memo = new Map();
  const st = (el) => { let s = memo.get(el); if (!s) { s = io.style(el); memo.set(el, s); } return s; };
  // (Seen when it, and everything it sits in, would show: opacity does not inherit, so a card faded out or parked by its parent has to be found on the way up.)
  const vis = (el) => {
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) { const cs = st(n); if (cs.display === 'none' || (n === el && cs.visibility === 'hidden') || +cs.opacity <= 0.05 || n.hidden) return false; }
    return st(el).visibility !== 'hidden';
  };
  // (How opaque it really is on the way up: the product of every opacity above it.)
  const eop = (el) => { let o = 1; for (let n = el; n && n !== document.documentElement; n = n.parentElement) { if (n.hidden || st(n).display === 'none') return 0; o *= +st(n).opacity; } return o; };
  const name = (el) => `${el.tagName.toLowerCase()}.${String(el.className?.baseVal ?? el.className).split(' ').slice(0, 3).join('.')}`;
  const words = (el, n = 40) => el.textContent.trim().slice(0, n);
  // (The size a letter reaches the screen at: its font size times every `zoom` above it, and an SVG's own matrix.)
  const screenPx = (el) => {
    const fs = parseFloat(st(el).fontSize);
    if (!fs) return 0;
    let k = 1;
    if (typeof SVGElement !== 'undefined' && el instanceof SVGElement) { const m = io.ctm(el); if (m) k = Math.hypot(m.a, m.b); }
    else for (let a = el; a; a = a.parentElement) k *= parseFloat(st(a).zoom) || 1;
    return fs * k;
  };
  const clipped = [], off = [], small = [], sideways = [], styled = [];
  const root = document.querySelector('.pz');
  if (root) for (const el of root.querySelectorAll('*')) {
    if (el.childElementCount || !el.textContent.trim() || el.classList.contains('sr-only') || !vis(el)) continue;
    const r = io.box(el);
    if (!r.width) continue;
    if (io.metric(el, 'scrollWidth') > io.metric(el, 'clientWidth') + 1 && st(el).overflow !== 'visible') { const t = `${name(el)} "${words(el)}" sw${io.metric(el, 'scrollWidth')}>cw${io.metric(el, 'clientWidth')}`; clipped.push(t); seen(t, el); }
    // (Wholly outside the screen is a card parked away or a slide's leftover waiting off stage, not text cut by the edge: only text that is partly in view counts.)
    const inView = r.right > 0 && r.left < vw && r.bottom > 0 && r.top < vh;
    if (inView && (r.right > vw + 2 || r.left < -2 || r.bottom > vh + 2 || r.top < -2)) {
      let p = el, sc = false;
      while (p && p !== root) { const o = st(p); if (/auto|scroll/.test(o.overflowY + o.overflowX)) { sc = true; break; } p = p.parentElement; }
      if (!sc) { const t = `${name(el)} "${words(el)}" [${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}]`; off.push(t); seen(t, el); }
    }
    // (Lettering under the floor, on a card and in view: the smallest first.)
    if (inView && el.closest(cardSel)) {
      const px = screenPx(el);
      if (px && px < minPx - 0.05) { const t = `${name(el)} "${words(el, 30)}" ${px.toFixed(1)} px`; small.push([px, t]); seen(t, el); }
    }
  }
  small.sort((a, b) => a[0] - b[0]);
  // (A card whose real content runs past its box. Not scrollHeight: the GL words' and traces' overlay canvases stand 18 px past the box of a card whose
  // overflow is clipped, which made every such card look like it scrolled. The content is what is not a canvas.)
  const scroll = cards.map((q) => {
    const e = document.querySelector(q);
    if (!e || !vis(e)) return null;
    const box = io.box(e);
    let low = 0, who = '';
    for (const k of e.querySelectorAll('*')) {
      if (k.tagName === 'CANVAS' || k.closest('canvas')) continue;
      // (Inside a box of its own that clips, such as the ascites belly's fill, it is that box that cuts it, not the card.)
      let clippedInside = false;
      for (let n = k.parentElement; n && n !== e; n = n.parentElement) { const o = st(n); if (o.overflowY !== 'visible' || o.overflowX !== 'visible') { clippedInside = true; break; } }
      if (clippedInside) continue;
      const r = io.box(k);
      if (!r.width || !r.height || !vis(k)) continue;
      if (r.bottom - box.bottom > low) { low = r.bottom - box.bottom; who = name(k); }
    }
    if (low <= 2) return null;
    const t0 = document.querySelector('.pz-text'), tb = t0 ? io.box(t0) : null;
    const t = `${q} content runs ${Math.round(low)} px past its box (${who}; box ${Math.round(box.width)} x ${Math.round(box.height)} at y ${Math.round(box.top)}, screen ${vw} x ${vh}; teaching card ${tb ? `y ${Math.round(tb.top)}-${Math.round(tb.bottom)}` : 'none'})`;
    seen(t, e);
    return t;
  }).filter(Boolean);
  // (No card is enlarged until it is asked: a slide that lands with one up, or the zoomed state left over from the one before, is a finding.)
  const enlarged = [document.querySelector('#app')?.classList.contains('pz-zoomed') && 'the page is in its zoomed state', document.querySelector('.pz-data')?.dataset.zoomed !== undefined && 'the data card is zoomed', document.querySelector('.pz-zbtn')?.getAttribute('aria-expanded') === 'true' && 'the enlarge icon says it is up'].filter(Boolean).map((t) => `${t} on entry`);
  // (Nothing inside a card scrolls sideways: a phone's swipe opens the next card.)
  for (const q of cards) {
    const c = document.querySelector(q);
    if (!c || !vis(c)) continue;
    for (const k of [c, ...c.querySelectorAll('*')]) {
      if (k.tagName === 'CANVAS') continue;
      const ox = st(k).overflowX;
      if (ox !== 'auto' && ox !== 'scroll') continue;
      const sw = io.metric(k, 'scrollWidth'), cw = io.metric(k, 'clientWidth');
      if (cw > 0 && sw > cw + 1 && vis(k)) { const t = `${name(k)} in ${q} scrolls sideways (content ${sw} px, box ${cw} px)`; sideways.push(t); seen(t, k); }
    }
  }
  // (A chart drawn on the GPU stands as a hidden model, its words not page text, so nothing above sees them. Each word has its place in the model's own box
  // (x, y, and the viewBox's width and height): a word whose baseline or start is outside that box is cut by the card, the legend and the time row of a chart
  // given less height than it needs. The newest model of each chart box is the one on show.)
  const chart = [];
  for (const q of cards) {
    const c = document.querySelector(q);
    if (!c || !vis(c)) continue;
    for (const b of c.querySelectorAll('.svg-gl-box')) {
      if (!vis(b)) continue;
      const ms = [...b.children].filter((m) => m.hasAttribute && m.hasAttribute('data-svg-model')), m = ms[ms.length - 1];
      if (!m) continue;
      const vb = (m.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
      if (vb.length !== 4 || !(vb[2] > 0 && vb[3] > 0)) continue;
      for (const t of m.querySelectorAll('text')) {
        const w = (t.textContent || t._t || '').trim(), x = parseFloat(t.getAttribute('x')), y = parseFloat(t.getAttribute('y'));
        if (!w || t.closest('[transform],[display="none"]') || isNaN(x) || isNaN(y)) continue;
        if (y > vb[1] + vb[3] + 1 || y < vb[1] - 1 || x > vb[0] + vb[2] + 1 || x < vb[0] - 1) { const k = `${q} chart word "${w.slice(0, 30)}" at [${Math.round(x)}, ${Math.round(y)}] is outside its chart's box ${Math.round(vb[2])} x ${Math.round(vb[3])}`; chart.push(k); seen(k, b); }
      }
    }
  }
  // (Shown before whole.) A card in view that is still being laid out, words before the backing under them, fonts still loading, or a card that is only its tag.
  const prepping = !!document.querySelector('.pz.pz-prep');
  let shown = 0;
  const fonts = document.fonts ? document.fonts.status : 'loaded';
  for (const q of cards) {
    const c = document.querySelector(q);
    if (!c || !vis(c)) continue;
    const b = io.box(c);
    if (!(b.width > 0 && b.height > 0 && b.right > 0 && b.left < vw && b.bottom > 0 && b.top < vh)) continue;
    shown++;
    if (prepping) { const t = `${q} is on the screen while the slide is still being laid out (pz-prep)`; styled.push(t); seen(t, c); }
    if (fonts === 'loading') { const t = `${q} shows its words while the fonts are still loading`; styled.push(t); seen(t, c); }
    if (q === '.pz-text') {
      if (!words(c, 2)) { const t = `${q} is up with no words in it (a shell with its tag)`; styled.push(t); seen(t, c); }
      const sh = document.querySelector('.pz-shade');
      if (sh && st(sh).display !== 'none') {
        const wo = eop(c), so = eop(sh);
        if (wo > 0.1 && wo - so > 0.25) { const t = `${q} words are ${Math.round(wo * 100)}% shown over a backing at ${Math.round(so * 100)}%`; styled.push(t); seen(t, c); }
      }
    }
  }
  // (The slide title against the words under it, as the screen shows them.)
  let title = 0, body = 0, ratioEl = null;
  const te = document.querySelector('.pz-text .pz-h'), be = document.querySelector('.pz-text .pz-line');
  if (te && be && vis(te) && vis(be)) { title = Math.round(screenPx(te) * 10) / 10; body = Math.round(screenPx(be) * 10) / 10; ratioEl = te; }
  if (ratioEl) seen('ratio', ratioEl);
  return { n: document.querySelector('.pzb-n')?.textContent || '', vw, vh, enlarged, clipped: clipped.slice(0, 12), off: off.slice(0, 12), scroll, small: small.slice(0, 12).map((s) => s[1]), sideways: sideways.slice(0, 12), styled, chart: chart.slice(0, 12), title, body, fonts, shown, phone: !!document.querySelector('.pz.stack, .pz.low') };
}

/** Where the two cards really are with one enlarged (getClientRects: the zoom pins getBoundingClientRect to the resting box). */
export function readZoom(io) {
  const vw = io.metric(window, 'innerWidth'), vh = io.metric(window, 'innerHeight'), boxes = {};
  for (const q of ['.pz-text', '.pz-data']) {
    const e = document.querySelector(q), r = e && io.rects(e)[0];
    boxes[q] = r && r.width ? [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)] : null;
  }
  return { vw, vh, boxes, up: document.querySelector('.pz-zbtn')?.getAttribute('aria-expanded') === 'true' };
}

/**
 * A structure card (the open `.action-card`, window.pps.card.el) on the screen: its height, the empty glass above and below its words, a line past its box,
 * whether it scrolls. Layout, not drawn boxes: a card's words ride on transforms while it glides, so their rectangles are not where the layout puts them.
 * Also its lettering under the floor, what scrolls sideways inside it, and whether it is shown before its words are.
 * Returns null when no card is open.
 */
export function readStructureCard(io, card, env) {
  const c = card || (window.pps && window.pps.card && window.pps.card.el) || document.querySelector('.action-card:not([hidden])');
  if (!c || c.hidden) return null;
  const minPx = (env && env.minPx) || 12;
  const seen = io.seen || (() => {});
  const memo = new Map();
  const st = (el) => { let s = memo.get(el); if (!s) { s = io.style(el); memo.set(el, s); } return s; };
  const body = c.querySelector(':scope > .ac-body');
  const H = io.metric(c, 'offsetHeight');
  const kids = body ? [...body.children].filter((e) => io.metric(e, 'offsetHeight') > 0 && !e.classList.contains('wgl')) : [];
  const top = kids.length ? io.metric(body, 'offsetTop') + Math.min(...kids.map((e) => io.metric(e, 'offsetTop'))) : 0;
  const bot = kids.length ? io.metric(body, 'offsetTop') + Math.max(...kids.map((e) => io.metric(e, 'offsetTop') + io.metric(e, 'offsetHeight'))) : 0;
  const max = parseFloat(st(c).maxHeight) || Infinity;
  // (Only a phone's docked card is held to "never scrolls while its words fit": a wide screen's card keeps `overflow-y: auto` always, its scrollbar hidden (app-03-layouts.css), and while the
  // details are open card.js sets ac-scroll by the details' own scroller (.ad-scroll), not by the face under it, so that is the one asked.)
  const docked = c.classList.contains('docked');
  const dscroll = c.querySelector(':scope > .ac-details > .ad-scroll');
  const detFits = !!dscroll && io.metric(dscroll, 'scrollHeight') <= io.metric(dscroll, 'clientHeight') + 1;
  const name = (el) => `${el.tagName.toLowerCase()}.${String(el.className?.baseVal ?? el.className).split(' ').slice(0, 3).join('.')}`;
  const small = [], sideways = [], styled = [];
  const px = (el) => { let k = 1; for (let a = el; a; a = a.parentElement) k *= parseFloat(st(a).zoom) || 1; return (parseFloat(st(el).fontSize) || 0) * k; };
  for (const el of c.querySelectorAll('*')) {
    const s = st(el);
    if (s.display === 'none' || s.visibility === 'hidden' || el.classList.contains('ac-ghost') || el.closest('.ac-ghost')) continue;
    if (!el.childElementCount && el.textContent.trim() && !el.classList.contains('sr-only') && io.box(el).width) {
      const p = px(el);
      if (p && p < minPx - 0.05) { const t = `${name(el)} "${el.textContent.trim().slice(0, 30)}" ${p.toFixed(1)} px`; small.push([p, t]); seen(t, el); }
    }
    if ((s.overflowX === 'auto' || s.overflowX === 'scroll') && io.metric(el, 'clientWidth') > 0 && io.metric(el, 'scrollWidth') > io.metric(el, 'clientWidth') + 1) { const t = `${name(el)} scrolls sideways (content ${io.metric(el, 'scrollWidth')} px, box ${io.metric(el, 'clientWidth')} px)`; sideways.push(t); seen(t, el); }
  }
  small.sort((a, b) => a[0] - b[0]);
  const shown = +st(c).opacity > 0.05;
  if (shown && c.classList.contains('ac-prep')) { const t = 'the card is on the screen while it is still being laid out (ac-prep)'; styled.push(t); seen(t, c); }
  if (shown && body && !body.textContent.trim() && io.metric(c, 'offsetHeight') > 0) { const t = 'the card is up with no words in it'; styled.push(t); seen(t, c); }
  if (shown && document.fonts && document.fonts.status === 'loading') { const t = 'the card shows its words while the fonts are still loading'; styled.push(t); seen(t, c); }
  seen('card', c);
  return {
    h: H, gapTop: Math.round(top), gapBot: Math.round(H - bot), cut: Math.round(bot - H), scroll: c.classList.contains('ac-scroll'),
    ovf: body ? st(body).overflowY : 'hidden', atMax: H >= max - 1, docked, detail: !!dscroll, detFits, small: small.slice(0, 12).map((s) => s[1]), sideways: sideways.slice(0, 12), styled,
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// JUDGES
// ---------------------------------------------------------------------------------------------------------------------------------------------

const P = (kind, text) => ({ kind, text, line: `${kind}: ${text}` });

/** The least ratio of title to words that passes (a hair under TITLE_RATIO: sizes are measured to a tenth of a pixel). */
export const RATIO_TOLERANCE = 0.02;
/** A phone's stacked or sideways slide (1.45 and 1.4 times the role sizes: a 23.2 px title over a 17.4 px body, 1.33) may stand at 1.3: Mohammad, 19 Nov 2026, "1.33 is OK if text needs more space". */
export const PHONE_TITLE_RATIO = 1.3;

/** The problems of a readCards result, as { kind, text, line }. */
export function judgeCards(r, opts = {}) {
  const old = opts.oldRules === true, out = [];
  for (const t of r.enlarged || []) out.push(P('enlarged', t));
  for (const t of r.scroll || []) out.push(P('scroll', t));
  for (const t of r.clipped || []) out.push(P('clipped', t));
  for (const t of r.off || []) out.push(P('off', t));
  if (!old) {
    for (const t of r.small || []) out.push(P('small', t));
    { const least = r.phone ? PHONE_TITLE_RATIO : TITLE_RATIO; if (r.title > 0 && r.body > 0 && r.title < least * r.body * (1 - RATIO_TOLERANCE)) out.push(P('ratio', `the title is ${r.title} px over words of ${r.body} px (${(r.title / r.body).toFixed(2)}x; at least ${least}x${r.phone ? ' on a phone' : ''})`)); }
    for (const t of r.sideways || []) out.push(P('sideways', t));
    for (const t of r.styled || []) out.push(P('styled', t));
    for (const t of r.chart || []) out.push(P('chart', t));
  }
  return out;
}

/** The problems of an enlarged card: `z` is readZoom with the card up, `rest` readZoom at rest, `how` what asked for it ('icon', 'tap'). */
export function judgeZoom(z, rest, how) {
  if (!z.up) return [P('zoomed', `(${how}): the card did not enlarge`)];
  // (The camera zooms into the card: the instrument card is the focus and is what must stand whole and larger. The teaching card rides the same turn, where it stands.)
  const b = z.boxes['.pz-data'], r0 = rest && rest.boxes['.pz-data'], out = [];
  if (!b) return [P('zoomed', `(${how}): the enlarged card is not on the screen`)];
  if (b[0] < -2 || b[1] < -2 || b[2] > z.vw + 2 || b[3] > z.vh + 2) out.push(P('zoomed', `(${how}): enlarged card [${b}] runs off the ${z.vw} x ${z.vh} screen`));
  if (r0 && (b[2] - b[0]) < (r0[2] - r0[0]) * 1.02) out.push(P('zoomed', `(${how}): the enlarged card did not grow (${r0[2] - r0[0]} px wide at rest, ${b[2] - b[0]} px zoomed)`));
  return out;
}

/** Empty glass allowed above the first line or below the last of a structure card (its own padding is 14 and 12). */
export const BLANK_MAX = 24;

/** The problems of a readStructureCard result (null: no card, nothing to judge). */
export function judgeStructureCard(m, opts = {}) {
  if (!m) return [];
  const out = [];
  if (m.gapTop > BLANK_MAX || m.gapBot > BLANK_MAX) out.push(P('blank', `${m.gapTop}px above, ${m.gapBot}px below (card ${m.h}px)`));
  // (A card at its tallest whose body scrolls (ac-scroll, overflow auto: the phone sideways, 280 px of room for a TIPS card's 318) has its lower rows to scroll to, not cut.)
  if (m.cut > 1 && !(m.atMax && m.ovf !== 'hidden')) out.push(P('cut', `a line runs ${m.cut}px past the card`));
  // (`docked` and `detail` are absent from a read made before they existed: judged as a docked face then, as it always was.)
  const tallNow = m.detail ? m.scroll && m.detFits : m.scroll || m.ovf !== 'hidden';
  if (m.docked !== false && !m.atMax && tallNow) out.push(P('tall', `scrolls (ac-scroll ${m.scroll}, overflow ${m.ovf}) though it fits the space`));
  if (!opts.oldRules) {
    for (const t of m.small || []) out.push(P('small', t));
    for (const t of m.sideways || []) out.push(P('sideways', t));
    for (const t of m.styled || []) out.push(P('styled', t));
  }
  return out;
}

/**
 * ONE SELF-CONTAINED FUNCTION (like readCards: scripts/fit-io.mjs can send it into a page). The phone sheet on show (Treat, Settings, History, the menus and the palette) and the room it has: its box, the top
 * bar's foot, the room between them and whether anything in it scrolls. Null when no sheet shows or the screen is not a phone's width (the sheets are sheets only there; a wider screen's are popovers).
 * Folded in from scripts/phone-sheet-fit.mjs (19 Nov 2026), which opened each sheet on a phone by hand.
 */
export function readSheet(io) {
  const vis = (e) => { const cs = io.style(e); return !e.hidden && cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0.5 && io.box(e).height > 40; };
  const el = [...document.querySelectorAll('.treat-card, .history-card, .menu.as-sheet, .why-pop.as-sheet, .pal, .modal')].filter(vis).at(-1);
  if (!el || window.innerWidth > 500) return null;
  const r = io.box(el);
  const tbEl = document.querySelector('.topbar'), tb = tbEl ? io.box(tbEl).bottom : 56;
  const scrollers = [el, ...el.querySelectorAll('*')].filter((n) => { const o = io.style(n).overflowY; return (o === 'auto' || o === 'scroll') && io.metric(n, 'scrollHeight') > io.metric(n, 'clientHeight') + 1 && io.metric(n, 'clientHeight') > 40; });
  return { cls: String(el.className).split(' ').slice(0, 3).join('.'), name: el.getAttribute('aria-label') || '', pal: el.classList.contains('pal'), top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height), topBar: Math.round(tb), room: Math.round(r.top - tb), scrolls: scrollers.length > 0, moving: !!el.getAnimations && el.getAnimations().length > 0 };
}

/** How far a sheet's top may stand below the top bar's foot while its words scroll (a sheet that scrolls has used the room; this is the gap). */
export const SHEET_SHORT_MAX = 40;

/**
 * The problems of a readSheet result (null: no sheet). A sheet that scrolls while it stops short of the room is a sheet that could have been taller (the tester at 390 x 844, 18 Nov 2026: Treat at 405 px with
 * 726 px of words and free room above it). The Layers menu stops under half the screen on purpose (the figure stays in view as its rows are toggled), and the command palette's list is a fixed height on purpose
 * (it must not jump as the query changes): neither is held to it. A sheet still gliding is not read.
 */
export function judgeSheet(m) {
  if (!m || m.moving) return [];
  if (m.scrolls && m.room > SHEET_SHORT_MAX && !m.pal && !/layers/i.test(m.name || m.cls)) return [P('sheet', `${m.name || m.cls} scrolls while stopping ${m.room}px short of the room under the top bar (sheet ${m.top}-${m.bottom}, ${m.h}px)`)];
  return [];
}

/** The problems as plain lines, for a script's log or a copied list. */
export const linesOf = (problems) => problems.map((p) => p.line);

/** The text the Check button copies: where it ran, then each problem under its kind. */
export function reportText(problems, where = {}) {
  const head = [`Card check${where.title ? `: ${where.title}` : ''}`, [where.look && `look ${where.look}`, where.size && `screen ${where.size}`, where.when].filter(Boolean).join(', ')].filter(Boolean).join('\n');
  if (!problems.length) return `${head}\nEvery card fits: no problems found.`;
  const lines = [head, `${problems.length} problem${problems.length === 1 ? '' : 's'}:`];
  for (const k of [...KINDS, ...EDGE_KINDS]) {
    const of = problems.filter((p) => p.kind === k);
    if (!of.length) continue;
    lines.push('', `${k} (${KIND_WORDS[k] || EDGE_WORDS[k]})`, ...of.map((p) => `  - ${p.where ? `[${p.where}] ` : ''}${p.text}`));
  }
  return lines.join('\n');
}
