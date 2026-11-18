// The "What's wrong here?" sheet: shows what the packet found, takes an optional note, and copies the packet on a tap (a copy needs a tap on a phone, so the
// packet is built when the sheet opens and copied by its button). Preview only; opened by trigger.js and the gallery's Tools button.
// Nothing here runs per frame; the sheet fades in and out (util.js fadeShown), and nothing in it scrolls sideways.
import { fadeShown } from '../util.js';
import { packetText, withNote } from './packet.js';

const CSS = `
.pkt { position: fixed; inset: auto 8px 8px 8px; z-index: var(--z-diag, 300); max-height: min(78vh, 640px); display: flex; flex-direction: column; gap: 8px; padding: 12px; border-radius: 14px; border: 1px solid var(--border); background: var(--surface); color: var(--text); box-shadow: var(--shadow-3, 0 12px 40px -12px rgba(0, 0, 0, .45)); font: 500 13px/1.4 var(--font-ui, system-ui, sans-serif); }
@media (min-width: 700px) { .pkt { inset: auto 16px 16px auto; width: 460px; } }
.pkt[hidden] { display: none; }
.pkt h2 { margin: 0; font-size: 15px; font-weight: 650; }
.pkt-status { color: var(--text-2, inherit); overflow-wrap: anywhere; }
.pkt-list { margin: 0; padding: 0 0 0 20px; overflow-y: auto; overflow-x: hidden; max-height: 24vh; display: flex; flex-direction: column; gap: 4px; }
.pkt-list li { overflow-wrap: anywhere; }
.pkt-list b { color: var(--danger); font-weight: 650; }
.pkt textarea { width: 100%; box-sizing: border-box; min-height: 56px; resize: vertical; font: inherit; padding: 8px; border-radius: 9px; border: 1px solid var(--border); background: transparent; color: inherit; overflow-x: hidden; }
.pkt-row { display: flex; flex-wrap: wrap; gap: 8px; }
.pkt button { font: inherit; font-weight: 600; min-height: 38px; padding: 0 14px; border-radius: 10px; border: 1px solid var(--border); background: var(--surface); color: inherit; cursor: pointer; }
.pkt button.go { background: var(--danger); border-color: transparent; color: var(--text-inverse); }
.pkt textarea.pkt-raw { min-height: 110px; font: 500 12px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace; }
.pkt [hidden] { display: none !important; }
#preview-badge { -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; }
`;

function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  return Promise.reject(new Error('no clipboard'));
}

/** Opens the sheet over the page. build(note) makes the packet (sources.js packetNow); returns { close }. One sheet at a time: a second call replaces the first. */
export function openPacketSheet({ build, doc = document, say = () => {} }) {
  doc.getElementById('pkt-css') || (() => { const st = doc.createElement('style'); st.id = 'pkt-css'; st.textContent = CSS; doc.head.append(st); })();
  doc.getElementById('pkt-sheet')?.remove();
  const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const root = el('section', 'pkt'); root.id = 'pkt-sheet'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', "What's wrong here?"); root.hidden = true;
  const status = el('div', 'pkt-status', 'Reading the screen…'); status.setAttribute('role', 'status');
  const list = el('ol', 'pkt-list'); list.hidden = true;
  const note = el('textarea'); note.placeholder = 'What did you see? (optional, a few words)'; note.setAttribute('aria-label', 'What did you see?');
  const raw = el('textarea', 'pkt-raw'); raw.readOnly = true; raw.hidden = true; raw.setAttribute('aria-label', 'The packet, to copy by hand');
  const copy = el('button', 'go', 'Copy packet'); copy.type = 'button'; copy.disabled = true;
  const close = el('button', '', 'Close'); close.type = 'button';
  const row = el('div', 'pkt-row'); row.append(copy, close);
  root.append(el('h2', '', "What's wrong here?"), status, list, note, raw, row);
  doc.body.append(root);
  fadeShown(root, true);
  let packet = null, closed = false;
  const dispose = () => { if (closed) return; closed = true; fadeShown(root, false); setTimeout(() => root.remove(), 400); };
  close.onclick = dispose;
  doc.addEventListener('keydown', function esc(e) { if (closed) { doc.removeEventListener('keydown', esc); return; } if (e.key === 'Escape') { dispose(); doc.removeEventListener('keydown', esc); } });
  const current = () => withNote(packet, note.value);
  copy.onclick = async () => {
    const text = packetText(current());
    try { await copyText(text); status.textContent = `Copied. Paste it into the thread (${text.length.toLocaleString('en-US')} characters).`; say('Packet copied.'); raw.hidden = true; } catch { raw.value = text; raw.hidden = false; raw.focus(); raw.select(); status.textContent = 'The browser would not copy. Select all in the box below and copy it by hand.'; }
  };
  Promise.resolve().then(() => build('')).then((p) => {
    if (closed) return;
    packet = p;
    const n = p.findings.length;
    status.textContent = n ? `${n} finding${n === 1 ? '' : 's'}. ` + (p.missing.length ? `Not in the packet: ${p.missing.join('; ')}.` : '') : `No self-check named a problem. ${p.missing.length ? `Not in the packet: ${p.missing.join('; ')}. ` : ''}Write what you saw, so the agent can add the rule that would have.`;
    list.replaceChildren(...p.findings.map((f) => { const li = el('li'), b = el('b', '', `${f.rule}: `); li.append(b, `${f.what}${f.where ? `, ${f.where}` : ''}`); return li; }));
    list.hidden = !n;
    copy.disabled = false;
  }, (e) => { status.textContent = `The packet could not be made: ${e?.message || e}`; });
  return { close: dispose, root };
}
