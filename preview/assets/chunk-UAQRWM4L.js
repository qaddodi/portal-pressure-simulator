import{a as f,c as k}from"./chunk-FCSRT52Q.js";import{b as y}from"./chunk-UEVTYSRA.js";import{c as $,d as w}from"./chunk-XBJW4BW7.js";import{c as b}from"./chunk-BHPF2AWZ.js";import{f as m,q as v}from"./chunk-KDYFIQ7Z.js";import{a as x}from"./chunk-RJOTJ3RL.js";function L(e,n,t="text/plain"){let r=document.createElement("a");r.href=URL.createObjectURL(new Blob([n],{type:t})),r.download=e,document.body.append(r),r.click(),r.remove(),setTimeout(()=>URL.revokeObjectURL(r.href),1e3)}var g=e=>typeof e=="string"?e.trim():"";var E=e=>typeof e?.focusRow=="string"&&e.focusRow?e.focusRow:null;function H(e){if(e?.data!=="ladder")return e;let{data:n,brackets:t,block:r,ladderFrom:p,ladderFromLabel:i,...o}=e,a=p===!0||typeof p=="string"&&p?p:null,s=typeof i=="string"&&i.trim()?i.trim():null,u=o.tool||{kind:"profile",...a?{from:a}:{},...a&&s?{fromLabel:s}:{}};return{...o,tool:u,...o.tiles?.length?{data:"tiles"}:{}}}var q=/(?:\b(?:e\.g|i\.e|vs|approx|ca|Dr|Fig|Figs|No|et al|cf)|\b[A-Z])\.$/;function h(e){let n=String(e||"");if(!n.trim())return[];if(n.includes("|"))return n.split("|").map(o=>o.trim()).filter(Boolean).map((o,a,s)=>a<s.length-1?`${o} `:o);let t=[],r=0,p=0;for(let o=0;o<n.length;o++){let a=n[o];if(a==="{"||a==="["||a==="(")p++;else if(a==="}"||a==="]"||a===")")p=Math.max(0,p-1);else if(p===0&&(a===","||a===";"||a==="."||a===":")&&/\s/.test(n[o+1]||"")&&!q.test(n.slice(Math.max(0,o-8),o+1))){let s=o+1;for(;/\s/.test(n[s]||"");)s++;s<n.length&&(t.push(n.slice(r,s)),r=s,o=s-1)}}t.push(n.slice(r));let i=[];for(let o of t)i.length&&i.at(-1).trim().length<14?i[i.length-1]+=o:i.push(o);if(i.length>1&&i.at(-1).trim().length<14){let o=i.pop();i[i.length-1]+=o}return i}var j=e=>h(e).join("")||String(e||"");function A(e){if(!e?.reveal||e.visual||e.beats||e.lapse||e.cath||e.procedure||e.scales||!e.line)return 0;let n=h(e.line).length;return n>1?n:0}function F(e,n){return!A(e)||n==null?e?.line||"":h(e.line).slice(0,Math.max(1,n)).join("").trim()}var l=e=>String(e??"").replace(/[&<>"]/g,n=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[n]),z=e=>e.replace(/[^\w-]+/g,"-").replace(/^-|-$/g,"").toLowerCase(),d=e=>typeof document>"u"?"":getComputedStyle(document.documentElement).getPropertyValue(e).trim(),O=()=>`
:root { color-scheme: light; --ink: ${d("--print-ink")}; --ink-2: ${d("--print-ink-2")}; --ink-3: ${d("--print-ink-3")}; --rule: ${d("--print-rule")}; --paper: ${d("--print-paper")}; }
* { box-sizing: border-box; }
body { margin: 0; padding: 32px 16px 48px; background: var(--paper); color: var(--ink); font: 14px/1.5 Inter, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-text-size-adjust: 100%; }
main { max-width: 1040px; margin: 0 auto; }
.serif, h1, h2 { font-family: 'Source Serif 4', 'Iowan Old Style', Georgia, serif; }
.cap { margin: 0 0 4px; font-size: 11px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--ink-3); }
header { padding-bottom: 16px; border-bottom: 2px solid var(--ink); }
.top { display: flex; flex-wrap: wrap; align-items: start; justify-content: space-between; gap: 12px 24px; }
h1 { margin: 0; font-size: 30px; font-weight: 600; line-height: 1.12; letter-spacing: -.01em; }
.meta { margin: 6px 0 0; color: var(--ink-3); font-size: 13px; }
.sum { margin: 12px 0 0; color: var(--ink-2); max-width: 75ch; }
.plan { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px 40px; margin-top: 18px; }
.plan :is(ol, ul) { margin: 0; padding-left: 1.3em; }
.plan li { padding: 1px 0; }
button { font: 600 13px/1 Inter, system-ui, sans-serif; padding: 9px 16px; border-radius: 999px; border: 1px solid var(--ink); background: var(--ink); color: var(--paper); cursor: pointer; }
article { display: flex; gap: 24px; padding: 22px 0; border-bottom: 1px solid var(--rule); break-inside: avoid; page-break-inside: avoid; }
figure { flex: 0 0 44%; margin: 0; }
figure img { display: block; width: 100%; height: auto; border: 1px solid var(--rule); border-radius: 6px; }
article.wide { flex-direction: column; gap: 14px; }
article.wide figure { flex: none; }
@media (min-width: 681px) { article.land figure { flex-basis: 55%; } }
.txt { flex: 1 1 0; min-width: 0; }
.n { font-variant-numeric: tabular-nums; }
h2 { margin: 0; font-size: 19px; font-weight: 600; line-height: 1.25; }
.line { margin: 6px 0 0; color: var(--ink-2); }
.eq { margin: 10px 0 0; }
.eq math { font-family: 'STIX Two Math', 'Cambria Math', 'Latin Modern Math', math; font-size: 18px; }
.eq small { display: block; margin-top: 2px; color: var(--ink-3); font-size: 12px; }
.cite { margin: 6px 0 0; color: var(--ink-3); font-size: 12px; }
.notes { margin-top: 12px; }
.notes p { margin: 0; }
.ask { margin-top: 12px; padding: 8px 12px; border: 1px solid var(--rule); border-radius: 6px; }
.ask p { margin: 0; }
.ask .a { margin-top: 4px; color: var(--ink-2); }
.checks { margin: 12px 0 0; padding-left: 1.4em; }
.checks li { margin-top: 6px; }
.checks p { margin: 0; }
.checks .a { margin-top: 2px; color: var(--ink-2); }
.ask .a b { color: var(--ink); }
.q { margin: 0 0 6px; }
.q p { margin: 0; }
@media screen and (pointer: coarse) { .cap { font-size: 12px; } button { min-height: 44px; } }
@media (max-width: 680px) {
  body { padding-top: 20px; }
  article { flex-direction: column; gap: 12px; }
  figure { flex: none; }
}
@media print {
  @page { size: A4; margin: 14mm 12mm; }
  body { padding: 0; font-size: 9.5pt; }
  main { max-width: none; }
  button { display: none; }
  h1 { font-size: 22pt; }
  h2 { font-size: 13pt; }
  article { padding: 12px 0; gap: 16px; }
  figure { flex-basis: 36%; }
  figure img { max-height: 72mm; object-fit: contain; object-position: left top; border: 0; }
  article.wide figure img { max-height: 95mm; }
  article.land figure { flex-basis: 55%; }
  .eq math { font-size: 13pt; }
}`,R=new Set(["outline","check"]),T=(e,n,t)=>e&&!n.mine&&t.id&&!R.has(t.visual)?`<figure><img src="${l(e)}${l(n.id)}/${l(t.id)}.webp" alt="" onload="if (this.naturalWidth > 1.2 * this.naturalHeight) this.closest('article').classList.add('land')" onerror="this.parentNode.remove()"></figure>`:"";function I(e,n=null,t=()=>null){let r=(p,i,o=!1)=>{let a=m[p],s=i?.[p];return s==null||!Number.isFinite(s)?"\u2014":p==="plt"?b(s):`${x(s*(a.x||1),o?0:a.d??1)}${a.u==="%"?"%":a.u?` ${a.u}`:""}`};return String(e??"").replace(/\[([^\]]+)\]\([\w:]+\)/g,"$1").replace(/\{([^}]+)\}/g,(p,i)=>{if(/^#\d+$/.test(i))return`(${i.slice(1)})`;if(m[i])return r(i,n);if(/^\w+:0$/.test(i)&&m[i.slice(0,-2)])return r(i.slice(0,-2),n,!0);let o=i.match(/^(\w+)@([\w-]+)$/);return o&&m[o[1]]?r(o[1],t(o[2])):v(i)})}function B(e,n,t,r,p,i){let[o,a]=y(t.eq)||[],[s,u]=Array.isArray(t.ask)?t.ask:t.ask?[t.ask]:[];return`<article class="${t.visual?"wide":""}">
  ${T(n,e,t)}
  <div class="txt">
    <p class="cap"><span class="n">${r+1}</span>${t.kicker?` \xB7 ${l(t.kicker)}`:""}</p>
    ${typeof t.question=="string"&&t.question.trim()?`<div class="q"><p class="cap">Question</p><p>${l(t.question)}</p></div>`:""}
    <h2>${l(t.title||"Slide")}</h2>
    ${t.line?`<p class="line">${l(I(t.reveal?j(t.line):t.line,p,i))}</p>`:""}
    ${o?`<div class="eq"><math display="block">${o}</math>${a?`<small>${l(a)}</small>`:""}</div>`:""}
    ${g(t.cite)?`<p class="cite">${l(g(t.cite))}</p>`:""}
    ${t.notes?`<div class="notes"><p class="cap">Notes</p><p>${l(t.notes)}</p></div>`:""}
    ${t.checks?`<ol class="checks">${t.checks.map(([c,S])=>`<li><p>${l(c)}</p><p class="a"><b>Answer:</b> ${l(S)}</p></li>`).join("")}</ol>`:""}
    ${t.tool?.kind==="criteria"&&(Array.isArray(t.tool.rows)||Array.isArray(t.tool.key))?`<div class="notes"><p class="cap">${l(t.tool.title||"Criteria")}</p><ul>${(Array.isArray(t.tool.rows)?t.tool.rows:t.tool.key).map(c=>typeof c=="string"?c:Array.isArray(c)?c[0]:c?.text).filter(Boolean).map(c=>c.replace(/\*\*/g,"")).map(c=>`<li>${l(c)}</li>`).join("")}</ul></div>`:""}
    ${t.tool?.kind==="trial"&&f(t.tool.id)?`<div class="notes"><p class="cap">${l(f(t.tool.id).name)}</p><ul>${k(f(t.tool.id)).map(c=>`<li>${l(c)}</li>`).join("")}</ul></div>`:""}
    ${s?`<div class="ask"><p class="cap">Discussion question</p><p>${l(s)}</p>${u?`<p class="a"><b>Answer:</b> ${l(u)}</p>`:""}</div>`:""}
  </div>
</article>`}function M(e,n="",t=[]){let r=e.mine?e.slides:w(e).slides,p=a=>t[r.findIndex(s=>s.id===a)]??null,i=r[0]?.visual==="outline"?r[0]:null,o=[$[e.level]||(e.mine?"Your script":""),`${r.length} slides`,e.minutes?`about ${e.minutes} min`:""].filter(Boolean).join(" \xB7 ");return`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Notes: ${l(e.title)}</title><style>${O()}</style></head><body><main>
<header><div class="top"><div><p class="cap">Speaker notes</p><h1>${l(e.title)}</h1><p class="meta">${l(o)}</p></div>
<button type="button" onclick="print()">Print</button></div>
${e.summary?`<p class="sum">${l(e.summary)}</p>`:""}
${i?`<div class="plan">${i.objectives.length?`<section><p class="cap">Objectives: by the end you can</p><ul>${i.objectives.map(a=>`<li>${l(a)}</li>`).join("")}</ul></section>`:""}<section><p class="cap">Outline</p><ol>${i.outline.map(a=>`<li>${l(a)}</li>`).join("")}</ol></section></div>`:""}
</header>
${r.map((a,s)=>a===i?"":B(e,n,a,s,t[s],p)).join(`
`)}
</main></body></html>`}async function Z(e,n=Promise.resolve([])){let t=window.open("","_blank");t&&t.document.write(`<!doctype html><title>Notes: ${l(e.title)}</title><p style="font: 15px system-ui, sans-serif; margin: 32px">Preparing the notes\u2026</p>`);let r=await n.catch(()=>[]),p=M(e,new URL("brand/handout/",location.href).href,r||[]);t&&!t.closed?(t.document.open(),t.document.write(p),t.document.close()):L(`${z(e.title)}-notes.html`,p,"text/html")}export{L as a,g as b,E as c,H as d,h as e,A as f,F as g,R as h,I as i,M as j,Z as k};
