import { execFileSync, execSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd(), 'migration/fabklean/raw');
const OUT_DIR = path.join(ROOT, 'payments');
const ERROR_DIR = path.join(ROOT, 'errors');
const CONTEXT_ID = 10509;
let cachedTarget = null;

await mkdir(OUT_DIR, { recursive: true });
await mkdir(ERROR_DIR, { recursive: true });

const findFabkleanTarget = () => {
  const apple = `
    tell application "Google Chrome"
      set wi to 1
      repeat with w in windows
        set ti to 1
        repeat with t in tabs of w
          if (URL of t starts with "https://app.fabklean.com/outlet/") and (loading of t is false) then
            return (wi as text) & ":" & (ti as text)
          end if
          set ti to ti + 1
        end repeat
        set wi to wi + 1
      end repeat
      error "No loaded Fabklean outlet tab found"
    end tell
  `;
  const value = execFileSync('osascript', ['-e', apple], { encoding: 'utf8' }).trim();
  const [wi, ti] = value.split(':').map((part) => Number.parseInt(part, 10));
  if (!wi || !ti) throw new Error(`Invalid Fabklean target: ${value}`);
  return [wi, ti];
};

const chromeEval = (js) => {
  const encoded = Buffer.from(js, 'utf8').toString('base64');
  const isAppleEventsError = (message) =>
    /Executing JavaScript through AppleScript is turned off|Invalid index|Can.t get tab|Can.t get item/.test(message);
  const recoverChrome = () => {
    try {
      execFileSync('osascript', ['-e', 'tell application "Google Chrome" to activate'], { stdio: 'ignore' });
    } catch {}
    cachedTarget = findFabkleanTarget();
  };
  const run = () => {
    const [windowIndex, tabIndex] = cachedTarget || (cachedTarget = findFabkleanTarget());
    const apple = `tell application "Google Chrome" to execute tab ${tabIndex} of window ${windowIndex} javascript "eval(atob(\`${encoded}\`))"`;
    const shellQuoted = `'${apple.replace(/'/g, `'\\''`)}'`;
    return execSync(`osascript -e ${shellQuoted}`, {
      encoding: 'utf8',
      maxBuffer: 80 * 1024 * 1024,
      shell: '/bin/zsh',
    }).trim();
  };
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return run();
    } catch (error) {
      const message = String(error.stderr || error.message || '');
      if (isAppleEventsError(message)) {
        recoverChrome();
        execFileSync('sleep', ['1']);
        continue;
      }
      throw error;
    }
  }
  throw new Error('Chrome Apple Events JavaScript failed repeatedly; stopping before writing partial Fabklean data');
};

const isFatalAutomationError = (error) =>
  /Chrome Apple Events JavaScript failed repeatedly|Executing JavaScript through AppleScript is turned off/.test(String(error?.message || error));

const getJson = (url) => {
  const js = `
    try {
      var x = new XMLHttpRequest();
      x.open("GET", ${JSON.stringify(url)}, false);
      x.send(null);
      JSON.stringify({ ok: x.status >= 200 && x.status < 300, status: x.status, body: x.responseText });
    } catch (e) {
      JSON.stringify({ ok: false, status: 0, error: e.name + ": " + e.message });
    }
  `;
  const response = JSON.parse(chromeEval(js));
  if (!response.ok) throw new Error(`${response.status} ${response.error || response.body?.slice(0, 300) || ''}`);
  return JSON.parse(response.body);
};

const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'orders_index.json'), 'utf8'));
const orderIds = process.env.RETRY_ERRORS === '1'
  ? fs.readdirSync(ERROR_DIR)
      .filter((name) => /^payment_.*\.json$/.test(name))
      .map((name) => name.replace(/^payment_/, '').replace(/\.json$/, ''))
  : index.orderIds || [];

for (let i = 0; i < orderIds.length; i += 1) {
  const id = orderIds[i];
  try {
    const first = getJson(`paymentReceiveds/pageSearching.json?query=baseOrderId-${id},paidAgainst:ORDERS&orderByCal=id&orderBy=true&contextId=${CONTEXT_ID}&pageSize=100&pageNo=1`);
    const pages = [first];
    for (let page = 2; page <= (first.totalPages || 1); page += 1) {
      pages.push(getJson(`paymentReceiveds/pageSearching.json?query=baseOrderId-${id},paidAgainst:ORDERS&orderByCal=id&orderBy=true&contextId=${CONTEXT_ID}&pageSize=100&pageNo=${page}`));
    }
    await writeFile(path.join(OUT_DIR, `payment_${id}.json`), JSON.stringify(pages, null, 2));
    fs.rmSync(path.join(ERROR_DIR, `payment_${id}.json`), { force: true });
  } catch (error) {
    if (isFatalAutomationError(error)) throw error;
    await writeFile(path.join(ERROR_DIR, `payment_${id}.json`), JSON.stringify({ id, error: error.message }, null, 2));
  }
  if ((i + 1) % 50 === 0 || i + 1 === orderIds.length) {
    console.log(`saved payments ${i + 1}/${orderIds.length}`);
  }
}

console.log('Fabklean payment extraction complete');
