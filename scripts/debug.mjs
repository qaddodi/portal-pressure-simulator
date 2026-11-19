// One command for every debug tool (bible review 19 Nov 2026, section 7.5): `npm run debug -- <verb> ...`. Each verb is a thin front for the script that does the work, so the
// old script names keep working for a release (they print a one-line pointer here); what is new is that an agent has one place to start and one list of what exists.
//
//   npm run debug                              this list
//   npm run debug -- packet show|link|replay|compare|test|make ...   the bug packet (scripts/packet.mjs)
//   npm run debug -- report show|compare <paste | ->                 any tool's report block, a packet or a replay (scripts/report.mjs)
//   npm run debug -- model ...                                       the model's numbers (scripts/model-cli.mjs; docs/model-cli.md)
//   npm run debug -- sweep decks|specimens|turns [--layout-only] ... the headless layout sweeps, GL stubbed (deck-sweep, gallery-sweep, rotate-sweep; scripts/headless.mjs)
//   npm run debug -- rules [--family fit] [--json]                   every self-check rule with its owner file and why
//   npm run debug -- limits                                          the owner's standing numbers the judges hold the screen to (12 px, 1.4x, the Shuffle's 10 px ...)
//   npm run debug -- flags                                           every address flag, where it works and what it does
//   npm run debug -- scan                                            node-only scans: off-GPU, wording, source shapes
//   npm run debug -- affected                                        the gallery links a change touches (scripts/gallery-affected.mjs)
//
// `--print` after the verb shows the command it would run and runs nothing. Every sweep runs here in the container: never on Actions runners (owner, 18 Nov 2026).
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const verb = argv[0], rest = argv.slice(1);
const print = rest.includes('--print');
const args = rest.filter((a) => a !== '--print');
const script = (f) => resolve(ROOT, 'scripts', f);

/** The command a verb runs: [{ file, args }], run one after another. Pure (tests/debug-command.test.js). */
export function plan(verb, args) {
  switch (verb) {
    case 'packet': return [{ file: 'packet.mjs', args }];
    case 'report': return [{ file: 'report.mjs', args }];
    case 'model': return [{ file: 'model-cli.mjs', args }];
    case 'affected': return [{ file: 'gallery-affected.mjs', args }];
    case 'sweep': {
      const [kind, ...more] = args;
      const file = { decks: 'deck-sweep.mjs', specimens: 'gallery-sweep.mjs', turns: 'rotate-sweep.mjs' }[kind];
      if (!file) return null;
      // (every sweep is layout-only now; for the deck sweep `--layout-only` is its `--fast`: the figure is not drawn, the cards are read as ever)
      return [{ file, args: more.flatMap((a) => (a === '--layout-only' ? (kind === 'decks' ? ['--fast'] : []) : [a])) }];
    }
    case 'scan': return [{ file: 'off-gpu-scan.mjs', args: [] }, { file: 'clinical-wording.mjs', args: [] }, { file: 'rules-lint.mjs', args: [] }];
    default: return null;
  }
}

async function showRules() {
  await import('../src/ui/selfcheck/plugins.js');
  const { ruleList } = await import('../src/ui/selfcheck/rules.js');
  const fi = args.indexOf('--family');
  const fam = fi >= 0 ? args[fi + 1] : '';
  const list = ruleList().filter((r) => !fam || r.family === fam);
  if (args.includes('--json')) { console.log(JSON.stringify(list, null, 1)); return 0; }
  console.log(`${list.length} rule${list.length === 1 ? '' : 's'}${fam ? ` in family ${fam}` : ''} (id, kind, owner: why)\n`);
  for (const r of list) console.log(`${r.id.padEnd(30)} ${r.kind.padEnd(7)} ${r.owner}: ${r.why}`);
  return 0;
}
async function showLimits() {
  const { LIMITS } = await import('../src/ui/selfcheck/limits.js');
  if (args.includes('--json')) { console.log(JSON.stringify(LIMITS, null, 1)); return 0; }
  for (const l of LIMITS) console.log(`${l.id.padEnd(20)} ${String(l.value).padEnd(6)} ${l.unit.padEnd(22)} since ${l.since}\n  ${l.rule}\n  Exceptions: ${l.exceptions}`);
  return 0;
}
async function showFlags() {
  const { knownFlags } = await import('../src/ui/flags.js');
  const list = knownFlags();
  if (args.includes('--json')) { console.log(JSON.stringify(list, null, 1)); return 0; }
  console.log('flag'.padEnd(16), 'gate'.padEnd(8), 'group'.padEnd(10), 'meaning');
  for (const f of list) console.log(`?${f.id}`.padEnd(16), f.gate.padEnd(8), String(f.group || '').padEnd(10), `${f.meaning || ''}${f.alias ? ` (also ?${f.alias})` : ''}`);
  return 0;
}

function help() {
  const head = readHead();
  console.log(head);
  return verb ? 2 : 0;
}
function readHead() {
  const src = readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n');
  return src.slice(0, src.findIndex((l, i) => i > 0 && !l.startsWith('//'))).map((l) => l.replace(/^\/\/ ?/, '')).join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let code;
  if (verb === 'rules') code = await showRules();
  else if (verb === 'flags') code = await showFlags();
  else if (verb === 'limits') code = await showLimits();
  else if (verb === 'help' || verb === '--help' || !verb) code = help();
  else {
    const steps = plan(verb, args);
    if (!steps) { console.error(`debug: no verb "${verb}"${verb === 'sweep' ? ' (sweep decks|specimens|turns)' : ''}.\n`); help(); code = 2; }
    else {
      code = 0;
      for (const s of steps) {
        const line = `node scripts/${s.file}${s.args.length ? ` ${s.args.join(' ')}` : ''}`;
        if (print) { console.log(line); continue; }
        const r = spawnSync(process.execPath, [script(s.file), ...s.args], { stdio: 'inherit', cwd: ROOT, env: { ...process.env, PPS_DEBUG_VERB: '1' } });
        if (r.status) code = r.status;
      }
    }
  }
  process.exit(code);
}
