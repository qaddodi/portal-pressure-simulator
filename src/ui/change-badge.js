// When a station's change badge ("+5") shows (bible review 19 Nov 2026, STG-5): the figure's labels and the lobule's stations read one rule.
// A badge appears at `on` and goes only below `off`, so a value hovering at the threshold does not add and drop it every beat. Next to the
// healthy reference it is 5 mmHg (off at 4); while comparing with a pinned moment, every change from it (1, off at 0.7).
export const DELTA_MIN = 5;
export const badgeOn = (cmp) => (cmp ? 1 : DELTA_MIN);
export const badgeOff = (cmp) => (cmp ? 0.7 : DELTA_MIN - 1);
