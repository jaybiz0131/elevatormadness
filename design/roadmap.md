# Shunt roadmap

## Master plan: eight sprints, A to H (Jack's numbering; use this everywhere)
Updated 2026-10-06 at the start of Sprint D, Stop 3. This replaces the A to G table and the Level 1 sprint column written on 2026-10-05.

| Sprint | Scope |
|--------|-------|
| A, B | Done before the 3D port (gray-box driving; Sprint B driving constants). |
| C | Done. 3D engine and corners ("Look to 8"): environment, cars, UI and performance. |
| **D (current): the core chase** | Stop 1 Fun first (done: pacing director, hood gatling, a three minute run with a goal). Stop 2 Looks finished, hits hard, never dies (done, v24 passed Jack's iPhone gate: models 19/19, FPS 53, low 51). **Stop 3 Physics and feel**: hybrid crash physics (wrecks flip, tumble, roll, pile up, slam into buildings), suspension and lean, two-wheel corners, hero rollover, automatic drift (no BRAKE button), FIRE and MISSILE buttons with room for BOOST, instant gatling, carnage-first kill feedback, brightness pass. Stop 4 Camera director plus a Camera Lab, plus hills and jumps. Stop 5 Heat, boost, roadblocks, the drone, Jack's audio and music, a turn-around move. |
| E: course, part 1 | The course system; the intro drift; the country highway; the drop with the building jump; the tunnel into the city. |
| F: course, part 2 | The city interstate; the streets; the maze; the tunnel escape. |
| G: Mule Refit, boss, payoff | "The Refit" Mule cinematic (the arm lifts the car and bolts the weapons on, quick; see below); the boss fight; the payoff (results, unlocks, showroom orbit, play again). |
| H | Polish and ship. |

Rules for every stop: deterministic sim, the renderer only reads sim state, never push to main; when the sim changes, record new
baselines (each replay twice with the same hash, plus one through the live 3D loop) and retire the old ones in the same commit.
Budgets: under 150 draw calls, under 400k triangles, under 15 MB, Jack's iPhone FPS low 50+. No em dashes in player-facing text.

## Models held back (kept out of the build until their sprint; `NOT_YET` in `spycar/shunt/vite.config.js`)
- `boss.glb` (the villain car): Sprint G, the boss fight.
- `wpn_missile.glb`, `wpn_laser.glb`, `wpn_booster.glb` (the weapon modules): Sprint G, The Refit.
Full table: `design/stop2/model-inventory.md`.

## Carried into Sprint D from Sprint C (Jack, 2026-10-05)
- Traffic colours: at dusk, silver and white traffic both read as cream. Swap silver (`#b8bec8`, `CIV_BODY` in
  `spycar/shunt/src/render/three/cars.js`) for a mid gunmetal grey, then recheck all three looks.

## Sprint D, first item: the hood gatling and the handbrake 180 (Jack, 2026-10-05; record only)
Status 2026-10-06: the gatling shipped in Stop 1 (Stop 3 makes it fire instantly, no spin-up). The handbrake 180 is replaced by a
turn-around move in Stop 5: Stop 3 removes the BRAKE button (drift is automatic from steering).
- The plain machine guns become one hood-mounted gatling gun: fixed forward, firing along the car's heading in a tight spray cone (about
  8 degrees); the player aims by steering.
- Heavy feel: spin-up whine, deep roar, shell casings, a glowing barrel, camera shake, and a muzzle flash that lights the road.
- Barrel heat instead of ammo: hold it too long and it overheats briefly.
- Model: `assets/models/wpn_gatling.glb` (Jack, 2026-10-05, 4,063 triangles; barrels along -X in the file), on `mount_hood`, scaled to
  the hood. It is very dark: give its cyan trim an emissive boost so it reads on the night road.
- Handbrake 180: brake plus a hard steer whips the car round to a stop facing backward, so the player can fire behind.
- This is a sim change (weapons and handling): new baseline replays in the same commit, as for every sim change.

## Sprint G: "The Refit", the Mule cinematic (Jack, 2026-10-05, moved to Sprint G on 2026-10-06; record only, do not build yet)
The Mule docks with the hero, its arm lifts the car, and it bolts the arsenal on in one short, quick cinematic.
- Length: about 4 s the first time, 2 s on repeats; tap to skip. Enemies hold back while it plays.
- Determinism: the sim must stay deterministic, so replays still match. The cinematic is presentation plus a fixed, recorded sim
  state (an enemy hold and a fixed duration in sim steps), never frame-clock timing. A skip resolves on a sim step.
- Beats:
  1. Lock: the arm clamps on; cut to a low front three-quarter camera.
  2. Open: a cyan seam glow runs over the hero; the Mule's bays open with green light; time drops to 0.4x.
  3. Build: the arm locks on 5 modules one at a time, each with a clank, sparks and a camera punch: the gatling on the hood,
     missile pods on the flanks, the laser on the roof, the rocket booster at the rear, jump jets under the skirts.
  4. Reveal: a half orbit round the car; the HUD weapon icons light up.
  5. Release: the Mule peels off; full speed, a boost burst, back to the chase cam.
- Models: each module is its own GLB, attached to named mount points on the hero. Plan the mount empties in the hero model:
  `mount_hood`, `mount_flank_L`, `mount_flank_R`, `mount_roof`, `mount_rear`, `mount_skirt_FL`, `mount_skirt_FR`, `mount_skirt_RL`,
  `mount_skirt_RR`.
- Module files (Jack, 2026-10-05, in `assets/models/`, kept out of the build until Sprint G): `wpn_missile.glb` (flanks, mirrored
  pair), `wpn_laser.glb` (roof, lens along -X), `wpn_booster.glb` (rear, mirrored pair; four small copies as the jump jets). All are
  very dark: plan an emissive boost on their cyan trim (it can also carry the Open beat's cyan seam glow).
- The car stays a car: modules bolt on, nothing unfolds or stands up. Nothing from any transforming-robot franchise, in either the
  sound or the motion.

## Level 1 plan (Jack, 2026-10-05; sprint column updated 2026-10-06)
Goal: arcade feel on mobile. Quick to start, big moments, readable at a glance, a score to beat. Driving skill raises the score, but a
weak driver still finishes Level 1 and sees the whole movie: steering assist, soft barrier bounces, generous armor, no hard fail on the
first run.

| Beat | Sprint | What it is |
|------|--------|------------|
| Intro | E | Hero blasts in from the side, drifts hard to a stop, beat, then GO. Camera from a low side angle sweeping into the chase cam. |
| Act 1: country highway at dusk | E | Open road, learn the controls, the city skyline glowing on the horizon (skyline.jpg backdrop). |
| Act 2: the drop | E | Downhill high-speed run into the city, big air, the building jump, then the tunnel into the city. Camera pulls back and low to show the car airborne. |
| Act 3: the city | F | The city interstate, then the streets, then a compact maze of 3 or 4 blocks with 2 or 3 exit routes, then the tunnel escape. Enemies flank from side streets and alleys. Green arrows on the road plus an edge-of-screen pointer guide the way out; any route works. |
| The Refit | G | The Mule's arm lifts the car and bolts the weapons on (see above). Never drive into a trailer. |
| Climax: boss fight | G | A named villain car (magenta and black): entrance cutscene, on-screen health bar with its name, 2 or 3 attack phases. The Bulwark stays a regular heavy enemy. Model: `assets/models/boss.glb` (8,011 triangles), held back until then. When built: strong emissive magenta edge lines, magenta underglow and a rim light, because a black car disappears on the night road. |
| Payoff | G | Results, unlocks, showroom orbit, play again. |

Level design rule (Jack, 2026-10-04): every level is written like a film, with a beginning, a middle and an end, building to a climax
and a payoff. Camera changes between stages are part of what makes each stage feel different, and of showing off the car (the camera
director is Sprint D, Stop 4).

## Superseded: the 4-to-10 numbering below
The table below was written by an earlier Claude session on 2026-10-03 with its own sprint numbers (4 to 10). Those numbers are
not Jack's plan; read them only as a list of ideas, and map the work onto A to G above. The old "Sprint 4" (pedals, FIRE and
SPECIAL buttons, hero car in game) was done inside Sprint C.


Jack's question: how many builds until it comes together? Short answer: **five more sprints to a vertical slice** that
drives, shoots, crashes and looks the part. Each sprint is one long session like the 3D port (a build, bots, replays, a
published link and postcards at the end). Two more after that for polish before anyone outside the two of us plays it.

## Where we are
- Sprint 3D (done): three.js renderer, Neon City, three looks, hairpin wall, hero car first build (`?concepts=hero`).
- The sim is still the gray-box driving model: auto throttle to a cruise speed, brake pad, drift, slipstream, nitro; the
  guns fire by themselves at anything in the lane; one special button. That is why "speed up" never worked: there is no gas.

## The sprints

| # | Sprint | What Jack sees at the end |
|---|--------|---------------------------|
| 4 | **Driving v2 + weapons on buttons** | Gas and brake pedals, a wider speed range (0 to 1,300 pt/s, reverse at low speed), camera that holds pace, drift that can be pushed into a full 360 spin and recovered, a FIRE button for the rotary guns (pods pop out, proper gun sound), a SPECIAL button for missiles and the rest. Hero car in the game. |
| 5 | **The crashable city** | The car leaves the road: verges, sidewalks, props that break and fly, cars that deflect off buildings with sparks and damage, breakable storefronts you can crash into and back out of, explosion v2 (fireball, shock ring, debris, scorched road). |
| 6 | **Arsenal and enemies in 3D** | Enemy classes with their own models (weak, bruiser, gunner, armored, truck), rockets and the rocket-speed boost, upgrade pickups shown on the car, kill cinematics (slow-motion wreck moment). |
| 7 | **Downhill and air** | SSX-style drop sections in 3D with the chase camera, ramps through buildings, long flights with air control, rocket jumps, landings that matter. |
| 8 | **Animation and juice** | Damage states on the car, animated gun pods and wing, cinematic intro and death cameras, HUD motion, sound pass, iPhone performance pass, first mission script. |
| 9 | Polish and playtest build | Difficulty curve from bot and human data, daily seed, leaderboard-ready replays, onboarding. |
| 10 | Store build | Icons, store screenshots, PWA install, analytics, the "first 30 seconds" tuned. |

(Old numbering, kept for reference only.)

## Free roam or rail? My recommendation: a wide corridor, forward goal
Keep the road as the spine (the generator, the pacing director, the daily seed and the replay system all hang off distance
along the road) but widen what the player can do inside it:
- the full width of the street is drivable, kerb to storefront, not just the lanes;
- side streets and alleys as short detours that rejoin (the fork system already exists in the gray-box);
- 360 spins, reversing a few car lengths, backing out of a shop front you crashed into;
- deflecting off buildings instead of a hard stop; breakable frontage in marked spots.
That gives most of the feel of free roam without throwing away the director and determinism, and it keeps the one-thumb
control that makes it work on a phone. A true open world would mean a new game, not a sprint.

## Rules carried forward
- Original IP only. Deterministic sim. Renderer only reads sim state. Never push to main. Every sprint ends with bots, replays,
  commit, push, publish, postcards, report. When the sim changes, record new baselines and retire the old ones in the same commit.

## Update (2026-10-06): Sprint D, Stop 3, physics and feel
See the master plan at the top and `design/stop3/stop3-report.md`.

## Update (2026-10-05): Sprint D, Stop 1, fun first
Jack's v18 verdict was "not fun yet": nothing happening, no goal, weak hits. Before any new level content this stop adds a pacing
director, the hood gatling with heavy hit and kill feedback, and a three minute run with a progress bar, combos and a finale. See
`design/fun/stop1-report.md`. Handbrake 180, the intro and the levels have not been started.

## Update (2026-10-07): Sprint D, Stop 6, feel and chaos
Jack's v27 verdict: awesome, much more fun. This stop fixed the puck (touching it is gas; fire and e-brake never cancel it), gave the tyres a voice (screech, a heavier gatling), added the smoke
cloak (burnouts and long drifts hide the hero, enemies lose track), stopped buildings standing in the road (a layout module and a build gate) and made the street take damage (chips, facade fires,
wrecks that blow up against buildings). See `design/stop6/stop6-report.md`. Next stop (not started): heat, roadblocks, the drone, enemy weapons, audio loaded as separate files.


## Update (2026-10-07): Sprint D, Stop 7, the first 30 seconds
Stop 6 was accepted. This stop built TAP TO START with the theme (the logo punches in on the beat, the music carries through the menus and crossfades into the loop when the run starts), replaced the starting ramp with
a 4.4 s opening scene (the hero blasts in sliding sideways, whips a 180 in tyre smoke, the pursuers' headlights flare, the camera swings round to behind it, GO), moved the music to separate published files with a loader for
later recordings, added Music and Effects sliders, and added a Puck section to the tune panel. The theme files are placeholders until Jack's arrive. See `design/stop7/stop7-report.md`. Next stop (not started): heat,
roadblocks, the drone, enemy weapons.
