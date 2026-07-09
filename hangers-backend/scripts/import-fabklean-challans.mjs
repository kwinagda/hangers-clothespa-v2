import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const prisma = new PrismaClient();
const require = createRequire(import.meta.url);
const { recalculateVendorCostsForPlant } = require('../src/controllers/challan.controller.js');
const RAW_DIR = process.env.FABKLEAN_CHALLANS_DIR || path.resolve(process.cwd(), '../migration/fabklean/raw/challans');
const DRY_RUN = process.env.DRY_RUN !== '0';

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const listFiles = (dir) => fs.existsSync(dir) ? fs.readdirSync(dir).sort() : [];
const text = (value) => value == null ? '' : String(value).trim();
const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const parseDate = (value) => {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? `${raw}T00:00:00`
    : raw.includes('T') ? raw : raw.replace(' ', 'T');
  const withZone = /Z$|[+-]\d\d:?\d\d$/.test(normalized) ? normalized : `${normalized}+05:30`;
  const parsed = new Date(withZone);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};
const compact = (obj) => JSON.stringify(obj, (key, value) => {
  if (value === '' || value == null) return undefined;
  return value;
});
const normalizePlant = (value) => {
  const raw = text(value);
  if (!raw) return 'UNKNOWN';
  return raw.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'UNKNOWN';
};
const fabkleanOrderPlantStatus = (rawOrder) => text(rawOrder?.value4).toUpperCase();
const fabkleanWorkflowStatus = (rawOrder) => text(rawOrder?.workflowStatus).toUpperCase();
const isRawOrderReceivedFromPlant = (rawOrder) => {
  const plantStatus = fabkleanOrderPlantStatus(rawOrder);
  const workflowStatus = fabkleanWorkflowStatus(rawOrder);
  return plantStatus === 'CLEAN' || workflowStatus === 'READY' || workflowStatus === 'DELIVERED';
};
const mapOrderStatusFromChallan = (rawOrder) => {
  const workflowStatus = fabkleanWorkflowStatus(rawOrder);
  if (workflowStatus === 'DELIVERED') return 'DELIVERED';
  if (workflowStatus === 'READY') return 'READY_FOR_DELIVERY';
  return isRawOrderReceivedFromPlant(rawOrder) ? 'IRONING' : 'SENT_TO_PLANT';
};
const mapOrderStage = (rawOrder) =>
  isRawOrderReceivedFromPlant(rawOrder) ? 'FABKLEAN_CHALLAN_RECEIVED' : 'FABKLEAN_CHALLAN_SENT_TO_PLANT';
const splitServiceName = (value) => {
  const raw = text(value) || 'Fabklean Item';
  const match = raw.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
  return {
    raw,
    serviceName: raw,
    garmentType: text(match?.[1]) || raw,
    variant: text(match?.[2]) || null,
  };
};

const loadRawChallans = () => {
  const rows = [];
  for (const file of listFiles(path.join(RAW_DIR, 'details'))) {
    if (!file.endsWith('.json')) continue;
    const data = readJson(path.join(RAW_DIR, 'details', file));
    const detail = data.detail || {};
    const list = data.list || {};
    const challanNo = text(detail.orderId || list.orderId);
    if (!challanNo) continue;
    rows.push({ file, list, detail });
  }
  rows.sort((a, b) => {
    const aNo = num(String(a.detail.orderId || '').match(/\d+/)?.[0]);
    const bNo = num(String(b.detail.orderId || '').match(/\d+/)?.[0]);
    return aNo - bNo;
  });
  return rows;
};

const stats = {
  rawChallans: 0,
  existingChallans: 0,
  challansCreated: 0,
  challanOrdersCreated: 0,
  challanItemsCreated: 0,
  stagesCreated: 0,
  missingOrders: 0,
  missingItems: 0,
  skippedNoOrders: 0,
  vendorCostRecalculations: [],
};

const missingOrderNumbers = new Set();
const missingItemRefs = [];
const plantsToRecalculate = new Set();
const rawChallans = loadRawChallans();
stats.rawChallans = rawChallans.length;

const existingChallans = await prisma.deliveryChallan.findMany({
  where: { challanNo: { in: rawChallans.map(({ detail, list }) => text(detail.orderId || list.orderId)) } },
  select: { challanNo: true },
});
const existingChallanNos = new Set(existingChallans.map((challan) => challan.challanNo));
stats.existingChallans = existingChallanNos.size;

for (const raw of rawChallans) {
  const { detail, list } = raw;
  const challanNo = text(detail.orderId || list.orderId);
  if (existingChallanNos.has(challanNo)) continue;

  const orderNumbers = [
    ...new Set(
      String(detail.dcNumbers || list.dcNumber || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
    ),
  ];
  if (!orderNumbers.length) {
    stats.skippedNoOrders += 1;
    continue;
  }

  const orders = await prisma.order.findMany({
    where: { orderNumber: { in: orderNumbers }, documentType: 'ORDER' },
    include: { items: true },
  });
  const ordersByNumber = new Map(orders.map((order) => [order.orderNumber, order]));
  for (const orderNumber of orderNumbers) {
    if (!ordersByNumber.has(orderNumber)) {
      missingOrderNumbers.add(orderNumber);
      stats.missingOrders += 1;
    }
  }
  if (!orders.length) {
    stats.skippedNoOrders += 1;
    continue;
  }

  const rawOrders = Array.isArray(detail.orders) ? detail.orders : [];
  const orderItemsByFabId = new Map();
  const orderItemsByName = new Map();
  for (const order of orders) {
    for (const item of order.items) {
      const notes = (() => {
        try { return JSON.parse(item.notes || '{}'); } catch { return {}; }
      })();
      if (notes.fabkleanItemId) orderItemsByFabId.set(`${order.orderNumber}:${notes.fabkleanItemId}`, item);
      const key = `${order.orderNumber}:${item.serviceName}:${item.quantity}`;
      if (!orderItemsByName.has(key)) orderItemsByName.set(key, []);
      orderItemsByName.get(key).push(item);
    }
  }

  const challanItemsData = [];
  const orderStatusUpdates = new Map();
  for (const rawOrder of rawOrders) {
    const order = ordersByNumber.get(rawOrder.orderId);
    if (!order) continue;
    const received = isRawOrderReceivedFromPlant(rawOrder);
    orderStatusUpdates.set(order.id, { order, rawOrder, status: mapOrderStatusFromChallan(rawOrder) });
    for (const rawItem of rawOrder.orderItems || []) {
      const split = splitServiceName(rawItem.name);
      let item = orderItemsByFabId.get(`${order.orderNumber}:${rawItem.id}`);
      if (!item) {
        const candidates = orderItemsByName.get(`${order.orderNumber}:${split.serviceName}:${Math.max(1, Math.trunc(num(rawItem.quantity, 1)))}`) || [];
        item = candidates.shift();
      }
      if (!item) {
        missingItemRefs.push({ challanNo, orderNumber: order.orderNumber, itemName: split.serviceName, fabkleanItemId: rawItem.id });
        stats.missingItems += 1;
        continue;
      }
      const quantity = Math.max(1, Math.trunc(num(rawItem.quantity, item.quantity || 1)));
      challanItemsData.push({
        orderItemId: item.id,
        serviceName: item.serviceName || split.serviceName,
        quantity,
        customerPrice: num(rawItem.rate, item.unitPrice || 0),
        vendorCost: 0,
        isReceived: received,
        receivedQty: received ? quantity : 0,
        receivedAt: received ? (parseDate(detail.plantDeliveryDate || list.plantDeliveryDate || detail.orderDate || list.orderDate) || new Date()) : null,
      });
    }
  }

  if (!challanItemsData.length) {
    for (const order of orders) {
      for (const item of order.items) {
        challanItemsData.push({
          orderItemId: item.id,
          serviceName: item.serviceName,
          quantity: item.quantity,
          customerPrice: item.unitPrice || 0,
          vendorCost: 0,
          isReceived: false,
          receivedQty: 0,
          receivedAt: null,
        });
      }
    }
  }

  const createdAt = parseDate(detail.orderDate || list.orderDate) || new Date();
  const plantName = text(detail.plantName || list.bankName) || 'Unknown';
  const plant = normalizePlant(plantName);
  const customerValue = orders.reduce((sum, order) => sum + num(order.totalAmount), 0);
  const receivedItemCount = challanItemsData.filter((item) => item.isReceived).length;
  const challanStatus =
    receivedItemCount === 0 ? 'DISPATCHED' :
    receivedItemCount === challanItemsData.length ? 'RECEIVED' :
    'PARTIAL';
  const notes = compact({
    source: 'FABKLEAN',
    fabkleanChallanId: detail.id || list.id,
    fabkleanChallanNumber: challanNo,
    fabkleanStatus: detail.invoiceStatus || list.invoiceStatus,
    fabkleanTags: detail.tags || list.tags,
    fabkleanPlantName: plantName,
    driverName: detail.deliveryPerson?.firstName || list.deliveryUser?.name,
    driverPhone: detail.deliveryPerson?.phoneNumber || list.deliveryUser?.phoneNumber,
    createdBy: detail.createdBy?.firstName || list.createdBy?.name,
    sentAt: detail.plantsentDate || list.plantsentDate,
    receivedAt: detail.plantDeliveryDate || list.plantDeliveryDate,
    orderNumbers,
  });

  if (DRY_RUN) {
    stats.challansCreated += 1;
    stats.challanOrdersCreated += orders.length;
    stats.challanItemsCreated += challanItemsData.length;
    stats.stagesCreated += orders.length;
    continue;
  }

  await prisma.$transaction(async (tx) => {
    const challan = await tx.deliveryChallan.create({
      data: {
        challanNo,
        plant,
        driverName: text(detail.deliveryPerson?.firstName || list.deliveryUser?.name) || null,
        status: challanStatus,
        customerValue,
        vendorCost: 0,
        notes,
        createdAt,
        challanOrders: {
          create: orders.map((order) => ({ orderId: order.id, createdAt })),
        },
        challanItems: {
          create: challanItemsData,
        },
      },
      select: { id: true },
    });

    await Promise.all([...orderStatusUpdates.values()].map(({ order, rawOrder, status }) =>
      Promise.all([
        tx.orderStage.create({
          data: {
            orderId: order.id,
            stage: mapOrderStage(rawOrder),
            notes: compact({
              source: 'FABKLEAN',
              challanId: challan.id,
              challanNo,
              plant,
              plantName,
              fabkleanStatus: detail.invoiceStatus || list.invoiceStatus,
              fabkleanOrderPlantStatus: rawOrder.value4,
              fabkleanWorkflowStatus: rawOrder.workflowStatus,
              driverName: detail.deliveryPerson?.firstName || list.deliveryUser?.name,
            }),
            createdAt,
          },
        }),
        tx.order.update({
          where: { id: order.id },
          data: { status },
        }),
      ])
    ));
  }, { timeout: 30000 });
  plantsToRecalculate.add(plant);

  stats.challansCreated += 1;
  stats.challanOrdersCreated += orders.length;
  stats.challanItemsCreated += challanItemsData.length;
  stats.stagesCreated += orders.length;
}

if (!DRY_RUN) {
  for (const plant of plantsToRecalculate) {
    stats.vendorCostRecalculations.push(await recalculateVendorCostsForPlant(plant));
  }
}

console.log(JSON.stringify({
  dryRun: DRY_RUN,
  rawDir: RAW_DIR,
  stats,
  missingOrderNumbers: [...missingOrderNumbers].sort(),
  missingItemRefs: missingItemRefs.slice(0, 50),
}, null, 2));

await prisma.$disconnect();
