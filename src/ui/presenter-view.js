// Presenter view, the talk's side (N1): publishes the slide on show to a second window over a BroadcastChannel and takes Next, Back and
// jump from it. The window (presenter-view-page.js) draws text only, so it costs the main window no GPU. Nothing here touches the figure.

// One talk, one notes window (R06, external production review, 15 Nov 2026): the channel was one fixed name, `pps-presenter-view`, and its commands carried no
// identity, so a second talk (a second tab, or main and the preview, which share an origin) took the first one's Next and Back. Each presentation host now mints a
// session id; the channel and the window are named for it, the notes window's address carries it (?presenter-view=<id>), and every message carries the protocol
// version and the id. A message of another shape, version or session, or a command that is not one of the three, is dropped.
export const CHANNEL = 'pps-presenter-view';
export const VIEW_QUERY = 'presenter-view';
export const PROTOCOL = 1;
export const COMMANDS = Object.freeze(['next', 'prev', 'go']);
export const BEAT_MS = 2000;       // (the talk's heartbeat while a notes window is open: a window that hears nothing for STALE_MS says it is disconnected)
export const STALE_MS = 3 * BEAT_MS + 500;
const SID = /^[0-9a-z]{12,64}$/;
export const validSession = (sid) => typeof sid === 'string' && SID.test(sid);
/** A fresh session id: 20 random lower-case letters and digits. */
export function newSession() {
  const a = new Uint8Array(20);
  try { crypto.getRandomValues(a); } catch { for (let i = 0; i < a.length; i++) a[i] = (Math.random() * 256) | 0; }
  return Array.from(a, (b) => (b % 36).toString(36)).join('');
}
/** The channel (and window) name of a session. */
export const channelOf = (sid) => `${CHANNEL}:${sid}`;
/** What a notes window may ask: the message it sent, checked. Returns the command ({ c, i? }) or null. */
export function commandOf(m, sid) {
  if (!m || typeof m !== 'object' || m.v !== PROTOCOL || m.sid !== sid || m.t !== 'cmd' || !COMMANDS.includes(m.c)) return null;
  if (m.c === 'go') return Number.isInteger(m.i) && m.i >= 0 && m.i < 10000 ? { c: 'go', i: m.i } : null;
  return { c: m.c };
}
/** Whether a message from the talk is one this notes window follows. */
export const fromTalk = (m, sid) => !!m && typeof m === 'object' && m.v === PROTOCOL && m.sid === sid && ['state', 'end', 'beat'].includes(m.t);

// (A slide's words as plain text: the markup of its terms and values ([label](term), {term}, **bold**) comes off.)
export const plain = (t) => String(t ?? '').replace(/\[([^\]]+)\]\([\w:]+\)/g, '$1').replace(/\{([^}]+)\}/g, '$1').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();

export function slideView(s) {
  if (!s) return null;
  const [q, a] = Array.isArray(s.ask) ? s.ask : s.ask ? [s.ask] : [];
  return { kicker: plain(s.kicker), title: plain(s.title), line: plain(s.line), notes: String(s.notes ?? '').trim(), ask: q ? [plain(q), a ? plain(a) : ''] : null };
}

export function createPresenterLink({ onCmd, onBlocked, sid = newSession(), beatMs = BEAT_MS } = {}) {
  let ch = null, win = null, last = null, deckId = null, talk0 = 0, slide0 = 0, at = -1, beat = 0;
  try { ch = typeof BroadcastChannel === 'function' ? new BroadcastChannel(channelOf(sid)) : null; } catch { ch = null; }
  const post = (m) => { try { ch?.postMessage({ ...m, v: PROTOCOL, sid }); } catch { /* a closed channel: nothing to tell */ } };
  // (The heartbeat runs only while the notes window is open, so a talk with none has no timer.)
  const stopBeat = () => { if (beat) { clearInterval(beat); beat = 0; } };
  const startBeat = () => { if (!beat) beat = setInterval(() => { if (!win || win.closed) { stopBeat(); return; } post({ t: 'beat' }); }, beatMs); };
  if (ch) ch.onmessage = (e) => {
    const m = e.data;
    if (!m || typeof m !== 'object' || m.v !== PROTOCOL || m.sid !== sid) return;   // (another talk's, an older page's, or no message at all)
    if (m.t === 'hello') { if (last) post(last); else post({ t: 'end' }); return; }
    const c = commandOf(m, sid);
    if (c) onCmd?.(c);
  };
  return {
    sid,
    // The slide on show (called as the bar is painted: a slide, a beat, a jump). The talk clock starts with the deck, the slide clock with the slide.
    publish(deck, slides, i, beat = 0, beats = 1) {
      if (!deck || !slides[i]) return;
      const now = Date.now();
      if (deck.id !== deckId) { deckId = deck.id; talk0 = now; at = -1; }
      if (i !== at) { at = i; slide0 = now; }
      last = { t: 'state', deck: { id: deck.id, title: plain(deck.title), n: slides.length }, i, beat, beats, cur: slideView(slides[i]), next: slideView(slides[i + 1]), talk0, slide0 };
      post(last);
    },
    end() { last = null; deckId = null; at = -1; post({ t: 'end' }); },
    // Opens (or brings forward) the window; call it inside a key press or a tap so the browser lets it open.
    open() {
      try {
        if (!win || win.closed) win = window.open(new URL(`?${VIEW_QUERY}=${sid}`, location.href.split('#')[0]).href, channelOf(sid), 'popup=yes,width=1000,height=680');
        else win.focus();
      } catch { win = null; }
      if (!win) onBlocked?.(); else startBeat();
      return !!win;
    },
    last: () => last,
    close() { stopBeat(); try { ch?.close(); } catch { /* already closed */ } ch = null; },
  };
}
