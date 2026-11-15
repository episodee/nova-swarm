// Headless playtest for NOVA SWARM: starts with Enter, moves with WASD,
// aims/shoots with the mouse, holds fire, and asserts the live game works —
// score and kills grow, the wave advances, a forced level-up shows three
// upgrade cards and picking one applies, and game over + restart work.
// Asserts 0 console errors, 0 pageerrors, 0 failed/non-local requests.
// Note: headless SwiftShader renders slowly, so the test waits on *sim*
// time (window.__nova.time), not wall time.
import { createRequire } from 'node:module';
const require = createRequire('/home/hatch/workspace/makefun/playwright-setup/');
const { chromium } = require('playwright-core');
import { spawn } from 'node:child_process';

const ROOT = '/home/hatch/workspace/makefun/best-game-01';
const server = spawn('node', ['serve.ts', '--port', '8081'], { cwd: ROOT, stdio: 'pipe' });
await new Promise((r) => setTimeout(r, 1200));

const browser = await chromium.launch({
  executablePath: '/home/hatch/.cache/ms-playwright/chromium-1148/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const failures = [];
function check(cond, label) {
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + label);
  if (!cond) failures.push(label);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
const failedRequests = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('requestfailed', (r) => failedRequests.push(r.url()));
page.on('request', (r) => { if (!r.url().startsWith('http://localhost:8081')) failedRequests.push('non-local: ' + r.url()); });

await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded' });
await sleep(1000);
let nova = await page.evaluate(() => window.__nova);
check(nova.screen === 'title', `title screen shown (got ${nova.screen})`);

// Start with Enter.
await page.keyboard.press('Enter');
await page.waitForFunction(() => window.__nova.screen === 'play', { timeout: 15000 });
nova = await page.evaluate(() => window.__nova);
check(nova.screen === 'play', `playing after Enter (got ${nova.screen})`);

// Play until 18 sim-seconds: hold fire, aim around the swarm, move with WASD.
await page.mouse.move(900, 300);
await page.mouse.down();
const moveKeys = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
let keyIndex = 0;
let lastKey = null;
const playDeadline = Date.now() + 90000;
while (Date.now() < playDeadline) {
  nova = await page.evaluate(() => window.__nova);
  if (nova.time >= 18) break;
  const key = moveKeys[keyIndex % 4];
  keyIndex += 1;
  if (lastKey) await page.keyboard.up(lastKey);
  await page.keyboard.down(key);
  lastKey = key;
  await page.mouse.move(640 + Math.cos(keyIndex * 0.9) * 320, 360 + Math.sin(keyIndex * 0.9) * 200);
  await sleep(700);
}
if (lastKey) await page.keyboard.up(lastKey);
await page.mouse.up();
nova = await page.evaluate(() => window.__nova);
console.log('after play (sim ' + nova.time + 's): ' + JSON.stringify(nova));
check(nova.screen === 'play', `still playing after sim ${nova.time}s (got ${nova.screen})`);
check(nova.time >= 18, `sim time reached 18s (got ${nova.time})`);
check(nova.score > 0, `score > 0 (got ${nova.score})`);
check(nova.kills > 0, `kills > 0 (got ${nova.kills})`);
check(nova.wave >= 1 && (nova.wave > 1 || nova.enemies > 0 || nova.kills > 0), `wave/enemies active (wave ${nova.wave}, enemies ${nova.enemies})`);
// Waves keep coming: poll briefly until the next wave has spawned (breather
// after a wave clear legitimately shows 0 enemies for ~3 s).
let waveAdvanced = nova.wave > 1 || nova.enemies > 0;
for (let i = 0; i < 10 && !waveAdvanced; i += 1) {
  await sleep(700);
  nova = await page.evaluate(() => window.__nova);
  waveAdvanced = nova.wave > 1 || nova.enemies > 0;
}
check(waveAdvanced, `next wave spawns after clear (wave ${nova.wave}, enemies ${nova.enemies})`);

// Pause and resume.
await page.keyboard.press('KeyP');
await page.waitForFunction(() => window.__nova.screen === 'paused', { timeout: 15000 });
nova = await page.evaluate(() => window.__nova);
check(nova.screen === 'paused', `paused with P (got ${nova.screen})`);
await page.keyboard.press('KeyP');
await page.waitForFunction(() => window.__nova.screen === 'play', { timeout: 15000 });
nova = await page.evaluate(() => window.__nova);
check(nova.screen === 'play', `resumed with P (got ${nova.screen})`);

// Force level-ups (200 XP chains through several) and pick cards until back to play.
const upgradesBefore = nova.upgrades;
await page.evaluate(() => window.__novaDebug.addXp(200));
await page.waitForFunction(() => window.__nova.screen === 'levelup', { timeout: 15000 });
nova = await page.evaluate(() => window.__nova);
check(nova.screen === 'levelup', `level-up screen shown (got ${nova.screen})`);
check(nova.pending === 3, `three upgrade cards offered (got ${nova.pending})`);
let picked = 0;
for (let i = 0; i < 6; i += 1) {
  nova = await page.evaluate(() => window.__nova);
  if (nova.screen !== 'levelup') break;
  await page.keyboard.press('Digit1');
  picked += 1;
  await sleep(1200);
}
nova = await page.evaluate(() => window.__nova);
check(nova.screen === 'play', `back to play after picking cards (got ${nova.screen}, picked ${picked})`);
check(nova.upgrades >= upgradesBefore + 1, `upgrade applied (upgrades ${upgradesBefore} -> ${nova.upgrades})`);
check(nova.pending === 0, `no pending choices after picks (got ${nova.pending})`);

// Force game over: drop HP to 1 and wait for the swarm to land a hit.
await page.evaluate(() => window.__novaDebug.setHp(1));
let over = false;
try {
  await page.waitForFunction(() => window.__nova.screen === 'over', { timeout: 60000 });
  over = true;
} catch { over = false; }
nova = await page.evaluate(() => window.__nova);
check(over, `game-over screen reached (screen ${nova.screen}, hp ${nova.hp})`);
console.log('game over stats: ' + JSON.stringify(nova));

// Restart with R: fresh game, score reset.
await page.keyboard.press('KeyR');
await page.waitForFunction(() => window.__nova.screen === 'play', { timeout: 15000 });
nova = await page.evaluate(() => window.__nova);
check(nova.screen === 'play', `restarted with R (got ${nova.screen})`);
check(nova.score === 0 && nova.kills === 0 && nova.wave === 1, `score/kills/wave reset (score ${nova.score}, kills ${nova.kills}, wave ${nova.wave})`);

check(errors.length === 0, `0 console errors / pageerrors (got ${errors.length}${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''})`);
check(failedRequests.length === 0, `0 failed/non-local requests (got ${failedRequests.length}${failedRequests.length ? ': ' + failedRequests.slice(0, 3).join(' | ') : ''})`);

await browser.close();
server.kill();
console.log(failures.length === 0 ? 'PLAYTEST_OK' : 'PLAYTEST_FAILURES=' + failures.length + ': ' + failures.join('; '));
process.exit(failures.length === 0 ? 0 : 1);
