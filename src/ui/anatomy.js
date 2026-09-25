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
  'SIN_RL']);
export const HIDDEN_NODES = new Set(['AO', 'UPPV', 'LOWV', 'KID_R', 'RRV', 'HA']);
// Systemic veins drawn quietly: they matter only as the places collaterals drain to.
export const CONTEXT_EDGES = new Set(['V_UP', 'SVC_RA', 'AZY_SVC', 'ILI_IVC', 'EPI_ILI', 'EPI_SVC', 'V_KID_L', 'LRV_IVC']);
// Drawn only once the paraumbilical collateral has opened.
export const NEEDS_C3 = new Set(['EPI_ILI', 'EPI_SVC']);
// Retroperitoneal vessels, drawn behind the organs (the liver and pancreas veil them).
export const BACK_EDGES = new Set(['IVC_IS', 'ILI_IVC', 'LRV_IVC', 'V_KID_L', 'C7', 'C9', 'S_MC', 'C1b', 'CAUD']);

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
  LGV: [[792, 312], [320, 191]],
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
  LGV_CONF: 'M792 312 C 798 344 800 378 798 404 C 795 428 786 444 769 453 C 750 463 728 462 712 468 C 699 478 697 520 700 556',
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
  CAUD: 'M446 296 C 500 302 568 302 598 292 C 614 284 618 240 620 190',
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

  C1a: 'M792 312 C 793 294 803 280 800 262 C 798 250 797 240 797 232',
  C1b: 'M797 232 C 770 214 720 202 666 198 C 622 196 584 192 566 172',
  C2: 'M880 505 C 890 462 912 420 922 380 C 930 344 910 308 876 302',
  C2b: 'M876 302 C 852 294 820 298 792 312',
  C3: 'M688 378 C 668 440 646 520 620 600 C 590 690 540 760 500 800',
  C4: 'M932 690 C 940 790 890 870 810 890 C 730 908 660 900 620 880',
  C5: 'M876 302 C 856 350 846 420 843 480 C 840 560 846 600 862 618',
  C6: 'M880 505 C 880 548 874 590 862 618',
  C7: 'M690 660 C 668 676 640 670 620 650',
  C8: 'M700 556 C 695 520 650 470 602 442',
  C9: 'M620 650 C 584 604 566 500 564 400 C 562 300 564 230 566 172',

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
  A_HL: route([[740, 228], [770, 258], [770, 357], [800, 387]], 12),
  AP_L: route([[740, 228], [706, 262], [706, 361], [680, 387]], 12),
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

// Organ artwork (anatomic view only): a frontal plate of opaque, quiet silhouettes behind the
// vessels, listed back to front (retroperitoneal organs first, the liver in front). Shapes follow the anatomy (the right lobe under the right dome of the diaphragm, a
// J-shaped stomach whose lesser curve carries the left gastric vein, the pancreas along the
// splenic vein, the colon framing the small bowel). `band` shapes are stroked tubes; `deco`
// shapes are texture only.
export const ORGANS = [
  { id: 'esophagus', cls: 'org org-eso', d: 'M776 0 L 798 0 C 800 90 805 190 818 292 L 796 300 C 787 200 781 90 776 0 Z' },
  { id: 'heart', cls: 'org org-heart', d: 'M616 60 C 600 74 596 100 600 124 C 604 150 620 168 646 174 C 690 184 744 178 780 160 C 800 150 806 132 800 114 C 792 90 770 70 742 58 C 716 48 688 46 664 48 C 644 50 628 52 616 60 Z' },
  // The right atrium, where both cavae end; the arrow shows where the blood goes next.
  { id: 'heart-ra', cls: 'org org-ra', d: 'M612 66 C 596 80 592 112 598 136 C 604 160 622 176 646 176 C 668 176 680 158 682 132 C 684 104 674 80 656 68 C 642 60 624 58 612 66 Z' },
  { id: 'heart-out', cls: 'org-heart-flow', deco: true, d: 'M664 118 C 690 112 716 114 742 126' },
  { id: 'kidney-l', cls: 'org org-kidney', d: 'M1002 556 C 1040 548 1066 584 1064 626 C 1062 672 1034 700 1000 694 C 982 690 984 668 994 654 C 1000 642 998 630 990 620 C 984 606 978 574 1002 556 Z' },
  { id: 'spleen', cls: 'org org-spleen', d: 'M1022 268 C 1068 262 1100 300 1102 356 C 1104 414 1074 454 1032 460 C 1010 462 998 448 1006 432 C 1016 414 1022 394 1018 372 C 1024 352 1022 330 1010 308 C 1000 290 1002 272 1022 268 Z' },
  { id: 'stomach', cls: 'org org-stomach', d: 'M796 300 C 802 272 830 248 866 244 C 904 240 940 258 958 290 C 976 322 982 372 976 414 C 968 468 932 512 880 534 C 842 550 790 556 752 544 C 732 538 716 524 708 510 L 718 490 C 738 494 770 490 794 474 C 818 456 828 424 828 388 C 828 356 822 330 818 308 Z' },
  { id: 'duodenum', cls: 'org-duodenum', band: true, d: 'M712 508 C 676 508 648 528 642 566 C 636 612 650 650 688 668 C 724 684 772 680 806 664' },
  { id: 'pancreas', cls: 'org org-pancreas', d: 'M662 604 C 652 576 668 550 700 546 C 760 540 832 518 902 490 C 950 470 990 448 1012 436 C 1022 444 1014 462 994 474 C 944 506 884 540 822 562 C 782 576 748 584 728 600 C 722 628 704 650 684 648 C 664 646 660 626 662 604 Z' },
  { id: 'colon-d', cls: 'org-colon', band: true, d: 'M984 468 C 992 560 988 700 972 790 C 962 848 924 880 868 892 C 838 898 812 902 788 906' },
  { id: 'bowel', cls: 'org-bowel', band: true, d: 'M596 714 C 660 700 790 704 860 714 C 896 720 900 750 866 756 C 800 766 700 744 628 756 C 590 762 584 792 616 796 C 690 804 800 780 868 794 C 902 802 900 834 864 836 C 790 840 700 818 626 836 C 592 844 598 872 634 874 C 710 880 790 862 846 870' },
  { id: 'liver', cls: 'org org-liver', d: 'M808 262 C 796 238 772 216 736 204 C 690 190 640 188 600 188 C 530 188 450 190 398 206 C 356 220 332 252 326 300 C 320 350 330 410 352 448 C 368 474 392 488 424 492 C 470 496 520 486 562 470 C 596 458 624 442 652 424 C 694 398 734 360 770 318 C 788 298 804 280 808 262 Z' },
  { id: 'falciform', cls: 'org-lobe-line', deco: true, d: 'M646 190 C 642 260 640 340 648 422' },
  { id: 'gallbladder', cls: 'org org-gb', d: 'M532 466 C 518 484 516 512 532 526 C 548 538 570 528 572 508 C 574 490 564 474 554 466 Z' },
  { id: 'umbilicus', cls: 'org-umbilicus', circle: [500, 800, 5] },
];
// Background plane (anatomic view): the posterior wall the organs sit against, drawn quietly
// so the plate reads in depth: the body cavity and the diaphragm domes the liver and spleen
// tuck under.
export const BACKDROP = {
  cavity: 'M318 250 C 314 190 360 150 440 142 C 520 136 600 150 700 150 C 800 150 900 150 980 166 C 1060 182 1100 230 1104 300 C 1112 480 1100 700 1068 900 L 352 900 C 326 700 318 480 318 250 Z',
  diaphragm: 'M322 360 C 318 262 372 196 452 184 C 530 172 596 182 640 184 C 700 186 780 206 862 234 C 948 220 1040 238 1088 290 C 1110 318 1114 360 1108 400',
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
  ['Liver', 404, 446], ['Stomach', 918, 432], ['Spleen', 1058, 482], ['Pancreas', 820, 578], ['Colon', 1016, 824], ['Kidney', 1030, 716],
  ['Small bowel', 732, 868], ['Esophagus', 852, 38], ['Heart', 760, 96], ['to RV', 744, 146],
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
