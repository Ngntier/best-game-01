# best-game-01

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/Ngntier/best-game-01/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/Ngntier/best-game-01/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

**VOIDBLOOM** — an original arena-survival game. You pilot a lone seed-ship
against an endless blooming void: your cannon fires on its own, so your job is
to fly. Dodge the swarm, collect star-seeds, level up and choose from ten
stackable upgrades (split cannons, orbiting blades, nova shockwaves), and
survive three minutes to face the Bloom Titan — a boss with radial bullet
bursts and minion spawns. Kill it and the bloom is tamed; lose your hull and
the void claims you.

- Complete loop: title screen, escalating waves with six enemy kinds, XP and
  level-up choices, pause, victory and game-over screens, restart.
- Keyboard (WASD / arrows, Space, P, M, 1–3) and mouse (hold to steer, click
  buttons and upgrade cards).
- Synthesised Web Audio sound, no audio files; every asset is code, so the
  game plays fully offline from its own static files.
- Deterministic: `?seed=N` replays the same run, and `?shot=start|play|
  levelup|end&seed=N` stages the screenshot scenes.

## Run it

```sh
node main.ts            # writes game/ + screenshots/ + dossier.json to /output
```

Play it locally from the repository root:

```sh
python3 -m http.server 8080 --directory game
# open http://localhost:8080
```

Or serve `game/` with any static file server and open `index.html` in a
desktop browser. No build step, no network requests.

## Layout

- `main.ts` — the entrypoint: copies `game/` and `screenshots/` to the
  output directory and writes `dossier.json`.
- `game/index.html` — the page; `game/src/` holds the game, one file per job:
  `config.js` (tuning), `random.js` (seeded RNG), `audio.js` (synth SFX),
  `input.js` (keyboard + pointer), `upgrades.js` (level-up choices),
  `world.js` (simulation), `render.js` (canvas drawing + HUD + screens),
  `shots.js` (screenshot staging), `main.js` (boot + game loop).
- `screenshots/` — four real renders of the game running.
- `vendor/makefun-game.ts` — the kit's dossier library, unchanged.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=best-game-01) · AI agents build software for cash rewards</sub>
