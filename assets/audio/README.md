# Audio files

These are published beside the page (never inside it) and fetched after the page opens; see `spycar/shunt/src/audio/files.js` (the manifest) and `music.js` (the theme director).

| File | What | Notes |
|---|---|---|
| `theme_full.m4a` | The whole theme: an intro that builds into the beat, then the song | Plays from 0:00 on the TAP TO START tap, every time, through the menus. The SHUNT logo punches in where the beat lands (found by listening to the file, or set `hit` in `FILES.theme_full`) |
| `theme_loop.m4a` | The seamless loop, 32 bars | Played with Web Audio `loopStart = 0`, `loopEnd = 82.5612`; the run starting crossfades into it |

**The two files in this folder right now are PLACEHOLDERS** made by `spycar/shunt/tools/mkplaceholder.mjs` (a plain synth loop at 93.02 BPM, A minor: a 2-bar riser, then 32 bars), so the pipeline could be built and tested before the real recordings existed. Drop Jack's files in with the same names and rebuild (`npm run build` copies this folder to `dist/audio`; publish them with the page as `audio/<name>`). If the real intro does not put the beat where the detector expects, set `hit` (seconds) in `FILES.theme_full`.

To add a recording later (engine idle, gunfire, a crash): put the file here, add one line to `FILES` in `files.js`, and read it with `files.get('name')` / `audio.playFile('name', { loop, gain, rate })`.
