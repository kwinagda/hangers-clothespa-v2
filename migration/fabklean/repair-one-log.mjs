import { execSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const orderNumber = process.argv[2];
if (!orderNumber) throw new Error('Usage: node migration/fabklean/repair-one-log.mjs HCS-646');

const contextId = 10509;
const outPath = path.resolve(process.cwd(), `migration/fabklean/raw/order_logs/order_logs_${orderNumber}.json`);

const chromeEval = (js) => {
  const encoded = Buffer.from(js, 'utf8').toString('base64');
  const apple = `tell application "Google Chrome" to execute tab 6 of window 1 javascript "eval(atob(\`${encoded}\`))"`;
  const shellQuoted = `'${apple.replace(/'/g, `'\\''`)}'`;
  return execSync(`osascript -e ${shellQuoted}`, {
    encoding: 'utf8',
    maxBuffer: 40 * 1024 * 1024,
    shell: '/bin/zsh',
  }).trim();
};

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
  if (!response.ok) throw new Error(`${response.status} ${response.error || response.body}`);
  return JSON.parse(response.body);
};

const pages = [];
const first = getJson(`activityEvents/getAllsalesOrdervents.json?pageSize=30&pageNo=1&EntityType=salesOrder&orderId=${encodeURIComponent(orderNumber)}&contextId=${contextId}`);
pages.push(first);
for (let page = 2; page <= (first.totalPages || 1); page += 1) {
  pages.push(getJson(`activityEvents/getAllsalesOrdervents.json?pageSize=30&pageNo=${page}&EntityType=salesOrder&orderId=${encodeURIComponent(orderNumber)}&contextId=${contextId}`));
}

await writeFile(outPath, JSON.stringify(pages, null, 2));
console.log(`saved ${outPath}`);
