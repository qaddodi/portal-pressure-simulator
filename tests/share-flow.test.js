import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createShare } from '../src/ui/share-flow.js';
import { parseShare } from '../src/ui/share-link.js';

// Shared links (src/ui/share-flow.js, out of main.js: SHL-7), run on a fake page. These replace the tests that read main.js's text for the same rules.

function app(over = {}) {
  const log = [], toasts = [];
  const st = { presetId: 'cirr-decomp', params: { liver: { resist: 2 } }, view: 'anatomy', selection: null, lobule: false, presetList: [{ id: 'healthy' }, { id: 'cirr-decomp' }] };
  const store = { get: () => st, set: (p) => { log.push(['set', p]); Object.assign(st, p); } };
  const loc = Object.assign(new URL('https://qaddodi.github.io/portal-pressure-simulator/?preset=healthy'), {});
  const writes = [], opens = [], replaced = [];
  const env = { location: loc, history: { replaceState: (...a) => replaced.push(a) }, clipboard: { writeText: async (t) => { if (over.clipFails) throw new Error('refused'); writes.push(t); } },
    open: (...a) => opens.push(a), embed: !!over.embed, search: () => loc.search };
  const d = { store, env, toast: (t, k) => toasts.push([t, k]), presenter: { position: () => over.pos || null }, stage: { cameraState: () => ({ k: 2, x: 1, y: 3 }), setCamera: (c, ms) => log.push(['cam', c, ms]) },
    timeline: { flush: () => log.push(['flush']) }, loadPreset: async (id) => { log.push(['load', id]); return over.loadOk !== false; }, updateParams: (fn) => { log.push(['params', fn(st.params)]); },
    setViewKey: (v) => log.push(['view', v]) };
  return { ...createShare(d), st, log, toasts, writes, opens, replaced, loc };
}

test('Copy link: a built-in patient on the hosted site goes through its share page, so a preview names the patient; the code round-trips', async () => {
  const a = app();
  await a.share();
  assert.equal(a.writes.length, 1);
  assert.match(a.writes[0], /^https:\/\/qaddodi\.github\.io\/portal-pressure-simulator\/c\/cirr-decomp\.html#s=/);
  const back = parseShare(a.writes[0].split('#s=')[1]);
  assert.equal(back.preset, 'cirr-decomp'); assert.deepEqual(back.params, { liver: { resist: 2 } });
  assert.deepEqual(a.toasts.at(-1), ['Link to this exact scenario copied.', undefined]);
});

test("Copy link, clipboard refused: the page's own path gets the link (a share page's /c/ path would make every later link /c/c/…)", async () => {
  const a = app({ clipFails: true });
  await a.share();
  assert.equal(a.replaced.length, 1);
  assert.match(a.replaced[0][2], /^\/portal-pressure-simulator\/\?preset=healthy#s=/);
  assert.ok(!a.replaced[0][2].includes('/c/'));
  assert.match(a.toasts.at(-1)[0], /address bar/);
});

test('Copy link, clipboard refused inside an embed: the full app opens in a tab, where its address bar can be copied (no address bar to put it in)', async () => {
  const a = app({ clipFails: true, embed: true });
  await a.share();
  assert.equal(a.replaced.length, 0);
  assert.equal(a.opens.length, 1); assert.match(a.opens[0][0], /#s=/); assert.equal(a.opens[0][1], '_blank'); assert.equal(a.opens[0][2], 'noopener');
  assert.match(a.toasts.at(-1)[0], /new tab/);
});

test('a link with a value out of range still applies its view, selection and camera, and says what it changed', async () => {
  const a = app();
  const shared = { preset: 'cirr-decomp', params: { liver: { resist: 'lots' } }, view: 'circuit', sel: { type: 'organ', id: 'liver' }, cam: { k: 2, x: 1, y: 1 } };
  assert.equal(await a.loadShared(shared), true);
  const at = (n) => a.log.findIndex((l) => l[0] === n);
  assert.ok(at('params') >= 0, 'the params were applied (cleaned)');
  assert.ok(a.log.some((l) => l[0] === 'view' && l[1] === 'circuit'), "the link's view");
  assert.ok(a.log.some((l) => l[0] === 'set' && l[1].selection?.id === 'liver'), "the link's selection");
  assert.ok(a.log.some((l) => l[0] === 'cam'), "the link's camera");
  assert.ok(a.toasts.some(([t]) => /values the model does not accept/.test(t)), 'the change is named');
});

test('a link with nothing wrong says it loaded; a quiet load (the way back from a reload) says nothing', async () => {
  const a = app();
  await a.loadShared({ preset: 'healthy' });
  assert.deepEqual(a.toasts.at(-1), ['Loaded the shared scenario.', undefined]);
  const b = app();
  await b.loadShared({ preset: 'healthy' }, { quiet: true });
  assert.equal(b.toasts.length, 0);
});

test('a load that was replaced or failed takes none of the link\'s settings; an unknown or "Yours" patient is said so', async () => {
  const a = app({ loadOk: false });
  assert.equal(await a.loadShared({ preset: 'healthy', view: 'circuit', params: { x: 1 } }), false);
  assert.ok(!a.log.some((l) => ['params', 'view', 'cam'].includes(l[0])));
  const b = app();
  await b.loadShared({ preset: 'healthy', missing: 'nope' });
  assert.match(b.toasts.at(-1)[0], /names a patient the app does not have/); assert.equal(b.toasts.at(-1)[1], 'bad');
  const c = app();
  await c.loadShared({ preset: 'healthy', fromYours: true });
  assert.match(c.toasts[0][0], /saved on the sender’s device only/);
});

test('readShare reads #s= from the address and keeps only what the app can show', () => {
  const a = app();
  assert.equal(a.readShare(), null);
  const code = a.encodeShare({ sel: { type: 'organ', id: 'spleen' } });
  a.loc.hash = `#s=${code}`;
  const r = a.readShare();
  assert.equal(r.preset, 'cirr-decomp'); assert.deepEqual(r.sel, { type: 'organ', id: 'spleen' });
});

test('resumeUrl: in a talk the same presentation and slide; otherwise the same patient, view, camera and selection; always asks to land quietly', () => {
  const t = app({ pos: { id: 'tips', at: 4 } });
  const u = new URL(t.resumeUrl());
  assert.equal(u.searchParams.get('script'), 'tips'); assert.equal(u.searchParams.get('slide'), '5'); assert.equal(u.searchParams.get('back'), '1'); assert.equal(u.searchParams.get('preset'), null); assert.equal(u.hash, '');
  const e = app();
  const v = new URL(e.resumeUrl());
  assert.equal(v.searchParams.get('back'), '1');
  const p = parseShare(v.hash.slice(3));
  assert.equal(p.preset, 'cirr-decomp'); assert.deepEqual(p.cam, { k: 2, x: 1, y: 3 });
  const lob = app(); lob.st.lobule = true;
  assert.equal(parseShare(new URL(lob.resumeUrl()).hash.slice(3)).cam, undefined, 'no camera from inside the lobule');
});
