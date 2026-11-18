// The bug packet (plan screen-report-recs section 3): what a person pastes into a thread after pressing "What's wrong here?".
// One object, written two ways: text for a reader (an agent reads it as it is) and one JSON line a program reads back (`parsePacket`).
// Pure: no DOM, no page. `buildPacket` is handed what the app can say (`sources`), so a unit test, a Node replay and the page all use it.
//
//   buildPacket(sources, { note, now })    -> packet object
//   packetText(packet)                      -> the text to copy
//   parsePacket(text)                       -> { ok, packet, why? }   (text as copied, JSON alone, or the JSON block with its lines wrapped by a chat)
//   findingKey(f), splitFindings(list)      the identity of a finding; static (a state) and motion (the last seconds) findings apart
//
// sources:
//   state      captureState(pps)'s object (state.js)
//   link       the state link (state.js stateLink)
//   screen     the screen report ({...}) or null when this build has none      screenText   its summary text (pps.screen.text) or ''
//   history    the recorder's last seconds ({ samples, events, ... }) or null  watchFindings  [] the recorder's findings
//   findings   the rules' findings over the screen report                      device         { ua, screen, dpr, renderer, quality, look }
//   build      { release, badge, commit }                                      health         { errors, gpuMB, peakMB, slowFrame }

export const PACKET_V = 1;
export const BEGIN = '-----BEGIN PACKET JSON-----';
export const END = '-----END PACKET JSON-----';
export const MAX_JSON = 48 * 1024;   // (bytes of the JSON line: a paste stays something a thread can read)

/** The identity of a finding: its rule and what it is about. Where and when it happened are not part of it (a fix may move or shrink them). */
export const findingKey = (f) => `${f.rule}|${String(f.what || '').replace(/\s+/g, ' ').trim()}`;

/** A finding about the last seconds of motion (the recorder's, a rule over a history) rather than the state on the screen. */
export const isMotion = (f) => f.scope === 'history' || f.scope === 'motion' || (f.scope == null && f.at != null);
export const splitFindings = (list) => ({ state: (list || []).filter((f) => !isMotion(f)), motion: (list || []).filter(isMotion) });

const tidyFinding = (f) => {
  const o = { rule: String(f.rule), what: String(f.what ?? ''), where: String(f.where ?? '') };
  for (const k of ['why', 'owner', 'at', 'scope']) if (f[k] != null) o[k] = String(f[k]);
  return o;
};
const uniq = (list) => { const seen = new Set(), out = []; for (const f of list || []) { const k = `${findingKey(f)}|${f.where ?? ''}`; if (!seen.has(k)) { seen.add(k); out.push(tidyFinding(f)); } } return out; };

// A small stable hash (FNV-1a, 32 bit) for the packet's name and its check sum.
export function hash32(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

/** Thins a history so its JSON fits `maxBytes`: keeps the first and last samples and every n-th between (events are kept whole). */
export function thinHistory(h, maxBytes = 20 * 1024) {
  if (!h || !Array.isArray(h.samples)) return h || null;
  const size = (x) => JSON.stringify(x).length;
  if (size(h) <= maxBytes) return h;
  let step = 2, out = h;
  while (step <= h.samples.length && size(out) > maxBytes) {
    out = { ...h, samples: h.samples.filter((_, i) => i === 0 || i === h.samples.length - 1 || i % step === 0), thinned: step };
    step *= 2;
  }
  return out;
}

export function buildPacket(src, { note = '', now = () => new Date() } = {}) {
  const missing = [];
  const findings = uniq([...(src.findings || []), ...(src.watchFindings || [])]);
  if (!src.screen) missing.push('screen report: this build has no pps.screen() yet');
  if (!src.history) missing.push('motion history: the recorder was not on (?watch)');
  if (!src.findings) missing.push('self-checks: no rules registry in this build');
  const p = {
    kind: 'pps-bug-packet', v: PACKET_V, id: '', at: now().toISOString(), note: String(note || '').slice(0, 2000),
    build: src.build || {}, device: src.device || {}, health: src.health || {},
    link: src.link || '', state: src.state || null,
    findings,
    screen: src.screen ? { text: src.screenText || '', json: src.screen } : null,
    history: src.history ? thinHistory(src.history) : null,
    missing,
  };
  p.id = hash32(`${p.link}|${findings.map(findingKey).sort().join(';')}`).slice(0, 8);
  return withSum(trimToFit(p));
}

// A packet over MAX_JSON loses its detail first (the screen's JSON, then the history), never its findings, state or link: the replay rebuilds the rest.
function trimToFit(p) {
  const size = () => JSON.stringify(p).length;
  const cut = [];
  if (size() > MAX_JSON && p.history) { p.history = thinHistory(p.history, 6 * 1024); cut.push('motion history thinned'); }
  if (size() > MAX_JSON && p.screen?.json) { p.screen = { text: p.screen.text, json: null }; cut.push('screen JSON left out (the replay rebuilds it from the link)'); }
  if (size() > MAX_JSON && p.history) { p.history = null; cut.push('motion history left out'); }
  if (cut.length) p.missing = [...p.missing, ...cut];
  return p;
}
function withSum(p) { const q = { ...p }; delete q.sum; q.sum = hash32(JSON.stringify(q)); return q; }
/** The packet with its note changed (the person writes it after the packet is built); the check sum is made again. */
export const withNote = (p, note) => withSum({ ...p, note: String(note || '').slice(0, 2000) });
const sumOk = (p) => { const { sum, ...rest } = p; return sum === hash32(JSON.stringify(rest)); };

const when = (iso) => iso.replace('T', ' ').replace(/:\d\d\.\d+Z$/, ' UTC');

export function packetText(p) {
  const b = p.build || {}, d = p.device || {}, h = p.health || {};
  const L = [];
  L.push(`PPS BUG PACKET v${p.v} · ${p.id} · ${when(p.at)}`);
  L.push(`Build: ${[b.badge || b.release || '?', b.commit].filter(Boolean).join(' · ')}`);
  L.push(`Device: ${[d.screen && `${d.screen} @${d.dpr || 1}x`, d.look, d.renderer, d.quality != null && `quality ${d.quality}`, d.ua].filter(Boolean).join(' · ')}`);
  if (h.errors != null || h.gpuMB != null) L.push(`Health: ${[h.errors != null && `${h.errors} caught error${h.errors === 1 ? '' : 's'}`, h.gpuMB != null && `GPU ${h.gpuMB} MB (peak ${h.peakMB ?? '?'})`, h.slowFrame && `slowest frame ${h.slowFrame}`].filter(Boolean).join(', ')}`);
  L.push(`What I saw: ${p.note || '(not written)'}`);
  L.push(`Replay: ${p.link || '(no link)'}`);
  L.push('');
  L.push(p.findings.length ? `FINDINGS (${p.findings.length})` : 'FINDINGS (none: no self-check named this; the first job is the rule that would have)');
  p.findings.forEach((f, i) => L.push(`${i + 1}. ${f.rule}: ${f.what}${f.where ? `, ${f.where}` : ''}.${f.why ? ` Why: ${f.why}.` : ''}${f.owner ? ` Owner: ${f.owner}.` : ''}${f.at ? ` At ${f.at}.` : ''}`));
  if (p.screen?.text) { L.push(''); L.push('SCREEN'); L.push(p.screen.text); }
  if (p.history) { L.push(''); L.push(`MOTION: last ${p.history.seconds ?? '?'} s, ${p.history.samples?.length ?? 0} samples, ${p.history.events?.length ?? 0} events${p.history.thinned ? ' (thinned)' : ''}.`); }
  if (p.missing?.length) { L.push(''); L.push(`NOT IN THIS PACKET: ${p.missing.join('; ')}.`); }
  L.push('');
  L.push(BEGIN);
  L.push(JSON.stringify(p));
  L.push(END);
  return L.join('\n');
}

/** Reads a packet back from what was pasted. Tolerates a chat's code fences and wrapped lines; refuses text that changed on the way (its check sum). */
export function parsePacket(text) {
  const s = String(text ?? '');
  const a = s.indexOf(BEGIN), z = s.indexOf(END);
  let body = a >= 0 && z > a ? s.slice(a + BEGIN.length, z) : s.trim().startsWith('{') ? s : null;
  if (body == null) return { ok: false, why: 'no packet found: the text has no PACKET JSON block' };
  body = body.replace(/```(json)?/g, '').replace(/[\r\n]+/g, '').trim();
  let p;
  try { p = JSON.parse(body); } catch (e) { return { ok: false, why: `the packet's JSON could not be read (${e.message}); copy it again from the app` }; }
  if (!p || p.kind !== 'pps-bug-packet') return { ok: false, why: 'this JSON is not a bug packet' };
  if (p.v !== PACKET_V) return { ok: false, why: `packet version ${p.v}, this build reads ${PACKET_V}` };
  if (p.sum && !sumOk(p)) return { ok: false, why: 'the packet changed on its way (its check sum does not match): copy it again from the app, whole', packet: p };
  return { ok: true, packet: p };
}
