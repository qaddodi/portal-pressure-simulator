// Which sweep window a Doppler trace starts on, from the width it is drawn at.

/** Index into the sweep windows [6 s, 3 s, 12 s] for a trace plot drawn plotW CSS px wide:
 *  3 s when it is narrow (under 360 px, so the beats are not crammed), else 6 s. */
export const windowIndexFor = (plotW) => (plotW < 360 ? 1 : 0);

/** The scanner's velocity scales (cm/s, one side of the baseline). The top step must clear the fastest jet a narrowed stent can read. */
export const VEL_STEPS = [8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 80, 100, 120, 150, 200, 300, 400, 500, 600, 800, 1000];

/** The smallest scale whose side holds a peak of v cm/s with the trace filling about 85% of it. */
export const scaleFor = (v) => VEL_STEPS.find((x) => x >= Math.max(v, 8) / 0.85) || VEL_STEPS[VEL_STEPS.length - 1];

/** The monitor's scale and baseline for this frame, updated in st ({ scale, baseF, settleAt, refit }). Like a sonographer, it
 *  changes them only when the signal would clip (fits false) or has stayed small for 3 s, never continuously. A slide's fixed
 *  scale holds whatever the signal. While a live change is settling (holding) they hold still too, and once it has settled
 *  they fit the signal in one change (refit). target, tbF: the scale and baseline the signal asks for; tNow: model seconds. */
export function fitScale(st, { fixed, holding, fits, target, tbF, tNow }) {
  if (fixed) { st.baseF = fixed.base; st.scale = 2 * fixed.nyq * Math.max(st.baseF, 1 - st.baseF); st.settleAt = tNow; }
  else if (holding) st.refit = true;
  else if (st.refit || st.scale == null || !fits) { st.refit = false; st.scale = target; st.baseF = tbF; st.settleAt = tNow; }
  else if (target < st.scale || Math.abs(tbF - st.baseF) > 0.15) { if (tNow - st.settleAt > 3) { st.scale = target; st.baseF = tbF; st.settleAt = tNow; } }
  else st.settleAt = tNow;
  return st;
}
