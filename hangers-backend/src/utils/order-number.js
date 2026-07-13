const prisma = require('../config/database');
const { nextDocumentNumber } = require('../services/document-number.service');

const generateOrderNumber = async (options = {}) => {
  const { isReturn = false, documentType = 'ORDER', client = prisma, scope = 'DEFAULT' } = options;
  if (documentType === 'QUOTATION') {
    return nextDocumentNumber({
      tx: client,
      documentType: 'QUOTATION',
      scope,
      prefix: 'HCS-Q',
      padding: 3,
    });
  }
  return nextDocumentNumber({
    tx: client,
    documentType: 'ORDER',
    scope,
    prefix: 'HCS-',
    padding: 3,
    suffix: isReturn ? '-R' : '',
  });
};

module.exports = { generateOrderNumber };
