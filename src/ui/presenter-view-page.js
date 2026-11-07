// Presenter view, the window (N1): ?presenter-view on the app's own page. Text only (no figure, no GL context): the current slide's title
// and line, the next slide's title, the notes and the question for the room, a talk clock and a slide clock, Next and Back.
// It follows the talk over a BroadcastChannel (presenter-view.js) and sends keys and buttons back; closing either window leaves the other working.

import { CHANNEL } from './presenter-view.js';

const CSS = `
html, body { margin: 0; height: 100%; background: var(--bg); color: var(--text); font: 15px/1.5 Inter, system-ui, -apple-system, 'Segoe UI', sans-serif; }
.pv { display: grid; grid-template-rows: auto 1fr auto; height: 100%; max-width: 1100px; margin: 0 auto; padding: 16px 20px; box-sizing: border-box; gap: 14px; }
.pv-top { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 24px; color: var(--text-2); font-size: 13px; }
.pv-top b { color: var(--text); font-weight: 600; }
.pv-clock { margin-left: auto; display: flex; gap: 20px; font-variant-numeric: tabular-nums; }
.pv-clock span { display: flex; flex-direction: column; align-items: flex-end; font-size: 11px; letter-spacing: .06em; text-transform: uppercase; }
.pv-clock output { font-size: 26px; font-weight: 600; letter-spacing: 0; text-transform: none; color: var(--text); }
.pv-main { overflow: auto; display: flex; flex-direction: column; gap: 12px; min-height: 0; }
.pv-kick { margin: 0; font-size: 12px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--text-2); }
.pv-title { margin: 0; font: 600 34px/1.12 'Source Serif 4', Georgia, serif; }
.pv-line { margin: 0; font-size: 20px; line-height: 1.4; }
.pv-next { margin: 0; padding: 10px 14px; border: 1px solid var(--rule); border-radius: 8px; color: var(--text-2); }
.pv-next b { color: var(--text); font-weight: 600; }
.pv-notes { margin: 0; font-size: 17px; line-height: 1.5; white-space: pre-wrap; }
.pv-cap { margin: 6px 0 0; font-size: 11px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--text-2); }
.pv-ask { margin: 0; padding: 10px 14px; border: 1px solid var(--rule); border-radius: 8px; }
.pv-ask p { margin: 0; } .pv-ask .a { margin-top: 4px; color: var(--text-2); }
.pv-bar { display: flex; gap: 10px; align-items: center; }
.pv-bar button { font: inherit; padding: 10px 22px; border-radius: 8px; border: 1px solid var(--rule); background: transparent; color: inherit; cursor: pointer; }
.pv-bar button.go { background: var(--accent); border-color: transparent; color: #fff; } /* colour-exempt: white on the accent button */
.pv-bar button:disabled { opacity: .4; cursor: default; }
.pv-bar small { margin-left: auto; color: var(--text-2); }
.pv-wait { margin: auto; color: var(--text-2); font-size: 18px; text-align: center; }
`;

const mmss = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000)), m = Math.floor(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${m}:${String(s % 60).padStart(2, '0')}`;
};
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

export function run() {
  document.getElementById('boot')?.remove();
  document.documentElement.removeAttribute('data-boot');
  document.title = 'Presenter view';
  const style = el('style', '', CSS), root = el('div', 'pv'), ch = typeof BroadcastChannel === 'function' ? new BroadcastChannel(CHANNEL) : null;
  document.head.append(style); document.body.replaceChildren(root);
  const talk = el('output'), slide = el('output'), where = el('b'), deckT = el('span'), main = el('div', 'pv-main'), count = el('small');
  const back = el('button', '', '← Back'), nextB = el('button', 'go', 'Next →');
  const top = el('div', 'pv-top', null), clock = el('div', 'pv-clock');
  const ct = el('span', '', 'Talk'), cs = el('span', '', 'Slide'); ct.append(talk); cs.append(slide); clock.append(ct, cs);
  top.append(deckT, where, clock);
  const bar = el('div', 'pv-bar'); bar.append(back, nextB, count);
  root.append(top, main, bar);
  let st = null;
  const send = (c, i) => { try { ch?.postMessage({ t: 'cmd', c, i }); } catch { /* channel closed */ } };
  const tick = () => { const now = Date.now(); talk.textContent = st ? mmss(now - st.talk0) : '0:00'; slide.textContent = st ? mmss(now - st.slide0) : '0:00'; };
  function paint() {
    main.replaceChildren();
    back.disabled = nextB.disabled = !st;
    if (!st) { main.append(el('p', 'pv-wait', 'Waiting for a talk. Start a presentation in the main window.')); deckT.textContent = ''; where.textContent = ''; count.textContent = ''; tick(); return; }
    const { cur, next, deck, i, beat, beats } = st;
    deckT.textContent = deck.title; where.textContent = `Slide ${i + 1} of ${deck.n}`;
    count.textContent = beats > 1 ? `View ${beat + 1} of ${beats}` : '';
    if (cur.kicker) main.append(el('p', 'pv-kick', cur.kicker));
    main.append(el('h1', 'pv-title', cur.title));
    if (cur.line) main.append(el('p', 'pv-line', cur.line));
    const nx = el('p', 'pv-next'); nx.append('Next: ', ...(next ? [el('b', '', next.title)] : ['the end']));
    main.append(nx);
    if (cur.notes) { main.append(el('p', 'pv-cap', 'Notes'), el('p', 'pv-notes', cur.notes)); }
    if (cur.ask) { const a = el('div', 'pv-ask'); a.append(el('p', 'q', cur.ask[0])); if (cur.ask[1]) a.append(el('p', 'a', cur.ask[1])); main.append(el('p', 'pv-cap', 'Ask the room'), a); }
    tick();
  }
  if (ch) ch.onmessage = (e) => { const m = e.data; if (m?.t === 'state') { st = m; paint(); } else if (m?.t === 'end') { st = null; paint(); } };
  back.onclick = () => send('prev'); nextB.onclick = () => send('next');
  addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key; let c = null, i;
    if (k === 'ArrowRight' || k === 'PageDown' || k === ' ' || k === 'Enter') c = 'next';
    else if (k === 'ArrowLeft' || k === 'PageUp' || k === 'Backspace') c = 'prev';
    else if (k === 'Home') { c = 'go'; i = 0; } else if (k === 'End' && st) { c = 'go'; i = st.deck.n - 1; }
    if (!c) return;
    if (e.target?.tagName === 'BUTTON' && (k === ' ' || k === 'Enter')) return;   // (a focused button keeps its own press)
    e.preventDefault(); if (!e.repeat) send(c, i);
  });
  setInterval(tick, 1000);
  paint();
  try { ch?.postMessage({ t: 'hello' }); } catch { /* channel closed */ }
}
