import { stageSource } from './stage-src.js';
// The Circuit's readings during a hand's zoom (Mohammad, 26 Oct: "the problem is during the zoom itself it's very very choppy", and
// his pick "Re-place only the bumped reading"): a carried reading that comes onto a station's ring is placed again by itself, the
// others carried; once let go all are solved again. Source patterns (no browser in node).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const stage = stageSource();
const pm = stage.slice(stage.indexOf('const placeMulti = '), stage.indexOf("if (!circuit) {\n      // ── Anatomy ──"));

