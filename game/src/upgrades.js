// Level-up upgrades: eleven choices, each with tiers. A card shows the name, a
// short description, its effect, and tier pips (filled = owned, empty = remaining).
// Applying one mutates the player's stats; the world asks for three distinct
// choices the player does not already have maxed.

import { PLAYER } from './config.js';

export const UPGRADES = [
  {
    id: 'damage',
    name: 'Overcharge Rounds',
    icon: 'DMG',
    desc: '+25% bullet damage',
    maxTier: 5,
    apply(player) { player.damage *= 1.25; },
  },
  {
    id: 'fireRate',
    name: 'Rapid Cycler',
    icon: 'RPM',
    desc: '+18% fire rate',
    maxTier: 5,
    apply(player) { player.fireInterval *= 0.85; },
  },
  {
    id: 'multishot',
    name: 'Split Cannon',
    icon: 'x2',
    desc: '+1 bullet per shot',
    maxTier: 3,
    apply(player) { player.multishot += 1; },
  },
  {
    id: 'pierce',
    name: 'Lance Rounds',
    icon: 'PIERCE',
    desc: 'Bullets pierce +1 enemy',
    maxTier: 3,
    apply(player) { player.pierce += 1; },
  },
  {
    id: 'bulletSpeed',
    name: 'Railgun Coils',
    icon: 'VEL',
    desc: '+20% bullet speed',
    maxTier: 3,
    apply(player) { player.bulletSpeed *= 1.2; },
  },
  {
    id: 'moveSpeed',
    name: 'Ion Thrusters',
    icon: 'SPD',
    desc: '+12% move speed',
    maxTier: 4,
    apply(player) { player.speed *= 1.12; },
  },
  {
    id: 'maxHp',
    name: 'Hull Plating',
    icon: 'HP',
    desc: '+25 max HP and heal 25',
    maxTier: 5,
    apply(player) {
      player.maxHp += 25;
      player.hp = Math.min(player.maxHp, player.hp + 25);
    },
  },
  {
    id: 'magnet',
    name: 'Tractor Web',
    icon: 'MAG',
    desc: '+40% shard magnet radius',
    maxTier: 4,
    apply(player) { player.magnetRadius *= 1.4; },
  },
  {
    id: 'dash',
    name: 'Blink Drive',
    icon: 'DASH',
    desc: 'Dash recharges 25% faster',
    maxTier: 3,
    apply(player) { player.dashCooldown *= 0.75; },
  },
  {
    id: 'crit',
    name: 'Weak-Point Optics',
    icon: 'CRIT',
    desc: '+8% critical chance (2x dmg)',
    maxTier: 4,
    apply(player) { player.critChance += 0.08; },
  },
  {
    id: 'nova',
    name: 'Nova Pulse',
    icon: 'NOVA',
    desc: 'Radial burst every 8s (upgrades: faster, stronger)',
    maxTier: 3,
    apply(player) {
      player.novaLevel += 1;
      player.novaInterval = Math.max(4, PLAYER.novaInterval - (player.novaLevel - 1) * 2);
      player.novaDamage = PLAYER.novaDamage + (player.novaLevel - 1) * 15;
      player.novaTimer = Math.min(player.novaTimer, 1.5);
    },
  },
];

/** Find an upgrade definition by id. */
export function upgradeById(id) {
  return UPGRADES.find((upgrade) => upgrade.id === id) || null;
}

/** Current tier of an upgrade on this player (0 = not owned). */
export function upgradeTier(player, id) {
  return player.upgrades[id] || 0;
}

/**
 * Roll three distinct upgrade choices the player can still improve, using the
 * world's seeded RNG. When everything is maxed, offer the repeatable ones.
 */
export function rollChoices(player, random) {
  const available = UPGRADES.filter((upgrade) => upgradeTier(player, upgrade.id) < upgrade.maxTier);
  const pool = available.length >= 3 ? available : UPGRADES.slice();
  const picks = [];
  const bag = pool.slice();
  while (picks.length < 3 && bag.length > 0) {
    const index = Math.floor(random() * bag.length);
    picks.push(bag.splice(index, 1)[0]);
  }
  return picks.map((upgrade) => ({
    id: upgrade.id,
    name: upgrade.name,
    icon: upgrade.icon,
    desc: upgrade.desc,
    tier: upgradeTier(player, upgrade.id),
    maxTier: upgrade.maxTier,
  }));
}

/** Apply a chosen upgrade card to the player and record its tier. */
export function applyUpgrade(player, id) {
  const upgrade = upgradeById(id);
  if (!upgrade) return false;
  if (upgradeTier(player, id) >= upgrade.maxTier) return false;
  upgrade.apply(player);
  player.upgrades[id] = upgradeTier(player, id) + 1;
  return true;
}
