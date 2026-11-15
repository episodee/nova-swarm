// NOVA SWARM — the world: one state object and the step that moves it.
// Waves spawn and clear, the ship moves and dashes, bullets fly, foes die
// and drop shards, XP turns into level-up choices, and the combo chain
// rewards staying aggressive. The renderer only reads this state; the
// audio only hears it through the sfx queue.

import { FOES, PALETTE, TUNE, waveRoster, waveSize } from './config.js';
import { createEnemy, updateEnemy } from './entities.js';
import { moveVector } from './input.js';
import { fireWeapons, updateBullets, updateEnemyBullets, updateNova } from './shots.js';
import { rollOffers, takeOffer, xpNeedFor } from './upgrades.js';

// A fresh world, before any run has started.
export function createWorld(width, height, rng) {
  return {
    width,
    height,
    rng,
    screen: 'title',
    time: 0,
    score: 0,
    kills: 0,
    combo: 0,
    comboTimer: 0,
    wave: 1,
    waveState: 'fighting',
    breatherT: 0,
    xp: 0,
    level: 0,
    xpNeed: xpNeedFor(1),
    pending: 0,
    offer: null,
    upgrades: 0,
    player: freshShip(width / 2, height / 2),
    enemies: [],
    bullets: [],
    ebullets: [],
    shards: [],
    particles: [],
    floaters: [],
    fireT: 0,
    novaT: 0,
    shake: 0,
    boss: null,
    sfx: [],
    best: 0,
    spawnQueue: [],
    spawnT: 0,
  };
}

// The ship as a new run finds it: base stats, no upgrades, full hull.
function freshShip(x, y) {
  return {
    x, y, vx: 0, vy: 0,
    hp: TUNE.shipHp,
    maxHp: TUNE.shipHp,
    radius: TUNE.shipRadius,
    speed: TUNE.shipSpeed,
    damageMul: 1,
    fireInterval: TUNE.fireInterval,
    shots: 1,
    pierce: 0,
    crit: 0,
    magnet: TUNE.magnetRadius,
    dashCooldown: TUNE.dashCooldown,
    nova: 0,
    taken: {},
    invulnT: 0,
    dashT: 0,
    dashCd: 0,
    dashX: 0,
    dashY: 0,
    thrust: 0,
  };
}

// Wipe the run and start wave 1 with a fresh ship in the middle.
export function startRun(state) {
  const ship = freshShip(state.width / 2, state.height / 2);
  state.player = ship;
  state.enemies = [];
  state.bullets = [];
  state.ebullets = [];
  state.shards = [];
  state.particles = [];
  state.floaters = [];
  state.time = 0;
  state.score = 0;
  state.kills = 0;
  state.combo = 0;
  state.comboTimer = 0;
  state.wave = 1;
  state.waveState = 'fighting';
  state.breatherT = 0;
  state.xp = 0;
  state.level = 0;
  state.xpNeed = xpNeedFor(1);
  state.pending = 0;
  state.offer = null;
  state.upgrades = 0;
  state.fireT = 0;
  state.novaT = 0;
  state.shake = 0;
  state.boss = null;
  state.sfx = [];
  state.spawnQueue = [];
  state.spawnT = 0;
  state.screen = 'play';
  fillWave(state);
}

// Queue a wave's foes: the roster for the wave, plus the boss and its
// escorts on every fifth wave. They trickle in from the edges.
function fillWave(state) {
  const queue = [];
  const roster = waveRoster(state.wave);
  const count = waveSize(state.wave);
  for (let i = 0; i < count; i++) queue.push(state.rng.pick(roster));
  if (state.wave % TUNE.bossWaveEvery === 0) {
    queue.push('boss');
    for (let i = 0; i < TUNE.bossEscorts; i++) queue.push(state.rng.pick(roster));
  }
  // Shuffle so the wave never arrives in a predictable order.
  for (let i = queue.length - 1; i > 0; i--) {
    const j = Math.floor(state.rng.next() * (i + 1));
    [queue[i], queue[j]] = [queue[j], queue[i]];
  }
  state.spawnQueue = queue;
  state.spawnT = 0;
  state.waveState = 'fighting';
}

// A spawn point on a random edge, kept away from the ship.
function edgePoint(state) {
  const m = 34;
  const ship = state.player;
  for (let tries = 0; tries < 8; tries++) {
    const side = state.rng.int(0, 3);
    let x;
    let y;
    if (side === 0) { x = state.rng.range(m, state.width - m); y = m; }
    else if (side === 1) { x = state.rng.range(m, state.width - m); y = state.height - m; }
    else if (side === 2) { x = m; y = state.rng.range(m, state.height - m); }
    else { x = state.width - m; y = state.rng.range(m, state.height - m); }
    if (Math.hypot(x - ship.x, y - ship.y) > 280) return { x, y };
  }
  return { x: m, y: m };
}

function spawnOne(state, type) {
  const at = edgePoint(state);
  const foe = createEnemy(type, at.x, at.y, state.wave, state.rng);
  state.enemies.push(foe);
  if (type === 'boss') {
    state.boss = foe;
    state.sfx.push('boss');
  }
  return foe;
}

// ---- the ship ---------------------------------------------------------

function moveShip(state, input, dt) {
  const ship = state.player;
  const mv = moveVector(input);
  ship.thrust = mv.x !== 0 || mv.y !== 0 ? 1 : 0;
  if (ship.dashT > 0) {
    // Mid-dash: locked onto the dash direction, untouchable.
    ship.dashT -= dt;
    ship.vx = ship.dashX * TUNE.dashSpeed;
    ship.vy = ship.dashY * TUNE.dashSpeed;
  } else {
    ship.vx = mv.x * ship.speed;
    ship.vy = mv.y * ship.speed;
  }
  ship.x += ship.vx * dt;
  ship.y += ship.vy * dt;
  if (ship.x < ship.radius) ship.x = ship.radius;
  if (ship.x > state.width - ship.radius) ship.x = state.width - ship.radius;
  if (ship.y < ship.radius) ship.y = ship.radius;
  if (ship.y > state.height - ship.radius) ship.y = state.height - ship.radius;
  if (ship.dashCd > 0) ship.dashCd -= dt;
  if (ship.invulnT > 0) ship.invulnT -= dt;
}

// Space or either Shift starts a dash in the direction of travel (or of
// the aim, when the ship is standing still).
export function tryDash(state, input) {
  const ship = state.player;
  if (ship.dashCd > 0 || ship.dashT > 0) return;
  const mv = moveVector(input);
  let dx = mv.x;
  let dy = mv.y;
  if (dx === 0 && dy === 0) {
    const aim = Math.atan2(input.mouse.y - ship.y, input.mouse.x - ship.x);
    dx = Math.cos(aim);
    dy = Math.sin(aim);
  }
  const len = Math.hypot(dx, dy) || 1;
  ship.dashX = dx / len;
  ship.dashY = dy / len;
  ship.dashT = TUNE.dashTime;
  ship.dashCd = ship.dashCooldown;
  ship.invulnT = Math.max(ship.invulnT, TUNE.dashTime + 0.08);
  state.sfx.push('dash');
  for (let i = 0; i < 6; i++) {
    state.particles.push({
      kind: 'spark', x: ship.x, y: ship.y,
      vx: -ship.dashX * 120 + state.rng.range(-40, 40),
      vy: -ship.dashY * 120 + state.rng.range(-40, 40),
      life: 0.3, maxLife: 0.3, size: 2, color: PALETTE.player,
    });
  }
}

// ---- damage, death, score ---------------------------------------------

export function damagePlayer(state, amount) {
  const ship = state.player;
  if (ship.invulnT > 0 || ship.dashT > 0 || state.screen !== 'play') return;
  ship.hp -= amount;
  ship.invulnT = TUNE.hurtInvuln;
  state.shake = Math.max(state.shake, 0.5);
  state.sfx.push('hurt');
  burst(state, ship.x, ship.y, PALETTE.danger, 8);
  if (ship.hp <= 0) killPlayer(state);
}

function killPlayer(state) {
  const ship = state.player;
  ship.hp = 0;
  state.screen = 'over';
  state.sfx.push('explode');
  burst(state, ship.x, ship.y, PALETTE.player, 26);
  burst(state, ship.x, ship.y, '#ffffff', 12);
  state.shake = 1;
  if (state.score > state.best) {
    state.best = state.score;
    try {
      window.localStorage.setItem('nova-swarm-best', String(state.best));
    } catch {
      // A blocked storage is not a reason to fail the run.
    }
  }
}

// What one dead foe is worth, and what it leaves behind.
function killEnemy(state, foe) {
  state.kills += 1;
  if (state.comboTimer > 0) state.combo = Math.min(state.combo + 1, TUNE.comboCap);
  else state.combo = 1;
  state.comboTimer = TUNE.comboWindow;
  const mult = 1 + (state.combo - 1) * 0.25;
  const gained = Math.round(foe.score * mult);
  state.score += gained;
  state.floaters.push({
    x: foe.x, y: foe.y - 10, text: `+${gained}`,
    life: 0.9, maxLife: 0.9, color: state.combo >= 4 ? PALETTE.gold : PALETTE.text,
  });
  burst(state, foe.x, foe.y, foe.color, foe.type === 'boss' ? 30 : 10);
  state.sfx.push('explode');
  const dropChance = foe.type === 'mini' ? 0.3 : TUNE.shardDropChance;
  if (state.rng.chance(dropChance)) {
    state.shards.push({
      x: foe.x, y: foe.y,
      vx: state.rng.range(-30, 30), vy: state.rng.range(-30, 30),
      value: TUNE.shardValue, life: TUNE.shardLife, t: 0,
    });
  }
  if (foe.type === 'splitter') {
    for (let i = 0; i < 2; i++) {
      const mini = createEnemy('mini', foe.x + state.rng.range(-14, 14), foe.y + state.rng.range(-14, 14), state.wave, state.rng);
      state.enemies.push(mini);
    }
  }
  if (foe.type === 'boss') {
    state.boss = null;
    state.shake = 1;
  }
}

function burst(state, x, y, color, count) {
  for (let i = 0; i < count; i++) {
    const angle = state.rng.next() * Math.PI * 2;
    const speed = state.rng.range(40, 220);
    state.particles.push({
      kind: 'spark', x, y,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      life: state.rng.range(0.25, 0.6), maxLife: 0.6, size: state.rng.range(1.5, 3.5), color,
    });
  }
}

// ---- experience ---------------------------------------------------------

export function addXp(state, amount) {
  state.xp += amount;
  while (state.xp >= state.xpNeed) {
    state.xp -= state.xpNeed;
    state.level += 1;
    state.pending += 1;
    state.xpNeed = xpNeedFor(state.level + 1);
  }
  if (state.pending > 0 && state.screen === 'play') {
    state.screen = 'levelup';
    state.offer = rollOffers(state.rng, state.player);
    state.sfx.push('levelup');
  }
}

// Pick the card at `slot` of the current offer. When choices remain, a
// fresh set is rolled; when they run out, the run resumes.
export function pickCard(state, slot) {
  const def = takeOffer(state, slot);
  if (!def) return;
  state.pending -= 1;
  state.sfx.push('pickup');
  if (state.pending > 0) {
    state.offer = rollOffers(state.rng, state.player);
  } else {
    state.offer = null;
    state.screen = 'play';
  }
}

// ---- the step -----------------------------------------------------------

export function updateWorld(state, input, dt) {
  state.time += dt;
  if (state.comboTimer > 0) {
    state.comboTimer -= dt;
    if (state.comboTimer <= 0) state.combo = 0;
  }
  if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 2.2);

  moveShip(state, input, dt);
  fireWeapons(state, input, dt);
  updateNova(state, dt);
  updateBullets(state, dt);
  updateEnemyBullets(state, dt, damagePlayer);

  // Trickle the wave in from the edges.
  if (state.spawnQueue.length > 0) {
    state.spawnT -= dt;
    if (state.spawnT <= 0) {
      state.spawnT = 0.35;
      spawnOne(state, state.spawnQueue.shift());
    }
  }

  const ctx = {
    player: state.player,
    rng: state.rng,
    time: state.time,
    width: state.width,
    height: state.height,
    sfx: state.sfx,
    spawnEnemy: (type, x, y) => {
      state.enemies.push(createEnemy(type, x, y, state.wave, state.rng));
    },
    fireBullet: (x, y, vx, vy) => {
      state.ebullets.push({ x, y, vx, vy, radius: 6, damage: 8, life: 6 });
    },
    enemyCount: () => state.enemies.length,
  };
  for (const foe of state.enemies) updateEnemy(foe, ctx, dt);

  // Sweep the dead: score them, then drop them from the list.
  for (let i = state.enemies.length - 1; i >= 0; i--) {
    if (!state.enemies[i].dead) continue;
    const foe = state.enemies[i];
    state.enemies.splice(i, 1);
    killEnemy(state, foe);
  }

  // Touching a foe hurts. The foe is shoved off so it cannot sit on you.
  const ship = state.player;
  for (const foe of state.enemies) {
    const dx = ship.x - foe.x;
    const dy = ship.y - foe.y;
    const reach = ship.radius + foe.radius;
    if (dx * dx + dy * dy > reach * reach) continue;
    const dist = Math.hypot(dx, dy) || 1;
    foe.x -= (dx / dist) * 18;
    foe.y -= (dy / dist) * 18;
    damagePlayer(state, foe.damage);
    if (state.screen !== 'play') break;
  }

  // Shards drift to the ship when close, and are eaten on contact.
  for (let i = state.shards.length - 1; i >= 0; i--) {
    const s = state.shards[i];
    s.t += dt;
    s.life -= dt;
    const dx = ship.x - s.x;
    const dy = ship.y - s.y;
    const dist = Math.hypot(dx, dy) || 1;
    if (dist < ship.magnet) {
      const pull = 420 * (1 - dist / (ship.magnet + 1));
      s.vx += (dx / dist) * pull * dt * 4;
      s.vy += (dy / dist) * pull * dt * 4;
    }
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.vx *= 0.94;
    s.vy *= 0.94;
    if (dist < TUNE.pickupRadius) {
      state.shards.splice(i, 1);
      state.sfx.push('pickup');
      addXp(state, s.value);
      continue;
    }
    if (s.life <= 0) state.shards.splice(i, 1);
  }

  // A cleared wave breathes, then the next one arrives.
  if (state.waveState === 'fighting'
    && state.enemies.length === 0
    && state.spawnQueue.length === 0) {
    state.waveState = 'breather';
    state.breatherT = TUNE.breather;
  }
  if (state.waveState === 'breather') {
    state.breatherT -= dt;
    if (state.breatherT <= 0) {
      state.wave += 1;
      fillWave(state);
    }
  }

  // Particles and floating score text fade out on their own.
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.life -= dt;
    if (p.kind === 'spark') {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy *= 0.96;
    }
    if (p.life <= 0) state.particles.splice(i, 1);
  }
  if (state.particles.length > 220) state.particles.splice(0, state.particles.length - 220);
  for (let i = state.floaters.length - 1; i >= 0; i--) {
    const f = state.floaters[i];
    f.life -= dt;
    f.y -= 34 * dt;
    if (f.life <= 0) state.floaters.splice(i, 1);
  }
}

// What the tests and the HUD read: one flat snapshot of the run.
export function novaSnapshot(state) {
  return {
    screen: state.screen,
    time: Math.round(state.time * 10) / 10,
    score: state.score,
    kills: state.kills,
    wave: state.wave,
    enemies: state.enemies.length,
    hp: Math.max(0, Math.ceil(state.player.hp)),
    upgrades: state.upgrades,
    pending: state.pending,
  };
}
