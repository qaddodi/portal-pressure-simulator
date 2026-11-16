// The app's flow arrowhead, as the anatomy's vessels draw it (veins-gl.js: the composite's per-pixel heads, and the instanced quads of
// blood-heads.js, which call the same function), so they are one shape: a slim filled head with a notched back. (The sinusoid's own shader,
// sinusoid-gl.js, does not use it: it draws white glints and two big end arrows of its own.)
// chevHead(u, ay, hw, px, rev): u along the flow from the head's centre, ay across from the axis, hw the half width,
// px one device pixel (same units), rev 0 … 1 the eased reversed flag. Returns its coverage (x) and a soft rim just outside it (y), for a
// faint edge that lifts the head off the lumen. A reversed head carries a second, smaller head behind it (a » pair), faded in with rev,
// so reversed flow has a shape cue as well as a colour (blueprint P7, "never colour alone"; visual-style B2).
/**
 * The heads' spacing on screen, CSS px from one head to the next (13 Nov 2026, Mohammad: "the number of chevrons on screen ... should be
 * consistent"). One number for every vessel, zoom, device and chained run (chevPitch).
 */
export const CHEV_PITCH = 130;
export const CHEV_PITCH_GLSL = `
// The heads' spacing (chevLevel, chevKeep): the same distance on screen between heads on every vessel, CHEV_PITCH CSS px, whatever its
// caliber, the zoom or the device. Until 13 Nov it was set by the caliber too (nine radii apart: a wide vein close up showed one or two
// heads) and by the screen's device pixels (half as many CSS px apart on a dense screen), and a run carried on from a root stream at B
// (blood.js createStreamChain) stood its heads P / |B| apart along the vessel, so a slow branch drawing its trunk's heads had them up to
// 4.5 times as close. Here the level is raised by log2 |B| for such a run, so it keeps the same spacing along its own vessel.
// The stream spacing is a power-of-two multiple of 14 world units (it divides the stream's period: no jump on wrap). The level is a
// continuous number: a head of index j on the lattice of level n0 belongs to the levels n0 … n0 + v2(j) (v2: how many times 2 divides j),
// and fades out as the level passes from its last to the next (chevKeep), so the coarser heads are a subset of the finer ones; nothing jumps.
// The fade is 2^(1 - x) - 1 (x the level past the head's last): the heads' summed strength per CSS px is then the same at every level,
// one head per CHEV_PITCH, where a smoothstep let it swing by a fifth. The level goes down to -1 (14 world units) for a close zoom.
// pxW: world units per device pixel; cssPx: device pixels per CSS pixel; B: the run's scale (1 for a vessel's own stream); stillLv: the
// least level reduced motion asks for (its still heads spaced by flow), or below 0. Returns the level and the spacing wanted along the
// vessel (world units).
vec2 chevLevel(float pxW, float cssPx, float B, float stillLv) {
  float Pt = ${CHEV_PITCH}.0 * cssPx * pxW;
  return vec2(max(max(-1.0, log2(Pt * abs(B) / 28.0)), stillLv), Pt);
}
// How much of head j of the lattice of level n0 shows at level lv (1 kept, 0 gone).
float chevKeep(float j, float n0, float lv) {
  float m = 0.0, q = abs(j);
  for (int i = 0; i < 10; i++) { if (q < 0.5 || mod(q, 2.0) > 0.5) break; q *= 0.5; m += 1.0; }
  if (q < 0.5) m = 10.0;
  return clamp(exp2(1.0 - (lv - n0 - m)) - 1.0, 0.0, 1.0);
}`;
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

/**
 * The flow heads' inks on their own quads (13 Nov 2026, Mohammad picked option A of the chevron-ink mocks, artifact 4FXL4718v2SGucey6y3XLA:
 * "when the vessel color is too bright, it should have a darker outline rather than white"; then, of A's cream heads on the pale portal
 * vein: "Chevrons here should be black"). A forward head is near-black on a light lumen (the composite's ink) and cream on a dark one; a
 * reversed head orange on both (cream on an orange lumen). The rim answers the lumen: sepia (the Light look's vessel outline ink,
 * --casing-rgb 59 44 34) on a light one, cream on a dark one, so no head on a bright vessel carries a white rim. The heads' vertex shader
 * takes it in place of the composite's chevInks (CHEV_ORANGE_GLSL, part of COMP_FS, which is never touched): headInksGLSL(orange) keeps
 * the composite's chevOrange and swaps chevInks. The composite's per-pixel heads (bleed frames only) keep the composite's own inks.
 */
export const CHEV_SEPIA = [59, 44, 34];
/**
 * Where a head's ink flips from near-black to cream, as the lumen's relative luminance (linear light, 0 black .. 1 white): it eases over
 * [FLIP_LO, FLIP_HI], centred on .19, the lumen at which near-black (L .012) and cream (L .87) stand off it equally (WCAG 3.6:1 at either edge).
 * 16 Nov 2026 (style play-test: chevrons low contrast on the lavender and wine vessels): it was a gamma luma band .38 to .46, about 3 mmHg of the
 * pressure ramp on every look, and across it the head's ink was a grey between the two, the same lightness as the lumen
 * (1.04:1 at 15 mmHg in Light and Soft, 1.11:1 at 18 mmHg in Dark, Navy and Black), so a vessel held there showed no heads at all. The band is
 * now a little over half as wide (about 1.2 to 1.7 mmHg), and centred where the two inks answer equally, so the grey is on screen only while a vessel's colour eases through it.
 */
export const CHEV_FLIP = [0.175, 0.205];
const CHEV_LUMA_LIN = [0.2126, 0.7152, 0.0722];
const smooth01 = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** The share of a head's ink that is cream (1) rather than near-black (0) on a lumen of this colour (sRGB 0–1 each): the shader's `dark`. */
export function chevDarkShare(r, g, b) {
  const L = CHEV_LUMA_LIN[0] * Math.max(r, 0) ** 2.2 + CHEV_LUMA_LIN[1] * Math.max(g, 0) ** 2.2 + CHEV_LUMA_LIN[2] * Math.max(b, 0) ** 2.2;
  return 1 - smooth01(CHEV_FLIP[0], CHEV_FLIP[1], L);
}
export function headInksGLSL(orange) {
  // alloc-rare: assembles the shader text once when the renderer's programs are made
  const at = orange.indexOf('void chevInks(');
  const keep = at >= 0 ? orange.slice(0, at) : orange;
  return `${keep}
// The heads' inks (chevron-glsl.js headInksGLSL), by the lumen's relative luminance over a short band centred where near-black and cream
// answer equally (CHEV_FLIP, so a vessel whose colour eases never pops and one held anywhere has a head that shows): a forward head near-black on a light lumen and cream on a dark one; a reversed head orange on both (cream on an
// orange lumen); the rim sepia on a light lumen and cream on a dark one (never white on a bright vessel).
void chevInks(vec3 vc, float rv, out vec3 core, out vec3 rim) {
  float rk = origin == 1 ? rv * (1.0 - blendA.y) : rv;
  float dark = 1.0 - smoothstep(${CHEV_FLIP[0]}, ${CHEV_FLIP[1]}, dot(pow(max(vc, vec3(0.0)), vec3(2.2)), vec3(0.2126, 0.7152, 0.0722)));
  float warm = rk * chevOrange(vc);
  vec3 ink = mix(chevInk, vc * 0.3, 0.2);
  core = mix(mix(mix(ink, chevLight, dark), revCol, rk), chevLight, warm);
  rim = mix(vec3(${CHEV_SEPIA.map((v) => (v / 255).toFixed(4)).join(', ')}), chevLight, dark);
}
`;
}
