const prisma = require('../config/database');

const generateOrderNumber = async (options = {}) => {
  const { isReturn = false, documentType = 'ORDER' } = options;
  const count = await prisma.order.count({
    where: { isReturn, documentType },
  });

  const prefix = documentType === 'QUOTATION' ? 'HCS-Q' : 'HCS-';
  const nextNumber = `${prefix}${String(count + 1).padStart(3, '0')}`;
  return isReturn ? `${nextNumber}-R` : nextNumber;
};

module.exports = { generateOrderNumber };
