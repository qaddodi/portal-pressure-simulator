// Blur effect (28 Oct): the same switch, and the same stored value, in the app's Settings and in a talk's Settings.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../src/ui/main.js', import.meta.url), 'utf8');
const settings = main.slice(main.indexOf('function openSettings('), main.indexOf('function presenterSettings('));

test('Blur effect is one switch outside the not-in-a-talk block, so a talk shows it too', () => {
  assert.equal(settings.split("'Blur effect'").length - 1, 1, 'one switch, not a second copy for talks');
  assert.ok(settings.indexOf("'Blur effect'") < settings.indexOf('...(talk ? [] : ['), 'before the block talks leave out');
  assert.ok(settings.indexOf("'Accessibility'") < settings.indexOf("'Blur effect'"), 'under its Accessibility heading');
  assert.ok(settings.indexOf("'Blur effect'") < settings.indexOf("'Always show HVPG'"), 'ahead of the rows only the app keeps');
  assert.match(settings, /localStorage\.setItem\('pps\.noGlass'/);
  assert.match(settings, /toggleAttribute\('data-noglass', !on\)/);
});
