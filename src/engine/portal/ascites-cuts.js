// The ascitic fluid's two cut-offs, in one place (review PC-8, 15 Nov 2026: they were typed in about nine places in three files). No imports,
// so the worker loads it too.
// - SAAG ≥1.1 g/dL reflects portal hypertension, <1.1 excludes it (AASLD 2021 Table 4; also the words of the SAAG slide).
// - Ascitic total protein ≥2.5 g/dL (AASLD 2021 writes ">2.5 g/dL" for a cardiac source) is protein-rich; the model's tile has always
//   rated the cut as "≥2.5 is high, below is low" and the deck notes say "<2.5 fits cirrhosis", so the cut is read the same way here.
// - Below 1.5 g/dL the protein no longer guards against infection (the tile's "SBP risk").
export const SAAG_PORTAL = 1.1;
export const TP_HIGH = 2.5;
export const TP_SBP = 1.5;
/** Whether a SAAG reflects portal hypertension (read as printed: the caller passes the value to a tenth). */
export const saagPortal = (v) => v >= SAAG_PORTAL;
/** Whether the ascitic protein is high (≥2.5 g/dL). */
export const tpHigh = (v) => v >= TP_HIGH;
