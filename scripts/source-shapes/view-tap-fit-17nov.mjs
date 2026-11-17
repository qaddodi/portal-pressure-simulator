// The view switch's second press fits the view (Mohammad, 17 Nov 2026: "when I hit anatomy while in anatomy view or lobule while in lobule view etc the view should fit zoom").
// Source shapes kept here (PR-02), each with its reason. Pattern gone = the code changed: look before editing.
const W = 'Second press of a view button fits (17 Nov 2026):';
export default [
  { file: 'src/ui/main.js', need: [/viewTapAgain\(b\.dataset\.view, store\.get\(\)\) \? stage\.fitAgain\(\) : b\.dataset\.view === 'lobule'/, `${W} the one shared handler of the switch asks it first, before any button's own work, so all three views have it`] },
  { file: 'src/ui/main.js', need: [/import \{ viewTapAgain \} from '\.\/view-tap\.js'/, `${W} the pure rule`] },
  { file: 'src/ui/stage.js', need: [/fit, fitAgain, refit, closeView, cardsMoved,/, `${W} the stage hands the move out`] },
  { file: 'src/ui/stage-fit.js', between: ['const fitAgain = () => {', '// (Measured first in the next frame'], need: [/camLock\?\.release\('view tap'\)/, `${W} a slide's move or a settling glide lets go: it is the person's own move`] },
  { file: 'src/ui/stage-fit.js', between: ['const fitAgain = () => {', '// (Measured first in the next frame'], need: [/cardsCount = true/, `${W} sized to the room the open cards leave, as Fit is`] },
  { file: 'src/ui/stage-fit.js', between: ['const fitAgain = () => {', '// (Measured first in the next frame'], need: [/slide: true/, `${W} the slide camera's one plan, one straight path (slide-cam.js)`] },
  { file: 'src/ui/stage-fit.js', between: ['const fitAgain = () => {', '// (Measured first in the next frame'], need: [/lz\.fitView\(\)/, `${W} the lobule fits through its own camera`] },
  { file: 'src/ui/stage-fit.js', between: ['const fitAgain = () => {', '// (Measured first in the next frame'], need: [/circuit \? circWhole\(\) : defaultVT\(false\)/, `${W} always the same target: the circuit's whole map, never Fit's toggle to the close-up`] },
  { file: 'src/ui/stage-fit.js', between: ['const fitAgain = () => {', '// (Measured first in the next frame'], need: [/sameView\(to,/, `${W} already there: nothing moves`] },
  { file: 'src/ui/stage-fit.js', between: ['const fitAgain = () => {', '// (Measured first in the next frame'], forbid: [/near\(/, `${W} no whole/close-up toggle`] },
];
