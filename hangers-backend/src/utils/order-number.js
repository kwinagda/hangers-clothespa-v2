const prisma = require('../config/database');

const maxNumericSuffix = (rows, pattern) => rows.reduce((max, row) => {
  const match = String(row.orderNumber || '').match(pattern);
  return match ? Math.max(max, Number(match[1])) : max;
}, 0);

const generateOrderNumber = async (options = {}) => {
  const { isReturn = false, documentType = 'ORDER', client = prisma } = options;

  if (documentType === 'QUOTATION') {
    const quotations = await client.order.findMany({
      where: { documentType: 'QUOTATION' },
      select: { orderNumber: true },
    });
    const next = maxNumericSuffix(quotations, /^HCS-Q(\d+)$/i) + 1;
    return `HCS-Q${String(next).padStart(3, '0')}`;
  }

  const orders = await client.order.findMany({
    where: { documentType: 'ORDER' },
    select: { orderNumber: true },
  });
  const next = maxNumericSuffix(orders, /^HCS-(\d+)/i) + 1;
  const nextNumber = `HCS-${String(next).padStart(3, '0')}`;
  return isReturn ? `${nextNumber}-R` : nextNumber;
};

module.exports = { generateOrderNumber };
