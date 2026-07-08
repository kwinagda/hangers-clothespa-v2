import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';

const prisma = new PrismaClient();
const RAW_DIR = process.env.FABKLEAN_RAW_DIR || path.resolve(process.cwd(), '../fabklean/raw');
const DRY_RUN = process.env.DRY_RUN !== '0';

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const listFiles = (dir) => fs.existsSync(dir) ? fs.readdirSync(dir).sort() : [];

const parseDate = (value) => {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const withZone = /Z$|[+-]\d\d:?\d\d$/.test(normalized) ? normalized : `${normalized}+05:30`;
  const parsed = new Date(withZone);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const loadPageOrderMap = () => {
  const map = new Map();
  for (const file of listFiles(path.join(RAW_DIR, 'order_pages'))) {
    const data = readJson(path.join(RAW_DIR, 'order_pages', file));
    for (const order of data.objectList || []) {
      if (order?.orderId) map.set(String(order.orderId), order);
    }
  }
  return map;
};

const pageOrders = loadPageOrderMap();
let checked = 0;
let repairable = 0;
let repaired = 0;
let missingRaw = 0;

const importedOrders = await prisma.order.findMany({
  where: { source: 'FABKLEAN' },
  select: { id: true, orderNumber: true, createdAt: true },
  orderBy: { orderNumber: 'asc' },
});

for (const order of importedOrders) {
  checked += 1;
  const raw = pageOrders.get(order.orderNumber);
  if (!raw) {
    missingRaw += 1;
    continue;
  }

  const createdAt = parseDate(raw.actualPickupDate || raw.orderDate || raw.createdTime);
  if (!createdAt) continue;
  repairable += 1;

  if (Math.abs(order.createdAt.getTime() - createdAt.getTime()) < 1000) continue;

  if (!DRY_RUN) {
    await prisma.order.update({
      where: { id: order.id },
      data: { createdAt },
    });
  }
  repaired += 1;
}

console.log(JSON.stringify({
  dryRun: DRY_RUN,
  checked,
  repairable,
  repaired,
  missingRaw,
}, null, 2));

await prisma.$disconnect();
