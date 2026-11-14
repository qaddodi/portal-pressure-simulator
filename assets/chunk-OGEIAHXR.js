import{c as Ft}from"./chunk-6I2KJLQV.js";import{f as Ot,h as _,i as Yt}from"./chunk-J625TPTL.js";var ue=.75,yn=(t,n,o)=>{let e=Math.min(1,Math.max(0,(o-t)/(n-t)));return e*e*(3-2*e)};function Qt(t,n,o,e=!1){let a=(e?.12:.16)*(1-yn(.3,.75,o));return t[0]=n[0]*(1-.35*a),t[1]=n[1]*(1-.8*a),t[2]=n[2]*(1-a),t}function pe(t,n,o,e){let a=.4*Math.min(1,Math.max(0,e||0));if(!(a>0))return n;let l=.299*n[0]+.587*n[1]+.114*n[2];for(let r=0;r<3;r++)t[r]=n[r]+(l+(o[r]-l)*.35-n[r])*a;return t}var de=.3;function xe(t){let n=Math.min(1,Math.max(0,t||0));return Bt[0]=1+(Ft.sat-1)*n,Bt[1]=1+(Ft.dim-1)*n,Bt}var Bt=[1,1];function ve(t,n,o,e,a=!1){if(a||!(e>0))return t.k=t.from=t.to=n,t.k;if(n!==t.to&&(t.from=t.k,t.to=n,t.t0=o),t.k===t.to)return t.k;let l=Math.min(1,Math.max(0,(o-t.t0)/e)),r=l<.5?2*l*l:1-(-2*l+2)**2/2;return t.k=l>=1?t.to:t.from+(t.to-t.from)*r,t.k}var wn=3.2/1.1,gn=.72,Ln=.5;function me(t,n){let o=Ln/(2*gn);return Math.max(t*wn,t+Math.max(0,n-t)/o)}var be=t=>t<24?0:t*.02,zn=[6,12,24,48,96,192,384];function Me(t,n=zn){let o=-1;for(let l=0;l<n.length;l++)if(n[l]>=t){o=l;break}o<0&&(o=n.length-1);let e=Math.min(o+1,n.length-1),a=e===o?0:Math.min(1,Math.max(0,Math.log2(t/(n[o]/2))));return bt.a=o,bt.b=e,bt.mix=a,bt}var bt={a:0,b:0,mix:0};function ye(t,n,o){let e=2.6*Math.min(1,Math.max(0,t.blur||0)),a=Math.min(1,Math.max(0,t.dof||0)),l=n*2.4,r=Math.max(l+1,Math.min(n*10,o*.6));return[e,l,r,1.6*a]}function Mt(t,n,o,e,a){let l=Math.min(1,Math.min(n,o-n)/o*4),r=l*l*(3-2*l);return t[n]*(a+(e-a)*r)/2}function tn(t,n,o,e,a,l=a){let r=e.length-1;t.beginPath();for(let i=0;i<=r;i++){let u=Mt(e,i,r,a,l);t[i?"lineTo":"moveTo"](n[2*i]+o[2*i]*u,n[2*i+1]+o[2*i+1]*u)}t.arc(n[2*r],n[2*r+1],Mt(e,r,r,a,l),yt(o,r),yt(o,r)-Math.PI,!0);for(let i=r;i>=0;i--){let u=Mt(e,i,r,a,l);t.lineTo(n[2*i]-o[2*i]*u,n[2*i+1]-o[2*i+1]*u)}t.arc(n[0],n[1],Mt(e,0,r,a,l),yt(o,0)+Math.PI,yt(o,0),!0),t.closePath()}function yt(t,n){return Math.atan2(t[2*n+1],t[2*n])}function we(t,n,o,e,a){let l=Math.max(0,Math.ceil(o-t)),r=Math.max(0,Math.ceil(o-n)),i=Math.max(0,Math.ceil(t+o-e)),u=Math.max(0,Math.ceil(n+o-a));return l||r||i||u?{l,t:r,w:e+l+i,h:a+r+u}:null}var Pn=3e7,Sn=64e6,Jt=835e4;function ge(t,n,o,e){let a=n*o*t*t,l=e?Pn:Sn;return a<=l?t:t*Math.sqrt(l/a)}function Le(t,n,o){let e=Math.round(t*o),a=Math.round(n*o);for(let l=Math.max(1,Math.ceil(e*a/Jt));;l++){let r=Math.max(1,Math.min(l,Math.round(Math.sqrt(l*e/a)))),i=Math.ceil(l/r),u=Math.ceil(e/r),m=Math.ceil(a/i);if(u*m>Jt)continue;let M=[];for(let x=0;x<i;x++)for(let f=0;f<r;f++){let v=f*u,g=x*m,T=Math.min(e,v+u),A=Math.min(a,g+m);T>v&&A>g&&M.push({x:v/o,y:g/o,w:(T-v)/o,h:(A-g)/o})}return M}}var K=Math.PI*2,Tn=[0,0,0];function An(t,n,o){let e=t.pts,a=Ot(n,0,1)*(e.length-1),l=Math.min(e.length-2,Math.floor(a)),r=a-l;o[0]=_(e[l][0],e[l+1][0],r),o[1]=_(e[l][1],e[l+1][1],r)}var cn=(t,n=1)=>`rgba(${Math.round(t[0]*255)},${Math.round(t[1]*255)},${Math.round(t[2]*255)},${n})`;function et(t,n,o){t.setFillRGBA?t.setFillRGBA(Math.round(n[0]*255),Math.round(n[1]*255),Math.round(n[2]*255),o):t.fillStyle=cn(n,o)}function hn(t,n,o){t.setStrokeRGBA?t.setStrokeRGBA(Math.round(n[0]*255),Math.round(n[1]*255),Math.round(n[2]*255),o):t.strokeStyle=cn(n,o)}var H=()=>{throw new Error("lobule-paint: no tokens")},Te=t=>{H=t};var B=t=>{let n=t*374761393+668265263>>>0;return n=(n^n>>>13)*1274126177>>>0,(n>>>8)/16777216};function Kt(t,n,o,e,a){let{w:l,seed:r=0,e0:i=1.5,e1:u=1.5,amp:m=0}=e,M=26,x=t.P,f=t.N,v=t.Wd,g=Cn,T=B(r)*K,A=B(r+9)*K,b=o[0]-n[0],P=o[1]-n[1],I=Math.hypot(b,P)||1;for(let d=0;d<=M;d++){let p=d/M;if(a)a(e,p,g),x[2*d]=g[0],x[2*d+1]=g[1];else{let y=m*Math.sin(Math.PI*p)*(.75*Math.sin(3*Math.PI*p+T)+.25*Math.sin(7*Math.PI*p+A));x[2*d]=n[0]+b*p-P/I*y,x[2*d+1]=n[1]+P*p+b/I*y}}for(let d=0;d<=M;d++){let p=2*Math.max(0,d-1),y=2*Math.min(M,d+1),L=x[y]-x[p],w=x[y+1]-x[p+1],s=Math.hypot(L,w)||1,c=d/M;f[2*d]=-w/s,f[2*d+1]=L/s;let h=.78+.22*Math.sin(K*1.4*c+T)+.14*Math.sin(K*3.3*c+A),S=1+(i-1)*Math.max(0,1-c*3)**2+(u-1)*Math.max(0,c*3-2)**2;v[d]=Math.max(0,l*h*S)}return t.n=M,t.L0=I,t}var Cn=[0,0];function Dt(t,n,o,e,a=26){t.off=(B(n*31+o)-.5)*.9,t.fp=B(n*17+o)*K,t.wav=.05+.08*B(n*7+o);let l=B(n*13+o)*.25,r=1-B(n*19+o)*.25;return t.iA=Math.floor(l*a),t.iB=Math.ceil(r*a),t.lw=Math.max(.45,e*(.035+.03*B(n*5+o))),t.deep=o%3===0,t}function Nt(t,n,o,e,a){let{n:l,P:r,N:i,Wd:u}=n,m=Math.min(l-1,Math.max(1,Math.round(B(o*41+e)*l))),M=u[m]*(B(o*43+e)-.5)*.7;return t.x=r[2*m]+i[2*m]*M,t.y=r[2*m+1]+i[2*m+1]*M,t.rx=Math.max(.8,a*.16),t.ry=Math.max(.35,a*.045),t.ang=Math.atan2(i[2*m],-i[2*m+1]),t}var qt=(t,n=1)=>n<=0||t<1.2?0:Math.round((3+Math.min(7,t/1.6))*n),Gt=(t,n,o=1)=>o<=0||n<1.2||o<.6||n<3?0:Math.round(t.L0/(n*2.6)*o);var In={P:new Float64Array(54),N:new Float64Array(54),Wd:new Float64Array(27),n:26,L0:1},kn={off:0,fp:0,wav:0,iA:0,iB:0,lw:0,deep:!1},On={x:0,y:0,rx:0,ry:0,ang:0},nn=[0,0,0],en=[0,0,0],Fn=[.78,.74,.7],Bn=[2.1,1.45,1],jn=[.12,.24,.5],wt=[0,0],gt=[0,0];function Q(t,n,o,e){let{w:a,rgb:l,a:r=1,seed:i=0,detail:u=1}=e,m=Kt(In,n,o,e,e.path||null),M=m.n,x=m.P,f=m.N,v=m.Wd,g=t.shadowBlur;for(let b=0;b<3;b++){let P=Bn[b];et(t,l,jn[b]*r),tn(t,x,f,v,P,Math.min(P,1.45)),t.fill(),t.shadowBlur=0}if(t.shadowBlur=g,u<=0||a<1.2)return;for(let b=0;b<3;b++)nn[b]=l[b]+(1-l[b])*.45,en[b]=l[b]*Fn[b];let T=qt(a,u);t.lineCap="round",t.shadowBlur=0;for(let b=0;b<T;b++){let{off:P,fp:I,wav:d,iA:p,iB:y,lw:L,deep:w}=Dt(kn,i,b,a,M);hn(t,w?en:nn,(w?.32:.55)*r),t.lineWidth=L,t.beginPath();for(let s=p;s<=y;s++){let c=s/M,h=v[s]*(P+d*Math.sin(K*4*c+I));t[s===p?"moveTo":"lineTo"](x[2*s]+f[2*s]*h,x[2*s+1]+f[2*s+1]*h)}t.stroke()}if(u<.6||a<3){t.shadowBlur=g;return}let A=Gt(m,a,u);t.fillStyle=H("--lz-shade",.32*r);for(let b=0;b<A;b++){let{x:P,y:I,rx:d,ry:p,ang:y}=Nt(On,m,i,b,a);t.beginPath(),t.ellipse(P,I,d,p,y,0,K),t.fill()}t.shadowBlur=g}var it=t=>Ot(t,0,1)**1.1,Rn={w:0,rgb:null,a:1,e0:.2,e1:.25,seed:0,detail:1,path:Et,a0:0,span:0,r0:0,phase:0,rx:0,ry:0};function Et(t,n,o){let e=t.a0+t.span*n,a=t.r0+.09*Math.sin(5*e+t.phase)+.12*Math.sin(Math.PI*n);o[0]=Math.cos(e)*t.rx*a,o[1]=Math.sin(e)*t.ry*a}function En(t,n,o,e,a,l,r,i,u=1){t.save(),t.translate(n,o),t.rotate(a);let m=e,M=e,x=B(i)*K;t.beginPath(),t.arc(0,0,e,0,K),et(t,l,r*.24),t.fill(),t.clip();let f=Math.round(10*u),v=Rn;for(let g=0;g<f;g++){let T=i+g*37;v.a0=B(T)*K,v.span=1.2+2*B(T+1),v.r0=.25+.65*B(T+2),v.phase=x,v.rx=m,v.ry=M,v.w=e*(.08+.085*r)*(.7+B(T+3)),v.rgb=l,v.a=Math.min(1,r*(.75+.35*B(T+4))),v.seed=T,v.detail=u,Et(v,0,wt),Et(v,1,gt),Q(t,wt,gt,v)}t.restore()}var _n={w:0,rgb:null,a:1,e0:.45,e1:.5,seed:0,path:_t,cx:0,cy:0,a0:0,span:0,r0:0,th:0};function _t(t,n,o){let e=t.a0+t.span*n,a=t.r0+t.th*.1*Math.sin(e*5+B(t.seed+5)*K);o[0]=t.cx+Math.cos(e)*a,o[1]=t.cy+Math.sin(e)*a}function Kn(t,n,o,e,a){t.beginPath();for(let l=0;l<=80;l++){let r=K*l/80,i=a*(1+.035*Math.sin(3*r)+.025*Math.sin(7*r+.8));t[l?"lineTo":"moveTo"](n+Math.cos(r)*i,o+Math.sin(r)*i)}t.closePath(),t.moveTo(n+e,o),t.arc(n,o,e,0,K),t.closePath()}function on(t,n,o,e,a,l,r){t.save(),Kn(t,n,o,e,a),et(t,l,.4*r),t.fill("evenodd"),t.clip("evenodd");let i=a-e,u=_n;for(let m=0;m<3;m++)for(let M=0;M<6;M++){let x=211+m*17+M;u.cx=n,u.cy=o,u.a0=K*M/6+m*.27,u.span=K/6*(1.2+.5*B(x)),u.r0=e+i*(.18+m*.3),u.th=i,u.w=i*.34,u.rgb=l,u.a=Math.min(1,1*r),u.seed=x,_t(u,0,wt),_t(u,1,gt),Q(t,wt,gt,u)}t.restore()}var an=[0,0,0],ln=[0,0,0],rn=[0,0,0],Dn=[.42,.33,.3],Nn=[.93,.86,.72],qn=[.86,.78,.6],Gn=[.78,.64,.44],Hn=[1,3,5],lt=["--lz-zone-1","--lz-zone-2","--lz-zone-3"],jt=[[0,lt[2]],[.18,lt[2]],[.5,lt[1]],[.85,lt[0]],[1,lt[0]]],q=new Float64Array(33),Z=[0,0],Un={w:0,rgb:null,a:1,e0:1.5,e1:1.5,amp:0,seed:0,pts:null,path:null};function Rt(t,n,o=1){t.beginPath();for(let e=0;e<n.corners.length;e++){let a=n.x+(n.corners[e][0]-n.x)*o,l=n.y+(n.corners[e][1]-n.y)*o;e?t.lineTo(a,l):t.moveTo(a,l)}t.closePath()}function rt(t,n,o,e,a,l,r){let i=Un;return i.w=t,i.rgb=n,i.a=o,i.e0=1.5,i.e1=e,i.amp=a,i.seed=l,i.pts=r,i.path=r?An:null,i}function sn(t,n,o,e,a,l,r,i,u){let m=Math.cos(n.a)*l,M=Math.sin(n.a)*l,x=10;for(let f=0;f<=x;f++){let v=f/x,g=u*Math.sin(Math.PI*v*.8)*o;q[3*f]=e+m*r*v-n.nx*g,q[3*f+1]=a+M*r*v-n.ny*g,q[3*f+2]=i*(1-v)**1.3}t.moveTo(q[0]+n.nx*q[2],q[1]+n.ny*q[2]);for(let f=0;f<=x;f++)t.lineTo(q[3*f]+n.nx*q[3*f+2],q[3*f+1]+n.ny*q[3*f+2]);for(let f=x;f>=0;f--)t.lineTo(q[3*f]-n.nx*q[3*f+2],q[3*f+1]-n.ny*q[3*f+2]);t.closePath()}function Wn(t,n){let{m:o,G:e,dark:a,zonesOn:l,rgb:r}=n,{R:i,cx:u,cy:m,lobules:M}=e;{let d=M[0],p=r.bg,y=r.gap;for(let L=0;L<3;L++)an[L]=_(p[L],y[L],.55);et(t,an,1),t.beginPath();for(let L=0;L<d.corners.length;L++){let w=d.x+(d.corners[L][0]-d.x)*1.015,s=d.y+(d.corners[L][1]-d.y)*1.015;L?t.lineTo(w,s):t.moveTo(w,s)}t.closePath(),t.fill()}let x=r.gap,f=r.cell,v=r.col,g=a?qn:Gn,T=r.dis,A=M[0];Rt(t,A),et(t,x,a?.55:.5),t.fill(),t.save(),Rt(t,A),t.clip();let b=o.congU;t.strokeStyle=H("--lz-plate-line"),t.lineWidth=Math.max(.6,.6/(t.getTransform().a||1));for(let d=0;d<e.cells.length;d++){let p=e.cells[d],y=p.q<.4,L=y&&b>.12&&p.drop<b*(1.25-p.q*1.6),w=.88+.12*p.tone,s=f;if(a){for(let j=0;j<3;j++)ln[j]=_(x[j],f[j],.28);s=ln}let c;if(L)c=a?Dn:Nn;else{for(let j=0;j<3;j++)rn[j]=s[j]*w+(1-w)*(a?.15:1)*.3;c=Qt(Tn,rn,p.q,a)}let h=o.septU,S=h*Math.min(p.l,p.w)*.45;t.save(),t.translate(p.x+p.jx*S,p.y+p.jy*S),t.rotate(p.a+p.ja*h*.9);let C=(L?p.l*.7:p.l)*(1+.12*h),O=(L?p.w*.7:p.w)*(1+.3*h);et(t,c,L?.6:a?.8:.92),t.beginPath(),t.roundRect?t.roundRect(-C/2,-O/2,C,O,Math.min(C,O)*.38):t.rect(-C/2,-O/2,C,O),t.fill(),L||t.stroke(),L||(t.fillStyle=H("--lz-nodule-ink"),t.beginPath(),t.arc(p.nu*C,0,Math.max(.9,O*.16),0,K),t.fill()),t.restore()}if(b>.04){let d=t.createRadialGradient(u,m,i*.05,u,m,i*.55);d.addColorStop(0,H("--lz-nutmeg",.5*b)),d.addColorStop(.6,H("--lz-nutmeg",.22*b)),d.addColorStop(1,H("--lz-nutmeg",0)),t.fillStyle=d,t.fillRect(u-i,m-i,2*i,2*i)}if(l){let d=a?.2:.17,p=t.createRadialGradient(u,m,0,u,m,i);for(let y=0;y<jt.length;y++)p.addColorStop(jt[y][0],H(jt[y][1],d));t.fillStyle=p,t.fillRect(u-i,m-i,2*i,2*i)}if(o.fibSin>.05){hn(t,T,.75*o.fibSin),t.lineCap="round",t.lineJoin="round";for(let d=0;d<n.sin.length;d++){let p=n.sin[d];t.lineWidth=2*p.r+2+3.5*o.fibSin,t.beginPath();for(let y=0;y<p.pts.length;y++)y?t.lineTo(p.pts[y][0],p.pts[y][1]):t.moveTo(p.pts[y][0],p.pts[y][1]);t.stroke()}}if(o.act>.08){let d=o.act,p=e.rs0*(2.4+1.4*d),y=e.rs0*(.42+.2*d),L=H("--lz-hsc-body",(.22+.3*d).toFixed(3)),w=H("--lz-hsc-nucleus",(.3+.3*d).toFixed(3));for(let s=0;s<e.hsc.length;s++){let c=e.hsc[s],h=Math.cos(c.a),S=Math.sin(c.a);t.fillStyle=L,t.beginPath(),t.ellipse(c.x,c.y,p*.6,y,c.a,0,K);for(let C=0;C<2;C++){let O=C?1:-1,j=c.x+h*O*p*.45,F=c.y+S*O*p*.45;sn(t,c,e.rs0,j,F,O,p*(2+.6*d),y*.55,.45),sn(t,c,e.rs0,j,F,O,p*(1.1+.4*d),y*.35,-.25)}t.fill(),t.fillStyle=w,t.beginPath(),t.ellipse(c.x,c.y,p*.26,y*.5,c.a,0,K),t.fill()}}t.restore();let P=o.septU;if(P>0){let d=i*(.045+.075*P),p=M[0].corners,y=Math.min(1,.3+2.4*P);t.save(),t.shadowColor=H("--lz-nodule-shadow"),t.shadowBlur=i*.06*P;for(let L=0;L<p.length;L++){let w=p[L],s=p[(L+1)%6],c=.55+.45*P,h=i*.025;if(y>=1)Q(t,w,s,rt(d,v,c,1.5,h,11+L,null));else{let S=y/2;Z[0]=_(w[0],s[0],S),Z[1]=_(w[1],s[1],S),Q(t,w,Z,rt(d,v,c,.2,h,11+L,null)),Z[0]=_(s[0],w[0],S),Z[1]=_(s[1],w[1],S),Q(t,s,Z,rt(d,v,c,.2,h,61+L,null))}}if(P>.18){let L=Math.min(1,(P-.18)/.4);for(let w=0;w<e.septaPC.length;w++){let s=e.septaPC[w].pts,c=s.length-1;Q(t,s[0],s[c],rt(d*(.6+.3*L),v,.45+.5*L,.9,0,31+w,s))}if(P>.6)for(let w=0;w<3;w++){let s=p[Hn[w]],c=.25+.3*Math.min(1,(P-.6)/.3);Z[0]=_(s[0],u,c),Z[1]=_(s[1],m,c),Q(t,s,Z,rt(d*.55,v,.6,.15,i*.03,41+w,null))}}t.restore()}else t.strokeStyle=H("--lz-plate-line"),t.lineWidth=1,Rt(t,M[0]),t.stroke();t.globalAlpha=1;let I=M[0].corners;for(let d=0;d<I.length;d++){let p=I[d][0],y=I[d][1],L=!1;for(let c=0;c<d&&!L;c++)L=Math.round(I[c][0])===Math.round(p)&&Math.round(I[c][1])===Math.round(y);if(L)continue;let w=it(o.fibPre),s=e.rt*(.8+.9*w);o.fibPre>.03&&(En(t,p,y,s,Math.atan2(y-m,p-u),g,w,900+d*71),on(t,p,y,s*.62,s*1.08,g,w))}if(o.fibPost>.05){let d=it(o.fibPost),p=n.cvIn,y=p+e.rcv0*(.1+.85*d);on(t,u,m,p,y,v,d)}}function Ae(t,n,o,e,a,l){t.setTransform(1,0,0,1,0,0),t.clearRect(0,0,n,n),t.setTransform(o,0,0,o,-e*o,-a*o),Wn(t,l)}var X=16,st=512,fn=1024,ct=512,un=1024,xn=(t,n,o)=>{let e=Math.min(1,Math.max(0,(o-t)/(n-t)));return e*e*(3-2*e)},Fe=()=>!0,Be=(t,n)=>xn(3.5,6,t*n*.052),Xn=420;function je(t,n,o,e=Xn){if(t===n)return t;let a=Math.min(100,Math.max(0,o))/e;return n>t?Math.min(n,t+a):Math.max(n,t-a)}var Re=(t,n)=>Math.min(Yt(t),n),$n=1e-4;function Ee(t,n,o=$n){let e=n[0]-t[0],a=n[1]-t[1],l=Math.round(e),r=Math.round(a);return Math.abs(e-l)<=o&&Math.abs(a-r)<=o&&Math.abs(n[2]-t[2]-l)<=o&&Math.abs(n[3]-t[3]-r)<=o?[l,r]:null}function _e(t,n,o,e){let a=o,l=-e;if(!(Math.abs(a)<t&&Math.abs(l)<n))return null;let r=Math.max(0,-a),i=Math.min(t,t-a),u=Math.max(0,-l),m=Math.min(n,n-l),M=[];a>0?M.push([0,0,a,n]):a<0&&M.push([t+a,0,-a,n]);let x=Math.max(0,a),f=Math.min(t,t+a);return l>0?M.push([x,0,f-x,l]):l<0&&M.push([x,n+l,f-x,-l]),{src:[r,u,i-r,m-u],dst:[r+a,u+l,i-r,m-u],strips:M}}function ht(t){if(t=(t||"").trim(),t[0]==="#"){let o=t.length<6?[...t.slice(1,4)].map(e=>e+e).join(""):t.slice(1,7);return[0,2,4].map(e=>parseInt(o.slice(e,e+2),16)/255).concat(1)}let n=t.match(/[\d.]+/g)||[];return[(+n[0]||0)/255,(+n[1]||0)/255,(+n[2]||0)/255,n.length>3?+n[3]:1]}function Ke(t,n,o){let e=vn;return e.out&&Vn(e,t,n,o)?e.out:Yn(t,n,o)}var xt=["--lz-plate-line","--lz-nodule-ink","--lz-zone-line","--lz-nodule-shadow","--lz-shade","--lz-hsc-body","--lz-hsc-nucleus","--lz-nutmeg","--lz-zone-1","--lz-zone-2","--lz-zone-3"],vn={out:null,dark:!1,nums:new Float64Array(15),toks:new Array(xt.length).fill("")};function Vn(t,n,o,e){if(t.dark!==o)return!1;let a=t.nums;for(let l=0;l<3;l++)if(a[l]!==n.bg[l]||a[3+l]!==n.gap[l]||a[6+l]!==n.cell[l]||a[9+l]!==(n.col||n.gap)[l]||a[12+l]!==(n.dis||n.gap)[l])return!1;for(let l=0;l<xt.length;l++)if(t.toks[l]!==e(xt[l]))return!1;return!0}function Yn(t,n,o){let e=vn,a=e.nums;e.dark=n;for(let l=0;l<3;l++)a[l]=t.bg[l],a[3+l]=t.gap[l],a[6+l]=t.cell[l],a[9+l]=(t.col||t.gap)[l],a[12+l]=(t.dis||t.gap)[l];for(let l=0;l<xt.length;l++)e.toks[l]=o(xt[l]);return e.out=Jn(t,n,o)}function Jn(t,n,o){let{bg:e,gap:a,cell:l}=t,r=i=>ht(o(i)).slice(0,3);return{gap:a,gap55:a.map((i,u)=>_(e[u],i,.55)),base:n?l.map((i,u)=>_(a[u],i,.28)):l,plate:ht(o("--lz-plate-line")),ink:ht(o("--lz-nodule-ink")),zl:ht(o("--lz-zone-line")),col:t.col||a,dis:t.dis||a,shd:ht(o("--lz-nodule-shadow")),shade:r("--lz-shade"),body:r("--lz-hsc-body"),nuc:r("--lz-hsc-nucleus"),nut:r("--lz-nutmeg"),z1:r("--lz-zone-1"),z2:r("--lz-zone-2"),z3:r("--lz-zone-3")}}function De(t){let{R:n,cx:o,cy:e,lobules:a,cells:l}=t,r=a[0],i=1.3*n,u=o-i,m=e-i,M=2*i,x=Math.ceil(M/X),f=new Float32Array(18);for(let h=0;h<6;h++){let[S,C]=r.corners[h],[O,j]=r.corners[(h+1)%6],F=O-S,R=j-C,U=Math.hypot(F,R)||1,E=R/U,N=-F/U;E*(S-r.x)+N*(C-r.y)<0&&(E=-E,N=-N),f.set([E,N,E*(S-r.x)+N*(C-r.y)],h*3)}let v=Math.max(1,Math.ceil(l.length/st)),g=new Float32Array(st*3*v*4),T=Array.from({length:x*x},()=>[]);l.forEach((h,S)=>{let C=(Math.floor(S/st)*st*3+S%st*3)*4;g.set([h.x,h.y,h.a,h.l,h.w,h.tone,h.nu,h.q,h.drop,h.jx,h.jy,h.ja],C);let O=he(h),j=Math.max(0,Math.floor((h.x-O-u)/X)),F=Math.min(x-1,Math.floor((h.x+O-u)/X)),R=Math.max(0,Math.floor((h.y-O-m)/X)),U=Math.min(x-1,Math.floor((h.y+O-m)/X));for(let E=R;E<=U;E++)for(let N=j;N<=F;N++)T[E*x+N].push(S)});let A=t.sin||[],b=5*(t.rs0||3)+4,P=[];A.forEach((h,S)=>{for(let C=0;C+1<h.pts.length;C++)P.push([h.pts[C][0],h.pts[C][1],h.pts[C+1][0],h.pts[C+1][1],S])});let I=Math.max(1,Math.ceil(P.length/ct)),d=new Float32Array(ct*2*I*4),p=Array.from({length:x*x},()=>[]);P.forEach((h,S)=>{let C=(Math.floor(S/ct)*ct*2+S%ct*2)*4;d.set([h[0],h[1],h[2],h[3],h[4],0,0,0],C);let O=Math.max(0,Math.floor((Math.min(h[0],h[2])-b-u)/X)),j=Math.min(x-1,Math.floor((Math.max(h[0],h[2])+b-u)/X)),F=Math.max(0,Math.floor((Math.min(h[1],h[3])-b-m)/X)),R=Math.min(x-1,Math.floor((Math.max(h[1],h[3])+b-m)/X));for(let U=F;U<=R;U++)for(let E=O;E<=j;E++)p[U*x+E].push(S)});let y=T.reduce((h,S)=>h+S.length,0)+p.reduce((h,S)=>h+S.length,0),L=Math.max(1,Math.ceil(y/fn)),w=new Float32Array(x*x*4),s=new Float32Array(fn*L),c=0;return T.forEach((h,S)=>{w[S*4]=c,w[S*4+1]=h.length;for(let C of h)s[c++]=C}),p.forEach((h,S)=>{w[S*4+2]=c,w[S*4+3]=h.length;for(let C of h)s[c++]=C}),{nb:x,box:[u,m,M],edges:f,ctr:[r.x,r.y],cellData:g,cellRows:v,bins:w,idx:s,idxRows:L,segData:d,segRows:I}}var Wt=(t,n,o)=>xn(t,n,o),vt=Math.PI*2,ft=32;function mt(t,n,o){if(t.pk===1){let e=t.a0+t.span*n,a=t.r0+t.th*.1*Math.sin(e*5+B(t.seed+5)*vt);o[0]=t.x+Math.cos(e)*a,o[1]=t.y+Math.sin(e)*a}else if(t.pk===2){let e=t.a0+t.span*n,a=t.r0+.09*Math.sin(5*e+t.phase)+.12*Math.sin(Math.PI*n);o[0]=Math.cos(e)*t.rt*a,o[1]=Math.sin(e)*t.rt*a}else{let e=t.pts,a=Math.min(1,Math.max(0,n))*(e.length-1),l=Math.min(e.length-2,Math.floor(a)),r=a-l;o[0]=_(e[l][0],e[l+1][0],r),o[1]=_(e[l][1],e[l+1][1],r)}}var k={w:0,rgb:null,a:1,e0:1.5,e1:1.5,amp:0,seed:0,pk:0,x:0,y:0,a0:0,span:0,r0:0,th:0,phase:0,rt:0,pts:null},z={fade:1,shadow:0,ck:0,cx:0,cy:0,cr:0,cr2:0,xf:!1,tx:0,ty:0,ta:0},J={P:new Float64Array(54),N:new Float64Array(54),Wd:new Float64Array(27),n:26,L0:1},zt=[0,0],Pt=[0,0],$=[0,0],at=[],pn=[],Qn=[.86,.78,.6],te=[.78,.64,.44],ne=[1,3,5],Lt=0;function ee(){return{type:0,rgb:null,a:0,clip:[0,0,0,0,0],shadow:0,w:0,band:{P:new Float64Array(54),N:new Float64Array(54),Wd:new Float64Array(27)},fibres:[],nuclei:[],fPool:[],nPool:[],bc:[0,0,0]}}function mn(){let t=pn[Lt]||(pn[Lt]=ee());return Lt++,at.push(t),t.fibres.length=0,t.nuclei.length=0,t}function bn(t){let n=t.clip;n[0]=z.ck,n[1]=z.cx,n[2]=z.cy,n[3]=z.cr,n[4]=z.cr2}function pt(){z.fade=1,z.shadow=0,z.ck=0,z.cx=0,z.cy=0,z.cr=0,z.cr2=0,z.xf=!1}function tt(t,n,o,e,a,l,r,i){k.w=t,k.rgb=n,k.a=o,k.e0=e,k.e1=a,k.amp=l,k.seed=r,k.pk=i}function nt(t,n){let o=k.w,e=k.seed||0;Kt(J,t,n,k,k.pk?mt:null);let a=mn(),l=qt(o),r=Gt(J,o);a.type=0,a.rgb=k.rgb,a.a=k.a*z.fade,a.shadow=z.shadow,a.w=o,bn(a);for(let f=0;f<l;f++){let v=a.fPool[f]||(a.fPool[f]={off:0,fp:0,wav:0,iA:0,iB:0,lw:0,deep:!1});a.fibres.push(Dt(v,e,f,o))}let i=z.xf?Math.cos(z.ta):1,u=z.xf?Math.sin(z.ta):0,m=a.band.P,M=a.band.N,x=a.band.Wd;for(let f=0;f<r;f++){let v=a.nPool[f]||(a.nPool[f]={x:0,y:0,rx:0,ry:0,ang:0});if(Nt(v,J,e,f,o),z.xf){let g=v.x,T=v.y;v.x=z.tx+i*g-u*T,v.y=z.ty+u*g+i*T,v.ang+=z.ta}a.nuclei.push(v)}for(let f=0;f<27;f++){let v=J.P[2*f],g=J.P[2*f+1],T=J.N[2*f],A=J.N[2*f+1];z.xf?(m[2*f]=z.tx+i*v-u*g,m[2*f+1]=z.ty+u*v+i*g,M[2*f]=i*T-u*A,M[2*f+1]=u*T+i*A):(m[2*f]=v,m[2*f+1]=g,M[2*f]=T,M[2*f+1]=A),x[f]=J.Wd[f]}}function Mn(t,n,o){let e=mn();e.type=t,e.rgb=n,e.a=o,e.shadow=0,e.w=0,bn(e)}function dn(t,n,o,e,a,l){pt(),z.ck=2,z.cx=t,z.cy=n,z.cr=e,z.cr2=o,Mn(2,a,.4*l);let r=e-o;for(let i=0;i<3;i++)for(let u=0;u<6;u++){let m=211+i*17+u;k.x=t,k.y=n,k.a0=vt*u/6+i*.27,k.span=vt/6*(1.2+.5*B(m)),k.r0=o+r*(.18+i*.3),k.th=r,tt(r*.34,a,Math.min(1,1*l),.45,.5,0,m,1),mt(k,0,zt),mt(k,1,Pt),nt(zt,Pt)}}function Ne(t,n,o){let e=oe,a=o.col;return e.valid&&e.shape===t&&e.su===n.septU&&e.pre===n.fibPre&&e.post===n.fibPost&&e.dark===o.dark&&e.cvIn===o.cvIn&&e.c0===a?.[0]&&e.c1===a?.[1]&&e.c2===a?.[2]||(e.valid=!0,e.shape=t,e.su=n.septU,e.pre=n.fibPre,e.post=n.fibPost,e.dark=o.dark,e.cvIn=o.cvIn,e.c0=a?.[0],e.c1=a?.[1],e.c2=a?.[2],at.length=0,Lt=0,at.ver=(at.ver||0)+1,ae(t,n,o)),at}var oe={valid:!1,shape:null,su:0,pre:0,post:0,dark:!1,cvIn:0,c0:0,c1:0,c2:0};function ae(t,n,o){let{R:e,cx:a,cy:l,rcv0:r,lobules:i}=t,u=i[0].corners,m=o.col,M=o.dark?Qn:te,x=n.septU;if(x>0){let f=e*(.045+.075*x),v=Math.min(1,.3+2.4*x),g=Wt(0,.05,x),T=e*.06*x;for(let A=0;A<u.length;A++){let b=u[A],P=u[(A+1)%6],I=.55+.45*x,d=e*.025;if(pt(),z.fade=g,z.shadow=T,v>=1)tt(f,m,I,1.5,1.5,d,11+A,0),nt(b,P);else{let p=v/2;tt(f,m,I,1.5,.2,d,11+A,0),$[0]=_(b[0],P[0],p),$[1]=_(b[1],P[1],p),nt(b,$),tt(f,m,I,1.5,.2,d,61+A,0),$[0]=_(P[0],b[0],p),$[1]=_(P[1],b[1],p),nt(P,$)}}if(x>.18){let A=Math.min(1,(x-.18)/.4);for(let b=0;b<t.septaPC.length;b++){let P=t.septaPC[b].pts,I=P.length-1;pt(),z.fade=g,z.shadow=T,tt(f*(.6+.3*A),m,.45+.5*A,1.5,.9,0,31+b,3),k.pts=P,nt(P[0],P[I])}if(x>.6)for(let b=0;b<3;b++){let P=u[ne[b]],I=.25+.3*Math.min(1,(x-.6)/.3);pt(),z.fade=g,z.shadow=T,$[0]=_(P[0],a,I),$[1]=_(P[1],l,I),tt(f*.55,m,.6,1.5,.15,e*.03,41+b,0),nt(P,$)}}}for(let f=0;f<u.length;f++){let v=u[f][0],g=u[f][1],T=!1;for(let p=0;p<f&&!T;p++)T=Math.round(u[p][0])===Math.round(v)&&Math.round(u[p][1])===Math.round(g);if(T)continue;let A=it(n.fibPre),b=t.rt*(.8+.9*A);if(!(n.fibPre>.03))continue;let P=Math.atan2(g-l,v-a),I=900+f*71;pt(),z.ck=1,z.cx=v,z.cy=g,z.cr=b,z.cr2=0,Mn(1,M,A*.24);let d=B(I)*vt;for(let p=0;p<10;p++){let y=I+p*37;k.a0=B(y)*vt,k.span=1.2+2*B(y+1),k.r0=.25+.65*B(y+2),k.phase=d,k.rt=b,tt(b*(.08+.085*A)*(.7+B(y+3)),M,Math.min(1,A*(.75+.35*B(y+4))),.2,.25,0,y,2),mt(k,0,zt),mt(k,1,Pt),z.xf=!0,z.tx=v,z.ty=g,z.ta=P,nt(zt,Pt)}dn(v,g,b*.62,b*1.08,M,A)}if(n.fibPost>.05){let f=it(n.fibPost),v=o.cvIn,g=v+r*(.1+.85*f);dn(a,l,v,g,m,f)}}function qe(t,n,o=le){let e=ie;if(D.k&&e.shape===t&&e.items===o&&e.iver===o.ver&&e.hsc===t.hsc&&e.nr===n.length){let a=D.k;for(let l=0;l<n.length;l++)a[l]=n[l];return D.ver++,D}return e.shape=t,e.items=o,e.iver=o.ver,e.hsc=t.hsc,e.nr=n.length,se(t,n,o),D}var le=[],re=[],ie={shape:null,items:null,iver:void 0,hsc:null,nr:0},D={k:null,rows:0,hOff:0,nH:0,nk:0,bOff:0,iOff:0,margin:0,nItems:0,ver:0},ot=new Int32Array(0),Ht=new Int32Array(0),Ut=new Int32Array(0),ut=new Int32Array(0),V=new Int32Array(0),Y=0,dt=null,G=(t,n,o,e)=>{dt[Y]=t,dt[Y+1]=n,dt[Y+2]=o,dt[Y+3]=e,Y+=4};function se(t,n,o){let e=t.hsc||re,a=Math.ceil(n.length/4),l=a+e.length*2,r=o.length,i=1.3*t.R,u=t.cx-i,m=t.cy-i,M=Math.max(1,Math.ceil(2*i/ft)),x=M*M,f=l+x;ot.length<x&&(ot=new Int32Array(x),Ht=new Int32Array(x),Ut=new Int32Array(x)),ut.length<r&&(ut=new Int32Array(r),V=new Int32Array(r*4)),ot.fill(0,0,x);let v=2,g=0,T=0,A=t.lobules[0],b=A.x,P=A.y;if(A.corners.length){T=1/0;for(let s=0;s<6;s++){let c=A.corners[s],h=A.corners[(s+1)%6];T=Math.min(T,Math.hypot((c[0]+h[0])/2-b,(c[1]+h[1])/2-P))}}for(let s=0;s<r;s++){let c=o[s],h=c.bc;if(c.type===0){let E=c.band.P,N=c.band.Wd,St=1e9,Tt=-1e9,At=1e9,Ct=-1e9,It=0;for(let W=0;W<27;W++){let $t=E[2*W],Vt=E[2*W+1];St=Math.min(St,$t),Tt=Math.max(Tt,$t),At=Math.min(At,Vt),Ct=Math.max(Ct,Vt),It=Math.max(It,N[W])}let Zt=(St+Tt)/2,Xt=(At+Ct)/2,kt=0;for(let W=0;W<27;W++)kt=Math.max(kt,Math.hypot(E[2*W]-Zt,E[2*W+1]-Xt));h[0]=Zt,h[1]=Xt,h[2]=kt+It*1.1+c.shadow*1.5+3}else h[0]=c.clip[1],h[1]=c.clip[2],h[2]=(c.type===2?c.clip[3]*1.07:c.clip[3])+3;v=Math.max(v,Math.hypot(h[0]-b,h[1]-P)+h[2]-1.015*T),ut[s]=g,g+=c.type===0?32+2*c.fibres.length+2*c.nuclei.length:5;let S=h[0],C=h[1],O=h[2],j=Math.max(0,Math.floor((S-O-u)/ft)),F=Math.min(M-1,Math.floor((S+O-u)/ft)),R=Math.max(0,Math.floor((C-O-m)/ft)),U=Math.min(M-1,Math.floor((C+O-m)/ft));V[4*s]=j,V[4*s+1]=F,V[4*s+2]=R,V[4*s+3]=U;for(let E=R;E<=U;E++)for(let N=j;N<=F;N++)ot[E*M+N]++}let I=0;for(let s=0;s<x;s++)Ht[s]=I,Ut[s]=I,I+=ot[s];let d=f+I,p=d+g,y=Math.max(1,Math.ceil(p/un)),L=un*y*4,w=D.k;!w||w.length<L?w=new Float32Array(L):w.fill(0,0,L),dt=w,Y=0;for(let s=0;s<n.length;s++)w[s]=n[s];for(let s=0;s<e.length;s++){let c=e[s];Y=(a+s*2)*4,G(c.x,c.y,c.a,c.nx),G(c.ny,0,0,0)}for(let s=0;s<x;s++)Y=(l+s)*4,G(Ht[s],ot[s],0,0);for(let s=0;s<r;s++)for(let c=V[4*s+2];c<=V[4*s+3];c++)for(let h=V[4*s];h<=V[4*s+1];h++)w[(f+Ut[c*M+h]++)*4]=d+ut[s];for(let s=0;s<r;s++){let c=o[s],h=c.fibres?c.fibres.length:0,S=c.nuclei?c.nuclei.length:0;if(Y=(d+ut[s])*4,G(c.type,0,c.clip[0],c.a),G(c.rgb[0],c.rgb[1],c.rgb[2],c.w||0),G(c.bc[2],h,S,c.shadow),G(c.clip[1],c.clip[2],c.clip[3],c.clip[4]),G(c.bc[0],c.bc[1],0,0),c.type!==0)continue;let C=c.band.P,O=c.band.N,j=c.band.Wd;for(let F=0;F<27;F++)G(C[2*F],C[2*F+1],j[F],Math.atan2(O[2*F+1],O[2*F]));for(let F=0;F<h;F++){let R=c.fibres[F];G(R.off,R.fp,R.wav,R.iA),G(R.iB,R.lw,R.deep?1:0,0)}for(let F=0;F<S;F++){let R=c.nuclei[F];G(R.x,R.y,R.rx,R.ry),G(R.ang,0,0,0)}}D.k=w,D.rows=y,D.hOff=a,D.nH=e.length,D.nk=M,D.bOff=l,D.iOff=f,D.margin=v,D.nItems=r,D.ver++}function ce(t,n){return t.sin=Wt(.05,.09,n.fibSin),t.act=Wt(.08,.13,n.act),t.fibSin=n.fibSin,t.actV=n.act,t}var Ge=t=>ce({},t),he=t=>.5*Math.hypot(t.l*1.12,t.w*1.3)+Math.min(t.l,t.w)*.45*Math.hypot(t.jx,t.jy)+3,He=`
precision highp int;
uniform highp sampler2D uLC, uLB, uLI;   // the cells, the bins, the bins' cell lists
uniform vec3 uLBox;                // the bitmap's box in world units: x, y, side
uniform vec2 uLN;                  // bins a side, a bin's side
uniform vec3 uLEdge[6];            // the lobule's sides: outward normal, distance from its centre
uniform vec2 uLCtr;                // its centre
uniform vec4 uLCen;                // the central vein's centre, the lobule's radius R, dark (1)
uniform vec4 uLSt;                 // congestion (congU), the plates' disorder (septU), zones on (1)
uniform vec3 uLGap, uLGap55, uLBase, uLNut, uLZ1, uLZ2, uLZ3;
uniform vec4 uLPlate, uLInk, uLZl; // the membrane's, the nucleus's and the zones' lines' colours, with their alphas
uniform float uLive;               // the shader's share of the lobule (the rest is the bitmap)
uniform highp sampler2D uLS, uLK;  // the sinusoids' segments; the per-state texels (radii, stellate cells)
uniform vec4 uLSin;                // the space of Disse collagen's colour and alpha (0: none)
uniform vec4 uLFib;                // the capillarization (fibSin), how far the collagen reaches past the lobule
uniform vec4 uLKB;                 // the bands' bins: a side's count, a bin's side, where the bins and their lists start in uLK
uniform vec4 uLShd, uLShade;       // the septa's shadow's and the fibroblast nuclei's colours and alphas
uniform vec4 uLHs;                 // stellate cells: how many, activation, the sinusoid's radius rs0, where they start in uLK
uniform vec4 uLHB, uLHN;           // their body's and nucleus's colour and alpha
vec4 lvK(int i) { return texelFetch(uLK, ivec2(i & 1023, i >> 10), 0); }
float lvSeg(vec2 p, vec2 a, vec2 b, float ra, float rb) {
  vec2 ba = b - a;
  float t = clamp(dot(p - a, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(p - a - ba * t) - mix(ra, rb, t);
}
float lvEll(vec2 p, vec2 ab) {
  float k0 = length(p / ab), k1 = length(p / (ab * ab));
  return k1 < 1e-9 ? -min(ab.x, ab.y) : k0 * (k0 - 1.0) / k1;
}
// A tapered strand of a stellate cell: ten segments from x0 along u, bowing by bow\xB7rs0 toward \u2212nn, its half width w0 narrowing to 0.
float lvStrand(vec2 p, vec2 x0, vec2 u, vec2 nn, float len, float w0, float bow, float rs0) {
  float best = 1e9, wa = w0;
  vec2 pa = x0;
  for (int i = 1; i <= 10; i++) {
    float t = float(i) / 10.0, b = bow * sin(3.14159265 * t * 0.8) * rs0, wb = w0 * pow(1.0 - t, 1.3);
    vec2 pb = x0 + u * len * t - nn * b;
    best = min(best, lvSeg(p, pa, pb, wa, wb));
    pa = pb; wa = wb;
  }
  return best;
}
float lvCov(float d, float px) { return clamp(0.5 - d / px, 0.0, 1.0); }
// A filled shape thinner than a pixel (wpx: its width in device px): lvCov spreads it over about a pixel each way, so the thinner it is
// the more its weight overshoots its real area. Scaled by this, which is 1 from a pixel wide and 4w/(1+w)\xB2 below (the weight a line of
// that width has once it is spread), detail smaller than a pixel fades out as it shrinks instead of shimmering. (Lines have their own:
// lvLine.)
float lvThin(float wpx) { float q = min(wpx, 1.0); return 4.0 * q / ((1.0 + q) * (1.0 + q)); }
float lvLine(float d, float hw, float px) { float h = max(hw, 0.5 * px); return clamp(0.5 - (abs(d) - h) / px, 0.0, 1.0) * min(1.0, hw / h); }
float lvHex(vec2 p, float k) { float m = -1e9; for (int i = 0; i < 6; i++) m = max(m, dot(uLEdge[i].xy, p - uLCtr) - k * uLEdge[i].z); return m; }
vec4 lvOver(vec4 s, vec4 d) { return s + d * (1.0 - s.a); }
vec3 lvTone(vec3 c, float q, bool dark) { float k = (dark ? 0.12 : 0.16) * (1.0 - smoothstep(0.3, 0.75, q)); return c * vec3(1.0 - 0.35 * k, 1.0 - 0.8 * k, 1.0 - k); }
vec4 lvTint(vec3 rgb, float a) { return vec4(rgb * a, a); }

// Collagen bands (septa, portal tracts, collars): items in uLK (buildDyn). A band is three passes of a variable-width curve (wide and
// faint, middle, narrow and dense; the first with a soft shadow), wavy fibres and spindle nuclei, as fibrousBand lays them.
float lvClip(vec2 wp, float px, vec4 c3, float kind) {
  if (kind < 0.5) return 1.0;
  vec2 d = wp - c3.xy;
  float r = length(d);
  if (kind < 1.5) return lvCov(r - c3.z, px);
  float an = atan(d.y, d.x), ro = c3.z * (1.0 + 0.035 * sin(3.0 * an) + 0.025 * sin(7.0 * an + 0.8));
  return lvCov(max(r - ro, c3.w - r), px);
}
vec2 lvFibV(int pb, int j, float off, float fp, float wav) {
  vec4 q = lvK(pb + j);
  float h = q.z * (off + wav * sin(6.2831853 * 4.0 * float(j) / 26.0 + fp));
  return q.xy + vec2(cos(q.w), sin(q.w)) * h;
}
vec4 lvItem(vec2 wp, float px, int o, vec4 acc) {
  vec4 h0 = lvK(o), h1 = lvK(o + 1), h2 = lvK(o + 2), h3 = lvK(o + 3), h4 = lvK(o + 4);
  if (length(wp - h4.xy) > h2.x + px) return acc;
  float cl = lvClip(wp, px, h3, h0.z);
  if (cl <= 0.0) return acc;
  float a = h0.w;
  if (h0.x > 0.5) return lvOver(lvTint(h1.rgb, a) * cl, acc);
  int pb = o + 5, nf = int(h2.y), nn = int(h2.z);
  float d1 = 1e9, d2 = 1e9, d3 = 1e9, dm = 1e9;
  int jb = 0;
  vec4 pa = lvK(pb);
  for (int i = 1; i <= 26; i++) {
    vec4 pc = lvK(pb + i);
    float ta = min(1.0, float(min(i - 1, 27 - i)) / 26.0 * 4.0), tb = min(1.0, float(min(i, 26 - i)) / 26.0 * 4.0);
    float ea = ta * ta * (3.0 - 2.0 * ta), eb = tb * tb * (3.0 - 2.0 * tb);
    vec2 ba = pc.xy - pa.xy;
    float t = clamp(dot(wp - pa.xy, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0), dd = length(wp - pa.xy - ba * t);
    d1 = min(d1, dd - 0.5 * mix(pa.z * (1.45 + 0.65 * ea), pc.z * (1.45 + 0.65 * eb), t));
    d2 = min(d2, dd - 0.5 * 1.45 * mix(pa.z, pc.z, t));
    d3 = min(d3, dd - 0.5 * mix(pa.z, pc.z, t));
    if (dd < dm) { dm = dd; jb = i - 1; }
    pa = pc;
  }
  // (The shadow: the faint pass's shape blurred, its sigma constant on the screen up to 1 px a world unit. tanh's argument is clamped:
  // zoomed in, px and so sg are small and d1 / sg runs to the thousands, where tanh (e^x \u2212 e^\u2212x) / (e^x + e^\u2212x) gives inf / inf, a NaN
  // that turned whole bins of the lobule black (2 Nov 2026). At \xB110 tanh is \xB11 to float precision, so nothing else changes.)
  float blur = h2.w;
  if (blur > 0.0) {
    float sg = max(0.5 * blur * min(px, 1.0), 1e-3);
    acc = lvOver(lvTint(uLShd.rgb, uLShd.a * 0.12 * a * (0.5 - 0.5 * tanh(clamp(0.85 * d1 / sg, -10.0, 10.0)))), acc);
  }
  float c1 = lvCov(d1, px) * cl;
  acc = lvOver(lvTint(h1.rgb, 0.12 * a) * c1, acc);
  acc = lvOver(lvTint(h1.rgb, 0.24 * a) * (lvCov(d2, px) * cl), acc);
  acc = lvOver(lvTint(h1.rgb, 0.5 * a) * (lvCov(d3, px) * cl), acc);
  if (c1 <= 0.0) return acc;
  int fb = pb + 27;
  for (int f = 0; f < 10; f++) {
    if (f >= nf) break;
    vec4 f0 = lvK(fb + 2 * f), f1 = lvK(fb + 2 * f + 1);
    int iA = int(f0.w), iB = int(f1.x);
    float df = 1e9;
    for (int j = jb - 1; j <= jb + 1; j++) {
      if (j < iA || j + 1 > iB || j < 0 || j > 25) continue;
      vec2 v0 = lvFibV(pb, j, f0.x, f0.y, f0.z), v1 = lvFibV(pb, j + 1, f0.x, f0.y, f0.z);
      df = min(df, lvSeg(wp, v0, v1, 0.0, 0.0));
    }
    if (df > 1e8) continue;
    bool deep = f1.z > 0.5;
    vec3 fc = deep ? h1.rgb * vec3(0.78, 0.74, 0.7) : h1.rgb + (1.0 - h1.rgb) * 0.45;
    acc = lvOver(lvTint(fc, (deep ? 0.32 : 0.55) * a) * (lvLine(df, 0.5 * f1.y, px) * cl), acc);
  }
  int nb2 = pb + 27 + 2 * nf;
  for (int k = 0; k < 14; k++) {
    if (k >= nn) break;
    vec4 n0 = lvK(nb2 + 2 * k), n1 = lvK(nb2 + 2 * k + 1);
    vec2 d = wp - n0.xy;
    float ca = cos(n1.x), sa = sin(n1.x);
    vec2 lp = vec2(ca * d.x + sa * d.y, -sa * d.x + ca * d.y);
    acc = lvOver(lvTint(uLShade.rgb, 0.32 * a) * (lvCov(lvEll(lp, n0.zw), px) * lvThin(2.0 * min(n0.z, n0.w) / px) * cl), acc);
  }
  return acc;
}
vec4 liveTissue(vec2 w) {
  vec2 wp = uLBox.xy + w * uLBox.z;
  float px = uLBox.z / uRect.z, R = uLCen.z, cu = uLSt.x, sj = uLSt.y;
  bool dark = uLCen.w > 0.5;
  float h1 = lvHex(wp, 1.015);
  if (h1 > uLFib.y + 2.0 * px) return vec4(0.0);
  float c1 = lvCov(h1, px);
  vec4 acc = lvTint(uLGap55, 1.0) * c1;
  float hm = lvHex(wp, 1.0), clipC = lvCov(hm, px), ag = dark ? 0.55 : 0.5;
  acc = lvOver(lvTint(uLGap, ag) * clipC, acc);
  if (clipC > 0.0) {
    ivec2 ib = ivec2(floor((wp - uLBox.xy) / uLN.y));
    int nb = int(uLN.x);
    float lw0 = max(0.6, 0.6 * px);
    if (ib.x >= 0 && ib.y >= 0 && ib.x < nb && ib.y < nb) {
      vec2 hd = texelFetch(uLB, ib, 0).rg;
      int st = int(hd.x), cnt = int(hd.y);
      for (int n = 0; n < cnt; n++) {
        int j = st + n;
        int ci = int(texelFetch(uLI, ivec2(j & 1023, j >> 10), 0).r);
        int tx = 3 * (ci & 511), ty = ci >> 9;
        vec4 t0 = texelFetch(uLC, ivec2(tx, ty), 0), t1 = texelFetch(uLC, ivec2(tx + 1, ty), 0), t2 = texelFetch(uLC, ivec2(tx + 2, ty), 0);
        float q = t1.w;
        // (Dead cells of congestion: the bitmap switches a cell at its threshold, and crossfades whole pictures; here the cell's share
        // of "dead" eases in over a small step of congU about each threshold, so cells fade out one by one as it rises, never pop. Away from the
        // thresholds it is 0 or 1, as the bitmap's.)
        float dd = q < 0.4 ? smoothstep(0.105, 0.135, cu) * smoothstep(-0.015, 0.015, cu * (1.25 - q * 1.6) - t2.x) : 0.0;
        float dz = sj * min(t0.w, t1.x) * 0.45;
        float ang = t0.z + t2.w * sj * 0.9;
        float lw = mix(t0.w, t0.w * 0.7, dd) * (1.0 + 0.12 * sj), ww = mix(t1.x, t1.x * 0.7, dd) * (1.0 + 0.3 * sj);
        vec2 d = wp - (t0.xy + t2.yz * dz);
        float ca = cos(ang), sa = sin(ang);
        vec2 lp = vec2(ca * d.x + sa * d.y, -sa * d.x + ca * d.y);
        float r = min(lw, ww) * 0.38;
        vec2 qd = abs(lp) - 0.5 * vec2(lw, ww) + r;
        float sd = length(max(qd, vec2(0.0))) + min(max(qd.x, qd.y), 0.0) - r;
        if (sd > 0.5 * lw0 + px) continue;
        float tt = 0.88 + 0.12 * t1.y;
        vec3 fill = mix(lvTone(uLBase * tt + (1.0 - tt) * (dark ? 0.15 : 1.0) * 0.3, q, dark), dark ? vec3(0.42, 0.33, 0.3) : vec3(0.93, 0.86, 0.72), dd);
        float af = mix(dark ? 0.8 : 0.92, 0.6, dd), live = 1.0 - dd;
        acc = lvOver(lvTint(fill, af) * (lvCov(sd, px) * clipC), acc);
        if (live > 0.0) {
          acc = lvOver(lvTint(uLPlate.rgb, uLPlate.a) * (lvLine(sd, 0.5 * lw0, px) * clipC * live), acc);
          float dn = length(lp - vec2(t1.z * lw, 0.0)) - max(0.9, ww * 0.16);
          acc = lvOver(lvTint(uLInk.rgb, uLInk.a) * (lvCov(dn, px) * clipC * live), acc);
        }
      }
    }
    // Zone 3 congestion: blood pooling round the central vein (the radial gradient from 0.05 R to 0.55 R).
    if (cu > 0.04) {
      float u = clamp((length(wp - uLCen.xy) - 0.05 * R) / (0.5 * R), 0.0, 1.0);
      float a = u < 0.6 ? mix(0.5 * cu, 0.22 * cu, u / 0.6) : mix(0.22 * cu, 0.0, (u - 0.6) / 0.4);
      acc = lvOver(lvTint(uLNut, a) * clipC, acc);
    }
    if (uLSt.z > 0.5) {
      // Zones: the radial gradient of paintLobule (lobule-paint.js ZONE_AT): zone 3 to 0.18 R from the central vein, zone 2 at 0.5 R, zone 1 from 0.85 R.
      float zr = length(wp - uLCen.xy) / R;
      vec3 zc = zr < 0.5 ? mix(uLZ3, uLZ2, clamp((zr - 0.18) / 0.32, 0.0, 1.0)) : mix(uLZ2, uLZ1, clamp((zr - 0.5) / 0.35, 0.0, 1.0));
      acc = lvOver(lvTint(zc, dark ? 0.2 : 0.17) * clipC, acc);
    }
    // Space of Disse collagen: a round-capped stroke along each sinusoid, one alpha a tube (its segments' union), tubes laid in order.
    if (uLSin.a > 0.0 && ib.x >= 0 && ib.y >= 0 && ib.x < nb && ib.y < nb) {
      vec2 sh = texelFetch(uLB, ib, 0).ba;
      int sst = int(sh.x), scn = int(sh.y), curT = -1;
      float curC = 0.0;
      for (int n = 0; n < scn; n++) {
        int j = sst + n, si = int(texelFetch(uLI, ivec2(j & 1023, j >> 10), 0).r);
        int sx = 2 * (si & 511), sy = si >> 9;
        vec4 sg = texelFetch(uLS, ivec2(sx, sy), 0);
        int tb = int(texelFetch(uLS, ivec2(sx + 1, sy), 0).r);
        if (tb != curT) {
          if (curT >= 0) acc = lvOver(lvTint(uLSin.rgb, uLSin.a) * (curC * clipC), acc);
          curT = tb; curC = 0.0;
        }
        float hw = lvK(tb >> 2)[tb & 3] + 1.0 + 1.75 * uLFib.x;
        curC = max(curC, lvCov(lvSeg(wp, sg.xy, sg.zw, hw, hw), px));
      }
      if (curT >= 0) acc = lvOver(lvTint(uLSin.rgb, uLSin.a) * (curC * clipC), acc);
    }
    // Stellate (Ito) cells: a spindle body with four tapered strands (one fill), and a nucleus over it.
    if (uLHs.x > 0.5) {
      float ac = uLHs.y, rs0 = uLHs.z, L = rs0 * (2.4 + 1.4 * ac), Wb = rs0 * (0.42 + 0.2 * ac);
      int hOff = int(uLHs.w);
      for (int h = 0; h < 32; h++) {
        if (h >= int(uLHs.x)) break;
        vec4 h0 = lvK(hOff + 2 * h), h1 = lvK(hOff + 2 * h + 1);
        vec2 d = wp - h0.xy;
        float rr = 3.2 * L + rs0 + 2.0 * px;
        if (dot(d, d) > rr * rr) continue;
        vec2 u = vec2(cos(h0.z), sin(h0.z)), nn = vec2(h0.w, h1.x);
        vec2 lp = vec2(dot(d, u), dot(d, vec2(-u.y, u.x)));
        float sd = lvEll(lp, vec2(L * 0.6, Wb));
        for (int g = 0; g < 2; g++) {
          float sg = g == 0 ? -1.0 : 1.0;
          vec2 x0 = h0.xy + u * sg * L * 0.45;
          sd = min(sd, lvStrand(wp, x0, u * sg, nn, L * (2.0 + 0.6 * ac), Wb * 0.55, 0.45, rs0));
          sd = min(sd, lvStrand(wp, x0, u * sg, nn, L * (1.1 + 0.4 * ac), Wb * 0.35, -0.25, rs0));
        }
        acc = lvOver(lvTint(uLHB.rgb, uLHB.a) * (lvCov(sd, px) * lvThin(2.0 * Wb / px) * clipC), acc);
        acc = lvOver(lvTint(uLHN.rgb, uLHN.a) * (lvCov(lvEll(lp, vec2(L * 0.26, Wb * 0.5)), px) * lvThin(Wb / px) * clipC), acc);
      }
    }
  }
  // Healthy: just the limiting plate, a hairline (not clipped).
  if (sj < 0.05) acc = lvOver(lvTint(uLPlate.rgb, uLPlate.a * (1.0 - smoothstep(0.0, 0.05, sj))) * lvLine(hm, 0.5, px), acc);
  // The septa, the portal tracts and the central collar, in the order they are laid.
  if (uLKB.x > 0.5) {
    int nk = int(uLKB.x);
    ivec2 ik = ivec2(floor((wp - uLBox.xy) / uLKB.y));
    if (ik.x >= 0 && ik.y >= 0 && ik.x < nk && ik.y < nk) {
      vec4 bh = lvK(int(uLKB.z) + ik.y * nk + ik.x);
      int st = int(bh.x), ct = int(bh.y), ib0 = int(uLKB.w);
      for (int n = 0; n < ct; n++) acc = lvItem(wp, px, int(lvK(ib0 + st + n).x), acc);
    }
  }
  return acc;
}
`;export{ue as a,pe as b,de as c,xe as d,ve as e,gn as f,me as g,be as h,zn as i,Me as j,ye as k,we as l,ge as m,Le as n,Te as o,Q as p,it as q,En as r,on as s,Ae as t,X as u,st as v,fn as w,ct as x,un as y,Fe as z,Be as A,Xn as B,je as C,Re as D,$n as E,Ee as F,_e as G,ht as H,Ke as I,De as J,Ne as K,qe as L,ce as M,Ge as N,he as O,He as P};
