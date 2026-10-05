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

## Sprint 4 (driving v2 + weapons on buttons), in progress
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
- Settings > Developer: Camera A (high, Sprint 3D) / B (low and close, Sprint 4) and Show FPS (now + lowest in 10 s), both remembered (`localStorage` key `shunt-settings`: `camera`, `showFps`).
- Pacing director (`src/sim/director.js`, replaces the scripted first minute and the 40 s / 10 s wave cycle): waves every 8 to 15 s by progress (Darts, Rams, Gunners, a Bulwark), a floor so the road is never quiet (spawns at once if no attacker in the window), weave lines of slow traffic, pickups (armor, missiles) when low, near-miss bonus. Names: Dart = kind `weak`, Ram = `bruiser`, Gunner = `gunner`, Bulwark = `armored`. Dart is now a real attacker (short tell, 0.5 armor clip).
- Gatling (`wpn_gatling.glb`, built by `tools/make-gatling.mjs`, inlined with Vite `?inline`): `T.gatling`, no aim help, 1 s spin-up, 20 rounds/s, spray of +-3 degrees. Hit: sparks + flash + tick + tiny kick. Kill: 60 ms hit stop, shake, flash, bigger explosion, score popup. Ram hits: crunch sample, sparks, shove (`slideVx`), kick.
- Goal: `T.goal.city` = 120,000 pt (about 3 minutes), progress bar at the top, combo x2..x5 (3 s chain, 4 s hold, crash resets), finale at 90% (soft heavy wave + Bulwark), `win()` at the city, end card with stars (`T.goal.stars`).
- Mercy rules (for weak drivers): half damage for 60 s, `T.mercy` pause after a hit (double on one pip), heavy enemies become Darts on one pip, armor crate within 1.5 s when on one pip, finale enemies are soft.
- Hero car: static meshes merged by material (about 90 meshes to 10): the frame was 187 to 197 draw calls before this stop, 114 after (full quality).
- Bug found by determinism check: `nearLane` could return `undefined` (player off the lane range) which spawned a NaN car and a NaN bot input; fixed, and `input.snapshot` refuses NaN.
- Baselines: `replays/fun-s{1,2,3}-{active,idle}.json` and `replays/beauty.json` (rev D1). The six `wall-*.json` Sprint 4 baselines are retired (they cannot match this sim).
- Tools: `tools/pacing.mjs` (dead-time report from replays, `--weakAttacks` after D1), `tools/killcam.mjs` (frame-by-frame capture of a kill sequence), `tools/wincard.mjs` (finale and end card shots), `tools/make-gatling.mjs`, playtest `novice` mode and `?fine=1` per-6-step hashes for debugging a replay divergence.
