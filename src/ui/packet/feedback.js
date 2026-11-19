// What Send feedback adds on any copy, live site included (bible review 19 Nov 2026, 7.5): the screen's self-checks as a short text for the email, and the whole packet to copy.
// Loaded by main.js only when Send feedback is tapped (a lazy chunk; the live app never loads it otherwise). Reads the screen once, on that tap; nothing is sent by the app.
import { packetNow } from './sources.js';
import { packetText } from './packet.js';
import { shortReport } from './short.js';

/** { short, full } for the screen as it is now: the short text for the draft and the full packet text to copy. Never throws (null when the screen cannot be read). */
export async function readFeedback(pps, { win = window, doc = document } = {}) {
  try {
    const p = await packetNow(pps, { win, doc });
    return { short: shortReport(p), full: packetText(p), findings: p.findings.length };
  } catch { return null; }
}
