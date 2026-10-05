# Sprint 3D progress (read this to continue in a fresh session)

Branch `shunt-3d`. Brief: `design/sprint-3d-port.md`. Plan: `design/sprint-3d-plan.md`. Style: `design/style-guide.md`.

## Done
- Step 1: `archive/canvas-sprint-c` at 2c9dc9f; canvas comparison link https://claude.ai/artifact/HZBcWaQwUoV2ZsJmWhxVyr
- Step 2: deterministic fixed-step sim in `spycar/graybox/index.html`; 6 baseline replays in `spycar/graybox/replays/`
- Step 3: Vite modules in `spycar/shunt/` (sim/, input/, audio/, ui/, render/, main.js); replays match
- Step 4: three.js renderer (`src/render/three/`), HTML HUD, ?perf ?bench ?shots ?r=canvas; 3D link https://claude.ai/artifact/Ae94og4nbVyk46LuFhsYPn
- Step 5: Neon City kit (city.js, sky.js, post.js, looks.js, tune.js), three looks, postcards via `tools/shots.mjs <out> <look>`
- Step 6: hairpin barrier hit behind `G.cfg.hairpinWall` (`?wall=0` turns it off); `tools/hairpins.mjs` runs the bot gate

## How to run
```
cd spycar/shunt && npm install && npm run build          # dist/shunt.html (standalone) and dist/artifact.html (publish this)
node tools/playtest.mjs <out> <seconds> <mode> --seed=N [--record=file] [--query=r=canvas&wall=1]
node tools/replay.mjs <replay.json> [--live]             # hash parity
node tools/shots.mjs <out> <look>                        # 8 postcards
node tools/bench.mjs [soak] [look]; node tools/check.mjs <out> [look]; node tools/warning.mjs; node tools/hairpins.mjs 20
```
Headless numbers are SwiftShader numbers, not iPhone numbers.

- Step 7: all 12 replays match (sync; one live in 3D), zoo frame 135 calls / 18k tris, context loss restored, warning time logged, postcards in `design/postcards/`, soak and bench numbers in the Stop Point 1 report. 3D link republished.

## Next
Stop Point 1: waiting on Jack's answers (look choice, iPhone ?bench=1 screenshot, 10-minute playtest, canvas comparison). Then: apply the chosen look; hero car concepts and model; enemy class models; bring in the drops work (ecb7983) and the arsenal work (98bf28b) one at a time with determinism applied and replays recorded at each; drop chase camera; first mission.

## Headless lessons (this container, 4 cores)
- Only one SwiftShader (3D) browser at a time; two or more starve each other and the sim falls to 1/10 pace. Canvas pages are cheap.
- Bot screenshots wait for web fonts; the Google Fonts link does not load behind the proxy, so use `--noshots` for timing runs.
- `tools/pipeline` pattern: run recordings, replays, hairpins, postcards, bench, check, soak sequentially from one shell script.
- Replays: `graybox/replays/base-*.json` (flag off, Sprint C baselines) and `shunt/replays/wall-*.json` (flag on, step 6 baselines)
  must both match on every build; `replays/beauty.json` is the bench and postcard run (seed 3, flag off, 90 s).

## Sprint C work: driving v2 and weapons on buttons (commits titled "Sprint 4 ..." used an old numbering; see design/roadmap.md, sprints are A to G)
Jack's calls after Stop Point 1: the sim is open again. Done in step A (commit "Sprint 4 step A"):
- GAS (hold) to 1,300 pt/s, coast back to cruise, BRAKE to 260 then stop and reverse to -220 while held (`T.drive`).
- The 360: pad held + thumb dragged a lane past the road edge for 0.4 s at speed > 480 → spin at 420°/s, pays 300 + tier-3 turbo (`T.spin`).
- FIRE (hold): rotary guns spin up 0.3 s, 12 rounds/s along the heading with 10° aim assist, heat → 1.4 s rest (`T.rotary`); bullets carry vx, vy.
- SPECIAL (tap) fires the special (missiles/oil/nitro). Keys: W/Up gas, S/Down/Shift brake, Space/J/F fire, K/X special.
- Hero car (hero.js) is the player model; gun pods slide out with G.gunSpin; muzzle glow at the tips. Camera pulls back to 1,300.
- Replay format version 2 (off, brake, gas, fire, special, slam, flicks, p); v1 replays still load (fire → special). Old shunt
  baselines retired; new ones recorded with `--sync` bots (sim-paced) into replays/.
- `?lite=1` (half res, no shadows/post) for headless bots; `?cam=pitch,dist,fov` for camera comparison shots.
- This container's SwiftShader is ~4 fps at full quality: use `--sync` for every bot; never two browsers at once.

## Sprint C, Look to 8 stop points (session of 2026-10-04)
Stop 1 Environment, Stop 2 Cars, Stop 3 UI and performance; report and wait for Jack's go-ahead at each. Rules: enemy shapes are
original, from role descriptions only (no real makes, no spy-franchise cues), top-view sheet of all five shown before building;
hairpin barrier tuning frozen until Jack reports a human playtest; no scenery mood board. Approved for Stop 3: showroom title screen
(hero car slowly turning, lit to show the paint) inside the 150 draw-call budget.
- Stop 1 Environment (done, waiting on Jack's go-ahead): dark wet road (shader grain, damp sheen, puddles, light streaks for neon,
  lamps and car lights), real smoke (billow atlas, rotation, self-shadow, ground fade), prop kit `render/three/kit.js` replacing the
  box props (one merged draw per prop type), buildings turned to run along the street with shopfronts, awnings and roof units, street
  lamps at every light pool, debug readout (Settings > Debug readout or `?debug=1`: FPS, draw calls, triangles).
  Postcard moments re-picked for the current driving (`tools/shots.mjs`; `--only=a,b` for a subset; the wreck shot waits for a visible
  explosion). `tools/calls.mjs [t] [look]` prints one frame's draw calls by pass and object type (cars are the biggest cost: ~70).
- Next: Stop 2 Cars (top-view sheet of five original enemy designs for Jack's approval before building), then Stop 3 (UI, showroom
  title, tune panel, fonts, draw calls under 150).
- Stop 2 (hero import approved; enemies will be Jack's Meshy GLBs, not code): `carModel.js` fits, measures and paints any car GLB
  (one draw per body); `heroModel.js` adds the spinning wheel set at the measured radius (0.302 m) and the side-intake paint;
  `enemyModels.js` loads `assets/models/<dart|ram|turret-van|bulwark|mule>.glb` into one InstancedMesh per type (see
  `assets/models/README.md`); types without a file keep the placeholder boxes. Outline follows the imported body. Smoke starts at
  1.1 m; missile exhaust grows 1 to 2.6 m. `tools/heroshots.mjs <out> [query] [views]` takes gameplay, rear three-quarter, top-down.
  Next: Jack's Dart GLB (set its nose in ENEMY_NOSE after a side-view check), then the other four; Stop 3.
- Stop 2 done (v17): camera A/B toggle, landmark night lights, simplified cones/rooftop_ac/newsstand, traffic_car.glb with per-car
  body colour (one draw).
- Stop 3 UI and performance (v18, accepted by Jack 2026-10-05):
  - Showroom title (`src/render/three/showroom.js`): the hero on a slow turntable under a studio environment map (softboxes), key plus
    magenta and violet rims, a dark lacquer floor with a mirrored reflection (the floor is 94 to 100% opaque: the car is HDR under it),
    magenta/violet neon tubes and haze, drawn through the game's post chain while the title card is up (28 calls, 23k triangles).
    `?showroom=0` keeps the old title over the road. Shots: `tools/titleshot.mjs <out.png> [query]`.
  - Front close-ups: the hero's headlight sprites, wet-road streaks, headlight pool and readability glow fade within 40 m, most when the
    camera faces the nose; the model's own headlight glow dims with them (`HEAD_K` in heroModel.js). Bullets are slim HDR tracers.
    `tools/heroshots.mjs <out> [query] front,front-34 [sim seconds]`.
  - HUD: score plate with a cyan edge (42 px), ARMOR bar, speed; missile count badge on the special button; the steer hint sits over
    the free thumb area (bottom left, mirrored for left hand), clear of the buttons. Safe areas: html padding carries
    env(safe-area-inset-*), `fit()` turns it into `--safe-top` and `--safe-bottom`; `?safe=59,34` fakes a notch for headless shots.
  - Fonts: Rajdhani 600/700 embedded (`src/ui/fonts.js`, OFL, 31 KB); no Google Fonts request.
  - Tune panel: static import (the lazy chunk never loaded in the single-file build), Settings > Developer > Tune panel, per-look
    working copies, 13 px touch rows, Copy look JSON, Reset this look.
  - Traffic: plain non-metallic paint and a 60% hue hold after lighting so the four colours read at dusk and blue hour; rims grey.
- Sprint C status: code done (v18, https://claude.ai/artifact/Ae94og4nbVyk46LuFhsYPn). The sprint closes on Jack's iPhone playtest of
  v18. Do not start Sprint D until then.
- Recorded in design/roadmap.md: Sprint F segment 5 "The Refit" (the Mule dock cinematic, mount points on the hero); carried into
  Sprint D: swap silver traffic for a mid gunmetal grey (silver and white both read as cream at dusk).
- Next: Jack's playtest notes on v18, then Sprint D (first item: the hood gatling and the handbrake 180).
