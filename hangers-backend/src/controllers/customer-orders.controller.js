// ─────────────────────────────────────────────────────────────────────────────
// CUSTOMER ORDERS CONTROLLER v2 — Fixed:
//   ✅ FIX 2: Order number format matches CRM exactly (HNG2403XXXX)
//   ✅ FIX 3: Items are stored with the order immediately on booking
//   ✅ Subtotal & totalAmount calculated from items
// ─────────────────────────────────────────────────────────────────────────────
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ── Same helper as CRM orders.controller.js ───────────────────────────────────
const generateOrderNumber = async () => {
  const today  = new Date();
  const prefix = `HNG${today.getFullYear().toString().slice(-2)}${String(today.getMonth() + 1).padStart(2, '0')}`;
  const count  = await prisma.order.count({
    where: { orderNumber: { startsWith: prefix } },
  });
  return `${prefix}${String(count + 1).padStart(4, '0')}`;
};

// ── GET /api/v1/customer/orders ───────────────────────────────────────────────
const getMyOrders = async (req, res) => {
  try {
    const customerId = req.customer.id;
    const { page = 1, limit = 50, status } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where:   { customerId, ...(status ? { status } : {}) },
        include: {
          items:  { select: { id: true, serviceName: true, garmentType: true, quantity: true, unitPrice: true } },
          stages: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take:    parseInt(limit),
      }),
      prisma.order.count({ where: { customerId } }),
    ]);

    res.json({ success: true, orders, pagination: { total, page: +page, limit: +limit } });
  } catch (err) {
    console.error('getMyOrders:', err);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
};

// ── GET /api/v1/customer/orders/:id ──────────────────────────────────────────
const getMyOrder = async (req, res) => {
  try {
    const { id }     = req.params;
    const customerId = req.customer.id;

    const order = await prisma.order.findFirst({
      where:   { id, customerId },
      include: {
        items:  true,
        stages: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch order' });
  }
};

// ── POST /api/v1/customer/orders/pickup-request ───────────────────────────────
const requestPickup = async (req, res) => {
  try {
    const customerId = req.customer.id;
    const {
      pickupDate,
      timeSlot,
      serviceTypes,      // array e.g. ['DRY_CLEAN', 'STEAM_IRON']
      address,
      notes,
      items = [],        // FIX 3: receive items from app
      subtotal      = 0,
      totalAmount   = 0,
      useWalletCredits = false,
    } = req.body;

    if (!pickupDate || !address) {
      return res.status(400).json({ error: 'pickupDate and address are required' });
    }

    // FIX 2: Use same format as CRM — HNG2403XXXX
    const orderNumber = await generateOrderNumber();

    const calcSubtotal = items.length > 0
      ? items.reduce((s, i) => s + (i.unitPrice || 0) * (i.quantity || 1), 0)
      : parseFloat(subtotal) || 0;

    // ── Wallet deduction ───────────────────────────────────────────────────
    let walletApplied = 0;
    if (useWalletCredits && calcSubtotal > 0) {
      const customer = await prisma.customer.findUnique({
        where: { id: customerId },
        select: { walletBalance: true },
      });
      walletApplied = Math.min(customer?.walletBalance || 0, calcSubtotal);
    }
    const calcTotal = calcSubtotal - walletApplied;

    // ── Create order (+ wallet deduction) in a transaction ────────────────
    const order = await prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          orderNumber,
          customerId,
          source:        'APP',
          status:        'PENDING',
          paymentStatus: calcTotal <= 0 ? 'PAID' : 'UNPAID',
          subtotal:      calcSubtotal,
          discount:      walletApplied,
          totalAmount:   calcTotal,
          paidAmount:    walletApplied,
          notes:         notes || null,
          pickupDate:    new Date(pickupDate),
          pickupSlot:    timeSlot || null,
          pickupAddress: address,

          // FIX 3: Create order items immediately if provided
          ...(items.length > 0 ? {
            items: {
              create: items.map((item) => ({
                serviceName:  item.serviceName || item.name,
                garmentType:  item.garmentType || item.category || '',
                quantity:     parseInt(item.quantity) || 1,
                unitPrice:    parseFloat(item.unitPrice || item.price) || 0,
                subtotal:     (parseFloat(item.unitPrice || item.price) || 0) * (parseInt(item.quantity) || 1),
              })),
            },
          } : {}),

          stages: {
            create: [{
              stage: 'PENDING',
              notes: `Pickup booked via app. Slot: ${timeSlot || 'TBD'}. Services: ${(serviceTypes || []).join(', ') || 'TBD'}. Address: ${address}`,
            }],
          },
        },
        include: { items: true, stages: true },
      });

      if (walletApplied > 0) {
        await tx.customer.update({
          where: { id: customerId },
          data:  { walletBalance: { decrement: walletApplied } },
        });
        await tx.walletTransaction.create({
          data: {
            customerId,
            amount:  walletApplied,
            type:    'DEBIT',
            reason:  'ORDER_PAYMENT',
            orderId: created.id,
          },
        });
      }

      return created;
    });

    res.status(201).json({
      success: true,
      order,
      walletApplied,
      message: `Pickup booked! Order ${orderNumber}. Our team will contact you to confirm the slot.`,
    });
  } catch (err) {
    console.error('requestPickup:', err);
    res.status(500).json({ error: 'Failed to book pickup' });
  }
};

module.exports = { getMyOrders, getMyOrder, requestPickup };
