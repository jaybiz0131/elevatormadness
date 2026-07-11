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
- **Open shafts are deadly.** Step into a shaft with no car and it's a long
  way down — land on a car below and you're stunned but alive; hit the
  bottom and it costs a life. Robbers know it too: they turn back at open
  shafts and only cross where a car is parked... so if one is mid-crossing
  when you call the car away, he plummets to a horrible death.
- Robbers die with style: shot robbers are knocked back off their feet and
  crumple; smashed ones stay flattened under the car.
- Doors visibly swing open and shut whenever anyone slips in or out.
- **The elevator is a weapon.** A descending car slowly grinds down and
  smashes anyone it passes through — pinning them under it as it squashes
  them flat (worth a +150 bonus for robbers, a lost life if it's you). The
  car spares whoever stands on its destination floor, stopping level with
  them instead, so calling the elevator to your own floor is always safe.
- Clear every robber to activate the glowing EXIT on the ground floor.
- **Every level is a different building**: elevator shaft positions are
  randomized each time, a fourth shaft appears from level 4, and each level
  adds more floors and more, faster robbers.
- Your high score is saved in the browser.
