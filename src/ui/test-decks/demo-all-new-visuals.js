// One importable deck with every new deck visual (deck visuals packages A, B, C, D, E, F, G), merged from the package
// demo decks. Built into the preview only (Menu › Present › Testing); the repo copy, src/ui/test-decks/demo-all-new-visuals.js,
// is the source, and /mnt/project-files/decks/ keeps a matching copy. It can still be imported (Menu › Present › Your scripts ›
// Import). Built-in decks use none of these options. Sections: Figure, Charts, Card and panels, Instruments. Slide ids shared by two demos carry the package letter (e.g. 'e-csph').

export const DEMO_ALL = {
  "id": "demo-all-new-visuals",
  "level": "advanced",
  "title": "Demo: all the new visuals",
  "minutes": 40,
  "summary": "Every new deck visual in one talk: figure highlights and callouts, charts, model charts, teaching card tables, panels and instruments.",
  "objectives": [
    "See the new figure highlights and callouts",
    "See the new charts and model charts",
    "See the new panels, tables and instruments"
  ],
  "sections": [
    [
      "Figure",
      [
        "sources",
        "fundal",
        "eso",
        "spot",
        "system",
        "normal",
        "grown",
        "pre",
        "tips",
        "carv",
        "live",
        "belly",
        "spleen",
        "f-grown",
        "varix",
        "stent",
        "route",
        "zone",
        "f-tips"
      ]
    ],
    [
      "Charts",
      [
        "start",
        "m6",
        "b-carv",
        "m12",
        "clot",
        "course",
        "lapse",
        "well",
        "schisto",
        "cirr",
        "sos",
        "slide",
        "decomp",
        "inflow",
        "b-tips",
        "c-tips",
        "scar",
        "csph",
        "drug",
        "hvpg",
        "preg"
      ]
    ],
    [
      "Card and panels",
      [
        "d-start",
        "d-carv",
        "d-tips",
        "rule",
        "table",
        "comp",
        "e-csph",
        "worse",
        "plane",
        "levels",
        "pv-waves",
        "hv-waves"
      ]
    ],
    [
      "Instruments",
      [
        "g-clot",
        "anticoag",
        "g-stent",
        "jet",
        "reverse",
        "pulse",
        "pair",
        "plain",
        "healthy",
        "fill",
        "diuretics",
        "g-schisto"
      ]
    ]
  ],
  "slides": [
    {
      "id": "sources",
      "preset": "csph",
      "cam": "fit",
      "terms": [
        "bowel",
        "colon",
        "spleen"
      ],
      "data": "tiles",
      "tiles": [
        "pv",
        "spleen"
      ],
      "kicker": "Organs",
      "title": "Portal blood comes from the gut and spleen",
      "line": "The small bowel, the colon and the spleen drain into the portal vein, so their blood passes through the liver before it reaches the heart. The portal pressure is {pv}."
    },
    {
      "id": "fundal",
      "preset": "gastric-varix",
      "cam": "fundus",
      "terms": [
        "kidney",
        "gv"
      ],
      "glow": [
        "@gastrorenal"
      ],
      "data": "tiles",
      "tiles": [
        "gv",
        "varix"
      ],
      "key": [
        "gv"
      ],
      "kicker": "Organs",
      "title": "Fundal varices drain to the left renal vein",
      "line": "Fundal varices sit in the upper stomach. A gastrorenal shunt carries their blood down behind the stomach to the vein of the left kidney."
    },
    {
      "id": "eso",
      "preset": "cirr-decomp",
      "cam": "gej",
      "glow": [
        "@esophageal"
      ],
      "data": "tiles",
      "tiles": [
        "varix",
        "hvpg"
      ],
      "key": [
        "varix"
      ],
      "kicker": "Organs",
      "title": "Esophageal varices run up the lower esophagus",
      "line": "The left gastric vein carries portal blood up into the lower esophagus, where varices form under its lining and drain to the azygos vein."
    },
    {
      "id": "spot",
      "preset": "cirr-hepatofugal",
      "cam": "fit",
      "spot": [
        "@collaterals",
        "@shunts",
        "spleen"
      ],
      "data": "tiles",
      "tiles": [
        "shunt",
        "pv"
      ],
      "key": [
        "shunt"
      ],
      "compare": [
        {
          "label": "Pressure",
          "lens": "pressure",
          "own": true
        },
        {
          "label": "Vein system",
          "lens": "system"
        }
      ],
      "kicker": "Systems",
      "title": "Collaterals carry gut blood around a scarred liver",
      "line": "The rest of the figure steps back so the collaterals and the spleen stand out. The buttons switch the colours and the spotlight stays. {shunt} of the portal blood bypasses the liver."
    },
    {
      "id": "system",
      "lens": "system",
      "cam": "fit",
      "glow": [
        {
          "id": "@collaterals",
          "soft": true
        }
      ],
      "kicker": "Systems",
      "title": "Collaterals join the portal and systemic veins",
      "line": "Colored by vein system, portal veins take the portal vein's color, systemic veins the IVC's, and the shunts between them the varices' color."
    },
    {
      "id": "normal",
      "preset": "healthy",
      "cam": "splenic",
      "terms": [
        "spleen"
      ],
      "normalOutline": [
        "spleen"
      ],
      "data": "tiles",
      "tiles": [
        "spleen",
        "plt"
      ],
      "key": [
        "spleen"
      ],
      "kicker": "Spleen",
      "title": "A normal spleen",
      "line": "The spleen is {spleen} long. At its normal size the outline of a normal spleen stays hidden."
    },
    {
      "id": "grown",
      "days": 730,
      "ramp": {
        "cirrhosis": [
          0,
          0.6
        ]
      },
      "lapse": {
        "seconds": 10,
        "from": "Healthy",
        "to": "Cirrhosis"
      },
      "cam": "splenic",
      "terms": [
        "spleen"
      ],
      "normalOutline": [
        "spleen"
      ],
      "ripple": true,
      "data": "tiles",
      "tiles": [
        "pv",
        "spleen",
        "plt"
      ],
      "key": [
        "spleen"
      ],
      "delta": "normal",
      "kicker": "Spleen",
      "title": "The spleen grows past its normal outline",
      "line": "As the portal pressure rises to {pv}, the spleen grows to {spleen}. The dashed line keeps the normal spleen's size. When the days end, the vessels whose pressure rose glow warm."
    },
    {
      "id": "pre",
      "tick": "No Rx",
      "preset": "csph",
      "cam": "route",
      "terms": [
        "pv"
      ],
      "data": "ladder",
      "key": [
        "pv",
        "ppg"
      ],
      "kicker": "Treatment",
      "title": "Before treatment",
      "line": "Clinically significant portal hypertension: the [portal vein](pv) pressure is {pv} and the PPG is {ppg}."
    },
    {
      "id": "tips",
      "params": {
        "tips": {
          "on": true
        }
      },
      "ripple": true,
      "lens": "since",
      "sinceLabel": "pre-TIPS",
      "cam": "route",
      "mark": {
        "edges": [
          "TIPS"
        ],
        "label": "Covered stent",
        "kind": "treat"
      },
      "data": "ladder",
      "key": [
        "pv",
        "ppg"
      ],
      "whatIf": {
        "label": "Stent width",
        "param": "tips.d",
        "min": 6,
        "max": 10,
        "step": 0.5,
        "unit": "mm"
      },
      "kicker": "Treatment",
      "title": "TIPS lowers the portal pressure",
      "line": "As the slide lands, the veins whose pressure fell glow cool. Colored by change vs pre-TIPS, the portal veins turn blue. The PPG falls to {ppg}."
    },
    {
      "id": "carv",
      "params": {
        "tips": {
          "on": false
        },
        "drugs": {
          "carvedilol": true
        }
      },
      "lens": "since",
      "since": "pre",
      "sinceLabel": "no Rx",
      "cam": "route",
      "data": "tiles",
      "tiles": [
        "pv",
        "ppg"
      ],
      "key": [
        "pv"
      ],
      "delta": "pre",
      "compare": [
        {
          "label": "TIPS",
          "params": {
            "tips": {
              "on": true
            },
            "drugs": {
              "carvedilol": false
            }
          }
        },
        {
          "label": "Carvedilol",
          "own": true,
          "params": {
            "tips": {
              "on": false
            },
            "drugs": {
              "carvedilol": true
            }
          }
        }
      ],
      "kicker": "Treatment",
      "title": "Carvedilol against TIPS, from the same start",
      "line": "Both buttons color the change since the slide before treatment, so the two can be compared on one scale. On carvedilol the portal pressure is {pv}."
    },
    {
      "id": "start",
      "tick": "Diagnosis",
      "milestone": "Dx",
      "preset": "cirr-comp",
      "params": {
        "cirrhosis": 0.5
      },
      "cam": "fit",
      "data": "tiles",
      "tiles": [
        "hvpg"
      ],
      "kicker": "Treatment bands",
      "site": "sin",
      "title": "A year of cirrhosis, to be charted",
      "line": "The next slides move one patient on through a year, start carvedilol, then add anticoagulation, and end on a chart of every step. The profile and the portal blood bar follow."
    },
    {
      "id": "m6",
      "tick": "Six months",
      "when": "Month 6",
      "days": 180,
      "ramp": {
        "cirrhosis": [
          0.5,
          0.58
        ]
      },
      "cam": "fit",
      "data": "tiles",
      "tiles": [
        "hvpg"
      ],
      "delta": "start",
      "kicker": "Treatment bands",
      "site": "sin",
      "title": "Six months on, the gradient has risen",
      "line": "The HVPG is now {hvpg}."
    },
    {
      "id": "b-carv",
      "tick": "Carvedilol",
      "milestone": "Carvedilol",
      "when": "On carvedilol",
      "params": {
        "drugs": {
          "carvedilol": true
        }
      },
      "cam": "fit",
      "data": "tiles",
      "tiles": [
        "hvpg",
        "hr"
      ],
      "delta": "m6",
      "kicker": "Treatment bands",
      "site": "sin",
      "title": "Carvedilol is started",
      "line": "On carvedilol the HVPG is {hvpg}."
    },
    {
      "id": "m12",
      "tick": "A year",
      "when": "Month 12",
      "days": 180,
      "ramp": {
        "cirrhosis": [
          0.58,
          0.62
        ]
      },
      "cam": "fit",
      "data": "tiles",
      "tiles": [
        "hvpg"
      ],
      "delta": "b-carv",
      "kicker": "Treatment bands",
      "site": "sin",
      "title": "A year on, still on carvedilol",
      "line": "The HVPG is {hvpg}."
    },
    {
      "id": "clot",
      "tick": "Clot, anticoagulation",
      "milestone": "Clot",
      "when": "Month 12",
      "days": 7,
      "params": {
        "thrombus": {
          "PV_TRUNK": 0.5
        },
        "anticoag": true
      },
      "cam": "portal",
      "data": "tiles",
      "tiles": [
        "pv",
        "hvpg"
      ],
      "kicker": "Treatment bands",
      "site": "pre",
      "title": "A partial portal vein clot, anticoagulated",
      "line": "A partial clot raises the portal pressure to {pv} while the HVPG stays {hvpg}."
    },
    {
      "id": "course",
      "cam": "fit",
      "tool": {
        "kind": "trace",
        "range": "talk",
        "title": "The year on one chart",
        "style": "milestones",
        "bands": [
          "carvedilol",
          "anticoag"
        ]
      },
      "kicker": "Treatment bands",
      "site": "sin",
      "title": "Each treatment is shaded while it was on",
      "line": "Only the HVPG is drawn, in its cut-off colour. The milestones are named above it and the bands mark carvedilol and anticoagulation, so each change lines up with what caused it.",
      "notes": "style: 'milestones' on a trace tool: the HVPG line alone, the slides marked milestone (Dx, Carvedilol, Clot) named over it, the bands beneath."
    },
    {
      "id": "lapse",
      "days": 180,
      "ramp": {
        "cirrhosis": [
          0.62,
          0.7
        ]
      },
      "lapse": {
        "seconds": 8
      },
      "cam": "fit",
      "tool": {
        "kind": "flowtime",
        "clock": "days",
        "lines": [
          "hvpg",
          "varix"
        ],
        "title": "HVPG and varix over six months",
        "bands": [
          "carvedilol",
          "anticoag"
        ]
      },
      "data": "tiles",
      "tiles": [
        "hvpg",
        "varix"
      ],
      "delta": true,
      "kicker": "Treatment bands",
      "site": "sin",
      "title": "The time-lapse runs on carvedilol and anticoagulation",
      "line": "Anticoagulation dissolves the clot over the first months, so the varix shrinks. Carvedilol stays on, but the cirrhosis keeps advancing: the HVPG climbs to {hvpg} and the varix grows back. The HVPG never dips, because the clot sits before the liver.",
      "notes": "bands on a flowtime tool: each treatment on in the slide's state gets a named bar under the clock, over the whole time-lapse. The clot slide before runs a week, so the varix has caught up with the clot by day 0 and the chart starts settled."
    },
    {
      "id": "well",
      "preset": "healthy",
      "cam": "fit",
      "tool": {
        "kind": "profile"
      },
      "data": "tiles",
      "tiles": [
        "hvpg",
        "ppg"
      ],
      "kicker": "Pressure profile",
      "site": "sin",
      "title": "In health the pressure falls gently from gut to heart",
      "line": "The line runs through eight stations, from the gut to the right atrium. With no added resistance it falls only a little between the portal vein and the heart, and the HVPG is {hvpg}.",
      "notes": "tool kind profile. The chart reads the slide's own numbers, the same as its tiles. The dashed line is the healthy state; here the two lie on top of each other."
    },
    {
      "id": "schisto",
      "tick": "Schistosomiasis",
      "preset": "schisto",
      "cam": "liver",
      "tool": {
        "kind": "profile"
      },
      "data": "tiles",
      "tiles": [
        "pv",
        "hvpg"
      ],
      "kicker": "Pressure profile",
      "site": "presin",
      "title": "Presinusoidal resistance: the drop sits before the sinusoids",
      "line": "The steep fall is between the portal venule and the sinusoids. The sinusoids sit low on the line, so the wedged pressure and the HVPG of {hvpg} stay near normal.",
      "notes": "Where the line drops steeply is where the resistance is. The HVPG bracket under the names runs from the sinusoids, which the wedged pressure reads, to the free hepatic vein pressure."
    },
    {
      "id": "cirr",
      "tick": "Cirrhosis",
      "preset": "csph",
      "cam": "liver",
      "tool": {
        "kind": "profile",
        "from": true
      },
      "data": "tiles",
      "tiles": [
        "pv",
        "hvpg"
      ],
      "kicker": "Pressure profile",
      "site": "sin",
      "title": "Sinusoidal resistance: the drop moves into the sinusoids",
      "line": "In cirrhosis the pressure is lost across the sinusoids themselves, so the wedged pressure rises with the portal pressure and the HVPG reads {hvpg}.",
      "notes": "from: true draws the slide before (schistosomiasis) as a dotted line."
    },
    {
      "id": "sos",
      "tick": "Sinusoidal obstruction syndrome",
      "preset": "sos",
      "cam": "liver",
      "tool": {
        "kind": "profile",
        "from": "cirr"
      },
      "data": "tiles",
      "tiles": [
        "pv",
        "hvpg"
      ],
      "kicker": "Pressure profile",
      "site": "postsin",
      "title": "Postsinusoidal resistance: the drop sits after the sinusoids",
      "line": "In sinusoidal obstruction syndrome the steep fall is between the central vein and the hepatic vein. The sinusoids sit high on the line, and the HVPG is {hvpg}.",
      "notes": "from: 'cirr' compares with a named slide instead of the one before."
    },
    {
      "id": "slide",
      "preset": "cirr-comp",
      "cam": "liver",
      "whatIf": {
        "label": "Scarring",
        "param": "cirrhosis",
        "min": 0,
        "max": 1,
        "step": 0.05,
        "ends": [
          "None",
          "Severe"
        ]
      },
      "tool": {
        "kind": "profile"
      },
      "data": "tiles",
      "tiles": [
        "hvpg",
        "ppg"
      ],
      "kicker": "Pressure profile",
      "site": "sin",
      "title": "Drag the scarring and watch the drop grow",
      "line": "Moving the slider changes the live model. The line, its brackets and the tiles ease together to the new pressures.",
      "notes": "whatIf with a profile tool: the chart follows the slider, as the tiles do."
    },
    {
      "id": "decomp",
      "tick": "Decompensated",
      "preset": "cirr-decomp",
      "cam": "fit",
      "tool": {
        "kind": "flows"
      },
      "data": "tiles",
      "tiles": [
        "shunt",
        "ppg"
      ],
      "kicker": "Where the portal blood goes",
      "site": "sin",
      "title": "In decompensated cirrhosis part of the portal blood bypasses the liver",
      "line": "The bar splits the portal blood by where it leaves: through the liver or around it. {shunt} of it reaches the systemic veins without passing the sinusoids.",
      "notes": "tool kind flows. The liver part is always 100 less the Shunted tile on the same slide."
    },
    {
      "id": "inflow",
      "preset": "cirr-decomp",
      "cam": "liver",
      "tool": {
        "kind": "flows",
        "of": "inflow"
      },
      "data": "tiles",
      "tiles": [
        "liver"
      ],
      "kicker": "Blood into the liver",
      "site": "sin",
      "title": "Here the hepatic artery brings more of the liver's inflow",
      "line": "This bar shows the same patient's blood reaching the sinusoids, split into portal and hepatic artery blood. With most of the portal blood going around the liver, the artery brings the larger part.",
      "notes": "of: 'inflow' splits the liver's inflow instead of the portal blood."
    },
    {
      "id": "b-tips",
      "tick": "TIPS",
      "params": {
        "tips": {
          "on": true,
          "d": 10
        }
      },
      "cam": "fit",
      "tool": {
        "kind": "flows"
      },
      "data": "tiles",
      "tiles": [
        "shunt",
        "ppg"
      ],
      "compare": [
        {
          "label": "No TIPS",
          "short": "None",
          "params": {
            "tips": {
              "on": false
            }
          }
        },
        {
          "label": "TIPS, 10 mm",
          "short": "TIPS",
          "own": true
        }
      ],
      "kicker": "Where the portal blood goes",
      "site": "sin",
      "title": "A TIPS takes most of the portal blood",
      "line": "With the stent open, the TIPS part of the bar grows and the liver part shrinks. Switch between the buttons to see the split move.",
      "notes": "compare buttons with a flows tool: the bar eases to each option's split."
    },
    {
      "id": "c-tips",
      "preset": "cirr-decomp",
      "params": {
        "tips": {
          "on": true,
          "d": 8
        }
      },
      "cam": "liver",
      "mark": {
        "edges": [
          "TIPS"
        ],
        "label": "Covered stent",
        "kind": "treat"
      },
      "tool": {
        "kind": "curve",
        "param": "tips.d",
        "from": 6,
        "to": 12,
        "step": 1,
        "lines": [
          "ppg",
          "liver"
        ]
      },
      "data": "tiles",
      "tiles": [
        "ppg",
        "liver"
      ],
      "key": [
        "ppg"
      ],
      "whatIf": {
        "label": "Stent diameter",
        "param": "tips.d",
        "min": 6,
        "max": 12,
        "step": 1,
        "unit": "mm"
      },
      "kicker": "Parameter curve",
      "title": "A wider stent lowers the PPG and takes blood from the liver",
      "line": "Each point is this patient with only the stent diameter changed. At 8 mm the PPG is {ppg} and the liver gets {liver} of its normal flow. Drag the slider and the rings follow the lines."
    },
    {
      "id": "scar",
      "preset": "healthy",
      "params": {
        "cirrhosis": 0.6
      },
      "cam": "fit",
      "glow": [
        "liver"
      ],
      "tool": {
        "kind": "curve",
        "param": "cirrhosis",
        "from": 0,
        "to": 0.9,
        "step": 0.1,
        "lines": [
          "hvpg"
        ]
      },
      "whatIf": {
        "label": "Scarring",
        "param": "cirrhosis",
        "min": 0,
        "max": 0.9,
        "step": 0.05,
        "ends": [
          "None",
          "Severe"
        ]
      },
      "kicker": "Parameter curve",
      "title": "The same scarring step adds more pressure late than early",
      "line": "This curve shows the HVPG as the scarring rises, with its cut-offs behind it. This case sits at an HVPG of {hvpg}."
    },
    {
      "id": "csph",
      "preset": "csph",
      "cam": "fit",
      "glow": [
        "liver"
      ],
      "tool": {
        "kind": "curve",
        "param": "cirrhosis",
        "from": 0,
        "to": 0.95,
        "step": 0.05,
        "lines": [
          "ppg"
        ],
        "against": {
          "label": "Carvedilol",
          "params": {
            "drugs": {
              "carvedilol": true
            }
          },
          "own": "No drug"
        }
      },
      "data": "tiles",
      "tiles": [
        "ppg"
      ],
      "key": [
        "ppg"
      ],
      "kicker": "Drug curve",
      "title": "Carvedilol lowers the whole PPG curve",
      "line": "Each line shows the PPG in the model as the scarring rises, without a drug and with carvedilol. The rings mark this case at 60 % scarring, with a PPG of {ppg}. A dot marks where each line crosses 12."
    },
    {
      "id": "drug",
      "preset": "cirr-decomp",
      "cam": "fit",
      "glow": [
        "liver"
      ],
      "tool": {
        "kind": "curve",
        "param": "cirrhosis",
        "from": 0,
        "to": 0.95,
        "step": 0.05,
        "lines": [
          "ppg"
        ],
        "against": {
          "label": "Carvedilol",
          "params": {
            "drugs": {
              "carvedilol": true
            }
          },
          "own": "No drug"
        }
      },
      "data": "tiles",
      "tiles": [
        "ppg"
      ],
      "key": [
        "ppg"
      ],
      "whatIf": {
        "label": "Scarring",
        "param": "cirrhosis",
        "min": 0.4,
        "max": 0.95,
        "step": 0.05,
        "ends": [
          "Less",
          "More"
        ]
      },
      "kicker": "Drug curve",
      "title": "With carvedilol the PPG crosses 12 later",
      "line": "This case has decompensated cirrhosis. Drag the scarring and follow both rings: with carvedilol, the PPG reaches 12 only at more scarring. The PPG is {ppg}."
    },
    {
      "id": "hvpg",
      "cam": "fit",
      "glow": [
        "liver"
      ],
      "tool": {
        "kind": "curve",
        "param": "cirrhosis",
        "from": 0,
        "to": 0.95,
        "step": 0.05,
        "lines": [
          "hvpg"
        ],
        "against": {
          "label": "Carvedilol",
          "params": {
            "drugs": {
              "carvedilol": true
            }
          },
          "own": "No drug"
        }
      },
      "data": "tiles",
      "tiles": [
        "hvpg"
      ],
      "key": [
        "hvpg"
      ],
      "whatIf": {
        "label": "Scarring",
        "param": "cirrhosis",
        "min": 0.4,
        "max": 0.95,
        "step": 0.05,
        "ends": [
          "Less",
          "More"
        ]
      },
      "kicker": "Drug curve",
      "title": "The same curves for the HVPG",
      "line": "The HVPG follows the same pattern in this patient. Drag the scarring and watch where each line crosses 10. The HVPG is {hvpg}."
    },
    {
      "id": "preg",
      "preset": "pregnancy",
      "cam": "fit",
      "glow": [
        "liver"
      ],
      "tool": {
        "kind": "curve",
        "param": "gestation",
        "from": 0,
        "to": 40,
        "step": 4,
        "lines": [
          "ppg",
          "bv"
        ]
      },
      "data": "tiles",
      "tiles": [
        "ppg",
        "bv"
      ],
      "key": [
        "ppg"
      ],
      "whatIf": {
        "label": "Weeks pregnant",
        "param": "gestation",
        "min": 0,
        "max": 40,
        "step": 1,
        "unit": "weeks"
      },
      "kicker": "Parameter curve",
      "title": "Pregnancy fills the circulation",
      "line": "This curve shows the PPG and the blood volume across the weeks of pregnancy in cirrhosis. At 24 weeks the PPG is {ppg}."
    },
    {
      "id": "d-start",
      "preset": "cirr-decomp",
      "cam": "route",
      "labels": [
        "CONF",
        "SIN_R",
        "RHV",
        "RA"
      ],
      "data": "ladder",
      "key": [
        "whvp",
        "fhvp",
        "hvpg"
      ],
      "kicker": "Before treatment",
      "site": "sin",
      "title": "Decompensated cirrhosis, no treatment",
      "eq": [
        "<mi>HVPG</mi><mo>=</mo><mi class=\"eq-wedge\">WHVP</mi><mo>−</mo><mi class=\"eq-hv\">FHVP</mi>"
      ],
      "line": "The wedged pressure less the free pressure gives an HVPG of {hvpg}: clinically significant portal hypertension.",
      "notes": "The slide the next two compare with."
    },
    {
      "id": "d-carv",
      "params": {
        "drugs": {
          "propranolol": false,
          "carvedilol": true,
          "octreotide": false,
          "terlipressin": false
        }
      },
      "cam": "liver",
      "glow": [
        "liver"
      ],
      "data": "ladder",
      "key": [
        "whvp",
        "hvpg"
      ],
      "delta": "d-start",
      "ladderFrom": "d-start",
      "ladderFromLabel": "No Rx",
      "compare": [
        {
          "label": "Propranolol",
          "params": {
            "drugs": {
              "propranolol": true,
              "carvedilol": false,
              "octreotide": false,
              "terlipressin": false
            }
          }
        },
        {
          "label": "Carvedilol",
          "own": true,
          "params": {
            "drugs": {
              "propranolol": false,
              "carvedilol": true,
              "octreotide": false,
              "terlipressin": false
            }
          }
        }
      ],
      "kicker": "V24 · The earlier state on the ladder",
      "site": "sin",
      "title": "A beta blocker lowers the wedged pressure",
      "line": "Here the HVPG is {hvpg}. Switch between the two drugs and the ladder moves.",
      "notes": "ladderFrom: 'start' (a slide id; true means the slide before) draws that slide's readings as a grey solid line behind the patient's; ladderFromLabel names it in the legend (default \"Before\"). The healthy line stays dashed. Mac and iPad: a phone shows the compact strip, which draws no lines."
    },
    {
      "id": "d-tips",
      "params": {
        "tips": {
          "on": true
        },
        "drugs": {
          "propranolol": false,
          "carvedilol": false,
          "octreotide": false,
          "terlipressin": false
        }
      },
      "cam": "liver",
      "terms": {
        "portal vein": "pv"
      },
      "mark": {
        "edges": [
          "TIPS"
        ],
        "label": "Covered stent",
        "kind": "treat"
      },
      "data": "ladder",
      "key": [
        "pv",
        "ppg"
      ],
      "delta": "d-start",
      "ladderFrom": "d-start",
      "ladderFromLabel": "No Rx",
      "kicker": "V23 · A source line",
      "site": "sin",
      "title": "TIPS lowers the gradient by bypassing the liver",
      "line": "With the stent the PPG falls to {ppg}. After a variceal bleed, high-risk patients (Child–Pugh C 10 to 13, or B over 7 with active bleeding) get a pre-emptive TIPS within 72 hours.",
      "cite": "Baveno VIII 5.31",
      "notes": "cite prints one line under the words and any caveat, and in the handout. Baveno VIII 5.31: pre-emptive TIPS criteria, confirmed in guidelines/baveno8-aasld.md."
    },
    {
      "id": "rule",
      "visual": "scale",
      "scale": {
        "key": "lsm",
        "max": 40,
        "low": "No CSPH",
        "marks": [
          [
            15,
            "Indeterminate"
          ],
          [
            25,
            "CSPH"
          ]
        ],
        "sub": [
          "hvpg",
          "plt"
        ],
        "rules": [
          "If platelets are 150 or more",
          "Low platelets point to CSPH",
          "Whatever the platelets"
        ]
      },
      "of": [
        {
          "preset": "healthy",
          "name": "Healthy"
        },
        {
          "preset": "cirr-comp",
          "name": "Compensated cirrhosis"
        },
        {
          "preset": "csph",
          "name": "Compensated, CSPH by HVPG"
        },
        {
          "preset": "csph",
          "params": {
            "cirrhosis": 0.75
          },
          "name": "Compensated, CSPH"
        }
      ],
      "kicker": "V23 · A source line on a panel",
      "title": "Stiffness and platelets rule CSPH in or out",
      "line": "25 kPa or more means CSPH in viral, alcohol-related and non-obese MASLD cirrhosis; 15 or less with platelets of 150 or more rules it out.",
      "cite": "Baveno VIII 1.15, 1.16",
      "notes": "A panel slide prints its source line under its words too."
    },
    {
      "id": "table",
      "visual": "table",
      "cols": [
        "hvpg",
        "ppg",
        "varix",
        "liver"
      ],
      "asc": false,
      "vs": "first",
      "focusRow": "d-tips",
      "rowHead": "Treatment",
      "of": [
        {
          "id": "d-start",
          "kicker": "Baseline",
          "title": "No Rx"
        },
        {
          "id": "d-carv",
          "kicker": "Drug",
          "title": "Carvedilol"
        },
        {
          "id": "d-tips",
          "kicker": "Shunt",
          "title": "TIPS"
        }
      ],
      "kicker": "V15 · One row in focus",
      "title": "Each treatment against no treatment",
      "line": "The arrows read each treatment against no treatment. The TIPS row is in focus.",
      "notes": "focusRow lights one row (a slide id or a row key); the other rows recede."
    },
    {
      "id": "comp",
      "preset": "cirr-comp",
      "cam": "liver",
      "glow": [
        "liver"
      ],
      "tool": {
        "kind": "plane",
        "plane": "csph"
      },
      "key": [
        "lsm"
      ],
      "compare": [
        {
          "label": "This patient",
          "own": true
        },
        {
          "label": "With CSPH",
          "preset": "csph",
          "params": {
            "cirrhosis": 0.75
          }
        }
      ],
      "kicker": "Two readings on one plane",
      "site": "sin",
      "title": "Stiffness and platelets place the patient",
      "line": "The dot marks this patient on stiffness and platelets, and the line under the plane gives both readings. Tap With CSPH and the dot moves into the CSPH zone."
    },
    {
      "id": "e-csph",
      "preset": "csph",
      "cam": "liver",
      "glow": [
        "liver"
      ],
      "tool": {
        "kind": "plane",
        "plane": "csph"
      },
      "kicker": "Two readings on one plane",
      "site": "sin",
      "title": "The Indeterminate zone needs a scope",
      "line": "At a stiffness of {lsm} with platelets of {plt}, CSPH is neither ruled in nor ruled out. In this model, without spleen stiffness, the scope is spared below 20 kPa with platelets of 150,000 or more, so this patient needs one unless on a beta-blocker."
    },
    {
      "id": "worse",
      "days": 180,
      "ramp": {
        "cirrhosis": [
          0.6,
          0.75
        ]
      },
      "lapse": {
        "seconds": 6,
        "from": "Now",
        "to": "Six months on"
      },
      "cam": "liver",
      "glow": [
        "liver"
      ],
      "tool": {
        "kind": "plane",
        "plane": "csph"
      },
      "data": "tiles",
      "tiles": [
        "lsm",
        "plt",
        "hvpg"
      ],
      "key": [
        "lsm"
      ],
      "delta": true,
      "kicker": "Two readings on one plane",
      "site": "sin",
      "title": "The dot crosses into CSPH",
      "line": "As the scarring advances, stiffness passes 25 kPa. Baveno VIII then rules CSPH in, outside obese MASLD."
    },
    {
      "id": "plane",
      "visual": "plane",
      "plane": "csph",
      "of": [
        {
          "preset": "healthy",
          "name": "Healthy"
        },
        {
          "id": "comp",
          "name": "Compensated, no CSPH",
          "short": "No CSPH"
        },
        {
          "id": "e-csph",
          "name": "Between the cut-offs",
          "short": "Undecided"
        },
        {
          "id": "worse",
          "name": "Six months on",
          "short": "6 months"
        }
      ],
      "kicker": "Baveno VIII",
      "title": "Stiffness and platelets rule CSPH in or out",
      "line": "15 kPa or less with platelets of 150 or more rules CSPH out. 25 kPa or more rules it in. Under 20 kPa with platelets of 150 or more spares the screening scope."
    },
    {
      "id": "levels",
      "visual": "plane",
      "plane": "hvpg-ppg",
      "of": [
        {
          "preset": "healthy",
          "name": "Healthy"
        },
        {
          "preset": "pvt-chronic",
          "name": "Portal vein thrombosis",
          "short": "PVT",
          "site": "pre"
        },
        {
          "preset": "schisto",
          "name": "Schistosomiasis",
          "site": "presin"
        },
        {
          "preset": "cirr-decomp",
          "name": "Cirrhosis",
          "site": "sin"
        },
        {
          "preset": "budd-chiari",
          "name": "Budd–Chiari",
          "site": "post"
        },
        {
          "preset": "rhf",
          "name": "Heart failure",
          "site": "cardiac"
        }
      ],
      "kicker": "HVPG against PPG",
      "title": "The PPG finds resistance the HVPG misses",
      "line": "Resistance before the sinusoids or in the hepatic veins raises the PPG and leaves the HVPG normal. Cirrhosis raises both."
    },
    {
      "id": "pv-waves",
      "visual": "table",
      "cols": [
        "pvFlow",
        "wave"
      ],
      "wave": "PV_TRUNK",
      "asc": false,
      "rowHead": "Patient",
      "of": [
        {
          "preset": "healthy",
          "kicker": "Reference",
          "title": "Healthy",
          "ref": true
        },
        {
          "preset": "cirr-decomp",
          "kicker": "Sinusoidal",
          "title": "Cirrhosis",
          "site": "sin"
        },
        {
          "preset": "cirr-hepatofugal",
          "kicker": "Sinusoidal",
          "title": "Advanced cirrhosis",
          "site": "sin"
        },
        {
          "preset": "pvt-acute",
          "kicker": "Pre-hepatic",
          "title": "Portal vein thrombosis",
          "site": "pre"
        },
        {
          "preset": "rhf",
          "kicker": "Cardiac",
          "title": "Right heart failure",
          "site": "cardiac"
        },
        {
          "preset": "cirr-decomp",
          "params": {
            "tips": {
              "on": true
            }
          },
          "kicker": "Treatment",
          "title": "TIPS, in the stent",
          "wave": "TIPS"
        }
      ],
      "kicker": "Small Doppler traces",
      "title": "Portal vein patterns at a glance",
      "line": "Steady toward the liver when healthy, slow in cirrhosis, reversed when advanced, absent with a clot and pulsatile in heart failure. The stent carries a fast jet."
    },
    {
      "id": "hv-waves",
      "visual": "table",
      "cols": [
        "fhvp",
        "wave"
      ],
      "wave": "RHV_IVC",
      "asc": false,
      "rowHead": "Patient",
      "of": [
        {
          "preset": "healthy",
          "kicker": "Reference",
          "title": "Healthy",
          "ref": true
        },
        {
          "preset": "cirr-decomp",
          "kicker": "Sinusoidal",
          "title": "Cirrhosis",
          "site": "sin"
        },
        {
          "preset": "budd-chiari",
          "kicker": "Post-hepatic",
          "title": "Budd–Chiari",
          "site": "post"
        },
        {
          "preset": "rhf",
          "kicker": "Cardiac",
          "title": "Right heart failure",
          "site": "cardiac"
        }
      ],
      "kicker": "Small Doppler traces",
      "title": "Hepatic vein patterns at a glance",
      "line": "Forward flow to the heart sits below the line. A clot leaves no signal, and a failing right heart drives flow back with each beat."
    },
    {
      "id": "live",
      "preset": "csph",
      "cam": "fit",
      "data": "tiles",
      "tiles": [
        "pv",
        "spleen"
      ],
      "marks": [
        {
          "edges": [
            "C1a"
          ],
          "label": "Varix {varix}",
          "kind": "note"
        },
        {
          "organ": "spleen",
          "label": "Spleen {spleen}"
        }
      ],
      "whatIf": {
        "label": "Scarring",
        "param": "cirrhosis",
        "min": 0.3,
        "max": 1,
        "step": 0.05,
        "ends": [
          "Mild",
          "Severe"
        ]
      },
      "kicker": "Marks",
      "title": "The marks read the model as it changes",
      "line": "Each mark names its reading in its rating colour. Move the slider and the varix mark follows the scarring as the model changes."
    },
    {
      "id": "belly",
      "preset": "cirr-decomp",
      "cam": "fit",
      "data": "tiles",
      "tiles": [
        "asc",
        "saag"
      ],
      "mark": {
        "organ": "ascites",
        "label": "Ascites {asc}"
      },
      "kicker": "Marks",
      "title": "A mark can point at an organ or the ascites",
      "line": "Decompensated cirrhosis: {asc} of ascites has collected in the abdomen, with a SAAG of {saag}."
    },
    {
      "id": "spleen",
      "preset": "healthy",
      "cam": "splenic",
      "terms": [
        "spleen"
      ],
      "calipers": [
        "spleen"
      ],
      "data": "tiles",
      "tiles": [
        "spleen",
        "plt"
      ],
      "key": [
        "spleen"
      ],
      "kicker": "Calipers",
      "title": "A normal spleen",
      "line": "Measured along its long axis, the spleen is {spleen} long."
    },
    {
      "id": "f-grown",
      "days": 730,
      "ramp": {
        "cirrhosis": [
          0,
          0.6
        ]
      },
      "lapse": {
        "seconds": 10,
        "from": "Healthy",
        "to": "Cirrhosis"
      },
      "cam": "splenic",
      "terms": [
        "spleen"
      ],
      "calipers": [
        "spleen"
      ],
      "data": "tiles",
      "tiles": [
        "pv",
        "spleen",
        "plt"
      ],
      "key": [
        "spleen"
      ],
      "delta": "spleen",
      "kicker": "Calipers",
      "title": "The spleen grows with the portal pressure",
      "line": "As the portal pressure rises to {pv}, the caliper follows the spleen to {spleen}."
    },
    {
      "id": "varix",
      "preset": "cirr-decomp",
      "cam": "gej",
      "calipers": [
        "varix"
      ],
      "data": "tiles",
      "tiles": [
        "varix",
        "hvpg"
      ],
      "key": [
        "varix"
      ],
      "kicker": "Calipers",
      "title": "Varix size predicts the first bleed",
      "line": "The esophageal varix measures {varix} across."
    },
    {
      "id": "stent",
      "preset": "cirr-decomp",
      "params": {
        "tips": {
          "on": true,
          "d": 8
        }
      },
      "cam": "route",
      "calipers": [
        "TIPS"
      ],
      "data": "tiles",
      "tiles": [
        "ppg",
        "shunt"
      ],
      "key": [
        "ppg"
      ],
      "compare": [
        {
          "label": "8 mm",
          "own": true,
          "params": {
            "tips": {
              "on": true,
              "d": 8
            }
          }
        },
        {
          "label": "12 mm",
          "params": {
            "tips": {
              "on": true,
              "d": 12
            }
          }
        }
      ],
      "kicker": "Calipers",
      "title": "A wider stent diverts more portal blood",
      "line": "The caliper reads the stent's width. The buttons compare an 8 mm stent with a 12 mm one: with the wider stent more portal blood bypasses the liver."
    },
    {
      "id": "route",
      "preset": "healthy",
      "cam": "fit",
      "glow": [
        "V_INT",
        "PV_TRUNK",
        "SIN_RR",
        "RHV_IVC",
        "IVCS_RA"
      ],
      "glowSeq": 550,
      "steps": true,
      "kicker": "Route",
      "title": "Gut blood crosses two capillary beds in series",
      "line": "Blood that has crossed the gut capillaries gathers in the bowel veins and the portal vein, crosses the sinusoids and leaves through the hepatic veins to the IVC. The numbers keep the order once every vessel is lit."
    },
    {
      "id": "zone",
      "preset": "csph",
      "view": "circuit",
      "zone": "liver",
      "span": [
        {
          "from": "CONF",
          "to": "IVCS",
          "label": "PPG {ppg}"
        }
      ],
      "data": "tiles",
      "tiles": [
        "ppg",
        "hvpg"
      ],
      "kicker": "Circuit",
      "title": "Cirrhosis raises the resistance in the liver",
      "line": "The liver's zone is lit. The bracket spans the gradient from the portal vein to the IVC: the PPG is {ppg}."
    },
    {
      "id": "f-tips",
      "params": {
        "tips": {
          "on": true
        }
      },
      "view": "circuit",
      "zone": "liver",
      "span": [
        {
          "from": "CONF",
          "to": "IVCS",
          "label": "PPG {ppg}"
        }
      ],
      "data": "tiles",
      "tiles": [
        "ppg",
        "pvFlow"
      ],
      "delta": "zone",
      "kicker": "Circuit",
      "title": "TIPS lowers the gradient by bypassing the liver",
      "line": "With the stent in parallel with the liver, the same span now reads a PPG of {ppg}."
    },
    {
      "id": "g-clot",
      "preset": "csph",
      "params": {
        "thrombus": {
          "PV_TRUNK": 0.6
        }
      },
      "cam": "portal",
      "mark": {
        "edges": [
          "PV_TRUNK"
        ],
        "label": "Partial clot"
      },
      "whatIf": {
        "label": "Clot size",
        "param": "thrombus.PV_TRUNK",
        "min": 0,
        "max": 1,
        "step": 0.05,
        "ends": [
          "None",
          "Occlusive"
        ]
      },
      "tool": {
        "kind": "lumen",
        "vessel": "PV_TRUNK"
      },
      "data": "tiles",
      "tiles": [
        "pv"
      ],
      "key": [
        "pv"
      ],
      "kicker": "Cross-section",
      "title": "A partial clot in the portal vein",
      "line": "A small clot lines the lower wall; a larger one fills the lumen from below. The number is the share of the lumen it fills. Move the slider: a complete clot fills it all, and the portal pressure is {pv}."
    },
    {
      "id": "anticoag",
      "params": {
        "anticoag": true
      },
      "days": 180,
      "lapse": {
        "seconds": 8
      },
      "cam": "portal",
      "mark": {
        "edges": [
          "PV_TRUNK"
        ],
        "label": "Portal vein"
      },
      "tool": {
        "kind": "lumen",
        "vessel": "PV_TRUNK"
      },
      "data": "tiles",
      "tiles": [
        "pv"
      ],
      "key": [
        "pv"
      ],
      "delta": "g-clot",
      "kicker": "Cross-section",
      "title": "Months of anticoagulation reopen the vein",
      "line": "Over six months on anticoagulation the clot shrinks until the lumen is open again. The share the clot fills falls day by day, and the portal pressure falls to {pv}."
    },
    {
      "id": "g-stent",
      "preset": "cirr-decomp",
      "params": {
        "tips": {
          "on": true,
          "d": 9
        },
        "stenosis": {
          "TIPS": 0.6
        }
      },
      "cam": "liver",
      "mark": {
        "edges": [
          "TIPS"
        ],
        "label": "Stent",
        "kind": "treat"
      },
      "compare": [
        {
          "label": "Open stent",
          "params": {
            "stenosis": {
              "TIPS": 0
            }
          }
        },
        {
          "label": "Narrowed",
          "own": true,
          "params": {
            "stenosis": {
              "TIPS": 0.6
            }
          }
        }
      ],
      "tool": {
        "kind": "lumen",
        "vessel": "TIPS"
      },
      "data": "tiles",
      "tiles": [
        "ppg"
      ],
      "key": [
        "ppg"
      ],
      "kicker": "Cross-section",
      "title": "Tissue narrows the stent from inside",
      "line": "The dashed ring is the stent. Tissue growing inside it thickens the wall and narrows the lumen, and the portal pressure gradient rises to {ppg}. Switch between the open and the narrowed stent."
    },
    {
      "id": "jet",
      "cam": "liver",
      "mark": {
        "edges": [
          "TIPS"
        ],
        "label": "Narrowing",
        "seg": "site"
      },
      "tool": {
        "kind": "doppler",
        "vessel": "TIPS",
        "gate": "site",
        "mode": "variance"
      },
      "kicker": "Doppler display",
      "title": "Variance shows the jet through the narrowing",
      "line": "In variance mode, flow toward the probe is orange where it is steady and turns toward yellow where it is fast and changing. Sampled at the narrowing, the jet runs so fast that its trace turns from orange toward yellow."
    },
    {
      "id": "reverse",
      "preset": "cirr-hepatofugal",
      "cam": "portal",
      "labels": [
        "CONF"
      ],
      "tool": {
        "kind": "doppler",
        "vessel": "PV_TRUNK",
        "mode": "color"
      },
      "kicker": "Doppler display",
      "title": "Color names the direction of flow",
      "line": "In color mode, flow toward the probe is orange-red and flow away is blue. The portal flow here runs away from the liver, so the spectrum sits below the baseline in blue. Hepatofugal is in red as a warning, not a direction."
    },
    {
      "id": "pulse",
      "preset": "rhf",
      "cam": "route",
      "labels": [
        "CONF",
        "RHV",
        "RA"
      ],
      "tool": {
        "kind": "doppler",
        "vessel": "PV_TRUNK",
        "calipers": true
      },
      "kicker": "Doppler calipers",
      "title": "Calipers measure how much the portal vein pulses",
      "line": "The two marks sit on the highest and lowest velocity of the last three seconds. The pulsatility index is their difference over the larger one, the number the reading uses to call the flow pulsatile."
    },
    {
      "id": "pair",
      "cam": "route",
      "labels": [
        "CONF",
        "RHV",
        "RA"
      ],
      "whatIf": {
        "label": "Tricuspid leak",
        "param": "tr",
        "min": 0,
        "max": 1,
        "step": 0.05,
        "ends": [
          "None",
          "Severe"
        ]
      },
      "tool": {
        "kind": "doppler",
        "vessel": "PV_TRUNK",
        "pair": true,
        "calipers": true
      },
      "kicker": "Paired traces",
      "title": "The portal vein pulses with the hepatic vein",
      "line": "The slim trace under the portal vein is the right hepatic vein over the same seconds. Its waves line up with the portal vein’s pulses. Move the slider to change the tricuspid leak."
    },
    {
      "id": "plain",
      "preset": "healthy",
      "cam": "portal",
      "labels": [
        "CONF"
      ],
      "tool": {
        "kind": "doppler",
        "vessel": "PV_TRUNK"
      },
      "kicker": "Doppler display",
      "title": "A slide that names no option shows the plain spectrum",
      "line": "Without a mode, calipers or a pair, the Doppler is the plain grey spectrum, as on every slide before these options existed."
    },
    {
      "id": "healthy",
      "preset": "healthy",
      "cam": "fit",
      "glow": [
        "liver"
      ],
      "tool": {
        "kind": "fluid"
      },
      "data": "tiles",
      "tiles": [
        "sin",
        "asc"
      ],
      "key": [
        "sin"
      ],
      "kicker": "Fluid balance",
      "title": "In health the lymphatics carry all the lymph",
      "line": "The liver and gut make lymph, and the lymphatics carry it all away. The dashed outline is the room they still have, so no ascites builds."
    },
    {
      "id": "fill",
      "preset": "csph",
      "days": 60,
      "ramp": {
        "cirrhosis": [
          0.6,
          0.85
        ],
        "albumin": [
          4,
          2.8
        ]
      },
      "lapse": {
        "seconds": 9
      },
      "cam": "fit",
      "glow": [
        "liver"
      ],
      "tool": {
        "kind": "fluid",
        "forces": true,
        "caveat": true
      },
      "kicker": "Fluid balance",
      "title": "Ascites builds when the lymph made outruns the lymph drained",
      "line": "Over two months the sinusoidal pressure rises and the albumin falls. The liver makes more lymph than the lymphatics carry, and the overflow, in the ascites color, builds up as {asc} of ascites."
    },
    {
      "id": "diuretics",
      "params": {
        "diuretics": true
      },
      "compare": [
        {
          "label": "No diuretics",
          "params": {
            "diuretics": false
          }
        },
        {
          "label": "Diuretics",
          "own": true,
          "params": {
            "diuretics": true
          }
        }
      ],
      "cam": "fit",
      "glow": [
        "liver"
      ],
      "tool": {
        "kind": "fluid"
      },
      "data": "tiles",
      "tiles": [
        "asc"
      ],
      "key": [
        "asc"
      ],
      "kicker": "Fluid balance",
      "title": "Diuretics raise what the belly takes back",
      "notes": "The model has no kidneys: diuretics act here only on the fluid the belly takes back.",
      "line": "In the model, diuretics add to the fluid the belly takes back, so the drained bar grows past the made bar and the ascites shrinks. The model has no kidneys, so this is its stand-in for what diuretics do through them."
    },
    {
      "id": "g-schisto",
      "preset": "schisto",
      "cam": "fit",
      "glow": [
        "liver"
      ],
      "tool": {
        "kind": "fluid"
      },
      "data": "tiles",
      "tiles": [
        "sin",
        "asc"
      ],
      "key": [
        "sin"
      ],
      "kicker": "Fluid balance",
      "title": "Resistance before the sinusoids spares the lymph balance",
      "line": "The resistance sits in the portal venules, before the sinusoids, so the sinusoidal pressure rises less than in cirrhosis, to {sin}. At that pressure the lymphatics still carry all the lymph the liver and gut make, and no ascites builds."
    }
  ]
};
