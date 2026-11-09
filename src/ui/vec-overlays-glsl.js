// The vector renderer's scene overlays and soft effects (workstream G; docs/recommendations/vector-renderer-plan.md section 9.G): the shaders
// for everything COMP_FS lays that is not a vessel, an organ or the blood. Strings only: nothing here draws (vec-overlays.js does).
//
//   under the vessels   the glow behind the organs (glowL), the circuit's map (mapAt), the plate's grey-down (plateSat, plateAlpha, applied to
//                       the organs F draws), the warm glow on the organs (warmL)
//   over the vessels    the ascites (fluidAt), the catheter, the organ outlines (lineL)
//
// The maths of mapAt, fluidAt and the plate's grey-down is COMP_FS's own, word for word under the names vecMapAt, vecFluidAt and vecPlate
// (tests/vec-overlays.test.js compares the two texts), so Vector's picture of them is today's. The strokes and the catheter are the shaders
// veins-gl.js draws them with (LINE_VS/LINE_FS, CATH_VS/CATH_FS), drawn straight into the picture instead of into layers.

/** The layers, bottom to top, in COMP_FS's exact order (its main: pl = over(pl, mapAt) lays the map under the plate and the glow under
 *  both; the warm glow over the plate; then the vessels; then over(lineL, over(fluidC, over(v, ...))); the catheter between the fluid and
 *  the outlines, as veins-gl draws it after the composite and the outlines after that). vec-overlays.js draws in this order. */
export const OVERLAY_ORDER = Object.freeze(['glow', 'map', 'plate', 'warm', 'vessels', 'fluid', 'cath', 'lines']);
/** The layers G draws (the rest are F's organs, the vessels and the blood), and which side of the vessels each lies. */
export const UNDER_VESSELS = Object.freeze(['glow', 'map', 'plate', 'warm']);
export const OVER_VESSELS = Object.freeze(['fluid', 'cath', 'lines']);
/** The one stencil bit the warm glow's tie-break uses (cleared after it). F's clips and E's passes keep off it. */
export const STENCIL_BIT = 0x80;

/** a over b, premultiplied (COMP_FS's over). */
export const OVER_GLSL = `
vec4 vecOver(vec4 top, vec4 under) { return top + under * (1.0 - top.a); }
`;

/** The plate's grey-down, premultiplied (COMP_FS: the line after the plate is read): F's organ fragments call vecPlate on their colour. */
export const PLATE_UNIFORMS = Object.freeze(['plateAlpha', 'plateSat']);
export const PLATE_GLSL = `
uniform float plateAlpha, plateSat;
vec4 vecPlate(vec4 pl) {
  if (pl.a > 0.0) { float l = dot(pl.rgb / pl.a, vec3(0.299, 0.587, 0.114)); pl = vec4(mix(vec3(l) * pl.a, pl.rgb, plateSat), pl.a) * plateAlpha; }
  return pl;
}
`;

/** The circuit's map (needs vecOver above it, and the host's `uniform float pxW;` world units per device pixel). */
export const MAP_UNIFORMS = Object.freeze(['mapA', 'mapDot', 'mapFx', 'mapZone', 'mapAlt', 'mapFxX', 'mapRot']);
export const MAP_GLSL = `
uniform float mapA;
uniform vec4 mapDot, mapFx;
uniform vec4 mapZone[3];
uniform vec4 mapAlt;
uniform vec2 mapFxX;
uniform vec4 mapRot;
// The circuit's map at world point w, premultiplied (see mapA). The grid: a dot of radius 0.9 every 20 units (at 10, 10 in each square),
// its alpha by the frame it lies in (MAP_STEPS: how far outside the figure's frame, the larger of the two axes); under a pixel's size a dot
// keeps its area (wider, fainter), as the browser's antialiasing had it. Then the tinted zones and the lit zone over it, edges a pixel soft.
vec4 vecMapAt(vec2 w) {
  w = vec2(mapRot.x * (w.x - mapRot.z) - mapRot.y * (w.y - mapRot.w), mapRot.y * (w.x - mapRot.z) + mapRot.x * (w.y - mapRot.w)) + mapRot.zw;
  float e = max(max(30.0 - w.x, w.x - 1370.0), max(30.0 - w.y, w.y - 730.0));
  float op = e <= 0.0 ? 0.9 : e <= 200.0 ? 0.7 : e <= 450.0 ? 0.5 : e <= 750.0 ? 0.3 : e <= 1100.0 ? 0.15 : e <= 1500.0 ? 0.06 : 0.0;
  vec4 c = vec4(0.0);
  if (op > 0.0) {
    float d = length(w - (floor(w / 20.0) * 20.0 + 10.0)), rr = max(0.9, 0.7 * pxW);
    float a = mapDot.a * op * clamp((rr - d) / pxW + 0.5, 0.0, 1.0) * min(1.0, 0.81 / (rr * rr));
    c = vec4(mapDot.rgb * a, a);
  }
  float iy = clamp(min(w.y - 40.0, 730.0 - w.y) / pxW + 0.5, 0.0, 1.0);
  if (iy > 0.0) {
    float zp = clamp(min(w.x - mapAlt.x, mapAlt.y - w.x) / pxW + 0.5, 0.0, 1.0) * iy * mapZone[0].a;
    float zl = clamp(min(w.x - mapAlt.y, mapAlt.z - w.x) / pxW + 0.5, 0.0, 1.0) * iy * mapZone[1].a;
    float zh = clamp(min(w.x - mapAlt.z, mapAlt.w - w.x) / pxW + 0.5, 0.0, 1.0) * iy * mapZone[2].a;
    c = vecOver(vec4(mapZone[0].rgb * zp, zp), c);
    c = vecOver(vec4(mapZone[1].rgb * zl, zl), c);
    c = vecOver(vec4(mapZone[2].rgb * zh, zh), c);
    float f = clamp(min(w.x - mapFxX.x, mapFxX.y - w.x) / pxW + 0.5, 0.0, 1.0) * iy * mapFx.a;
    c = vecOver(vec4(mapFx.rgb * f, f), c);
  }
  return c * mapA;
}
`;

/** The ascites (needs the host's `uniform float pxW;`). vecAboveAt(w): what lies over the blood at world point w, premultiplied: a pixel
 *  of the V_BLOOD variant lays it over its shaded colour. (The outlines and the catheter are meshes, drawn after: vec-overlays.js.) */
export const FLUID_UNIFORMS = Object.freeze(['fluidMask', 'fluidRect', 'fluidS', 'fluidInk', 'fluidLv']);
export const FLUID_GLSL = `
uniform highp sampler2D fluidMask;
uniform vec4 fluidRect;
uniform vec4 fluidS;
uniform vec4 fluidInk;
uniform vec2 fluidLv;
// Ascites at world point w, premultiplied (its own colour whatever the lens; see main): over the plate and the vessels. Also the
// arrowheads' quads (HEADS), which lay a head under it as main does.
vec4 vecFluidAt(vec2 w) {
  vec4 fluidC = vec4(0.0);
  if (fluidInk.a > 0.0) {
    vec2 fu = (w - fluidRect.xy) / fluidRect.zw;
    if (all(greaterThanEqual(fu, vec2(0.0))) && all(lessThanEqual(fu, vec2(1.0)))) {
      float c = (w.x - 712.0) / 400.0;
      float s = fluidS.x - fluidS.y * (0.8 + 0.2 * c * c * clamp(fluidS.y / 485.0, 0.0, 1.0)) + (sin(w.x / 38.0 + fluidS.w) * 0.7 + sin(w.x / 23.0 - fluidS.w * 1.3) * 0.3) * fluidS.z;
      float d = w.y - s;
      // Inside the cavity: the row's half-width (between the two nearest rows) less the distance from the mirror line, over
      // the edge's slope there to give the distance across it, smoothed over a world unit or a pixel, whichever is more
      // (the raster it replaces was a world unit to the texel).
      float nR = float(textureSize(fluidMask, 0).x), fy = fu.y * (nR - 1.0);
      int r0 = int(min(floor(fy), nR - 2.0));
      float h0 = texelFetch(fluidMask, ivec2(r0, 0), 0).r, h1 = texelFetch(fluidMask, ivec2(r0 + 1, 0), 0).r;
      float sl = (h1 - h0) * (nR - 1.0) / fluidRect.w;
      float cav = (mix(h0, h1, fy - float(r0)) - abs(w.x - fluidRect.x - 0.5 * fluidRect.z)) / sqrt(1.0 + sl * sl);
      float e = smoothstep(-pxW, pxW, d) * clamp(0.5 + cav / max(pxW, 1.0), 0.0, 1.0);
      // Off the congested liver (organ picks, 20 Oct): above its lower edge, column by column across fluidRect in the
      // liver's own frame, the fluid is cut by fluidLv.y.
      if (fluidLv.y > 0.0 && e > 0.0) {
        vec2 lu = (w - vec2(560.0, 350.0)) / fluidLv.x + vec2(560.0, 350.0);
        float lx = clamp((lu.x - fluidRect.x) / fluidRect.z, 0.0, 1.0) * (nR - 1.0);
        int l0 = int(min(floor(lx), nR - 2.0));
        float lb = mix(texelFetch(fluidMask, ivec2(l0, 1), 0).r, texelFetch(fluidMask, ivec2(l0 + 1, 1), 0).r, lx - float(l0));
        e *= 1.0 - fluidLv.y * (1.0 - smoothstep(-pxW, pxW, lu.y - lb));
      }
      if (e > 0.0) {
        // Fluid, not a floor (looks review, 31 Oct): two stops of its own depth, more see-through at its upper edge than deeper down
        // (0.55 of the ink at the surface, full by about 28 units under it), and a thin pale meniscus along the surface in place of
        // the denser band that made the edge read as a rim.
        float a = fluidInk.a * (0.55 + 0.45 * smoothstep(0.0, 28.0, d));
        float men = exp(-d * d / 10.0);
        a = min(a, 1.0) * e;
        vec3 fc = mix(fluidInk.rgb, mix(fluidInk.rgb, vec3(1.0), 0.45), men);
        fluidC = vec4(fc * a, a);
      }
    }
  }
  return fluidC;
}
vec4 vecAboveAt(vec2 w) { return vecFluidAt(w); }
`;

// ── The programs ──
/** A full-picture quad (the map). */
export const MAP_VS = `#version 300 es
layout(location=0) in vec2 corner;
void main() { gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0); }`;
export const MAP_FS = `#version 300 es
precision highp float;
uniform mat3 inv;
uniform float H;
uniform float pxW;
${OVER_GLSL}${MAP_GLSL}
out vec4 o;
void main() {
  vec2 w = (inv * vec3(gl_FragCoord.x, H - gl_FragCoord.y, 1.0)).xy;
  o = vecMapAt(w);
}`;

/** The ascites' quad: the cavity's rectangle (fluidRect, world) through the camera. */
export const FLUID_VS = `#version 300 es
layout(location=0) in vec2 corner;
uniform mat3 world;
uniform vec2 size;
uniform vec4 fluidRect;
void main() {
  vec3 d = world * vec3(fluidRect.xy + corner * fluidRect.zw, 1.0);
  gl_Position = vec4(d.x / size.x * 2.0 - 1.0, 1.0 - d.y / size.y * 2.0, 0.0, 1.0);
}`;
/** The ascites over the picture: the fluid alone, laid over what is there (blend ONE, ONE_MINUS_SRC_ALPHA). */
export const FLUID_FS = `#version 300 es
precision highp float;
uniform mat3 inv;
uniform float H;
uniform float pxW;
${FLUID_GLSL}
out vec4 o;
void main() {
  vec2 w = (inv * vec3(gl_FragCoord.x, H - gl_FragCoord.y, 1.0)).xy;
  o = vecAboveAt(w);
}`;

// ── Strokes: the organ outlines, the glow behind the organs, the warm glow on them (veins-gl.js LINE_VS, LINE_FS) ──
export const LINE_VS = `#version 300 es
layout(location=0) in vec2 pos;
layout(location=1) in vec2 nrm;
layout(location=2) in vec2 sideW;   // side (−1 or 1), half width (world units); a fill's edge fringe: (0 or 1, −1)
uniform mat3 world;
uniform vec2 size;
uniform float pack;   // 1: a warm glow, whose half width carries its fade too (64 x the fade in 63 steps + the width), so a run's ends can fade out
out float vD;
out float vW;
out float vF;
out float vY;
void main() {
  vY = pos.y;
  vec2 n = (world * vec3(nrm, 0.0)).xy;
  float k = max(length(n), 1e-6);
  float w = sideW.y;
  vF = 1.0;
  if (pack > 0.5 && w > 0.0) { float c = floor(w / 64.0); vF = c / 63.0; w -= 64.0 * c; }
  vW = w * k;
  float e = max(vW, 0.5) + 1.0;
  if (sideW.y < 0.0) { vW = 0.5; e = 1.0; }   // fading from the fill's edge to nothing one device pixel out
  vec2 d = (world * vec3(pos, 1.0)).xy + n / k * sideW.x * e;
  gl_Position = vec4(d.x / size.x * 2.0 - 1.0, 1.0 - d.y / size.y * 2.0, 0.0, 1.0);
  vD = sideW.x * e;
}`;
/** depth false: veins-gl's LINE_FS. depth true: the warm glow's two passes: the fragment's depth is 1 − its alpha (a pixel's nearest fragment is
 *  its strongest), so a first pass with depth test LESS keeps the strongest alpha of every strip that meets there, and a second with EQUAL (and the
 *  stencil bit, so two equal ones lay once) lays the colour of that one: the maximum the warm layer took with blend MAX, exact for one colour. */
export const lineFS = (depth) => `#version 300 es
precision highp float;
in float vD;
in float vW;
in float vF;
in float vY;
uniform vec4 col;   // rgb, alpha
uniform vec2 endFade;   // an outline or glow fades out between these two heights (the rectum's end: (0, 0) for none)
uniform float soft;   // 1: a glow, strongest on the edge and easing out as a Gaussian over its width (vD runs 0 to the full reach)
out vec4 o;
void main() {
  float a;
  float fe = (endFade.y > endFade.x ? clamp((endFade.y - vY) / (endFade.y - endFade.x), 0.0, 1.0) : 1.0);
  if (soft > 0.5) {
    float t = clamp(abs(vD) / (vW + 1.0), 0.0, 1.0);
    a = col.a * vF * exp(-4.5 * t * t) * (1.0 - smoothstep(0.55, 1.0, t)) * fe;
    // A hair of noise, so a long faint ramp does not step in 8-bit colour.
    a = max(a + (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0, 0.0) * step(0.0005, a);
  } else a = col.a * clamp(max(vW, 0.5) + 0.5 - abs(vD), 0.0, 1.0) * fe;   // (a stroke is at least one device pixel wide, at full strength: the stent's struts and rails, a balloon's rim, visual-style D3)
${depth ? '  if (a <= 0.0) discard;\n  gl_FragDepth = 1.0 - a;\n' : ''}  o = vec4(col.rgb * a, a);
}`;

// ── The catheter (veins-gl.js CATH_VS, CATH_FS) ──
export const CATH_VS = `#version 300 es
layout(location=0) in vec2 pos;
layout(location=1) in vec2 dir;
layout(location=2) in vec2 uv;
uniform mat3 world;
uniform vec2 size;
out vec2 vDir;
out vec2 vUV;
void main() {
  vec3 d = world * vec3(pos, 1.0);
  gl_Position = vec4(d.x / size.x * 2.0 - 1.0, 1.0 - d.y / size.y * 2.0, 0.0, 1.0);
  vDir = dir; vUV = uv;
}`;
export const CATH_FS = `#version 300 es
precision highp float;
in vec2 vDir;
in vec2 vUV;
uniform int mode;
uniform vec3 col;
uniform float alpha;
uniform vec2 light;
uniform vec2 fade;   // tubes: fade in over the first fade.x of the length, out over the last fade.y before len
uniform float len;
out vec4 o;
void main() {
  vec3 L = normalize(vec3(light * 0.85, 0.95)), H = normalize(L + vec3(0.0, 0.0, 1.0));
  float a = alpha;
  vec3 c = col, n;
  if (mode <= 3 || mode == 7) {
    float v = clamp(vUV.x, -1.0, 1.0), e = 1.0 - abs(vUV.x);
    float aa = clamp(e / max(fwidth(vUV.x), 1e-4), 0.0, 1.0);
    a *= aa * smoothstep(0.0, max(fade.x, 1e-4), vUV.y) * clamp((len - vUV.y) / max(fade.y, 1e-4), 0.0, 1.0);
    n = vec3(vDir * v, sqrt(max(0.0, 1.0 - v * v)));
    float dif = max(dot(n, L), 0.0), sp = pow(max(dot(n, H), 0.0), mode == 3 ? 60.0 : 34.0);
    if (mode == 0) { a *= pow(1.0 - v * v, 2.2); }
    else if (mode == 7) { c = col; }
    else if (mode == 1) {
      // Blood standing in the vein: deep at the walls, a soft sheen down its middle.
      c = col * (0.62 + 0.42 * dif) + vec3(0.16) * pow(max(dot(n, H), 0.0), 12.0);
      a *= smoothstep(0.0, 0.35, e);
    } else {
      // Polymer (2) or a metal band (3); the dark rim that draws its edge thins out when the tube is a
      // few pixels across, where it would turn the whole tube grey.
      float wpx = 2.0 / max(fwidth(vUV.x), 1e-4), rim = smoothstep(2.5, 9.0, wpx);
      if (mode == 2) {
        // Satin polymer: a broad soft sheen, the sides falling off gently into the hairline edge drawn under it.
        float sat = pow(max(dot(n, H), 0.0), 14.0);
        c = col * (0.66 + 0.38 * dif) + vec3(1.0) * sat * 0.28;
        c = mix(c, col * 0.62, smoothstep(0.55, 1.0, abs(v)) * 0.55 * rim);
      } else {
        // Brushed platinum: a cool grey with one narrow glint.
        c = col * (0.55 + 0.6 * dif) + vec3(1.0) * sp * 0.7;
        c = mix(c, col * 0.45, smoothstep(0.6, 1.0, abs(v)) * 0.6 * rim);
      }
    }
  } else {
    float r2 = dot(vUV, vUV), r = sqrt(r2);
    float aa = clamp((1.0 - r) / max(fwidth(r), 1e-4), 0.0, 1.0);
    vec2 w = vDir * vUV.x + vec2(-vDir.y, vDir.x) * vUV.y;
    float z = sqrt(max(0.0, 1.0 - r2));
    n = normalize(vec3(w, z + 1e-3));
    float dif = max(dot(n, L), 0.0), sp = pow(max(dot(n, H), 0.0), 34.0);
    if (mode == 8) { c = col; a *= aa; }
    else if (mode == 4) {
      // The rounded end shades like the shaft it closes (a cylinder across its width, not a ball), so
      // it reads as part of the tube rather than a glossy bead stuck on.
      float v = clamp(vUV.y, -1.0, 1.0);
      vec3 nc = vec3(vec2(-vDir.y, vDir.x) * v, sqrt(max(0.0, 1.0 - v * v)));
      float dc = max(dot(nc, L), 0.0), sc = pow(max(dot(nc, H), 0.0), 34.0);
      float sat = pow(max(dot(nc, H), 0.0), 14.0);
      c = col * (0.66 + 0.38 * dc) + vec3(1.0) * sat * 0.28;
      c = mix(c, col * 0.62, smoothstep(0.55, 1.0, r) * 0.55);
      a *= aa;
    } else if (mode == 5) {
      // Thin latex over contrast: clear in the middle, bright at the rim, a hard highlight up-left.
      // Clear latex over dilute contrast: see-through in the middle, denser toward its walls, a crisp thin rim, one small glint.
      float fr = pow(1.0 - z, 1.6), sp2 = pow(max(dot(n, H), 0.0), 160.0), edge = smoothstep(0.9, 0.99, r);
      c = col * (0.72 + 0.32 * dif) + vec3(1.0) * (sp * 0.12 + sp2 * 0.45);
      c = mix(c, col * vec3(0.42, 0.46, 0.52), edge * 0.85);
      float k = 0.46 + 0.36 * fr + 0.3 * sp2 + edge * 0.5;
      a *= aa * clamp(k, 0.0, 1.0);
    } else if (mode == 9) {
      // EUS-PPG's ultrasound sector (eus-scope.js): a fan from the transducer, uv its own frame (x along its middle, the arc at r 1)
      // and len its half angle; soft at its sides and its far edge, faint near the transducer, a few depth arcs across it.
      float ang = abs(atan(vUV.y, vUV.x)) / max(len, 1e-3), fw = max(fwidth(r * 6.0), 1e-4);
      float arcs = 1.0 - 0.35 * (1.0 - smoothstep(0.0, fw * 1.5, 0.5 - abs(fract(r * 6.0) - 0.5)));
      c = col;
      a *= aa * (1.0 - smoothstep(0.8, 1.0, ang)) * smoothstep(0.0, 0.14, r) * (0.45 + 0.55 * (1.0 - smoothstep(0.55, 1.0, r))) * arcs;
    } else {
      float d = abs(r - 0.86), fw = max(fwidth(r), 1e-4);
      a *= clamp((0.07 - d) / fw + 0.5, 0.0, 1.0) * 0.9 + exp(-d * d * 160.0) * 0.35;
      a *= step(r, 1.0);
    }
  }
  o = vec4(c * a, a);
}`;
