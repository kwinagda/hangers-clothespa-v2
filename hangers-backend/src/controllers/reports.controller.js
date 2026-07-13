const prisma = require('../config/database');
const { badRequest, error } = require('../utils/response');
const { reportQuerySchema } = require('../validation/reports.schemas');
const { normalizePaymentMethod } = require('../utils/payment-method');
const { deriveOrderPaymentState } = require('../utils/order-payment-state');
const { getCapturedPaymentStatusValues, getReportTypes } = require('../services/masterData.service');
const { businessDateKey, parseBusinessDateBoundary } = require('../utils/business-time');

const ORDER_ONLY_WHERE = { documentType: 'ORDER' };
const FINANCE_ORDER_WHERE = { ...ORDER_ONLY_WHERE, status: { not: 'CANCELLED' } };

const rupees = (value) => Number((Number(value || 0)).toFixed(2));
const addAmount = (map, key, amount) => map.set(key || 'Unknown', rupees((map.get(key || 'Unknown') || 0) + Number(amount || 0)));
const addCount = (map, key, count = 1) => map.set(key || 'Unknown', (map.get(key || 'Unknown') || 0) + Number(count || 0));
const rowsFromAmountMap = (map) => [...map.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value: rupees(value) }));
const rowsFromCountMap = (map) => [...map.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value: Number(value || 0) }));
const sum = (rows, key) => rows.reduce((total, row) => total + Number(row[key] || 0), 0);
const isReturnOrder = (order) => Boolean(order.isReturn || order.status === 'RETURNED' || /-RT(?:-|$)/i.test(String(order.orderNumber || '')));
const collectionValue = (order, capturedStatuses) => deriveOrderPaymentState(order, { capturedStatuses }).paidAmount;
const writeOffValue = (order) => Number(order.writeOffAmount || 0);
const pendingValue = (order, capturedStatuses) => deriveOrderPaymentState(order, { capturedStatuses }).balanceDue;
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
const paymentDateWhere = (dateFilter, capturedStatuses) => ({ ...dateFilter, status: { in: capturedStatuses } });
const netPaymentValue = (payment) => String(payment.kind || 'RECEIPT') === 'REFUND'
  ? -Number(payment.amount || 0)
  : Number(payment.amount || 0);

const getOrders = (dateFilter, extra = {}) => prisma.order.findMany({
  where: { ...dateFilter, ...extra },
  include: {
    customer: { select: { id: true, name: true, phone: true, walletBalance: true, loyaltyPoints: true } },
    items: true,
    payments: { include: { collectedByStaff: { select: { name: true } } } },
    paymentAllocations: {
      where: { status: 'POSTED' },
      include: {
        payment: { select: { status: true } },
        refundAllocations: {
          where: { status: 'POSTED' },
          include: { refundPayment: { select: { status: true } } },
        },
      },
    },
  },
  orderBy: { createdAt: 'desc' },
});

const getInvoices = (dateFilter, extra = {}) => prisma.invoice.findMany({
  where: { ...dateFilter, status: { not: 'VOID' }, ...extra },
  include: {
    customer: { select: { id: true, name: true, phone: true } },
    order: {
      select: {
        id: true,
        orderNumber: true,
        status: true,
        financialAdjustments: {
          where: { kind: 'WRITE_OFF', status: 'POSTED' },
          select: { amount: true, createdAt: true },
        },
      },
    },
    ironBill: { select: { id: true, billNumber: true, status: true } },
    allocations: {
      where: { status: 'POSTED', payment: { status: { in: ['CAPTURED', 'SUCCESS', 'PAID'] }, kind: 'RECEIPT' } },
      select: { amount: true, createdAt: true, payment: { select: { createdAt: true } } },
    },
  },
  orderBy: { issueDate: 'desc' },
});

const invoiceWriteOff = (invoice, cutoff = null) => (invoice.order?.financialAdjustments || [])
  .filter((adjustment) => !cutoff || new Date(adjustment.createdAt) <= cutoff)
  .reduce((total, adjustment) => total + Number(adjustment.amount || 0), 0);

const invoiceSourceNumber = (invoice) =>
  invoice.order?.orderNumber || invoice.ironBill?.billNumber || invoice.invoiceNumber;

const getReport = async (req, res) => {
  try {
    const parsed = reportQuerySchema.safeParse(req.query);
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Invalid report query');
    const { type, from, to } = parsed.data;
    const reportTypes = await getReportTypes();
    const capturedPaymentStatuses = await getCapturedPaymentStatusValues();
    const capturedPaymentStatusSet = new Set(capturedPaymentStatuses);
    const reportTypeValues = reportTypes.map((report) => report.value);
    if (!reportTypeValues.includes(type)) return badRequest(res, `Invalid report type. Must be one of: ${reportTypeValues.join(', ')}`);

    const start = from
      ? parseBusinessDateBoundary(from, 'start')
      : parseBusinessDateBoundary(`${businessDateKey(new Date()).slice(0, 7)}-01`, 'start');
    const end = to ? parseBusinessDateBoundary(to, 'end') : new Date();

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return badRequest(res, 'Invalid report date range');
    if (end < start) return badRequest(res, 'Report end date must be on or after start date');

    const dateFilter = { createdAt: { gte: start, lte: end } };
    const invoiceDateFilter = { issueDate: { gte: start, lte: end } };
    const financeOrders = async () => (await getOrders(dateFilter, FINANCE_ORDER_WHERE)).filter((order) => !isReturnOrder(order));

    switch (type) {
      case 'overview': {
        const [orders, customers, payments, invoices] = await Promise.all([
          getOrders(dateFilter, ORDER_ONLY_WHERE),
          prisma.customer.findMany({ where: dateFilter }),
          prisma.payment.findMany({ where: paymentDateWhere(dateFilter, capturedPaymentStatuses) }),
          getInvoices(invoiceDateFilter),
        ]);
        const revenue = sum(invoices, 'totalAmount');
        const paid = payments.reduce((total, payment) => total + netPaymentValue(payment), 0);
        const writeOff = invoices.reduce((total, invoice) => total + invoiceWriteOff(invoice), 0);
        const outstanding = invoices.reduce((total, invoice) => total + Number(invoice.balanceDue || 0), 0);
        return res.json({ success: true, data: {
          total: orders.length,
          revenue: rupees(revenue),
          paid: rupees(paid),
          writeOff: rupees(writeOff),
          outstanding: rupees(outstanding),
          customers: customers.length,
          paymentCount: payments.length,
          rows: [
            { label: 'Orders', value: orders.length },
            { label: 'Invoiced Sales', value: rupees(revenue) },
            { label: 'Collected', value: rupees(paid) },
            { label: 'Write-offs', value: rupees(writeOff) },
            { label: 'Outstanding', value: rupees(outstanding) },
            { label: 'New Customers', value: customers.length },
            { label: 'Payment Transactions', value: payments.length },
          ],
        } });
      }
      case 'sales': {
        const [orders, payments, invoices] = await Promise.all([
          financeOrders(),
          prisma.payment.findMany({ where: paymentDateWhere(dateFilter, capturedPaymentStatuses) }),
          getInvoices(invoiceDateFilter),
        ]);
        const revenue = sum(invoices, 'totalAmount');
        const paid = payments.reduce((total, payment) => total + netPaymentValue(payment), 0);
        const writeOff = invoices.reduce((total, invoice) => total + invoiceWriteOff(invoice), 0);
        const outstanding = invoices.reduce((total, invoice) => total + Number(invoice.balanceDue || 0), 0);
        return res.json({ success: true, data: {
          orders: orders.length,
          revenue: rupees(revenue),
          paid: rupees(paid),
          writeOff: rupees(writeOff),
          outstanding: rupees(outstanding),
          rows: [
            { label: 'Orders', value: orders.length },
            { label: 'Invoices', value: invoices.length },
            { label: 'Revenue', value: rupees(revenue) },
            { label: 'Collected', value: rupees(paid) },
            { label: 'Write-offs', value: rupees(writeOff) },
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
        const invoices = await getInvoices(invoiceDateFilter);
        const byDate = new Map();
        invoices.forEach((invoice) => addAmount(byDate, businessDateKey(invoice.issueDate), invoice.totalAmount));
        const rows = [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([label, value]) => ({ label, value: rupees(value) }));
        return res.json({ success: true, data: { rows, total: rupees(rows.reduce((total, row) => total + row.value, 0)) } });
      }
      case 'sales_by_order': {
        const invoices = await getInvoices(invoiceDateFilter);
        const rows = invoices.map((invoice) => ({
          label: invoiceSourceNumber(invoice),
          invoiceNumber: invoice.invoiceNumber,
          sourceType: invoice.sourceType,
          customer: invoice.customer?.name || invoice.customer?.phone || 'Walk-in',
          value: rupees(invoice.totalAmount),
          paid: rupees(invoice.paidAmount),
          writeOff: rupees(invoiceWriteOff(invoice)),
          status: invoice.status,
          date: invoice.issueDate,
        }));
        return res.json({ success: true, data: { rows, total: rupees(sum(invoices, 'totalAmount')) } });
      }
      case 'sales_by_customer':
      case 'customer_vs_sale': {
        const invoices = await getInvoices(invoiceDateFilter);
        const map = new Map();
        invoices.forEach((invoice) => {
          const key = invoice.customer?.id || `missing:${invoice.customerId}`;
          const label = invoice.customer?.name || invoice.customer?.phone || 'Unknown customer';
          const current = map.get(key) || { customerId: invoice.customer?.id || invoice.customerId, label, value: 0, invoices: 0, paid: 0, writeOff: 0 };
          current.value += Number(invoice.totalAmount || 0);
          current.paid += Number(invoice.paidAmount || 0);
          current.writeOff += invoiceWriteOff(invoice);
          current.invoices += 1;
          map.set(key, current);
        });
        const rows = [...map.values()].map((row) => ({ ...row, value: rupees(row.value), paid: rupees(row.paid), writeOff: rupees(row.writeOff) })).sort((a, b) => b.value - a.value);
        return res.json({ success: true, data: { rows, total: rupees(rows.reduce((total, row) => total + row.value, 0)) } });
      }
      case 'payments': {
        const payments = await prisma.payment.findMany({
          where: paymentDateWhere(dateFilter, capturedPaymentStatuses),
          include: {
            order: { select: { orderNumber: true } },
            allocations: { take: 1, include: { invoice: { select: { invoiceNumber: true, ironBill: { select: { billNumber: true } } } } } },
            collectedByStaff: { select: { name: true } },
          },
          orderBy: { createdAt: 'desc' },
        });
        const byMode = payments.reduce((acc, payment) => {
          const key = normalizePaymentMethod(payment.method || payment.mode);
          acc[key] = rupees((acc[key] || 0) + netPaymentValue(payment));
          return acc;
        }, {});
        return res.json({ success: true, data: {
          total: rupees(payments.reduce((total, payment) => total + netPaymentValue(payment), 0)),
          count: payments.length,
          byMode,
          payments,
          rows: payments.map((payment) => {
            const method = normalizePaymentMethod(payment.method || payment.mode);
            const sourceNumber = payment.order?.orderNumber
              || payment.allocations[0]?.invoice?.ironBill?.billNumber
              || payment.allocations[0]?.invoice?.invoiceNumber
              || payment.id;
            return {
            label: `${sourceNumber} - ${method}`,
            value: rupees(netPaymentValue(payment)),
            kind: payment.kind || 'RECEIPT',
            orderNumber: sourceNumber,
            invoiceNumber: payment.allocations[0]?.invoice?.invoiceNumber || null,
            method,
            staff: payment.collectedByStaff?.name || 'Unassigned',
            date: payment.createdAt,
          };
          }),
        } });
      }
      case 'pending_payments': {
        const invoices = await prisma.invoice.findMany({
          where: { issueDate: { lte: end }, status: { not: 'VOID' } },
          include: {
            customer: { select: { id: true, name: true, phone: true } },
            order: {
              select: {
                orderNumber: true,
                financialAdjustments: {
                  where: { kind: 'WRITE_OFF', status: 'POSTED', createdAt: { lte: end } },
                  select: { amount: true },
                },
              },
            },
            ironBill: { select: { billNumber: true } },
            allocations: {
              where: {
                status: 'POSTED',
                payment: { kind: 'RECEIPT', status: { in: capturedPaymentStatuses }, createdAt: { lte: end } },
              },
              select: { amount: true },
            },
          },
          orderBy: { dueDate: 'asc' },
        });
        const rows = invoices
          .map((invoice) => {
            const paidAsOf = invoice.allocations.reduce((total, allocation) => total + Number(allocation.amount || 0), 0);
            const writeOffAsOf = (invoice.order?.financialAdjustments || []).reduce((total, adjustment) => total + Number(adjustment.amount || 0), 0);
            const balance = Math.max(0, Number(invoice.totalAmount || 0) - paidAsOf - writeOffAsOf);
            return {
              label: invoiceSourceNumber(invoice),
              invoiceNumber: invoice.invoiceNumber,
              sourceType: invoice.sourceType,
              customerId: invoice.customer?.id || invoice.customerId,
              customer: invoice.customer?.name || invoice.customer?.phone || 'Unknown customer',
              value: rupees(balance),
              paidAsOf: rupees(paidAsOf),
              writeOffAsOf: rupees(writeOffAsOf),
              dueDate: invoice.dueDate,
              isOverdue: invoice.dueDate < end,
              asOf: businessDateKey(end),
            };
          })
          .filter((row) => row.value > 0)
          .sort((a, b) => b.value - a.value);
        return res.json({ success: true, data: { rows, total: rupees(rows.reduce((total, row) => total + row.value, 0)), count: rows.length } });
      }
      case 'income': {
        const [invoices, payments] = await Promise.all([getInvoices(invoiceDateFilter), prisma.payment.findMany({ where: paymentDateWhere(dateFilter, capturedPaymentStatuses) })]);
        const revenue = sum(invoices, 'totalAmount');
        const collected = payments.reduce((total, payment) => total + netPaymentValue(payment), 0);
        const outstanding = invoices.reduce((total, invoice) => total + Number(invoice.balanceDue || 0), 0);
        return res.json({ success: true, data: { total: rupees(revenue), rows: [
          { label: 'Invoiced Revenue', value: rupees(revenue) },
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
        const [entries, cashPayments] = await Promise.all([
          prisma.cashBook.findMany({ where: { date: { gte: start, lte: end } }, orderBy: { date: 'asc' } }),
          prisma.payment.findMany({
            where: { ...paymentDateWhere(dateFilter, capturedPaymentStatuses), method: 'CASH' },
            orderBy: { createdAt: 'asc' },
          }),
        ]);
        const days = new Map();
        const day = (date) => {
          const key = businessDateKey(date);
          if (!days.has(key)) days.set(key, { label: key, opening: 0, closing: null, manualIn: 0, manualOut: 0, cashCollections: 0 });
          return days.get(key);
        };
        entries.forEach((entry) => {
          const current = day(entry.date);
          if (entry.type === 'OPEN') current.opening = Number(entry.amount || 0);
          else if (entry.type === 'CLOSE') current.closing = Number(entry.amount || 0);
          else if (entry.type === 'IN') current.manualIn += Number(entry.amount || 0);
          else if (entry.type === 'OUT') current.manualOut += Number(entry.amount || 0);
        });
        cashPayments.forEach((payment) => { day(payment.createdAt).cashCollections += netPaymentValue(payment); });
        const rows = [...days.values()].sort((a, b) => a.label.localeCompare(b.label)).map((row) => {
          const expectedClosing = row.opening + row.manualIn + row.cashCollections - row.manualOut;
          return {
            ...row,
            opening: rupees(row.opening),
            closing: row.closing === null ? null : rupees(row.closing),
            manualIn: rupees(row.manualIn),
            manualOut: rupees(row.manualOut),
            cashCollections: rupees(row.cashCollections),
            expectedClosing: rupees(expectedClosing),
            variance: row.closing === null ? null : rupees(row.closing - expectedClosing),
            value: rupees(row.cashCollections + row.manualIn - row.manualOut),
          };
        });
        return res.json({
          success: true,
          data: {
            total: rupees(rows.reduce((total, row) => total + row.value, 0)),
            rows,
            entries,
            definitions: { openingClosingAreCounts: true, totalIsNetMovement: true },
          },
        });
      }
      case 'staff_collection': {
        const payments = await prisma.payment.findMany({ where: paymentDateWhere(dateFilter, capturedPaymentStatuses), include: { collectedByStaff: { select: { name: true } } } });
        const byStaff = new Map();
        payments.forEach((payment) => addAmount(byStaff, payment.collectedByStaff?.name || 'Unassigned', netPaymentValue(payment)));
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
        const transactions = await prisma.walletTransaction.findMany({
          where: { createdAt: { gte: start, lte: end } },
          include: { customer: { select: { id: true, name: true, phone: true, walletBalance: true } } },
          orderBy: { createdAt: 'asc' },
        });
        const movement = new Map();
        transactions.forEach((transaction) => {
          const customer = transaction.customer;
          const current = movement.get(customer.id) || {
            customerId: customer.id,
            label: customer.name || customer.phone,
            credits: 0,
            debits: 0,
            closingBalance: Number(customer.walletBalance || 0),
          };
          if (transaction.type === 'CREDIT') current.credits += Number(transaction.amount || 0);
          else if (transaction.type === 'DEBIT') current.debits += Number(transaction.amount || 0);
          movement.set(customer.id, current);
        });
        const rows = [...movement.values()].map((row) => ({
          ...row,
          credits: rupees(row.credits),
          debits: rupees(row.debits),
          closingBalance: rupees(row.closingBalance),
          value: rupees(row.credits - row.debits),
        })).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
        return res.json({
          success: true,
          data: {
            total: rupees(rows.reduce((total, row) => total + row.value, 0)),
            rows,
            dateRange: { from: businessDateKey(start), to: businessDateKey(end) },
          },
        });
      }
      case 'cancellations': {
        const orders = await prisma.order.findMany({
          where: {
            ...ORDER_ONLY_WHERE,
            ...dateFilter,
            OR: [{ status: 'CANCELLED' }, { isReturn: true }],
          },
          include: {
            customer: { select: { id: true, name: true, phone: true } },
            stages: { orderBy: { createdAt: 'desc' }, take: 1 },
          },
          orderBy: { createdAt: 'desc' },
        });
        const byReason = new Map();
        orders.forEach((order) => {
          const latestEvent = order.stages[0];
          const key = isReturnOrder(order)
            ? (order.returnReason || 'RETURN_ORDER')
            : (latestEvent?.reasonCode || 'UNSPECIFIED_CANCELLATION');
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
        const expenses = await prisma.expense.findMany({ where: { date: { gte: start, lte: end }, status: 'POSTED' }, orderBy: { date: 'desc' } });
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
        const signedPoints = (txn) => {
          const points = Math.abs(Number(txn.points || 0));
          return ['REDEEM', 'DEBIT', 'EXPIRE'].includes(String(txn.type).toUpperCase()) ? -points : points;
        };
        transactions.forEach((txn) => addCount(byType, txn.type, signedPoints(txn)));
        return res.json({ success: true, data: { total: transactions.reduce((total, txn) => total + signedPoints(txn), 0), rows: rowsFromCountMap(byType), transactions } });
      }
      default:
        return badRequest(res, 'Invalid report type');
    }
  } catch (err) {
    return error(res, 'Failed to generate report');
  }
};

module.exports = { getReport };
