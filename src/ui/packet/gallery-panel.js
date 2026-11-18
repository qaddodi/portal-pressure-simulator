// The "What's wrong here?" button on the gallery page's Tools (plan screen-report-recs section 3): the same bug packet as the key chord and the long press on the
// preview pill (trigger.js). Imported by the gallery page (plugins.js), never by the live app.
import { registerPanel } from '../gallery/registry.js';

function mount(host, ctx) {
  const box = document.createElement('div'), go = document.createElement('button'), why = document.createElement('p');
  box.style.cssText = 'display:flex;flex-direction:column;gap:6px';
  go.type = 'button'; go.textContent = "What's wrong here?";
  why.textContent = 'Bundles what is on screen, the findings of every self-check, the last 10 s of motion (with ?watch) and a link that rebuilds this state. Copy it into the thread.';
  why.style.cssText = 'margin:0;color:var(--gl-ink2,inherit)';
  go.onclick = () => { const pk = ctx.pps?.packet; if (pk) pk.open(); else ctx.toast?.('The packet is not loaded on this page (preview copy only).'); };
  box.append(go, why); host.append(box);
}

registerPanel({ id: 'bug-packet', title: "What's wrong here?", order: 20, mount });
