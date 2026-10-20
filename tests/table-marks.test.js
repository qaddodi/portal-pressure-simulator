// Every arrow in every summary table is recomputed here from the model state its row shows, against cut-offs written
// out independently below (the readouts' status colors). A cell reads the value as the table prints it, so the same
// printed number always carries the same arrow. A few clinical facts are pinned by name (a meal raises portal flow).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { deckStates, runSteps as run } from './deck-states.js';
import { CUT, dirAbs, dirRel, fpv, atShown } from '../src/ui/table-marks.js';

const DIR = new URL('../src/ui/decks/', import.meta.url);
// [value as printed] → arrow: 2 / 1 up, 0 normal, -1 / -2 down.
const band = (v, lo, hi) => (v > hi ? 2 : v > lo ? 1 : 0);
const SPEC = {
  pv: (v) => band(v, 10, 14), whvp: (v) => band(v, 10, 14), fhvp: (v) => band(v, 8, 16), ivc: (v) => band(v, 8, 16), ra: (v) => band(v, 8, 16),
  hvpg: (v) => (v >= 10 ? 2 : v >= 5 ? 1 : 0), ppg: (v) => (v >= 12 ? 2 : v >= 6 ? 1 : 0), sin: (v) => (v >= 12 ? 2 : v >= 9 ? 1 : 0),
  varix: (v) => (v >= 5 ? 2 : v >= 2.5 ? 1 : 0), lsm: (v) => (v >= 25 ? 2 : v >= 10 ? 1 : 0), spleen: (v) => band(v, 13, 16),
  plt: (v) => (v < 100 ? -2 : v < 150 ? -1 : 0), liver: (v) => (v <= 55 ? -2 : v <= 75 ? -1 : 0), shunt: (v) => (v >= 0.3 ? 2 : v >= 0.1 ? 1 : 0),
  map: (v) => (v < 65 ? -2 : 0), asc: (v) => (v < 150 ? 0 : v < 1500 ? 1 : 2),
  pvFlow: (v, f) => (v < -0.02 || Math.abs(f.pvVel) < 9 ? -2 : v < 0.9 ? -1 : v > 1.3 ? 1 : 0),
};
// Each heading's cut-off text names the numbers the arrows use.
const CUT_NUMS = { pv: ['10', '15'], whvp: ['10', '15'], fhvp: ['8', '16'], ivc: ['8', '16'], ra: ['8', '16'], hvpg: ['5', '10'], ppg: ['6', '12'], sin: ['9', '12'],
  varix: ['2.5', '5'], lsm: ['10', '25'], spleen: ['13', '16'], plt: ['150', '100'], liver: ['75', '55'], shunt: ['10', '30'], map: ['65'], pvFlow: ['0.9', '1.3'] };

test('every heading states the cut-offs its arrows use', () => {
  for (const [k, nums] of Object.entries(CUT_NUMS)) for (const n of nums) assert.match(CUT[k], new RegExp(`(^|[^\\d.])${n.replace('.', '\\.')}(?![\\d.]*\\d)`), `${k}: "${CUT[k]}" lacks ${n}`);
});

test('every summary-table arrow matches its row\'s model state', async () => {
  const bad = [], cells = {};
  for (const file of readdirSync(DIR).filter((x) => x.endsWith('.js'))) {
    const d = Object.values(await import(new URL(file, DIR))).find((v) => Array.isArray(v?.slides));
    const tables = d.slides.filter((s) => s.visual === 'table');
    if (!tables.length) continue;
    const fps = await deckStates(d);
    for (const t of tables) {
      const extra = (t.of || []).filter((o) => typeof o === 'object' && !o.id);
      const xfps = extra.length ? await run(extra.map((o) => ({ preset: o.preset, presetDays: o.presetDays, params: o.params }))) : [];
      const rows = (t.of || []).map((o) => {
        const x = typeof o === 'object' ? o : { id: o }, i = x.id ? d.slides.findIndex((s) => s.id === x.id) : -1;
        return { ...x, f: i >= 0 ? fps[i] : xfps[extra.indexOf(o)], title: x.title ?? d.slides[i]?.title };
      });
      const rel = t.vs === 'first' || rows.some((r) => r.vs);
      const fpOf = (id) => rows.find((r) => r.key === id)?.f ?? fps[d.slides.findIndex((s) => s.id === id)];
      rows.forEach((r, n) => {
        assert.ok(r.f, `${d.id}/${t.id}: row ${r.title} has no state`);
        const isRef = r.ref || (rel && !r.vs && n === 0);
        for (const k of t.cols || []) {
          if (isRef || (r.blank || []).includes(k)) continue;
          if (k === 'wave') continue;   // (a small Doppler trace, panels-e.test.js; no arrow)
          if (k === 'spleen' && !(r.f.spleen > 0)) continue;   // (splenectomy: "Removed")
          const got = rel ? dirRel(k, r.f, r.vs ? fpOf(r.vs) : rows[0].f) : dirAbs(k, r.f);
          let want;
          if (rel) {
            const a = atShown(k, fpv(k, r.f)), b = atShown(k, fpv(k, r.vs ? fpOf(r.vs) : rows[0].f)), dd = a - b;
            const step = { asc: 100, varix: .3, liver: 2, shunt: .05, pvFlow: .15, res: 1.5, map: 2, hr: 2 }[k] ?? (k === 'lsm' || k === 'spleen' || k === 'plt' ? 1 : .5);
            want = Math.abs(dd) < step ? 0 : Math.sign(dd) * (Math.abs(dd) / Math.max(Math.abs(b), 1e-6) >= 0.4 ? 2 : 1);
          } else {
            if (!SPEC[k]) continue;
            want = SPEC[k](atShown(k, fpv(k, r.f)), r.f);
          }
          cells[`${d.id}/${r.title}/${k}`] = got;
          if (got !== want) bad.push(`${d.id}/${t.id} ${r.title} ${k}: ${got} (want ${want}) at ${fpv(k, r.f)}`);
        }
      });
    }
  }
  assert.deepEqual(bad, []);
  // Pinned by name.
  assert.equal(cells['circulation/After a meal/pvFlow'], 1, 'a meal raises portal flow above the fasting range');
  assert.equal(cells['two-inflows/Hepatic artery clot/liver'], -1, 'a hepatic artery clot lowers liver blood flow');
  assert.equal(cells['two-inflows/Portal vein clot/pvFlow'], -2, 'a portal vein clot stops portal flow');
  assert.ok(cells['circuit/With collaterals/ppg'] < 0, 'against the same liver, collaterals lower the gradient');
  assert.equal(cells['circuit/With collaterals/res'], 0, 'collaterals leave the liver\'s own resistance alone');
});

test('tables that cannot be measured or have no organ say so', async () => {
  const { OUTFLOW } = await import(new URL('outflow.js', DIR));
  const t = OUTFLOW.slides.find((s) => s.visual === 'table');
  assert.deepEqual(t.of.find((o) => o.id === 'bcs').blank, ['whvp', 'fhvp', 'hvpg'], 'clotted hepatic veins cannot be wedged');
  const { DOPPLER } = await import(new URL('doppler.js', DIR));
  for (const o of DOPPLER.slides.find((s) => s.visual === 'table').of) assert.ok([o.note].flat().every(Boolean), `Doppler row ${o.title} has an empty cell`);
});

test('every tile rating is a word or two, short enough for one line in a phone tile', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/ui/table-marks.js', import.meta.url), 'utf8') + readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8').match(/const rated = .*$/m)[0];
  const words = [...src.matchAll(/\[(?:'\w+'|null), '([^']+)'\]/g)].map((m) => m[1]);
  assert.ok(words.length > 10);
  const long = words.filter((w) => w.length > 12 || w.split(' ').length > 2);
  assert.deepEqual(long, []);
});
