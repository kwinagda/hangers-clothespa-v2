const prisma = require('../config/database');
const {
  ADDRESS_LABELS,
  CORE_PAYMENT_METHODS,
  CUSTOMER_TAGS,
  DISCOUNT_VALUE_TYPES,
  DELIVERY_FAIL_REASONS,
  DOCUMENT_TYPES,
  ERROR_CATALOG,
  EXPENSE_CATEGORIES,
  FIELD_SERVICE_STATUSES,
  FIELD_SERVICE_WORKFLOW,
  IRON_SUBSCRIPTION_STATUS_META,
  LANGUAGES,
  LEGAL_TERMS,
  LAUNCH_CAPABILITIES,
  MARKETING_AUDIENCES,
  MARKETING_TRIGGERS,
  ORDER_STATUSES,
  ORDER_SOURCES,
  ORDER_WORKFLOW,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  PAYMENT_TRANSACTION_STATUSES,
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
  errorCatalog: 'master.errorCatalog',
  fieldServiceStatuses: 'master.fieldServiceStatuses',
  fieldServiceWorkflow: 'master.fieldServiceWorkflow',
  ironSubscriptionStatuses: 'master.ironSubscriptionStatuses',
  languages: 'master.languages',
  legalTerms: 'master.legalTerms',
  launchCapabilities: 'master.launchCapabilities',
  marketingAudiences: 'master.marketingAudiences',
  marketingTriggers: 'master.marketingTriggers',
  orderStatuses: 'master.orderStatuses',
  orderSources: 'master.orderSources',
  orderWorkflow: 'master.orderWorkflow',
  paymentMethods: 'master.paymentMethods',
  paymentStatuses: 'master.paymentStatuses',
  paymentTransactionStatuses: 'master.paymentTransactionStatuses',
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
  [MASTER_SETTING_KEYS.errorCatalog]: ERROR_CATALOG,
  [MASTER_SETTING_KEYS.fieldServiceStatuses]: FIELD_SERVICE_STATUSES,
  [MASTER_SETTING_KEYS.fieldServiceWorkflow]: FIELD_SERVICE_WORKFLOW,
  [MASTER_SETTING_KEYS.ironSubscriptionStatuses]: IRON_SUBSCRIPTION_STATUS_META,
  [MASTER_SETTING_KEYS.languages]: LANGUAGES,
  [MASTER_SETTING_KEYS.legalTerms]: LEGAL_TERMS,
  [MASTER_SETTING_KEYS.launchCapabilities]: LAUNCH_CAPABILITIES,
  [MASTER_SETTING_KEYS.marketingAudiences]: MARKETING_AUDIENCES,
  [MASTER_SETTING_KEYS.marketingTriggers]: MARKETING_TRIGGERS,
  [MASTER_SETTING_KEYS.orderStatuses]: ORDER_STATUSES,
  [MASTER_SETTING_KEYS.orderSources]: ORDER_SOURCES,
  [MASTER_SETTING_KEYS.orderWorkflow]: ORDER_WORKFLOW,
  [MASTER_SETTING_KEYS.paymentMethods]: PAYMENT_METHODS,
  [MASTER_SETTING_KEYS.paymentStatuses]: PAYMENT_STATUSES,
  [MASTER_SETTING_KEYS.paymentTransactionStatuses]: PAYMENT_TRANSACTION_STATUSES,
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

const mergeMasterDefaults = (stored, defaults) => {
  if (Array.isArray(defaults)) {
    if (!Array.isArray(stored)) return defaults;
    const merged = [...stored];
    defaults.forEach((item) => {
      const key = item && typeof item === 'object' ? item.key || item.value || item.id : item;
      const exists = merged.some((existing) => {
        const existingKey = existing && typeof existing === 'object' ? existing.key || existing.value || existing.id : existing;
        return existingKey === key;
      });
      if (!exists) merged.push(item);
    });
    return merged;
  }
  if (defaults && typeof defaults === 'object') {
    const source = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
    return Object.entries(defaults).reduce((result, [childKey, defaultValue]) => {
      result[childKey] = mergeMasterDefaults(source[childKey], defaultValue);
      return result;
    }, { ...source });
  }
  return stored === undefined || stored === null ? defaults : stored;
};

const getMasterSetting = async (key, tx = prisma) => {
  const setting = await tx.setting.findUnique({ where: { key } });
  const parsed = parseJsonSetting(setting, key);
  const defaults = BOOTSTRAP_MASTER_SETTINGS[key];
  return defaults === undefined ? parsed : mergeMasterDefaults(parsed, defaults);
};

const getOrderStatuses = () => getMasterSetting(MASTER_SETTING_KEYS.orderStatuses);
const getOrderSources = () => getMasterSetting(MASTER_SETTING_KEYS.orderSources);
const getOrderWorkflow = () => getMasterSetting(MASTER_SETTING_KEYS.orderWorkflow);
const getFieldServiceStatuses = () => getMasterSetting(MASTER_SETTING_KEYS.fieldServiceStatuses);
const getFieldServiceWorkflow = () => getMasterSetting(MASTER_SETTING_KEYS.fieldServiceWorkflow);
const getPaymentMethods = () => getMasterSetting(MASTER_SETTING_KEYS.paymentMethods);
const getCorePaymentMethods = () => getMasterSetting(MASTER_SETTING_KEYS.corePaymentMethods);
const getPaymentTransactionStatuses = () => getMasterSetting(MASTER_SETTING_KEYS.paymentTransactionStatuses);
const getLaunchCapabilities = () => getMasterSetting(MASTER_SETTING_KEYS.launchCapabilities);
const getLegalTerms = () => getMasterSetting(MASTER_SETTING_KEYS.legalTerms);
const getDeliveryFailReasons = () => getMasterSetting(MASTER_SETTING_KEYS.deliveryFailReasons);
const getErrorCatalog = () => getMasterSetting(MASTER_SETTING_KEYS.errorCatalog);
const getReportTypes = () => getMasterSetting(MASTER_SETTING_KEYS.reportTypes);
const getServiceCodes = () => getMasterSetting(MASTER_SETTING_KEYS.serviceCodes);
const getServiceCategoryUi = () => getMasterSetting(MASTER_SETTING_KEYS.serviceCategoryUi);
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

const getCapturedPaymentStatusValues = async () => {
  const statuses = await getPaymentTransactionStatuses();
  const capturedStatuses = statuses.filter((status) => status.countsAsCollection).map((status) => status.value);
  if (!capturedStatuses.length) throw new Error('Payment transaction master data has no captured collection statuses');
  return capturedStatuses;
};

const getLaunchCapability = async (feature, action) => {
  const launchCapabilities = await getLaunchCapabilities();
  const featureConfig = launchCapabilities?.[feature];
  const enabled = Boolean(featureConfig?.enabled && featureConfig?.capabilities?.[action]);
  return {
    enabled,
    feature,
    action,
    label: featureConfig?.label || feature,
    reason: featureConfig?.reason || 'Feature is disabled for this environment.',
  };
};

const mergeMissingKeys = (base, current) => {
  if (Array.isArray(base) || Array.isArray(current)) return current === undefined ? base : current;
  if (!base || typeof base !== 'object') return current === undefined ? base : current;
  const output = { ...(current && typeof current === 'object' ? current : {}) };
  for (const [key, value] of Object.entries(base)) {
    output[key] = mergeMissingKeys(value, output[key]);
  }
  return output;
};

const syncMasterDataSettings = async () => {
  await prisma.$transaction(async (tx) => {
    for (const [key, value] of Object.entries(BOOTSTRAP_MASTER_SETTINGS)) {
      const existing = await tx.setting.findUnique({ where: { key }, select: { id: true, value: true } });
      if (existing) {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          const current = parseJsonSetting(existing, key);
          const merged = mergeMissingKeys(value, current);
          if (JSON.stringify(merged) !== JSON.stringify(current)) {
            await tx.setting.update({
              where: { key },
              data: {
                value: JSON.stringify(merged),
                updatedBy: 'system-bootstrap',
              },
            });
          }
        }
        continue;
      }
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
  getCapturedPaymentStatusValues,
  getCorePaymentMethods,
  getDeliveryFailReasons,
  getErrorCatalog,
  getFieldServiceStatuses,
  getFieldServiceWorkflow,
  getLaunchCapabilities,
  getLaunchCapability,
  getLegalTerms,
  getMasterSetting,
  getMasterMetadata,
  getOrderStatuses,
  getOrderSources,
  getOrderWorkflow,
  getPaymentMethods,
  getPaymentTransactionStatuses,
  getReportTypes,
  getRoleServiceAccess,
  getServiceCategoryUi,
  getServiceCodes,
  getWhatsAppTemplates,
  syncMasterDataSettings,
};
