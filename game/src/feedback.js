// Visual feedback advances in real time, independently of the fixed sim.
export function hitStop(state, seconds) {
  state.stopId += 1;
  state.stopOwner = state.stopId;
  state.stopT = Math.min(0.149, seconds);
  state.timeScale = 0;
}
export function updateFeedback(state, dt) {
  state.realTime += dt;
  if (state.stopT > 0) {
    const owner = state.stopOwner;
    state.stopT = Math.max(0, state.stopT - dt);
    if (state.stopT === 0 && owner === state.stopId) state.timeScale = 1;
  }
  state.shake = Math.max(0, state.shake - dt * 2.2);
  state.hurtFlash = Math.max(0, state.hurtFlash - dt * 4);
  state.muzzleT = Math.max(0, state.muzzleT - dt);
  state.pickupT = Math.max(0, state.pickupT - dt);
  if (state.pickupT === 0) state.shipScale = 1;
  else {
    const t = 1 - state.pickupT / 0.12;
    const q = t - 1;
    const ease = 1 + 2.70158 * q * q * q + 1.70158 * q * q;
    state.shipScale = 1 + 0.15 * (1 - ease);
  }
  state.zoomT = Math.max(0, state.zoomT - dt);
  const target = state.reduceMotion ? 1 : state.zoomT > 0 ? 1.038 : 1;
  state.zoom += (target - state.zoom) * (1 - Math.exp(-6 * dt));
  if (state.zoomT === 0 && Math.abs(state.zoom - 1) < 0.00001) state.zoom = 1;
}
