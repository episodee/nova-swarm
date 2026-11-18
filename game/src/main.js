// NOVA SWARM — the entry point. Boots the world, runs the fixed-step
// loop, flips between the title, play, pause, level-up and game-over
// screens, and exposes the two hooks the tests use: window.__nova (a
// live snapshot) and window.__novaDebug (addXp / setHp). It also honours
// the ?seed= and ?shot= URL parameters the tools rely on.

import { UPGRADES } from './upgrades.js';
import { updateFeedback } from './feedback.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';
import { createRng, hashSeed } from './random.js';
import { createRenderer } from './render.js';
import {
  addXp,
  createWorld,
  damagePlayer,
  novaSnapshot,
  pickCard,
  startRun,
  tryDash,
  updateWorld,
  spawnOne,
} from './world.js';

const STEP = 1 / 60;
const MAX_STEPS = 5;

function boot() {
  const canvas = document.getElementById('game');
  const params = new URLSearchParams(window.location.search);
  const seedParam = params.get('seed');
  const shotParam = params.get('shot');
  const rng = createRng(
    seedParam !== null ? hashSeed(seedParam) : (shotParam !== null ? hashSeed('nova-shot-1337') : Date.now() % 2147483647),
  );

  const audio = createAudio();
  const input = createInput(canvas);
  const renderer = createRenderer(canvas);
  const state = createWorld(window.innerWidth, window.innerHeight, rng);
  try {
    state.reduceMotion = window.localStorage.getItem('nova-reduce-motion') === '1';
    const saved = window.localStorage.getItem('nova-swarm-best');
    state.best = saved === null ? 0 : Math.max(0, parseInt(saved, 10) || 0);
  } catch {
    state.best = 0;
  }

  function fitCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    state.width = canvas.width;
    state.height = canvas.height;
    renderer.resize(canvas.width, canvas.height);
    const ship = state.player;
    ship.x = Math.min(Math.max(ship.x, ship.radius), state.width - ship.radius);
    ship.y = Math.min(Math.max(ship.y, ship.radius), state.height - ship.radius);
  }
  fitCanvas();
  window.addEventListener('resize', fitCanvas);

  // The live snapshot the tests read.
  window.__nova = novaSnapshot(state);
  window.__novaDebug = {
    addXp(n) {
      addXp(state, n);
      refreshNova();
    },
    setHp(n) {
      const ship = state.player;
      ship.hp = Math.max(0, n);
      ship.invulnT = 0;
      ship.dashT = 0;
      if (ship.hp <= 0 && state.screen === 'play') damagePlayer(state, 1);
      refreshNova();
    },
  };

  function refreshNova() {
    novaSnapshot(state, window.__nova);
  }

  function toggleMute() {
    audio.setMuted(!audio.isMuted());
  }

  // One frame's worth of one-shot keys, by screen.
  function handleKeys() {
    if (input.takePressed('KeyG')) {
      state.reduceMotion = !state.reduceMotion;
      try { localStorage.setItem('nova-reduce-motion', state.reduceMotion ? '1' : '0'); } catch {}
    }
    if (input.takePressed('KeyM')) toggleMute();
    if (state.screen === 'title') {
      if (input.takePressed('Enter')) {
        audio.unlock();
        audio.startMusic();
        state.demo = false;
        startRun(state);
      }
    } else if (state.screen === 'play') {
      if (input.takePressed('KeyP') || input.takePressed('Escape')) {
        state.screen = 'paused';
      } else if (input.takePressed('Space') || input.takePressed('ShiftLeft') || input.takePressed('ShiftRight')) {
        tryDash(state, input);
      }
    } else if (state.screen === 'paused') {
      if (input.takePressed('KeyP') || input.takePressed('Escape') || input.takePressed('Enter')) {
        state.screen = 'play';
      }
    } else if (state.screen === 'levelup') {
      if (input.takePressed('Digit1')) pickCard(state, 0);
      else if (input.takePressed('Digit2')) pickCard(state, 1);
      else if (input.takePressed('Digit3')) pickCard(state, 2);
    } else if (state.screen === 'over') {
      if (input.takePressed('KeyR') || input.takePressed('Enter')) {
        audio.unlock();
        startRun(state);
      }
    }
  }

  // Drain the sound queue the sim filled during its steps.
  function drainSfx() {
    for (const name of state.sfx) {
      const fn = audio[name];
      if (typeof fn === 'function') fn.call(audio);
    }
    state.sfx.length = 0;
  }

  let last = performance.now();
  let acc = 0;
  function frame(now) {
    const realDt = Math.max(0, (now - last) / 1000);
    const dt = Math.min(0.1, realDt);
    last = now;
    updateFeedback(state, realDt);
    // During a stop keep one-shot movement input buffered until simulation resumes.
    if (state.timeScale !== 0) handleKeys();
    if (state.screen === 'title') {
      demoStep(dt);
    }
    if (state.screen === 'play') {
      acc += dt * state.timeScale;
      let steps = 0;
      while (acc >= STEP && steps < MAX_STEPS) {
        updateWorld(state, input, STEP);
        acc -= STEP;
        steps += 1;
        if (state.timeScale === 0) { acc = 0; break; }
        if (state.screen !== 'play') break;
      }
      if (steps === MAX_STEPS) acc = 0;
    }
    drainSfx();
    renderer.draw(state, state.screen === 'title' ? pilot : input, audio.isMuted());
    refreshNova();
    if (state.timeScale !== 0) input.endFrame();
    window.requestAnimationFrame(frame);
  }

  // A fake input that plays the game by itself: it aims at the nearest
  // foe, holds the trigger down, and strolls in a slow circle. The shot
  // poses fast-forward with it so their screenshots show a real game.
  const pilot = {
    held: new Set(), mouse: { x: 0, y: 0, down: true },
    isDown(code) { return this.held.has(code); }, takePressed() { return false; },
  };
  function autopilot(step) {
    let target = null;
    let best = Infinity;
    for (const e of state.enemies) {
      const d = (e.x - state.player.x) ** 2 + (e.y - state.player.y) ** 2;
      if (d < best) {
        best = d;
        target = e;
      }
    }
    const aimX = target ? target.x : state.player.x + 120;
    const aimY = target ? target.y : state.player.y;
    const a = step * 0.02;
    const held = pilot.held;
    held.clear();
    if (Math.cos(a) > 0.3) held.add('KeyD');
    else if (Math.cos(a) < -0.3) held.add('KeyA');
    if (Math.sin(a) > 0.3) held.add('KeyS');
    else if (Math.sin(a) < -0.3) held.add('KeyW');
    pilot.mouse.x = aimX; pilot.mouse.y = aimY;
    return pilot;
  }
  let demoTick = 0;
  function demoStep(dt) {
    if (state.timeScale === 0) return;
    state.demo = true;
    state.screen = 'play';
    updateWorld(state, autopilot(demoTick++), dt);
    while (state.screen === 'levelup') pickCard(state, 0);
    if (state.screen === 'over') startRun(state);
    state.screen = 'title';
  }

  // Step the sim `seconds` worth with the autopilot, resolving level-ups
  // and restarts as they come up, so the pose lands in a lively state.
  function fastForward(seconds) {
    const steps = Math.round(seconds * 60);
    for (let i = 0; i < steps; i++) {
      if (state.screen === 'levelup') {
        while (state.screen === 'levelup') pickCard(state, 0);
        continue;
      }
      if (state.screen === 'over') {
        startRun(state);
        continue;
      }
      state.player.hp = state.player.maxHp;
      updateFeedback(state, STEP);
      updateWorld(state, autopilot(i), STEP);
      state.sfx.length = 0;
    }
    while (state.screen === 'levelup') pickCard(state, 0);
    if (state.screen === 'over') startRun(state);
  }

  function stageSwarm() {
    while (state.enemies.length < 16) spawnOne(state, state.rng.pick(['chaser', 'weaver', 'splitter', 'dasher']));
    state.player.shots = Math.max(state.player.shots, 3);
    state.player.crit = Math.max(state.player.crit, 0.3);
    fastForward(1.3);
    // Finish on a genuine impact with a simultaneous volley in flight.
    for (let i = 0; i < 90; i++) {
      state.player.hp = state.player.maxHp;
      while (state.screen === 'levelup') pickCard(state, 0);
      updateFeedback(state, STEP); updateWorld(state, autopilot(i), STEP);
      if (state.particles.length >= 10 && state.bullets.length >= 3 && state.enemies.length >= 12) break;
    }
  }

  // The ?shot= poses the screenshot tool asks for.
  function setupShotPose(pose) {
    if (pose === 'start') {
      startRun(state);
      fastForward(8);
      stageSwarm();
      state.screen = 'title';
      renderer.draw(state, pilot, false);
      refreshNova();
      window.__shotReady = true;
      return;
    }
    audio.unlock();
    startRun(state);
    if (pose === 'play') {
      fastForward(20);
      stageSwarm();
    } else if (pose === 'levelup') {
      fastForward(6);
      stageSwarm();
      addXp(state, 200);
      // Include the longest description as a visual wrapping regression.
      state.offer = [UPGRADES.find(d => d.id === 'nova'), ...state.offer.filter(d => d.id !== 'nova')].slice(0, 3);
    } else if (pose === 'boss') {
      let framed = false;
      for (let i = 0; i < 36000 && !(state.wave >= 5 && state.boss && state.ebullets.length >= 10); i++) {
        state.player.hp = state.player.maxHp;
        while (state.screen === 'levelup') pickCard(state, 0);
        if (state.screen === 'over') throw new Error('Boss staging failed');
        updateFeedback(state, STEP);
        const controls = autopilot(i);
        if (state.boss) {
          if (!framed) {
            state.boss.x = state.width * 0.64; state.boss.y = state.height * 0.51;
            state.player.x = state.width * 0.37; state.player.y = state.height * 0.57;
            framed = true;
          }
          controls.held.clear();
        }
        updateWorld(state, controls, STEP);
        state.sfx.length = 0;
      }
      if (!state.boss || state.ebullets.length < 10) throw new Error('Boss ring missing');
      // Let the first ring expand visibly, with real escorts from the edges.
      for (let i = 0; i < 24; i++) {
        state.player.hp = state.player.maxHp;
        while (state.screen === 'levelup') pickCard(state, 0);
        updateFeedback(state, STEP);
        const controls = autopilot(i); controls.held.clear();
        updateWorld(state, controls, STEP);
      }
    } else if (pose === 'end') {
      fastForward(14);
      state.player.invulnT = 0;
      state.player.dashT = 0;
      state.player.hp = 1;
      damagePlayer(state, 999);
    }
    state.player.invulnT = 0;
    renderer.draw(state, pilot, false);
    refreshNova();
    window.__shotReady = true;
  }

  if (shotParam !== null) setupShotPose(shotParam);
  else { startRun(state); state.demo = true; state.screen = 'title'; window.requestAnimationFrame(frame); }
}

boot();
