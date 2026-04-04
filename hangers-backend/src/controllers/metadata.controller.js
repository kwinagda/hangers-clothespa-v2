const prisma = require('../config/database');
const { success, error } = require('../utils/response');
const {
  ADDRESS_LABELS,
  CUSTOMER_TAGS,
  DISCOUNT_VALUE_TYPES,
  DELIVERY_FAIL_REASONS,
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
  RECURRING_FREQUENCIES,
  REPORT_TYPES,
  RETURN_REASONS,
  STAFF_ROLES,
  WEEKDAY_OPTIONS,
} = require('../config/master-data');

const CATEGORY_UI = {
  'DRY CLEAN — MEN': { id: 'dry_clean_men', label: 'Dry Clean Men', icon: 'hanger', color: '#023c62', lightColor: '#E8F0F7' },
  'DRY CLEAN — WOMEN': { id: 'dry_clean_women', label: 'Dry Clean Women', icon: 'hanger', color: '#035a8f', lightColor: '#EBF4FF' },
  'DRY CLEAN — HOUSEHOLD': { id: 'dry_clean_household', label: 'Household Dry Clean', icon: 'sofa', color: '#046a9e', lightColor: '#E8F2F8' },
  'STEAM IRONING': { id: 'steam_ironing', label: 'Steam Ironing', icon: 'iron', color: '#035a8f', lightColor: '#EBF4FF' },
  'NORMAL IRONING': { id: 'normal_ironing', label: 'Normal Ironing', icon: 'tshirt-crew', color: '#046a9e', lightColor: '#E8F2F8' },
  'DAILY_IRON': { id: 'daily_iron', label: 'Daily Iron', icon: 'iron', color: '#0d7a4e', lightColor: '#E8F7F0' },
  'LAUNDRY BY KG': { id: 'laundry_by_kg', label: 'Laundry / KG', icon: 'scale-bathroom', color: '#02304f', lightColor: '#E6EFF5' },
  'SHOE CLEANING': { id: 'shoe_cleaning', label: 'Shoe Cleaning', icon: 'shoe-sneaker', color: '#014e80', lightColor: '#EAF3FA' },
  'SOFA CLEANING': { id: 'sofa_cleaning', label: 'Sofa Cleaning', icon: 'sofa', color: '#023c62', lightColor: '#E8F0F7' },
  'ROLL PRESS': { id: 'roll_press', label: 'Roll Press', icon: 'newspaper-variant-outline', color: '#035a8f', lightColor: '#EBF4FF' },
  'ACCESSORIES': { id: 'accessories', label: 'Accessories', icon: 'bag-personal-outline', color: '#046a9e', lightColor: '#E8F2F8' },
};

const PROMO_BANNERS = [
  { id: 'pickup_delivery', title: 'Free Pickup & Delivery', subtitle: 'On all orders above ₹499', cta: 'Book Now' },
  { id: 'express', title: 'Express 24h Service', subtitle: 'Same-day cleaning available', cta: 'Book Now' },
  { id: 'referral', title: 'Refer & Earn ₹100', subtitle: 'Share your code, earn credits', cta: 'Share Now' },
  { id: 'eco', title: 'Eco-Friendly Process', subtitle: 'Safe for your clothes & planet', cta: 'Know More' },
];

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
      ...(CATEGORY_UI[category] || {
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
        ironSubscriptionStatuses: IRON_SUBSCRIPTION_STATUS_META,
        paymentMethods: PAYMENT_METHODS,
        paymentStatuses: PAYMENT_STATUSES,
        plantIssueTypes: PLANT_ISSUE_TYPES,
        plantPartners: PLANT_PARTNERS,
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
