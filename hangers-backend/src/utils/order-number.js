const prisma = require('../config/database');

const generateOrderNumber = async (options = {}) => {
  const { isReturn = false } = options;
  const count = await prisma.order.count({
    where: { isReturn },
  });

  const nextNumber = `HCS-${String(count + 1).padStart(3, '0')}`;
  return isReturn ? `${nextNumber}-R` : nextNumber;
};

module.exports = { generateOrderNumber };
