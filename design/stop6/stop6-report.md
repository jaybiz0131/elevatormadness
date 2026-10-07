# Sprint D, Stop 6: Feel and chaos (report)

Build: https://claude.ai/artifact/Ae94og4nbVyk46LuFhsYPn (version 28). Branch `shunt-3d`. Nothing from the next stop is started.
**The sim changed** (replay format 4, rev `D7`): seven new baselines `chaos-s{1,2,3}-{active,idle}.json` plus a new `beauty.json`. The `drive-*` D6 baselines are retired.
Jack's v27 verdict was "awesome, much more fun", and he drove slowly just to watch the carnage. This stop fixes the puck, gives the tyres a voice, adds a smoke cloak, stops buildings standing in the road and lets the street take damage.

## 1. The puck: touching it is gas
- **Touch anywhere on the puck is full gas.** The car keeps moving. Only a deliberate pull down lifts it: past 30% of the radius in the middle it eases to coast and then brake, reaching full brake 30% further down; held at a stop it reverses. Lifting the thumb off is the only coast.
- **Slide right = gas plus gatling. Slide left = e-brake.** In the two side zones the pull down has to be harder (62%) before it brakes, so a thumb that sags on its way across does not slow the car. Down-right with a hard pull is standing fire.
- **The e-brake never cancels the gas in the sim either.** In a drift the gas keeps driving the car and builds drift speed. On a straight, gas with the e-brake held keeps the speed (the wheels slide, the car is neither driven nor slowed), and a hard steer still swings the 180. The e-brake alone (no gas) still locks the wheels. Gas plus e-brake from a stop is still the burnout.
- Proof with real pointer events: `node tools/puck.mjs <outDir>` runs 14 checks (middle, up, right level and sagging, left level and sagging, down-right hard, a slow pull down, reverse, gas again, lift off, the simple GAS button) and prints a table: **all 14 pass**. Table in the checks section.

## 2. Sound (synth, until Jack's recordings arrive)
Built by a helper agent and measured by spectrum, **not heard** (nobody here can listen). Wired into the game and run live with no errors (`tools/audiolive.mjs`).
- **Tyre screech:** a stick-slip squeal (two detuned saws plus a sine, a pitch wobble and a rough flutter, 700 to 1,600 Hz with the slide), a gritty scrub, a rubber chirp when a slide starts, a deeper burbling roar with a wheelspin squeal for burnouts, a quieter higher squeal for hard turns, a short lock-up squeal under hard braking, the e-brake 180 and a skidding e-brake. The graph switches itself off 0.6 s after silence.
- **Gatling:** five new rounds (a hard low chunk sweeping 220 to 60 Hz, a sub, a 520 to 740 Hz thwack, a very short dark crack, saturated), a heavier accent on the first round of a burst and a low 47 Hz rumble bed while firing. Spectral centroid 139 Hz (it was 1,267 Hz), RMS +5.4 dB, peak level unchanged. No steady tone above about 1.2 kHz and no spin-up whine.
- `tools/audioclip.mjs <wav> [scene]` renders any of it offline (clip, drift, burn, lock, turn, gun).

## 3. Smoke cloak
- **What builds it:** a burnout, a long drift (it ramps over the first 1.8 s), the e-brake 180 and a skidding e-brake pour smoke in; it thins by itself (about 3 s from full) and faster the quicker the car moves, because the car leaves the cloud behind. A 2 s drift at about 650 pt/s reaches it; a burnout from a stop takes about half a second.
- **While the hero sits in thick smoke (cloak above 0.55, off again below 0.30):** every enemy within 2,000 pt loses track. It steers for where the hero was when the smoke closed, plus a wander, so Rams and Darts line up on the wrong lane and charge at nothing, and a '?' pops over each one. A Gunner aims 48 to 95 pt wide, so its shot misses. The hero's guns are not affected: it shoots out of the smoke. A CLOAK bar sits under the speed readout and a CLOAKED callout fires when it closes.
- **Look:** a pool of big soft puffs (56 on High, 28 on Low) that drift on the wind, swell and fade, drawn in the existing smoke batch (no new draw call). They thin on the line from the camera to the car to a ghost (30%), and a puff the camera sits inside fades, so the view never whites out.
- Scripted test (`tools/s6test.mjs gunnerwide`, seed 2): a Gunner was made while the hero sat in a burnout; it lost track (11 enemies flagged over the run) and one shot went wide.

## 4. Buildings in the road
- **Root cause (found by a helper agent, checked by me):** the street generator tested each plot only against its own stretch of road, near hard corners, from the plot centre. But **the road crosses and doubles back on itself** (for seeds 1 to 6 and two large seeds every road has 4 to 10 places where two stretches pass within 150 pt, 2 to 8 of them less than 4,500 pt apart, so both are on screen together). Plots on one stretch landed on the other. Tower plots, awnings, shopfront models and landmarks added to it.
- **Old generator, over 50 seeds (40 small, 10 large) with and without the imported models:** 117,818 buildings, 7,912 parts closer than 40 pt to the road, **minimum 0 pt (overlapping the road)**; 10 to 165 per seed. By class: towers 1,367, straights 1,140, sweepers 1,742, fast corners 1,465, hard corners 898, hairpins 940, awnings 163, lane transitions 94, storefront models 73, landmarks 21, rooftop models 9. Of these, 3,461 touched a stretch 1,400 to 4,500 pt away along the road (visible at once) and 4,429 one further than that. Only 21 (all landmarks) touched their own stretch.
- **Fix:** `render/three/layout.js` is a pure module that places every plot and measures every part (body, parapet, shop and awning boxes, roof units, the model footprints, the landmarks) against the **whole road, rail edge to rail edge**, indexed in a spatial hash. A plot that fails is tried pushed back, then shortened (85, 70, 55, 42%), then dropped; landmarks are pushed back up to 400 pt. The inside of a hard corner stays open, as the physics expects. The city (`city.js`) and the sim read the same plots.
- **Gate:** `npm run build` now starts with `tools/buildcheck.mjs --seeds=24` and **fails if any building part is closer than 40 pt to the road** (about 20 s). Each measurement is repeated by a second brute-force routine (0 mismatches over 110,298 checks). Proved to bite: `--legacy --strict` on seed 1 alone reports 194 parts closer than 40 pt (both model configs) and exits 1.
- **Result, 50 seeds, both model configs, road to 125,000 pt:** 110,220 buildings placed, 441,378 parts measured, **0 offenders, minimum clearance 45.5 pt** (a radio tower pushed back 140 pt; the smallest for a street building is about 49 pt). The street loses about 5% of its plots to the road test, 1.5% to the open-corner rule, and keeps its look on straights.
- Pictures: `proof/road-crossing-old-vs-new.png` (seed 1) and `proof/hairpin-old-vs-new.png` (seed 12), a top-down map with the road grey, clear buildings teal and touching ones red. Full tool output in `proof/buildcheck-new.txt` and `proof/buildcheck-old-generator.txt`.
- **Collision follows the city now:** the sim's building walls are one box per real plot (they used to be a continuous wall 96 pt from the road edge, which also stood invisibly in front of towers that are drawn 330 pt back). A wreck now flies on through a gap between plots.

## 5. Building chaos
All of it is sim state (small capped lists: 80 decals, 6 fires, heat per 48 pt of facade) drawn from fixed pools, so replays and hashes cover it.
- **Gunfire chips buildings:** a round that crosses the road edge and meets a plot makes a decal (a cracked, pale crater), a flash and sparks, a puff of dust, falling plaster and flecks of glass shaken off the windows above. Only the newest 22 chips animate at once.
- **Facades catch fire:** every chip or blast heats its stretch of wall; at 6 heat (about 6 rounds in the same stretch) it burns for 7 to 11 s. Flame tongues (a new flame batch, one draw call), a soot decal, rising smoke and embers; the last two seconds the flames die back and the smoke thins out for three more. At most 6 fires at once.
- **Cars and pieces that fly into buildings smash and explode there:** a wreck that hits a building above 13 m/s blows up against it, once per car, with a fireball on the wall (the explosion system), sparks, glass, a scorch decal and the facade catching fire, and a credited wreck pays WALL SMASH. Pieces flying off wrecks chip the wall and warm it. Wall impacts are now judged by the speed going into the solver step; before, the speed was read after the wall had already taken most of it and no blast ever fired.
- **In bot runs** (active, 87 s of `beauty.json`): about 175 chips, 10 facade fires, 9 wall blasts and 2 cloaks. That is a lot of fire; the numbers to turn it down are in `T.facade` (`fireAt`, `boomHeat`, `fires`) and `T.crash.wallBoom`.

## Clips (`design/stop6/clips/`, a contact sheet beside each)
Software-GL renders at phone size, stepped in sim time. **None are Jack's thumb.** Two are staged, and they say so.
| Clip | What it shows |
|---|---|
| `puck-gas-and-fire.mp4` (7 s) | **Driving while firing via the puck.** The skilled bot drives at 1,000 to 1,400 pt/s with the puck fields set to gas plus FIRE whenever an enemy is near; the puck on screen shows the dot up and right (GAS and FIRE both lit), drifts, kills, WALL SMASH |
| `smoke-cloak.mp4` (11 s) | **A burnout cloak with enemies losing track.** Scripted: the hero brakes to a stop among enemies, then holds gas, e-brake and FIRE for 4 s. The cloud builds, CLOAKED shows, '?' appears over enemies, the CLOAK bar fills, tracers leave the smoke, the burnout launch |
| `gunfire-chips-building.mp4` (6 s) | **Gunfire chipping a building.** STAGED: the hero is parked at the kerb with its nose turned to the building by the script (the real way to get there is a fishtail or a drift), FIRE held through the puck. Dust, plaster, glass, sparks, then the facade catches fire |
| `car-explodes-on-building.mp4` (5 s) | **A car exploding against a building.** STAGED: an enemy is placed and thrown at 38 m/s into the building by the script (`window.__shunt.fling`). Fireball on the wall, +120 WALL SMASH, burning facade, pieces landing |
Also `proof/fire-on-facade-closeup.png` (flames, soot and chips on one facade).

## Checks

| Check | Result |
|---|---|
| Puck mapping (real pointer events, `tools/puck.mjs`) | 14 of 14: touch middle = gas; up; right level and sagging = gas + fire; left level and sagging = gas + e-brake; down-right hard = brake + fire; centre slightly low = gas; pull down = full brake; held = reverse; back to gas; lift off = coast; simple GAS button |
| Replays, sync | 7 of 7 new baselines match on two sync passes each (14 of 14); hashes 111, 300, 114, 300, 130, 300 and 90 |
| Replay, live frame loop | LIVE_RESULT |
| Draw calls | **101** worst frame across the four clips (66, 73, 98, 101); limit 150 |
| Triangles | **246k** worst (limit 400k) |
| Size | 13,172,953 bytes, **27,839 bytes (0.03 MB) more** than Stop 5 (limit +0.3 MB; 15 MB cap) |
| Physics cost | PHYS_RESULT |
| **FPS** | **Not measured: Jack's phone is the gate (Show FPS, the 10 s low should be 50 or more).** New per-frame work: up to 56 cloak puffs, 96 decals (one draw), 22 fresh chips and 6 fires. Low graphics halves the cloak and uses fewer flames |
| Buildings vs road | 0 offenders of 110,220 buildings (50 seeds, 2 configs), min 45.5 pt; the build fails below 40 pt |
| Bots (sync, final build, seeds 1 to 4) | skilled: A, A, C, A (107 to 127 s). casual: A, C, C, C (122 to 133 s). weak ("novice"): C, C, C, C (143 to 156 s). Every run reaches the city; no input never gets there (3 armor lost, 19 to 38 U-turns) |
| No em dashes in player-facing text | checked |

## Not done or not verified
- **Everything here is software-GL renders and scripted bots.** How the puck feels under a thumb (the 30% and 62% pull thresholds in `input.js`, `BRK`), whether gas plus e-brake holding the speed on a straight feels right, and the FPS low on Jack's phone all need his hands.
- **The sound was measured, not heard.** The squeal's pitch and level against the engine and gatling is a guess until someone listens.
- **Two clips are staged** (the chips and the blast), because the gun fires along the road: a round only reaches a building when the car points at it (a fishtail, a drift, a 180). In the bot runs it happens often enough (about 175 chips in 87 s), but I could not frame it cleanly from a real run.
- **Fires and blasts may be too frequent.** 10 facade fires and 9 blasts in 87 s of a bot run is a lot; tell me which way to move `T.facade` and `T.crash.wallBoom`.
- **The road still crosses itself** (`sim/road.js`). Buildings no longer stand on it, but two stretches of road still overlap at those places, with no bridge or junction. Fixing the generator so the route never crosses itself would be the root fix; I did not touch it.
- **Curved streets:** a plot is still a straight box, so on a bend its face is only exact at its middle. The decals and the physics box use the same straight face. About 4% of lookups at a chunk boundary hit two overlapping plots (kept as it was).
- **Walls and gaps:** wrecks now fly through a gap between plots into the plaza and fall off the 80 m ground slab; they are retired after 5.5 s.
- Haptics still do nothing on iPhone (Safari has no vibrate).
