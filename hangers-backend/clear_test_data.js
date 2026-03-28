const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function clearTestData() {
  console.log('Clearing test data...');

  // Clear in correct order (respect foreign keys)
  await prisma.challanItem.deleteMany({});
  await prisma.challanOrder.deleteMany({});
  await prisma.deliveryChallan.deleteMany({});
  await prisma.vendorBill.deleteMany({});
  await prisma.walletTransaction.deleteMany({});
  await prisma.payment.deleteMany({});
  await prisma.orderStage.deleteMany({});
  await prisma.orderItem.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.cashBook.deleteMany({});
  await prisma.expense.deleteMany({});
  await prisma.attendance.deleteMany({});
  await prisma.recurringPickup.deleteMany({});
  await prisma.campaign.deleteMany({});
  await prisma.loyaltyTransaction.deleteMany({});
  await prisma.customer.deleteMany({});

  console.log('✅ All test data cleared');
  console.log('✅ Kept: Staff accounts, Catalog, Services, Vendor prices, Automations, Coupons, Settings');
}

clearTestData()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
