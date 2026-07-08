import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const importedWhere = { source: 'FABKLEAN' };

const [customers, orders, items, payments, stages, aggregate, byStatus, byPaymentMethod, byPaymentStatus] = await Promise.all([
  prisma.customer.count(),
  prisma.order.count({ where: importedWhere }),
  prisma.orderItem.count({ where: { order: importedWhere } }),
  prisma.payment.count({ where: { order: importedWhere } }),
  prisma.orderStage.count({ where: { order: importedWhere } }),
  prisma.order.aggregate({
    where: importedWhere,
    _sum: { totalAmount: true, paidAmount: true },
  }),
  prisma.order.groupBy({
    by: ['status'],
    where: importedWhere,
    _count: { status: true },
    _sum: { totalAmount: true, paidAmount: true },
  }),
  prisma.payment.groupBy({
    by: ['method'],
    where: { order: importedWhere },
    _count: { method: true },
    _sum: { amount: true },
  }),
  prisma.order.groupBy({
    by: ['paymentStatus'],
    where: importedWhere,
    _count: { paymentStatus: true },
    _sum: { totalAmount: true, paidAmount: true },
  }),
]);

console.log(JSON.stringify({
  totalCustomersInCrm: customers,
  importedOrders: orders,
  importedItems: items,
  importedPayments: payments,
  importedStages: stages,
  importedTotalAmount: aggregate._sum.totalAmount,
  importedPaidAmount: aggregate._sum.paidAmount,
  byStatus,
  byPaymentStatus,
  byPaymentMethod,
}, null, 2));

await prisma.$disconnect();
