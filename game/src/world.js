// The world: waves, spawning, XP and levels, combo and score, win/lose state,
// and the fixed-step update that moves everything. The renderer only paints
// this state; it never changes it. All randomness comes from the seeded RNG
// the world was created with.

import { COMBO, ENEMY_BULLET, PLAYER, STEP, WAVES, XP } from './config.js';
import {
  burstParticles,
  circlesOverlap,
  comboMultiplier,
  createBullet,
  createEnemy,
  createEnemyBullet,
  createFloater,
  createParticle,
  createPlayer,
  createShard,
  spawnPoint,
  splitMinis,
  updateEnemy,
  waveComposition,
} from './entities.js';
import { applyUpgrade, rollChoices } from './upgrades.js';

export const EVENT_NONE = 0;
export const EVENT_HIT = 1;
export const EVENT_OVER = 2;
export const EVENT_LEVELUP = 4;
export const EVENT_WAVECLEAR = 8;
export const EVENT_BOSS = 16;

/** A fresh world for a field of (fieldW, fieldH), driven by `random`. */
export function createWorld(random, fieldW, fieldH) {
  const world = {
    random,
    state: null,
  };
  world.state = freshState(random, fieldW, fieldH);
  world.reset = function reset() {
    world.state = freshState(random, fieldW, fieldH);
  };
  world.resize = function resize(w, h) {
    fieldW = w;
    fieldH = h;
    const state = world.state;
    state.fieldW = w;
    state.fieldH = h;
    state.player.x = Math.min(Math.max(state.player.x, 20), w - 20);
    state.player.y = Math.min(Math.max(state.player.y, 20), h - 20);
  };
  world.step = function step(dt, input) {
    return stepWorld(world.state, dt, input, random);
  };
  return world;
}

function freshState(random, fieldW, fieldH) {
  const state = {
    fieldW,
    fieldH,
    time: 0,
    random,
    player: createPlayer(fieldW, fieldH),
    bullets: [],
    enemyBullets: [],
    enemies: [],
    shards: [],
    particles: [],
    floaters: [],
    score: 0,
    wave: 1,
    kills: 0,
    combo: 0,
    comboTimer: 0,
    level: 1,
    xp: 0,
    xpNeed: XP.need(1),
    waveState: 'fighting',
    spawnQueue: [],
    spawnTimer: 0.5,
    breatherTimer: 0,
    bannerTimer: 2.2,
    bannerText: 'WAVE 1',
    boss: null,
    shake: 0,
    damageFlash: 0,
    /** Three upgrade cards waiting to be picked, or null. */
    pendingChoices: null,
    /** Sound names queued this step; main drains and plays them. */
    sfx: [],
    over: false,
  };
  // Wave 1's queue starts full; without this the first step would read an empty
  // wave as already cleared and hand out the clear bonus for free.
  startWave(state, 1, random);
  return state;
}

/** Build the spawn queue for a wave: a boss wave is the boss plus an escort. */
export function startWave(state, wave, random) {
  state.wave = wave;
  state.spawnQueue = [];
  if (wave % WAVES.bossEvery === 0) {
    state.spawnQueue.push('boss');
    const escort = 3 + Math.floor(wave / 2);
    for (let i = 0; i < escort; i += 1) state.spawnQueue.push('chaser');
  } else {
    const count = WAVES.baseCount + WAVES.perWave * (wave - 1);
    for (let i = 0; i < count; i += 1) state.spawnQueue.push(waveComposition(wave, random));
  }
  state.spawnTimer = 0.4;
  state.waveState = 'fighting';
  state.bannerTimer = 2.2;
  state.bannerText = wave % WAVES.bossEvery === 0 ? `WAVE ${wave} — VOIDBORN PRIME` : `WAVE ${wave}`;
  state.sfx.push('waveHorn');
  if (wave % WAVES.bossEvery === 0) state.sfx.push('boss');
}

function spawnOne(state, random) {
  const kind = state.spawnQueue.shift();
  if (!kind) return;
  const point = spawnPoint(state.fieldW, state.fieldH, state.player, random);
  const enemy = createEnemy(kind, point.x, point.y, state.wave);
  state.enemies.push(enemy);
  if (kind === 'boss') state.boss = enemy;
  burstParticles(state.particles, point.x, point.y, enemy.color, 8, random, 140);
}

function damagePlayer(state, amount) {
  const player = state.player;
  if (player.invulnerable > 0 || player.dashTimeLeft > 0 || state.over) return false;
  player.hp -= amount;
  player.invulnerable = PLAYER.invulnerable;
  state.shake = Math.min(12, state.shake + 7);
  state.damageFlash = 0.55;
  state.sfx.push('hit');
  burstParticles(state.particles, player.x, player.y, '#ff5d6c', 10, state.random, 200);
  if (player.hp <= 0) {
    player.hp = 0;
    state.over = true;
    burstParticles(state.particles, player.x, player.y, '#7df9ff', 40, state.random, 380);
    state.particles.push(createParticle(player.x, player.y, 0, 0, 0.8, 10, '#7df9ff', 'ring'));
    state.sfx.push('explosionBig');
    state.sfx.push('gameOver');
  }
  return true;
}

function killEnemy(state, enemy, index, random) {
  state.enemies.splice(index, 1);
  const mult = comboMultiplier(state.combo);
  const gained = Math.round(enemy.score * mult);
  state.score += gained;
  state.kills += 1;
  state.combo += 1;
  state.comboTimer = COMBO.window;
  state.floaters.push(createFloater(enemy.x, enemy.y - 10, `+${gained}`, mult > 1.2 ? '#ffd94d' : '#eef4ff', mult > 1.2 ? 17 : 14));
  burstParticles(state.particles, enemy.x, enemy.y, enemy.color, enemy.kind === 'boss' ? 46 : 16, random, enemy.kind === 'boss' ? 420 : 280);
  state.sfx.push(enemy.kind === 'boss' ? 'explosionBig' : 'explosion');
  state.shake = Math.min(10, state.shake + (enemy.kind === 'boss' ? 9 : 2));
  // XP shards: one per xp point, gold for the boss's share.
  let remaining = enemy.xp;
  if (enemy.kind === 'boss') {
    for (let i = 0; i < 2; i += 1) {
      state.shards.push(createShard(enemy.x, enemy.y, XP.bossShardValue, random));
      remaining -= XP.bossShardValue;
    }
  }
  while (remaining > 0) {
    state.shards.push(createShard(enemy.x, enemy.y, XP.shardValue, random));
    remaining -= 1;
  }
  if (enemy.kind === 'splitter') {
    const minis = splitMinis(enemy, state.wave, random);
    state.enemies.push(...minis);
  }
  if (enemy.kind === 'boss') state.boss = null;
}

function firePlayerBullets(state, input, random) {
  const player = state.player;
  const count = player.multishot;
  const spreadStep = 0.11;
  for (let i = 0; i < count; i += 1) {
    const offsetIndex = i - (count - 1) / 2;
    const crit = random() < player.critChance;
    const damage = player.damage * (crit ? PLAYER.critMultiplier : 1);
    state.bullets.push(createBullet(player, input.aimX, input.aimY, offsetIndex * spreadStep, damage, crit));
  }
  state.sfx.push('shoot');
}

function fireNova(state) {
  const player = state.player;
  const count = PLAYER.novaBullets + (player.novaLevel - 1) * 4;
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2;
    state.bullets.push({
      x: player.x + Math.cos(angle) * (player.radius + 6),
      y: player.y + Math.sin(angle) * (player.radius + 6),
      vx: Math.cos(angle) * player.bulletSpeed * 0.8,
      vy: Math.sin(angle) * player.bulletSpeed * 0.8,
      radius: 6,
      damage: player.novaDamage,
      pierce: 1,
      crit: false,
      life: 0.9,
    });
  }
  state.particles.push(createParticle(player.x, player.y, 0, 0, 0.5, 12, '#b46bff', 'ring'));
  state.sfx.push('explosion');
  player.novaTimer = player.novaInterval;
}

/** One fixed step of the live game. Returns an EVENT_* bitmask. */
function stepWorld(state, dt, input, random) {
  let events = EVENT_NONE;
  state.random = random;
  state.time += dt;
  const player = state.player;

  if (state.over) {
    updateParticles(state, dt);
    updateFloaters(state, dt);
    return EVENT_OVER;
  }

  // --- Player movement, dash and aim ---
  if (player.dashTimeLeft > 0) {
    player.dashTimeLeft -= dt;
    player.x += player.dashX * (PLAYER.dashDistance / PLAYER.dashTime) * dt;
    player.y += player.dashY * (PLAYER.dashDistance / PLAYER.dashTime) * dt;
    if (player.dashTimeLeft <= 0) player.dashTimeLeft = 0;
  } else {
    player.x += input.mx * player.speed * dt;
    player.y += input.my * player.speed * dt;
    player.thrust = Math.hypot(input.mx, input.my) > 0.1 ? 1 : 0;
  }
  player.x = Math.min(Math.max(player.x, player.radius), state.fieldW - player.radius);
  player.y = Math.min(Math.max(player.y, player.radius), state.fieldH - player.radius);
  player.angle = Math.atan2(input.aimY - player.y, input.aimX - player.x);
  if (player.invulnerable > 0) player.invulnerable -= dt;
  if (player.dashTimer > 0) player.dashTimer -= dt;
  if (input.dash && player.dashTimer <= 0 && Math.hypot(input.mx, input.my) > 0.1) {
    const len = Math.hypot(input.mx, input.my) || 1;
    player.dashX = input.mx / len;
    player.dashY = input.my / len;
    player.dashTimeLeft = PLAYER.dashTime;
    player.dashTimer = player.dashCooldown;
    player.invulnerable = Math.max(player.invulnerable, PLAYER.dashTime + 0.05);
    state.sfx.push('dash');
    burstParticles(state.particles, player.x, player.y, '#7df9ff', 6, random, 160);
  }

  // --- Firing and the nova pulse ---
  player.fireTimer -= dt;
  if (input.firing && player.fireTimer <= 0) {
    player.fireTimer = player.fireInterval;
    firePlayerBullets(state, input, random);
  }
  if (player.novaLevel > 0) {
    player.novaTimer -= dt;
    if (player.novaTimer <= 0) fireNova(state);
  }

  // --- Wave spawning ---
  if (state.waveState === 'fighting') {
    if (state.spawnQueue.length > 0) {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) {
        spawnOne(state, random);
        const interval = Math.max(
          WAVES.spawnIntervalMin,
          WAVES.spawnInterval - (state.wave - 1) * WAVES.spawnIntervalPerWave,
        );
        state.spawnTimer = interval;
      }
    } else if (state.enemies.length === 0) {
      const bonus = WAVES.waveClearBonus + state.wave * 25;
      state.score += bonus;
      state.floaters.push(createFloater(state.fieldW / 2, state.fieldH / 2 - 40, `WAVE CLEAR +${bonus}`, '#ffd94d', 22));
      events |= EVENT_WAVECLEAR;
      state.waveState = 'breather';
      state.breatherTimer = WAVES.breather;
      state.bannerTimer = WAVES.breather;
      state.bannerText = `WAVE ${state.wave} CLEAR`;
    }
  } else if (state.waveState === 'breather') {
    state.breatherTimer -= dt;
    if (state.breatherTimer <= 0) startWave(state, state.wave + 1, random);
  }
  if (state.bannerTimer > 0) state.bannerTimer -= dt;

  // --- Enemies ---
  for (let i = 0; i < state.enemies.length; i += 1) {
    const enemy = state.enemies[i];
    const fired = updateEnemy(enemy, dt, player, state, random);
    state.enemyBullets.push(...fired);
  }

  // --- Player bullets vs enemies ---
  for (let b = state.bullets.length - 1; b >= 0; b -= 1) {
    const bullet = state.bullets[b];
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.life -= dt;
    let dead = bullet.life <= 0 || bullet.x < -30 || bullet.x > state.fieldW + 30 || bullet.y < -30 || bullet.y > state.fieldH + 30;
    if (!dead) {
      for (let e = state.enemies.length - 1; e >= 0; e -= 1) {
        const enemy = state.enemies[e];
        if (!circlesOverlap(bullet, enemy)) continue;
        enemy.hp -= bullet.damage;
        enemy.flash = 0.09;
        burstParticles(state.particles, bullet.x, bullet.y, '#ffe95e', 3, random, 120);
        if (enemy.hp <= 0) {
          killEnemy(state, enemy, e, random);
        }
        if (bullet.pierce > 0) {
          bullet.pierce -= 1;
        } else {
          dead = true;
        }
        break;
      }
    }
    if (dead) state.bullets.splice(b, 1);
  }

  // --- Enemy bullets vs player ---
  for (let b = state.enemyBullets.length - 1; b >= 0; b -= 1) {
    const bullet = state.enemyBullets[b];
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.life -= dt;
    let dead = bullet.life <= 0 || bullet.x < -30 || bullet.x > state.fieldW + 30 || bullet.y < -30 || bullet.y > state.fieldH + 30;
    if (!dead && circlesOverlap(bullet, player)) {
      if (damagePlayer(state, bullet.damage)) events |= EVENT_HIT;
      dead = true;
    }
    if (dead) state.enemyBullets.splice(b, 1);
  }

  // --- Enemies vs player (contact) ---
  for (let e = 0; e < state.enemies.length; e += 1) {
    const enemy = state.enemies[e];
    if (circlesOverlap(enemy, player)) {
      const damage = enemy.kind === 'boss' ? 20 : PLAYER.contactDamage;
      if (damagePlayer(state, damage)) events |= EVENT_HIT;
      // Shove the enemy back so one touch is not a pin.
      const dx = enemy.x - player.x;
      const dy = enemy.y - player.y;
      const dist = Math.hypot(dx, dy) || 1;
      enemy.x = player.x + (dx / dist) * (player.radius + enemy.radius + 4);
      enemy.y = player.y + (dy / dist) * (player.radius + enemy.radius + 4);
      break;
    }
  }
  if (state.over) return events | EVENT_OVER;

  // --- XP shards: drift, magnet, collect ---
  for (let s = state.shards.length - 1; s >= 0; s -= 1) {
    const shard = state.shards[s];
    shard.age += dt;
    const dx = player.x - shard.x;
    const dy = player.y - shard.y;
    const dist = Math.hypot(dx, dy) || 1;
    if (dist < player.magnetRadius) {
      shard.vx += (dx / dist) * XP.magnetAccel * dt;
      shard.vy += (dy / dist) * XP.magnetAccel * dt;
    } else {
      shard.vx *= 1 - 2.4 * dt;
      shard.vy *= 1 - 2.4 * dt;
    }
    shard.x += shard.vx * dt;
    shard.y += shard.vy * dt;
    if (dist < XP.collectRadius) {
      state.xp += shard.value;
      state.sfx.push('pickup');
      burstParticles(state.particles, shard.x, shard.y, shard.value > 1 ? '#ffd94d' : '#59f7d2', 3, random, 90);
      state.shards.splice(s, 1);
    }
  }

  // --- Combo decay ---
  if (state.comboTimer > 0) {
    state.comboTimer -= dt;
    if (state.comboTimer <= 0) state.combo = 0;
  }

  // --- Level-ups (may chain when a big haul lands at once) ---
  while (state.xp >= state.xpNeed) {
    state.xp -= state.xpNeed;
    state.level += 1;
    state.xpNeed = XP.need(state.level);
    state.pendingChoices = rollChoices(player, random);
    state.sfx.push('levelUp');
    events |= EVENT_LEVELUP;
    break; // One card screen at a time; the rest waits for the next pickup.
  }

  if (state.shake > 0) state.shake = Math.max(0, state.shake - 30 * dt);
  if (state.damageFlash > 0) state.damageFlash -= dt;
  updateParticles(state, dt);
  updateFloaters(state, dt);
  return events;
}

/** Apply a picked upgrade card; clears the pending choices. */
export function chooseUpgrade(state, choiceId) {
  if (!state.pendingChoices) return false;
  const ok = applyUpgrade(state.player, choiceId);
  if (ok) state.pendingChoices = null;
  return ok;
}

function updateParticles(state, dt) {
  for (let i = state.particles.length - 1; i >= 0; i -= 1) {
    const p = state.particles[i];
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 1 - 1.6 * dt;
    p.vy *= 1 - 1.6 * dt;
    if (p.life <= 0) state.particles.splice(i, 1);
  }
}

function updateFloaters(state, dt) {
  for (let i = state.floaters.length - 1; i >= 0; i -= 1) {
    const f = state.floaters[i];
    f.life -= dt;
    f.y -= 34 * dt;
    if (f.life <= 0) state.floaters.splice(i, 1);
  }
}

/** Enemies still to kill this wave, counting the ones queued to spawn. */
export function enemiesRemaining(state) {
  return state.enemies.length + state.spawnQueue.length;
}

export { STEP };
