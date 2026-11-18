// Accessibility rules of the full app review's B7 (15 Nov 2026), each with its one-line reason.
export default [
  { file: 'src/ui/inspector.js', need: [/attrSoon\(input, 'aria-valuetext'/, 'a Details slider says its words ("60%"), not the thumb\'s raw number (SHELL-13)'] },
  { file: 'src/ui/card.js', need: [/attrSoon\(input, 'aria-valuetext'/, 'a card slider says its words, not the thumb\'s raw number (SHELL-13)'] },
  { file: ['src/ui/util.js', 'src/ui/main.js', 'src/ui/menu.js'], forbid: [/role: [^,}]*menuitem/, '`menuitem*` is valid only inside a `menu`; these popovers are dialogs of buttons: a button, a switch or a radio in a radiogroup (SHELL-7)'] },
  { file: 'src/ui/util.js', need: [/'aria-modal': asSheet \? 'true' : null/, 'a menu shown as a phone sheet is modal for a screen reader, which would otherwise swipe on into the dimmed page behind it (SHELL-7)'] },
  { file: 'src/ui/stage-pick.js', need: [/'node:RA'/, 'the figure\'s keyboard walk reaches the right atrium in the circuit too (F15)'] },
];
