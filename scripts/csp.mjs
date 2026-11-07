// Content Security Policy for a built page (PR-07). GitHub Pages cannot send headers, so the policy is a <meta> in the page's head.
// The page has no third-party script and no user-written HTML; the three boot scripts and the preview pill's script are inline, so each is
// allowed by its SHA-256 hash, computed from the final page text. Anything that edits an inline script afterwards (scripts/preview-badge.mjs
// adds one) calls withCsp again, which replaces the old meta. A source page (`npm start`) has no policy.
import { createHash } from 'node:crypto';

const META = /\s*<meta http-equiv="Content-Security-Policy"[^>]*>/;
const INLINE = /<script(?![^>]*\ssrc=)([^>]*)>([\s\S]*?)<\/script>/g;

export const inlineHashes = (html) => {
  const out = [];
  for (const m of html.replace(META, '').matchAll(INLINE)) {
    if (/type\s*=\s*["']?(?!module|text\/javascript)/.test(m[1])) continue;   // (a data block is never run)
    if (!m[2].trim()) continue;
    out.push(`'sha256-${createHash('sha256').update(m[2]).digest('base64')}'`);
  }
  return [...new Set(out)];
};

export const policy = (html) => [
  "default-src 'self'",
  `script-src 'self' ${inlineHashes(html).join(' ')}`.trim(),
  "style-src 'self' 'unsafe-inline'",   // (style="" attributes are set throughout; styles carry no script)
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' data: blob:",
  "worker-src 'self' blob:",
  "media-src 'self' blob: data:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

export const withCsp = (html) => {
  const clean = html.replace(META, '');
  const tag = `  <meta http-equiv="Content-Security-Policy" content="${policy(clean).replace(/"/g, '&quot;')}" />`;
  // (Right after the charset meta, which must stay in the first 1024 bytes; the policy covers only what comes after it, and no script comes before.)
  return clean.replace(/<meta charset[^>]*>/i, (m) => `${m}\n${tag}`);
};
