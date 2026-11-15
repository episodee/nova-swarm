// NOVA SWARM — every number that shapes how the game feels, in one place.
// Ship handling, weapons, enemy kinds, waves, experience and the boss.
// The playfield is the canvas itself; the balance below was tuned against
// a 1280x720 window and adapts to whatever size the browser gives it.

export const TUNE = {
  // --- the player ship ---
  shipRadius: 14,
  shipSpeed: 265,
  shipHp: 100,
  fireInterval: 0.145, // seconds between shots
  bulletSpeed: 640,
  bulletDamage: 1,
  bulletRadius: 4,
  bulletLife: 1.1, // seconds before a bullet fades out
  dashCooldown: 2.2,
  dashTime: 0.16,
  dashSpeed: 760,
  hurtInvuln: 0.7, // mercy seconds after taking a hit
  magnetRadius: 95,
  pickupRadius: 26, // how close a shard must be to collect it

  // --- experience ---
  shardValue: 3, // XP carried by one shard
  shardDropChance: 0.7,
  shardLife: 11, // seconds before a shard winks out
  // XP needed to gain level n (1-based): 50, 60, 70, 80, ...
  xpNeed: (level) => 40 + 10 * level,

  // --- combo ---
  comboWindow: 3.0, // seconds to keep the kill chain alive
  comboCap: 8,

  // --- waves ---
  breather: 3.0, // seconds of calm between waves
  bossWaveEvery: 5,

  // --- the boss ---
  bossBurstEvery: 2.6, // seconds between radial bullet bursts
  bossBurstCount: 12,
  bossBulletSpeed: 175,
  bossMinionEvery: 7.0, // seconds between minion spawns
  bossEscorts: 8, // regular foes that arrive with the boss
};

// How many foes a wave fields (boss waves add the boss on top of this).
export function waveSize(wave) {
  return 5 + 2 * (wave - 1);
}

// Which foe kinds a wave may field. The roster grows as the run goes on.
export function waveRoster(wave) {
  if (wave <= 1) return ['chaser'];
  if (wave === 2) return ['chaser', 'weaver'];
  if (wave === 3) return ['chaser', 'weaver', 'splitter'];
  return ['chaser', 'weaver', 'splitter', 'dasher'];
}

// One row per foe kind: health, speed, size, touch damage, score and look.
export const FOES = {
  chaser: {
    hp: 3, speed: 78, radius: 13, damage: 10, score: 10,
    color: '#ff4d6d', glow: '#ff4d6d',
  },
  weaver: {
    hp: 2, speed: 66, radius: 12, damage: 10, score: 15,
    color: '#ff9f1c', glow: '#ff9f1c',
  },
  splitter: {
    hp: 5, speed: 54, radius: 16, damage: 10, score: 20,
    color: '#8dff5e', glow: '#8dff5e',
  },
  mini: {
    hp: 1, speed: 98, radius: 8, damage: 8, score: 5,
    color: '#8dff5e', glow: '#8dff5e',
  },
  dasher: {
    hp: 3, speed: 62, radius: 12, damage: 15, score: 25,
    color: '#ffe14d', glow: '#ffe14d',
  },
  boss: {
    hp: 430, speed: 44, radius: 48, damage: 20, score: 500,
    color: '#b388ff', glow: '#b388ff',
  },
};

// The neon palette the whole game is painted in.
export const PALETTE = {
  background: '#05060f',
  grid: 'rgba(96, 128, 255, 0.07)',
  star: '#cdd8ff',
  player: '#4df3ff',
  playerGlow: '#4df3ff',
  bullet: '#7df9ff',
  enemyBullet: '#ff5df2',
  shard: '#5effe0',
  text: '#e8f0ff',
  dimText: '#8fa3cc',
  gold: '#ffd75e',
  danger: '#ff4d6d',
};
