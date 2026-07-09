import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';

const prisma = new PrismaClient();
const RAW_DIR = process.env.FABKLEAN_CHALLANS_DIR || path.resolve(process.cwd(), '../migration/fabklean/raw/challans');
const DRY_RUN = process.env.DRY_RUN !== '0';

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const listFiles = (dir) => fs.existsSync(dir) ? fs.readdirSync(dir).sort() : [];
const text = (value) => value == null ? '' : String(value).trim();
const compact = (obj) => JSON.stringify(obj, (key, value) => {
  if (value === '' || value == null) return undefined;
  return value;
});
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
const fabkleanHeaderStatus = (detail, list) => text(detail.invoiceStatus || list.invoiceStatus).toUpperCase();
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
  if (workflowStatus === 'CANCELLED') return 'CANCELLED';
  return isRawOrderReceivedFromPlant(rawOrder) ? 'IRONING' : 'SENT_TO_PLANT';
};
const mapOrderStage = (rawOrder) =>
  isRawOrderReceivedFromPlant(rawOrder) ? 'FABKLEAN_CHALLAN_RECEIVED' : 'FABKLEAN_CHALLAN_SENT_TO_PLANT';

const rawByChallanNo = new Map();
for (const file of listFiles(path.join(RAW_DIR, 'details'))) {
  if (!file.endsWith('.json')) continue;
  const data = readJson(path.join(RAW_DIR, 'details', file));
  const detail = data.detail || {};
  const list = data.list || {};
  const challanNo = text(detail.orderId || list.orderId);
  if (!challanNo) continue;
  rawByChallanNo.set(challanNo, { file, detail, list });
}

const challans = await prisma.deliveryChallan.findMany({
  where: { challanNo: { in: [...rawByChallanNo.keys()] } },
  include: {
    challanItems: {
      include: {
        orderItem: {
          include: {
            order: { select: { id: true, orderNumber: true } }
          }
        }
      }
    },
    challanOrders: {
      include: {
        order: { select: { id: true, orderNumber: true, status: true } }
      }
    }
  }
});

const protectedOrderStatuses = new Set(['DELIVERED', 'CANCELLED', 'RETURNED']);
const stats = {
  dryRun: DRY_RUN,
  rawChallans: rawByChallanNo.size,
  dbChallansMatched: challans.length,
  challansToDispatched: 0,
  challansToReceived: 0,
  challansToPartial: 0,
  itemsToNotReceived: 0,
  itemsToReceived: 0,
  activeOrdersToSentToPlant: 0,
  activeOrdersToIroning: 0,
  activeOrdersToReady: 0,
  activeOrdersToDelivered: 0,
  protectedOrdersSkipped: 0,
  byFabkleanHeaderStatus: {},
  byFabkleanOrderPlantStatus: {},
  samples: [],
};

for (const challan of challans) {
  const raw = rawByChallanNo.get(challan.challanNo);
  if (!raw) continue;
  const { detail, list } = raw;
  const headerStatus = fabkleanHeaderStatus(detail, list);
  stats.byFabkleanHeaderStatus[headerStatus] = (stats.byFabkleanHeaderStatus[headerStatus] || 0) + 1;

  const rawOrdersByNumber = new Map((Array.isArray(detail.orders) ? detail.orders : []).map((rawOrder) => [rawOrder.orderId, rawOrder]));
  for (const rawOrder of rawOrdersByNumber.values()) {
    const plantStatus = fabkleanOrderPlantStatus(rawOrder) || 'UNKNOWN';
    stats.byFabkleanOrderPlantStatus[plantStatus] = (stats.byFabkleanOrderPlantStatus[plantStatus] || 0) + 1;
  }

  const itemTargets = challan.challanItems.map((item) => {
    const orderNumber = item.orderItem?.order?.orderNumber;
    const rawOrder = rawOrdersByNumber.get(orderNumber);
    const received = rawOrder ? isRawOrderReceivedFromPlant(rawOrder) : false;
    return {
      item,
      rawOrder,
      received,
      receivedAt: received ? (parseDate(detail.plantDeliveryDate || list.plantDeliveryDate || detail.orderDate || list.orderDate) || new Date()) : null,
    };
  });
  const receivedItemCount = itemTargets.filter((target) => target.received).length;
  const nextStatus =
    receivedItemCount === 0 ? 'DISPATCHED' :
    receivedItemCount === itemTargets.length ? 'RECEIVED' :
    'PARTIAL';

  const itemsNeedingUpdate = itemTargets.filter(({ item, received }) =>
    item.isReceived !== received ||
    item.receivedQty !== (received ? item.quantity : 0) ||
    (!received && item.receivedAt)
  );
  stats.itemsToReceived += itemsNeedingUpdate.filter((target) => target.received).length;
  stats.itemsToNotReceived += itemsNeedingUpdate.filter((target) => !target.received).length;

  if (challan.status !== nextStatus) {
    if (nextStatus === 'RECEIVED') stats.challansToReceived += 1;
    else if (nextStatus === 'PARTIAL') stats.challansToPartial += 1;
    else stats.challansToDispatched += 1;
  }

  const orderTargets = challan.challanOrders
    .map((entry) => {
      const order = entry.order;
      const rawOrder = rawOrdersByNumber.get(order?.orderNumber);
      return rawOrder && order ? { order, rawOrder, status: mapOrderStatusFromChallan(rawOrder) } : null;
    })
    .filter(Boolean)
    .filter(({ order, status }) => {
      if (protectedOrderStatuses.has(order.status) && !protectedOrderStatuses.has(status)) {
        stats.protectedOrdersSkipped += 1;
        return false;
      }
      return order.status !== status;
    });
  stats.activeOrdersToSentToPlant += orderTargets.filter((target) => target.status === 'SENT_TO_PLANT').length;
  stats.activeOrdersToIroning += orderTargets.filter((target) => target.status === 'IRONING').length;
  stats.activeOrdersToReady += orderTargets.filter((target) => target.status === 'READY_FOR_DELIVERY').length;
  stats.activeOrdersToDelivered += orderTargets.filter((target) => target.status === 'DELIVERED').length;

  if (stats.samples.length < 20 && (challan.status !== nextStatus || orderTargets.length || itemsNeedingUpdate.length)) {
    stats.samples.push({
      challanNo: challan.challanNo,
      fabkleanHeaderStatus: headerStatus,
      fromStatus: challan.status,
      toStatus: nextStatus,
      itemUpdates: itemsNeedingUpdate.length,
      orderUpdates: orderTargets.map(({ order, rawOrder, status }) => ({
        orderNumber: order.orderNumber,
        fromStatus: order.status,
        toStatus: status,
        fabkleanOrderPlantStatus: rawOrder.value4,
        fabkleanWorkflowStatus: rawOrder.workflowStatus,
      })),
    });
  }

  if (DRY_RUN) continue;

  await prisma.$transaction(async (tx) => {
    if (challan.status !== nextStatus) {
      await tx.deliveryChallan.update({
        where: { id: challan.id },
        data: { status: nextStatus },
      });
    }

    await Promise.all(itemsNeedingUpdate.map(({ item, received, receivedAt }) =>
      tx.challanItem.update({
        where: { id: item.id },
        data: {
          isReceived: received,
          receivedQty: received ? item.quantity : 0,
          receivedAt,
        },
      })
    ));

    await Promise.all(orderTargets.map(({ order, rawOrder, status }) =>
      Promise.all([
        tx.order.update({
          where: { id: order.id },
          data: { status },
        }),
        tx.orderStage.create({
          data: {
            orderId: order.id,
            stage: mapOrderStage(rawOrder),
            notes: compact({
              source: 'FABKLEAN_REPAIR',
              challanId: challan.id,
              challanNo: challan.challanNo,
              fabkleanHeaderStatus: headerStatus,
              fabkleanOrderPlantStatus: rawOrder.value4,
              fabkleanWorkflowStatus: rawOrder.workflowStatus,
              previousStatus: order.status,
              nextStatus: status,
            }),
            createdAt: parseDate(detail.orderDate || list.orderDate) || new Date(),
          },
        }),
      ])
    ));
  }, { timeout: 30000 });
}

console.log(JSON.stringify(stats, null, 2));
await prisma.$disconnect();
