// Functions the gate (scripts/gate.mjs) runs inside the page. Each is self-contained (Playwright serializes it), returns plain data, and
// reads the page only through the DOM and window.pps, as the other browser checks do.

/** The state a presenter slide must be in once its change has finished: [issue text], empty when the slide has landed whole.
 *  `want` is the 1-based slide number it should be on and `title` its title (HTML allowed). */
export function slideFinal({ want, title, wantData, wantText }) {
  const out = [];
  const pres = window.pps?.presenter;
  if (!pres) return ['no presenter on the page'];
  const n = Number(document.querySelector('.pzb-n')?.textContent.split('/')[0]);
  if (n !== want) out.push(`the slide counter says ${n}, not ${want}`);
  if (pres.busy()) out.push('the presenter is still changing slide (never reached the end of the change)');
  const root = document.querySelector('.pz');
  if (!root) return [...out, 'no presenter root on the page'];
  if (root.classList.contains('pz-prep')) out.push('the slide is still being built unseen (pz-prep)');
  if ('bare' in root.dataset) out.push('the slide has no cards (bare)');
  if (document.querySelector('.pz-load.on')) out.push('the loading cover is still up');
  const shown = (e) => !!e && !e.hidden && !('gone' in e.dataset) && getComputedStyle(e).display !== 'none';
  const moving = (e) => e.getAnimations({ subtree: true }).filter((a) => a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming().endTime) && a.effect.getComputedTiming().endTime > 2);
  const cards = [['words', '.pz-text'], ['data', '.pz-data'], ['panel', '.pz-panel'], ['case', '.pz-case.on']];
  for (const [name, sel] of cards) {
    const e = document.querySelector(sel);
    if (!shown(e) || !e.childElementCount) continue;
    const cs = getComputedStyle(e), op = +cs.opacity;
    if (e.classList.contains('pz-leave')) out.push(`the ${name} card is still leaving (pz-leave)`);
    if (e.classList.contains('pz-hide')) continue;   // (set aside by design: the data card tucked under the words)
    if (op > 0.02 && op < 0.98) out.push(`the ${name} card is frozen part way through a fade (opacity ${op.toFixed(2)})`);
    if (op >= 0.98) {
      const r = e.getBoundingClientRect();
      if (r.right < 4 || r.bottom < 4 || r.left > innerWidth - 4 || r.top > innerHeight - 4) out.push(`the ${name} card is off screen at ${Math.round(r.left)},${Math.round(r.top)}`);
      if (r.width < 40 || r.height < 20) out.push(`the ${name} card is ${Math.round(r.width)}x${Math.round(r.height)}`);
      if (!e.innerText.trim() && !e.querySelector('canvas, svg, img, table')) out.push(`the ${name} card is empty`);
    }
    if (moving(e).length) out.push(`the ${name} card still has an animation running`);
  }
  if (!cards.some(([, sel]) => { const e = document.querySelector(sel); return shown(e) && e.childElementCount && +getComputedStyle(e).opacity >= 0.98; })) out.push('no card is shown');
  const words = document.querySelector('.pz-text');
  if (wantText && !(shown(words) && words.childElementCount && +getComputedStyle(words).opacity >= 0.98)) out.push('the words card is not shown');
  if (wantText && title && shown(words)) {
    // (compared without spaces or line breaks: the title is set in pieces, and a hyphen or dash can end a line)
    const flat = (x) => x.replace(/<[^>]*>/g, '').replace(/[\s\u00AD\u200B-\u200D\u2060]+/g, '').toLowerCase();
    const t = flat(title).slice(0, 12);
    if (t && !flat(words.textContent).includes(t)) out.push(`the words card does not carry the slide's title ("${title.replace(/<[^>]*>/g, '').slice(0, 24)}")`);
  }
  const data = document.querySelector('.pz-data');
  if (wantData && !(shown(data) && data.childElementCount && (+getComputedStyle(data).opacity >= 0.98 || data.classList.contains('pz-hide')))) out.push('the data card is missing');
  // the figure's camera and the glass hosts
  const st = window.pps.stage;
  if (st.gliding?.()) out.push('the figure camera is still gliding');
  if (st.drifting?.()) out.push('the figure camera is still drifting');
  for (const e of document.querySelectorAll('[data-gl-wait]')) {
    const r = e.getBoundingClientRect();
    if (r.width > 40 && r.height > 20 && +getComputedStyle(e).opacity > 0.5 && !e.hasAttribute('data-gl') && document.documentElement.dataset.glass !== 'off') { out.push(`a card at ${Math.round(r.left)},${Math.round(r.top)} is still waiting for its glass (data-gl-wait)`); break; }
  }
  // labels: none left part way (an inline opacity between faded out and in, with nothing animating it)
  for (const g of document.querySelectorAll('#labels .lb:not(.lb-off):not(.unlit)')) {   // (an .unlit station rests at 35 % on a slide that lights terms: V-LIT-3, 14.3 B)
    const op = +getComputedStyle(g).opacity;
    if (op > 0.02 && op < 0.95 && !g.getAnimations().length) { out.push(`label "${g.textContent.trim().slice(0, 20)}" is stuck at opacity ${op.toFixed(2)}`); break; }
  }
  for (const g of document.querySelectorAll('#labels .lb.unlit:not(.lb-off)')) {
    const op = +getComputedStyle(g).opacity;
    if (!g.getAnimations().length && Math.abs(op - 0.35) > 0.03) { out.push(`unlit label "${g.textContent.trim().slice(0, 20)}" rests at opacity ${op.toFixed(2)}, not 0.35`); break; }
  }
  return out;
}

/** What the figure's labels are doing, for the pan and zoom check: one entry per label drawn, with its box on screen. */
export function labelBoxes() {
  const out = [];
  for (const g of document.querySelectorAll('#labels .lb:not(.lb-off):not(.unlit)')) {   // (an .unlit station rests at 35 % on a slide that lights terms: V-LIT-3, 14.3 B)
    
    const cs = getComputedStyle(g);
    if (+cs.opacity < 0.5 || cs.display === 'none' || cs.visibility === 'hidden') continue;
    const t = g.querySelector('text') || g;
    const r = t.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    out.push({ id: g.dataset.id || g.id || g.textContent.trim().slice(0, 24), text: g.textContent.trim().slice(0, 24), x: +(r.left + r.width / 2).toFixed(1), y: +(r.top + r.height / 2).toFixed(1) });
  }
  return out;
}

/** The diaphragm: its outline is a real path and, when the organs are GPU layers, painted live (then the SVG path is hidden by design); otherwise the SVG path shows. [issue text]. */
export function diaphragmIssues() {
  const out = [];
  const o = window.pps.stage.organPaths(), gpu = o.mode === 'GPU layers';
  const p = document.querySelector('path.org-diaphragm');
  if (!p) return ['no diaphragm path in the figure'];
  const d = p.getAttribute('d') || '';
  if (d.length < 100) out.push(`the diaphragm outline is ${d.length} characters long`);
  const cs = getComputedStyle(p);
  // (painted live on the GPU, the SVG path is kept hidden by design: it only feeds the painting; the GPU checks below judge that)
  if (!gpu && (+cs.opacity < 0.05 || cs.display === 'none' || cs.visibility === 'hidden')) out.push(`the diaphragm is hidden (opacity ${cs.opacity}, display ${cs.display}, visibility ${cs.visibility})`);
  try { const b = p.getBBox(); if (b.width < 200 || b.height < 20) out.push(`the diaphragm is ${Math.round(b.width)}x${Math.round(b.height)} in the figure`); } catch { /* not rendered: the opacity check above says so */ }
  {
    if (/^SVG \(no GPU figure\)/.test(o.mode)) out.push(`the organs fell back to the SVG drawing (${o.mode})`);
    else if (o.mode === 'GPU layers' && !/diaphragm/.test(o.live)) out.push(`the diaphragm is not painted live (${o.live})`);
    else if (o.mode === 'GPU layers' && !(o.gpu?.meshes > 0)) out.push('the organ layer has no meshes');
  }
  return out;
}

/** Every label the figure shows, wherever it is drawn: the GPU labels' boxes (labelDrawn, from their canvas's corner) and the DOM ones.
 *  { pts: [[x, y]] centres on screen, anchors: [[x, y]] of the labels the solver has placed }. */
export function labelState() {
  const st = window.pps.stage, pts = [];
  const cv = document.querySelector('#labels canvas, canvas.labels-gl, canvas[data-labels]');
  const o = cv ? cv.getBoundingClientRect() : { left: 0, top: 0 };
  for (const b of st.labelDrawn?.() || []) pts.push([(b[0] + b[2]) / 2 + o.left, (b[1] + b[3]) / 2 + o.top]);
  for (const g of document.querySelectorAll('#labels .lb:not(.lb-off):not(.unlit)')) {   // (an .unlit station rests at 35 % on a slide that lights terms: V-LIT-3, 14.3 B)
    
    const cs = getComputedStyle(g);
    if (+cs.opacity < 0.5 || cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = (g.querySelector('text') || g).getBoundingClientRect();
    if (r.width > 2 && r.height > 2) pts.push([r.left + r.width / 2, r.top + r.height / 2]);
  }
  const anchors = [];
  for (const k of Object.keys(st.labelSlots?.() || {})) { try { const a = st.labelAnchorOf(k); if (a && a.x > 0 && a.y > 0 && a.x < innerWidth && a.y < innerHeight) anchors.push([a.x, a.y]); } catch { /* (a label without an anchor) */ } }
  return { pts, anchors };
}

/** Each station label the figure shows, with the station it names: [{ k, lx, ly, ax, ay }] on screen (the label box's centre, the station's
 *  anchor). Boxes come from stage.labelPlaced() (px from the stage's corner, an 8 px grid), anchors from stage.labelAnchorOf (screen px). */
export function labelFollow() {
  const st = window.pps.stage, pl = st.labelPlaced?.() || {}, r = document.querySelector('.stage-view').getBoundingClientRect(), rows = [];
  for (const k of Object.keys(pl)) {
    if (!k.startsWith('n:')) continue;
    let a = null;
    try { a = st.labelAnchorOf(k.slice(2)); } catch { /* (no anchor for this one) */ }
    if (!a || !(a.x === a.x) || !(a.y === a.y)) continue;
    const b = pl[k];
    rows.push({ k, lx: r.left + (b[0] + b[2]) / 2, ly: r.top + (b[1] + b[3]) / 2, ax: a.x, ay: a.y });
  }
  return rows;
}
