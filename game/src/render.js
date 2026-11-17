// Everything the eye sees: the starfield, the ship, the swarm, the HUD and
// every screen. The renderer owns the canvas size and the camera, and after
// each draw it publishes the clickable regions (buttons, upgrade cards) so
// the main loop can answer clicks on them.
import { ARENA, PLAYER, BOSS_TIME } from './config.js';
import { createRandom } from './random.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_LEVELUP = 'levelup';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

const FONT = "'Segoe UI', system-ui, -apple-system, sans-serif";
const NEBULA_COLORS = ['#2b1055', '#0b2a4a', '#3d0f2e', '#0f3d33', '#241a4d'];

function formatTime(seconds) {
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${rest < 10 ? '0' : ''}${rest}`;
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const regions = { start: null, resume: null, restart: null, cards: [] };
  let view = { width: 960, height: 600 };
  let dpr = 1;

  // A fixed backdrop, generated once from a fixed seed: the same sky on
  // every run, so screenshots stay comparable.
  const skyRandom = createRandom(1337);
  const nebulas = [];
  for (let i = 0; i < 14; i += 1) {
    nebulas.push({
      x: skyRandom.range(0, ARENA.width),
      y: skyRandom.range(0, ARENA.height),
      radius: skyRandom.range(180, 420),
      color: NEBULA_COLORS[i % NEBULA_COLORS.length],
    });
  }
  const stars = [];
  for (let i = 0; i < 260; i += 1) {
    stars.push({
      x: skyRandom.range(0, ARENA.width),
      y: skyRandom.range(0, ARENA.height),
      size: skyRandom.range(0.6, 2.2),
      phase: skyRandom.range(0, Math.PI * 2),
    });
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    view = { width, height };
    return view;
  }

  function cameraFor(state) {
    const player = state.player;
    const x = ARENA.width <= view.width
      ? (ARENA.width - view.width) / 2
      : Math.min(Math.max(player.x - view.width / 2, 0), ARENA.width - view.width);
    const y = ARENA.height <= view.height
      ? (ARENA.height - view.height) / 2
      : Math.min(Math.max(player.y - view.height / 2, 0), ARENA.height - view.height);
    return { x, y };
  }

  function drawBackground(state, camera, shakeX, shakeY) {
    const gradient = ctx.createLinearGradient(0, 0, 0, view.height);
    gradient.addColorStop(0, '#070312');
    gradient.addColorStop(0.55, '#0a0618');
    gradient.addColorStop(1, '#12081f');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, view.width, view.height);

    // Nebulas drift at half speed against the camera: a cheap parallax.
    for (const nebula of nebulas) {
      const x = nebula.x - camera.x * 0.5 + shakeX * 0.3;
      const y = nebula.y - camera.y * 0.5 + shakeY * 0.3;
      if (x < -nebula.radius || x > view.width + nebula.radius || y < -nebula.radius || y > view.height + nebula.radius) continue;
      const glow = ctx.createRadialGradient(x, y, 0, x, y, nebula.radius);
      glow.addColorStop(0, `${nebula.color}cc`);
      glow.addColorStop(1, `${nebula.color}00`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, nebula.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    // Stars twinkle on a sine of their own phase: no randomness per frame.
    for (const star of stars) {
      const x = star.x - camera.x * 0.7 + shakeX * 0.5;
      const y = star.y - camera.y * 0.7 + shakeY * 0.5;
      if (x < 0 || x > view.width || y < 0 || y > view.height) continue;
      const twinkle = 0.45 + 0.55 * Math.abs(Math.sin(state.time * 1.4 + star.phase));
      ctx.globalAlpha = twinkle * 0.9;
      ctx.fillStyle = '#cfe8ff';
      ctx.fillRect(x, y, star.size, star.size);
    }
    ctx.globalAlpha = 1;

    // The arena's edge: a soft violet wall so the bounds read at a glance.
    const left = -camera.x + shakeX;
    const top = -camera.y + shakeY;
    ctx.strokeStyle = 'rgba(150, 110, 255, 0.35)';
    ctx.lineWidth = 3;
    ctx.strokeRect(left, top, ARENA.width, ARENA.height);
    ctx.strokeStyle = 'rgba(150, 110, 255, 0.12)';
    ctx.lineWidth = 10;
    ctx.strokeRect(left, top, ARENA.width, ARENA.height);
  }

  function drawGlowCircle(x, y, radius, color, alpha) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawEnemy(enemy, camera, shakeX, shakeY) {
    const x = enemy.x - camera.x + shakeX;
    const y = enemy.y - camera.y + shakeY;
    if (x < -80 || x > view.width + 80 || y < -80 || y > view.height + 80) return;
    const color = enemy.flash > 0 ? '#ffffff' : enemy.color;
    const r = enemy.radius;
    drawGlowCircle(x, y, r * 1.7, enemy.color, 0.16);
    ctx.fillStyle = color;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1.5;
    if (enemy.kind === 'drifter') {
      // A spiked seed: a circle ringed with thorns.
      ctx.beginPath();
      for (let i = 0; i < 10; i += 1) {
        const angle = (i / 10) * Math.PI * 2 + enemy.wobble;
        const rad = i % 2 === 0 ? r : r * 0.62;
        const px = x + Math.cos(angle) * rad;
        const py = y + Math.sin(angle) * rad;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (enemy.kind === 'darter') {
      const angle = Math.atan2(enemy.vy, enemy.vx);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(r * 1.3, 0);
      ctx.lineTo(-r * 0.8, r * 0.8);
      ctx.lineTo(-r * 0.4, 0);
      ctx.lineTo(-r * 0.8, -r * 0.8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    } else if (enemy.kind === 'bulwark') {
      ctx.beginPath();
      for (let i = 0; i < 6; i += 1) {
        const angle = (i / 6) * Math.PI * 2 + 0.3;
        const px = x + Math.cos(angle) * r;
        const py = y + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.beginPath();
      ctx.arc(x, y, r * 0.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (enemy.kind === 'splitter') {
      ctx.beginPath();
      ctx.arc(x - r * 0.45, y, r * 0.7, 0, Math.PI * 2);
      ctx.arc(x + r * 0.45, y, r * 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (enemy.kind === 'spitter') {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-r * 0.75, -r * 0.75, r * 1.5, r * 1.5);
      ctx.strokeRect(-r * 0.75, -r * 0.75, r * 1.5, r * 1.5);
      ctx.restore();
      ctx.fillStyle = '#101018';
      ctx.beginPath();
      ctx.arc(x, y, r * 0.32, 0, Math.PI * 2);
      ctx.fill();
    } else if (enemy.kind === 'boss') {
      // The Bloom Titan: a great ringed bloom with orbiting petals.
      ctx.save();
      ctx.translate(x, y);
      for (let i = 0; i < 8; i += 1) {
        const angle = (i / 8) * Math.PI * 2 + state.time * 0.4;
        const px = Math.cos(angle) * r * 0.95;
        const py = Math.sin(angle) * r * 0.95;
        ctx.fillStyle = i % 2 === 0 ? '#ff2e63' : '#b388ff';
        ctx.beginPath();
        ctx.ellipse(px, py, r * 0.42, r * 0.22, angle, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.72, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffe66d';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    } else {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    // A small health pip on anything hurt but alive.
    if (enemy.hp < enemy.maxHp && enemy.kind !== 'boss') {
      const width = r * 2;
      const ratio = Math.max(0, enemy.hp / enemy.maxHp);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.fillRect(x - r, y - r - 10, width, 4);
      ctx.fillStyle = '#7de3ff';
      ctx.fillRect(x - r, y - r - 10, width * ratio, 4);
    }
  }

  function drawPlayer(state, camera, shakeX, shakeY) {
    const player = state.player;
    if (state.over) return;
    const x = player.x - camera.x + shakeX;
    const y = player.y - camera.y + shakeY;
    // Orbiting blades.
    for (let i = 0; i < player.stats.blades; i += 1) {
      const angle = player.bladeAngle + (i / player.stats.blades) * Math.PI * 2;
      const bx = x + Math.cos(angle) * 58;
      const by = y + Math.sin(angle) * 58;
      drawGlowCircle(bx, by, 14, '#b388ff', 0.35);
      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(angle * 3);
      ctx.fillStyle = '#e6ccff';
      ctx.fillRect(-6, -2, 12, 4);
      ctx.restore();
    }
    // Engine flame, flickering with time.
    const flame = 10 + Math.sin(state.time * 31) * 4;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(player.facing);
    const flameGradient = ctx.createLinearGradient(-PLAYER.radius, 0, -PLAYER.radius - flame - 12, 0);
    flameGradient.addColorStop(0, 'rgba(255, 214, 102, 0.95)');
    flameGradient.addColorStop(1, 'rgba(255, 93, 143, 0)');
    ctx.fillStyle = flameGradient;
    ctx.beginPath();
    ctx.moveTo(-PLAYER.radius + 2, -6);
    ctx.lineTo(-PLAYER.radius - flame - 10, 0);
    ctx.lineTo(-PLAYER.radius + 2, 6);
    ctx.closePath();
    ctx.fill();
    // The hull: a swept seed-ship.
    ctx.fillStyle = '#eaf6ff';
    ctx.strokeStyle = '#7de3ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(PLAYER.radius + 6, 0);
    ctx.lineTo(-PLAYER.radius * 0.7, PLAYER.radius * 0.85);
    ctx.lineTo(-PLAYER.radius * 0.35, 0);
    ctx.lineTo(-PLAYER.radius * 0.7, -PLAYER.radius * 0.85);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ff5d8f';
    ctx.beginPath();
    ctx.arc(2, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Brief shield ring after a hit.
    if (player.invuln > 0) {
      ctx.globalAlpha = 0.35 + 0.3 * Math.sin(state.time * 30);
      ctx.strokeStyle = '#7de3ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, PLAYER.radius + 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  function drawWorld(state, camera, shakeX, shakeY) {
    for (const gem of state.gems) {
      const x = gem.x - camera.x + shakeX;
      const y = gem.y - camera.y + shakeY;
      if (x < -20 || x > view.width + 20 || y < -20 || y > view.height + 20) continue;
      const pulse = 1 + 0.18 * Math.sin(state.time * 6 + gem.x);
      drawGlowCircle(x, y, 12 * pulse, '#3ae0b0', 0.3);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#a7ffdd';
      ctx.fillRect(-4 * pulse, -4 * pulse, 8 * pulse, 8 * pulse);
      ctx.restore();
    }
    for (const enemy of state.enemies) drawEnemy(enemy, camera, shakeX, shakeY);
    for (const bullet of state.bullets) {
      const x = bullet.x - camera.x + shakeX;
      const y = bullet.y - camera.y + shakeY;
      drawGlowCircle(x, y, 9, '#ffe66d', 0.4);
      ctx.fillStyle = '#fff6bf';
      ctx.beginPath();
      ctx.arc(x, y, bullet.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const orb of state.orbs) {
      const x = orb.x - camera.x + shakeX;
      const y = orb.y - camera.y + shakeY;
      const pulse = 1 + 0.2 * Math.sin(state.time * 9 + orb.x);
      drawGlowCircle(x, y, orb.radius * 2 * pulse, '#ff2e63', 0.35);
      ctx.fillStyle = '#ff7d9c';
      ctx.beginPath();
      ctx.arc(x, y, orb.radius * pulse, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const p of state.particles) {
      const x = p.x - camera.x + shakeX;
      const y = p.y - camera.y + shakeY;
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.fillRect(x - p.size / 2, y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    drawPlayer(state, camera, shakeX, shakeY);
    ctx.textAlign = 'center';
    for (const f of state.floaters) {
      const x = f.x - camera.x + shakeX;
      const y = f.y - camera.y + shakeY;
      ctx.globalAlpha = Math.max(0, f.life / f.maxLife);
      ctx.font = `700 15px ${FONT}`;
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, x, y);
    }
    ctx.globalAlpha = 1;
  }

  function bar(x, y, width, height, ratio, fill, back = 'rgba(0, 0, 0, 0.55)') {
    ctx.fillStyle = back;
    roundRect(ctx, x, y, width, height, height / 2);
    ctx.fill();
    if (ratio > 0) {
      ctx.fillStyle = fill;
      roundRect(ctx, x, y, Math.max(height, width * Math.min(1, ratio)), height, height / 2);
      ctx.fill();
    }
  }

  function drawHud(state, ui) {
    const player = state.player;
    const pad = 16;
    // Hull + level, top left.
    ctx.textAlign = 'left';
    ctx.font = `700 13px ${FONT}`;
    ctx.fillStyle = '#cfe8ff';
    ctx.fillText(`HULL  ${Math.ceil(player.hull)} / ${player.stats.maxHull}`, pad, pad + 4);
    bar(pad, pad + 10, 210, 12, player.hull / player.stats.maxHull, '#ff5d8f');
    ctx.font = `700 13px ${FONT}`;
    ctx.fillStyle = '#ffd166';
    ctx.fillText(`LEVEL ${player.level}`, pad, pad + 42);
    // Timer + score, top centre. A shadow keeps the text readable when the
    // swarm passes behind it.
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(2, 0, 10, 0.9)';
    ctx.shadowBlur = 8;
    ctx.font = `800 26px ${FONT}`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(formatTime(state.time), view.width / 2, pad + 22);
    ctx.font = `700 14px ${FONT}`;
    ctx.fillStyle = '#ffd166';
    ctx.fillText(`SCORE ${Math.floor(state.score)}`, view.width / 2, pad + 42);
    // Kills + mute, top right.
    ctx.textAlign = 'right';
    ctx.font = `700 13px ${FONT}`;
    ctx.fillStyle = '#cfe8ff';
    ctx.fillText(`KILLS ${state.kills}`, view.width - pad, pad + 4);
    ctx.fillStyle = '#8fa8c8';
    ctx.fillText(ui.muted ? 'MUTED  [M]' : 'SOUND ON  [M]', view.width - pad, pad + 22);
    // Boss bar, or the countdown to it.
    const boss = state.enemies.find((e) => e.kind === 'boss');
    if (boss) {
      const width = Math.min(560, view.width - 120);
      const x = (view.width - width) / 2;
      const y = pad + 56;
      ctx.textAlign = 'center';
      ctx.font = `800 13px ${FONT}`;
      ctx.fillStyle = '#ff7d9c';
      ctx.fillText('BLOOM TITAN', view.width / 2, y - 6);
      bar(x, y, width, 10, boss.hp / boss.maxHp, '#ff2e63');
    } else if (!state.bossSpawned) {
      ctx.textAlign = 'center';
      ctx.font = `700 12px ${FONT}`;
      ctx.fillStyle = '#b388ff';
      const left = Math.max(0, BOSS_TIME - state.time);
      ctx.fillText(`THE BLOOM TITAN WAKES IN ${formatTime(left)}`, view.width / 2, pad + 62);
    }
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    // XP bar along the bottom.
    const xpRatio = player.xpNext === 0 ? 0 : player.xp / player.xpNext;
    bar(pad, view.height - pad - 12, view.width - pad * 2, 10, xpRatio, '#3ae0b0');
    ctx.textAlign = 'left';
    ctx.font = `700 11px ${FONT}`;
    ctx.fillStyle = '#a7ffdd';
    ctx.fillText(`XP ${player.xp} / ${player.xpNext}`, pad, view.height - pad - 18);
  }

  function dim(alpha) {
    ctx.fillStyle = `rgba(4, 2, 12, ${alpha})`;
    ctx.fillRect(0, 0, view.width, view.height);
  }

  function button(id, cx, cy, width, height, label, accent = '#ff5d8f') {
    const x = cx - width / 2;
    const y = cy - height / 2;
    const pulse = 1 + 0.03 * Math.sin(Date.now() / 300);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(pulse, pulse);
    ctx.translate(-cx, -cy);
    ctx.fillStyle = accent;
    roundRect(ctx, x, y, width, height, 12);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    roundRect(ctx, x + 3, y + 3, width - 6, height / 2 - 3, 9);
    ctx.fill();
    ctx.restore();
    ctx.textAlign = 'center';
    ctx.font = `800 19px ${FONT}`;
    ctx.fillStyle = '#14060f';
    ctx.fillText(label, cx, cy + 7);
    regions[id] = { x, y, width, height };
  }

  function drawTitle(state, ui) {
    dim(0.55);
    const cx = view.width / 2;
    ctx.textAlign = 'center';
    const glow = ctx.createLinearGradient(cx - 260, 0, cx + 260, 0);
    glow.addColorStop(0, '#7de3ff');
    glow.addColorStop(0.5, '#ff5d8f');
    glow.addColorStop(1, '#ffd166');
    ctx.font = `900 ${Math.min(84, view.width * 0.11)}px ${FONT}`;
    ctx.fillStyle = glow;
    ctx.fillText('VOIDBLOOM', cx, view.height * 0.3);
    ctx.font = `600 19px ${FONT}`;
    ctx.fillStyle = '#cfe8ff';
    ctx.fillText('One seed-ship. An endless blooming void. Survive the swarm,', cx, view.height * 0.3 + 34);
    ctx.fillText('grow strong, and slay the Bloom Titan.', cx, view.height * 0.3 + 60);
    ctx.font = `400 15px ${FONT}`;
    ctx.fillStyle = '#9fb8d8';
    ctx.fillText('Move: WASD / arrows, or hold the mouse  ·  Your cannon fires on its own', cx, view.height * 0.3 + 104);
    ctx.fillText('Collect star-seeds to level up and choose upgrades  ·  P pauses  ·  M mutes', cx, view.height * 0.3 + 128);
    button('start', cx, view.height * 0.3 + 190, 260, 56, '▶  START THE RUN');
    if (ui.best > 0) {
      ctx.font = `700 15px ${FONT}`;
      ctx.fillStyle = '#ffd166';
      ctx.fillText(`BEST SCORE  ${ui.best}`, cx, view.height * 0.3 + 244);
    }
    ctx.font = `400 12px ${FONT}`;
    ctx.fillStyle = '#6f87a8';
    ctx.fillText('Survive 3:00 and defeat the Bloom Titan to win. Your hull is all you have.', cx, view.height - 24);
  }

  function drawPaused() {
    dim(0.6);
    const cx = view.width / 2;
    ctx.textAlign = 'center';
    ctx.font = `900 44px ${FONT}`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText('PAUSED', cx, view.height / 2 - 60);
    ctx.font = `400 15px ${FONT}`;
    ctx.fillStyle = '#9fb8d8';
    ctx.fillText('The void waits. It is not patient.', cx, view.height / 2 - 28);
    button('resume', cx, view.height / 2 + 24, 240, 50, 'RESUME');
    button('restart', cx, view.height / 2 + 92, 240, 50, 'RESTART RUN', '#7de3ff');
  }

  function drawLevelUp(state, ui) {
    dim(0.62);
    const cx = view.width / 2;
    ctx.textAlign = 'center';
    ctx.font = `900 34px ${FONT}`;
    ctx.fillStyle = '#7de3ff';
    ctx.fillText(`LEVEL ${state.player.level} — CHOOSE AN UPGRADE`, cx, 96);
    ctx.font = `400 15px ${FONT}`;
    ctx.fillStyle = '#9fb8d8';
    ctx.fillText('Click a card, or press 1, 2 or 3.', cx, 122);
    const choices = ui.choices ?? [];
    const cardWidth = 220;
    const cardHeight = 200;
    const gap = 24;
    const total = choices.length * cardWidth + (choices.length - 1) * gap;
    let x = cx - total / 2;
    const y = 168;
    regions.cards = [];
    choices.forEach((def, index) => {
      const level = (state.player.upgradeLevels[def.id] ?? 0) + 1;
      ctx.fillStyle = 'rgba(16, 10, 34, 0.92)';
      roundRect(ctx, x, y, cardWidth, cardHeight, 14);
      ctx.fill();
      ctx.strokeStyle = def.color;
      ctx.lineWidth = 2;
      roundRect(ctx, x, y, cardWidth, cardHeight, 14);
      ctx.stroke();
      ctx.font = `400 44px ${FONT}`;
      ctx.fillStyle = def.color;
      ctx.fillText(def.glyph, x + cardWidth / 2, y + 62);
      ctx.font = `800 17px ${FONT}`;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(def.name, x + cardWidth / 2, y + 96);
      // The description wraps to at most two lines so a long one never runs
      // past the card's edge.
      ctx.font = `400 14px ${FONT}`;
      ctx.fillStyle = '#cfe8ff';
      const words = def.desc.split(' ');
      const lines = [''];
      for (const word of words) {
        const trial = lines[lines.length - 1] === '' ? word : `${lines[lines.length - 1]} ${word}`;
        if (ctx.measureText(trial).width <= cardWidth - 24) {
          lines[lines.length - 1] = trial;
        } else {
          lines.push(word);
        }
      }
      lines.slice(0, 2).forEach((line, i) => {
        ctx.fillText(line, x + cardWidth / 2, y + 118 + i * 20);
      });
      // Level pips: filled for the level this pick would reach.
      for (let i = 0; i < def.max; i += 1) {
        ctx.fillStyle = i < level ? def.color : 'rgba(255, 255, 255, 0.18)';
        ctx.beginPath();
        ctx.arc(x + cardWidth / 2 + (i - (def.max - 1) / 2) * 18, y + 152, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.font = `700 12px ${FONT}`;
      ctx.fillStyle = '#8fa8c8';
      ctx.fillText(`[${index + 1}]`, x + cardWidth / 2, y + 182);
      regions.cards.push({ x, y, width: cardWidth, height: cardHeight, index });
      x += cardWidth + gap;
    });
  }

  function drawEnd(state, ui, won) {
    dim(0.68);
    const cx = view.width / 2;
    const cy = view.height / 2;
    ctx.textAlign = 'center';
    ctx.font = `900 ${Math.min(52, view.width * 0.075)}px ${FONT}`;
    ctx.fillStyle = won ? '#ffd166' : '#ff5d8f';
    ctx.fillText(won ? 'THE BLOOM IS TAMED' : 'THE VOID CLAIMS YOU', cx, cy - 96);
    ctx.font = `600 17px ${FONT}`;
    ctx.fillStyle = '#cfe8ff';
    ctx.fillText(
      won ? 'The Titan falls. The void blooms quiet — for now.' : 'Your seed-ship scatters into the dark.',
      cx, cy - 62,
    );
    ctx.font = `800 40px ${FONT}`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`SCORE  ${Math.floor(state.score)}`, cx, cy - 6);
    if (ui.best > 0 && Math.floor(state.score) >= ui.best && !won) {
      ctx.font = `800 15px ${FONT}`;
      ctx.fillStyle = '#ffd166';
      ctx.fillText('★ NEW BEST ★', cx, cy + 20);
    }
    ctx.font = `400 16px ${FONT}`;
    ctx.fillStyle = '#9fb8d8';
    ctx.fillText(
      `Survived ${formatTime(state.time)}  ·  ${state.kills} kills  ·  Level ${state.player.level}  ·  Best ${Math.max(ui.best, Math.floor(state.score))}`,
      cx, cy + 48,
    );
    button('restart', cx, cy + 106, 280, 56, '↻  FLY AGAIN  [SPACE]');
  }

  function draw(state, screen, ui) {
    regions.start = null;
    regions.resume = null;
    regions.restart = null;
    regions.cards = [];
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const shake = state.shake;
    const shakeX = shake === 0 ? 0 : Math.sin(state.time * 91) * shake * 0.6;
    const shakeY = shake === 0 ? 0 : Math.cos(state.time * 77) * shake * 0.6;
    const camera = cameraFor(state);
    // On the title screen the demo ship would sit dead centre, behind the
    // start button. Shift the backdrop so it hovers in the lower-left instead,
    // clear of the title and the button.
    if (screen === SCREEN_TITLE) {
      camera.x += view.width * 0.28;
      camera.y -= view.height * 0.22;
    }
    drawBackground(state, camera, shakeX, shakeY);
    drawWorld(state, camera, shakeX, shakeY);
    if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED || screen === SCREEN_LEVELUP) {
      drawHud(state, ui);
    }
    if (screen === SCREEN_TITLE) drawTitle(state, ui);
    else if (screen === SCREEN_PAUSED) drawPaused();
    else if (screen === SCREEN_LEVELUP) drawLevelUp(state, ui);
    else if (screen === SCREEN_OVER) drawEnd(state, ui, false);
    else if (screen === SCREEN_WIN) drawEnd(state, ui, true);
    // Damage vignette: a red edge that fades after a hit.
    if (state.flashRed > 0) {
      const gradient = ctx.createRadialGradient(
        view.width / 2, view.height / 2, Math.min(view.width, view.height) * 0.35,
        view.width / 2, view.height / 2, Math.max(view.width, view.height) * 0.75,
      );
      gradient.addColorStop(0, 'rgba(255, 46, 99, 0)');
      gradient.addColorStop(1, `rgba(255, 46, 99, ${0.5 * state.flashRed})`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, view.width, view.height);
    }
  }

  return {
    resize,
    draw,
    regions,
    viewOf() {
      return view;
    },
    /** The camera rectangle in world units, for spawning and shot staging. */
    cameraRect(state) {
      const camera = cameraFor(state);
      return { x: camera.x, y: camera.y, width: view.width, height: view.height };
    },
  };
}
