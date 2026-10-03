# Credits

Shunt is original IP. Every car, building, sign, brand name and effect in the game is invented and built in code; nothing is
modelled on a real vehicle, badge or trademark, and nothing references any existing spy franchise.

## Third-party code (npm, pinned)

| Package | Version | License | Use |
|---|---|---|---|
| three | 0.186.1 | MIT | renderer, geometry, materials, `lil-gui` (bundled example) for the `?tune=1` panel |
| postprocessing (pmndrs) | 6.39.5 | Zlib | bloom, tone mapping, LUT, vignette, grain, chromatic aberration |
| vite | 8.3.2 | MIT | build |

## Fonts

| Font | License | Use |
|---|---|---|
| Rajdhani (Google Fonts) | SIL Open Font License 1.1 | HUD and signs |

## Models and textures

No external models or textures are used. Placeholder cars are boxes built in `spycar/shunt/src/render/three/cars.js`; the
city kit, facades, neon signs and particle sprites are generated at load from code (`city.js`, `fx.js`). When CC0 models
(for example Kenney or Quaternius) are brought in, they are listed here with source URL and license.
