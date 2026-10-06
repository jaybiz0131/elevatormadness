# Stop 2 finish report

Build: https://claude.ai/artifact/Ae94og4nbVyk46LuFhsYPn (see the published version at the end). Branch `shunt-3d`. Stop 3 is not started.
Replays: all seven baselines match twice (sync) and `beauty.json` matches through the live 3D frame loop on this build (see the end). The sim did not change in this pass except one grade constant
(`T.goal.letters`), so the baselines from the first Stop 2 report still stand.

## 1. Models showing as boxes on the iPhone: found a reproducible cause, fixed, and the phone can now tell us if it still happens

**What I could and could not prove.** I installed WebKit here (Playwright's WebKit with an iPhone profile, with and without the "Safari" token in the user agent, which in-app web views lack).
On the v21 build all 19 models load there, so the failure does not show up on a current WebKit by itself. I do not have Jack's phone or his iOS version, so I cannot say this is the cause on his device. What I did find:

- **The v21 failure path, reproduced.** GLTFLoader decodes textures with `createImageBitmap` (with flip and colour-space options) whenever it cannot see "Safari" in the user agent (iOS in-app web views) and for Safari 17 and later.
  On older iOS web views that call throws. When I make it throw in WebKit (a shim that rejects those options, which is how those versions behave), **v21 loads every model without its texture**: Dart, Ram, Gunner, Bulwark, Mule and the hero fall back to the untextured, code-painted path
  (a plain dark shape), and **the traffic car crashes in that fallback (`ENEMY_SHAPES['civ']` does not exist) and stays the placeholder box**. That matches "every traffic car and enemy is a plain box".
- **Not the build and not the merge.** All 19 GLBs are in the single-file build (checked: 19 `data:model/gltf-binary` entries, 11.0 MB) and the Stop 1 merge did not touch the model wiring (git history of `carModel.js`, `enemyModels.js`, `vite.config.js`).
- **Fixes (all in `src/render/three/glbLoad.js`, used by the hero, the enemies, the traffic car, the Mule arm, the gatling and every prop):**
  1. The loader never uses `createImageBitmap`; textures take the plain `Image` path that works in every WebKit.
  2. It decodes the embedded data URL itself and parses the bytes (no `fetch()` of a `data:` URL, which a strict content security policy can refuse).
  3. The untextured fallback no longer crashes for the traffic car.
  With the same throwing shim, the new build loads all six enemy and traffic models **textured** (checked in WebKit: map 512 px on every enemy instance, `models 19/19`).
- **No silent failure any more.** Settings > Developer > Show FPS now prints `models X/19`, and if anything fails: `FAILED dart, ram` plus the first error message; `NO TEXTURE ...` when a model loaded but its texture did not decode;
  `SHADER ERRORS n` and the last shader or script error. The Settings screen diagnostic line carries the same. I tested the readout with textures forced to fail (it names all 19 as `NO TEXTURE`).

**Please check on the phone:** open Show FPS and read the models line. `models 19/19` with no FAILED or NO TEXTURE line means they loaded; if the enemies are still boxes then, tell me the exact lines.

### Model inventory
Full table with triangle counts and sizes: `design/stop2/model-inventory.md`. Summary: 19 GLBs are in the build (hero 10,144 triangles; Dart 4,277; Ram 3,840; Gunner 3,908; Bulwark 3,997; Mule 8,068 plus arm 4,025;
traffic car 3,957; gatling 4,063; 10 props and landmarks from 994 to 3,746), plus `skyline.jpg`. Held back: `boss.glb` (8,011 triangles, until the Sprint D boss fight) and `wpn_missile`, `wpn_laser`, `wpn_booster`
(about 4,000 each, until Sprint F, The Refit). Not embedded: `spare/bulwark_alt.glb` and the four high-detail originals in `source/`.

Screenshots: `design/stop2/models/enemies-topdown.png` (hero in the middle with Dart left, Ram right, Gunner lower left, Bulwark top, Mule lower right), `enemies-gameplay.png` (the same in the road view),
`webkit-oldios-gameplay.png` (the road in WebKit with the old-iOS texture failure simulated: textured traffic car and enemy).

## 2. Sound
- **Gatling:** the firing sound is unchanged; the spin-up whine is removed completely (the function is a stub, the oscillators are gone).
- **Engine** (new, `src/audio/audio.js`, synthesised from scratch, nothing sampled or copied): a 20 Hz train of uneven combustion thumps played faster as the revs rise and low-passed so it never opens past about 1.1 kHz;
  a detuned saw growl through a waveshaper, chopped at the firing rate (so it is audible on a phone speaker); a 29 to 52 Hz sub with a soft second harmonic; exhaust pops and burbles when the throttle lifts at speed
  (and now and then in limp); a deep bark on every kill speed burst (rev surge, 96 to 34 Hz bang, throaty saw burst). It ducks to 38% while the gatling fires and comes back in about a third of a second.
- **Measured** on the offline render (energy by band, share of total): idle 59% under 80 Hz and 32% from 80 to 200 Hz, peak 31 Hz; top speed 31% under 80 Hz, 45% 80 to 200, 15% 200 to 500, 0.3% above 2 kHz, peak 77 Hz (so no thin whine at top speed);
  while firing the engine drops by about 4 dB and returns after.
- **Clip:** `design/stop2/audio/drive-and-kill.mp3` (10 s: idle, pull away, full speed, gatling, a kill with the bark, lift off the gas with crackle).
- I cannot hear it. The numbers say the shape is right; whether it is "huge" is for your ears.

## 3. Big explosions (visual only, `src/render/three/explosions.js`)
A render-side explosion starts the moment a car becomes a wreck, sized by what blew up (Dart 1.0, Ram 1.35, Gunner 1.5, Mule 1.6, Bulwark 2.2): a white flash, a fireball of layered additive glows and a dozen smaller hot lobes,
two shockwave rings on the road, a wide orange pool on the asphalt (the road lights up), the cars within about 35 m brighten for a third of a second, hot debris on arcs that cools to char, sparks, and a black smoke column;
then the wreck burns for about five seconds (taller for the big ones). It reads nothing from the sim and writes nothing to it.
**Light budget: zero dynamic lights** (the cap was one). A point light would recompile every material and add cost to every pixel, so the flash is faked with the road pool and a tint on nearby cars.
Pooled: six explosion slots, all sprites go through the existing fixed pools (glows 160, smoke 420, debris 160, sparks 256; Low: smaller flash and rings, half the lobes, debris and sparks).
Cost, busy frame with an explosion in it: 97 calls, 266k triangles (no more than the same frame before), time per frame about +3% in software GL. Images: `design/stop2/explosions/`.

## 4. Grades
A finisher now gets at least a C and one star (the D grade is gone; there is no game over). Bots on the final build: weak driver (novice bot) C on all three seeds (rating 0.24 to 0.34), casual bot B on all three (0.55 to 0.70), the skilled bot S with three stars on seed 2.

## 5. Hairpins
Three problems fixed in `city.js`: (a) an inside-of-the-bend building could land on the road's other arc or in the bend's middle; plots in a hard corner's window are now skipped when the plot is within 150 pt of the arc centre
or when another stretch of road lies within 230 pt of it (a block is up to 200 pt deep); (b) big landmarks beside a hard corner stay out; (c) the camera tests its view against the big imported buildings too (a raycast cannot see into an instanced mesh that was empty when its bounds were taken).
Checked on three hairpins (`design/stop2/hairpin/hairpin-sheet.png`) and on the S-bend that still showed rooftops in the middle: the bend is open and the road is visible through it. Big blocks outside the bend, near the camera, are still there.
A chunk with no buildings at all (all plots skipped) no longer crashes the chunk builder.

## Checks
- Replays: 7 of 7 match on two sync passes; `beauty.json` live: see below.
- Budgets (worst frames over three full runs): at most 98 draw calls (busy moment 97), at most 284k triangles (busy moment 266k), build 11.0 MB (limits 150, 400k, 15 MB).
- Frame cost: the perf-gate numbers stand (High at scale 1.5 and Low at 1.25, see `perf-gate.md`); the explosions add about 3% in the frame they are in; the model loader adds nothing per frame.
- No em dashes in player-facing text.

## Not done or not verified
- The model fix is proven against the failure I could reproduce, not against Jack's phone. The readout is how we find out.
- Sound and explosions were checked by numbers and stills, not by ear or on a device.
- Auto render scale and the Low / High setting are still untested on a phone (see `perf-gate.md` for the test).
- Stop 3 (the one-button change, handbrake 180, director v2, the sound pack, the crash physics) is not started.
