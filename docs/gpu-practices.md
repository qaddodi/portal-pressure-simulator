# GPU rendering practices for this app

A reference for every thread that touches the figure. It collects the published practice for smooth, cool WebGL (and later WebGPU)
on Safari for iPhone, iPad and Mac at up to 120 Hz, and says what each one means here. It covers techniques we do not use yet, so a
new feature can start from the right one.

Status key: **Done** (in the code), **Part** (in some surfaces, not all), **Gap** (worth doing), **Later** (a bigger move, not yet).
Off switches named here are `?flag=0` in the address. Sources are listed at the end, numbered [n].

Written 1 Nov 2026 against preview `claude/settings-topbar-icon-flvft1`.

## 1. Frame pacing, 120 Hz and ProMotion

| Practice | Here | Status |
|---|---|---|
| Animate from the rAF timestamp, never by frame count, so 60, 120 and the 30 Hz of Low Power Mode give the same speed [5][6]. | Eases use the paced clock (`ease-clock`, 32ffc50c). Keep every new animation on it. | Done |
| iOS Safari gives the page 60 Hz rAF unless the user turns off "Prefer Page Rendering Updates near 60fps" (Settings › Apps › Safari › Advanced › Feature Flags); Mac Safari runs rAF at the display rate on ProMotion [5]. A page cannot ask for 120 Hz itself. | Testing "120 Hz on iPhone" needs that flag off. The ?perf readout reports the offered rate (`perf-readout.js refreshOf`). | Note |
| Low Power Mode throttles rAF to 30 fps on iOS [6]. Treat a long run of ~33 ms frames as a heat signal: lower the figure's resolution, not the motion. | Auto quality steps resolution on slow frames (`stage.js autoNow`). | Part |
| Render on demand: draw only when something changed; idle at zero frames [1][9]. | Still blood skips the picture (`veins-gl composite`, "pictureSkipped"); idle rest after 30 s (da02f6e6). | Done |
| No frames in a hidden tab; stop timers and the worker too [9]. | rAF loop sleeps on `document.hidden`; the worker gets `visibility`. Some `setInterval`s still tick (probe, credit check returns early). | Done |
| One rAF loop for the page. Several independent loops each wake the frame and can split work across two vsyncs. | Stage loop drives most; glass, labels, lobule have their own `finalFrameFor` turns in the same frame (`frame.js`). | Done |

## 2. Shaders: compile early, never in a frame

| Practice | Here | Status |
|---|---|---|
| Compile all shaders, then link all programs, and read the status later; `KHR_parallel_shader_compile` lets the driver do it on other threads and say when it is done without waiting [1]. | `gl-compile.js` startProgram / publishWhenDone (veins, labels, lobule). The figure's renderer also starts, at its setup and beside its own, every helper program it would otherwise compile later one after another: organs' stack, painter and shapes (`prestart` / `linkProgram`), the overlays' laying, Sharper upscaling, pinch reuse, the resolution fade and the glass (`?shaderwarm=0` as before). | Done |
| Never read `COMPILE_STATUS` unless the link failed: the read is synchronous [1]. | `checkProgram` reads `LINK_STATUS` first (8808b771, `?linkfirst=0`); veins-gl `finishProgram` and the glass too (`?shaderwarm=0` as before). | Done |
| Warm a program with one tiny draw before its first real frame: Safari's WebGL runs on Metal (via ANGLE), which builds a pipeline at the first draw with a given state [1][3]. | `exerciseDraw` for veins, the lobule field, the present's variants (overlays, upscale, reuse), the resolution fade and the glass's two programs, each at a free moment of the figure's renderer once the driver has them (veins-gl `prepare`, `top.warmIn`). A frame that comes first never waits: upscale and reuse draw the plain way, the fade lets the new picture in without a mix, the field keeps its frame. | Done |
| Keep the number of shader variants small: every `#define` combination is another compile and another pipeline. | veins-gl builds several variants (`later` list in ?perf). New looks should be uniforms, not new programs, when cheap. | Note |
| Organs, shapes and organ painting compile at the figure's setup, started together with the vessels' programs and read after (`prestartOrganStack`), not one after another. | `organs-gl.js`, `shape-gl.js`, `organ-paint.js`. | Done |

## 3. Synchronous calls and GPU stalls

| Practice | Here | Status |
|---|---|---|
| No `getError`, `getParameter`, `checkFramebufferStatus`, `readPixels` or `getBufferSubData` in a frame: each can wait on the GPU for a millisecond or more [1]. | Startup and one-off only (`veins-gl` noise texture, gpu-probe under ?perf). | Done |
| Read back asynchronously when you must: `readPixels` into a PIXEL_PACK buffer, `fenceSync`, poll in a later frame [1]. | The old glass copy mode read back every frame; it is off by default (`?glasscopy=1`). Endoscopy `pixels()` is tests only. | Done |
| Upload textures before the frame's draws, not between them: a DOM or bitmap upload flushes the pipeline [1]. | | Note |
| Do not write a texture or buffer the GPU is still reading this frame; use a second one (ping-pong) or orphan it with `bufferData(null)` [1][2]. | veins-gl rows use `texSubImage2D` on textures drawn the previous frame. | Note |

## 4. Textures: uploads, streaming, atlases, memory

| Practice | Here | Status |
|---|---|---|
| Allocate once with `texStorage2D`, then update with `texSubImage2D`; re-specifying size with `texImage2D` reallocates [1]. | Many `texImage2D` resizes (veins-gl layers, glass). They happen on size change, not per frame. | Part |
| Stream big images in pieces across frames (a band per frame), never one huge upload at a settle [1][9]. | Lobule tiles and the texture check/retry (307acf67); a single big upload at settle was one cause of the iPhone 3 fps. Owned by the tissue thread. | Part |
| Upload from `ImageBitmap` made off the main thread (`createImageBitmap`), so decode and premultiply happen before the upload. | Glass and organ picture use bitmaps. | Done |
| Atlas small images (labels, icons, glyphs) into one texture, so one bind serves many draws [2][7]. | `atlas-pack.js` for labels (2 pages of 2048). | Done |
| Mipmaps only for textures shown smaller than drawn; they cost a third more memory. | | Note |
| iOS caps the memory of all canvases on a page (the "Total canvas memory use exceeds the maximum limit" error; a few hundred MB, lower on older phones) and kills the tab when GPU memory runs out [4]. Count every DPR-sized canvas: width x height x 4 bytes, and twice for a drawing buffer. A 1320x2868 iPhone canvas is ~15 MB per buffer. | Labels and glass already draw in the figure's context. The lobule can hold four more full-screen contexts (field, tissue, fx, sinusoid); the tiles thread is merging them into one, then into the figure's. | Part |
| Free what is not shown: shrink a texture to 1x1, delete, or let the context go on leaving a view. | `trim()` paths in veins-gl, organ-paint. | Done |

## 5. Draw calls, batching and instancing

| Practice | Here | Status |
|---|---|---|
| Fewer, bigger draws: batch by program and texture; each draw has CPU cost in WebGL's validation and in ANGLE [2][7]. | Vessels and blood are instanced (`drawArraysInstanced`). | Done |
| Instancing for many alike shapes (cells, dots, markers, labels) [2]. | Blood, fluid, pool, dirt cells instanced. Labels as quads. | Done |
| Vertex array objects so a draw does not re-bind every attribute [1]. | Used throughout. | Done |
| Uniform buffer objects for blocks of uniforms shared by several programs. | Not used; each program sets its own uniforms. | Later |
| One WebGL context for the whole figure where possible: separate contexts cannot share textures, each adds a compositor layer and its own memory [8][9]. | Labels and glass already draw into the figure's context (host). Field, tissue, sinusoid have their own. | Part |

## 6. Bandwidth, overdraw, full-screen passes (heat)

Mobile GPUs, Apple's included, are tile-based: the cost that heats the phone is mostly memory traffic, not arithmetic [3][10].

| Practice | Here | Status |
|---|---|---|
| Tell the GPU when a buffer's contents are no longer needed (`invalidateFramebuffer`): on Metal this becomes a "don't care" store, so the tile is never written back to memory [1][3]. | The one-pass zoom frames' stencil is let go once used (ae5f781a, `?invalidate=0`); the figure canvas no longer keeps an unused stencil (316ce520, `?stencilfree=0`). Glass blur steps keep their texels on purpose (partial reblur), so they are not invalidated. | Part |
| Clear a target at the start of a pass rather than load it, when its old contents are not needed (load action "clear" or "don't care") [3]. | | Gap |
| Avoid full-screen passes; each one at DPR 3 on a Pro Max is ~3.8 MP read and written. Merge passes into one shader where possible [10]. | One-pass zoom frames (26 Oct); outlines drawn straight in while moving. | Part |
| Limit overdraw: draw opaque things front to back or mask them (stencil, scissor); skip transparent pixels with no lumen [10]. | Blood frame skips pixels with no lumen. | Done |
| Blur at low resolution and upscale: a blur's cost grows with pixels times taps [10]. | Glass blurs at `glassDpr` (cap 2) and in steps. | Done |
| Keep shaders cheap where they cover the screen: no loops over many taps, fewer texture reads, `mediump` where precision allows (Apple GPUs run half precision at twice the rate) [3]. | Most figure shaders are `highp`. A `mediump` pass on colour-only shaders is a candidate. | Gap |
| Cap the drawing buffer: devicePixelRatio 2 is usually indistinguishable from 3 for a moving figure; size by `devicePixelContentBoxSize` to avoid moiré at fractional ratios [1]. | Figure capped at DPR 2 and 8 MP (e8199efb); labels at full DPR for crisp text. | Done |

## 7. Compositor, CSS and the page around the canvas

| Practice | Here | Status |
|---|---|---|
| Animate only `transform` and `opacity`; anything else lays out or repaints every frame [8]. | Card turn, glides. Keep it so. | Done |
| Few compositor layers; each `will-change` is memory and a blend per frame [8]. | Removed on the teaching shade (0cc48991). | Note |
| Live `backdrop-filter` blur over a moving canvas re-blurs every frame and is the most expensive thing Safari composites. Draw glass in the figure's GPU context instead, or freeze it during motion. | GPU glass default (e349b6c3); card glass frozen in moves (own thread). | Part |
| A transparent WebGL canvas is blended over the page every frame; an opaque one is not. MDN warns `alpha:false` itself can be costly on some platforms; writing alpha 1 in the shader is the other route [1]. | Held (owner chose see-through, 1 Nov) until organs are always on the GPU. | Later |
| No per-frame DOM reads after writes (layout thrash); read first, then write. | General CPU sweep thread. | Part |
| `preserveDrawingBuffer: false` unless needed: true makes Safari copy the buffer every frame. | Figure uses its own buffer on the stage (`OWN_BUF`); other contexts false. | Done |

## 8. Text and labels on the GPU

| Practice | Here | Status |
|---|---|---|
| Signed distance field glyphs: one small atlas draws sharp text at any zoom with one texture read and a smoothstep; outlines, halos and shadows are free in the same shader [11]. Multi-channel SDF (msdfgen) keeps sharp corners [12]. | Labels are drawn into an atlas from the canvas text renderer at the current scale (`label-gl.js`), and redrawn when the scale changes a lot. SDF would remove those redraws during zooms. | Later |
| Keep the label's paper rim as a shader effect, not a second draw. | Hard paper rim is the owner's choice (1 Nov). | Note |
| Lay out text on the CPU once, then move it on the GPU with a matrix. | Done in label-gl. | Done |

## 9. Workers, OffscreenCanvas, WebGPU

| Practice | Here | Status |
|---|---|---|
| OffscreenCanvas with WebGL in a worker keeps rendering smooth while the main thread lays out cards; Safari supports it since 17 [13]. | The model already runs in a worker. The figure could move with `transferControlToOffscreen`, but labels, hit tests and glass read the DOM. | Later |
| WebGPU (Safari 26 on iOS, iPadOS, macOS) [14]: explicit pipelines (created ahead, so no first-draw stall), compute shaders (blood, flow), bind groups, render bundles. Best route for the figure long term; WebGL2 stays as the fallback. | Not started. Start with one self-contained surface (Doppler or FibroScan) behind a flag. | Later |

## 10. Thermal budget

| Practice | Here | Status |
|---|---|---|
| Phones throttle on sustained load, not peaks; aim for headroom (a frame in well under half its budget) so the clock stays high [10]. | | Note |
| Lower resolution before frame rate when hot or in Low Power Mode; lower rate only for things that do not move (idle rest). | Auto quality; idle rest. | Part |
| Measure on the device: Safari Web Inspector Timelines (rendering frames, JavaScript), Xcode Instruments "Game Performance" / Metal System Trace for GPU time and thermal state on a tethered iPhone [3]. | Headless here is software GL and cannot show heat. | Note |

## 11. Refresh rate: design every ease for 60 Hz

iPhone Safari gives pages a 60 Hz `requestAnimationFrame` unless the user turns off "Prefer Page Rendering Updates near 60fps" in Safari's feature flags, and 30 Hz in Low Power Mode [5][6]. So design every ease to look right at 60 Hz (time-based, never per-frame steps), and budget 16.7 ms a frame with under 4 ms of script. A 120 Hz frame is a bonus, not the target.

Layers (`will-change`) follow the same rule: an element that animates only sometimes gets `will-change` only while it moves, as a class added where the motion starts and removed where it ends (never a per-frame write). The lobule and sinusoid layers (`lz-live`, `sv-live`) and the dock divider guide (`dg-live`) do this; `?willchange=0` keeps them always, as before. Elements that exist only for a motion (`.pg-piece`, `.um-pv-plate`, `.lg-bar-was`, `.fd-m`) or move every frame (`.sp-beam-svg`, the Doppler `.dop-box`) keep it.

## Sources

1. MDN, "WebGL best practices". https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices
2. Khronos WebGL wiki and public_webgl list on batching and instancing. https://www.khronos.org/webgl/public-mailing-list/public_webgl/1902/msg00000.php
3. Apple, Metal Best Practices Guide, "Load and Store Actions" (and Metal docs, "Setting load and store actions"); WWDC20 10632 "Optimize Metal Performance for Apple silicon Macs". https://developer.apple.com/library/archive/documentation/3DDrawing/Conceptual/MTLBestPracticesGuide/LoadandStoreActions.html , https://developer.apple.com/videos/play/wwdc2020/10632
4. WebKit bug 195325 and 190280, "Total canvas memory use exceeds the maximum limit". https://bugs.webkit.org/show_bug.cgi?id=195325
5. WebKit bug 173434, "Support for 120Hz requestAnimationFrame"; Safari feature flag "Prefer Page Rendering Updates near 60fps". https://lists.webkit.org/pipermail/webkit-unassigned/2023-August/1116072.html , https://www.tomsguide.com/phones/iphones/enable-120hz-safari-on-iphone
6. WebKit bug 215745, rAF throttled to 30 fps in Low Power Mode; Popmotion, "When iOS throttles requestAnimationFrame". https://bugs.webkit.org/show_bug.cgi?id=215745 , https://popmotion.io/blog/20180104-when-ios-throttles-requestanimationframe
7. Arm, "Arm Mali best practices" guide (draw calls, batching, bandwidth). https://community.arm.com/arm-community-blogs/b/graphics-gaming-and-vr-blog/posts/arm-mali-best-practices
8. web.dev, "Stick to compositor-only properties and manage layer count". https://web.dev/articles/stick-to-compositor-only-properties-and-manage-layer-count
9. Jeff Gilbert (Mozilla), "WebGL best practices" notes. https://hackmd.io/@jgilbert/WebGLBestPractices
10. Arm, "Best practice principles for mobile game development" (bandwidth, overdraw, thermal). https://developer.arm.com/community/arm-community-blogs/b/mobile-graphics-and-gaming-blog/posts/p2-best-practices-mobile-game-development
11. Chris Green (Valve), "Improved Alpha-Tested Magnification for Vector Textures and Special Effects", SIGGRAPH 2007. https://cdn.akamai.steamstatic.com/apps/valve/2007/SIGGRAPH2007_AlphaTestedMagnification.pdf
12. Viktor Chlumský, msdfgen (multi-channel SDF). https://github.com/Chlumsky/msdfgen
13. web.dev, "OffscreenCanvas: speed up your canvas operations with a web worker". https://web.dev/articles/offscreen-canvas
14. WebGPU in Safari 26 (iOS 26, macOS 26). https://appdevelopermagazine.com/webgpu-in-ios-26/
