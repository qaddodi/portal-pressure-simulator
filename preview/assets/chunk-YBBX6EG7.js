function s(n,t,o){let e=n?.on?n.d:0,r=t?.on?t.d:0;return!n||!t||!(e||r)||o<=0?o<.5?n:t:o>=1?t:{...t.on?t:n,d:Math.max(.05,e+(r-e)*o),on:!0}}var x=3,D=(n,t)=>(n?.D?.[t]??0)>=x;export{s as a,D as b};
