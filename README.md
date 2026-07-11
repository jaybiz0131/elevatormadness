# Elevator Madness

A retro arcade game in the spirit of Elevator Action. Robbers have taken the
tower — ride the elevators between floors, shoot them before they shoot you,
crouch to dodge their bullets, then escape through the ground-floor exit to
reach the next level.

The whole game is a single self-contained file: `index.html`. No build step,
no dependencies, no server required.

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
| ↓ on solid floor | Crouch — ducks under enemy shots |
| Space or J | Shoot |
| P | Pause |
| M | Mute |

On phones and tablets, on-screen touch controls appear automatically.

## Gameplay notes

- Robbers aim chest-high; crouching dodges their shots. From level 3 they
  start firing low shots too.
- Shooting a robber while riding an elevator earns bonus points.
- Walking over an open elevator shaft with no car in it means a fall — long
  drops stun you for a moment.
- Clear every robber to activate the green EXIT on the ground floor. Each
  level adds more floors, more robbers, and faster enemies.
- Your high score is saved in the browser.
