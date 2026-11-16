// The patient's name for a history line or the timeline's first entry (main.js).

/** The patient's name for a history line: the preset's label, or Custom once the parameters have been moved. */
export const patientLabel = (st) => st.presetList?.find((x) => x.id === st.presetId)?.label || 'Custom';
