// Input to first visible change (premium-feel recs R2): how long after a press, a tap or a key the page first changes.
//
// An input stamps the time it was made (the event's own timestamp, so a main thread that was busy when it arrived counts: that
// wait is part of what the learner feels). The first change to the page after the stamp, a DOM mutation (a class, an attribute, a
// node, a text), marks it answered, and the scheduler's next frame closes it: the time from the input to the end of that frame is
// the answer's latency. Taps are stamped at the click, because that is when a button acts (a finger resting on one for 80 ms is
// the person's time, not the page's); a press on the figure, a drag's start, and a key, at the press. An input the page never
// answers (a tap on empty paper) is dropped after a short wait and counted as ignored.
//
// Cost: three passive listeners, and a MutationObserver that watches only while an input waits for its answer (a few frames).
//
// The page is judged "changed" by any DOM mutation outside the ?perf readout, so on a page whose readings are changing by
// themselves (a running model updates its numbers ten times a second) an unrelated change can answer an input early: a time here
// is at most the true one. The frame gate pauses the model before it measures (scripts/frame-gate.mjs).

const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab']);

/**
 * @param {object} d  what the browser supplies (a unit test supplies stand-ins):
 *   now()            the clock in ms, the same as the events' timeStamp (performance.now)
 *   listen(type, fn) calls fn(event) for every event of that type, on the window, capturing, passive
 *   watch(onChange)  returns { start(), stop() }: calls onChange(records) with each batch of mutation records between them
 *   ask(fn)          calls fn in the scheduler's next frame, after the frame's other callbacks
 *   ignore(node)     true for a changed node that is not the page answering (the ?perf readout)
 *   describe(target) a short name for what was pressed (`button#btnMenu`)
 */
export function createInputLatency({ now = () => performance.now(), listen, watch, ask, ignore = () => false, describe = () => '', timeoutMs = 800, keep = 200 } = {}) {
  const open = [];       // inputs waiting for their answer: { kind, target, t0, answered }
  const done = [];       // the last `keep` answered: { i, kind, target, ms }
  let seq = 0, ignored = 0, asked = false, watching = false;

  const watcher = watch((records) => {
    let changed = false;
    for (const r of records) if (!ignore(r.target)) { changed = true; break; }
    if (!changed) return;
    for (const s of open) s.answered = true;
  });

  const request = () => { if (!asked) { asked = true; ask(check); } };
  function check() {
    asked = false;
    const t = now();
    for (let i = open.length - 1; i >= 0; i--) {
      const s = open[i];
      if (s.answered) { open.splice(i, 1); done.push({ i: ++seq, kind: s.kind, target: s.target, ms: Math.max(0, t - s.t0) }); if (done.length > keep) done.shift(); }
      else if (t - s.t0 > timeoutMs) { open.splice(i, 1); ignored++; }
    }
    if (open.length) request(); else if (watching) { watcher.stop(); watching = false; }
  }

  function stamp(kind, e) {
    const t = now(), ts = e.timeStamp;
    // (the event's own time; a missing, future or stale one, as a synthetic event can carry, falls back to now)
    const t0 = ts > 0 && ts <= t && t - ts < 5000 ? ts : t;
    open.push({ kind, target: describe(e.target), t0, answered: false });
    if (!watching) { watcher.start(); watching = true; }
    request();
  }

  listen('pointerdown', (e) => { if (e.isPrimary !== false) stamp('pointerdown', e); });
  listen('keydown', (e) => { if (!e.repeat && !MODIFIERS.has(e.key)) stamp('keydown', e); });
  listen('click', (e) => {
    // (A click made by the keyboard, or by a script, has no press of its own: its keydown is the stamp. A real click replaces the
    // press that began it, unless the press was already answered.)
    if (!e.detail) return;
    for (let i = open.length - 1; i >= 0; i--) if (open[i].kind === 'pointerdown' && !open[i].answered) open.splice(i, 1);
    stamp('click', e);
  });

  const sorted = () => done.map((d) => d.ms).sort((a, b) => a - b);
  const q = (v, p) => (v.length ? v[Math.min(v.length - 1, Math.floor(p * v.length))] : 0);
  return {
    /** The window.pps.perf.inputToPaint API. */
    api: {
      /** n answered so far, how many went unanswered, p50, p95 and the worst of the last `keep`, and the last few. */
      summary() {
        const v = sorted(), worst = done.reduce((a, b) => (b.ms > (a?.ms ?? -1) ? b : a), null);
        return { n: seq, ignored, p50: q(v, 0.5), p95: q(v, 0.95), worst: worst ? worst.ms : 0, worstWhat: worst ? `${worst.kind} ${worst.target}` : '', recent: done.slice(-10).map((d) => ({ ...d })) };
      },
      /** The answers numbered after `since` (a number summary().n returned earlier), oldest first. */
      entries(since = 0) { return done.filter((d) => d.i > since).map((d) => ({ ...d })); },
      /** How many inputs still wait for their answer. */
      pending: () => open.length,
      /** The slowest answers, slowest first. */
      slowest(n = 5) { return done.slice().sort((a, b) => b.ms - a.ms).slice(0, n).map((d) => ({ ...d })); },
      reset() { done.length = 0; open.length = 0; seq = 0; ignored = 0; if (watching) { watcher.stop(); watching = false; } },
    },
  };
}

/** A short name for what an event hit: the button, link, field or canvas it was on, as `button#btnMenu` or `button.pzb-next`. */
export function describeTarget(t) {
  const el = t?.nodeType === 1 ? t : t?.parentElement;
  if (!el) return '';
  // (The control first, then the picture: a tap on a button's icon is the button, not the svg inside it.)
  const hit = el.closest?.('button, a, input, select, textarea, [role="button"], [role="tab"]') || el.closest?.('canvas, svg') || el;
  const cls = hit.classList?.[0];
  return `${hit.localName}${hit.id ? `#${hit.id}` : cls ? `.${cls}` : ''}`;
}
