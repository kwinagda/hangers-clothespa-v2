import { execFileSync, execSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(process.cwd(), 'migration/fabklean/raw/challans');
const CONTEXT_ID = Number(process.env.FABKLEAN_CONTEXT_ID || 10509);
const WINDOW_INDEX = Number(process.env.CHROME_WINDOW || 0);
const TAB_INDEX = Number(process.env.CHROME_TAB || 0);
const PAGE_SIZE = Number(process.env.PAGE_SIZE || 150);
const TYPE = process.env.CHALLAN_TYPE || 'SEND_STORE_TO_PLANT';

const dirs = {
  lists: path.join(ROOT, 'pages'),
  details: path.join(ROOT, 'details'),
  errors: path.join(ROOT, 'errors'),
};

let cachedTarget = null;

for (const dir of Object.values(dirs)) {
  await mkdir(dir, { recursive: true });
}

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
    const [windowIndex, tabIndex] =
      WINDOW_INDEX > 0 && TAB_INDEX > 0
        ? [WINDOW_INDEX, TAB_INDEX]
        : cachedTarget || (cachedTarget = findFabkleanTarget());
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
      if (WINDOW_INDEX === 0 && TAB_INDEX === 0 && isAppleEventsError(message)) {
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

const fetchJson = (url) => {
  const js = `
    try {
      var x = new XMLHttpRequest();
      x.open("GET", ${JSON.stringify(url)}, false);
      x.send(null);
      JSON.stringify({ ok: x.status >= 200 && x.status < 300, status: x.status, body: x.responseText.slice(0) });
    } catch (e) {
      JSON.stringify({ ok: false, status: 0, error: e.name + ": " + e.message });
    }
  `;
  const response = JSON.parse(chromeEval(js));
  if (!response.ok) {
    throw new Error(`${response.status} ${response.error || response.body?.slice(0, 300) || ''}`);
  }
  return JSON.parse(response.body);
};

const writeJson = async (filePath, data) => {
  await writeFile(filePath, JSON.stringify(data, null, 2));
};

const safeName = (value) =>
  String(value || 'unknown')
    .replace(/[^a-zA-Z0-9_.-]/g, '_')
    .slice(0, 160);

const payloadFields = [
  'id',
  'orderId',
  'orderDate',
  'plantId',
  'bankName',
  'deliveryUser.phoneNumber',
  'deliveryUser.name',
  'deliveryUser.id',
  'createdBy.phoneNumber',
  'createdBy.name',
  'createdBy.id',
  'salesPerson.phoneNumber',
  'salesPerson.name',
  'salesPerson.id',
  'invoiceStatus',
  'organization.name',
  'tags',
  'dcNumber',
  'plantsentDate',
  'quantity',
  'plantDeliveryDate',
  'value0',
  'value1',
].join(',');

const listUrl = (pageNo) =>
  `dcInvoices/allDcs?contextId=${CONTEXT_ID}` +
  `&payloadFields=${encodeURIComponent(payloadFields)}` +
  `&orderBy=id&sortabbleType=desc&pageSize=${PAGE_SIZE}&pageNo=${pageNo}` +
  `&type=${encodeURIComponent(TYPE)}&soKey=`;

const detailUrl = (id) => `dcInvoices/viewDcInv?id=${id}&orgType=SINGLE&orgId=${CONTEXT_ID}`;

const active = chromeEval('document.title + "\\n" + location.href');
if (!active.includes('https://app.fabklean.com/outlet/')) {
  throw new Error(`Chrome tab is not Fabklean outlet: ${active}`);
}

console.log(`Fabklean tab OK: ${active.replace(/\n/g, ' | ')}`);
console.log(`Pulling challans: type=${TYPE}, pageSize=${PAGE_SIZE}`);

const firstPage = fetchJson(listUrl(1));
await writeJson(path.join(dirs.lists, 'challans_page_001.json'), firstPage);

const totalPages = firstPage.totalPages || 1;
const challans = [...(firstPage.objectList || [])];
console.log(`Challan pages: ${totalPages}, totalResult: ${firstPage.totalResult || challans.length}`);

for (let page = 2; page <= totalPages; page += 1) {
  const data = fetchJson(listUrl(page));
  await writeJson(path.join(dirs.lists, `challans_page_${String(page).padStart(3, '0')}.json`), data);
  challans.push(...(data.objectList || []));
  console.log(`saved challan page ${page}/${totalPages}, rows so far ${challans.length}`);
}

const uniqueChallans = [...new Map(challans.filter((item) => item?.id).map((item) => [String(item.id), item])).values()];

for (let i = 0; i < uniqueChallans.length; i += 1) {
  const challan = uniqueChallans[i];
  const out = { list: challan };
  try {
    out.detail = fetchJson(detailUrl(challan.id));
  } catch (error) {
    if (isFatalAutomationError(error)) throw error;
    out.detailError = error.message;
    await writeJson(path.join(dirs.errors, `challan_${safeName(challan.orderId || challan.id)}.json`), out);
  }
  await writeJson(path.join(dirs.details, `challan_${safeName(challan.orderId || challan.id)}.json`), out);
  if ((i + 1) % 20 === 0 || i + 1 === uniqueChallans.length) {
    console.log(`saved challan details ${i + 1}/${uniqueChallans.length}`);
  }
}

const orderNumbers = [...new Set(uniqueChallans.flatMap((challan) => String(challan.dcNumber || '').split(',').map((value) => value.trim()).filter(Boolean)))];
await writeJson(path.join(ROOT, 'challans_index.json'), {
  finishedAt: new Date().toISOString(),
  contextId: CONTEXT_ID,
  type: TYPE,
  totalPages,
  listedChallans: uniqueChallans.length,
  orderNumbers: orderNumbers.length,
  challanNumbers: uniqueChallans.map((challan) => challan.orderId).filter(Boolean),
});

console.log(`Fabklean challan extraction complete: ${uniqueChallans.length} challans, ${orderNumbers.length} unique order numbers`);
