// A time-lapse starts from a patient whose slow organs have settled to the state it is played from (the spleen, so the platelets), or its first months
// run them to that state: "platelets 160, 148, 142, 143 ... 175" on a slide that teaches a rise (tester, 16 Nov 2026). Every deck's ramp, one reading a
// day on the platelets (for a slide that shows them), never turns back by more than a percent of its start.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { changes } from './deck-states.js';

const DIR = new URL('../src/ui/decks/', import.meta.url);
const files = readdirSync(DIR).filter((f) => f.endsWith('.js'));
const MODEL_KEYS = (s) => ({ preset: s.preset, presetDays: s.presetDays, params: s.params, action: s.action, days: s.days, relax: s.relax, ramp: s.ramp, fine: !!s.lapse });

for (const f of files) {
  const mod = await import(new URL(f, DIR)).catch(() => null);
  const decks = mod ? Object.values(mod).flatMap((v) => (v && Array.isArray(v.slides) ? [v] : Array.isArray(v) ? v.filter((x) => x && Array.isArray(x.slides)) : [])) : [];
  for (const d of decks) {
    d.slides.forEach((s, i) => {
      const shows = (s.tiles || []).includes('plt') || (s.tool?.lines || []).includes('plt');   // (only a slide that reads the platelets: another reading's slide is not judged on them)
      if (!s.ramp || !s.days || !shows) return;
      test(`${d.id || f} slide ${i + 1} (${s.id}): the platelets run one way along the ramp`, async () => {
        let from = i; while (from > 0 && !d.slides[from].preset) from--;   // (a preset starts the chain over)
        const steps = d.slides.slice(from, i + 1).map((x, k) => (changes(x) ? { ...MODEL_KEYS(x), ...(from + k === i ? { trail: ['plt'] } : {}) } : {}));
        const trail = [];
        const { createCore } = await import('../src/worker-core.js');
        const core = createCore((m) => { if (m.type === 'seqStep' && m.trail) trail.push(...m.trail); });
        core.handle({ type: 'run', running: false });
        await core.handle({ type: 'sequence', steps, reqId: 1 });
        core.dispose();
        const v = trail.map((p) => p[1]).filter(Number.isFinite);
        assert.ok(v.length > 3, 'a trail of readings');
        const sign = Math.sign(v.at(-1) - v[0]) || 1, tol = 0.01 * Math.abs(v[0]);
        // (Against the best it has reached so far, not the day before: a dip is a slow slide of a fraction a day.)
        let best = sign * v[0];
        for (let k = 1; k < v.length; k++) { assert.ok(sign * v[k] > best - tol, `${s.id}: platelets turn back at day ${trail[k][0]}: ${v.filter((_, j) => j % 30 === 0).map(Math.round).join(', ')}`); best = Math.max(best, sign * v[k]); }
      });
    });
  }
}
