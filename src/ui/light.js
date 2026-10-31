// The one light of the figure: the textbook's, from the top and slightly left, as a unit direction toward the light in screen space
// (x right, y down). The vessels' thin light and dark lines and the sheen of their sample normals (stage.js), the catheter's and the
// balloon's shading (veins-gl.js), and the lobule's vessels (lobule-zoom.js) all take their light from here, so no two of them can
// be lit from different sides.
const N = Math.hypot(-0.42, -0.91);
export const LIGHT = Object.freeze([-0.42 / N, -0.91 / N]);
