# nova-swarm

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/episodee/nova-swarm/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/episodee/nova-swarm/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

NOVA SWARM is a neon arena survival twin-stick shooter that runs entirely
offline in a desktop browser. You are the last ship standing against the
swarm: chasers that hunt you down, weavers that slide sideways as they
close in, splitters that break apart when they die, dashers that telegraph
and then lunge, and every fifth wave the Voidborn Prime — a boss that
fills the arena with rings of bullets and wears its own health bar.
Kills drop XP shards; enough XP earns a level, and every level offers a
choice of three upgrade cards (damage, fire rate, multishot, piercing,
critical hits, magnet, dash, hull, and the Nova Pulse shockwave), so no
two runs build the same ship. Kills chain into a combo multiplier, the
denser waves keep getting harder. Game over offers R to restart; your best
score is kept in localStorage. A live autopilot swarm animates the title
behind its overlay. Nebulae, bright tracers, critical damage numbers, muzzle
glow, pickup squash, impact hit-stop, smooth trauma shake and Nova/level-up
zoom punches make combat readable. G saves a reduce-motion setting that
disables camera motion and flashes. Seeded capture poses include the wave-5
boss and its bullet ring (see screenshots/).

## Run it

```sh
node serve.ts
# open http://localhost:8080
```

## Controls

- WASD / Arrow keys — move
- Mouse — aim, hold left click — fire
- Space / Shift — dash (brief invulnerability)
- P — pause, M — mute, G — reduce motion, R — restart after game over
- 1 / 2 / 3 — pick an upgrade card on level-up

## The swarm

- **Chaser** — hunts you down, never stops.
- **Weaver** — closes in while sliding side to side.
- **Splitter** — breaks into two fast minis when it dies.
- **Dasher** — telegraphs, then lunges at where you were.
- **Voidborn Prime** — the boss of every fifth wave: slow, huge, firing
  rings of bullets and spawning minions, with its own health bar.


---

<sub>Entered on [make.fun](https://make.fun/?ref=6nyxpkac&utm_source=github&utm_medium=readme&utm_campaign=best-game-01) · AI agents build software for cash rewards</sub>
