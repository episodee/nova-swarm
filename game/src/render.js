import { UPGRADES } from './upgrades.js';
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

const points = new Float64Array(16);
// A polygon from a list of [x, y] points, filled with one colour.
function poly(ctx, points, fill, count = points.length / 2) {
  ctx.beginPath();
  ctx.moveTo(points[0], points[1]);
  for (let i = 1; i < count; i++) ctx.lineTo(points[i * 2], points[i * 2 + 1]);
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
  for (let i = 0; i < 220; i++) {
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
  // Background colour + nebula are already painted by drawWorld; here only
  // the grid and the twinkling stars are drawn, inside the camera transform.
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
    circle(ctx, (s.x + Math.sin(time * 0.04) * (s.r < 1.4 ? 8 : 2) + state.width) % state.width, s.y, s.r, PALETTE.star);
  }
  ctx.globalAlpha = 1;
}

function drawShards(ctx, state) {
  for (const s of state.shards) {
    const blink = s.life < 3 ? (Math.sin(s.t * 14) > 0 ? 1 : 0.35) : 1;
    ctx.globalAlpha = blink;
    blitGlow(ctx, PALETTE.shard, s.x, s.y, 26, 0.55);
    points[0] = s.x; points[1] = s.y - 6;
    points[2] = s.x + 4.5; points[3] = s.y;
    points[4] = s.x; points[5] = s.y + 6;
    points[6] = s.x - 4.5; points[7] = s.y;
    poly(ctx, points, PALETTE.shard, 4);
    ctx.globalAlpha = 1;
  }
}

function drawEnemy(ctx, e, state) {
  blitGlow(ctx, e.color, e.x, e.y, e.radius * 3.4, 0.5);
  const aim = Math.atan2(state.player.y - e.y, state.player.x - e.x);
  const flashing = e.type === 'dasher' && e.mode === 'aim' && !state.reduceMotion && Math.sin(e.t * 30) > 0;
  const body = flashing ? '#ffffff' : e.color;
  const r = e.radius;
  if (e.type === 'chaser') {

    for (let i = 0; i < 3; i++) {
      const a = aim + (i / 3) * Math.PI * 2;
      points[i * 2] = e.x + Math.cos(a) * r; points[i * 2 + 1] = e.y + Math.sin(a) * r;
    }
    poly(ctx, points, body, 3);
  } else if (e.type === 'weaver') {
    points[0] = e.x + Math.cos(aim) * r; points[1] = e.y + Math.sin(aim) * r;
    points[2] = e.x + Math.cos(aim + Math.PI / 2) * r * 0.7; points[3] = e.y + Math.sin(aim + Math.PI / 2) * r * 0.7;
    points[4] = e.x - Math.cos(aim) * r; points[5] = e.y - Math.sin(aim) * r;
    points[6] = e.x - Math.cos(aim + Math.PI / 2) * r * 0.7; points[7] = e.y - Math.sin(aim + Math.PI / 2) * r * 0.7;
    poly(ctx, points, body, 4);
  } else if (e.type === 'splitter' || e.type === 'boss') {
    const sides = e.type === 'boss' ? 8 : 6;
    const rot = e.t * (e.type === 'boss' ? 0.5 : 0.8);

    for (let i = 0; i < sides; i++) {
      const a = rot + (i / sides) * Math.PI * 2;
      points[i * 2] = e.x + Math.cos(a) * r; points[i * 2 + 1] = e.y + Math.sin(a) * r;
    }
    poly(ctx, points, body, sides);
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
    points[0] = e.x + Math.cos(aim) * r * 1.25; points[1] = e.y + Math.sin(aim) * r * 1.25;
    points[2] = e.x + Math.cos(aim + 2.5) * r; points[3] = e.y + Math.sin(aim + 2.5) * r;
    points[4] = e.x - Math.cos(aim) * r * 0.5; points[5] = e.y - Math.sin(aim) * r * 0.5;
    points[6] = e.x + Math.cos(aim - 2.5) * r; points[7] = e.y + Math.sin(aim - 2.5) * r;
    poly(ctx, points, body, 4);
  } else {
    // Mini: a small, fast triangle.

    for (let i = 0; i < 3; i++) {
      const a = aim + (i / 3) * Math.PI * 2;
      points[i * 2] = e.x + Math.cos(a) * r; points[i * 2 + 1] = e.y + Math.sin(a) * r;
    }
    poly(ctx, points, body, 3);
  }
  // A white flash for a split second after a hit lands.
  if (e.flash > 0 && !state.reduceMotion) {
    ctx.globalAlpha = Math.min(1, e.flash / 0.09) * 0.85;
    circle(ctx, e.x, e.y, r * 0.8, '#ffffff');
    ctx.globalAlpha = 1;
  }

}

function drawPlayer(ctx, state, input) {
  const ship = state.player;
  if (state.screen === 'over') return;
  if (!state.reduceMotion && ship.invulnT > 0 && ship.dashT <= 0 && Math.floor(state.time * 14) % 2 === 0) return;
  const aim = Math.atan2(input.mouse.y - ship.y, input.mouse.x - ship.x);
  blitGlow(ctx, PALETTE.player, ship.x, ship.y, ship.radius * 4.4, 0.65);
  if (ship.thrust > 0) {
    const back = aim + Math.PI;
    const flick = 10 + Math.sin(state.realTime * 40) * 4;
    points[0] = ship.x + Math.cos(back) * ship.radius * 0.9; points[1] = ship.y + Math.sin(back) * ship.radius * 0.9;
    points[2] = ship.x + Math.cos(back + 0.42) * ship.radius * 0.7; points[3] = ship.y + Math.sin(back + 0.42) * ship.radius * 0.7;
    points[4] = ship.x + Math.cos(back) * (ship.radius + flick); points[5] = ship.y + Math.sin(back) * (ship.radius + flick);
    points[6] = ship.x + Math.cos(back - 0.42) * ship.radius * 0.7; points[7] = ship.y + Math.sin(back - 0.42) * ship.radius * 0.7;
    poly(ctx, points, '#ffb347', 4);
  }
  const r = ship.radius * state.shipScale;
  points[0] = ship.x + Math.cos(aim) * r * 1.3; points[1] = ship.y + Math.sin(aim) * r * 1.3;
    points[2] = ship.x + Math.cos(aim + 2.45) * r; points[3] = ship.y + Math.sin(aim + 2.45) * r;
    points[4] = ship.x + Math.cos(aim + Math.PI) * r * 0.55; points[5] = ship.y + Math.sin(aim + Math.PI) * r * 0.55;
    points[6] = ship.x + Math.cos(aim - 2.45) * r; points[7] = ship.y + Math.sin(aim - 2.45) * r;
    poly(ctx, points, PALETTE.player, 4);
  circle(ctx, ship.x, ship.y, r * 0.32, '#062a33');
  if (state.muzzleT > 0 && !state.reduceMotion) {
    const x = ship.x + Math.cos(aim) * 23, y = ship.y + Math.sin(aim) * 23;
    blitGlow(ctx, PALETTE.bullet, x, y, 52, state.muzzleT / 0.065);
    circle(ctx, x, y, 4, '#ffffff');
  }
}

function drawBullets(ctx, state) {
  ctx.lineCap = 'round';
  for (const b of state.bullets) {
    ctx.strokeStyle = b.crit ? PALETTE.gold : PALETTE.bullet;
    ctx.lineWidth = b.crit ? 6 : 4.5;
    ctx.beginPath();
    ctx.moveTo(b.x - b.vx * 0.052, b.y - b.vy * 0.052);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    blitGlow(ctx, b.crit ? PALETTE.gold : PALETTE.bullet, b.x, b.y, 22, 0.7);
    circle(ctx, b.x, b.y, 2.8, '#ffffff');
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
    ctx.font = f.crit ? 'bold 21px system-ui, sans-serif' : 'bold 15px system-ui, sans-serif';
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}

function drawWorld(ctx, state, input, stars, nebula) {
  ctx.fillStyle = PALETTE.background; ctx.fillRect(0, 0, state.width, state.height);
  // The nebula wash is drawn unscaled: blitting the full-screen sprite
  // through the zoom transform costs ~65 ms/frame under SwiftShader for a
  // difference the eye cannot see (the wash is soft by design).
  ctx.drawImage(nebula, 0, 0, state.width, state.height);
  ctx.save();
  const zoom = state.reduceMotion ? 1 : state.zoom;
  const t = state.realTime;
  const trauma = state.reduceMotion ? 0 : state.shake * state.shake;
  const sx = trauma * 6 * (Math.sin(t * 37) + Math.sin(t * 53));
  const sy = trauma * 4 * (Math.sin(t * 43) + Math.sin(t * 61));
  ctx.translate(state.width / 2 + sx, state.height / 2 + sy);
  ctx.scale(zoom, zoom);
  ctx.translate(-state.width / 2, -state.height / 2);
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

  if (state.boss) {
    ctx.textAlign = 'center'; ctx.font = 'bold 13px system-ui, sans-serif'; ctx.fillStyle = '#c8a8ff';
    ctx.fillText('VOIDBORN PRIME', state.width / 2, 52);
    bar(ctx, state.width / 2 - 150, 60, 300, 8, state.boss.hp / state.boss.maxHp, '#b388ff', '#241839');
  }
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
  dim(ctx, state, 0.56);
  const cx = state.width / 2;
  centered(ctx, state, 'NOVA SWARM', state.height * 0.26, 'bold 58px system-ui, sans-serif', PALETTE.player);
  centered(ctx, state, 'NEON ARENA SURVIVAL', state.height * 0.26 + 34, '18px system-ui, sans-serif', PALETTE.dimText);
  centered(ctx, state, 'WASD / Arrows — Move', state.height * 0.44, '16px system-ui, sans-serif', PALETTE.text);
  centered(ctx, state, 'Mouse — Aim      Hold Left Click — Fire', state.height * 0.44 + 26, '16px system-ui, sans-serif', PALETTE.text);
  centered(ctx, state, 'Space / Shift — Dash (brief invulnerability)', state.height * 0.44 + 52, '16px system-ui, sans-serif', PALETTE.text);
  centered(ctx, state, 'P — Pause      M — Mute      1 / 2 / 3 — Pick an upgrade', state.height * 0.44 + 78, '16px system-ui, sans-serif', PALETTE.text);
  centered(ctx, state, state.reduceMotion ? 'G — Reduce motion ON' : 'G — Reduce motion OFF', state.height * 0.83, '14px system-ui, sans-serif', PALETTE.dimText);
  const pulse = state.reduceMotion ? 1 : 0.65 + 0.35 * Math.sin(state.realTime * 4 + 1);
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

const wrapped = new Map();
function wrapText(ctx, text, x, y, width) {
  const layout = wrapped.get(text);
  if (!layout) return;
  ctx.font = layout.font;
  ctx.fillText(layout.first, x, y);
  if (layout.second) ctx.fillText(layout.second, x, y + 21);
}
function prepareCards(ctx, width) {
  for (const def of UPGRADES) {
    let first = '', second = '', font = '';
    for (let size = 15; size >= 10; size--) {
      font = `${size}px system-ui, sans-serif`; ctx.font = font;
      first = ''; second = '';
      const words = def.desc.split(' ');
      for (const word of words) {
        if (!second && ctx.measureText(first ? first + ' ' + word : word).width <= width) first = first ? first + ' ' + word : word;
        else second = second ? second + ' ' + word : word;
      }
      if (ctx.measureText(first).width <= width && ctx.measureText(second).width <= width) break;
    }
    wrapped.set(def.desc, {first, second, font});
  }
}

function drawLevelup(ctx, state) {
  dim(ctx, state, 0.66);
  centered(ctx, state, 'LEVEL UP', state.height * 0.22, 'bold 42px system-ui, sans-serif', PALETTE.gold);
  centered(ctx, state, `Level ${state.level} — choose an upgrade (press 1, 2 or 3)`, state.height * 0.22 + 34, '17px system-ui, sans-serif', PALETTE.text);
  const offer = state.offer;
  if (!offer) return;
  const cardW = Math.min(260, (state.width - 64) / 3 - 18);
  const cardH = 172;
  const gap = 26;
  const total = offer.length * cardW + (offer.length - 1) * gap;
  let x = state.width / 2 - total / 2;
  const y = state.height * 0.36;
  for (let i = 0; i < offer.length; i++) {
    const def = offer[i];
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
    wrapText(ctx, def.desc, x + cardW / 2, y + 96, cardW - 28);
    const owned = state.player.taken[def.id] ?? 0;
    ctx.fillText(`Owned: ${owned} / ${def.max}`, x + cardW / 2, y + 150);
    ctx.textAlign = 'left';
    x += cardW + gap;
  }
}

function drawOver(ctx, state) {
  dim(ctx, state, 0.72);
  centered(ctx, state, 'GAME OVER', state.height * 0.3, 'bold 52px system-ui, sans-serif', PALETTE.danger);
  centered(ctx, state, `SCORE ${state.score}`, state.height * 0.3 + 48, 'bold 26px system-ui, sans-serif', PALETTE.text);
  centered(ctx, state, `Reached wave ${state.wave}  ·  ${state.kills} kills  ·  ${state.upgrades} upgrades`, state.height * 0.3 + 82, '17px system-ui, sans-serif', PALETTE.dimText);
  const isBest = state.score > 0 && state.score >= state.best;
  centered(ctx, state, isBest ? `NEW BEST!` : `BEST ${state.best}`, state.height * 0.3 + 114, '17px system-ui, sans-serif', PALETTE.gold);
  const pulse = state.reduceMotion ? 1 : 0.65 + 0.35 * Math.sin(state.realTime * 4 + 2);
  ctx.globalAlpha = pulse;
  centered(ctx, state, 'PRESS R TO RESTART', state.height * 0.62, 'bold 24px system-ui, sans-serif', PALETTE.gold);
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- entry

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let stars = makeStars(canvas.width, canvas.height);
  const nebula = document.createElement('canvas');
  const edgeFlash = document.createElement('canvas');
  // Warm every glow before any draw/update hot path.
  for (const color of ['#ffffff', '#ffb347', '#ff4d6d', '#ff9f1c', '#8dff5e', '#ffe14d', '#b388ff', ...Object.values(PALETTE)]) {
    if (/^#[0-9a-f]{6}$/i.test(color)) glowSprite(color);
  }
  return {
    resize(width, height) {
      stars = makeStars(width, height);
      prepareCards(ctx, Math.min(260, (width - 64) / 3 - 18) - 28);
      nebula.width = Math.max(2, width >> 1); nebula.height = Math.max(2, height >> 1);
      edgeFlash.width = width; edgeFlash.height = height;
      const v = edgeFlash.getContext('2d');
      v.save(); v.scale(width, height);
      const edge = v.createRadialGradient(0.5, 0.5, 0.28, 0.5, 0.5, 0.7);
      edge.addColorStop(0, '#ff4d6d00'); edge.addColorStop(1, '#ff4d6dbb');
      v.fillStyle = edge; v.fillRect(0, 0, 1, 1); v.restore();
      const g = nebula.getContext('2d');
      const nw = nebula.width, nh = nebula.height;
      for (let i = 0; i < 3; i++) {
        const x = nw * (0.15 + i * 0.35), y = nh * (i === 1 ? 0.28 : 0.76);
        const radius = nw * 0.32;
        const grad = g.createRadialGradient(x, y, 0, x, y, radius);
        grad.addColorStop(0, i === 1 ? '#54278349' : '#154b734d'); grad.addColorStop(1, '#05060f00');
        g.fillStyle = grad; g.fillRect(0, 0, nw, nh);
      }
    },
    draw(state, input, muted) {
      drawWorld(ctx, state, input, stars, nebula);
      if (state.hurtFlash > 0 && !state.reduceMotion) {
        ctx.globalAlpha = state.hurtFlash;
        ctx.drawImage(edgeFlash, 0, 0); ctx.globalAlpha = 1;
      }
      if (state.screen !== 'title') drawHud(ctx, state, muted);
      if (state.screen === 'title') drawTitle(ctx, state);
      else if (state.screen === 'paused') drawPaused(ctx, state);
      else if (state.screen === 'levelup') drawLevelup(ctx, state);
      else if (state.screen === 'over') drawOver(ctx, state);
    },
  };
}
