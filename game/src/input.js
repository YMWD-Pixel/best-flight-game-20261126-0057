// Keyboard and mouse steering. Arrow keys / WASD fly the plane; the mouse
// steers too (hold the left button and move), so the game plays with either.
// Space is the brake, P pauses, M mutes, Enter confirms a screen.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MUTE = 4;
export const ACTION_MISSION_1 = 8;
export const ACTION_MISSION_2 = 16;
export const ACTION_MISSION_3 = 32;
export const ACTION_RESTART = 64;

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let mouseSteer = false;
  let mouseX = 0;
  let mouseY = 0;
  let mouseActive = false;

  function onKeyDown(e) {
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === 'Space' || e.code === 'Enter') {
      actions |= ACTION_CONFIRM;
      e.preventDefault();
    }
    if (e.code === 'KeyP' || e.code === 'Escape') actions |= ACTION_PAUSE;
    if (e.code === 'KeyM') actions |= ACTION_MUTE;
    if (e.code === 'Digit1') actions |= ACTION_MISSION_1;
    if (e.code === 'Digit2') actions |= ACTION_MISSION_2;
    if (e.code === 'Digit3') actions |= ACTION_MISSION_3;
    if (e.code === 'KeyR') actions |= ACTION_RESTART;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  }

  function onKeyUp(e) {
    keys.delete(e.code);
  }

  function onMouseDown(e) {
    if (e.button === 0) {
      mouseSteer = true;
      mouseActive = true;
      mouseX = 0;
      mouseY = 0;
    }
  }

  function onMouseMove(e) {
    if (!mouseSteer) return;
    const rect = canvas.getBoundingClientRect();
    mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouseY = ((e.clientY - rect.top) / rect.height) * 2 - 1;
  }

  function onMouseUp() {
    mouseSteer = false;
    mouseActive = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);

  let throttle = 0;
  let targetThrottle = 0;

  /** Read the stick and throttle for this frame; call once per frame. */
  function read(dt) {
    // Throttle: W / Shift up, S / Ctrl down; it eases toward the target.
    if (keys.has('KeyW') || keys.has('ShiftLeft') || keys.has('ShiftRight')) targetThrottle = 1;
    else if (keys.has('KeyS') || keys.has('ControlLeft')) targetThrottle = 0;
    const rate = 1.4;
    throttle += Math.sign(targetThrottle - throttle) * Math.min(Math.abs(targetThrottle - throttle), rate * dt);
    throttle = Math.max(0, Math.min(1, throttle));

    let pitch = 0;
    let roll = 0;
    if (keys.has('ArrowUp') || keys.has('KeyI')) pitch += 1;
    if (keys.has('ArrowDown') || keys.has('KeyK')) pitch -= 1;
    if (keys.has('ArrowLeft') || keys.has('KeyJ')) roll -= 1;
    if (keys.has('ArrowRight') || keys.has('KeyL')) roll += 1;
    if (mouseActive) {
      pitch -= mouseY * 0.9;
      roll += mouseX * 1.1;
    }
    return {
      pitch: Math.max(-1, Math.min(1, pitch)),
      roll: Math.max(-1, Math.min(1, roll)),
      throttle,
      brake: keys.has('Space'),
    };
  }

  function takeActions() {
    const a = actions;
    actions = 0;
    return a;
  }

  function setThrottle(v) {
    throttle = v;
    targetThrottle = v;
  }

  return { read, takeActions, setThrottle };
}
