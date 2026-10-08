# Prize Spinner

A prize wheel for events, built for tablets and laptops. It has no install and no server, and it works offline once loaded.

## Run it

- **Quickest:** open `index.html` in Chrome, Safari or Edge.
- **Tablet kiosk:** host the folder anywhere static (GitHub Pages, Netlify, an S3 bucket), open it on the tablet, choose **Add to Home Screen**, then tap ⛶ for fullscreen.
- Settings, prize stock and stats are saved on that device (browser `localStorage`).

## How a round works

1. A player taps **SPIN** (or the wheel hub, or presses Space/Enter on a laptop).
2. The wheel spins with sound, pointer clicks and chasing lights. It then lands and shows the result.
3. Spinning stays locked until staff tap **Next Player**. That gives each person one chance per round.

## Default odds

| Outcome | Chance | Per 20 players |
|---|---|---|
| 🏆 Big prize | 10% (1 in 10) | 2 |
| 🎁 Medium prize | 25% (1 in 4) | 5 |
| 🍬 Small prize | 50% (1 in 2) | 10 |
| 🍀 No prize (Try Again / Sorry / Better Luck) | 15% | 3 |

**Guaranteed ratio mode** (the default) deals outcomes from a shuffled deck. Every 20 spins hit those numbers exactly. **Pure random** mode is also available.

Slice size on the wheel is visual only. The odds are set per *tier*, not by how many slices a tier has.

## Editing prizes (⚙️ Settings)

- Add, rename or remove prizes. You can change each prize's emoji, tier (Big / Medium / Small / No prize) and **stock**.
- When a prize's stock reaches 0, its slice greys out with "(OUT)". Spins for that tier drop to the next tier down.
- Set an **Admin PIN** so players can't open settings.
- **Live stats** shows spins and the real win rate for each tier.
