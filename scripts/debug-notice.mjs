// One line on stderr when a debug script is run by its old name: the same work is `npm run debug -- <verb>` (scripts/debug.mjs). It is silent when debug.mjs ran the script (PPS_DEBUG_VERB),
// and for one release only: then the old entry points go. Importing it is the whole use: `import './debug-notice.mjs';` is not enough, so it exports `pointTo(verb)`.
export function pointTo(verb) {
  if (process.env.PPS_DEBUG_VERB || process.env.CI) return;
  console.error(`(tip: this is \`npm run debug -- ${verb}\`; one command for every debug tool, \`npm run debug\` lists them)`);
}
