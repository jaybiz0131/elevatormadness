# Sprint D, Stop 7: The first 30 seconds (report)

Build: see the link at the end of this file (the same artifact, version 29). Branch `shunt-3d`. Nothing from the next stop (heat, roadblocks, the drone, enemy weapons) is started.
**The sim changed** (replay format 5, rev `D8`): six new baselines `open-s{1,2,3}-{active,idle}.json` plus a re-recorded `beauty.json` (seed 3, active). The `chaos-*` D7 baselines are retired.

**Two things to read first.**
1. **The music in this build is a placeholder.** Jack's `theme_full.m4a` and `theme_loop.m4a` are not in the repo, so `assets/audio/` holds two synth stand-ins (93 BPM, A minor, a riser then 32 bars) made by `tools/mkplaceholder.mjs` so the whole pipeline could be built and tested. Drop the real files in with the same two names and rebuild; nothing else changes (section 3).
2. **Nobody here can listen, and headless Chromium has no AAC decoder.** The clip's soundtrack is rendered offline from the game's own audio code with the theme decoded by ffmpeg; the m4a decode in a real browser, and the relative `audio/...` URLs on the published artifact, are **not verified in this environment** (section 3). If a file fails to load, the game falls back to the old synth music and says nothing; the first time Jack opens the build, TAP TO START should show a short LOADING on a slow connection and then play the theme.

**Item 0, performance.** The FPS field in the brief was empty ("Jack's v28 notes and FPS: [add yours here]"), so there was no FPS low to act on and **no render scale, particle, decal or facade-fire cap was changed** (nothing to report a cost for). What this stop adds to the frame is small: headlights are glows in the existing batch, no new draw call. Send the v28 FPS low and I will start there next time.

## 1. TAP TO START and the theme
- The app opens on the spinning showroom car with a pulsing **TAP TO START** (no pause button, no menu). While `theme_full` is still loading it reads LOADING with the size so far; it waits at most 25 s, then starts anyway (a failed load plays the synth).
- The tap is the audio gesture (`click`, `touchend` and a key all count, iOS does not accept pointerdown). It plays `theme_full.m4a` **from 0:00 every time**: no seek, no skipped intro, no fade-in over it. The intro builds on the title screen; at the beat the **SHUNT logo punches in** (scale slam, a white flash), the tagline and the menu fade in about 0.6 s later, and the music carries on through the menus and Settings. A tap during the build brings the menu up early (the music runs on).
- Where the beat lands is found by listening to the file (`findHit` in `audio/files.js`: the first onset after the quiet intro). **For the placeholder it found 5.20 s.** If it picks the wrong moment on Jack's file, set `hit` (seconds) on `FILES.theme_full` and it is used as given.
- PLAY (or the run starting any other way) crossfades `theme_full` into `theme_loop` (equal power, 1.6 s). `theme_loop` plays with Web Audio `loopStart = 0`, `loopEnd = 82.5612`.

## 2. The opening scene (the ramp is gone)
It is part of the sim (`sim/intro.js`), so replays and the live loop agree on it. For `T.intro.total` = **4.4 s** after PLAY the run's clock does not move and the hero is placed by a script:
| Time | What happens |
|---|---|
| 0 to 1.15 s | An empty road from a low camera in front of where the hero will stop. A beat of quiet (no engine, no effects; the theme plays on) |
| 0.7 s | The engine roar, off screen |
| 1.15 s | The hero blasts in from the right, sliding sideways as if fleeing (tyre smoke and skid marks from the normal drive code) |
| 1.32 to 2.04 s | It whips a screeching 180 in a burst of smoke and stops facing down the road (about 2.26 s) |
| 1.9 s on | Pursuer headlights flare in the distance behind it (two pairs, with a bloom) |
| 2.5 s to 4.4 s | The camera swings from the front, round the right side, to behind the car and melts into camera C, so the hand-over is not a cut |
| 4.4 s | GO. The run's clock starts at 0, control is the player's, a short turbo kick |
- **First enemies:** the first wave is always two Darts from behind, spawned 470 pt back, and the starting ramp is removed. Measured with the car pulling away from a standstill: on the road 0.15 s after GO, within 90 pt of the car at **2.54 s** (target 2 to 3 s).
- **Skip:** a tap or key during the scene skips it, but only after it has been seen once (`introSeen` in Settings); the skip is recorded in the replay (format 5). A skip ends the scene on the same final pose and the camera eases in over 0.45 s. The first time through nothing can be skipped, and no skip hint is shown; from then on a small hint appears.
- Controls and HUD stay hidden during the scene and come back at GO.
- `?intro=0` turns the scene off (the old 0.6 s countdown); the tools that drive the game use it where they need the car at once.
- **A bug the clip found:** the camera first looked away from the car (it aimed through a plain object, which faces +z). Fixed; the orbit radius is now 15 to 11 m and it keeps the car in frame.

## 3. Audio as separate files
- **Not in the page.** `assets/audio/*.m4a` are copied to `dist/audio/` by the build and published beside the page; the page size is unchanged by them (2.9 MB of placeholders sit outside it).
- **Loader (`audio/files.js`).** One manifest, `FILES`. A recording is added by putting the file in `assets/audio/` and adding one line (url, optional `loopStart`, `loopEnd`, `hit`); `files.get(name)` returns the decoded buffer (or null while loading), `audio.playFile(name, { loop, gain, rate })` plays it. Fetch and decode once, in order, one retry, nothing blocks the game. A comment in the file shows the line for Jack's engine recordings (`engine_idle`). `?audio=<base url>` tries another server by hand; the GitHub Pages copy reads the files from the repo's `assets/audio` folder through a meta tag.
- **Music under the sound.** The theme runs under everything else (Music defaults to 80%) and ducks to 62% while the gatling fires and to 45% for about 0.8 s after a blast, then comes back by itself.
- **Settings:** **Music** and **Effects** volume sliders (saved; Effects scales every sound, Music only the theme).
- **Unverified here:** AAC decode (`decodeAudioData` on iOS and Chrome), the `audio/...` relative URLs on the published artifact, and iOS suspending the context after a tab switch (the music resumes with the next tap, as the effects already do).

## 4. Tune panel: Puck
`?tune=1`, new **Puck** folder: sliders for the gas-lift threshold in the middle (`lift`), in the FIRE and E-BRAKE zones (`liftSide`), how far the pull runs to full brake (`run`) and the side-zone width (`zone`), with live readouts of the thumb's offset and throttle, **Copy puck values** (copies `{ lift, liftSide, run, zone }` for pasting into `PUCK` in `input/input.js`) and **Reset puck**. Values are kept in this browser (`shunt-puck`). Defaults are the Stop 6 values (0.30, 0.62, 0.30, 0.38). `tools/puck.mjs` still passes 14 of 14 with the refactor.

## Clips (`design/stop7/clips/`)
| Clip | What it shows |
|---|---|
| `opening.mp4` (17 s, 390 x 844) | **The full opening with the music:** TAP TO START pulsing over the spinning car, the tap, the intro building, the SHUNT logo punching in on the beat, the menu, PLAY, the empty road, the hero blasting in from the right in a cloud of tyre smoke with the headlights behind it, the swing round to camera C, GO, and the first 2 s of play (the hero is parked, no input, so the first enemies arrive). Contact sheet beside it. |
Software-GL render stepped in a virtual clock (`tools/openclip.mjs`): the soundtrack is rendered offline by the game's own audio code (the music director, the roar, the tyre layer, the engine) on the same timeline. **The music is the placeholder**, the mix is **not heard** by anyone here, and the video is not Jack's thumb.

## Checks
| Check | Result |
|---|---|
| Puck mapping (real pointer events, `tools/puck.mjs`) | 14 of 14 |
| Opening scene (`tools/introtest.mjs`) | hero hidden until 1.15 s, stops at about 2.26 s facing down the road, GO at 4.4 s with `G.t` = 0, enemies within 90 pt at 2.54 s, skip works |
| Replays, sync | 7 of 7 new baselines match on two sync passes each (14 of 14); hashes 113, 154, 115, 155, 137, 157 and 38 |
| Replay, live frame loop | `beauty.json` matches through the real frame loop (lite renderer, software GL): **38 of 38 hashes**, 105 s |
| Draw calls | **71** worst frame in the opening clip; limit 150 (the in-run scene is unchanged from Stop 6's 101) |
| Triangles | **184k** worst frame in the opening clip (limit 400k; Stop 6's in-run worst was 246k) |
| Size | `dist/shunt.html` 13,181,448 bytes, **8,495 bytes (0.008 MB) more** than Stop 6 (13,172,953); limit +0.3 MB, 15 MB cap. The two m4a files (2.9 MB) are published beside it and are not counted |
| Errors | none in the page on any bot run; no em dashes in the new player-facing text |
| Bots (sync, final build, seeds 1 to 4) | skilled: A, C, A, C (104 to 135 s). casual: B, C, C, C (116 to 135 s). weak ("novice"): C, C, C, C (134 to 160 s). Every run reaches the city (Stop 6: A, A, C, A / A, C, C, C / C, C, C, C) |

Two honest notes on the baselines:
- **The idle bot no longer survives 300 s.** With the ramp gone the car is parked at GO and a player who never touches the screen is swarmed at about 154 to 157 s (it used to coast off the ramp and reach the 300 s cap). The idle gate (fewer than 5 player-caused wrecks a minute) is untouched. If you want a longer grace for a player who does nothing, it is the first wave's pace (`T.pace.first`, now 0.15 s).
- **`beauty.json` is shorter (38 s).** The bot's 90 s budget is wall clock on software GL; the run is still a valid active baseline and matches through the live loop.

## Not done and open
- Jack's FPS and notes on v28 (empty), so no perf work.
- Jack's real `theme_full.m4a` and `theme_loop.m4a`; the beat detection and the m4a decode are untested on them.
- Next stop (not started): heat, roadblocks, the drone, enemy weapons.
