// What counts as a CHANGE for a trend chart: a treatment or a procedure, which moves a reading in a step. (A time-lapse's ramp, a brush's fibrosis, a
// slider's tone are continuous: the trend follows them, so they are not here.) The Days chart (ui/pressure-time.js) cuts its series at each change, so a
// calmed line never starts to move before the treatment that moves it (engine/trail-calm.js recordDay, calmedPieces; LOOK-2, 19 Nov 2026).
const KEYS = ['drugs', 'tips', 'dips', 'splenicRx', 'portocaval', 'portocavalSide', 'dsrs', 'mesocaval', 'rex', 'anticoag', 'diuretics', 'occluded',
  'balloonEso', 'balloonGas', 'customShunts', 'stentGeom', 'stenosisSite'];
/** A string that changes when a treatment does: the params' treatment keys (drugs, a stent, a shunt, an embolization, a splenectomy, the tube...). */
export function treatmentKey(params) {
  if (!params) return '';
  let s = '';
  for (const k of KEYS) s += `${k}:${JSON.stringify(params[k])};`;
  return s;
}
