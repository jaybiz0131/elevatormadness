# Sprint D, Stop 3: Physics and feel (report)

Build: https://claude.ai/artifact/Ae94og4nbVyk46LuFhsYPn (version 25). Branch `shunt-3d`. Stop 4 is not started.

## Stop point summary

| Item | Status |
|---|---|
| 0. Roadmap | Done. `design/roadmap.md`: Sprint D = core chase (Stops 3 to 5), E = course part 1, F = course part 2, G = Mule Refit, boss, payoff, H = polish and ship. Boss and weapon modules held until Sprint G (roadmap, model inventory, `vite.config.js`). |
| 1. Physics trial | **Rapier passes on size and determinism; the FPS gate needs Jack's phone.** Numbers below. |
| 2. Crashes and carnage | Done: flips, tumbles, explosions and fire for enemies; spin-outs, skids, rolls and smoke for civilians (explosion only on heavy hits); pile-ups count as takedowns with a bonus; building slams with sparks, glass and flying parts; landing on a car crushes its roof. |
| 3. Suspension and lean | Done: body roll, squat and dive, landing compression, two wheels in hard turns with a slam back down, the hero rollover (damage, lands on its wheels). |
| 4. Controls | Done: no BRAKE and no GAS; drift is automatic from steering and a held drift builds speed; FIRE and MISSILE; the BOOST spot is kept free. |
| 5. Gatling | Done: fires on the press, no spin-up. |
| 6. Kill feedback | Done: smaller rings, small score numbers riding on the wreck, shorter hit stop and slow motion. |
| 7. Brightness | Done: exposure, fill, a rim on every car and wreck, lamp light across the lanes, wrecks glow, explosions and fires light cars and road longer. |

## 1. Physics trial verdict

**Verdict: keep Rapier (hybrid).** It passed the size and determinism gates here; the FPS gate is Jack's phone and I cannot measure that from this container.

| Gate | Limit | Result |
|---|---|---|
| Size added | about 2 MB | **+1.82 MB** (11,279,036 to 13,098,051 bytes). The package ships its 3.1 MB WebAssembly as 4.1 MB of base64 (that alone would have failed); the build swaps it for a gzipped copy (1.17 MB, 1.56 MB as base64) that fflate inflates at start. The rest is Rapier's JavaScript and fflate. |
| Frame cost | Jack's FPS low 50+ | Sim step, same scripted 60 s run, x86 Chromium: **0.068 ms without physics, 0.11 to 0.14 ms with it** (+0.05 to 0.07 ms a step, about +0.1 ms per 60 fps frame). Rapier itself: about 0.14 ms per physics step while wrecks are tumbling. The renderer is unchanged in cost per wreck (the wrecks are the same instanced models). **Needs Jack's phone: Show FPS, the 10 s low.** |
| Determinism | same inputs, same crash | **All 7 new baselines match on two sync passes (14 of 14, every hash), and `beauty.json` matches through the live 3D frame loop (90 of 90 hashes, 2,502 s of software GL) through the live 3D frame loop.** The recordings were made in separate browser sessions from the checks, so a fresh page rebuilds the same physics world and gets the same crashes. |

How it is wired (`spycar/shunt/src/sim/crash.js`):
- **Hybrid.** The hero and every live car keep the tuned arcade model in `physics.js`. They ride along in Rapier as kinematic boxes, so a wreck hits them. A car that is wrecked or knocked hard becomes a dynamic rigid body and flips, tumbles, rolls and bounces off the road, the kerb rail, the building faces and other cars until it rests.
- **Deterministic.** The deterministic Rapier build (`@dimforge/rapier3d-deterministic-compat` 0.21.0). A new world for every run, bodies created and removed only inside the fixed step in a fixed order, and every wreck's pose is copied onto its car each step so the state hash covers the physics too.
- **Cheap.** Rapier steps at 60 Hz (every other sim step; wrecks coast on their velocity in between) and not at all when nothing is tumbling. At most **6** dynamic wrecks; a 7th retires the oldest (it stays where it lies, frozen). Debris, glass and flying parts are render-side and drawn from the existing fixed pools (no allocation).
- **Fallback.** If the WebAssembly cannot start on a device, the game runs with the old wreck slide and Show FPS says `physics FAILED` with the reason. `?crash=0` forces that for comparisons.

Show FPS now has a `physics` line: `physics rapier 2/6 wrecks, 9 cars, 0.140 ms/step` (how many wrecks are tumbling, how many cars have boxes, the measured cost).

## 2. Crashes and carnage

What happens now (Rapier does the motion, the sim decides what a hit means: `crashHit` in `physics.js`):
- **Enemies** explode and are thrown: gun and missile kills launch the car upward tumbling; a Slam or a shunt trips it over its shoved side; a ram from behind sends it end over end; a stomp flattens it and spins it away. Then it burns for about five seconds.
- **Civilians** hit hard by a wreck (above 7 m/s) spin out and skid, roll above 15 m/s (or a quarter of the time), smoke, and keep their paint. They explode only above 26 m/s.
- **Pile-ups.** A tumbling wreck that hits a live enemy above 8 m/s takes it down too: a takedown with the PILE-UP label, double score and a 150 bonus. Chains continue as long as wrecks keep hitting cars. The player's credit travels with the wreck.
- **Buildings.** The kerb rail is low in the physics, so a tumbling car trips over it into the building faces: sparks, glass falling from the facade, bumpers and wheels flying back across the road, then it lies there for a few seconds.
- **Landing on a car** crushes its roof, the struck car spins out from under the hero, and the hero bounces.
- **The hero bashes through wrecks**: a wreck in the way is thrown aside and up off the bumper, for a small speed loss.

Counts from four scripted runs to the city (seeds 2, 5, 7 and a weak driver on seed 3): 8 to 16 pile-ups, 3 to 11 civilian spin-outs, 5 to 9 building slams per run.

**Pile-up clip (10 s):** `design/stop3/clips/pileup-10s.mp4`, from the `feel-s1-active` baseline at 21 to 31 s, the gameplay camera. A wreck goes into a weave line of traffic at 25 s: it takes an enemy with it (a PILE-UP, "+1,050 PILE-UP" riding on it), civilians spin out, wrecks slam the barrier. Still: `clips/pileup-still.jpg`; contact sheet `clips/pileup-sheet.jpg`.

## 3. Suspension, two wheels, rollover

- **Body**: roll with the lateral load, squat under acceleration and dive under the corner lift, compression on landings (spring and damper stepped in the sim, `G.body`).
- **Two wheels**: past the grip limit in a hard turn (not drifting) the inside wheels lift up to 22 degrees and the car pivots on its outside wheels; when the load eases it slams back down with sparks and a thud. About 8 to 13 times a run.
- **Rollover**: a wreck flung sideways into the hero, a barrel blast right under it, or a Ram or Dart lunge that lands while the car is on two wheels throws the hero once round its long axis in about a second. It takes one armor pip and always lands on its wheels. 0 or 1 per run in the scripted runs.

**Two-wheel clip:** `design/stop3/clips/two-wheels.mp4` (seed 5 at 5.7 s, half speed, a low chase camera): the car comes out of a drift into the first sweeper, lifts onto its outside wheels for about half a second (18 degrees), then slams down with sparks and a dust ring. Still `clips/two-wheels-still.jpg`, sheet `clips/two-wheels-sheet.jpg`.

**Hero rollover clip:** `design/stop3/clips/hero-rollover.mp4` (seed 5 at 45.5 s, half speed): the car drives over a barrel, the blast throws it once round, a wreck tumbles past, and it lands on its wheels and drives on. Still `clips/hero-rollover-still.jpg`, sheet `clips/hero-rollover-sheet.jpg`.

## 4 and 5. Controls and the gatling

- BRAKE and GAS are gone. Speed is automatic (the old gas speed, 1,000 pt/s) and the car lifts by itself for a hard corner it would not hold, so a weak driver never hits the hairpin wall (0 wall hits in all runs, including the no-input runs).
- **Drift is automatic**: steer hard (past about 60% of the thumb's reach) for a tenth of a second at speed, or steer into a corner the tyres cannot hold. The harder the steer, the wider the slip angle (18 to 52 degrees). A held drift builds speed (up to +260 pt/s) and skips the corner lift, so drifting is the fast way round; the drift tiers still give their turbo on exit.
- Buttons: FIRE (the big one, bottom right) and MISSILE beside it. The spot above FIRE is kept free for BOOST.
- The hairpin lesson now says "Steer hard to drift".
- **The gatling fires on the press**: no spin-up delay.
- Runs: the active bots reach the city in 106 to 108 s, the no-input bots in 135 to 149 s. The grade clock moved to match the faster runs (S time is 105 s, the slowest 210 s).

## 6. Kill feedback

The crash is the show now. The white kill ring is gone, the orange explosion rings are at about a third of their old strength, and a kill's score is a small number (16 px) riding on the wreck as it flips ("+300", or "+600 PILE-UP"). Other popups are smaller (17 px, big ones 20 px). Hit stop: gun kill 50 ms (was 100), car kill 70 ms (was 150), stomp 80 ms; the slow motion after a car kill is 0.18 s at 0.6x (was 0.3 s at 0.5x).

## 7. Brightness

- Night exposure 1.15 to 1.4, hemisphere fill 1.1 to 1.6, the key light 1.8 to 2.3 (dusk and blue hour raised by similar steps).
- A rim on every car body (hero, enemies, traffic, wrecks): the edges that face away from the camera glow in the look's rim colour. A rim light would also have lit the wet road, and from up the road it mirrors straight into the camera (I tried it: the road went white), so it is done in the car material instead.
- Each street lamp also washes its half of the road.
- Wrecks are scorched, not black, with a glowing hot shell; a burning wreck lights the road round it; an explosion now lights nearby cars for about 1.5 s (it was 0.35 s) and its road pool lasts longer.

Before and after (night, iPhone size): 
- **Same frame, old light against new** (the clearest comparison, both from this build at the pile-up, 25.3 s of `feel-s1-active`; the left one uses v24's exposure, fill, key, environment and grade and no rim): `design/stop3/brightness/same-frame-old-vs-new.jpg` (old left, new right; the singles are in `brightness/same/`).
- **v24 against v25 in play** (different runs, since the sim changed): `brightness/before-after.jpg` (v24 at 5 s, v25 at 5 s, v24 at 41 s, v25 at 34 s); the singles are in `brightness/before/` and `brightness/after/`. The v24 frames are brighter than they look in play because both happen to sit in an explosion's road glow.

## Checks

- Replays: 7 new baselines (rev `D3`: `feel-s{1,2,3}-{active,idle}.json` and `beauty.json`; the six `fun-*` D1 baselines are retired). All 7 match on two sync passes (14 of 14) and once more against the published build; `beauty.json` matches through the live 3D loop (90 of 90 hashes). All six bots reach the city: active 106 to 108 s, no input at all 135 to 149 s.
- Budgets: worst over three full runs, one full-quality frame every 0.25 s (`tools/budget.mjs`): **at most 100 draw calls** and **283k triangles**; the clips peaked at 99 calls and 264k triangles (limits 150 and 400k). Build **13.1 MB** (limit 15).
- No em dashes in player-facing text (checked: `no em dash anywhere in `src/` or `index.html``).

## Not done, not verified, or worth knowing

- **Jack's phone is the FPS gate.** The added cost is small on this machine (about 0.1 ms a frame) but his 10 s low was 51, close to the line. Please check Show FPS on the new build: FPS, the 10 s low, and the `physics` line (it says `rapier` when the physics started, `FAILED` and why if it did not).
- WebAssembly on the published page: the game had no WebAssembly before this build. If the artifact page or an old iOS web view refuses it, the game still runs (old wreck slide) and the physics line says so.
- The technical (hairpin) sectors still have the old camera: high, and it can clip a building at the first hairpin now that the car arrives there faster. That is Stop 4's camera director.
- Clips and stills are software-GL renders from the sim at phone size; feel (weight, how the two-wheel moment reads) is for Jack's hands.
- The old settings row "Auto-drift" is hidden (drift is always automatic now); "Tap half to Slam" is still there.
