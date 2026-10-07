# Sprint D, Stop 5 (cut short) and Driver Control and Carnage (report)

Build: https://claude.ai/artifact/Ae94og4nbVyk46LuFhsYPn (version 27). Branch `shunt-3d`. Nothing from the next stop is started.
**The sim changed** (replay format 4, rev `D6`): six new baselines `drive-s{1,2,3}-{active,idle}.json` plus a new `beauty.json`. The `hill-*` D5 baselines from the Stop 5 checkpoint are retired, and older replay formats are not read.
"Jack's v26 notes: [add yours here]" arrived empty, so no v26 notes went into this stop beyond the change of plan.

## 0. What was kept from Stop 5 (checkpoint commit, then carried on)
- **Hills and jumps:** a rolling height profile, jump crests, ballistic air with soft landings (a small hop, never a crash for landing), wrecks that follow the ground, ramps over a pile of wrecks, and airtime as an earned hero shot. Clip `kept-jump-boost.mp4`.
- **BOOST:** a small button above the puck with a meter that refills from near misses, drifts, airtime and takedowns. It gives a burst, a flame and a lens kick.
- **Shock mines:** hold MISSILE to drop one behind (the badge counts them). A pursuer that trips it tumbles into the others, and crates refill them. Clip `kept-mine.mp4`.
- **Removed:** the swipe-down/swipe-up turn-around was built, then taken out as asked. The e-brake 180 below replaces it.
- Committed as the Stop 5 checkpoint with its own baselines (rev D5) before the new work started.

## 1. The player sets the pace
- **No automatic speed.** The throttle is analog: floor it (top speed 1,000 pt/s, BOOST goes past that), ease off and coast (the car slows gently), brake to a stop, keep holding brake to **reverse** (up to 340 pt/s), or sit still in the road and shoot.
- **E-brake:** in a bend it drifts. With the thumb hard over (on a straight, or in a bend under 400 pt/s) it **spins a 180** in half a second, and the car then faces back down the road and drives that way. The camera swings round behind the car. Gas plus e-brake at a stop is a **burnout**: smoke, a physics fishtail, and on release a launch with a short turbo. While the e-brake is held, gas only spins the wheels, so the car does not drive.
- **Enemies adapt.** Cars that overshoot a stopped or slow player **turn round** (a U-turn of about 0.7 s) and come back. Rams and Darts **charge** from ahead or behind (a tell, then 560 pt/s head-on). Gunners sit at either end and fire along the way they face. Enemies never drive backwards. Civilians follow the car in front and change lanes when they are blocked.
- **Spawning keys off distance and time**, whichever is further along, so sitting still does not stall the action. In a 50 s scripted stand-off: 11 takedowns, 23 U-turns, 5 waves, 3 armor lost, and on average 1.7 enemies within reach. The run still ends at the city.
- **Regrade** on score per minute, takedowns, pile-ups, best combo and a time bonus (weights 0.30, 0.20, 0.10, 0.05, 0.35; time is full at 100 s and zero at 145 s). Letters are S from 0.85, A from 0.64, B from 0.55, and C below that.

## 2. The control puck (prototype)
- **Left thumb steers**, the same as before.
- **Right thumb: one large puck** (196 px, bottom right). Up is gas (analog), the centre coasts, down brakes and then reverses once stopped. Sliding right fires the gatling, so up-right is gas plus guns and down-right is standing fire. Sliding left is the e-brake (drift in a bend, full steer for the 180, gas while stopped for a burnout).
- The puck has zone labels (GAS, BRAKE REV, FIRE, E-BRAKE) that light up in use, a visible thumb dot, a coloured rim for fire and the e-brake, and a short haptic tick on entering a zone (where `navigator.vibrate` exists; iOS Safari has none).
- **MISSILE and BOOST** are small 70 px buttons above the puck. Tapping MISSILE fires a missile; holding it drops a mine.
- **Settings > Simple buttons** swaps the puck for GAS, BRAKE, FIRE and E-BRAKE buttons. Left-hand mode mirrors both layouts.
- **No auto-fire, ever.** The gun only fires while the thumb is in the FIRE zone (or FIRE is held).
- **Keyboard:** W or Up for gas, S or Down for brake and reverse, Shift or C for the e-brake, Space, J or F to fire, B for BOOST, M for a mine.
- After a 180 the steering is mirrored, so the thumb still moves the car left and right on screen.

## 3. Carnage
- **Cars break into pieces** (civilians too) when they are shot up, rammed, mined, hit by a missile or crashed hard: front and rear bumpers, hood, both doors, roof, wheels and body chunks. Each model is split once at load (`render/three/carChunks.js`, a triangle split into eight parts on the car's own material, one instanced draw per part).
- The pieces are real Rapier bodies (`sim/crash.js`). A piece that hits an enemy hard **flips it** (a pile-up, credited to the player) or spins it out. Active pieces are capped at 16; they settle and lie in the road for 5 s, then go.
- **Explosions are fire first:** a small orange pop (the big white flash is gone), a rolling fireball that cools from orange to deep red, flames licking at the base for about 2 s, a thick black smoke column and embers drifting up, then a burning wreck. The yellow flash and the arcade rings are cut right back (the kill glow is a third of what it was, with no shockwave rings).

## 4. World and camera
- **Buildings sit behind the pavements.** The street front is set back 96 pt from the road edge, the lamps stand on the pavement, and nothing is on or over the road (no overpasses or gantries; the road sign is on a post at the side).
- **Camera C is the default** (close behind, low). It now follows the car most of the way across the road (70%), because a 10 m wide view lost a car at the kerb. Hero shots hold off during and for 2.5 s after a 180 or a burnout, so the turn is never cut away from. Tyre smoke between the camera and the car thins out, so the car shows through a burnout.

## Clips (`design/stop5/clips/`)
| Clip | What it shows |
|---|---|
| `standoff.mp4` (7 s) | The car brakes to a stop and shoots it out in the road. Enemies charge from ahead, overshoot, U-turn and come back, and two go up in a pile-up |
| `burnout.mp4` (4 s) | Gas plus e-brake at a stop: smoke, fishtail and the BURNOUT score, then the launch, a ramp and airtime |
| `ebrake-180.mp4` (4.4 s) | At speed, e-brake with the thumb hard over: the car spins round, the camera swings behind it, and it drives back down the road |
| `break-apart.mp4` (2.4 s at half speed) | Two cars come apart under the gun: hood, doors, wheels and chunks fly |
| `fire-explosion.mp4` (3.2 s) | Fire first: orange fireball, flames, embers, black smoke rising |
| `kept-jump-boost.mp4` (5 s) | Kept from Stop 5: a ramp over a jam, the airtime shot, a pile-up on landing, then a BOOST |
| `kept-mine.mp4` (3.8 s) | Kept from Stop 5: a shock mine, the pursuer tumbles, a SHOCK MINE pile-up |

These are software-GL renders at phone size, stepped in sim time. Feel is for Jack's hands.

## Checks

| Check | Result |
|---|---|
| Replays | 7 of 7 new baselines match on two sync passes each (14 of 14). `beauty.json` matches through the live 3D frame loop: 90 of 90 hashes, on the published build |
| Draw calls | 101 worst frame across the seven clips; 100 and 98 in two full runs (one frame every 8 s) (limit 150) |
| Triangles | 259k worst (limit 400k) |
| Size | 13,145,114 bytes, 37 KB more than Stop 4 (limit +0.3 MB) |
| Physics cost | Rapier 0.15 to 0.36 ms a step with pieces flying (scripted runs) |
| **FPS** | **Not measured: Jack's phone is the gate (Show FPS, the 10 s low should be 50 or more).** |
| Bots (sync, final build, seeds 1 to 4, 300 s cap) | skilled: A, A, C, S (108 to 121 s; the C run spun two accidental 180s and lost 4 armor). casual: C, C, B, B (120 to 135 s). weak ("novice": no gas discipline, late brakes, holds FIRE): C, C, C, C (141 to 159 s). No input: never reaches the city, gets attacked from both sides (3 armor lost, 65 to 167 U-turns) |
| No em dashes in player-facing text | checked |

## Not done or not verified
- **Everything here is software-GL renders and scripted bots.** How the puck feels under a thumb (zone sizes, the 0.38 dead band for fire and e-brake, rocking from gas to gas plus fire), whether the 180 is too easy or too hard to trigger, and the FPS low on Jack's phone all need his hands.
- **The grade does not yet separate casual from weak cleanly.** On two seeds the casual bot limps (9 armor lost) and lands on C beside the weak bot. The bots are not humans, so I left the thresholds alone. Tell me which way to move them after a few real runs.
- Haptics do nothing on iPhone (Safari has no vibrate).
- Car pieces use a geometric split of each model (by position on the body), not hand-cut parts, so a door is the side panel and a hood is the top front.
- Things from Stop 5 that were not started move to the next stop.
