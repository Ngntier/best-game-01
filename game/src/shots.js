// The screenshot scenes behind ?shot=start|play|levelup|end. Each one plays
// the real rules forward from a fresh world for a fixed stretch, steered by a
// simple autopilot (a potential field: flee what is near, chase the nearest
// seed), so every frame is what a real game looks like and the same seed
// always gives the same frame.
import { STEP } from './config.js';
import { EVENT_LEVELUP, EVENT_OVER, EVENT_VICTORY } from './world.js';
import { SCREEN_LEVELUP, SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 6;
const PLAY_SECONDS = 42;
const END_GOOD_SECONDS = 25;
const END_LIMIT_SECONDS = 400;
const LEVELUP_LIMIT_SECONDS = 120;

/**
 * A steering vector from a potential field: every near enemy pushes the ship
 * away, the nearest seed pulls it in, and the arena's centre tugs gently when
 * the ship drifts near an edge. `flee` scales the repulsion: the end scene's
 * pilot forgets how to run. Exported so tests can drive the same pilot.
 */
export function autopilotMove(state, flee) {
  const player = state.player;
  let x = 0;
  let y = 0;
  for (const enemy of state.enemies) {
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const distSq = dx * dx + dy * dy;
    const range = 280 + enemy.radius;
    if (distSq < range * range && distSq > 1) {
      const dist = Math.sqrt(distSq);
      const strength = flee * (1 - dist / range) * 3;
      x += (dx / dist) * strength;
      y += (dy / dist) * strength;
    }
  }
  let gem = null;
  let gemDist = Infinity;
  for (const seed of state.gems) {
    const distSq = (seed.x - player.x) ** 2 + (seed.y - player.y) ** 2;
    if (distSq < gemDist) {
      gemDist = distSq;
      gem = seed;
    }
  }
  if (gem && gemDist < 500 * 500) {
    const dist = Math.sqrt(gemDist) || 1;
    x += ((gem.x - player.x) / dist) * 1.1;
    y += ((gem.y - player.y) / dist) * 1.1;
  }
  // Enemy orbs are worth a small sidestep, but never at the cost of running
  // into the swarm: a gentle push, only when one is very close.
  for (const orb of state.orbs) {
    const dx = player.x - orb.x;
    const dy = player.y - orb.y;
    const distSq = dx * dx + dy * dy;
    if (distSq < 90 * 90 && distSq > 1) {
      const dist = Math.sqrt(distSq);
      const strength = flee * (1 - dist / 90) * 0.9;
      x += (dx / dist) * strength;
      y += (dy / dist) * strength;
    }
  }
  const cx = 1300 - player.x;
  const cy = 900 - player.y;
  const centreDist = Math.hypot(cx, cy);
  if (centreDist > 500) {
    x += (cx / centreDist) * 1.0;
    y += (cy / centreDist) * 1.0;
  }
  // And a hard shove off the arena's walls: corners are where ships die.
  const wall = 180;
  if (player.x < wall) x += (1 - player.x / wall) * 1.6;
  if (player.x > 2600 - wall) x -= (1 - (2600 - player.x) / wall) * 1.6;
  if (player.y < wall) y += (1 - player.y / wall) * 1.6;
  if (player.y > 1800 - wall) y -= (1 - (1800 - player.y) / wall) * 1.6;
  const len = Math.hypot(x, y);
  if (len < 0.01) return { x: 0, y: 0 };
  return { x: x / len, y: y / len };
}

function applyFirstChoice(world) {
  if (world.state.pendingChoices) world.chooseUpgrade(0);
}

/**
 * Set `world` to the named scene and return the screen to draw over it and
 * the best score to show. `viewOf` maps the state to the camera rectangle the
 * spawner aims outside of. Unknown names stage the title.
 */
export function stageShot(name, world, viewOf) {
  world.reset();
  if (name === 'play' || name === 'levelup' || name === 'end') {
    const limit = name === 'levelup' ? LEVELUP_LIMIT_SECONDS : name === 'end' ? END_LIMIT_SECONDS : PLAY_SECONDS;
    let over = false;
    let levelled = false;
    for (let t = 0; t < limit; t += STEP) {
      // The end scene's pilot plays well for a while, then freezes: the swarm
      // catches a ship that stops running, and the score is a real one.
      const flee = name === 'end' && world.state.time > END_GOOD_SECONDS ? 0 : 1;
      const move = flee === 0 ? { x: 0, y: 0 } : autopilotMove(world.state, flee);
      const events = world.step(STEP, move, viewOf(world.state), false);
      if (events & EVENT_LEVELUP) {
        if (name === 'levelup') {
          levelled = true;
          break;
        }
        applyFirstChoice(world);
      }
      if (events & EVENT_OVER) {
        over = true;
        break;
      }
      if (events & EVENT_VICTORY) break;
    }
    if (levelled) return { screen: SCREEN_LEVELUP, best: Math.floor(world.state.score) };
    if (over || world.state.over) return { screen: SCREEN_OVER, best: Math.floor(world.state.score) };
    return { screen: SCREEN_PLAY, best: Math.floor(world.state.score) };
  }
  // Title: the world drifts behind the menu for a few seconds, harmless.
  for (let t = 0; t < START_SECONDS; t += STEP) {
    world.step(STEP, { x: 0, y: 0 }, viewOf(world.state), true);
  }
  return { screen: SCREEN_TITLE, best: 0 };
}
