// The surgical shunts as orders of the free sim: the Warren shunt (with its coronary tie), the two portocaval shunts, the mesocaval
// shunt and the Meso-Rex bypass. Each is the same parameter the talks' slides set (shunts.js, rex.js: { dsrs: true }, { rex: true }…),
// so the free sim and the slides run one model. The Treat card's Procedures tab and the command palette both place and take them
// down through placeShunt and removeShunt below, and every change lands in the timeline as one entry.
//
// What the engine does with each (engine.js, the shunt conductances and the ligations under them):
//   Warren (dsrs)        splenic vein → left renal vein; the splenic vein divided from the portal side, the coronary vein tied off.
//   Portocaval, end-to-side (portocaval)                   portal vein → IVC; the trunk divided at the liver: total diversion.
//   Portocaval, side-to-side (portocaval + portocavalSide) the same opening, the trunk kept: the liver drains back out through it.
//   Mesocaval (mesocaval)  superior mesenteric vein → IVC.
//   Meso-Rex (rex)       superior mesenteric vein → left portal vein, past a clotted trunk (GRAFTS.rex, the slides' play, says when).

import { GRAFTS } from './proc-anim.js';

/** One record per order: the params key, the vessel it selects, its names, and pure checks and patches on a params record. */
export const SURGICAL = [
  { id: 'warren', key: 'dsrs', edge: 'S_DSR', label: 'Warren shunt', the: 'Warren shunt', sub: 'splenic → left renal vein, coronary vein tied',
    kw: 'distal splenorenal dsrs selective surgical shunt coronary left gastric tie ligate varices',
    on: (p) => !!p.dsrs, apply: (p) => { p.dsrs = true; return p; }, remove: (p) => { p.dsrs = false; return p; }, blocked: () => '',
    done: 'Warren shunt made: splenic vein → left renal vein, and the coronary vein tied off.' },
  { id: 'pc-es', key: 'portocaval', edge: 'S_PC', label: 'Portocaval, end-to-side', the: 'end-to-side portocaval shunt', short: 'Portocaval shunt (end-to-side)', sub: 'portal vein divided → IVC',
    kw: 'portocaval shunt pcs end to side surgical total diversion ivc',
    on: (p) => !!p.portocaval && !p.portocavalSide, apply: (p) => { p.portocaval = true; p.portocavalSide = false; return p; },
    remove: (p) => { p.portocaval = false; p.portocavalSide = false; return p; }, blocked: () => '',
    done: 'End-to-side portocaval shunt made: the portal vein is divided at the liver and joined to the IVC.' },
  { id: 'pc-ss', key: 'portocaval', edge: 'S_PC', label: 'Portocaval, side-to-side', the: 'side-to-side portocaval shunt', short: 'Portocaval shunt (side-to-side)', sub: 'portal vein kept, joined to the IVC',
    kw: 'portocaval shunt pcs side to side surgical ivc liver decompress',
    on: (p) => !!p.portocaval && !!p.portocavalSide, apply: (p) => { p.portocaval = true; p.portocavalSide = true; return p; },
    remove: (p) => { p.portocaval = false; p.portocavalSide = false; return p; }, blocked: () => '',
    done: 'Side-to-side portocaval shunt made: the portal vein stays whole, so the liver can drain back out through it.' },
  { id: 'mesocaval', key: 'mesocaval', edge: 'S_MC', label: 'Mesocaval shunt', the: 'mesocaval shunt', sub: 'superior mesenteric vein → IVC',
    kw: 'mesocaval shunt surgical smv ivc graft',
    on: (p) => !!p.mesocaval, apply: (p) => { p.mesocaval = true; return p; }, remove: (p) => { p.mesocaval = false; return p; }, blocked: () => '',
    done: 'Mesocaval shunt made: superior mesenteric vein → IVC.' },
  { id: 'rex', key: 'rex', edge: 'REX', label: 'Meso-Rex bypass', the: 'Meso-Rex bypass', sub: 'SMV → left portal vein, past a clot',
    kw: 'meso rex mesorex bypass graft shunt surgical left portal vein clot thrombosis pvt',
    on: (p) => GRAFTS.rex.had(p), apply: (p) => GRAFTS.rex.apply(p), remove: (p) => GRAFTS.rex.undo(p), blocked: (p) => GRAFTS.rex.can(p),
    done: 'Meso-Rex bypass placed: superior mesenteric vein → left portal vein.' },
];
export const SURGICAL_BY_ID = Object.fromEntries(SURGICAL.map((s) => [s.id, s]));
/** The name a shunt goes by in the timeline and the palette. */
export const shuntName = (s) => s.short || s.label;

/** The verbs, bound to the store and the figure: place a shunt (and show its vessel), or take it down. */
export function surgicalVerbs({ store, updateParams, select, toast }) {
  function placeShunt(id) {
    const s = SURGICAL_BY_ID[id], p = store.get().params;
    if (s.on(p)) { select?.({ type: 'edge', id: s.edge }); toast?.(`The ${s.the} is already in place.`); return false; }
    // (The Meso-Rex bypass is only for a clotted trunk with an open left portal vein: the slides' own check says why not.)
    const why = s.blocked(p);
    if (why) { toast?.(why); return false; }
    updateParams((q) => s.apply(q), { label: shuntName(s) });
    select?.({ type: 'edge', id: s.edge });
    toast?.(s.done);
    return true;
  }
  function removeShunt(id) {
    const s = SURGICAL_BY_ID[id], p = store.get().params;
    // (Remove portocaval takes down either kind; the others only themselves.)
    if (!(s.key === 'portocaval' ? p.portocaval : s.on(p))) { toast?.(`There is no ${s.key === 'portocaval' ? 'portocaval shunt' : s.the} to take down.`); return false; }
    updateParams((q) => s.remove(q), { label: `Remove ${shuntName(s)}` });
    select?.(null);
    return true;
  }
  return { placeShunt, removeShunt };
}
