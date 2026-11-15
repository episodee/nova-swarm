// NOVA SWARM — the level-up system. Kills drop XP shards; enough XP earns
// a level, and each level offers a choice of three upgrade cards. Every
// upgrade can stack a few times, so a run builds a different ship each time.

import { TUNE } from './config.js';

// XP needed to gain `level` (1-based): 60, then 70, 80, 90, ...
export function xpNeedFor(level) {
  return TUNE.xpNeed(level);
}

// One row per upgrade: what it is called, what it promises, how far it
// stacks, and what it does to the ship when taken.
export const UPGRADES = [
  {
    id: 'damage',
    name: 'Heavy Rounds',
    desc: '+25% bullet damage',
    max: 5,
    apply(ship) {
      ship.damageMul *= 1.25;
    },
  },
  {
    id: 'firerate',
    name: 'Rapid Cycler',
    desc: 'Fire 12% faster',
    max: 5,
    apply(ship) {
      ship.fireInterval *= 0.88;
    },
  },
  {
    id: 'multishot',
    name: 'Split Cannon',
    desc: '+1 projectile per shot',
    max: 3,
    apply(ship) {
      ship.shots += 1;
    },
  },
  {
    id: 'piercing',
    name: 'Lance Rounds',
    desc: 'Bullets pierce +1 foe',
    max: 3,
    apply(ship) {
      ship.pierce += 1;
    },
  },
  {
    id: 'crit',
    name: 'Deadeye Core',
    desc: '+10% critical chance (crits hit double)',
    max: 5,
    apply(ship) {
      ship.crit += 0.1;
    },
  },
  {
    id: 'magnet',
    name: 'Tractor Field',
    desc: '+60% shard magnet radius',
    max: 4,
    apply(ship) {
      ship.magnet *= 1.6;
    },
  },
  {
    id: 'dash',
    name: 'Overdrive Dash',
    desc: 'Dash recharges 25% faster',
    max: 3,
    apply(ship) {
      ship.dashCooldown *= 0.75;
    },
  },
  {
    id: 'hull',
    name: 'Ablative Hull',
    desc: '+25 max hull, restore 25 hull now',
    max: 4,
    apply(ship) {
      ship.maxHp += 25;
      ship.hp = Math.min(ship.maxHp, ship.hp + 25);
    },
  },
  {
    id: 'nova',
    name: 'Nova Pulse',
    desc: 'A shockwave blasts nearby foes every few seconds',
    max: 3,
    apply(ship) {
      ship.nova += 1;
    },
  },
];

export function upgradeById(id) {
  return UPGRADES.find((u) => u.id === id) ?? null;
}

// How many stacks of `id` the ship already carries (0 when none).
export function stacksOf(ship, id) {
  return ship.taken[id] ?? 0;
}

// Roll three distinct cards. Upgrades already at their cap are left out
// when anything else is still available; with nothing left, any three do.
export function rollOffers(rng, ship) {
  const open = UPGRADES.filter((u) => stacksOf(ship, u.id) < u.max);
  const pool = open.length >= 3 ? open : UPGRADES;
  const picked = [];
  const copy = pool.slice();
  while (picked.length < 3 && copy.length > 0) {
    const i = Math.floor(rng.next() * copy.length);
    picked.push(copy.splice(i, 1)[0]);
  }
  while (picked.length < 3) picked.push(rng.pick(UPGRADES));
  return picked;
}

// Take the card at `slot` of the current offer: apply it, count it, and
// hand back the upgrade so the caller can announce it.
export function takeOffer(state, slot) {
  const offer = state.offer;
  if (!offer || slot < 0 || slot >= offer.length) return null;
  const def = offer[slot];
  def.apply(state.player);
  state.player.taken[def.id] = stacksOf(state.player, def.id) + 1;
  state.upgrades += 1;
  return def;
}
