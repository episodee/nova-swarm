// Entities: the player ship, bullets, enemies (including the boss), XP shards,
// particles and floating score text — creation, per-step movement and the
// collision helpers the world uses. All randomness comes from the world's seeded
// RNG, passed in, so a seeded run is repeatable.

import { BULLET, COMBO, ENEMIES, ENEMY_BULLET, PLAYER, WAVES, XP } from './config.js';
import { randomInt, randomPick } from './random.js';

/** The player ship, centred on the field, at full health, unupgraded. */
export function createPlayer(fieldW, fieldH) {
  return {
    x: fieldW / 2,
    y: fieldH / 2,
    vx: 0,
    vy: 0,
    radius: PLAYER.radius,
    angle: -Math.PI / 2,
    hp: PLAYER.maxHp,
    maxHp: PLAYER.maxHp,
    speed: PLAYER.speed,
    damage: PLAYER.damage,
    fireInterval: PLAYER.fireInterval,
    bulletSpeed: PLAYER.bulletSpeed,
    multishot: PLAYER.multishot,
    pierce: PLAYER.pierce,
    critChance: PLAYER.critChance,
    magnetRadius: PLAYER.magnetRadius,
    dashCooldown: PLAYER.dashCooldown,
    novaLevel: 0,
    novaInterval: PLAYER.novaInterval,
    novaDamage: PLAYER.novaDamage,
    fireTimer: 0,
    novaTimer: 4,
    dashTimer: 0,
    dashTimeLeft: 0,
    dashX: 0,
    dashY: 0,
    invulnerable: 0,
    thrust: 0,
    /** Upgrade id -> tier owned, for the card pips. */
    upgrades: {},
  };
}

/** One enemy of `kind` at (x, y), scaled to the current wave. */
export function createEnemy(kind, x, y, wave) {
  const base = ENEMIES[kind];
  const hpMul = 1 + (wave - 1) * WAVES.hpPerWave;
  const speedMul = 1 + Math.min(WAVES.speedCap, (wave - 1) * WAVES.speedPerWave);
  const hp = Math.round(base.hp * hpMul * (kind === 'boss' ? 1 + wave * 0.12 : 1));
  return {
    kind,
    x,
    y,
    vx: 0,
    vy: 0,
    radius: base.radius,
    hp,
    maxHp: hp,
    speed: base.speed * speedMul,
    score: base.score,
    xp: base.xp,
    color: base.color,
    sides: base.sides,
    age: 0,
    angle: Math.random() * Math.PI * 2,
    fireTimer: 1.5 + Math.random() * 1.5,
    /** Dasher state: 'chase' -> 'telegraph' -> 'lunge'. */
    state: 'chase',
    stateTimer: 0,
    lungeX: 0,
    lungeY: 0,
    /** Weaver sine drift. */
    phase: Math.random() * Math.PI * 2,
    burstTimer: 2.4,
    flash: 0,
  };
}

/** A player bullet fired toward (aimX, aimY) from the ship's nose. */
export function createBullet(player, aimX, aimY, spreadAngle, damage, crit) {
  const baseAngle = Math.atan2(aimY - player.y, aimX - player.x);
  const angle = baseAngle + spreadAngle;
  return {
    x: player.x + Math.cos(angle) * (player.radius + 6),
    y: player.y + Math.sin(angle) * (player.radius + 6),
    vx: Math.cos(angle) * player.bulletSpeed,
    vy: Math.sin(angle) * player.bulletSpeed,
    radius: BULLET.radius,
    damage,
    pierce: player.pierce,
    crit,
    life: BULLET.life,
  };
}

/** A slow enemy orb, aimed at the player when fired. */
export function createEnemyBullet(x, y, angle, speed) {
  return {
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    radius: ENEMY_BULLET.radius,
    damage: ENEMY_BULLET.damage,
    life: ENEMY_BULLET.life,
  };
}

/** An XP shard dropped by a kill; gold ones are worth more. */
export function createShard(x, y, value, random) {
  const angle = random() * Math.PI * 2;
  const speed = 40 + random() * 60;
  return {
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    value,
    radius: value > 1 ? 8 : 5,
    age: 0,
  };
}

/** One particle: a spark, a shockwave ring, or engine thrust. */
export function createParticle(x, y, vx, vy, life, size, color, kind) {
  return { x, y, vx, vy, life, maxLife: life, size, color, kind: kind || 'spark' };
}

/** A burst of sparks at (x, y); `count` scales with how big the explosion is. */
export function burstParticles(list, x, y, color, count, random, speed) {
  const top = speed || 260;
  for (let i = 0; i < count; i += 1) {
    const angle = random() * Math.PI * 2;
    const v = top * (0.3 + random() * 0.7);
    list.push(createParticle(x, y, Math.cos(angle) * v, Math.sin(angle) * v, 0.4 + random() * 0.5, 2 + random() * 3, color, 'spark'));
  }
  list.push(createParticle(x, y, 0, 0, 0.45, 6, color, 'ring'));
}

/** Floating score text that drifts up and fades. */
export function createFloater(x, y, text, color, size) {
  return { x, y, text, color, size: size || 15, life: 1.0 };
}

/** Pick the wave's spawn mix: chasers always, weavers/splitters/dashers unlock later. */
export function waveComposition(wave, random) {
  const kinds = ['chaser'];
  if (wave >= WAVES.unlockWave.weaver) kinds.push('weaver');
  if (wave >= WAVES.unlockWave.splitter) kinds.push('splitter');
  if (wave >= WAVES.unlockWave.dasher) kinds.push('dasher');
  const weights = { chaser: 5, weaver: 3, splitter: 2, dasher: 2 };
  const total = kinds.reduce((sum, kind) => sum + weights[kind], 0);
  let roll = random() * total;
  for (const kind of kinds) {
    roll -= weights[kind];
    if (roll <= 0) return kind;
  }
  return 'chaser';
}

/** A spawn point just outside the field edge, away from the player when possible. */
export function spawnPoint(fieldW, fieldH, player, random) {
  const margin = 40;
  const edge = randomInt(random, 0, 3);
  let x;
  let y;
  if (edge === 0) { x = random() * fieldW; y = -margin; }
  else if (edge === 1) { x = fieldW + margin; y = random() * fieldH; }
  else if (edge === 2) { x = random() * fieldW; y = fieldH + margin; }
  else { x = -margin; y = random() * fieldH; }
  // Never spawn on top of the player: push the point to the far side if too close.
  if (Math.hypot(x - player.x, y - player.y) < 220) {
    x = fieldW - x;
    y = fieldH - y;
  }
  return { x, y };
}

/** Move one enemy a step toward (and around) the player; returns enemy bullets fired. */
export function updateEnemy(enemy, dt, player, state, random) {
  enemy.age += dt;
  if (enemy.flash > 0) enemy.flash -= dt;
  const dx = player.x - enemy.x;
  const dy = player.y - enemy.y;
  const dist = Math.hypot(dx, dy) || 1;
  const nx = dx / dist;
  const ny = dy / dist;
  const fired = [];

  if (enemy.kind === 'chaser' || enemy.kind === 'mini') {
    enemy.vx = nx * enemy.speed;
    enemy.vy = ny * enemy.speed;
    enemy.angle = Math.atan2(dy, dx);
  } else if (enemy.kind === 'weaver') {
    // Sine drift across the approach: hard to lead, easy to read.
    enemy.phase += dt * 3;
    const strafe = Math.sin(enemy.phase) * 0.9;
    enemy.vx = nx * enemy.speed + -ny * strafe * enemy.speed;
    enemy.vy = ny * enemy.speed + nx * strafe * enemy.speed;
    enemy.angle = Math.atan2(dy, dx);
    enemy.fireTimer -= dt;
    if (enemy.fireTimer <= 0 && dist < 520) {
      enemy.fireTimer = 2.1 + random() * 0.7;
      fired.push(createEnemyBullet(enemy.x, enemy.y, Math.atan2(dy, dx), ENEMY_BULLET.speed));
    }
  } else if (enemy.kind === 'splitter') {
    enemy.vx = nx * enemy.speed;
    enemy.vy = ny * enemy.speed;
    enemy.angle += dt * 1.2;
  } else if (enemy.kind === 'dasher') {
    enemy.stateTimer -= dt;
    if (enemy.state === 'chase') {
      enemy.vx = nx * enemy.speed;
      enemy.vy = ny * enemy.speed;
      enemy.angle = Math.atan2(dy, dx);
      if (dist < 260 && enemy.stateTimer <= 0) {
        enemy.state = 'telegraph';
        enemy.stateTimer = 0.7;
      }
    } else if (enemy.state === 'telegraph') {
      // Hold still and flash: the lunge is coming.
      enemy.vx = 0;
      enemy.vy = 0;
      enemy.angle = Math.atan2(dy, dx);
      if (enemy.stateTimer <= 0) {
        enemy.state = 'lunge';
        enemy.stateTimer = 0.38;
        enemy.lungeX = nx;
        enemy.lungeY = ny;
      }
    } else {
      enemy.vx = enemy.lungeX * 520;
      enemy.vy = enemy.lungeY * 520;
      if (enemy.stateTimer <= 0) {
        enemy.state = 'chase';
        enemy.stateTimer = 1.2 + random() * 0.8;
      }
    }
  } else if (enemy.kind === 'boss') {
    // Slow pursuit plus a radial burst every few seconds.
    enemy.vx = nx * enemy.speed;
    enemy.vy = ny * enemy.speed;
    enemy.angle += dt * 0.6;
    enemy.burstTimer -= dt;
    if (enemy.burstTimer <= 0) {
      enemy.burstTimer = 2.6;
      const count = 12 + Math.min(6, Math.floor(state.wave / 5));
      const offset = random() * Math.PI * 2;
      for (let i = 0; i < count; i += 1) {
        const angle = offset + (i / count) * Math.PI * 2;
        fired.push(createEnemyBullet(enemy.x, enemy.y, angle, ENEMY_BULLET.speed * 0.9));
      }
      state.shake = Math.min(10, state.shake + 4);
    }
  }

  enemy.x += enemy.vx * dt;
  enemy.y += enemy.vy * dt;
  return fired;
}

/** Splitter death: three minis burst out of the wreck. */
export function splitMinis(enemy, wave, random) {
  const minis = [];
  for (let i = 0; i < 3; i += 1) {
    const angle = (i / 3) * Math.PI * 2 + random() * 0.6;
    const mini = createEnemy('mini', enemy.x + Math.cos(angle) * 16, enemy.y + Math.sin(angle) * 16, wave);
    mini.vx = Math.cos(angle) * 180;
    mini.vy = Math.sin(angle) * 180;
    minis.push(mini);
  }
  return minis;
}

/** Circle overlap test used for every collision in the game. */
export function circlesOverlap(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const r = a.radius + b.radius;
  return dx * dx + dy * dy < r * r;
}

/** Current combo multiplier from the combo count. */
export function comboMultiplier(combo) {
  return 1 + Math.min(combo, 40) * COMBO.perKill;
}
