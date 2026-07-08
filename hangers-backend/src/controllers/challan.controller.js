// ── Challan System Controller ─────────────────────────────────────────────────
// Handles: Challans, ChallanOrders, ChallanItems, VendorPriceList, VendorBills
const prisma = require('../config/database');
const { success, badRequest, error } = require('../utils/response');
const ORDER_ONLY_WHERE = { documentType: 'ORDER' };

// ── Challan number generator ──────────────────────────────────────────────────
const genChallanNo = async () => {
  const count = await prisma.deliveryChallan.count();
  return `DC${String(count + 1).padStart(5, '0')}`;
};

// ── Vendor Bill number generator ──────────────────────────────────────────────
const genBillNo = async () => {
  const count = await prisma.vendorBill.count();
  return `VB${String(count + 1).padStart(5, '0')}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// VENDOR PRICE LIST
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/v1/vendor-prices?plant=WADREX
const getVendorPrices = async (req, res) => {
  try {
    const { plant } = req.query;
    const where = plant ? { plant } : {};
    const prices = await prisma.vendorPriceList.findMany({
      where,
      orderBy: { serviceName: 'asc' }
    });
    return success(res, prices);
  } catch (e) { return error(res, 'Failed to fetch vendor prices'); }
};

// POST /api/v1/vendor-prices — upsert price for a plant+service
const upsertVendorPrice = async (req, res) => {
  try {
    const { plant, serviceId, serviceName, costPrice } = req.body;
    if (!plant || !serviceName || costPrice === undefined) return badRequest(res, 'plant, serviceName and costPrice required');
    const parsedCost = parseFloat(costPrice);
    if (!Number.isFinite(parsedCost) || parsedCost < 0) return badRequest(res, 'costPrice must be a valid non-negative number');
    const price = await prisma.vendorPriceList.upsert({
      where: { plant_serviceId: { plant, serviceId: serviceId || serviceName } },
      update: { costPrice: parsedCost, serviceName },
      create: { plant, serviceId: serviceId || serviceName, serviceName, costPrice: parsedCost }
    });
    return success(res, price, 'Vendor price saved');
  } catch (e) { return error(res, 'Failed to save vendor price'); }
};

// POST /api/v1/vendor-prices/bulk — save multiple prices at once
const bulkUpsertVendorPrices = async (req, res) => {
  try {
    const { plant, prices } = req.body; // prices: [{serviceId, serviceName, costPrice}]
    if (!plant || !prices?.length) return badRequest(res, 'plant and prices array required');
    const invalid = prices.find((p) => !p?.serviceName || !Number.isFinite(parseFloat(p.costPrice)) || parseFloat(p.costPrice) < 0);
    if (invalid) return badRequest(res, 'Each vendor price must include serviceName and a valid non-negative costPrice');
    const results = await Promise.all(prices.map((p) =>
      prisma.vendorPriceList.upsert({
        where: { plant_serviceId: { plant, serviceId: p.serviceId || p.serviceName } },
        update: { costPrice: parseFloat(p.costPrice), serviceName: p.serviceName },
        create: { plant, serviceId: p.serviceId || p.serviceName, serviceName: p.serviceName, costPrice: parseFloat(p.costPrice) }
      })
    ));
    return success(res, results, `${results.length} prices saved`);
  } catch (e) { return error(res, 'Failed to bulk save vendor prices'); }
};

// ─────────────────────────────────────────────────────────────────────────────
// CHALLANS
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/v1/challans
const getChallans = async (req, res) => {
  try {
    const { plant, status } = req.query;
    const where = {};
    if (plant)  where.plant  = plant;
    if (status) where.status = status;

    const challans = await prisma.deliveryChallan.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        challanOrders: {
          include: {
            order: {
              select: {
                id: true, orderNumber: true, status: true, totalAmount: true,
                customer: { select: { name: true, phone: true } },
                items: { select: { id: true, serviceName: true, quantity: true, unitPrice: true } }
              }
            }
          }
        },
        challanItems: true,
        vendorBill: { select: { billNo: true, status: true } }
      }
    });
    return success(res, challans);
  } catch (e) { return error(res, 'Failed to fetch challans'); }
};

// GET /api/v1/challans/:id
const getChallan = async (req, res) => {
  try {
    const challan = await prisma.deliveryChallan.findUnique({
      where: { id: req.params.id },
      include: {
        challanOrders: {
          include: {
            order: {
              include: {
                customer: { select: { name: true, phone: true, id: true } },
                items: true
              }
            }
          }
        },
        challanItems: {
          include: {
            orderItem: { select: { serviceName: true, quantity: true, unitPrice: true, orderId: true } }
          }
        },
        vendorBill: true
      }
    });
    if (!challan) return badRequest(res, 'Challan not found');
    return success(res, challan);
  } catch (e) { return error(res, 'Failed to fetch challan'); }
};

// POST /api/v1/challans — create challan with multiple orders
const createChallan = async (req, res) => {
  try {
    const { plant, orderIds, driverName, vehicleNo, notes } = req.body;
    if (!plant)             return badRequest(res, 'Plant is required');
    if (!orderIds?.length)  return badRequest(res, 'At least one order required');
    const normalizedOrderIds = [...new Set(orderIds.filter(Boolean))];
    if (normalizedOrderIds.length !== orderIds.length) return badRequest(res, 'Duplicate order IDs are not allowed in one challan');

    // Fetch all orders with their items
    const orders = await prisma.order.findMany({
      where: { id: { in: normalizedOrderIds }, ...ORDER_ONLY_WHERE },
      include: {
        items: true,
        customer: { select: { name: true } }
      }
    });

    if (orders.length !== normalizedOrderIds.length) return badRequest(res, 'One or more orders not found');
    const sendableStatuses = new Set(['PENDING', 'PICKED_UP', 'PROCESSING']);
    const invalidOrders = orders.filter((order) => !sendableStatuses.has(order.status));
    if (invalidOrders.length) return badRequest(res, 'Only created, received, or in-process orders can be sent to plant challans');
    const alreadyLinked = await prisma.challanOrder.findMany({
      where: { orderId: { in: normalizedOrderIds }, challan: { status: { in: ['DISPATCHED', 'PARTIAL', 'PROCESSED'] } } },
      select: { orderId: true }
    });
    if (alreadyLinked.length) return badRequest(res, 'One or more orders are already part of an active challan');

    // Fetch vendor prices for this plant
    const vendorPrices = await prisma.vendorPriceList.findMany({ where: { plant } });
    const priceMap = {};
    vendorPrices.forEach(vp => { priceMap[vp.serviceId] = vp.costPrice; priceMap[vp.serviceName] = vp.costPrice; });

    // Calculate totals
    let totalCustomerValue = 0;
    let totalVendorCost    = 0;

    const challanItemsData = [];
    for (const order of orders) {
      totalCustomerValue += order.totalAmount || 0;
      for (const item of order.items) {
        const vendorCost = priceMap[item.serviceId] || priceMap[item.serviceName] || 0;
        totalVendorCost += vendorCost * item.quantity;
        challanItemsData.push({
          orderItemId:   item.id,
          serviceName:   item.serviceName,
          quantity:      item.quantity,
          customerPrice: item.unitPrice,
          vendorCost:    vendorCost,
          isReceived:    false,
        });
      }
    }

    const challanNo = await genChallanNo();

    // Create challan with all relations in transaction
    const challan = await prisma.$transaction(async (tx) => {
      const c = await tx.deliveryChallan.create({
        data: {
          challanNo,
          plant,
          driverName,
          vehicleNo,
          notes,
          status:        'DISPATCHED',
          customerValue: totalCustomerValue,
          vendorCost:    totalVendorCost,
          challanOrders: {
            create: normalizedOrderIds.map(orderId => ({ orderId }))
          },
          challanItems: {
            create: challanItemsData
          }
        },
        include: {
          challanOrders: { include: { order: { select: { orderNumber: true, customer: { select: { name: true } } } } } },
          challanItems: true
        }
      });

      // Mark all orders as SENT_TO_PLANT
      await tx.order.updateMany({
        where: { id: { in: normalizedOrderIds }, ...ORDER_ONLY_WHERE },
        data:  { status: 'SENT_TO_PLANT' }
      });

      return c;
    });

    return success(res, challan, 'Challan created — orders sent to plant');
  } catch (e) { return error(res, 'Failed to create challan'); }
};

// PATCH /api/v1/challans/:id/status — update challan status
const updateChallanStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const valid = ['DISPATCHED', 'PROCESSED', 'RECEIVED', 'PARTIAL'];
    if (!valid.includes(status)) return badRequest(res, `Invalid status. Must be one of: ${valid.join(', ')}`);
    const existing = await prisma.deliveryChallan.findUnique({ where: { id: req.params.id } });
    if (!existing) return badRequest(res, 'Challan not found');
    if (existing.status === 'RECEIVED' && status !== 'RECEIVED') return badRequest(res, 'Received challans cannot be moved back to an earlier state');

    const challan = await prisma.deliveryChallan.update({
      where: { id: req.params.id },
      data:  { status },
      include: { challanOrders: true }
    });

    // If fully received — move all orders to shop ironing queue
    if (status === 'RECEIVED') {
      const orderIds = challan.challanOrders.map(co => co.orderId);
      await prisma.order.updateMany({
        where: { id: { in: orderIds } },
        data:  { status: 'IRONING' }
      });
    }

    return success(res, challan, `Challan marked as ${status}`);
  } catch (e) { return error(res, 'Failed to update challan status'); }
};

// PATCH /api/v1/challans/:id/receive-items — mark specific garments as received
const receiveItems = async (req, res) => {
  try {
    const { items } = req.body; // array of { id, receivedQty }
    if (!items?.length) return badRequest(res, 'items array required');
    const challan = await prisma.deliveryChallan.findUnique({
      where: { id: req.params.id },
      include: { challanOrders: true, challanItems: true }
    });
    if (!challan) return badRequest(res, 'Challan not found');
    if (challan.status === 'RECEIVED') return badRequest(res, 'This challan is already fully received');
    const challanItemIds = new Set(challan.challanItems.map((item) => item.id));
    for (const item of items) {
      const receivedQty = Number(item?.receivedQty);
      if (!challanItemIds.has(item?.id)) return badRequest(res, 'One or more items do not belong to this challan');
      if (!Number.isInteger(receivedQty) || receivedQty < 0) return badRequest(res, 'receivedQty must be a valid non-negative integer');
      const existingItem = challan.challanItems.find((entry) => entry.id === item.id);
      if (receivedQty > existingItem.quantity) return badRequest(res, 'receivedQty cannot exceed dispatched quantity');
    }

    // Update each item with received quantity
    await Promise.all(items.map(item =>
      prisma.challanItem.update({
        where: { id: item.id },
        data: {
          receivedQty: item.receivedQty,
          isReceived: item.receivedQty >= challan.challanItems.find((entry) => entry.id === item.id).quantity,
          receivedAt: item.receivedQty > 0 ? new Date() : null
        }
      })
    ));

    // Check each order — if all its items in this challan are received, unlock order
    const refreshedChallan = await prisma.deliveryChallan.findUnique({
      where: { id: req.params.id },
      include: {
        challanOrders: true,
        challanItems: true
      }
    });

    const allReceived = refreshedChallan.challanItems.every(i => i.receivedQty >= i.quantity);

    // Check per order
    for (const co of refreshedChallan.challanOrders) {
      // Get this order's challan items
      const orderChallanItems = await prisma.challanItem.findMany({
        where: {
          challanId: refreshedChallan.id,
          orderItem: { orderId: co.orderId }
        }
      });

      const allOrderItemsReceived = orderChallanItems.every(i => i.receivedQty >= i.quantity);
      if (allOrderItemsReceived && orderChallanItems.length > 0) {
        await prisma.order.update({
          where: { id: co.orderId },
          data:  { status: 'IRONING' }
        });
      }
    }

    // Update challan status
    const updatedChallan = await prisma.deliveryChallan.update({
      where: { id: req.params.id },
      data:  { status: allReceived ? 'RECEIVED' : items.some(i => i.receivedQty > 0) ? 'PARTIAL' : 'DISPATCHED' },
      include: {
        challanOrders: {
          include: {
            order: {
              include: {
                customer: { select: { name: true, phone: true } },
                items: true
              }
            }
          }
        },
        challanItems: true
      }
    });

    return success(res, updatedChallan, allReceived ? 'All items received — orders unlocked' : 'Partial items received');
  } catch (e) { return error(res, 'Failed to receive challan items'); }
};

// ─────────────────────────────────────────────────────────────────────────────
// VENDOR BILLS
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/v1/vendor-bills
const getVendorBills = async (req, res) => {
  try {
    const { plant } = req.query;
    const where = plant ? { plant } : {};
    const bills = await prisma.vendorBill.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        challans: {
          select: { id: true, challanNo: true, status: true, vendorCost: true, customerValue: true, createdAt: true }
        }
      }
    });
    return success(res, bills);
  } catch (e) { return error(res, 'Failed to fetch vendor bills'); }
};

// POST /api/v1/vendor-bills — create bill from selected challans
const createVendorBill = async (req, res) => {
  try {
    const { plant, challanIds, notes } = req.body;
    if (!plant)           return badRequest(res, 'Plant is required');
    if (!challanIds?.length) return badRequest(res, 'Select at least one challan');
    const normalizedChallanIds = [...new Set(challanIds.filter(Boolean))];
    if (normalizedChallanIds.length !== challanIds.length) return badRequest(res, 'Duplicate challan IDs are not allowed in one bill');

    // Fetch challans
    const challans = await prisma.deliveryChallan.findMany({
      where: { id: { in: normalizedChallanIds }, plant },
      include: { challanItems: true }
    });

    if (challans.length !== normalizedChallanIds.length) return badRequest(res, 'One or more challans were not found for this plant');
    const notReadyForBilling = challans.filter((challan) => !['PARTIAL', 'RECEIVED', 'PROCESSED'].includes(challan.status));
    if (notReadyForBilling.length) return badRequest(res, 'Only processed or received challans can be billed');

    // Check none are already in a bill
    const alreadyBilled = challans.filter(c => c.vendorBillId);
    if (alreadyBilled.length) return badRequest(res, `${alreadyBilled.length} challans are already in a bill`);

    const totalAmount = challans.reduce((sum, c) => sum + c.vendorCost, 0);
    const billNo      = await genBillNo();

    const bill = await prisma.vendorBill.create({
      data: {
        billNo,
        plant,
        totalAmount,
        notes,
        status: 'PENDING',
        challans: { connect: normalizedChallanIds.map(id => ({ id })) }
      },
      include: {
        challans: {
          select: { id: true, challanNo: true, vendorCost: true, customerValue: true, createdAt: true }
        }
      }
    });

    return success(res, bill, `Vendor bill ${billNo} created — ${fmt(totalAmount)}`);
  } catch (e) { return error(res, 'Failed to create vendor bill'); }
};

// PATCH /api/v1/vendor-bills/:id/pay — mark bill as paid
const payVendorBill = async (req, res) => {
  try {
    const existingBill = await prisma.vendorBill.findUnique({ where: { id: req.params.id } });
    if (!existingBill) return badRequest(res, 'Bill not found');
    if (existingBill.status === 'PAID') return badRequest(res, 'Bill is already marked as paid');
    const bill = await prisma.vendorBill.update({
      where: { id: req.params.id },
      data:  { status: 'PAID', paidAt: new Date() }
    });
    return success(res, bill, 'Bill marked as paid');
  } catch (e) { return error(res, 'Failed to mark vendor bill as paid'); }
};

const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;


// ── PDF Generation ────────────────────────────────────────────────────────────
const { generateChallanHTML, generateVendorBillHTML } = require('../services/challan.pdf.service');

const { htmlToPDF } = require('../services/pdf-render.service');

const getChallanPDF = async (req, res) => {
  try {
    const challan = await prisma.deliveryChallan.findUnique({
      where: { id: req.params.id },
      include: {
        challanOrders: { include: { order: { include: { customer: { select: { name: true, phone: true } }, items: true } } } },
        challanItems: true,
        vendorBill: true
      }
    });
    if (!challan) return badRequest(res, 'Challan not found');
    const html = generateChallanHTML(challan);
    const pdf = await htmlToPDF(html);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${challan.challanNo}.pdf"`);
    res.send(pdf);
  } catch (e) { return error(res, 'Failed to generate challan PDF'); }
};

const getVendorBillPDF = async (req, res) => {
  try {
    const bill = await prisma.vendorBill.findUnique({
      where: { id: req.params.id },
      include: { challans: { select: { id: true, challanNo: true, vendorCost: true, customerValue: true, createdAt: true } } }
    });
    if (!bill) return badRequest(res, 'Bill not found');
    const html = generateVendorBillHTML(bill);
    const pdf = await htmlToPDF(html);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${bill.billNo}.pdf"`);
    res.send(pdf);
  } catch (e) { return error(res, 'Failed to generate vendor bill PDF'); }
};

module.exports = {
  // Vendor prices
  getVendorPrices, upsertVendorPrice, bulkUpsertVendorPrices,
  // Challans
  getChallans, getChallan, createChallan, updateChallanStatus, receiveItems,
  // Vendor bills
  getVendorBills, createVendorBill, payVendorBill,
  // PDF
  getChallanPDF, getVendorBillPDF,
};
