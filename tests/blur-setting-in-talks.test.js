// Blur effect (28 Oct): the same switch, and the same stored value, in the app's Settings and in a talk's Settings.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../src/ui/main.js', import.meta.url), 'utf8');
const settings = main.slice(main.indexOf('function openSettings('), main.indexOf('function presenterSettings('));
