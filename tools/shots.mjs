// Screenshot runner for NOVA SWARM: serves game/ on :8080, opens each ?shot=
// pose from shots.json in headless Chromium (SwiftShader), waits for
// window.__shotReady, captures a 1280x480 JPEG, and reports console errors.
// Quality steps down until every shot fits the 256 KiB cap. Real renders of
// the game's code — never edited or composited.
import { createRequire } from 'node:module';
const require = createRequire('/home/hatch/workspace/makefun/playwright-setup/');
const { chromium } = require('playwright-core');
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = '/home/hatch/workspace/makefun/best-game-01';
const shots = JSON.parse(readFileSync(ROOT + '/shots.json', 'utf8'));
const outDir = process.argv[2] || ROOT + '/screenshots';
const MAX_BYTES = 262144;

const server = spawn('node', ['serve.ts', '--port', '8080'], { cwd: ROOT, stdio: 'pipe' });
await new Promise((r) => setTimeout(r, 1200));

const browser = await chromium.launch({
  executablePath: '/home/hatch/.cache/ms-playwright/chromium-1148/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
let failures = 0;
for (const { name, query } of shots) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 480 } });
  const errors = [];
  const failedRequests = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('requestfailed', (r) => failedRequests.push(r.url()));
  page.on('request', (r) => { if (!r.url().startsWith('http://localhost:8080')) failedRequests.push('non-local: ' + r.url()); });
  await page.goto('http://localhost:8080/' + query, { waitUntil: 'domcontentloaded' });
  try {
    await page.waitForFunction(() => window.__shotReady === true, { timeout: 60000 });
  } catch {
    console.log(name + ': TIMEOUT waiting for __shotReady');
    failures++;
  }
  const nova = await page.evaluate(() => window.__nova);
  console.log(name + ': __nova ' + JSON.stringify(nova));
  await new Promise((r) => setTimeout(r, 300));
  let quality = 82;
  let buf = await page.screenshot({ type: 'jpeg', quality });
  while (buf.length > MAX_BYTES && quality > 40) {
    quality -= 10;
    buf = await page.screenshot({ type: 'jpeg', quality });
  }
  writeFileSync(outDir + '/' + name, buf);
  console.log(`${name}: ${buf.length} bytes (quality ${quality}), console errors: ${errors.length}, failed/non-local requests: ${failedRequests.length}` + (errors.length ? ' :: ' + errors.slice(0, 3).join(' | ') : '') + (failedRequests.length ? ' :: ' + failedRequests.slice(0, 3).join(' | ') : ''));
  if (errors.length || failedRequests.length || buf.length > MAX_BYTES) failures++;
  await page.close();
}
await browser.close();
server.kill();
console.log(failures === 0 ? 'SHOTS_OK' : 'SHOTS_WITH_ISSUES=' + failures);
process.exit(failures === 0 ? 0 : 1);
