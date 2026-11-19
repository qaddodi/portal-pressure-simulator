// Rules moved from tests: the flowchart rows' level verdicts (Stiffness 9, Rule of five, 19 Nov 2026); the partial present kept whole while a card moves (HVPG 8 chart rows hung below the glass, 19 Nov 2026).
export default [
  { file: 'src/ui/tool-path.js', need: [/gap: nodeGap\(paras, lead\.get\(id\) \|\| 0\)/, 'a flowchart node\'s words take the room its row\'s tallest condition needs, so the verdicts of one row stand level'] },
  { file: 'src/ui/veins-gl.js', need: [/if \(movedWithin\(PART_MOVE_MS\)\) return no\('a card is moving by number'\);/, 'a present is laid whole while a card moves by number, so the glass, words and chart are laid together'] },
];
