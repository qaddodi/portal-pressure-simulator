// The kill ledger (bible review 19 Nov 2026, 5.5 gap 6): source shapes moved out of tests (PR-02), each with its reason. Its behaviour stays in tests/kill-ledger.test.js.
export default [
  { file: 'src/ui/report.js', need: [/addKill\(store\('local'\), l, \{ device: deviceClass\(\) \}\)/, 'the report adds each kill it notices to the ledger, or no ended tab is ever kept'] },
  { file: 'src/ui/gallery/phone-check-panel.js', need: [/ledgerLines\(readLedger\(window\.localStorage\)\)/, 'the Phone check prints the ledger before its "not checked" note'] },
];
