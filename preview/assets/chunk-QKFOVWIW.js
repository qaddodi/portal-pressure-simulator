import{a as B}from"./chunk-WCPWAWCL.js";import{a as N}from"./chunk-CRXNUPBI.js";import"./chunk-QV6U4PNV.js";var D=`
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
`,M=s=>{let r=Math.max(0,Math.floor(s/1e3)),a=Math.floor(r/60);return a>=60?`${Math.floor(a/60)}:${String(a%60).padStart(2,"0")}:${String(r%60).padStart(2,"0")}`:`${a}:${String(r%60).padStart(2,"0")}`},t=(s,r,a)=>{let l=document.createElement(s);return r&&(l.className=r),a!=null&&(l.textContent=a),l};function K(){document.getElementById("boot")?.remove(),document.documentElement.removeAttribute("data-boot"),document.title="Presenter view";let s=t("style","",D),r=t("div","pv"),a=typeof BroadcastChannel=="function"?new BroadcastChannel(B):null;document.head.append(s),document.body.replaceChildren(r);let l=t("output"),h=t("output"),d=t("b"),x=t("span"),p=t("div","pv-main"),f=t("small"),u=t("button","","\u2190 Back"),v=t("button","go","Next \u2192"),w=t("div","pv-top",null),y=t("div","pv-clock"),C=t("span","","Talk"),S=t("span","","Slide");C.append(l),S.append(h),y.append(C,S),w.append(x,d,y);let z=t("div","pv-bar");z.append(u,v,f),r.append(w,p,z);let o=null,m=(e,n)=>{try{a?.postMessage({t:"cmd",c:e,i:n})}catch{}},g=()=>{let e=Date.now();l.textContent=o?M(e-o.talk0):"0:00",h.textContent=o?M(e-o.slide0):"0:00"};function b(){if(N(!!o),p.replaceChildren(),u.disabled=v.disabled=!o,!o){p.append(t("p","pv-wait","Waiting for a talk. Start a presentation in the main window.")),x.textContent="",d.textContent="",f.textContent="",g();return}let{cur:e,next:n,deck:i,i:c,beat:A,beats:$}=o;x.textContent=i.title,d.textContent=`Slide ${c+1} of ${i.n}`,f.textContent=$>1?`View ${A+1} of ${$}`:"",e.kicker&&p.append(t("p","pv-kick",e.kicker)),p.append(t("h1","pv-title",e.title)),e.line&&p.append(t("p","pv-line",e.line));let E=t("p","pv-next");if(E.append("Next: ",...n?[t("b","",n.title)]:["the end"]),p.append(E),e.notes&&p.append(t("p","pv-cap","Notes"),t("p","pv-notes",e.notes)),e.ask){let k=t("div","pv-ask");k.append(t("p","q",e.ask[0])),e.ask[1]&&k.append(t("p","a",e.ask[1])),p.append(t("p","pv-cap","Discussion question"),k)}g()}a&&(a.onmessage=e=>{let n=e.data;n?.t==="state"?(o=n,b()):n?.t==="end"&&(o=null,b())}),u.onclick=()=>m("prev"),v.onclick=()=>m("next"),addEventListener("keydown",e=>{if(e.ctrlKey||e.metaKey||e.altKey)return;let n=e.key,i=null,c;n==="ArrowRight"||n==="PageDown"||n===" "||n==="Enter"?i="next":n==="ArrowLeft"||n==="PageUp"||n==="Backspace"?i="prev":n==="Home"?(i="go",c=0):n==="End"&&o&&(i="go",c=o.deck.n-1),i&&(e.target?.tagName==="BUTTON"&&(n===" "||n==="Enter")||(e.preventDefault(),e.repeat||m(i,c)))}),setInterval(g,1e3),b();try{a?.postMessage({t:"hello"})}catch{}}export{K as run};
