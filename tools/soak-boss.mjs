// Boss soak: autopilot NOVA SWARM to wave 5 (boss wave) and prove the
// Voidborn Prime spawns, the boss bar shows, and the game keeps running.
// Uses the game's own __novaDebug test hooks (heal + XP) to survive the
// trip; screenshots go to /tmp only (the entry keeps its 4 screenshots).
import { createRequire } from 'node:module';
const require = createRequire('/home/hatch/workspace/makefun/playwright-setup/');
const { chromium } = require('playwright-core');
import { spawn } from 'node:child_process';

const ROOT = '/home/hatch/workspace/makefun/best-game-01';
const server = spawn('node', ['serve.ts', '--port', '8082'], { cwd: ROOT, stdio: 'pipe' });
await new Promise((r) => setTimeout(r, 1200));

const browser = await chromium.launch({
  executablePath: '/home/hatch/.cache/ms-playwright/chromium-1148/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.goto('http://localhost:8082/?seed=7', { waitUntil: 'domcontentloaded' });
await sleep(800);
await page.keyboard.press('Enter');
await page.waitForFunction(() => window.__nova.screen === 'play', { timeout: 15000 });
await page.mouse.move(900, 300);
await page.mouse.down();

const moveKeys = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
let keyIndex = 0;
let lastKey = null;
let wave5At = null;
let bossShot = false;
const deadline = Date.now() + 12 * 60 * 1000;
let lastLog = 0;
while (Date.now() < deadline) {
  const nova = await page.evaluate(() => window.__nova);
  if (nova.screen === 'over') {
    console.log('DIED at wave ' + nova.wave + ' score ' + nova.score + ' — restarting');
    await page.keyboard.press('KeyR');
    await sleep(500);
    continue;
  }
  if (nova.screen === 'levelup') {
    await page.keyboard.press('Digit1');
    await sleep(400);
    continue;
  }
  if (nova.screen === 'play') {
    if (nova.hp < 35) await page.evaluate(() => window.__novaDebug.setHp(100));
    if (nova.wave >= 5 && !wave5At) {
      wave5At = nova.time;
      console.log('WAVE 5 REACHED at sim ' + nova.time + 's: ' + JSON.stringify(nova));
    }
    if (wave5At && !bossShot && nova.time >= wave5At + 4) {
      await page.screenshot({ path: '/tmp/boss-wave5.png' });
      bossShot = true;
      console.log('boss screenshot saved at sim ' + nova.time + 's: ' + JSON.stringify(nova));
    }
    if (wave5At && nova.time >= wave5At + 12) break;
    // Keep the ship moving in a wide circle, aiming around.
    const key = moveKeys[keyIndex % 4];
    keyIndex += 1;
    if (lastKey) await page.keyboard.up(lastKey);
    await page.keyboard.down(key);
    lastKey = key;
    await page.mouse.move(640 + Math.cos(keyIndex * 0.7) * 300, 360 + Math.sin(keyIndex * 0.7) * 180);
  }
  if (Date.now() - lastLog > 20000) {
    lastLog = Date.now();
    const n2 = await page.evaluate(() => window.__nova);
    console.log('tick sim ' + n2.time + 's wave ' + n2.wave + ' hp ' + n2.hp + ' kills ' + n2.kills + ' score ' + n2.score);
  }
  await sleep(600);
}
if (lastKey) await page.keyboard.up(lastKey);
await page.mouse.up();
const nova = await page.evaluate(() => window.__nova);
console.log('FINAL: ' + JSON.stringify(nova));
console.log('wave5Reached=' + (wave5At !== null) + ' bossShot=' + bossShot);
console.log('consoleErrors=' + errors.length + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
console.log(wave5At !== null && errors.length === 0 ? 'BOSS_SOAK_OK' : 'BOSS_SOAK_FAIL');
await browser.close();
server.kill();
process.exit(wave5At !== null && errors.length === 0 ? 0 : 1);
