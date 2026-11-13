// ?embed: the app inside an iframe (a fellowship site, an LMS page; O1, 13 Nov 2026). index.html sets data-embed on <html> before the
// first paint (so the top bar never shows); this is the same answer for code. In an embed: no top bar, no first-run hint, no feedback
// ask, no offline worker (it would install on someone else's page), and a talk stays on its last slide instead of ending.
// Use it with a deep link: ?embed&preset=<id> or ?embed&script=<id>&slide=<n>. docs/embed.md has the iframe code.

export const EMBED = typeof document !== 'undefined' && document.documentElement.hasAttribute('data-embed');
