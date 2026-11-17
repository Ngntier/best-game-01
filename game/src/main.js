// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps, and the renderer paints what is there. The game moves
// between six screens: title, play, paused, level-up, game over and victory.
//
// ?seed=N fixes the spawn pattern. ?shot=start|play|levelup|end (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import {
  createWorld,
  EVENT_BOSS, EVENT_HIT, EVENT_LEVELUP, EVENT_OVER, EVENT_PICKUP,
  EVENT_SHOOT, EVENT_VICTORY,
} from './world.js';
import { createAudio } from './audio.js';
import {
  ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, ACTION_RESTART, createInput,
} from './input.js';
import {
  createRenderer,
  SCREEN_LEVELUP, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY,
  SCREEN_TITLE, SCREEN_WIN,
} from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();
renderer.resize();
window.addEventListener('resize', () => renderer.resize());

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
    // Storage can be off (private windows): the best then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world, (state) => renderer.cameraRect(state));
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, {
      best: scene.best, choices: world.state.pendingChoices, muted: audio.isMuted(),
    });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();

  // A read-only window into the running game for tests and debugging: the
  // current screen and the live world state.
  window.__voidbloom = {
    get screen() { return screen; },
    get state() { return world.state; },
    get camera() { return renderer.cameraRect(world.state); },
  };

  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    audio.resume();
    audio.click();
    world.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Survive the swarm and slay the Bloom Titan.');
  }

  function endGame(won) {
    screen = won ? SCREEN_WIN : SCREEN_OVER;
    const score = Math.floor(world.state.score);
    if (score > best) {
      best = score;
      saveBest(best);
    }
    if (won) audio.victory();
    else audio.gameover();
    announce(won
      ? `Victory! Score ${score}. Best ${best}.`
      : `Game over. Score ${score}. Best ${best}.`);
  }

  function applyChoice(index) {
    const def = world.chooseUpgrade(index);
    if (!def) return;
    audio.click();
    if (world.state.pendingChoices) {
      announce(`Took ${def.name}. Choose another upgrade.`);
    } else {
      screen = SCREEN_PLAY;
      announce(`Took ${def.name}. Back to the fight.`);
    }
  }

  function moveVector() {
    const keys = input.keyVector();
    if (keys.x !== 0 || keys.y !== 0) return keys;
    // No key held: a held pointer steers the ship toward it.
    const pointer = input.pointerState();
    if (!pointer.down || !pointer.seen) return { x: 0, y: 0 };
    const camera = renderer.cameraRect(world.state);
    const px = world.state.player.x - camera.x;
    const py = world.state.player.y - camera.y;
    const dx = pointer.x - px;
    const dy = pointer.y - py;
    const dist = Math.hypot(dx, dy);
    if (dist < 14) return { x: 0, y: 0 };
    return { x: dx / dist, y: dy / dist };
  }

  function pointIn(point, rect) {
    return rect
      && point.x >= rect.x && point.x <= rect.x + rect.width
      && point.y >= rect.y && point.y <= rect.y + rect.height;
  }

  function handleClicks() {
    const clicks = input.takeClicks();
    if (clicks.length === 0) return;
    audio.resume();
    for (const click of clicks) {
      if (screen === SCREEN_TITLE && pointIn(click, renderer.regions.start)) {
        startGame();
        return;
      }
      if (screen === SCREEN_PAUSED) {
        if (pointIn(click, renderer.regions.resume)) {
          screen = SCREEN_PLAY;
          announce('Playing.');
          return;
        }
        if (pointIn(click, renderer.regions.restart)) {
          startGame();
          return;
        }
      }
      if (screen === SCREEN_LEVELUP) {
        for (const card of renderer.regions.cards) {
          if (pointIn(click, card)) {
            applyChoice(card.index);
            return;
          }
        }
      }
      if ((screen === SCREEN_OVER || screen === SCREEN_WIN)
        && pointIn(click, renderer.regions.restart)) {
        startGame();
        return;
      }
    }
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      audio.setMuted(!audio.isMuted());
      announce(audio.isMuted() ? 'Sound muted.' : 'Sound on.');
    }
    if (actions & ACTION_RESTART
      && (screen === SCREEN_PLAY || screen === SCREEN_PAUSED || screen === SCREEN_OVER || screen === SCREEN_WIN)) {
      startGame();
      return;
    }
    if (actions & ACTION_CONFIRM) {
      if (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WIN) startGame();
      else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
      return;
    }
    if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
    if (screen === SCREEN_LEVELUP) {
      const choice = input.takeChoice();
      if (choice >= 1 && choice <= 3) applyChoice(choice - 1);
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { x: 0, y: 0 }, renderer.cameraRect(world.state), true);
      return;
    }
    const events = world.step(STEP, moveVector(), renderer.cameraRect(world.state), false);
    if (events & EVENT_SHOOT) audio.shoot();
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_BOSS) {
      audio.boss();
      announce('The Bloom Titan wakes!');
    }
    if (events & EVENT_HIT) {
      audio.hit();
      announce(`Hit. Hull ${Math.ceil(world.state.player.hull)}.`);
    }
    if (events & EVENT_LEVELUP) {
      audio.levelup();
      screen = SCREEN_LEVELUP;
      announce(`Level ${world.state.player.level}. Choose an upgrade.`);
    }
    if (events & EVENT_VICTORY) endGame(true);
    else if (events & EVENT_OVER) endGame(false);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    handleClicks();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, {
      best, choices: world.state.pendingChoices, muted: audio.isMuted(),
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('VOIDBLOOM. Press Space or click Start to play.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
