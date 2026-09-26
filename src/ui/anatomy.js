// Stage geometry (blueprint §6). Logical space 1400 × 1000.
// Standard anatomical frontal view: the patient's right is on the viewer's LEFT.
//
// The stage is a focused plate of the portal circulation: the portal tree, the liver's
// microcirculation, hepatic outflow to the right atrium and the collaterals. Vessels that
// only close the systemic loop (aorta, limb and head vessels, the right kidney) are part of
// the model but are not drawn.

export const VIEW = { w: 1400, h: 1000 };
export const VB_ANAT = [300, 0, 820, 920];
export const VB_CIRC = [30, 30, 1340, 700];
// World x of the margins the atlas labels hang from (left, right).
export const ATLAS_COLUMNS = [318, 1102];

// Model vessels that are never drawn, and nodes that therefore have no position of their own.
export const HIDDEN_EDGES = new Set(['A_SMA', 'A_IMA', 'A_SPL', 'A_LGA', 'A_REN_L', 'A_REN_R', 'A_LOW', 'A_UP', 'A_AZY', 'A_EPI',
  'V_LOW', 'V_KID_R', 'RRV_IVC',
  // The hepatic artery and its branches (and the arterioportal shunts off them) are modeled
  // but not drawn: the plate is about the venous portal circulation.
  'A_HEP', 'A_HR', 'A_HL', 'AP_R', 'AP_L',
  // The interlobar sinusoidal link is modeled but not drawn: it carries almost nothing and added
  // a line that only lit up with congestion the lobes already show.
  'SIN_RL',
  // The stomach's own drainage into the coronary vein is modeled, not drawn: a branch across the
  // stomach body only cluttered the lesser curvature.
  'V_STO']);
export const HIDDEN_NODES = new Set(['AO', 'UPPV', 'LOWV', 'KID_R', 'RRV', 'HA']);
// Systemic veins drawn quietly: they matter only as the places collaterals drain to.
export const CONTEXT_EDGES = new Set(['V_UP', 'SVC_RA', 'AZY_SVC', 'ILI_IVC', 'EPI_ILI', 'EPI_SVC', 'V_KID_L', 'LRV_IVC']);
// Edges the circuit draws but the anatomy leaves out (none at present: the abdominal-wall veins
// the paraumbilical route opens into are drawn from the caput medusae to the SVC and the iliac).
export const ANAT_HIDDEN = new Set([]);
// Drawn only once the paraumbilical collateral has opened.
export const NEEDS_C3 = new Set(['EPI_ILI', 'EPI_SVC']);
// Retroperitoneal vessels, drawn behind the organs (the liver and bowel veil them).
export const BACK_EDGES = new Set(['IVC_IS', 'ILI_IVC', 'LRV_IVC', 'V_KID_L', 'C7', 'C9', 'S_MC', 'C1b']);

// Node positions: [anatomic, circuit]
export const NODE_POS = {
  AO: [[760, 540], [610, 240]],
  HA: [[655, 478], [740, 228]],
  INT: [[690, 790], [140, 394]],
  COL: [[960, 790], [140, 310]],
  SPL: [[1034, 360], [140, 261]],
  STO: [[880, 395], [140, 191]],
  SMV: [[690, 660], [320, 394]],
  IMV: [[932, 690], [240, 310]],
  SV: [[880, 505], [320, 261]],
  LGV: [[821, 318], [320, 191]],
  CONF: [[700, 556], [480, 345]],
  PVH: [[602, 442], [580, 345]],
  RPV: [[505, 398], [680, 303]],
  LPV: [[688, 378], [680, 387]],
  VAR: [[797, 232], [620, 128]],
  GV: [[876, 302], [240, 121]],
  SIN_R: [[420, 345], [800, 303]],
  SIN_L: [[750, 300], [800, 387]],
  CV_R: [[446, 296], [900, 303]],
  CV_L: [[738, 262], [900, 387]],
  W_R: [[470, 262], [960, 290]],
  W_M: [[560, 272], [960, 346]],
  W_L: [[700, 238], [960, 401]],
  RHV: [[540, 224], [1000, 282]],
  MHV: [[598, 238], [1000, 345]],
  LHV: [[660, 214], [1000, 408]],
  IVCI: [[620, 650], [1120, 478]],
  IVCS: [[620, 190], [1120, 345]],
  RA: [[620, 112], [1250, 345]],
  SVC: [[620, 40], [1250, 205]],
  AZY: [[566, 172], [1120, 205]],
  UPPV: [[620, -40], [1250, 100]],
  LOWV: [[620, 980], [1120, 660]],
  ILI: [[620, 880], [1120, 610]],
  EPI: [[500, 800], [1000, 610]],
  KID_L: [[1005, 622], [880, 540]],
  KID_R: [[500, 622], [880, 562]],
  LRV: [[862, 618], [1000, 540]],
  RRV: [[560, 625], [1000, 562]],
};

// Anatomic edge paths (SVG path data). Edges without an entry are drawn from node to node.
export const EDGE_PATH = {
  A_HEP: 'M760 540 C 730 520 690 495 655 478',
  A_HR: 'M655 478 C 610 462 545 430 505 412 C 472 398 444 372 420 345',
  A_HL: 'M655 478 C 672 440 690 400 712 362 C 728 336 740 318 750 300',

  V_INT: 'M690 790 C 690 750 690 700 690 660',
  V_COL: 'M960 790 C 952 760 942 725 932 690',
  V_IMV: 'M932 690 C 925 620 905 560 880 505',
  V_SPL: 'M1034 360 C 1010 385 988 420 962 448 C 938 473 910 492 880 505',
  V_STO: 'M880 395 C 860 368 828 332 792 312',
  SMV_CONF: 'M690 660 C 692 625 696 590 700 556',
  SV_CONF: 'M880 505 C 830 525 765 545 700 556',
  LGV_CONF: 'M821 318 C 829 348 835 384 833 412 C 831 440 818 463 797 477 C 774 492 746 499 726 500 C 710 506 702 528 700 556',
  PV_TRUNK: 'M700 556 C 675 522 638 478 602 442',
  PVH_R: 'M602 442 C 568 428 535 414 505 398',
  PVH_L: 'M602 442 C 632 418 660 398 688 378',
  PRE_R: 'M505 398 C 478 392 446 374 420 345',
  PRE_L: 'M688 378 C 708 352 730 326 750 300',
  SIN_RR: 'M420 345 C 414 328 424 308 446 296',
  SIN_LL: 'M750 300 C 754 286 750 272 738 262',
  SIN_RL: 'M420 345 C 520 382 664 362 750 300',
  POST_R_RHV: 'M446 296 C 474 270 506 240 540 224',
  POST_R_MHV: 'M446 296 C 496 292 562 276 598 238',
  POST_L_LHV: 'M738 262 C 712 242 686 226 660 214',
  POST_L_MHV: 'M738 262 C 694 256 640 250 598 238',
  // The caudate lobe drains straight into the retrohepatic IVC through its own short hepatic
  // veins: gathered from the lobe's parenchyma (tributaries, see FEEDERS), not from the portal
  // vein, which it does not touch.
  CAUD: 'M566 326 C 588 328 606 338 620 350',
  RHV_IVC: 'M540 224 C 568 210 594 198 620 190',
  MHV_IVC: 'M598 238 C 606 222 613 205 620 190',
  LHV_IVC: 'M660 214 C 646 204 632 196 620 190',
  IVC_IS: 'M620 650 L 620 190',
  IVCS_RA: 'M620 190 L 620 112',
  V_UP: 'M620 -40 L 620 40',
  SVC_RA: 'M620 40 L 620 112',
  // The azygos ascends lateral to the cava (drawn clear of the heart) and arches medially into
  // the SVC above the right atrium.
  AZY_SVC: 'M566 172 C 562 136 558 96 566 72 C 574 50 598 42 620 40',
  V_KID_L: 'M1005 622 C 960 620 910 618 862 618',
  LRV_IVC: 'M862 618 C 790 620 700 640 620 650',
  ILI_IVC: 'M620 880 L 620 650',
  EPI_ILI: 'M500 800 C 530 860 580 884 620 880',
  EPI_SVC: 'M500 800 C 420 780 340 680 334 520 C 318 410 318 260 360 170 C 400 90 520 52 620 40',

  C1a: 'M821 318 C 814 296 803 280 800 262 C 798 250 797 240 797 232',
  C1b: 'M797 232 C 770 214 720 202 666 198 C 622 196 584 192 566 172',
  C2: 'M880 505 C 890 462 912 420 922 380 C 930 344 910 308 876 302',
  C2b: 'M876 302 C 858 300 838 306 821 318',
  C3: 'M688 378 C 668 440 646 520 620 600 C 590 690 540 760 500 800',
  C4: 'M932 690 C 940 790 890 870 810 890 C 730 908 660 900 620 880',
  // Leaves the fundus in a gentle curve and runs down clear of the coronary vein, easing into
  // the left renal vein.
  C5: 'M876 302 C 864 318 854 340 852 380 C 850 460 852 560 858 596 C 860 606 861 612 862 618',
  C6: 'M880 505 C 880 548 874 590 862 618',
  C7: 'M690 660 C 668 676 640 670 620 650',
  C8: 'M700 556 C 695 520 650 470 602 442',
  C9: 'M620 650 C 584 604 566 500 564 400 C 562 300 564 230 566 172',

  AP_R: 'M655 478 C 612 470 552 432 505 398',
  AP_L: 'M655 478 C 668 440 680 405 688 378',
  TIPS: 'M505 398 C 486 352 552 294 540 224',   // a gentle S through the parenchyma, portal → hepatic vein
  S_PC: 'M700 556 C 682 590 652 625 620 650',
  S_DSR: 'M880 505 C 862 548 852 590 862 618',
  S_MC: 'M690 660 C 672 650 645 648 620 650',
};

// Collateral plexuses: a collateral is rarely one clean vein. The periportal collateral of a
// cavernous transformation is a braid of small, tortuous channels around the occluded trunk,
// and the varices are fed and drained the same way: the coronary vein reaches the esophageal
// varices, and they reach the azygos, through a plexus of periesophageal channels; the short and
// posterior gastric veins leave the splenic vein as one vein and break up into a leash of
// channels as they reach the fundal varices. (A gastrorenal or splenorenal shunt is a single
// large vein, not a plexus.) In the anatomic view these get extra strands that leave and rejoin
// the vessel: [lateral offset at mid-course, serpentine phase, caliber fraction].
export const STRANDS = {
  C8: [[-36, 1.1, 0.5], [-24, 3.9, 0.6], [13, 2.4, 0.65], [25, 5.2, 0.5], [36, 0.3, 0.42]],
  C1a: [[-11, 0.7, 0.5], [-5, 3.3, 0.6], [6, 1.9, 0.55], [12, 4.6, 0.45]],
  C2: [[-22, 4.1, 0.45], [-11, 1.4, 0.55], [10, 2.9, 0.55], [21, 0.4, 0.42]],
  C2b: [[-6, 2.6, 0.5], [6, 0.8, 0.5]],
};
// Where along the vessel (0–1) the strands leave the main channel; before it the vessel is one.
export const STRAND_FROM = { C2: 0.5 };

// Tributaries and feeders (anatomic view only): named veins are formed by several smaller ones,
// drawn converging on the vessel so the plate reads as anatomy, not a wiring diagram. They carry
// the parent's color and flow marks. `k` is each one's caliber as a fraction of the parent;
// `when: 'caudate'` shows the listed `paths` only once the caudate route is carrying several times its normal
// flow (Budd–Chiari): portal blood from both lobes then collateralizes into the caudate vein.
// A `fan` is generated (see fanFeeders): `n` tortuous tributaries spread over `spread` degrees
// around `dir` (0 = toward +x, 90 = down), each about `len` long and entering the vessel along
// the fan's axis, most with a smaller branch of their own; `wig` scales their tortuosity.
export const FEEDERS = {
  // Splenic vein: hilar branches from the upper pole to the lower pole.
  V_SPL: { k: 0.5, fan: { at: [1034, 360], dir: 0, spread: 140, len: 62, n: 5, seed: 3 } },
  // Superior mesenteric vein: jejunal and ileal branches fanning up from the small bowel.
  V_INT: { k: 0.5, fan: { at: [690, 790], dir: 90, spread: 130, len: 96, n: 6, seed: 7 } },
  // Inferior mesenteric vein: the left colic veins, from the descending colon on the patient's left.
  V_COL: { k: 0.55, fan: { at: [960, 790], dir: -5, spread: 110, len: 42, n: 5, seed: 11 } },
  // Budd–Chiari: collaterals from the right and left portal veins into the caudate vein.
  // Caudate vein: small tributaries from the caudate lobe, always; in Budd–Chiari (`when`), also
  // collaterals from the right and left portal veins, each colored from the pressure of the
  // portal branch it leaves to that of the caudate vein.
  // The fan's axis continues the vein's own course backward (it leaves up and to the right), so
  // every tributary flows into it without a kink; the collaterals also arrive along its course.
  // They sit high in the lobe, between the hepatic vein branches and the portal veins, touching
  // neither.
  CAUD: { k: 0.55, fan: { at: [566, 326], dir: 172, spread: 84, len: 46, n: 4, seed: 5, wig: 0.7 },
    when: 'caudate', from: ['RPV', 'LPV'], paths: ['M505 398 C 522 370 540 336 566 326', 'M688 378 C 630 404 546 384 566 326'] },
};

// Circuit view: a transit map. Pressure falls left → right along the main series circuit
// (gut → portal vein → liver → hepatic veins → IVC → heart). Ordinary vessels run straight or
// at 45° (generated by metroPath); collaterals and shunts are bypasses routed in their own
// lanes (orthogonal runs with rounded corners): the esophageal route above the spine, the
// spontaneous and surgical portosystemic shunts in parallel lanes below it.

/** Orthogonal / 45° polyline through `pts` with rounded corners of radius `r`. */
export function route(pts, r = 16) {
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1], [x, y] = pts[i], [nx, ny] = pts[i + 1];
    const l1 = Math.hypot(x - px, y - py), l2 = Math.hypot(nx - x, ny - y);
    const rr = Math.min(r, l1 / 2, l2 / 2);
    const ax = x - ((x - px) / l1) * rr, ay = y - ((y - py) / l1) * rr;
    const bx = x + ((nx - x) / l2) * rr, by = y + ((ny - y) / l2) * rr;
    d += ` L ${ax.toFixed(1)} ${ay.toFixed(1)} Q ${x} ${y} ${bx.toFixed(1)} ${by.toFixed(1)}`;
  }
  const [lx, ly] = pts[pts.length - 1];
  return d + ` L ${lx} ${ly}`;
}

export const CIRCUIT_PATH = {
  // hepatic arterial supply and the intrahepatic bypasses stay gentle curves
  CAUD: route([[900, 303], [940, 252], [1086, 252], [1120, 290], [1120, 345]], 18),
  A_HL: route([[740, 228], [770, 258], [770, 357], [800, 387]], 12),
  AP_L: route([[740, 228], [706, 262], [706, 361], [680, 387]], 12),
  TIPS: route([[680, 303], [712, 272], [972, 272], [1000, 282]], 14),
  // Branches that leave (or join) one station split right at it, as on a transit map, instead
  // of sharing a stretch of track and forking part-way along.
  PVH_R: route([[580, 345], [622, 303], [680, 303]], 12),
  PVH_L: route([[580, 345], [622, 387], [680, 387]], 12),
  // The left gastric vein drops into the confluence from above, clear of the splenic vein's
  // diagonal (a plain 45° route would run on top of it for its last stretch).
  LGV_CONF: route([[320, 191], [446, 191], [480, 225], [480, 345]], 14),
  POST_R_RHV: route([[900, 303], [921, 282], [1000, 282]], 10),
  POST_L_LHV: route([[900, 387], [921, 408], [1000, 408]], 10),
  // esophageal and gastric route, above the spine
  C1a: route([[320, 191], [383, 128], [620, 128]]),
  C1b: route([[620, 128], [1043, 128], [1120, 205]]),
  C2: route([[320, 261], [292, 233], [292, 165], [248, 121], [240, 121]], 12),
  // Fundal varices → coronary vein drops straight down from the varices before turning, clear of
  // the short gastric's diagonal (a plain 45° route would run on top of it).
  C2b: route([[240, 121], [240, 165], [266, 191], [320, 191]], 12),
  // portosystemic shunts, each in its own lane below the spine
  C8: route([[480, 345], [506, 376], [554, 376], [580, 345]], 12),
  S_PC: route([[480, 345], [480, 440], [1050, 440], [1088, 478], [1120, 478]]),
  C7: route([[320, 394], [320, 456], [1040, 456], [1062, 478], [1120, 478]]),
  S_MC: route([[320, 394], [320, 468], [1050, 468], [1060, 478], [1120, 478]]),
  C6: route([[320, 261], [350, 291], [350, 510], [970, 510], [1000, 540]]),
  S_DSR: route([[320, 261], [362, 303], [362, 522], [978, 522], [1000, 540]]),
  C3: route([[680, 387], [680, 580], [710, 610], [1000, 610]]),
  C4: route([[240, 310], [240, 640], [1090, 640], [1120, 610]]),
  C5: route([[240, 121], [70, 121], [70, 670], [870, 670], [1000, 540]]),
  EPI_SVC: route([[1000, 610], [1000, 700], [1330, 700], [1330, 205], [1250, 205]]),
  C9: route([[1120, 478], [1175, 478], [1175, 250], [1130, 205], [1120, 205]]),
};

/** 45° transit-map route between two circuit points: horizontal run, then a diagonal, then vertical. */
export function metroPath([x1, y1], [x2, y2]) {
  const dx = x2 - x1, dy = y2 - y1;
  if (Math.abs(dy) < 1 || Math.abs(dx) < 1) return `M${x1} ${y1} L ${x2} ${y2}`;
  const d = Math.min(Math.abs(dx), Math.abs(dy));
  const hx = x2 - Math.sign(dx) * d;
  return `M${x1} ${y1} L ${hx} ${y1} L ${x2} ${y1 + Math.sign(dy) * d} L ${x2} ${y2}`;
}

// Circuit pressure zones (x0, x1 in world units), captioned along the top of the map.
export const CIRCUIT_ZONES = [['Splanchnic beds', 60, 390], ['Portal veins', 390, 630], ['Liver', 630, 950], ['Hepatic veins · IVC', 950, 1185], ['Heart', 1185, 1360]];

// Station labels in the circuit: preferred placement around the node (tried in order) and
// priority (higher wins when space is short; low-priority stations drop out on small screens).
export const CIRCUIT_LABELS = {
  INT: { dirs: ['S', 'W', 'N'], pri: 5 }, COL: { dirs: ['W', 'N', 'S'], pri: 3 }, SPL: { dirs: ['W', 'N', 'S'], pri: 5 }, STO: { dirs: ['W', 'N'], pri: 3 },
  SMV: { dirs: ['S', 'SW', 'N'], pri: 8 }, IMV: { dirs: ['N', 'S', 'NE'], pri: 3 }, SV: { dirs: ['NE', 'N', 'SE'], pri: 8 }, LGV: { dirs: ['N', 'NE', 'S'], pri: 5 },
  CONF: { dirs: ['N', 'NW', 'S'], pri: 10 }, PVH: { dirs: ['N', 'S', 'NE'], pri: 6 }, RPV: { dirs: ['NW', 'N', 'W'], pri: 5 }, LPV: { dirs: ['SW', 'S', 'W'], pri: 5 },
  VAR: { dirs: ['N', 'S'], pri: 9 }, GV: { dirs: ['N', 'W', 'S'], pri: 7 },
  SIN_R: { dirs: ['N', 'NE', 'NW'], pri: 9 }, SIN_L: { dirs: ['S', 'SE', 'SW'], pri: 7 }, CV_R: { dirs: ['N', 'NE'], pri: 4 }, CV_L: { dirs: ['S', 'SE'], pri: 4 },
  RHV: { dirs: ['N', 'NE', 'NW'], pri: 8 }, MHV: { dirs: ['E', 'NE', 'SE'], pri: 4 }, LHV: { dirs: ['S', 'SE', 'SW'], pri: 5 },
  IVCI: { dirs: ['E', 'SE', 'NE'], pri: 5 }, IVCS: { dirs: ['NE', 'N', 'SE'], pri: 8 }, RA: { dirs: ['E', 'S', 'N'], pri: 9 }, SVC: { dirs: ['N', 'E'], pri: 4 }, AZY: { dirs: ['N', 'NW', 'W'], pri: 5 },
  ILI: { dirs: ['E', 'SE'], pri: 3 }, EPI: { dirs: ['S', 'SW', 'W'], pri: 3 }, KID_L: { dirs: ['W', 'S', 'N'], pri: 2 }, LRV: { dirs: ['N', 'NE', 'S'], pri: 3 },
  HA: { dirs: ['N', 'NW', 'NE'], pri: 4 },
};

// Organ artwork (anatomic view only): a frontal plate drawn back to front, as a medical
// illustrator layers it. Retroperitoneal structures first (both kidneys, the right one peeking
// below the liver), then the heart, the colon framing the small
// bowel (ascending on the viewer's left, transverse slung between the flexures, descending,
// sigmoid) from the cecum and appendix, the coiled small bowel entering the cecum, spleen,
// duodenal C-loop, stomach, and the liver in front with the gallbladder beneath its margin. The vessel geometry above is fixed; the
// organs are drawn to sit around it. `band` shapes are stroked tubes; `deco` shapes are line work
// only; `noCover` shapes never hide the flow marks of vessels behind them.
export const ORGANS = [
  { id: 'kidney-r', tone: 'kidney', cls: 'org org-kidney', d: 'M474 578 C 446 586 434 626 440 664 C 446 700 474 720 500 714 C 518 710 522 692 516 676 C 510 662 512 646 518 634 C 524 618 520 596 506 584 C 496 576 484 574 474 578 Z' },
  { id: 'kidney-l', tone: 'kidney', cls: 'org org-kidney', d: 'M1002 556 C 1040 548 1066 584 1064 626 C 1062 672 1034 700 1000 694 C 982 690 984 668 994 654 C 1000 642 998 630 990 620 C 984 606 978 574 1002 556 Z' },
  { id: 'esophagus', tone: 'eso', cls: 'org org-eso', d: 'M776 0 L 798 0 C 800 90 805 190 813 251 L 792 251 C 787 190 781 90 776 0 Z' },
  { id: 'heart', tone: 'heart', cls: 'org org-heart', d: 'M618 64 C 600 88 598 128 606 158 C 614 184 640 194 682 194 C 742 194 800 188 836 172 C 850 165 850 150 839 140 C 812 110 776 80 736 64 C 700 51 648 50 618 64 Z' },
  { id: 'heart-grooves', cls: 'org-heart-groove', deco: true, d: 'M736 64 C 750 108 786 152 832 176 M666 64 C 682 102 686 150 678 193' },
  { id: 'heart-out', cls: 'org-heart-flow', deco: true, d: 'M664 118 C 690 112 716 114 742 126' },
  { id: 'appendix', tone: 'gut', cls: 'org-appendix', band: true, d: 'M420 906 C 418 924 428 938 448 940' },
  { id: 'bowel', tone: 'gut', cls: 'org-bowel', band: true, d: 'M604 722 C 650 706 700 714 742 722 C 786 730 830 712 872 724 C 904 734 906 764 878 772 C 840 782 800 764 760 770 C 716 776 684 790 646 782 C 610 774 590 790 598 808 C 606 826 640 830 676 824 C 720 816 760 834 800 830 C 846 826 884 812 906 826 C 928 842 918 870 888 874 C 846 880 810 862 764 868 C 716 874 680 888 630 880 C 580 872 540 860 500 862 C 470 864 446 870 424 874' },
  { id: 'colon', tone: 'gut', cls: 'org-colon', band: true, d: 'M424 900 C 420 880 414 864 410 846 C 402 808 398 764 400 704 C 402 646 412 596 438 568 C 472 556 506 588 544 628 C 592 678 650 700 720 700 C 800 700 870 660 916 600 C 946 560 970 510 984 468 C 992 560 988 700 972 790 C 962 848 924 880 868 892 C 838 898 812 902 788 906' },
  { id: 'spleen', tone: 'spleen', cls: 'org org-spleen', d: 'M1030 266 C 1072 264 1100 300 1104 352 C 1108 408 1082 452 1040 462 C 1018 466 1002 456 1004 440 C 1006 426 1016 414 1017 400 C 1018 390 1014 382 1016 372 C 1018 358 1018 342 1013 328 C 1008 314 1006 300 1008 288 C 1010 274 1018 267 1030 266 Z' },
  { id: 'duodenum', tone: 'stomach', cls: 'org-duodenum', band: true, d: 'M726 514 C 690 506 652 526 644 566 C 636 612 650 650 688 668 C 724 684 772 680 806 664' },
  { id: 'stomach', tone: 'stomach', cls: 'org org-stomach', d: 'M813 249 C 818 257 828 253 840 247 C 850 242 859 241 868 242 C 910 238 948 260 966 296 C 984 332 990 380 984 424 C 976 480 940 524 886 546 C 846 562 796 566 756 552 C 738 546 724 536 714 522 L 708 508 C 712 498 722 494 734 494 C 764 494 794 484 812 462 C 822 450 828 436 830 420 C 834 392 830 350 822 320 C 815 298 800 276 792 249 Z' },
  // The gallbladder lies under the liver; only its fundus shows below the inferior margin.
  { id: 'gallbladder', tone: 'gb', cls: 'org org-gb', d: 'M540 464 C 526 488 522 520 534 536 C 548 552 574 546 580 524 C 586 502 580 482 570 470 C 562 462 548 458 540 464 Z' },
  { id: 'liver', tone: 'liver', cls: 'org org-liver', d: 'M858 250 C 832 236 798 226 748 212 C 700 196 650 188 620 187 C 560 184 470 178 404 188 C 358 196 330 220 322 262 C 316 312 318 382 330 432 C 338 466 356 490 388 498 C 432 505 492 494 540 480 C 575 470 602 459 630 446 C 644 440 650 436 653 431 C 656 435 661 437 667 433 C 724 398 790 340 846 292 C 864 277 873 259 858 250 Z' },
  // Cantlie's line (gallbladder fossa to the IVC) and the falciform ligament: the lobes as a
  // surgeon reads them.
  { id: 'falciform', cls: 'org-lobe-line', deco: true, d: 'M657 434 C 652 370 646 290 642 190' },
  { id: 'umbilicus', cls: 'org-umbilicus', circle: [500, 800, 5] },
];
// Surface anatomy drawn inside each organ (clipped to it), as a medical plate shows it:
// fissures and ligaments, rugae, hilum, lobulation. Classes: fine (hairline in the organ's
// outline tone), soft (a broader, fainter fold), sheen (a light reflection on a curved surface).
export const ORGAN_DETAIL = {
  liver: [
    ['fine', 'M657 434 C 652 370 646 290 642 190'],
  ],
  stomach: [
    ['fold', 'M858 300 C 884 330 894 372 890 418 C 887 452 872 484 846 508'],
    ['fold', 'M880 290 C 912 326 922 378 914 432 C 908 470 890 500 862 522'],
    ['fold', 'M904 292 C 934 332 944 390 936 444'],
    ['fold', 'M842 346 C 856 388 856 434 840 474'],
    ['fine', 'M722 494 C 716 504 716 516 722 526'],
    ['fine', 'M732 494 C 726 506 727 520 735 532'],
  ],
  spleen: [['fine', 'M1026 334 C 1034 352 1034 374 1026 396']],
  'kidney-l': [['fine', 'M996 628 C 1010 624 1020 632 1022 644']],
  'kidney-r': [['fine', 'M518 648 C 506 646 498 654 498 664']],
  heart: [['fine', 'M736 64 C 750 108 786 152 832 176']],
};
// Background plane (anatomic view): the posterior wall the organs sit against, drawn quietly
// so the plate reads in depth: the body cavity and the diaphragm domes the liver and spleen
// tuck under.
export const BACKDROP = {
  cavity: 'M318 250 C 314 190 360 150 440 142 C 520 136 600 150 700 150 C 800 150 900 150 980 166 C 1060 182 1100 230 1104 300 C 1112 480 1100 700 1068 900 L 352 900 C 326 700 318 480 318 250 Z',
  diaphragm: 'M316 330 C 314 250 352 182 450 170 C 520 162 590 170 640 176 C 700 184 780 204 848 226 C 940 214 1040 232 1092 290 C 1112 316 1116 360 1110 400',
};

// Invisible peritoneal outline: ascites fills it from the bottom.
export const ABDOMEN_CLIP = 'M330 440 C 320 600 340 780 380 900 L 1060 900 C 1090 780 1100 600 1092 440 Z';
export const ABDOMEN_FLOOR = 900;
export const SPLEEN_CENTER = [1040, 362];

// Where the stage draws instruments and findings.
export const SITES = {
  varix: [797, 232],        // lower esophagus
  fundus: [876, 304],       // gastric fundus
  stomachPool: [872, 452],  // blood collecting in the stomach during a bleed
  umbilicus: [500, 800],
};

// Organ captions: [text, x, y, anchor]
export const ORGAN_LABELS = [
  ['Liver', 404, 446], ['Stomach', 918, 432], ['Spleen', 1058, 482], ['Colon', 1016, 824], ['Kidney', 1030, 716],
  ['Small bowel', 740, 797], ['Esophagus', 852, 38], ['Heart', 760, 96], ['to RV', 744, 146],
];

// Atlas labels: node → caption and which margin column it hangs from.
export const ATLAS_LABELS = {
  RA: { name: 'Right atrium', side: 'L' },
  IVCS: { name: 'Inferior vena cava', side: 'L' },
  RHV: { name: 'Hepatic vein (FHVP)', side: 'L' },
  SIN_R: { name: 'Sinusoids', side: 'L' },
  W_R: { name: 'Wedged catheter (R)', side: 'L' }, W_M: { name: 'Wedged catheter (M)', side: 'L' }, W_L: { name: 'Wedged catheter (L)', side: 'L' },
  VAR: { name: 'Esophageal varices', side: 'R' },
  GV: { name: 'Fundal varices', side: 'R' },
  CONF: { name: 'Portal vein', side: 'R' },
  SV: { name: 'Splenic vein', side: 'R' },
  SMV: { name: 'Sup. mesenteric vein', side: 'R' },
};

export const LIVER_SPLIT_X = 640;

// Circuit view: the liver is a module. Collapsed, its internal stations and the resistance of
// each compartment are summarized in one header; it expands on selection, on a click on the
// header, or when zoomed in far enough to read it.
export const LIVER_MODULE = { x0: 650, y0: 212, x1: 934, y1: 424 };
export const LIVER_INNER = new Set(['HA', 'RPV', 'LPV', 'SIN_R', 'SIN_L', 'CV_R', 'CV_L']);
export const LIVER_EDGES = new Set(['A_HEP', 'A_HR', 'A_HL', 'AP_R', 'AP_L', 'PRE_R', 'PRE_L', 'SIN_RR', 'SIN_LL', 'SIN_RL', 'POST_R_RHV', 'POST_R_MHV', 'POST_L_LHV', 'POST_L_MHV', 'CAUD']);
// The main series route (gut → portal vein → liver → hepatic veins → heart): the circuit's spine.
export const MAIN_ROUTE = new Set(['V_INT', 'SMV_CONF', 'V_SPL', 'SV_CONF', 'PV_TRUNK', 'PVH_R', 'PVH_L', 'PRE_R', 'PRE_L', 'SIN_RR', 'SIN_LL', 'POST_R_RHV', 'POST_L_LHV', 'RHV_IVC', 'LHV_IVC', 'IVCS_RA']);
// Collateral and shunt lanes in the circuit, captioned where they run (edge → caption).
export const LANE_CAPTIONS = {
  C1b: 'Esophageal route → azygos', C2: 'Short gastric', C3: 'Paraumbilical', C4: 'Rectal', C5: 'Gastrorenal shunt', C6: 'Splenorenal shunt',
  C7: 'Retroperitoneal', C8: 'Periportal', C9: 'Caval → azygos', TIPS: 'TIPS', S_PC: 'Portocaval shunt', S_DSR: 'Distal splenorenal shunt', S_MC: 'Mesocaval shunt',
  EPI_SVC: 'Epigastric → SVC',
};

// Event anchors
export const ANCHORS = {
  PERITONEUM: [720, 860], VAR: [797, 232], GV: [876, 302], TIPS: [522, 310], SPL: [1040, 362], RA: [620, 112],
  AO: [700, 556], CAUD: [592, 332],
};

// Which physical "vessel" an edge belongs to (for stent pairing & labels).
export const EDGE_VESSEL = {
  PV_TRUNK: 'PV', CONF: 'PV', PVH_R: 'RPV', PRE_R: 'RPV', PVH_L: 'LPV', PRE_L: 'LPV',
  SV_CONF: 'SV', V_SPL: 'SV', SMV_CONF: 'SMV', V_INT: 'SMV',
  RHV_IVC: 'RHV', POST_R_RHV: 'RHV', MHV_IVC: 'MHV', POST_R_MHV: 'MHV', POST_L_MHV: 'MHV', LHV_IVC: 'LHV', POST_L_LHV: 'LHV',
  IVC_IS: 'IVC', IVCS_RA: 'IVC', ILI_IVC: 'IVC', RRV_IVC: 'IVC',
  LRV_IVC: 'LRV', V_KID_L: 'LRV',
};

// Standard paths for the pressure-profile chart (§9.2)
export const PROFILE_PATHS = [
  { id: 'main', label: 'Gut → liver → heart', nodes: ['AO', 'INT', 'SMV', 'CONF', 'PVH', 'RPV', 'SIN_R', 'CV_R', 'RHV', 'IVCS', 'RA'] },
  { id: 'spleen', label: 'Spleen → liver → heart', nodes: ['AO', 'SPL', 'SV', 'CONF', 'PVH', 'LPV', 'SIN_L', 'CV_L', 'LHV', 'IVCS', 'RA'] },
  { id: 'eso', label: 'Esophageal collateral route', nodes: ['AO', 'STO', 'LGV', 'VAR', 'AZY', 'SVC', 'RA'] },
  { id: 'gastric', label: 'Gastric varix → gastrorenal', nodes: ['AO', 'SPL', 'SV', 'GV', 'LRV', 'IVCI', 'IVCS', 'RA'] },
  { id: 'tips', label: 'Through a TIPS', nodes: ['AO', 'INT', 'SMV', 'CONF', 'PVH', 'RPV', 'RHV', 'IVCS', 'RA'] },
  { id: 'umbilical', label: 'Paraumbilical route', nodes: ['AO', 'INT', 'SMV', 'CONF', 'PVH', 'LPV', 'EPI', 'ILI', 'IVCI', 'IVCS', 'RA'] },
];

export const SHORT = {
  AO: 'Aorta', HA: 'Hep. artery', INT: 'Gut bed', COL: 'Colon', SPL: 'Spleen', STO: 'Stomach', SMV: 'SMV', IMV: 'IMV', SV: 'Splenic v.',
  LGV: 'L. gastric v.', CONF: 'Portal v.', PVH: 'PV hilum', RPV: 'R portal', LPV: 'L portal', VAR: 'Esoph. varices', GV: 'Fundal varices',
  SIN_R: 'Sinusoids R', SIN_L: 'Sinusoids L', CV_R: 'Central v. R', CV_L: 'Central v. L', W_R: 'Wedge R', W_M: 'Wedge M', W_L: 'Wedge L',
  RHV: 'RHV', MHV: 'MHV', LHV: 'LHV', IVCI: 'IVC (infra)', IVCS: 'IVC', RA: 'RA', SVC: 'SVC', AZY: 'Azygos', UPPV: 'Upper body',
  LOWV: 'Lower body', ILI: 'Iliac v.', EPI: 'Umbilicus', KID_L: 'L kidney', KID_R: 'R kidney', LRV: 'L renal v.', RRV: 'R renal v.',
};

// Chips shown by default (major vessels)
export const CHIP_NODES = ['CONF', 'SV', 'SMV', 'SIN_R', 'RHV', 'IVCS', 'RA', 'VAR'];

/** Tributary fan → [{ d, k }] (path from the tip to the vessel; k = caliber relative to `k`). */
export function fanFeeders({ at, dir, spread, len, n, seed = 1 }) {
  let r = seed * 9301 + 49297;
  const rnd = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };
  const rad = (deg) => (deg * Math.PI) / 180, P = (p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
  const ax = [Math.cos(rad(dir)), Math.sin(rad(dir))];
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = rad(dir + spread * (i / (n - 1) - 0.5) + (rnd() - 0.5) * 12), l = len * (0.75 + 0.4 * rnd());
    const E = [at[0] + Math.cos(a) * l, at[1] + Math.sin(a) * l];
    const c2 = [at[0] + ax[0] * l * 0.42, at[1] + ax[1] * l * 0.42];
    const c1 = [E[0] + (c2[0] - E[0]) * 0.45, E[1] + (c2[1] - E[1]) * 0.45];
    out.push({ d: `M${P(E)} C ${P(c1)} ${P(c2)} ${P(at)}`, k: 0.75 + 0.5 * rnd() });
    // A smaller branch joining it part-way, on alternating sides.
    if (rnd() < 0.8) {
      const t = 0.3 + 0.2 * rnd(), u = 1 - t;
      const M = [0, 1].map((j) => u * u * u * E[j] + 3 * u * u * t * c1[j] + 3 * u * t * t * c2[j] + t * t * t * at[j]);
      const b = a + rad((i % 2 ? 1 : -1) * (28 + 14 * rnd())), bl = l * (0.35 + 0.2 * rnd());
      const S = [M[0] + Math.cos(b) * bl, M[1] + Math.sin(b) * bl];
      const q = [M[0] + Math.cos(a) * bl * 0.45, M[1] + Math.sin(a) * bl * 0.45];
      out.push({ d: `M${P(S)} Q ${P(q)} ${P(M)}`, k: 0.45 + 0.2 * rnd() });
    }
  }
  return out;
}
