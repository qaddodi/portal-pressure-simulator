// The short form of a bug packet for Send feedback (bible review 19 Nov 2026, 7.5 and PROD-29): what the app's own self-checks found on the screen, in words a tester's email can carry,
// and a size cap for the whole mailto draft (it had none: a long diagnostics list could make a link some mail apps refuse). Pure: no DOM, no page. The long form is the packet itself.
//
//   shortReport(packet, { max })        -> text of at most `max` characters (default SHORT_MAX): the finding count, then the findings one line each, then "and K more"
//   fitMailto(base, extra, { maxEncoded }) -> the body that, percent-encoded, stays within `maxEncoded` characters: `extra` is cut first, `base` only if it alone is too long
//   cutAt(text, max)                    -> text cut at a line or word end, never mid-word

export const SHORT_MAX = 1800;
/** The longest percent-encoded body a mailto link carries (the subject and address come on top; a few mail apps refuse links near 2,000 characters, most take far more). */
export const MAILTO_MAX = 6000;

/** `text` cut to at most `max` characters, at the last line break or space before the cut, with an ellipsis when something went. */
export function cutAt(text, max) {
  const s = String(text ?? '');
  if (s.length <= max) return s;
  const head = s.slice(0, Math.max(0, max - 1));
  const at = Math.max(head.lastIndexOf('\n'), head.lastIndexOf(' '));
  return `${(at > max * 0.5 ? head.slice(0, at) : head).trimEnd()}…`;
}

const one = (f, i) => `${i + 1}. ${f.rule}: ${String(f.what ?? '').replace(/\s+/g, ' ').trim()}${f.where ? `, ${String(f.where).replace(/\s+/g, ' ').trim()}` : ''}`;

export function shortReport(p, { max = SHORT_MAX } = {}) {
  const list = (p?.findings || []).filter((f) => f && f.rule);
  const head = list.length ? `Self-checks on this screen: ${list.length} finding${list.length === 1 ? '' : 's'}` : 'Self-checks on this screen: nothing named';
  const lines = [head];
  let used = head.length;
  let shown = 0;
  for (const [i, f] of list.entries()) {
    const line = cutAt(one(f, i), 240);
    const tail = `\n… and ${list.length - i - 1} more in the full report`;
    if (used + 1 + line.length + (i < list.length - 1 ? tail.length : 0) > max) break;
    lines.push(line); used += 1 + line.length; shown++;
  }
  if (shown < list.length) lines.push(`… and ${list.length - shown} more in the full report`);
  const h = p?.health || {};
  if (h.errors) lines.push(`Caught errors: ${h.errors}`);
  return cutAt(lines.join('\n'), max);
}

const enc = (s) => encodeURIComponent(s).length;

/** The mailto body: `base` (what the draft always had) then `extra` (the short report), within `maxEncoded` percent-encoded characters. `extra` goes first when over; `base` only when it alone is too long. */
export function fitMailto(base, extra = '', { maxEncoded = MAILTO_MAX } = {}) {
  const join = (b, x) => (x ? `${b}\n\n${x}` : b);
  let body = join(base, extra);
  if (enc(body) <= maxEncoded) return body;
  // (percent-encoding makes a character up to 9 bytes; cut by halving the overshoot until it fits)
  let x = extra;
  while (x && enc(join(base, x)) > maxEncoded) x = x.length < 40 ? '' : cutAt(x, Math.floor(x.length * 0.8));
  body = join(base, x);
  let b = base;
  while (enc(body) > maxEncoded && b.length > 200) { b = cutAt(b, Math.floor(b.length * 0.85)); body = join(b, x); }
  return body;
}
