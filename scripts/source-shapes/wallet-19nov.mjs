// Rules moved from tests: the flowchart rows' level verdicts (Stiffness 9, Rule of five, 19 Nov 2026).
export default [
  { file: 'src/ui/tool-path.js', need: [/gap: nodeGap\(paras, lead\.get\(id\) \|\| 0\)/, 'a flowchart node\'s words take the room its row\'s tallest condition needs, so the verdicts of one row stand level'] },
];
