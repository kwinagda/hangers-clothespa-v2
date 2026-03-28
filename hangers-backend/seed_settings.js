const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const defaults = [
    { key: 'writeoff_max_amount', value: '10' },       // max ₹10 write-off per order
    { key: 'loyalty_points_per_rupee', value: '1' },   // 1 point per ₹1 spent
    { key: 'loyalty_rupee_per_point', value: '0.1' },  // 10 points = ₹1
    { key: 'loyalty_min_redeem_points', value: '100' }, // minimum 100 points to redeem
  ];
  for (const s of defaults) {
    await prisma.setting.upsert({
      where: { key: s.key },
      update: {},
      create: s,
    });
    console.log(`✓ ${s.key} = ${s.value}`);
  }
}
main().finally(() => prisma.$disconnect());
