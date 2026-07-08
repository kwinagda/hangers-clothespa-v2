import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const prisma = new PrismaClient();
const require = createRequire(import.meta.url);
const { normalizePaymentMethod } = require('../src/utils/payment-method.js');
const RAW_DIR = process.env.FABKLEAN_RAW_DIR || path.resolve(process.cwd(), '../fabklean/raw');
const DRY_RUN = process.env.DRY_RUN !== '0';
const LIMIT = Number(process.env.LIMIT || 0);

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const listFiles = (dir) => fs.existsSync(dir) ? fs.readdirSync(dir).sort() : [];
const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const text = (value) => value == null ? '' : String(value).trim();
const phone = (value, fallback) => {
  const digits = String(value || '').replace(/\D/g, '');
  const last10 = digits.slice(-10);
  return last10 || `FK${fallback}`;
};
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

const mapStatus = (status) => {
  const value = String(status || '').toUpperCase();
  if (value === 'DELIVERED') return 'DELIVERED';
  if (value === 'CANCELLED') return 'CANCELLED';
  if (value === 'READY') return 'READY_FOR_DELIVERY';
  if (value === 'CLEAN') return 'IRONING';
  if (value === 'PICKUP') return 'PICKED_UP';
  return 'PROCESSING';
};
const mapPaymentStatus = (status, total, paid) => {
  const value = String(status || '').toUpperCase();
  if (value === 'PAID') return 'PAID';
  if (value.includes('PART')) return 'PARTIAL';
  return paid > 0 && paid < total ? 'PARTIAL' : paid >= total && total > 0 ? 'PAID' : 'UNPAID';
};
const mapPaymentMethod = (method) => {
  return normalizePaymentMethod(method);
};
const splitItemName = (name) => {
  const raw = text(name);
  const match = raw.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
  return {
    serviceName: raw || 'Fabklean Item',
    garmentType: text(match?.[1]) || raw || 'Fabklean Item',
    variant: text(match?.[2]) || null,
  };
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

const loadCustomerMap = () => {
  const map = new Map();
  for (const file of listFiles(path.join(RAW_DIR, 'customers'))) {
    const data = readJson(path.join(RAW_DIR, 'customers', file));
    const user = data.user || {};
    const id = user.id || user.userInfo?.id;
    if (id) map.set(String(id), user);
  }
  return map;
};

const loadPayments = (fabOrderId) => {
  const file = path.join(RAW_DIR, 'payments', `payment_${fabOrderId}.json`);
  if (!fs.existsSync(file)) return [];
  return readJson(file).flatMap((page) => page.objectList || []);
};

const loadLogEvents = (orderNumber) => {
  const file = path.join(RAW_DIR, 'order_logs', `order_logs_${orderNumber}.json`);
  if (!fs.existsSync(file)) return [];
  return readJson(file).flatMap((page) => page.eventData || []);
};

const stats = {
  rawOrders: 0,
  rawCustomers: 0,
  existingImported: 0,
  skippedExistingLocal: 0,
  customersCreated: 0,
  customersUpdated: 0,
  ordersCreated: 0,
  ordersUpdated: 0,
  itemsCreated: 0,
  paymentsCreated: 0,
  stagesCreated: 0,
};

const customerMap = loadCustomerMap();
const rawOrders = loadOrders();
stats.rawOrders = rawOrders.length;
stats.rawCustomers = customerMap.size;

const existingOrders = await prisma.order.findMany({
  where: { orderNumber: { in: rawOrders.map((order) => order.orderId) } },
  select: { id: true, orderNumber: true, notes: true },
});
const existingByNumber = new Map(existingOrders.map((order) => [order.orderNumber, order]));
for (const order of existingOrders) {
  if (String(order.notes || '').includes('"source":"FABKLEAN"')) stats.existingImported += 1;
  else stats.skippedExistingLocal += 1;
}

if (DRY_RUN) {
  console.log(JSON.stringify({ dryRun: true, stats }, null, 2));
  await prisma.$disconnect();
  process.exit(0);
}

for (const raw of rawOrders) {
  const existing = existingByNumber.get(raw.orderId);
  if (existing && !String(existing.notes || '').includes('"source":"FABKLEAN"')) {
    continue;
  }

  const rawCustomer = customerMap.get(String(raw.consumerInfo?.id)) || {};
  const userInfo = rawCustomer.userInfo || raw.consumerInfo || {};
  const customerPhone = phone(rawCustomer.phoneNumber || userInfo.phoneNumber || raw.consumerInfo?.phoneNumber, raw.consumerInfo?.id || raw.id);
  const customerName = text(rawCustomer.name || userInfo.name || raw.consumerInfo?.name) || customerPhone;
  const createdAt = parseDate(userInfo.createdTime || raw.createdTime || raw.orderDate) || new Date();

  const customerExisting = await prisma.customer.findUnique({ where: { phone: customerPhone }, select: { id: true } });
  const customer = await prisma.customer.upsert({
    where: { phone: customerPhone },
    create: {
      phone: customerPhone,
      name: customerName,
      createdAt,
      notes: compact({
        source: 'FABKLEAN',
        fabkleanCustomerId: raw.consumerInfo?.id || rawCustomer.id,
        secondaryPhone: rawCustomer.secondryPhoneNumber || userInfo.officePhoneNumber,
        email: rawCustomer.email || userInfo.email,
        tags: rawCustomer.tags || userInfo.userTags,
        customerNotes: userInfo.customerNotes,
        driverNotes: userInfo.driverNotes,
      }),
      ordersDue: num(userInfo.ordersDue ?? userInfo.dueAmount),
      walletBalance: num(userInfo.walletAmt),
      loyaltyPoints: Math.trunc(num(userInfo.loyaltyPoints)),
    },
    update: {
      name: customerName,
      notes: compact({
        source: 'FABKLEAN',
        fabkleanCustomerId: raw.consumerInfo?.id || rawCustomer.id,
        secondaryPhone: rawCustomer.secondryPhoneNumber || userInfo.officePhoneNumber,
        email: rawCustomer.email || userInfo.email,
        tags: rawCustomer.tags || userInfo.userTags,
        customerNotes: userInfo.customerNotes,
        driverNotes: userInfo.driverNotes,
      }),
      ordersDue: num(userInfo.ordersDue ?? userInfo.dueAmount),
      walletBalance: num(userInfo.walletAmt),
      loyaltyPoints: Math.trunc(num(userInfo.loyaltyPoints)),
    },
  });
  if (customerExisting) stats.customersUpdated += 1;
  else stats.customersCreated += 1;

  const address = userInfo.address1 || raw.consumerInfo?.address1;
  const addressLine = text(address?.addressLine || raw.shippingAddress);
  if (addressLine) {
    const existingAddress = await prisma.address.findFirst({
      where: { customerId: customer.id, addressLine1: addressLine },
      select: { id: true },
    });
    if (!existingAddress) {
      await prisma.address.create({
        data: {
          customerId: customer.id,
          label: 'Home',
          addressLine1: addressLine,
          addressLine2: text(address?.addressLine2) || null,
          city: text(address?.city) || 'Mumbai',
          pincode: text(address?.zip) || '',
          landmark: text(address?.area) || null,
          isDefault: true,
        },
      });
    }
  }

  const payments = loadPayments(raw.id);
  const paidAmount = payments.reduce((sum, payment) => sum + num(payment.amount), 0);
  const totalAmount = num(raw.invoiceTotal ?? raw.grandTotal ?? raw.totalAmount);
  const orderCreatedAt = parseDate(raw.actualPickupDate || raw.orderDate || raw.createdTime) || new Date();
  const status = mapStatus(raw.workflowStatus);
  const paymentStatus = mapPaymentStatus(raw.invoiceStatus, totalAmount, paidAmount);
  const notes = compact({
    source: 'FABKLEAN',
    fabkleanOrderId: raw.id,
    fabkleanOrderNumber: raw.orderId,
    fabkleanStatus: raw.workflowStatus,
    fabkleanInvoiceStatus: raw.invoiceStatus,
    fabkleanBalanceAmount: raw.balanceAmount,
    fabkleanPaymentMethods: raw.value2,
    customerNotes: raw.customerNotes,
    currentTaskNames: raw.currentTaskNames,
    tags: raw.tags,
    transportType: raw.transportType,
  });

  await prisma.$transaction(async (tx) => {
    let order;
    if (existing) {
      await tx.payment.deleteMany({ where: { orderId: existing.id } });
      await tx.orderStage.deleteMany({ where: { orderId: existing.id } });
      await tx.orderItem.deleteMany({ where: { orderId: existing.id } });
      order = await tx.order.update({
        where: { id: existing.id },
        data: {
          customerId: customer.id,
          status,
          subtotal: totalAmount,
          totalAmount,
          paidAmount,
          paymentStatus,
          pickupDate: parseDate(raw.actualPickupDate),
          deliveryDate: parseDate(raw.dueDate),
          deliveredAt: status === 'DELIVERED' ? (parseDate(raw.supplyDate) || parseDate(raw.updatedTime)) : null,
          pickupAddress: text(raw.shippingAddress) || addressLine || null,
          notes,
          createdAt: orderCreatedAt,
        },
      });
      stats.ordersUpdated += 1;
    } else {
      order = await tx.order.create({
        data: {
          orderNumber: raw.orderId,
          customerId: customer.id,
          status,
          documentType: 'ORDER',
          source: 'FABKLEAN',
          subtotal: totalAmount,
          totalAmount,
          paidAmount,
          paymentStatus,
          pickupDate: parseDate(raw.actualPickupDate),
          deliveryDate: parseDate(raw.dueDate),
          deliveredAt: status === 'DELIVERED' ? (parseDate(raw.supplyDate) || parseDate(raw.updatedTime)) : null,
          pickupAddress: text(raw.shippingAddress) || addressLine || null,
          notes,
          createdAt: orderCreatedAt,
        },
      });
      stats.ordersCreated += 1;
    }

    const items = raw.orderItems || raw.TB_orderItems || [];
    for (const item of items) {
      const split = splitItemName(item.name);
      const quantity = Math.max(1, Math.trunc(num(item.quantity, 1)));
      const unitPrice = num(item.rate ?? item.amount ?? item.total);
      const subtotal = num(item.total ?? item.amount, unitPrice * quantity);
      await tx.orderItem.create({
        data: {
          orderId: order.id,
          serviceName: split.serviceName,
          garmentType: split.garmentType,
          variant: split.variant,
          quantity,
          baseUnitPrice: unitPrice,
          unitPrice,
          subtotal,
          notes: compact({
            source: 'FABKLEAN',
            fabkleanItemId: item.id,
            productId: item.productId,
            tags: item.tags,
            notes: item.notes,
          }),
          tagNumber: text(item.value11) || null,
        },
      });
      stats.itemsCreated += 1;
    }

    for (const payment of payments) {
      await tx.payment.create({
        data: {
          orderId: order.id,
          customerId: customer.id,
          amount: num(payment.amount),
          method: mapPaymentMethod(payment.tags || payment.paymentType || payment.paymentMode),
          reference: text(payment.transId || payment.paymentId || payment.id) || null,
          notes: compact({
            source: 'FABKLEAN',
            fabkleanPaymentId: payment.id,
            paidAgainst: payment.paidAgainst,
            reference: payment.reference,
            tags: payment.tags,
            notes: payment.notes,
          }),
          createdAt: parseDate(payment.paymentDateTime || payment.paymentDate) || orderCreatedAt,
          status: String(payment.paymentStatus || 'SUCCESS').toUpperCase(),
          mode: text(payment.paymentMode || payment.source) || null,
        },
      });
      stats.paymentsCreated += 1;
    }

    await tx.orderStage.create({
      data: {
        orderId: order.id,
        stage: 'FABKLEAN_MIGRATED',
        notes: compact({ source: 'FABKLEAN', fabkleanOrderId: raw.id, orderNumber: raw.orderId }),
        createdAt: orderCreatedAt,
      },
    });
    stats.stagesCreated += 1;

    const events = loadLogEvents(raw.orderId);
    for (const event of events) {
      await tx.orderStage.create({
        data: {
          orderId: order.id,
          stage: `FABKLEAN_${text(event.operation || event.eventType || 'LOG').slice(0, 40)}`,
          notes: compact({
            title: event.title,
            message: event.message,
            actionContent: event.actionContent,
            generatedName: event.generatedName,
            status: event.status,
            fabkleanEventId: event.id,
          }),
          createdAt: parseDate(event.eventTime) || orderCreatedAt,
        },
      });
      stats.stagesCreated += 1;
    }
  }, { timeout: 30000 });
}

console.log(JSON.stringify({ dryRun: false, stats }, null, 2));
await prisma.$disconnect();
