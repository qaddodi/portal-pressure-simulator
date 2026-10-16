// The six text roles for figure labels and slide cards (styles/tokens.css --t-*): each grows with the screen's
// short side from a phone (390 px) to a laptop (900 px and up). The SVG labels read their sizes from here.
export const ROLES = { cap: [12, 12], lab: [12, 14], body: [14, 16], val: [16, 22], big: [20, 32], title: [28, 44] };
// Text size setting: 100 % is the design size on every screen; steps only go up, so nothing drops under 11 px.
export const TEXT_STEPS = [1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.75, 2];
export const TEXT_MIN = TEXT_STEPS[0], TEXT_MAX = TEXT_STEPS[TEXT_STEPS.length - 1];
export const fluid = (w, h) => Math.min(1, Math.max(0, (Math.min(w, h) - 390) / 510));
// The window's size, kept from its resize events: on a phone, reading innerWidth makes the browser finish its pending style and
// layout first, and the figure's labels asked for a size on every model frame (about 15% of a phone's CPU on a slide sitting still).
const view = { w: 0, h: 0, at: -1 };
if (typeof addEventListener === 'function') addEventListener('resize', () => { view.at = -1; });
const viewSize = () => { if (view.at < 0) { view.w = innerWidth; view.h = innerHeight; view.at = 0; } return view; };
export const rolePx = (role, w = viewSize().w, h = viewSize().h) => { const [a, b] = ROLES[role], t = fluid(w, h); return a + (b - a) * t; };
// A label run's design size (the old point sizes in the label code) → its role: readings, names, captions.
export const roleOf = (size) => (size >= 13 ? 'val' : size >= 10.5 ? 'lab' : 'cap');
