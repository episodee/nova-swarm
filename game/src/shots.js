// The screenshot scenes behind ?shot=start|play|levelup|end. Each one plays the
// real rules forward from a fresh world for a fixed number of steps, steered by
// an autopilot, so the frame is what a real game looks like and the same seed
// always gives the same frame. The play pilot hunts, kites and dashes; the end
// pilot drifts in slow circles with a bad aim, so it genuinely loses.

import { STEP } from './config.js';
import { EVENT_LEVELUP, EVENT_OVER, chooseUpgrade } from './world.js';
import { rollChoices } from './upgrades.js';
import { SCREEN_LEVELUP, SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const PLAY_SECONDS = 34;
const LEVELUP_LIMIT_SECONDS = 150;
const END_LIMIT_SECONDS = 300;

/** The nearest enemy to the player, or null when the field is empty. */
function nearestEnemy(state) {
  let best = null;
  let bestDist = Infinity;
  for (const enemy of state.enemies) {
    const dist = Math.hypot(enemy.x - state.player.x, enemy.y - state.player.y);
    if (dist < bestDist) {
      bestDist = dist;
      best = enemy;
    }
  }
  return best ? { enemy: best, dist: bestDist } : null;
}

/** The nearest XP shard, or null when there is none. */
function nearestShard(state) {
  let best = null;
  let bestDist = Infinity;
  for (const shard of state.shards) {
    const dist = Math.hypot(shard.x - state.player.x, shard.y - state.player.y);
    if (dist < bestDist) {
      bestDist = dist;
      best = shard;
    }
  }
  return best ? { shard: best, dist: bestDist } : null;
}

/**
 * The strong pilot: keep ~200px from the nearest enemy (close in when far,
 * back off when crowded), drift toward shards when safe, aim ahead of the
 * target, fire always, and dash when something gets too close.
 * `options` can blunt it for a pose: `aimError` radians of aim wander,
 * `maxFireDist` (only fire inside it), `fireDuty` (fraction of steps firing).
 */
export function strongPilotInput(state, options) {
  const opts = options || {};
  const player = state.player;
  const target = nearestEnemy(state);
  let mx = 0;
  let my = 0;
  let aimX = player.x;
  let aimY = player.y - 100;
  let dash = false;
  let firing = true;
  if (target) {
    const { enemy, dist } = target;
    const dx = enemy.x - player.x;
    const dy = enemy.y - player.y;
    const nx = dx / (dist || 1);
    const ny = dy / (dist || 1);
    if (dist > 260) {
      mx = nx;
      my = ny;
    } else if (dist < 150) {
      mx = -nx;
      my = -ny;
      dash = dist < 70;
    } else {
      // Strafe around the target, keeping the range.
      mx = -ny * 0.8;
      my = nx * 0.8;
    }
    // Lead the target slightly.
    aimX = enemy.x + enemy.vx * 0.18;
    aimY = enemy.y + enemy.vy * 0.18;
    if (opts.aimError) {
      aimX += Math.sin(state.time * 7) * 60 * opts.aimError * 10;
      aimY += Math.cos(state.time * 5) * 60 * opts.aimError * 10;
    }
    if (opts.maxFireDist && dist > opts.maxFireDist) firing = false;
    if (opts.fireDuty && Math.sin(state.time * 11) < 1 - opts.fireDuty * 2) firing = false;
    // If no enemy is near and a shard is close, swing by for it.
    const shard = nearestShard(state);
    if (shard && shard.dist < 160 && dist > 200) {
      mx = (shard.shard.x - player.x) / shard.dist;
      my = (shard.shard.y - player.y) / shard.dist;
    }
  } else {
    const shard = nearestShard(state);
    if (shard) {
      mx = (shard.shard.x - player.x) / (shard.dist || 1);
      my = (shard.shard.y - player.y) / (shard.dist || 1);
    } else {
      // Drift to the middle of the field while waiting for the next wave.
      const cx = state.fieldW / 2 - player.x;
      const cy = state.fieldH / 2 - player.y;
      const dist = Math.hypot(cx, cy) || 1;
      if (dist > 40) {
        mx = cx / dist;
        my = cy / dist;
      }
    }
  }
  // Soft pull toward the middle when hugging an edge, so the pilot (and the
  // screenshot) keeps the action in frame instead of camping a corner.
  const margin = 90;
  if (player.x < margin) mx += 0.6;
  if (player.x > state.fieldW - margin) mx -= 0.6;
  if (player.y < margin) my += 0.6;
  if (player.y > state.fieldH - margin) my -= 0.6;
  const len2 = Math.hypot(mx, my) || 1;
  return { mx: mx / len2, my: my / len2, aimX, aimY, firing, dash };
}

/**
 * The weak pilot: drifts slowly in a small circle — slower than a chaser, so
 * the swarm catches it — aims nearly a radian off target, never dashes: a
 * hurried player who gets caught out as the waves grow.
 */
export function weakPilotInput(state) {
  const player = state.player;
  const angle = state.time * 0.45;
  let mx = Math.cos(angle) * 0.25;
  let my = Math.sin(angle) * 0.25;
  const target = nearestEnemy(state);
  if (target && target.dist < 110) {
    // Panic-freeze when something gets close: the swarm closes in.
    mx = 0;
    my = 0;
  }
  let aimX = player.x + Math.cos(angle + 1.4) * 200;
  let aimY = player.y + Math.sin(angle + 1.4) * 200;
  if (target) {
    const { enemy } = target;
    const trueAngle = Math.atan2(enemy.y - player.y, enemy.x - player.x);
    const badAngle = trueAngle + 0.85;
    aimX = player.x + Math.cos(badAngle) * 220;
    aimY = player.y + Math.sin(badAngle) * 220;
  }
  return { mx, my, aimX, aimY, firing: true, dash: false };
}

/**
 * The casual pilot: like the strong one, but it only fires at closer range
 * and its aim wanders, so kills come slower and more of the swarm is still
 * alive when a level-up lands — the level-up scene stays mid-combat.
 */
export function casualPilotInput(state) {
  const input = strongPilotInput(state);
  const target = nearestEnemy(state);
  if (target && target.dist > 420) input.firing = false;
  input.aimX += 26;
  input.aimY -= 18;
  input.dash = false;
  return input;
}

/** The dodge-only pilot: no firing, keep away from the nearest enemy, dash out of trouble. */
export function dodgePilotInput(state) {
  const player = state.player;
  const target = nearestEnemy(state);
  let mx = 0;
  let my = 0;
  let dash = false;
  if (target) {
    const { enemy, dist } = target;
    const nx = (player.x - enemy.x) / (dist || 1);
    const ny = (player.y - enemy.y) / (dist || 1);
    mx = nx;
    my = ny;
    dash = dist < 80;
  }
  return { mx, my, aimX: player.x, aimY: player.y - 100, firing: false, dash };
}

/** Apply the first pending upgrade card, so a staged run keeps playing. */
function autoPickUpgrade(state) {
  if (state.pendingChoices && state.pendingChoices.length > 0) {
    chooseUpgrade(state, state.pendingChoices[0].id);
  }
}

function runSteps(world, seconds, pilot, autoPick) {
  const state = world.state;
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const events = world.step(STEP, pilot(state));
    if (autoPick && state.pendingChoices) autoPickUpgrade(state);
    if (events & EVENT_OVER) return true;
  }
  return state.over;
}

/**
 * Set `world` to the named scene (start, play, levelup or end; any other name
 * is start) and return the screen to draw over it, the best score to show and
 * the demo time to render with.
 */
export function stageShot(name, world) {
  world.reset();
  const state = world.state;
  if (name !== 'play' && name !== 'levelup' && name !== 'end') {
    return { screen: SCREEN_TITLE, best: 0, time: 6 };
  }
  if (name === 'play') {
    // Play until the fight is busy: at least 24 s in, with enemies on screen.
    const state2 = state;
    let steps = 0;
    const maxSteps = Math.floor(60 / STEP);
    // A blunted pilot: it kills slower than the swarm spawns, so the frame
    // catches a busy mid-wave fight instead of an empty breather.
    const posePilot = (s) => strongPilotInput(s, { aimError: 0.06, maxFireDist: 420, fireDuty: 0.7 });
    while (steps < maxSteps) {
      world.step(STEP, posePilot(state2));
      steps += 1;
      if (state2.pendingChoices) autoPickUpgrade(state2);
      if (state2.over) break;
      if (state2.time >= 20 && state2.enemies.length >= 6) break;
    }
    const over = state.over;
    return { screen: over ? SCREEN_OVER : SCREEN_PLAY, best: state.score, time: state.time };
  }
  if (name === 'levelup') {
    // Play casually until a level-up card screen appears, mid-combat.
    const steps = Math.floor(LEVELUP_LIMIT_SECONDS / STEP);
    for (let i = 0; i < steps; i += 1) {
      world.step(STEP, casualPilotInput(state));
      if (state.pendingChoices) break;
      if (state.over) break;
    }
    // Let the swarm close in behind the cards so the scene reads as mid-combat.
    if (state.pendingChoices && !state.over) {
      for (let i = 0; i < Math.floor(10 / STEP); i += 1) {
        if (state.enemies.length >= 6 || state.player.hp <= 50) break;
        world.step(STEP, dodgePilotInput(state));
        if (state.over) break;
      }
    }
    if (state.pendingChoices) return { screen: SCREEN_LEVELUP, best: state.score, time: state.time };
    if (state.over) return { screen: SCREEN_OVER, best: state.score, time: state.time };
    // Fallback: stage the cards directly so the scene always shows the choice.
    state.pendingChoices = rollChoices(state.player, state.random);
    return { screen: SCREEN_LEVELUP, best: state.score, time: state.time };
  }
  // end: the weak pilot plays until the swarm gets it.
  runSteps(world, END_LIMIT_SECONDS, weakPilotInput, true);
  return { screen: state.over ? SCREEN_OVER : SCREEN_PLAY, best: state.score, time: state.time };
}
