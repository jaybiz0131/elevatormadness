# Moonwake

An original vertical river-raid for iPhone. The design lives in
[`../design/moonwake-design.md`](../design/moonwake-design.md); this folder
is the implementation.

```
moonwake/
├── Moonwake.xcodeproj/      Xcode 16 project (one app target, local package dependency)
├── Moonwake-Info.plist      app Info.plist (portrait, full screen, status bar hidden, launch colour)
├── Moonwake/                the iOS app (SpriteKit) — synchronized folder, no file list to maintain
│   ├── App/                 AppDelegate, GameViewController
│   ├── Scene/               GameScene, WaterNode + WaterShader, Projection, CraftNode, PropNodes, HUDNode, Lighting
│   ├── Support/             Haptics, SaveStore
│   └── Resources/           Assets.xcassets (AppIcon 1024, LaunchBackground)
├── MoonwakeCore/            Swift package: all game logic, no UIKit/SpriteKit, tested on Linux and macOS
└── lookdev/                 WebGL prototype of the look, render scripts, reference renders
```

## What is verified and what is not

**Verified in the cloud (Linux, Swift 6.0.3):**

- `MoonwakeCore` builds and its 37 tests pass: deterministic seeded river
  (same seed → identical reaches on any device), banks always on screen,
  width change ≤ 20% per reach, minimum channel beside islands, lantern gap
  cap, hazard exclusion zones, a steerable safe corridor in every reach,
  fuel equilibrium numbers from the design, chain multiplier cap, extra
  life thresholds, the one-thumb input model (tap, hold-still auto-fire,
  steer cancels fire, throttle thresholds), lateral lag and speed blend.
- The water look: `lookdev/index.html` renders the intended frame with
  headless Chromium (`lookdev/renders/*.png`, `night.mp4`).

**Not yet verified (needs a Mac with Xcode 16+):**

- The app target has never been compiled. Expect a handful of compile
  errors on first open; they should be shallow (API spelling, CGFloat/Double
  conversions). Paste them back and they get fixed in one pass.
- The SpriteKit water shader is a port of the WebGL shader. SpriteKit
  transpiles GLSL to Metal and is picky: if it fails to compile, the
  console prints the line. Likely suspects are `mat2` constructors and the
  `if` on `u_lantern.x`.
- Performance. The shader is fill-rate heavy. Target 60 fps on iPhone XR
  and newer; if it drops, first reduce `fbm3` to two octaves in
  `WaterShader.swift`, then consider rendering the water at half
  resolution.

## Opening it on the Mac

1. Open `moonwake/Moonwake.xcodeproj` in Xcode 16 or newer.
2. Select the `Moonwake` target → Signing & Capabilities → pick your team.
   Change the bundle identifier (`com.example.moonwake`) to your own.
3. Pick an iPhone and run. The simulator shows the layout; haptics,
   shader cost and thumb feel need a device.
4. Run the package tests on the Mac too: select the `MoonwakeCore` scheme
   (Xcode creates it from the local package) and press ⌘U.

The app has no third-party dependencies and no server.

## What the app does today (week-1/2 graybox with the final water)

- Launches straight into the river (attract: slow scroll, touch to take the helm).
- One-thumb control from the design: relative steering, vertical slide or
  second finger for throttle, tap or hold-still to fire.
- Seeded procedural river with banks, islands, splits, pilings, Hulks
  (moored and drifting), Dragonflies (dash, and fire from band 4 with the
  rotor telegraph), Teeth chains (pivoting, anchor detonates the chain),
  Lanterns (fuel), Weirs (checkpoints), levee lamps.
- Fuel drain and skim, graze chain with multiplier, scoring, extra lives,
  three lives, death with hit-stop and explosion, respawn at the last Weir
  with a flicker, run-over card with same-seed RESTART, NEW RIVER, DAILY
  toggle and settings (haptics, replay how-to).
- Three lighting states driven by the band, cross-faded at band changes.
- Haptics vocabulary from the design. Local save of best score and settings.
- First-run how-to prompts before the first Weir.

Not built yet (per the design's weekly plan): audio (week 6), Game Center
weekly board (week 7), real sprites for craft and props (week 5, after the
graybox replay gate), tuning pass (week 8).

## Where the numbers live

Every tuning value is a `static let` in
`MoonwakeCore/Sources/MoonwakeCore/Tuning.swift`, with the five-band table
at the bottom of that file. Lighting colours are in `Moonwake/Scene/Lighting.swift`
and mirror `lookdev/index.html`. Camera constants (`perspY`, `perspX`,
craft lane) must match between `Projection.swift` and the top of the shader.

## Look-dev

```
cd moonwake/lookdev
node render.mjs out night,dusk,fog      # three stills
node clip.mjs out night 3 30            # 3 s, 30 fps H.264 (needs ffmpeg with libx264)
node icon.mjs                           # regenerates the 1024 px app icon
```

The scripts expect Playwright's Chromium; adjust the import path at the top
of each script if Playwright is installed elsewhere.
