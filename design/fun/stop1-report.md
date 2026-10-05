# Sprint D, Stop 1: fun first (report)

Build: https://claude.ai/artifact/Ae94og4nbVyk46LuFhsYPn (version 20). Branch `shunt-3d`. Settings > Developer now holds Camera A/B and Show FPS.
Kill sequence: `design/fun/kill-sequence.mp4` (10 s, 24 fps) and `design/fun/kill-1.png` to `kill-4.png`. End screen: `design/fun/win/`.

**The sim changed in this stop** (replay rev `D1`). The six Sprint 4 baselines (`wall-s*.json`) are retired and replaced by six new ones
(`fun-s{1,2,3}-{active,idle}.json`) plus a new `beauty.json` for the bench. All seven match on two sync passes and fun-s1-idle also matches
through the live 3D frame loop.

## 1 and 2. Dead time, before and after

Measured by `tools/pacing.mjs` from the six baseline replays. On screen means 300 pt behind to 900 pt ahead of the car (the window the earlier audits used).
Threat means an enemy that attacks: Ram, Gunner or Bulwark before this stop; those plus the Dart after it (the old weak car only drove along, so it did not threaten anything).

| Measure (6 replays) | Before (Sprint 4 baselines, 469 s) | After (new baselines, 687 s) |
|---|---|---|
| Time with no threat on screen | 19.2% (the weak fodder car counted as an enemy: 4.7%) | 4.0% |
| Longest gap with no threat | 8.0 s (2.1 s counting fodder) | 1.5 s |
| Average seconds between kills, all six | 3.0 s | 3.0 s |
| Average seconds between kills, the three skilled bots | 2.3 s | 2.1 s |
| Enemies on screen on average, skilled bots | 1.4 | 1.8 |

Read the kill row with care. The idle bots never fire, so they drag the all-six figure. For the skilled bots the rate is about the same, but
before they were shooting harmless fodder with an auto-aimed gun and now every kill is a real attacker, so the same rate is more action.
The dead-time rows are the real change.

## What changed

- **Pacing director.** A wave every 8 to 15 s, escalating with progress: Darts, then Rams, then Gunners, a Bulwark from halfway. A filler enemy
  appears within 0.3 s when the road has no attacker, so a gap cannot reach 5 s. Weave lines of slow traffic (three rows, one wandering gap),
  near-miss bonus (gap of 16 pt or less, 50 to 100 points, extends the combo), armor and missile crates when low.
- **Gatling.** `wpn_gatling.glb` did not exist, so `tools/make-gatling.mjs` builds it (3 meshes, 900 triangles, 67 KB) and it is inlined in the build.
  On the hood, 1 s spin-up whine, 20 rounds a second, a spray of plus or minus 3 degrees along the heading, no aim help. Brass casings, tracers every
  third round, muzzle flash, and the cyan trim glows up with every round. Every hit: sparks, a flash, a tick, a tiny kick. Every kill: 60 ms hit stop,
  a bigger shake, a screen flash, a bigger explosion with 20 debris pieces and a shock ring, a punchy sample, a popup with the multiplier. Ram hits (a Ram
  or Dart landing, and the player shunting or rear-ending): crunch sample, sparks, a shove. Shake is off with Reduce motion, and so is the screen flash.
- **The run.** 120,000 pt to the city (about 3 minutes at cruise, about 2:30 for the skilled bot), a progress bar at the top, combo x2 to x5
  shown big beside the score (3 s chain, 4 s hold, any crash resets), finale at 90% (a Ram, a Gunner, Darts and a Bulwark, all soft), then
  a CITY REACHED card with score, best combo, armor left, time and 1 to 3 stars (30,000 and 60,000 points).
- **Weak drivers.** Half damage for the first minute, a pause of 2.5 s after any hit (5 s on one armor pip), heavy hitters become Darts on one armor pip,
  an armor crate within 1.5 s when on one pip, Bulwark contact costs half an armor and one hit only, the finale is lighter when the car is hurt.

## Checks

- Budgets: draw calls at most 144 in the worst frame of a bot kill sequence (full quality, shadows and post on), 135 in a clean fight. The same
  frames were 187 to 197 before this stop: the hero car was about 90 separate meshes and is now 10. Headroom to 150 is small. Triangles at most 25.5k (budget 400k).
  The single-file build is 1.02 MB (budget 15 MB). These are SwiftShader counts, not iPhone frame rates.
- Determinism: 7 of 7 replays match twice (sync), one live. The check found a real bug: `nearLane` could return `undefined` when the player was off the lane range,
  which spawned a NaN car and a NaN bot input, and the recording then differed from its replay. Fixed at the source, and the input snapshot refuses NaN.
- Bots on the final baselines: skilled bot reaches the city in 2 of 3 (died to a Gunner at 133 s in the other); across eight seeds on an earlier tuning it was 8 of 8.
  A weak-driver bot (no gas, never aims or drifts, dodges only half the time) finishes about 1 run in 4 to 5. A person will not drive like either bot, so this says
  nothing about feel. Please tell me whether the weak-driver case is too hard or too easy.
- No em dashes in player-facing text.

## Not done or not verified

- The sounds were generated and run without errors but I cannot hear them. The rhythm, the whine and the kill thump need your ears.
- iPhone frame rate is untested. The new Show FPS (now and lowest in 10 s) is there to measure it.
- The old postcards in `design/postcards/` show the Sprint 4 look and are not refreshed.
- The Gunner sits behind the car, so the forward gatling cannot reach it. It is handled by missiles, Slams and wrecks. Say if you want it to sit ahead.
- Not started, as asked: handbrake 180, the intro, the levels.
