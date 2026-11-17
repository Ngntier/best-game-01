// Keyboard and pointer input, kept apart from the game so the loop reads a
// clean state each frame. Keys move the ship; holding the pointer steers it
// toward the pointer instead. One-shot actions (confirm, pause, restart,
// mute, upgrade picks) queue up and are taken once.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_RESTART = 4;
export const ACTION_MUTE = 8;

const MOVE_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight',
]);

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let choice = 0;
  const clicks = [];
  const pointer = { x: 0, y: 0, down: false, seen: false };

  function canvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function onKeyDown(event) {
    if (event.repeat) return;
    const code = event.code;
    if (MOVE_KEYS.has(code)) {
      keys.add(code);
      event.preventDefault();
      return;
    }
    if (code === 'Space' || code === 'Enter') {
      actions |= ACTION_CONFIRM;
      event.preventDefault();
    } else if (code === 'KeyP' || code === 'Escape') {
      actions |= ACTION_PAUSE;
    } else if (code === 'KeyR') {
      actions |= ACTION_RESTART;
    } else if (code === 'KeyM') {
      actions |= ACTION_MUTE;
    } else if (code === 'Digit1' || code === 'Digit2' || code === 'Digit3') {
      choice = Number(code.slice(-1));
    }
  }

  function onKeyUp(event) {
    keys.delete(event.code);
  }

  function onPointerDown(event) {
    const point = canvasPoint(event);
    pointer.x = point.x;
    pointer.y = point.y;
    pointer.down = true;
    pointer.seen = true;
    canvas.setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event) {
    const point = canvasPoint(event);
    pointer.x = point.x;
    pointer.y = point.y;
    pointer.seen = true;
  }

  function onPointerUp(event) {
    const point = canvasPoint(event);
    pointer.x = point.x;
    pointer.y = point.y;
    pointer.down = false;
    clicks.push({ x: point.x, y: point.y });
  }

  function onBlur() {
    keys.clear();
    pointer.down = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);

  return {
    /** Normalised keyboard move vector, or {x: 0, y: 0} when no key is held. */
    keyVector() {
      let x = 0;
      let y = 0;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
      if (keys.has('KeyW') || keys.has('ArrowUp')) y -= 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) y += 1;
      if (x !== 0 && y !== 0) {
        const scale = Math.SQRT1_2;
        x *= scale;
        y *= scale;
      }
      return { x, y };
    },
    /** Pointer state in canvas CSS pixels. */
    pointerState() {
      return pointer;
    },
    /** One-shot actions since the last take, as a bitmask. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** The upgrade pick key pressed since the last take (1, 2, 3 or 0). */
    takeChoice() {
      const taken = choice;
      choice = 0;
      return taken;
    },
    /** Click positions since the last take, in canvas CSS pixels. */
    takeClicks() {
      return clicks.splice(0, clicks.length);
    },
    destroy() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
    },
  };
}
