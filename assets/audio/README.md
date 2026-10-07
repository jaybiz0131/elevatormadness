# Audio files

| File | What | Notes |
|---|---|---|
| `theme_full_64k.m4a` | The theme, **embedded in the page** at build time (`src/audio/files.js` imports it as a data URL) | The first 95 s of the song at 64 kbps stereo (the part that is played: the intro, then the loop). TAP TO START plays it from 0:00 every time; from 12.045 s it loops between `loopStart` 12.045 and `loopEnd` 94.6062 (Web Audio loop points, an exact 32 bars), through the menus and the run. The logo punches in at `hit` 12.045 |
| `source/theme_full.m4a`, `source/theme_loop.m4a` | Jack's originals (181.5 s, and the 32 bar loop) | Not built in. `theme_full_64k.m4a` was made from `source/theme_full.m4a` (`ffmpeg -t 95 -c:a aac -b:a 64k`); the loop start, 12.045, and end, 94.6062, were checked against `theme_loop.m4a` by cross-correlation (0.99) |

**Why embedded.** Published files beside the page (audio/*.mp4) did not play on Jack's iPhone. The page stays under 15 MB because only the first 95 s are embedded (790 KB, 1.05 MB as base64). A full 181 s file at 64 kbps would add about 0.8 MB more and take the page past 15 MB; if Jack's own `theme_full_64k.m4a` is the full length, trim it with `-t 95` (or move the loop end into a shorter file) first.

To swap the theme: replace `theme_full_64k.m4a` here, set `hit`, `loopStart` and `loopEnd` in `FILES.theme` (`src/audio/files.js`) and rebuild. The Show FPS panel has a line `audio OK` or `audio FALLBACK: theme_full_64k.m4a` (FALLBACK means the file did not decode and the old synth music is playing).

Later recordings (engine, guns, crashes): add the file here, one line in `FILES` with a `url` (fetched from beside the page) or a `data` import (embedded), then `files.get('name')` / `audio.playFile('name', { loop, gain, rate })`.
