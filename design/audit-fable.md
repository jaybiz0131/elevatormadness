# Shunt v19 deep-dive audit (2026-10-05)

Audit only. No game code was changed. Build audited: `shunt-3d` at 0a5e934 (v19: Settings > Developer FPS readout and the Camera A / B switch), built from source with `npm run build` (dist/shunt.html, 10.4 MB). Screenshots are in `design/audit-shots/` (numbered key moments, one contact sheet per run, the per-run metrics JSON under `metrics/`).

## How this audit was run

- Headless Chromium (SwiftShader) at 390 x 844, device pixel ratio 3, an iPhone user agent so the renderer takes its iOS path (MSAA 2, 1024 shadow map), camera B, the Night look, the renderer pinned at the iPhone resolution cap (scale 2.0, a 780 x 1688 frame buffer). Software GL cannot draw the game at pace, so the renderer was gated off between screenshots while the sim ran in the page's own loop at real-time pace; every screenshot is one full-quality frame of the live state, through the live camera and HUD.
- Three full runs, 180 s cap, one per bot style: casual (steers at the nearest enemy, holds GAS when the lane looks clear, holds FIRE when an enemy is ahead, never drifts or Slams, thumb limited to 220 pt/s: the weak-driver model), skilled (the repo's active bot from tools/playtest.mjs: drifts, Slams, brakes for corners, takes trucks and ramps, fires missiles), passive (thumb still, fires at whatever is ahead).
- The six baseline replays (`spycar/shunt/replays/wall-s1..s3-{idle,active}.json`) played through the live loop with the same instrumentation; all six hashes matched.
- A screenshot every 5 s of sim time, at the burnout and the GO, at every armor hit, barrier hit and death, at the death card, and at kills (a chain of kills within 4 s shares one shot). Originals are 1170 x 2532 PNG; the repo copies are half-size JPEGs plus contact sheets with every frame.
- Measured per 0.1 s: enemies visible (projected through the live camera), enemies within 150 pt, enemies behind (chevron range), enemies in a tell, civilians visible, speed, armor, kills, score, sector and corner. Draw calls and triangles from `renderer.info` on each rendered frame, plus a per-object breakdown of one busy frame of the beauty route. Frame time is not measurable here (SwiftShader); the sim's own cost per 120 Hz step was timed, and the iPhone cost is reasoned from the frame contents.
- For breadth, the game's own sim modules were also run in node without a renderer: 20 seeds per bot style, 180 s cap, the same metrics. These give the medians quoted below; the browser runs confirm them one seed at a time with pictures.
- Bot scripts are not part of the game and were kept out of the repo: `audit.mjs`, `simrun.mjs`, `calls-c.mjs`, `horizon.mjs` in the session scratchpad.

Headless caveats: SwiftShader numbers are not iPhone numbers; bots cannot judge feel; only Jack's phone playtests are gates.

## The short version

Jack's three complaints are all true and share one root: the game is built out of fodder. A player who holds FIRE gets a kill every 1.7 s, but 59% of enemies die within 2 s of appearing, nothing attacks the player for the first 37 s of a casual run (64 s of a skilled one), the only thing that hurts a weak driver is the hairpin wall (11 of 20 casual deaths), and each kill is a 50 ms beep, a 6 cm tracer, a 40 ms freeze and a white puff seen from 86 m away. "Nothing happening" means nothing that pushes back. "No goal" is literal: score only, endless, no finish, no stages. "Hits feel weak" is the whole feedback stack (sound, hit-stop, shake, explosion, enemy damage state, weapon visibility) sized for the 2D gray-box and viewed from a camera three times further away than the one it was tuned for.

Camera B exposes a second root: the world is generated 127 m ahead and the night fog only reaches 0.34 at that distance, so the road, the city and every spawn end or appear in plain sight, and in hairpins the camera sits inside the towers. Camera A hid all of this by never showing the horizon. Jack's "gap between the skyline and the far end of the road" is exactly that: a quarter of the screen of bare fogged ground between the last road chunk (31% from the top of the frame at cruise) and the skyline band (5% from the top). See `02-camB-3s-road-end.jpg` against `03-camA-3s-same-moment.jpg`, and `17-casual-10s-hairpin.jpg` for the tower.

Both roots are cheap relative to their effect. The "Fun First" Sprint D plan has the right three items; the order should change and two of them should shrink (the proposal is at the end).

## Numbers at a glance

### Headless sim statistics (20 seeds per style, 180 s cap, no renderer)

"Visible" means inside the window camera B shows: 150 pt behind to 1,700 pt ahead (the last road chunk). Medians unless stated.

| | Casual (weak driver, holds GAS and FIRE) | Passive (thumb still, fires at what is ahead) | Idle (no input) | Skilled (the repo's active bot) |
|---|---|---|---|---|
| Run length | 78 s | 51 s | 43 s | 136 s (3 of 20 reach 180 s) |
| Cause of death (20 runs) | barrier 11, Gunner 5, Bruiser 3, barrel 1 | armored truck 6, Gunner 5, Bruiser 5, barrel 3, barrier 1 | Bruiser 14, armored truck 3, barrier 2, Gunner 1 | Gunner 14, barrel 3, alive 3 |
| Kills per minute | 27.6 | 13.3 | 4.2 | 26.6 |
| Median seconds between kills | 1.7 | 3.4 | 8.6 | 1.7 |
| Longest gap between kills | 8 s | 11 s | 23 s | 9 s |
| Time to first kill | 2.7 s | 10.8 s | 21.8 s | 1.8 s |
| Time to the first enemy attack (a Bruiser tell or a Gunner sight) | 36.9 s | 17.5 s | 11.1 s | 64.5 s |
| Time to first damage | 9.5 s (the hairpin wall) | 18.3 s | 11.8 s | 83.3 s |
| Damage events per minute | 4.7 | 5.1 | 8.0 | 1.3 |
| Time with no enemy visible | 8% | 4% | 0% | 9% |
| Time with no threat at all (nothing visible, nothing behind, nothing in a tell) | 3% | 1% | 0% | 4% |
| Longest no-threat gap | 1.0 s | 0.8 s | 0 s | 1.4 s |
| Average enemies visible | 1.4 | 1.9 | 3.0 | 1.4 |
| Median time an enemy is on screen before it is wrecked | 1.6 s | 3.3 s | n/a | 1.6 s |
| Enemies wrecked within 2 s of appearing | 59% | 33% | n/a | 58% |
| Enemy spawns that pop in inside the visible window | 41 of 49 (84%) | 17 of 19 | 11 of 11 | 63 of 77 (82%) |
| Kills by cause (all 20 runs) | gun 73%, missile 11%, chain 7%, shunt 6%, ram 4%, Slam 1% | gun 89%, chain 7% | | gun 41%, missile 33%, Slam 11%, chain 6%, shunt 4%, ram 4% |
| Kills by kind | weak 56%, Bruiser 37%, Gunner 5%, armored 3% | weak 61%, Bruiser 35% | | weak 49%, Bruiser 37%, Gunner 12% |
| Time in technical (hairpin) sectors | 43% | 35% | 36% | 42% |
| Average speed, time above 1,000 pt/s | 958 pt/s, 51% | 513, 0% | 507, 0% | 926, 47% |
| Barrier hits per run, civilians hit per run | 5, 9 | 3, 6 | 2, 2 | 0, 19 |

Reading: the Sprint A gates still pass (idle under 5 wrecks a minute, skilled 3x idle). What those gates never measured is what the kills are: 56 to 61% of them are weak cars that live 1.6 s on screen, 73 to 89% are gun kills for anyone who is not the expert bot, and the first enemy that fights back arrives when a weak driver's run is already half over.

### Browser runs at iPhone size, camera B, full quality (one run per style, 180 s cap, plus the six baseline replays)

| | Casual, seed 7 | Skilled, seed 11 | Passive, seed 5 | Replays idle s1 / s2 / s3 | Replays active s1 / s2 / s3 |
|---|---|---|---|---|---|
| Run length, cause | 54 s, hit the barrier | 185 s cap, alive | 79 s, shot by a Gunner | 51 / 47 / 23 s (barrel, armored truck, barrier) | 104 s (Gunner) / 116 / 117 (replay ended, alive) |
| Kills (gun share), per minute | 22 (17 gun), 24.3 | 65 (53 gun), 21.0 | 12 (11 gun), 9.2 | 6 / 1 / 0 | 54 (43) / 46 (27) / 50 (37); 31.1 / 23.7 / 25.6 |
| Median seconds between kills; longest gap | 1.8; 7.3 | 2.9; 7.6 | 6.6; 12.4 | 5.7; 17 / 15.8; 31 / none; 23 | 1.4; 5.6 / 1.9; 16.7 / 1.3; 11.3 |
| Time to first kill | 4.9 s | 1.3 s | 11.7 s | 16.1 / 15.8 / none | 1.2 / 2.5 / 4.5 |
| Time to the first enemy attack | 18.1 s | 63.3 s | 67.6 s | 9.9 / 16.4 / 4.1 | 32.4 / 95.6 / 107.4 |
| Time to first damage | 10.5 s | 96.0 s | 21.8 s | 10.7 / 15.8 / 4.7 | 43.3 / 100.0 / 79.5 |
| Damage events, per minute | 6, 6.6 | 1, 0.3 | 5, 3.8 | 6, 7.0 / 7, 9.0 / 7, 18.4 | 3, 1.7 / 3, 1.6 / 2, 1.0 |
| Time with no enemy visible; longest no-threat gap | 11%; 1.5 s | 7%; 3.0 s | 2%; 0.8 s | 0%; 0 s (all three) | 5%; 1.4 s / 2%; 1.2 s / 1%; 1.1 s |
| Time with one enemy or fewer visible | 65% | 50% | 11% | 7% / 1% / 9% | 55% / 42% / 44% |
| Time an enemy attack is in progress | 0% | 3% | 3% | 12% / 13% / 12% | 7% / 6% / 1% |
| Barrier hits; civilians hit | 5; 8 | 0; 32 | 2; 4 | 1 / 3 / 2; 2 / 0 / 3 | 0; 21 / 16 / 19 |
| Peak draw calls; peak triangles | 126; 290k | 127; 372k | 123; 359k | 123; 336k / 109; 377k / 116; 310k | 125; 346k / 132; 359k / 125; 328k |
| Sim cost per 120 Hz step (node, x86) | 0.035 ms | 0.042 ms | 0.023 ms | | |
| Replay hash | | | | MATCH, MATCH, MATCH | MATCH, MATCH, MATCH |

### Rendering cost at a busy moment (beauty route at 34 s, 4 cars, 149 smoke puffs, per frame)

| | Camera B | Camera A |
|---|---|---|
| renderer.info draw calls | 104 | 98 |
| Triangles | 282k | 282k |
| Draws by pass | main 103, shadow 40, post 17 | main 97, shadow 40, post 17 |
| Shader programs, textures | 85, 81 | 85, 78 |

Triangles by object in that camera B frame: street lamps 76,760 (27% of the frame, 19 lamps at 4,040 each, in a single instanced draw); storefronts 37,324; billboards 28,095 (drawn again in the shadow pass, 56k in all); road and building chunks 18,508 over 14 draws; rooftop AC units 18,032; the hero 10,144 plus 880 for the wheels; phone booths 10,585; Darts 8,554; traffic cars 7,914; the kit props 3,988 over 25 instanced draws; effects batches about 600. Twenty-three draws of two triangles each are the neon sign and label planes (one draw per sign). Sixteen draws (8 per pass) carry zero triangles: instanced meshes whose count is 0 that frame (Ram, Gunner, Bulwark, Mule, the Mule arm, the three landmarks) are still submitted. Peak over every run: 132 calls (active replay s2 at 90 s) and 377k triangles (idle replay s2 at the death card, with the city dense on both sides). Budgets are 150 calls, 400k triangles, 15 MB; the page is 10.4 MB.

## Area by area

For each area: what is wrong, the evidence, the fix, the effort (S under half a day, M one to two days, L three days or more) and the impact on fun or quality from 1 to 5.

### 1. The first 30 seconds (the hook)

What a player sees, in order (`src/sim/director.js` script(); sim time):

| Time | What happens | What the player is told |
|---|---|---|
| 0 to 0.6 s | Burnout, car held at 0 | "GO" at 0.6 s |
| 0.2 s | A garage ramp 170 pt ahead; the car jumps it at about 1 s | nothing, then "Clean!" on landing (+120) |
| 3 s | Six cones in alternating lanes 500 to 1,350 pt ahead; the ghost thumb shows for 5 s | "SLIDE TO STEER" |
| 0 s onward | population(2, 1) keeps one weak car 700 to 1,000 pt ahead; from 8 s the 3-second rule adds a weak car in a lane next to the player every 2.6 s of quiet | nothing |
| 10 s | One slow Bruiser (slowDuel) 360 pt ahead, meant to hold alongside for 2.2 s while time slows to 0.35x | "Flick to Slam" |
| 20 s | Drift lesson: at the first hairpin time slows to 0.3x until the pad is held | "Hold to drift" |
| 35 s | Supply truck | "Supply truck" |
| 42 s | Armored truck | "Armored truck, missiles only" |
| 50 s | Bruiser, weak car, civilian and barrels together | |
| 60 s | The director takes over | |

What is wrong:

- The hook teaches the wrong game. The script is the audit's one-thumb onboarding (steer, flick to Slam, hold to drift). Sprint C put FIRE, GAS, BRAKE and SPECIAL on buttons and the script was not updated: nothing in the first minute ever says FIRE or GAS. The two things that produce events are the two things never taught. The Slam, which gets a slow-motion lesson, has no button at all (a flick gesture; "Tap half to Slam" is off by default).
- The lessons do not fire for anyone who holds GAS. The casual bot reaches the first hairpin at 8.2 s (the 9,000 pt lead-in straight at 1,000+ pt/s); the drift lesson is time-gated to 20 s. The callout sequence for seed 1000 is: 8.2 s "Hairpin", 9.1 s "Too fast" (barrier hit), 9.9 s "Hard corner", 11.8 s "Hard corner", then "Hold to drift" at 41.7 s, long after the first technical sector is done. The slow Bruiser spawned at 10 s is left behind at once (it holds at the player's y plus 6 with a 180 pt/s closing cap; the player is doing 1,300). The idle driver gets the lesson at 20.0 s and hits the wall at 21.0 s anyway ("Armor 2" at 21.8 s).
- Nothing fights back. First attack tell at 36.9 s median for the casual bot (18.1 s in the browser run), 64.5 s for the skilled one. The only enemy that can hurt the player in the first 30 s is the slowDuel Bruiser, and only if the player stays at cruise next to it. Everything else is fodder one lane over at 0.8 to 0.9x cruise, dead in two rounds. Damage is halved for 30 s on top.
- No goal is stated. No destination, no distance, no "survive to", no mission line, no progress bar. The HUD says score, best, armor and "PT/S", a unit that means nothing to a player.
- The car is tiny. From camera B's 86 m slant distance the hero is about 20 pt wide on a 390 pt screen (5% of the width; `02-camB-3s-road-end.jpg`). The showroom title sells a beautiful car (`01-title.jpg`); the game then shows a cyan smudge. The jump at 1 s is a 1.2 s hop the player barely registers at that size.
- At 10 s a gas-holder is in the first hairpin with the camera inside a tower: the whole frame is a facade (`17-casual-10s-hairpin.jpg`, `14-skilled-10s-hairpin-tower.jpg`, both runs, both seeds). That is the player's first impression of a corner.

Fixes:

- Rewrite the first 30 s for the buttons (S, fun 4): 0 to 3 s burnout and GO with "HOLD GAS" pulsing on the gas button itself; 3 to 8 s three weak cars dead ahead in the player's lane with "HOLD FIRE" pulsing on the fire button; 8 to 15 s the first Bruiser that lunges (one half-pip hit is a fine lesson); 15 to 25 s a sweeper with a Bruiser pair; 25 to 35 s the supply truck. Move the first hairpin out of the first 60 s: make sector 1 a combat sector to 20,000 pt.
- Distance-gate the lessons (S): key every teach moment to road distance or to its own spawn, so a gas-holder and a cruiser get the same sequence.
- Say the goal in the first second (S, fun 3): one line under the score ("REACH THE CITY", "3 MIN TO THE DROP") with a thin progress bar (area 4).
- Bring the car closer and keep the camera out of the towers (S, quality 4): area 6.

### 2. The moment-to-moment loop and pacing

How the director works (`director.js`): a cap on enemies in the window (2 in minute 1, 3 to minute 3, 4 to minute 5, 5 after; 2 in any technical sector); a pool of weak and Bruiser, Gunner from minute 1, armored from minute 3; 40% of Bruisers and Gunners spawn 420 pt behind; a spawn every 1.4 to 2.6 s in pressure and 2.5 to 4 s in breather, 35 to 40% of them civilians; ramps every 12 to 18 s, trucks every 25 s, barrels every 20 s, closures every 30 s, forks every 60 to 90 s, onramps every 45 s; 40 s pressure then 10 s breather; the 3-second rule drops a weak car 600 to 750 pt ahead in a lane next to the player after 2.6 s without an event.

What is wrong:

- Density is fine, substance is not. No-threat gaps are under 1.5 s in every style (3.0 s once in the skilled browser run); the audit's 3-second rule is met. But what fills the gaps is a 2 hp car one lane over that never attacks, dies to 0.17 s of fire (12 rounds a second, 1 damage each) and pays 100. 56% of all kills are weak cars; their median life on screen is 1.6 s. A player reads this as a shooting gallery of cardboard, which is what "nothing happening" means when kills arrive every 1.7 s.
- Threats are rare and slow. The Bruiser holds 0.8 to 1.6 s, tells 0.6 s, lunges 70 pt; the Gunner sits 230 pt behind, sights 0.8 s, fires one shot every 3.8 s at a fixed x; nothing comes head-on, nothing cuts across the lane, nothing races the player. An attack is in progress 0 to 3% of the time in the three browser runs (12 to 13% for the idle replays, which stay at cruise). Casual drivers take 4.7 damage events a minute, almost all from the hairpin wall and barrels.
- GAS breaks the encounter model. Traffic and fodder sit at 0.55 to 0.9x cruise (264 to 432 pt/s). At 1,300 pt/s the player passes them at 900 pt/s relative; a weak car spawned 700 pt ahead is beside the player 0.8 s later. Bruisers and Gunners chase at the player's speed plus a 180 pt/s closing cap, so they never catch a gas-holder from behind and never reach their hold slot; the first attack tell moves from 11 s (idle) to 37 s (casual) to 64 s (skilled) purely because the bot holds GAS. The pressure director was tuned for 480 pt/s; the 1,300 pt/s pedal was added later; the two have not met.
- Spawns pop in on screen. 84% of enemy spawns land inside the visible window: enemies appear 700 to 1,000 pt ahead (52 to 75 m), ramps, barrels and trucks at 900, closures and forks at 1,000, all well inside camera B's 1,700 pt of visible road and inside camera A's 1,000 to 1,360 pt at speed. In the contact sheets cars materialise mid-screen.
- Technical sectors are 35 to 43% of the run and are empty by design (enemy cap 2, no ramps, trucks, barrels or forks). For a weak driver who neither brakes nor drifts that is 40% of the run spent hitting the barrier ("Too fast" 5 times a run for the casual bot; 11 of its 20 runs end there; `18-casual-barrier-death.jpg`) in a street with nobody in it. For an arcade brawler the hairpin sectors are a racing game's content in a racing game's proportion.
- Waves have no shape the player can feel. 40 s pressure, 10 s breather with a truck or crate; nothing announces either, nothing escalates inside a wave, the cap steps up once a minute. There is no "here comes a squad" moment, no boss, no lull that reads as a lull.

Evidence: both tables; `sheet-run1.jpg` and `sheet-run2.jpg` (cars appearing between frames mid-road); `population()`, `spawnEnemy()`, `director()`.

Fixes:

- Pacing director v2 (M, fun 5): authored encounter cards picked by a director that reads the player: "Bruiser pair boxing", "Gunner behind plus a fodder lane", "convoy of three in the player's lane", "Dart cutting across from a side street", "breather with the truck". Each card spawns beyond the visible range (2,000 pt plus 1.2 s of current speed) and closes in at the player's speed band; cards escalate on a 20 s beat; a breather is announced (music drop, a "CLEAR" callout, the truck).
- Enemies that survive long enough to be fought (S, fun 5): weak 2 hp to 6, Bruiser 4 to 12, Gunner 5 to 14 against the 12 round a second gun, so a fodder car takes half a second of held fire and shows two damage states before it goes; 60% of fodder spawns in the player's lane ahead at the player's speed minus 150, so lining up is still a decision but the target does not fly past.
- Enemies at the player's speed (S, fun 4): chasers close at speed plus 320; fodder ahead at speed minus 150 to 250 instead of a fixed fraction of cruise; a Bruiser that loses its slot for 3 s swings in from a side street ahead instead.
- Shorten and defang the technical sectors for Level 1 (S, fun 3): 3,000 to 5,000 pt instead of 7,000 to 12,000, one hairpin at most, sweepers otherwise; keep the cap in them.
- A head-on or crossing threat (M, fun 4): one enemy that cuts across (the Dart from a side street, a 1.5 s arrow on the road) gives the player something to dodge that is not a wall.

### 3. Hit feedback and juice

What one gun kill is today (`physics.js` gun(), gunHit(), wreck(); `fx.js`; `audio.js`):

| Layer | Per round | Per hit | Per kill |
|---|---|---|---|
| Sound | 50 ms filtered noise plus a 60 ms square blip (`shot`) | 50 ms triangle beep 2,200 to 1,800 Hz (`ping`) | `wreck`: a 180 to 420 Hz sine chirp, 0.5 s of noise, a sub sine; `chain` tones when the combo is over 1 |
| Picture | a 6 cm x 1.5 m tracer box (bloomed); the headlights brighten for 50 ms; no muzzle flash on the imported hero (the gun pods exist only on the code hero: `pods = []` once the GLB loads, `cars.js` setHeroModel) | 3 sparks, a white glow for 80 ms, no damage state (no smoke, no HP, no dents) | additive glow sprites (radius about 7 m), a ground ring, 10 sparks, 12 debris boxes, 6 smoke puffs over 0.6 s; the wreck turns dark brown, rolls on and flips for 1.5 s |
| Time | none | none | hit-stop 40 ms (gun), 70 ms (Slam), 90 ms (chain); slow motion only on chains (0.3 s at 0.5x) |
| Camera | kick.y 0.4 (invisible at 86 m) | none | trauma 0.6 (gun), capped at 1.2 m of offset and 2 degrees: at 86 m that is 1.4% of the frame |
| HUD | none | none | "+100" at 21 px for 1 s, the combo counter |
| Haptic | `navigator.vibrate`, which does nothing on iPhone | same | same |

What is wrong:

- The weapon is invisible. With the imported hero there are no gun pods, no barrels, no flash; FIRE produces thin yellow streaks from near the headlights. Jack's gatling fixes half of this; the muzzle flash must also light the road and the car's nose, or the gun still reads as a pea-shooter from 86 m.
- Targets die before the hit registers. Two rounds kill a weak car; at 12 rounds a second the player cannot see a hit land before the kill. There is no damage state (the audit's "smoke at half health, sparks and a dragging bumper" is not built).
- Hit-stop is subliminal. 40 ms is 2.4 frames at 60 Hz. For "heavy" the kill freeze needs 90 to 120 ms with a 3 to 4% punch-in, and a Slam or wall kill 150 ms with 0.4 s of 0.5x slow motion.
- The explosion is small and flat. Seen from 86 m a 7 m additive sprite is 5% of the screen width for 0.6 s: a white puff with a ring (`06-chain-wreck-explosion.jpg`, where the two orange pools at the bottom are what a chain wreck looks like; `07-gunner-kill-death.jpg`, the player's own death is a white blob). No fireball texture, no light cast on the road or nearby cars, no smoke column that persists, no chunks that bounce. The wreck keeps driving in a spin for 1.5 s, which reads as "the enemy is still there".
- Sound carries nothing. Every sound is a procedural beep or noise burst at 0.05 to 0.5 gain; the engine is two oscillators through a low-pass at 0.04 gain; no transient, no low end, no distortion, no ducking; the music is a square-wave bass pulse. "Hits feel weak" is at least half an audio problem.
- Shake cannot be felt. The cap was tuned for the 2D build (6 to 16 pt on an 844 pt screen); in 3D the same numbers became 1.2 m at a camera 86 m away. Shake needs to be expressed in screen fraction (1.5 to 3% for a wreck, 5% for a Slam) or degrees of camera rotation, not in world metres.
- Score pops land on the buttons. Pops are placed by projecting the wreck's road position; an enemy wrecked beside or behind the player projects onto the lower third, which is where the four buttons are (`09-callout-and-pops-over-buttons.jpg`: "+600 360" and "+514 DRIFT T3" over SPECIAL, "+10" over GAS; `15-busiest-frame-camB-beauty-34s.jpg`: "+10" over FIRE). They are 21 px, yellow, 1 s.

Fixes:

- Feedback pack (S to M, fun 5): kill hit-stop 100 ms plus a 4% FOV punch-in, 0.25 s at 0.5x on Slam, wall and chain kills; shake in screen fraction (wreck 2%, Slam 4%, 2 degrees roll); a whole-body emissive flash on the enemy for 60 ms; pops at 28 px that scale from 0.6x and rise 60 px, clamped above the button band, in the enemy's accent colour.
- Enemy damage states (S, fun 4): hp thresholds drive emissive loss, a grey smoke stream at half, sparks and a flicker under a quarter; the wreck loses its forward speed within 0.4 s and slides to the kerb instead of driving on.
- Explosion v2 (M, quality 4, fun 3): a 4 x 4 fireball atlas generated once like the smoke atlas, 0.9 s, 10 m, an additive core and a normal-blended smoke shell, a ground flash pool that lights the road and nearby cars for 150 ms, 6 bouncing chunks with contact sparks, a 20 s scorch; a 1.5x version for the Bulwark and barrels.
- Sampled sounds (M, fun 5): 12 to 16 short original samples (a gatling loop with spin-up and spin-down tails, three impact layers, three explosions, a Slam crunch, a barrier scrape, two engine loops, a stinger ladder for the combo), Ogg or AAC under 1.5 MB, decoded once, through a compressor with a side-chain duck of the engine and music on every impact. The page has 4.6 MB of headroom. Keep the synth as the fallback.
- Make the weapon visible (M, fun 4, quality 4): Jack's hood gatling (`wpn_gatling.glb`, 4,063 triangles, already in assets) with spinning barrels, a muzzle flash sprite plus a road pool, shell casings as debris, a barrel glow that follows heat.

### 4. Goals and progression (run structure, combo, score, reasons to replay)

What exists: an endless road; four district names on signs every 60 s of cruise distance (the visuals do not change); score from distance (1 per 100 pt) and kills by cause (gun x1, car kills x3); combo x2 to x8 with a 2.5 s window; a best score; a daily seed; "cash" at 10% of score that buys nothing; a death card with a stat line and a 1.5 s replay behind it.

What is wrong:

- No goal, no end, no middle. Nothing in the run changes except the enemy cap and the sector type; minute 2 is minute 5. Death is the only ending and it comes from a barrier or a Gunner shot the player did not see.
- The score is the only reward and it is opaque: the cause multipliers are invisible to anyone who does not read pop labels; the combo bar is 56 px; "cash" accrues with nothing to spend it on, a visible broken promise on every death card (`08-death-card.jpg`, "+277 cash").
- The daily run and the district signs promise content that does not exist yet; on a first playtest they are noise.
- Nothing is unlocked by playing, so "always one more run" rests on the score alone.

Fixes:

- A run with a shape (L, fun 5): the 3-minute Level 1 the roadmap describes, cut to what one sprint builds: a progress bar with three marks (highway, a long downhill sweeper standing in for the drop, the city); a mid-point event (the supply truck becomes a 2 s pit stop that tops up missiles and armor); a finale (the boss car from `boss.glb`, a health bar, two attack phases, 45 s); a results card with a grade and one unlock line. Death before the end restarts the stage, not the run, so a weak driver sees the whole movie.
- Combo as the visible skill meter (S, fun 3): the window extends on every hit, not only kills; the counter grows per step; a pitch-ladder stinger per step; x4 and x8 give a short flash. The formula stays.
- Retire what does not pay yet (S): hide cash, the daily run button and the district signs until the garage exists.

### 5. Touch controls and handling

Layout (`index.html`): GAS 100 pt at bottom right, BRAKE 84 pt to its left, FIRE 84 pt above GAS, SPECIAL 76 pt above BRAKE; steering by relative drag anywhere else; the Slam by flick (or the off-by-default tap half); a swipe up on FIRE fires the special.

What is wrong (from the code and the bots; feel needs Jack):

- The one-thumb pillar is gone and nothing replaced it. The design that made this a phone game was "steering is the only thing the player must do; firing is automatic". Sprint C moved to four buttons, three of them hold buttons. A player steering with the left thumb can hold one of them with the right. The game assumes two: without GAS nothing happens for 19 s and the enemies crawl; without FIRE there are no kills. A new player picks one, usually GAS, and gets a driving game with no combat.
- BRAKE is overloaded: brake, drift modifier, reverse and, with a dragged thumb, the 360 spin. The spin fires from a drift held hard against the road edge for 0.4 s, which is exactly what a weak driver does in a hairpin. The skilled bot triggered "360" callouts repeatedly without meaning to (`13-skilled-hairpin-360.jpg`, `09-callout-and-pops-over-buttons.jpg`, `14-skilled-10s-hairpin-tower.jpg`); each one is a 64 px callout in the middle of the screen.
- The Slam has no button. The flick detector is deliberately strict so it never fires by accident; it also never fires on purpose for a player who has not read the audit. In 20 casual sim runs and the casual browser run: 0 Slams. The signature move is unreachable.
- Steering authority scales with speed (lateral speed is speed x sin heading): a lane change takes about 0.4 s at cruise and 0.15 s at top speed, so GAS makes the car twitchy exactly when there is least time to react; the audit's note that throttle made Moonwake twitchy applies.
- "SLIDE TO STEER" is the only control hint; it shows for 5 s.

Fixes:

- Decide the hand model before the gatling ships (S in sim, M with baselines re-recorded; fun 4 for weak drivers). Recommendation: FIRE is the one hold button (the gatling, overheat as its cost); speed is automatic at a higher cruise (700 to 800 pt/s, the audit's range) with a 15% surge while firing, and GAS removed or made a tap toggle; BRAKE stays as brake and drift; SPECIAL a tap.
- Put the Slam on the car (S, fun 3): a Slam fires when the player steers hard into an enemy beside the car at speed (the intent test already exists in contactPlayer); keep the flick as a bonus.
- Remove reverse and the 360 from Level 1 (S): nothing in the run needs them and both fire by accident under a weak thumb.
- Button art (S, quality 3): the four grey text discs read as a debug UI; icons, a pressed glow in the function's colour, a heat ring on FIRE.

### 6. Camera B, the skyline and the road gap

Camera B (`camera.js`): 48 degree vertical FOV, 22 degrees down, 86 m slant distance, the player a third of the way up the screen; at 1,300 pt/s it widens to 60 degrees and pulls back to 112 m. Camera A: 42 degrees, 47 degrees down, 76 m; 54 degrees and 102 m at top speed.

Projected geometry (from camera.js, confirmed by the screenshots):

| | Horizon | Last road chunk (1,700 pt, 127 m ahead) | Last city chunk (1,500 pt, 112 m) | Detailed props stop (1,200 pt, 90 m) | Night fog at the road end | Player |
|---|---|---|---|---|---|---|
| Camera A at cruise | off screen | off screen | off screen | 4% above the top | 0.26 | 67% from top |
| Camera A at top speed | off screen | 10% from top | 14% from top | 20% from top | 0.29 | 67% |
| Camera B at cruise | 5% from top | 31% from top | 32% from top | 36% from top | 0.34 | 67% |
| Camera B at top speed | 15% from top | 40% from top | 42% from top | 44% from top | 0.39 | 67% |

What is wrong:

- The gap Jack sees is the end of the world. The road is built to 1,700 pt ahead (`RoadMesh.update`: k1 = rdist + 1700), the city to 1,500 pt (`City.update`), detailed props to 1,200 pt. At camera B that edge sits a third of the way down the screen under only 34% fog, and above it there is nothing but the 2,400 m shoulder plane in the district's shoulder colour until the skyline band at 1,150 m: a quarter of the screen of flat navy between the last building and the painted city (`02-camB-3s-road-end.jpg`, `05-camB-road-end-void-120s.jpg`, `15-busiest-frame-camB-beauty-34s.jpg`). At top speed the edge drops to 40% from the top. Camera A never showed the horizon (`03-camA-3s-same-moment.jpg`), so none of this was visible before.
- The far end pops. A new 400 pt chunk appears every 30 m (0.8 s at cruise) a third of the way down the screen; lamp posts swap model at 90 m; enemy and civilian spawns at 52 to 75 m appear two thirds of the way up the visible road.
- The camera sits inside the towers in hairpins. Towers 24 to 44 m tall stand 25 to 34 m back from the kerb; at 22 degrees of pitch the camera is 44 m up and 74 m behind the player, so when the road turns 120 to 170 degrees the camera swings across the inside block and ends up inside or right behind a tower. The occlusion lift (toward pitchHi 30, distHi 98) is too low to clear a 40 m tower it is standing in. At 10 s the casual and the skilled runs both show a frame that is nothing but facade with "HAIRPIN brake or drift" over it (`17-casual-10s-hairpin.jpg`, `14-skilled-10s-hairpin-tower.jpg`); every other hairpin shot shows a tower cutting the frame (`13-skilled-hairpin-360.jpg`, `12-idle-hairpin-barrier.jpg`). The lift also makes the frame breathe in every corner.
- The skyline band is placed for camera A's fog: its foot dissolves into the fog colour over the lower 40% of the band, but the ground in front of it is not fogged to that colour, so the band floats on a lighter plane.
- The car is smaller at B than at A (86 m against 76 m) while the point of B was to show the car. In busy frames the hero is hard to find at all (`15-busiest-frame-camB-beauty-34s.jpg`: it is under the pops, right of the special button).

Fixes (all S; quality 5 together):

- Generate further and fog the end: road and city chunks to 4,000 pt ahead (300 m; about 6 more road and 6 more city draws at roughly 1,100 and 600 triangles each), props still cut at 1,200 pt; a distance-fog floor so the last 100 m are fully fog colour (fogFactor = max(fogExp2, smoothstep(200 m, 290 m)) in the patched fog chunk, or density 0.0045 at night with the height term reduced so towers still rise out).
- Match the ground to the fog: the shoulder plane and the dome's lowest band take the fog colour at the horizon so the skyline band's foot lands on the same colour; lower the band 60 m so its painted street level sits at the horizon line.
- Spawn out of sight: every spawn at max(1,900 pt, 1.3 s x speed) ahead; chasers from behind at 600 behind. It also fixes "appeared from nowhere" at camera A at speed.
- Make B the camera it was meant to be: pitch 24, slant 66 m, FOV 44 widening to 52, player at 62% from the top, lead cap 0.36 rad; the car doubles in screen area and the horizon stays at 7 to 14% from the top. Keep the camera out of buildings: clamp tower height to 14 m within 60 m of the road's inside edge through hard corners (the city generator knows the corners), and lift to camera A's height (not B's pitchHi) when the camera position itself is inside a building footprint; test occlusion only against blocks within 25 m of the car.
- Mid-ground silhouettes: a cheap second ring of building blocks (no windows, 2 draws) between 150 m and 500 m on both sides, so the far street has a skyline of its own before the painting takes over.

### 7. Visual quality: horizon, pop-in, fog, lighting, materials, effects, anything that looks cheap

What is good: the showroom title, the imported hero, traffic cars and enemies, the wet road with puddles and streaks, the smoke atlas (`10-bruiser-tell-smoke-hit.jpg`), the neon reflections, the Meshy props and landmarks, the Bruiser tell ring and arrow, the bloom and grade, the HUD typography, the Bulwark moment (`11-bulwark-ram-hit.jpg`).

What looks cheap, in order of how much screen it takes:

- The city boxes. Every building is a textured box with a 256 px window atlas in NearestFilter (crisp 20 x 16 px windows), a parapet, two roof boxes and a neon tube. At camera B the player looks along the street at a low angle, so the boxes fill 40% of the frame: identical window grids, flat tints, no facade depth, no ground floor beyond the storefront GLB (which stops at 90 m), no side streets (the city is a corridor with no cross streets). Camera A looked down at the roofs; B looks at the walls.
- The far end and the pop-in (area 6).
- The explosion (area 3) and the wreck that keeps driving.
- The hero at 20 pt wide. The imported model's clear coat, light bars and wheels cannot be seen at 86 m; the cyan readability glow and the headlight pool are what shows.
- Enemy identity at distance: Dart, Ram and Gunner are dark bodies with coloured strips; from 86 m in a corner they are dark blobs with red dots. The Bruiser tell reads; nothing else does.
- Flat lighting: one key light at 58 degrees (the moon) with a 1024 shadow map on iOS over an 80 m box; cars have a soft blob, buildings cast nothing visible, the road is lit evenly, the street lamps do not light the cars that pass under them.
- Text on planes (neon signs, corner boards, district signs) is canvas textures; the corner boards and the painted BRAKE are from the gray-box and look it.
- CSS triangles for threat chevrons; plain text for pops; skid marks as grey quads.

Fixes:

- City facade pass (M, quality 5): a 512 px facade atlas with 4 building styles (window rhythm, floor bands, a ground floor, a roof line), trilinear filtering, per-floor vertex variation; a second instanced detail draw for balconies, fire escapes and the existing AC unit on facades; cross-street gaps every 400 to 600 pt with a lit side street 40 m deep, so the corridor reads as a city and the director has somewhere for the "side street" cards.
- Camera B closer (area 6) does more for the hero than any material change.
- Enemy readability (S, quality 3): emissive strips 3x brighter with distance (the HEAD_K trick in reverse), a bigger light bar on the Ram.
- Lamp lighting on cars (S to M, quality 3): three pooled point lights (no shadows) on the three nearest lamps ahead; affordable at this draw count, to be confirmed on the phone.
- Explosion v2 (area 3).

### 8. Audio

What exists (`audio.js`, 61 lines): a two-oscillator engine, a noise-based squeal and scrape, 20 one-shot synth sounds, a three-layer procedural music loop at 128 bpm keyed to the pressure wave, an iOS unlock routine. Sound and music on by default.

What is wrong:

- Everything is a beep. No transients, no sub, no texture: `shot` is 50 ms of noise and a square blip, `wreck` a sine sweep and noise, the engine a sawtooth at 0.04 gain. In a game whose complaint is "hits feel weak", audio is the cheapest lever not yet pulled.
- No mix: nothing ducks; the gun at 12 rounds a second plus the engine make a continuous buzz that masks the kill sound.
- The music does not know what is happening: three layers on the pressure flag; no intro, no breather drop, no boss, no finale, no stinger on a combo or a streak.
- Nothing is spatial: an enemy behind, a Gunner sighting and a Bruiser beside the car sound the same; the Gunner, the main killer of good players (14 of 20 skilled deaths), is a 1,200 Hz double blip.
- iPhone silent switch: the silent-media trick is in; Jack should confirm sound with the switch on.

Fixes: the sampled pack with the duck (area 3; M, fun 5); two engine loops cross-faded by speed with a lift-off pop and a gatling spin loop pitched by heat (S once samples exist); authored music with three stems, a breather filter sweep, a stinger bank and a finale stem (M, fun 3; a Sprint E item if the budget is tight); one-shots panned by source x and a low "whump" when a chaser arrives behind (S, fun 2).

### 9. UI and HUD

What exists: a score plate top left (42 px score, best, ARMOR pips, speed in PT/S with TURBO, DRAFT or NITRO tags), a combo counter with a 56 px bar, a callout band at 86 px, red CSS chevrons at the bottom for enemies behind, a white one at the top for the truck, the special button with an ammo badge, four grey text buttons, pause, the showroom title, pause and death cards, settings in four groups.

What is wrong:

- The HUD describes an engineering build: PT/S is not a player unit; the readout changes every frame and pulls the eye top left; nothing warns before a pip goes (a half-pip hit is a 0.5 opacity vignette).
- No goal readout (area 4).
- Callouts stack: "Hairpin", "Too fast", "Hard corner" arrive 0.8 s apart and replace each other mid-read; the 64 px "360" callout sits in the middle of the screen over the road (`09-callout-and-pops-over-buttons.jpg`). The audit's "one instruction at a time, four words at most" holds; the rate does not.
- Score pops land on the buttons (area 3).
- The threat chevrons are 24 px CSS triangles under the thumb; the Gunner behind is announced by one of them plus a blip (`07-gunner-kill-death.jpg`: the sight line is clear, the warning was not).
- The death card is a stat dump (WRECKS, SLAMS, COMBO, seconds, DRIFTS, TOP, HAIRPINS, cash) that wraps badly ("74 s" splits over two lines), says nothing about what to do differently and buries the replay. The look toggle (NIGHT, DUSK, BLUE HOUR) is drawn on top of the NEW ROAD and TITLE buttons on the death card (`08-death-card.jpg`, `18-casual-barrier-death.jpg`): a layout bug, those two buttons cannot be read.
- The four buttons are text on grey discs; only SPECIAL has an icon; FIRE shows heat as a border colour.
- Settings expose the tune panel, the frame counter, the benchmark and the camera switch: fine for Jack, to be gated before anyone else sees it.

Fixes: HUD for the run (S to M, quality 4: a stage progress bar top centre, speed dropped or an arc behind the car, a heat ring on FIRE, a red edge flash on the side a hit came from, a "GUNNER BEHIND" edge pulse); a callout queue of one with 1.4 s minimum (S); pops clamped above the button band (S); the look toggle hidden on the death card (S); a death card with the cause large, one tip tied to the cause, the best moment replay (G.bestMoment exists), a grade and one big button (S, fun 3); button icons and pressed glows (S, quality 3).

### 10. Performance headroom for more effects on an iPhone

Measured (counts exact, times are not): peak 132 draw calls and 377k triangles across every run; a typical busy frame 104 calls and 282k triangles (table above). The sim costs 0.023 to 0.042 ms per 120 Hz step in node, about 3 to 5 ms a second: negligible on the phone even at 3x slower.

Where the triangles go: the street lamp is the single biggest spend (76,760 in the busy frame, 27%, at 4,040 triangles per lamp with up to 19 in range), then storefronts (37k), billboards (28k, drawn twice because they cast shadows), AC units (18k), the hero (10k plus wheels), phone booths (10.6k), enemies (Dart 4,277, Ram 3,840, Gunner 3,908, Bulwark 3,997, Mule 8,068 plus the arm 4,025), traffic cars (3,957 each). Buildings and road are cheap (18.5k over 14 draws).

Where the draw calls go: 103 main draws, of which 25 are kit prop instanced meshes (many with one or two instances), 23 are single sign and label planes (two triangles each), 8 are empty instanced meshes (count 0, still submitted), 14 road and city chunks, 8 effects batches, the rest cars and props; 40 shadow-pass draws (8 of them empty); 17 post draws (bloom mips, LUT, vignette, grain).

Headroom and risks:

- Draw calls: 104 to 132 of 150. Easy returns before adding anything: skip instanced meshes with count 0 (16 calls), merge the sign planes into one instanced quad with an atlas (22 calls), drop billboard shadows (1). That buys about 40 calls, enough for the far world (12), explosion v2 (2), the silhouette ring (2), the gatling (1) and the boss (1) with 20 to spare.
- Triangles: 282k to 377k of 400k is tight. A 1,200 triangle street lamp returns 50 to 70k; billboards without shadows return 28k. Do both before the far world adds its 15k and the boss its 8k.
- Fill rate is the real iPhone risk, not counts. At scale 2 the frame buffer is 780 x 1688 half-float with MSAA 2, then a bloom chain, LUT, vignette and grain; up to 896 additive pool and glow quads and 600 smoke quads stack over the road, and camera B stacks them deeper. Expect an iPhone 12 to sit at scale 1.25 to 1.5 at 60 fps and an iPhone 14 or 15 at 1.75 to 2.0; the adaptive scale will hold the frame rate at the cost of softness. The v19 Show FPS readout on Jack's phone is the only real number: ask for the 10 s low at camera B in a busy minute before and after Stop 1.
- Memory: the page is 10.4 MB with 11 MB of models embedded as base64 (decoded at load); textures are 1024 px WebP per car. iOS Safari's per-tab memory is the limit on more textured cars; the boss and the gatling are fine, a second car set needs a shared atlas.
- After the proposed Sprint D work: about 110 to 125 calls, 300 to 340k triangles (with the lamp and billboard savings), 12 MB.

## The top 10 changes, ranked by fun and quality gained per unit of effort

| # | Change | Effort | Fun | Quality | Why it ranks here |
|---|---|---|---|---|---|
| 1 | Hide the end of the world at camera B: generate road and city to 4,000 pt, a fog floor at 200 to 290 m, ground and skyline foot in the fog colour, skyline band 60 m lower | S | 2 | 5 | Jack's own complaint, graphics are priority 1, a day in two files |
| 2 | Spawn out of sight: every spawn beyond max(1,900 pt, 1.3 s x speed), chasers 600 behind | S | 3 | 4 | Removes the 84% of pop-ins; threats arrive instead of appearing |
| 3 | Feedback pack: 100 ms kill hit-stop, 4% punch-in, slow motion on car kills, shake in screen fraction, whole-body hit flash, pops bigger and off the buttons | S | 5 | 2 | The cheapest half of "hits feel weak" |
| 4 | Enemies with hit points that show: 3x hp, two damage states, wrecks that stop | S | 5 | 3 | Turns a 0.17 s pop into a half-second fight the player can see |
| 5 | Sampled sound pack with a side-chain duck (gatling, impacts, explosions, engine, stingers) | M | 5 | 2 | The other half of "hits feel weak"; nothing else in the game is still a beep |
| 6 | Camera B closer and out of the towers: 66 m, player at 62% from the top, FOV 44 to 52, tower heights clamped on hairpin insides, lift to camera A height when inside a block | S | 3 | 5 | Doubles the hero's screen area, keeps the horizon, ends the facade-filled frames in every hairpin |
| 7 | Director v2: authored encounter cards, enemies at the player's speed band, a 20 s escalation beat, announced breathers, shorter technical sectors | M | 5 | 1 | The biggest fun item; needs 2 to 4 first or the cards are still cardboard |
| 8 | One hold button: FIRE is the gatling, speed is automatic at 700 to 800 with a surge while firing (or GAS as a toggle); Slam on contact intent; reverse and the 360 out of Level 1 | S sim, M with baselines | 4 | 1 | Weak drivers hold one thing; make it the thing that produces events |
| 9 | The hood gatling that reads: Jack's module on the hood, muzzle flash with a road pool, shells, heat glow | M | 4 | 4 | Already planned; below 3 to 5 because without them the gatling still feels weak |
| 10 | A run with a shape: 3-minute Level 1 with a progress bar, a pit stop, a boss finale, a results card with a grade and a tip | L | 5 | 3 | Fixes "no goal"; last because it is the biggest and because 1 to 9 make its three minutes worth playing |

Just outside the ten: the draw-call and triangle housekeeping (empty instanced meshes, sign atlas, a lighter lamp: S, needed before anything is added), the city facade pass (M, quality 5), explosion v2 (M, quality 4, fun 3), the first 30 s rewritten for the buttons (S, fun 4, inside item 10's first stage), the death-card layout bug and the callout queue (S), enemy readability at distance (S).

## What to cut or simplify

- Cut from Level 1 (keep the code behind flags): the 360 spin, reverse, the gap and detour setups, forks, lane closures, the oil slick and nitro specials (missiles only), the daily run button, cash and the "+N cash" line, district signs, hill-crest air, the "Tap half to Slam" and auto-drift settings, the look toggle on the death card.
- Simplify: technical sectors to 3,000 to 5,000 pt with one hairpin; the Level 1 roster to Dart, Ram, Gunner, Bulwark and the boss; the specials to one button with one weapon; the four buttons to two holds at most (item 8); callouts to a queue of one.
- Stop investing in until the fun gate passes: more looks (dusk and blue hour become a stage colour change only), the tune panel, the canvas renderer fallback, the hairpin barrier tuning (frozen already), the concept studio modes.
- Do not cut: the showroom title, the wet road, the smoke, the imported cars and props, the determinism and replay machinery (every sim change in Sprint D needs new baselines in the same commit; the six current baselines all matched on this build).

## Sprint D, proposed as three stop points

The current plan ("Fun First": a pacing director, a gatling with heavy hit feedback, a 3-minute run with a progress bar, combo and finale) has the right three items. Two changes: put the camera B world fix and the feedback pack before the gatling, because the gatling will be judged through them; and shrink the 3-minute run to a progress bar plus one finale, leaving the drop and the city maze to Sprints E and F as the roadmap says. The combo stays as it is for now; a bigger counter and a stinger ladder ride along with the sound pack.

Stop 1: "It looks finished and hits hard" (S and M items, about a third of the sprint)
- The world at camera B: items 1, 2 and 6 (generation distance, fog floor, skyline foot, out-of-sight spawns, closer camera, towers clamped on hairpin insides, the lift fixed). Camera B becomes the default.
- The housekeeping that pays for the rest: empty instanced meshes skipped, sign planes merged, a lighter lamp, billboard shadows off.
- The feedback pack and enemy damage states: items 3 and 4.
- Sampled sound pack v1 with the duck: item 5.
- The hood gatling model, flash, shells and heat on the existing rotary logic (same rate, 8 degree cone, overheat), so the sim change is small: item 9. New baselines.
- Gate (Jack's phone): "the hits feel heavy" and "I cannot see where the road ends" in two minutes of play, and the 10 s low FPS at camera B in a busy minute.

Stop 2: "Something pushes back every few seconds" (M items, about a third)
- Director v2 with authored encounter cards, enemies at the player's speed band, the 20 s escalation beat, announced breathers, shorter technical sectors: item 7.
- The one-hold control model and the Slam on contact: item 8 (the sim change with the widest baseline impact; here, not in Stop 1, so Stop 1's gate is about feel only).
- The first 60 s rewritten for the buttons and distance-gated.
- Bot gates before Jack's: casual time to first attack under 8 s; median enemy life on screen over 3 s; no-threat gap under 3 s; casual damage from enemies (not walls) at 1 to 2 events a minute; idle still under 5 wrecks a minute. Jack's gate: "something happened every few seconds and it was not a wall".

Stop 3: "A run with a shape" (L item, the last third)
- The 3-minute Level 1: a progress bar with three marks, a stage colour change (night to blue hour is free), the pit stop (the Mule tops up missiles and armor; the Refit cinematic stays in Sprint F), the boss finale with `boss.glb`, a health bar and two phases, checkpoints at the marks, the results card with a grade and a tip: item 10.
- HUD for the run (progress bar, heat ring, damage direction, Gunner tell), the callout queue, the death-card layout fix.
- Gate: Jack finishes a run, can say what the goal was, and presses DRIVE AGAIN without being asked.

If the sprint runs short, Stop 3 ships with the progress bar, the pit stop and the results card, and the boss moves to the start of Sprint E. Stops 1 and 2 are what Jack's three complaints are about and should not be traded.

## Screenshot index (design/audit-shots/)

| File | What it shows |
|---|---|
| 01-title.jpg | The showroom title, the strongest frame in the game |
| 02-camB-3s-road-end.jpg | Camera B at 3 s: the road and city end a third of the way down the frame, bare ground to the skyline band |
| 03-camA-3s-same-moment.jpg | Camera A, same seed and moment: no horizon, no gap, the car readable |
| 05-camB-road-end-void-120s.jpg | Camera B in minute 2 of the skilled run: the void again, a MERGE sign, spawns in the far third |
| 06-chain-wreck-explosion.jpg | A chain wreck at 60 s: two orange pools and pops over the buttons are the whole event |
| 07-gunner-kill-death.jpg | The passive run's death: the Gunner pair's sight line and the player's explosion as a white blob |
| 08-death-card.jpg | The death card: stat dump, "+277 cash", the look toggle drawn over NEW ROAD and TITLE |
| 09-callout-and-pops-over-buttons.jpg | "360 spin turbo" at 64 px mid-screen; pops on the SPECIAL and GAS buttons |
| 10-bruiser-tell-smoke-hit.jpg | The Bruiser tell ring and arrow, the tyre smoke, an armor hit callout: what works |
| 11-bulwark-ram-hit.jpg | Ramming the Bulwark under the overpass: the hero shows through as a cyan outline |
| 12-idle-hairpin-barrier.jpg | The idle replay's first hairpin: barrier hit, camera lifted, a tower in the frame |
| 13-skilled-hairpin-360.jpg | A hairpin at 110 s: the hero hidden behind buildings, an accidental 360 |
| 14-skilled-10s-hairpin-tower.jpg, 17-casual-10s-hairpin.jpg | 10 s into two different seeds: the frame is a tower facade with "HAIRPIN" over it |
| 15-busiest-frame-camB-beauty-34s.jpg, 16-busiest-frame-camA-beauty-34s.jpg | The frame the draw-call breakdown was taken on, both cameras |
| 18-casual-barrier-death.jpg | The casual run's death card: "HIT THE BARRIER" at 49 s, 22 wrecks, 0 Slams |
| sheet-*.jpg | Every shot of every run and replay, labelled with sim time and event |
| metrics/*.json | Per-run metrics and the shot lists |
