# Sprint 3D: Stop Point 1 report (numbers)

Links: 3D build https://claude.ai/artifact/Ae94og4nbVyk46LuFhsYPn (add `?bench=1`, `?look=dusk`, `?tune=1`, `?r=canvas`, `?wall=0`);
canvas Sprint C comparison https://claude.ai/artifact/HZBcWaQwUoV2ZsJmWhxVyr. Branch `shunt-3d`; archive `archive/canvas-sprint-c`.

Headless numbers come from SwiftShader (software GL) on a 4-core container. They are not iPhone numbers; the frame times below
are the loop's 50 ms clamp, not the renderer. Draw calls, triangles and the resolution scale are real.

| Check | Result |
|---|---|
| Replays, flag off (6 Sprint C baselines) | 6 of 6 match on the canvas build, the modular build and the 3D build; live loop also matches |
| Replays, flag on (6 step 6 baselines) | 6 of 6 match; one live replay through the 3D renderer matches (81 of 81 hashes) |
| Bots on the 3D build | idle and skilled runs, no page errors |
| Hairpin gate (20 hairpins each, synchronous bots) | brake-or-drift 2.02 s, floor-it 2.59 s per hairpin (0.57 s faster, need 0.5); floor-it hits 20 of 20 (need 80%) |
| Bot numbers with the barrier on | idle 1.6–6.7 wrecks/min (handoff 1.4), skilled 19–22 (handoff 19.6); idle now hits every hairpin wall |
| Zoo frame (one of everything) | 135 draw calls, 18.4k triangles, 45 textures, no errors |
| Bench route (seed 3, 90 s) | 109 draw calls, 18.4k triangles, resolution scale 1.25 (the headless cap), no errors |
| Soak, 10 min wall time | no errors; geometries 101, programs 48, textures 100 (bounded sign cache); JS heap not exposed headless |
| Context loss | lost and restored; frames and the sim resume, no errors |
| Warning time (3D vs canvas) | 3D 1.75–3.5 s ahead at 334–778 pt/s; canvas 1.14–2.33 s at 326–778 pt/s |
| Bundle | 787 KB single file (three + postprocessing inlined), well under the 15 MB first-load budget |

Budget position: main pass 90–135 calls (budget 150) and 16–19k triangles (budget 400k); one shadow light (2048 map);
DPR capped at 2 with dynamic resolution 1.25–2; shaders prewarmed; no per-frame allocation in the render path.
Not done: KTX2 textures (all textures are small generated canvases, ~100 of 256 px or less), wheel blur (placeholder wheels).
