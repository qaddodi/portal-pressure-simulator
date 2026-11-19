// The one table of procedure names (play-test and Mohammad's rules, 16 Nov 2026). Every place that names a procedure takes its button label, its full name
// and its spoken line from here, so one procedure never reads three ways ("Band ligation" in Treat, "Band (EVL)" on the Varices card; "Warren shunt" beside
// "Distal splenorenal"; "Play TIPS" and "Play BRTO" with no word of what they are). No imports: the engine's labels and the tests read it too.
//   label  what the button and a history line say (the short, usual name, with the abbreviation a US physician says)
//   long   the full name, in the tooltip and the spoken label
// (The Warren shunt is the distal splenorenal shunt: US physicians say DSRS. The old eponym appears here and nowhere else in the app's words, tests/procedure-names.test.js.)
export const PROCEDURES = Object.freeze({
  band: { label: 'Band (EVL)', long: 'Endoscopic variceal ligation (band ligation)' },
  balloon: { label: 'Balloon tamponade', long: 'Balloon tamponade of bleeding varices' },
  tips: { label: 'TIPS', long: 'Transjugular intrahepatic portosystemic shunt (TIPS)' },
  dips: { label: 'DIPS', long: 'Direct intrahepatic portosystemic shunt (DIPS)' },
  brto: { label: 'BRTO', long: 'Balloon-occluded retrograde transvenous obliteration (BRTO)' },
  bato: { label: 'BATO', long: 'Balloon-occluded antegrade transvenous obliteration (BATO)' },
  dsrs: { label: 'Distal splenorenal shunt (DSRS)', long: 'Distal splenorenal shunt (DSRS), the selective surgical shunt also called the Warren shunt' },
  paracentesis: { label: 'Paracentesis', long: 'Large-volume paracentesis' },
});

/** The button's words for a procedure. */
export const procLabel = (id) => PROCEDURES[id].label;
/** The full name, for a tooltip. */
export const procLong = (id) => PROCEDURES[id].long;
/** The spoken label of a procedure's play button: "Play transjugular intrahepatic portosystemic shunt (TIPS)". */
export const procPlay = (id) => `Play ${PROCEDURES[id].long.replace(/^./, (c) => c.toLowerCase())}`;
