# Shunt style guide: Neon City (Sprint 3D, Step 5)

Every number here is a render parameter in `spycar/shunt/src/render/three/looks.js`; `?tune=1` edits them live and
"print look JSON" copies the result. The sim never reads any of them. Three looks share one geometry kit; `?look=night`,
`?look=dusk`, `?look=bluehour`, or the on-screen toggle.

## Scale and camera

| | Value |
|---|---|
| Stage point to metre | 0.075 m/pt (player car 60 pt = 4.5 m; lane 62 pt = 4.65 m) |
| Camera | perspective, 40° vertical FOV, pitched 55° down, slant distance 90 m to the player |
| Player on screen | lower third (the view axis aims 6.9° above the player) |
| Heading | critically damped spring (ω = 14) toward the road heading 0.4 s ahead, lead capped at ±0.44 rad |
| Speed | +8° FOV and +10 m pull-back at 900 pt/s; +6° on a mini-turbo, +10° on nitro |
| Drift | 5° roll into the drift |
| Shake | capped at 1.2 m of offset and 2° of roll; trauma² noise, kick decays with τ = 80 ms |
| Warning time | 3D shows 860–1,360 pt of road ahead (1.75–2.5 s); the canvas build shows 760–890 pt (1.1–2.2 s) |

## Palette (role colours survive in every look)

| Role | Hex |
|---|---|
| Player | `#37e6ff` body, cyan rim glow, warm headlights `#fff8cc`, tail `#ff4d4d` |
| Enemies | body `#1a1b1f` (weak `#3a3d46`), red stripe and headlights `#ff3b3b` |
| Civilians | pastel tints `#cfe6ff` `#fff1c9` `#cdebdc` `#e9d9ff` |
| Pickups and crates | gold `#ffd23f` |
| Hazards (barrels, cones, roadblocks) | orange `#ff9f1c` |
| Supply truck | green `#2fd36a` |
| Asphalt | district road `#30333c` / `#2a2d35` bands; sidewalk `#3c3f4a`; lane paint `#d8dce4` |
| Neon | magenta `#ff2fd0`, cyan `#22e6ff`, amber `#ffb02a`, red `#ff5a5a`, lime `#8cff5a` |
| Windows | warm `#ffd9a0`, cool `#a8d8ff` (42% lit) |

## Looks

| Parameter | Night | Dusk | Blue hour |
|---|---|---|---|
| Sky zenith / horizon | `#0b1030` / `#3a1a5a` | `#2a2560` / `#ff8a3a` | `#0a1a4a` / `#2a4a9a` |
| Fog colour, density | `#241a44`, 0.0032 | `#6a4a7a`, 0.0017 | `#1a2a6a`, 0.0018 |
| Key light colour, intensity | `#8fa8ff`, 1.8 | `#ffb070`, 2.2 | `#6a8aff`, 1.0 |
| Key azimuth / elevation | 200° / 58° (a high moon, so towers do not stripe the road) | 250° / 8° | 250° / −4° (clamped to 3° for shadows) |
| Hemisphere sky / ground, intensity | `#3a4a8a` / `#1a1420`, 1.1 | `#7a7ac8` / `#2a1a20`, 1.3 | `#3a5aba` / `#101828`, 1.5 |
| Environment intensity | 0.7 | 0.8 | 0.9 |
| Exposure | 1.15 | 1.15 | 1.1 |
| Tone mapping | AgX | AgX | AgX |
| Bloom threshold / intensity / radius | 0.85 / 1.1 / 0.7 | 0.9 / 0.8 / 0.6 | 0.8 / 1.3 / 0.75 |
| LUT strength; saturation; contrast; warm; lift | 0.8; 1.15; 1.08; −0.04; 0 | 0.7; 1.15; 1.05; +0.03; 0 | 0.7; 1.1; 1.04; −0.08; +0.01 |
| Vignette offset / darkness | 0.35 / 0.55 | 0.35 / 0.45 | 0.35 / 0.5 |
| Grain | 0.12 | 0.10 | 0.10 |
| Wet road | 1.0 | 0.4 | 0.8 |
| Neon | 1.0 | 0.5 (coming on) | 1.0 |
| Steam | 0.6 | 0.2 | 0.3 |
| Rain streaks | 0 (tune option) | 0 | 0 |
| MSAA | 4× | 4× | 4× |
| Chromatic aberration | 0.0012 at top speed only, from 85% of 900 pt/s | same | same |

Height fog: the fog factor is multiplied by exp(−0.045 × height), so the street soaks in it and towers rise out.

## Readability rules

1. Road and buildings stay dark to mid (asphalt luminance about 0.1–0.3 after lighting); cars, pickups and threats carry the
   brightest, most saturated values. Window and neon emissives are the only building values allowed to bloom.
2. The player is the most readable thing on screen: cyan body, a 4 m cyan rim glow, warm headlights with a pool on the road,
   and a cyan silhouette that draws only where something covers the car (depth test inverted).
3. Every enemy tell has a 3D cue that reads in all three looks: a pulsing red ring and glow under a Bruiser in its hold-tell-swerve
   and under a Gunner in its sight, the red ground arrow pointing at the player, the red sight line, brake lights flashing.
4. Hairpins: red chevron boards along the outside, the "HAIRPIN" board, three red stripes and a painted "BRAKE" about 2.2 s before
   the turn, red-white rumble strip on the inside, tyre walls on the outside.
5. Effects never cover threats: smoke draws below enemies (render order) and the player silhouette shows through it.
6. Street-front buildings are low (5–17 m, 5 m back from the kerb); towers (24–44 m) stand 25–34 m back so they never cover the
   road ahead at the camera's 55° pitch.
7. Fake lights only: emissive surfaces, additive pools on the road, cones and stretched reflection sprites; one real shadow light.

## Effects budget

| Effect | Numbers |
|---|---|
| Tyre smoke | sim puffs, 0.5 m → 3 m over 1.4 s, 55% → 0 alpha, lit by the key direction, sorted back to front, 700 cap (800 with wreck smoke) |
| Skid marks | ring buffer of 2,000 segments, 45 cm wide, fading over 15 s |
| Drift sparks | points, additive, bright enough to bloom; colour by tier (white, gold, orange) |
| Explosion | flash + fireball glow (HDR, blooms), 12 debris pieces on ballistic arcs, 6 rising smoke puffs, ground shockwave ring, shake 0.8 |
| Lamp pools | 3.6 m radius, warm `#ffb860`, alpha 0.14 + 0.08 × neon |
| Speed | FOV kick 6° (turbo) / 10° (nitro); speed lines from 85% of top speed; wheel blur not yet (placeholder wheels) |

## Hairpin barrier (Step 6, sim flag `hairpinWall`, `?wall=0` to turn off)

| Rule | Value |
|---|---|
| Trigger | 0.3 s accumulated over 1.02 × the grip budget in a hard corner, not braking, not drifting, once per corner |
| Hit | car put against the outer rail, speed × 0.45, 0.8 s grind at minimum speed with sparks, half an armor pip, kick 10, trauma 0.8, hit-stop 80 ms, "Too fast: brake or drift" |
| Gate (20 hairpins, synchronous bots) | brake-or-drift 2.02 s per hairpin, floor-it 2.59 s: 0.57 s faster (need 0.5); floor-it hits 20 of 20 (need 80%) |
