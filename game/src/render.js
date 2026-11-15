// NOVA SWARM — the renderer. Canvas 2D, no libraries, no shadowBlur
// (software rendering chokes on it): glow comes from small pre-rendered
// radial sprites, and everything else is plain paths and text. The world,
// the HUD and the menus are drawn in that order, every frame.

import { PALETTE } from './config.js';
import { mulberry32 } from './random.js';

// One glow sprite per colour, drawn once and reused: a soft radial disc.
const glowCache = new Map();
function glowSprite(color) {
  let sprite = glowCache.get(color);
  if (sprite) return sprite;
  sprite = document.createElement('canvas');
  sprite.width = 64;
  sprite.height = 64;
  const g = sprite.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, color);
  grad.addColorStop(0.35, color + '55');
  grad.addColorStop(1, color + '00');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  glowCache.set(color, sprite);
  return sprite;
}

function blitGlow(ctx, color, x, y, size, alpha) {
  const sprite = glowSprite(color);
  ctx.globalAlpha = alpha;
  ctx.drawImage(sprite, x - size / 2, y - size / 2, size, size);
  ctx.globalAlpha = 1;
}

// A polygon from a list of [x, y] points, filled with one colour.
function poly(ctx, points, fill) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function circle(ctx, x, y, r, fill) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

// The starfield: fixed positions from a seed, so the sky never shimmers
// between frames. Each star has its own slow twinkle phase.
function makeStars(width, height) {
  const next = mulberry32(1337);
  const stars = [];
  for (let i = 0; i < 110; i++) {
    stars.push({
      x: next() * width,
      y: next() * height,
      r: 0.6 + next() * 1.6,
      phase: next() * Math.PI * 2,
      speed: 0.4 + next() * 1.1,
    });
  }
  return stars;
}

function drawBackground(ctx, state, stars, time) {
  ctx.fillStyle = PALETTE.background;
  ctx.fillRect(0, 0, state.width, state.height);
  ctx.strokeStyle = PALETTE.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 32; x < state.width; x += 64) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, state.height);
  }
  for (let y = 32; y < state.height; y += 64) {
    ctx.moveTo(0, y);
    ctx.lineTo(state.width, y);
  }
  ctx.stroke();
  for (const s of stars) {
    const a = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(time * s.speed + s.phase));
    ctx.globalAlpha = a;
    circle(ctx, s.x, s.y, s.r, PALETTE.star);
  }
  ctx.globalAlpha = 1;
}

function drawShards(ctx, state) {
  for (const s of state.shards) {
    const blink = s.life < 3 ? (Math.sin(s.t * 14) > 0 ? 1 : 0.35) : 1;
    ctx.globalAlpha = blink;
    blitGlow(ctx, PALETTE.shard, s.x, s.y, 26, 0.55);
    poly(ctx, [
      [s.x, s.y - 6],
      [s.x + 4.5, s.y],
      [s.x, s.y + 6],
      [s.x - 4.5, s.y],
    ], PALETTE.shard);
    ctx.globalAlpha = 1;
  }
}

function drawEnemy(ctx, e, state) {
  blitGlow(ctx, e.color, e.x, e.y, e.radius * 3.4, 0.5);
  const aim = Math.atan2(state.player.y - e.y, state.player.x - e.x);
  const flashing = e.type === 'dasher' && e.mode === 'aim' && Math.sin(e.t * 30) > 0;
  const body = flashing ? '#ffffff' : e.color;
  const r = e.radius;
  if (e.type === 'chaser') {
    const pts = [];
    for (let i = 0; i < 3; i++) {
      const a = aim + (i / 3) * Math.PI * 2;
      pts.push([e.x + Math.cos(a) * r, e.y + Math.sin(a) * r]);
    }
    poly(ctx, pts, body);
  } else if (e.type === 'weaver') {
    poly(ctx, [
      [e.x + Math.cos(aim) * r, e.y + Math.sin(aim) * r],
      [e.x + Math.cos(aim + Math.PI / 2) * r * 0.7, e.y + Math.sin(aim + Math.PI / 2) * r * 0.7],
      [e.x - Math.cos(aim) * r, e.y - Math.sin(aim) * r],
      [e.x - Math.cos(aim + Math.PI / 2) * r * 0.7, e.y - Math.sin(aim + Math.PI / 2) * r * 0.7],
    ], body);
  } else if (e.type === 'splitter' || e.type === 'boss') {
    const sides = e.type === 'boss' ? 8 : 6;
    const rot = e.t * (e.type === 'boss' ? 0.5 : 0.8);
    const pts = [];
    for (let i = 0; i < sides; i++) {
      const a = rot + (i / sides) * Math.PI * 2;
      pts.push([e.x + Math.cos(a) * r, e.y + Math.sin(a) * r]);
    }
    poly(ctx, pts, body);
    if (e.type === 'boss') {
      ctx.strokeStyle = '#ffffff';
      ctx.globalAlpha = 0.65;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(e.x, e.y, r + 10, e.t * 0.9, e.t * 0.9 + Math.PI * 1.5);
      ctx.stroke();
      ctx.globalAlpha = 1;
      circle(ctx, e.x, e.y, r * 0.42, '#2a1650');
      circle(ctx, e.x, e.y, r * 0.2, body);
    }
  } else if (e.type === 'dasher') {
    poly(ctx, [
      [e.x + Math.cos(aim) * r * 1.25, e.y + Math.sin(aim) * r * 1.25],
      [e.x + Math.cos(aim + 2.5) * r, e.y + Math.sin(aim + 2.5) * r],
      [e.x - Math.cos(aim) * r * 0.5, e.y - Math.sin(aim) * r * 0.5],
      [e.x + Math.cos(aim - 2.5) * r, e.y + Math.sin(aim - 2.5) * r],
    ], body);
  } else {
    // Mini: a small, fast triangle.
    const pts = [];
    for (let i = 0; i < 3; i++) {
      const a = aim + (i / 3) * Math.PI * 2;
      pts.push([e.x + Math.cos(a) * r, e.y + Math.sin(a) * r]);
    }
    poly(ctx, pts, body);
  }
  // A white flash for a split second after a hit lands.
  if (e.flash > 0) {
    ctx.globalAlpha = Math.min(1, e.flash / 0.09) * 0.85;
    circle(ctx, e.x, e.y, r * 0.8, '#ffffff');
    ctx.globalAlpha = 1;
  }
  // The boss wears its health where everyone can see it.
  if (e.type === 'boss') {
    const w = 220;
    const x = state.width / 2 - w / 2;
    const y = 46;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x - 4, y - 4, w + 8, 16);
    ctx.fillStyle = '#3a2a66';
    ctx.fillRect(x, y, w, 8);
    ctx.fillStyle = e.color;
    ctx.fillRect(x, y, w * Math.max(0, e.hp / e.maxHp), 8);
  }
}

function drawPlayer(ctx, state, input) {
  const ship = state.player;
  if (state.screen === 'over') return;
  if (ship.invulnT > 0 && ship.dashT <= 0 && Math.floor(state.time * 14) % 2 === 0) return;
  const aim = Math.atan2(input.mouse.y - ship.y, input.mouse.x - ship.x);
  blitGlow(ctx, PALETTE.player, ship.x, ship.y, ship.radius * 4.4, 0.65);
  if (ship.thrust > 0) {
    const back = aim + Math.PI;
    const flick = 10 + Math.sin(state.time * 40) * 4;
    poly(ctx, [
      [ship.x + Math.cos(back) * ship.radius * 0.9, ship.y + Math.sin(back) * ship.radius * 0.9],
      [ship.x + Math.cos(back + 0.42) * ship.radius * 0.7, ship.y + Math.sin(back + 0.42) * ship.radius * 0.7],
      [ship.x + Math.cos(back) * (ship.radius + flick), ship.y + Math.sin(back) * (ship.radius + flick)],
      [ship.x + Math.cos(back - 0.42) * ship.radius * 0.7, ship.y + Math.sin(back - 0.42) * ship.radius * 0.7],
    ], '#ffb347');
  }
  const r = ship.radius;
  poly(ctx, [
    [ship.x + Math.cos(aim) * r * 1.3, ship.y + Math.sin(aim) * r * 1.3],
    [ship.x + Math.cos(aim + 2.45) * r, ship.y + Math.sin(aim + 2.45) * r],
    [ship.x + Math.cos(aim + Math.PI) * r * 0.55, ship.y + Math.sin(aim + Math.PI) * r * 0.55],
    [ship.x + Math.cos(aim - 2.45) * r, ship.y + Math.sin(aim - 2.45) * r],
  ], PALETTE.player);
  circle(ctx, ship.x, ship.y, r * 0.32, '#062a33');
}

function drawBullets(ctx, state) {
  ctx.lineCap = 'round';
  for (const b of state.bullets) {
    ctx.strokeStyle = b.crit ? PALETTE.gold : PALETTE.bullet;
    ctx.lineWidth = b.crit ? 5 : 3;
    ctx.beginPath();
    ctx.moveTo(b.x - b.vx * 0.022, b.y - b.vy * 0.022);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  for (const b of state.ebullets) {
    blitGlow(ctx, PALETTE.enemyBullet, b.x, b.y, 26, 0.6);
    circle(ctx, b.x, b.y, b.radius, PALETTE.enemyBullet);
    circle(ctx, b.x, b.y, b.radius * 0.45, '#ffffff');
  }
}

function drawParticles(ctx, state) {
  for (const p of state.particles) {
    const a = Math.max(0, p.life / p.maxLife);
    if (p.kind === 'ring') {
      const prog = 1 - a;
      ctx.globalAlpha = a * 0.9;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius + (p.max - p.radius) * prog, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else {
      ctx.globalAlpha = a;
      circle(ctx, p.x, p.y, p.size * a + 0.5, p.color);
      ctx.globalAlpha = 1;
    }
  }
  ctx.textAlign = 'center';
  ctx.font = 'bold 15px system-ui, sans-serif';
  for (const f of state.floaters) {
    ctx.globalAlpha = Math.max(0, f.life / f.maxLife);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}

function drawWorld(ctx, state, input, stars) {
  ctx.save();
  if (state.shake > 0) {
    const mag = state.shake * 7;
    ctx.translate((Math.random() - 0.5) * mag, (Math.random() - 0.5) * mag);
  }
  drawBackground(ctx, state, stars, state.time);
  drawShards(ctx, state);
  for (const e of state.enemies) drawEnemy(ctx, e, state);
  drawPlayer(ctx, state, input);
  drawBullets(ctx, state);
  drawParticles(ctx, state);
  ctx.restore();
}

// ---------------------------------------------------------------- HUD

function bar(ctx, x, y, w, h, frac, fill, back) {
  ctx.fillStyle = back;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h);
}

function drawHud(ctx, state, muted) {
  const ship = state.player;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = PALETTE.text;
  ctx.font = 'bold 24px system-ui, sans-serif';
  ctx.fillText(`SCORE ${state.score}`, 18, 34);
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillStyle = PALETTE.dimText;
  ctx.fillText(`KILLS ${state.kills}`, 18, 58);
  if (state.combo >= 2) {
    ctx.fillStyle = PALETTE.gold;
    ctx.font = 'bold 17px system-ui, sans-serif';
    ctx.fillText(`x${state.combo} COMBO`, 18, 82);
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.text;
  ctx.font = 'bold 20px system-ui, sans-serif';
  ctx.fillText(`WAVE ${state.wave}`, state.width / 2, 30);
  ctx.textAlign = 'right';
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillStyle = PALETTE.dimText;
  ctx.fillText(`BEST ${state.best}`, state.width - 18, 30);
  ctx.textAlign = 'left';

  // Hull bar, bottom left.
  const hpFrac = ship.hp / ship.maxHp;
  const hpColor = hpFrac > 0.5 ? '#3ddc84' : hpFrac > 0.25 ? PALETTE.gold : PALETTE.danger;
  ctx.fillStyle = PALETTE.dimText;
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText(`HULL ${Math.ceil(ship.hp)} / ${ship.maxHp}`, 18, state.height - 34);
  bar(ctx, 18, state.height - 28, 210, 13, hpFrac, hpColor, 'rgba(255,255,255,0.12)');

  // Experience bar, bottom centre.
  const xpFrac = state.xpNeed > 0 ? state.xp / state.xpNeed : 0;
  const xpW = 320;
  const xpX = state.width / 2 - xpW / 2;
  ctx.fillStyle = PALETTE.dimText;
  ctx.font = '13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`LEVEL ${state.level}`, state.width / 2, state.height - 34);
  bar(ctx, xpX, state.height - 28, xpW, 7, xpFrac, PALETTE.shard, 'rgba(255,255,255,0.12)');
  ctx.textAlign = 'left';

  // Dash and mute, bottom right.
  const dashReady = ship.dashCd <= 0;
  ctx.textAlign = 'right';
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillStyle = dashReady ? PALETTE.player : PALETTE.dimText;
  ctx.fillText(dashReady ? 'DASH READY [SPACE]' : 'DASH ...', state.width - 18, state.height - 34);
  if (muted) {
    ctx.fillStyle = PALETTE.dimText;
    ctx.fillText('MUTED [M]', state.width - 18, state.height - 54);
  }
  ctx.textAlign = 'left';

  // The calm between waves.
  if (state.waveState === 'breather' && state.screen === 'play') {
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.fillText(`WAVE ${state.wave + 1} INCOMING`, state.width / 2, state.height * 0.38);
    ctx.textAlign = 'left';
  }
}

// ---------------------------------------------------------------- screens

function dim(ctx, state, alpha) {
  ctx.fillStyle = `rgba(3, 4, 12, ${alpha})`;
  ctx.fillRect(0, 0, state.width, state.height);
}

function centered(ctx, state, text, y, font, color) {
  ctx.textAlign = 'center';
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.fillText(text, state.width / 2, y);
  ctx.textAlign = 'left';
}

function drawTitle(ctx, state) {
  dim(ctx, state, 0.72);
  const cx = state.width / 2;
  centered(ctx, state, 'NOVA SWARM', state.height * 0.26, 'bold 58px system-ui, sans-serif', PALETTE.player);
  centered(ctx, state, 'NEON ARENA SURVIVAL', state.height * 0.26 + 34, '18px system-ui, sans-serif', PALETTE.dimText);
  const lines = [
    'WASD / Arrows — Move',
    'Mouse — Aim      Hold Left Click — Fire',
    'Space / Shift — Dash (brief invulnerability)',
    'P — Pause      M — Mute      1 / 2 / 3 — Pick an upgrade',
  ];
  ctx.font = '16px system-ui, sans-serif';
  lines.forEach((line, i) => {
    centered(ctx, state, line, state.height * 0.44 + i * 26, '16px system-ui, sans-serif', PALETTE.text);
  });
  const pulse = 0.65 + 0.35 * Math.sin(state.time * 4 + 1);
  ctx.globalAlpha = pulse;
  centered(ctx, state, 'PRESS ENTER TO START', state.height * 0.68, 'bold 24px system-ui, sans-serif', PALETTE.gold);
  ctx.globalAlpha = 1;
  if (state.best > 0) {
    centered(ctx, state, `BEST ${state.best}`, state.height * 0.68 + 34, '16px system-ui, sans-serif', PALETTE.dimText);
  }
}

function drawPaused(ctx, state) {
  dim(ctx, state, 0.6);
  centered(ctx, state, 'PAUSED', state.height * 0.42, 'bold 46px system-ui, sans-serif', PALETTE.text);
  centered(ctx, state, 'Press P to resume', state.height * 0.42 + 36, '17px system-ui, sans-serif', PALETTE.dimText);
}

function drawLevelup(ctx, state) {
  dim(ctx, state, 0.66);
  centered(ctx, state, 'LEVEL UP', state.height * 0.22, 'bold 42px system-ui, sans-serif', PALETTE.gold);
  centered(ctx, state, `Level ${state.level} — choose an upgrade (press 1, 2 or 3)`, state.height * 0.22 + 34, '17px system-ui, sans-serif', PALETTE.text);
  const offer = state.offer ?? [];
  const cardW = 250;
  const cardH = 150;
  const gap = 26;
  const total = offer.length * cardW + (offer.length - 1) * gap;
  let x = state.width / 2 - total / 2;
  const y = state.height * 0.36;
  offer.forEach((def, i) => {
    ctx.fillStyle = 'rgba(10, 16, 40, 0.92)';
    ctx.fillRect(x, y, cardW, cardH);
    ctx.strokeStyle = PALETTE.gold;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, cardW, cardH);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.gold;
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillText(`${i + 1}`, x + cardW / 2, y + 32);
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.fillText(def.name, x + cardW / 2, y + 66);
    ctx.fillStyle = PALETTE.dimText;
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillText(def.desc, x + cardW / 2, y + 96);
    const owned = state.player.taken[def.id] ?? 0;
    ctx.fillText(`Owned: ${owned} / ${def.max}`, x + cardW / 2, y + 122);
    ctx.textAlign = 'left';
    x += cardW + gap;
  });
}

function drawOver(ctx, state) {
  dim(ctx, state, 0.72);
  centered(ctx, state, 'GAME OVER', state.height * 0.3, 'bold 52px system-ui, sans-serif', PALETTE.danger);
  centered(ctx, state, `SCORE ${state.score}`, state.height * 0.3 + 48, 'bold 26px system-ui, sans-serif', PALETTE.text);
  centered(ctx, state, `Reached wave ${state.wave}  ·  ${state.kills} kills  ·  ${state.upgrades} upgrades`, state.height * 0.3 + 82, '17px system-ui, sans-serif', PALETTE.dimText);
  const isBest = state.score > 0 && state.score >= state.best;
  centered(ctx, state, isBest ? `NEW BEST!` : `BEST ${state.best}`, state.height * 0.3 + 114, '17px system-ui, sans-serif', PALETTE.gold);
  const pulse = 0.65 + 0.35 * Math.sin(state.time * 4 + 2);
  ctx.globalAlpha = pulse;
  centered(ctx, state, 'PRESS R TO RESTART', state.height * 0.62, 'bold 24px system-ui, sans-serif', PALETTE.gold);
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- entry

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let stars = makeStars(canvas.width, canvas.height);
  return {
    resize(width, height) {
      stars = makeStars(width, height);
    },
    draw(state, input, muted) {
      drawWorld(ctx, state, input, stars);
      if (state.screen !== 'title') drawHud(ctx, state, muted);
      if (state.screen === 'title') drawTitle(ctx, state);
      else if (state.screen === 'paused') drawPaused(ctx, state);
      else if (state.screen === 'levelup') drawLevelup(ctx, state);
      else if (state.screen === 'over') drawOver(ctx, state);
    },
  };
}
