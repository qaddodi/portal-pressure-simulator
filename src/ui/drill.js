// "Where is the block?" drill: ten hidden patients drawn from the presets, mixed so look-alike
// levels follow each other (interleaving). For each, the student orders up to three tests, taps
// the level of the block on the route strip, says whether they are sure, and the pressure ladder
// eases in with the answer. The debrief lists confident mistakes first. Values are the model's
// own (SNAPSHOTS, regenerated from the engine); only the imaging words are authored.

import { h, fmt, icon } from './util.js?v=a357853926';
import { SNAPSHOTS } from './snapshots.js?v=34d1578d5f';
import { createRoute, ladder, tiles, siteName } from './ladder.js?v=2cbec732f7';
import { addRecord } from './records.js?v=50fb9dd463';

export const ROUNDS = 10, MAX_TESTS = 3;
export const DRILL_ID = 'where-block-drill', DRILL_TITLE = 'Where is the block?';

// The patients: preset, level, a neutral vignette, and what Doppler and echo would report.
const NORMAL_ECHO = 'Normal heart. The IVC is not dilated and collapses with a sniff.';
export const PATIENTS = [
  { id: 'pvt-acute', site: 'pre', story: 'A 45-year-old with sudden abdominal pain and fever. Liver tests are normal.',
    doppler: 'No flow in the main portal vein, which is filled with fresh clot.' },
  { id: 'pvt-chronic', site: 'pre', story: 'A 30-year-old with large varices and a big spleen. Liver tests are normal.',
    doppler: 'The portal vein is replaced by a tangle of small collateral veins (a cavernoma).' },
  { id: 'svt', site: 'pre', story: 'A 55-year-old with bleeding gastric varices a year after pancreatitis. Liver tests are normal.',
    doppler: 'The portal vein is open with normal flow. The splenic vein is not seen and the spleen is large.',
    why: 'A splenic vein clot raises pressure only on the spleen’s side, so portal pressure and HVPG are normal: left-sided portal hypertension.' },
  { id: 'schisto', site: 'presin', story: 'A 28-year-old who grew up near the Nile, with large varices and a big spleen. Liver tests are normal.',
    doppler: 'The portal vein is open with flow toward the liver. Thick, bright bands surround the portal branches.' },
  { id: 'cirr-comp', site: 'sin', story: 'A 60-year-old whose routine scan shows a nodular liver. Platelets 140.',
    doppler: 'Portal flow toward the liver. The liver surface is nodular.' },
  { id: 'csph', site: 'sin', story: 'A 58-year-old with diabetes and obesity. Platelets 95.',
    doppler: 'Slow portal flow toward the liver. Nodular liver and a big spleen.' },
  { id: 'cirr-decomp', site: 'sin', story: 'A 52-year-old with years of heavy drinking, new jaundice and a swollen abdomen.',
    doppler: 'Slow portal flow toward the liver. Nodular liver, big spleen and ascites.' },
  { id: 'cirr-hepatofugal', site: 'sin', story: 'A 64-year-old with long-standing hepatitis C and a small liver.',
    doppler: 'Portal flow runs away from the liver. The liver is small and nodular.' },
  { id: 'gastric-varix', site: 'sin', story: 'A 59-year-old with melena. The scope finds large varices in the stomach.',
    doppler: 'Slow portal flow and a large shunt from the splenic vein to the left kidney vein. Nodular liver.' },
  { id: 'sos', site: 'postsin', story: 'A 34-year-old three weeks after a stem-cell transplant, with weight gain, jaundice and a tender liver.',
    doppler: 'The hepatic veins are open but narrow. The liver is enlarged and the gallbladder wall is thick.' },
  { id: 'budd-chiari', site: 'post', story: 'A 26-year-old on the pill with ascites that came on over two weeks and right upper pain.',
    doppler: 'The hepatic veins cannot be seen. The caudate lobe is enlarged.' },
  { id: 'ivc-web', site: 'post', story: 'A 40-year-old with slowly growing ascites and swollen legs.',
    doppler: 'The hepatic veins are open but wide. Flow in the IVC narrows and speeds up just below the heart.' },
  { id: 'rhf', site: 'cardiac', story: 'A 70-year-old with breathlessness, swollen legs and ascites. The neck veins are full.',
    doppler: 'Pulsatile portal flow. The hepatic veins and IVC are wide.',
    echo: 'Dilated right ventricle with severe tricuspid regurgitation. The IVC is wide and does not collapse.' },
  { id: 'constrictive', site: 'cardiac', story: 'A 62-year-old, years after heart surgery, with ascites and swollen legs.',
    doppler: 'Pulsatile portal flow. The hepatic veins and IVC are wide.',
    echo: 'A normal-sized heart with a thick pericardium and a septal bounce. The IVC is wide and does not collapse.' },
];
const WHY = {
  pre: 'The block is before the liver: portal pressure is high but the wedge sits downstream of it, so WHVP and HVPG are normal.',
  presin: 'The block is in the portal tracts, upstream of the wedge: portal pressure is high, HVPG normal or mildly raised, liver stiffness near normal.',
  sin: 'The big drop is across the sinusoids, so WHVP reads portal pressure and HVPG is raised; ascites, when present, is low in protein.',
  postsin: 'The central veins are blocked: HVPG is raised as in cirrhosis, and the setting (weeks after conditioning) tells them apart.',
  post: 'The hepatic veins or IVC are blocked: WHVP and FHVP are both high, HVPG is near zero, the right atrium is normal and ascites is protein-rich.',
  cardiac: 'Pressure backs up from the heart: the right atrium is high, every station rises with it, HVPG stays normal and ascites is protein-rich.',
};

// The tests: what each reveals and which ladder rungs it measures.
export const TESTS = [
  ['hvpg', 'HVPG study', (f) => `WHVP ${fmt(f.whvp, 0)}, FHVP ${fmt(f.fhvp, 0)} mmHg: HVPG ${fmt(f.hvpg, 1)} mmHg.`],
  ['tap', 'Ascitic tap', (f) => (f.asc < 200 ? 'Too little ascites to tap.' : `SAAG ${fmt(f.saag, 1)} g/dL, total protein ${fmt(f.tp, 1)} g/dL.`)],
  ['doppler', 'Doppler ultrasound', (f, p) => p.doppler],
  ['lsm', 'Liver stiffness', (f) => `${fmt(f.lsm, 1)} kPa (normal about 5).`],
  ['echo', 'Echocardiogram', (f, p) => `${p.echo || NORMAL_ECHO} Estimated right atrial pressure ${fmt(f.ra, 0)} mmHg.`],
];
const RUNGS_OF = { hvpg: ['whvp', 'fhvp'], echo: ['ra'] };

const shuffle = (a, rnd = Math.random) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
/** Ten patients: every level at least once, the rest at random, no patient twice, no level twice in a row where avoidable. */
export function pickRounds(rnd = Math.random) {
  const bySite = {};
  for (const p of PATIENTS) (bySite[p.site] ||= []).push(p);
  const first = Object.values(bySite).map((ps) => ps[Math.floor(rnd() * ps.length)]);
  const rest = shuffle(PATIENTS.filter((p) => !first.includes(p)), rnd).slice(0, ROUNDS - first.length);
  const all = shuffle([...first, ...rest], rnd);
  for (let i = 1; i < all.length; i++) {
    if (all[i].site !== all[i - 1].site) continue;
    const j = all.findIndex((p, k) => k > i && p.site !== all[i - 1].site && (k + 1 >= all.length || p.site !== all[k + 1]?.site));
    if (j > 0) [all[i], all[j]] = [all[j], all[i]];
  }
  return all;
}

/** The drill, drawn into `el`. onExit() leaves it. */
export function createDrill({ onExit }) {
  const el = h('section', { class: 'drill', 'aria-label': DRILL_TITLE });
  const base = SNAPSHOTS.healthy.fp;
  let rounds = pickRounds(), i = 0, answers = [], t0 = Date.now();

  function headBar() {
    return h('div', { class: 'dr-head' },
      h('div', {}, h('span', { class: 'overline' }, 'Practice'), h('h2', {}, DRILL_TITLE)),
      h('div', { class: 'dr-segs', 'aria-label': `Patient ${Math.min(i + 1, ROUNDS)} of ${ROUNDS}` }, rounds.map((_, k) => h('i', { class: k < answers.length ? (answers[k].right ? 'ok' : 'no') : k === i ? 'cur' : '' }))),
      h('button', { class: 'ib', 'aria-label': 'Leave the drill', title: 'Leave the drill', onclick: onExit }, icon('close')));
  }

  function round() {
    const p = rounds[i], f = SNAPSHOTS[p.id].fp, ordered = [];
    let pick = null;
    const results = h('div', { class: 'dr-results', 'aria-live': 'polite' });
    const testBtns = TESTS.map(([id, label, read]) => h('button', { class: 'dr-test', 'aria-pressed': 'false', onclick: (e) => {
      if (ordered.includes(id) || ordered.length >= MAX_TESTS || pick === 'done') return;
      ordered.push(id); e.currentTarget.setAttribute('aria-pressed', 'true');
      results.append(h('div', { class: 'dr-res' }, h('b', {}, label), h('span', {}, read(f, p))));
      testBtns.forEach((b) => { if (b.getAttribute('aria-pressed') !== 'true') b.disabled = ordered.length >= MAX_TESTS; });
      left.textContent = ordered.length >= MAX_TESTS ? 'No tests left' : `${MAX_TESTS - ordered.length} left`;
    } }, label));
    const left = h('span', { class: 'dr-left' }, `${MAX_TESTS} left`);
    const sure = h('button', { class: 'btn primary', disabled: true, onclick: () => answer(true) }, 'Place it, I’m sure');
    const unsure = h('button', { class: 'btn', disabled: true, onclick: () => answer(false) }, 'Place it, not sure');
    const route = createRoute({ onPick: (id) => { pick = id; sure.disabled = unsure.disabled = false; } });
    const after = h('div', { class: 'dr-after' });
    const confirm = h('div', { class: 'dr-confirm' }, sure, unsure);

    function answer(confident) {
      if (!pick || pick === 'done') return;
      const right = pick === p.site;
      answers.push({ id: p.id, site: p.site, pick, right, sure: confident, tests: [...ordered] });
      pick = 'done';
      route.reveal(p.site);
      testBtns.forEach((b) => { b.disabled = true; });
      const known = ['pv', 'whvp', 'fhvp', 'ra'];
      confirm.replaceWith(h('p', { class: 'dr-verdict ' + (right ? 'ok' : 'no') },
        h('b', {}, right ? 'Right.' : `Not quite: ${siteName(p.site).toLowerCase()}.`), ' ', p.why || WHY[p.site]));
      after.replaceChildren(
        h('div', { class: 'tour-sub' }, 'Pressure along the way', h('span', {}, h('i', { class: 'lg-now' }), 'This patient', h('i', { class: 'lg-base' }), 'Healthy')),
        ladder(f, { base, known, key: ordered.flatMap((t) => RUNGS_OF[t] || []), reveal: true }),
        tiles(f, { key: ordered.includes('hvpg') ? ['hvpg'] : ordered.includes('tap') ? ['saag', 'tp'] : [] }),
        h('div', { class: 'dr-next' }, h('button', { class: 'btn primary', onclick: next }, i + 1 < ROUNDS ? 'Next patient' : 'See how you did', icon('chev-right'))));
      after.querySelector('.dr-next .btn').focus({ preventScroll: true });
      requestAnimationFrame(() => after.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }));
    }

    el.replaceChildren(headBar(), h('div', { class: 'dr-body' },
      h('p', { class: 'dr-story' }, h('span', { class: 'dr-n' }, `Patient ${i + 1}`), p.story),
      h('div', { class: 'dr-step' }, h('div', { class: 'dr-k' }, h('b', {}, '1'), 'Order up to three tests', left), h('div', { class: 'dr-tests' }, testBtns), results),
      h('div', { class: 'dr-step' }, h('div', { class: 'dr-k' }, h('b', {}, '2'), 'Tap where the block is'), route.el, confirm),
      after));
  }

  function next() { i++; if (i < ROUNDS) round(); else debrief(); el.scrollIntoView?.({ block: 'start', behavior: 'smooth' }); }

  function debrief() {
    const right = answers.filter((a) => a.right).length;
    const score = Math.round((right / ROUNDS) * 100);
    // Confident mistakes first: they are the misconceptions; then unsure misses; then lucky guesses.
    const groups = [
      ['Sure, but wrong', 'Revisit these first: a confident mistake is a misconception.', answers.filter((a) => !a.right && a.sure)],
      ['Not sure, and wrong', '', answers.filter((a) => !a.right && !a.sure)],
      ['Right, but not sure', 'Worth another look until it feels certain.', answers.filter((a) => a.right && !a.sure)],
    ].filter(([, , list]) => list.length);
    const row = (a) => {
      const p = PATIENTS.find((q) => q.id === a.id);
      return h('li', {}, h('span', { class: 'dr-dl-s' }, p.story),
        h('span', { class: 'dr-dl-a' }, a.right ? `You said ${siteName(a.pick).toLowerCase()}.` : `You said ${siteName(a.pick).toLowerCase()}; it was ${siteName(a.site).toLowerCase()}.`, ' ', p.why || WHY[a.site]));
    };
    addRecord({ kind: 'drill', id: DRILL_ID, title: DRILL_TITLE, score, completed: true, met: right, total: ROUNDS, duration: (Date.now() - t0) / 1000, wallDuration: (Date.now() - t0) / 1000,
      answers: answers.map((a) => `${a.id}: ${a.pick}${a.right ? ' (right' : ` (wrong, ${a.site}`}, ${a.sure ? 'sure' : 'not sure'}, tests ${a.tests.join('+') || 'none'})`) });
    saveDrill(score);
    el.replaceChildren(headBar(), h('div', { class: 'dr-body' },
      h('div', { class: 'dr-score' }, h('b', {}, `${right} / ${ROUNDS}`), h('span', {}, right === ROUNDS ? 'Every block in the right place.' : right >= 7 ? 'Good localizing.' : 'Keep going: the ladder is the pattern to learn.')),
      groups.length ? groups.map(([t, d, list]) => h('div', { class: 'dr-dl' }, h('h3', {}, t, h('small', {}, ` · ${list.length}`)), d ? h('p', {}, d) : null, h('ul', {}, list.map(row))))
        : h('p', { class: 'dr-verdict ok' }, 'All right and all sure.'),
      h('div', { class: 'dr-next' }, h('button', { class: 'btn', onclick: onExit }, 'Back to Home'), h('button', { class: 'btn primary', onclick: () => { rounds = pickRounds(); i = 0; answers = []; t0 = Date.now(); round(); } }, 'Ten more'))));
  }

  round();
  return { el };
}

const KEY = 'pps.drill';
export function drillProgress() { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } }
function saveDrill(score) {
  const d = drillProgress();
  try { localStorage.setItem(KEY, JSON.stringify({ best: Math.max(score, d.best || 0), last: score, n: (d.n || 0) + 1, date: new Date().toISOString() })); } catch { /* storage unavailable */ }
}
