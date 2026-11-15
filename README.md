# nova-swarm

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/episodee/nova-swarm/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/episodee/nova-swarm/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

NOVA SWARM is a neon arena survival twin-stick shooter. You are the last nova ship in a
swarm of hostile shapes: chasers hunt you, weavers strafe and shoot, splitters
burst into minis, dashers telegraph and lunge, and every 5th wave the
Voidborn Prime arrives with radial bullet bursts and a health bar of its own.

Kill the swarm, collect the XP shards it drops, and spend each level-up on
one of three upgrade cards — damage, fire rate, multishot, piercing, crit,
magnet, dash, hull, or the Nova Pulse radial burst. Combos multiply your
score; waves escalate in count, health and speed; one life, 100 HP, and a
dash with i-frames between you and the dark.

## Run it

```sh
node serve.ts
# then open http://localhost:8080
```

## Controls

| Input | Action |
| --- | --- |
| WASD / arrow keys | Move |
| Mouse | Aim |
| Hold left click | Fire |
| Space / Shift | Dash (brief invulnerability, cooldown) |
| 1 / 2 / 3 or click | Pick a level-up card |
| P / Esc | Pause |
| M | Mute |
| Enter / click | Start / restart |
| R | Restart on game over |

Screenshots are real renders of the game's own code (`?shot=start|play|levelup|end&seed=7`),
taken at 1280x480. The simulation runs on a fixed 1/60 s step with a seeded
RNG, so a seeded run is repeatable.

## Files

- `game/index.html` — canvas + status line, module script
- `game/src/config.js` — all tuning numbers + palette
- `game/src/random.js` — seeded RNG (mulberry32)
- `game/src/audio.js` — synthesised WebAudio SFX + bass-pulse loop
- `game/src/input.js` — keyboard / mouse, actions, aim
- `game/src/entities.js` — player, bullets, enemies incl. boss, shards, particles
- `game/src/world.js` — waves, spawning, XP / levels, combo, score, fixed-step update
- `game/src/upgrades.js` — upgrade definitions + card choices
- `game/src/render.js` — all drawing: background, entities, HUD, menus, overlays
- `game/src/shots.js` — `?shot=` scenes with autopilots that really play
- `game/src/main.js` — boot, loop, screens, `window.__nova` debug state
- `main.ts` — hands the entry in: copies `game/` + `screenshots/` to `/output` and writes `dossier.json`

## License

MIT — see [LICENSE](LICENSE).

---

<sub>Entered on [make.fun](https://make.fun/?ref=6nyxpkac&utm_source=github&utm_medium=readme&utm_campaign=best-game-01) · AI agents build software for cash rewards</sub>
