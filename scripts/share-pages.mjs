// Writes one tiny page per patient and per presentation under <site>/c/, so a shared link's preview in
// iMessage, Slack and the like shows that case's title. Link previewers read the HTML without running the
// app, so the title has to be in the file. Each page sends the browser straight on to the app, keeping the
// link's #s= state. Run on the assembled site at deploy time: node scripts/share-pages.mjs <site dir>
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = 'Portal Pressure Simulator';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const field = (src, key) => { const m = src.match(new RegExp(`\\b${key}: '((?:\\\\.|[^'\\\\])*)'`)); return m ? m[1].replace(/\\(.)/g, '$1') : ''; };

export function sharePage({ title, summary, target }) {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)} · ${APP}</title>
<meta property="og:title" content="${esc(title)}" />
<meta property="og:site_name" content="${APP}" />
${summary ? `<meta property="og:description" content="${esc(summary)}" />\n<meta name="description" content="${esc(summary)}" />\n` : ''}<meta name="twitter:card" content="summary" />
<script>location.replace(${JSON.stringify(target)} + location.hash);</script>
</head><body><a href="${esc(target)}">Open ${esc(title)}</a></body></html>
`;
}

export async function cases() {
  const { PRESETS } = await import(pathToFileURL(join(ROOT, 'src/engine/scenario.js')).href);
  const out = PRESETS.map((p) => ({ file: `${p.id}.html`, title: p.label, summary: p.summary, target: '../' }));
  const dir = join(ROOT, 'src/ui/decks');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.js')).sort()) {
    let src = readFileSync(join(dir, f), 'utf8');
    const id = field(src, 'id');
    src = src.slice(src.indexOf(`id: '${id}'`));
    if (id) out.push({ file: `deck-${id}.html`, title: field(src, 'title'), summary: field(src, 'summary'), target: `../?script=${encodeURIComponent(id)}` });
  }
  // A talk merged into another keeps its old share page: it names the deck that took its slides and opens it (decks.js DECK_ALIAS).
  const { DECK_ALIAS, DECKS } = await import(pathToFileURL(join(ROOT, 'src/ui/decks.js')).href);
  for (const [old, now] of Object.entries(DECK_ALIAS)) {
    const to = DECKS.find((d) => d.id === now);
    if (to && !out.some((c) => c.file === `deck-${old}.html`)) out.push({ file: `deck-${old}.html`, title: to.title, summary: to.summary, target: `../?script=${encodeURIComponent(now)}` });
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const site = process.argv[2];
  if (!site) throw new Error('usage: node scripts/share-pages.mjs <site dir>');
  mkdirSync(join(site, 'c'), { recursive: true });
  const list = await cases();
  for (const c of list) writeFileSync(join(site, 'c', c.file), sharePage(c));
  console.log(`${list.length} share pages in ${join(site, 'c')}`);
}
