const prisma = require('../config/database');
const { success, error } = require('../utils/response');
const {
  ADDRESS_LABELS,
  CUSTOMER_TAGS,
  DISCOUNT_VALUE_TYPES,
  DELIVERY_FAIL_REASONS,
  DOCUMENT_TYPES,
  EXPENSE_CATEGORIES,
  IRON_SUBSCRIPTION_STATUS_META,
  LANGUAGES,
  MARKETING_AUDIENCES,
  MARKETING_TRIGGERS,
  ORDER_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  PLANT_PARTNERS,
  PLANT_ISSUE_TYPES,
  PROMO_BANNERS,
  QUOTATION_STATUSES,
  RECURRING_FREQUENCIES,
  REPORT_TYPES,
  RETURN_REASONS,
  SERVICE_CATEGORY_UI,
  STAFF_ROLES,
  WEEKDAY_OPTIONS,
} = require('../config/master-data');

const getMetadata = async (_req, res) => {
  try {
    const services = await prisma.service.findMany({
      where: { isActive: true },
      select: { category: true },
      distinct: ['category'],
      orderBy: { category: 'asc' },
    });

    const serviceCategories = services.map(({ category }) => ({
      value: category,
      ...(SERVICE_CATEGORY_UI[category] || {
        id: category.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
        label: category.replace(/_/g, ' '),
        icon: 'hanger',
        color: '#023c62',
        lightColor: '#E8F0F7',
      }),
    }));

    return success(res, {
      metadata: {
        orderStatuses: ORDER_STATUSES,
        staffRoles: STAFF_ROLES,
        marketingTriggers: MARKETING_TRIGGERS,
        marketingAudiences: MARKETING_AUDIENCES,
        addressLabels: ADDRESS_LABELS,
        deliveryFailReasons: DELIVERY_FAIL_REASONS,
        documentTypes: DOCUMENT_TYPES,
        ironSubscriptionStatuses: IRON_SUBSCRIPTION_STATUS_META,
        paymentMethods: PAYMENT_METHODS,
        paymentStatuses: PAYMENT_STATUSES,
        plantIssueTypes: PLANT_ISSUE_TYPES,
        plantPartners: PLANT_PARTNERS,
        quotationStatuses: QUOTATION_STATUSES,
        customerTags: CUSTOMER_TAGS,
        languages: LANGUAGES,
        recurringFrequencies: RECURRING_FREQUENCIES,
        weekdays: WEEKDAY_OPTIONS,
        expenseCategories: EXPENSE_CATEGORIES,
        discountValueTypes: DISCOUNT_VALUE_TYPES,
        returnReasons: RETURN_REASONS,
        reportTypes: REPORT_TYPES,
        serviceCategories,
        promoBanners: PROMO_BANNERS,
      },
    });
  } catch (err) {
    console.error('getMetadata error:', err);
    return error(res, 'Failed to fetch metadata');
  }
};

module.exports = { getMetadata };
