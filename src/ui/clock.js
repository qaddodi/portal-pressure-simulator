// One shared animation clock for every live picture (FibroScan, endoscopy, ...). simTime(now) takes the
// frame's performance.now() and returns seconds that stop advancing while the simulation is paused and
// carry on from the same value on resume, so nothing jumps. Also mirrors the pause onto <body> so CSS
// loops can freeze (body.sim-paused).

import { store } from './store.js?v=49dc9cdf15';

let acc = 0, lastReal = null;

export function simTime(now = performance.now()) {
  if (lastReal !== null && store.get().running) acc += Math.min(Math.max(now - lastReal, 0), 200);
  lastReal = now;
  return acc / 1000;
}

export const isPaused = () => !store.get().running;

const mirror = () => document.body?.classList.toggle('sim-paused', !store.get().running);
store.on('running', mirror);
if (document.body) mirror(); else addEventListener('DOMContentLoaded', mirror);
