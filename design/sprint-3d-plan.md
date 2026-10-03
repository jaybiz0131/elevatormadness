# Shunt 3D port: plan (Sprint 3D, Steps 1–7)

Base: `2c9dc9f` (Sprint C canvas). Branch `shunt-3d`. Brief: `design/sprint-3d-port.md`. Handoff: `HANDOFF.md`.

## Module map (Step 3 target; Step 2 is done inside the single file first)

```
spycar/shunt/                 Vite project (three + postprocessing pinned from npm)
  index.html                  artifact page shell; HUD and cards are HTML/CSS over the canvas
  src/main.js                 loop, phases (title/countdown/playing/dying/over/paused), wiring, window.__shunt
  src/sim/                    headless: never imports three, never touches the DOM or the frame clock
    constants.js              T (tuning), DISTRICTS, sizes — frozen Sprint B/C numbers
    rng.js                    mulberry32 with readable state, hashI, fnv1a
    road.js                   Road (pieces, corners, crests, sectors, world transform)
    state.js                  newRun(seed, cfg) → G; makeCar; pools; compact
    physics.js                physics step: steering, drift, corners, cars, collisions, bullets, missiles, fx lists
    director.js               script() and director() (run once per step), spawners
    combat.js                 slam, damage, gun, wreck, barrels, score, pickups, specials
    sim.js                    Sim: step(snapshot) at 1/120 s; event outbox; hitStop/slowmo in step time
    hash.js                   stateHash(G) every 120 steps (positions, velocities, headings, health, score, rng)
    replay.js                 Recorder (per-step snapshots, RLE) and Replayer (feeds snapshots back)
  src/input/                  pointer + keyboard → one InputSnapshot per step {off, brake, slam, fire, flicks}
  src/audio/                  Web Audio; consumes sim events (sfx names), engine/drive layers read G
  src/ui/                     HUD (score, armor, speed, combo, chevrons), callouts, cards, settings, pad, special
  src/render/                 Renderer interface: resize(), render(G, alpha, dt, phase), stats(), dispose()
    canvas/                   the Sprint C canvas renderer, moved verbatim (kept for parity and as fallback)
    three/                    all three.js code: renderer, camera, road mesh, cars, props, fx, post, looks, tune
  replays/                    baseline replays (seed × bot), JSON
  tools/                      playtest.mjs (bots), replay.mjs (hash check), shots.mjs (postcards), bench.mjs
```

The sim talks outward only through `G` (read by the renderer, HUD and audio) and an event outbox
(`callout`, `sfx`, `buzz`, `shake`, `special`, `rebaseAnchor`) drained by `main.js` after each frame's steps.

## Determinism (Step 2, in the canvas file, before any 3D)

- One snapshot per step: `off` (target offset from road centre; thumb or keys, sensitivity applied in input),
  `brake`, `slam` (−1/0/1 latched request from flick, tap, keys or bot), `fire`, `flicks`.
  `carAnchor` stays in the input layer; the sim's post-Slam rebase becomes an event the input layer applies.
- All `Math.random` in the sim → `G.rng` (laneTimer, car id, Slam skid marks, missile smoke).
- `script()`/`director()` run once per step. `teachT`, `slowmo`, `hitStop` count in step time.
  `hitStop` is a frozen step (decrements, nothing else moves). Dying runs steps at 0.3× from the loop.
- Presentation timers on `G` (`vignette flashT flashT2 speedLines punch trauma kick`) decay inside the step;
  `kickShake` always writes; the renderer applies the shake setting. They are excluded from the hash.
- `S.sens`, `S.autoDrift` are read at run start into `G.cfg` and stored in the replay header.
- Hash: FNV-1a over the exact float64 bits of the state list, every 120 steps. Same-engine comparison only.
- Replay JSON: `{version, seed, cfg, bot, steps, inputs (RLE), hashes}`; `?seed=` and `__shunt.loadReplay()`.

## Renderer architecture (Step 4–5)

- Scale: `M = 4.5 / 60 = 0.075 m per pt` (player car 60 pt → 4.5 m; lane 62 pt → 4.65 m). Applied only in
  `render/three`. World: `position = (X·M, elev·M, −Y·M)`, yaw = −(frame.psi + heading).
- Road: chunks of 400 pt, sampled every 10 pt from `Road.frame`; one merged BufferGeometry per chunk
  (asphalt, lane dashes, curbs, rumble, rails, tyre walls, puddle mask in vertex attributes); chunk ring
  recycled ahead of the camera. Corner furniture and props instanced per kind, placed by `propHash`.
- Cars: pooled meshes per kind (placeholder boxes with class colours), contact-shadow quad under each.
- FX: smoke (600 instanced soft quads, sorted), skids (2,000-segment ring buffer, fading 15 s), sparks (Points,
  additive), explosions (flash + fireball + 8–16 debris + shockwave ring), speed lines, headlight cones.
- Camera: perspective 40° FOV, 55° pitch, player in the lower third, heading spring (critically damped)
  toward the road heading ahead; pull-back and FOV widen with speed; shake = capped offset.
  Warning-time check: log the seconds between a spawn entering the frustum and reaching the player, in both builds.
- Lighting: 1 directional key with a 2048 shadow map fitted around the player and texel-snapped, hemisphere fill,
  small PMREM environment, everything else emissive or additive. One merged post pass (pmndrs postprocessing:
  bloom, LUT3D per look, vignette, noise, chromatic aberration at speed, tone mapping), MSAA 4×.
- Looks: `looks.js` holds night / dusk / bluehour parameter sets; `?look=`, on-screen toggle, `?tune=1` (lil-gui
  from three's examples), defaults saved to `design/style-guide.md`.
- Perf: DPR ≤ 2, dynamic resolution 1.25–2, pooled vectors, `compileAsync` prewarm, context-loss handling,
  `?perf=1`, `?bench=1`, `?bench=soak`.
- Publishing: Vite build, then the bundle is inlined into one HTML file for the artifact (no external scripts).

## Top risks

1. **Input determinism.** Flicks and taps are judged on event timestamps; bots poke `input` at 10 Hz on the wall
   clock. Mitigation: everything the sim sees is the per-step snapshot; the recorder stores exactly that.
2. **Hidden frame-clock reads.** `elapsed`, `now`, `setTimeout` and the rAF `dt` leak into the sim in six places
   (HANDOFF table). Mitigation: grep gate in the replay tool; the hash check across two different frame rates.
3. **Hairpin readability in 3D.** R 160 pt = 12 m: at 55° pitch the exit is visible, but the road must not
   self-overlap in the mesh (chunks are independent, drawn with depth test, so overlap is fine).
4. **iPhone 12 budget is unmeasurable here.** Headless numbers only; merged chunks and instancing keep draw calls
   under 150; the bench page is the real test, on Jack's phone.
5. **Context budget of the sprint itself.** Modules are small and single-purpose; subagents own disjoint files;
   `design/sprint-3d-progress.md` is written if context runs low.
