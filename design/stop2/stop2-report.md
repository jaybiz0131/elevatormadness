# Sprint D, Stop 2: looks finished, hits hard, never dies (report)

Branch `shunt-3d`. Build: https://claude.ai/artifact/Ae94og4nbVyk46LuFhsYPn (version 22).

**The sim changed in this stop** (replay rev `D1`, same tag, new behaviour). The seven Stop 1 baselines are replaced by seven new ones
(`replays/fun-s{1,2,3}-{active,idle}.json` and `beauty.json`). All seven match on two sync passes, and `beauty.json` also matches through the live 3D frame loop
on the final build (90 of 90 hashes, 1,688 s of software GL).

## What the player gets

- **Combat race.** You never die. Every hit, ram and wall costs speed (so time). Hairpin walls slow you and bounce you back onto the road. At zero armor the car
  goes into **limp mode** (smoking, no gas, 55% speed, a flashing LIMP tag on the HUD) until a repair crate is collected; one is sent about 2.5 s after the limp starts
  (a green crate with a beacon, 1,600 pt ahead). Repair gives 2 armor, a short burst and a second and a half of grace. Each kill gives a speed burst (240 plus 60 per combo step for 1.1 s), so
  fighting is the fast way through.
- **Finish card.** Time and score give a rating: letter S, A, B, C or D plus 1 to 3 stars, with time, kills, best combo, armor left and times limped. The HUD shows the clock (m:ss) at the top.
- **Spawns out of sight.** Everything arrives from at least 2,600 pt ahead (more at speed) or from 650 pt behind, never in the visible 1,800 pt. Gunners and most Darts come from behind. Far-ahead enemies
  ease off so they do not vanish; enemy lights fade out beyond 1,700 pt.
- **Enemies show damage.** 3x hp (Ram 18, Dart 9, Gunner 21). Under 2/3 hp: grey smoke. Under 1/3: dark smoke and sparks. Under 1/6: fire. Wrecks skid to a stop, burn, then smoulder for about 6 s.
- **Kill feedback.** 100 ms hit stop (150 ms on car kills), 4.5% camera punch-in over 0.18 s, 0.3 s of slow motion at half speed on car kills (0.4 s on chains),
  shake sized as a fraction of the screen (so it feels the same at any camera distance). Score pops are clamped between y 96 and 590 (the buttons start near 620), kept on screen and never stacked on each other.
- **End of the world hidden.** Road and city are built to 4,000 pt, a fog floor takes everything beyond 200 to 290 m to the fog colour, and the ground and the skyline base are the fog colour, so there is no gap between the road and the skyline.
- **Camera B** is the default: closer (66 m slant, 44 degrees, 21 degrees pitch against 22 and 86 m before), the car 38% up the screen. In a hard corner it lifts, follows the car across the road, and towers, big landmarks and
  inside-of-the-bend buildings stay out of the way (buildings round a hard corner are 7 m or lower, and a plot that would land on the road's other arc is left empty).
- **Pickups** are colour coded: yellow ammo, cyan armor, green repair (bigger, with a beacon), and grow into view over their last 400 pt.

## Numbers

| | Result |
|---|---|
| Weak-driver bot (no gas, never aims or drifts, late braking), 4 seeds | finishes at **199 to 216 s**, grade D, 1 star, 2 to 5 limps |
| Casual bot (steers at the nearest enemy, gas when clear, fire when ahead, no drift or Slam, thumb limited to 220 pt/s), 4 seeds | finishes at **130 to 139 s**, grade B, 2 stars |
| Skilled bot, 3 seeds | finishes at 153 to 162 s; seed 2 scores 58,883 and gets S with 3 stars (the other two grades I did not read; the casual bot is faster because it holds gas while the skilled bot stops to fight) |
| Idle bot (never touches the screen), 3 seeds | finishes at 219 to 229 s |
| Nobody dies | 0 deaths in 24 bot runs |
| Draw calls, worst frame in 3 full runs | 99, 101, 109 (budget 150) |
| Triangles, worst frame in 3 full runs | 383k, 337k, 388k (budget 400k; thin) |
| Size | 11.0 MB single file (budget 15 MB) |
| No-threat time, 6 baselines, visible window (300 behind to 2,000 ahead) | 12.3%, longest gap 6.9 s (during limp, where waves are paused on purpose) |
| Same, old audit window (300 behind to 900 ahead) | 18.8% (it is higher because enemies now arrive from beyond view) |

Stop 1's dead-time numbers used the 900 pt window and spawns at 700 to 1,000 pt; they are not comparable now that the point is that enemies come from out of sight.
Skilled kills: 34 to 41 per run (about 4 s per kill, down from 2 s in Stop 1, which is the cost of 3x hp).

Weak bot: it takes about 90 seconds longer than the casual bot. The star and letter thresholds are `T.goal` in `src/sim/constants.js` (time 120 to 240 s, score reference 40,000; stars at rating 0.45 and 0.75).

## Performance changes

- Street lamp decimated from 4,040 to 994 triangles (`assets/models/street_lamp.glb`; the original is kept in `assets/models/source/`). 19 lamps in range, so about 58k fewer triangles.
- Empty instanced meshes are hidden (props, city, enemy models): they were still submitted as draw calls.
- Neon signs share one atlas and one instanced mesh (were up to 23 single draw calls).
- Detail models (storefronts, rooftop units, the lamp model) stop 900 pt ahead instead of 1,200.
- **Automatic render scale:** under 50 fps for 2 s steps the scale down 15% (not below 0.6); over 70 fps for 6 s it steps back up, and a step up that has to be undone within 12 s doubles the wait before the next try. Frames over 0.25 s are ignored.
  `?autoscale=0` holds the scale; headless browsers hold it by default, `?autoscale=1` turns it on there. I could not test it on a real phone; the Show FPS readout shows the scale.

## Checks

- Determinism: 7 of 7 baselines match on two sync passes each, and `beauty.json` through the live loop.
- No em dashes in player-facing text.

## Not done or not verified

- Sound and feel: the hit stop, slow motion and punch-in were checked in stills and in the clip only. I cannot feel them. The sim steps the same way, so the clip shows the punch-in but not the slow motion.
- The auto render scale is untested on a device.
- Hairpin framing is much better but not perfect: on a long seed some bends still show rooftops in the middle of the bend. The car and the road around it stay visible in all the shots I took.
- Triangles are at 388k of 400k in the worst frame, so there is little room for new props.
- Stop 3 not started (sound pack, director v2, one-button change, handbrake 180).

## Files

`before/` and `after/` (camera B at the horizon and on the first hairpin), `after-1/` (iterations), `kill-sequence.mp4` and `frames/` (a kill sequence at camera B), `win/` (finale and the finish card with the S grade), `pacing-*.json`.
