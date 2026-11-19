// The bug packet from the command line (plan screen-report-recs section 3; the agent guide is docs/bug-packet.md).
//
//   node scripts/packet.mjs make <state link> [--note "..."] [--env node|headless] [--out file]
//                                                             make a packet from an address (what a person would have copied), to see what the report says of a state
//   node scripts/packet.mjs show <packet.txt | ->            read a pasted packet: its findings, its state, what it lacks, whether it arrived whole
//   node scripts/packet.mjs link <packet.txt | -> [--base U] the state link (open it in a browser to see what the person saw)
//   node scripts/packet.mjs replay <packet.txt | -> [--env node|headless] [--device iphone|mac|...] [--dir .|dist] [--out result.json]
//                                                             put the app in the packet's state, take the screen report, run the rules, say what is the same
//   node scripts/packet.mjs compare <before> <after>          what a fix changed: each is a packet or a replay result (--out)
//   node scripts/packet.mjs test <packet.txt | -> [--name n] [--rule id,id] [--expect path=value ...] [--dir tests/packets]
//                                                             write the fixture tests/packets.test.js replays, so the bug cannot come back
//
// `-` reads standard input (paste the packet, then Ctrl-D). Exit status: replay 0 when the packet's findings are gone or it had none to hold, 1 when still there
// (so a fix's proof is `replay` exiting 0 on a tree where it exited 1), 2 for a packet that cannot be read; compare 0 for fixed or unchanged.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePacket, packetText, buildPacket } from '../src/ui/packet/packet.js';
import { stateLink, readStateLink } from '../src/ui/packet/state.js';
import { resultLines, comparePackets, replayPacket } from '../src/ui/packet/replay.js';
import { makeFixture } from '../src/ui/packet/test-from-packet.js';
import { pointTo } from './debug-notice.mjs';
pointTo('packet ...');

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const cmd = argv[0];
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const opts = (n) => argv.flatMap((a, i) => (a === `--${n}` && argv[i + 1] ? [argv[i + 1]] : []));
const file = (i) => argv.filter((a, j) => !a.startsWith('--') && !(j > 0 && argv[j - 1].startsWith('--')))[i + 1];
const say = (...l) => console.log(...l);
const die = (m, code = 2) => { console.error(m); process.exit(code); };

const readText = (f) => (f === '-' || !f ? readFileSync(0, 'utf8') : readFileSync(resolve(f), 'utf8'));
function readAny(f) {
  const text = readText(f);
  try { const j = JSON.parse(text); if (j?.kind === 'pps-replay') return { replay: j }; if (j?.kind === 'pps-bug-packet') return { packet: j }; } catch { /* (text with a packet block) */ }
  const r = parsePacket(text);
  if (!r.ok) die(`Cannot read the packet: ${r.why}`);
  return { packet: r.packet };
}
const needPacket = (f) => { const x = readAny(f); if (!x.packet) die('This is a replay result, not a packet.'); return x.packet; }

async function main() {
  if (cmd === 'make') {
    const link = file(0);
    if (!link) die('usage: node scripts/packet.mjs make <state link>');
    const state = readStateLink(link);
    if (!state.share) die('That address carries no #s= state (a packet link ends in #s=...).');
    const { makeEnv } = await import(opt('env', 'node') === 'headless' ? './packet-headless.mjs' : './packet-node.mjs');
    const env = await makeEnv({ packet: { state }, device: opt('device', ''), dir: opt('dir', '.') });
    try {
      await env.apply(state); await env.settle();
      const { findings, ...screen } = (await env.screen()) || {};
      await import('../src/ui/screen/build.js');   // (registers the readers the text form walks)
      const { screenText } = await import('../src/ui/screen/text.js');
      const p = buildPacket({ state, link: stateLink(state, new URL(link).origin + new URL(link).pathname), screen: findings ? screen : null, screenText: findings ? screenText({ ...screen, findings }) : '', findings: findings || null, device: {}, build: {} }, { note: opt('note', '') });
      const text = packetText(p);
      if (opt('out', '')) { writeFileSync(resolve(opt('out')), text); say(`Saved ${opt('out')}`); } else say(text);
    } finally { await env.close?.(); }
    return 0;
  }
  if (cmd === 'show') {
    const p = needPacket(file(0));
    say(packetText(p).split('-----BEGIN PACKET JSON-----')[0].trimEnd());
    say(`\nState: ${JSON.stringify(p.state)}`);
    return 0;
  }
  if (cmd === 'link') {
    const p = needPacket(file(0));
    say(opt('base', '') ? stateLink(p.state, opt('base')) : p.link);
    return 0;
  }
  if (cmd === 'replay') {
    const p = needPacket(file(0));
    const which = opt('env', 'node');
    const { makeEnv } = await import(which === 'headless' ? './packet-headless.mjs' : './packet-node.mjs');
    const env = await makeEnv({ device: opt('device', ''), dir: opt('dir', '.'), packet: p });
    let r;
    try { r = await replayPacket(p, env); } finally { await env.close?.(); }
    for (const l of resultLines(r)) say(l);
    if (opt('out', '')) { writeFileSync(resolve(opt('out')), JSON.stringify(r, null, 1)); say(`Saved ${opt('out')} (compare it with a later replay: node scripts/packet.mjs compare <this> <later>)`); }
    return ['gone', 'no-rule'].includes(r.verdict) ? 0 : r.verdict === 'motion-only' ? 0 : 1;
  }
  if (cmd === 'compare') {
    const a = readAny(file(0)), b = readAny(file(1));
    const c = comparePackets(a.replay || a.packet, b.replay || b.packet);
    for (const l of c.lines) say(l);
    return ['fixed', 'unchanged'].includes(c.verdict) ? 0 : 1;
  }
  if (cmd === 'test') {
    const p = needPacket(file(0));
    const expect = opts('expect').map((s) => { const i = s.lastIndexOf('='); const v = s.slice(i + 1); return /^-?[\d.]+$/.test(v) ? { path: s.slice(0, i), near: +v, tol: 0.01 } : { path: s.slice(0, i), equals: v }; });
    let fx;
    try { fx = makeFixture(p, { name: opt('name', ''), rules: opt('rule', '') ? opt('rule').split(',') : undefined, expect }); } catch (e) { die(e.message, 1); }
    const dir = resolve(ROOT, opt('dir', 'tests/packets'));
    mkdirSync(dir, { recursive: true });
    const out = join(dir, `${fx.name}.json`);
    if (existsSync(out)) die(`${out} exists already; pick another --name`, 1);
    writeFileSync(out, `${JSON.stringify(fx, null, 1)}\n`);
    say(`Wrote ${out}\nIt holds clean: ${fx.hold.map((h) => `${h.rule} (${h.what})`).join('; ') || '(values only)'}.\nRun: node --test tests/packets.test.js   (it fails on this tree until the bug is fixed, then stays green)`);
    return 0;
  }
  die('usage: node scripts/packet.mjs show|link|replay|compare|test <packet.txt | -> (see the top of the file)', 2);
}
process.exit(await main());
