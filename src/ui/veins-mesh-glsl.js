// The vessel shader's shading, shared by the classic vessel pass (veins-gl.js vesselFS) and the mesh passes (veins-mesh-glsl.js mesh
// shaders, docs/veins-mesh-plan.md section 3): moved out of vesselFS unchanged (the same arithmetic in the same order), so the two paths
// cannot drift apart. The text needs the host shader's declarations: the samplers ent, rad, tube, organ; the uniforms the classic
// shader declares (organK, useOrgan, tierGroup, px, fx, the inks, casing, shadow, ring, light, paperInk, rimInk); T(), alongAt(), over(),
// LAST and S_OFF. K: the renderer's constants (flags, VEIL_K, the lift's ease, LUMEN2, ROW2_BITS, the edge softness's GLSL).
export const shadeGLSL = ({ F_DIFFUSE, F_EDGE, F_SHADOW, F_SPEC, F_VEIL, F_WHOLE, LIFT_EASE_MAX, LIFT_EASE_SHARE, LUMEN2, ROW2_BITS, VEIL_K }) => `
// One segment's nearest point, folded into the vessel's nearest so far (the vessel shader's search, per segment): bd, bs the wall's and
// the shadow's distance, br the radius, bu the along, bx the across, bg the direction from the centreline; aM, aW, aU the soft along.
void segNear(int id, float i, vec4 A, vec2 p, vec2 ps, vec4 clip, bool dotted, inout float bd, inout float bs, inout float br, inout float bu,
             inout float bx, inout vec2 bg, inout float aM, inout float aW, inout float aU) {
  // The part of this segment inside the drawn stretch (a vessel drawing on is cut short).
  float u0 = i / LAST, u1 = (i + 1.0) / LAST;
  if (u1 < clip.x || u0 > clip.y) return;
  float t0 = clamp((clip.x - u0) * LAST, 0.0, 1.0), t1 = clamp((clip.y - u0) * LAST, 0.0, 1.0);
  vec2 a = mix(A.xy, A.zw, t0), b = mix(A.xy, A.zw, t1), ba = b - a;
  float L2 = max(dot(ba, ba), 1e-8);
  vec2 rr = texelFetch(rad, ivec2(int(i + 0.5), id), 0).rg;
  float hr = dot(p - a, ba) / L2, h = clamp(hr, 0.0, 1.0);
  float hh = mix(t0, t1, h);
  vec2 q = p - a - ba * h;
  float dist = length(q), r = mix(rr.x, rr.y, hh);
  // Along the course, carried on straight past the drawn ends (the blood runs on into a join).
  float he = (u0 <= clip.x && hr < 0.0) || (u1 >= clip.y && hr > 1.0) ? hr : h;
  float d = dist - r;
  if (dotted) {
    // A closed potential collateral: round dots 1.5 long every 6 units, as the SVG dashes.
    float m = mod((i + hh) / LAST * clip.z, 6.0);
    float along = m < 3.75 ? max(0.0, m - 1.5) : 6.0 - m;
    d = length(vec2(dist, along)) - r;
  }
  if (d < bd) { bd = d; bg = dist > 1e-5 ? q / dist : vec2(0.0); br = r; bu = (i + mix(t0, t1, he)) / LAST; bx = (ba.x * (p - a).y - ba.y * (p - a).x) * inversesqrt(L2); }
  if (d < aM + 12.0) {
    float uv = (i + mix(t0, t1, clamp(hr, -2.0, 3.0))) / LAST;
    if (d < aM) { float k = exp((d - aM) / 1.5); aW = aW * k + 1.0; aU = aU * k + uv; aM = d; }
    else { float w = exp((aM - d) / 1.5); aW += w; aU += w * uv; }
  }
  float hs = clamp(dot(ps - a, ba) / L2, 0.0, 1.0);
  bs = min(bs, length(ps - a - ba * hs) - mix(rr.x, rr.y, mix(t0, t1, hs)));
}

// A vessel's attributes at p (texels 0–12): its tier, z, flags, wall, how far the organs fade it, its lumen colour along it (and a recoloured
// stretch), hover, how far it stands out of the dimmed network, its own casing colour, and its alpha (fades, veil). uAt, vAt: along, soft along.
void vesAttrs(int id, float uAt, float vAt, vec2 p, float occl, out float tier, out float z, out float flag, out float wall, out float of,
              out vec3 col, out float hov, out float sel, out vec3 edge, out float alpha) {
  vec4 t0 = T(id, 0), t1 = T(id, 1), t2 = T(id, 2), t3 = T(id, 3), t4 = T(id, 4);
  tier = t2.x; z = t2.y; flag = t2.z; wall = t0.w;
  of = (int(t2.z + 0.5) & ${F_WHOLE}) != 0 ? 0.0 : 1.0;   // (how far the organs fade this vessel: 1 as they cover it, 0 for a vessel shown whole)
  col = mix(t0.rgb, t1.rgb, alongAt(id, clamp(uAt, 0.0, 1.0)));
  vec4 tc = T(id, 8);
  hov = T(id, 9).w;
  // The selected vessel stands out of the dimmed network, easing back into it along its course toward each end that
  // meets an unselected vessel, so it never stops in a hard, round end where the dimmed vessel carries on (a slide's
  // spotlit vessel toward its free ends too: highlight-math.js liftEnd).
  vec4 t12 = T(id, 12);
  sel = t12.x;
  if (t12.x > 0.0) {
    float Ls = max(T(id, 5).z, 1.0), fs = min(${LIFT_EASE_SHARE} * Ls, ${LIFT_EASE_MAX}.0);
    sel *= (t12.y > 0.5 ? smoothstep(0.0, fs, vAt * Ls) : 1.0) * (t12.z > 0.5 ? smoothstep(0.0, fs, (1.0 - vAt) * Ls) : 1.0);
  }
  if (tc.w > 0.0) {
    vec4 tr = T(id, 9);
    float Lv = max(T(id, 5).z, 1.0), uu = uAt * Lv;
    float k = smoothstep(tr.x * Lv - tr.z, tr.x * Lv + tr.z, uu) * (1.0 - smoothstep(tr.y * Lv - tr.z, tr.y * Lv + tr.z, uu));
    col = mix(col, tc.rgb, k * min(tc.w, 1.0));   // (tc.w 2: an opaque cast, the EUS glue; the blood stops inside it, castAt)
  }
  edge = (int(t2.z + 0.5) & ${F_EDGE}) != 0 ? T(id, 6).rgb : vec3(0.0);
  float a = t1.w;
  if (t4.w > 2.5) {
    // A dip: from its start alpha down to its faintest at the offset, and back up to solid at the end.
    vec2 dd = t3.zw - t3.xy;
    float v = clamp(dot(p - t3.xy, dd) / max(dot(dd, dd), 1e-6), 0.0, 1.0);
    a *= v < t4.x ? mix(t4.y, t4.z, smoothstep(0.0, t4.x, v)) : mix(t4.z, 1.0, smoothstep(t4.x, 1.0, v));
  } else if (t4.w > 1.5) {
    float v = length(p - t3.xy) / max(t3.z, 1e-3);
    a *= v < 0.45 ? mix(t4.y, t4.z, v / 0.45) : mix(t4.z, 0.0, clamp((v - 0.45) / 0.55, 0.0, 1.0));
  } else if (t4.w > 0.5) {
    vec2 dd = t3.zw - t3.xy;
    float v = dot(p - t3.xy, dd) / max(dot(dd, dd), 1e-6);
    a *= mix(t4.y, t4.z, clamp((v - t4.x) / max(1.0 - t4.x, 1e-4), 0.0, 1.0));
  }
  // A veiled vessel is faded all along its course, as much as an organ covering it would (behind
  // an organ, by no more than that). In its alpha, so the fade blends across its joins.
  if ((int(t2.z + 0.5) & ${F_VEIL}) != 0 && useOrgan == 1) {
    float v = 1.0 - ${VEIL_K} * organK;
    a *= tierGroup[int(t2.x + 0.5)] == 0 ? min(1.0, v / max(1.0 - occl, 1e-3)) : v;
  }
  alpha = a;
}

// A lit vessel's glow band at a pixel d from its lumen (before the cut at other lit lumens): gc, ge its texels 10 and 11 (0 when unlit).
float glowAmt(int id, float d, float wall, float vAt, float aIn, out vec4 gc, out vec4 ge) {
  gc = T(id, 10);
  ge = T(id, 11);
  if (gc.a <= 0.0) return 0.0;
  float e = d - wall, Lh = max(T(id, 5).z, 1.0);
  float ends = (ge.x > 0.0 ? smoothstep(0.0, ge.x, vAt * Lh) : 1.0) * (ge.y > 0.0 ? smoothstep(0.0, ge.y, (1.0 - vAt) * Lh) : 1.0);
  // A stretch (a stent's third): its two ends come as −(1 + u) along the vessel; the glow fades in and out over a few units there.
  if (ge.x < 0.0) {
    float x = vAt * Lh, a = (-ge.x - 1.0) * Lh, b = (-ge.y - 1.0) * Lh, w = min(6.0, 0.08 * Lh);
    ends = (a > 0.5 ? smoothstep(a - w, a + w, x) : 1.0) * (b < Lh - 0.5 ? 1.0 - smoothstep(b - w, b + w, x) : 1.0);
  }
  bool up = ge.w > 5.0;
  float fall = 1.0 - smoothstep(0.0, 12.0 * clamp(up ? ge.w - 10.0 : ge.w, 0.5, 1.3), e);
  return min(0.9, 0.6 * gc.a) * aIn * smoothstep(-0.6, 0.6, e) * fall * ends;
}

// The tier's shape drawn at a pixel: contact shadow, selection ring, casing, the flat lumen with its light and dark lines, rounding,
// pale wall band, dark lumen's rim, lift, hover and the knock-out ring, premultiplied, before the tier's alpha. D, Ds: the lumen's and the
// shadow's signed distance; R, wall, col, g: the blended radius, casing width, colour and direction; aL: the lumen's coverage.
vec4 tubeShade(float D, float Ds, float R, float wall, vec3 col, vec2 g, int flags, bool sel, float cA, int grp, int id, float vAt, float hov,
               vec3 edge, float kn, float kcas, float aa, float aL) {
  float aC = clamp(0.5 - (D - wall) / aa, 0.0, 1.0);
  vec4 c = vec4(0.0);
  if (fx == 1 && (flags & ${F_SHADOW}) != 0) {
    float blur = sel ? 2.4 : 1.3;
    // A faint contact shadow only, so a vessel passing over another still reads as on top.
    float as = 0.55 * shadow.a * (1.0 - smoothstep(-blur * 1.4, blur * 1.4 + aa, Ds - wall));
    c = vec4(shadow.rgb * as, as);
  }
  if (sel) { float ar = ring.a * clamp(0.5 - (D - wall - 4.0) / aa, 0.0, 1.0); c = over(vec4(ring.rgb * ar, ar), c); }
  // (A veiled vessel keeps half its casing: behind an organ the wall's line is the first thing to go.)
  if ((flags & ${F_VEIL}) != 0) cA *= 0.5;
  float lumY = dot(col, vec3(0.299, 0.587, 0.114));
  c = (flags & ${F_EDGE}) != 0 ? over(vec4(edge, 1.0) * (0.92 * aC), c) : over(vec4(casing.rgb, 1.0) * (casing.a * cA * aC), c);
  vec3 lum = col;
  float rho = clamp((R + D) / max(R, 1e-3), 0.0, 1.0);
  if (fx == 1 && (flags & ${F_DIFFUSE}) != 0 && aL > 0.0) {
    // A textbook plate, not a rendered tube: a flat lumen with one thin light line along the
    // side toward the light and one thin dark line along the other. The across-tube
    // coordinate (−1 … 1, positive on the lit side) places them at a fixed depth in the tube, so
    // they run on through the joins and never slide to the rim as a vessel turns; where the light
    // runs along a vessel they fade out smoothly, and on hairline vessels they are left out.
    float k = dot(g, light);
    float side = rho * sign(k);
    float soft = 0.06 + aa / max(R, 1e-3);
    float thin = smoothstep(1.2, 2.6, R / aa) * smoothstep(0.25, 0.7, abs(k));
    // Both lines by the lumen's own lightness (looks review, the lumen's light lines): on the palest lumens (2 mmHg, nearly white) the light line
    // has no room and read as a white wire, so it falls to half; on the darkest (wine, the dark theme) the dark line went
    // below the ground, so it eases off there too. A mid lumen keeps both at full.
    float aDark = (1.0 - smoothstep(0.1, 0.1 + soft, abs(side + 0.62))) * thin * (0.45 + 0.55 * smoothstep(0.1, 0.32, lumY));
    lum = mix(lum, shadeInk.rgb, clamp(shadeInk.a * 1.3 * aDark, 0.0, 0.5));
    if ((flags & ${F_SPEC}) != 0) {
      float aLight = (1.0 - smoothstep(0.07, 0.07 + soft, abs(side - 0.5))) * thin * (1.0 - 0.5 * smoothstep(0.72, 0.9, lumY));
      lum = mix(lum, sheenInk.rgb, clamp(sheenInk.a * 0.75 * aLight, 0.0, 0.5));
    }
    // Depth: the tube rounds off toward its wall (cubed, so the middle is untouched), deeper on the side away from the
    // light; then a pale band of wall about a device pixel and a half wide just inside the casing. Both left out on hairlines.
    float body = smoothstep(1.5, 3.5, R / aa);
    float rim = rho * rho * rho;
    lum = lum * (1.0 - body * rim * (0.09 - 0.05 * clamp(k, -1.0, 1.0)));
    float wallW = clamp(0.1 * R, 1.2 * aa, 2.4 * aa);
    float band = smoothstep(-wallW - aa, -wallW, D) * body;
    lum = mix(lum, mix(lum, sheenInk.rgb, 0.45), 0.32 * band * (1.0 - 0.6 * smoothstep(0.72, 0.9, lumY)));
  }
  // A dark lumen (the sickest vessels, on the dark looks, where the casing is no darker than the ground) gets a light edge 1 device px wide just
  // inside its wall, by its own lightness, the way the label halo follows its ink (rimInk.a is 0 on the light looks; hairlines are left out).
  lum = mix(lum, rimInk.rgb, rimInk.a * (1.0 - smoothstep(0.2, 0.4, lumY)) * smoothstep(-px - aa, -px, D) * smoothstep(1.5, 3.5, R / aa));
  if (sel && grp == 2) lum = min(lum * 1.12, vec3(1.0));
  if (hov > 0.0) {
    // The hovered vessel, a little brighter in its own hue, easing out toward each end that meets a vessel not lit with it
    // (over a third of its length, at most 60), so the brighter lumen never stops in a hard line at the join.
    vec4 he = T(id, 11);
    float Lh = max(T(id, 5).z, 1.0), fl = min(0.35 * Lh, 60.0);
    float hs = (he.x > 0.0 ? smoothstep(0.0, max(he.x, fl), vAt * Lh) : 1.0) * (he.y > 0.0 ? smoothstep(0.0, max(he.y, fl), (1.0 - vAt) * Lh) : 1.0);
    lum = mix(lum, min(lum * 1.18 + 0.04, vec3(1.0)), hov * hs);
  }
  lum = mix(mix(lum, paperInk.rgb, kn), casing.rgb, casing.a * kcas * kn);
  c = over(vec4(lum, 1.0) * aL, c);
  return c;
}

// The layer's colour, dithered by up to a level (triangular noise, fixed per pixel) before the 8-bit target: the colour and alpha of a soft
// gradient (the glow's falloff) would round at different places and draw thin stripes. q: the pixel in the figure's whole device pixels.
vec4 ditherOut(vec4 o, vec2 q) {
  uvec2 fc = uvec2(ivec2(floor(q)));   // (fixed to the figure, not the screen: it moves with a pan)
  uint hd = fc.x * 0x8da6b343u ^ fc.y * 0xd8163841u;
  hd ^= hd >> 15; hd *= 0x2c1b3c6du; hd ^= hd >> 12; hd *= 0x297a2d39u; hd ^= hd >> 15;
  float dn = (float(hd & 0xffffu) + float(hd >> 16)) / 65535.0 - 1.0;
  o.a = clamp(o.a + dn / 255.0, 0.0, 1.0);
  o.rgb = min(max(o.rgb + dn / 255.0, 0.0), vec3(o.a));
  return o;
}
// The front lumen, as the lumen target holds it. (The row's top bit, LUMEN2: a second lumen is written beside it, so the composite reads
// that target only where one is. Rows stay far below 32768.)
uvec4 packFlow(uint gId, uint gId2, float gS, float gY, float gW, float gB) {
  return uvec4(gId | (gId2 > 0u ? ${LUMEN2}u : 0u), uint(clamp((gS + S_OFF) * 16.0, 0.0, 65535.0)), uint(clamp((gY + 1.0) * 32767.5, 0.0, 65535.0)),
    (uint(round(clamp(gW, 0.0, 1.0) * 255.0)) << 8u) | (gId2 > 0u ? uint(round(clamp(gB, 0.0, 1.0) * 255.0)) : 0u));
}
// The second lumen near a join, packed (ROW2_BITS): row + 1 | across's top bits, 4 × (arc + S_OFF) | across's low two bits.
uvec4 packFlow2(uint gId2, float gS2, float gY2) {
  uint gQ2 = uint(clamp((gY2 + 1.0) * 64.0, 0.0, 127.0));   // (the second lumen's across, 0–127: ROW2_BITS)
  return uvec4(gId2 | ((gQ2 >> 2u) << ${ROW2_BITS}u), (uint(clamp((gS2 + S_OFF) * 4.0, 0.0, 16383.0)) << 2u) | (gQ2 & 3u), 0u, 0u);
}
`;
