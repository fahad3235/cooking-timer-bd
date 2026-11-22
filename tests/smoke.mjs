// Headless-Chrome smoke test for Cooking Timer BD.
// Drives the Playwright-cached headless_shell over CDP with Node's built-in
// WebSocket (no npm deps). Run from the project root:
//   node tests/smoke.mjs [1280|390]
// Exits 0 only if every check passes.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = path.join(process.env.HOME, '.cache/ms-playwright/chromium_headless_shell-1187/chrome-linux/headless_shell');
const PORT = 9229;
const WIDTH = parseInt(process.argv[2] || '1280', 10);
const HEIGHT = WIDTH <= 480 ? 844 : 800;
const URL = 'file://' + path.join(ROOT, 'index.html');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, timeout = 15000, label = 'condition') {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    try { if (await fn()) return true; } catch { /* retry */ }
    await sleep(150);
  }
  throw new Error('timeout waiting for ' + label);
}

const chrome = spawn(CHROME, [
  '--headless=new', '--no-sandbox', '--disable-gpu',
  '--remote-debugging-port=' + PORT,
  '--window-size=' + WIDTH + ',' + HEIGHT,
  'about:blank',
], { stdio: 'ignore' });

let ws;
try {
  let targets = null;
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      targets = await res.json();
      break;
    } catch { await sleep(250); }
  }
  if (!targets) throw new Error('DevTools endpoint never came up');

  const pageTarget = targets.find((t) => t.type === 'page');
  ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let id = 0;
  const pending = new Map();
  const consoleErrors = [];
  const failedReqs = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    if (msg.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(msg.params.exceptionDetails.text + ' ' + (msg.params.exceptionDetails.exception?.description || ''));
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      consoleErrors.push(msg.params.args.map((a) => a.value || a.description || '').join(' '));
    }
    if (msg.method === 'Network.loadingFailed') {
      failedReqs.push(msg.params.errorText);
    }
  };
  const send = (method, params = {}) => new Promise((resolve) => {
    const mid = ++id;
    pending.set(mid, resolve);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) throw new Error('page JS error: ' + JSON.stringify(r.result.exceptionDetails));
    return r.result?.result?.value;
  };
  const setVal = async (elId, value) => {
    await evalJs(`document.getElementById("${elId}").value = ${JSON.stringify(value)}`);
  };

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: WIDTH <= 480 });
  await send('Page.navigate', { url: URL });
  await waitFor(async () => (await evalJs('document.readyState')) === 'complete', 15000, 'page load');
  await sleep(500);

  console.log(`smoke @ ${WIDTH}x${HEIGHT}: ${URL}`);
  check('page title', (await evalJs('document.title')).includes('Cooking Timer BD'));
  check('app heading rendered', (await evalJs('document.querySelector("h1").textContent')) === 'Cooking Timer BD');
  check('10 preset buttons', (await evalJs('document.querySelectorAll("#presets .preset").length')) === 10);
  check('preset Tea shows 03:00', (await evalJs('[...document.querySelectorAll("#presets .preset")].find(b => b.textContent.includes("Tea")).textContent')).includes('03:00'));
  check('preset Cake shows 35:00', (await evalJs('[...document.querySelectorAll("#presets .preset")].find(b => b.textContent.includes("Cake")).textContent')).includes('35:00'));
  check('0 active at start', (await evalJs('document.getElementById("activeCount").textContent')) === '0 active');
  check('empty active state visible', (await evalJs('document.getElementById("emptyActive").offsetParent !== null')));
  check('empty finished state visible', (await evalJs('document.getElementById("emptyDone").offsetParent !== null')));
  check('no console errors on load', consoleErrors.length === 0, consoleErrors.join(' | '));
  check('no failed requests on load', failedReqs.length === 0, failedReqs.join(' | '));

  // Validation: submit with no duration -> error, no timer.
  await evalJs('document.querySelector("#timerForm button[type=submit]").click()');
  await sleep(300);
  check('empty submit shows error', (await evalJs('document.getElementById("formError").style.display')) !== 'none');
  check('empty submit creates no timer', (await evalJs('document.querySelectorAll("#activeList .timer-card").length')) === 0);
  check('error text mentions 1 second', (await evalJs('document.getElementById("formError").textContent')).includes('1 second'));

  // Validation: 60 minutes -> out-of-range error.
  await setVal('inM', '60');
  await evalJs('document.querySelector("#timerForm button[type=submit]").click()');
  await sleep(300);
  check('60 minutes rejected', (await evalJs('document.getElementById("formError").textContent')).includes('0–59'));
  check('still no timer', (await evalJs('document.querySelectorAll("#activeList .timer-card").length')) === 0);

  // Add a custom 5-second timer named Dal.
  await setVal('inName', 'Dal');
  await setVal('inM', '0');
  await setVal('inS', '5');
  await evalJs('document.querySelector("#timerForm button[type=submit]").click()');
  await sleep(400);
  check('custom timer card appears', (await evalJs('document.querySelectorAll("#activeList .timer-card").length')) === 1);
  check('card name is Dal', (await evalJs('document.querySelector("#activeList .timer-card h3").textContent')) === 'Dal');
  check('card shows 00:0x countdown', /^00:0[0-5]$/.test(await evalJs('document.querySelector("#activeList .timer-card .timer-time").textContent')),
    await evalJs('document.querySelector("#activeList .timer-card .timer-time").textContent'));
  check('count badge is 1 active', (await evalJs('document.getElementById("activeCount").textContent')) === '1 active');
  check('error hidden after valid submit', (await evalJs('document.getElementById("formError").style.display')) === 'none');
  check('pause button present', (await evalJs('document.querySelector("#activeList .timer-card [data-act=pause]") !== null')));
  check('add-1-min button present', (await evalJs('document.querySelector("#activeList .timer-card [data-act=add1]") !== null')));
  check('progress bar present', (await evalJs('document.querySelector("#activeList .timer-card .progress-fill") !== null')));

  // Countdown actually ticks down.
  const t1 = await evalJs('document.querySelector("#activeList .timer-card .timer-time").textContent');
  await sleep(1600);
  const t2 = await evalJs('document.querySelector("#activeList .timer-card .timer-time").textContent');
  check('countdown ticks down', t1 !== t2, t1 + ' -> ' + t2);

  // Pause freezes it; resume restarts it.
  await evalJs('document.querySelector("#activeList .timer-card [data-act=pause]").click()');
  await sleep(300);
  check('status Paused after pause', (await evalJs('document.querySelector("#activeList .timer-card .status").textContent')) === 'Paused');
  const p1 = await evalJs('document.querySelector("#activeList .timer-card .timer-time").textContent');
  await sleep(1200);
  const p2 = await evalJs('document.querySelector("#activeList .timer-card .timer-time").textContent');
  check('paused countdown frozen', p1 === p2, p1 + ' vs ' + p2);
  await evalJs('document.querySelector("#activeList .timer-card [data-act=add1]").click()');
  await sleep(300);
  const p3 = await evalJs('document.querySelector("#activeList .timer-card .timer-time").textContent');
  check('+1 min adds a minute while paused', p3.startsWith('01:0'), p3);
  await evalJs('document.querySelector("#activeList .timer-card [data-act=resume]").click()');
  await sleep(300);
  check('status Running after resume', (await evalJs('document.querySelector("#activeList .timer-card .status").textContent')) === 'Running');

  // Reset restores the full 5 seconds.
  await evalJs('document.querySelector("#activeList .timer-card [data-act=reset]").click()');
  await sleep(300);
  check('reset restores ~00:05 (00:04 or 00:05, it counts down at once)',
    /^00:0[45]$/.test(await evalJs('document.querySelector("#activeList .timer-card .timer-time").textContent')),
    await evalJs('document.querySelector("#activeList .timer-card .timer-time").textContent'));

  // Preset click adds a second timer (Tea, 03:00).
  await evalJs('[...document.querySelectorAll("#presets .preset")].find(b => b.textContent.includes("Tea")).click()');
  await sleep(400);
  check('preset adds a timer (2 active)', (await evalJs('document.querySelectorAll("#activeList .timer-card").length')) === 2);
  check('count badge is 2 active', (await evalJs('document.getElementById("activeCount").textContent')) === '2 active');

  // Delete the Tea timer; the Dal timer remains.
  await evalJs('[...document.querySelectorAll("#activeList .timer-card")].find(c => c.querySelector("h3").textContent === "Tea").querySelector("[data-act=delete]").click()');
  await sleep(300);
  check('delete removes Tea (1 active)', (await evalJs('document.querySelectorAll("#activeList .timer-card").length')) === 1);
  check('Dal still there', (await evalJs('document.querySelector("#activeList .timer-card h3").textContent')) === 'Dal');

  // Let the 5-second Dal timer finish.
  await waitFor(async () => (await evalJs('document.querySelectorAll("#doneList .timer-card").length')) === 1, 8000, 'timer finishes');
  check('finished timer moves to Finished', (await evalJs('document.querySelectorAll("#doneList .timer-card").length')) === 1);
  check('finished card shows Done!', (await evalJs('document.querySelector("#doneList .timer-card .status").textContent')) === 'Done!');
  check('finished card time is 00:00', (await evalJs('document.querySelector("#doneList .timer-card .timer-time").textContent')) === '00:00');
  check('active list empty again', (await evalJs('document.querySelectorAll("#activeList .timer-card").length')) === 0);
  check('count badge back to 0 active', (await evalJs('document.getElementById("activeCount").textContent')) === '0 active');
  check('clear-finished button visible', (await evalJs('document.getElementById("clearFinished").offsetParent !== null')));

  // Dismiss the finished timer.
  await evalJs('document.querySelector("#doneList .timer-card [data-act=dismiss]").click()');
  await sleep(300);
  check('dismiss clears finished', (await evalJs('document.querySelectorAll("#doneList .timer-card").length')) === 0);

  // Persistence across reload: add a 3-minute timer, reload, still there.
  await evalJs('[...document.querySelectorAll("#presets .preset")].find(b => b.textContent.includes("Rice")).click()');
  await sleep(400);
  check('Rice preset added', (await evalJs('document.querySelectorAll("#activeList .timer-card").length')) === 1);
  await send('Page.navigate', { url: URL });
  await waitFor(async () => (await evalJs('document.readyState')) === 'complete', 15000, 'reload');
  await sleep(500);
  check('timer persists across reload', (await evalJs('document.querySelectorAll("#activeList .timer-card").length')) === 1);
  check('persisted name is Rice', (await evalJs('document.querySelector("#activeList .timer-card h3").textContent')) === 'Rice');
  check('persisted timer still counts (19:5x)', /^19:5[0-9]$/.test(await evalJs('document.querySelector("#activeList .timer-card .timer-time").textContent')),
    await evalJs('document.querySelector("#activeList .timer-card .timer-time").textContent'));

  // Language toggle to Bangla.
  await evalJs('document.getElementById("langBtn").click()');
  await sleep(300);
  const bnTitle = await evalJs('document.querySelector("h1").textContent');
  check('BN title after toggle', bnTitle === 'রান্নার টাইমার বিডি', bnTitle);
  check('BN countdown uses Bengali digits', /১৯/.test(await evalJs('document.querySelector("#activeList .timer-card .timer-time").textContent')),
    await evalJs('document.querySelector("#activeList .timer-card .timer-time").textContent'));
  check('BN preset name', (await evalJs('[...document.querySelectorAll("#presets .preset")].find(b => b.textContent.includes("চা")).textContent')).includes('০৩:০০'));
  await evalJs('document.getElementById("langBtn").click()');
  await sleep(300);
  check('back to EN title', (await evalJs('document.querySelector("h1").textContent')) === 'Cooking Timer BD');

  // Sound toggle.
  await evalJs('document.getElementById("soundBtn").click()');
  await sleep(200);
  check('sound toggle shows Sound off', (await evalJs('document.getElementById("soundBtn").textContent')) === 'Sound off');
  await evalJs('document.getElementById("soundBtn").click()');
  await sleep(200);
  check('sound toggle back to Sound on', (await evalJs('document.getElementById("soundBtn").textContent')) === 'Sound on');

  // No horizontal overflow at this viewport.
  const overflow = await evalJs('document.documentElement.scrollWidth - document.documentElement.clientWidth');
  check('no horizontal overflow', overflow === 0, 'overflow=' + overflow);

  check('no console errors during whole run', consoleErrors.length === 0, consoleErrors.join(' | '));
  check('no failed requests during whole run', failedReqs.length === 0, failedReqs.join(' | '));

  // Screenshot for the run log (local only, not pushed).
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(ROOT, 'tests', `smoke-${WIDTH}.png`), Buffer.from(shot.result.data, 'base64'));
  console.log(`screenshot saved: tests/smoke-${WIDTH}.png`);
} catch (e) {
  console.log('  FAIL smoke harness error :: ' + (e && e.message ? e.message : e));
  fail++;
} finally {
  try { if (ws) ws.close(); } catch { /* ignore */ }
  chrome.kill();
}

console.log(`\nsmoke @ ${WIDTH}: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
