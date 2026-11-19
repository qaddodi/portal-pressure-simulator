// The glass look and the System-dark twin (LOOK-3 and LOOK-11, bible review, 19 Nov 2026): source shapes moved out of tests (PR-02), each with its reason.
// The behaviour of the lift (a token for each look, one drop as the GPU reads it, the quad's reach) stays in tests/glass-lift.test.js.
const SYS = ':root:not([data-theme="light"]):not([data-theme="soft"])';
const GLASS = ['.pz-shade', '.pz-shade.pz-card:not(.stack)', '.pz-shade.stack', '.pz-data.pz-data', '.pz-fk', '.pz-case', '.pz-bar', '.pz-scales', '.pz.stack .pz-bar'];
const ONE = 'inset 0 0 0 1px var(--glass-edge), var(--glass-shadow)';
export default [
  { file: 'styles/app-*.css', scan: (css) => {
    // LOOK-11: a rule written for the chosen Dark look must have its System-dark twin, or a phone that follows the system looks unlike one that chose Dark.
    const out = [];
    for (const m of css.matchAll(/^:root\[data-theme="dark"\] ([^{\n]+?) \{/gm)) {
      for (const sel of m[1].split(', :root[data-theme="dark"] ')) if (!css.includes(`${SYS} ${sel}`)) out.push(`the Dark rule for ${sel} has no System-dark twin (${SYS} ${sel}) (LOOK-11)`);
    }
    return out;
  } },
  { file: 'styles/app-*.css', need: [/\.gc-ans > b\[data-dir="up"\] \{ color: var\(--caution-ink\); \}/, "the deck balance answer's rising value can be amber (the selector matches a .gc-ans > b, LOOK-11)"] },
  { file: 'styles/app-*.css', forbid: [/\.gc-ans\[data-dir="up"\] \.gc-ans/, 'no selector for a rising answer inside an answer (it matched nothing, LOOK-11)'] },
  { file: 'styles/app-*.css', forbid: [/--pz-glass-(?:edge|drop|line)/, "the cards' own glass edge and drop variables are gone in every look: the fallback writes the shared token (LOOK-3)"] },
  { file: 'styles/app-*.css', need: [/--glass-edge: var\(--hairline\); --glass-shadow: 0 10px 24px -8px rgb\(var\(--shadow-rgb\) \/ var\(--card-shadow-a\)\); \}/, 'the one glass is declared once: the hairline and the lift, the GPU drawing it with the same values (LOOK-3)'] },
  { file: 'styles/app-*.css', need: [/\.cath-label \{ --glass-shadow: none; \}/, "the callouts' clearing is the only other place --glass-shadow is set (LOOK-3)"] },
  { file: 'styles/app-*.css', scan: (css) => {
    const out = [];
    const decl = [...css.matchAll(/(?:^|[;{\s])--glass-shadow:\s*([^;}]+)[;}]/g)].map((m) => m[1].trim()).sort();
    if (JSON.stringify(decl) !== JSON.stringify(['0 10px 24px -8px rgb(var(--shadow-rgb) / var(--card-shadow-a))', 'none'])) out.push(`--glass-shadow is set in ${decl.length} places (${decl.join(' | ')}): only :root and the callouts' clearing (LOOK-3)`);
    // Each glass card's fallback is the one glass: a hairline edge and the shared lift, no lit top line, no drop of its own.
    for (const sel of GLASS) {
      const at = css.indexOf(`\n${sel} {`);
      if (at < 0) { out.push(`the rule ${sel} is gone (LOOK-3)`); continue; }
      const shadow = /box-shadow:\s*([^;]+);/.exec(css.slice(at, css.indexOf('}', at)));
      if (!shadow || shadow[1].trim() !== ONE) out.push(`${sel}: box-shadow is ${shadow ? shadow[1].trim() : 'missing'}, not ${ONE} (LOOK-3)`);
    }
    for (const m of css.matchAll(/(^|\n)((?:\.pz|:root)[^{\n]*(?:\.pz-(?:shade|data|fk|case|bar|scales|sheet|fold))[^{\n]*)\{([^}]*)\}/g)) {
      for (const s of m[3].matchAll(/box-shadow:\s*([^;]+);/g)) if (/inset 0 1px 0|\d+px \d+px \d+px -?\d+px/.test(s[1]) && /--black-rgb|--glass-drop|rgb\(var\(--black/.test(s[1])) out.push(`${m[2].trim().slice(0, 80)}: a drop or lit top line of its own (${s[1]}) (LOOK-3)`);
    }
    return out;
  } },
];
