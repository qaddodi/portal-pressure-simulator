// The app's flow arrowhead, as the anatomy's vessels draw it (veins-gl.js: the composite's per-pixel heads, and the instanced quads of
// blood-heads.js, which call the same function), so they are one shape: a slim filled head with a notched back. (The sinusoid's own shader,
// sinusoid-gl.js, does not use it: it draws white glints and two big end arrows of its own.)
// chevHead(u, ay, hw, px, rev): u along the flow from the head's centre, ay across from the axis, hw the half width,
// px one device pixel (same units), rev 0 … 1 the eased reversed flag. Returns its coverage (x) and a soft rim just outside it (y), for a
// faint edge that lifts the head off the lumen. A reversed head carries a second, smaller head behind it (a » pair), faded in with rev,
// so reversed flow has a shape cue as well as a colour (blueprint P7, "never colour alone"; visual-style B2).
export const CHEV_GLSL = `
float chevD(float u, float ay, float hw) {
  float L = 1.6 * hw, tip = 0.55 * L, back = -0.45 * L, notch = 0.32 * L, k = L / hw;
  // Inside when behind both slanted sides and ahead of the notched back.
  float side = (u - tip + ay * k) / sqrt(1.0 + k * k);
  float rear = back + notch * (1.0 - clamp(ay / hw, 0.0, 1.0)) - u;
  return max(max(side, rear), ay - hw);
}
vec2 chevHead(float u, float ay, float hw, float px, float rev) {
  float d = chevD(u, ay, hw);
  float c = 1.0 - smoothstep(-0.7 * px, 0.7 * px, d);
  float rim = 1.0 - smoothstep(0.0, 1.8 * px + 0.1 * hw, d);
  if (rev > 0.0) {
    // The smaller head behind: 0.6 of the size, its tip 0.35 L behind the head's centre (clear of the first's notched back).
    float d2 = 0.6 * chevD((u + 1.088 * hw) / 0.6, ay / 0.6, hw);
    c = max(c, rev * (1.0 - smoothstep(-0.7 * px, 0.7 * px, d2)));
    rim = max(rim, rev * (1.0 - smoothstep(0.0, 1.8 * px + 0.06 * hw, d2)));
  }
  return vec2(c, rim * (1.0 - c));
}`;
