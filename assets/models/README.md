# Car models

Drop Meshy GLBs here; the build embeds every `.glb` in this folder (see `spycar/shunt/vite.config.js`). Replace a file and rebuild to update it.

| File | Car | Sim type | Fitted to (sim footprint, unchanged) | Paint |
|---|---|---|---|---|
| `hero.glb` | the hero | player | 2.55 m x 4.5 m | cyan #37e6ff, glass, trim, rims, tyres, head and tail lights (`heroModel.js`) |
| `dart.glb` | Dart | weak | 2.25 m x 3.9 m | dark #2b2e37, red #ff3b3b accent stripe, red headlights |
| `ram.glb` | Ram | bruiser | 3.0 m x 5.25 m | near black #1d1f24, orange #ff7a1c accent |
| `gunner.glb` | Turret van | gunner | 3.0 m x 5.7 m | dark #23262e, violet-red #ff2f6d accent |
| `bulwark.glb` | Bulwark | armored | 9.0 m x 11.25 m | gunmetal #343a44, amber #ffb02a accent |
| `mule.glb` | Mule | truck | 4.2 m x 8.25 m | green #2fd36a, green #7dff9e accent, white headlights (friendly) |

Shapes to aim for: `design/concepts/enemies-topview.png` (from `src/render/three/enemyShapes.js`). Any orientation and scale is fine: the
longest axis is taken as the length and the nose is found from the roof; once a model is checked, set its nose in `ENEMY_NOSE`
(`enemyModels.js`) or `NOSE` (`heroModel.js`). Untextured single meshes are expected (no UVs or materials needed); everything is painted
in code by region. Each enemy type draws as one instanced call. Log every new file in `CREDITS.md`.

Files in `spare/` are not embedded in the build. Nose and up axis per file: `ENEMY_NOSE` and `ENEMY_UP` in `enemyModels.js` (all four enemies point -x; the Gunner is pinned up = y).
