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

## Sprint D, Stop 1: FUN FIRST (branch `shunt-3d`)
Jack's v18 verdict: not fun yet (nothing happening, no goal, hits feel weak). Done in this stop, sim changed (replay rev `D1`):
- Settings > Developer Camera A/B and Show FPS: already on the branch from the Sprint C session (`S.cam`, `S.debug`); my duplicate was dropped in the merge.
- Pacing director (`src/sim/director.js`, replaces the scripted first minute and the 40 s / 10 s wave cycle): waves every 8 to 15 s by progress (Darts, Rams, Gunners, a Bulwark), a floor so the road is never quiet (spawns at once if no attacker in the window), weave lines of slow traffic, pickups (armor, missiles) when low, near-miss bonus. Names: Dart = kind `weak`, Ram = `bruiser`, Gunner = `gunner`, Bulwark = `armored`. Dart is now a real attacker (short tell, 0.5 armor clip).
- Gatling (Jack's `assets/models/wpn_gatling.glb`, removed from `NOT_YET`, loaded by `render/three/gatling.js`; one mesh, so a ring of glints shows the spin): `T.gatling`, no aim help, 1 s spin-up, 20 rounds/s, spray of +-3 degrees. Hit: sparks + flash + tick + tiny kick. Kill: 60 ms hit stop, shake, flash, bigger explosion, score popup. Ram hits: crunch sample, sparks, shove (`slideVx`), kick.
- Goal: `T.goal.city` = 120,000 pt (about 3 minutes), progress bar at the top, combo x2..x5 (3 s chain, 4 s hold, crash resets), finale at 90% (soft heavy wave + Bulwark), `win()` at the city, end card with stars (`T.goal.stars`).
- Mercy rules (for weak drivers): half damage for 60 s, `T.mercy` pause after a hit (double on one pip), heavy enemies become Darts on one pip, armor crate within 1.5 s when on one pip, finale enemies are soft.
- Code hero (`hero.js`, the fallback) merged by material (about 90 meshes to 10). After merging the Sprint C models: at most 103 draw calls, 367k triangles, 11.1 MB.
- Bug found by determinism check: `nearLane` could return `undefined` (player off the lane range) which spawned a NaN car and a NaN bot input; fixed, and `input.snapshot` refuses NaN.
- Baselines: `replays/fun-s{1,2,3}-{active,idle}.json` and `replays/beauty.json` (rev D1). The six `wall-*.json` Sprint 4 baselines are retired (they cannot match this sim).
- Tools: `tools/pacing.mjs` (dead-time report from replays, `--weakAttacks` after D1), `tools/killcam.mjs` and `tools/showcase.mjs` (frame-by-frame capture), `tools/wincard.mjs` (finale and end card shots), playtest `novice` mode and `?fine=1` per-6-step hashes for debugging a replay divergence.

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

## Sprint D
- Stop 1 (fun first): pacing director, gatling, the 3 minute run with combo and finale. Report: design/fun/stop1-report.md.
- Stop 2 (looks finished, hits hard, never dies): world to 4,000 pt with a fog floor, spawns out of sight, camera B default and closer, kill feedback v2,
  enemy damage states, combat race (limp and repair, speed costs, kill bursts, time plus score grade), HUD clock, lighter lamp, sign atlas, automatic render scale.
  Sim changed: new baselines in `spycar/shunt/replays/`. Report: design/stop2/stop2-report.md.
- Stop 3 (physics and feel, 2026-10-06; plan rewritten in design/roadmap.md, Sprint D = Stops 3 to 5, then E to H). Sim changed (replay rev `D3`):
  - Crash physics: `src/sim/crash.js`, Rapier deterministic build (`@dimforge/rapier3d-deterministic-compat` 0.21.0). The package's base64 wasm is swapped for a
    gzipped copy by the `rapierWasm` plugin in `vite.config.js` (+1.8 MB build instead of +4.4 MB); `initCrash()` inflates it with fflate before the first run.
    Hybrid: live cars and the hero stay arcade (kinematic boxes in Rapier); a wreck is a dynamic body (cap 6, oldest retired). Road space straightened:
    X across, Y up, Z = -s. Steps at 60 Hz on even ticks, dormant with no wrecks. Hits come back as `G.crashHits` -> `crashHit()` in physics.js (pile-ups,
    civilian spin-outs, building slams, hits on the hero). `?crash=0` turns it off (old slide) for comparisons; Show FPS has a `physics` line.
  - Hero: `G.body` (roll, pitch, two wheels) and `G.roll` (rollover) in physics.js (`suspStep`, `rollStep`, `heroRoll`); the renderer pivots the car on its outside wheels.
  - Controls: no BRAKE, no GAS (CSS hides #pad and #gas); automatic speed `T.drive.auto` with a corner lift; automatic drift (`T.drift.startU` etc.); gatling spinUp 0.
  - Tools: `tools/simtest.mjs` (sync scripted run, counts and step cost), `tools/capture.mjs` (stills from a replay), `tools/clip.mjs` (mp4 from a replay or seed, `--find=pileup|roll|two|wallslam`).
  - Report: design/stop3/stop3-report.md. Build v25 https://claude.ai/artifact/Ae94og4nbVyk46LuFhsYPn. Baselines `replays/feel-s{1,2,3}-{active,idle}.json` and `beauty.json` (rev D3).
- Next: Stop 4 (camera director, Camera Lab, hills and jumps) after Jack's go-ahead.
- Stop 3 (done by another session): Rapier crash physics, pile-ups, two wheels, rollover, automatic drift. Report: design/stop3/stop3-report.md.
- Stop 4 (controls, carnage and cameras): BRAKE back with the brake-tap drift, no auto-fire, FIRE and BRAKE side by side, MISSILE above, BOOST spot reserved; fewer civilians and every hit on one is catastrophic (launch, civilian pile-up bonus); cameras A, B, C
  (title card selector, Settings, in-play button); camera director with seven named shots, corner/drift cam, see-through buildings, hero shots with a budget and tap to skip, Fewer hero shots; Camera Lab in the tune panel.
  Sim changed: new baselines (rev D4). Report: design/stop4/stop4-report.md. Next: Stop 5 (hills and jumps, boost, the turn-around move, shock mines).
- Stop 5 checkpoint (cut short by Jack's change of plan): hills and jumps (rolling height profile, jump crests, ballistic air with soft landings, wrecks on a terrain-following
  ground, ramps over a pile of wrecks, airtime as an earned hero shot), BOOST (meter on the button, flame, lens kick), shock mines (hold MISSILE, pursuer tumbles into the
  others, crates refill), regrade on time, score, takedowns, pile-ups and best combo. The swipe turn-around was built, then removed (replaced by the e-brake 180 in the next stop).
  Sim changed: baselines `replays/hill-s{1,2,3}-{active,idle}.json` and `beauty.json` (rev D5, replay format 3). The `ctrl-*` D4 baselines are retired.
- Driver control and carnage (Jack's change of plan after v26, in the same session as the Stop 5 checkpoint). Sim changed: replay format 4 (an analog throttle in
  sixteenths, plus the e-brake), rev `D6`, baselines `replays/drive-s{1,2,3}-{active,idle}.json` and `beauty.json`; the `hill-*` D5 baselines are retired.
  - Player-set pace (`sim/physics.js` driveSpeed and driveSteer): analog gas, coast, brake to a stop, reverse; the e-brake drifts in a bend, spins a 180 with full steer
    (`startFlip`/`flipStep`, `G.face` is the nose's direction down the road, `bodyA()` the hero's yaw), and gas plus e-brake at a stop is a burnout (`G.bo`, a fishtail spring, a launch on release).
  - Enemies adapt (enemyAI): U-turns (`c.face`, `c.ut`), Rams and Darts charge from either end when the player is slow, gunners face the player from either end; civilians follow and change lanes.
    The director paces on max(distance, time / 240 s); civilians spawn behind a slow player.
  - Puck (`input/input.js`, `#puck` in index.html): up gas, down brake and reverse, right fire, left e-brake; MISSILE (tap missile, hold mine) and BOOST above; Settings > Simple buttons;
    after a 180 the steering is mirrored (`input.onFace`). Bots set `inp.raw` and drive the throttle through `tools/pace.js`.
  - Carnage: `render/three/carChunks.js` splits each car model into eight parts at load; `sim/crash.js` runs them as Rapier bodies (cap 16, groups WRECK and CHUNK); a piece can flip an enemy.
    `render/three/explosions.js` is fire first (fireball, base flames, embers, black smoke; no white flash or rings).
  - World and camera: street front set back 96 pt behind the pavement, no overpasses or gantries; camera C is the default and follows the car 70% across the road; no hero shot during or
    2.5 s after a 180 or a burnout; tyre smoke thins on the camera-to-car line.
  - Tools: `tools/dctest.mjs` (reverse, 180, burnout and a 50 s stand-off), `tools/dcscen.mjs <out>` (showcase replays for clips), `tools/puck.mjs`.
  - Report and clips: design/stop5/stop5-report.md. Build v27 https://claude.ai/artifact/Ae94og4nbVyk46LuFhsYPn. Next: Jack's hands on the puck, then the next stop.
- Stop 6, FEEL AND CHAOS (Jack's v27 verdict: awesome, he drove slowly to watch the carnage). Sim changed: rev `D7`, baselines `replays/chaos-s{1,2,3}-{active,idle}.json` and `beauty.json`; the `drive-*` D6 baselines are retired.
  - Puck (`input/input.js` puckMove): touching it anywhere is GAS (thr 1). Only a deliberate pull down lifts it (`BRK` = [0.30, 0.62, 0.30]: where the pull starts to lift in the
    centre and in the FIRE and E-BRAKE zones, and how far it runs to full brake); sliding right adds the gatling, sliding left the e-brake, neither cancels the gas. Lift off is the only coast.
    `sim/physics.js driveSpeed`: gas keeps driving in an e-brake drift (and builds drift speed); gas with the e-brake held on a straight holds the speed (no drive, no lock-up); e-brake with no gas still
    locks the wheels (`E.decel`); gas + e-brake below 60 pt/s is still the burnout. `tools/puck.mjs <outDir>` drives the real pointer events and fails on a wrong mapping.
  - Smoke cloak (sim): `G.cloak` 0..1 charges from a burnout, a long drift, the 180 and a skidding e-brake and thins with time and speed (`T.smoke`); `G.cloakOn` (on 0.55, off 0.30)
    freezes `G.seenX/seenY` and lets the enemies wander round them (`enemyAI`: `lost`, `px/py/pf`, a '?' pop); a Gunner aims `T.smoke.wide` pt wide (`G.wideShots`). Hero's guns unaffected. HUD: CLOAK bar.
    Render (`render/three/chaos.js` drawCloak): a pool of big puffs in the tyre-smoke batch (`Q.cloud`: 56 high, 28 low), the camera-to-car line thins to 0.3, puffs the camera sits in fade.
  - Buildings: `render/three/layout.js` (pure; city.js and the sim both read it) places every plot and tests it against the whole road (a hairpin's far arm and loops that come back count);
    the old generator put buildings on the road where the road crosses or doubles back on itself. `tools/buildcheck.mjs` fails `npm run build` under 40 pt of clearance; `--legacy` reports the old
    generator; `tools/buildmap.mjs` draws old vs new. The sim's building walls are now one Rapier box per real plot (`sim/crash.js syncWalls`), so no invisible wall in front of a tower.
    `facadeAt(road, side, s)` gives the face a decal or fire sits on.
  - Building chaos (sim state, `sim/facade.js`): `G.scars` (decals), `G.fires` (facade fires) and `G.heatCells` (chips and blasts heat a 48 pt cell, 6 heat = fire). A round that crosses the road
    edge and meets a plot chips it; a wreck that hits a building at over `T.crash.wallBoom` (13 m/s) blows up there once and pays WALL SMASH; pieces chip walls. `crash.js impactSpeed` now
    reads the speed before the solver for walls and rails. Render (`chaos.js drawFacade`): one instanced decal draw, dust, plaster, glass flecks, sparks, flame tongues (`fx.flames` batch) and smoke on the face.
  - Audio (`audio/audio.js`): tyre squeal and scrub and burnout roar driven by `setDrive({slip, burn, turn, lock, speed, scrape})`; five heavier gatling rounds, an accent round and a low rumble bed
    (no tone above about 1.2 kHz). `tools/audioclip.mjs <wav> [scene]` renders any of it offline.
  - Tools: `tools/s6test.mjs` (scenarios: burnout, wallfire, drift, gunnerwide, chip), `tools/s6clip.mjs` (scenario clips: puckfire, cloak, wallspray, carboom; `--find=chip|fire|wallboom|cloak`),
    `tools/s6still.mjs`, `tools/s6events.mjs <replay>`, `tools/audiolive.mjs`. `window.__shunt.fling(car, m/s)` is a staging hook.
  - Report and clips: design/stop6/stop6-report.md. Next stop (not started): heat, roadblocks, drone, enemy weapons, audio loaded as separate files.
- Stop 7, THE FIRST 30 SECONDS (Stop 6 accepted; Jack's v28 FPS note was empty, so no perf change). Sim changed: replay format 5, rev `D8`, baselines `replays/open-s{1,2,3}-{active,idle}.json` and `beauty.json`; the `chaos-*` D7 baselines are retired.
  - TAP TO START (`main.js` phase 'tap'): the spinning showroom car with a pulsing prompt; the tap (click, touchend or key: the iOS audio gestures) plays `theme_full.m4a` from 0:00 every time, the SHUNT logo punches in at the beat
    (`audio/files.js findHit`, or `hit` on `FILES.theme_full`), the menu follows with the music running; PLAY crossfades into `theme_loop.m4a` (loopStart 0, loopEnd 82.5612). `audio/music.js` is the director.
  - Opening scene (`sim/intro.js`, `T.intro`): 4.4 s after PLAY, in the sim: empty road, a beat of quiet, an off-screen roar, the hero slides in from the right, a screeching 180, a stop facing down the road, pursuer headlights
    (`chaos.js drawChasers`), the camera swings front to behind (`camera.js applyIntro`, blended into camera C), GO with `G.t` = 0. The starting ramp is gone; the first wave is two Darts 470 pt behind (on the car 2.54 s after GO).
    A tap or key skips it once `S.introSeen` (recorded in the replay). `?intro=0` turns it off (the old 0.6 s countdown).
  - Audio as files: `assets/audio/*.m4a` -> `dist/audio/` (outside the page); `audio/files.js` manifest `FILES` and loader (fetch, decode, retry, `files.get`, `audio.playFile`) for Jack's engine recordings later; Music and Effects
    sliders in Settings; the theme ducks for the gatling and blasts. **The two m4a files are PLACEHOLDERS** (`tools/mkplaceholder.mjs`); Jack's drop in with the same names.
  - Tune panel: Puck folder (`lift`, `liftSide`, `run`, `zone`; copy and reset); `input/input.js PUCK` is the live object.
  - Tools: `tools/introtest.mjs`, `tools/openclip.mjs <out.mp4>` (the full opening with the music), `tools/mkplaceholder.mjs`; `__shunt.startPlaying()` now hides the TAP TO START screen, `playtest.mjs` ignores the file:// audio fetch error.
  - Report and clips: design/stop7/stop7-report.md. Next stop (not started): heat, roadblocks, the drone, enemy weapons.
- Stop 7 follow-up and FIX (rename, assets, sound; Jack's iPhone test: no music, plain text logo, pinging hits, high engine, bad squeal). Sim unchanged: all baselines (`open-s*`, `beauty.json`, rev D8) still match.
  - Rename: the game is BERN-1 (page title, title logo, `apple-mobile-web-app-title`); repo and branch names unchanged. The only player-facing "SHUNT" was the title logo and the page title.
  - Everything embedded (published files beside the artifact did not load on iOS): `assets/audio/theme_full_64k.m4a` (first 95 s, 64 kbps) is one buffer with Web Audio loop points 12.045 to 94.6062 (`FILES.theme`, `audio/files.js`, `audio/music.js`); the separate theme files and the .mp4 fallback are gone (originals in `assets/audio/source`). `assets/brand/bern1_title_fire.jpg` is the title logo (screen blend over the showroom, `index.html` `.logo img`), `apple-touch-icon-180.png` is a data URL in the page head (`tools/inline.mjs`); `bern1_app_icon_1024.png` and the title PNG master stay in `assets/brand`. `tools/brand.py` makes the jpg and the 180 icon from the masters.
  - Show FPS has a line `audio OK` / `audio loading` / `audio FALLBACK: <file>` (`files.audioLine()`); a decode that does not answer in 20 s ends in the fallback.
  - Sound (synth, measured by spectrum, not heard): `audio.smash(force)` layers a low boom, a metal crunch, glass and a debris rattle by force and replaces crunch, wreck, ram, kill, damage, death; every ping (hit, ping, chain, mine, sight, chirp) is a low thud or low buzz; the engine is about an octave lower (pulse 0.62x, body 38, 76 and 114 Hz, heavier sub, harder growl clip); the tonal tyre squeal is gone (low band-passed scrub follows slip, the burnout is a deep low-passed roar).
  - Report: design/stop7/stop7-fix-report.md.

