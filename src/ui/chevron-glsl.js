// The app's flow arrowhead, shared by every shader that draws one (the anatomy's vessels, veins-gl.js; the
// sinusoid, sinusoid-gl.js), so they are one shape: a slim filled head with a notched back.
// chevHead(u, ay, hw, px): u along the flow from the head's centre, ay across from the axis, hw the half width,
// px one device pixel (same units). Returns its coverage (x) and a soft rim just outside it (y), for a faint
// light edge that lifts the dark head off the lumen.
export const CHEV_GLSL = `
vec2 chevHead(float u, float ay, float hw, float px) {
  float L = 1.6 * hw, tip = 0.55 * L, back = -0.45 * L, notch = 0.32 * L, k = L / hw;
  // Inside when behind both slanted sides and ahead of the notched back.
  float side = (u - tip + ay * k) / sqrt(1.0 + k * k);
  float rear = back + notch * (1.0 - clamp(ay / hw, 0.0, 1.0)) - u;
  float d = max(max(side, rear), ay - hw);
  float c = 1.0 - smoothstep(-0.7 * px, 0.7 * px, d);
  return vec2(c, (1.0 - smoothstep(0.0, 1.8 * px + 0.1 * hw, d)) * (1.0 - c));
}`;
