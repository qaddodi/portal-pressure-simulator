// Bins the stretches of the change between the views off the main thread (veins-sweep.js binSwept; stage.js morphTrack): a stretch's
// binning takes as long as a whole binning of the figure, and is made while the figure rests, ahead of the change.
import { binSwept } from './veins-sweep.js?v=c4ad517372';

self.onmessage = (e) => {
  const { id, tubes, joins, opts } = e.data;
  try {
    const b = binSwept(tubes, joins, opts);
    self.postMessage({ id, b }, [b.ent.buffer, b.cells.buffer, b.blood.buffer, b.bloodQ.buffer]);
  } catch (err) {
    self.postMessage({ id, error: String(err?.message || err) });
  }
};
