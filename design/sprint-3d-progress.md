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

## Next
See the bottom of the brief: Step 7 checks, publish, report, Stop Point 1 questions.
