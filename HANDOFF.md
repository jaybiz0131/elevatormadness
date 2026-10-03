# Handoff: Shunt (spy car brawler), canvas gray-box → three.js port

Written at the pause before the three.js renderer port. Read this first, then `design/spy-car-audit-2.pdf`
(the 30-page audit whose sprint plan A–F drives everything below).

## Refs: where each build lives

| Ref | Commit | What it is |
|---|---|---|
| tag `canvas-sprint-c` | `2c9dc9f` | **The base for the port.** Audit Sprints A, B, C in the canvas renderer. |
| `ecb7983` | Sprint D | Downhill drops, built on C. Canvas pseudo-3D chase renderer included. |
| `98bf28b` | Sprint E | Arsenal and enemies, built on D. |
| branch `sprint-d-canvas-wip` | `98bf28b` | Unmerged branch holding D **and** E (E sits on top of D). Do not merge. |
| branch `claude/ios-game-creation-ryso4h` | this commit | Working branch ("main" for this project). History already contains D and E (not rewritten). |
| `origin/main` | `b0446c1` | The repo's default branch. Still only the original Elevator Madness game. Nothing from this project is on it. |

To start the port from Sprint C: `git checkout -b <new-branch> 2c9dc9f`, then copy this file over.

The tag `canvas-sprint-c` could not be pushed from the session that wrote this file: the container's git
proxy answered every tag push with HTTP 403 while branch pushes worked. Unless someone has created it since,
it does not exist on GitHub; use the hash `2c9dc9f`. To create it: `git tag -a canvas-sprint-c 2c9dc9f -m
"Shunt gray-box, canvas renderer, audit Sprints A-C" && git push origin canvas-sprint-c` from a machine
with normal GitHub access, or draft a GitHub release with that tag name targeting commit `2c9dc9f`.

## File map

| Path | What |
|---|---|
| `spycar/graybox/index.html` | The whole game: one file, one IIFE, no modules. Artifact-page format (no doctype, `<title>` first). |
| `spycar/graybox/shunt.html` | Generated standalone copy (doctype, viewport and iOS metas). Never edit; run `node build.mjs`. |
| `spycar/graybox/build.mjs` | Wraps `index.html` into `shunt.html`. |
| `spycar/graybox/playtest.mjs` | Headless-Chromium bot that plays and prints the audit's metrics. |
| `design/spy-car-fun-criteria.pdf`, `spy-car-graybox-review-1.pdf`, `spy-car-audit-2.pdf` | The user's three design documents, oldest first. The audit is the current spec. |
| `design/moonwake-design.md`, `moonwake/` | Shelved earlier game (river shooter). Swift package, SpriteKit app, WebGL water shader. Not part of Shunt. |
| `index.html`, `sw.js`, `art/`, icons, manifest | The original Elevator Madness PWA. Untouched by this project. |

## Architecture (line numbers are for the `canvas-sprint-c` version, 1,191 lines)

Global state: `T` tuning (l.121), `S` settings (l.161), `G` the run (built in `newRun`), `phase`/`screen`,
`input` (l.355). Reference space is 390 pt wide centred on `REF = 195`, 844 pt tall (`H`).

**Simulation** (mutates `G`, no drawing):
`Road` (l.173), `script` (l.470, the first 60 s), `director` (l.505), `spawn*`, `simulate` (l.532),
`physics` (l.547), `driveSpeed`/`driveSteer`/`startDrift`/`driftStep`/`endDrift`/`driveEffects` (l.662–775),
`enemyAI` (l.776), `carPair`, `resolveShunt`, `contactPlayer` (l.820), `slamTarget`/`trySlam`, `damage`,
`gun`, `gunHit`, `wreck` (l.889), `explodeBarrel`, `addScore`, `launch`, `land`, `truckLoad`,
`giveSpecial`, `pickup`, `fireSpecial`, `die`, `finishDeath`, `recordReplay` (l.328).

**Drawing** (everything after `// ---------------- rendering` at l.965): `drawRoad` (l.985), `drawRamp`,
`drawCar` (l.1048), `drawPlayer` (l.1070), `drawHUD` (l.1090), `render` (l.1109), `renderReplay` (l.1128),
`renderWorld` (l.1137). Camera globals `camZoom camLook camRoll camLane camPsi`, plus `cam`, `setCamera`,
`project`, `roadYaw` (l.239–254). Scratch buffers `RS`, `RP`. DOM UI (`#card`, `#special`, `#pad`,
callouts) is HTML over the canvas.

**Leaks between the two, which the port must route somewhere:**
- Simulation calls presentation directly: `callout()` (DOM), `ui.special.classList`, `audio.*`, `buzz()`
  (navigator.vibrate), `kickShake()` (writes `G.kick`, `G.trauma`).
- Simulation creates presentation data in `G`: `pops fx sparks debris marks puffs ribbons`. `driveEffects`
  (tyre smoke, skid ribbons, drift sparks) runs inside the physics step. These are pooled (`pool`, `addDebris`, `addMark`, `addPuff`).
- Rendering decrements state stored on `G`: `G.vignette G.flashT2 G.speedLines G.punch` in `render`,
  `G.flashT` in `renderWorld`. `G.trauma` and `G.kick` decay in `render`.

**The loop.** `frame(t)` (l.1165): rAF time → `dt` clamped to 1/20 s. Countdown, `hitStop` (skips
`simulate` entirely), title/playing/dying all call `simulate(dt)`. `simulate` applies slow motion
(`G.slowmo`, `G.slowmoRate`), adds game time to `G.acc`, and runs `physics(1/120)` while `G.acc >= 1/120`,
at most 8 steps per frame. Then `script()` or `director()` **once per frame**, then audio. Then `render(dt)`.

**Interpolation.** At the top of each `physics` step the previous state is saved: `G.px`, `G.pdist`, and
`c.px`, `c.py` for every car; bullets and missiles keep `py`. `renderWorld` computes
`alpha = clamp(G.acc * 120, 0, 1)` and draws the player and cars at `lerp(prev, current, alpha)`.
The replay renderer is not interpolated.

## Road space → world (Sprint C)

Simulation is in road space: `s` is distance along the road (`G.dist` for the player, `c.y` for cars),
`x` is lateral with the road centre always at `REF` (195). Lane width 62 pt.

- `G.road.at(s)` → **reused object** `{ center (always 195), lanes, width, k, sector, corner, elev, slope }`.
  `k` is curvature (1/radius, positive = right turn). Copy fields out before calling again.
- `G.road.frame(s)` → **reused object** `{ psi, X, Y }`: heading and world position of the centreline.
  Integrated every 20 pt from s = −2400 by `integrate()`, linearly interpolated.
- `G.road.world(x, s, out)` → writes `out.X`, `out.Y`. Forward is `(sin psi, cos psi)`, right is
  `(cos psi, −sin psi)`. So `X = frame.X + cos(psi)·(x − 195)`, `Y = frame.Y − sin(psi)·(x − 195)`.
- `G.road.laneX(s, i)`, `laneOf(s, x)`, `laneCount(s)`, `cornerAhead(s, within)`, and `G.road.corners`,
  `G.road.crests`, `G.road.sectors`.

Usage:

```js
const out = { X: 0, Y: 0 };
G.road.world(car.x, car.y, out);                       // world position of a car
const yaw = G.road.frame(car.y).psi + G.heading;       // player body yaw in world (radians, clockwise)
// three.js (y up): position.set(out.X, elev, -out.Y); rotation.y = -yaw for a model whose forward is -z
```

Body yaw: the player's `G.heading` is relative to the road; AI cars use `c.lean` (degrees) and `c.spin`
(radians) relative to the road. Elevation `at(s).elev` is non-zero only on hill crests at C (40 pt bumps).
The canvas camera rides at `scroll = G.dist − ahead(camLane)` with heading `camPsi`, a spring toward the
road heading 0.4 s ahead (`renderWorld`). `project(x, s, scroll)` ignores its third argument now; it uses `cam`.

## Where the driving and corner numbers live

- `T.drive` (l.126): cruise 480, district gain 1.1, top 900, nitro 1,150, brake 900 pt/s², min 260,
  throttle 1.2 s, slipstream, max heading 30°, turn rate 240°/s, grip 1,500 pt/s².
- `T.drift` (l.128): drift heading, turn rate, rear grip tau, 5%/s loss, tiers 0.8/1.6/2.6 s, mini-turbo
  +150/+250/+400 for 0.6/0.9/1.2 s, exit time, slam slip angle.
- `T.slam` (l.136), `T.ramp` (l.140), `T.sizes` (l.149), `T.score` (l.146).
- `T.corner` (l.132): warn 2.2 s, transition 120 pt, chevron spacing, traffic slow 45%, drift bonus,
  drift grip ×1.3, crest speed, rumble interval.
- Corner geometry is in `Road.buildSector` (l.191) and `addCorner` (l.186): hairpin R 160–180, hard 300,
  fast 500–700, sweeper 1,200–2,000; combat sectors 14,000–21,000 pt, technical 7,000–12,000.
- Corner force: `driveSteer`, the `excess = demand − budget` line (l.722). Traffic slowing: car loop in
  `physics` (l.597). AI grip cap: `enemyAI` (l.782).

## Nondeterminism: every read of Math.random, Date.now, performance.now and the frame clock

Seeded randomness is `G.rng` (mulberry32 from the run seed). Everything below breaks reproducibility.

At `canvas-sprint-c`:

| Where | What | Affects the simulation? |
|---|---|---|
| l.311, l.336 | Run seed for non-daily runs | Intended |
| l.321 `makeCar` | `laneTimer: 3 + Math.random() * 5` | **Yes**: civilian lane-change timing |
| l.321 `makeCar` | `id: Math.random()` | Not at C. **Yes at head**: drone hover offset uses `c.id` |
| l.558 `physics` (Slam burst) | Skid-mark spawn chance | Cosmetic only |
| l.631 `physics` (missiles) | Smoke-puff spawn and offset | Cosmetic only |
| l.264, l.277 audio | Noise buffers | Audio only |
| `now` (rAF seconds) | Tap-to-Slam window (`input.tapT`), keyboard double-tap Slam (`lastKeyTap`) | **Yes**: input timing on the frame clock |
| rAF `dt` | `simulate`: slow-motion countdown `G.slowmo -= dt`, `hitStop`, countdown, dying ×0.3 | **Yes** |
| once per frame | `script()` and `director()` run per frame, not per step; they consume `G.rng` | **Yes**: spawn order depends on frame rate |
| l.481 `script` | `G.teachT -= 1/60` per call | **Yes**: assumes 60 fps |
| `render`/`renderWorld` | Decrement `G.vignette G.flashT2 G.speedLines G.punch G.flashT` | Presentation only, but lives on `G` |
| `elapsed` | Rendering only at C | No |

Flick detection uses each pointer event's `timeStamp` (not the frame clock). `Date.now` and
`performance.now` do not appear in the game at all; they appear only in `playtest.mjs`.

Added after C (on the WIP branch): `drawCar` uses `Math.random` for burning flames and bumper sparks
(rendering only); `threatStep` sets the helicopter's `h.y` from `Math.sin(elapsed * 0.7)` (**simulation
reads the frame clock**); `now` drives the pad double-tap (nitro) and the special-button long-press (gadget).

Consequence: the Daily Run is not reproducible across devices or frame rates even though its seed is.

## Bot checks

Needs Playwright at `/opt/node22/lib/node_modules/playwright/index.mjs` and Chromium (both present in the
cloud container). From `spycar/graybox`:

```sh
node playtest.mjs <outDir> <seconds> [mode]
```

| Mode | What it does | What it proves |
|---|---|---|
| `active` | Rams and shoots enemies, Slams Bruisers in hold/tell, drifts through hard corners, brakes behind civilians, takes ramps and trucks, fires specials | Wrecks/min for a skilled driver, drift and corner use, run length, cause of death |
| `idle` | Never touches the screen after the start | "The game plays itself" gate: player-caused wrecks/min < 5 |
| `passive` | Holds a thumb still in its lane | Damage and death work; threat level |
| `sweep` | Real pointer events: lane changes at 450, 600, 750, 900 pt/s on the wall clock | Accidental-Slam gate: < 1 per 10 min at normal steering speed |
| `drift` | Holds the pad and steers on a 4 s cycle | Drift tiers, mini-turbos, drift slams, drift points |
| `drop` (head only) | Skips to the first drop, rides the shortcut lane, tricks on every jump | Drop flow, tricks, stars, falls, top speed |

Env vars (head only): `LOADOUT='{"front":"lance",...}'` sets the six slots; `START_T=250` starts late.

Every run prints wrecks/min split into car and gun and passive (no credit), Slams and flicks, armor lost/min,
the corner log (type, grip speed `vmax`, apex speed, drift, scraped), driving stats, % time with 2+ cars on
screen, the longest quiet gap, and page errors. Screenshots go to `<outDir>`.

The bot sets `input` and reads `G` through `window.__shunt`; only `sweep` uses real pointer events. It
cannot judge feel, and it cannot measure the "lane dashes glide" gate (checked by screenshots only).

### Latest results at `canvas-sprint-c` (run at this pause)

| Mode | Length | Player wrecks/min (car / gun) | Other |
|---|---|---|---|
| idle | 44 s, Bruiser | 1.4 (1.4 / 0) | armor lost 4.1/min; gap 2.6 s |
| passive | 72 s, barrel | 8.4 (5.9 / 2.5) | armor lost 2.5/min |
| active | 95 s, Gunner | 19.6 (4.4 / 15.2) | 12 drifts, tier 3, 5 Slams; gap 2.6 s |
| drift | 103 s, alive | 13.4 | 25 drifts, 21 mini-turbos, 4,192 drift pts; gap 3.7 s |
| sweep | 95 s, died | 13.8 | 450 and 600 pt/s: 0 flicks, 0 Slams. 750: 1 Slam in 13. 900: 2 Slams in 13 |

Sprint A gates at C: idle 1.4 < 5 (pass). Skilled ≥ 3× idle (pass). Zero Slams at normal steering speeds
(pass). Fast 750–900 pt/s swipes do fire Slams when an enemy is beside the car (see known bugs).

### Latest results after C (this session, on the WIP branch)

- Sprint D drop bot (`ecb7983`): 1 drop, 25 tricks, 4 stars, 1 fall, top speed 1,500, no errors.
- Sprint E head (`98bf28b`): active 108 s, 27.3 wrecks/min (7.2 car / 20.1 gun); idle 28 s, 0 wrecks;
  four loadouts ran 96–112 s each with no errors, covering every item except the spread shot, heavy cannon and ram plow (the bot fires specials and gadgets only when its simple rules trigger them); late game (`START_T=250`) 3.5 and
  2.2 wrecks/min, deaths by drone bomb and mine. A probe spawned the helicopter, drones, bikes and the
  convoy boss, killed the convoy, and logged no errors.

## Status

**Done at `canvas-sprint-c`:** audit Sprint A (fix and feel), Sprint B (driving model: throttle, brake,
heading steering, grip limit, drift with tiers and mini-turbo, drift slam, slipstream, tyre smoke, skid
ribbons, pedal pad, auto-drift setting), Sprint C (road-space curvature, rotating camera, combat and
technical sectors, sweepers to hairpins, corner furniture, rumble strips, hill crests, traffic slowing,
onboarding per the audit's table). Nobody has playtested B or C by hand; the audit's B and C gates need
human testers ("4 of 5 testers drift", "brake or drift at every hairpin", "60 fps on an iPhone 12").

**On `sprint-d-canvas-wip`, built and bot-tested, never hand-tested or published:**
- Sprint D (`ecb7983`). Reuse: `T.drop`; the `kind = 'drop'` branch of `Road.buildSector`; `dropNear`;
  drop elevation in `Road.at`; `dropStep`; `spawnRivals`; `rivalAI`; `launchKicker`; `startTrick`;
  `finishTrick`; `addHeat` (Heat and Overdrive); `fallOff`; `landDrop`; the trick gestures in `input.move`
  and `input.key`; the Overdrive double in `addScore`. Throw away: `renderChase`, `drawCarChase`, `CH`,
  `chaseX`/`chasePsi`, and the view blend in `render` (`G.view`, `G.viewTarget`, `G.blackT`).
- Sprint E (`98bf28b`): `ITEMS`/`SLOTS`/`LOAD` (six slots, 26 items, `localStorage` key `shunt-loadout`),
  loadout screen, `weaponStep`, `specialAI` (blade car, Interceptor PIT, hacker), `threatStep` (PIT,
  bombs, enemy mines, helicopter), `spawnCombo`, `spawnBikes`, `spawnDrones`, `spawnHeli`, `spawnBoss`,
  `bossStep`, two-crate supply truck. All gameplay logic, reusable.

**Not started:** Sprint F (garage, upgrades, contracts, cosmetics, agent rank, highlight clip), the art
direction work, native haptics, Game Center.

## Known bugs and weak spots (at `canvas-sprint-c` unless marked)

1. Daily Run is not reproducible (see the nondeterminism table).
2. `script()`/`director()` run per frame; `teachT` assumes 60 fps.
3. Fast swipes beside an enemy fire Slams: 3 in 26 lane changes at 750–900 pt/s. The audit's gate is about
   normal steering speeds, which pass, but a player swerving fast past a Bruiser will Slam.
4. Corners do not force braking. The idle and passive bots take hairpins 20–140 pt/s over grip speed and
   only scrape the outer rail, which costs little. The audit's hairpin gate would likely fail with people.
5. The gun still makes most kills for the skilled bot (15.2 gun vs 4.4 car per minute). The audit wants
   the car to be the main weapon.
6. The idle driver dies at 28–45 s, around the end of the scripted first minute. The audit's threat
   target is about minute 2 onward; minute 1 may be too harsh.
7. Longest quiet gap sometimes exceeds the 3 s target (3.1–3.7 s in sweep and drift runs).
8. Hairpins look faceted: the road is sampled every 40 pt, about 14° per segment at R 160.
9. Cones and crates are not rotated with the road heading. HUD off-screen chevrons place by road-space x,
   so they point to the wrong spot in corners.
10. Haptics call `navigator.vibrate`, which does nothing on iPhone.
11. Head only: the helicopter reads `elapsed`; late-game balance is unverified (low wreck rates at
    `START_T=250`); all loadout items are unlocked (`unlocked = null`) pending Sprint F.

## Publishing a playable link

No published link exists for any build after Sprint A. The existing artifact
https://claude.ai/artifact/1rfpKZGfKUdDXVCD3yUu5b is version 3, the Sprint A build (`7197ced`). It is
private to the owner until shared from its Share menu.

To publish a build: in a claude.ai Claude Code session, use the Artifact tool to publish
`spycar/graybox/index.html`. Publishing to that URL replaces the Sprint A page (read it first); publishing
without a URL makes a new artifact. Published pages may load scripts only from cdnjs.cloudflare.com,
cdn.jsdelivr.net/npm, unpkg.com, cdn.tailwindcss.com or code.jquery.com, so a three.js build must load
three from one of those, or inline it.

Without an artifact: `node build.mjs` and open `shunt.html` in a desktop browser. GitHub serves raw files
as plain text, so a raw link will not run; GitHub Pages is not enabled on this repo.
