const prisma = require('../config/database');
const { success, error } = require('../utils/response');
const {
  getCollectablePaymentMethods,
  getMasterMetadata,
} = require('../services/masterData.service');

const getDbPlantPartners = async () => {
  const partners = await prisma.plantPartner.findMany({
    where: { isActive: true },
    select: { id: true, code: true, name: true, paymentTermsDays: true },
    orderBy: [{ name: 'asc' }, { code: 'asc' }],
  });
  return partners.map((partner) => ({
    id: partner.id,
    value: partner.code,
    label: partner.name,
    paymentTermsDays: partner.paymentTermsDays,
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
        orderSources: masterMetadata.orderSources,
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
        paymentTransactionStatuses: masterMetadata.paymentTransactionStatuses,
        plantIssueTypes: masterMetadata.plantIssueTypes,
        plantPartners: dbPlantPartners,
        quotationStatuses: masterMetadata.quotationStatuses,
        customerTags: masterMetadata.customerTags,
        languages: masterMetadata.languages,
        launchCapabilities: masterMetadata.launchCapabilities,
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
