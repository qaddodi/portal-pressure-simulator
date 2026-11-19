// Rules moved out of tests that read main.js, gallery/page.js and the presenter's text (19 Nov 2026, PR-02: a test that judges source text is a rule here, with its reason, not a test).
// tests/about-references.test.js, the second case of tests/feedback-short.test.js, the second case of tests/flags.test.js and the camBox case of tests/cam-frame.test.js.
const slice = (text, from, to) => { const a = text.indexOf(from); if (a < 0) return null; const b = text.indexOf(to, a); return b < 0 ? null : text.slice(a, b); };
const inSlice = (from, to, re, want, what) => ({ test: (text) => { const s = slice(text, from, to); return s !== null && re.test(s) === want; }, toString: () => `${what}: ${want ? '' : 'no '}${re}` });
const about = (re, want = true) => inSlice('function openAbout(', 'function openPrivacy(', re, want, 'in About');
const refs = (re, want = true) => inSlice("data-sec': 'refs'", "h('h3', {}, 'Licenses')", re, want, 'in the References');
const feedback = (re) => inSlice('async function sendFeedback()', 'function doUndo()', re, true, 'in sendFeedback');
const A = 'About and References say what is true now (bible review 19 Nov 2026, ENG-8):';
const F = 'The feedback mail reads the screen after the sheet has left, never waits longer than its limit, caps the body and offers the full report (19 Nov 2026):';
const camBody = (re, what) => ({ test: (text) => { const b = /function camBox\(cam, s\) \{([\s\S]*?)\n {2}\}\n/.exec(text)?.[1]; return !!b && re.test(b); }, toString: () => `in camBox: ${what}` });
const CAM = 'The presenter frames by name through camBox, and the older forms through the same sums (19 Nov 2026):';
export default [
  { file: 'src/ui/main.js', need: [about(/[\s\S]{2000}/, true), `${A} the About page is found (its text is long enough to judge)`] },
  { file: 'src/ui/main.js', need: [about(/line-by-line check[^.]*pending|published summaries/, false), `${A} no "check still pending" beside the full text in the repo`] },
  { file: 'src/ui/main.js', need: [about(/indeterminate zone for stiffness/, false), `${A} the CSPH rule-in criteria are not called an indeterminate zone`] },
  { file: 'src/ui/main.js', need: [about(/Thresholds belong to gradients, not to the color of a vessel/, false), `${A} no "gradients only" sentence over a table that colors the portal vein pressure`] },
  { file: 'src/ui/main.js', need: [about(/Every readout’s bar and status word follow a clinical cut-off/, false), `${A} the PPG lines are the model's own`] },
  { file: 'src/ui/main.js', need: [refs(/Baveno VIII/, true), `${A} References has Baveno VIII`] },
  { file: 'src/ui/main.js', need: [refs(/AASLD Practice Guidance on risk stratification[^']*2024/, true), `${A} References has AASLD 2024`] },
  { file: 'src/ui/main.js', need: [refs(/EASL Clinical Practice Guidelines on vascular diseases of the liver/, true), `${A} References has EASL 2025`] },
  { file: 'src/ui/main.js', need: [refs(/AASLD\.? Hepatology 2021;74/, true), `${A} References has AASLD 2021`] },
  { file: 'src/ui/main.js', need: [refs(/2020 practice guidance by the AASLD\. Hepatology 2021;73/, true), `${A} References has AASLD 2020`] },
  { file: 'src/ui/main.js', need: [refs(/Hepatology \/ Semin Liver Dis\./, false), `${A} the HVPG reference names its journal, year and pages`] },
  { file: 'src/ui/main.js', need: [refs(/Semin Liver Dis 2006;26:348/, true), `${A} the HVPG reference has its pages`] },
  { file: 'src/ui/main.js', need: [feedback(/FEEDBACK_SHEET_MS/), `${F} the sheet's wait`] },
  { file: 'src/ui/main.js', need: [feedback(/Promise\.race/), `${F} never longer than the limit`] },
  { file: 'src/ui/main.js', need: [feedback(/fitMailto\(base, fb\?\.short \|\| ''\)/), `${F} the body is capped`] },
  { file: 'src/ui/main.js', need: [feedback(/Copy the full report/), `${F} the full report is offered`] },
  { file: 'src/ui/main.js', need: [feedback(/location\.href = `mailto:/), `${F} the mail link`] },
  { file: 'src/ui/main.js', need: [/flagOn\('watch'\) \|\| flagValue\('debug'\) !== null\) import\('\.\/watch\/start\.js'\)/, 'The debug page has the recorder on by default (19 Nov 2026)'] },
  { file: 'src/ui/gallery/page.js', need: [/bar\.append\(browse, prev, next, name, reportBtn, toolsBtn\)/, 'The debug page has a Report button on its bar (19 Nov 2026)'] },
  { file: 'src/ui/gallery/page.js', need: [/btn\('Full check'/, 'The debug page has the Full check button (19 Nov 2026)'] },
  { file: 'src/ui/presenter*', need: [camBody(/regionBox\(isCamOn\(cam\) \? cam\.near : cam, REGIONS\)/, 'a region, a box or a list of regions, or the region the names grow from'), `${CAM} camBox takes a region, a box or a list`] },
  { file: 'src/ui/presenter*', need: [camBody(/growBox\(r, unionBox\(\[stage\.focusBox\(n\), pts\]\.filter\(Boolean\)\), 30\)/, 'the names as drawn now, with the stations where they stand'), `${CAM} the names, as drawn now`] },
  { file: 'src/ui/presenter*', need: [camBody(/growBox\(r \|\| REGIONS\.route, f\)/, "the slide's outlines and soft glows still grow it, a region the plate lacks is the route"), `${CAM} outlines and glows still grow it`] },
  { file: 'src/ui/presenter*', need: [{ test: (t) => (t.match(/camBox\(/g) || []).length === 3, toString: () => 'camBox is used three times: the one move to a framing, the rise and the definition' }, `${CAM} every place that frames a slide goes through camBox`] },
  { file: 'src/ui/presenter*', forbid: [/Array\.isArray\(cam\) \? cam : REGIONS/, `${CAM} no second reading of a camera that skips the sums`] },
];
