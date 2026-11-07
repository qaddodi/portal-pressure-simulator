// Presenter view, the talk's side (N1): publishes the slide on show to a second window over a BroadcastChannel and takes Next, Back and
// jump from it. The window (presenter-view-page.js) draws text only, so it costs the main window no GPU. Nothing here touches the figure.

export const CHANNEL = 'pps-presenter-view';
export const VIEW_QUERY = 'presenter-view';

// (A slide's words as plain text: the markup of its terms and values ([label](term), {term}, **bold**) comes off.)
export const plain = (t) => String(t ?? '').replace(/\[([^\]]+)\]\([\w:]+\)/g, '$1').replace(/\{([^}]+)\}/g, '$1').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();

export function slideView(s) {
  if (!s) return null;
  const [q, a] = Array.isArray(s.ask) ? s.ask : s.ask ? [s.ask] : [];
  return { kicker: plain(s.kicker), title: plain(s.title), line: plain(s.line), notes: String(s.notes ?? '').trim(), ask: q ? [plain(q), a ? plain(a) : ''] : null };
}

export function createPresenterLink({ onCmd, onBlocked } = {}) {
  let ch = null, win = null, last = null, deckId = null, talk0 = 0, slide0 = 0, at = -1;
  try { ch = typeof BroadcastChannel === 'function' ? new BroadcastChannel(CHANNEL) : null; } catch { ch = null; }
  const post = (m) => { try { ch?.postMessage(m); } catch { /* a closed channel: nothing to tell */ } };
  if (ch) ch.onmessage = (e) => {
    const m = e.data;
    if (m?.t === 'hello') { if (last) post(last); else post({ t: 'end' }); } else if (m?.t === 'cmd') onCmd?.(m);
  };
  return {
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
        if (!win || win.closed) win = window.open(new URL(`?${VIEW_QUERY}`, location.href.split('#')[0]).href, CHANNEL, 'popup=yes,width=1000,height=680');
        else win.focus();
      } catch { win = null; }
      if (!win) onBlocked?.();
      return !!win;
    },
    last: () => last,
    close() { try { ch?.close(); } catch { /* already closed */ } ch = null; },
  };
}
