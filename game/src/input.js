// NOVA SWARM — keyboard and mouse, kept in one place so the sim never
// touches the DOM directly. Two kinds of state: keys held down right now
// (for movement and firing) and keys pressed since the last frame (for
// one-shot actions like pause, restart and picking a card).

const GAME_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'Space', 'ShiftLeft', 'ShiftRight',
  'KeyG', 'Enter', 'KeyP', 'KeyR', 'KeyM',
  'Digit1', 'Digit2', 'Digit3', 'Escape',
]);

export function createInput(canvas) {
  const held = new Set();
  const pressed = new Set();
  const mouse = { x: 0, y: 0, down: false, buffered: false };

  function toCanvas(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / Math.max(1, rect.width);
    const scaleY = canvas.height / Math.max(1, rect.height);
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  }

  function onKeyDown(event) {
    if (!GAME_KEYS.has(event.code)) return;
    event.preventDefault();
    if (!event.repeat) pressed.add(event.code);
    held.add(event.code);
  }

  function onKeyUp(event) {
    held.delete(event.code);
  }

  function onMouseMove(event) {
    const p = toCanvas(event.clientX, event.clientY);
    mouse.x = p.x;
    mouse.y = p.y;
  }

  function onMouseDown(event) {
    if (event.button !== 0) return;
    const p = toCanvas(event.clientX, event.clientY);
    mouse.x = p.x;
    mouse.y = p.y;
    mouse.down = true;
    mouse.buffered = true;
  }

  function onMouseUp(event) {
    if (event.button !== 0) return;
    mouse.down = false;
  }

  function onBlur() {
    held.clear();
    mouse.down = false; mouse.buffered = false;
  }

  function onContextMenu(event) {
    event.preventDefault();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('contextmenu', onContextMenu);

  return {
    held,
    pressed,
    mouse,
    // True while the key is held down.
    isDown(code) {
      return held.has(code);
    },
    // True if the key went down since the last endFrame(); consumes it.
    takePressed(code) {
      if (!pressed.has(code)) return false;
      pressed.delete(code);
      return true;
    },
    // True if the key went down since the last endFrame(); does not consume.
    wasPressed(code) {
      return pressed.has(code);
    },
    // Call once per rendered frame, after the game has read the edges.
    endFrame() {
      pressed.clear();
    },
    detach() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('contextmenu', onContextMenu);
    },
  };
}

// Movement intent from WASD or the arrow keys, as a unit-ish vector.
const movement = {x:0,y:0};
export function moveVector(input) {
  let x = 0;
  let y = 0;
  if (input.isDown('KeyA') || input.isDown('ArrowLeft')) x -= 1;
  if (input.isDown('KeyD') || input.isDown('ArrowRight')) x += 1;
  if (input.isDown('KeyW') || input.isDown('ArrowUp')) y -= 1;
  if (input.isDown('KeyS') || input.isDown('ArrowDown')) y += 1;
  if (x !== 0 && y !== 0) {
    const inv = 1 / Math.sqrt(2);
    x *= inv;
    y *= inv;
  }
  movement.x = x; movement.y = y;
  return movement;
}
