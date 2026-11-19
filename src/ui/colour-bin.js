// The pressure colour's bin: a vessel end is coloured from the mean pressure in 0.5 mmHg steps, so a gradient is not rewritten on every heartbeat
// (stage.js, stage-geohold.js qHold). One definition: the vessel painter and the screen report's figure reader (screen/read-figure.js) both take it from here.
export const COLOUR_BIN = 0.5;
export const qP = (v) => Math.round(v / COLOUR_BIN) * COLOUR_BIN;
