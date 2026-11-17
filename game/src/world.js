// VOIDBLOOM's simulation: the ship, the void-spawn, the bullets, the gems,
// the boss and the level-ups. It knows nothing about the screen except the
// camera rectangle it is handed, which it uses to spawn off-screen. Every
// random choice comes from the seeded source, so a run with one seed plays
// the same every time.
import {
  ARENA, PLAYER, XP_BASE, XP_PER_LEVEL, BOSS_TIME, BOSS, ENEMIES,
  SPAWN_TABLE, SPAWN_MIX, SPITTER, SPAWN_MARGIN, GEM_SCATTER,
  LEVEL_BONUS, TIME_SCORE_PER_SECOND,
} from './config.js';
import { rollUpgrades, applyUpgrade } from './upgrades.js';

export const EVENT_HIT = 1;
export const EVENT_OVER = 2;
export const EVENT_LEVELUP = 4;
export const EVENT_VICTORY = 8;
export const EVENT_BOSS = 16;
export const EVENT_PICKUP = 32;
export const EVENT_SHOOT = 64;

const MAX_ENEMIES = 140;
const BLADE_RADIUS = 58;
const BLADE_DAMAGE = 18;
const BLADE_COOLDOWN = 0.35;
const NOVA_INTERVAL = 6;

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function distanceSq(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function spawnRowFor(time) {
  for (const row of SPAWN_TABLE) {
    if (time < row.until) return row;
  }
  return SPAWN_TABLE[SPAWN_TABLE.length - 1];
}

function mixFor(time) {
  for (const mix of SPAWN_MIX) {
    if (time < mix.until) return mix.kinds;
  }
  return SPAWN_MIX[SPAWN_MIX.length - 1].kinds;
}

export function createWorld(rng) {
  const state = {
    time: 0,
    score: 0,
    kills: 0,
    player: null,
    enemies: [],
    bullets: [],
    orbs: [],
    gems: [],
    particles: [],
    floaters: [],
    spawnTimer: 1.2,
    bossSpawned: false,
    pendingChoices: null,
    shake: 0,
    flashRed: 0,
    over: false,
    victory: false,
  };

  function freshPlayer() {
    return {
      x: ARENA.width / 2,
      y: ARENA.height / 2,
      vx: 0,
      vy: 0,
      hull: PLAYER.maxHull,
      level: 1,
      xp: 0,
      xpNext: XP_BASE,
      fireTimer: 0.2,
      invuln: 0,
      facing: -Math.PI / 2,
      bladeAngle: 0,
      novaTimer: NOVA_INTERVAL,
      stats: {
        fireRate: 1,
        damage: PLAYER.bulletDamage,
        speed: PLAYER.speed,
        maxHull: PLAYER.maxHull,
        projectiles: 1,
        magnet: PLAYER.magnetRadius,
        blades: 0,
        regen: 0,
        pierce: 0,
        nova: 0,
      },
      upgradeLevels: {},
    };
  }

  function reset() {
    state.time = 0;
    state.score = 0;
    state.kills = 0;
    state.player = freshPlayer();
    state.enemies = [];
    state.bullets = [];
    state.orbs = [];
    state.gems = [];
    state.particles = [];
    state.floaters = [];
    state.spawnTimer = 1.2;
    state.bossSpawned = false;
    state.pendingChoices = null;
    state.shake = 0;
    state.flashRed = 0;
    state.over = false;
    state.victory = false;
  }

  function burst(x, y, color, count, speed) {
    for (let i = 0; i < count; i += 1) {
      const angle = rng.range(0, Math.PI * 2);
      const velocity = rng.range(speed * 0.3, speed);
      state.particles.push({
        x, y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        life: rng.range(0.3, 0.7),
        maxLife: 0.7,
        size: rng.range(2, 5),
        color,
      });
    }
  }

  function floater(x, y, text, color) {
    state.floaters.push({ x, y, text, life: 0.9, maxLife: 0.9, color });
  }

  function makeEnemy(kind, x, y) {
    const def = kind === 'boss' ? BOSS : ENEMIES[kind];
    return {
      kind,
      x, y,
      vx: 0, vy: 0,
      hp: def.maxHp ?? def.hp,
      maxHp: def.maxHp ?? def.hp,
      radius: def.radius,
      speed: def.speed,
      damage: def.damage,
      score: def.score,
      gems: def.gems ?? 0,
      color: kind === 'boss' ? '#ff2e63' : def.color,
      shootTimer: rng.range(1, 2),
      burstTimer: BOSS.burstInterval,
      minionTimer: BOSS.minionInterval,
      flash: 0,
      bladeCd: 0,
      wobble: rng.range(0, Math.PI * 2),
    };
  }

  function spawnPosition(view) {
    // Just outside one edge of the camera, inside the arena.
    const side = rng.int(0, 3);
    let x;
    let y;
    if (side === 0) { x = rng.range(view.x, view.x + view.width); y = view.y - SPAWN_MARGIN; }
    else if (side === 1) { x = rng.range(view.x, view.x + view.width); y = view.y + view.height + SPAWN_MARGIN; }
    else if (side === 2) { x = view.x - SPAWN_MARGIN; y = rng.range(view.y, view.y + view.height); }
    else { x = view.x + view.width + SPAWN_MARGIN; y = rng.range(view.y, view.y + view.height); }
    x = clamp(x, 20, ARENA.width - 20);
    y = clamp(y, 20, ARENA.height - 20);
    return { x, y };
  }

  function damageEnemy(enemy, amount, kx, ky) {
    enemy.hp -= amount;
    enemy.flash = 0.09;
    enemy.vx += kx;
    enemy.vy += ky;
    if (enemy.hp > 0) return false;
    killEnemy(enemy);
    return true;
  }

  function killEnemy(enemy) {
    enemy.dead = true;
    state.kills += 1;
    state.score += enemy.score;
    floater(enemy.x, enemy.y - enemy.radius, `+${enemy.score}`, '#ffd166');
    burst(enemy.x, enemy.y, enemy.color, enemy.kind === 'boss' ? 60 : 14, 220);
    for (let i = 0; i < enemy.gems; i += 1) {
      const angle = rng.range(0, Math.PI * 2);
      const speed = rng.range(40, GEM_SCATTER);
      state.gems.push({
        x: enemy.x, y: enemy.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        value: 1,
      });
    }
    if (enemy.kind === 'splitter') {
      for (let i = 0; i < 2; i += 1) {
        const mite = makeEnemy('mite', enemy.x + rng.range(-14, 14), enemy.y + rng.range(-14, 14));
        state.enemies.push(mite);
      }
    }
  }

  function nearestEnemy(x, y, maxDistSq) {
    let best = null;
    let bestDist = maxDistSq;
    for (const enemy of state.enemies) {
      if (enemy.dead) continue;
      const d = distanceSq(x, y, enemy.x, enemy.y);
      if (d < bestDist) {
        bestDist = d;
        best = enemy;
      }
    }
    return best;
  }

  function fireVolley() {
    const player = state.player;
    const target = nearestEnemy(player.x, player.y, 900 * 900);
    if (!target) return false;
    const aim = Math.atan2(target.y - player.y, target.x - player.x);
    player.facing = aim;
    const count = player.stats.projectiles;
    const spread = 0.14;
    for (let i = 0; i < count; i += 1) {
      const offset = (i - (count - 1) / 2) * spread;
      const angle = aim + offset;
      state.bullets.push({
        x: player.x + Math.cos(angle) * (PLAYER.radius + 6),
        y: player.y + Math.sin(angle) * (PLAYER.radius + 6),
        vx: Math.cos(angle) * PLAYER.bulletSpeed,
        vy: Math.sin(angle) * PLAYER.bulletSpeed,
        damage: player.stats.damage,
        pierce: player.stats.pierce,
        radius: PLAYER.bulletRadius,
        life: 1.4,
        hit: new Set(),
      });
    }
    burst(
      player.x + Math.cos(aim) * (PLAYER.radius + 8),
      player.y + Math.sin(aim) * (PLAYER.radius + 8),
      '#ffe66d', 3, 90,
    );
    return true;
  }

  function novaBurst() {
    const player = state.player;
    const radius = 150 + 45 * player.stats.nova;
    const damage = 30 + 20 * player.stats.nova;
    for (const enemy of state.enemies) {
      if (enemy.dead) continue;
      const d = Math.sqrt(distanceSq(player.x, player.y, enemy.x, enemy.y));
      if (d < radius + enemy.radius) {
        const kx = d === 0 ? 0 : ((enemy.x - player.x) / d) * 320;
        const ky = d === 0 ? 0 : ((enemy.y - player.y) / d) * 320;
        damageEnemy(enemy, damage, kx, ky);
      }
    }
    for (let i = 0; i < 36; i += 1) {
      const angle = (i / 36) * Math.PI * 2;
      state.particles.push({
        x: player.x + Math.cos(angle) * radius * 0.4,
        y: player.y + Math.sin(angle) * radius * 0.4,
        vx: Math.cos(angle) * 320,
        vy: Math.sin(angle) * 320,
        life: 0.45, maxLife: 0.45, size: 4, color: '#ff5d8f',
      });
    }
    state.shake = Math.max(state.shake, 5);
  }

  function hurtPlayer(amount) {
    const player = state.player;
    if (player.invuln > 0 || state.over) return false;
    player.hull -= amount;
    player.invuln = PLAYER.invulnSeconds;
    state.flashRed = 0.5;
    state.shake = Math.max(state.shake, 9);
    burst(player.x, player.y, '#ff2e63', 16, 260);
    if (player.hull <= 0) {
      player.hull = 0;
      state.over = true;
      burst(player.x, player.y, '#ffe66d', 70, 380);
      burst(player.x, player.y, '#ff5d8f', 50, 300);
      state.shake = 16;
    }
    return true;
  }

  function gainXp(value) {
    const player = state.player;
    player.xp += value;
    if (state.pendingChoices) return false;
    if (player.xp < player.xpNext) return false;
    player.xp -= player.xpNext;
    player.level += 1;
    player.xpNext = XP_BASE + player.level * XP_PER_LEVEL;
    state.score += LEVEL_BONUS;
    state.pendingChoices = rollUpgrades(rng, player.upgradeLevels, 3);
    floater(player.x, player.y - 30, 'LEVEL UP!', '#7de3ff');
    burst(player.x, player.y, '#7de3ff', 24, 200);
    return true;
  }

  function stepPlayer(dt, move, demo) {
    const player = state.player;
    player.invuln = Math.max(0, player.invuln - dt);
    if (player.stats.regen > 0 && player.hull > 0) {
      player.hull = Math.min(player.stats.maxHull, player.hull + player.stats.regen * dt);
    }
    const speed = player.stats.speed;
    player.vx = move.x * speed;
    player.vy = move.y * speed;
    player.x = clamp(player.x + player.vx * dt, PLAYER.radius, ARENA.width - PLAYER.radius);
    player.y = clamp(player.y + player.vy * dt, PLAYER.radius, ARENA.height - PLAYER.radius);
    if (move.x !== 0 || move.y !== 0) player.facing = Math.atan2(move.y, move.x);
    player.bladeAngle += dt * 2.6;
    if (demo) return 0;
    let events = 0;
    player.fireTimer -= dt;
    if (player.fireTimer <= 0) {
      player.fireTimer = PLAYER.fireInterval / player.stats.fireRate;
      if (fireVolley()) events |= EVENT_SHOOT;
    }
    if (player.stats.nova > 0) {
      player.novaTimer -= dt;
      if (player.novaTimer <= 0) {
        player.novaTimer = NOVA_INTERVAL;
        novaBurst();
      }
    }
    return events;
  }

  function stepEnemies(dt, demo) {
    const player = state.player;
    let events = 0;
    for (const enemy of state.enemies) {
      if (enemy.dead) continue;
      enemy.flash = Math.max(0, enemy.flash - dt);
      enemy.bladeCd = Math.max(0, enemy.bladeCd - dt);
      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const dist = Math.hypot(dx, dy) || 1;
      let mx = dx / dist;
      let my = dy / dist;
      if (enemy.kind === 'spitter') {
        // Keep its distance: close in when far, back off when near, strafe.
        const strafe = Math.sin(state.time * 1.3 + enemy.wobble);
        if (dist > SPITTER.range + 60) {
          // mx, my already point at the player.
        } else if (dist < SPITTER.range - 80) {
          mx = -mx;
          my = -my;
        } else {
          // Strafe sideways around the player.
          mx = (dy / dist) * strafe;
          my = (-dx / dist) * strafe;
        }
        if (!demo) {
          enemy.shootTimer -= dt;
          if (enemy.shootTimer <= 0 && dist < 560) {
            enemy.shootTimer = SPITTER.shootInterval;
            state.orbs.push({
              x: enemy.x, y: enemy.y,
              vx: (dx / dist) * SPITTER.orbSpeed,
              vy: (dy / dist) * SPITTER.orbSpeed,
              damage: SPITTER.orbDamage,
              radius: SPITTER.orbRadius,
              life: 3.5,
            });
          }
        }
      }
      if (enemy.kind === 'boss') {
        enemy.burstTimer -= dt;
        if (enemy.burstTimer <= 0 && !demo) {
          enemy.burstTimer = BOSS.burstInterval;
          const base = rng.range(0, Math.PI * 2);
          for (let i = 0; i < BOSS.burstCount; i += 1) {
            const angle = base + (i / BOSS.burstCount) * Math.PI * 2;
            state.orbs.push({
              x: enemy.x, y: enemy.y,
              vx: Math.cos(angle) * BOSS.orbSpeed,
              vy: Math.sin(angle) * BOSS.orbSpeed,
              damage: BOSS.orbDamage,
              radius: BOSS.orbRadius,
              life: 4,
            });
          }
        }
        enemy.minionTimer -= dt;
        if (enemy.minionTimer <= 0 && !demo && state.enemies.length < MAX_ENEMIES) {
          enemy.minionTimer = BOSS.minionInterval;
          for (let i = 0; i < 3; i += 1) {
            const angle = rng.range(0, Math.PI * 2);
            state.enemies.push(makeEnemy(
              'drifter',
              enemy.x + Math.cos(angle) * (enemy.radius + 30),
              enemy.y + Math.sin(angle) * (enemy.radius + 30),
            ));
          }
        }
      }
      // Drifters wobble a little as they chase; everything else flies straight.
      if (enemy.kind === 'drifter') {
        const wobble = Math.sin(state.time * 2 + enemy.wobble) * 0.35;
        const px = -my;
        const py = mx;
        mx += px * wobble;
        my += py * wobble;
        const len = Math.hypot(mx, my) || 1;
        mx /= len;
        my /= len;
      }
      enemy.vx += (mx * enemy.speed - enemy.vx) * Math.min(1, dt * 4);
      enemy.vy += (my * enemy.speed - enemy.vy) * Math.min(1, dt * 4);
      enemy.x = clamp(enemy.x + enemy.vx * dt, enemy.radius, ARENA.width - enemy.radius);
      enemy.y = clamp(enemy.y + enemy.vy * dt, enemy.radius, ARENA.height - enemy.radius);
      // Orbiting blades bite anything they touch.
      if (player.stats.blades > 0 && enemy.bladeCd <= 0) {
        for (let i = 0; i < player.stats.blades; i += 1) {
          const angle = player.bladeAngle + (i / player.stats.blades) * Math.PI * 2;
          const bx = player.x + Math.cos(angle) * BLADE_RADIUS;
          const by = player.y + Math.sin(angle) * BLADE_RADIUS;
          if (distanceSq(bx, by, enemy.x, enemy.y) < (enemy.radius + 12) ** 2) {
            enemy.bladeCd = BLADE_COOLDOWN;
            damageEnemy(enemy, BLADE_DAMAGE, 0, 0);
            burst(bx, by, '#b388ff', 4, 120);
            break;
          }
        }
      }
      // Touching the ship hurts, unless the demo is running.
      if (!demo && !enemy.dead) {
        const touch = enemy.radius + PLAYER.radius;
        if (distanceSq(enemy.x, enemy.y, player.x, player.y) < touch * touch) {
          const kx = (enemy.x - player.x) / (dist || 1);
          const ky = (enemy.y - player.y) / (dist || 1);
          enemy.vx += kx * 200;
          enemy.vy += ky * 200;
          if (hurtPlayer(enemy.damage)) {
            events |= EVENT_HIT;
            if (state.over) events |= EVENT_OVER;
          }
        }
      }
    }
    // A light push-apart so the swarm does not stack into one blob.
    const list = state.enemies;
    for (let i = 0; i < list.length; i += 1) {
      const a = list[i];
      if (a.dead) continue;
      for (let j = i + 1; j < list.length; j += 1) {
        const b = list[j];
        if (b.dead) continue;
        const min = a.radius + b.radius;
        const d2 = distanceSq(a.x, a.y, b.x, b.y);
        if (d2 > 0.01 && d2 < min * min) {
          const d = Math.sqrt(d2);
          const push = ((min - d) / d) * 0.5;
          const px = (a.x - b.x) * push;
          const py = (a.y - b.y) * push;
          a.x += px;
          a.y += py;
          b.x -= px;
          b.y -= py;
        }
      }
    }
    return events;
  }

  function stepBullets(dt) {
    for (const bullet of state.bullets) {
      bullet.life -= dt;
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      if (bullet.life <= 0) {
        bullet.dead = true;
        continue;
      }
      for (const enemy of state.enemies) {
        if (enemy.dead || bullet.hit.has(enemy)) continue;
        const touch = enemy.radius + bullet.radius;
        if (distanceSq(bullet.x, bullet.y, enemy.x, enemy.y) < touch * touch) {
          bullet.hit.add(enemy);
          const kx = (bullet.vx / PLAYER.bulletSpeed) * 60;
          const ky = (bullet.vy / PLAYER.bulletSpeed) * 60;
          const killed = damageEnemy(enemy, bullet.damage, kx, ky);
          burst(bullet.x, bullet.y, '#ffe66d', killed ? 8 : 3, 140);
          if (bullet.pierce > 0) bullet.pierce -= 1;
          else {
            bullet.dead = true;
            break;
          }
        }
      }
    }
    state.bullets = state.bullets.filter((b) => !b.dead);
  }

  function stepOrbs(dt, demo) {
    const player = state.player;
    let events = 0;
    for (const orb of state.orbs) {
      orb.life -= dt;
      orb.x += orb.vx * dt;
      orb.y += orb.vy * dt;
      if (orb.life <= 0) {
        orb.dead = true;
        continue;
      }
      if (!demo) {
        const touch = orb.radius + PLAYER.radius;
        if (distanceSq(orb.x, orb.y, player.x, player.y) < touch * touch) {
          orb.dead = true;
          if (hurtPlayer(orb.damage)) {
            events |= EVENT_HIT;
            if (state.over) events |= EVENT_OVER;
          }
        }
      }
    }
    state.orbs = state.orbs.filter((o) => !o.dead);
    return events;
  }

  function stepGems(dt) {
    const player = state.player;
    let events = 0;
    const magnetSq = player.stats.magnet * player.stats.magnet;
    for (const gem of state.gems) {
      gem.vx *= 1 - Math.min(1, dt * 3);
      gem.vy *= 1 - Math.min(1, dt * 3);
      const d2 = distanceSq(gem.x, gem.y, player.x, player.y);
      if (d2 < magnetSq) {
        const d = Math.sqrt(d2) || 1;
        const pull = 900;
        gem.vx += ((player.x - gem.x) / d) * pull * dt;
        gem.vy += ((player.y - gem.y) / d) * pull * dt;
      }
      gem.x += gem.vx * dt;
      gem.y += gem.vy * dt;
      if (d2 < (PLAYER.pickupRadius + 6) ** 2) {
        gem.dead = true;
        events |= EVENT_PICKUP;
        if (gainXp(gem.value)) events |= EVENT_LEVELUP;
      }
    }
    state.gems = state.gems.filter((g) => !g.dead);
    return events;
  }

  function stepParticles(dt) {
    for (const p of state.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - Math.min(1, dt * 2);
      p.vy *= 1 - Math.min(1, dt * 2);
    }
    state.particles = state.particles.filter((p) => p.life > 0);
    for (const f of state.floaters) {
      f.life -= dt;
      f.y -= 34 * dt;
    }
    state.floaters = state.floaters.filter((f) => f.life > 0);
    state.shake = Math.max(0, state.shake - dt * 30);
    state.flashRed = Math.max(0, state.flashRed - dt * 1.6);
  }

  function stepSpawner(dt, view, demo) {
    if (state.enemies.length >= MAX_ENEMIES) return;
    // The title-screen demo is a backdrop, not a run: a dozen drifters
    // circling the ship is alive; a hundred piled on it is a blob.
    if (demo && state.enemies.length >= 12) return;
    state.spawnTimer -= dt;
    if (state.spawnTimer > 0) return;
    const row = spawnRowFor(state.time);
    // Pressure valve: once the field is crowded, spawning slows so the game
    // stays a fight rather than a flood.
    state.spawnTimer = state.enemies.length > 55 ? row.interval * 1.6 : row.interval;
    const mix = mixFor(state.time);
    for (let i = 0; i < row.batch; i += 1) {
      if (state.enemies.length >= MAX_ENEMIES) break;
      const kind = rng.weighted(mix);
      const pos = spawnPosition(view);
      state.enemies.push(makeEnemy(kind, pos.x, pos.y));
    }
  }

  /**
   * Advance the world one fixed step. `move` is a normalised direction, `view`
   * the camera rectangle in world units. In demo mode nothing hurts the ship
   * and it never fires: the title screen's living backdrop. Returns an event
   * bitmask (EVENT_*).
   */
  function step(dt, move, view, demo = false) {
    if (state.over || state.victory) {
      stepParticles(dt);
      return 0;
    }
    state.time += dt;
    state.score += TIME_SCORE_PER_SECOND * dt;
    let events = 0;
    events |= stepPlayer(dt, move, demo);
    if (state.over) return events | EVENT_OVER;
    stepSpawner(dt, view, demo);
    if (!state.bossSpawned && state.time >= BOSS_TIME) {
      state.bossSpawned = true;
      const pos = spawnPosition(view);
      state.enemies.push(makeEnemy('boss', pos.x, pos.y));
      events |= EVENT_BOSS;
    }
    events |= stepEnemies(dt, demo);
    if (state.over) return events | EVENT_OVER;
    stepBullets(dt);
    events |= stepOrbs(dt, demo);
    if (state.over) return events | EVENT_OVER;
    events |= stepGems(dt);
    stepParticles(dt);
    state.enemies = state.enemies.filter((e) => {
      if (e.dead && e.kind === 'boss') {
        state.victory = true;
        events |= EVENT_VICTORY;
      }
      return !e.dead;
    });
    return events;
  }

  /** Take one of the pending level-up choices (index 0..2). Returns the def taken. */
  function chooseUpgrade(index) {
    const choices = state.pendingChoices;
    if (!choices || index < 0 || index >= choices.length) return null;
    const def = choices[index];
    applyUpgrade(def, state.player);
    state.pendingChoices = null;
    // A second level may already be banked: roll again at once.
    if (state.player.xp >= state.player.xpNext) {
      gainXp(0);
    }
    return def;
  }

  reset();
  return { state, reset, step, chooseUpgrade };
}
