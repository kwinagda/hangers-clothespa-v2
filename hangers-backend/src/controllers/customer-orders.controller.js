// ─────────────────────────────────────────────────────────────────────────────
// CUSTOMER ORDERS CONTROLLER v2 — Fixed:
//   ✅ FIX 2: Order number format matches CRM exactly (HNG2403XXXX)
//   ✅ FIX 3: Items are stored with the order immediately on booking
//   ✅ Subtotal & totalAmount calculated from items
// ─────────────────────────────────────────────────────────────────────────────
const prisma = require('../config/database');
const { generateOrderNumber } = require('../utils/order-number');
const { success, created, error, badRequest, notFound } = require('../utils/response');
const ORDER_ONLY_WHERE = { documentType: 'ORDER' };

const normalizeRequestedItems = async (items) => {
  if (!Array.isArray(items) || items.length === 0) return [];

  const requestedServiceIds = [...new Set(
    items
      .map((item) => String(item?.serviceId || '').trim())
      .filter(Boolean)
  )];

  if (requestedServiceIds.length !== items.length || requestedServiceIds.length === 0) {
    throw new Error('Each selected item must include a valid serviceId.');
  }

  const services = await prisma.service.findMany({
    where: { id: { in: requestedServiceIds }, isActive: true },
    select: { id: true, name: true, category: true, basePrice: true },
  });

  if (services.length !== requestedServiceIds.length) {
    throw new Error('One or more selected services are unavailable. Please refresh the catalog and try again.');
  }

  const serviceMap = new Map(services.map((service) => [service.id, service]));

  return items.map((item) => {
    const serviceId = String(item.serviceId).trim();
    const service = serviceMap.get(serviceId);
    const quantity = Math.max(1, parseInt(item.quantity, 10) || 1);

    return {
      serviceId,
      serviceName: service.name,
      garmentType: item.garmentType || item.category || service.category || '',
      quantity,
      unitPrice: Number(service.basePrice) || 0,
      subtotal: (Number(service.basePrice) || 0) * quantity,
    };
  });
};

// ── GET /api/v1/customer/orders ───────────────────────────────────────────────
const getMyOrders = async (req, res) => {
  try {
    const customerId = req.customer.id;
    const { page = 1, limit = 50, status } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const where = { customerId, ...ORDER_ONLY_WHERE, ...(status ? { status } : {}) };

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          items:  { select: { id: true, serviceName: true, garmentType: true, quantity: true, unitPrice: true } },
          stages: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take:    parseInt(limit),
      }),
      prisma.order.count({ where }),
    ]);

    return success(res, { orders, pagination: { total, page: +page, limit: +limit } });
  } catch (err) {
    console.error('getMyOrders:', err);
    return error(res, 'Failed to fetch orders');
  }
};

// ── GET /api/v1/customer/orders/:id ──────────────────────────────────────────
const getMyOrder = async (req, res) => {
  try {
    const { id }     = req.params;
    const customerId = req.customer.id;

    const order = await prisma.order.findFirst({
      where:   { id, customerId, ...ORDER_ONLY_WHERE },
      include: {
        items:  true,
        stages: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!order) return notFound(res, 'Order not found');
    return success(res, { order });
  } catch (err) {
    return error(res, 'Failed to fetch order');
  }
};

// ── POST /api/v1/customer/orders/pickup-request ───────────────────────────────
const requestPickup = async (req, res) => {
  try {
    const customerId = req.customer.id;
    const {
      pickupDate,
      timeSlot,
      pickupTimeSlot,
      serviceTypes,      // array e.g. ['DRY_CLEAN', 'STEAM_IRON']
      address,
      pickupAddress,
      notes,
      savedAddressId,
      items = [],
      subtotal      = 0,
      totalAmount   = 0,
      useWalletCredits = false,
    } = req.body;

    const resolvedTimeSlot = timeSlot || pickupTimeSlot || null;
    const resolvedAddress = address || pickupAddress || null;

    if (!pickupDate || !resolvedAddress) {
      return badRequest(res, 'pickupDate and address are required');
    }

    // FIX 2: Use same format as CRM — HNG2403XXXX
    const orderNumber = await generateOrderNumber();

    const normalizedItems = await normalizeRequestedItems(items);
    const calcSubtotal = normalizedItems.length > 0
      ? normalizedItems.reduce((sum, item) => sum + item.subtotal, 0)
      : parseFloat(subtotal) || 0;

    // ── Create order (+ wallet deduction) in one atomic transaction ───────
    const { order, walletApplied } = await prisma.$transaction(async (tx) => {
      let appliedWallet = 0;
      if (useWalletCredits && calcSubtotal > 0) {
        const customerData = await tx.customer.findUnique({
          where: { id: customerId },
          select: { walletBalance: true },
        });
        appliedWallet = Math.min(Number(customerData?.walletBalance) || 0, calcSubtotal);
      }
      const calcTotal = calcSubtotal - appliedWallet;

      const created = await tx.order.create({
        data: {
          orderNumber,
          documentType: 'ORDER',
          customerId,
          source:        'APP',
          status:        'PENDING',
          paymentStatus: calcTotal <= 0 ? 'PAID' : 'UNPAID',
          subtotal:      calcSubtotal,
          discount:      appliedWallet,
          totalAmount:   calcTotal,
          paidAmount:    appliedWallet,
          notes:         notes || null,
          pickupDate:    new Date(pickupDate),
          pickupSlot:    resolvedTimeSlot,
          pickupAddress: resolvedAddress,

          // FIX 3: Create order items immediately if provided
          ...(normalizedItems.length > 0 ? {
            items: {
              create: normalizedItems.map((item) => ({
                serviceId: item.serviceId,
                serviceName: item.serviceName,
                garmentType: item.garmentType,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                subtotal: item.subtotal,
              })),
            },
          } : {}),

          stages: {
            create: [{
              stage: 'PENDING',
              notes: `Pickup booked via app. Slot: ${resolvedTimeSlot || 'TBD'}. Services: ${
                (serviceTypes || normalizedItems.map((item) => item.garmentType)).filter(Boolean).join(', ') || 'TBD'
              }. Address: ${resolvedAddress}${savedAddressId ? ` (Saved address: ${savedAddressId})` : ''}`,
            }],
          },
        },
        include: { items: true, stages: true },
      });

      if (appliedWallet > 0) {
        await tx.customer.update({
          where: { id: customerId },
          data:  { walletBalance: { decrement: appliedWallet } },
        });
        await tx.walletTransaction.create({
          data: {
            customerId,
            amount:  appliedWallet,
            type:    'DEBIT',
            reason:  'ORDER_PAYMENT',
            orderId: created.id,
          },
        });
      }

      return { order: created, walletApplied: appliedWallet };
    });

    return created(
      res,
      { order, walletApplied },
      `Pickup booked! Order ${orderNumber}. Our team will contact you to confirm the slot.`
    );
  } catch (err) {
    console.error('requestPickup:', err);
    return error(res, 'Failed to book pickup');
  }
};

module.exports = { getMyOrders, getMyOrder, requestPickup };
