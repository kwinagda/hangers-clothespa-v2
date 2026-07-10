import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const prisma = new PrismaClient();
const require = createRequire(import.meta.url);
const { normalizePaymentMethod } = require('../src/utils/payment-method.js');

const defaultRawDir = path.resolve(process.cwd(), '../migration/fabklean/raw');
const legacyRawDir = path.resolve(process.cwd(), '../fabklean/raw');
const RAW_DIR = process.env.FABKLEAN_RAW_DIR || (fs.existsSync(defaultRawDir) ? defaultRawDir : legacyRawDir);
const DRY_RUN = process.env.DRY_RUN !== '0';
const LIMIT = Number(process.env.LIMIT || 0);

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const listFiles = (dir) => fs.existsSync(dir) ? fs.readdirSync(dir).sort() : [];
const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const text = (value) => value == null ? '' : String(value).trim();

const parseDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const raw = String(value).trim();
  if (!raw) return null;
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const withZone = /Z$|[+-]\d\d:?\d\d$/.test(normalized) ? normalized : `${normalized}+05:30`;
  const parsed = new Date(withZone);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const compact = (obj) => JSON.stringify(obj, (key, value) => {
  if (value === '' || value == null) return undefined;
  return value;
});

const mapPaymentStatus = (total, paid, writeOff = 0) => {
  const effectivePaid = Number(paid || 0) + Number(writeOff || 0);
  if (Number(total || 0) <= 0) return effectivePaid > 0 ? 'PAID' : 'UNPAID';
  if (effectivePaid >= Number(total || 0)) return 'PAID';
  if (effectivePaid > 0) return 'PARTIAL';
  return 'UNPAID';
};

const loadPageOrderMap = () => {
  const map = new Map();
  for (const file of listFiles(path.join(RAW_DIR, 'order_pages'))) {
    const data = readJson(path.join(RAW_DIR, 'order_pages', file));
    for (const order of data.objectList || []) {
      if (order?.id) map.set(String(order.id), order);
    }
  }
  return map;
};

const loadOrders = () => {
  const pageOrderMap = loadPageOrderMap();
  const orders = [];
  for (const file of listFiles(path.join(RAW_DIR, 'order_details'))) {
    const data = readJson(path.join(RAW_DIR, 'order_details', file));
    const order = data.detail?.objectList?.[0];
    const pageOrder = pageOrderMap.get(String(order?.id || ''));
    if (order?.id && order?.orderId) orders.push({ ...pageOrder, ...order });
  }
  orders.sort((a, b) => num(a.id) - num(b.id));
  return LIMIT ? orders.slice(0, LIMIT) : orders;
};

const loadPayments = (fabOrderId) => {
  const file = path.join(RAW_DIR, 'payments', `payment_${fabOrderId}.json`);
  if (!fs.existsSync(file)) return [];
  return readJson(file).flatMap((page) => page.objectList || []);
};

const paymentIdentity = (payment) => text(payment.id || payment.paymentId || payment.transId || payment.reference);
const paymentNotes = (payment) => compact({
  source: 'FABKLEAN',
  fabkleanPaymentId: payment.id,
  paidAgainst: payment.paidAgainst,
  reference: payment.reference,
  tags: payment.tags,
  notes: payment.notes,
});

const stats = {
  rawOrders: 0,
  ordersWithRawPayments: 0,
  missingOrders: 0,
  existingPayments: 0,
  paymentsCreated: 0,
  ordersUpdated: 0,
};

const rawOrders = loadOrders();
stats.rawOrders = rawOrders.length;

for (const raw of rawOrders) {
  const rawPayments = loadPayments(raw.id).filter((payment) => num(payment.amount) > 0);
  if (!rawPayments.length) continue;
  stats.ordersWithRawPayments += 1;

  const order = await prisma.order.findUnique({
    where: { orderNumber: raw.orderId },
    select: {
      id: true,
      customerId: true,
      totalAmount: true,
      writeOffAmount: true,
      paidAmount: true,
      paymentStatus: true,
      createdAt: true,
      payments: { select: { id: true, amount: true, notes: true, reference: true } },
    },
  });
  if (!order) {
    stats.missingOrders += 1;
    continue;
  }

  const existingIdentity = new Set();
  for (const payment of order.payments) {
    const notes = String(payment.notes || '');
    const match = notes.match(/"fabkleanPaymentId":("?)([^",}]+)\1/);
    if (match?.[2]) existingIdentity.add(String(match[2]));
    if (payment.reference) existingIdentity.add(String(payment.reference));
  }

  const missingPayments = rawPayments.filter((payment) => {
    const identity = paymentIdentity(payment);
    return identity && !existingIdentity.has(identity);
  });
  stats.existingPayments += rawPayments.length - missingPayments.length;
  if (!missingPayments.length) continue;

  if (DRY_RUN) {
    stats.paymentsCreated += missingPayments.length;
    stats.ordersUpdated += 1;
    continue;
  }

  await prisma.$transaction(async (tx) => {
    for (const payment of missingPayments) {
      await tx.payment.create({
        data: {
          orderId: order.id,
          customerId: order.customerId,
          amount: num(payment.amount),
          method: normalizePaymentMethod(payment.tags || payment.paymentType || payment.paymentMode),
          reference: text(payment.transId || payment.paymentId || payment.id) || null,
          notes: paymentNotes(payment),
          createdAt: parseDate(payment.paymentDateTime || payment.paymentDate) || parseDate(raw.actualPickupDate || raw.orderDate || raw.createdTime) || order.createdAt,
          status: String(payment.paymentStatus || 'SUCCESS').toUpperCase(),
          mode: text(payment.paymentMode || payment.source) || null,
        },
      });
      stats.paymentsCreated += 1;
    }

    const aggregate = await tx.payment.aggregate({
      where: { orderId: order.id },
      _sum: { amount: true },
    });
    const paidAmount = num(aggregate._sum.amount);
    const paymentStatus = mapPaymentStatus(order.totalAmount, paidAmount, order.writeOffAmount);
    await tx.order.update({
      where: { id: order.id },
      data: { paidAmount, paymentStatus },
    });
    stats.ordersUpdated += 1;
  }, { timeout: 30000 });
}

console.log(JSON.stringify({ dryRun: DRY_RUN, stats }, null, 2));
await prisma.$disconnect();
