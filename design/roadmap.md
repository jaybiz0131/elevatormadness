# Shunt roadmap

## Master plan: seven sprints, A to G (Jack's numbering; use this everywhere)
| Sprint | Scope |
|--------|-------|
| A, B | Done before the 3D port (gray-box driving; Sprint B driving constants). |
| **C (current)** | 3D engine and corners, run as the "Look to 8" stop points. This session: Stop 1 Environment (dark wet road, real smoke, prop kit), Stop 2 Cars (five enemy looks, hero polish, hero top-view design), Stop 3 UI and performance (HUD and title polish, showroom title screen with the hero car turning, tune panel, fonts, under 150 draw calls). |
| D | Downhill drop plus the first 5-stage mission: drop camera, intro orbit camera, slow-motion kill shot. |
| E, F, G | Scope to be confirmed with Jack (not written down in the repo). |

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
