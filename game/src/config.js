// NOVA SWARM — every tuning number, colour and key in one place.
// The playfield is the window itself: the renderer reports the canvas size and the
// world spawns, clamps and lays out the HUD against it, so the game plays at any
// desktop size and screenshots at 1280x480 show the same layout, just shorter.

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'nova-swarm.best';

/** How long, in seconds, a level-up choice may wait before the game auto-picks one. */
export const LEVELUP_AUTO_PICK_SECONDS = 45;

export const PLAYER = {
  radius: 14,
  speed: 300,
  maxHp: 100,
  /** Seconds of invulnerability after taking a hit. */
  invulnerable: 1.0,
  /** Contact damage an enemy deals, before any scaling. */
  contactDamage: 12,
  /** Base weapon numbers; upgrades multiply these. */
  damage: 12,
  fireInterval: 0.2,
  bulletSpeed: 640,
  multishot: 1,
  pierce: 0,
  critChance: 0.05,
  critMultiplier: 2,
  magnetRadius: 110,
  /** Dash: distance covered, invulnerable window, cooldown. */
  dashDistance: 170,
  dashTime: 0.16,
  dashCooldown: 2.2,
  /** Periodic radial burst (nova pulse), unlocked by an upgrade. */
  novaInterval: 8,
  novaDamage: 30,
  novaBullets: 14,
};

export const BULLET = {
  radius: 5,
  life: 1.1,
};

export const ENEMY_BULLET = {
  radius: 6,
  speed: 150,
  life: 6,
  damage: 8,
};

/** Enemy archetypes: shape, colour and behaviour are distinct at a glance. */
export const ENEMIES = {
  chaser: { kind: 'chaser', hp: 22, speed: 100, radius: 14, score: 50, xp: 1, sides: 3, color: '#ff4fd8' },
  weaver: { kind: 'weaver', hp: 18, speed: 74, radius: 13, score: 70, xp: 1, sides: 4, color: '#38e8ff' },
  splitter: { kind: 'splitter', hp: 38, speed: 58, radius: 19, score: 90, xp: 2, sides: 6, color: '#ffb02e' },
  dasher: { kind: 'dasher', hp: 26, speed: 64, radius: 13, score: 100, xp: 2, sides: 3, color: '#ff4d4d' },
  mini: { kind: 'mini', hp: 9, speed: 145, radius: 8, score: 20, xp: 1, sides: 3, color: '#ffc46b' },
  boss: { kind: 'boss', hp: 650, speed: 42, radius: 44, score: 1000, xp: 10, sides: 8, color: '#b46bff' },
};

/** Wave escalation: count, health and speed all grow with the wave number. */
export const WAVES = {
  baseCount: 5,
  perWave: 3,
  hpPerWave: 0.18,
  speedPerWave: 0.03,
  speedCap: 0.5,
  spawnInterval: 0.85,
  spawnIntervalMin: 0.28,
  spawnIntervalPerWave: 0.045,
  /** Seconds of breather (and the wave banner) after a wave is cleared. */
  breather: 3.0,
  waveClearBonus: 150,
  bossEvery: 5,
  /** Weaver unlocks from wave 2, splitter from 3, dasher from 4. */
  unlockWave: { weaver: 2, splitter: 3, dasher: 4 },
};

export const XP = {
  /** XP needed to go from level L to L+1. */
  need: (level) => 14 + level * 12,
  shardValue: 1,
  bossShardValue: 5,
  collectRadius: 24,
  magnetAccel: 1400,
  shardSpeed: 60,
};

export const COMBO = {
  /** Seconds without a kill before the combo starts to fall. */
  window: 3.0,
  /** Multiplier added per combo kill, capped. */
  perKill: 0.05,
  cap: 3.0,
};

export const PALETTE = {
  backdrop: '#05060f',
  nebulaViolet: '#3b1d6e',
  nebulaTeal: '#0d3a4d',
  nebulaPink: '#5c1445',
  grid: 'rgba(90, 140, 255, 0.07)',
  player: '#7df9ff',
  playerCore: '#ffffff',
  bullet: '#ffe95e',
  shard: '#59f7d2',
  shardGold: '#ffd94d',
  enemyBullet: '#ff7ad9',
  panel: 'rgba(10, 14, 34, 0.82)',
  panelBorder: 'rgba(125, 249, 255, 0.35)',
  text: '#eef4ff',
  muted: '#93a3c4',
  danger: '#ff5d6c',
  gold: '#ffd94d',
  xp: '#59f7d2',
  hp: '#ff5d6c',
  hpGood: '#5dffa0',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
