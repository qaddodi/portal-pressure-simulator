// The six text roles for figure labels and slide cards (styles/tokens.css --t-*): each grows with the screen's
// short side from a phone (390 px) to a laptop (900 px and up). The SVG labels read their sizes from here.
export const ROLES = { cap: [11, 12], lab: [12, 14], body: [14, 16], val: [16, 22], big: [20, 32], title: [28, 44] };
// Text size setting: 100 % is the design size on every screen; steps only go up, so nothing drops under 11 px.
export const TEXT_STEPS = [1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.75, 2];
export const TEXT_MIN = TEXT_STEPS[0], TEXT_MAX = TEXT_STEPS[TEXT_STEPS.length - 1];
export const fluid = (w, h) => Math.min(1, Math.max(0, (Math.min(w, h) - 390) / 510));
export const rolePx = (role, w = innerWidth, h = innerHeight) => { const [a, b] = ROLES[role], t = fluid(w, h); return a + (b - a) * t; };
// A label run's design size (the old point sizes in the label code) → its role: readings, names, captions.
export const roleOf = (size) => (size >= 13 ? 'val' : size >= 10.5 ? 'lab' : 'cap');
