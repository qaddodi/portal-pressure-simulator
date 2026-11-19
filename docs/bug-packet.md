# The bug packet: "What's wrong here?" (agent guide)

Plan: `/mnt/project-files/card-gallery-plan/screen-report-recs.md` section 3. Code: `src/ui/packet/`, `scripts/packet.mjs`, `scripts/packet-node.mjs`, `scripts/packet-headless.mjs`.
Sits on the screen report (`docs/screen-report.md`, `pps.screen()` and the self-check rules) and the recorder (`docs/watch.md`, `?watch`).

## For Mohammad: how to send a packet

On the preview copy (`/preview/`), when something looks wrong, and before you touch anything:

- **iPhone or iPad:** hold the orange PREVIEW pill for a second (a short tap still reloads onto the newest build).
- **Mac:** `Option+Shift+?` (`Alt+Shift+?`). Plain `Shift+?` is the keyboard-shortcuts help, so the chord adds Option.
- **Gallery page:** Tools > "What's wrong here?".

A sheet opens: it says how many self-check findings it has, takes a few words ("what did you see?", optional), and **Copy packet** puts one block of text on the clipboard.
Paste it into the thread. For a motion bug (a flash, a slide, a stop) open the page as `/preview/?watch` first, repeat the move, then press: the packet then carries the last 10 s.

## For an agent: the loop

1. **Read it.** `node scripts/packet.mjs show packet.txt` (paste into a file, or `-` for standard input). It says whether the packet arrived whole (a check sum), the findings, the state, and what the packet lacks.
   The text part is already a readable report: the findings, then the screen report's summary. Start from the findings: each names the rule, what, where, why and the file that owns it.
2. **Replay it before you change anything.** `node scripts/packet.mjs replay packet.txt` (Node, jsdom, seconds) and, for anything that needs layout (fit, boxes, a label under a card),
   `node scripts/packet.mjs replay packet.txt --env headless` (layout-only: every GL draw stubbed, no picture, about 15 s; allowed by the owner for layout runs only). `--out before.json` keeps the result.
   - `REPRODUCED`: the same rule fails on the same state here. You can prove a fix here.
   - `GONE` on an unfixed tree: a replay cannot see this bug (device-only: Safari, a real GPU, memory, timing). Fix it from the code, say so, and ask for the button again after the fix (step 5).
   - `NO RULE`: no self-check named it. First add the rule that would have (`registerRule` in `src/ui/selfcheck/`, with a test that fires and one that must not fire), so the next bug of its kind finds itself. Then replay.
   - `MOTION ONLY`: the findings are about the last seconds, which a state replay cannot repeat. The recorded history is judged again by today's motion rules; see step 5.
   - A line `Screen differs from the packet's in ...` says where the replay's report is not the person's. Node has no layout, so boxes and fit rules are for the headless run.
3. **Fix at the root** (the standing rule): find where the finding's `owner` file goes wrong, and check the whole app for the same bug.
4. **Prove it.** Replay again, save with `--out after.json`, then `node scripts/packet.mjs compare before.json after.json`: `FIXED` (the finding is gone), `PARTLY`, `NOT-FIXED`, `REGRESSED` (a new finding),
   and the list of everything on the screen that changed. Every line of that list must be intended; put it in the push message.
   Then make the test: `node scripts/packet.mjs test packet.txt [--rule id] [--expect "labels[Splenic vein].alpha=0.65"]` writes `tests/packets/<name>.json`; `tests/packets.test.js` replays every one
   in Node and fails if the finding is back. Commit it. (A fixture needs a state finding; for a bug no rule caught, write the rule and its test first.)
5. **Device-only and motion bugs.** Push, tell Mohammad what to test, and ask him to press the button again after the fix (on `/preview/?watch` for motion). Save both packets as files and run
   `node scripts/packet.mjs compare before.txt after.txt`: it takes two packets as well as two replay results, and it counts motion findings.
   A fixture made from a motion packet holds the rule's catch (the rule still names the recorded bug), not the fix.
6. **Report** with the before and after findings and the diff, in words. Say "headless, layout only" or "Node" for what you ran; say "the report shows X", never "I saw X": nothing here sees pixels or shaders.

## What is in a packet

`PPS BUG PACKET`, the id, time; the build (preview pill, commit); the device (screen, pixel ratio, look, renderer); what the person wrote; the **replay link**; the findings; the screen report's summary;
a line for the last 10 s; a "not in this packet" line; then one JSON line between `-----BEGIN PACKET JSON-----` and `-----END PACKET JSON-----` (`parsePacket` reads it, even in a chat's code fence with wrapped lines).
The link is an ordinary address: `?script=&slide=` (the app's own deep link), `back=1` and `#s=` (the app's own share payload: patient, what was changed from it, view, selection, camera, plus an `x` part with the look, lens, labels,
layers, the Lobule or Sinusoid view, open instruments, whether the model ran and the screen's size). Open it in any browser; on the preview copy the app puts `x` back after boot (`src/ui/packet/state.js`).
A packet over 64 KB loses detail in this order: the motion history is thinned, the screen JSON is left out (the replay rebuilds it), the history is left out. Findings, state and link always stay.

## Where each piece is

| Piece | File |
|---|---|
| state link: capture, address, read back, apply | `src/ui/packet/state.js` |
| packet: build, text, parse, check sum | `src/ui/packet/packet.js` |
| gather from the page (`pps.screen`, `pps.watch`, device, health) | `src/ui/packet/sources.js` |
| the sheet, the key chord, the long press, `pps.packet` | `src/ui/packet/sheet.js`, `trigger.js`; gallery button `src/ui/gallery/packet-panel.js` |
| replay verdicts, compare | `src/ui/packet/replay.js`, `diff.js` |
| fixture from a packet | `src/ui/packet/test-from-packet.js`, `tests/packets/`, `tests/packets.test.js` |
| Node replay (jsdom, GL stand-in, the model) | `scripts/packet-node.mjs` |
| layout-only headless replay (GL draws stubbed) | `scripts/packet-headless.mjs` |
| command line | `scripts/packet.mjs` (`make`, `show`, `link`, `replay`, `compare`, `test`) |

`pps.packet` (preview copy): `build(note)`, `text(note)`, `open()`, `parse(text)`, `ready` (a promise: booted and the link's extras applied), `settled()`.
`node scripts/packet.mjs make <state link>` builds a packet from an address, to see what the report says of a state or to write a rule against it.

## What it cannot do

- The report describes intent, not pixels: a bug decided in a shader (a black box behind a label, a texture that did not upload) is not in it. The packet says so by saying nothing; ask for a device check.
- Node has no layout and no camera glide; a state's camera (`cam`) is listed as not applied there.
- A replay opens the state, not the 10 seconds before it. A bug that needs a particular move to happen is a motion bug: use `?watch` and compare packets.
- A talk's slide in Node needs the deck's cached states (the first run works them out, about 100 s; `node_modules/.cache/pps-deck-states`).
