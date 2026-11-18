// A pushed page (Settings' History and Help, Treat's Changes) follows a swipe right with the finger and moves in the cards' frames (18 Nov 2026, the tester: Treat's Changes page "stays at x=0 through a 320 px
// drag and only slides after release", its slide an element.animate on the compositor's clock). One mover for both, page-push.js (tests/treat-page.test.js); the rest is kept here as source shapes (PR-02).
const W = 'A pushed page moves with the finger, in the frames (18 Nov 2026):';
export default [
  { file: 'src/ui/page-push.js', need: [/glideCall\(page, ms, LINEAR, \(u\) => apply\(from \+ dist \* \(c > 0 \? carried\(easeArrive\(u\), u, c\) : easeArrive\(u\)\)\), done\);/, `${W} the slide is a frame-clock glide (glideCall), the pages' own curve, carrying the finger's speed on a let-go`] },
  { file: 'src/ui/page-push.js', need: [/if \(flick \|\| s0\.dx > Math\.min\(SHEET_CLOSE_PX, W \* SHEET_CLOSE_SHARE\)\) pop\(v\);\s+else run\(0, v\);/, `${W} a let-go goes back on a flick or a long pull by the sheets' own rules, and a short one comes home`] },
  { file: 'src/ui/page-push.js', need: [/glideStop\(page\);[^\n]*\n\s+s\.on = true; s\.x = e\.clientX - x;/, `${W} a finger that catches a page mid-slide takes it from where it stands`] },
  { file: 'src/ui/util.js', need: [/const push = pushPage\(page, \[root\], el\.offsetWidth, \{/, `${W} Settings' pages use the same mover`] },
];
