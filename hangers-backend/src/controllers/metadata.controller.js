const prisma = require('../config/database');
const { success, error } = require('../utils/response');
const {
  getCollectablePaymentMethods,
  getMasterMetadata,
} = require('../services/masterData.service');

const titleCase = (value) => String(value || '')
  .toLowerCase()
  .replace(/(^|[\s_-])([a-z])/g, (_match, prefix, char) => `${prefix}${char.toUpperCase()}`)
  .trim();

const getDbPlantPartners = async () => {
  const [pricePlants, challanPlants, billPlants] = await Promise.all([
    prisma.vendorPriceList.findMany({ select: { plant: true }, distinct: ['plant'] }),
    prisma.deliveryChallan.findMany({ select: { plant: true }, distinct: ['plant'] }),
    prisma.vendorBill.findMany({ select: { plant: true }, distinct: ['plant'] }),
  ]);

  const values = [...pricePlants, ...challanPlants, ...billPlants]
    .map((row) => String(row.plant || '').trim())
    .filter(Boolean);

  return [...new Set(values)].sort().map((value) => ({
    value,
    label: titleCase(value.replace(/_/g, ' ')),
  }));
};

const getMetadata = async (_req, res) => {
  try {
    const [
      services,
      dbPlantPartners,
      masterMetadata,
      collectablePaymentMethods,
    ] = await Promise.all([
      prisma.service.findMany({
        where: { isActive: true },
        select: { category: true },
        distinct: ['category'],
        orderBy: { category: 'asc' },
      }),
      getDbPlantPartners(),
      getMasterMetadata(),
      getCollectablePaymentMethods(),
    ]);

    const serviceCategoryUi = masterMetadata.serviceCategoryUi || {};
    const serviceCategories = services.map(({ category }) => ({
      value: category,
      ...(serviceCategoryUi[category] || {
        id: category.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
        label: category.replace(/_/g, ' '),
        icon: 'hanger',
        color: '#023c62',
        lightColor: '#E8F0F7',
      }),
    }));

    return success(res, {
      metadata: {
        orderStatuses: masterMetadata.orderStatuses,
        orderWorkflow: masterMetadata.orderWorkflow,
        staffRoles: masterMetadata.staffRoles,
        marketingTriggers: masterMetadata.marketingTriggers,
        marketingAudiences: masterMetadata.marketingAudiences,
        addressLabels: masterMetadata.addressLabels,
        deliveryFailReasons: masterMetadata.deliveryFailReasons,
        documentTypes: masterMetadata.documentTypes,
        ironSubscriptionStatuses: masterMetadata.ironSubscriptionStatuses,
        paymentMethods: masterMetadata.paymentMethods,
        corePaymentMethods: masterMetadata.corePaymentMethods,
        collectablePaymentMethods,
        paymentStatuses: masterMetadata.paymentStatuses,
        plantIssueTypes: masterMetadata.plantIssueTypes,
        plantPartners: dbPlantPartners,
        quotationStatuses: masterMetadata.quotationStatuses,
        customerTags: masterMetadata.customerTags,
        languages: masterMetadata.languages,
        recurringFrequencies: masterMetadata.recurringFrequencies,
        weekdays: masterMetadata.weekdays,
        expenseCategories: masterMetadata.expenseCategories,
        discountValueTypes: masterMetadata.discountValueTypes,
        returnReasons: masterMetadata.returnReasons,
        reportTypes: masterMetadata.reportTypes,
        serviceCategories,
        promoBanners: masterMetadata.promoBanners,
      },
    });
  } catch (err) {
    console.error('getMetadata error:', err);
    return error(res, 'Failed to fetch metadata');
  }
};

module.exports = { getMetadata };
