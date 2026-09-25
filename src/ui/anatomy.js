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
  'V_LOW', 'V_UP', 'V_KID_R', 'RRV_IVC']);
export const HIDDEN_NODES = new Set(['AO', 'UPPV', 'LOWV', 'KID_R', 'RRV']);
// Systemic veins drawn quietly: they matter only as the places collaterals drain to.
export const CONTEXT_EDGES = new Set(['SVC_RA', 'AZY_SVC', 'ILI_IVC', 'EPI_ILI', 'EPI_SVC', 'V_KID_L', 'LRV_IVC']);
// Drawn only once the paraumbilical collateral has opened.
export const NEEDS_C3 = new Set(['EPI_ILI', 'EPI_SVC']);
// Retroperitoneal vessels, drawn behind the organs (the liver and pancreas veil them).
export const BACK_EDGES = new Set(['IVC_IS', 'ILI_IVC', 'LRV_IVC', 'V_KID_L', 'C7', 'C9', 'S_MC']);

// Node positions: [anatomic, circuit]
export const NODE_POS = {
  AO: [[760, 540], [610, 240]],
  HA: [[655, 478], [680, 240]],
  INT: [[690, 790], [140, 394]],
  COL: [[960, 790], [140, 310]],
  SPL: [[1034, 360], [140, 261]],
  STO: [[880, 395], [140, 191]],
  SMV: [[690, 660], [320, 394]],
  IMV: [[932, 690], [240, 310]],
  SV: [[880, 505], [320, 261]],
  LGV: [[822, 432], [320, 191]],
  CONF: [[700, 556], [480, 345]],
  PVH: [[602, 442], [580, 345]],
  RPV: [[505, 398], [680, 303]],
  LPV: [[688, 378], [680, 387]],
  VAR: [[797, 232], [620, 128]],
  GV: [[876, 302], [240, 121]],
  SIN_R: [[386, 372], [800, 303]],
  SIN_L: [[742, 292], [800, 387]],
  CV_R: [[378, 322], [900, 303]],
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
  AZY: [[700, 150], [1120, 205]],
  UPPV: [[620, -60], [1250, 100]],
  LOWV: [[620, 980], [1120, 660]],
  ILI: [[620, 880], [1120, 610]],
  EPI: [[600, 722], [1000, 610]],
  KID_L: [[1005, 622], [880, 540]],
  KID_R: [[500, 622], [880, 562]],
  LRV: [[862, 618], [1000, 540]],
  RRV: [[560, 625], [1000, 562]],
};

// Anatomic edge paths (SVG path data). Edges without an entry are drawn from node to node.
export const EDGE_PATH = {
  A_HEP: 'M760 540 C 730 520 690 495 655 478',
  A_HR: 'M655 478 C 610 462 545 430 505 412 C 468 400 428 392 386 372',
  A_HL: 'M655 478 C 672 440 690 400 710 362 C 722 336 734 312 742 292',

  V_INT: 'M690 790 C 690 750 690 700 690 660',
  V_COL: 'M960 790 C 952 760 942 725 932 690',
  V_IMV: 'M932 690 C 925 620 905 560 880 505',
  V_SPL: 'M1034 360 C 1010 385 988 420 962 448 C 938 473 910 492 880 505',
  V_STO: 'M880 395 C 862 405 842 418 822 432',
  SMV_CONF: 'M690 660 C 692 625 696 590 700 556',
  SV_CONF: 'M880 505 C 830 525 765 545 700 556',
  LGV_CONF: 'M822 432 C 795 470 745 520 700 556',
  PV_TRUNK: 'M700 556 C 675 522 638 478 602 442',
  PVH_R: 'M602 442 C 568 428 535 414 505 398',
  PVH_L: 'M602 442 C 632 418 660 398 688 378',
  PRE_R: 'M505 398 C 470 392 425 386 386 372',
  PRE_L: 'M688 378 C 706 356 726 322 742 292',
  SIN_RR: 'M386 372 C 376 358 372 340 378 322',
  SIN_LL: 'M742 292 C 744 282 742 272 738 262',
  SIN_RL: 'M386 372 C 500 402 650 372 742 292',
  POST_R_RHV: 'M378 322 C 420 280 480 240 540 224',
  POST_R_MHV: 'M378 322 C 450 318 540 290 598 238',
  POST_L_LHV: 'M738 262 C 712 242 686 226 660 214',
  POST_L_MHV: 'M738 262 C 694 256 640 250 598 238',
  CAUD: 'M378 322 C 470 332 590 332 608 298 C 618 272 620 230 620 190',
  RHV_IVC: 'M540 224 C 568 210 594 198 620 190',
  MHV_IVC: 'M598 238 C 606 222 613 205 620 190',
  LHV_IVC: 'M660 214 C 646 204 632 196 620 190',
  IVC_IS: 'M620 650 L 620 190',
  IVCS_RA: 'M620 190 L 620 112',
  SVC_RA: 'M620 40 L 620 112',
  AZY_SVC: 'M700 150 C 702 110 694 70 668 55 C 652 46 634 42 620 40',
  V_KID_L: 'M1005 622 C 960 620 910 618 862 618',
  LRV_IVC: 'M862 618 C 790 620 700 640 620 650',
  ILI_IVC: 'M620 880 L 620 650',
  EPI_ILI: 'M600 722 C 596 780 604 840 620 880',
  EPI_SVC: 'M600 722 C 470 690 400 560 395 420 C 390 280 440 120 520 70 C 560 48 595 42 620 40',

  C1a: 'M822 432 C 836 390 830 340 815 300 C 806 276 800 256 797 232',
  C1b: 'M797 232 C 772 206 738 172 700 150',
  C2: 'M880 505 C 945 480 985 420 968 370 C 950 322 910 300 876 302',
  C2b: 'M876 302 C 880 350 860 400 822 432',
  C3: 'M688 378 C 668 430 650 490 640 560 C 630 630 612 690 600 722',
  C4: 'M932 690 C 940 790 890 870 810 890 C 730 908 660 900 620 880',
  C5: 'M876 302 C 940 340 975 450 945 540 C 925 590 895 612 862 618',
  C6: 'M880 505 C 905 545 895 590 862 618',
  C7: 'M690 660 C 668 676 640 670 620 650',
  C8: 'M700 556 C 695 520 650 470 602 442',
  C9: 'M620 650 C 572 600 560 480 565 380 C 570 280 640 190 700 150',

  AP_R: 'M655 478 C 612 470 552 432 505 398',
  AP_L: 'M655 478 C 668 440 680 405 688 378',
  TIPS: 'M505 398 C 512 350 525 280 540 224',
  S_PC: 'M700 556 C 682 590 652 625 620 650',
  S_DSR: 'M880 505 C 862 548 852 590 862 618',
  S_MC: 'M690 660 C 672 650 645 648 620 650',
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
  A_HL: 'M 680 240 C 740 240 760 359 800 387',
  AP_L: 'M 680 240 C 630 282 630 359 680 387',
  TIPS: route([[680, 303], [712, 272], [972, 272], [1000, 282]], 14),
  // esophageal and gastric route, above the spine
  C1a: route([[320, 191], [383, 128], [620, 128]]),
  C1b: route([[620, 128], [1043, 128], [1120, 205]]),
  C2: route([[320, 261], [292, 233], [292, 165], [248, 121], [240, 121]], 12),
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

// Flow-direction arrowheads: drawn on these vessels (both views) when flow is appreciable.
export const ARROW_EDGES = ['V_INT', 'V_SPL', 'V_IMV', 'V_STO', 'SMV_CONF', 'SV_CONF', 'LGV_CONF', 'PV_TRUNK', 'PVH_R', 'PVH_L', 'RHV_IVC', 'MHV_IVC', 'LHV_IVC',
  'IVC_IS', 'IVCS_RA', 'SVC_RA', 'AZY_SVC', 'LRV_IVC', 'C1a', 'C1b', 'C2', 'C2b', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'TIPS', 'S_PC', 'S_DSR', 'S_MC', 'PRE_R', 'PRE_L', 'POST_R_RHV', 'POST_L_LHV'];

// Atlas labels that also report the flow direction of the vessel they name.
export const LABEL_FLOW_EDGE = { CONF: 'PV_TRUNK', SV: 'SV_CONF', SMV: 'SMV_CONF', RHV: 'RHV_IVC', VAR: 'C1b', GV: 'C2' };

// Organ artwork (anatomic view only). Colors come from CSS tokens; `deco` shapes are texture only.
export const ORGANS = [
  { id: 'heart', cls: 'org org-heart', d: 'M588 100 C 590 76 612 66 634 70 C 656 74 664 96 660 116 C 656 138 636 150 614 146 C 594 142 586 122 588 100 Z' },
  { id: 'esophagus', cls: 'org org-eso', d: 'M786 24 L 802 24 C 804 130 808 230 820 294 L 804 302 C 794 250 790 140 786 24 Z' },
  { id: 'stomach', cls: 'org org-stomach', d: 'M812 296 C 828 268 876 262 904 286 C 940 318 954 396 938 448 C 920 506 862 536 806 532 C 776 530 752 522 736 512 L 734 478 C 760 474 790 462 806 444 C 826 420 828 370 816 334 C 810 318 806 308 812 296 Z' },
  { id: 'spleen', cls: 'org org-spleen', d: 'M1012 272 C 1056 264 1088 302 1088 352 C 1088 408 1058 448 1018 452 C 1002 454 994 442 1002 430 C 1016 410 1022 386 1018 360 C 1014 330 1002 306 996 292 C 993 280 1000 273 1012 272 Z' },
  { id: 'pancreas', cls: 'org org-pancreas', d: 'M704 548 C 698 578 724 602 760 594 C 822 580 884 544 944 504 C 978 482 1004 460 1010 442 C 998 436 978 444 952 458 C 896 488 830 522 770 537 C 745 543 718 534 704 548 Z' },
  { id: 'kidney-l', cls: 'org org-kidney', d: 'M992 560 C 1030 550 1058 586 1058 626 C 1058 672 1030 700 994 692 C 974 688 978 664 992 652 C 978 640 966 604 992 560 Z' },
  { id: 'colon', cls: 'org-colon', stroke: true, d: 'M986 470 C 988 600 982 750 962 826 C 944 888 868 906 782 900' },
  { id: 'colon-h', cls: 'org-colon-haustra', deco: true, d: 'M986 470 C 988 600 982 750 962 826 C 944 888 868 906 782 900' },
  { id: 'bowel', cls: 'org org-bowel', d: 'M578 712 C 600 690 700 684 800 688 C 858 692 872 730 866 780 C 862 836 838 866 760 872 C 670 878 600 866 584 822 C 572 786 566 734 578 712 Z' },
  { id: 'bowel-loops', cls: 'org-bowel-loops', deco: true, d: 'M602 730 C 634 712 668 748 704 728 C 740 708 780 744 832 722 M596 786 C 632 766 668 802 712 782 C 756 762 800 798 850 776 M610 840 C 648 822 690 856 734 836 C 778 816 810 846 840 830' },
  { id: 'liver', cls: 'org org-liver', d: 'M778 246 C 745 212 680 188 600 184 C 500 178 405 190 360 228 C 328 258 318 326 330 388 C 342 448 382 490 432 496 C 490 502 540 478 574 456 C 598 442 612 438 626 432 C 660 416 690 390 712 356 C 738 318 766 280 778 246 Z' },
  { id: 'falciform', cls: 'org-lobe-line', deco: true, d: 'M640 188 C 636 260 634 350 640 425' },
  { id: 'caudate', cls: 'org-caudate', d: 'M598 284 C 606 270 626 272 630 290 C 634 310 622 324 608 320 C 596 316 592 298 598 284 Z' },
  { id: 'gallbladder', cls: 'org org-gb', d: 'M532 468 C 520 488 522 516 540 524 C 558 532 574 516 570 496 C 567 480 560 470 552 464 Z' },
  { id: 'umbilicus', cls: 'org-umbilicus', circle: [600, 722, 6] },
];
// Invisible peritoneal outline: ascites fills it from the bottom.
export const ABDOMEN_CLIP = 'M330 440 C 320 600 340 780 380 900 L 1060 900 C 1090 780 1100 600 1092 440 Z';
export const ABDOMEN_FLOOR = 900;
export const SPLEEN_CENTER = [1040, 362];

// Where the stage draws instruments and findings.
export const SITES = {
  varix: [797, 232],        // lower esophagus
  fundus: [876, 304],       // gastric fundus
  stomachPool: [872, 452],  // blood collecting in the stomach during a bleed
  umbilicus: [600, 722],
};

// Organ captions: [text, x, y, anchor]
export const ORGAN_LABELS = [
  ['Liver', 392, 452, 'start'], ['Stomach', 888, 474, 'middle'], ['Spleen', 1050, 480, 'middle'],
  ['Pancreas', 842, 594, 'middle'], ['Colon', 1012, 820, 'start'], ['Kidney', 1024, 722, 'middle'], ['Small bowel', 722, 860, 'middle'],
  ['Esophagus', 814, 64, 'start'],
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

// Event anchors
export const ANCHORS = {
  PERITONEUM: [720, 860], VAR: [797, 232], GV: [876, 302], TIPS: [522, 310], SPL: [1040, 362], RA: [620, 112],
  AO: [700, 556], CAUD: [612, 300],
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
