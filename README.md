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

## How prizes are given out

**Daily prize budget (default).** You set how many players you expect and exactly how many prizes to give that day:

| Setting | Default |
|---|---|
| Expected players | 40 |
| 🏆 Big prizes | 1 |
| 🎁 Medium prizes | 1 |
| 🍬 Small prizes | 2 |

- Expected players are split into equal stretches (with the defaults, 4 stretches of 10). Each stretch has exactly one winner at a random spot, so prizes are spread across the whole day.
- **Hard cap:** once the day's prizes are gone, the wheel keeps spinning but every spin lands on Try Again / Sorry / Better Luck. That includes any players beyond the expected count.
- The budget refills automatically at midnight, or by pressing **Start a new day** in Settings.
- If turnout differs from plan, change **Expected players** mid-day. The prizes still owed are re-spread across the players still to come.
- Each tablet has its own budget. With two tablets, split the prizes between them.

The other two modes, **Guaranteed ratio** and **Pure random**, use win percentages and have no daily limit.

## Editing prizes (⚙️ Settings)

- Add, rename or remove prizes. You can change each prize's emoji, tier (Big / Medium / Small / No prize) and **stock**.
- When a prize's stock reaches 0, its slice greys out with "(OUT)". Spins for that tier drop to the next tier down.
- Set an **Admin PIN** so players can't open settings.
- **Live stats** shows spins and the real win rate for each tier.
