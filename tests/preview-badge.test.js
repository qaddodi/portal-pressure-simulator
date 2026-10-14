// The preview pill reloads the installed app onto the newest build: unregisters the service worker,
// clears its caches, then reloads with a cache-busting URL.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RELOAD_JS, badgeHtml } from '../scripts/preview-badge.mjs';

function setup({ failUnregister = false, resume } = {}) {
  const log = [];
  let click;
  const pill = { textContent: 'PREVIEW · abc1234', addEventListener: (_t, fn) => { click = fn; } };
  const g = {
    document: { getElementById: (id) => (id === 'preview-badge' ? pill : null) },
    navigator: { serviceWorker: { getRegistrations: async () => [{ unregister: async () => { log.push('unregister'); if (failUnregister) throw new Error('x'); } }] } },
    caches: { keys: async () => ['a', 'b'], delete: async (k) => { log.push('delete ' + k); } },
    pps: resume === undefined ? undefined : { resumeUrl: resume },
    location: { href: 'https://x.github.io/portal/preview/?lang=en', replace: (u) => log.push('replace ' + u) },
  };
  g.window = g;
  new Function('document', 'navigator', 'window', 'caches', 'location', RELOAD_JS)(g.document, g.navigator, g.window, g.caches, g.location);
  return { click, pill, log };
}
const settle = () => new Promise((r) => setTimeout(r, 20));

test('tap drops the service worker and caches, then reloads with a fresh URL', async () => {
  const { click, pill, log } = setup();
  click(); click();
  await settle();
  assert.equal(pill.textContent, 'RELOADING…');
  assert.deepEqual(log.slice(0, 3), ['unregister', 'delete a', 'delete b']);
  const last = log.at(-1);
  assert.match(last, /^replace https:\/\/x\.github\.io\/portal\/preview\/\?lang=en&r=\d+$/);
  assert.equal(log.filter((l) => l.startsWith('replace')).length, 1);
});

test('a failing cleanup still reloads', async () => {
  const { click, log } = setup({ failUnregister: true });
  click();
  await settle();
  assert.equal(log.filter((l) => l.startsWith('replace')).length, 1);
});

test('badge is tappable and carries the script', () => {
  const html = badgeHtml('abc1234');
  assert.match(html, /id="preview-badge"/);
  assert.doesNotMatch(html, /pointer-events:none/);
  assert.match(html, /<script>.*addEventListener\('click'/s);
});

test('the reload goes back to where the app says it was', async () => {
  const { click, log } = setup({ resume: () => 'https://x.github.io/portal/preview/?back=1&script=sites&slide=7' });
  click();
  await settle();
  assert.match(log.at(-1), /^replace https:\/\/x\.github\.io\/portal\/preview\/\?back=1&script=sites&slide=7&r=\d+$/);
});

test('an app that cannot say where it was still reloads the current URL', async () => {
  const { click, log } = setup({ resume: () => { throw new Error('not ready'); } });
  click();
  await settle();
  assert.match(log.at(-1), /^replace https:\/\/x\.github\.io\/portal\/preview\/\?lang=en&r=\d+$/);
});
