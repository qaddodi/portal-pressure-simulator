// The label layer: block build and render, label glide, leader lines and the search grids.
// (moved out of stage.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)
import { caught } from './caught.js';
import { D_SURFACE, EASE_ARRIVE } from './ease.js';
import { HOVER_LINK, labelTarget } from './hover-link.js';
import { reduceMotionMQ as reduceMotion } from './motion.js';
import { restPass } from './rest-pass.js';
import { sinceSource } from './since-ref.js';
import { store } from './store.js';
import { clamp, putText, s } from './util.js';

export function createLabelLayer(st, live) {
  const { ANCHOR_W, LABEL_GLIDE_MS, LINE_H, NO_ANCHOR, dprDots, easeInOut, explain, fontPx, gLeaders, late, lateQueue, localToWorldInto, nextFrame, onSelect, pinKind, pool, setA, toneCol, unlitKeys, updateLabels, wrap } = st;
  // A label that is hidden (off the screen, behind a card, colliding, fading out) is neither a keyboard stop nor read aloud: it keeps only its look
  // until it is wanted again. (One with focus on it keeps its place until focus moves.)
  function labelStop(b, hid) {
    if (b.hid === hid || (hid && document.activeElement === b.g)) return;
    b.hid = hid;
    if (hid) b.g.setAttribute('aria-hidden', 'true'); else b.g.removeAttribute('aria-hidden');
    if (b.g.hasAttribute('tabindex')) b.g.setAttribute('tabindex', hid || !live.keyStops ? '-1' : '0');
  }
  function blockEl(key, cls, interactiveNode, onClick) {
    let b = pool.get(key);
    if (b) return b;
    const g = s('g', { class: 'lb ' + cls, 'data-key': key });
    const act = onClick || (interactiveNode ? () => onSelect({ type: 'node', id: interactiveNode }) : null);
    if (act) {
      g.setAttribute('tabindex', live.keyStops ? '0' : '-1'); g.setAttribute('role', 'button');
      g.addEventListener('click', act);
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); } });
    }
    // A reading that names a vessel lights it while the pointer is over it, or keyboard focus is on it (hover link, below).
    if (HOVER_LINK && labelTarget(key)) {
      g.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') live.linkHover(key); });
      g.addEventListener('pointerleave', () => live.linkHover(null, key));
      g.addEventListener('focus', () => { try { if (g.matches(':focus-visible')) live.linkFocus(key); } catch (e) { caught('stage:9715', e); /* an engine without :focus-visible: no link from focus */ } });
      g.addEventListener('blur', () => live.linkFocus(null, key));
    }
    late('label', g);
    b = { g, sig: '', seen: 0 };
    pool.set(key, b);
    if (explain.key) g.classList.add(explain.state(key) === 'on' ? 'spot-on' : 'spot-dim');   // (a label that comes in while one is explained steps back too)
    return b;
  }
  const GLIDE_P = [0, 0], glideRaw = [NaN, NaN, NaN, NaN];   // (glideAt's answer, one kept pair read at once; the camera as last turned to text)
  const glideAt = (g, now) => { const u = easeInOut(clamp((now - g.t0) / LABEL_GLIDE_MS, 0, 1)); GLIDE_P[0] = g.fx + (g.tx - g.fx) * u; GLIDE_P[1] = g.fy + (g.ty - g.fy) * u; return GLIDE_P; };
  function labelGlideTick() { live.glideRaf = 0; if (live.F && !live.camMove) updateLabels(live.F, true); }
  function labelGlide(out) {
    const now = performance.now();
    // (The camera to two decimals, as text; made again only when one of its numbers is not the one last seen, else it is the same text.)
    let still = live.CTM.a === glideRaw[0] && live.CTM.b === glideRaw[1] && live.CTM.e === glideRaw[2] && live.CTM.f === glideRaw[3];
    if (!still) {
      glideRaw[0] = live.CTM.a; glideRaw[1] = live.CTM.b; glideRaw[2] = live.CTM.e; glideRaw[3] = live.CTM.f;
      const cam = live.CTM.a.toFixed(2) + ',' + live.CTM.b.toFixed(2) + ',' + live.CTM.e.toFixed(2) + ',' + live.CTM.f.toFixed(2);
      still = cam === live.glideCam;
      live.glideCam = cam;
    }
    // The GPU label layer already glides from the ridden position at a pinch landing. A second layout glide would move its target
    // on every frame and make the label drift again after the hand stops.
    // (Drawn by the GPU, no label eases here: its offset from its point is the layout's at once, and label-gl.js alone moves one that changes
    // slot, once (V-LBL-1). Eased here as well, the GPU's labels were carried to their places over 450 ms: "the labels match slowly
    // towards their positions", Mohammad, 3 Nov.)
    const snap = (!!live.labelGL && !live.labelGL.lost) || reduceMotion.matches || live.camMove || wrap.classList.contains('cath-on') || !!live.lz?.isOpen();
    let moving = false;
    for (const it of out) {
      const b = pool.get(it.key);   // (a label with no block yet is new: it fades in where it stands)
      if (!b) continue;
      if (it.hide || it.live || it.fixedLead || it.key === 'scan') { b.gl = null; b.at = null; continue; }
      const rel = Number.isFinite(it.ax) && Number.isFinite(it.ay) && it.cls !== 'organ' && it.cls !== 'lane';
      // (The edge's pull (it.px, it.py) is the screen's, not the slot's: a label held against the edge keeps still while the figure pans past it. Easing
      // its offset from the station would carry it with the figure and ease it back, one camera step behind, every frame: 3 Nov 2026.)
      const px = it.px || 0, py = it.py || 0, ox = rel ? it.ax : 0, oy = rel ? it.ay : 0, tx = it.x - px - ox, ty = it.y - py - oy;
      if (!b.at || snap || b.rot !== !!it.rot || b.rel !== rel || (!rel && !still)) b.gl = null;
      else {
        let g = b.gl;
        const px = g ? g.tx : b.at[0], py = g ? g.ty : b.at[1];
        if (Math.hypot(tx - px, ty - py) > 0.5) {
          const sp = g ? glideAt(g, now) : b.at, o = b.glo || (b.glo = { fx: 0, fy: 0, tx: 0, ty: 0, t0: 0 });   // (b.glo: this label's glide record, kept and rewritten)
          o.fx = sp[0]; o.fy = sp[1]; o.tx = tx; o.ty = ty; o.t0 = now; g = b.gl = o;
        }
        if (g && now - g.t0 >= LABEL_GLIDE_MS) b.gl = g = null;
        if (g) { g.tx = tx; g.ty = ty; const [sx, sy] = glideAt(g, now); it.x = ox + sx + px; it.y = oy + sy + py; moving = true; }
      }
      if (b.at) { b.at[0] = tx; b.at[1] = ty; } else b.at = [tx, ty];
      b.rel = rel; b.rot = !!it.rot;
    }
    // (Laid out again each frame until every glide lands; nothing else runs the layout while the figure is still.)
    if (moving && !live.glideRaf) live.glideRaf = nextFrame(labelGlideTick);
  }
  // The leader lines and their dots, kept by the label they belong to: a new one fades in, one no longer wanted fades out, and the
  // rest are moved in place (rebuilt wholesale, they popped in and out with every change).
  const leadEls = new Map();
  // (A new leader takes a blank line or dot made ahead, between frames, never one made in the frame (2 Nov 2026, "Move everything to
  // GPU"): when none is left it comes in the next frame, after the spares are made again.)
  const leadSpare = new Map(), LEAD_SPARE = 12;
  let leadFill = 0, leadShort = false;
  // (A leader that found no blank asks for the labels to be laid out again once the blanks are made: with the figure still, nothing
  // else would, and the circuit's leaders never came in.)
  function leadTop() {
    leadFill = 0;
    for (const tag of ['path', 'circle']) { const l = leadSpare.get(tag) || []; while (l.length < LEAD_SPARE) l.push(s(tag, {})); leadSpare.set(tag, l); }
    if (leadShort) { leadShort = false; nextFrame(() => { if (live.F) updateLabels(live.F, true); }); }
  }
  const leadTake = (tag) => { const el = leadSpare.get(tag)?.pop() || null; if (!leadFill && (leadSpare.get(tag)?.length ?? 0) < LEAD_SPARE / 2) leadFill = restPass(leadTop); return el; };
  // (The keys wanted and the leaders wanted, kept and emptied for each call; late('lead') reads the list only when the rest pass runs, and
  // a later call's list is then the one that stands. A leader's removal after its fade is a function taking its key and its line, asked
  // of setTimeout with them, so none is made per call.)
  const leadKeep = new Set(), leadWantEls = [];
  const leadGoneFire = (k, el) => { if (leadEls.get(k) === el && el._gone) { el.remove(); leadEls.delete(k); } };
  // (Which labels this layout gave a dot (1), a dot's halo (2) or a leader (4), by the label's key: written on its record (pos.want), which
  // label-gl.js draws its pinned dot and leader from, so they never wait for the SVG's leaders to be put in or taken out (L3 P2).)
  const leadBits = new Map();
  // (Only a label this layout laid: one fading out keeps the bits it had, so its dot and leader fade with it, as the SVG's did.)
  const wantPut = (b, k) => { if (b.pos && b.seen === live.laidFrame) b.pos.want = leadBits.get(k) | 0; };
  function paintLeaders(want) {
    const keep = leadKeep, els = leadWantEls;
    keep.clear(); els.length = 0; leadBits.clear();
    for (let i = 0; i < want.length; i++) {
      const w = want[i], k = w.at['data-k'];
      keep.add(w.k);
      if (k) leadBits.set(k, (leadBits.get(k) | 0) | (w.tag === 'path' ? 4 : (w.at.class || '').includes('halo') ? 2 : 1));
    }
    pool.forEach(wantPut);
    for (const w of want) {
      let el = leadEls.get(w.k);
      if (el && el.tagName !== w.tag) { el.remove(); leadEls.delete(w.k); el = null; }
      if (!el) { el = leadTake(w.tag); if (!el) { leadShort = true; if (!leadFill) leadFill = restPass(leadTop); continue; } leadEls.set(w.k, el); }
      if (el._gone) { clearTimeout(el._gone); el._gone = 0; el.classList.remove('ld-gone'); }
      for (const a in w.at) setA(el, a, w.at[a]);
      if (explain.key) { const on = w.at['data-k'] === explain.key; el.classList.toggle('spot-dim', !on); el.classList.toggle('spot-on', on); }   // (a leader made or moved while a label is explained: label-explain.js)
      els.push(el);
    }
    // (A new one goes in just before the next one wanted that is already in, so every line still lies under every dot.)
    late('lead', els);
    dprDots();
    for (const [k, el] of leadEls) {
      if (keep.has(k) || el._gone) continue;
      if (reduceMotion.matches) { el.remove(); leadEls.delete(k); continue; }
      el.classList.add('ld-gone');
      el._gone = setTimeout(leadGoneFire, 360, k, el);
    }
  }
  const termsLit = () => { const st = store.get(); const t = st.presenting && st.presentTerms; if (!t) return false; for (const k in t) return true; return false; };   // (a slide that lights some term)
  const termTone =(id) => { const st = store.get(); return (st.presenting && st.presentTerms?.[id]) || null; };
  // A label new to the figure, or one whose pieces change (another line, another run), is built between frames (a rest pass), never in
  // the frame that asks for it: a frame makes no element (2 Nov 2026, "Move everything to GPU"). Until then it stands as it was (a new
  // one is not there yet); the build lays it out at once, with the newest words asked for it.
  const blockWant = new Map();
  let blockAsk = 0;
  function blockBuild() {
    blockAsk = 0;
    const its = [...blockWant.values()];
    blockWant.clear();
    for (const it of its) {
      const b = blockEl(it.key, it.cls, it.node, it.onClick), sig = blockSig(it);
      if (sig !== b.sig) blockKids(b, it, sig);
      renderBlock(it);
    }
    // (This pass is between frames already, and it moved each label to its place: its new pieces, fills and the label itself land in the
    // same task, not a later one, in which a frame could draw its old words or pill against the new place.)
    lateQueue.now();
    // (Handed to the GPU now, with the anchors taken at their layout: a label built during a pan or a glide used to wait for the next labelTail,
    // which the camera's hold skips, and showed only at the landing. 5 Nov 2026 review #3. sync itself waits while a ride runs.)
    live.labelGlSync?.();
  }
  const blockSig = (it) => JSON.stringify([it.lines.map((line) => line.map(({ t, fill, cls, ...style }) => style)), it.align, !!it.swatch, it.bg, !!it.hit, it.cls, live.labelK, fontPx(14), it.fxw ?? (/^focus/.test(it.key) ? it.lines.map((line) => line.map((r) => r.t).join('')) : 0)]);
  // (Where a label is anchored, taken in the layout's own frame, under the camera it was solved under: a label built later in a rest pass (new,
  // or its pieces changed) keeps these, never the camera of that later moment. 5 Nov 2026 review #2: a pan begun between the layout and the
  // build put its world anchor off by the pan, and it stood rigidly on the wrong spot until the next solve.)
  function stampAnchor(it) {
    if (it.aSt) return;
    it.aSt = true;
    it.aPk = it.key.startsWith('n:') && !it.live && Number.isFinite(it.ax) && Number.isFinite(it.ay) ? pinKind(it.key.slice(2), it.ax, it.ay, it.au) : 0;
    if (it.cls === 'organ' && !it.rot) { it.ax = it.x + it.w / 2; it.ay = it.y + it.h / 2; }
    const gp = !(it.aPk > 0) && !it.live && !it.hide && Number.isFinite(it.ax) && Number.isFinite(it.ay) && (live.morph === 0 || live.morph === 1) && !NO_ANCHOR.test(it.key);
    if (gp) localToWorldInto(ANCHOR_W, it.ax, it.ay);
    it.aGw = gp && Number.isFinite(ANCHOR_W[0]) && Number.isFinite(ANCHOR_W[1]);
    it.aWx = it.aGw ? ANCHOR_W[0] : 0; it.aWy = it.aGw ? ANCHOR_W[1] : 0; it.aWv = live.morph; it.aView = live.morphTarget;
  }
  function renderBlock(it) {
    stampAnchor(it);
    const b = pool.get(it.key), sig = blockSig(it);
    if (!b || sig !== b.sig) {
      blockWant.set(it.key, it);
      if (!blockAsk) blockAsk = restPass(blockBuild);
      if (b) b.seen = live.laidFrame;   // (kept as it stands until its new pieces are in)
      return;
    }
    b.seen = live.laidFrame;
    b.g.classList.toggle('ring', / ring\b/.test(it.cls));   // (a slide's pill that could find no spot off the vessels: see the focus callout)
    // A presenter slide's term (presentTerms): the station's label takes the term's colour, eased (.lb.term).
    const tone = it.node ? termTone(it.node) : it.res ? live.resLit.get(it.res) || null : null;   // (a resistor's reading takes its station tone when the slide's words point at it)
    if (tone !== (b.tone || null)) { b.tone = tone; b.g.classList.toggle('term', !!tone); if (tone) b.g.style.setProperty('--term', toneCol(tone)); }   // (a tone may name its own token, '--tour-sys' for the right atrium: as var(--tr---tour-sys) it was unset and the label fell back to black, dark on dark in the dark theme)
    // A slide that lights terms (presentTerms) dims every station it does not light to 35 %, its leader too, and it keeps its place (V-LIT-3, Mohammad's pick 14.3 B): .unlit, app.css.
    // (A slide's step numbers (fx-step, V10) point at what the card's words number: they keep full strength, as the card's own do.)
    const unlit = !tone && termsLit() && !/\b(focus|fx-step)\b/.test(it.cls);
    if (unlit !== !!b.unlit) { b.unlit = unlit; if (unlit) unlitKeys.add(it.key); else unlitKeys.delete(it.key); b.g.classList.toggle('unlit', unlit); for (const el of gLeaders.querySelectorAll(`[data-k="${it.key}"]`)) el.classList.toggle('unlit', unlit); }
    if (!!it.onVessel !== !!b.onVessel) { b.onVessel = !!it.onVessel; b.g.classList.toggle('on-vessel', b.onVessel); }
    let i = 0;
    for (const line of it.lines) for (const r of line) {
      const sp = b.spans[i++];
      putText(sp, r.t);
      if (sp.getAttribute('class') !== (r.cls || '')) sp.setAttribute('class', r.cls || '');
      if ((sp._fill || '') !== (r.fill || '')) { sp._fill = r.fill || ''; late('fill', sp, sp._fill); }
    }
    blockRest(b, it);
  }
  // Text and pressure colors change far more often than label structure.
  // Retain the text nodes (and keyboard focus) across numeric updates. (A run's class is its colour, as its fill is: a change
  // badge turning from + to − swaps its class on the same tspan rather than building the label again: 16 Oct.)
  // (A slide's mark is drawn afresh when its words change: a pill kept from another slide's longer mark could hold its old width
  // for a while after the new one was set: Review 16 Oct.)
  // (Between frames only: blockBuild.)
  function blockKids(b, it, sig) {
    {
      b.sig = sig;
      const kids = [];
      b.spans = [];
      b.textLines = [];
      // (A label's pill has 6 px corners, the cards' tile family; only a numbered marker, a round chip, takes its full height: it.chip.)
      let swEl = null, bgEl = null;
      if (it.bg) kids.push(bgEl = s('rect', { class: 'lb-bg', x: -it.padX, y: -it.padY, width: it.w + 2 * it.padX, height: it.h + 2 * it.padY, rx: it.chip ? (it.h + 2 * it.padY) / 2 : 6 }));
      // A clickable caption is a larger target than its small letters.
      if (it.hit) kids.push(s('rect', { class: 'lb-hit', x: -10, y: -8, width: it.w + 20, height: it.h + 16, rx: 8 }));
      let y = 0;
      const tx = it.swatch ? (it.align === 'end' ? it.w - 7 : 7) : 0;
      for (const line of it.lines) {
        const lh = LINE_H(line);
        const t = s('text', { x: it.align === 'end' ? it.w - (it.swatch ? 7 : 0) : it.align === 'middle' ? it.w / 2 : tx, y: y + lh * 0.78, 'text-anchor': it.align === 'end' ? 'end' : it.align === 'middle' ? 'middle' : 'start' });
        b.textLines.push(t);
        line.forEach((r, i) => {
          const sp = s('tspan', { class: r.cls || '', 'font-size': +fontPx(r.size).toFixed(2), 'font-weight': r.weight || 500 });
          if (i) sp.setAttribute('dx', +((r.gap ?? 3) * live.labelK).toFixed(2));
          if (r.track) sp.setAttribute('letter-spacing', `${r.track}em`);
          b.spans.push(sp);
          t.append(sp);
        });
        kids.push(t);
        y += lh;
      }
      if (it.swatch) kids.unshift(swEl = s('rect', { class: 'lb-sw', x: it.align === 'end' ? it.w - 3 : 0, y: 1, width: 3, height: Math.max(8, it.h - 2), rx: 1.5 }));
      late('kids', b.g, kids);
      // (A slide's mark that stays but takes new words fades the new words in, never swaps them in at once.)
      // (A live callout's words keep their shape as its numbers tick: it.fxw, so only a new slide's words fade in.)
      const words = it.fxw ?? (/^focus/.test(it.key) ? it.lines.map((line) => line.map((r) => r.t).join('')).join('\n') : null);
      if (words != null && b.words != null && words !== b.words && b.g.style.display !== 'none' && !reduceMotion.matches) { b.g.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: D_SURFACE, easing: EASE_ARRIVE }); live.labelGL?.hold(b.g, D_SURFACE); }
      b.words = words;
      b.sw = swEl;
      b.bg = bgEl;
    }
  }
  // A label's look id (L3 P3, pos.look): a number made from everything its look is written from here, its pieces and their sizes (its
  // signature, blockSig), each run's class and colour, its swatch's colour, its states (sel, unlit, tone, on a vessel, hidden, explained) and
  // its key's family (up to the second colon: the stylesheet selects some by it, app.css [data-key^="n:TIPS:"]). Its words, its width and its
  // place are not in it: label-gl.js describes the labels of one look from styles read once (createLookStyles).
  let lh1 = 0, lh2 = 0;
  const lmC = (c) => { lh1 = Math.imul(lh1 ^ c, 0x01000193); lh2 = (Math.imul(lh2 + c + 1, 0x85ebca6b) ^ (lh2 >>> 13)) | 0; };
  const lmS = (str) => { if (str) for (let i = 0; i < str.length; i++) lmC(str.charCodeAt(i)); lmC(1); };
  function lookOf(b, it) {
    lh1 = 0x811c9dc5 | 0; lh2 = 0x9e3779b9 | 0;
    lmS(b.sig);
    const k = it.key, i0 = k.indexOf(':'), i1 = i0 < 0 ? -1 : k.indexOf(':', i0 + 1), n = i1 >= 0 ? i1 + 1 : i0 + 1;
    for (let c = 0; c < n; c++) lmC(k.charCodeAt(c));
    lmC(2);
    for (const line of it.lines) { for (const r of line) { lmS(r.cls); lmS(r.fill); } lmC(3); }
    lmS(it.swatch || '');
    lmS(b.tone ? toneCol(b.tone) : '');
    const g = b.g.classList;
    lmC((it.sel ? 1 : 0) | (b.unlit ? 2 : 0) | (b.onVessel ? 4 : 0) | (it.hide ? 8 : 0) | (g.contains('spot-on') ? 16 : 0) | (g.contains('spot-dim') ? 32 : 0) | (g.contains('ring') ? 64 : 0));
    return (lh1 >>> 0) * 2097152 + ((lh2 >>> 0) & 0x1fffff);
  }
  function blockRest(b, it) {
    for (const text of b.textLines) setA(text, 'x', it.align === 'end' ? it.w - (it.swatch ? 7 : 0) : it.align === 'middle' ? it.w / 2 : it.swatch ? 7 : 0);
    if (b.bg) { setA(b.bg, 'width', it.w + 2 * it.padX); setA(b.bg, 'height', it.h + 2 * it.padY); }
    if (it.label) setA(b.g, 'aria-label', it.label);
    if (b.sw) { setA(b.sw, 'fill', it.swatch); setA(b.sw, 'x', it.align === 'end' ? it.w - 3 : 0); }
    b.g.classList.toggle('sel', !!it.sel);
    b.g.classList.toggle('lb-off', !!it.hide);
    labelStop(b, !!it.hide);
    // A turned caption reads bottom to top: its box's top-left is (x, y), and its text runs up from the bottom.
    if (it.x !== b.tx || it.y !== b.ty || it.w !== b.tw || !!it.rot !== b.tr) {
      b.tx = it.x; b.ty = it.y; b.tw = it.w; b.tr = !!it.rot;
      setA(b.g, 'transform', it.rot ? `translate(${it.x.toFixed(1)} ${(it.y + it.w).toFixed(1)}) rotate(-90)` : `translate(${it.x.toFixed(1)} ${it.y.toFixed(1)})`);
    }
    // (Where the GPU lays its picture: the same origin, label-gl.js.)
    // (A station's label is pinned to its point: pid names the station, pax/pay where its point stood in this layout, the same frame of
    // reference as x and y, so the GPU draws it at the point's place now plus its offset, label-gl.js pinTo. Unrounded: the offset is exact.)
    // (Which point it was laid out against, found by matching it: the middle of its vessel (1) or the station itself (2). One that is neither,
    // a point the layout chose by other rules, is not pinned and moves as before.)
    const pk = it.aPk, pin = pk > 0;   // (taken in the layout's frame: stampAnchor)
    const px0 = +it.x.toFixed(1), py0 = +(it.rot ? it.y + it.w : it.y).toFixed(1);
    // (Every other figure label gets a world anchor (step 3 of the rigid-labels plan): its point as laid out, taken back to the world under this layout's camera, so the GPU keeps it on that point through any pan, pinch or zoom. Not the screen's furniture (zone titles, lanes, the scan, the stage) and not between views. An organ's name is a region name (leader rule L1): its point is where it is drawn, so it never stands off its own anchor.)
    const gw = it.aGw;
    b.pos = { g: b.g, x: px0, y: py0, rot: !!it.rot, pid: pin ? it.key.slice(2) : gw ? it.key : null, pax: pin || gw ? it.ax : 0, pay: pin || gw ? it.ay : 0, pmid: pk === 1, pau: it.au ?? 0.5, pwx: it.aWx, pwy: it.aWy, pwv: gw ? it.aWv : null, view: it.aView, mA: null, want: leadBits.get(it.key) | 0, look: lookOf(b, it) };
    // (Its box on an 8 px grid, for the corner credit's look (labelBoxStamp): a number ticking inside it moves nothing the credit avoids.)
    const c0 = Math.floor((it.x - it.padX) / 8), c1 = Math.floor((it.y - it.padY) / 8), c2 = Math.ceil((it.x + (it.rot ? it.h : it.w) + it.padX) / 8), c3 = Math.ceil((it.y + (it.rot ? it.w : it.h) + it.padY) / 8), ch = !!it.hide;
    if (!b.box || c0 !== b.bc0 || c1 !== b.bc1 || c2 !== b.bc2 || c3 !== b.bc3 || ch !== b.bch) {
      b.bc0 = c0; b.bc1 = c1; b.bc2 = c2; b.bc3 = c3; b.bch = ch;
      b.box = `${c0},${c1},${c2},${c3}${ch ? 'h' : ''}`;
    }
    b.gone = null;
    b.g.style.display = '';
  }
  const rectOf = (it) => ({ x0: it.x - it.padX, y0: it.y - it.padY, x1: it.x + it.w + it.padX, y1: it.y + it.h + it.padY });
  // Candidate offset of a block around its anchor.
  // A ring's sixteen spots, level ones first (east, west), then ever further from level.
  // Spots for a mark's centre around its station, every 6 px out to 150, nearest first (see the focus callout).
  const MARK_GRID = [];
  for (let x = -150; x <= 150; x += 6) for (let y = -150; y <= 150; y += 6) if (Math.hypot(x, y) <= 150 && Math.hypot(x, y) >= 24) MARK_GRID.push([x, y]);
  MARK_GRID.sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
  // (Steps for a Circuit reading pulled onto a station's ring, every 4 px out to 120, nearest first: see layoutLabels.)
  const PULL_GRID = [];
  for (let x = -120; x <= 120; x += 4) for (let y = -120; y <= 120; y += 4) if ((x || y) && Math.hypot(x, y) <= 120) PULL_GRID.push([x, y]);
  PULL_GRID.sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
  const REF = () => {
    const st = store.get();
    if (!st.compareSnap && st.presenting && st.colorMode === 'since') return sinceRef();
    return st.compareSnap ? st.compareSnap.P : st.healthy?.P;
  };
  // A "change since" slide's reference (deck visuals V11, ext-highlights.js: lens 'since'): the network its slide counts from
  // (changeRef), and until that is set the one the figure showed as the lens came in, so the colours move as the change lands.
  // It never touches Patients' pinned moment (compareSnap). A new reference recolours through the lens crossfade, as a jump does.
  const sinceRef = () => { if (!live.sinceP && live.F) live.sinceP = Float32Array.from(live.F.Pf || live.F.P); return live.sinceP || store.get().healthy?.P; };
  sinceSource(sinceRef);   // (the lobule's colours count from the same reference: since-ref.js)
  return { MARK_GRID, PULL_GRID, REF, blockWant, labelGlide, labelStop, leadEls, paintLeaders, rectOf, renderBlock, termTone };
}
