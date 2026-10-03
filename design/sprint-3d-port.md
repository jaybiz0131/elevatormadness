SHUNT: 3D PORT SPRINT (three.js). Jack's order: graphics #1, fun #2.

CONTEXT
Shunt is an original-IP iOS spy car game: a Bond-type spy (original character, no Bond names or marks) who drifts with tire smoke, fights other cars with guns and gadgets, and hits ramps. Today it is a canvas 2D gray-box. This sprint swaps the renderer for real 3D in three.js and makes one stretch of road look finished, without changing how the game plays.

WHERE THINGS ARE (repo jaybiz0131/elevatormadness)
- main holds the original Elevator Madness game. Never push to it.
- Branch claude/ios-game-creation-ryso4h holds Shunt through Sprint E, with HANDOFF.md at its head (128de2b).
- 2c9dc9f is Sprint C, the base for this port. ecb7983 is the drops work. 98bf28b is the arsenal and enemies work; branch sprint-d-canvas-wip points there.
- Cloud sessions can't push tags (the git proxy refuses them), so the canvas-sprint-c tag never reached GitHub. Use branches.
- The audit is our roadmap: https://claude.ai/artifact/KWeCM8GZ2ezUBTWELNNWzs. Open it if your tools can. If not, this message has what you need.

RULES FOR THE WHOLE SPRINT
- The simulation is frozen: Sprint B driving constants, Sprint C corners, enemies, scoring and timing stay exactly as they are. The only sim changes are Step 2 (determinism) and Step 6 (hairpins), and each gets a new baseline.
- The renderer only reads simulation state, never writes it. The sim never imports three.js or touches the DOM.
- No new gameplay, no other districts, no photorealism. Stylized shapes, strong light, rich color.
- Original IP only: no real car designs or badges, invented brand names on every sign, nothing that resembles Bond marks. Placeholder models must be CC0 (for example Kenney or Quaternius) and logged in CREDITS.md with source URL and license.
- Every step ends with: bots pass, replay hashes match where the step requires it, commit, push, publish, postcard shots (from Step 5 on), and a short report to Jack.
- Never have parallel agents edit the same file.
- If your context runs low: commit, push, write design/sprint-3d-progress.md (where you are, what's next), and tell Jack to start a fresh session with the message: Continue from design/sprint-3d-progress.md.
- Work through Steps 1 to 7 without waiting for approval. Stop only at Stop Point 1, or for a blocker you can't solve, which you explain to Jack in plain words.

STEP 1: SETUP
a. git fetch --all. Create and push branch archive/canvas-sprint-c at 2c9dc9f. Create branch shunt-3d from 2c9dc9f. All work goes on shunt-3d, pushed after every step.
b. Copy HANDOFF.md from 128de2b into shunt-3d. Save this message verbatim as design/sprint-3d-port.md. Commit both.
c. Read HANDOFF.md, the audit if reachable, and the code. Write design/sprint-3d-plan.md (one page: module map, renderer architecture, top risks) and commit it.
d. Publish the Sprint C canvas build from archive/canvas-sprint-c as a playable link, the way HANDOFF.md describes. This is Jack's comparison link for driving feel.

STEP 2: DETERMINISM BASELINE (canvas build, before any 3D)
- The sim reads one input snapshot per fixed 120 Hz step. One seeded RNG replaces Math.random in the sim. Sim time is the step count divided by 120. Anything the sim does on the frame clock (HANDOFF.md lists these) moves into the fixed step.
- Add a recorder for per-step input snapshots, a replayer that feeds them straight into the sim, and a state hash every 120 steps (positions, velocities, headings, health, score, RNG state).
- Record 6 baseline replays: 3 seeds, each with the idle bot and the skilled bot, 180 s each, covering corners, combat, wrecks and effects. Commit them.
- Gate: bot gate numbers stay within noise of HANDOFF.md's results. Always compare hashes in the same headless browser; equality across browser engines is not expected.

STEP 3: MODULES AND VITE (still canvas)
- Split into ES modules with Vite and three.js pinned from npm: sim/ (headless), input/, audio/, ui/ (HTML and CSS HUD), render/, main.js. Keep the window.__shunt hooks so the bots keep working.
- Gate: all 6 replays match hash for hash, and bots pass.

STEP 4: THREE.JS RENDERER (working, plain placeholders)
- Renderer: WebGLRenderer (WebGL2) with the pmndrs postprocessing library. If that library doesn't support the pinned three.js, use three.js's own EffectComposer with UnrealBloomPass, LUTPass and OutputPass. All three.js code stays inside render/ so the backend can change later. Don't switch to WebGPURenderer this sprint unless Jack tells you to.
- Scale: one constant converts stage points to meters, set so the player car is 4.5 m long. Convert only at the render boundary.
- Build the road mesh from the Sprint C world transform (lanes, markings, curbs, barriers), placeholder player car, traffic, enemies (keep the 2D build's class colors), pickups, bullets, and basic smoke, skid marks and sparks. HUD in HTML over the canvas, inside the safe areas, text at least 13 pt. Portrait, as today. The render interpolates between the last two sim states.
- Road camera: perspective, starting at 40 degrees vertical FOV and 55 degrees pitch, player in the lower third, looking ahead along the road. Heading follows the road through a critically damped spring. A small pull-back and FOV widening at speed. Shake is a capped camera offset. Warning-time rule: at every speed, a new car must come into view at least as many seconds ahead as it does in the canvas build. Measure both and log them.
- Pick the beauty route: a fixed-seed stretch of 60 to 90 s with a sweeper, a hairpin and some combat. It is also the bench route and the postcard set.
- Add ?perf=1 (fps, frame ms, draw calls, triangles, texture memory, resolution scale) and ?bench=1 (plays a recorded skilled run of the beauty route, then shows average fps, 1% low, worst frame and the resolution scale it settled on). ?bench=soak runs 10 minutes and compares the first and last minute.
- Gate: replays still match; bots pass; headless screenshots show every object; publish the 3D link.

STEP 5: THE BEAUTY CORNER (the heart of this sprint)
Dress the beauty route as Neon City, the audit's vertical-slice district. Every district uses this kit for now.
- Three looks on the same geometry, switchable with ?look=night, dusk or bluehour and an on-screen toggle:
  night: cool, low moonlight; navy sky fading to violet at the horizon; magenta, cyan and amber neon; wet asphalt; light steam.
  dusk: warm sun 6 to 10 degrees above the horizon; long shadows; orange to violet sky; neon just coming on.
  bluehour: sun below the horizon; deep blue ambient; all neon on; little fog.
- Readability: road and buildings stay dark to mid; cars, pickups and threats carry the brightest, most saturated values. The player car is the most readable thing on screen at all times (rim light, headlights, a subtle outline when something hides it). Every enemy tell from the 2D build gets a clear 3D cue (light flash, glow or ground marker) that reads in all three looks. Hairpins get chevron signs and a braking marker about 2 s before the turn.
- City kit: modular buildings of varied height with emissive window patterns, invented signs and neon tubes, sidewalks, medians, street lamps, an overpass, props every 10 to 20 m for parallax. Merge static geometry per chunk and instance repeated props.
- Lighting: one directional key light with shadows (2048 map on a box fitted around the player and snapped to texels, 1024 if over budget), a soft contact shadow under every car, a hemisphere fill, and a small pre-filtered environment map for car and wet-road reflections. Street lights, neon and headlights are fake: emissive surfaces, additive light pools on the road, light cones. No other real-time lights.
- Wet road: glossy puddle patches in the asphalt, environment-map sheen, and stretched additive reflection sprites under each sign and lamp. No real-time planar reflections.
- Atmosphere: gradient sky, height fog tinted to the horizon color, steam vents, rain streaks as a ?tune=1 option.
- Post, one merged pass: HDR bloom tuned so only emissive surfaces, sparks and lights bloom; tone mapping (start with AgX, compare ACES); a 3D LUT per look; vignette; faint grain; chromatic aberration only near top speed and barely visible. MSAA 4x.
- Effects: tire smoke (lit soft particles growing from about 0.5 m to 3 m over 1.2 to 2 s, sorted, 600 particles total per the audit), skid marks (a ring buffer of about 2,000 segments, fading over 15 s), drift sparks (additive and bright enough to bloom), explosions (flash, fireball, 8 to 16 debris pieces, smoke, ground shockwave ring, shake), speed (FOV kick of 6 to 10 degrees on boosts, speed lines above 85% of top speed, wheel blur).
- ?tune=1 opens a live panel for every look value. Save the chosen defaults in design/style-guide.md with numbers: palette hexes, light angles, colors and intensities, fog, exposure, bloom, LUT and the readability rules.
- Postcard shots: 8 fixed moments on the beauty route from the gameplay camera, for each look (?shots=1), captured the same way every step: cruising straight, mid-drift in the sweeper, hairpin entry, two cars side by side in combat, a wreck mid-explosion, a boost, a wide view of the skyline, and one with the HUD.

PERFORMANCE BUDGET (iPhone 12, all effects on)
- 60 fps on the bench route, so frames under 14 ms. Main pass under 150 draw calls and 400k triangles. One shadow-casting light. Textures compressed (KTX2 where practical) and under 150 MB of GPU memory. First load under 15 MB.
- Device pixel ratio capped at 2, with dynamic resolution between 1.25 and 2. Never render at 3x.
- No per-frame allocations (pools, reused vectors). Prewarm every shader at load (renderer.compileAsync) so the first explosion doesn't hitch. Handle webglcontextlost and webglcontextrestored: pause, rebuild, resume.
- Headless numbers are not iPhone numbers. Say so in every report; Jack's ?bench=1 run is the real test.

STEP 6: HAIRPINS MUST MATTER (a deliberate sim change, for fun)
The handoff found that bots take hairpins 20 to 140 pt/s over grip speed and only scrape the rail, so braking and drifting never pay. Make the fastest way through a hairpin a brake or a drift:
- Entering a hairpin well over grip speed without braking or drifting runs the car wide into the outside barrier: a hard hit, a big speed loss, sparks and some damage.
- Put this behind a sim flag so replays can run with it off for parity checks.
- Test with bots over 20 hairpins: a brake-or-drift bot against a floor-it bot. The brake-or-drift bot must average at least 0.5 s faster per hairpin, and the floor-it bot must hit the barrier on at least 80% of them.
- Record new baseline replays with the flag on.
Leave the fast-swipe Slam note (3 Slams in 26 fast lane changes beside an enemy) for Jack's playtest. Don't tune it now.

STEP 7: CHECK, PUBLISH, STOP POINT 1
- Run every bot and replay, a 10-minute soak (memory and renderer.info stay flat), a context-loss test, and the budget checks. Publish the 3D build.
- Report to Jack: the 3D link, the canvas comparison link, the postcard shots for all three looks, the headless numbers, and what you'd improve next.
- Then ask Jack these, in these words:
  1. Open the 3D link on your iPhone and switch between Night, Dusk and Blue hour. Which look do you want?
  2. Open the 3D link with ?bench=1 added to the end, wait for the results screen, and send a screenshot.
  3. Play 10 minutes. Does drifting feel good? Does the speed feel fast? Do the hairpins make you brake or drift? Did anything look wrong?
  4. Play the canvas link for 2 minutes. Does the car drive the same in both?
- Stop and wait for his answers.

AFTER STOP POINT 1 (outline only; details come with Jack's answers)
Apply the chosen look. Original hero spy car (concepts first, then the model) and enemy class models. Bring in the drops work (ecb7983), then the arsenal and enemies work (98bf28b), one at a time: apply the Step 2 determinism changes to the canvas build at that commit, record replays there, re-apply the sim changes to the modules, and require matching hashes with the hairpin flag off. Build the drop chase camera with the audit numbers (about 15 degrees pitch, 9 m behind, 2.5 m up, FOV 70 widening to 90, a 1.2 s blend from the road camera). Then the first mission with forks and endings, for the fun gate.

REPORTS
After each step, at most 5 plain lines for Jack: what changed, the link, whether replays match and bots pass, frame time, and screenshots. No jargon in those lines.
