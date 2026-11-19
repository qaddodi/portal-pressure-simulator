import{a as Go,b as ei}from"./chunk-5DM3Z4J6.js";import{a as Sl,b as Hl,c as Wl,p as Ql,q as Zl}from"./chunk-JKVHSFY5.js";import{a as jl}from"./chunk-RYMN6NEA.js";import{c as Kl,d as Gl}from"./chunk-3G6CPZVY.js";import{h as Yl,i as Jl}from"./chunk-BKRV7N2I.js";import{c as Ho}from"./chunk-OBTUNLW2.js";import{a as Xl}from"./chunk-BFJ2AHO7.js";import{d as Vl}from"./chunk-ZIG573XL.js";import{d as Ll}from"./chunk-4JR4WVNT.js";import{X as Ko,d as ql,f as mt,g as jo,h as Ul,i as zl,l as so,ma as xt}from"./chunk-NLGXCMNF.js";import{a as un,c as Wo,e as Fl}from"./chunk-HKNN3GD2.js";import{a as Wt,b as lo,c as je}from"./chunk-4DTWJXPQ.js";import{i as Il}from"./chunk-NO6E4OXE.js";import{a as dn,f as ge,h as St}from"./chunk-J625TPTL.js";import{f as Tl}from"./chunk-RXGX7OHJ.js";import{c as $l,e as Ke}from"./chunk-5RFXTJI4.js";import{Da as Ml,Y as wl,Z as at,fa as yl,ia as bl,ja as kl,la as $o,oa as no,pa as El,wa as Io,ya as Al}from"./chunk-FCWPSKXB.js";import{a as Pl,b as Cl,e as Nl,f as oo,h as Rl,m as Dl,o as Ol,s as _l,t as Bl}from"./chunk-ZVT6VNWV.js";import{k as gl,l as vl}from"./chunk-CLXSGRVO.js";import{a as to}from"./chunk-QV6U4PNV.js";var ti=bl("label-captions"),vr=30,Xo=[],wr=()=>{},yr=[0,0],br={lh:1,gap:0,halo:0,haloC:"",runs:{}};function si(l){let d=l.getPropertyValue?.("--label-halo"),p=d&&d.trim()&&Ke(d.trim());if(p)return p;let m="";try{typeof document<"u"&&document.documentElement&&(m=Ke(je(document.documentElement).getPropertyValue("--label-halo").trim()))}catch{}return m||Ke(l.webkitTextStrokeColor)}function Vo(l){if(!l||l==="none"||/\binset\b/.test(l))return null;let d=/^(.*?\))?\s*(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px(?:\s+(-?[\d.]+)px)?\s*(.*)$/.exec(l.trim());if(!d)return null;let p=Ke((d[1]||d[6]||"").trim());return p?{colour:p,dy:+d[3],blur:+d[4]}:null}var ro=1984/2048,Yo=494/2048,Fn=l=>({v:l,from:l,to:l,t0:0,ms:0}),ni=l=>({key:l,a:Fn(0),s:Fn(1),dx:Fn(0),dy:Fn(0),x:0,y:0,w:0,h:0,shown:!1,lines:null,lk:null,set:null,own:null,size:[0,0],zero:[0,0],pos:{x:0,y:0,w:0,h:0,a:0}});function Sn(l,d,p,m=420){l.to!==d&&(l.from=Ge(l,p),l.to=d,l.t0=p,l.ms=m)}function Ge(l,d){if(!l.ms)return l.to;let p=(d-l.t0)/l.ms;return p>=1?(l.ms=0,l.v=l.to,l.to):l.v=l.from+(l.to-l.from)*Tl(Math.max(0,p))}var gt=(l,d)=>!!l.ms&&d-l.t0<l.ms,vt=(l,d)=>{l.v=l.from=l.to=d,l.ms=0};function li(l,d){let p=g=>parseFloat(g)||0,m=g=>({size:p(g.fontSize)||12,weight:parseFloat(g.fontWeight)||400,ls:p(g.letterSpacing),fill:Ke(g.color),op:g.opacity===""||g.opacity==null?1:+g.opacity,upper:g.textTransform==="uppercase",mr:p(g.marginRight)}),n=l.lineHeight==="normal"||!l.lineHeight?1.2:/px$/.test(l.lineHeight)?p(l.lineHeight)/(p(l.fontSize)||12):p(l.lineHeight),A={};for(let g in d)d[g]&&(A[g]=m(d[g]));return{lh:n,gap:p(l.rowGap),halo:p(l.webkitTextStrokeWidth),haloC:si(l),runs:A}}function ii(l){if(!l||l==="none"||!/\binset\b/.test(l))return null;let d=/^(.*?\))?\s*(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s*(.*?)\s*inset\s*$/.exec(l.trim());return d?{w:+d[5],colour:Ke((d[1]||d[6]||"").trim())}:null}var kr=(l,d)=>(l.fontS!==d&&(l.fontS=d,l.fontStr=`${l.weight} ${(l.size*d).toFixed(2)}px Inter`),l.fontStr),Er=/\u00a0/g,ri=(l,d)=>l.upper?d.toUpperCase():d,Jo=l=>mt()&&jo(l),ai=(l,d)=>Jo(l)?Ul(l,{weight:d.weight,size:d.size,tnum:!0}):so(l,kr(d,1)),io=new Map;function ci(l,d){let p=`${d.weight}|${d.size}|${d.ls}|${l}`,m=io.get(p);if(m)return m;let n=zl(l,0,0,{weight:d.weight,size:d.size,tnum:!0,ls:d.ls}).polys,A=0;for(let R of n)A+=R.pts.length+2;let g=new Float32Array(A),y=new Int32Array(n.length),v=0;return n.forEach((R,B)=>{y[B]=v,g.set(R.pts,v),v+=R.pts.length,g[v++]=R.pts[0],g[v++]=R.pts[1]}),io.size>1500&&io.clear(),io.set(p,m={pts:g,starts:y,np:n.length,n:A}),m}var fi=l=>{let d=0;for(let p=0;p<l.length;p++){let m=l.charCodeAt(p);(m<56320||m>57343)&&d++}return d},Ar=()=>({runs:[],m:0,w:0,y:0,base:0}),Mr=()=>({t:"",r:null,x:0});function Tr(l,d,p){let m=0,n=0,A=0;for(let g=0;g<d.length;g++){let y=d[g],v=0,R=0,B=0,ie=null,z=p.lines[A]||(p.lines[A]=Ar());for(let H=0;H<y.length;H++){let re=y[H][0],ve=l.runs[y[H][1]];if(!ve||typeof re!="string"||re==="")continue;let $=ri(ve,re).replace(Er," "),J=z.runs[B]||(z.runs[B]=Mr());J.t=$,J.r=ve,J.x=v,B++,ie=ve,Jo($)&&ci($,ve),v+=ai($,ve)+ve.ls*fi($)+ve.mr,R=Math.max(R,ve.size)}if(!B)continue;let ue=v-ie.mr,G=l.lh*R;A&&(n+=l.gap),z.m=B,z.w=ue,z.y=n,z.base=n+(G-(ro+Yo)*R)/2+ro*R,A++,m=Math.max(m,ue),n+=G}return p.n=A,p.w=m,p.h=n,p}function jr(l,d=[]){let p=Wt(l);if(!p||!(p.width>0&&p.height>0))return null;let m=z=>parseFloat(z)||0,n=z=>z.opacity===""||z.opacity==null?1:+z.opacity,A=[],g=[],y={},v=je(l),R=Ke(v.backgroundColor);if(R){let z=m(v.borderTopWidth);g.push({kind:"bg",fill:R,rad:Math.min(m(v.borderTopLeftRadius),p.height/2,p.width/2),sh:Vo(v.boxShadow),border:z>0?{w:z,colour:Ke(v.borderTopColor)}:null})}let B=document.createRange(),ie=document.createTreeWalker(l,4);for(let z=ie.nextNode();z;z=ie.nextNode()){let ue=z.data.replace(/\s+/g," ");if(!ue.trim())continue;let G=z.parentElement,H=je(G),re=1;for(let X=G;X&&X!==l;X=X.parentElement)re*=n(X===G?H:je(X));B.selectNodeContents(z);let ve=lo(B);if(!ve?.length)continue;let $=m(H.fontSize)||12,J={size:$,weight:parseFloat(H.fontWeight)||400,ls:m(H.letterSpacing),fill:Ke(H.color),op:re,upper:H.textTransform==="uppercase",mr:0,halo:m(H.webkitTextStrokeWidth),haloC:si(H)},de=(X,Ee)=>{X.trim()&&A.push({runs:[{t:ri(J,X),r:J,x:Ee.left-p.left}],w:p.width,base:Ee.bottom-p.top-Yo*$})};if(ve.length===1){de(ue.trimEnd(),ve[0]);continue}let Oe=[],ye=/\S+/g;for(let X=ye.exec(z.data);X;X=ye.exec(z.data)){B.setStart(z,X.index),B.setEnd(z,X.index+X[0].length);let Ee=lo(B)?.[0];Ee&&Oe.push([X[0],Ee])}let te=null;for(let[X,Ee]of Oe)te&&Math.abs(Ee.top-te.q.top)<$/2?te.t+=` ${X}`:(te&&de(te.t,te.q),te={t:X,q:Ee});te&&de(te.t,te.q)}for(let z of d){let ue=l.querySelector(z),G=ue&&Wt(ue);G?.width&&(y[z]={x:G.left-p.left,y:G.top-p.top,w:G.width,h:G.height,colour:Ke(je(ue,"::before").backgroundColor)})}return{lines:A,w:p.width,h:p.height,marks:g,at:y}}function Kr(l,d=[]){let p=0,m=Wt(l);if(m&&m.width>0&&m.height>0){let n=document.createRange(),A=document.createTreeWalker(l,4);for(let g=A.nextNode();g;g=A.nextNode()){if(!g.data.trim())continue;n.selectNodeContents(g);let y=lo(n);for(let v=0;y&&v<y.length;v++){let R=y[v];if(!(R.width>0&&R.height>0))continue;let B=R.left-m.left,ie=R.top-m.top,z=R.right-m.left,ue=R.bottom-m.top,G=null;for(let H=0;H<p;H++){let re=d[H];if(Math.min(re.y1,ue)-Math.max(re.y0,ie)>.5*Math.min(re.y1-re.y0,ue-ie)){G=re;break}}if(G)G.x0=Math.min(G.x0,B),G.y0=Math.min(G.y0,ie),G.x1=Math.max(G.x1,z),G.y1=Math.max(G.y1,ue);else{let H=d[p++]||(d[p-1]={x0:0,y0:0,x1:0,y1:0});H.x0=B,H.y0=ie,H.x1=z,H.y1=ue}}}}return d.length=p,d}function ui(l,{labelGL:d=Zl,deferred:p=!1}={}){let m="http://www.w3.org/2000/svg",n=document.createElementNS(m,"svg"),A=document.createElementNS(m,"g");n.setAttribute("class","cap-model"),n.setAttribute("aria-hidden","true"),A.setAttribute("class","lb-blocks"),n.append(A),l.append(n);let g=document.createElementNS(m,"g");g.setAttribute("class","lb-leaders"),n.prepend(g);let y=p?null:d(n,A,{force:!0,id:"capLabelGl",marks:[g]}),v=null,R=[],B=()=>!!y&&!y.lost,ie=0,z=i=>{let a=document.createElementNS(m,i==="leader"?"path":"circle");return a.setAttribute("class",i),g.append(a),a};function ue(i,a,u,x,q,ne,I){let b=a.m||(a.m={p:z("leader"),h:z("leader-dot-halo"),d:z("leader-dot")}),L=q.toFixed(2),W=ne.toFixed(2),V=+I.toFixed(3);b.o=V,y.markAt?.(b.p,`M${L} ${W} L${u.toFixed(2)} ${x.toFixed(2)}`,"","",V),y.markAt?.(b.h,L,W,String(Oe.haloR),V),y.markAt?.(b.d,L,W,String(a.r??Oe.r),V)}function G(i){if(i.cvSv===i.sv&&i.cvGr===mt())return i.cv;i.cvSv=i.sv,i.cvGr=mt();let a=mt();for(let u=0,x=i.set.n??i.set.lines.length;a&&u<x;u++){let q=i.set.lines[u];for(let ne=0,I=q.m??q.runs.length;a&&ne<I;ne++)a=jo(q.runs[ne].t)}return i.cv=a}let H=0,re=(i,a,u)=>{i.getAttribute(a)!==u&&i.setAttribute(a,u)};function ve(i,a){let u=i.g;u||(u=i.g=document.createElementNS(m,"g"),u.setAttribute("class","lb"),A.append(u),i.ent={g:u,x:0,y:0,rot:!1,alpha:1,look:0},i.gmarks=[],i.gtexts=[]);let x=mt();if(i.gsv===i.sv&&i.gs===a&&i.ggr===x&&i.garr===i.arrow&&i.gdec===i.decor)return u;let q=i.gs!==a||i.garr!==i.arrow||i.gdec!==i.decor;i.gsv=i.sv,i.gs=a,i.ggr=x,i.garr=i.arrow,i.gdec=i.decor,i.ent.look=++H;let ne=i.w*a;if(q){for(let L of i.gmarks)L.remove();i.gmarks.length=0;let b=i.gtexts[0]?.te||null;if(i.arrow){let L=i.arrow,W=Math.cos(L.ang),V=Math.sin(L.ang),le=(L.x+W*L.r)*a,Q=(L.y+V*L.r)*a,Me=document.createElementNS(m,"polygon");Me.setAttribute("points",[le+(-4.5*W+5*V)*a,Q+(-4.5*V-5*W)*a,le+4.5*W*a,Q+4.5*V*a,le+(-4.5*W-5*V)*a,Q+(-4.5*V+5*W)*a].map(Se=>Se.toFixed(2)).join(" ")),Me.style.fill=L.colour,u.insertBefore(Me,b),i.gmarks.push(Me)}for(let L of i.decor||Xo){let W=document.createElementNS(m,"polygon");W.setAttribute("points",L.pts.map(V=>(V*a).toFixed(2)).join(" ")),W.style.fill=L.fill||"none",L.stroke&&(W.style.stroke=L.stroke,W.style.strokeWidth=`${L.sw||1}px`),u.insertBefore(W,b),i.gmarks.push(W)}}let I=0;for(let b=0,L=i.set.n??i.set.lines.length;b<L;b++){let W=i.set.lines[b],V=(ne-W.w*a)/2;for(let le=0,Q=W.m??W.runs.length;le<Q;le++){let{t:Me,r:Se,x:F}=W.runs[le],N=i.gtexts[I];if(!N){let Vt=document.createElementNS(m,"text"),mn=document.createElementNS(m,"tspan");Vt.append(mn),u.append(Vt),N=i.gtexts[I]={te:Vt,sp:mn}}I++;let{te:Fe,sp:Ne}=N;re(Fe,"x",(V+F*a).toFixed(2)),re(Fe,"y",(W.base*a).toFixed(2)),re(Ne,"font-size",(Se.size*a).toFixed(2)),re(Ne,"font-weight",String(Se.weight)),Se.ls?re(Ne,"letter-spacing",(Se.ls*a).toFixed(3)):Ne.hasAttribute("letter-spacing")&&Ne.removeAttribute("letter-spacing"),Ne.style.fill!==Se.fill&&(Ne.style.fill=Se.fill),Ne.textContent!==Me&&(Ne.textContent=Me)}}for(let b=I;b<i.gtexts.length;b++)i.gtexts[b].te.remove();return i.gtexts.length=I,y?.dirty?.(u),u}let $=new Map,J=new Map,de=new Map,Oe={line:"",lw:1,r:2.4,fill:"",ring:"",rw:1.3,halo:"",haloR:5},ye=Xo,te=1,X=0,Ee=0,_e=0,Qe=!1,ot=null,bt=null,kt=null,Ft=!1,Ve=0,$e=!1,Ae=!1,Pt=null,Ye=null,Ce=0,qt=0,he=!1,Te=[],Be=[],Le=[1,0,0],P=[1,0,0],Ie=0,Je=0,st=0,ft=0,me=[],ut=[],pn=0,Xt=0,Ct=0,M=0,S=0,O=(i,a,u,x,q,ne,I,b,L,W,V,le)=>{let Q=Te[Ie++]||(Te[Ie-1]={key:"",x:0,y:0,w:0,h:0,a:0,clipped:!1,I:null,l:0,t:0,s:1});Q.key=i,Q.x=a,Q.y=u,Q.w=x,Q.h=q,Q.a=ne,Q.I=L,Q.l=W,Q.t=V,Q.s=le,Q.clipped=a<0||u<0||a+x>I||u+q>b},ce=i=>{i!==Ae&&(Ae=i,i?Pt?.():Ye?.())};function He(){if(_e=0,he||!l.isConnected)return;let i=Wt(l),a=i.width,u=i.height,x=at();Ve=x;let q=!1,ne=!1;$e=!0,Ie=0,st=0,Ct=Ce,Le[0]=te,Le[1]=X,Le[2]=Ee;try{if(kt?.(x)&&(q=!0),!(a>0&&u>0)){v&&y&&(R.length=0,y.sync(R));return}let I=1;v&&(v.alpha||=Ql(l,{near:v.spec.near||null,onChange:()=>be.paint()}),I=v.alpha.now(),v.alpha.moving&&(q=!0));for(let[b,L]of J){let W=Ge(L.a,x)*(L.of?Cn(L.of,x):1);if(q||=gt(L.a,x),W*I<=.002||!L.colour){L.m&&L.m.o!==0&&y&&(L.m.o=0,y.markAlpha?.(L.m.p,0),y.markAlpha?.(L.m.h,0),y.markAlpha?.(L.m.d,0));continue}let{x1:V,y1:le}=L,Q=L.of&&$.get(L.of);Q&&L.follow&&(V+=Ge(Q.dx,x)-L.sg*(Q.w/2)*(1-Ge(Q.s,x)),le+=Ge(Q.dy,x));let Me=te*L.x2+X,Se=te*L.y2+Ee,F=te*V+X,N=te*le+Ee;Q&&te!==1&&(F=te*Q.x+X+(V-Q.x),N=te*Q.y+Ee+(le-Q.y));{let Fe=me[st++]||(me[st-1]={key:"",x0:0,y0:0,x1:0,y1:0,a:0});Fe.key=b,Fe.x0=Me,Fe.y0=Se,Fe.x1=F,Fe.y1=N,Fe.a=W}B()&&ue(b,L,F,N,Me,Se,W*I)}R.length=0;for(let b of $.values()){if(!de.get(b.key)||!b.set)continue;let W=Ge(b.a,x),V=Ge(b.s,x),le=Ge(b.dx,x),Q=Ge(b.dy,x);if(q||=gt(b.a,x)||gt(b.s,x)||gt(b.dx,x)||gt(b.dy,x),W*I<=.002)continue;let Me=b.w*V,Se=b.h*V,F=te*(b.x+le)+X-Me/2,N=te*(b.y+Q)+Ee-Se/2;if(O(b.key,F,N,Me,Se,W,a,u,b,F,N,V),B()&&G(b)){if(b.set.lines.length&&(b.set.n??1)>0){ve(b,V);let Fe=b.ent;Fe.x=F,Fe.y=N,Fe.alpha=W*I,R.push(Fe)}continue}}y&&y.sync(R)}finally{$e=!1;let I=B();if(y)if(a>0&&u>0&&I){qt=0,pn++;let b=Be;Be=Te,Te=b,Je=Ie,ft=st;{let L=ut;ut=me,me=L}Xt=Ct;{let L=P;P=Le,Le=L}M=a,S=u,ce(!0),Qe||(Qe=!0,ot?.())}else a>0&&u>0&&!I&&(ne=!0)}ne&&qt++<vr&&(q=!0),q?_e=ti(He):Ft&&bt?.(),Ft=q}function lt(){v&&(v.off?.(),v.alpha?.dispose(),v=null),y&&(y.dispose?.(),y=null),R.length=0}function Cn(i,a){let u=$.get(i);return u?Ge(u.a,a):1}mt()||ql().then(()=>{he||(Ce++,be.paint())},()=>{});let be={attach(i){if(!he){if(lt(),i?.top){let a=i.top,u={gl:a.gl,canvas:a.canvas,ask:()=>a.present(),now:()=>a.present(),active:()=>!he&&!a.gl.isContextLost()&&(i.active?!!i.active():!0),scale:i.scale};y=d(n,A,{force:!0,id:"capLabelGl",marks:[g],host:u}),y&&(v={top:a,spec:i,alpha:null,off:a.add({order:i.order??0,solo:!0,on:()=>!!(R.length||J.size)&&(i.active?!!i.active():!0),draw:()=>{(R.length||J.size)&&y?.drawInto?.()}})})}else y=d(n,A,{force:!0,id:"capLabelGl",marks:[g]});Ce++,be.paint()}},detach(){he||lt()},get on(){return!he&&!!y},set onDrawn(i){he||(ot=i,Qe&&i?.())},get presented(){return Ae},set onPresented(i){he||(Pt=i,Ae&&i?.())},set onLost(i){he||(Ye=i)},snapshot(){let i=[];for(let u=0;u<Je;u++){let x=Be[u],q=[],ne=x.I?.set,I=x.w;if(ne)for(let L=0,W=ne.n??ne.lines.length;L<W;L++){let V=ne.lines[L],le=V.m??V.runs.length;if(!le)continue;let Q=x.l+(I-V.w*x.s)/2,Me=1/0,Se=-1/0,F=0;for(let Fe=0;Fe<le;Fe++){let Ne=V.runs[Fe];Me=Math.min(Me,Ne.x),Se=Math.max(Se,Ne.x+ai(Ne.t,Ne.r)+Ne.r.ls*fi(Ne.t)),F=Math.max(F,Ne.r.size)}let N=x.t+V.base*x.s;q.push({x:Q+Me*x.s,y:N-ro*F*x.s,w:(Se-Me)*x.s,h:(ro+Yo)*F*x.s})}let b="";if(ne)for(let L=0,W=ne.n??ne.lines.length;L<W&&!b;L++){let V=ne.lines[L];for(let le=0,Q=V.m??V.runs.length;le<Q&&!b;le++){let Me=V.runs[le].r;(Me.halo??de.get(x.key)?.halo)>0&&(b=Me.haloC??de.get(x.key)?.haloC??"")}}i.push({key:x.key,x:x.x,y:x.y,w:x.w,h:x.h,a:x.a,clipped:x.clipped,rows:q,halo:b})}let a=[];for(let u=0;u<ft;u++){let x=ut[u];a.push({key:x.key,x0:x.x0,y0:x.y0,x1:x.x1,y1:x.y1,a:x.a})}return{seq:pn,gen:Xt,w:M,h:S,items:i,leads:a}},holes(i){he||i===ye||(ye=i||Xo,y?.setHoles?.(ye),be.paint())},get gen(){return Ce},set onFrame(i){he||(kt=i)},set onRest(i){he||(bt=i)},look(i,a){de.set(i,a),Ce++,be.paint()},hasLook:i=>de.has(i),measure(i,a){let u=de.get(i),x=$.get(i);return x||$.set(i,x=ni(i)),u&&(x.lines!==a||x.lk!==u||x.gr!==mt())?(x.lines=a,x.lk=u,x.gr=mt(),x.set=Tr(u,a,x.own||(x.own={lines:[],n:0,w:0,h:0})),x.w=x.set.w,x.h=x.set.h,x.size[0]=x.w,x.size[1]=x.h,x.sv=++ie,Ce++):u||(x.lines=a),u?x.size:x.zero},mirror(i,a){let u=$.get(i);if(u||$.set(i,u=ni(i)),de.has(i)||de.set(i,br),Ce++,!a){u.set=null,u.sv=++ie,be.paint();return}if(u.set=a,u.w=a.w,u.h=a.h,u.sig="",u.lines=null,u.sv=++ie,mt())for(let x of a.lines)for(let q of x.runs)Jo(q.t)&&ci(q.t,q.r);be.paint()},decor(i,a){let u=$.get(i);u&&u.decor!==a&&(u.decor=a,be.paint())},arrow(i,a){let u=$.get(i);u&&u.arrow!==a&&(u.arrow=a,be.paint())},put(i,{x:a,y:u,off:x=null,show:q=1,now:ne=at(),ms:I=420}){let b=$.get(i);b&&(Ve=ne,b.x=a,b.y=u,x&&(b.placed?(vt(b.dx,x[0]),vt(b.dy,x[1]),Sn(b.s,x[2],ne)):(vt(b.dx,x[0]),vt(b.dy,x[1]),vt(b.s,x[2]))),b.set&&(b.placed||(b.placed=!0),Sn(b.a,q,ne,I)),be.paint())},place(i,a,u,x,q,ne,I){let b=$.get(i);b&&(Ve=I,b.x=a,b.y=u,ne>=0&&(b.placed?Sn(b.s,ne,I):vt(b.s,ne)),b.set&&(b.placed=!0,Sn(b.a,x,I,q)),be.paint())},reset(i){let a=$.get(i);a&&(a.placed=!1,vt(a.a,0))},hideAll(){for(let i of $.values())i.placed=!1,vt(i.a,0);for(let i of J.values())vt(i.a,0);be.paint()},lead(i,a){let u=J.get(i);u||J.set(i,u={a:Fn(a.show??1)}),Object.assign(u,a),a.cut?vt(u.a,0):Sn(u.a,a.show??1,at()),be.paint()},leadOf:i=>J.get(i),leadLook(i){let a=!1;for(let u in i)i[u]!==void 0&&Oe[u]!==i[u]&&(Oe[u]=i[u],a=!0);a&&(Ce++,be.paint())},at(i,a=Ve||at()){let u=$.get(i);if(!u)return null;let x=Ge(u.s,a),q=u.pos;return q.x=u.x+Ge(u.dx,a),q.y=u.y+Ge(u.dy,a),q.w=u.w*x,q.h=u.h*x,q.a=Ge(u.a,a),q},moving(i=at()){for(let a of $.values())if(gt(a.a,i)||gt(a.s,i)||gt(a.dx,i)||gt(a.dy,i))return!0;for(let a of J.values())if(gt(a.a,i))return!0;return!1},view(i,a,u){te===i&&X===a&&Ee===u||(te=i,X=a,Ee=u,be.paint())},paint(){$e||(qt=0),!_e&&!$e&&(_e=ti(He))},drawNow(){_e||He()},dispose(){if(he)return;he=!0,_e&&wl(_e),_e=0;let i=Ae,a=Ye;kt=bt=ot=Pt=Ye=null,$.clear(),J.clear(),de.clear(),Te=[],Be=[],me=[],ut=[],Ie=Je=st=ft=0,n.remove(),lt(),Ae=!1,i&&a?.();for(let u of["look","measure","mirror","arrow","decor","put","place","reset","hideAll","lead","view","paint","drawNow","attach","detach"])be[u]=wr;be.measure=()=>yr,be.hasLook=()=>!1,be.leadOf=be.at=()=>null,be.moving=()=>!1}};return be}var di=(l,d,p)=>{let m=ge((p-l)/(d-l),0,1);return m*m*(3-2*m)},ct={por:0,col:0,bm:0,mv:0,act:0,lum:0,pinch:0,v:0,filt:0,prot:0};function hi(l){let d=l.sigma??.15,p=ge(1-(d-.15)/.45,0,1),m=ge(Math.max(l.fibSin,1-p),0,1),n=(l.lymph??.6)/(l.lymph0||.6);return ct.por=p,ct.col=l.fibSin,ct.bm=di(.12,.7,m),ct.mv=1-.75*di(.1,.85,m),ct.act=l.act,ct.lum=l.zone.sin**-.12*(1+.5*l.congU),ct.pinch=.22*l.act,ct.v=(l.rev?.sin?-1:1)*ge(Math.abs(l.flow)/Math.max(.35,l.zone.sin**-.24),.08,3),ct.filt=ge(n,0,6),ct.prot=ge((l.lyProt-.42)/.42,0,1),ct}var pi=l=>(l>>>=0,l=(l^l>>>16)>>>0,l=Math.imul(l,2146121005)>>>0,l=(l^l>>>15)>>>0,l=Math.imul(l,2221713035)>>>0,(l^l>>>16)>>>0),Bt=(l,d)=>(pi((Math.imul(l+1048576>>>0,2654435761)^pi(d))>>>0)>>>8)/16777216,hn=1,Qo=24,mi=.6;function xi(l,d){let p=Math.floor(l/10),m=l-10*p;return Bt(p,d)>=.8||m<3||m>7?null:{x:hn*l+.5,w:mi,th:.12+.28*Math.abs(m-5)+.18*Bt(p,d+4)}}var ao=(l,d)=>{let p=Math.min(1,Math.max(0,(d-l+.06)/.12));return p*p*(3-2*p)},jt=(l,d)=>Qo*l+7*(Bt(l,d)-.5);function gi(l,d,p){let m=Math.floor(l/Qo);return l<jt(m,d)?m--:l>=jt(m+1,d)&&m++,p.j=m,p.x0=jt(m,d),p.x1=jt(m+1,d),p.nu=.3+.4*Bt(m,d+1),p.nv=.4+.2*Bt(m,d+2),p.nr=2.6+.5*Bt(m,d+3),p.bi=Bt(m,d+4)<.12,p}var Lr=(l,d)=>38*l+8+22*Bt(l,d),Sr=4.4;function Zo(l,d){let p=Math.floor(l/38);for(let m=-1;m<=1;m++)if(Math.abs(l-Lr(p+m,d))<Sr)return!0;return!1}function vi(l,d,p,m,n){for(let A=0;A<2;A++){let g=A?-1/0:p,y=A?1/0:m,v=null,R=1/0;for(let B of l){let ie=Math.abs(B.x-d);if(ie>20||B.x<g||B.x>y||Zo(B.x,n))continue;let z=B.th+.02*ie;z<R&&(R=z,v=B)}if(v)return v.x}return d}var Xe={poreUp:3,poreDn:5,nucUp:41,nucDn:42,plateUp:29,plateDn:71},Ue={lum:5,endo:.8,disse:3.4,hep:20},Fr=`#version 300 es
layout(location=0) in vec2 corner;
uniform vec2 size;
out vec2 vP;
void main() { vP = vec2(corner.x * 0.5 + 0.5, 0.5 - corner.y * 0.5) * size; gl_Position = vec4(corner, 0.0, 1.0); }`,wi=`
uniform vec3 uI0, uI1;          // device px \u2192 local \xB5m
uniform vec2 size;
uniform float uPx;              // \xB5m per device px
uniform vec4 uRev;              // shown: alpha, from x (\xB5m, toward the portal side), to x, half-height |y|
uniform float uAll;             // shown everywhere
uniform float uFocus;           // how far the tissue beyond its own plates fades into the page (eased in as the zoom lands)
uniform vec2 uDet;              // detail: amount, half-length (\xB5m) of the stretch that has it
float sat(float x) { return clamp(x, 0.0, 1.0); }
float revealA(vec2 l) {
  // Soft edges (\xB5m): long at the ends of the run, so the vessel fades into the lobule's own; short across it.
  float ex = max(8.0, 14.0 * uPx), ey = max(2.0, 5.0 * uPx);
  float inX = smoothstep(uRev.y - ex, uRev.y + ex, l.x) * (1.0 - smoothstep(uRev.z - ex, uRev.z + ex, l.x));
  float inY = 1.0 - smoothstep(uRev.w - ey, uRev.w + ey, abs(l.y));
  return max(uRev.x * inX * inY, uAll);
}
float detailAt(float x) { return uDet.x * (1.0 - smoothstep(uDet.y, uDet.y + 30.0, abs(x))); }`,Pr=`#version 300 es
precision highp float;
precision highp int;
in vec2 vP;
out vec4 o;
${wi}
uniform int uPass;              // 0: the tissue; 1: the cells that lie over the moving particles (stellate, Kupffer)
uniform float uLum, uPinch, uXs, uXk, uKy, uHscA, uCol, uBm, uMv, uAct, uPor, uFlow, uLym, uLyF, uDir, uDark, uShim, uStreak;
uniform vec3 cBg, cShade, cLumen, cLymph, cCell, cUnder, cNuc, cCol, cBm, cBile, cEndo, cEndoS, cEndoE, cEndoN, cHscQ, cHscA, cHscN, cKup, cKupN, cKupE, cRbc, cEndF, cEndE;
uniform float aBm;
uniform vec4 uEnd;               // the end arrows: portal x, central x (\xB5m), size (\xB5m), alpha
uniform vec2 uEndA;              // how much each end's name shows (0 to 1): its arrow fades with it

const float ENDO = ${Ue.endo.toFixed(2)}, DISSE = ${Ue.disse.toFixed(2)}, HEP = ${Ue.hep.toFixed(1)}, LUM0 = ${Ue.lum.toFixed(1)};
const float SLOT = ${hn.toFixed(2)}, CELL = ${Qo.toFixed(1)};

uint hsh(uint x) { x ^= x >> 16; x *= 0x7feb352du; x ^= x >> 15; x *= 0x846ca68bu; x ^= x >> 16; return x; }
float h1(int i, int s) { return float(hsh((uint(i + 1048576) * 0x9e3779b1u) ^ hsh(uint(s))) >> 8) / 16777216.0; }
float cov(float d) { return 1.0 - smoothstep(-0.7 * uPx, 0.7 * uPx, d); }
float line(float d, float w) { return cov(abs(d) - max(0.5 * w, 0.55 * uPx)); }   // a line at least about a pixel wide
float smin(float a, float b, float k) { float h = max(k - abs(a - b), 0.0) / k; return min(a, b) - h * h * k * 0.25; }
float smax(float a, float b, float k) { return -smin(-a, -b, k); }
float sdE(vec2 p, vec2 ab) { float k0 = length(p / ab), k1 = length(p / (ab * ab)); return k0 * (k0 - 1.0) / max(k1, 1e-5); }
float sdTaper(vec2 p, vec2 a, vec2 b, float ra, float rb) { vec2 pa = p - a, ba = b - a; float h = sat(dot(pa, ba) / dot(ba, ba)); return length(pa - ba * h) - mix(ra, rb, h); }
float sdTri(vec2 p, vec2 p0, vec2 p1, vec2 p2) {
  vec2 e0 = p1 - p0, e1 = p2 - p1, e2 = p0 - p2, v0 = p - p0, v1 = p - p1, v2 = p - p2;
  vec2 q0 = v0 - e0 * sat(dot(v0, e0) / dot(e0, e0)), q1 = v1 - e1 * sat(dot(v1, e1) / dot(e1, e1)), q2 = v2 - e2 * sat(dot(v2, e2) / dot(e2, e2));
  float sg = sign(e0.x * e2.y - e0.y * e2.x);
  vec2 d = min(min(vec2(dot(q0, q0), sg * (v0.x * e0.y - v0.y * e0.x)), vec2(dot(q1, q1), sg * (v1.x * e1.y - v1.y * e1.x))), vec2(dot(q2, q2), sg * (v2.x * e2.y - v2.y * e2.x)));
  return -sqrt(d.x) * sign(d.y);
}
float sdRB(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
float dot2(vec2 v) { return dot(v, v); }
// The distance to a quadratic B\xE9zier (A, control B, C) and where along it (t), for smooth tapered processes.
vec2 sdBez(vec2 pos, vec2 A, vec2 B, vec2 C) {
  vec2 a = B - A, b = A - 2.0 * B + C, c = a * 2.0, d = A - pos;
  float kk = 1.0 / max(dot(b, b), 1e-6), kx = kk * dot(a, b), ky = kk * (2.0 * dot(a, a) + dot(d, b)) / 3.0, kz = kk * dot(d, a);
  float p = ky - kx * kx, q = kx * (2.0 * kx * kx - 3.0 * ky) + kz, h = q * q + 4.0 * p * p * p;
  if (h >= 0.0) {
    h = sqrt(h);
    vec2 x = (vec2(h, -h) - q) / 2.0, uv = sign(x) * pow(abs(x), vec2(1.0 / 3.0));
    float t = sat(uv.x + uv.y - kx);
    return vec2(length(d + (c + b * t) * t), t);
  }
  float z = sqrt(-p), v = acos(clamp(q / (p * z * 2.0), -1.0, 1.0)) / 3.0, m = cos(v), n = sin(v) * 1.732050808;
  vec3 t = clamp(vec3(m + m, -n - m, n - m) * z - kx, 0.0, 1.0);
  float d1 = dot2(d + (c + b * t.x) * t.x), d2 = dot2(d + (c + b * t.y) * t.y);
  return d1 < d2 ? vec2(sqrt(d1), t.x) : vec2(sqrt(d2), t.y);
}
// A smooth process: a B\xE9zier stroke tapering from radius ra to rb.
float sdProc(vec2 p, vec2 A, vec2 B, vec2 C, float ra, float rb) { vec2 r = sdBez(p, A, B, C); return r.x - mix(ra, rb, r.y); }
// Flat fill, no outline, as the lobule draws its cells: a shape reads by its colour against what is under it.
vec3 paint(vec3 under, vec3 fill, float d) { return mix(under, fill, cov(d)); }

float halfW(float x) { return uLum * (1.0 - uPinch * exp(-pow((x - uXs) / 11.0, 2.0))) + 0.15 * sin(x * 0.11 + 1.3); }
float disseW(float x) { return DISSE * (1.0 + 0.25 * uCol) + 0.2 * sin(x * 0.07); }

// \u2500\u2500 Fenestrae (as poreAt) and the endothelium \u2500\u2500
float poreOpen(int j, int sd, out float px) {
  int G = int(floor(float(j) / 10.0)), k = j - 10 * G;
  px = 0.0;
  if (h1(G, sd) >= 0.8 || k < 3 || k > 7) return 0.0;
  px = SLOT * float(j) + 0.5;
  float th = 0.12 + 0.28 * abs(float(k) - 5.0) + 0.18 * h1(G, sd + 4);
  return ${mi.toFixed(2)} * smoothstep(th - 0.06, th + 0.06, uPor);
}
// The endothelium of a lining at |y| = a (lumen face at hw): one thin, solid sheet in section, cut through by real gaps
// where its fenestrae are open (the plasma runs through them; they close, one by one, as it defenestrates), each cell
// swelling over its flat nucleus, which bulges into the lumen, with a fine junction midway to the next cell; a little
// thicker as it capillarizes. With little detail (as the lobule draws it) a hairline casing.
// dN is the nucleus, dJ the junctions between cells.
float endoTh(float det) { return mix(0.1, 0.19, det) * (1.0 + mix(0.45, 0.63, det) * (1.0 - uPor)); }   // half its thickness
float nucAt(int n, int nsd) { return 38.0 * float(n) + 8.0 + 22.0 * h1(n, nsd); }
float sdEndo(float x, float a, float hw, int sd, int nsd, bool skipK, float det, out float dN, out float dJ) {
  float th = endoTh(det);
  float ay = a - (hw + ENDO * 0.5), d = abs(ay) - th;
  dN = 1e3; dJ = 1e3;
  if (det < 0.02) return d;
  int j = int(floor(x / SLOT));
  for (int k = -1; k <= 1; k++) {
    float px;
    float w = poreOpen(j + k, sd, px) * det;
    if (w > 0.02) d = smax(d, -(abs(x - px) - 0.5 * w), th);   // a gap with rounded lips
  }
  if (nsd > 0) {
    int n = int(floor(x / 38.0));
    for (int k = -1; k <= 1; k++) {
      float c = nucAt(n + k, nsd);
      float m = 0.5 * (c + nucAt(n + k + 1, nsd));
      dJ = min(dJ, sdTaper(vec2(x - m, ay), vec2(-0.5, -th), vec2(0.5, th), 0.0, 0.0));
      if (skipK && abs(c - uXk) < 12.0) continue;
      vec2 q = vec2(x - c, ay + 0.38 * det);   // the body and nucleus sit toward the lumen
      d = smin(d, sdE(q, vec2(3.3, th + 0.55 * det)), 0.9);
      dN = min(dN, sdE(q, vec2(2.3, 0.42 * det + 0.01)));
    }
  }
  return d;
}
// The endothelial cells: one solid sheet with a thin dark border round the whole cell (both faces, the lips of every
// open pore and the swell over the nucleus), the nucleus a deeper lens with its own rim, the junctions in the border ink.
// The border and the sheet's own colour come in with the detail; without it the casing is drawn as before.
vec3 endoInk(vec3 under, float d, float dN, float dJ, float det) {
  vec3 c = mix(under, cEndoE, cov(d - max(0.1, 2.4 * uPx) * det) * det);
  c = mix(c, mix(cEndo, cEndoS, det), cov(d) * mix(0.95, 1.0, det));
  c = mix(c, cEndoN, cov(dN));
  c = mix(c, mix(cEndoN, cEndoE, 0.6), line(dN, 0.05) * det);
  return mix(c, cEndoE, line(dJ, 0.09) * cov(d) * det);
}

// \u2500\u2500 The lumen, flat as the lobule's: pressure colour, a thin light line and a thin dark one, the streaks \u2500\u2500
vec3 lumen(float x, float y, float hw, int lane0) {
  vec3 c = cLumen;
  // The flow's light (the shimmer, the sheen, the glints): white on a dark lumen, a deep shade of the lumen on a pale one, where white is
  // 1.2 to 1.9:1; eased by the lumen's lightness (the pressure colour moves), as the vessels' streaks are (veins-gl bloodAt; visual-style B5).
  float fPale = smoothstep(0.58, 0.66, dot(cLumen, vec3(0.299, 0.587, 0.114)));
  vec3 fInk = mix(vec3(1.0), mix(cLumen, vec3(0.07, 0.075, 0.13), 0.7), fPale);
  c = mix(c, vec3(1.0), 0.28 * line(y + hw - 0.5, 0.16));
  c = mix(c, vec3(0.0), 0.1 * line(y - hw + 0.5, 0.16));
  // Streaks in lanes, each at its lane's speed (the parabolic profile: fastest in the middle).
  const float NL = 9.0;
  float r = clamp(y / hw, -1.0, 1.0), u = (r * 0.5 + 0.5) * NL, li = min(floor(u), NL - 1.0), lc = (li + 0.5) / NL * 2.0 - 1.0;
  int id = int(li) + lane0;
  float prof = 1.8 * (1.0 - lc * lc) + 0.05, P = 15.0 + 7.0 * h1(id, 7);
  float sx = x - uFlow * prof + h1(id, 8) * P, k = floor(sx / P), xx = sx - k * P;
  int ki = int(k);
  float hk = h1(ki * 31 + id, 9), Ls = 4.0 + 6.0 * hk, x0 = (P - Ls) * h1(ki + id * 977, 10);
  float e = (xx - x0) / Ls;
  float yc = (lc + (h1(ki, id + 11) - 0.5) * 0.6 / NL) * hw;
  float rr = 1.0 - r * r;
  c = mix(c, fInk, 0.07 * rr * rr * uShim / 0.5);
  float wy = min(max(0.35, 2.8 * uPx), 0.3 * hw / NL);
  // Light on a flowing liquid: a slow sheen drifts with the blood (two broad, warped waves), and each streak is a soft
  // glint, bright at its head and trailing off, that swells and fades as the sheen passes over it, so none blinks.
  float sx2 = x - uFlow * (0.55 + 0.45 * rr);
  float sh = 0.5 + 0.5 * sin(sx2 * 0.075 + 1.6 * sin(sx2 * 0.031 + y * 0.35) + y * 0.22);
  sh = sh * sh * (3.0 - 2.0 * sh);
  c = mix(c, fInk, 0.11 * sh * rr * uShim / 0.5);
  float ed = uDir < 0.0 ? 1.0 - e : e;   // the head leads the flow
  float along = smoothstep(0.0, 0.85, ed) * (1.0 - smoothstep(0.86, 1.0, ed));
  float acr = exp(-pow((y - yc) / (wy * (0.6 + 0.6 * ed)), 2.0));
  c = mix(c, fInk, along * acr * smoothstep(0.15, 0.35, hk) * uShim * 0.6 * (0.45 + 0.75 * sh));
  return c;
}

// \u2500\u2500 The space of Disse: lymph running back to the portal triad; collagen and microvilli as the detail comes in \u2500\u2500
vec3 disse(float x, float a, float wi, float hi, int side, bool main, float det) {
  vec3 c = cLymph;
  // The lymph: soft dashes running back toward the portal triad, tapered at both ends (never a hard line). How many
  // show follows the lymph flow (uLyF, the share of slots lit: sparse when it is low, crowded when it is high),
  // and each fades in or out as that eases, so none pops; the speed is the flow's too (lymX in sinusoid-view.js).
  float lx = x - uLym + (main ? 0.0 : 3.0) + (side < 0 ? 0.0 : 7.0);
  for (int j = 0; j < 4; j++) {
    float fj = float(j), P = 8.0 + 1.7 * fj, sx = lx * (0.92 + 0.08 * fj) + 4.1 * fj, k = floor(sx / P), xx = sx - k * P;
    float L = 2.4 + 1.8 * h1(int(k) * 7 + j, 21 + side), x0 = (P - L) * h1(int(k) + j * 131, 23 + side), e = (xx - x0) / L;
    float on = smoothstep(h1(int(k) * 13 + j, 27 + side) - 0.12, h1(int(k) * 13 + j, 27 + side), uLyF - 0.25 * fj);
    if (on < 0.01 || e < 0.0 || e > 1.0) continue;
    float al = smoothstep(0.0, 0.3, e) * (1.0 - smoothstep(0.6, 1.0, e)) * on;
    float yc = mix(wi, hi, 0.24 + 0.17 * fj + 0.06 * (h1(int(k), 29 + j) - 0.5)), wy = max(0.07 * (hi - wi), 1.1 * uPx);
    c = mix(c, vec3(1.0), al * exp(-pow((a - yc) / wy, 2.0)) * uStreak * clamp(0.75 + 0.3 * uLyF, 0.75, 1.1));
  }
  // Collagen: a pale fill as it takes the space the lymph had, then banded fibre bundles laid down by the
  // stellate cell: they start at it and spread along Disse, each thickening at its own stage.
  if (uCol > 0.02) {
    c = mix(c, cCol, (0.36 - 0.08 * uDark) * smoothstep(0.1, 0.9, uCol));
    float near = side < 0 ? exp(-pow((x - uXs) / 26.0, 2.0)) * uAct * 0.08 : 0.0;
    float reach = 14.0 + 320.0 * smoothstep(0.0, 0.8, uCol) * (side < 0 ? 1.0 : 0.8);
    float spread = main ? 1.0 - smoothstep(reach - 30.0, reach, abs(x - uXs - (side < 0 ? 0.0 : 18.0))) : 1.0;   // the neighbouring sinusoids' Disse fills evenly
    float fd = main ? det : 1.0;
    float bd = smoothstep(0.3, 0.1, uPx) * fd;                   // the cross-banding, only once it is resolved
    vec3 fib = cCol * 0.9, fibE = cCol * 0.72;
    for (int i = 0; i < 7; i++) {
      float al = smoothstep(float(i) / 7.0 * 0.8, float(i) / 7.0 * 0.8 + 0.22, uCol) * fd * spread;
      if (al < 0.01) continue;
      int sd = (side < 0 ? 91 : 92) + (main ? 0 : 40);
      float v = 0.15 + 0.7 * h1(i, sd), f = 0.12 + 0.12 * h1(i, sd + 7), ph = 6.2831853 * h1(i, sd + 9);
      float tc = clamp(v + 0.12 * sin(x * f + ph) + 0.05 * sin(x * f * 2.7 + ph * 1.7) + near, 0.08, 0.92);
      float w = (0.2 + (0.5 + 0.3 * h1(i, sd + 3)) * al * uCol) * (hi - wi) * 0.22;
      float d = abs(a - mix(wi, hi, tc)) - 0.5 * w;
      if (d > 0.4) continue;
      // Striated like collagen under the microscope: light and dark bands across the bundle, and a fibril seam along it.
      float band = 0.5 + 0.5 * sin(6.2831853 * x / 1.1 + ph);
      vec3 fc = mix(fib, fibE, (0.05 + 0.15 * band) * bd);
      fc = mix(fc, fibE, line(a - mix(wi, hi, tc) - 0.18 * w * sin(x * 0.9 + ph), 0.06) * 0.15 * bd);
      c = mix(c, fc, cov(d) * al * 0.5);           // translucent, like the lobule's fibrous bands
      c = mix(c, fibE, line(d, 0.06) * al * 0.18);
    }
  }
  if (!main) return c;
  // Microvilli: fine strokes from the hepatocytes' face, flattened as the space fills with collagen.
  if (uMv * det > 0.02) {
    float pi = floor(x / 0.8), hx = (pi + 0.5) * 0.8 + 0.22 * (h1(int(pi), 61 + side) - 0.5);
    float len = (hi - wi) * 0.5 * uMv * det * (0.55 + 0.45 * h1(int(pi), 63 + side));
    float d = sdTaper(vec2(x, a), vec2(hx, hi + 0.2), vec2(hx + 0.1 * sin(pi), hi - len), 0.075, 0.06);
    c = mix(c, mix(cCell, cUnder, 0.25), cov(d));
  }
  // The basement membrane, as the sinusoid becomes a capillary.
  if (uBm > 0.02) c = mix(c, cBm, line(a - wi - 0.3, 0.3 + 0.2 * uBm) * uBm * aBm * det);
  return c;
}

// \u2500\u2500 A hepatocyte plate: v from its face on Disse (0) to its far side (HEP) \u2500\u2500
// Tidy polygonal cells, as a textbook draws them: each border a straight line with one gentle bend (so neighbours
// fit like tiles), rounded corners, a flat fill a shade lighter inside, a fine membrane, and a round nucleus.
float cellEdge(int j, int sd) { return CELL * float(j) + 7.0 * (h1(j, sd) - 0.5); }
float edgeAt(int j, int sd, float v) {
  float vm = HEP * (0.3 + 0.4 * h1(j, sd + 9)), bend = 4.0 * (h1(j, sd + 10) - 0.5), tilt = 2.6 * (h1(j, sd + 11) - 0.5);
  return cellEdge(j, sd) + bend * (abs(v - vm) / (0.5 * HEP) - 0.5) + tilt * (v / HEP - 0.5);
}
vec3 plate(float x, float v, int sd, float det) {
  int j = int(floor(x / CELL));
  if (x < edgeAt(j, sd, v)) j--; else if (x >= edgeAt(j + 1, sd, v)) j++;
  float x0 = cellEdge(j, sd), x1 = cellEdge(j + 1, sd);
  float inner = smin(smin(x - edgeAt(j, sd, v), edgeAt(j + 1, sd, v) - x, 2.4), smin(v, HEP - v, 2.4), 2.4);
  float d = 0.5 - inner;
  vec3 c = cCell * (0.975 + 0.04 * h1(j, sd + 5));
  c = mix(c, vec3(1.0), (0.05 - 0.03 * uDark) * smoothstep(-1.5, -6.0, d));     // a shade lighter inside
  c = mix(c, cUnder, 0.16 * smoothstep(-1.2, 0.0, d));                          // and deeper at the membrane
  c = mix(c, mix(cUnder, cNuc, 0.3), line(d + 0.2, 0.1) * 0.3 * det);          // the membrane, fine
  bool bi = h1(j, sd + 4) < 0.12;
  float nu = 0.3 + 0.4 * h1(j, sd + 1), nv = 0.4 + 0.2 * h1(j, sd + 2), nr = 2.6 + 0.5 * h1(j, sd + 3);
  for (int k = 0; k < 2; k++) {
    if (k == 1 && !bi) break;
    float uu = bi ? nu + (k == 0 ? -0.15 : 0.15) : nu, vv = nv + (k == 1 ? 0.04 : 0.0), rr = bi ? nr * 0.82 : nr;
    vec2 nq = vec2(x, v) - vec2(mix(x0 + 2.0, x1 - 2.0, uu), mix(2.0, HEP - 2.0, vv));
    // The nucleus: a flat, deeper disc with a fine envelope and a nucleolus.
    float dn = length(nq) - rr;
    c = mix(c, mix(c, cNuc, 0.24), cov(dn));
    c = mix(c, mix(c, cNuc, 0.45), line(dn + 0.08, 0.14) * det);
    c = mix(c, mix(c, cNuc, 0.6), cov(length(nq - vec2(0.3, -0.25) * rr) - 0.16 * rr) * det);
  }
  vec3 outC = mix(cUnder, c, cov(d) * 0.96);
  // Bile canaliculi between neighbouring cells, mid-plate.
  for (int k = 0; k < 2; k++) outC = mix(outC, cBile, cov(sdE(vec2(x - edgeAt(j + k, sd, 0.5 * HEP), v - 0.5 * HEP), vec2(0.5, 0.36))) * 0.75 * det);
  return outC;
}

// \u2500\u2500 The stellate (Ito) cell, in the upper Disse; p = (x, depth from the axis) \u2500\u2500
// Drawn as a textbook figure: one smooth, continuous membrane around a body lying along the sinusoid and its tapered
// processes, which curve down onto the endothelium and run along it; inside, only its nucleus (as NEJM draws it).
// Quiescent it is plump and pale; activated (a myofibroblast) it lengthens and darkens, and its processes grow long,
// with finer branches reaching up between the hepatocytes.
float hscL() { return 4.4 + 2.4 * uAct; }
float hscW() { return 1.4 - 0.2 * uAct; }
float hscWall(float x) { return halfW(x) + ENDO + 0.42; }
float sdHsc(vec2 p) {
  float L = hscL(), Wd = hscW();
  vec2 b = p - vec2(uXs, uHscA);
  float d = sdE(b, vec2(L, Wd));
  for (int i = 0; i < 2; i++) {
    float sg = i == 0 ? -1.0 : 1.0;
    // Down from the body's flank onto the wall, then along it (two B\xE9zier strokes that meet at the same width).
    float xA = uXs + sg * 0.62 * L, xB = uXs + sg * (L + 0.6), xC = uXs + sg * (L + 4.2);
    float len = 5.0 + 11.0 * uAct, xE = xC + sg * len, xD = 0.5 * (xC + xE);
    vec2 A = vec2(xA, uHscA - 0.1 * Wd), B = vec2(xB, hscWall(xB) + 0.15), C = vec2(xC, hscWall(xC)), E = vec2(xE, hscWall(xE));
    float rA = 0.62 + 0.1 * uAct, rC = 0.28 + 0.08 * uAct;
    d = smin(d, sdProc(p, A, B, C, rA, rC), 1.0);
    d = smin(d, sdProc(p, C, vec2(xD, hscWall(xD)), E, rC, 0.06), 0.25);
    // Activated: a finer branch curving up between the hepatocytes (it grows out of the process, never pops in).
    if (uAct > 0.02) {
      float xF = xC + sg * 1.2, wF = hscWall(xF);
      d = smin(d, sdProc(p, vec2(xF, wF), vec2(xF + sg * 2.6, wF + 0.4), vec2(xF + sg * 3.4, wF + disseW(xF) * 0.85), 0.2, 0.05) + 0.8 * (1.0 - uAct), 0.3);
    }
  }
  return d;
}
vec4 hsc(vec2 p) {
  float d = sdHsc(p);
  if (d > 0.3) return vec4(0.0);
  float L = hscL(), Wd = hscW();
  vec3 c = mix(cHscQ, cHscA, uAct);
  c = mix(c, mix(c, vec3(1.0), 0.18 - 0.08 * uDark), smoothstep(-0.2, -1.2, d));   // a shade lighter inside
  // Activated: faint stress fibres along the body.
  if (uAct > 0.05) {
    float fb = 0.0;
    for (int i = -1; i <= 1; i++) fb = max(fb, line(p.y - uHscA - float(i) * 0.38 * Wd - 0.1 * sin((p.x - uXs) * 0.5 + float(i) * 2.0), 0.06));
    c = mix(c, cHscN, fb * 0.28 * uAct * cov(d + 0.35));
  }
  // The nucleus: a smooth oval, a fine envelope and a nucleolus.
  vec2 nc = vec2(uXs, uHscA);
  float dn = sdE(p - nc, vec2(1.15 + 0.9 * uAct, 0.5 + 0.05 * uAct));
  c = mix(c, mix(c, cHscN, 0.7), cov(dn));
  c = mix(c, cHscN, line(dn, 0.06) * 0.5);
  c = mix(c, cHscN * 0.8, cov(length(p - nc - vec2(0.3, 0.0)) - 0.18) * 0.6);
  // One continuous membrane around body and processes alike.
  float mem = line(d, 0.08);
  c = mix(c, cHscN, mem * 0.55);
  // Slightly translucent, as a journal figure's cells: what passes beneath shows faintly through.
  return vec4(c, cov(d - 0.5 * max(0.1, 1.1 * uPx)) * max(0.84, mem));
}

// \u2500\u2500 The Kupffer cell: a macrophage anchored on the lower lining, reaching into the stream \u2500\u2500
// A smooth, rounded body on a foot spread over the endothelium, two short blunt pseudopods, a kidney-shaped nucleus,
// a phagosome holding a red cell it has taken up, a few lysosomes; flat, slightly translucent, a fine membrane line.
float sdKup0(vec2 q) {
  float d = sdE(q - vec2(0.0, -2.5), vec2(2.9, 2.2));                                   // the body, a smooth dome
  d = smin(d, sdE(q - vec2(0.0, -0.4), vec2(3.4, 0.45)), 1.4);                          // its foot, a gentle skirt on the lining
  // A few slender pseudopods, tapering out of the body: two along the lining, two reaching into the stream.
  d = smin(d, sdTaper(q, vec2(-2.4, -0.7), vec2(-6.6, -0.35), 0.62, 0.1), 0.9);
  d = smin(d, sdTaper(q, vec2(2.4, -0.7), vec2(6.4, -0.3), 0.6, 0.1), 0.9);
  d = smin(d, sdTaper(q, vec2(-1.7, -3.9), vec2(-4.1, -6.1), 0.55, 0.1), 0.9);
  d = smin(d, sdTaper(q, vec2(1.8, -4.0), vec2(3.4, -6.3), 0.5, 0.1), 0.9);
  return d;
}
float kupK() { return clamp(uKy / 5.2, 0.6, 1.0); }
vec4 kupffer(vec2 p) {
  float k = kupK();
  vec2 q = (p - vec2(uXk, uKy)) / k;
  float d = sdKup0(q) * k;
  if (d > 0.3) return vec4(0.0);
  // Faded and translucent, as the stellate cell: a pale body, a shade lighter inside, its nucleus low in it (clear of its name).
  vec3 c = mix(cKup, vec3(1.0), 0.18 - 0.08 * uDark);
  c = mix(c, mix(cKup, vec3(1.0), 0.32 - 0.12 * uDark), smoothstep(-0.2, -1.4, d));
  float dn = sdE(q - vec2(0.9, -1.5), vec2(1.25, 0.7)) * k;
  c = mix(c, cKupN, cov(dn) * 0.55);
  c = mix(c, cKupE, line(dn, 0.06) * 0.35);
  float mem = line(d, 0.08);
  c = mix(c, cKupE, mem * 0.5);
  return vec4(c, cov(d - 0.5 * max(0.1, 1.1 * uPx)) * max(0.74, mem * 0.85));
}

void main() {
  vec3 dv = vec3(vP, 1.0);
  float x = dot(uI0, dv), y = dot(uI1, dv), a = abs(y);
  int side = y < 0.0 ? -1 : 1;
  float hw = halfW(x), wi = hw + ENDO, dw = disseW(x), hi = wi + dw;
  float det = detailAt(x), show = revealA(vec2(x, y));
  if (uPass == 1) {
    // The stellate and Kupffer cells, over the particles.
    vec4 cl = vec4(0.0);
    if (side < 0 && abs(x - uXs) < 42.0 && a > hw && a < hi + 4.0) cl = hsc(vec2(x, a));
    if (abs(x - uXk) < 9.0 && y > uKy - 7.0 && y < uKy + 1.0) cl = kupffer(vec2(x, y));
    float al = cl.a * det * show;
    o = vec4(cl.rgb * al, al);
    return;
  }
  vec3 c = cBg;
  if (a < hw) {
    c = lumen(x, y, hw, 0);
    // The arrows at the ends, beside their labels: the blood coming in from the portal venule and going out to the central vein.
    for (int i = 0; i < 2; i++) {
      float s = uEnd.z;
      // Each points toward its vessel, off the view: the portal venule's back upstream, the central vein's on downstream.
      vec2 q = vec2((x - (i == 0 ? uEnd.x : uEnd.y)) * uDir * (i == 0 ? -1.0 : 1.0), y);
      // A thick, laid-down arrow: a short
      // broad shaft and a wide head, softly rounded, in the labels' ink faded into the blood, as a journal figure marks flow.
      float dA = min(sdRB(q - vec2(-0.3 * s, 0.0), vec2(0.28 * s, 0.17 * s), 0.05 * s),
                     sdTri(q, vec2(0.52 * s, 0.0), vec2(0.0, 0.46 * s), vec2(0.0, -0.46 * s)) - 0.03 * s);
      c = mix(c, cEndE, cov(dA - 0.08 * s) * 0.3 * uEnd.w * (i == 0 ? uEndA.x : uEndA.y));
      c = mix(c, cEndF, cov(dA) * 0.5 * uEnd.w * (i == 0 ? uEndA.x : uEndA.y));
    }
  }
  // Under the lining: as the detail comes in, the blood up to the sheet's outer face (what an open pore shows), the lymph beyond.
  else if (a < wi) c = mix(mix(mix(cLumen, vec3(1.0), 0.3), cLymph, (a - hw) / ENDO), mix(cLymph, cLumen, cov(a - (hw + ENDO * 0.5 + endoTh(det)))), det);
  else if (a < hi) c = disse(x, a, wi, hi, side, true, det);
  else {
    float v = a - hi;
    int sd = side < 0 ? ${Xe.plateUp} : ${Xe.plateDn};
    // The plate, then the next sinusoid beyond it (its Disse, lining and lumen), then the next plate.
    const float D = DISSE, E = ENDO, L = LUM0;
    if (v < HEP) c = plate(x, v, sd, det);
    else {
      // (Repeating outward, so the tissue fills any screen, also while the zoom from the lobule still shows it small.)
      float b = mod(v - HEP, 2.0 * D + 2.0 * E + 2.0 * L + HEP);
      if (b < D) c = disse(x, D - b + E, E, D + E, side, false, 0.0);
      else if (b < D + 2.0 * E + 2.0 * L) {
        float yl = b - (D + E + L), al = abs(yl);
        c = al < L ? lumen(x, yl, L, 40) : mix(mix(cLumen, vec3(1.0), 0.3), cLymph, (al - L) / E);
        float dN, dJ, de = sdEndo(x, al, L, side < 0 ? 7 : 9, 0, false, 0.0, dN, dJ);
        c = endoInk(c, de, dN, dJ, 0.0);
      }
      else if (b < 2.0 * D + 2.0 * E + 2.0 * L) c = disse(x, b - (D + 2.0 * E + 2.0 * L) + E, E, D + E, side, false, 0.0);
      else c = plate(x, b - (2.0 * D + 2.0 * E + 2.0 * L), sd + 13, 0.0);
    }
  }
  // The main lining over all that.
  if (a < wi + 0.6 && a > hw - 1.4) {
    float dN, dJ, de = sdEndo(x, a, hw, side < 0 ? ${Xe.poreUp} : ${Xe.poreDn}, side < 0 ? ${Xe.nucUp} : ${Xe.nucDn}, side > 0, det, dN, dJ);
    c = endoInk(c, de, dN, dJ, det);
  }
  // Focus: beyond this sinusoid's own plates the tissue fades to dark (the page in dark mode, a deep shade in light).
  float f0 = uLum + ENDO + disseW(0.0) + HEP * 0.85;
  c = mix(c, cShade, smoothstep(f0, f0 + 18.0, a) * (0.72 + 0.06 * uDark) * uFocus);
  o = vec4(c * show, show);
}`,Cr=`#version 300 es
layout(location=0) in vec4 aP;   // x, y (\xB5m), radius (\xB5m), alpha
layout(location=1) in float aK;  // kind
${wi}
uniform vec3 uF0, uF1;          // local \xB5m \u2192 device px
uniform float uK;               // device px per \xB5m
uniform float uKs;              // device px per \xB5m for the particles' size (capped on a large screen, so they stay specks)
out float vA; out float vK; out float vR;
void main() {
  vec2 d = vec2(dot(uF0, vec3(aP.xy, 1.0)), dot(uF1, vec3(aP.xy, 1.0)));
  vR = max(aP.z * uKs, 1.2); vK = aK;
  vA = aP.w * revealA(aP.xy) * detailAt(aP.x);
  gl_PointSize = 2.0 * vR + 3.0;
  gl_Position = vec4(d.x / size.x * 2.0 - 1.0, 1.0 - d.y / size.y * 2.0, 0.0, 1.0);
}`,Nr=`#version 300 es
precision highp float;
in float vA; in float vK; in float vR;
uniform vec3 cAlb, cAlbE;
out vec4 o;
void main() {
  float r = length((gl_PointCoord * 2.0 - 1.0) * (vR + 1.5)), a;
  vec3 c;
  if (vK > 1.5) { a = (1.0 - smoothstep(0.25 * vR, vR + 1.0, r)) * 0.5; c = mix(vec3(1.0), cAlb, 0.3); }   // a soft glow where it meets the wall
  else {
    a = 1.0 - smoothstep(vR - 0.7, vR + 0.7, r);
    c = mix(cAlb, cAlbE, smoothstep(vR - 1.7, vR - 0.6, r) * 0.6);
  }
  a *= vA;
  o = vec4(c * a, a);
}`,Rr=`#version 300 es
layout(location=0) in vec2 corner;
out vec2 vT;
void main() { vT = corner * 0.5 + 0.5; gl_Position = vec4(corner, 0.0, 1.0); }`,Dr=`#version 300 es
precision mediump float;
uniform sampler2D uOld;
in vec2 vT;
out vec4 o;
void main() { o = texture(uOld, vT); }`;function yi(l,{warm:d=!1,onReady:p=null,host:m=null}={}){let n=null;if(!m||(n=m.gl,!n))return null;let A=m.canvas,g=null,y=()=>m.screen?m.screen():null;function v(){let M=Math.max(1,l.width),S=Math.max(1,l.height);g||(g={tex:n.createTexture(),fbo:n.createFramebuffer(),w:0,h:0}),(g.w!==M||g.h!==S)&&(n.activeTexture(n.TEXTURE0),n.bindTexture(n.TEXTURE_2D,g.tex),n.texImage2D(n.TEXTURE_2D,0,n.RGBA8,M,S,0,n.RGBA,n.UNSIGNED_BYTE,null),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MIN_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MAG_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_S,n.CLAMP_TO_EDGE),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_T,n.CLAMP_TO_EDGE),n.bindFramebuffer(n.FRAMEBUFFER,g.fbo),n.framebufferTexture2D(n.FRAMEBUFFER,n.COLOR_ATTACHMENT0,n.TEXTURE_2D,g.tex,0),g.w=M,g.h=S),n.bindFramebuffer(n.FRAMEBUFFER,g.fbo),n.disable(n.SCISSOR_TEST),n.disable(n.STENCIL_TEST),n.disable(n.DEPTH_TEST),n.disable(n.CULL_FACE)}let R=()=>{n.disable(n.BLEND),n.bindVertexArray(null),n.bindFramebuffer(n.FRAMEBUFFER,y())},B=M=>{try{Rl(n,M)}catch(He){if(!n.isContextLost())return console.error("sinusoid program:",He.message),null}let S=M.p,O={},ce=n.getProgramParameter(S,n.ACTIVE_UNIFORMS);for(let He=0;He<ce;He++){let lt=n.getActiveUniform(S,He).name;O[lt]=n.getUniformLocation(S,lt)}return{p:S,U:O}},ie=null,z=()=>(ie||(ie=[oo(n,Fr,Pr),oo(n,Cr,Nr)]),ie),ue,G,H,re,ve,$=null,J=null,de=null;function Oe(){let[M,S]=z();if(ue=B(M),G=B(S),ie=null,!ue||!G)return!1;H=n.createVertexArray(),n.bindVertexArray(H);let O=n.createBuffer();return n.bindBuffer(n.ARRAY_BUFFER,O),n.bufferData(n.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),n.STATIC_DRAW),n.enableVertexAttribArray(0),n.vertexAttribPointer(0,2,n.FLOAT,!1,0,0),re=n.createVertexArray(),n.bindVertexArray(re),ve=n.createBuffer(),n.bindBuffer(n.ARRAY_BUFFER,ve),n.enableVertexAttribArray(0),n.vertexAttribPointer(0,4,n.FLOAT,!1,20,0),n.enableVertexAttribArray(1),n.vertexAttribPointer(1,1,n.FLOAT,!1,20,16),n.bindVertexArray(null),Dl(n,()=>{n.useProgram(ue.p),n.bindVertexArray(H),n.drawArrays(n.TRIANGLE_STRIP,0,4),n.useProgram(G.p),n.bindVertexArray(re),n.bindBuffer(n.ARRAY_BUFFER,ve),n.bufferData(n.ARRAY_BUFFER,new Float32Array(5),n.DYNAMIC_DRAW),n.drawArrays(n.POINTS,0,1),n.bindVertexArray(null)}),!0}let ye=null,te=!1,X=null,Ee=!1,_e=()=>{if(ye===null&&(ye=Oe(),ye&&te)){te=!1;try{p?.()}catch(M){console.warn("sinusoid redraw:",M)}}return ye},Qe=()=>{ye===null&&!X&&(X=Bl(n,z(),_e))},ot=()=>{if(ye!==null)return ye;if(Ol&&!n.isContextLost()){if(!ie)return Qe(),te=!0,X?.want?.(),!1;if(_l(n,ie))return te=!0,X?.want?.(),!1}return _e()};d?Qe():Nl(()=>{window.requestIdleCallback?requestIdleCallback(Qe,{timeout:8e3}):setTimeout(Qe,3e3)}),!d&&Pl()&&Cl(new Promise(M=>setTimeout(()=>{try{_e()}finally{M()}},0)));let bt=()=>{g=null,ye=!1,ie=null,X?.(),X=null};A.addEventListener("webglcontextlost",bt);let kt=0,Ft=()=>{Ee||(kt++,g=null,Ve.clear(),ye=null,te=!0,Qe())};A.addEventListener("webglcontextrestored",Ft);let Ve=new Map,$e=[0,0];function Ae(M,S){if(typeof M=="number")return M===S;if(S==null||typeof S=="number"||M.length!==S.length)return!1;for(let O=0;O<M.length;O++)if(M[O]!==S[O])return!1;return!0}function Pt(M,S){if(typeof S=="number"){Ve.set(M,S);return}let O=Ve.get(M);(typeof O=="number"||O===void 0||O.length!==S.length)&&(O=new Array(S.length),Ve.set(M,O));for(let ce=0;ce<S.length;ce++)O[ce]=S[ce]}let Ye=(M,S,O)=>{let ce=M[S];ce!=null&&(Ve.has(ce)&&Ae(O,Ve.get(ce))||(Pt(ce,O),S==="uPass"?n.uniform1i(ce,O):typeof O=="number"?n.uniform1f(ce,O):O.length===2?n.uniform2fv(ce,O):O.length===3?n.uniform3fv(ce,O):n.uniform4fv(ce,O)))},Ce=(M,S)=>{if(n.useProgram(ue.p),S===0){$e[0]=l.width,$e[1]=l.height,Ye(ue.U,"size",$e);for(let O in M)Ye(ue.U,O,M[O])}Ye(ue.U,"uPass",S),n.bindVertexArray(H),n.drawArrays(n.TRIANGLE_STRIP,0,4)},qt=()=>{if(de!==null)return de;try{$=B(oo(n,Rr,Dr))}catch{$=null}return de=!!$,$&&(n.useProgram($.p),n.uniform1i($.U.uOld,0)),de},he=()=>{$=null,J=null,de=null};A.addEventListener("webglcontextlost",he);let Te=[],Be=new Set,Le=30,P=(M,S)=>{if(M.fails=(M.fails||0)+1,M.fails===1&&console.warn("sinusoid: what is drawn over it failed.",S),M.fails>=Le){let O=Te.indexOf(M);O>=0&&Te.splice(O,1),console.warn(`sinusoid: what is drawn over it failed. It failed ${Le} pictures in a row and is taken out.`)}},Ie=0,Je=0,st=!1,ft=null,me=null,ut=0,pn=()=>{if(Te.length){for(let M=0;M<Te.length;M++){let S=Te[M];try{S.prep?.(),S.fails=0}catch(O){P(S,O)}Te[M]!==S&&M--}for(let M=0;M<Te.length;M++){let S=Te[M];try{S.draw(),S.fails=0}catch(O){P(S,O)}Te[M]!==S&&M--}n.bindFramebuffer(n.FRAMEBUFFER,null)}},Xt={gl:n,canvas:l,add(M){return Te.push(M),Te.sort((S,O)=>(S.order||0)-(O.order||0)),()=>{let S=Te.indexOf(M);S>=0&&Te.splice(S,1)}},warmIn(M){if(!M)return;let S=()=>{if(!n.isContextLost()){if(M.done&&!M.done()){setTimeout(S,50);return}try{M.run()}catch(O){to("sinusoid-gl:654",O)}}};setTimeout(S,0)},get presents(){return Ie}};function Ct(M,S,O){if(v(),n.viewport(0,0,l.width,l.height),n.clearColor(0,0,0,0),n.clear(n.COLOR_BUFFER_BIT),n.disable(n.BLEND),Ce(M,0),n.enable(n.BLEND),n.blendFunc(n.ONE,n.ONE_MINUS_SRC_ALPHA),O>0){n.useProgram(G.p),$e[0]=l.width,$e[1]=l.height,Ye(G.U,"size",$e);for(let ce in M)Ye(G.U,ce,M[ce]);n.bindVertexArray(re),n.bindBuffer(n.ARRAY_BUFFER,ve),n.bufferData(n.ARRAY_BUFFER,S.subarray(0,O*5),n.STREAM_DRAW),n.drawArrays(n.POINTS,0,O)}Ce(M,1),n.bindVertexArray(null),R(),Ie++}return{top:Xt,present(){n.isContextLost()||m.present?.()},get target(){return g&&g.w>1?g:null},free(){J&&!n.isContextLost()&&n.deleteTexture(J),J=null,g&&!n.isContextLost()&&(n.activeTexture(n.TEXTURE0),n.bindTexture(n.TEXTURE_2D,g.tex),n.texImage2D(n.TEXTURE_2D,0,n.RGBA8,1,1,0,n.RGBA,n.UNSIGNED_BYTE,null),g.w=1,g.h=1)},get gl(){return n},get drawSeq(){return Je},onPicture(M){return Be.add(M),()=>Be.delete(M)},get ok(){return ot()},keep(){return!ye||n.isContextLost()||!l.width||!l.height||!qt()?!1:(gl(n),J||=n.createTexture(),v(),n.activeTexture(n.TEXTURE0),n.bindTexture(n.TEXTURE_2D,J),n.copyTexImage2D(n.TEXTURE_2D,0,n.RGBA,0,0,l.width,l.height,0),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MIN_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MAG_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_S,n.CLAMP_TO_EDGE),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_T,n.CLAMP_TO_EDGE),R(),vl(n))},mix(M){if(!J||!$||n.isContextLost()||!(M>0)){n.isContextLost()||m.present?.();return}v(),n.viewport(0,0,l.width,l.height),n.useProgram($.p),n.bindVertexArray(H),n.activeTexture(n.TEXTURE0),n.bindTexture(n.TEXTURE_2D,J),n.enable(n.BLEND),n.blendColor(0,0,0,Math.min(1,M)),n.blendFunc(n.CONSTANT_ALPHA,n.ONE_MINUS_CONSTANT_ALPHA),n.drawArrays(n.TRIANGLE_STRIP,0,4),n.blendFunc(n.ONE,n.ONE_MINUS_SRC_ALPHA),n.bindVertexArray(null),R(),m.present?.()},dispose(){Ee=!0,ye=!1,ie=null,X?.(),X=null,Te.length=0,Be.clear(),A.removeEventListener("webglcontextlost",bt),A.removeEventListener("webglcontextrestored",Ft),A.removeEventListener("webglcontextlost",he)},drop(){J&&!n.isContextLost()&&n.deleteTexture(J),J=null},get lost(){return ye===!1||n.isContextLost()},get epoch(){return kt},draw(M,S,O){if(ot()){st=!0,ft=M,me=S,ut=O,Ct(M,S,O),Je++;for(let ce of Be)ce();J||m.present?.()}}}}var ze=[0,0,0,0],Pn={s:0,c:0,right:!1},ho=!1,wt={ok:!1,t:0,xp:0,xc:0,xq:0},yt={ok:!1,t:0,xp:0,xc:0,xq:null},co={xp:0,xc:0,xq:null},bi=[0,-.5,.5,-1,1];function fo(l,d,p,m,n){let A=m+(n?40:-40),g=Math.min(d-p,Math.max(l+p,A)),y=Math.abs(g-A)+(n?0:6);(!ho||y<Pn.s)&&(ho=!0,Pn.s=y,Pn.c=g,Pn.right=g>=m)}function Or(l,d,p,m,n){for(let y=1;y<p;y++){let v=ze[2*y],R=ze[2*y+1],B=y-1;for(;B>=0&&ze[2*B]-v>0;)ze[2*B+2]=ze[2*B],ze[2*B+3]=ze[2*B+1],B--;ze[2*B+2]=v,ze[2*B+3]=R}ho=!1;let A=2*m,g=l;for(let y=0;y<p;y++){let v=Math.min(ze[2*y],d);v-g>=A&&(fo(g,v,m,n,!0),fo(g,v,m,n,!1)),g=Math.max(g,ze[2*y+1])}return d-g>=A&&(fo(g,d,m,n,!0),fo(g,d,m,n,!1)),ho?Pn:null}function uo(l,d,p,m,n,A,g,y,v,R,B){let ie=g[0]-l,z=g[1]+l,ue=(g[0]+g[1])/2;wt.ok=!1,yt.ok=!1;for(let G=0;G<p.length;G++){let H=p[G];if(!(H.x<n||H.x>A||d&&!(H.th<.3&&ao(H.th,.15)>.3)||Zo(H.x,m)))for(let re=0;re<bi.length;re++){let ve=bi[re],$=H.x+ve*Math.max(0,y-.5*R),J=$-y,de=$+y;if(J<n||de>A||de>ie&&J<z)continue;let Oe=3*H.th+.02*Math.abs(H.x-(H.x<ue?ie:z))+.05*Math.abs(ve);ze[0]=J-R,ze[1]=de+R,ze[2]=g[0]-R,ze[3]=g[1]+R;let ye=Or(n,A,2,v,B),te=Oe+(ye&&!ye.right?.1:0);ye&&(!wt.ok||te<wt.t)&&(wt.ok=!0,wt.t=te,wt.xp=H.x,wt.xc=$,wt.xq=ye.c),(!yt.ok||Oe<yt.t)&&(yt.ok=!0,yt.t=Oe,yt.xp=H.x,yt.xc=$,yt.xq=null)}}return wt.ok?wt:yt.ok?yt:null}function ki({pores:l,nsd:d,lo:p,hi:m,hs:n,fh:A,dh:g,fp:y,xs:v,far:R=2*y}){let B=uo(Math.max(R,2*y),!0,l,d,p,m,n,A,g,y,v)||uo(2*y,!0,l,d,p,m,n,A,g,y,v)||uo(Math.max(R,2*y),!1,l,d,p,m,n,A,g,y,v)||uo(2*y,!1,l,d,p,m,n,A,g,y,v);return B?(co.xp=B.xp,co.xc=B.xc,co.xq=B.xq,co):null}var Ei={j:0,x0:0,x1:0,nu:0,nv:0,nr:0,bi:!1},Kt=yl("sinusoid-view"),Gt=(l,d,p)=>{let m=ge((p-l)/(d-l),0,1);return m*m*(3-2*m)};function Ai(l){let d=l>>>0;return()=>(d=d*1664525+1013904223>>>0,d/4294967296)}function Ra({host:l,before:d=null,share:p=null}){let m=Il,n=matchMedia("(max-width: 720px)"),A=xt("canvas",{class:"sv-canvas",role:"img","aria-label":"A sinusoid, cut along its length"}),g=xt("div",{class:"lz-labels"}),y={},v=ui(g,{deferred:!0}),R=!1,B=null,ie=[0,0],z=[],ue=e=>e?v.measure(e.key,e.lines||z):ie,G=null,H={fen:"pores: plasma passes to the space of Disse",disse:"perisinusoidal space between the endothelium and the hepatocytes",lymph:"drains filtered fluid and protein",hep:"hepatocytes: uptake and metabolism of plasma solutes",hsc:"stores vitamin A; deposits collagen when activated",kup:"resident macrophage of the sinusoid",sin:"blood from the portal tract and the hepatic artery mixes here",in:"blood arrives from the portal venule",out:"blood leaves to the central vein"},re={fen:"fenestrae",hsc:"stellate",kup:"kupffer",hep:"hepatocyte",sin:"lumen",in:"in",out:"out"},ve=[],$=new Map,J=0,de=null,Oe=()=>{J||(J=un(ye))};function ye(){J=0;for(let t of ve.splice(0)){let o=document.createElement("div");o.setAttribute("class",t.cls),o.setAttribute("data-target",`sinusoid:${re[t.key]||t.key}`),t.el=o,g.append(o)}for(let[t,[o,s]]of $)t.el?.replaceChildren(xt("span",{},o),...s.map(r=>{let[f,h]=r.split("~");return xt("span",{class:"v"},xt("b",{},f),h?` ${h}`:"")}));let e=$.size>0;if($.clear(),de!=null){let t=y.fen?.el?.querySelector(".v b");t&&t.textContent!==de&&(t.textContent=de),de=null}e&&Qe()}let te=(e,t)=>[...e.split(`
`).map(o=>[[o,"name"]]),...t.map(o=>{let[s,r]=o.split("~");return[[s,"fig"],[r?` ${r}`:"","unit"]]})];function X(e,t,o,s){let r=y[e];r||(r=y[e]={key:e,cls:t||`sv-region sv-region-${e}`,el:null,n:0,name:null,value:null,text:null,off:null},ve.push(r),Oe());let f=G===e&&H[e]||"";if(r.name!==o||r.value!==s||(r.ex??"")!==f){let h=r.text&&r.name===o&&r.n===1+(s?s.split(" \xB7 ").length:0);r.name=o,r.value=s,r.text=o+"|"+s,r.ex=f;let k=s?s.split(" \xB7 "):[];if(r.lines=te(o,e==="fen"&&h?[Hn()]:k),f&&(r.lines=[...r.lines,[[f,"unit"]]]),h&&e==="fen")return r;$.set(r,[o,k]),r.n=1+k.length,Oe()}return r}let Ee=0,_e=()=>{Ee||(Ee=un(Qe))};function Qe(){Ee=0;let e=!1;for(let t of Object.values(y)){let o=t.el;if(!o?.isConnected||!o.firstElementChild)continue;let s=o.querySelector(".v"),r=s?.querySelector("b"),f=li(je(o),{name:je(o.firstElementChild),fig:r&&je(r),unit:s&&je(s)}),h=JSON.stringify(f);h!==t.lookSig&&(t.lookSig=h,v.look(t.key,f),e=!0)}if(Ce.isConnected){let t=je(Ce),o=Ce.querySelector("i"),s=o&&je(o),r=Ce.querySelector("span"),f=r&&je(r),h=j=>parseFloat(j)||0,k={size:h(t.fontSize)||12,weight:parseFloat(t.fontWeight)||500,ink:t.color,lh:h(t.lineHeight)||1.3*(h(t.fontSize)||12),px:h(t.paddingLeft),py:h(t.paddingTop),bg:t.backgroundColor,gap:h(f?.columnGap)||5,dot:s?{d:h(s.width)||8,fill:s.backgroundColor,ring:ii(s.boxShadow)}:null,sh:Vo(t.boxShadow)},w=JSON.stringify(k);w!==ot.sig&&(Object.assign(ot,k,{sig:w}),e=!0,v.look("legend",{lh:k.lh/k.size,gap:0,halo:0,haloC:"",runs:{name:{size:k.size,weight:k.weight,ls:0,fill:Ke(k.ink),op:1,upper:!1,mr:0}}}))}e&&(R=!0,B?.())}let ot={sig:""},bt=null,kt=0,Ft="";function Ve(e){return(e.weight!==bt||e.size!==kt)&&(bt=e.weight,kt=e.size,Ft=`${e.weight} ${e.size}px Inter`),Ft}let $e={along:!1,side:0,slide:!1};function Ae(e,t,o,s,r,f=$e){let h=f.along,k=f.side,w=X(e,null,t,o),j=w.at||(w.at=[0,0]);j[0]=s,j[1]=r;let E=ue(w),T=E[0],_=E[1],oe=h&&!N.vert?N.ang:0,se=h?_:Math.abs(T*Math.sin(N.ang))+Math.abs(_*Math.cos(N.ang)),D=r+k*(se/2)/c.k,ee=On(s,D),U=ee[0],K=ee[1],Y=U;if(h||(U=ge(U,T/2+4,N.W-T/2-4)),!N.vert){for(let fe of Gn)fe&&K+_/2>fe.y0-4&&K-_/2<fe.y1+4&&(U=fe.u?Math.min(U,fe.x0-14-T/2):Math.max(U,fe.x1+14+T/2));U=ge(U,Math.min(c.fe.l+T/2+4,N.W/2),Math.max(c.fe.r-T/2-4,N.W/2))}{let fe=Math.abs(Math.cos(oe)),Pe=Math.abs(Math.sin(oe)),ae=(T*fe+_*Pe)/2,qe=(T*Pe+_*fe)/2,Re=w.box||(w.box={l:0,r:0,t:0,b:0});Re.l=U-ae,Re.r=U+ae,Re.t=K-qe,Re.b=K+qe}w.cx=U,w.cy=K,w.end=!1;let C=Pt[Ye=Ye+1&15];return C.cx=U,C.cy=K,C.w=T,C.hh=_,C.x=s+(N.vert?0:(U-Y)/c.k),C.half=(h?T:Math.abs(T*Math.cos(N.ang))+Math.abs(_*Math.sin(N.ang)))/2/c.k,C}let Pt=[];for(let e=0;e<16;e++)Pt.push({cx:0,cy:0,w:0,hh:0,x:0,half:0});let Ye=0,Ce=xt("div",{class:"sv-legend","aria-hidden":"true"},xt("span",{},xt("i",{class:"alb"}),"Protein"));{let e=document.querySelector(".app")||document.getElementById("app");e&&typeof MutationObserver=="function"&&new MutationObserver(()=>_e()).observe(e,{attributes:!0,attributeFilter:["data-lit","class"]})}let qt=e=>{let t=tn.get(e);return t==null&&(tn.set(e,null),nn=!0,t=""),t},he={},Te={x0:0,y0:0,x1:0,y1:0};function Be(e,t,o,s){let r=he[e]||={key:e},f=On(o,s),h=f[0],k=f[1],w=Math.abs(h-t.cx)<t.w/2-2&&Math.abs(k-t.cy)>t.hh/2+6,j=w?h:t.cx+Math.sign(h-t.cx)*(t.w/2+3),E=w?t.cy+Math.sign(k-t.cy)*(t.hh/2+3):ge(k,t.cy-t.hh/2+4,t.cy+t.hh/2-4),T=Te;T.x0=t.cx-t.w/2,T.x1=t.cx+t.w/2,T.y0=t.cy-t.hh/2,T.y1=t.cy+t.hh/2;let _=Yl(!1,Jl(T,h,k),r.show)&&(w||Math.sign(h-t.cx)===Math.sign(h-j));r.x1=j,r.y1=E,r.x2=h,r.y2=k,r.show=_?1:0,r.follow=!1,r.sg=Math.sign(h-t.cx),r.w=t.w}let Le=xt("div",{class:"sv","aria-hidden":"true"},A,g,Ce);v.onPresented=()=>Le.classList.add("cap-gl-on"),v.onLost=()=>Le.classList.remove("cap-gl-on"),l.insertBefore(Le,d);let P=null,Ie=null,Je=!1;function st(){if(P||ft)return;let e=p?.top?.()||null;if(p&&!e)return;ft=!0,P=yi(A,{warm:!0,onReady:()=>{_t="",pt()},host:e}),P&&e&&(me=e,ut=e.add({order:p.order,solo:!0,on:()=>u>0&&!!P&&!P.lost,opaque:Xt,draw:O})),P&&e?v.attach({top:e,order:p.capOrder??p.order+1,near:Le,active:()=>me===e&&!!P&&!P.lost,scale:()=>Yt?e.canvas.width/Yt[0]:0}):v.attach(null),ei(!!P);let t=P?P.gl:null;Je=!!(t&&Kl(t)),Ie=Je?Gl(!0,t):null}let ft=!1,me=null,ut=null;function pn(){ut?.(),ut=null,me=null,v.detach();try{P?.dispose?.()}catch(e){to("sinusoid-view:rehost",e)}P=null,ft=!1,Ie=null,Je=!1,le=null,_t="",Vn="",Ct=0,M=0,S=!1,(u>0||a)&&(st(),pt())}function Xt(){if(!me||!P||P.lost||!x||!(u>=1)||I||le||b||ce!==1||He||lt)return!1;let e=P.target;return!!e&&e.w>0&&e.h>0&&e.w===Ct&&e.h===M&&S}let Ct=0,M=0,S=!1;function O(){if(!me||!(u>0)||!P||P.lost)return;let e=P.target;if(e)if(ce!==1||He||lt){let t=Cn||(me.canvas.width||1)/(Yt&&Yt[0]||me.canvas.clientWidth||me.canvas.width||1);me.lay(e.tex,ce,0,0,ce,He*t,lt*t,Math.min(1,u))}else me.lay(e.tex,1,0,0,1,0,0,Math.min(1,u))}let ce=1,He=0,lt=0,Cn=0,be=1;Xl("sinusoid",()=>x?P&&!P.lost?{on:Je?"fallback":"gpu",via:Je?"WebGL2 on the CPU":"WebGL2",why:Je?"software renderer":""}:{on:"fallback",via:"nothing drawn",why:P?"context lost (drawn again when it is given back)":"no WebGL2"}:null),Le.addEventListener("wheel",e=>e.preventDefault(),{passive:!1}),g.addEventListener("animationend",e=>{if(e.animationName==="sv-fade-in")for(let t of e.target.getAnimations())t.animationName==="sv-fade-in"&&t.cancel()});let i=1,a=null,u=0,x=!1,q=0,ne=0,I=null,b=!1,L=no(),W=null,V=()=>L;El(()=>{let e=no();if(!(u>0)){L=e,W=null;return}W=e===L?null:e,W!=null&&pt()});let le=null;function Q(){let e=W;W=null,e!==L&&(_t="",Yn(0,!1),P.keep?.()?le={t0:performance.now()}:Se(),L=e)}function Me(){let e=(performance.now()-le.t0)/Hl;if(e>=1||I){Se();return}P.mix(Wl(e))}function Se(){le&&(le=null,P.drop?.())}let F={},N=null,Fe=0,Ne=-1,Vt=-1,mn=!1,Nn=!1,xn=!1,Mi=document.getElementById("app")?.style,We=e=>parseFloat(Mi?.getPropertyValue(e))||0,es=12;function Rn(){let e=document.getElementById("app");e&&(es=parseFloat(getComputedStyle(e).getPropertyValue("--gap"))||12)}let Yt=null,po=()=>{let e=l.getBoundingClientRect();Yt=[Math.max(1,Math.round(e.width)),Math.max(1,Math.round(e.height))]};po(),Rn();let ts=()=>Yt;typeof ResizeObserver=="function"&&new ResizeObserver(()=>{po(),Rn(),u>0&&!q&&a&&(q=Kt(Ht))}).observe(l),addEventListener("resize",()=>{po(),Rn(),_e()});let Dn=!0,mo=!1,ns=()=>{Dn=!0,mo=!0,Lo(),_e()};if(Ko.addEventListener?.("change",ns),typeof MutationObserver=="function"){let e=new MutationObserver(t=>{t.some(o=>o.attributeName!=="style")&&ns()});for(let t of[document.documentElement,document.body,document.getElementById("app"),l])t&&e.observe(t,{attributes:!0})}function Ti(e,t){let o=We("--top-safe")+We("--cmp-h")+We("--pz-t")+8+(We("--pz-t")?0:40),s=document.getElementById("app"),f=!s||s.classList.contains("presenting")?0:(We("--bot-occ")||es+8+42)+8,h=t-We("--pz-b")-Math.max(34,f),k=12+We("--pz-l"),w=e-12-We("--pz-r");return gn.l=Math.round(k),gn.t=Math.round(o),gn.r=Math.round(Math.max(k+80,w)),gn.b=Math.round(Math.max(o+80,h)),gn}let gn={l:0,t:0,r:0,b:0},Ut=[0,0,0],vn=[0,0];function os(e,t){let o=!!document.getElementById("app")?.classList.contains("presenting");if(e!==Ne||t!==Vt||o!==mn){Ne=e,Vt=t,mn=o,Fe++;let w=e<t*.95,j=w,E=w?Math.PI/2:0,T=Math.hypot(e,t)/6+30,_=[Xe.poreUp,Xe.poreDn].map(se=>{let D=[];for(let ee=Math.floor(-T/hn)-1;ee*hn<T+hn;ee++){let U=xi(ee,se);U&&D.push(U)}return D}),oe=jt(0,Xe.plateUp);for(let se=-3;se<=2;se++){let D=jt(se,Xe.plateUp);Math.abs(D+10)<Math.abs(oe+10)&&(oe=D)}N={W:e,H:t,ang:E,vert:w,tall:j,x0:-T,x1:T,xs:oe,xk:w?12:22,pores:_}}let s=Ti(e,t),r=s.r-s.l,f=s.b-s.t,h=N.vert?r:f,k=St(40,54,Gt(380,720,h));return c.f=s,c.tk=ge(h/k,3,14),Ut[0]=We("--top-safe")+We("--cmp-h")+We("--pz-t"),Ut[1]=We("--top-safe")+We("--pz-t")+2,Ut[2]=t-We("--pz-b")-2,c.insT=Ut,vn[0]=(s.l+s.r)/2,vn[1]=(s.t+s.b)/2,c.tC=vn,(!c.k||!c.fe)&&(c.k=c.tk,c.C=[vn[0],vn[1]],c.fe={l:s.l,t:s.t,r:s.r,b:s.b},c.ins=[Ut[0],Ut[1],Ut[2]],c.vel=null),N}let xo=()=>(parseFloat(document.documentElement.style.getPropertyValue("--label-k"))||1)*.9,ss=()=>{let e=String(xo());Le.style.getPropertyValue("--label-k")!==e&&Le.style.setProperty("--label-k",e)};ss(),addEventListener("pps:labelscale",()=>{ss(),_e()});let c={k:0,C:[0,0],tk:0,tC:[0,0],f:null,fe:null,insT:null,ins:null,vel:null,vis:[0,0],fr:[0,0]},Jt={C:[0,0],k:1,ang:0,ca:1,sa:0},Ze=new Float64Array(4);function Qt(e,t,o,s,r,f,h){return((e-o)*r+(t-s)*f)/h}let wn=10,Et=new Float64Array(wn),At=new Float64Array(wn),ls=new Float64Array(wn),Li=()=>{Et[0]=c.tk,Et[1]=c.tC[0],Et[2]=c.tC[1],Et[3]=c.f.l,Et[4]=c.f.t,Et[5]=c.f.r,Et[6]=c.f.b;for(let e=0;e<3;e++)Et[7+e]=c.insT[e];return Et},Si=()=>{At[0]=c.k,At[1]=c.C[0],At[2]=c.C[1],At[3]=c.fe.l,At[4]=c.fe.t,At[5]=c.fe.r,At[6]=c.fe.b;for(let e=0;e<3;e++)At[7+e]=c.ins[e];return At},go=e=>{c.k=e[0],c.C[0]=e[1],c.C[1]=e[2],c.fe.l=e[3],c.fe.t=e[4],c.fe.r=e[5],c.fe.b=e[6];for(let t=0;t<c.ins.length;t++)c.ins[t]=e[7+t]},is=(e,t)=>{let o=0;for(let s=0;s<wn;s++)o+=Math.abs(e[s]-t[s])*(s===0?40:1);return o},rs=e=>{for(let t=0;t<wn;t++)if(Math.abs(e[t])*(t===0?40:1)>=.5)return!1;return!0},vo=10;function Fi(e){let t=Li(),o=Si();c.vel||(c.vel=ls,ls.fill(0));let s=c.vel,r=is(o,t),f=rs(s),h=!1;if(I||r<.05&&f)go(t),s.fill(0);else{h=!0;let C=Math.min(Math.max(e,0),40/1e3),fe=Math.exp(-vo*C);for(let ae=0;ae<o.length;ae++){let qe=o[ae]-t[ae],Re=s[ae]+vo*qe;o[ae]=t[ae]+(qe+Re*C)*fe,s[ae]=(s[ae]-vo*Re*C)*fe}is(o,t)<.05&&rs(s)?(go(t),s.fill(0)):go(o)}let k=Jt.C,w=c.k,j=N.ang;if(k[0]=c.C[0],k[1]=c.C[1],I){let{g:C,p:fe,q:Pe,rot:ae,Z:qe}=I,Re=qe**C,hl=Math.cos(ae*C),pl=Math.sin(ae*C),ml=fe[0]-Pe[0],xl=fe[1]-Pe[1];k[0]=Pe[0]+Re*(ml*hl-xl*pl),k[1]=Pe[1]+Re*(ml*pl+xl*hl),w=I.k*Re/qe,j=I.ang+ae*(C-1)}Jt.k=w,Jt.ang=j,Jt.ca=Math.cos(j),Jt.sa=Math.sin(j);let E=N,T=Math.cos(E.ang),_=Math.sin(E.ang),oe=c.C[0],se=c.C[1],D=c.k;Ze[0]=Qt(0,0,oe,se,T,_,D),Ze[1]=Qt(E.W,0,oe,se,T,_,D),Ze[2]=Qt(0,E.H,oe,se,T,_,D),Ze[3]=Qt(E.W,E.H,oe,se,T,_,D);let ee=Math.min(Ze[0],Ze[1],Ze[2],Ze[3]),U=Math.max(Ze[0],Ze[1],Ze[2],Ze[3]);c.vis[0]=Math.max(E.x0,ee-8),c.vis[1]=Math.min(E.x1,U+8);let K=Qt(c.fe.l,c.fe.t,oe,se,T,_,D),Y=Qt(c.fe.r,c.fe.b,oe,se,T,_,D);return c.fr[0]=Math.min(K,Y),c.fr[1]=Math.max(K,Y),h}let wo=[0,0],On=(e,t)=>{let o=Math.cos(N.ang),s=Math.sin(N.ang);return wo[0]=c.C[0]+c.k*(e*o-t*s),wo[1]=c.C[1]+c.k*(e*s+t*o),wo},et=e=>Ue.lum*F.lum*(1-F.pinch*Math.exp(-(((e-N.xs)/11)**2)))+.15*Math.sin(e*.11+1.3),yn=e=>Ue.disse*(1+.25*F.col)+.2*Math.sin(e*.07),Zt=e=>et(e)+Ue.endo,Nt=e=>Zt(e)+yn(e);function as(e){if(!a)return!1;let t=hi(a),o=!1,s=e>0?1-Math.exp(-e/.32):1;for(let r in t){if(F[r]==null){F[r]=t[r];continue}let f=t[r]-F[r];Math.abs(f)>1e-4?(F[r]+=f*s,o=!0):F[r]=t[r]}return o}let _n=new Map;function we(e){let t=_n.get(e);return t||(t=$l(e||"black").slice(0,3),_n.size>256&&_n.clear(),_n.set(e,t),t)}function Rt(e,t,o,s){for(let r=0;r<3;r++)e[r]=St(t[r],o[r],s);return e}function en(e,t){return e[0]=t[0],e[1]=t[1],e[2]=t[2],e}let tn=new Map,nn=!1;function Pi(){let e=getComputedStyle(l);for(let t of tn.keys())tn.set(t,e.getPropertyValue(t).trim());Dn=!1,yo++}let yo=0,dt=()=>[0,0,0],Ci={cBg:dt(),cShade:dt(),cLumen:dt(),cLymph:dt(),cCell:dt(),cUnder:dt(),cNuc:null,cCol:null,cBm:null,aBm:0,cBile:null,cEndo:null,cEndoS:null,cEndoE:null,cEndoN:null,cHscQ:null,cHscA:null,cHscN:null,cKup:null,cKupN:null,cKupE:null,cRbc:null,cEndF:null,cEndE:null,cAlb:null,cAlbE:null,uShim:0,uStreak:0,uDark:0,uI0:dt(),uI1:dt(),uF0:dt(),uF1:dt(),uEnd:[0,0,0,0],uRev:[0,0,0,0],uDet:[0,0],uEndA:null},Mt={lo:null,mid:null,hi:null,bg:null},cs=null,bo=-1;function xe(e,t){let o=tn.get(e);return o==null&&(tn.set(e,null),nn=!0,o=""),o||t}function Ni(e){let t=a,o=Ci;if(cs!==e||bo!==yo){cs=e,bo=yo;let r=we(xe("--stage-bg",xe("--bg")));Mt.bg=r,Mt.lo=we(xe("--sv-gl-lymph-lo")),Mt.mid=we(xe("--sv-gl-lymph-mid")),Mt.hi=we(xe("--sv-gl-lymph-hi"));let f=we(xe("--og-liver-2")),h=en(Ri,we(xe("--og-liver-1")));e&&Rt(h,f,h,.5);let k=Rt(Di,r,f,e?.55:.5);en(o.cBg,r),e?en(o.cShade,r):Rt(o.cShade,r,we(xe("--sv-gl-shade")),.9),Rt(o.cCell,k,h,e?.85:.94),e?en(o.cUnder,k):Rt(o.cUnder,r,f,.8),o.cNuc=we(xe("--sv-gl-nucleus")),o.cCol=we(xe("--collagen")),o.cBm=we(xe("--sv-gl-basement")),o.aBm=e?.6:.8,o.cBile=we(xe("--sv-gl-bile")),o.cEndo=we(xe("--sv-gl-endothelium")),o.cEndoS=we(xe("--sv-gl-endo-sheet")),o.cEndoE=we(xe("--sv-gl-endo-edge")),o.cEndoN=we(xe("--sv-gl-endo-nucleus")),o.cHscQ=we(xe("--sv-gl-hsc-quiet")),o.cHscA=we(xe("--sv-gl-hsc-active")),o.cHscN=we(xe("--sv-gl-hsc-nucleus")),o.cKup=we(xe("--sv-gl-kupffer")),o.cKupN=we(xe("--sv-gl-kupffer-nucleus")),o.cKupE=we(xe("--sv-gl-kupffer-edge")),o.cRbc=we(xe("--sv-gl-rbc")),o.cEndF=we(xe("--text")),o.cEndE=we(xe("--label-halo")),o.cAlb=we(xe("--sv-gl-albumin")),o.cAlbE=we(xe("--sv-gl-albumin-edge")),o.uShim=e?.3:.5,o.uStreak=e?.3:.85,o.uDark=e?1:0,nn&&(bo=-1)}en(o.cLumen,we(t.hide?xe("--sv-lumen-hidden"):Vl(t.P2)));let s=F.prot??1;return s<.45?Rt(Bn,Mt.lo,Mt.mid,s/.45):Rt(Bn,Mt.mid,Mt.hi,(s-.45)/.55),e?Rt(o.cLymph,Mt.bg,Bn,.34):en(o.cLymph,Bn),o}let Bn=[0,0,0],Ri=[0,0,0],Di=[0,0,0],qn=0,fs=0,Un=0,bn=0,zn=[],Tt=[],zt=Ai(17);{let e=Ai(23);for(let t=0;t<150;t++)zn.push({u:e(),y:e()*1.9-.95,ph:e()*Math.PI*2})}let Oi=e=>e.w*ao(e.th,F.por),_i=[];function Bi(e,t){let o=N.pores[e<0?0:1],s=0,r=_i;for(let h=0;h<o.length;h++){let k=o[h],w=k.x>c.vis[0]&&k.x<c.vis[1]?Oi(k):0,j=t?w>.22?w*w:0:w>.02?w+.06:0;r[h]=j,s+=j}if(s<=0)return null;let f=zt()*s;for(let h=0;h<o.length;h++)if(f-=r[h],f<=0&&r[h]>0)return o[h];return null}function us(e){let t=c.vis[1]-c.vis[0],o=F.v*24,s=-(1.5+4.5*Math.min(F.filt,4));qn+=o*e,fs+=s*e;let r=.07*t*Math.sqrt(F.filt),f=.5*ge((a.lyProt-.3)/.62,0,1)**2;for(Un+=r*e;Un>=1;){if(Un-=1,Tt.length>900||zt()>=f)continue;let k=zt()<.5?-1:1,w=Bi(k,!0);if(!w){bn+=1;continue}hs("a",k,w.x,.15+.7*zt(),zt()*Math.PI*2)}for(bn+=.1*t*(1-F.por)*e;bn>=1;)bn-=1,!(Tt.length>900)&&hs("b",zt()<.5?-1:1,St(c.vis[0]+4,c.vis[1]-4,zt()),0,0);let h=0;for(let k=0;k<Tt.length;k++){let w=Tt[k];w.t+=e;let j;w.kind==="b"?(w.x+=o*.6*e,j=w.t>$n):(w.t<.5?w.x+=o*.25*e:w.x+=s*(.85+.3*Math.sin(w.ph))*e,j=w.x<c.vis[0]-4||w.x>c.vis[1]+4),j?ds.push(w):Tt[h++]=w}Tt.length=h}let ds=[];function hs(e,t,o,s,r){let f=ds.pop()||{kind:"a",side:1,x:0,t:0,y:0,ph:0};f.kind=e,f.side=t,f.x=o,f.t=0,f.y=s,f.ph=r,Tt.push(f)}let on=new Float32Array(1400*5),$n=1.6,sn=-1,ps=0,kn=0;function In(e,t,o,s,r){if(kn>=1400||s<=.01)return;let f=kn*5;on[f]=e,on[f+1]=t,on[f+2]=o,on[f+3]=s,on[f+4]=r,kn++}function qi(){kn=0;let[e,t]=c.vis,o=t-e+8,s=zn.length*ge(o/300,.15,1);sn=sn<0?s:sn+(s-sn)*Math.min(1,ps/.8);let r=Math.min(zn.length,Math.ceil(sn));for(let f=0;f<r;f++){let h=zn[f],k=1.5*(1-h.y*h.y)+.08,w=e-4+((h.u*o+qn*k)%o+o)%o,j=ge(h.y+.05*Math.sin(qn*.05+h.ph),-.96,.96)*(et(w)-.5);In(w,j,.36,ge(sn-f,0,1),0)}for(let f of Tt){if(f.kind==="b"){let E=Math.sin(Math.PI*ge(f.t/$n,0,1)),T=f.side*St(et(f.x)-2.6,et(f.x)-.45,E),_=Gt(0,.45,f.t)*Gt($n,$n-.45,f.t);E>.8&&In(f.x,T,1.1,(E-.8)*5*_,2),In(f.x,T,.38,_,0);continue}let h=ge(f.t/.5,0,1),k=h*h*(3-2*h),w=f.side*St(et(f.x)-1.6,St(Zt(f.x),Nt(f.x),f.y),k)+f.side*.15*Math.sin(f.t*2+f.ph),j=Gt(-.15,.45,f.t)*ge((f.x-e)/6,0,1);In(f.x,w,.38,j,0)}return kn}let ms=-1,xs="",gs="",vs=()=>{let e=Math.round(F.por*100);return e!==ms&&(ms=e,xs=`${e}%`,gs=`${e}%~open`),xs},Hn=()=>(vs(),gs);function Ui(){let e=y.fen;if(!e)return;let t=vs();t!==ws&&(ws=t,de=t,Oe(),e.lines=te(e.text.split("|")[0],[Hn()]),e.cx!=null&&v.hasLook("fen")&&(v.measure("fen",e.lines),v.paint()))}let ws="",ko=e=>vi(N.pores[0],e,c.fr[0]+3,c.fr[1]-3,Xe.nucUp),ys=new Float64Array(8).fill(NaN),bs=new Float64Array(8).fill(NaN),Wn=[];function ks(e,t,o,s){return a.hide?"?":((ys[e]!==t||bs[e]!==o||Wn[e*2+1]!==s)&&(ys[e]=t,bs[e]=o,Wn[e*2+1]=s,Wn[e*2]=`${dn(t,o)}~${s}`),Wn[e*2])}let Es=new Float64Array(4).fill(NaN),As=new Float64Array(4).fill(NaN),Ms=[];function Ts(e,t){let o=a;return o.hide?"?":((Es[e]!==o.lymph||As[e]!==o.lyProt)&&(Es[e]=o.lymph,As[e]=o.lyProt,Ms[e]=`${dn(o.lymph,1)}~mL/min${t?" ":"\xA0"}\xB7 Protein ${Math.round(o.lyProt*100)}%`),Ms[e])}let Ls=new Float64Array(2).fill(NaN),Ss=[];function zi(e,t){return a.hide?"?":(Ls[e]!==t&&(Ls[e]=t,Ss[e]=dn(t,1)),Ss[e])}let $i={along:!0,side:0,slide:!1},Ii={along:!1,side:-1,slide:!0},Hi={along:!0,side:0,slide:!0},Wi={along:!1,side:1,slide:!1},ji={along:!0,side:-1,slide:!1},Ki=[{along:!1,side:-1,slide:!1},{along:!0,side:-1,slide:!1}],ln=e=>St(c.fr[0]+8,c.fr[1]-8,e),Fs=(e,t,o)=>Math.abs(e-t)<o?t+(e<t?-o:o):e,jn=(e,t)=>Ae("fen","Fenestrae",Hn(),e+t,-(Nt(e)+1),Ii),Kn=e=>Ae("disse","Space of Disse","",e,(N.vert?1:-1)*(Zt(e)+yn(e)*.5),Hi),Ps=e=>Ae("lymph","Lymph",Ts(0,!1),e,Nt(e)+1.2,Wi),Cs=e=>Ae("hep","Hepatocyte","",e,Nt(e)+Ue.hep*(Ei.nv<.5?.78:.22),$e),tt={pores:null,nsd:0,lo:0,hi:0,hs:[0,0],fh:0,dh:0,fp:0,xs:0,far:0};function Gi(){let e=N,t=a,o=e.vert;if(e.tall){Xi();return}for(let C in he)C!=="lymph"&&C!=="fen"&&(he[C].show=0);let s=Fs(ln(.5),e.xk,30);Ae("sin","Sinusoid",ks(0,t.P2,1,""),s,0,$i),Yi();let r=Ae("hsc",F.act>.5?"Activated stellate cell":"Stellate cell","",e.xs,-(Nt(e.xs)+1),Ki[o?1:0]),f=16/c.k,h=c.tk,k=r.w/2/h,w=r.x,j=r.half;tt.pores=e.pores[0],tt.nsd=Xe.nucUp,tt.lo=(c.f.l-c.tC[0]+6)/h,tt.hi=(c.f.r-c.tC[0]-6)/h,tt.hs[0]=e.xs-k,tt.hs[1]=e.xs+k,tt.fh=jn(0,0).w/2/h,tt.dh=Kn(0).w/2/h,tt.fp=16/h,tt.xs=e.xs,tt.far=120/h;let E=ki(tt),T,_,oe=E?E.xq:null;if(E?(T=E.xp,_=jn(T,E.xc-T)):(T=ko(ln(.6)),_=jn(T,0),Math.abs(_.x-w)-_.half-j<f*2&&(T=ko(w+j+_.half+f*2),_=jn(T,0))),Be("fen",_,T,-(et(T)+Ue.endo*.5)),oe!=null)Kn(oe);else{oe=o?ln(.24):Fs(ln(.86),e.xs,40);let C=Kn(oe);!o&&oe-C.half<_.x+_.half+f&&oe+C.half>T-f&&(oe=_.x+_.half+C.half+f,oe+C.half>c.fr[1]&&(oe=T-f-C.half),Kn(oe))}let se=ln(o?.55:.2),D=Ps(se),ee=ln(o?.88:.6),U=gi(ee,Xe.plateDn,Ei),K=16/c.k,Y=Cs((U.x0+U.x1)/2);if(Math.abs(Y.x-D.x)-Y.half-D.half<K){let C=Y.x<D.x?-1:1;Y=Cs(ge(D.x+C*(D.half+Y.half+K),U.x0+Y.half,U.x1-Y.half)),Math.abs(Y.x-D.x)-Y.half-D.half<K&&(D=Ps(Y.x-C*(Y.half+D.half+K)))}Be("lymph",D,D.x,Zt(D.x)+yn(D.x)*.5)}let Ns=0,Rs=0,Dt=e=>St(Ns,Rs,e),rn=e=>Nt(e)+Math.min(Ue.hep*.5,(N.W/2/c.k-Nt(e))*.5),Eo=e=>Zt(e)+yn(e)*.5;function Xi(){let e=N,t=a,o=c.k;Ns=Math.max(c.fr[0],(En[0]-c.C[1])/o),Rs=Math.min(c.fr[1],(En[1]-c.C[1])/o),Ae("sin","Sinusoid",ks(1,t.P2,1,""),Dt(.42),0);let s=Dt(.08),r=ko(s);Be("fen",Ae("fen","Fenestrae",Hn(),s,-rn(s)),r,-(et(r)+Ue.endo*.5)),s=ge(e.xs,Dt(.3),Dt(.62)),Be("hsc",Ae("hsc",F.act>.5?`Activated
stellate cell`:`Stellate
cell`,"",s,-rn(s)),e.xs,-(Eo(e.xs)+.6)),Ae("hep","Hepatocyte","",Dt(.92),-rn(Dt(.92))),s=Dt(.08),Be("disse",Ae("disse",`Space of
Disse`,"",s,rn(s)),s,Eo(s)),s=Dt(.46),Be("lymph",Ae("lymph","Lymph",Ts(1,!0),s,rn(s)),s+2,Eo(s+2));{let f=N.xk,h=et(f)-2.5*ge(et(f)/5.2,.6,1);Ae("kup",`Kupffer
cell`,"",f,rn(f));let k=y.kup.cell||(y.kup.cell=[0,0]);k[0]=f,k[1]=h}}let Vi=()=>et(N.xk)-6.6*ge(et(N.xk)/5.2,.6,1),Yi=()=>{let e=Ae("kup","Kupffer cell","",N.xk,Vi()-.8,ji);return y.kup.cell=null,e},En=[0,0],Ds=e=>{let t=y[e]?.el;return document.getElementById("app")?.classList.contains("presenting")?!t||t.hidden||!t.firstElementChild?0:(Ao[e]??0)*(v.on?v.at(e,at())?.a??0:1):1},Ao={};function Ji(){let e=!1;for(let t of["in","out"]){let o=y[t]?.el,s=!o||o.hidden||!o.firstElementChild?0:Math.min(1,(v.on?1:+getComputedStyle(o).opacity||0)*(+getComputedStyle(o.firstElementChild).opacity||0)*(+getComputedStyle(g).opacity||0));Math.abs((Ao[t]??-1)-s)>.004&&(Ao[t]=s,e=!0)}return e}let An=[0,0,1],Gn=[null,null],pe={x:0,y:0,w:0,h:0},Os=-1e9,Mo="",_s=[];function Qi(){Os=performance.now();let e=l.getBoundingClientRect(),t=[],o="";for(let s of document.querySelectorAll(".stage-blocker:not([hidden])")){let r=s.getBoundingClientRect();r.width&&(o+=`${r.left|0},${r.top|0},${r.right|0},${r.bottom|0};`),r.width&&r.height&&getComputedStyle(s).visibility!=="hidden"&&t.push({l:r.left-e.left,r:r.right-e.left,t:r.top-e.top,b:r.bottom-e.top})}return _s=t,o===Mo?!1:(Mo=o,!0)}let Zi=()=>_s,Bs=()=>Mo,To=0;function er(){if(To=0,mo&&(mo=!1,Rn()),u<=0)return;let e=!1;(Dn||nn)&&(Pi(),nn=!1,e=!0,R=!0),document.getElementById("app")?.classList.contains("presenting")&&Ji()&&(e=!0),performance.now()-Os>=250&&Qi()&&(e=!0),e&&(_t="",pt())}function Lo(){To||(To=un(er))}let De=new Float64Array(256),an=0,Z=new Float64Array(4),ht=new Float64Array(2),cn=new Float64Array(3),Ot=new Float64Array(4),Mn=0,$t=0,So=0,Fo=0,Po=0;function Co(e,t,o,s){if(an*4+4>De.length){let f=new Float64Array(De.length*2);f.set(De),De=f}let r=an++*4;De[r]=e,De[r+1]=t,De[r+2]=o,De[r+3]=s}function No(e,t,o,s,r,f,h){Z[0]=e+r-o/2*h,Z[1]=e+r+o/2*h,Z[2]=t+f-s/2*h,Z[3]=t+f+s/2*h}function qs(){if(!(Z[0]>=2&&Z[1]<=So-2&&Z[2]>=Fo&&Z[3]<=Po))return!1;for(let e=0;e<an;e++){let t=e*4;if(Z[0]<De[t+1]+Mn&&De[t]<Z[1]+Mn&&Z[2]<De[t+3]+$t&&De[t+2]<Z[3]+$t)return!1}return!0}function tr(){let e=0;for(let t=0;t<an;t++){let o=t*4;e+=Math.max(0,Math.min(Z[1],De[o+1]+Mn)-Math.max(Z[0],De[o]-Mn))*Math.max(0,Math.min(Z[3],De[o+3]+$t)-Math.max(Z[2],De[o+2]-$t))}return e+(Z[0]<2||Z[1]>So-2||Z[2]<Fo||Z[3]>Po?1e7:0)}function nr(e,t,o,s,r){if(e===0)return ht[0]=0,ht[1]=0,!0;if(e--,e<12)return ht[0]=0,ht[1]=(e&1?-1:1)*((e>>1)+1)*(s*t/3+3),!0;if(e-=12,e<4)return ht[0]=(e<2?1:-1)*(e&1?o*t+8:o*t/2+8),ht[1]=0,!0;e-=4;let f=e>>1;if(f>=an)return!1;let h=f*4;return ht[0]=0,ht[1]=e&1?De[h+2]-$t-1-(r+s/2*t):De[h+3]+$t+1-(r-s/2*t),!0}let Us=["in","out","sin","fen","lymph","disse","hsc","hep","kup"];function or(){let e=N.W,t=xo(),o=t/.9,s=ge(o,.8,1.5),r=6*o+2*s,f=3*o+2*s;Mn=Math.max(6+2*t,2*r+3),$t=Math.max(2+2*t,2*f+3),So=e,Fo=c.ins[1],Po=c.ins[2],an=0,pe.w&&Co(pe.x,pe.x+pe.w,pe.y,pe.y+pe.h);let h=Zi();for(let k=0;k<h.length;k++)Co(h[k].l,h[k].r,h[k].t,h[k].b);for(let k=0;k<Us.length;k++){let w=Us[k],j=y[w];if(!j?.box||!v.hasLook(w))continue;let E=j.box,T=E.r-E.l,_=E.b-E.t,oe=(E.l+E.r)/2,se=(E.t+E.b)/2,D=j.off||(j.off=[0,0,1]);if(D[0]=0,D[1]=0,D[2]=1,No(oe,se,T,_,0,0,1),w!=="in"&&w!=="out"&&w!=="sin"&&!qs()){let K=!1,Y=!1;for(let C=0;C<3&&!K;C++){let fe=C===0?1:C===1?.85:.72;for(let Pe=0;nr(Pe,fe,T,_,se);Pe++){let ae=ht[0],qe=ht[1];if(Math.abs(qe)>2.2*_)continue;if(No(oe,se,T,_,ae,qe,fe),qs()){cn[0]=ae,cn[1]=qe,cn[2]=fe,K=!0;break}let Re=tr()+Math.abs(qe)*.01;(!Y||Re<Ot[0])&&(Y=!0,Ot[0]=Re,Ot[1]=ae,Ot[2]=qe,Ot[3]=fe)}}K?(D[0]=cn[0],D[1]=cn[1],D[2]=cn[2]):Y&&(D[0]=Ot[1],D[1]=Ot[2],D[2]=Ot[3])}No(oe,se,T,_,D[0],D[1],D[2]);let ee=!1;for(let K=0;K<h.length&&!ee;K++){let Y=h[K];Z[0]<Y.r&&Y.l<Z[1]&&Z[2]<Y.b&&Y.t<Z[3]&&(ee=!0)}if(j.covered=ee,he[w]&&(he[w].hide=ee),Co(Z[0],Z[1],Z[2],Z[3]),w==="kup"){let K=j.cell||j.at,Y=On(K[0],K[1]),C=Y[0],fe=Y[1];if(C<Z[0]-6||C>Z[1]+6||fe<Z[2]-6||fe>Z[3]+6){let Pe=he.kup||={key:"kup"};Pe.x1=ge(C,Z[0],Z[1]),Pe.y1=ge(fe,Z[2],Z[3]),Pe.x2=C,Pe.y2=fe,Pe.show=1,Pe.follow=!1,Pe.hide=j.covered}else he.kup&&(he.kup.show=0);continue}let U=he[w];U&&(U.follow=!0,U.sg=Math.sign(U.x2-oe))}}let Xn="",zs=-1,sr=["Portal venule","Central vein"];function lr(){let e=N,t=c.fe,o=t.l+2,s=c.ins[0]+12,r=e.vert?On(0,Nt(0))[0]-8:N.W-12,f=Math.max(90,r-o);f!==zs&&(zs=f,Xn=`${f}px`);let h=ot;h.sig?(pe.w=2*h.px+(h.dot?h.dot.d+h.gap:0)+so("Protein",Ve(h)),pe.h=2*h.py+h.lh):pe.w=pe.h=0,pe.x=o,pe.y=s;let k=a;for(let w=0;w<2;w++){let j=w?"out":"in",E=sr[w],T=zi(w,w?k.P3:k.P1),_=X(j,"sv-region sv-region-sin sv-end",E,T),oe=ue(_),se=oe[0],D=oe[1],ee,U,K=48;e.vert?(ee=c.C[0]-se/2,U=w?t.b-D-K:t.t+K):(ee=w?t.r-se-8-K:t.l+8+K,U=c.C[1]-D/2),e.vert&&!w&&pe.w&&pe.x+pe.w>ee-6&&(U=Math.max(U,pe.y+pe.h+K)),_.cx=ee+se/2,_.cy=U+D/2,_.end=!0;let Y=_.at0||(_.at0=[0,0]);Y[0]=ee,Y[1]=U;let C=_.box||(_.box={l:0,r:0,t:0,b:0});if(C.l=ee,C.r=ee+se,C.t=U,C.b=U+D,e.vert)Gn[w]=null;else{let Re=Gn[w]||(Gn[w]={u:w,x0:0,x1:0,y0:0,y1:0});Re.u=w,Re.x0=w?ee:ee-K,Re.x1=w?ee+se+K:ee+se,Re.y0=U,Re.y1=U+D}e.vert&&(En[w]=w?U-6:U+D+6);let fe=e.vert?c.C[0]:w?ee+se+K/2:ee-K/2,Pe=e.vert?w?U+D+K/2:U-K/2:c.C[1],ae=Math.cos(e.ang),qe=Math.sin(e.ang);An[w]=((fe-c.C[0])*ae+(Pe-c.C[1])*qe)/c.k}An[2]=Math.min(22/c.k,Ue.lum*F.lum*.95),e.vert&&(En[0]=Math.max(En[0],c.ins[0]+12+pe.h+8))}let $s=new Map,Ro=e=>{let t=qt(e),o=$s.get(e);return(!o||o.t!==t)&&(o={t,v:Ke(t)},$s.set(e,o)),o.v},nt={x:0,y:0,off:null,show:1,now:0},Do=[0,0,1],ir=[[["Protein","name"]]],Is=null,Hs=null,it={x1:0,y1:0,x2:0,y2:0,show:1,cut:!1,of:null,follow:!1,sg:0,colour:null},It={line:"",lw:1,r:2.4,fill:"",ring:"",rw:1.3,halo:"",haloR:5},Ws=null,js=new Set,Ks=e=>{let t=document.getElementById("app"),o=t?.dataset.lit||"";return o!==Ws&&(Ws=o,js=new Set(o?o.split(" "):[])),!o||!t.classList.contains("presenting")||!/(^| )(lobule|sinusoid):/.test(o)||js.has(`sinusoid:${re[e.key]||e.key}`)?1:.35};function rr(){let e=at();It.line=Ro("--leader"),It.fill=Ro("--stage-bg"),It.halo=It.fill,It.ring=Ro("--text-2"),v.leadLook(It);for(let o in y){let s=y[o];s.cx==null||!v.hasLook(s.key)||(v.measure(s.key,s.lines),nt.x=s.cx,nt.y=s.cy,nt.off=s.off||Do,nt.show=s.covered?0:Ks(s),nt.now=e,v.put(s.key,nt))}for(let o in he){let s=he[o];s.x1!=null&&(it.x1=s.x1,it.y1=s.y1,it.x2=s.x2,it.y2=s.y2,it.show=s.hide?0:s.show*(y[s.key]?Ks(y[s.key]):1),it.cut=!!s.hide,it.of=y[s.key]?s.key:null,it.follow=!!s.follow,it.sg=s.sg||0,it.colour=It.line,v.lead(s.key,it))}let t=ot;if(t.sig&&pe.w&&v.hasLook("legend")){let o=v.measure("legend",ir),s=o[0],r=t.dot?t.dot.d+t.gap:0,f=pe.x+t.px;if(nt.x=f+r+s/2,nt.y=pe.y+pe.h/2,nt.off=Do,nt.show=1,nt.now=e,v.put("legend",nt),t.dot&&t.dot!==Is){Is=t.dot;let h=t.dot.d/2,k=-r+h,w=o[1]/2,j=[],E=20;for(let T=0;T<E;T++)j.push(k+h*Math.cos(T/E*2*Math.PI),w+h*Math.sin(T/E*2*Math.PI));Hs=[{pts:j,fill:t.dot.fill,stroke:t.dot.ring?.colour,sw:t.dot.ring?.w}]}v.decor("legend",t.dot?Hs:null)}else v.put("legend",{x:0,y:0,off:Do,show:0,now:e})}let Oo=0,Gs="",Xs=()=>{Oo||(Oo=un(ar))};v.onRest=Xs;function ar(){if(Oo=0,xn||v.moving())return;let e="";for(let t of Object.values(y))e+=`${t.key}:${t.cx?.toFixed(1)},${t.cy?.toFixed(1)},${t.off||""},${!!t.covered}|`;if(e+=`${pe.x.toFixed(1)},${pe.y.toFixed(1)},${Xn}`,e!==Gs){Gs=e;for(let t of Object.values(y)){let o=t.el;if(!o||t.cx==null)continue;o.style.transform=t.end?`translate(${t.at0[0].toFixed(1)}px, ${t.at0[1].toFixed(1)}px)`:`translate(${t.cx.toFixed(1)}px, ${t.cy.toFixed(1)}px) translate(-50%, -50%)`;let s=t.off||[0,0,1];o.style.translate=s[0]||s[1]?`${s[0].toFixed(1)}px ${s[1].toFixed(1)}px`:"",o.style.scale=s[2]!==1?String(s[2]):"",t.covered?o.dataset.covered="":delete o.dataset.covered}Ce.style.transform=`translate(${pe.x.toFixed(1)}px, ${pe.y.toFixed(1)}px)`,Ce.style.maxWidth!==Xn&&(Ce.style.maxWidth=Xn)}}let ke=new Float64Array(32),Vs=new Float64Array(32),Ys=null,Js=null,Qs=!1;function cr(){let e=a,t=0;ke[t++]=Math.round(c.k*1e3),ke[t++]=Math.round(c.C[0]),ke[t++]=Math.round(c.C[1]),ke[t++]=Math.round(c.f.l),ke[t++]=Math.round(c.f.t),ke[t++]=Math.round(c.f.r),ke[t++]=Math.round(c.f.b),ke[t++]=Math.round(c.fe.l),ke[t++]=Math.round(c.fe.t),ke[t++]=Math.round(c.fe.r),ke[t++]=Math.round(c.fe.b);for(let s=0;s<c.ins.length;s++)ke[t++]=Math.round(c.ins[s]);ke[t++]=Math.round(F.lum*1e3),ke[t++]=F.act>.5?1:0,ke[t++]=Math.round(F.por*20),ke[t++]=e.hide?1:0,ke[t++]=Math.round(e.P2*10),ke[t++]=Math.round(e.lymph*10),ke[t++]=Math.round(e.lyProt*100),ke[t++]=Math.round(e.P1*10),ke[t++]=Math.round(e.P3*10),ke[t++]=n.matches?1:0,ke[t++]=Math.round(xo()*1e3);let o=Qs&&Ys===Fe&&Js===Bs();for(let s=0;o&&s<t;s++)ke[s]!==Vs[s]&&(o=!1);if(o)return!1;for(let s=0;s<t;s++)Vs[s]=ke[s];return Qs=!0,Ys=Fe,Js=Bs(),!0}let Zs=!1,Lt=new Float64Array(8),el=new Float64Array(8);function fr(){let e=a;Lt[0]=Math.round(F.por*4),Lt[1]=F.col>.15?1:0,Lt[2]=F.act>.4?1:0,Lt[3]=e.hide?1:0,Lt[4]=Math.round(e.P2),Lt[5]=Math.round(e.lymph*10),Lt[6]=Math.round(e.lyProt*100);let t=Zs;for(let o=0;t&&o<7;o++)Lt[o]!==el[o]&&(t=!1);if(t)return!1;for(let o=0;o<7;o++)el[o]=Lt[o];return Zs=!0,!0}let Vn="",_t="",Tn=!1;function Yn(e,t=!0,o=!0,s=e){Tn=!1;let[r,f]=ts();os(r,f),(s>0||F.lum==null)&&as(s);let h=Fi(s);if(i+=((Ho()?0:1)-i)*(s>0?1-Math.exp(-s/.25):0),i<.002&&(i=0),t&&e>0&&i>0&&us(e*i),!o)return;W!=null&&P&&x&&!I&&Q();let k=Math.min($o()?1:2,devicePixelRatio||1)*V()*be;(A.width!==Math.round(r*k)||A.height!==Math.round(f*k))&&(A.width=Math.round(r*k),A.height=Math.round(f*k));let w=document.documentElement.dataset.theme==="dark"||!document.documentElement.dataset.theme&&Ko.matches,j=cr();if(Lo(),(j||Vn===""||Nn||R)&&(Vn="laid",Nn=!1,R=!1,lr(),Gi(),or(),rr()),Ui(),P){let E=Ni(w);if(nn||Dn){Lo(),Tn=!1;return}let T=hr;T[0]=Ds("in"),T[1]=Ds("out");let _=Math.round(T[0]*100),oe=Math.round(T[1]*100),se=v.on?Math.round((v.at("in",at())?.a??0)*100):-1,D=v.on?Math.round((v.at("out",at())?.a??0)*100):-1;(cl!==_||fl!==oe||ul!==se||dl!==D)&&(cl=_,fl=oe,ul=se,dl=D,_o=mr(T),Jn=v.on?pr(se,D):"",tl());let{C:ee,k:U,ca:K,sa:Y}=Jt,C=U*k;if(Zn(E.uI0,K/C,Y/C,-(ee[0]*K+ee[1]*Y)/U),Zn(E.uI1,-Y/C,K/C,(ee[0]*Y-ee[1]*K)/U),Zn(E.uF0,C*K,-C*Y,k*ee[0]),Zn(E.uF1,C*Y,C*K,k*ee[1]),E.uPx=1/C,E.uK=C,E.uKs=Math.min(C,12*k),E.uLum=Ue.lum*F.lum,E.uPinch=F.pinch,E.uXs=N.xs,E.uXk=N.xk,E.uKy=et(N.xk),E.uHscA=Zt(N.xs)+yn(N.xs)*.5+.8,E.uCol=F.col,E.uBm=F.bm,E.uMv=F.mv,E.uAct=F.act,E.uPor=F.por,E.uFlow=qn,E.uLym=fs,E.uLyF=ge(.32*F.filt**1.5,.06,1.75),E.uDir=Math.sign(F.v||1),qo(E.uEnd,An[0],An[1],An[2],.95),E.uEndA=T,I){let ae=I.g;qo(E.uRev,0,0,0,0),E.uAll=Gt(.5,.88,ae),E.uDet[0]=Gt(.72,1,ae),E.uDet[1]=1e5,E.uFocus=Gt(.82,1,ae)}else qo(E.uRev,1,-1e5,1e5,1e5),E.uAll=1,E.uDet[0]=1,E.uDet[1]=1e5,E.uFocus=1;ps=Math.max(0,e)*i;let fe=qi();if(i===0&&!I&&!le&&dr(E,fe))Tn=!0;else{P.draw(E,on,fe),kl("sinusoid-view"),Ie?.drew(performance.now());let ae=P.target;Ct=ae?ae.w:0,M=ae?ae.h:0,S=E.uAll===1&&E.uFocus===1}_t=i===0&&!I&&!le,le&&Me()}(h||Nn)&&(Tn=!1),xn=h||Nn,!xn&&!v.moving()&&Xs(),fr()&&(Qn=xr(),tl())}let _o="",Jn="",Qn="",Bo=0,tl=()=>{Bo||(Bo=un(ur))};function ur(){Bo=0,A.dataset.endArrows!==_o&&(A.dataset.endArrows=_o),Jn&&A.dataset.endNames!==Jn&&(A.dataset.endNames=Jn),Qn&&A.getAttribute("aria-label")!==Qn&&A.setAttribute("aria-label",Qn)}let rt=new Float64Array(256),Ln=new Float64Array(256),nl=0,ol=!1,sl=0,ll=0,il=-1,rl=-1;function dr(e,t){let o=0;for(let f in e){let h=e[f];if(typeof h=="number")o>=rt.length&&al(),rt[o++]=h;else for(let k=0;k<h.length;k++)o>=rt.length&&al(),rt[o++]=h[k]}let s=_t&&ol&&sl===A.width&&ll===A.height&&il===P.epoch&&rl===t&&nl===o;for(let f=0;s&&f<o;f++)rt[f]!==Ln[f]&&(s=!1);if(s)return!0;let r=Ln;return Ln=rt,rt=r,nl=o,ol=!0,sl=A.width,ll=A.height,il=P.epoch,rl=t,!1}function al(){let e=new Float64Array(rt.length*2),t=new Float64Array(rt.length*2);e.set(rt),t.set(Ln),rt=e,Ln=t}let hr=[0,0],cl=-1,fl=-1,ul=-2,dl=-2;function pr(e,t){return(e/100).toFixed(2)+" "+(t/100).toFixed(2)}function mr(e){return e[0].toFixed(2)+" "+e[1].toFixed(2)}function Zn(e,t,o,s){e[0]=t,e[1]=o,e[2]=s}function qo(e,t,o,s,r){e[0]=t,e[1]=o,e[2]=s,e[3]=r}function xr(){let e=a,t=[`A sinusoid, cut along its length${e.hide?"":`, at ${dn(e.P2,1)} millimeters of mercury`}.`];return t.push(F.por>.75?"Its lining is fenestrated: plasma and its proteins pass through the open pores into the space of Disse.":F.por>.25?"Many of its fenestrae have closed: less protein crosses into the space of Disse.":"Its fenestrae have closed (capillarization): protein no longer crosses the wall."),e.hide||t.push(`Hepatic lymph ${dn(e.lymph,1)} milliliters per minute, flowing back along the space of Disse toward the portal triad, with ${Math.round(e.lyProt*100)} percent of plasma protein.`),F.col>.15&&t.push("Collagen fills the space of Disse and the hepatocytes have lost their microvilli."),t.push(F.act>.4?"The stellate cell is activated: no vitamin A droplets, contracted, depositing collagen.":"The stellate cell is quiescent, full of vitamin A droplets."),t.join(" ")}let Uo=0,eo=0,fn={x:0,y:0,ang:0,k:0,lumen:0},pt=()=>{u>0&&!q&&a&&(q=Kt(Ht))};B=pt,Ll.on("*",pt),addEventListener("pps:occ",pt);let gr=600,zo=0;function Ht(e){if(q=0,u<=0||!a)return;if(Sl()){ne=0,clearTimeout(eo),eo=setTimeout(pt,250);return}(I||b||xn||!Uo)&&(zo=e);let t=e-zo>gr?Math.max(Io(),Al("flow"),Ml(e,zo)):Io();if(!I&&!b&&e-Uo<t){q=Kt(Ht);return}if(Ie&&!I&&!b&&!Ie.ready(e)){q=Kt(Ht);return}Uo=e;let o=(e-(ne||e))/1e3;if(ne=e,Yn(Math.min(.1,o),!m.matches,!b,o),b=!1,Tn&&i===0&&Ho()){ne=0,clearTimeout(eo),eo=setTimeout(pt,250);return}q=Kt(Ht)}return{el:Le,captions:()=>v.snapshot(),explainHit(e,t){let o=v.snapshot(),s=Wt(g);for(let f of o.items)f.x+=s.left,f.y+=s.top;let r=jl(o.items,e,t,8,f=>!!H[f]&&!!y[f]);return r?{key:r.key,target:`sinusoid:${re[r.key]||r.key}`}:null},setExplain(e){G=e},camera(e,t,o,s=0){return!me||!P||P.lost?!1:(ce=e,He=t,lt=o,s>0&&(Cn=s),v.view(e,t,o),me.present(),!0)},sharpen(e){let t=Math.min($o()?1:2,devicePixelRatio||1)*V(),o=e?Math.max(1,Math.min(ce,3/(t||1))):1;o!==be&&(be=o,_t="",pt())},get cameraReady(){return!!me&&!!P&&!P.lost},setHoles:e=>v.holes(e),glassSeq:()=>me&&P&&!P.lost&&u>0?P.drawSeq:-1,glassHost(){if(!P||P.lost||!x||u<1||I||!A.width||!A.height)return null;if(me){let e=me;return{gl:e.gl,canvas:e.canvas,add:e.add,warmIn:e.warmIn,now:()=>{e.present()},seq:()=>P.drawSeq,onPicture:t=>P.onPicture(t)}}return{gl:P.top.gl,canvas:A,add:P.top.add,warmIn:P.top.warmIn,now:()=>{P.present()},seq:()=>P.drawSeq,onPicture:e=>P.onPicture(e)}},setModel(e){st(),a=e,u>0&&!q&&(q=Kt(Ht))},place({opacity:e,dive:t=null,isOpen:o=!1}){e>0&&st();let s=u;if(u=e,I=t,Le.style.opacity=e,Le.style.visibility=e>0?"visible":"hidden",Wo(Le,"sv-live",e>0),x=o,Wo(Le,"on",o),Fl(Le,"aria-hidden",o?"false":"true"),e<=0&&s>0&&v.hideAll(),e<=0&&s>0?(Se(),A.width=0,A.height=0,_t="",me&&(P?.free?.(),me.present())):me&&e>0&&!a&&me.present(),e>0&&s<=0&&(L=no(),W=null,ne=0,Vn="",c.k=0,Tt.length=0,Un=0,bn=0,a)){for(let r in F)delete F[r];Yn(0,!1);for(let r=0;r<40;r++)us(.1)}e>0&&a&&(Yn(0,!1),b=!0),e>0&&!q&&a&&(q=Kt(Ht))},frame(){let[e,t]=ts();return os(e,t),a&&F.lum==null&&as(0),fn.x=c.tC[0],fn.y=c.tC[1],fn.ang=N.ang,fn.k=c.tk,fn.lumen=2*Ue.lum*(F.lum??1)*c.tk,fn},isOpen:()=>x,xform(e){if(!x||!N)return!1;let t=Math.cos(N.ang),o=Math.sin(N.ang);return e.a=c.k*t,e.b=c.k*o,e.c=-c.k*o,e.d=c.k*t,e.e=c.C[0],e.f=c.C[1],!0},captionAt(e){if(e==="legend")return[pe.x,pe.y];let t=v.at(e);return t?[t.x,t.y]:null},labelsMoving:()=>x&&xn,get available(){return ft?!!P:Go()},rehost:pn}}export{jr as a,Kr as b,ui as c,Ra as d};
