// ── Challan System Controller ─────────────────────────────────────────────────
// Handles: Challans, ChallanOrders, ChallanItems, VendorPriceList, VendorBills
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const ok  = (res, data, msg = 'Success') => res.json({ success: true, message: msg, data });
const bad = (res, msg)                   => res.status(400).json({ success: false, message: msg });
const err = (res, e)                     => res.status(500).json({ success: false, message: e.message });

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
    ok(res, prices);
  } catch (e) { err(res, e); }
};

// POST /api/v1/vendor-prices — upsert price for a plant+service
const upsertVendorPrice = async (req, res) => {
  try {
    const { plant, serviceId, serviceName, costPrice } = req.body;
    if (!plant || !serviceName || costPrice === undefined) return bad(res, 'plant, serviceName and costPrice required');
    const price = await prisma.vendorPriceList.upsert({
      where: { plant_serviceId: { plant, serviceId: serviceId || serviceName } },
      update: { costPrice: parseFloat(costPrice), serviceName },
      create: { plant, serviceId: serviceId || serviceName, serviceName, costPrice: parseFloat(costPrice) }
    });
    ok(res, price, 'Vendor price saved');
  } catch (e) { err(res, e); }
};

// POST /api/v1/vendor-prices/bulk — save multiple prices at once
const bulkUpsertVendorPrices = async (req, res) => {
  try {
    const { plant, prices } = req.body; // prices: [{serviceId, serviceName, costPrice}]
    if (!plant || !prices?.length) return bad(res, 'plant and prices array required');
    const results = await Promise.all(prices.map((p) =>
      prisma.vendorPriceList.upsert({
        where: { plant_serviceId: { plant, serviceId: p.serviceId || p.serviceName } },
        update: { costPrice: parseFloat(p.costPrice), serviceName: p.serviceName },
        create: { plant, serviceId: p.serviceId || p.serviceName, serviceName: p.serviceName, costPrice: parseFloat(p.costPrice) }
      })
    ));
    ok(res, results, `${results.length} prices saved`);
  } catch (e) { err(res, e); }
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
    ok(res, challans);
  } catch (e) { err(res, e); }
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
    if (!challan) return bad(res, 'Challan not found');
    ok(res, challan);
  } catch (e) { err(res, e); }
};

// POST /api/v1/challans — create challan with multiple orders
const createChallan = async (req, res) => {
  try {
    const { plant, orderIds, driverName, vehicleNo, notes } = req.body;
    if (!plant)             return bad(res, 'Plant is required');
    if (!orderIds?.length)  return bad(res, 'At least one order required');

    // Fetch all orders with their items
    const orders = await prisma.order.findMany({
      where: { id: { in: orderIds } },
      include: {
        items: true,
        customer: { select: { name: true } }
      }
    });

    if (orders.length !== orderIds.length) return bad(res, 'One or more orders not found');

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
            create: orderIds.map(orderId => ({ orderId }))
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
        where: { id: { in: orderIds } },
        data:  { status: 'SENT_TO_PLANT' }
      });

      return c;
    });

    ok(res, challan, 'Challan created — orders sent to plant');
  } catch (e) { err(res, e); }
};

// PATCH /api/v1/challans/:id/status — update challan status
const updateChallanStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const valid = ['DISPATCHED', 'PROCESSED', 'RECEIVED', 'PARTIAL'];
    if (!valid.includes(status)) return bad(res, `Invalid status. Must be one of: ${valid.join(', ')}`);

    const challan = await prisma.deliveryChallan.update({
      where: { id: req.params.id },
      data:  { status },
      include: { challanOrders: true }
    });

    // If fully received — move all orders to PROCESSING
    if (status === 'RECEIVED') {
      const orderIds = challan.challanOrders.map(co => co.orderId);
      await prisma.order.updateMany({
        where: { id: { in: orderIds } },
        data:  { status: 'PROCESSING' }
      });
    }

    ok(res, challan, `Challan marked as ${status}`);
  } catch (e) { err(res, e); }
};

// PATCH /api/v1/challans/:id/receive-items — mark specific garments as received
const receiveItems = async (req, res) => {
  try {
    const { items } = req.body; // array of { id, receivedQty }
    if (!items?.length) return bad(res, 'items array required');

    // Update each item with received quantity
    await Promise.all(items.map(item =>
      prisma.challanItem.update({
        where: { id: item.id },
        data: {
          receivedQty: item.receivedQty,
          isReceived: item.receivedQty >= item.totalQty,
          receivedAt: item.receivedQty > 0 ? new Date() : null
        }
      })
    ));

    // Check each order — if all its items in this challan are received, unlock order
    const challan = await prisma.deliveryChallan.findUnique({
      where: { id: req.params.id },
      include: {
        challanOrders: true,
        challanItems: true
      }
    });

    const allReceived = challan.challanItems.every(i => i.receivedQty >= i.quantity);

    // Check per order
    for (const co of challan.challanOrders) {
      const orderItems = challan.challanItems.filter(ci => {
        // We need to check which items belong to this order
        return true; // Will be filtered via orderItem relation
      });

      // Get this order's challan items
      const orderChallanItems = await prisma.challanItem.findMany({
        where: {
          challanId: challan.id,
          orderItem: { orderId: co.orderId }
        }
      });

      const allOrderItemsReceived = orderChallanItems.every(i => i.receivedQty >= i.quantity);
      if (allOrderItemsReceived && orderChallanItems.length > 0) {
        await prisma.order.update({
          where: { id: co.orderId },
          data:  { status: 'PROCESSING' }
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

    ok(res, updatedChallan, allReceived ? 'All items received — orders unlocked' : 'Partial items received');
  } catch (e) { err(res, e); }
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
    ok(res, bills);
  } catch (e) { err(res, e); }
};

// POST /api/v1/vendor-bills — create bill from selected challans
const createVendorBill = async (req, res) => {
  try {
    const { plant, challanIds, notes } = req.body;
    if (!plant)           return bad(res, 'Plant is required');
    if (!challanIds?.length) return bad(res, 'Select at least one challan');

    // Fetch challans
    const challans = await prisma.deliveryChallan.findMany({
      where: { id: { in: challanIds }, plant },
      include: { challanItems: true }
    });

    if (!challans.length) return bad(res, 'No valid challans found');

    // Check none are already in a bill
    const alreadyBilled = challans.filter(c => c.vendorBillId);
    if (alreadyBilled.length) return bad(res, `${alreadyBilled.length} challans are already in a bill`);

    const totalAmount = challans.reduce((sum, c) => sum + c.vendorCost, 0);
    const billNo      = await genBillNo();

    const bill = await prisma.vendorBill.create({
      data: {
        billNo,
        plant,
        totalAmount,
        notes,
        status: 'PENDING',
        challans: { connect: challanIds.map(id => ({ id })) }
      },
      include: {
        challans: {
          select: { id: true, challanNo: true, vendorCost: true, customerValue: true, createdAt: true }
        }
      }
    });

    ok(res, bill, `Vendor bill ${billNo} created — ${fmt(totalAmount)}`);
  } catch (e) { err(res, e); }
};

// PATCH /api/v1/vendor-bills/:id/pay — mark bill as paid
const payVendorBill = async (req, res) => {
  try {
    const bill = await prisma.vendorBill.update({
      where: { id: req.params.id },
      data:  { status: 'PAID', paidAt: new Date() }
    });
    ok(res, bill, 'Bill marked as paid');
  } catch (e) { err(res, e); }
};

const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;


// ── PDF Generation ────────────────────────────────────────────────────────────
const { generateChallanHTML, generateVendorBillHTML } = require('../services/challan.pdf.service');

const puppeteer = require('puppeteer');

const htmlToPDF = async (html) => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox','--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' } });
  await browser.close();
  return Buffer.from(pdf);
};

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
    if (!challan) return bad(res, 'Challan not found');
    const html = generateChallanHTML(challan);
    const pdf = await htmlToPDF(html);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${challan.challanNo}.pdf"`);
    res.send(pdf);
  } catch (e) { err(res, e); }
};

const getVendorBillPDF = async (req, res) => {
  try {
    const bill = await prisma.vendorBill.findUnique({
      where: { id: req.params.id },
      include: { challans: { select: { id: true, challanNo: true, vendorCost: true, customerValue: true, createdAt: true } } }
    });
    if (!bill) return bad(res, 'Bill not found');
    const html = generateVendorBillHTML(bill);
    const pdf = await htmlToPDF(html);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${bill.billNo}.pdf"`);
    res.send(pdf);
  } catch (e) { err(res, e); }
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
