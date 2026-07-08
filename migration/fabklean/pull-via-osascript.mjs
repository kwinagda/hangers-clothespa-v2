import { execFileSync, execSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(process.cwd(), 'migration/fabklean/raw');
const CONTEXT_ID = 10509;
const WINDOW_INDEX = Number(process.env.CHROME_WINDOW || 0);
const TAB_INDEX = Number(process.env.CHROME_TAB || 0);

const dirs = {
  lists: path.join(ROOT, 'order_pages'),
  details: path.join(ROOT, 'order_details'),
  logs: path.join(ROOT, 'order_logs'),
  customers: path.join(ROOT, 'customers'),
  errors: path.join(ROOT, 'errors'),
};
let cachedTarget = null;

for (const dir of Object.values(dirs)) {
  await mkdir(dir, { recursive: true });
}

const chromeEval = (js) => {
  const encoded = Buffer.from(js, 'utf8').toString('base64');
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

  try {
    return run();
  } catch (error) {
    const message = String(error.stderr || error.message || '');
    if (WINDOW_INDEX === 0 && TAB_INDEX === 0 && /Invalid index|Can.t get tab|Can.t get item/.test(message)) {
      cachedTarget = findFabkleanTarget();
      return run();
    }
    throw error;
  }
};

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
  const value = execFileSync('osascript', ['-e', apple], {
    encoding: 'utf8',
  }).trim();
  const [wi, ti] = value.split(':').map((part) => Number.parseInt(part, 10));
  if (!wi || !ti) throw new Error(`Invalid Fabklean target: ${value}`);
  return [wi, ti];
};

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
  'invoiceId',
  'shippingBillDate',
  'dueDate',
  'supplyDate',
  'orderDate',
  'workflowStatus',
  'customerNotes',
  'invoiceStatus',
  'balanceAmount',
  'invoiceTotal',
  'shippingAddress',
  'billingAddress',
  'value0',
  'value1',
  'value2',
  'value3',
  'value4',
  'value5',
  'value6',
  'value7',
  'value8',
  'value9',
  'value10',
  'tags',
  'bankName',
  'consumerInfo.id',
  'consumerInfo.name',
  'consumerInfo.firstName',
  'consumerInfo.phoneNumber',
  'consumerInfo.officePhoneNumber',
  'consumerInfo.uniqueCode',
  'consumerInfo.countryCode',
  'consumerInfo.countryCode2',
  'consumerInfo.taxNumber',
  'consumerInfo.email',
  'consumerInfo.customerNotes',
  'consumerInfo.driverNotes',
  'consumerInfo.ordersDue',
  'consumerInfo.loyaltyPoints',
  'consumerInfo.createdTime',
  'consumerInfo.firstOrderTime',
  'consumerInfo.address1',
  'consumerInfo.address2',
  'consumerInfo.externalKey',
  'consumerInfo.isBatchCustomer',
  'customer.id',
  'customer.name',
  'customer.organizationIds',
  'customer.value1',
  'customer.phoneNumber',
  'customer.gstInNumber',
  'currentTaskNames',
  'deliveryUser',
  'processUser',
  'salesPerson',
  'organization.id',
  'organization.name',
  'organization.phoneNumber',
  'TB_orderItems.id',
  'TB_orderItems.quantity',
  'TB_orderItems.name',
  'TB_orderItems.rate',
  'TB_orderItems.receiveCount',
  'TB_orderItems.shippedItemCount',
  'TB_orderItems.productId',
  'TB_orderItems.value1',
  'TB_orderItems.value5',
  'TB_orderItems.tags',
  'orderItems',
  'paymentItems',
  'reference',
  'transportType',
  'supplyPlace',
  'pcsCount',
  'actualDeliveryDate',
  'actualPickupDate',
  'warehouse.id',
  'warehouse.tags',
  'warehouse.paymentStatus',
  'packs',
  'others',
  'guestData',
  'lockerInfo',
].join(',');

const listUrl = (pageNo, pageSize = 50) =>
  `salesOrders/pageSearching.json?query=&contextId=${CONTEXT_ID}` +
  `&payloadFields=${encodeURIComponent(payloadFields)}` +
  `&orderBy=true&orderByCol=id&pageSize=${pageSize}&pageNo=${pageNo}`;

const active = chromeEval('document.title + "\\n" + location.href');
if (!active.includes('https://app.fabklean.com/outlet/')) {
  throw new Error(`Chrome tab ${WINDOW_INDEX}:${TAB_INDEX} is not Fabklean outlet: ${active}`);
}

console.log(`Fabklean tab OK: ${active.replace(/\n/g, ' | ')}`);

const orders = [];
const firstPage = fetchJson(listUrl(1));
await writeJson(path.join(dirs.lists, 'orders_page_001.json'), firstPage);
orders.push(...(firstPage.objectList || []));

const totalPages = firstPage.totalPages || 1;
console.log(`Order pages: ${totalPages}, first page rows: ${firstPage.objectList?.length || 0}`);

for (let page = 2; page <= totalPages; page += 1) {
  const data = fetchJson(listUrl(page));
  await writeJson(path.join(dirs.lists, `orders_page_${String(page).padStart(3, '0')}.json`), data);
  orders.push(...(data.objectList || []));
  console.log(`saved order page ${page}/${totalPages}, rows so far ${orders.length}`);
}

const orderIds = [...new Set(orders.map((order) => order.id).filter(Boolean))];
const orderNumbers = [...new Set(orders.map((order) => order.orderId).filter(Boolean))];
const customerIds = [...new Set(orders.map((order) => order.consumerInfo?.id).filter(Boolean))];

await writeJson(path.join(ROOT, 'orders_index.json'), {
  contextId: CONTEXT_ID,
  totalPages,
  listedOrders: orders.length,
  orderIds,
  orderNumbers,
  customerIds,
});

console.log(`Indexed ${orderIds.length} order ids, ${orderNumbers.length} order numbers, ${customerIds.length} customers`);

for (let i = 0; i < orderIds.length; i += 1) {
  const id = orderIds[i];
  const out = { id };
  try {
    out.detail = fetchJson(`salesOrders/pageSearching.json?query=id:${id}&orderBy=true&orderByCal=id&pageSize=1&contextId=${CONTEXT_ID}`);
  } catch (error) {
    out.detailError = error.message;
  }
  try {
    out.props = fetchJson(`propsItems/searching.json?query=baseOrderId:${id}&contextId=${CONTEXT_ID}`);
  } catch (error) {
    out.propsError = error.message;
  }
  try {
    out.flowItems = fetchJson(`flowItems/searching.json?query=baseOrderId:${id}&contextId=${CONTEXT_ID}`);
  } catch (error) {
    out.flowItemsError = error.message;
  }
  await writeJson(path.join(dirs.details, `order_detail_${safeName(id)}.json`), out);
  if ((i + 1) % 25 === 0 || i + 1 === orderIds.length) {
    console.log(`saved order details ${i + 1}/${orderIds.length}`);
  }
}

for (let i = 0; i < orderNumbers.length; i += 1) {
  const orderNumber = orderNumbers[i];
  const pages = [];
  try {
    const first = fetchJson(`activityEvents/getAllsalesOrdervents.json?pageSize=30&pageNo=1&EntityType=salesOrder&orderId=${encodeURIComponent(orderNumber)}&contextId=${CONTEXT_ID}`);
    pages.push(first);
    const logPages = first.totalPages || 1;
    for (let page = 2; page <= logPages; page += 1) {
      pages.push(fetchJson(`activityEvents/getAllsalesOrdervents.json?pageSize=30&pageNo=${page}&EntityType=salesOrder&orderId=${encodeURIComponent(orderNumber)}&contextId=${CONTEXT_ID}`));
    }
    await writeJson(path.join(dirs.logs, `order_logs_${safeName(orderNumber)}.json`), pages);
  } catch (error) {
    await writeJson(path.join(dirs.errors, `order_logs_${safeName(orderNumber)}.json`), {
      orderNumber,
      error: error.message,
    });
  }
  if ((i + 1) % 25 === 0 || i + 1 === orderNumbers.length) {
    console.log(`saved order logs ${i + 1}/${orderNumbers.length}`);
  }
}

for (let i = 0; i < customerIds.length; i += 1) {
  const customerId = customerIds[i];
  try {
    const data = fetchJson(`userInfos/${customerId}/warehouse?contextId=${CONTEXT_ID}`);
    await writeJson(path.join(dirs.customers, `customer_${safeName(customerId)}.json`), data);
  } catch (error) {
    await writeJson(path.join(dirs.errors, `customer_${safeName(customerId)}.json`), {
      customerId,
      error: error.message,
    });
  }
  if ((i + 1) % 25 === 0 || i + 1 === customerIds.length) {
    console.log(`saved customers ${i + 1}/${customerIds.length}`);
  }
}

await writeJson(path.join(ROOT, 'migration_manifest.json'), {
  finishedAt: new Date().toISOString(),
  contextId: CONTEXT_ID,
  listedOrders: orders.length,
  orderIds: orderIds.length,
  orderNumbers: orderNumbers.length,
  customers: customerIds.length,
});

console.log('Fabklean raw extraction complete');
