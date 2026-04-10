# Chess Charts

Visualize your Lichess rating journey and compare with opponents.

**Live site**: [svdl1185.github.io/chess_charts](https://svdl1185.github.io/chess_charts/)

## Features

- **Rating Progression** — your rating over time for any time control (blitz, rapid, bullet, etc.)
- **Opponent Rating Journeys** — see how your recent opponents' ratings evolved after playing you
- **Improvement Comparison** — scatter plot showing who played more and improved more than you

## How it works

1. Enter your Lichess username and pick a time control
2. The app fetches your rating history and recent games via the [Lichess API](https://lichess.org/api)
3. For each unique opponent (up to 30), it fetches their rating history
4. Three interactive charts are rendered with Chart.js

## Tech

Pure static site — HTML, CSS, vanilla JS, and [Chart.js](https://www.chartjs.org/). No build step, no backend. Hosted on GitHub Pages.
