# Elevator Madness

A retro arcade game in the spirit of Elevator Action. Robbers have taken the
tower — ride the elevators between floors, shoot them before they shoot you,
crouch to dodge or duck into a doorway to hide, then escape through the
ground-floor exit to reach the next level.

The whole game is a single self-contained file: `index.html` (pixel-art
sprites are embedded as data URIs). No build step, no dependencies, no server
required. Original artwork lives in `art/source`; the game-ready cuts are in
`art/sprites`.

## Play it

- **Locally:** download `index.html` and double-click it — it runs in any
  modern browser.
- **Online via GitHub Pages:** in this repo go to **Settings → Pages**, under
  "Build and deployment" choose **Deploy from a branch**, pick `main` and
  `/ (root)`, and save. A few minutes later the game is live at
  `https://jaybiz0131.github.io/elevatormadness/`.

## Install it like an app (PWA)

The game is a Progressive Web App: once it's live on GitHub Pages (or any
HTTPS host), it can be installed to the home screen, launches full-screen
with its own icon, and **works offline**.

- **iPhone / iPad:** open the game URL in **Safari**, tap the **Share**
  button, then **Add to Home Screen**.
- **Android:** open it in Chrome and accept the "Add to home screen" /
  "Install app" prompt.
- **Desktop:** Chrome and Edge show an install icon in the address bar.

Updates deploy automatically: the app checks for a fresh version whenever
it's opened online, and keeps working from cache when offline.

## Controls

| Input | Action |
|---|---|
| ← / → (or A / D) | Move |
| ↑ / ↓ (or W / S) | Ride an elevator when standing in a car |
| ↑ beside a shaft | Call the elevator to your floor |
| ↑ at a door | Hide inside (press ↑ or ↓ again to step out) |
| ↓ on solid floor | Crouch — ducks under enemy shots |
| Space or J | Shoot |
| P | Pause |
| M | Mute |

On phones and tablets, on-screen touch controls appear automatically.

## Gameplay notes

- Robbers aim chest-high; crouching dodges their shots. From level 3 they
  start firing low shots too.
- **Robbers use the elevators.** If you're on another floor, they'll call a
  free car, board it, and ride to your floor to hunt you down.
- **Robbers use the doors too.** They duck into doorways and re-emerge from a
  different door — often on another floor, sometimes on yours. A robber
  inside a door can't be shot, but they always pop back out within seconds,
  and the last two robbers alive never hide, so the level can always be
  finished.
- **Doorways are safe houses.** Press ↑ in front of any door (a small ▲
  appears) to slip inside — robbers can't see or hit you. You can't shoot
  while hidden, and the exit door doesn't count.
- Shooting a robber while riding an elevator earns bonus points.
- **Walkways cross every shaft — but only you can use them.** You stroll
  safely over an open shaft (watch out: a descending elevator smashes
  anyone in its path). If you ever do fall, one floor onto a car roof just
  stuns you — **any fall longer than a floor is fatal**. Robbers never
  risk the walkways: they turn back at open shafts and only cross where a
  car is parked... so if one is mid-crossing when you call the car away,
  he plummets to a horrible death.
- Robbers die with style: shot robbers are blasted backwards off their
  feet, tumbling and bouncing — and if the blast (or a slide) carries them
  over an open shaft, they plunge violently all the way down. Smashed ones
  stay flattened under the car.
- Doors visibly swing open and shut whenever anyone slips in or out.
- **The elevator is a weapon.** A descending car slowly grinds down and
  smashes anyone it passes through — pinning them under it as it squashes
  them flat (worth a +150 bonus for robbers, a lost life if it's you). The
  car spares whoever stands on its destination floor, stopping level with
  them instead, so calling the elevator to your own floor is always safe.
- **Robbers get angry.** A bullet whizzing past or an ally dying nearby puts
  robbers on alert: they spot you from anywhere on the floor and aggressively
  grab elevators to hunt you down. Snipe from safety while you can.
- **Loot the briefcases.** A few doors per level hide glinting briefcases —
  duck inside to grab one (+500). Collect them all for a CLEAN SWEEP bonus.
- **Reinforcements!** From level 2, thinning the robbers halfway triggers a
  fresh squad bursting out of the doors — already alerted.
- **Style pays.** Chained kills within 2 seconds build combos; a corpse that
  plunges down a shaft earns LONG DROP +200; beating the level clock earns a
  time bonus; every 5,000 points is a 1-UP (up to 6 lives).
- **Equipment drops.** Smashed robbers usually drop gear (shot ones
  sometimes): Rapid fire, Spread shot (a second low bullet that catches
  crouchers), or an Armor vest that absorbs one hit.
- **Elevator indicators** under the HUD show each car's floor and direction —
  a red-pulsing shaft means a car is descending through it. Mind the gap.
- When one robber is left, a red ping marks him — even off-screen.
- A chiptune pulse and elevator hum play during runs (M mutes everything);
  the game auto-pauses when the tab loses focus; the title screen keeps
  your five best runs.
- Clear every robber to activate the glowing EXIT on the ground floor.
- **Every level is a different building**: elevator shaft positions are
  randomized each time, a fourth shaft appears from level 4, and each level
  adds more floors and more, faster robbers.
- Your high score is saved in the browser.
