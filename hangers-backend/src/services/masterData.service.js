const prisma = require('../config/database');
const {
  ADDRESS_LABELS,
  CORE_PAYMENT_METHODS,
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
  ORDER_WORKFLOW,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  PLANT_ISSUE_TYPES,
  PROMO_BANNERS,
  QUOTATION_STATUSES,
  RECURRING_FREQUENCIES,
  ROLE_SERVICE_ACCESS,
  REPORT_TYPES,
  RETURN_REASONS,
  SERVICE_CATEGORY_UI,
  SERVICE_CODES,
  STAFF_ROLES,
  WEEKDAY_OPTIONS,
  WHATSAPP_TEMPLATES,
} = require('../config/master-data');

const MASTER_SETTING_KEYS = {
  addressLabels: 'master.addressLabels',
  customerTags: 'master.customerTags',
  deliveryFailReasons: 'master.deliveryFailReasons',
  discountValueTypes: 'master.discountValueTypes',
  documentTypes: 'master.documentTypes',
  expenseCategories: 'master.expenseCategories',
  ironSubscriptionStatuses: 'master.ironSubscriptionStatuses',
  languages: 'master.languages',
  marketingAudiences: 'master.marketingAudiences',
  marketingTriggers: 'master.marketingTriggers',
  orderStatuses: 'master.orderStatuses',
  orderWorkflow: 'master.orderWorkflow',
  paymentMethods: 'master.paymentMethods',
  paymentStatuses: 'master.paymentStatuses',
  plantIssueTypes: 'master.plantIssueTypes',
  promoBanners: 'master.promoBanners',
  quotationStatuses: 'master.quotationStatuses',
  recurringFrequencies: 'master.recurringFrequencies',
  corePaymentMethods: 'master.corePaymentMethods',
  reportTypes: 'master.reportTypes',
  returnReasons: 'master.returnReasons',
  serviceCategoryUi: 'master.serviceCategoryUi',
  serviceCodes: 'master.serviceCodes',
  staffRoles: 'master.staffRoles',
  roleServiceAccess: 'master.roleServiceAccess',
  weekdays: 'master.weekdays',
  whatsappTemplates: 'master.whatsappTemplates',
};

const BOOTSTRAP_MASTER_SETTINGS = {
  [MASTER_SETTING_KEYS.addressLabels]: ADDRESS_LABELS,
  [MASTER_SETTING_KEYS.customerTags]: CUSTOMER_TAGS,
  [MASTER_SETTING_KEYS.deliveryFailReasons]: DELIVERY_FAIL_REASONS,
  [MASTER_SETTING_KEYS.discountValueTypes]: DISCOUNT_VALUE_TYPES,
  [MASTER_SETTING_KEYS.documentTypes]: DOCUMENT_TYPES,
  [MASTER_SETTING_KEYS.expenseCategories]: EXPENSE_CATEGORIES,
  [MASTER_SETTING_KEYS.ironSubscriptionStatuses]: IRON_SUBSCRIPTION_STATUS_META,
  [MASTER_SETTING_KEYS.languages]: LANGUAGES,
  [MASTER_SETTING_KEYS.marketingAudiences]: MARKETING_AUDIENCES,
  [MASTER_SETTING_KEYS.marketingTriggers]: MARKETING_TRIGGERS,
  [MASTER_SETTING_KEYS.orderStatuses]: ORDER_STATUSES,
  [MASTER_SETTING_KEYS.orderWorkflow]: ORDER_WORKFLOW,
  [MASTER_SETTING_KEYS.paymentMethods]: PAYMENT_METHODS,
  [MASTER_SETTING_KEYS.paymentStatuses]: PAYMENT_STATUSES,
  [MASTER_SETTING_KEYS.plantIssueTypes]: PLANT_ISSUE_TYPES,
  [MASTER_SETTING_KEYS.promoBanners]: PROMO_BANNERS,
  [MASTER_SETTING_KEYS.quotationStatuses]: QUOTATION_STATUSES,
  [MASTER_SETTING_KEYS.recurringFrequencies]: RECURRING_FREQUENCIES,
  [MASTER_SETTING_KEYS.corePaymentMethods]: CORE_PAYMENT_METHODS,
  [MASTER_SETTING_KEYS.reportTypes]: REPORT_TYPES,
  [MASTER_SETTING_KEYS.returnReasons]: RETURN_REASONS,
  [MASTER_SETTING_KEYS.serviceCategoryUi]: SERVICE_CATEGORY_UI,
  [MASTER_SETTING_KEYS.serviceCodes]: SERVICE_CODES,
  [MASTER_SETTING_KEYS.staffRoles]: STAFF_ROLES,
  [MASTER_SETTING_KEYS.roleServiceAccess]: ROLE_SERVICE_ACCESS,
  [MASTER_SETTING_KEYS.weekdays]: WEEKDAY_OPTIONS,
  [MASTER_SETTING_KEYS.whatsappTemplates]: WHATSAPP_TEMPLATES,
};

const parseJsonSetting = (setting, key) => {
  if (!setting?.value) throw new Error(`Missing required master setting: ${key}`);
  try {
    return JSON.parse(setting.value);
  } catch {
    throw new Error(`Invalid JSON in master setting: ${key}`);
  }
};

const getMasterSetting = async (key, tx = prisma) => {
  const setting = await tx.setting.findUnique({ where: { key } });
  return parseJsonSetting(setting, key);
};

const getOrderStatuses = () => getMasterSetting(MASTER_SETTING_KEYS.orderStatuses);
const getOrderWorkflow = () => getMasterSetting(MASTER_SETTING_KEYS.orderWorkflow);
const getPaymentMethods = () => getMasterSetting(MASTER_SETTING_KEYS.paymentMethods);
const getCorePaymentMethods = () => getMasterSetting(MASTER_SETTING_KEYS.corePaymentMethods);
const getReportTypes = () => getMasterSetting(MASTER_SETTING_KEYS.reportTypes);
const getServiceCodes = () => getMasterSetting(MASTER_SETTING_KEYS.serviceCodes);
const getRoleServiceAccess = () => getMasterSetting(MASTER_SETTING_KEYS.roleServiceAccess);
const getWhatsAppTemplates = () => getMasterSetting(MASTER_SETTING_KEYS.whatsappTemplates);

const getMasterMetadata = async () => {
  const entries = await Promise.all(
    Object.entries(MASTER_SETTING_KEYS).map(async ([name, key]) => [name, await getMasterSetting(key)])
  );
  return Object.fromEntries(entries);
};

const getCollectablePaymentMethods = async () => {
  const [paymentMethods, corePaymentMethods] = await Promise.all([
    getPaymentMethods(),
    getCorePaymentMethods(),
  ]);
  return paymentMethods.filter((method) => corePaymentMethods.includes(method.value));
};

const syncMasterDataSettings = async () => {
  await prisma.$transaction(async (tx) => {
    for (const [key, value] of Object.entries(BOOTSTRAP_MASTER_SETTINGS)) {
      const existing = await tx.setting.findUnique({ where: { key }, select: { id: true } });
      if (existing) continue;
      await tx.setting.create({
        data: {
          key,
          value: JSON.stringify(value),
          updatedBy: 'system-bootstrap',
        },
      });
    }
  });
};

module.exports = {
  MASTER_SETTING_KEYS,
  getCollectablePaymentMethods,
  getCorePaymentMethods,
  getMasterSetting,
  getMasterMetadata,
  getOrderStatuses,
  getOrderWorkflow,
  getPaymentMethods,
  getReportTypes,
  getRoleServiceAccess,
  getServiceCodes,
  getWhatsAppTemplates,
  syncMasterDataSettings,
};
