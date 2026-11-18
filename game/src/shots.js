import { particle, floater, take, retire } from './pools.js';
// NOVA SWARM — everything that flies: the ship's cannon, the swarm's
// bullets, and the Nova Pulse shockwave. Player bullets are aimed at the
// mouse and can pierce, crit and split; enemy bullets are slow orbs the
// player has to dodge.

import { TUNE } from './config.js';

// Fire the cannon while the mouse button is held. Multishot fans the
// bullets out around the aim; each one rolls its own critical hit.
export function fireWeapons(state, input, dt) {
  const ship = state.player;
  state.fireT -= dt;
  if ((!input.mouse.down && !input.mouse.buffered) || state.fireT > 0) return;
  input.mouse.buffered = false;
  state.fireT = ship.fireInterval;
  state.muzzleT = 0.065;
  const aim = Math.atan2(input.mouse.y - ship.y, input.mouse.x - ship.x);
  const count = ship.shots;
  for (let i = 0; i < count; i++) {
    const off = (i - (count - 1) / 2) * 0.13;
    const angle = aim + off;
    const crit = state.rng.next() < ship.crit;
    const b = take(state.bulletPool, state.bullets);
    if (!b) break;
    b.x = ship.x + Math.cos(angle) * (ship.radius + 6);
    b.y = ship.y + Math.sin(angle) * (ship.radius + 6);
    b.vx = Math.cos(angle) * TUNE.bulletSpeed; b.vy = Math.sin(angle) * TUNE.bulletSpeed;
    b.damage = TUNE.bulletDamage * ship.damageMul * (crit ? 2 : 1);
    b.pierce = ship.pierce; b.crit = crit;
    b.radius = TUNE.bulletRadius + (crit ? 2 : 0); b.life = TUNE.bulletLife;
    b.hitRefs.fill(null); b.hitCount = 0;
  }
  state.sfx.push('shoot');
}

// Move player bullets and resolve their hits. A hit enemy flashes and
// loses health; a dead one is flagged for the world to sweep up (score,
// shards, splitting). A bullet dies when its pierce runs out.
export function updateBullets(state, dt) {
  const list = state.bullets;
  for (let i = list.length - 1; i >= 0; i--) {
    const b = list[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    let spent = b.life <= 0
      || b.x < -20 || b.x > state.width + 20
      || b.y < -20 || b.y > state.height + 20;
    if (!spent) {
      for (const e of state.enemies) {
        if (e.dead || b.hitRefs.includes(e)) continue;
        const dx = e.x - b.x;
        const dy = e.y - b.y;
        const reach = e.radius + b.radius;
        if (dx * dx + dy * dy > reach * reach) continue;
        b.hitRefs[b.hitCount++] = e;
        e.hp -= b.damage;
        if (b.crit) floater(state, e.x, e.y - 18, `CRIT ${Math.round(b.damage)}`, '#ffd75e', true);
        e.flash = 0.09;
        state.sfx.push('hit');
        if (e.hp <= 0) e.dead = true;
        if (b.pierce > 0) {
          b.pierce -= 1;
        } else {
          spent = true;
        }
        break;
      }
    }
    if (spent) retire(state.bulletPool, list, i);
  }
}

// Move the swarm's bullets. One that touches the ship hurts it through
// the damage callback the world hands in (kept separate so this module
// never imports the world back).
export function updateEnemyBullets(state, dt, damagePlayer) {
  const list = state.ebullets;
  const ship = state.player;
  for (let i = list.length - 1; i >= 0; i--) {
    const b = list[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    let gone = b.life <= 0
      || b.x < -30 || b.x > state.width + 30
      || b.y < -30 || b.y > state.height + 30;
    if (!gone) {
      const dx = ship.x - b.x;
      const dy = ship.y - b.y;
      const reach = ship.radius + b.radius;
      if (dx * dx + dy * dy <= reach * reach) {
        damagePlayer(state, b.damage);
        gone = true;
      }
    }
    if (gone) retire(state.ebulletPool, list, i);
  }
}

// The Nova Pulse: while the upgrade is held, a shockwave goes off every
// few seconds and wounds every foe caught inside its ring.
export function updateNova(state, dt) {
  const ship = state.player;
  if (ship.nova <= 0) return;
  state.novaT -= dt;
  if (state.novaT > 0) return;
  state.novaT = Math.max(2.5, 5 - 0.7 * (ship.nova - 1));
  const radius = 260;
  const damage = 6 + 3 * (ship.nova - 1);
  for (const e of state.enemies) {
    if (e.dead) continue;
    const dx = e.x - ship.x;
    const dy = e.y - ship.y;
    if (dx * dx + dy * dy > radius * radius) continue;
    e.hp -= damage;
    e.flash = 0.12;
    if (e.hp <= 0) e.dead = true;
  }
  const p = particle(state, 'ring', ship.x, ship.y, '#5effe0', 0.45);
  if (p) { p.radius = 12; p.max = radius; }
  state.zoomT = 0.24;
  state.shake = Math.max(state.shake, 0.3);
  state.sfx.push('nova');
}
