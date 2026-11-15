// Keyboard and mouse input: movement keys, aim, firing, and one-shot actions
// (confirm, pause, mute, restart, dash, upgrade keys 1-3). Actions are queued as a
// bitmask and drained once a frame by main.js, so a quick key press is never lost
// between frames.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MUTE = 4;
export const ACTION_RESTART = 8;
export const ACTION_DASH = 16;
export const ACTION_CHOICE_1 = 32;
export const ACTION_CHOICE_2 = 64;
export const ACTION_CHOICE_3 = 128;

const MOVE_KEYS = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

export function createInput(canvas) {
  const keys = new Set();
  const actions = { bits: 0 };
  const mouse = { x: 0, y: 0, down: false, clicked: false, clickX: 0, clickY: 0 };

  function queue(bit) {
    actions.bits |= bit;
  }

  function onKeyDown(event) {
    if (event.repeat) return;
    keys.add(event.code);
    if (event.code === 'Enter' || event.code === 'Space') queue(ACTION_CONFIRM);
    if (event.code === 'KeyP' || event.code === 'Escape') queue(ACTION_PAUSE);
    if (event.code === 'KeyM') queue(ACTION_MUTE);
    if (event.code === 'KeyR') queue(ACTION_RESTART);
    if (event.code === 'Space' || event.code === 'ShiftLeft' || event.code === 'ShiftRight') queue(ACTION_DASH);
    if (event.code === 'Digit1') queue(ACTION_CHOICE_1);
    if (event.code === 'Digit2') queue(ACTION_CHOICE_2);
    if (event.code === 'Digit3') queue(ACTION_CHOICE_3);
    // Space scrolls the page and arrows move focus: keep the game the only thing that moves.
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
  }

  function onKeyUp(event) {
    keys.delete(event.code);
  }

  function trackMouse(event) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = event.clientX - rect.left;
    mouse.y = event.clientY - rect.top;
  }

  function onMouseMove(event) {
    trackMouse(event);
  }

  function onMouseDown(event) {
    trackMouse(event);
    mouse.down = true;
    mouse.clicked = true;
    mouse.clickX = mouse.x;
    mouse.clickY = mouse.y;
    queue(ACTION_CONFIRM);
  }

  function onMouseUp() {
    mouse.down = false;
  }

  function onBlur() {
    keys.clear();
    mouse.down = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);

  /** Normalised WASD/arrows movement vector for this frame. */
  function direction() {
    let x = 0;
    let y = 0;
    keys.forEach((code) => {
      const move = MOVE_KEYS[code];
      if (move) {
        x += move[0];
        y += move[1];
      }
    });
    const length = Math.hypot(x, y);
    if (length > 0) {
      x /= length;
      y /= length;
    }
    return { x, y };
  }

  /** Drain the queued one-shot actions; also reports held fire + aim. */
  function takeActions() {
    const bits = actions.bits;
    actions.bits = 0;
    return bits;
  }

  /** The latest click (if any) since the last read; reading clears it. */
  function takeClick() {
    if (!mouse.clicked) return null;
    mouse.clicked = false;
    return { x: mouse.clickX, y: mouse.clickY };
  }

  function aim() {
    return { x: mouse.x, y: mouse.y };
  }

  function firing() {
    return mouse.down;
  }

  function destroy() {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    canvas.removeEventListener('mousemove', onMouseMove);
    canvas.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mouseup', onMouseUp);
  }

  return { direction, takeActions, takeClick, aim, firing, destroy };
}
