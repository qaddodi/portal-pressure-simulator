// The patient's name for a history line or a talk's restore note.
/** The patient's name: the preset's label, or Custom once the parameters have been moved. */
export const patientLabel = (st) => st.presetList?.find((x) => x.id === st.presetId)?.label || 'Custom';
