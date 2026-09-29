// Marks a copy of the site as a preview: a "PREVIEW" pill in the corner and a title prefix.
// Run by .github/workflows/pages.yml on the /preview/ copy only, so the badge never exists in
// the source and nothing has to be removed when a branch is merged.
//
//   node scripts/preview-badge.mjs <site-dir> <label>

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [dir, label = ''] = process.argv.slice(2);
if (!dir) { console.error('usage: node scripts/preview-badge.mjs <site-dir> <label>'); process.exit(1); }

const file = join(dir, 'index.html');
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const badge = `<div id="preview-badge" aria-hidden="true" style="position:fixed;left:8px;bottom:calc(8px + env(safe-area-inset-bottom));z-index:2147483647;pointer-events:none;padding:3px 9px;border-radius:999px;background:#d9480f;color:#fff;font:700 11px/1.4 system-ui,sans-serif;letter-spacing:.08em;box-shadow:0 1px 4px rgba(0,0,0,.35)">PREVIEW${label ? ` · ${esc(label)}` : ''}</div>`;

let html = readFileSync(file, 'utf8');
if (!html.includes('</body>') || !html.includes('<title>')) { console.error('index.html: no </body> or <title> to mark'); process.exit(1); }
html = html.replace('<title>', '<title>PREVIEW · ').replace('</body>', `${badge}\n</body>`);
writeFileSync(file, html);
console.log(`Marked ${file} as preview`);
