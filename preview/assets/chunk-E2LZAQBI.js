var p=`
.gb { font: 13px/1.45 system-ui, -apple-system, sans-serif; color: var(--text); padding: 12px 14px 20px; max-width: 980px; }
.gb h3 { font-size: 15px; margin: 0 0 4px; } .gb p { margin: 0 0 8px; color: var(--text-2, var(--text)); }
.gb .gb-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 6px 0; }
.gb button { font: inherit; padding: 6px 10px; min-height: 32px; border-radius: 8px; border: 1px solid var(--border-strong, var(--border)); background: var(--surface); color: var(--text); cursor: pointer; }
.gb button[aria-pressed="true"], .gb button.on { background: var(--surface-3, var(--surface-2)); border-color: var(--text); font-weight: 600; }
.gb button:disabled { opacity: .45; cursor: default; }
.gb table { border-collapse: collapse; font-variant-numeric: tabular-nums; margin: 6px 0; }
.gb th, .gb td { text-align: left; padding: 3px 8px; border-bottom: 1px solid var(--hairline, var(--border)); vertical-align: top; }
.gb th { font-weight: 600; position: sticky; top: 0; background: var(--surface); }
.gb .gb-note { font-size: 12px; color: var(--text-2, var(--text)); }
.gb .gb-ok { color: var(--ok); } .gb .gb-warn { color: var(--caution); } .gb .gb-bad { color: var(--danger); }
.gb .gb-status { min-height: 1.4em; font-size: 12px; }
.gb textarea, .gb pre { width: 100%; box-sizing: border-box; font: 12px/1.4 ui-monospace, Menlo, monospace; background: var(--surface-2, var(--surface)); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 8px; }
.gb pre { white-space: pre-wrap; max-height: 40vh; overflow: auto; }
.gb input[type="search"], .gb input[type="text"], .gb select { font: inherit; padding: 5px 8px; min-height: 32px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface); color: var(--text); }
.gb .gb-grid { display: grid; gap: 4px; }
.gb .gb-sw { display: inline-block; width: 22px; height: 22px; border-radius: 5px; border: 1px solid var(--border); vertical-align: middle; }
`;function s(t=globalThis.document){if(!t||t.getElementById("gb-styles"))return;let e=t.createElement("style");e.id="gb-styles",e.textContent=p,t.head.append(e)}function a(t,e,...o){let n=document.createElement(t);for(let[r,i]of Object.entries(e||{}))i==null||i===!1||(r.startsWith("on")&&typeof i=="function"?n.addEventListener(r.slice(2),i):r==="class"?n.className=i:r==="text"?n.textContent=i:i===!0?n.setAttribute(r,""):n.setAttribute(r,String(i)));for(let r of o.flat(1/0))r!=null&&r!==!1&&n.append(r.nodeType?r:document.createTextNode(String(r)));return n}function b(t,e){return a("table",null,a("thead",null,a("tr",null,t.map(o=>a("th",null,o)))),a("tbody",null,e.map(o=>a("tr",null,o.map(n=>a("td",null,n))))))}function c(){let t=a("div",{class:"gb-status",role:"status","aria-live":"polite"});return t.set=(e,o="")=>{t.className=`gb-status${o?` gb-${o}`:""}`,t.textContent=e},t}async function l(t,e){try{return typeof e?.copy=="function"?!!await e.copy(t):(await navigator.clipboard.writeText(t),!0)}catch{return!1}}function u(t,e,o,n){return a("button",{type:"button",onclick:async()=>{let r=await l(e(),n);o?.(r?"Copied.":"The page would not let me copy; select the text and copy it.",r?"ok":"warn")}},t)}var d=t=>t?.pps||globalThis.pps||globalThis.window?.pps||null;function g(t,e,o){return s(t.ownerDocument),t.classList.add("gb"),t.append(a("h3",null,e),o?a("p",null,o):null),t}export{a,b,c,u as d,d as e,g as f};
