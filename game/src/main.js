// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), and the renderer
// paints what is there. The game moves between five screens: title, play,
// level-up (a choice of three upgrade cards), paused and game over.
//
// ?seed=N fixes the run. ?shot=start|play|levelup|end (with &seed=N) stages that
// scene instead of running the loop, paints it twice and sets window.__shotReady
// for a screenshot. window.__nova reports live state for playtests, and
// window.__novaDebug exposes a few test hooks (set hp, grant XP) for them.

import { BEST_KEY, LEVELUP_AUTO_PICK_SECONDS, PLAYER, STEP } from './config.js';
import { createRandom } from './random.js';
import { createAudio } from './audio.js';
import {
  ACTION_CHOICE_1,
  ACTION_CHOICE_2,
  ACTION_CHOICE_3,
  ACTION_CONFIRM,
  ACTION_DASH,
  ACTION_MUTE,
  ACTION_PAUSE,
  ACTION_RESTART,
  createInput,
} from './input.js';
import { createWorld, EVENT_LEVELUP, EVENT_OVER, chooseUpgrade } from './world.js';
import {
  createRenderer,
  getCardRects,
  getRestartRect,
  getStartRect,
  SCREEN_LEVELUP,
  SCREEN_OVER,
  SCREEN_PAUSED,
  SCREEN_PLAY,
  SCREEN_TITLE,
} from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const audio = createAudio();
const renderer = createRenderer(canvas);
const world = createWorld(createRandom(seed), renderer.width, renderer.height);
const input = createInput(canvas);

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

/** Live state for playtests and the debug hooks they use. */
const nova = {
  screen: SCREEN_TITLE,
  score: 0,
  wave: 1,
  hp: PLAYER.maxHp,
  level: 1,
  kills: 0,
  enemies: 0,
  time: 0,
  combo: 0,
  upgrades: 0,
  pending: 0,
};
window.__nova = nova;
window.__novaDebug = {
  setHp(value) {
    world.state.player.hp = value;
  },
  addXp(value) {
    world.state.xp += value;
  },
  damage(value) {
    world.state.player.hp -= value;
    world.state.player.invulnerable = 0;
  },
};

function syncNova(screen) {
  const state = world.state;
  nova.screen = screen;
  nova.score = state.score;
  nova.wave = state.wave;
  nova.hp = Math.ceil(state.player.hp);
  nova.level = state.level;
  nova.kills = state.kills;
  nova.enemies = state.enemies.length + state.spawnQueue.length;
  nova.time = Math.round(state.time * 10) / 10;
  nova.combo = state.combo;
  nova.upgrades = Object.keys(state.player.upgrades).length;
  nova.pending = state.pendingChoices ? state.pendingChoices.length : 0;
}

/** Play every sound the last steps queued, then clear the queue. */
function drainSfx() {
  const sounds = world.state.sfx;
  for (const name of sounds) {
    if (name === 'shoot') audio.shoot();
    else if (name === 'hit') audio.hit();
    else if (name === 'explosion') audio.explosion(false);
    else if (name === 'explosionBig') audio.explosion(true);
    else if (name === 'pickup') audio.pickup(world.state.combo);
    else if (name === 'levelUp') audio.levelUp();
    else if (name === 'waveHorn') audio.waveHorn();
    else if (name === 'gameOver') audio.gameOver();
    else if (name === 'dash') audio.dash();
  }
  sounds.length = 0;
}

function runShot(name) {
  const scene = stageShot(name, world);
  syncNova(scene.screen);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, { time: scene.time, isNewBest: scene.screen === SCREEN_OVER });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  let screen = SCREEN_TITLE;
  let best = readBest();
  let isNewBest = false;
  let muted = false;
  let accumulator = 0;
  let last = performance.now();
  let pendingDash = false;
  let levelupTimer = 0;

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    audio.unlock();
    world.reset();
    world.resize(renderer.width, renderer.height);
    accumulator = 0;
    pendingDash = false;
    isNewBest = false;
    screen = SCREEN_PLAY;
    syncNova(screen);
    announce('Playing. Survive the swarm, collect XP shards, level up.');
  }

  function endGame() {
    screen = SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      isNewBest = true;
      saveBest(best);
    }
    syncNova(screen);
    announce(`Game over. Score ${world.state.score}. Wave ${world.state.wave}. Best ${best}. Press R to restart.`);
  }

  function pickCard(index) {
    const choices = world.state.pendingChoices;
    if (!choices || !choices[index]) return;
    audio.unlock();
    chooseUpgrade(world.state, choices[index].id);
    levelupTimer = 0;
    screen = SCREEN_PLAY;
    syncNova(screen);
    announce(`Upgrade picked: ${choices[index].name}. Playing.`);
  }

  function handleClick() {
    const click = input.takeClick();
    if (!click) return;
    audio.unlock();
    if (screen === SCREEN_TITLE) {
      const rect = getStartRect(renderer.width, renderer.height);
      if (click.x >= rect.x && click.x <= rect.x + rect.w && click.y >= rect.y && click.y <= rect.y + rect.h) startGame();
    } else if (screen === SCREEN_OVER) {
      const rect = getRestartRect(renderer.width, renderer.height);
      if (click.x >= rect.x && click.x <= rect.x + rect.w && click.y >= rect.y && click.y <= rect.y + rect.h) startGame();
    } else if (screen === SCREEN_LEVELUP) {
      const rects = getCardRects(renderer.width, renderer.height);
      for (let i = 0; i < rects.length; i += 1) {
        const rect = rects[i];
        if (click.x >= rect.x && click.x <= rect.x + rect.w && click.y >= rect.y && click.y <= rect.y + rect.h) {
          pickCard(i);
          break;
        }
      }
    }
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      muted = audio.setMuted(!muted);
      announce(muted ? 'Muted.' : 'Sound on.');
    }
    if (actions & ACTION_DASH) pendingDash = true;
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONFIRM) startGame();
    } else if (screen === SCREEN_OVER) {
      if (actions & (ACTION_CONFIRM | ACTION_RESTART)) startGame();
    } else if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      } else if (actions & ACTION_RESTART) startGame();
    } else if (screen === SCREEN_LEVELUP) {
      if (actions & ACTION_CHOICE_1) pickCard(0);
      else if (actions & ACTION_CHOICE_2) pickCard(1);
      else if (actions & ACTION_CHOICE_3) pickCard(2);
    } else if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      }
    }
  }

  function step() {
    const dir = input.direction();
    const aim = input.aim();
    const events = world.step(STEP, {
      mx: dir.x,
      my: dir.y,
      aimX: aim.x,
      aimY: aim.y,
      firing: input.firing(),
      dash: pendingDash,
    });
    pendingDash = false;
    drainSfx();
    if (events & EVENT_OVER) endGame();
    else if (events & EVENT_LEVELUP) {
      screen = SCREEN_LEVELUP;
      levelupTimer = 0;
      announce(`Level ${world.state.level}. Choose an upgrade.`);
    }
    syncNova(screen);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dtFrame = Math.min((now - last) / 1000, MAX_FRAME);
    accumulator += dtFrame;
    last = now;
    handleClick();
    handleActions();
    audio.updateMusic(STEP, screen === SCREEN_PLAY);
    if (screen === SCREEN_PLAY) {
      while (accumulator >= STEP && screen === SCREEN_PLAY) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    // The level-up choice waits for the player, but not forever.
    if (screen === SCREEN_LEVELUP) {
      levelupTimer += dtFrame;
      if (levelupTimer > LEVELUP_AUTO_PICK_SECONDS) pickCard(0);
    }
    renderer.draw(world.state, screen, best, { muted, isNewBest });
    syncNova(screen);
  }

  window.addEventListener('resize', () => {
    const size = renderer.resize();
    world.resize(size.width, size.height);
  });

  // Leaving the tab pauses a running game rather than letting the swarm feed unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Nova Swarm. Press Enter or click Start to play.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
