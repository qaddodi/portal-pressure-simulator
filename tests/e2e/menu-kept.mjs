// The menu's kept rows (src/ui/menu.js rowFor): after each kind of change to what a row shows, the two lists the next open would make from
// the kept rows are identical, as markup, to the lists made from nothing. One change at a time, each checked, then all together; and after
// a row has been used (a preview opened under it, a search that hid it) and the menu shut.
//
//   node tests/e2e/menu-kept.mjs [device]        (default: mac; the phone's sheet builds the same lists)
import { openApp } from '../../scripts/shoot.mjs';

const device = process.argv[2] || 'mac';
const app = await openApp({ device, theme: 'light' });
const { page } = app;
let fails = 0;
const ok = (cond, what) => { if (!cond) { fails++; console.log(`FAIL ${what}`); } else console.log(`ok   ${what}`); };
const shut = async () => { await page.evaluate(() => window.pps.menu.close()); await page.waitForFunction(() => !document.querySelector('.umenu'), null, { timeout: 30000 }); };
const open = async (section, opts) => {
  await page.evaluate(([s, o]) => window.pps.menu.open(s, o), [section, opts || {}]);
  await page.waitForSelector('.umenu .um-row[data-k^="d:"]', { state: 'attached', timeout: 60000 });
};
const same = async (what, want = 30) => {
  const { fresh, kept } = await page.evaluate(() => window.pps.menu.columns());
  ok(fresh.present === kept.present, `${what}: Present list equals one made from nothing`);
  ok(fresh.patients === kept.patients, `${what}: Patients list equals one made from nothing`);
  ok(fresh.reused === 0 && kept.reused >= want, `${what}: the kept lists put back ${kept.reused} rows (at least ${want}), the fresh ones none`);
  return { fresh, kept };
};
const note = (id, at, n) => page.evaluate(async ([i, a, k]) => { const { noteResume } = await import('/src/ui/resume.js'); noteResume(i, a, k); }, [id, at, n]);

try {
  await open('present');        // (the first open makes the rows; the presentations' code arrives with it)
  await shut();
  await same('after one open and close');

  // 1. The patient on show changes (Patients: the check and aria-current move from one row to another).
  const ids = await page.evaluate(() => window.pps.store.get().presetList.map((p) => p.id));
  const cur0 = await page.evaluate(() => window.pps.store.get().presetId);
  const other = ids.find((id) => id !== cur0);
  await page.evaluate((id) => window.pps.store.set({ presetId: id }), other);
  const a = await same('the patient on show changed');
  ok(a.kept.patients.split('aria-current="true"').length === 2, 'exactly one patient row is current');
  await page.evaluate((id) => window.pps.store.set({ presetId: id }), cur0);
  await same('the patient on show changed back');

  // 2. A presentation's resume place appears, moves and goes (the row says "Resume 4 / 12" in place of its minutes).
  const target = await page.evaluate(async () => {
    const lib = window.pps.presenter.library ? await window.pps.presenter.library() : null;
    const d = lib.decks[0];
    const { noteResume, forgetResume } = await import('/src/ui/resume.js');
    for (let n = 4; n < 120; n++) { noteResume(d.id, 2, n); if (lib.resumeAt(d)) { forgetResume(d.id); return { id: d.id, n }; } }
    return null;
  });
  ok(!!target, 'a resume place can be stored for the first deck');
  await note(target.id, 2, target.n);
  const b = await same('a resume place appeared');
  ok(/Resume 3 \/ /.test(b.kept.present), 'the row shows its resume place');
  await note(target.id, 3, target.n);
  const c = await same('the resume place moved');
  ok(/Resume 4 \/ /.test(c.kept.present) && !/Resume 3 \/ /.test(c.kept.present), 'the row shows the new place');
  await page.evaluate(async (id) => { const { forgetResume } = await import('/src/ui/resume.js'); forgetResume(id); }, target.id);
  const d = await same('the resume place went');
  ok(!/Resume \d+ \/ /.test(d.kept.present), 'the row is back to its minutes');

  // 3. Your scripts: one saved, edited, removed (always made fresh).
  await page.evaluate(() => localStorage.setItem('pps.scripts', JSON.stringify([{ id: 'kept-1', title: 'My first script', steps: [] }])));
  const e = await same('a script was saved');
  ok(e.kept.present.includes('My first script'), 'the script is listed');
  await page.evaluate(() => localStorage.setItem('pps.scripts', JSON.stringify([{ id: 'kept-1', title: 'Renamed', steps: [{}] }, { id: 'kept-2', title: 'Second', steps: [] }])));
  const f = await same('scripts were edited and added');
  ok(f.kept.present.includes('Renamed') && f.kept.present.includes('Second') && !f.kept.present.includes('My first script'), 'the list follows the edit');
  await page.evaluate(() => localStorage.removeItem('pps.scripts'));
  await same('the scripts went');

  // 4. The deck the menu was opened to highlight (a shared link): the mark moves to the deck, and goes with the next open.
  await open('present', { mark: target.id });
  await shut();
  const g = await same('opened to highlight a deck');
  ok(g.kept.present.includes('um-new'), 'the deck is marked');
  await open('present');
  await shut();
  const h = await same('opened again with no mark');
  ok(!h.kept.present.includes('um-new'), 'the mark is gone');

  // 5. A row that has been used: a preview opened under it, a search that hid it, a hover mark; then the menu shut and opened again.
  await open('present');
  await page.evaluate(() => {
    document.querySelector('.umenu .um-col[data-col="present"] .um-info').click();
    const q = document.querySelector('.umenu .um-q'); q.value = 'portal'; q.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('.umenu .um-row[data-k^="d:"]').classList.add('pv-on');
  });
  await page.waitForTimeout(500);
  await shut();
  await same('rows used (preview opened, search, hover mark), then shut');
  await open('present');
  const reopened = await page.evaluate(() => ({ inline: document.querySelectorAll('.umenu .um-inline').length, hidden: document.querySelectorAll('.umenu li[hidden]').length, on: document.querySelectorAll('.umenu .pv-on').length, expanded: document.querySelectorAll('.umenu .um-info[aria-expanded="true"]').length }));
  ok(reopened.inline === 0 && reopened.hidden === 0 && reopened.on === 0 && reopened.expanded === 0, `the reopened menu carries nothing of the last: ${JSON.stringify(reopened)}`);
  const rows = await page.evaluate(() => document.querySelectorAll('.umenu li').length);
  ok(rows > 20, `the reopened menu lists its rows (${rows})`);
  await shut();

  // 6. Everything at once.
  await page.evaluate((id) => window.pps.store.set({ presetId: id }), other);
  await page.evaluate(() => localStorage.setItem('pps.scripts', JSON.stringify([{ id: 'kept-3', title: 'Third', steps: [] }])));
  await note(target.id, 2, target.n);
  await same('everything changed at once', 20);
} finally {
  await page.evaluate(() => localStorage.removeItem('pps.scripts')).catch(() => {});
  await app.close();
}
console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);
