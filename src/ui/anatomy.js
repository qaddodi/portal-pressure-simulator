// Stage geometry (blueprint §6). Logical space 1400 × 1000.
// Standard anatomical frontal view: the patient's right is on the viewer's LEFT.
//
// The stage is a focused plate of the portal circulation: the portal tree, the liver's
// microcirculation, hepatic outflow to the right atrium and the collaterals. Vessels that
// only close the systemic loop (aorta, limb and head vessels, the right kidney) are part of
// the model but are not drawn.

import { COLON_D, COLON_RING, BOWEL_RING, DUO_D } from './organ-art.js?v=a6a766d521';
import { gutPath, gutY } from './gut-proportions.js?v=1ecbf3debd';

export const VIEW = { w: 1400, h: 1000 };
// Where the rectum's end fades away (y: clear above the first, gone at the second): the colon's mask (stage.js rectFade) and the
// outlines and glows drawn over it (veins-gl.js endFade) use the same span. The colon art is clipped by the drawn outline (oc-his),
// which originally ended at y 1037 with its lower left corner up at 1017, so the fade was gone by 1015: any later and the art's own
// clipped end showed as a hard edge, at about half strength (22 Oct). It starts at the sigmoid's bend into the rectum (Mohammad, 22 Oct:
// "make the fade wider, start earlier, ends same place"): the rectal veins (C4, ending at 928) are drawn over the fading organ.
// Both ends follow the lower gut's stretch (22 Oct), preserving the fade's position on the tissue and its soft end.
export const RECTUM_FADE = [902, 1048];
export const VB_ANAT = [300, 0, 820, 920];
export const VB_CIRC = [30, 30, 1360, 730];
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
  'V_STO',
  // The caudate lobe veins are modeled but set aside in both views for now (the drawing, its
  // tributaries and Budd–Chiari collaterals are kept below for later).
  'CAUD']);
// The caudate lobe and its short veins (anatomic view), drawn only on a slide about them (presenter target 'caudate')
// and eased in and out: the lobe is a soft, slightly lighter dome of the liver's own tone with no outline (`lobe`:
// ellipses [cx, cy, rx, ry, degrees], the body and its papillary process), between the hepatic vein confluence above,
// the portal bifurcation below and the IVC, whose left wall (`wall`, x) the veins merge into below the hepatic veins.
// `veins`: [course, caliber at the IVC]; each tapers from nothing inside the lobe. In the model they are the CAUD edge,
// which is not drawn as a vessel. The lobe grows about `anchor` by up to `grow` ([x, y]) as its veins take over the
// liver's outflow (Budd–Chiari), keeping clear of the azygos line beside it (x 564).
export const CAUDATE = {
  lobe: [[594, 358, 20, 60, -4], [587, 401, 14, 16, 0]],
  veins: [['M588 334 Q 601 332 613 327', 3], ['M582 368 Q 598 365 613 359', 3.6], ['M590 398 Q 602 395 613 389', 2.8]],
  wall: 613, anchor: [612, 362], grow: [0.12, 0.2],
};
export const HIDDEN_NODES = new Set(['AO', 'UPPV', 'LOWV', 'KID_R', 'RRV', 'HA', 'SVD']);
// Systemic veins drawn quietly: they matter only as the places collaterals drain to.
export const CONTEXT_EDGES = new Set(['V_UP', 'SVC_RA', 'AZY_SVC', 'ILI_IVC', 'EPI_ILI', 'EPI_SVC', 'V_KID_L', 'LRV_IVC']);
// Edges the circuit draws but the anatomy leaves out (none at present).
// The iliac confluence is left out of the plate: the infrarenal IVC runs on down and fades out,
// and the rectal and inferior epigastric veins fade out toward the pelvis instead of joining it
// (they still drain into it in the model and the circuit).
// The left-lobe central veins reach the middle hepatic vein in the model; drawn, they would need a second
// vein into the cava beside the left hepatic vein, so the plate shows them draining through that one.
export const ANAT_HIDDEN = new Set(['POST_L_MHV']);
export const ANAT_HIDDEN_NODES = new Set(['ILI']);
// Drawn only once the paraumbilical collateral has opened.
export const NEEDS_C3 = new Set(['EPI_ILI', 'EPI_SVC']);
// The IVC, drawn faded along its whole length, as the stretch behind the liver is.
export const IVC_EDGES = new Set(['ILI_IVC', 'IVC_IS', 'IVCS_RA']);
// Retroperitoneal vessels, drawn behind the organs (the liver and bowel veil them).
export const BACK_EDGES = new Set(['IVC_IS', 'IVCS_RA', 'SVC_RA', 'V_UP', 'ILI_IVC', 'LRV_IVC', 'V_KID_L', 'C7', 'C9', 'S_MC']);

// Node positions: [anatomic, circuit]
export const NODE_POS = {
  AO: [[760, 540], [610, 240]],
  HA: [[655, 478], [740, 228]],
  INT: [[756, 800], [140, 394]],
  COL: [[960, 790], [140, 310]],
  SPL: [[1034, 360], [140, 261]],
  STO: [[880, 395], [140, 191]],
  SMV: [[690, 660], [320, 394]],
  IMV: [[932, 690], [240, 310]],
  SV: [[880, 505], [320, 261]],
  SVD: [[962, 448], [200, 261]],
  LGV: [[821, 318], [320, 191]],
  CONF: [[700, 556], [480, 345]],
  PVH: [[602, 442], [580, 345]],
  RPV: [[505, 398], [680, 303]],
  LPV: [[688, 378], [680, 387]],
  VAR: [[789, 66], [620, 128]],
  GV: [[876, 302], [240, 121]],
  SIN_R: [[462.1, 380.1], [800, 303]],
  SIN_L: [[719, 339], [800, 387]],
  CV_R: [[446, 296], [900, 303]],
  CV_L: [[738, 262], [900, 387]],
  W_R: [[470, 262], [960, 290]],
  W_M: [[560, 272], [960, 346]],
  W_L: [[700, 238], [960, 401]],
  RHV: [[500, 246], [1000, 282]],
  MHV: [[548, 282], [1000, 345]],
  LHV: [[690, 232], [1000, 408]],
  IVCI: [[620, 650], [1120, 478]],
  IVCS: [[620, 166], [1120, 345]],
  RA: [[620, 112], [1250, 345]],
  SVC: [[620, 40], [1250, 205]],
  AZY: [[574, 30], [1120, 205]],
  UPPV: [[620, -40], [1250, 100]],
  LOWV: [[620, 980], [1120, 690]],
  ILI: [[620, 880], [1120, 640]],
  EPI: [[500, 800], [960, 640]],
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

  V_INT: 'M756 800 C 752 758 700 716 690 660',
  V_COL: 'M960 790 C 952 760 942 725 932 690',
  V_IMV: 'M932 690 C 925 620 905 560 880 505',
  V_SPL: 'M1034 360 C 1010 385 988 420 962 448',
  SV_MID: 'M962 448 C 938 473 910 492 880 505',
  V_STO: 'M880 395 C 860 368 828 332 792 312',
  SMV_CONF: 'M690 660 C 692 625 696 590 700 556',
  SV_CONF: 'M880 505 C 830 525 765 545 700 556',
  LGV_CONF: 'M821 318 C 829 348 835 384 833 412 C 831 440 818 463 797 477 C 774 492 746 499 726 500 C 710 506 702 528 700 556',
  PV_TRUNK: 'M700 556 C 675 522 638 478 602 442',
  PVH_R: 'M602 442 C 568 428 535 414 505 398',
  PVH_L: 'M602 442 C 632 418 660 398 688 378',
  // The portal venules enter the lobe and break up into the sinusoids about halfway along their old
  // course: the sinusoids run on round the lobe's margin and gather into the central veins (see STRANDS).
  PRE_R: 'M505 398 C 491.5 395 476.8 389 462.1 380.1',
  PRE_L: 'M688 378 C 698 365 708.5 352 719 339',
  SIN_RR: 'M462.1 380.1 C 420 355 410 312 446 296',
  SIN_LL: 'M719 339 C 734 321 760 288 738 262',
  SIN_RL: 'M420 345 C 520 382 664 362 750 300',
  POST_R_RHV: 'M446 296 C 466 280 484 262 500 246',
  POST_R_MHV: 'M446 296 C 480 298 516 292 548 282',
  // Not drawn in the anatomy (ANAT_HIDDEN): its course only serves the morph to the circuit.
  POST_L_MHV: 'M738 262 C 722 252 706 242 690 232',
  POST_L_LHV: 'M738 262 C 722 252 706 242 690 232',
  // The caudate lobe drains straight into the retrohepatic IVC through its own short hepatic
  // veins: gathered from the lobe's parenchyma (tributaries, see FEEDERS), not from the portal
  // vein, which it does not touch.
  CAUD: 'M566 326 C 588 328 606 338 620 350',
  // The hepatic veins enter the cava's side wall at three heights, below the node where its two
  // halves meet, so that join is a clean run-on, not a knot of five ends.
  RHV_IVC: 'M500 246 C 545 240 590 232 616 206',
  MHV_IVC: 'M548 282 C 575 272 600 256 615 230',
  LHV_IVC: 'M690 232 C 664 232 646 226 625 213',
  IVC_IS: 'M620 650 L 620 166',
  IVCS_RA: 'M620 166 L 620 112',
  V_UP: 'M620 -40 L 620 40',
  SVC_RA: 'M620 40 L 620 112',
  // The azygos ascends lateral to the cava (drawn clear of the heart; see C9) and arches
  // medially into the SVC above the right atrium. The node sits on the arch, where the
  // esophageal veins join it.
  AZY_SVC: 'M574 30 C 592 22 612 28 620 40',
  V_KID_L: 'M1005 622 C 960 620 910 618 862 618',
  // The left renal vein enters the cava's side a little above the right one, on the wall, not at the iliac end.
  LRV_IVC: 'M862 618 C 790 618 700 625 625 625',
  // The right renal vein enters lower still, so the iliac and renal-level stretches meet head on at the node, with no fork beside it.
  RRV_IVC: 'M560 625 C 585 632 601 664 615 673',
  ILI_IVC: 'M620 880 L 620 650',
  EPI_ILI: 'M500 800 C 512 850 530 896 546 950',
  // Up the chest wall and in across the azygos (in front of it, at a right angle) to the SVC's
  // side, below the arch, so the two never run together.
  EPI_SVC: 'M500 800 C 420 780 340 680 334 520 C 318 410 318 260 360 170 C 396 106 476 84 540 80 C 576 78 598 76 612 72',

  // The coronary vein reaches the gastroesophageal junction; from there the varices climb the
  // esophageal wall as a braid of submucosal columns (see STRANDS) up to the varices node.
  C1a: 'M821 318 C 814 296 804 272 802 250 C 800 220 798 180 795 140 C 793 110 790 86 789 66',
  // Above them the varices drain over the heart into the azygos arch (crossing behind the SVC),
  // passing over the top of the arch rather than alongside it.
  C1b: 'M789 66 C 784 38 760 12 726 2 C 690 -8 640 -12 606 -8 C 584 -5 573 8 574 30',
  C2: 'M880 505 C 890 462 912 420 922 380 C 928 344 912 312 876 302',
  C3: 'M688 378 C 668 440 646 520 620 600 C 590 690 540 760 500 800',
  // Superior rectal veins: down beside the sigmoid to the anorectum, where they break up into
  // submucosal anorectal varices (see STRANDS) and fade out toward the pelvis.
  C4: 'M932 690 C 944 770 922 828 874 856 C 840 872 806 886 786 928',
  // Leaves the fundus in a gentle curve and runs down clear of the coronary vein, easing into
  // the left renal vein.
  C5: 'M876 302 C 868 314 854 336 852 380 C 850 460 852 560 858 596 C 860 606 861 612 862 618',
  // The splenorenal shunts leave the splenic vein halfway between the spleen and the IMV junction (SVD)
  // and drop to the renal vein just below, right of the IMV, so they never cross it. They bow left, clear of the
  // descending colon (which had run alongside, touching, and read as a huge outline round the shunt), and ease into
  // the renal vein heading the way it flows, toward the cava, instead of meeting it at a right angle. They end just short of its centreline (fork-joins.js sideEndScale).
  C6: 'M962 448 C 958 490 948 536 954 576 C 958 600 960 612 953 618',
  // The retroperitoneal collateral leaves the SMV well below the mesocaval origin, on the lower trunk,
  // and runs across to the cava lower down (see STRANDS for its small veins).
  C7: 'M738 755 C 706 756 664 748 620 745',
  C8: 'M700 556 C 706 506 668 462 602 442',
  // Ascending lumbar veins → the ascending azygos, up to its arch. Above y 172 it runs in the
  // azygos trunk's own lane (the same curve as its FEEDERS path), so the two read as one vein.
  C9: 'M620 650 C 584 604 566 500 564 400 C 563 320 564 240 564 172 C 563 120 562 72 564 52 C 566 41 569 35 574 30',

  AP_R: 'M655 478 C 612 470 552 432 505 398',
  AP_L: 'M655 478 C 668 440 680 405 688 378',
  TIPS: 'M505 398 C 498 356 536 298 540 240',   // one gentle curve through the parenchyma, portal → hepatic vein
  // DIPS: a short tract from the portal bifurcation (PVH), up through the caudate lobe in one gentle curve (no
  // bend sharper than about 15° per stretch), meeting the IVC from the side just below the hepatic vein
  // confluence. It stops at the IVC's left wall (x 609) and does not run along the cava or enter its lumen.
  DIPS: 'M602 442 C 582 392 595 318 620 302',
  S_PC: 'M700 556 C 682 590 652 625 620 650',
  S_DSR: 'M962 448 C 958 490 948 536 954 576 C 958 600 960 612 953 618',
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
  C8: [[-38, 1.1, 0.7], [-26, 3.9, 0.75], [-12, 2.4, 0.8], [30, 5.2, 0.7], [44, 0.3, 0.6]],
  C1a: [[-9, 0.7, 0.55], [-4.5, 3.3, 0.6], [0.5, 5.1, 0.5], [5, 1.9, 0.6], [9.5, 4.6, 0.5]],
  C2: [[-22, 4.1, 0.45], [-11, 1.4, 0.55], [10, 2.9, 0.55], [21, 0.4, 0.42]],
  C4: [[-9, 0.9, 0.55], [-4.5, 3.6, 0.6], [0.5, 5.3, 0.5], [5, 2.1, 0.6], [9.5, 4.4, 0.5]],
  // The retroperitoneal veins split into four thin, wavy channels that rejoin the cava.
  C7: [[-12, 1.2, 0.42], [-6, 3.6, 0.48], [6, 5.0, 0.48], [12, 2.3, 0.4]],
  // The sinusoids: a mesh of fine channels that leave the portal venule's end and gather back into the
  // central vein, each over its own stretch [from, to] (0–1 along the vessel), so they peel off and
  // rejoin at different points and read as a network, not a braid.
  SIN_RR: [[-22, 0.4, 0.32, 0.04, 0.92], [-14, 2.1, 0.38, 0.1, 0.86], [-6.5, 3.7, 0.44, 0.18, 0.78], [7, 5.0, 0.44, 0.14, 0.82], [15, 1.3, 0.36, 0.06, 0.9]],
  SIN_LL: [[-14, 0.9, 0.36, 0.06, 0.9], [-6.5, 2.6, 0.44, 0.16, 0.8], [6.5, 4.2, 0.44, 0.12, 0.82], [14, 5.4, 0.36, 0.04, 0.92]],
};
// The drawn sinusoids. Inside the liver they are drawn faded, clearing as they gather into the hepatic
// veins; unlike the liver's other small vessels they take hover, focus and taps in the anatomy.
export const SIN_EDGES = new Set(['SIN_RR', 'SIN_LL']);
// Where along the vessel (0–1) the strands leave the main channel; before it the vessel is one.
export const STRAND_FROM = { C2: 0.5, C1a: 0.22, C4: 0.68, C7: 0.2 };

// Tributaries and feeders (anatomic view only): named veins are formed by several smaller ones,
// drawn converging on the vessel so the plate reads as anatomy, not a wiring diagram. They carry
// the parent's color and flow marks. `k` is each one's caliber as a fraction of the parent;
// `when: 'caudate'` shows the listed `paths` only once the caudate route is carrying several times its normal
// flow (Budd–Chiari): portal blood from both lobes then collateralizes into the caudate vein.
// The veins that leave the plate into the organ they drain (the splenic hilum, the small bowel and
// the colon, the left kidney) end as a straight vessel that fades out over the first fraction of its
// length, rather than as a tree of branches: vessel → fraction of its length (from its first point)
// over which it fades from nothing to solid. Anatomic view only.
export const TIP_FADE = { V_SPL: 0.66, V_INT: 0.2, V_COL: 0.5, V_KID_L: 0.45, LGV_CONF: 0.28 };
// A vessel whose tip fades unless something attaches there: it is drawn solid to its end while any
// of the listed collaterals is open. The coronary vein's upper end is where the collaterals to the
// esophageal varices (C1a) leave it.
export const TIP_CONNECT = { LGV_CONF: ['C1a'] };

// A `fan` is generated (see fanFeeders): `n` tortuous tributaries spread over `spread` degrees
// around `dir` (0 = toward +x, 90 = down), each about `len` long and entering the vessel along
// the fan's axis, most with a smaller branch of their own; `wig` scales their tortuosity.
export const FEEDERS = {
  // Budd–Chiari: collaterals from the right and left portal veins into the caudate vein.
  // Caudate vein: small tributaries from the caudate lobe, always; in Budd–Chiari (`when`), also
  // collaterals from the right and left portal veins, each colored from the pressure of the
  // portal branch it leaves to that of the caudate vein.
  // The fan's axis continues the vein's own course backward (it leaves up and to the right), so
  // every tributary flows into it without a kink; the collaterals also arrive along its course.
  // They sit high in the lobe, between the hepatic vein branches and the portal veins, touching
  // neither.
  // Azygos: its ascending trunk (the intercostal and ascending lumbar veins' channel) climbs
  // beside the cava into the arch.
  // `exact`: drawn on its curve, not meandered, so the ascending lumbar collateral (C9) can share it.
  AZY_SVC: { k: 1, exact: true, paths: ['M564 172 C 563 120 562 72 564 52 C 566 41 569 35 574 30'] },
  // Caput medusae: the recanalized paraumbilical vein (C3) empties at the umbilicus into the
  // superficial epigastric veins, which fan out over the abdominal wall as a tortuous, branching
  // network that thins and fades into the skin (blood leaves the umbilicus, so its marks run
  // outward). Arms leave in every direction but straight down, where the inferior epigastric vein
  // already runs.
  C3: { k: 0.5, when: 'caput', tone: 'end', fan: { at: [500, 800], dir: -95, spread: 280, len: 42, n: 5, seed: 4, levels: 2, wig: 0.35, out: true, when: 'caput', fade: [1, 0.85] } },
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
  // TIPS: leaves the right portal vein straight up, crosses the top of the liver in a lane of its
  // own (clear of the right lobe's lane and of the right hepatic vein's last stretch, which it
  // used to run on top of) and drops into the right hepatic vein from above.
  TIPS: route([[680, 303], [680, 246], [1000, 246], [1000, 282]], 36),
  // DIPS: leaves the proximal right portal vein at the portal bifurcation (PVH), rises to a lane of its own just
  // above the TIPS lane (below the esophageal route and clear of the SVC), then slants down past the hepatic veins and turns in
  // to the IVC downstream of them (just above IVCI).
  DIPS: route([[580, 345], [580, 244], [620, 204], [1060, 204], [1150, 294], [1150, 390], [1120, 420], [1120, 430]], 26),
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
  // Portosystemic shunts, each in its own lane below the spine, 30–32 apart. Every line drops from
  // its station in a column of its own (the lower the lane, the further left the column, so no two
  // cross there) and reaches its end station from a direction no other line uses: the infrahepatic
  // IVC (IVCI) from the upper left (portocaval), the left (mesocaval) and the lower left (left renal
  // vein); the left renal vein (LRV) from the upper left (spontaneous splenorenal), the lower left
  // (distal splenorenal), below (gastrorenal) and the left (the kidney's own vein). The retroperitoneal
  // veins join the IVC's side wall below the renal vein.
  C8: route([[480, 345], [506, 376], [554, 376], [580, 345]], 12),
  S_PC: route([[480, 345], [480, 446], [1088, 446], [1120, 478]], 24),
  S_MC: route([[320, 394], [350, 424], [350, 478], [1120, 478]], 16),
  // The splenorenal shunts leave the splenic vein midway (SVD), left of the IMV's junction.
  C6: route([[200, 261], [200, 510], [970, 510], [1000, 540]], 16),
  S_DSR: route([[200, 261], [184, 277], [184, 570], [970, 570], [1000, 540]], 16),
  C7: route([[320, 394], [320, 600], [1120, 600]], 24),
  C3: route([[680, 387], [680, 640], [960, 640]], 24),
  C4: route([[240, 310], [240, 670], [1090, 670], [1120, 640]]),
  C5: route([[240, 121], [70, 121], [70, 700], [1000, 700], [1000, 540]]),
  EPI_SVC: route([[960, 640], [960, 730], [1330, 730], [1330, 205], [1250, 205]]),
  C9: route([[1120, 478], [1175, 478], [1175, 250], [1130, 205], [1120, 205]]),
};

// Circuit view: inside the liver the portal venules divide toward the sinusoids (one channel, then
// three, then seven, evenly spaced), and the sinusoids gather back the same way, mirrored, into the
// central vein that becomes the hepatic vein. They are drawn branches of the one modeled vessel: each
// takes the vessel's color where it lies along it, and its moving blood; the vessel itself runs on as
// the middle channel. Each branch is a path in the direction of flow, with its caliber as a fraction
// of the vessel's.
function liverTree([x0, cy], [x1], divide) {
  const L = x1 - x0, X = (u) => (divide ? x0 + u * L : x1 - u * L), f = (v) => v.toFixed(1);
  const out = [];
  // A branch leaves its parent's course at `s`, reaches its own offset over 18 % of the span, and
  // runs on to the end of the span.
  const branch = (s, p, c, k) => {
    const a = X(s), b = X(s + 0.18), m = (a + b) / 2, z = X(1);
    out.push({ k, d: divide
      ? `M${f(a)} ${cy + p} C ${f(m)} ${cy + p} ${f(m)} ${cy + c} ${f(b)} ${cy + c} L ${f(z)} ${cy + c}`
      : `M${f(z)} ${cy + c} L ${f(b)} ${cy + c} C ${f(m)} ${cy + c} ${f(m)} ${cy + p} ${f(a)} ${cy + p}` });
  };
  for (const side of [-1, 1]) {
    branch(0.08, 0, 20 * side, 0.45);
    branch(0.42, 20 * side, 10 * side, 0.32);
    branch(0.42, 20 * side, 30 * side, 0.32);
  }
  return out;
}
export const CIRCUIT_TREES = {
  PRE_R: liverTree(NODE_POS.RPV[1], NODE_POS.SIN_R[1], true),
  PRE_L: liverTree(NODE_POS.LPV[1], NODE_POS.SIN_L[1], true),
  SIN_RR: liverTree(NODE_POS.SIN_R[1], NODE_POS.CV_R[1], false),
  SIN_LL: liverTree(NODE_POS.SIN_L[1], NODE_POS.CV_L[1], false),
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
export const CIRCUIT_ZONES = [['Splanchnic beds', 60, 390], ['Portal veins', 390, 630], ['Liver · sinusoids', 630, 950], ['Hepatic veins · IVC', 950, 1185], ['Heart', 1185, 1360]];

// Station labels in the circuit: preferred placement around the node (tried in order) and
// priority (higher wins when space is short; low-priority stations drop out on small screens).
export const CIRCUIT_LABELS = {
  INT: { dirs: ['S', 'W', 'N'], pri: 5 }, COL: { dirs: ['W', 'N', 'S'], pri: 3 }, SPL: { dirs: ['W', 'N', 'S'], pri: 5 }, STO: { dirs: ['W', 'N'], pri: 3 },
  SMV: { dirs: ['S', 'SW', 'N'], pri: 8 }, IMV: { dirs: ['N', 'S', 'NE'], pri: 3 }, SV: { dirs: ['NE', 'N', 'SE'], pri: 8 }, LGV: { dirs: ['N', 'NE', 'S'], pri: 5 },
  CONF: { dirs: ['N', 'NW', 'S'], pri: 10 }, RPV: { dirs: ['NW', 'N', 'W'], pri: 5 }, LPV: { dirs: ['SW', 'S', 'W'], pri: 5 },
  VAR: { dirs: ['N', 'S'], pri: 9 }, GV: { dirs: ['N', 'W', 'S'], pri: 7 },
  SIN_R: { dirs: ['N', 'NE', 'NW'], pri: 9 }, SIN_L: { dirs: ['S', 'SE', 'SW'], pri: 7 }, CV_R: { dirs: ['N', 'NE'], pri: 4 }, CV_L: { dirs: ['S', 'SE'], pri: 4 },
  RHV: { dirs: ['E', 'NE', 'SE'], pri: 8 }, MHV: { dirs: ['SW', 'W', 'S'], pri: 4 }, LHV: { dirs: ['S', 'SE', 'SW'], pri: 5 },
  IVCI: { dirs: ['E', 'SE', 'NE'], pri: 5 }, IVCS: { dirs: ['NE', 'N', 'SE'], pri: 8 }, RA: { dirs: ['E', 'S', 'N'], pri: 9 }, SVC: { dirs: ['N', 'E'], pri: 4 }, AZY: { dirs: ['N', 'NW', 'W'], pri: 5 },
  ILI: { dirs: ['E', 'SE'], pri: 3 }, EPI: { dirs: ['S', 'SW', 'W'], pri: 3 }, KID_L: { dirs: ['W', 'S', 'N'], pri: 2 }, LRV: { dirs: ['N', 'NE', 'S'], pri: 3 },
  HA: { dirs: ['N', 'NW', 'NE'], pri: 4 },
};

// A station's label names a vessel, so its callout hangs from the middle of that vessel rather
// than from the junction at one end (station → the vessel it names). Beds, organs, chambers, the
// sinusoids and the varix/fundus sites have no single run and keep the station itself. The value
// shown is still the station's pressure, so it matches the readout strip.
export const LABEL_VESSEL = {
  CONF: 'PV_TRUNK', SMV: 'SMV_CONF', SV: 'V_SPL', IMV: 'V_IMV', LGV: 'LGV_CONF', RPV: 'PVH_R', LPV: 'PVH_L',
  SIN_R: 'SIN_RR', SIN_L: 'SIN_LL',
  RHV: 'RHV_IVC', MHV: 'MHV_IVC', LHV: 'LHV_IVC', IVCS: 'IVCS_RA', IVCI: 'IVC_IS', SVC: 'SVC_RA', AZY: 'AZY_SVC',
  LRV: 'LRV_IVC', ILI: 'ILI_IVC', VAR: 'C1a', TIPS: 'TIPS', DIPS: 'DIPS',
};

// Organ artwork (anatomic view only): a frontal plate drawn back to front, as a medical
// illustrator layers it. Retroperitoneal structures first (the left kidney), then the heart,
// the colon framing the small
// bowel (ascending on the viewer's left, transverse slung between the flexures, descending,
// sigmoid) from the cecum and appendix, the coiled small bowel entering the cecum, spleen,
// duodenal C-loop, stomach, and the liver in front. The vessel geometry above is fixed; the
// organs are drawn to sit around it. `band` shapes are stroked tubes; `deco` shapes are line work
// only; `noCover` shapes never hide the flow marks of vessels behind them.
export const ORGANS = [
  { id: 'esophagus', tone: 'eso', cls: 'org org-eso', d: 'M775 -90 L 799 -90 L 798 0 C 800 90 805 190 813 251 L 792 251 C 787 190 781 90 776 0 Z' },
  { id: 'heart', tone: 'heart', cls: 'org org-heart', d: 'M618 47 C 607 71 606 111 611 141 C 616 167 632 177 658 177 C 695 177 731 171 753 155 C 762 148 762 133 755 123 C 738 93 716 63 691 47 C 669 34 637 33 618 47 Z' },
  // The right atrium: the chamber on the heart's right border (the viewer's left) that both cavae
  // empty into (the SVC at its top, the IVC at its bottom), bulging a little past the ventricles' outline as
  // the right heart border does; a smooth, rounded chamber smaller than the right ventricle.
  // Presenter slides and the RA station point at it, not at the cava running into it.
  { id: 'heart-ra', tone: 'ra', cls: 'org org-ra', d: 'M622 43 C 608 51 601 73 601 99 C 601 125 609 145 622 153 C 634 157 643 145 645 129 C 648 105 647 75 641 57 C 637 45 630 40 622 43 Z' },
  { id: 'heart-grooves', cls: 'org-heart-groove', deco: true, d: 'M691 47 C 700 91 722 135 751 159 M648 47 C 658 85 660 133 655 176' },
  // The gut (Mohammad's picks in the organ mock-ups, 20 Oct; drawn from organ-art.js, made by scripts/organ-art.mjs): the
  // folded colon (three limbs, the transverse colon in front at both flexures), the small bowel as a pile of loops with a
  // few more in the gap by the kidney, and the duodenum's round C, which lies behind the bowel and the transverse colon.
  // The three are drawn in one see-through group, cut away under the liver, stomach, spleen and kidney (stage.js). `art`:
  // drawn from that markup; `ring`: the visible outline a highlight draws; `cover`: the shape the vessels behind fade under
  // (the tubes' earlier centre lines and widths, so the vessel tiers keep their look).
  { id: 'appendix', tone: 'gut', cls: 'org-appendix', band: true, d: gutPath('M473 916.2 C 479 939.5 491 957.5 509 963.9 C 519 967 527 963.9 531 957.5') },
  { id: 'bowel', tone: 'gut', cls: 'org-bowel', art: 'bowel', d: BOWEL_RING, cover: { d: gutPath('M604 729.3 C 650 712.4 700 720.8 742 729.3 C 786 737.8 830 718.7 872 731.4 C 904 742 906 773.8 878 782.3 C 840 792.9 800 773.8 760 780.2 C 716 786.6 684 801.4 646 792.9 C 610 784.4 590 801.4 598 820.5 C 606 839.6 640 843.8 676 837.4 C 720 829 760 848 800 843.8 C 846 839.6 884 824.7 906 839.6 C 928 856.5 918 886.2 888 890.4 C 846 896.8 810 877.7 764 884.1 C 716 890.4 680 905.3 630 896.8 C 580 888.3 540 875.6 500 877.7 C 470 879.8 446 886.2 424 890.4'), w: 19 } },
  { id: 'duodenum', tone: 'stomach', cls: 'org-duodenum', art: 'duodenum', band: true, ringW: 26, d: DUO_D, cover: { d: 'M726 514 C 690 506 652 526 644 566 C 636 612 650 650 688 668 C 724 684 772 680 806 664', w: 19 } },
  { id: 'colon', tone: 'gut', cls: 'org-colon', art: 'colon', band: true, d: COLON_D, ring: COLON_RING, cover: { d: gutPath('M460 920.4 C 457 899.2 451 882.2 448 863.2 C 440 822.9 437 776.2 439 712.6 C 440 651.2 449 598.2 473 568.5 C 503 555.8 534 589.7 568 632.1 C 611 685.1 664 708.4 727 708.4 C 799 708.4 862 666 903 602.4 C 930 560 952 507 964 462.5 C 971 560 968 708.4 953 803.8 C 944 865.3 910 899.2 860 911.9 C 833 918.3 809 922.5 788 926.8'), w: 25 } },
  { id: 'kidney-l', tone: 'kidney', cls: 'org org-kidney', d: 'M1002 556 C 1040 548 1066 584 1064 626 C 1062 672 1034 700 1000 694 C 982 690 984 668 994 654 C 1000 642 998 630 990 620 C 984 606 978 574 1002 556 Z' },
  { id: 'spleen', tone: 'spleen', cls: 'org org-spleen', d: 'M1030 266 C 1072 264 1100 300 1104 352 C 1108 408 1082 452 1040 462 C 1018 466 1002 456 1004 440 C 1006 426 1016 414 1017 400 C 1018 390 1014 382 1016 372 C 1018 358 1018 342 1013 328 C 1008 314 1006 300 1008 288 C 1010 274 1018 267 1030 266 Z' },
  { id: 'stomach', tone: 'stomach', cls: 'org org-stomach', d: 'M813 249 C 818 257 828 253 840 247 C 850 242 859 241 868 242 C 910 238 948 260 966 296 C 984 332 990 380 984 424 C 976 480 940 524 886 546 C 846 562 796 566 756 552 C 738 546 724 536 714 522 L 708 508 C 712 498 722 494 734 494 C 764 494 794 484 812 462 C 822 450 828 436 830 420 C 834 392 830 350 822 320 C 815 298 800 276 792 249 Z' },
  { id: 'liver', tone: 'liver', cls: 'org org-liver', d: 'M827.6 265 C 826.4 262.5 824.9 260.1 823.1 257.9 C 821.1 255.4 818.8 253.2 816.4 251 C 813.7 248.6 810.8 246.4 807.9 244.3 C 804.7 242 801.4 239.9 798 237.8 C 794.5 235.7 790.9 233.7 787.2 231.7 C 783.4 229.8 779.5 227.9 775.6 226.1 C 771.7 224.3 767.6 222.5 763.6 220.9 C 759.5 219.2 755.4 217.7 751.2 216.2 C 747 214.7 742.8 213.3 738.6 212 C 734.3 210.6 730 209.2 725.7 208 C 721.1 206.7 716.5 205.4 711.9 204.3 C 707 203.1 702 202 697 200.9 C 691.8 199.9 686.6 198.9 681.3 198 C 675.9 197.1 670.5 196.3 665.1 195.5 C 659.5 194.8 654 194.1 648.4 193.5 C 642.8 192.8 637.2 192.3 631.6 191.8 C 626 191.3 620.4 190.9 614.9 190.6 C 609.4 190.2 604 189.9 598.6 189.7 C 593.4 189.4 588.3 189.2 583.1 189.1 C 578.3 188.9 573.4 188.8 568.6 188.7 C 564.2 188.6 559.7 188.6 555.3 188.5 C 551.3 188.5 547.3 188.5 543.2 188.5 C 539.6 188.5 536 188.5 532.4 188.5 C 529.1 188.6 525.9 188.6 522.6 188.6 C 519.6 188.7 516.7 188.7 513.7 188.8 C 511 188.8 508.2 188.9 505.5 189 C 503 189.1 500.4 189.1 497.8 189.3 C 495.4 189.4 493 189.5 490.5 189.7 C 488.2 189.9 485.8 190 483.4 190.3 C 481.1 190.6 478.7 190.8 476.3 191.2 C 474 191.6 471.6 192 469.2 192.5 C 466.8 193.1 464.3 193.7 461.9 194.3 C 459.4 195.1 456.9 195.9 454.4 196.7 C 451.8 197.7 449.2 198.7 446.7 199.8 C 444 201 441.3 202.3 438.7 203.7 C 435.9 205.2 433.1 206.8 430.5 208.5 C 427.7 210.2 425 212 422.4 214 C 419.7 216 417.1 218 414.6 220.2 C 412.1 222.5 409.6 224.8 407.3 227.3 C 404.9 229.8 402.7 232.4 400.6 235.1 C 398.4 237.8 396.4 240.7 394.5 243.6 C 392.6 246.6 390.8 249.7 389.2 252.9 C 387.6 256.2 386.1 259.6 384.7 263 C 383.3 266.5 382.1 270.1 381.1 273.8 C 380 277.6 379.1 281.5 378.3 285.4 C 377.5 289.5 376.8 293.7 376.3 297.8 C 375.8 302.2 375.4 306.6 375.2 311 C 374.9 315.6 374.8 320.2 374.8 324.8 C 374.7 329.6 374.9 334.4 375.1 339.2 C 375.3 344.2 375.6 349.2 376 354.1 C 376.5 359.2 377 364.3 377.6 369.4 C 378.2 374.5 378.9 379.6 379.7 384.7 C 380.5 389.8 381.4 394.9 382.4 400 C 383.3 405 384.4 409.9 385.3 414.9 C 386.3 419.7 387.1 424.5 388 429.4 C 388.9 434 389.7 438.7 390.6 443.3 C 391.5 447.7 392.4 452.1 393.4 456.4 C 394.4 460.5 395.4 464.5 396.6 468.5 C 397.8 472.2 399 475.9 400.5 479.5 C 401.8 482.8 403.3 486 405 489.1 C 406.6 492 408.4 494.8 410.4 497.4 C 412.2 499.9 414.3 502.2 416.5 504.3 C 418.7 506.4 421 508.3 423.5 510.1 C 425.9 511.7 428.5 513.2 431.1 514.5 C 433.7 515.8 436.4 516.9 439.2 517.7 C 441.9 518.6 444.7 519.2 447.5 519.7 C 450.2 520.1 453 520.3 455.8 520.4 C 458.5 520.4 461.2 520.3 464 520 C 466.7 519.7 469.4 519.2 472.1 518.6 C 474.9 518 477.7 517.3 480.4 516.4 C 483.3 515.6 486.2 514.5 489 513.5 C 492.1 512.5 495.2 511.3 498.3 510.1 C 501.7 508.9 505.1 507.6 508.5 506.4 C 512.3 505 516 503.7 519.9 502.4 C 524.1 501.1 528.3 499.7 532.5 498.4 C 537.2 497.1 541.8 495.7 546.5 494.4 C 551.5 493 556.5 491.7 561.6 490.3 C 566.7 488.9 571.9 487.5 577 486 C 582 484.5 587 483 591.9 481.4 C 596.4 479.9 600.9 478.3 605.2 476.4 C 609.2 474.8 613.1 473 616.8 471 C 620.2 469.2 623.4 467.2 626.4 465 C 629.1 463.1 631.7 460.9 634.1 458.7 C 636.3 456.6 638.3 454.4 640.2 452.1 C 642 449.9 643.7 447.5 645.5 445.2 C 647.2 442.9 648.9 440.5 650.9 438.3 C 652.9 436.2 655 434.1 657.4 432.4 C 659.9 430.6 662.7 429.2 665.6 428 C 668.7 426.6 672.1 425.7 675.3 424.6 C 678.9 423.4 682.5 422.4 686 421.1 C 689.7 419.6 693.5 417.9 697 416 C 700.9 413.9 704.5 411.6 708.1 409.1 C 711.9 406.4 715.5 403.4 719.1 400.4 C 722.9 397.2 726.6 393.9 730.2 390.6 C 734 387.1 737.7 383.5 741.4 379.9 C 745.3 376.2 749 372.5 752.8 368.8 C 756.6 365.1 760.4 361.3 764.2 357.6 C 767.9 353.8 771.6 350.1 775.4 346.4 C 779.1 342.8 782.8 339.3 786.4 335.6 C 789.9 332.2 793.4 328.7 796.7 325.2 C 799.9 321.8 803.1 318.5 806.1 315 C 808.9 311.9 811.7 308.6 814.3 305.3 C 816.7 302.4 819 299.4 821.1 296.2 C 822.9 293.5 824.7 290.7 826.1 287.7 C 827.3 285.2 828.4 282.5 829 279.8 C 829.6 277.3 829.8 274.8 829.6 272.3 C 829.4 269.8 828.6 267.3 827.6 265 Z' },
  // Cantlie's line (gallbladder fossa to the IVC) and the falciform ligament: the lobes as a
  // surgeon reads them.
  { id: 'falciform', cls: 'org-lobe-line', deco: true, d: 'M654 430 C 650 375 654 305.3 648 207.6' },
  { id: 'umbilicus', cls: 'org-umbilicus', circle: [500, 800, 5] },
];
// The esophagus and stomach drawn as one shape (organ mock-ups, 20 Oct: "the esophagus connection to the stomach should be
// seamless"): the esophagus's edges run into the cardia and the angle of His with no seam across. The organs keep their own
// outlines above (highlights, the diaphragm's cut); the stage paints this one.
export const SEAM_D = 'M775 -90 L 799 -90 L 798 0 C 800 90 805 190 811 238 C 813 250 822 256 840 247 C 850 242 859 241 868 242 C 910 238 948 260 966 296 C 984 332 990 380 984 424 C 976 480 940 524 886 546 C 846 562 796 566 756 552 C 738 546 724 536 714 522 L 708 508 C 712 498 722 494 734 494 C 764 494 794 484 812 462 C 822 450 828 436 830 420 C 834 392 830 350 822 320 C 815 298 804 282 798 268 C 793 256 790 244 788 222 C 785 160 781 90 776 0 Z';
// Surface anatomy drawn inside each organ (clipped to it), as a medical plate shows it:
// fissures and ligaments, rugae, hilum, lobulation. Classes: fine (hairline in the organ's
// outline tone), soft (a broader, fainter fold), sheen (a light reflection on a curved surface).
export const ORGAN_DETAIL = {
  liver: [
    ['fine', 'M654 430 C 650 375 654 305.3 648 207.6'],
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
  heart: [['fine', 'M691 47 C 700 91 722 135 751 159']],
};
// Background plane (anatomic view): the posterior wall the organs sit against, drawn quietly
// so the plate reads in depth. The diaphragm is one muscle sheet a little above the organs: a higher
// right dome over the liver, a saddle under the heart (which rests on it), a lower left dome over the
// fundus and spleen, then down the flanks, where it fades out. stage.js traces it again from the
// organs' current outlines (diaphragmPath) and hides it wherever an organ covers it (diaMask), so it
// never shows through the see-through organs; this is the healthy outline it starts from.
export const BACKDROP = {
  diaphragm: 'M312 420 C 306 330 308 244 336 204 C 360 178 416 168 480 168 C 570 166 650 180 710 194 C 760 206 800 220 850 226 C 880 228 900 224 930 228 C 980 234 1010 246 1040 252 C 1090 260 1112 300 1116 350 C 1118 380 1119 400 1119 420',
};

// Invisible peritoneal outline: ascites fills it from the bottom.
// The peritoneal cavity closes in a rounded pelvic floor (below the plate's default frame), so
// ascites pools in a basin when the view is zoomed out instead of ending in a flat cut.
// One outline, mirror-symmetric about x = 712, for the flanks drawn on the plate and the cavity the
// fluid fills, so the fluid always meets the body wall. `b`: how far the flanks bulge with ascites.
export const flankPath = (b = 0) => `M336 470 C ${324 - b} 610 ${330 - b} 780 ${372 - b * 0.4} 954 C 470 1012 954 1012 ${1052 + b * 0.4} 954 C ${1094 + b} 780 ${1100 + b} 610 1088 470`;
export const abdomenOutline = (b = 0) => `M336 440 L${flankPath(b).slice(1)} L1088 440 Z`;
export const ABDOMEN_CLIP = abdomenOutline(0);

// The same cavity as half-widths about x = 712 (its mirror line), one per row: n rows evenly from y0 to y0 + h. Each row
// crosses it once (the flanks and both halves of the floor run steadily down), so a row's half-width is the whole shape:
// the GPU fills the fluid from these at each bulge step, a few KB, where a raster of the outline was a slow upload in
// Safari on every step of an ease. Rows above the top edge (y 440) or below the floor's lowest point hold the half-width
// continued past the edge (negative), so the row between crosses zero where the outline does.
export function cavityHalfWidths(b, y0, h, n) {
  const cub = (p0, p1, p2, p3, t) => { const s = 1 - t; return s * s * s * p0 + 3 * s * s * t * p1 + 3 * s * t * t * p2 + t * t * t * p3; };
  // The left half of the outline from the top of the flank down to the floor's lowest point (x 712): its flank cubic, then the
  // first half of the floor's.
  const xs = [], ys = [], K = 512;
  for (let i = 0; i <= K; i++) { const t = i / K; xs.push(cub(336, 324 - b, 330 - b, 372 - b * 0.4, t)); ys.push(cub(470, 610, 780, 954, t)); }
  for (let i = 1; i <= K; i++) { const t = 0.5 * i / K; xs.push(cub(372 - b * 0.4, 470, 954, 1052 + b * 0.4, t)); ys.push(cub(954, 1012, 1012, 954, t)); }
  const yEnd = ys[ys.length - 1];
  const out = new Float32Array(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const y = y0 + h * i / (n - 1);
    if (y < 440) out[i] = 376 - 1e3 * (440 - y);
    else if (y <= 470) out[i] = 376;
    else if (y >= yEnd) {
      // Past the lowest point, continued at the slope of the last stretch above it.
      const k = ys.length - 1, sl = (xs[k] - xs[k - 1]) / (ys[k] - ys[k - 1]);
      out[i] = (712 - xs[k]) - sl * (y - ys[k]);
    } else {
      while (ys[j + 1] < y) j++;
      const f = (y - ys[j]) / (ys[j + 1] - ys[j]);
      out[i] = 712 - (xs[j] + f * (xs[j + 1] - xs[j]));
    }
  }
  return out;
}
export const ABDOMEN_FLOOR = 950;
export const SPLEEN_CENTER = [1040, 362];

// Where the stage draws instruments and findings.
export const SITES = {
  varix: [797, 232],        // lower esophagus
  fundus: [876, 304],       // gastric fundus
  umbilicus: [500, 800],
};

// Organ captions: [text, x, y, anchor]
export const ORGAN_LABELS = [
  ['Liver', 455, 432], ['Stomach', 918, 432], ['Spleen', 1066, 250], ['Colon', 960, gutY(846)], ['Kidney', 978, 716],
  ['Small bowel', 820, gutY(800)], ['Esophagus', 860, 40], ['Right atrium', 532, 118],
];

// Atlas labels: node → caption and which margin column it hangs from.
export const ATLAS_LABELS = {
  RA: { name: 'Right atrium', side: 'L' },
  IVCS: { name: 'IVC (hepatic)', side: 'L' },
  IVCI: { name: 'IVC (renal level)', side: 'L' },
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
export const LIVER_INNER = new Set(['HA', 'RPV', 'LPV', 'SIN_R', 'SIN_L', 'CV_R', 'CV_L']);
export const LIVER_EDGES = new Set(['A_HEP', 'A_HR', 'A_HL', 'AP_R', 'AP_L', 'PRE_R', 'PRE_L', 'SIN_RR', 'SIN_LL', 'SIN_RL', 'POST_R_RHV', 'POST_R_MHV', 'POST_L_LHV', 'POST_L_MHV', 'CAUD']);
// Collateral and shunt lanes in the circuit, captioned where they run (edge → caption).
export const LANE_CAPTIONS = {
  C1b: 'Esophageal route → azygos', C2: 'Short gastric', C3: 'Paraumbilical', C4: 'Rectal', C5: 'Gastrorenal shunt', C6: 'Splenorenal shunt',
  C7: 'Retroperitoneal', C8: 'Periportal', C9: 'Caval → azygos', TIPS: 'TIPS', DIPS: 'DIPS', S_PC: 'Portocaval shunt', S_DSR: 'Distal splenorenal shunt', S_MC: 'Mesocaval shunt',
  EPI_SVC: 'Epigastric → SVC',
};

// The pressure-profile chart follows one path, gut → liver → heart, with plain station names;
// `liver` marks the stations inside the liver (portal venule to central vein).
export const PROFILE_PATHS = [
  { id: 'main', label: 'Gut → liver → heart', nodes: ['INT', 'CONF', 'RPV', 'SIN_R', 'CV_R', 'RHV', 'IVCS', 'RA'],
    names: { INT: 'Gut', CONF: 'Portal vein', RPV: 'Portal venule', SIN_R: 'Sinusoid', CV_R: 'Central vein', RHV: 'Hepatic vein', IVCS: 'IVC', RA: 'RA' },
    liver: ['RPV', 'CV_R'],
    // Gradients drawn as spans under the line, with the same values and cut-offs as the readout
    // tiles: HVPG = WHVP − FHVP (wedged − free hepatic vein) and PPG = portal vein − IVC.
    dims: [{ k: 'HVPG', hi: 'SIN_R', lo: 'RHV', hiM: 'whvp', loM: 'fhvp', m: 'hvpg', warn: 5, bad: 10, hide: 'trueHVPG' },
      { k: 'PPG', hi: 'CONF', lo: 'IVCS', m: 'ppg', warn: 6, bad: 12 }] },
];

// Figure callouts name each station in full, without abbreviations that end in a full stop (17 Oct design review: "Varices", not
// "Esoph. varices"; "Right sinusoids", not "Sinusoids R"). SMV, IMV, IVC and SVC stay as the clinical names they are.
export const SHORT = {
  AO: 'Aorta', HA: 'Hepatic artery', INT: 'Gut bed', COL: 'Colon', SPL: 'Spleen', STO: 'Stomach', SMV: 'SMV', IMV: 'IMV', SV: 'Splenic vein',
  LGV: 'Left gastric vein', CONF: 'Portal vein', PVH: 'Hilar portal vein', RPV: 'Right portal vein', LPV: 'Left portal vein', VAR: 'Varices', GV: 'Fundal varices',
  SIN_R: 'Right sinusoids', SIN_L: 'Left sinusoids', CV_R: 'Right central vein', CV_L: 'Left central vein', W_R: 'Right wedge', W_M: 'Middle wedge', W_L: 'Left wedge',
  RHV: 'Right hepatic vein', MHV: 'Middle hepatic vein', LHV: 'Left hepatic vein', IVCI: 'Lower IVC', IVCS: 'IVC', RA: 'Right atrium', SVC: 'SVC', AZY: 'Azygos', UPPV: 'Upper body',
  LOWV: 'Lower body', ILI: 'Iliac vein', EPI: 'Umbilicus', KID_L: 'Left kidney', KID_R: 'Right kidney', LRV: 'Left renal vein', RRV: 'Right renal vein',
};

// Where a vessel's label is crowded it reads its clinical abbreviation first ("RPV 9.8" before it drops a number or hides), and
// the full name returns once a zoom makes room (Mohammad, 18 Oct). No abbreviation ends in a full stop (17 Oct design review).
export const ABBR = { CONF: 'PV', RPV: 'RPV', LPV: 'LPV', SV: 'SV', RHV: 'RHV', MHV: 'MHV', LHV: 'LHV' };

// Chips shown by default (major vessels)
export const CHIP_NODES = ['CONF', 'SV', 'SMV', 'SIN_R', 'RHV', 'IVCS', 'IVCI', 'RA', 'VAR'];

/** Tributary fan → [{ d, k }] (path from the tip to the vessel; k = caliber relative to `k`). */
export function fanFeeders({ at, dir, spread, len, n, seed = 1, levels = 0 }) {
  let r = seed * 9301 + 49297;
  const rnd = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };
  const rad = (deg) => (deg * Math.PI) / 180, P = (p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
  const ax = [Math.cos(rad(dir)), Math.sin(rad(dir))];
  const out = [];
  if (levels) {
    // A branching tree: each vein divides in two (now and then three) at its far end, and each
    // branch again, shorter, finer and turning a little, so the tributaries arborize like real
    // veins instead of radiating from one point.
    const grow = (from, a, l, k, lv) => {
      const E = [from[0] + Math.cos(a) * l, from[1] + Math.sin(a) * l];
      const bend = (rnd() - 0.5) * 0.5;
      const c1 = [E[0] - Math.cos(a + bend) * l * 0.35, E[1] - Math.sin(a + bend) * l * 0.35];
      const c2 = [from[0] + Math.cos(a - bend) * l * 0.35, from[1] + Math.sin(a - bend) * l * 0.35];
      out.push({ d: `M${P(E)} C ${P(c1)} ${P(c2)} ${P(from)}`, k });
      if (lv >= levels) return;
      const m = rnd() < 0.25 ? 3 : 2, fork = rad(24 + 12 * rnd());
      for (let j = 0; j < m; j++) {
        const off = m === 2 ? (j ? 1 : -1) * fork : (j - 1) * fork * 1.1;
        grow(E, a + off + (rnd() - 0.5) * 0.2, l * (0.62 + 0.16 * rnd()), k * 0.72, lv + 1);
      }
    };
    for (let i = 0; i < n; i++) {
      const a = rad(dir + spread * (n > 1 ? i / (n - 1) - 0.5 : 0) + (rnd() - 0.5) * 10);
      grow(at, a, len * (0.85 + 0.3 * rnd()), 0.9 + 0.2 * rnd(), 0);
    }
    return out;
  }
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
