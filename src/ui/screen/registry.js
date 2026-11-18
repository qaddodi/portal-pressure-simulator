// The screen report's readers (plan screen-report-recs section 1): each part of pps.screen() is one reader that describes one part of what is on the
// screen as plain JSON. No DOM and no page import here: a unit test loads this in node.
//
//   registerReader({ id, owner, order?, volatile?, read(ctx), text(part, ctx) })
//     id        the part's name and its key in the report ('page', 'cards', 'camera', 'charts', 'labels', 'figure', 'motion', 'health')
//     owner     the file the reader describes (the painter or store it takes its records from), shown when a reader fails
//     order     where it stands in the report and the text (page 10, camera 20, cards 30, charts 40, labels 50, figure 60, motion 70, health 90)
//     volatile  true for a part that changes between two runs of one state (times, memory, frame counts): left out of stableReport(), so two runs compare equal
//     read      read(ctx) -> a plain JSON part (numbers rounded with r1/r2 from util.js), or null/undefined when there is nothing to say (the part is left out)
//     text      text(part, ctx) -> an array of plain sentences (the text form's lines for this part); ctx.detail is 'summary' or 'full'
//
//   ctx (made by build.js, the same object for every reader):
//     pps      window.pps (the app's own controls); may be a fake in node
//     io       { box(el), rects(el), style(el), metric(el, key), ctm(el) }: the layout reads. In the app these are layout-snap.js's; a reader never reads
//              layout any other way. Node's jsdom has no layout: its io returns empty boxes, and a reader must say "no layout" and not guess.
//     doc, win the page's document and window
//     env      the options pps.screen() was called with ({ detail, only, ... }) plus anything the host adds (minPx ...)
//     detail   'summary' (default) or 'full'
//     parts    the parts read so far, by id (a reader may use an earlier one: cards before labels)
//
// THE ONE RULE FOR READERS: a reader calls the same functions the painters call and takes the painter's own record (the placement it drew from, the paint it
// was handed). It never works anything out a second way: a report that computes a label's place again, slightly differently, would describe a screen nobody
// sees. Each reader's unit test checks that it imports its painter's function and does not copy it.

const readers = new Map(), clash = [];

export function registerReader(o) {
  if (!o || typeof o !== 'object') throw new TypeError('reader: an object is needed');
  if (typeof o.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(o.id) || ['v', 'detail', 'findings', 'errors'].includes(o.id)) throw new TypeError(`reader: id must be lower-case words joined by dashes and not v, detail, findings or errors (${String(o.id)})`);
  if (typeof o.read !== 'function') throw new TypeError(`reader ${o.id}: read(ctx) is needed`);
  if (typeof o.owner !== 'string' || !o.owner) throw new TypeError(`reader ${o.id}: owner (the file it describes) is needed`);
  if (readers.has(o.id)) { clash.push(o.id); return false; }
  readers.set(o.id, { order: 50, volatile: false, text: null, ...o });
  return true;
}

const byOrder = (a, b) => a.order - b.order || a.id.localeCompare(b.id);
export const readerList = () => [...readers.values()].sort(byOrder);
export const readerIds = () => readerList().map((r) => r.id);
export const readerById = (id) => readers.get(id) || null;
export const readerClashes = () => clash.slice();
