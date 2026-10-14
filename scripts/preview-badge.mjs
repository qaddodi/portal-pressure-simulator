// Marks a copy of the site as a preview: a "PREVIEW" pill in the corner and a title prefix.
// Run by .github/workflows/pages.yml on the /preview/ copy only, so the badge never exists in
// the source and nothing has to be removed when a branch is merged.
//
//   node scripts/preview-badge.mjs <site-dir> <label>

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// Tapping the pill loads the newest preview in an installed (home-screen) app, where there is no
// reload button: drop the service worker and its caches, then reload with a cache-busting URL. The URL is the app's own
// resumeUrl() (the same presentation slide, or the same patient and view), so the reload lands where the viewer was.
// The pill's own script, run as a function body so tests/preview-badge.test.js can drive it.
export const RELOAD_JS = `(function(){var b=document.getElementById('preview-badge');if(!b)return;var busy=0;b.addEventListener('click',function(){if(busy)return;busy=1;b.textContent='RELOADING…';var go=function(){var u;try{u=new URL(window.pps.resumeUrl());}catch(e){u=new URL(location.href);}u.searchParams.set('r',Date.now());location.replace(u.href);};var t=setTimeout(go,3000);var all=function(){var p=[];if(navigator.serviceWorker&&navigator.serviceWorker.getRegistrations)p.push(navigator.serviceWorker.getRegistrations().then(function(rs){return Promise.all(rs.map(function(r){return r.unregister();}));}));if(window.caches&&caches.keys)p.push(caches.keys().then(function(ks){return Promise.all(ks.map(function(k){return caches.delete(k);}));}));return Promise.all(p);};all().catch(function(){}).then(function(){clearTimeout(t);go();});});})();`;

// Absolute, not fixed: on iOS 26 an installed app's top bar stays sharp under the status bar only
// while the app's own fixed layer is the one fixed element there; a second fixed element at the top
// edge (this pill) makes iOS blur that strip again. The page never scrolls, so it stays in place.
// A slim tab, 13 px tall, hanging from the top edge: slide words and chips start below it (tests/e2e/phone-fit.mjs).
export const badgeHtml = (label) => `<div id="preview-badge" role="button" style="position:absolute;left:50%;transform:translateX(-50%);top:env(safe-area-inset-top);z-index:2147483647;cursor:pointer;-webkit-tap-highlight-color:transparent;padding:0 7px;border-radius:0 0 7px 7px;background:#d9480f;color:#fff;font:700 9px/13px system-ui,sans-serif;letter-spacing:.08em;box-shadow:0 1px 4px rgba(0,0,0,.35)">PREVIEW${label ? ` · ${esc(label)}` : ''}</div><script>${RELOAD_JS}</script>`;

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [dir, label = ''] = process.argv.slice(2);
  if (!dir) { console.error('usage: node scripts/preview-badge.mjs <site-dir> <label>'); process.exit(1); }
  const file = join(dir, 'index.html');
  let html = readFileSync(file, 'utf8');
  if (!html.includes('</body>') || !html.includes('<title>')) { console.error('index.html: no </body> or <title> to mark'); process.exit(1); }
  html = html.replace('<title>', '<title>PREVIEW · ').replace('</body>', () => `${badgeHtml(label)}\n</body>`);
  writeFileSync(file, html);
  console.log(`Marked ${file} as preview`);
}
