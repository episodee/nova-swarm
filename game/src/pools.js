// Fixed-capacity pools: event emission and retirement never construct objects.
export function makePool(count, factory) {
  const free = [];
  for (let i = 0; i < count; i++) free.push(factory());
  return free;
}
export function take(pool, active) {
  const value = pool.pop();
  if (!value) return null;
  active.push(value);
  return value;
}
export function retire(pool, active, index) {
  pool.push(active[index]);
  active[index] = active[active.length - 1];
  active.pop();
}
export function clearPool(pool, active) {
  while (active.length) pool.push(active.pop());
}
export function particle(state, kind, x, y, color, life) {
  const p = take(state.particlePool, state.particles);
  if (!p) return null;
  p.kind = kind; p.x = x; p.y = y; p.color = color;
  p.life = life; p.maxLife = life; p.vx = 0; p.vy = 0;
  return p;
}
export function floater(state, x, y, text, color, crit = false) {
  const f = take(state.floaterPool, state.floaters);
  if (!f) return;
  f.x = x; f.y = y; f.text = text; f.color = color;
  f.life = 0.9; f.maxLife = 0.9; f.crit = crit;
}
