// The Check button on the gallery page (plan 2.7). One tap runs the shared fit rules (fit-rules.js, the same judges scripts/card-fit.mjs uses) on the
// cards on this device's screen, outlines each problem in red and lists them with a Copy button. Layout reads go through layout-snap.js and happen only
// in the tap's own task, never in a frame. Imported by the gallery page (plugins.js), never by the live app.
import { registerPanel } from './registry.js';
import { runCheck, drawOutlines, clearOutlines, numberedReport } from './fit-check.js';
import { KIND_WORDS } from './fit-rules.js';
import { readBox, readRects, readStyle, readMetric, readCTM, readAnims } from '../layout-snap.js';
import { fadeShown } from '../util.js';

const IO = { box: readBox, rects: readRects, style: readStyle, metric: readMetric, ctm: readCTM, anims: readAnims };

const css = `
.fitc { display: flex; flex-direction: column; gap: 8px; font: 500 13px/1.35 var(--font-ui, system-ui, sans-serif); color: var(--text, inherit); }
.fitc-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.fitc button { font: inherit; font-weight: 600; min-height: 36px; padding: 0 14px; border-radius: 10px; border: 1px solid var(--border); background: var(--surface); color: inherit; cursor: pointer; }
.fitc button.go { background: var(--danger); border-color: transparent; color: var(--text-inverse); }
.fitc [hidden] { display: none !important; }
.fitc-status { color: var(--text-2, inherit); }
.fitc-list { margin: 0; padding: 0 0 0 22px; max-height: 38vh; overflow-y: auto; overflow-x: hidden; display: flex; flex-direction: column; gap: 6px; }
.fitc-list li { overflow-wrap: anywhere; }
.fitc-list b { color: var(--danger); font-weight: 650; }
`;

function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  return new Promise((ok, no) => {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.cssText = 'position:fixed;left:-9999px;top:0'; document.body.append(ta); ta.select();
    try { document.execCommand('copy') ? ok() : no(new Error('copy refused')); } catch (e) { no(e); } finally { ta.remove(); }
  });
}

function mount(host, ctx) {
  if (!document.getElementById('fitc-css')) { const st = document.createElement('style'); st.id = 'fitc-css'; st.textContent = css; document.head.append(st); }
  const box = document.createElement('div'), bar = document.createElement('div'), list = document.createElement('ol'), status = document.createElement('span');
  box.className = 'fitc'; bar.className = 'fitc-bar'; list.className = 'fitc-list'; status.className = 'fitc-status'; list.setAttribute('hidden', '');
  status.setAttribute('role', 'status');
  const go = document.createElement('button'), copy = document.createElement('button'), clear = document.createElement('button');
  go.className = 'go'; go.type = 'button'; go.textContent = 'Check';
  copy.type = 'button'; copy.textContent = 'Copy list'; copy.setAttribute('hidden', '');
  clear.type = 'button'; clear.textContent = 'Clear'; clear.setAttribute('hidden', '');
  bar.append(go, copy, clear, status);
  box.append(bar, list);
  host.append(box);
  let last = null;
  // (Nothing pops in or out: the list and the buttons fade.)
  const show = (listOn, copyOn, clearOn) => { fadeShown(list, listOn); fadeShown(copy, copyOn); fadeShown(clear, clearOn); };
  const reset = () => { clearOutlines(); show(false, false, false); status.textContent = ''; last = null; };
  go.onclick = () => {
    const r = runCheck({ io: IO, pps: ctx.pps });
    const where = { title: ctx.specimen?.()?.title, look: ctx.look?.(), size: `${readMetric(window, 'innerWidth')} x ${readMetric(window, 'innerHeight')}`, when: new Date().toLocaleTimeString() };
    clearOutlines();
    const n = drawOutlines(r.problems, { box: readBox });
    list.replaceChildren(...r.problems.map((p) => { const li = document.createElement('li'), k = document.createElement('b'); k.textContent = `${p.kind}: `; li.append(k, p.text); li.title = KIND_WORDS[p.kind] || ''; return li; }));
    last = { text: numberedReport(r.problems, where) + (r.busy ? '\n(Taken while the cards were still moving: check again once they rest.)' : '') };
    show(r.problems.length > 0, true, r.problems.length > 0);
    const looked = r.slide || r.structure ? '' : ' No card is on the screen to check.';
    status.textContent = (r.problems.length ? `${r.problems.length} problem${r.problems.length === 1 ? '' : 's'}, ${n} outlined in red.` : 'Every card fits.') + looked + (r.busy ? ' Cards still moving: check again once they rest.' : '');
  };
  copy.onclick = async () => { try { await copyText(last.text); ctx.toast?.('Check list copied.'); } catch { ctx.toast?.('Copy failed: select the list and copy it.'); } };
  clear.onclick = reset;
  return () => { clearOutlines(); };
}

registerPanel({ id: 'check', title: 'Check', order: 30, mount });
