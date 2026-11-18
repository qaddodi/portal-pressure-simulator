// Writes one tiny page per patient and per presentation under <site>/c/, so a shared link's preview in
// iMessage, Slack and the like shows that case's title. Link previewers read the HTML without running the
// app, so the title has to be in the file. Each page sends the browser straight on to the app, keeping the
// link's #s= state. Each page also names that case's picture (brand/share/<patient id>.jpg or deck-<deck id>.jpg, 1200x630, made by
// scripts/share-stills.mjs) when the site has it, so a link pasted into iMessage, WhatsApp or Slack shows the figure.
// Run on the assembled site at deploy time: node scripts/share-pages.mjs <site dir> [<the site's public address, for the picture's absolute URL>]
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = 'Portal Pressure Simulator';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const field = (src, key) => { const m = src.match(new RegExp(`\\b${key}: '((?:\\\\.|[^'\\\\])*)'`)); return m ? m[1].replace(/\\(.)/g, '$1') : ''; };

export function sharePage({ title, summary, target, image = '', base = '' }) {
  // (Link previewers want an absolute address; with no public address given the picture is named relative to this page, which most read too.)
  const img = image ? (base ? `${base.replace(/\/+$/, '')}/brand/share/${image}` : `../brand/share/${image}`) : '';
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)} · ${APP}</title>
<meta property="og:title" content="${esc(title)}" />
<meta property="og:site_name" content="${APP}" />
${summary ? `<meta property="og:description" content="${esc(summary)}" />\n<meta name="description" content="${esc(summary)}" />\n` : ''}${img ? `<meta property="og:type" content="website" />
<meta property="og:image" content="${esc(img)}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="${esc(title)}: the figure as the simulator draws it." />
<meta name="twitter:image" content="${esc(img)}" />
` : ''}<meta name="twitter:card" content="${img ? 'summary_large_image' : 'summary'}" />
<script>location.replace(${JSON.stringify(target)} + location.hash);</script>
</head><body><a href="${esc(target)}">Open ${esc(title)}</a></body></html>
`;
}

export async function cases() {
  const { PRESETS } = await import(pathToFileURL(join(ROOT, 'src/engine/scenario.js')).href);
  const out = PRESETS.map((p) => ({ file: `${p.id}.html`, title: p.label, summary: p.summary, target: '../', image: `${p.id}.jpg` }));
  const dir = join(ROOT, 'src/ui/decks');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.js')).sort()) {
    let src = readFileSync(join(dir, f), 'utf8');
    const id = field(src, 'id');
    src = src.slice(src.indexOf(`id: '${id}'`));
    if (id) out.push({ file: `deck-${id}.html`, title: field(src, 'title'), summary: field(src, 'summary'), target: `../?script=${encodeURIComponent(id)}`, image: `deck-${id}.jpg` });
  }
  // A talk merged into another keeps its old share page: it names the deck that took its slides and opens it (decks.js DECK_ALIAS).
  const { DECK_ALIAS, DECKS } = await import(pathToFileURL(join(ROOT, 'src/ui/decks.js')).href);
  for (const [old, now] of Object.entries(DECK_ALIAS)) {
    const to = DECKS.find((d) => d.id === now);
    if (to && !out.some((c) => c.file === `deck-${old}.html`)) out.push({ file: `deck-${old}.html`, title: to.title, summary: to.summary, target: `../?script=${encodeURIComponent(now)}`, image: `deck-${now}.jpg` });
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const site = process.argv[2];
  if (!site) throw new Error('usage: node scripts/share-pages.mjs <site dir>');
  mkdirSync(join(site, 'c'), { recursive: true });
  const base = process.argv[3] || '';
  const list = await cases();
  // (A case without its picture yet names none: the page then reads as before, a title and a summary.)
  for (const c of list) writeFileSync(join(site, 'c', c.file), sharePage({ ...c, base, image: existsSync(join(site, 'brand', 'share', c.image)) ? c.image : '' }));
  console.log(`${list.length} share pages in ${join(site, 'c')}`);
}
