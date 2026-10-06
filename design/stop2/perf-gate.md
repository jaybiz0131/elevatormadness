# Stop 2 performance gate (Jack's v21 result: lowest FPS 36 at camera B)

Target: lowest FPS 50 or higher on Jack's phone in a busy minute, and Stop 2 must not make v21 worse.
**I cannot measure an iPhone here.** The numbers below come from `tools/perf.mjs`, which draws the busiest moment of a run (fun-s1-active at 27.6 s: 20 cars, 142 smoke puffs, a chain wreck)
in software GL at 390 x 844 with device pixel ratio 2. Draw calls and triangles are exact. Time per frame is only a relative measure (software GL is mostly fill rate and vertices),
so read it as "this change takes N% off", not as a frame rate. Jack's busy-moment test is at the end.

## Why v21 could not recover
v21's automatic scale had a floor of 1.25 (390 x 1.25 by 844 x 1.25 pixels) and always ran 4x MSAA on a half-float frame buffer (2x on iOS) plus a 2048 shadow map (1024 on iOS).
At 36 fps it was already at the floor, so the only thing left to give was nothing. The new scaler goes down to 0.6 and drops MSAA and shadows first.

## What changed, and what each change saves
Measured on the busy moment, all at render scale 1.5 unless stated. "Stop 2 as published" = 124 calls and 363k triangles.

| Change | Draw calls | Triangles | Frame cost (software GL) |
|---|---|---|---|
| Render scale cap (High: start 1.5, up to 2; Low: 1.25), floor 0.6 (was 1.25) | 0 | 0 | scale 2.0 to 1.5: **-30%**; 1.25 and 1.0 are cheaper again |
| MSAA off on Low (High keeps it; 2 samples on iOS as before) | 0 | 0 | **-40%** (the biggest single item) |
| Sun shadow map off on Low | -31 | -121k | **-13%** |
| Enemy and traffic cars no longer cast into the shadow map (they keep their blob shadow); only the hero casts | -3 | -76k | -4% |
| Small props (benches, bollards, kit lamps) and building chunks no longer cast | -24 | -8k | -6% together |
| Detail models (storefronts, rooftop units) stop at 900 pt on High (600 Low); the lamp model at 700 (450 Low); was 1,200 | 0 | -14k (more on Low) | about -1% |
| Street lamp model decimated 4,040 to 994 triangles (Stop 2 build, kept in this count) | 0 | -3,046 per lamp | in the 14k above |
| Effect pools capped per level (see below) | 0 | 0 | about -2% here; matters most in smoke-heavy frames |
| Bloom at half resolution | 0 | 0 | **none**: it was already half resolution with a mip chain (the postprocessing library default). The real post cost is the full-resolution tone, grade and grain pass, which is one pass |

Result for the busy moment:

| Level | Render scale | Calls | Triangles | Cost vs Stop 2 at scale 2 (= 100) |
|---|---|---|---|---|
| Stop 2 as published, scale 2.0 | 2.0 | 124 | 363k | 100 |
| Stop 2 as published, scale 1.5 | 1.5 | 124 | 363k | 70 |
| **High** (new) | 1.5 | 97 | 265k | 64 |
| **Low** (new) | 1.25 | 93 | 217k | **26** |
| Low | 1.0 | 93 | 217k | about 21 |

Worst frames over three full runs after the changes: at most 98 draw calls and 284k triangles (Stop 2 as published: 109 calls and 388k). The street lamps were 27% of a v21 busy frame; with the
lighter model and range they are now about 3%.

## Particle pools
The pools were already fixed arrays that are recycled (the sim hands dead particles back to a pool, the renderer has fixed instance buffers and drops new effects when they are full).
What I changed is the size of what is drawn: smoke newest 220 (Low 90), smoke batch 420 (Low 200), sparks 256 (128), debris 160 (64), glows 160 (110).
I measured the real peaks first: glows 46, smoke batch 425, sparks 112, debris 112 in drawing; in the sim the baselines peak at 246 smoke puffs, 112 sparks and 652 debris objects.
A hard cap inside the sim would change those runs (and the replays), so it is not done; the draw side is bounded either way.

## Automatic scale and the Low / High setting
- Settings > Graphics: AUTO (default), LOW, HIGH. Settings > Developer > Show FPS now also prints the level and the scale (for example `LOW x1.00`).
- AUTO starts on High at scale 1.5. After the first 6 s, 2 s under 50 fps switches to **Low for good** (remembered; the row says "auto chose low") because MSAA and shadows cost more than they show. After that, each 2 s under 50 fps steps the scale down 15% to 0.6.
- With 6 s of steady 55+ fps the scale steps back up. If a step up does not hold, the wait before the next try doubles (up to 48 s), so it does not flap.
- I tested the logic by drawing frames at a fixed 50 ms in a headless browser (they stay slow): High to Low at 8 s, then 0.85, 0.72, 0.61, 0.60 two seconds apart, and the choice saved. Not tested on a phone.
- Tools and headless browsers hold the scale unless `?autoscale=1`; `?gfx=low|high`, `?scale=1.25` and `?q=msaa:0,puffs:100` override for testing.

## Busy-moment test for Jack (about 5 minutes)
1. Settings > Developer > Show FPS on. Settings > Graphics: leave on AUTO.
2. Settings > Developer > Benchmark RUN. It plays a 90 s skilled run (waves, drifts, wrecks, a hairpin) and shows `avg`, `1% low`, `worst`, the level and the scale it settled on. Write those down. Also note the LOW figure on the Show FPS panel.
3. Run it again with Graphics = HIGH, and once more with LOW.
4. Play one normal minute on AUTO and tell me the lowest FPS you saw on the panel in the busiest part (the first hairpin with several enemies is a good one).
Gate: LOW figure of 50 or more. If AUTO or LOW still shows under 50 with `x0.60`, the cost is not fill rate and the next suspects are the sorted smoke batch and the post pass; send the Benchmark numbers and I will cut there.
