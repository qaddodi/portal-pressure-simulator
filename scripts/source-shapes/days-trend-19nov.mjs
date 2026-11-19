// The Days trend (19 Nov 2026): source shapes moved out of tests (PR-02), each with its reason. Its behaviour stays in tests/days-trend-steps.test.js.
export default [
  { file: 'src/ui/pressure-time.js', need: [/recordDay\(days, f\.day, dayV, stepNext\)/, 'the chart feeds the Days list through recordDay, the one path'] },
  { file: 'src/ui/pressure-time.js', need: [/\.\.\.calmedDays\(days, key\)/, 'the Days list is calmed by calmedDays, piece by piece between treatments'] },
  { file: 'src/ui/pressure-time.js', need: [/treatmentKey\(f\.params\)/, 'a change of treatment is told by treatmentKey, never a copy of it'] },
  { file: 'src/ui/pressure-time.js', forbid: [/calmed\(v, calmRadius/, 'no whole-series calm of the days: it smears the trend across a treatment'] },
];
