# MOONWAKE — Game Design Document (v1)

An original vertical river-raid for iPhone. Spiritual descendant of the 1982
river-shooter structure (craft low, river scrolls forever, banks kill, fuel is
skimmed, score is the only ending); not a remake, port, or clone. Everything
below — title, craft, hazards, setting, numbers, river generator — is invented
for this game.

Reference device for every number: 390 × 844 pt (iPhone 15 logical size).
Speeds are in points per second at that width; the engine scales all lateral
values by `screenWidth / 390`. Where a value "tightens per gate", the change is
additive on the base value and capped at gate 15 unless stated.

---

## 1. Title and fantasy

Three candidates:

| Title | Angle | Verdict |
|---|---|---|
| **Moonwake** | Night raid; the moon's reflection on the water is the safe lane, your wake is the proof you were there. | **Chosen.** One word, ownable, says light + water + motion. |
| Sable Reach | The river's name as the title; moody, place-first. | Reserved as the setting name. |
| Needlerun | Names the core feel (threading the needle). | Reserved as the craft's class name. |

**Fantasy (one sentence):** You are a night courier skimming the flooded Sable
Reach in a stolen Needle-class skimmer, outrunning your own fuel gauge, with
the moon's path on the water as the only lane that will not kill you.

**Setting:** a drowned river valley at night or dusk — flooded locks, half-sunk
industry, lamp-lit levees. Seen from above and slightly behind the craft.
Cinematic realism in lighting, stylised in geometry. Not pixel art, not cartoon.

**Named kit:**

| Role | Name | Silhouette at phone size |
|---|---|---|
| Player craft | **Needle** (skimmer) | Slim arrow, bright engine slit at the stern, twin spray fans. |
| Barge | **Hulk** | Long dark rectangle with one lit porthole; moored early, drifts later. |
| Rotor drone | **Dragonfly** | Compact body with a glowing rotor ring; hovers, dashes sideways. Only thing that ever fires. |
| Mine chain | **Teeth** | 3–7 mines on a thin lit cable pivoting around an anchor buoy. |
| Fuel buoy | **Lantern** | Low pontoon with three warm pulsing lights; sits in the water. |
| Lock gate | **Weir** | Dark wall across the river with one open span marked by paired green lamps. Checkpoint. |
| Terrain spike | **Pilings** | Groups of 2–4 dark posts near banks and island tips; lethal, indestructible. |

---

## 2. Control scheme

Portrait, one thumb, whole-screen touch. The top 12% of the screen is HUD and
accepts only UI taps (pause chip, fuel gauge). Everything below steers.

### Steering (horizontal)

Relative control: where the thumb lands does not matter, how far it moves does.

| Parameter | Value |
|---|---|
| Anchor | Touch-down point. Re-centres on every new touch. |
| Dead zone | 6 pt radius around the anchor. |
| Full deflection | 48 pt horizontal displacement from anchor. |
| Steer rate at full deflection | 300 pt/s (band 1), see tightening. |
| Response curve | Linear from dead zone edge to full deflection; clamped beyond. |
| Lateral acceleration | First-order lag, time constant 70 ms (reaches ~95% of target in 0.2 s). |
| Visual lean | Craft rolls up to ±14° with lateral velocity; spray fans widen on the outside of the turn. |

Because steering is relative, the thumb can rest in a bottom corner, off the
craft. The how-to overlay says so once.

### Throttle (vertical slide, or second finger)

Never a full stop. Three speeds, blended continuously:

| Input | Target speed |
|---|---|
| Thumb displaced ≥ 40 pt *down* from anchor | **Slow** = 0.60 × cruise |
| Within ±24 pt vertical of anchor | **Cruise** = 1.00 × cruise |
| Thumb displaced ≥ 40 pt *up* from anchor | **Fast** = 1.60 × cruise |
| Second finger anywhere on screen (alternative) | **Fast** while held |

Vertical dead zone is ±24 pt so ordinary sideways steering does not change
speed. Speed approaches its target at 600 pt/s², so slow→fast takes about
0.45 s and is audible in the engine before it is visible.

### Fire (tap, or hold still)

| Input | Result |
|---|---|
| Tap (down→up under 140 ms, under 10 pt travel) | One tracer. |
| Thumb held inside the dead zone for 150 ms | Auto-fire at the fire rate, as long as the thumb stays inside the dead zone. |
| Thumb leaves the dead zone (steering) | Auto-fire stops immediately; re-arms 150 ms after it returns. |

This is the game's central trade-off: you can steer hard or shoot, not both.
Lining up a Hulk means committing to a lane; weaving past Teeth means a silent
gun. It also protects Lanterns by default, since you reach them by steering.

Tracers travel straight up the craft's column. There is no aiming.

### Why the craft cannot leave the lower third

The craft's screen position is fixed at 70% of screen height from the top.
Throttle changes how fast the world scrolls, not where the craft sits. Reasons:

1. Every threat arrives from the top with a known reaction window, so difficulty
   is tuned purely by speed and channel width, not by where the player parks.
2. The thumb occludes the bottom of the screen; the craft sits just above the
   resting thumb zone and is always visible.
3. The look-ahead is the difficulty dial: at 590 pt of river above the craft,
   band-1 cruise gives 2.3 s of warning, band-5 fast gives about 1.0 s.

### Haptics (UIKit feedback generators; no CoreHaptics patterns in v1)

| Event | Haptic |
|---|---|
| Bank/island/piling graze | Impact `.light`, intensity 0.5 — a tick. |
| Hazard destroyed | Impact `.rigid`, intensity 0.9 — a pulse. |
| Fuel skimming | Impact `.soft`, intensity 0.35, repeated every 0.25 s while overlapping a Lantern — a knock. |
| Weir cleared | Notification `.success`. |
| Death | Impact `.heavy`, intensity 1.0, once. |
| Low fuel (< 25) | Impact `.soft` every 1.0 s while the gauge is red. |

### Sound (AVAudioEngine; two loops, ten one-shots)

| Sound | Spec |
|---|---|
| Water bed | Stereo loop, low-passed; gain rises 20% in Fog state. |
| Engine | Single loop; playback rate 0.80 at slow, 1.00 at cruise, 1.35 at fast, interpolated with the speed blend. Hard-panned slightly toward the lean. |
| Gate confirm | Two notes, A4 then E5, 90 ms apart, on passing a Weir. |
| One-shots | tracer, hazard hit, chain detonation, Lantern skim tick, graze hiss, low-fuel pulse, death, respawn, extra life, UI tap. |

---

## 3. Rules, with starting numbers

### Run structure

An endless, seeded, procedurally generated river. One run = until the last
life is lost. There is no ending except the score.

### Lives, death, respawn

| Rule | Value |
|---|---|
| Lives at start | 3 (plus up to 5 in reserve, shown as craft icons). |
| Death causes | Touching a bank, island, piling, Hulk, Dragonfly, mine, Weir wall, or Dragonfly tracer; fuel reaching 0. All instant. |
| Death presentation | 150 ms hit-stop, explosion, screen desaturates over 0.3 s. |
| Respawn (lives remain) | 0.35 s after death, at the last cleared Weir (or run start), full tank, 1.0 s damage flicker during which hazards do not collide. **Terrain always kills, even while flickering.** |
| Run end (no lives) | Score card over the frozen wreck; RESTART under the thumb. Tap → new run begins within 0.45 s. |
| Last mistake stays visible | A new run starts in a wide reach; the previous run's wreck drifts past, sinking, during the first 1.5 s. |
| Extra life | At 10,000 points, then every 25,000 (35,000, 60,000, 85,000 …). Published in the how-to and on the death card. |

### Speed and scrolling

| Parameter | Band-1 value | Per Weir cleared (additive, cap at gate 15) |
|---|---|---|
| Cruise scroll speed | 260 pt/s | +3% of base → 377 pt/s at cap |
| Slow / Fast multipliers | 0.60× / 1.60× | unchanged |
| Steer rate (full deflection) | 300 pt/s | +2% of base → 390 pt/s at cap |
| Speed blend acceleration | 600 pt/s² | unchanged |

Speed rises faster than steering on purpose: the craft is always slightly too
fast for the river, and the gap widens.

### Fuel

| Parameter | Value |
|---|---|
| Tank | 100 units. Full at run start and on every respawn. |
| Drain | 3.6 units/s at band 1, **constant regardless of speed**; +2% of base per Weir (4.68/s at cap). |
| Fill | Only while the craft's capsule overlaps a Lantern pontoon (120 pt long): **36/s at slow, 24/s at cruise, 16/s at fast**, interpolated with the speed blend. |
| Low fuel | Gauge turns red and knocks at 25. |
| Empty | Death (counts as a life). |
| Lantern destroyed | Yields 80 points and no fuel. |

Intended equilibrium (band 1, Lanterns every ~900 pt): a cruising pass roughly
breaks even per Lantern; slowing over it nets about +15; passing fast nets about
−3. By band 5 the only sustainable pattern is **fast between Lanterns, slow over
them** — the fuel loop rewards exactly the risk the game is about.

### Weirs (checkpoints)

| Rule | Value |
|---|---|
| Spacing | Every 2,400 pt of river in band 1, rising to 3,000 pt by band 4. |
| Passage | Through the open span only; the wall kills. |
| Reward | +200 points (× chain multiplier). |
| Effects | Respawn point moves here; tightening step applies; 240 pt hazard-free reach follows. |
| Not | Not destructible, not branded, carry no fuel. |

### Hazards and scoring

Destroyed hazards score. Avoided hazards score nothing. All scores are
multiplied by the chain multiplier at the moment they are earned.

| Hazard | Size | Behaviour | Tracers to destroy | Points |
|---|---|---|---|---|
| Hulk | 36 × 110 pt | Moored (band 1–2). Drifts across channel at 40–90 pt/s and reverses at banks (band 3+). | 1 | 60 |
| Dragonfly | 40 × 40 pt | Hovers; dashes 120 pt sideways at 180 pt/s every 1.2–2.0 s (band 2+). Fires from band 4 (see §5). | 1 | 100 |
| Teeth | 18 pt mines, 3–7 per chain | Chain pivots about its anchor at 10–30°/s. Cable is not lethal; mines are. | 1 per mine; hitting the anchor buoy detonates the whole chain | 30 per mine; whole-chain detonation = 30 × n + 60 |
| Lantern | 40 × 120 pt | Static. Fuel source. | 1 | 80 (and the fuel is gone) |
| Pilings | 16 pt posts, 2–4 | Static terrain. | Indestructible | 0 (but grazeable) |
| Weir | Full width | Static. | Indestructible | 200 for passing |

### Graze chain

| Rule | Value |
|---|---|
| Graze | Craft capsule edge within 12 pt of a kill-edge (bank, island, piling) for 0.20 s continuous, without touching. 0.5 s cooldown per edge, so hugging a bank yields a graze about every 0.7 s. |
| On graze | Chain +1; +25 × multiplier points; light haptic; spray burst; the kill-edge flares. |
| Multiplier | `M = 1 + 0.25 × min(chain, 12)` → 1.0× to 4.0×. Applies to every score event. |
| Break | A tracer that leaves the top of the screen without hitting anything (a **miss**) sets chain to 0. Death sets chain to 0. |
| Decay | After 3 s without a graze, chain drops by 1 per second. |

The chain is why points live at the banks: safety in the middle is free,
and worth nothing.

### Tightening summary (applied at each Weir, additive, cap at gate 15)

| Value | Per Weir |
|---|---|
| Cruise speed | +3% |
| Steer rate | +2% |
| Fuel drain | +2% |
| Minimum channel width | −2% |
| Lantern mean spacing | +4% |
| Hazard mean spacing | −3% |

Beyond gate 15 only hazard mix and Dragonfly fire cadence keep rising (§5).

---

## 4. Procedural river parameters

The river is a **seeded routine, not a stored map**. A 64-bit seed drives
everything. Each reach (segment) draws from its own stream
`hash(seed, reachIndex)`, so any reach can be regenerated on demand, in any
order, identically on every device. The daily river is the same routine with
`seed = FNV1a("YYYY-MM-DD")` and one modifier.

| Parameter | Value |
|---|---|
| RNG | SplitMix64 (own implementation, 20 lines; no platform RNG so results match across OS versions). |
| Reach length `L` | 600 pt. Generator keeps 4 reaches ahead of the top of screen, drops reaches 1 screen below the craft. |
| Centerline | Catmull-Rom spline through one control point per reach (band 1–3) or two per reach (band 4–5, "elbows"). |
| Bend | Lateral offset per control point drawn from ±`B(band)` × screen width. |
| Width `W` | Drawn per reach from `[Wmin(band), Wmax(band)]` × screen width; smoothstep between reaches; max change 20% per reach. |
| On-screen banks | Constraint: `center ± W/2` stays within 6%…94% of screen width, so both banks are always visible. Camera never pans laterally. |
| Islands | Probability per reach `pIsland(band)`. Length 0.5–1.2 `L`, width 15–35% of `W`, lateral position seeded. Both channels ≥ `minChannel(band)`. |
| Splits | An island longer than `L` is a split: one branch 20% narrower and holding a Lantern; the other wider and empty. Lantern spacing counts the Lantern as placed. |
| Pilings | 0–2 groups per reach from band 2, within 24 pt of a bank or island tip. |
| Hazard placement | Along-river spacing drawn from mean `hazardGap(band)` with ±30% jitter; lateral position seeded; type by band weights. Never within 240 pt after a Weir or 150 pt of a Lantern. |
| Lantern placement | Spacing from mean `lanternGap(band)` ±20%. Hard cap: no gap exceeds 1.6 × mean, so a full tank at cruise always reaches the next Lantern. |
| Weir placement | Every `weirGap(band)`; open span width = max(1.5 × `minChannel`, 72 pt); span position seeded. |
| Safe-path check | After placing hazards in a reach, the generator sweeps a corridor 2.2 × craft width along a path whose lateral slope never exceeds `steerRate / cruiseSpeed`. If no corridor exists, hazard positions are re-rolled from the next values in the same stream (deterministic). |
| Opening reach | The first 1,800 pt: width 0.78, no hazards, two Lanterns, the how-to prompts, then the first Weir. |

Daily modifiers (`seed % 6`): **Narrows** (all widths −12%), **Blackout** (Fog
Gray for the whole run), **Thin Lanterns** (spacing +25%, fill +20%), **Drift**
(Hulks drift from band 1), **Current** (cruise +10%, steer +10%), **Long
Teeth** (chains 5–7 from band 1).

Restart after a run end replays the **same seed** by default, so the mistake
is learnable; a secondary "new river" button reseeds. Daily is a toggle.

Pseudocode for one reach (clearer than prose):

```
func buildReach(i):
    rng = SplitMix64(hash(seed, i))
    band = bandFor(weirsCleared)
    center[i] = clamp(center[i-1] + rng.range(-B(band), B(band)), 0.06 + W/2, 0.94 - W/2)
    width[i]  = clamp(rng.range(Wmin(band), Wmax(band)), width[i-1] * 0.8, width[i-1] * 1.2)
    if rng.chance(pIsland(band)):  placeIsland(rng, band)
    placePilings(rng, band)
    repeat:
        hazards = placeHazards(rng, band)       // spacing, lateral, type
    until corridorExists(hazards, steerRate / cruise)
    placeLanterns(rng, band)                    // respects 1.6 × mean cap
    if distanceSinceWeir >= weirGap(band):  placeWeir(rng, band)
```

---

## 5. Five checkpoint bands

A band is a range of Weirs cleared. Values are the generator inputs for that
band (tightening in §3 still applies per Weir inside the band).

| | Band 1 — The Wide Reach | Band 2 — Levees | Band 3 — Drift | Band 4 — Narrows | Band 5 — Blackwater |
|---|---|---|---|---|---|
| Weirs | 1–3 | 4–7 | 8–12 | 13–18 | 19+ |
| Width `Wmin–Wmax` (× screen width) | 0.55–0.78 | 0.45–0.70 | 0.38–0.62 | 0.30–0.52 | 0.26–0.44 |
| Bend `B` (× screen width) | ±0.12 | ±0.16 | ±0.22 | ±0.26 (2 control points) | ±0.30 (2 control points) |
| Min channel beside islands | 70 pt | 64 pt | 58 pt | 52 pt | 48 pt |
| Island probability per reach | 0.15 | 0.25 | 0.35 | 0.45 | 0.55 |
| Splits | none | rare (0.05) | 0.15 | 0.25 | 0.30 |
| Pilings per reach | 0 | 0–1 | 0–2 | 1–2 | 1–2 |
| Hazard mean gap | 420 pt | 360 pt | 300 pt | 240 pt | 190 pt |
| Hazard mix (Hulk / Dragonfly / Teeth) | 70 / 0 / 30 | 50 / 20 / 30 | 40 / 25 / 35 | 30 / 35 / 35 | 25 / 40 / 35 |
| Hulk behaviour | moored | moored | drifts 40–60 pt/s | drifts 60–80 pt/s | drifts 70–90 pt/s |
| Dragonfly | — | hovers, dashes | dashes faster (1.2 s cadence) | **fires** 1 slow tracer every 2.5 s, telegraphed 0.4 s by rotor flash | fires every 1.8 s |
| Teeth | 3 mines, 10°/s | 3–4 mines, 15°/s | 4–5, 20°/s | 5–6, 25°/s | 5–7, 30°/s |
| Lantern mean gap | 900 pt | 1,050 pt | 1,250 pt | 1,450 pt | 1,700 pt |
| Weir gap | 2,400 pt | 2,600 pt | 2,800 pt | 3,000 pt | 3,000 pt |
| Lighting state | Blue Night | Blue Night | Amber Dusk | Amber Dusk | Fog Gray |

Enemy fire: only the Dragonfly ever fires, only from band 4. Its tracer moves
straight down its own column at 350 pt/s (world-relative), is a visible
orange line, and is destroyed by the player's tracer. Bands 1–3 are collision
and terrain only.

Pacing expectation at cruise: a band-1 Weir arrives every ~9 s; a typical
first-week player dies in band 2 at 45–70 s; a good run reaches band 4 at
about 3 minutes.

---

## 6. Asset list and graphics plan (capped for two people)

### Camera

Locked top-down three-quarter: pitch ~62° from horizontal, looking slightly
up-river, craft at 70% screen height. The river scrolls down. No lateral
follow, no zoom, no shake beyond a 2 pt, 120 ms kick on death. The
three-quarter feel is produced by: props rendered from that pitch into
sprites; the water shader compressing ripple UVs by 0.7× toward the top of
screen; the moon path narrowing toward the horizon; and a 2 pt dark extrusion
under every kill-edge.

### Stack for the look

SpriteKit scene. One custom `SKShader` for water. Banks are generated
`SKShapeNode` polygons per reach, filled with the land texture and stroked
with the additive kill-edge strip. Props are sprites.

### Three lighting states (same geometry, different uniforms and palette)

| State | Water | Path | Kill-edge | Fog | Used |
|---|---|---|---|---|---|
| Blue Night | deep navy, high specular | cool white moon | cyan-white | none | bands 1–2 |
| Amber Dusk | teal-black, warm specular | gold sun, wider | orange-white | faint haze top 15% | bands 3–4 |
| Fog Gray | slate, low specular, diffuse path | diffused disc | brightest, pulsing | opaque gradient over top 35% | band 5, Blackout daily |

### Asset inventory (final counts)

| Category | Items | Count |
|---|---|---|
| Craft | Needle sprite in 3 lean states, engine glow, wreck sprite, damage flicker (code) | 1 craft, 5 textures |
| Props | Hulk (2 tints), Dragonfly, mine, anchor buoy, Lantern, Weir span tile, Weir post, Piling, reed clump, levee lamp post, island cap texture, debris plank | 11 props |
| Terrain | land fill texture, kill-edge glow strip, island cap (shared) | 2 textures |
| Water | 1 fragment shader, 2 tiling normal maps, 1 riverbed texture | 1 shader, 3 textures |
| Parallax | Layer A: riverbed detail under the water at 0.85× scroll. Layer B: cloud-shadow alpha sheet over everything at 1.25× scroll. | 2 layers, 2 textures |
| Far silhouette | 1 tileable hills/tree-line strip tinted per lighting state | 1 texture |
| Particles | spray dot, tracer, explosion puff, shock ring, fuel sparkle | 5 textures, 6 emitters |
| HUD | fuel gauge, score numerals (1 font), lives icon, pause chip, chain counter | 5 elements |
| UI | 4 buttons (restart, new river, resume, settings), 2 toggles | 1 style sheet |
| Audio | water loop, engine loop, 10 one-shots | 12 files |
| Store | app icon, 6 screenshots, 15 s preview | — |

### What not to build

No open world, no cockpit or first-person view, no cutscenes, no character or
craft customizer, no unique art per kilometre, no boss, no weapon upgrades, no
second craft, no day-night cycle (three fixed states only), no dynamic
lighting beyond the shader uniforms, no CoreHaptics custom patterns, no
music beyond the engine and water beds, no cloud save, no server.

---

## 7. Screens (version 1 only)

1. **Launch into the river.** First frame is the river scrolling at slow with
   the Needle idling in the wide opening reach. Score, fuel, lives, pause chip
   visible. First touch takes the helm. No menu, no logo screen beyond the
   system launch image.
2. **How-to overlay (first run only).** Three in-world prompts before the
   first Weir: "slide to steer" on the first bend, "hold still to fire" when
   the first Hulk is in your lane, "ease off over the lanterns" at the first
   Lantern. One line: "your thumb can rest anywhere". Clears forever once
   Weir 1 is passed; replayable from settings.
3. **Pause.** Pause chip, or app backgrounding. River freezes and dims.
   Resume, Restart, Settings. Resume gives a 0.5 s countdown.
4. **Death / run end.** Frozen wreck behind a card: score, chain peak, best,
   weekly rank (if signed in). **RESTART** is the large primary button in the
   bottom third, same river seed. Secondary: New River, Daily toggle,
   Settings. Extra-life score line printed small.
5. **Settings.** Haptics on/off, sound volume, engine volume, left-hand thumb
   hint, Game Center sign-in, replay how-to, reduce motion.

Retention is the loop, not systems: same-seed restart makes the last death a
lesson, the daily river gives a shared conversation, the weekly board gives a
reason to come back. No energy timer, no pay-to-continue, no loot. The only
future monetisation considered is one cosmetic tracer colour, sold once, with
no effect on play; it is not in v1.

---

## 8. Weekly build plan (8 weeks plus 2 buffer)

Stack: Swift 5.10, **SpriteKit** (2D with a shader; SceneKit is not needed for
a locked camera and would cost the art budget), AVAudioEngine, UIKit feedback
generators, Codable JSON in Application Support for best score, settings and
how-to flag, **Game Center with one recurring weekly leaderboard** (configured
in App Store Connect; all runs, random and daily, submit their score). iOS 16+,
60 fps target on iPhone XR/11 and newer. No server.

| Week | Deliverable | Gate |
|---|---|---|
| 1 | **Playable graybox on device:** seeded generator with flat-colour banks, steer, throttle, scroll, bank collision, death, restart under 0.5 s. | Runs at 60 fps; restart loop feels instant. |
| 2 | Fuel, Lanterns, Weirs, per-Weir tightening, graze chain, score, HUD. Hulk and Teeth as grey boxes. | Designer wants to replay it. **Final art does not start until this gate passes.** |
| 3 | Dragonfly, drifting Hulks, pivoting Teeth, all five bands, safe-path validator, daily seed and modifiers, haptics, placeholder audio. Playtest with 5 people. | Median tester plays 3+ runs unprompted. |
| 4 | Water shader with moon path and wake; generated banks with kill-edge; camera pitch treatment; Blue Night state. | River reads as water at a glance in a 15 s clip. |
| 5 | Props (11), Needle, particles, Amber Dusk and Fog Gray states. | Every hazard identifiable at 50% zoom in grayscale. |
| 6 | Audio (water, engine, one-shots), parallax layers, death and respawn presentation, wreck-ghost on restart. | Death is readable with sound off. |
| 7 | Screens 1–5, Game Center weekly board, local save, accessibility (reduce motion, left-hand hint). | Cold launch to first touch under 2 s. |
| 8 | Tuning pass from recorded run logs (local only), performance and thermal on iPhone XR, battery check. | Band 2 median death at 45–70 s; no frame drops in Fog state. |
| 9 | Polish, store assets, TestFlight to 20 players. | Buffer. |
| 10 | Review fixes, submission. | Buffer. |

---

## 9. What would make this an illegal copy, and how the design avoids it

Game mechanics and genre structure (a scrolling river, fuel, lethal banks) are
ideas; copying **expression** is the risk. The design treats the following as
forbidden:

- **Names and marks:** no "River Raid", no "River of No Return", no Activision
  name, logo, rainbow band, or box-art trade dress. The title is Moonwake; the
  river is the Sable Reach.
- **Copied graphics or sound:** no reproduction or tracing of the 1982 jet,
  tanker, helicopter, fuel depot, bridge, house, or tree sprites, their
  colours or proportions, and no reuse of its sound effects. Every sprite here
  is rendered from original models at a different camera pitch and scale.
- **Copied text:** no reuse of the original manual, its tips, or its scoring
  table. Our values (60/100/30/80/200, chain multiplier, graze) are different
  in number and structure.
- **The river map:** River Raid's river comes from a specific pseudo-random
  sequence; we do not reproduce that sequence or its fixed layout. Our
  generator is an original seeded routine with islands, splits, Weirs and
  Lanterns that do not exist in the original.
- **Branded checkpoints and layout:** no bridges as sectioned checkpoints,
  no fuel-depot word "FUEL" rendered on the pickup, no bottom-of-screen
  fuel bar styled like the original gauge.
- **Marketing:** no "the new River Raid", no comparison screenshots, no
  implication of licence or endorsement. "Inspired by classic river
  shooters" is the furthest the copy goes.

If any asset, name, or number on this list is ever matched, it is replaced
before ship. This is design guidance, not legal advice; a trademark search on
the chosen title and a counsel review of store copy are line items in week 9.
