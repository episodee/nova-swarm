// NOVA SWARM — the swarm itself. One factory makes every foe from the
// tuning table, and one update step drives each kind's movement: chasers
// hunt you down, weavers slide sideways as they close in, splitters break
// apart when they die, dashers telegraph and then lunge, and the boss
// keeps its distance and fires rings of bullets.

import { FOES, TUNE } from './config.js';

// A fresh foe of `type` at (x, y). The wave it arrives in is kept so the
// boss and the late waves can hit a little harder.
export function createEnemy(type, x, y, wave, rng) {
  const base = FOES[type];
  const hpScale = 1 + Math.max(0, wave - 5) * 0.06;
  return {
    type,
    x,
    y,
    vx: 0,
    vy: 0,
    hp: Math.round(base.hp * hpScale),
    maxHp: Math.round(base.hp * hpScale),
    radius: base.radius,
    speed: base.speed,
    damage: base.damage,
    score: base.score,
    color: base.color,
    t: 0,
    phase: rng.next() * Math.PI * 2,
    mode: 'cruise',
    modeT: 1.5 + rng.next() * 1.5,
    aimX: 0,
    aimY: 0,
    burstT: 2.0,
    minionT: 5.0,
    flash: 0,
    dead: false,
  };
}

// Steer a foe's velocity toward a desired one, smoothly, so movement
// reads as weighty instead of snapping.
function steer(e, wantX, wantY, dt) {
  const k = Math.min(1, 3.2 * dt);
  e.vx += (wantX - e.vx) * k;
  e.vy += (wantY - e.vy) * k;
}

// One simulation step for one foe. `ctx` carries the player, the arena,
// the rng, and two callbacks the foe uses to affect the world: spawning
// minions and firing enemy bullets.
export function updateEnemy(e, ctx, dt) {
  e.t += dt;
  if (e.flash > 0) e.flash -= dt;
  const dx = ctx.player.x - e.x;
  const dy = ctx.player.y - e.y;
  const dist = Math.hypot(dx, dy) || 1;
  const nx = dx / dist;
  const ny = dy / dist;

  if (e.type === 'weaver') {
    // Closes in while sliding side to side on a sine.
    const wobble = Math.sin(e.t * 3.1 + e.phase) * 95;
    steer(e, nx * e.speed + -ny * wobble, ny * e.speed + nx * wobble, dt);
  } else if (e.type === 'dasher') {
    e.modeT -= dt;
    if (e.mode === 'cruise') {
      steer(e, nx * e.speed, ny * e.speed, dt);
      if (e.modeT <= 0) {
        e.mode = 'aim';
        e.modeT = 0.55;
        e.aimX = ctx.player.x;
        e.aimY = ctx.player.y;
      }
    } else if (e.mode === 'aim') {
      // Telegraph: nearly still, flashing, locked onto where you were.
      steer(e, 0, 0, dt);
      if (e.modeT <= 0) {
        e.mode = 'dash';
        e.modeT = 0.38;
        const adx = e.aimX - e.x;
        const ady = e.aimY - e.y;
        const alen = Math.hypot(adx, ady) || 1;
        e.vx = (adx / alen) * e.speed * 3.4;
        e.vy = (ady / alen) * e.speed * 3.4;
      }
    } else {
      // The lunge itself: keep the dash velocity, then recover.
      if (e.modeT <= 0) {
        e.mode = 'cruise';
        e.modeT = 2.2 + ctx.rng.next() * 1.2;
      }
    }
  } else if (e.type === 'boss') {
    // The Voidborn Prime drifts after you and fires rings of bullets.
    steer(e, nx * e.speed, ny * e.speed, dt);
    e.burstT -= dt;
    if (e.burstT <= 0) {
      e.burstT = TUNE.bossBurstEvery;
      const offset = ctx.rng.next() * Math.PI * 2;
      for (let i = 0; i < TUNE.bossBurstCount; i++) {
        const angle = offset + (i / TUNE.bossBurstCount) * Math.PI * 2;
        ctx.fireBullet(
          e.x + Math.cos(angle) * (e.radius + 6),
          e.y + Math.sin(angle) * (e.radius + 6),
          Math.cos(angle) * TUNE.bossBulletSpeed,
          Math.sin(angle) * TUNE.bossBulletSpeed,
        );
      }
      ctx.sfx.push('boss');
    }
    e.minionT -= dt;
    if (e.minionT <= 0) {
      e.minionT = TUNE.bossMinionEvery;
      if (ctx.enemyCount() < 14) {
        ctx.spawnEnemy('mini', e.x - 30, e.y);
        ctx.spawnEnemy('mini', e.x + 30, e.y);
      }
    }
  } else {
    // Chaser, splitter and mini: a plain, relentless hunt.
    steer(e, nx * e.speed, ny * e.speed, dt);
  }

  e.x += e.vx * dt;
  e.y += e.vy * dt;
  // The arena walls hold every foe inside.
  if (e.x < e.radius) { e.x = e.radius; e.vx = Math.abs(e.vx) * 0.4; }
  if (e.x > ctx.width - e.radius) { e.x = ctx.width - e.radius; e.vx = -Math.abs(e.vx) * 0.4; }
  if (e.y < e.radius) { e.y = e.radius; e.vy = Math.abs(e.vy) * 0.4; }
  if (e.y > ctx.height - e.radius) { e.y = ctx.height - e.radius; e.vy = -Math.abs(e.vy) * 0.4; }
}
