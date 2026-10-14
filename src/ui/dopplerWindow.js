// Which sweep window a Doppler trace starts on, from the width it is drawn at.

/** Index into the sweep windows [6 s, 3 s, 12 s] for a trace plot drawn plotW CSS px wide:
 *  3 s when it is narrow (under 360 px, so the beats are not crammed), else 6 s. */
export const windowIndexFor = (plotW) => (plotW < 360 ? 1 : 0);
