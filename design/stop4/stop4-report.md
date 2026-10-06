# Sprint D, Stop 4: controls, carnage and cameras (report)

Build: https://claude.ai/artifact/Ae94og4nbVyk46LuFhsYPn (version filled at the end). Branch `shunt-3d`. Stop 5 is not started.
**The sim changed** (replay rev `D4`): six new baselines `ctrl-s{1,2,3}-{active,idle}.json` plus a new `beauty.json`; the `feel-*` D3 baselines are retired.

## 1. Controls (Jack's correction applied: NO auto-fire)
- **Gas stays automatic.** **BRAKE is back**: held, it slows the car toward 400 pt/s (a drift holds a little more), so enemies pass and the road is easy to read.
- **Brake-tap drift.** BRAKE while steering into a turn (or while a corner the tyres cannot hold is near and the thumb is neutral) throws the car into an easy drift at once:
  a smaller slip angle (20 to 36 degrees, the old drift was 18 to 52), and a drift that forgives the thumb drifting back toward the centre. Corners the tyres cannot hold still start an easy drift on their own;
  a hard steer on a straight still gives the wide drift. No spin, no skill wall. The hairpin hint now reads "Tap BRAKE and steer".
- **No auto-fire, no option for it.** The gatling fires only while FIRE is held, from the instant of the press (unchanged from Stop 3).
- **Right thumb layout** (390 x 844 stage): FIRE 112 px and BRAKE 112 px side by side at the bottom, 20 px apart so rocking between them cannot press the wrong one; MISSILE (84 px) above FIRE; the spot above BRAKE (right 150 px, bottom 148 px, 84 px) is reserved for BOOST (an empty hidden `#boost` button is in place for Stop 5).
  Steering stays on the left thumb (anywhere that is not a button). Left-hand mode mirrors all of it. Screenshot in the clips.

## 2. Carnage
- **Fewer commuters:** 2 civilians on the road at a time (was 3 to 4; 1 in technical sectors), 4 at the start (was 7), jams of 4 (was 6). Weave lines are unchanged.
- **Every hit on a civilian is catastrophic:** it is launched up and ahead (8 to 12 m/s up, faster than the hero forward), tumbling and rolling, and flies into whatever is in front; it explodes when the closing speed is high.
  The hit still costs the -100 CIVILIAN penalty and a little speed, but no longer drops the combo. The flying civilian carries the player's credit.
- **Takedown with a pile-up bonus:** a launched civilian that hits an enemy is a takedown labelled CIVILIAN PILE-UP, scored as a pile-up plus 450. Chain pile-ups continue through the existing Rapier collisions.
- **Hard cap kept:** at most 6 tumbling physics wrecks (a 7th retires the oldest). Cost: Rapier about 0.06 to 0.10 ms a step in the scripted runs (unchanged).
- Counts in a 140 s scripted run that steers into civilians: 18 launches in 45 s, 7 pile-ups.

## 3. Cameras A, B, C
- **A** high (unchanged), **B** chase (unchanged, the default), **C** close behind the car, low and tight (19 m, 9 degrees, 60 degree lens) to show the hero's detail.
- Chosen **before the run** in Settings (Camera: A, B, C) and by a selector on the title card (A HIGH, B CHASE, C CLOSE), and **switchable in play** with a small CAM button under the pause button. Remembered between visits.

## 4. Camera director (`src/render/three/shots.js`, render side only: it never writes to the sim, steering stays relative to the car)
- **Named shots:** close chase, chase (the chosen camera), tracking alongside, rising crane, corner and drift cam, tunnel low, crash cam, airtime. Every parameter blends over a set time (an exponential settle, never a cut).
- **Corner and drift cam:** in a hard corner or a held drift the camera rises a little, swings 34 degrees to the outside and turns 4 degrees toward the exit, so the drifting car is seen sideways with its smoke (clip below). Held for a second after the cause ends so a short drift does not flap the camera.
- **Buildings between the camera and the car fade see-through:** pixels of a building within 6.5 m of the camera-to-car line are dithered away (a screen door), above head height only, so the pavement stays solid.
- **Hero shots:** earned by a takedown, a pile-up (or a civilian launch) or a near miss; one waits a quarter second after the event, then plays 1 to 3 s; at least 8 s apart; never the same angle twice in a row; never when danger is close
  (an enemy near or about to strike, a barrel or barrier ahead, a hard corner within 420 pt, the last armor pip, limping, rolling, in the stun after a wall); a **tap skips** it (any touch, including a button); the budget is 12 a run.
  **Settings > Fewer hero shots** halves the length, doubles the gap (16 s) and cuts the budget to 5. Camera A has no director (it is the plain high view).
- Seen in the scripted runs (`tools/shots.mjs`): see the numbers below.

## 5. Camera Lab (tune panel: Settings > Developer > Tune panel > Camera Lab)
Folders for Camera A, B and C and for each of the seven shots, each with: height (m), distance (m), angle (deg), lens width (fov), car on screen, lean into turns, blend (s) (and yaw, aim at the exit and shot length for the shots).
Height, distance and angle are three views of one pair of numbers (height = distance x sin angle). "Hold a shot" pins the director on one shot so it can be looked at; "Copy camera values" copies the JSON; "Reset cameras" puts the defaults back. Edits are kept in the phone's browser.

## Clips and stills (`design/stop4/clips/`)
- `brake-tap-hairpin.mp4` (5 s): a brake-tap drift through the first hairpin of seed 3, camera B, corner cam (sheet `brake-tap-sheet.png`).
- `civilian-launch.mp4` (5 s) and `civilian-pileup.mp4` (6 s): the hero runs into civilians that tumble through the air into traffic (sheets alongside).
- `cameras-A-B-C.mp4` (same 5 s hairpin stretch in A, B and C side by side; stills in `cameras-A-B-C-stills.png`). A and B/C differ on the straight; in the corner B and C both go to the corner cam, C closer.
- Software GL renders at phone size, stepped in sim time. Feel is for Jack's hands.

## Checks
