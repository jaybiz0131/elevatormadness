# Stop 7 FIX: music, logo, sound (report)

Branch `shunt-3d`. Supersedes the audio-as-separate-files parts of `stop7-report.md`. The sim is unchanged: all seven baselines (rev `D8`) match on sync passes and `beauty.json` matches through the live loop (38 of 38).

## 1. Diagnosis (one line each)
- **Did the earlier asset zip arrive?** Yes (`bern1-stop7-assets.zip`: both themes, the title PNG, the 1024 icon). **`bern1-fix.zip` did not arrive** (the upload folder holds only the first zip), so the 64 kbps theme and the JPEG are my own derivations from the originals (below); swap in yours by dropping the files in `assets/` with the same names.
- **Did Jack's build have them?** No. v30, the build he tested, was the text-only rename; the real themes, the title image and the icon were finished after it and not published. What he heard was the stand-in theme as published `audio/*.mp4` files, and it did not play.
- **Do separate published files load from the claude.ai page on iOS Safari?** Not verified from here (no iPhone, no network to the page), but the evidence says no: the placeholder `.mp4` files had been published since v29 and Jack heard nothing, not even the synth fallback (which only starts when a load *fails*, so the load most likely hung). Separate files are dropped.
- **What did the "audio" debug line show?** Nothing: that line did not exist in v30 (it is added in this build), and I have no report of it from Jack.

## 2. Embedded
- **Theme:** `assets/audio/theme_full_64k.m4a` is inside the page. The first 95 s of Jack's song, AAC 64 kbps stereo (788 KB; the rest of the 181 s song is never played, because gameplay loops 12.045 to 94.6062). It is one buffer: TAP TO START plays it from 0:00 (the intro is never skipped), the same source has Web Audio `loopStart` 12.045 and `loopEnd` 94.6062, so nothing switches when a run starts and the song loops seamlessly through the menus and the game. The separate theme files and the `.mp4` fallback are gone (the originals are in `assets/audio/source`).
- **Checked:** the re-encode is aligned to the source (0.00 ms offset); the loop file's last 2 s match the full theme at exactly **94.6062 s** (cross-correlation 0.99 on the source, 0.975 on the 64k encode), so the loop end is exact; the logo punch is at **12.045 s** (where the loop starts, after a one bar riser from 9.46 s; the old beat detector said 1.35 s, which is wrong for this song, so `hit` is set to 12.045 and the detector is only a fallback). With the real PCM in the page the stage logic fires the punch at 12.05 s and the menu at 12.65 s.
- **A 181 s file at 64 kbps would not fit:** it adds about 0.8 MB more and the page goes past 15 MB. That is why the embedded file is trimmed to 95 s.
- **Title logo:** `assets/brand/bern1_title_fire.jpg` (the master with only its black top, bottom and right margin cropped, 1170 px wide, JPEG q86, 232 KB) is embedded and drawn with `mix-blend-mode: screen`, so its black disappears into the showroom and the flame trail runs off the left edge. There is no text substitute: the text `BERN-1` is hidden and only shows if the picture cannot be decoded. The tagline sits under it.
- **Icon:** `apple-touch-icon-180.png` (from `bern1_app_icon_1024.png`, Lanczos) is in the page head as a data URL. The 1024 master stays in `assets/brand` for the App Store. Whether the home-screen icon is used for an artifact opened inside the claude.ai app is not something I can test; it is correct on a normal page.
- **Show FPS:** the line `audio OK`, `audio loading` or `audio FALLBACK: theme_full_64k.m4a` is under the other lines. A decode that has not answered in 20 s now counts as a failure, so a stuck decode ends in the synth music (and the FALLBACK line), not in silence. (In headless Chromium, which cannot decode AAC, the line correctly reads FALLBACK.)

## 3. Sound (synth, measured, not heard)
Spectra from offline renders (`OfflineAudioContext`, same code as the game). Phone speakers play almost nothing below 150 Hz, so the table shows the level above 150 Hz as well as the whole.
| Sound | What changed | Result |
|---|---|---|
| Hits and crashes | New `audio.smash(force)`: a low boom (sine falling to 32 Hz, longer with force), a thud, a metal crunch (3 to 8 grains of band-passed noise, 600 to 2,800 Hz, plus a low saw and square for the crumple), glass (from force 0.4: 4 to 12 grains of high-passed noise, no pitch) and a debris rattle (from 0.25: 4 to 14 grains of low band noise spread over 0.4 to 0.9 s). Wired into crunch, wreck, ram, kill, damage, cannon, stomp and death; wall, rail, wreck, car and chunk hits pass their impact speed as the force | Level above 150 Hz at force 1.0: 0.048 rms (was 0.030); the old `hit` tick (a 2.3 kHz tone) is now a 150 Hz chunk; the old 'ping' blips (2 kHz and up) are low thuds; spectrogram has no narrow high lines |
| Every other ping | `ping`, `hit`, `chain`, `mine`, `sight`, `chirp` and the armoured-car tink are low (130 to 330 Hz) | none above 400 Hz. The victory jingle and the pickup chime are unchanged |
| Engine | About an octave lower: pulse body 38, 76 and 114 Hz (was 72, 144 and 216), pulse rate 0.62x (about 9 to 22 per second, was 14 to 36), sub at 26 to 46 Hz with 2x the weight, the saw growl pushed through a harder clip (tanh 5, was 3.2) and a lower filter | idle: 85% of the energy under 80 Hz (was 64%); flat out: 52% under 80 Hz, 37% from 80 to 200 Hz (was 10% and 54%) |
| Tyres | The tonal squeal layer is off. The scrub is the sound: band-passed noise at 180 to 700 Hz with the existing 30 to 75 Hz flutter for roughness, its level following the slip; a burnout is a low-passed (150 to 670 Hz) chopped roar at about twice the old level | slide: 96% of the energy under 200 Hz at low slip, centroid 540 Hz at high slip (was 31% above 2.5 kHz, now 7%); burnout 41% in 200 to 600 Hz |

## Checks
| Check | Result |
|---|---|
| Replays, sync | 7 of 7 match (hashes 38, 113, 154, 115, 155, 137, 157) |
| Replay, live loop | `beauty.json` 38 of 38 through the real frame loop |
| Puck, opening scene | 14 of 14; GO at 4.4 s, enemies within 90 pt at 2.54 s, skip works |
| Build gate | `npm run build` passes (every building 45.6 pt or more from the road) |
| Page size | `dist/artifact.html` 14,681,144 bytes (14.68 MB; limit 15 MB, so 0.32 MB to spare). It was 13,172,953 at Stop 6; the theme is 1.05 MB of that and the logo 0.31 MB |
| Draw calls, triangles | unchanged (no render code changed except the logo image); the opening clip's worst frame was 71 calls and 184k triangles |
| No player-facing "SHUNT", no em dashes | confirmed in the page, the title, the finish card, the HUD and Settings |

## Open
- Jack's `bern1-fix.zip` files (the exact 64k encode, the exact JPEG and icon), if they differ from my derivations.
- An iPhone listen: AAC decoding, the beat landing at 12.045 s, the new engine, hits and tyres. The Show FPS line will say whether the music is real.
