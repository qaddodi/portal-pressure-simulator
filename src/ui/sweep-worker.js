// Bins the stretches of the change between the views off the main thread (veins-sweep.js binSwept; stage.js morphTrack): a stretch's
// binning takes as long as a whole binning of the figure, and is made while the figure rests, ahead of the change.
// kind 'bin': a plain binning (veins-bin.js binVeins), the lobule's network made ahead of its first frame (lobule-zoom.js prebin).
import { binSwept } from './veins-sweep.js';
import { binVeins } from './veins-bin.js';

self.onmessage = (e) => {
  const { id, kind, tubes, joins, opts } = e.data;
  try {
    const b = kind === 'bin' ? binVeins(tubes, joins) : binSwept(tubes, joins, opts);
    self.postMessage({ id, b }, [b.ent.buffer, b.cells.buffer, b.blood.buffer, b.bloodQ.buffer]);
  } catch (err) {
    self.postMessage({ id, error: String(err?.message || err) });
  }
};
