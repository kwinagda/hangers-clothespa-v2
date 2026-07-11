const prisma = require('../config/database');
const { badRequest, error } = require('../utils/response');
const { reportQuerySchema } = require('../validation/reports.schemas');
const { normalizePaymentMethod } = require('../utils/payment-method');
const { deriveOrderPaymentState } = require('../utils/order-payment-state');
const { getReportTypes } = require('../services/masterData.service');

const ORDER_ONLY_WHERE = { documentType: 'ORDER' };
const FINANCE_ORDER_WHERE = { ...ORDER_ONLY_WHERE, status: { not: 'CANCELLED' } };

const parseLocalDateBoundary = (value, boundary) => {
  if (!value) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  const suffix = boundary === 'end' ? 'T23:59:59.999' : 'T00:00:00.000';
  const parsed = new Date(`${normalized}${suffix}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const rupees = (value) => Number((Number(value || 0)).toFixed(2));
const addAmount = (map, key, amount) => map.set(key || 'Unknown', rupees((map.get(key || 'Unknown') || 0) + Number(amount || 0)));
const addCount = (map, key, count = 1) => map.set(key || 'Unknown', (map.get(key || 'Unknown') || 0) + Number(count || 0));
const rowsFromAmountMap = (map) => [...map.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value: rupees(value) }));
const rowsFromCountMap = (map) => [...map.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value: Number(value || 0) }));
const sum = (rows, key) => rows.reduce((total, row) => total + Number(row[key] || 0), 0);
const isReturnOrder = (order) => Boolean(order.isReturn || order.status === 'RETURNED' || /-RT(?:-|$)/i.test(String(order.orderNumber || '')));
const paidValue = (order) => deriveOrderPaymentState(order).paidAmount + Number(order.writeOffAmount || 0);
const pendingValue = (order) => deriveOrderPaymentState(order).balanceDue;
const itemGrossValue = (order) => order.items.reduce((total, current) => total + Number(current.subtotal || 0), 0);
const lineDiscountValue = (order) => order.items.reduce((total, item) => total + Number(item.lineDiscountAmount || 0), 0);
const explicitDiscountValue = (order) => Number(order.discount || 0) + Number(order.couponDiscount || 0) + lineDiscountValue(order);
const importedDiscountAdjustment = (order) => {
  if (Number(order.totalAmount || 0) <= 0) return 0;
  const adjustment = itemGrossValue(order) - Number(order.totalAmount || 0) - explicitDiscountValue(order);
  return adjustment > 0.009 ? adjustment : 0;
};
const orderAdjustmentValue = (order) => {
  if (Number(order.totalAmount || 0) <= 0) return 0;
  const adjustment = itemGrossValue(order) - Number(order.totalAmount || 0) - explicitDiscountValue(order);
  return adjustment < -0.009 ? Math.abs(adjustment) : 0;
};
const allocatedItemAmount = (order, item) => {
  const itemGross = itemGrossValue(order);
  if (!itemGross) return 0;
  return Number(order.totalAmount || 0) * (Number(item.subtotal || 0) / itemGross);
};
const paymentDateWhere = (dateFilter) => ({ ...dateFilter, status: { not: 'FAILED' } });

const getOrders = (dateFilter, extra = {}) => prisma.order.findMany({
  where: { ...dateFilter, ...extra },
  include: {
    customer: { select: { id: true, name: true, phone: true, walletBalance: true, loyaltyPoints: true } },
    items: true,
    payments: { include: { collectedByStaff: { select: { name: true } } } },
  },
  orderBy: { createdAt: 'desc' },
});

const getReport = async (req, res) => {
  try {
    const parsed = reportQuerySchema.safeParse(req.query);
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Invalid report query');
    const { type, from, to } = parsed.data;
    const reportTypes = await getReportTypes();
    const reportTypeValues = reportTypes.map((report) => report.value);
    if (!reportTypeValues.includes(type)) return badRequest(res, `Invalid report type. Must be one of: ${reportTypeValues.join(', ')}`);

    const start = from ? parseLocalDateBoundary(from, 'start') : (() => {
      const now = new Date();
      return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    })();
    const end = to ? parseLocalDateBoundary(to, 'end') : new Date();

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return badRequest(res, 'Invalid report date range');
    if (end < start) return badRequest(res, 'Report end date must be on or after start date');

    const dateFilter = { createdAt: { gte: start, lte: end } };
    const financeOrders = async () => (await getOrders(dateFilter, FINANCE_ORDER_WHERE)).filter((order) => !isReturnOrder(order));

    switch (type) {
      case 'overview': {
        const [orders, customers, payments] = await Promise.all([
          getOrders(dateFilter, ORDER_ONLY_WHERE),
          prisma.customer.findMany({ where: dateFilter }),
          prisma.payment.findMany({ where: paymentDateWhere(dateFilter) }),
        ]);
        const billableOrders = orders.filter((order) => order.status !== 'CANCELLED' && !isReturnOrder(order));
        const revenue = sum(billableOrders, 'totalAmount');
        const paid = billableOrders.reduce((total, order) => total + paidValue(order), 0);
        const outstanding = billableOrders.reduce((total, order) => total + pendingValue(order), 0);
        return res.json({ success: true, data: {
          total: orders.length,
          revenue: rupees(revenue),
          paid: rupees(paid),
          outstanding: rupees(outstanding),
          customers: customers.length,
          paymentCount: payments.length,
          rows: [
            { label: 'Orders', value: orders.length },
            { label: 'Order Sales', value: rupees(revenue) },
            { label: 'Collected', value: rupees(paid) },
            { label: 'Outstanding', value: rupees(outstanding) },
            { label: 'New Customers', value: customers.length },
            { label: 'Payment Transactions', value: payments.length },
          ],
        } });
      }
      case 'sales': {
        const orders = await financeOrders();
        const revenue = sum(orders, 'totalAmount');
        const paid = orders.reduce((total, order) => total + paidValue(order), 0);
        const outstanding = orders.reduce((total, order) => total + pendingValue(order), 0);
        return res.json({ success: true, data: {
          orders: orders.length,
          revenue: rupees(revenue),
          paid: rupees(paid),
          outstanding: rupees(outstanding),
          rows: [
            { label: 'Orders', value: orders.length },
            { label: 'Revenue', value: rupees(revenue) },
            { label: 'Collected', value: rupees(paid) },
            { label: 'Outstanding', value: rupees(outstanding) },
          ],
        } });
      }
      case 'orders': {
        const orders = await getOrders(dateFilter, ORDER_ONLY_WHERE);
        const byStatus = orders.reduce((acc, order) => {
          acc[order.status] = (acc[order.status] || 0) + 1;
          return acc;
        }, {});
        return res.json({ success: true, data: { total: orders.length, byStatus, rows: Object.entries(byStatus).map(([label, value]) => ({ label, value })) } });
      }
      case 'sales_by_item':
      case 'garments': {
        const orders = await financeOrders();
        const itemCounts = new Map();
        orders.forEach((order) => order.items.forEach((item) => addCount(itemCounts, item.garmentType || item.serviceName, item.quantity || 1)));
        const rows = rowsFromCountMap(itemCounts).slice(0, 50);
        return res.json({ success: true, data: { topItems: rows.map((row) => [row.label, row.value]), rows, total: rows.reduce((total, row) => total + row.value, 0) } });
      }
      case 'sales_by_service':
      case 'catalog_vs_sales': {
        const orders = await financeOrders();
        const serviceSales = new Map();
        orders.forEach((order) => {
          const itemGross = itemGrossValue(order);
          if (!itemGross) {
            const totalAmount = Number(order.totalAmount || 0);
            if (totalAmount < -0.009) addAmount(serviceSales, 'Returns / Credits', totalAmount);
            else if (Math.abs(totalAmount) > 0.009) addAmount(serviceSales, 'Order-level Adjustment', totalAmount);
            return;
          }
          let allocated = 0;
          order.items.forEach((item) => {
            const amount = allocatedItemAmount(order, item);
            allocated += amount;
            addAmount(serviceSales, item.serviceName, amount);
          });
          const remainder = Number(order.totalAmount || 0) - allocated;
          if (Math.abs(remainder) > 0.009) addAmount(serviceSales, 'Order-level Adjustment', remainder);
        });
        const rows = rowsFromAmountMap(serviceSales).slice(0, 50);
        return res.json({ success: true, data: { rows, total: rupees(rows.reduce((total, row) => total + row.value, 0)) } });
      }
      case 'sales_by_date': {
        const orders = await financeOrders();
        const byDate = new Map();
        orders.forEach((order) => addAmount(byDate, order.createdAt.toISOString().slice(0, 10), order.totalAmount));
        const rows = [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([label, value]) => ({ label, value: rupees(value) }));
        return res.json({ success: true, data: { rows, total: rupees(rows.reduce((total, row) => total + row.value, 0)) } });
      }
      case 'sales_by_order': {
        const orders = await financeOrders();
        const rows = orders.map((order) => ({
          label: order.orderNumber,
          customer: order.customer?.name || order.customer?.phone || 'Walk-in',
          value: rupees(order.totalAmount),
          paid: rupees(paidValue(order)),
          status: order.status,
          date: order.createdAt,
        }));
        return res.json({ success: true, data: { rows, total: rupees(sum(orders, 'totalAmount')) } });
      }
      case 'sales_by_customer':
      case 'customer_vs_sale': {
        const orders = await financeOrders();
        const map = new Map();
        orders.forEach((order) => {
          const key = order.customer?.name || order.customer?.phone || 'Walk-in';
          const current = map.get(key) || { label: key, value: 0, orders: 0, paid: 0 };
          current.value += Number(order.totalAmount || 0);
          current.paid += paidValue(order);
          current.orders += 1;
          map.set(key, current);
        });
        const rows = [...map.values()].map((row) => ({ ...row, value: rupees(row.value), paid: rupees(row.paid) })).sort((a, b) => b.value - a.value);
        return res.json({ success: true, data: { rows, total: rupees(rows.reduce((total, row) => total + row.value, 0)) } });
      }
      case 'payments': {
        const payments = await prisma.payment.findMany({
          where: paymentDateWhere(dateFilter),
          include: { order: { select: { orderNumber: true } }, collectedByStaff: { select: { name: true } } },
          orderBy: { createdAt: 'desc' },
        });
        const byMode = payments.reduce((acc, payment) => {
          const key = normalizePaymentMethod(payment.method || payment.mode);
          acc[key] = rupees((acc[key] || 0) + Number(payment.amount || 0));
          return acc;
        }, {});
        return res.json({ success: true, data: {
          total: rupees(sum(payments, 'amount')),
          count: payments.length,
          byMode,
          payments,
          rows: payments.map((payment) => {
            const method = normalizePaymentMethod(payment.method || payment.mode);
            return {
            label: `${payment.order?.orderNumber || payment.id} - ${method}`,
            value: rupees(payment.amount),
            orderNumber: payment.order?.orderNumber || null,
            method,
            staff: payment.collectedByStaff?.name || 'Unassigned',
            date: payment.createdAt,
          };
          }),
        } });
      }
      case 'pending_payments': {
        const orders = await getOrders(dateFilter, FINANCE_ORDER_WHERE);
        const rows = orders
          .map((order) => {
            const paymentState = deriveOrderPaymentState(order);
            return { label: order.orderNumber, customer: order.customer?.name || order.customer?.phone || 'Walk-in', value: rupees(paymentState.balanceDue), status: paymentState.paymentStatus };
          })
          .filter((row) => row.value > 0)
          .sort((a, b) => b.value - a.value);
        return res.json({ success: true, data: { rows, total: rupees(rows.reduce((total, row) => total + row.value, 0)), count: rows.length } });
      }
      case 'income': {
        const [orders, payments] = await Promise.all([financeOrders(), prisma.payment.findMany({ where: paymentDateWhere(dateFilter) })]);
        const revenue = sum(orders, 'totalAmount');
        const collected = sum(payments, 'amount');
        const outstanding = orders.reduce((total, order) => total + pendingValue(order), 0);
        return res.json({ success: true, data: { total: rupees(revenue), rows: [
          { label: 'Order Sales', value: rupees(revenue) },
          { label: 'Collections', value: rupees(collected) },
          { label: 'Outstanding', value: rupees(outstanding) },
        ] } });
      }
      case 'discounts': {
        const orders = await financeOrders();
        const orderDiscount = sum(orders, 'discount');
        const couponDiscount = sum(orders, 'couponDiscount');
        const itemDiscount = orders.reduce((total, order) => total + lineDiscountValue(order), 0);
        const importedAdjustment = orders.reduce((total, order) => total + importedDiscountAdjustment(order), 0);
        return res.json({ success: true, data: { total: rupees(orderDiscount + couponDiscount + itemDiscount + importedAdjustment), rows: [
          { label: 'Order Discount', value: rupees(orderDiscount) },
          { label: 'Coupon Discount', value: rupees(couponDiscount) },
          { label: 'Item Discount', value: rupees(itemDiscount) },
          { label: 'Imported Discount', value: rupees(importedAdjustment) },
        ] } });
      }
      case 'adjustments': {
        const orders = await financeOrders();
        const zeroBillItems = orders.reduce((total, order) => Number(order.totalAmount || 0) === 0 && itemGrossValue(order) > 0 ? total + itemGrossValue(order) : total, 0);
        const positiveAdjustments = orders.reduce((total, order) => total + orderAdjustmentValue(order), 0);
        return res.json({ success: true, data: { total: rupees(positiveAdjustments), rows: [
          { label: 'Positive Order Adjustments', value: rupees(positiveAdjustments) },
          { label: 'Zero Bill Item Value', value: rupees(zeroBillItems) },
        ] } });
      }
      case 'cash_ups': {
        const rows = await prisma.cashBook.findMany({ where: { date: { gte: start, lte: end } }, orderBy: { date: 'desc' } });
        const byType = new Map();
        rows.forEach((row) => addAmount(byType, row.type, row.amount));
        return res.json({ success: true, data: { total: rupees(sum(rows, 'amount')), rows: rowsFromAmountMap(byType), entries: rows } });
      }
      case 'staff_collection': {
        const payments = await prisma.payment.findMany({ where: paymentDateWhere(dateFilter), include: { collectedByStaff: { select: { name: true } } } });
        const byStaff = new Map();
        payments.forEach((payment) => addAmount(byStaff, payment.collectedByStaff?.name || 'Unassigned', payment.amount));
        const rows = rowsFromAmountMap(byStaff);
        return res.json({ success: true, data: { total: rupees(rows.reduce((total, row) => total + row.value, 0)), rows } });
      }
      case 'customers': {
        const customers = await prisma.customer.findMany({ where: dateFilter, select: { id: true, name: true, phone: true, tag: true, createdAt: true, walletBalance: true, loyaltyPoints: true } });
        const byTag = customers.reduce((acc, customer) => {
          acc[customer.tag || 'REGULAR'] = (acc[customer.tag || 'REGULAR'] || 0) + 1;
          return acc;
        }, {});
        return res.json({ success: true, data: { total: customers.length, byTag, customers, rows: Object.entries(byTag).map(([label, value]) => ({ label, value })) } });
      }
      case 'customer_wallet': {
        const customers = await prisma.customer.findMany({ where: { walletBalance: { not: 0 } }, select: { name: true, phone: true, walletBalance: true } });
        const rows = customers.map((customer) => ({ label: customer.name || customer.phone, value: rupees(customer.walletBalance) })).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
        return res.json({ success: true, data: { total: rupees(rows.reduce((total, row) => total + row.value, 0)), rows } });
      }
      case 'cancellations': {
        const orders = (await getOrders(dateFilter, ORDER_ONLY_WHERE)).filter((order) => order.status === 'CANCELLED' || isReturnOrder(order));
        const byReason = new Map();
        orders.forEach((order) => {
          const key = isReturnOrder(order) ? 'Return Order' : (order.notes || 'Cancelled');
          const current = byReason.get(key) || { label: key, value: 0, amount: 0 };
          current.value += 1;
          current.amount += Number(order.totalAmount || 0);
          byReason.set(key, current);
        });
        const returnedValue = orders.filter(isReturnOrder).reduce((total, order) => total + Number(order.totalAmount || 0), 0);
        const rows = [...byReason.values()]
          .map((row) => ({ ...row, amount: rupees(row.amount) }))
          .sort((a, b) => b.value - a.value);
        return res.json({ success: true, data: { total: orders.length, returnedValue: rupees(returnedValue), rows, orders } });
      }
      case 'expenses': {
        const expenses = await prisma.expense.findMany({ where: { date: { gte: start, lte: end } }, orderBy: { date: 'desc' } });
        const byCategory = expenses.reduce((acc, expense) => {
          acc[expense.category] = rupees((acc[expense.category] || 0) + Number(expense.amount || 0));
          return acc;
        }, {});
        return res.json({ success: true, data: { total: rupees(sum(expenses, 'amount')), byCategory, expenses, rows: Object.entries(byCategory).map(([label, value]) => ({ label, value })) } });
      }
      case 'staff': {
        const attendance = await prisma.attendance.findMany({ where: { date: { gte: start, lte: end } }, include: { staff: { select: { name: true } } } });
        const byStaff = attendance.reduce((acc, entry) => {
          if (!acc[entry.staffId]) acc[entry.staffId] = { days: 0, totalHours: 0, name: entry.staff?.name || entry.staffId };
          acc[entry.staffId].days += 1;
          acc[entry.staffId].totalHours += Number(entry.hoursWorked || 0);
          return acc;
        }, {});
        return res.json({ success: true, data: { byStaff, records: attendance.length, rows: Object.values(byStaff).map((row) => ({ label: row.name, value: Number(row.totalHours.toFixed(1)), days: row.days })) } });
      }
      case 'loyalty': {
        const transactions = await prisma.loyaltyTransaction.findMany({ where: dateFilter, include: { customer: { select: { name: true, phone: true } } } });
        const byType = new Map();
        transactions.forEach((txn) => addCount(byType, txn.type, txn.points));
        return res.json({ success: true, data: { total: transactions.reduce((total, txn) => total + Number(txn.points || 0), 0), rows: rowsFromCountMap(byType), transactions } });
      }
      default:
        return badRequest(res, 'Invalid report type');
    }
  } catch (err) {
    return error(res, 'Failed to generate report');
  }
};

module.exports = { getReport };
