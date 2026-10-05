# Shunt roadmap

## Master plan: seven sprints, A to G (Jack's numbering; use this everywhere)
| Sprint | Scope |
|--------|-------|
| A, B | Done before the 3D port (gray-box driving; Sprint B driving constants). |
| **C (current)** | 3D engine and corners, run as the "Look to 8" stop points. This session: Stop 1 Environment (dark wet road, real smoke, prop kit), Stop 2 Cars (five enemy looks, hero polish, hero top-view design), Stop 3 UI and performance (HUD and title polish, showroom title screen with the hero car turning, tune panel, fonts, under 150 draw calls). |
| D | First: the hood gatling and the handbrake 180 (below). Then the downhill drop plus the first 5-stage mission: drop camera, intro orbit camera, slow-motion kill shot. Level 1 intro, Acts 1 and 2, the boss climax and the payoff (see Level 1 below). |
| E | Act 3, the city maze (see Level 1 below). Rest of scope to be confirmed with Jack. |
| F | Supply pit stop with the Mule's arm (see Level 1 below), with "The Refit" dock cinematic as segment 5 (below). Rest of scope to be confirmed with Jack. |
| G | Scope to be confirmed with Jack. |

## Carried into Sprint D from Sprint C (Jack, 2026-10-05)
- Traffic colours: at dusk, silver and white traffic both read as cream. Swap silver (`#b8bec8`, `CIV_BODY` in
  `spycar/shunt/src/render/three/cars.js`) for a mid gunmetal grey, then recheck all three looks.

## Sprint D, first item: the hood gatling and the handbrake 180 (Jack, 2026-10-05; record only)
- The plain machine guns become one hood-mounted gatling gun: fixed forward, firing along the car's heading in a tight spray cone (about
  8 degrees); the player aims by steering.
- Heavy feel: spin-up whine, deep roar, shell casings, a glowing barrel, camera shake, and a muzzle flash that lights the road.
- Barrel heat instead of ammo: hold it too long and it overheats briefly.
- Handbrake 180: brake plus a hard steer whips the car round to a stop facing backward, so the player can fire behind.
- This is a sim change (weapons and handling): new baseline replays in the same commit, as for every sim change.

## Sprint F, segment 5: "The Refit", the Mule dock cinematic (Jack, 2026-10-05; record only, do not build yet)
The Mule docks with the hero and bolts the arsenal onto the car in one short cinematic.
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
- The car stays a car: modules bolt on, nothing unfolds or stands up. Nothing from any transforming-robot franchise, in either the
  sound or the motion.

## Level 1 plan (Jack, 2026-10-05; record only, build in the sprints named)
Goal: arcade feel on mobile. Quick to start, big moments, readable at a glance, a score to beat. Driving skill raises the score, but a
weak driver still finishes Level 1 and sees the whole movie: steering assist, soft barrier bounces, generous armor, no hard fail on the
first run.

| Beat | Sprint | What it is |
|------|--------|------------|
| Intro | D | Hero blasts in from the side, drifts hard to a stop, beat, then GO. Camera from a low side angle sweeping into the chase cam. |
| Act 1: country highway at dusk | D | Open road, learn the controls, the city skyline glowing on the horizon (skyline.jpg backdrop). Lower, more 3D chase camera. |
| Act 2: the drop | D | Downhill high-speed run into the city, big air, tricks. Camera pulls back and low to show the car airborne. |
| Act 3: the city | E | The road opens into a compact maze of 3 or 4 blocks with 2 or 3 exit routes. The player turns at intersections; enemies flank from side streets and alleys. Camera rises and zooms out as buildings get taller. Green arrows on the road plus an edge-of-screen pointer guide the way out; any route works. |
| Climax: boss fight | D | A named villain car (magenta and black): entrance cutscene, on-screen health bar with its name, 2 or 3 attack phases. Replaces the Bulwark showdown; the Bulwark stays a regular heavy enemy. Model: `assets/models/boss.glb` (Jack, 2026-10-05, Meshy, 8,011 triangles), kept out of the build until then (`NOT_YET` in `spycar/shunt/vite.config.js`). When built: strong emissive magenta edge lines, magenta underglow and a rim light, because a black car disappears on the night road. |
| Payoff | D | Results, unlocks, showroom orbit, play again. |
| Supply pit stop | F | The Mule extends mule_arm and docks alongside the hero; both race locked together while gear transfers. Never drive into a trailer. (The arm ships folded on the Mule's right side from Sprint C.) |

Level design rule (Jack, 2026-10-04): every level is written like a film, with a beginning, a middle and an end, building to a climax
and a payoff. Getting the first level right comes first; it becomes the template for the rest. Camera changes between stages (road,
drop chase, orbit, slow-motion kill shot) are part of what makes each stage feel different, and of showing off the car.

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
