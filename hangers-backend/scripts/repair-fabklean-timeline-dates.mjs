import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';

const prisma = new PrismaClient();
const RAW_DIR = process.env.FABKLEAN_RAW_DIR || path.resolve(process.cwd(), '../migration/fabklean/raw');
const CHALLANS_DIR = process.env.FABKLEAN_CHALLANS_DIR || path.join(RAW_DIR, 'challans');
const DRY_RUN = process.env.DRY_RUN !== '0';

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const listFiles = (dir) => fs.existsSync(dir) ? fs.readdirSync(dir).sort() : [];
const text = (value) => value == null ? '' : String(value).trim();
const uniqueKey = (stage, date) => `${stage}:${date?.toISOString() || ''}`;

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

const stagePriority = (stage) => ({
  FABKLEAN_ORDER_CREATED: 10,
  PICKED_UP: 20,
  PROCESSING: 30,
  SENT_TO_PLANT: 40,
  IRONING: 50,
  READY_FOR_DELIVERY: 60,
  OUT_FOR_DELIVERY: 70,
  DELIVERED: 80,
  CANCELLED: 90,
}[stage] || 500);

const sameStageNear = (existing, stage, createdAt) =>
  existing.some((item) => item.stage === stage && Math.abs(item.createdAt.getTime() - createdAt.getTime()) < 5 * 60 * 1000);

const loadRawOrders = () => {
  const pageOrders = new Map();
  for (const file of listFiles(path.join(RAW_DIR, 'order_pages'))) {
    const data = readJson(path.join(RAW_DIR, 'order_pages', file));
    for (const order of data.objectList || []) {
      if (order?.orderId) pageOrders.set(String(order.orderId), order);
    }
  }

  for (const file of listFiles(path.join(RAW_DIR, 'order_details'))) {
    const data = readJson(path.join(RAW_DIR, 'order_details', file));
    const detail = data.detail?.objectList?.[0];
    if (detail?.orderId) {
      pageOrders.set(String(detail.orderId), {
        ...(pageOrders.get(String(detail.orderId)) || {}),
        ...detail,
      });
    }
  }
  return pageOrders;
};

const loadLogEvents = (orderNumber) => {
  const file = path.join(RAW_DIR, 'order_logs', `order_logs_${orderNumber}.json`);
  if (!fs.existsSync(file)) return [];
  return readJson(file).flatMap((page) => page.eventData || []);
};

const workflowToStage = (value) => {
  const normalized = text(value).toUpperCase();
  if (normalized === 'PICKUP' || normalized === 'PICKED_UP') return 'PICKED_UP';
  if (normalized === 'PROCESSING' || normalized === 'IN PROCESS') return 'PROCESSING';
  if (normalized === 'CLEAN') return 'IRONING';
  if (normalized === 'READY') return 'READY_FOR_DELIVERY';
  if (normalized === 'DELIVERED') return 'DELIVERED';
  if (normalized === 'CANCELLED' || normalized === 'CANCELED') return 'CANCELLED';
  if (normalized === 'SENT_TO_PLANT' || normalized === 'P') return 'SENT_TO_PLANT';
  return null;
};

const receivedFromPlant = (rawOrder) => {
  const plantStatus = text(rawOrder?.value4).toUpperCase();
  const workflowStatus = text(rawOrder?.workflowStatus).toUpperCase();
  return plantStatus === 'CLEAN' || workflowStatus === 'READY' || workflowStatus === 'DELIVERED';
};

const loadChallanStages = () => {
  const stagesByOrder = new Map();
  const push = (orderNumber, event) => {
    if (!orderNumber || !event.createdAt) return;
    if (!stagesByOrder.has(orderNumber)) stagesByOrder.set(orderNumber, []);
    stagesByOrder.get(orderNumber).push(event);
  };

  for (const file of listFiles(path.join(CHALLANS_DIR, 'details'))) {
    if (!file.endsWith('.json')) continue;
    const data = readJson(path.join(CHALLANS_DIR, 'details', file));
    const detail = data.detail || {};
    const list = data.list || {};
    const challanNo = text(detail.orderId || list.orderId);
    if (!challanNo) continue;

    const sentAt = parseDate(detail.plantsentDate || list.plantsentDate || detail.orderDate || list.orderDate);
    const receivedAt = parseDate(detail.plantDeliveryDate || list.plantDeliveryDate);
    const orderNumbers = [
      ...new Set(
        String(detail.dcNumbers || list.dcNumber || '')
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean)
      ),
    ];
    const rawOrders = Array.isArray(detail.orders) ? detail.orders : [];
    const rawByNumber = new Map(rawOrders.map((order) => [order.orderId, order]));

    for (const orderNumber of orderNumbers) {
      const rawOrder = rawByNumber.get(orderNumber);
      push(orderNumber, {
        stage: 'SENT_TO_PLANT',
        createdAt: sentAt,
        notes: compact({
          source: 'FABKLEAN_REPAIR',
          dateSource: detail.plantsentDate || list.plantsentDate ? 'challan.plantsentDate' : 'challan.orderDate',
          challanNo,
          fabkleanOrderPlantStatus: rawOrder?.value4,
          fabkleanWorkflowStatus: rawOrder?.workflowStatus,
        }),
      });

      if (rawOrder && receivedFromPlant(rawOrder) && receivedAt) {
        push(orderNumber, {
          stage: 'IRONING',
          createdAt: receivedAt,
          notes: compact({
            source: 'FABKLEAN_REPAIR',
            dateSource: 'challan.plantDeliveryDate',
            challanNo,
            fabkleanOrderPlantStatus: rawOrder.value4,
            fabkleanWorkflowStatus: rawOrder.workflowStatus,
          }),
        });
      }
    }
  }

  return stagesByOrder;
};

const buildStages = (order, rawOrder, challanStages) => {
  const stages = [];
  const seen = new Set();
  const add = (stage, createdAt, notes) => {
    if (!stage || !createdAt) return;
    if (sameStageNear(stages, stage, createdAt)) return;
    const key = uniqueKey(stage, createdAt);
    if (seen.has(key)) return;
    seen.add(key);
    stages.push({ stage, createdAt, notes });
  };

  const createdAt = parseDate(rawOrder?.actualPickupDate || rawOrder?.orderDate || rawOrder?.createdTime) || order.createdAt;
  add('FABKLEAN_ORDER_CREATED', createdAt, compact({
    source: 'FABKLEAN_REPAIR',
    dateSource: rawOrder?.actualPickupDate ? 'order.actualPickupDate' : rawOrder?.orderDate ? 'order.orderDate' : 'order.createdAt',
    fabkleanOrderId: rawOrder?.id,
    orderNumber: order.orderNumber,
  }));

  for (const challanStage of challanStages || []) {
    add(challanStage.stage, challanStage.createdAt, challanStage.notes);
  }

  for (const event of loadLogEvents(order.orderNumber)) {
    const eventAt = parseDate(event.eventTime);
    if (!eventAt) continue;
    for (const change of event.changeVariables || []) {
      if (String(change.variableName || '').toLowerCase() !== 'workflowstatus') continue;
      const stage = workflowToStage(change.newValue);
      if (!stage) continue;
      add(stage, eventAt, compact({
        source: 'FABKLEAN_REPAIR',
        dateSource: 'orderLog.eventTime',
        fabkleanEventId: event.id,
        title: event.title,
        from: change.oldValue,
        to: change.newValue,
        generatedName: event.generatedName,
      }));
    }
  }

  if (rawOrder?.actualDeliveryDate || rawOrder?.supplyDate || rawOrder?.shippingBillDate) {
    const deliveredAt = parseDate(rawOrder.actualDeliveryDate || rawOrder.supplyDate || rawOrder.shippingBillDate);
    if (deliveredAt && (order.status === 'DELIVERED' || text(rawOrder.workflowStatus).toUpperCase() === 'DELIVERED')) {
      add('DELIVERED', deliveredAt, compact({
        source: 'FABKLEAN_REPAIR',
        dateSource: rawOrder.actualDeliveryDate ? 'order.actualDeliveryDate' : rawOrder.supplyDate ? 'order.supplyDate' : 'order.shippingBillDate',
        fabkleanWorkflowStatus: rawOrder.workflowStatus,
      }));
    }
  }

  const finalStage = workflowToStage(rawOrder?.workflowStatus);
  if (finalStage && !stages.some((stage) => stage.stage === finalStage)) {
    add(finalStage, parseDate(rawOrder?.updatedTime || rawOrder?.actualDeliveryDate || rawOrder?.shippingBillDate) || createdAt, compact({
      source: 'FABKLEAN_REPAIR',
      dateSource: rawOrder?.updatedTime ? 'order.updatedTime' : rawOrder?.actualDeliveryDate ? 'order.actualDeliveryDate' : rawOrder?.shippingBillDate ? 'order.shippingBillDate' : 'order.createdAt',
      fabkleanWorkflowStatus: rawOrder?.workflowStatus,
    }));
  }

  stages.sort((a, b) => a.createdAt - b.createdAt || stagePriority(a.stage) - stagePriority(b.stage) || a.stage.localeCompare(b.stage));
  return stages;
};

const rawOrders = loadRawOrders();
const challanStagesByOrder = loadChallanStages();
const orders = await prisma.order.findMany({
  where: { source: 'FABKLEAN', documentType: 'ORDER' },
  select: { id: true, orderNumber: true, status: true, createdAt: true },
  orderBy: { orderNumber: 'asc' },
});
const orderIds = orders.map((order) => order.id);

if (!DRY_RUN) {
  const backupDir = path.resolve(process.cwd(), '../migration/fabklean/backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const backupFile = path.join(backupDir, `fabklean-order-stages-before-timeline-repair-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  const existingStages = await prisma.orderStage.findMany({
    where: {
      orderId: { in: orderIds },
    },
    orderBy: [{ orderId: 'asc' }, { createdAt: 'asc' }],
  });
  fs.writeFileSync(backupFile, JSON.stringify(existingStages, null, 2));
  console.log(JSON.stringify({ backupFile, backedUpStages: existingStages.length }, null, 2));
}

const stats = {
  dryRun: DRY_RUN,
  checked: orders.length,
  missingRawOrders: 0,
  ordersWithStages: 0,
  deletedStages: 0,
  createdStages: 0,
  sampleActualDates: [],
};

for (const order of orders) {
  const rawOrder = rawOrders.get(order.orderNumber);
  if (!rawOrder) {
    stats.missingRawOrders += 1;
    continue;
  }

  const stages = buildStages(order, rawOrder, challanStagesByOrder.get(order.orderNumber) || []);
  if (!stages.length) continue;
  stats.ordersWithStages += 1;
  stats.createdStages += stages.length;
  if (stats.sampleActualDates.length < 12) {
    stats.sampleActualDates.push({
      orderNumber: order.orderNumber,
      actualPickupDate: rawOrder.actualPickupDate || rawOrder.orderDate || null,
      actualDeliveryDate: rawOrder.actualDeliveryDate || rawOrder.supplyDate || rawOrder.shippingBillDate || null,
      timeline: stages.map((stage) => ({
        stage: stage.stage,
        date: stage.createdAt.toISOString(),
      })),
    });
  }

  if (!DRY_RUN) {
    await prisma.$transaction(async (tx) => {
      const deleted = await tx.orderStage.deleteMany({
        where: {
          orderId: order.id,
        },
      });
      stats.deletedStages += deleted.count;
      await tx.orderStage.createMany({
        data: stages.map((stage) => ({
          orderId: order.id,
          stage: stage.stage,
          notes: stage.notes,
          createdAt: stage.createdAt,
        })),
      });
    }, { timeout: 30000 });
  }
}

console.log(JSON.stringify(stats, null, 2));
await prisma.$disconnect();
