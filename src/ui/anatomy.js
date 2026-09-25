// Stage geometry (blueprint §6). Logical space 1400 × 1000.
// Standard anatomical frontal view: the patient's right is on the viewer's LEFT.

export const VIEW = { w: 1400, h: 1000 };

// Node positions: [anatomic, circuit]
export const NODE_POS = {
  AO: [[790, 300], [90, 480]],
  HA: [[640, 500], [640, 300]],
  INT: [[720, 805], [260, 520]],
  COL: [[955, 800], [260, 610]],
  SPL: [[1010, 345], [260, 390]],
  STO: [[900, 375], [260, 300]],
  SMV: [[700, 680], [420, 520]],
  IMV: [[925, 685], [420, 610]],
  SV: [[960, 510], [420, 420]],
  LGV: [[785, 450], [420, 300]],
  CONF: [[700, 562], [560, 470]],
  PVH: [[600, 472], [660, 470]],
  RPV: [[500, 442], [760, 420]],
  LPV: [[722, 430], [760, 540]],
  VAR: [[712, 238], [560, 200]],
  GV: [[868, 292], [420, 200]],
  SIN_R: [[430, 402], [870, 420]],
  SIN_L: [[770, 372], [870, 540]],
  CV_R: [[452, 330], [985, 420]],
  CV_L: [[790, 330], [985, 540]],
  W_R: [[505, 348], [1030, 360]],
  W_M: [[600, 380], [1030, 480]],
  W_L: [[750, 345], [1030, 600]],
  RHV: [[545, 322], [1085, 400]],
  MHV: [[620, 358], [1085, 480]],
  LHV: [[725, 318], [1085, 560]],
  IVCI: [[660, 632], [1085, 800]],
  IVCS: [[660, 272], [1185, 480]],
  RA: [[648, 188], [1300, 480]],
  SVC: [[650, 95], [1185, 170]],
  AZY: [[622, 300], [760, 140]],
  UPPV: [[520, 48], [260, 110]],
  LOWV: [[660, 985], [260, 920]],
  ILI: [[660, 880], [760, 920]],
  EPI: [[600, 748], [900, 690]],
  KID_L: [[905, 648], [260, 780]],
  KID_R: [[515, 648], [260, 850]],
  LRV: [[838, 634], [760, 780]],
  RRV: [[585, 636], [760, 850]],
};

// Anatomic edge paths (SVG path data). Edges without an entry are drawn from node to node.
export const EDGE_PATH = {
  A_SMA: 'M790 540 C 775 600 750 700 720 805',
  A_IMA: 'M790 760 C 840 770 910 785 955 800',
  A_SPL: 'M790 480 C 850 470 930 450 975 400 C 990 380 1000 365 1010 345',
  A_LGA: 'M790 480 C 810 450 850 400 900 375',
  A_HEP: 'M790 480 C 740 492 690 500 640 500',
  A_HR: 'M640 500 C 580 490 500 460 430 402',
  A_HL: 'M640 500 C 690 470 740 420 770 372',
  A_REN_L: 'M790 618 C 830 622 870 635 905 648',
  A_REN_R: 'M790 618 C 700 612 600 630 515 648',
  A_LOW: 'M790 900 C 780 950 720 985 660 985',
  A_UP: 'M745 108 C 700 70 600 45 520 48',
  A_AZY: 'M790 330 C 740 320 680 310 622 300',
  A_EPI: 'M790 700 C 720 720 660 735 600 748',

  V_INT: 'M720 805 C 712 760 705 720 700 680',
  V_COL: 'M955 800 C 945 760 935 720 925 685',
  V_IMV: 'M925 685 C 930 630 945 560 960 510',
  V_SPL: 'M1010 345 C 1030 420 1010 470 960 510',
  V_STO: 'M900 375 C 870 410 830 435 785 450',
  SMV_CONF: 'M700 680 C 700 640 700 600 700 562',
  SV_CONF: 'M960 510 C 900 530 800 550 700 562',
  LGV_CONF: 'M785 450 C 760 490 730 530 700 562',
  PV_TRUNK: 'M700 562 C 670 530 630 500 600 472',
  PVH_R: 'M600 472 C 565 462 530 452 500 442',
  PVH_L: 'M600 472 C 640 450 690 438 722 430',
  PRE_R: 'M500 442 C 475 432 450 420 430 402',
  PRE_L: 'M722 430 C 740 410 755 392 770 372',
  SIN_RR: 'M430 402 C 432 380 440 352 452 330',
  SIN_LL: 'M770 372 C 778 358 785 345 790 330',
  SIN_RL: 'M430 402 C 520 420 680 410 770 372',
  POST_R_RHV: 'M452 330 C 480 326 515 322 545 322',
  POST_R_MHV: 'M452 330 C 510 350 570 362 620 358',
  POST_L_LHV: 'M790 330 C 770 322 748 318 725 318',
  POST_L_MHV: 'M790 330 C 730 350 670 362 620 358',
  CAUD: 'M560 420 C 600 425 640 410 652 360 C 656 320 659 295 660 272',
  RHV_IVC: 'M545 322 C 590 300 630 285 660 272',
  MHV_IVC: 'M620 358 C 640 330 652 300 660 272',
  LHV_IVC: 'M725 318 C 700 300 680 285 660 272',
  IVC_IS: 'M660 632 C 660 520 660 380 660 272',
  IVCS_RA: 'M660 272 C 658 240 652 212 648 188',
  V_KID_L: 'M905 648 C 880 640 860 636 838 634',
  V_KID_R: 'M515 648 C 540 642 565 638 585 636',
  LRV_IVC: 'M838 634 C 780 630 720 632 660 632',
  RRV_IVC: 'M585 636 C 610 634 635 633 660 632',
  V_LOW: 'M660 985 C 660 950 660 915 660 880',
  ILI_IVC: 'M660 880 C 660 800 660 700 660 632',
  EPI_ILI: 'M600 748 C 610 800 630 850 660 880',
  EPI_SVC: 'M600 748 C 470 700 395 600 390 450 C 385 300 420 180 520 120 C 580 95 620 92 650 95',
  V_UP: 'M520 48 C 580 55 620 70 650 95',
  AZY_SVC: 'M622 300 C 618 230 620 160 632 125 C 638 110 645 100 650 95',
  SVC_RA: 'M650 95 C 650 130 649 160 648 188',

  C1a: 'M785 450 C 770 400 760 340 740 300 C 728 275 718 255 712 238',
  C1b: 'M712 238 C 690 250 660 280 622 300',
  C2: 'M960 510 C 1000 450 985 380 950 335 C 920 305 895 295 868 292',
  C2b: 'M868 292 C 840 330 815 390 785 450',
  C3: 'M722 430 C 715 500 690 580 660 650 C 640 700 620 730 600 748',
  C4: 'M925 685 C 925 780 900 870 820 925 C 760 955 700 930 660 880',
  C5: 'M868 292 C 930 330 975 420 950 520 C 930 580 880 615 838 634',
  C6: 'M960 510 C 930 560 890 610 838 634',
  C7: 'M700 680 C 650 700 615 690 620 660 C 625 640 645 634 660 632',
  C8: 'M700 562 C 690 540 660 530 648 512 C 632 494 612 490 600 472',
  C9: 'M660 632 C 630 600 612 520 614 440 C 616 380 620 330 622 300',

  AP_R: 'M640 500 C 590 490 540 470 500 442',
  AP_L: 'M640 500 C 680 470 705 445 722 430',
  TIPS: 'M500 442 C 515 410 530 360 545 322',
  S_PC: 'M700 562 C 690 590 675 615 660 632',
  S_DSR: 'M960 510 C 945 575 900 620 838 634',
  S_MC: 'M700 680 C 690 660 670 640 660 632',

  // Render-only: heart pump + aorta (not in the engine edge list)
  PUMP: 'M648 188 C 680 215 725 215 735 175 C 745 135 740 105 765 100 C 790 98 795 125 792 160 C 790 200 790 250 790 300',
  AORTA: 'M790 300 L 790 905',
};

// Circuit-view overrides for a few edges (otherwise a smooth S-curve between node positions).
export const CIRCUIT_PATH = {
  PUMP: 'M1300 480 C 1360 480 1370 960 1300 975 L 100 975 C 40 960 40 480 90 480',
  AORTA: 'M90 480 L 92 482',
  EPI_SVC: 'M900 690 C 1000 660 1150 300 1185 170',
  C3: 'M760 540 C 800 600 860 660 900 690',
  C9: 'M1085 800 C 980 700 820 200 760 140',
  C1b: 'M560 200 C 620 170 700 150 760 140',
  C1a: 'M420 300 C 470 260 520 220 560 200',
  C2: 'M420 420 C 380 350 390 260 420 200',
  C2b: 'M420 200 C 440 240 430 270 420 300',
  C5: 'M420 200 C 330 230 330 700 760 780',
  C6: 'M420 420 C 380 560 560 760 760 780',
  S_DSR: 'M420 420 C 400 580 580 770 760 780',
  C7: 'M420 520 C 600 700 900 800 1085 800',
  S_MC: 'M420 520 C 600 690 900 790 1085 800',
  C4: 'M420 610 C 520 800 640 900 760 920',
  C8: 'M560 470 C 590 440 630 440 660 470',
  S_PC: 'M560 470 C 700 650 900 780 1085 800',
  TIPS: 'M760 420 C 850 340 1000 340 1085 400',
  SIN_RL: 'M870 420 C 900 460 900 500 870 540',
  AP_R: 'M640 300 C 700 330 740 380 760 420',
  AP_L: 'M640 300 C 720 360 740 480 760 540',
  CAUD: 'M985 420 C 1060 300 1150 300 1185 480',
  AZY_SVC: 'M760 140 C 900 130 1100 150 1185 170',
  V_UP: 'M260 110 C 600 100 1000 120 1185 170',
  A_UP: 'M90 480 C 120 300 180 130 260 110',
  A_AZY: 'M90 480 C 300 300 600 150 760 140',
  A_EPI: 'M90 480 C 300 600 700 690 900 690',
  A_HEP: 'M90 480 C 200 360 500 300 640 300',
};

// Organ artwork (anatomic view only). Colors come from CSS tokens; `deco` shapes are texture only.
export const ORGANS = [
  { id: 'torso', cls: 'org-body', d: 'M612 6 C 612 40 604 62 580 74 C 520 96 420 104 372 136 C 342 158 334 200 334 260 C 330 400 336 520 350 640 C 362 760 368 880 392 998 L 1008 998 C 1032 880 1038 760 1050 640 C 1064 520 1070 400 1066 260 C 1066 200 1058 158 1028 136 C 980 104 880 96 820 74 C 796 62 788 40 788 6 Z' },
  { id: 'lung-r', cls: 'org org-lung', d: 'M352 262 C 350 190 372 130 440 112 C 500 98 560 104 586 130 C 606 152 612 190 616 248 C 540 222 440 224 352 262 Z' },
  { id: 'lung-l', cls: 'org org-lung', d: 'M1048 262 C 1050 190 1028 130 960 112 C 900 98 840 104 814 130 C 794 152 788 190 784 248 C 860 222 960 224 1048 262 Z' },
  { id: 'heart', cls: 'org org-heart', d: 'M612 150 C 620 112 692 100 735 128 C 786 160 796 222 745 252 C 705 276 642 262 620 232 C 600 205 602 175 612 150 Z' },
  { id: 'diaphragm', cls: 'org-diaphragm', d: 'M340 262 C 450 205 585 232 660 256 C 740 232 900 205 1060 262', stroke: true },
  { id: 'esophagus', cls: 'org org-eso', d: 'M698 18 L 712 18 L 718 250 C 730 280 760 298 780 305 L 772 318 C 745 310 712 290 704 256 Z' },
  { id: 'liver', cls: 'org org-liver', d: 'M345 305 C 360 255 470 244 600 258 C 700 266 805 272 852 300 C 874 318 850 342 804 356 C 762 380 702 420 642 470 C 580 520 470 544 400 522 C 350 504 330 420 345 305 Z' },
  { id: 'falciform', cls: 'org-lobe-line', deco: true, d: 'M648 262 C 642 320 636 400 640 470' },
  { id: 'caudate', cls: 'org-caudate', d: 'M618 392 C 632 378 652 380 656 398 C 660 420 646 440 628 436 C 612 432 608 404 618 392 Z' },
  { id: 'gallbladder', cls: 'org org-gb', d: 'M548 496 C 556 480 578 482 582 498 C 586 516 572 534 560 530 C 548 526 542 508 548 496 Z' },
  { id: 'stomach', cls: 'org org-stomach', d: 'M772 318 C 800 268 900 250 935 300 C 968 350 966 425 935 465 C 902 505 828 505 780 478 C 762 468 752 460 746 452 C 772 440 822 452 860 432 C 892 412 890 356 852 334 C 822 318 792 322 772 318 Z' },
  { id: 'spleen', cls: 'org org-spleen', d: 'M1000 268 C 1040 262 1062 300 1058 350 C 1054 400 1036 428 1004 424 C 984 421 990 398 996 380 C 1002 360 984 350 978 330 C 970 300 972 272 1000 268 Z' },
  { id: 'pancreas', cls: 'org org-pancreas', d: 'M690 556 C 760 530 850 520 930 500 C 982 488 1012 470 1032 458 C 1040 478 1012 502 962 522 C 880 550 780 578 700 584 Z' },
  { id: 'kidney-r', cls: 'org org-kidney', d: 'M492 600 C 520 590 548 610 548 648 C 548 690 520 710 494 700 C 478 694 485 670 500 662 C 486 650 478 612 492 600 Z' },
  { id: 'kidney-l', cls: 'org org-kidney', d: 'M928 600 C 900 590 872 610 872 648 C 872 690 900 710 926 700 C 942 694 935 670 920 662 C 934 650 942 612 928 600 Z' },
  { id: 'colon', cls: 'org-colon', d: 'M470 890 L 458 640 C 466 600 520 592 560 602 L 900 592 C 950 590 972 620 966 662 L 960 860 C 955 900 900 930 820 930 C 760 930 725 942 705 965', stroke: true },
  { id: 'colon-h', cls: 'org-colon-haustra', deco: true, d: 'M470 890 L 458 640 C 466 600 520 592 560 602 L 900 592 C 950 590 972 620 966 662 L 960 860 C 955 900 900 930 820 930 C 760 930 725 942 705 965' },
  { id: 'bowel', cls: 'org org-bowel', d: 'M575 700 C 600 675 700 668 800 672 C 870 676 890 720 880 780 C 875 850 850 895 760 905 C 660 912 590 895 572 840 C 560 790 555 725 575 700 Z' },
  { id: 'bowel-loops', cls: 'org-bowel-loops', deco: true, d: 'M596 722 C 632 700 668 742 708 718 C 748 694 792 736 846 708 M588 782 C 628 760 668 802 716 778 C 764 754 812 796 866 770 M600 842 C 642 820 690 862 738 838 C 786 814 822 852 856 832' },
  { id: 'rectum', cls: 'org org-rectum', d: 'M690 930 C 700 915 725 915 732 932 L 728 990 L 694 990 Z' },
  { id: 'umbilicus', cls: 'org-umbilicus', circle: [600, 748, 7] },
];

// Organ captions: [text, x, y, anchor]
export const ORGAN_LABELS = [
  ['Liver', 392, 492, 'start'], ['Stomach', 902, 446, 'middle'], ['Spleen', 1016, 452, 'middle'], ['Heart', 760, 240, 'middle'],
  ['Small bowel', 728, 888, 'middle'], ['Kidney', 520, 734, 'middle'], ['Kidney', 900, 734, 'middle'], ['Pancreas', 902, 580, 'middle'],
  ['Esophagus', 724, 44, 'start'], ['Colon', 986, 770, 'start'],
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

export const LOBULE_ZONES = { R: [345, 250, 640, 540], L: [640, 250, 860, 480] };
export const LIVER_SPLIT_X = 640;

// Varix / instrument anchors
export const ANCHORS = {
  PERITONEUM: [760, 900], VAR: [712, 238], GV: [868, 292], TIPS: [525, 385], SPL: [1010, 345], RA: [648, 188],
  AO: [790, 300], CAUD: [640, 410],
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
