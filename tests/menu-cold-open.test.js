// Premium feel R15: the menu opens in one frame and fills in the next. The frame (header, tabs, the Patients list) is built in the tap's own
// frame whether or not the presentations have arrived; when they do, they rise into place instead of replacing the note at once, and
// the "Loading…" note itself shows only if the wait runs past 0.4 s.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const menu = readFileSync(new URL('../src/ui/menu.js', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/ui/main.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');

test('R15 a tap builds and shows the menu in its own frame, without waiting for the presentations', () => {
  assert.match(main, /\$\('#btnMenu'\)\.addEventListener\('click', \(\) => mainMenu\.toggle\(\)\);/);
  const open = menu.slice(menu.indexOf('    open(section, opts = {}) {'), menu.indexOf('    close,\n'));
  // (The library is asked for after the menu is on the page, never before it.)
  assert.ok(open.indexOf('document.body.append(el)') < open.indexOf('nextFrame(askLibrary)'), 'the frame is up before the library is asked for');
  assert.match(open, /const sheet = sheetMQ\.matches, lib = libraryNow\(\);/, 'what is there now, not a wait');
  assert.doesNotMatch(open.slice(0, open.indexOf('nextFrame(askLibrary)')), /await /);
});

test('R15 a cold fill rises into place with the tab change\'s own fade-rise, and not under Reduce Motion', () => {
  assert.match(menu, /el = build\(lib\); coldOpen = !lib;/);
  assert.match(menu, /if \(coldOpen && lib\) \{ coldOpen = false; if \(!reduce\.matches\) next\.querySelector\('\.um-col\[data-col="present"\]'\)\?\.classList\.add\('um-in'\); \}\s+else if \(!lib\) coldOpen = true;/);
  assert.match(css, /\.um-col\.um-in \{ animation: fade-rise var\(--d-flip\) var\(--ease\); \}/, 'the existing treatment, not a new one');
});

test('R15 the wait note comes up only if the wait runs past 0.4 s', () => {
  assert.match(menu, /h\('p', \{ class: 'um-note um-wait' \}, 'Loading…'\)/);
  assert.match(css, /\.um-note\.um-wait \{ animation: crossfade var\(--d-small\) var\(--ease\) \.4s backwards; \}/);
  assert.match(css, /@keyframes crossfade \{ from \{ opacity: 0; \} \}/);
});
