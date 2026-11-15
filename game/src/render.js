// All drawing: the parallax starfield and nebula backdrop, the glowing vector
// ships and enemies, bullets, shards and particles, the HUD, the wave banner,
// and every screen (title, level-up cards, pause, game over). The renderer
// only paints state; it never changes it.

import { FONT, PALETTE } from './config.js';
import { createRandom } from './random.js';
import { comboMultiplier } from './entities.js';
import { enemiesRemaining } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_LEVELUP = 'levelup';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

/** Card geometry, shared with main.js so clicks land on the drawn cards. */
export function getCardRects(w, h) {
  const cardW = Math.min(300, (w - 120) / 3);
  const cardH = Math.min(210, h * 0.42);
  const gap = 20;
  const totalW = cardW * 3 + gap * 2;
  const x0 = (w - totalW) / 2;
  const y = h / 2 - cardH / 2 + 10;
  return [0, 1, 2].map((i) => ({ x: x0 + i * (cardW + gap), y, w: cardW, h: cardH }));
}

/** The title screen's Start button rect, shared with main.js for clicks. */
export function getStartRect(w, h) {
  const bw = 260;
  const bh = 56;
  return { x: (w - bw) / 2, y: h * 0.62, w: bw, h: bh };
}

/** The game-over screen's Restart button rect. */
export function getRestartRect(w, h) {
  const bw = 260;
  const bh = 56;
  return { x: (w - bw) / 2, y: h * 0.78, w: bw, h: bh };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function polygon(ctx, x, y, radius, sides, rotation) {
  ctx.beginPath();
  for (let i = 0; i < sides; i += 1) {
    const angle = rotation + (i / sides) * Math.PI * 2;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let width = 0;
  let height = 0;
  let dpr = 1;
  let stars = [];
  let nebulae = [];

  function buildBackdrop() {
    const random = createRandom(20261116);
    stars = [];
    for (let i = 0; i < 170; i += 1) {
      stars.push({
        fx: random(),
        fy: random(),
        size: 0.6 + random() * 1.8,
        depth: 0.25 + random() * 0.75,
        twinkle: random() * Math.PI * 2,
      });
    }
    nebulae = [];
    const colors = [PALETTE.nebulaViolet, PALETTE.nebulaTeal, PALETTE.nebulaPink];
    for (let i = 0; i < 5; i += 1) {
      nebulae.push({
        fx: random(),
        fy: random(),
        r: 0.22 + random() * 0.22,
        color: colors[i % colors.length],
      });
    }
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildBackdrop();
    return { width, height };
  }

  function drawBackground(state, time) {
    ctx.fillStyle = PALETTE.backdrop;
    ctx.fillRect(0, 0, width, height);
    // Nebulae: big soft radial gradients drifting almost imperceptibly.
    for (const nebula of nebulae) {
      const x = nebula.fx * width + Math.sin(time * 0.05 + nebula.fx * 9) * 12;
      const y = nebula.fy * height + Math.cos(time * 0.04 + nebula.fy * 7) * 10;
      const r = nebula.r * Math.max(width, height);
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
      gradient.addColorStop(0, nebula.color);
      gradient.addColorStop(1, 'rgba(5, 6, 15, 0)');
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = gradient;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
    // Parallax starfield: two depths, slow drift, gentle twinkle.
    for (const star of stars) {
      const x = ((star.fx * width - time * 6 * star.depth) % width + width) % width;
      const y = star.fy * height;
      const alpha = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(time * 1.4 + star.twinkle));
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#dfe9ff';
      ctx.fillRect(x, y, star.size, star.size);
    }
    ctx.globalAlpha = 1;
    // Faint grid for spatial reference.
    ctx.strokeStyle = PALETTE.grid;
    ctx.lineWidth = 1;
    const step = 64;
    ctx.beginPath();
    for (let x = step; x < width; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    for (let y = step; y < height; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();
  }

  function drawShip(player, time) {
    const blink = player.invulnerable > 0 && player.dashTimeLeft <= 0 && Math.floor(time * 14) % 2 === 0;
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.angle);
    ctx.globalAlpha = blink ? 0.35 : 1;
    ctx.shadowColor = PALETTE.player;
    ctx.shadowBlur = 18;
    // Engine thrust flame when moving.
    if (player.thrust > 0) {
      const flame = 12 + Math.sin(time * 30) * 4;
      ctx.fillStyle = '#ff9d3c';
      ctx.beginPath();
      ctx.moveTo(-player.radius + 2, -5);
      ctx.lineTo(-player.radius - flame, 0);
      ctx.lineTo(-player.radius + 2, 5);
      ctx.closePath();
      ctx.fill();
    }
    // The ship: a sleek dart with swept wings.
    ctx.fillStyle = PALETTE.player;
    ctx.beginPath();
    ctx.moveTo(player.radius + 6, 0);
    ctx.lineTo(-player.radius, -11);
    ctx.lineTo(-player.radius + 7, 0);
    ctx.lineTo(-player.radius, 11);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = PALETTE.playerCore;
    ctx.beginPath();
    ctx.arc(2, 0, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Dash cooldown ring around the ship.
    if (player.dashTimer > 0) {
      const frac = 1 - player.dashTimer / player.dashCooldown;
      ctx.save();
      ctx.strokeStyle = 'rgba(125, 249, 255, 0.7)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(player.x, player.y, player.radius + 9, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawEnemy(enemy, time) {
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    const telegraphing = enemy.kind === 'dasher' && enemy.state === 'telegraph';
    const flash = enemy.flash > 0 || telegraphing;
    ctx.shadowColor = enemy.color;
    ctx.shadowBlur = 14;
    ctx.fillStyle = flash ? '#ffffff' : enemy.color;
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.lineWidth = 1.5;
    if (enemy.kind === 'boss') {
      // The boss: a violet ring with a rotating inner star and a bright core.
      ctx.rotate(enemy.angle);
      polygon(ctx, 0, 0, enemy.radius, 8, 0);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#2a0a4d';
      polygon(ctx, 0, 0, enemy.radius * 0.62, 8, Math.PI / 8);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, 9 + Math.sin(time * 6) * 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (enemy.kind === 'dasher') {
      // Chevron: a sharp arrowhead that reads as "about to lunge".
      ctx.rotate(enemy.angle);
      ctx.beginPath();
      ctx.moveTo(enemy.radius + 4, 0);
      ctx.lineTo(-enemy.radius, -enemy.radius);
      ctx.lineTo(-enemy.radius * 0.4, 0);
      ctx.lineTo(-enemy.radius, enemy.radius);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      if (telegraphing) {
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, enemy.radius + 8 + Math.sin(time * 24) * 3, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else {
      ctx.rotate(enemy.angle);
      polygon(ctx, 0, 0, enemy.radius, enemy.sides, 0);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(5, 6, 15, 0.55)';
      polygon(ctx, 0, 0, enemy.radius * 0.45, enemy.sides, 0);
      ctx.fill();
    }
    ctx.restore();
    // Boss HP bar floats above the boss itself.
    if (enemy.kind === 'boss') {
      const bw = 90;
      const frac = Math.max(0, enemy.hp / enemy.maxHp);
      ctx.fillStyle = 'rgba(5, 6, 15, 0.7)';
      ctx.fillRect(enemy.x - bw / 2, enemy.y - enemy.radius - 18, bw, 7);
      ctx.fillStyle = '#b46bff';
      ctx.fillRect(enemy.x - bw / 2, enemy.y - enemy.radius - 18, bw * frac, 7);
    }
  }

  function drawEntities(state, time) {
    // XP shards: spinning diamonds, gold when worth more.
    for (const shard of state.shards) {
      const pulse = 1 + Math.sin(time * 5 + shard.age * 3) * 0.15;
      ctx.save();
      ctx.translate(shard.x, shard.y);
      ctx.rotate(time * 2 + shard.age);
      ctx.shadowColor = shard.value > 1 ? PALETTE.shardGold : PALETTE.shard;
      ctx.shadowBlur = 10;
      ctx.fillStyle = shard.value > 1 ? PALETTE.shardGold : PALETTE.shard;
      const r = shard.radius * pulse;
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(r * 0.7, 0);
      ctx.lineTo(0, r);
      ctx.lineTo(-r * 0.7, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    // Enemy bullets: hot pink orbs with a glow.
    for (const bullet of state.enemyBullets) {
      ctx.save();
      ctx.shadowColor = PALETTE.enemyBullet;
      ctx.shadowBlur = 12;
      ctx.fillStyle = PALETTE.enemyBullet;
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, bullet.radius * 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // Player bullets: bright streaks along their velocity.
    for (const bullet of state.bullets) {
      ctx.save();
      ctx.strokeStyle = bullet.crit ? '#ff9d3c' : PALETTE.bullet;
      ctx.shadowColor = PALETTE.bullet;
      ctx.shadowBlur = 8;
      ctx.lineWidth = bullet.crit ? 4 : 3;
      ctx.lineCap = 'round';
      const len = 14;
      const norm = Math.hypot(bullet.vx, bullet.vy) || 1;
      ctx.beginPath();
      ctx.moveTo(bullet.x - (bullet.vx / norm) * len, bullet.y - (bullet.vy / norm) * len);
      ctx.lineTo(bullet.x, bullet.y);
      ctx.stroke();
      ctx.restore();
    }
    for (const enemy of state.enemies) drawEnemy(enemy, time);
    if (!state.over) drawShip(state.player, time);
    // Particles: sparks and expanding shockwave rings.
    for (const p of state.particles) {
      const frac = Math.max(0, p.life / p.maxLife);
      ctx.save();
      if (p.kind === 'ring') {
        ctx.globalAlpha = frac;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2.5 * frac + 0.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size + (1 - frac) * 46, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.globalAlpha = frac;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * frac + 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    // Floating score text.
    ctx.save();
    ctx.textAlign = 'center';
    for (const f of state.floaters) {
      ctx.globalAlpha = Math.min(1, f.life * 1.6);
      ctx.font = `700 ${f.size}px ${FONT}`;
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.restore();
  }
  function drawBar(x, y, w, h, frac, fill, label, text) {
    ctx.fillStyle = 'rgba(5, 6, 15, 0.7)';
    roundRect(ctx, x, y, w, h, h / 2);
    ctx.fill();
    if (frac > 0) {
      ctx.fillStyle = fill;
      roundRect(ctx, x + 1.5, y + 1.5, Math.max(h - 3, (w - 3) * Math.min(1, frac)), h - 3, (h - 3) / 2);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(238, 244, 255, 0.35)';
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, w, h, h / 2);
    ctx.stroke();
    ctx.fillStyle = PALETTE.text;
    ctx.font = `700 11px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + 8, y + h / 2 + 0.5);
    if (text) {
      ctx.textAlign = 'right';
      ctx.fillText(text, x + w - 8, y + h / 2 + 0.5);
    }
    ctx.textBaseline = 'alphabetic';
  }

  function drawHud(state, best, muted) {
    const player = state.player;
    const u = Math.min(width / 1280, height / 720);
    const pad = 16;
    // Top-left: HP bar, XP bar, level.
    const barW = Math.max(200, 260 * u);
    drawBar(pad, pad, barW, 20, player.hp / player.maxHp, player.hp > 30 ? PALETTE.hpGood : PALETTE.hp, 'HP', `${Math.ceil(player.hp)} / ${player.maxHp}`);
    drawBar(pad, pad + 26, barW, 12, state.xp / state.xpNeed, PALETTE.xp, `LV ${state.level}`, `${state.xp} / ${state.xpNeed} XP`);
    // Dash readiness, bottom-left.
    const dashFrac = 1 - Math.max(0, player.dashTimer) / player.dashCooldown;
    const dashLabel = player.dashTimer <= 0 ? 'DASH READY [SPACE]' : 'DASH…';
    drawBar(pad, height - pad - 18, 190, 16, dashFrac, '#7df9ff', dashLabel, '');
    // Top-centre: wave and enemies remaining; boss bar beneath when active.
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.text;
    ctx.font = `800 ${Math.round(22 * Math.max(u, 0.75))}px ${FONT}`;
    ctx.fillText(`WAVE ${state.wave}`, width / 2, pad + 20);
    ctx.font = `600 13px ${FONT}`;
    ctx.fillStyle = PALETTE.muted;
    const remaining = enemiesRemaining(state);
    ctx.fillText(state.waveState === 'breather' ? 'WAVE CLEAR — BREATHER' : `${remaining} HOSTILE${remaining === 1 ? '' : 'S'} LEFT`, width / 2, pad + 40);
    if (state.boss) {
      const bw = Math.min(420, width * 0.4);
      const frac = Math.max(0, state.boss.hp / state.boss.maxHp);
      ctx.fillStyle = 'rgba(5, 6, 15, 0.7)';
      roundRect(ctx, width / 2 - bw / 2, pad + 50, bw, 14, 7);
      ctx.fill();
      ctx.fillStyle = '#b46bff';
      roundRect(ctx, width / 2 - bw / 2 + 1.5, pad + 51.5, Math.max(11, (bw - 3) * frac), 11, 5.5);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 10px ' + FONT;
      ctx.fillText('VOIDBORN PRIME', width / 2, pad + 60.5);
    }
    // Top-right: score, combo, best.
    ctx.textAlign = 'right';
    ctx.fillStyle = PALETTE.gold;
    ctx.font = `800 ${Math.round(24 * Math.max(u, 0.75))}px ${FONT}`;
    ctx.fillText(`${state.score.toLocaleString('en-US')}`, width - pad, pad + 22);
    ctx.fillStyle = state.combo >= 5 ? '#ff9d3c' : PALETTE.muted;
    ctx.font = '700 14px ' + FONT;
    const mult = comboMultiplier(state.combo);
    ctx.fillText(state.combo >= 2 ? `COMBO x${state.combo}  ·  ${mult.toFixed(2)}x` : 'COMBO —', width - pad, pad + 42);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '600 12px ' + FONT;
    ctx.fillText(`BEST ${Math.max(best, state.score).toLocaleString('en-US')}${muted ? '  ·  MUTED [M]' : ''}`, width - pad, pad + 60);
    // Wave banner across the middle.
    if (state.bannerTimer > 0) {
      const alpha = Math.min(1, state.bannerTimer / 0.6, (2.2 - state.bannerTimer) / 0.3 + 0.4);
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      ctx.textAlign = 'center';
      ctx.shadowColor = '#7df9ff';
      ctx.shadowBlur = 24;
      ctx.fillStyle = '#ffffff';
      ctx.font = `800 ${Math.round(44 * Math.max(u, 0.7))}px ${FONT}`;
      ctx.fillText(state.bannerText, width / 2, height * 0.3);
      ctx.restore();
    }
    // Damage vignette: a red flash at the screen edges.
    if (state.damageFlash > 0) {
      const gradient = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.32, width / 2, height / 2, Math.max(width, height) * 0.72);
      gradient.addColorStop(0, 'rgba(255, 45, 70, 0)');
      gradient.addColorStop(1, `rgba(255, 45, 70, ${Math.min(0.55, state.damageFlash * 0.8)})`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
    }
    // Nova ready hint.
    if (player.novaLevel > 0 && player.novaTimer <= 1.2) {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#b46bff';
      ctx.font = '700 13px ' + FONT;
      ctx.fillText('NOVA PULSE READY', width / 2, height - pad - 8);
    }
  }

  function drawPanel(x, y, w, h) {
    ctx.fillStyle = PALETTE.panel;
    roundRect(ctx, x, y, w, h, 14);
    ctx.fill();
    ctx.strokeStyle = PALETTE.panelBorder;
    ctx.lineWidth = 1.5;
    roundRect(ctx, x, y, w, h, 14);
    ctx.stroke();
  }

  function drawButton(rect, label, hot) {
    ctx.fillStyle = hot ? '#8ff7ff' : '#1de0f2';
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 10);
    ctx.fill();
    ctx.fillStyle = '#04121a';
    ctx.font = '800 20px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2 + 1);
    ctx.textBaseline = 'alphabetic';
  }

  /** A drifting demo swarm behind the title: the game, idling, at a glance. */
  function drawTitleDemo(state, time) {
    const kinds = [
      { color: '#ff4fd8', sides: 3, r: 16 },
      { color: '#38e8ff', sides: 4, r: 14 },
      { color: '#ffb02e', sides: 6, r: 20 },
      { color: '#ff4d4d', sides: 3, r: 14 },
    ];
    const random = createRandom(77);
    const spots = [];
    for (let i = 0; i < 14; i += 1) {
      // Keep the shapes out of the controls band so the text stays readable.
      let fy = random();
      if (fy > 0.42 && fy < 0.54) fy = fy < 0.48 ? 0.38 : 0.58;
      spots.push({ fx: random(), fy, kind: kinds[i % kinds.length], speed: 0.2 + random() * 0.5, phase: random() * 6 });
    }
    for (const spot of spots) {
      const x = ((spot.fx * width + time * 14 * spot.speed) % (width + 80)) - 40;
      const y = spot.fy * height + Math.sin(time * 0.9 + spot.phase) * 26;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(time * 0.4 + spot.phase);
      ctx.globalAlpha = 0.85;
      ctx.shadowColor = spot.kind.color;
      ctx.shadowBlur = 14;
      ctx.fillStyle = spot.kind.color;
      polygon(ctx, 0, 0, spot.kind.r, spot.kind.sides, 0);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawTitle(state, best, time) {
    drawTitleDemo(state, time);
    ctx.save();
    ctx.textAlign = 'center';
    // Logo: big gradient letters with a neon glow.
    const logoSize = Math.round(Math.min(84, width * 0.075));
    const gradient = ctx.createLinearGradient(width / 2 - 320, 0, width / 2 + 320, 0);
    gradient.addColorStop(0, '#7df9ff');
    gradient.addColorStop(0.5, '#ffffff');
    gradient.addColorStop(1, '#b46bff');
    ctx.shadowColor = '#7df9ff';
    ctx.shadowBlur = 30;
    ctx.fillStyle = gradient;
    ctx.font = `800 ${logoSize}px ${FONT}`;
    ctx.fillText('NOVA SWARM', width / 2, height * 0.3);
    ctx.shadowBlur = 0;
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `600 ${Math.round(logoSize * 0.26)}px ${FONT}`;
    ctx.fillText('A NEON ARENA SURVIVAL SHOOTER — SURVIVE THE SWARM, LEVEL UP, SLAY THE VOIDBORN', width / 2, height * 0.3 + logoSize * 0.42);
    // Controls, in one readable row-block.
    ctx.fillStyle = PALETTE.text;
    ctx.font = '600 15px ' + FONT;
    const controls = 'WASD / ARROWS — move      MOUSE — aim      HOLD CLICK — fire      SPACE — dash      P — pause      M — mute';
    ctx.fillText(controls, width / 2, height * 0.48);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '600 14px ' + FONT;
    ctx.fillText('Kill the swarm, collect XP shards, pick upgrades, survive the boss every 5 waves.', width / 2, height * 0.48 + 26);
    drawButton(getStartRect(width, height), '▶  START  [ENTER]', false);
    if (best > 0) {
      ctx.fillStyle = PALETTE.gold;
      ctx.font = '700 16px ' + FONT;
      ctx.fillText(`BEST SCORE  ${best.toLocaleString('en-US')}`, width / 2, height * 0.62 + 84);
    }
    ctx.restore();
  }

  function drawLevelUp(state, time) {
    ctx.fillStyle = 'rgba(3, 4, 12, 0.62)';
    ctx.fillRect(0, 0, width, height);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.shadowColor = '#59f7d2';
    ctx.shadowBlur = 22;
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 40px ' + FONT;
    ctx.fillText(`LEVEL ${state.level} — CHOOSE AN UPGRADE`, width / 2, height * 0.2);
    ctx.shadowBlur = 0;
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '600 15px ' + FONT;
    ctx.fillText('Click a card, or press 1 / 2 / 3', width / 2, height * 0.2 + 28);
    ctx.restore();
    const rects = getCardRects(width, height);
    const choices = state.pendingChoices || [];
    choices.forEach((choice, i) => {
      const rect = rects[i];
      const hover = Math.abs((time * 0.5 + i) % 3) < 0.01;
      drawPanel(rect.x, rect.y, rect.w, rect.h);
      ctx.save();
      ctx.textAlign = 'center';
      // Icon badge.
      ctx.fillStyle = '#12303f';
      ctx.beginPath();
      ctx.arc(rect.x + rect.w / 2, rect.y + 42, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = PALETTE.panelBorder;
      ctx.stroke();
      ctx.fillStyle = '#7df9ff';
      ctx.font = '800 13px ' + FONT;
      ctx.fillText(choice.icon, rect.x + rect.w / 2, rect.y + 47);
      // Name, description, tier pips, key hint.
      ctx.fillStyle = PALETTE.text;
      ctx.font = '800 17px ' + FONT;
      const nameLines = wrapText(choice.name, rect.w - 28, 17);
      nameLines.forEach((line, li) => ctx.fillText(line, rect.x + rect.w / 2, rect.y + 92 + li * 20));
      ctx.fillStyle = PALETTE.muted;
      ctx.font = '600 13px ' + FONT;
      const descLines = wrapText(choice.desc, rect.w - 28, 13);
      descLines.forEach((line, li) => ctx.fillText(line, rect.x + rect.w / 2, rect.y + 92 + nameLines.length * 20 + 6 + li * 17));
      for (let p = 0; p < choice.maxTier; p += 1) {
        ctx.fillStyle = p < choice.tier + 1 ? '#ffd94d' : 'rgba(238,244,255,0.25)';
        ctx.beginPath();
        ctx.arc(rect.x + rect.w / 2 + (p - (choice.maxTier - 1) / 2) * 18, rect.y + rect.h - 34, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = PALETTE.muted;
      ctx.font = '700 12px ' + FONT;
      ctx.fillText(`[${i + 1}]`, rect.x + rect.w / 2, rect.y + rect.h - 12);
      ctx.restore();
      void hover;
    });
  }

  function wrapText(text, maxWidth, fontSize) {
    ctx.font = `600 ${fontSize}px ${FONT}`;
    const words = text.split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  function drawPaused() {
    ctx.fillStyle = 'rgba(3, 4, 12, 0.66)';
    ctx.fillRect(0, 0, width, height);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 44px ' + FONT;
    ctx.fillText('PAUSED', width / 2, height / 2 - 8);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '600 16px ' + FONT;
    ctx.fillText('Press P or Enter to resume', width / 2, height / 2 + 28);
    ctx.restore();
  }

  function drawGameOver(state, best, isNewBest) {
    ctx.fillStyle = 'rgba(3, 4, 12, 0.6)';
    ctx.fillRect(0, 0, width, height);
    const pw = Math.min(560, width * 0.62);
    const ph = Math.min(360, height * 0.78);
    const px = (width - pw) / 2;
    const py = (height - ph) / 2;
    drawPanel(px, py, pw, ph);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.shadowColor = '#ff5d6c';
    ctx.shadowBlur = 24;
    ctx.fillStyle = '#ff5d6c';
    ctx.font = '800 42px ' + FONT;
    ctx.fillText('SIGNAL LOST', width / 2, py + 62);
    ctx.shadowBlur = 0;
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '600 15px ' + FONT;
    ctx.fillText('The swarm got you — but the nova remembers.', width / 2, py + 90);
    // Stats grid.
    const stats = [
      ['SCORE', state.score.toLocaleString('en-US')],
      ['WAVE', String(state.wave)],
      ['KILLS', String(state.kills)],
      ['TIME', formatTime(state.time)],
      ['LEVEL', String(state.level)],
      ['BEST', Math.max(best, state.score).toLocaleString('en-US')],
    ];
    ctx.font = '700 15px ' + FONT;
    stats.forEach((stat, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = px + pw * (0.18 + col * 0.32);
      const y = py + 138 + row * 56;
      ctx.fillStyle = PALETTE.muted;
      ctx.font = '600 12px ' + FONT;
      ctx.fillText(stat[0], x, y);
      ctx.fillStyle = PALETTE.text;
      ctx.font = '800 22px ' + FONT;
      ctx.fillText(stat[1], x, y + 26);
    });
    if (isNewBest) {
      ctx.fillStyle = PALETTE.gold;
      roundRect(ctx, width / 2 - 90, py + 252, 180, 30, 15);
      ctx.fill();
      ctx.fillStyle = '#241a00';
      ctx.font = '800 15px ' + FONT;
      ctx.fillText('★ NEW BEST ★', width / 2, py + 272);
    }
    ctx.restore();
    drawButton(getRestartRect(width, height), '↻  RESTART  [R]', false);
  }

  function formatTime(seconds) {
    const total = Math.floor(seconds);
    const minutes = Math.floor(total / 60);
    const secs = total % 60;
    return `${minutes}:${String(secs).padStart(2, '0')}`;
  }

  /** Paint one frame: background, entities, HUD, then the active screen's overlay. */
  function draw(state, screen, best, options) {
    const opts = options || {};
    const time = opts.time !== undefined ? opts.time : state.time;
    const isNewBest = !!opts.isNewBest;
    const muted = !!opts.muted;
    ctx.save();
    if (state.shake > 0.3 && screen !== SCREEN_TITLE) {
      ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
    }
    drawBackground(state, time);
    if (screen === SCREEN_TITLE) {
      drawTitle(state, best, time);
    } else {
      drawEntities(state, time);
      drawHud(state, best, muted);
      if (screen === SCREEN_LEVELUP) drawLevelUp(state, time);
      else if (screen === SCREEN_PAUSED) drawPaused();
      else if (screen === SCREEN_OVER) drawGameOver(state, best, isNewBest);
    }
    ctx.restore();
  }

  resize();
  return { draw, resize, get width() { return width; }, get height() { return height; } };
}
