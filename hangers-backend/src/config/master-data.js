const ORDER_STATUSES = [
  { key: 'PENDING', label: 'Pending', customerLabel: 'Pickup Pending', plantLabel: 'Order Placed', icon: 'clipboard-text-outline', crmEditable: true, plantManaged: false, customerBucket: 'active', customerTrackVisible: true, color: '#92400e', bg: '#fffbeb', border: '#fde68a' },
  { key: 'PICKED_UP', label: 'Received', customerLabel: 'Received', plantLabel: 'Received', icon: 'car-outline', crmEditable: true, plantManaged: false, customerBucket: 'active', customerTrackVisible: true, plantTimeline: true, color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
  { key: 'PROCESSING', label: 'In Process', customerLabel: 'In Process', plantLabel: 'In Process', icon: 'factory', crmEditable: true, plantManaged: false, customerBucket: 'active', customerTrackVisible: true, plantTimeline: true, color: '#4338ca', bg: '#eef2ff', border: '#c7d2fe' },
  { key: 'WASHING', label: 'Legacy: Washing', customerLabel: 'In Process', plantLabel: 'Legacy: Washing', icon: 'water-outline', crmEditable: false, plantManaged: false, legacyOnly: true, customerBucket: 'active', customerTrackVisible: false, color: '#4338ca', bg: '#eef2ff', border: '#c7d2fe' },
  { key: 'DRYING', label: 'Legacy: Drying', customerLabel: 'In Process', plantLabel: 'Legacy: Drying', icon: 'weather-sunny', crmEditable: false, plantManaged: false, legacyOnly: true, customerBucket: 'active', customerTrackVisible: false, color: '#4338ca', bg: '#eef2ff', border: '#c7d2fe' },
  { key: 'IRONING', label: 'Pending Ironing', customerLabel: 'Pending Ironing', plantLabel: 'Pending Ironing', icon: 'iron', crmEditable: true, plantManaged: false, customerBucket: 'active', customerTrackVisible: true, plantTimeline: true, color: '#c2410c', bg: '#fff7ed', border: '#fed7aa' },
  { key: 'QC', label: 'Legacy: QC', customerLabel: 'Pending Ironing', plantLabel: 'Legacy: QC', icon: 'magnify', crmEditable: false, plantManaged: false, legacyOnly: true, customerBucket: 'active', customerTrackVisible: false, color: '#c2410c', bg: '#fff7ed', border: '#fed7aa' },
  { key: 'READY_FOR_DELIVERY', label: 'Ready', customerLabel: 'Ready', plantLabel: 'Ready', icon: 'package-variant-closed', crmEditable: true, plantManaged: false, customerBucket: 'active', customerTrackVisible: true, plantTimeline: true, color: '#0f766e', bg: '#f0fdfa', border: '#99f6e4' },
  { key: 'OUT_FOR_DELIVERY', label: 'Out for Delivery', customerLabel: 'Out for Delivery', plantLabel: 'Out for Delivery', icon: 'motorbike', crmEditable: true, plantManaged: false, customerBucket: 'active', customerTrackVisible: true, color: '#6d28d9', bg: '#f5f3ff', border: '#ddd6fe' },
  { key: 'DELIVERED', label: 'Delivered', customerLabel: 'Delivered', plantLabel: 'Delivered', icon: 'check-decagram-outline', crmEditable: true, plantManaged: false, customerBucket: 'completed', customerTrackVisible: true, color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
  { key: 'CANCELLED', label: 'Cancelled', customerLabel: 'Cancelled', plantLabel: 'Cancelled', icon: 'close-circle-outline', crmEditable: true, plantManaged: false, customerBucket: 'completed', customerTrackVisible: false, color: '#b91c1c', bg: '#fef2f2', border: '#fecaca' },
  { key: 'SENT_TO_PLANT', label: 'Sent to Plant', customerLabel: 'Sent to Plant', plantLabel: 'Sent to Plant', icon: 'truck-fast-outline', crmEditable: false, plantManaged: true, customerBucket: 'active', customerTrackVisible: false, color: '#854d0e', bg: '#fef9c3', border: '#fde68a' },
  { key: 'RETURNED', label: 'Returned', customerLabel: 'Returned', plantLabel: 'Returned', icon: 'backup-restore', crmEditable: false, plantManaged: false, customerBucket: 'completed', customerTrackVisible: false, color: '#991b1b', bg: '#fee2e2', border: '#fecaca' },
];

const ORDER_STATUS_KEYS = ORDER_STATUSES.map((status) => status.key);
const ORDER_STATUS_LABELS = ORDER_STATUSES.reduce((acc, status) => {
  acc[status.key] = status.plantLabel || status.label;
  return acc;
}, {});
const PLANT_STATUS_KEYS = ORDER_STATUSES.filter((status) => status.plantManaged).map((status) => status.key);
const ORDER_WORKFLOW = {
  sequence: ['PENDING', 'PICKED_UP', 'PROCESSING', 'SENT_TO_PLANT', 'IRONING', 'READY_FOR_DELIVERY', 'OUT_FOR_DELIVERY', 'DELIVERED'],
  next: {
    PENDING: 'PICKED_UP',
    PICKED_UP: 'PROCESSING',
    PROCESSING: 'IRONING',
    IRONING: 'READY_FOR_DELIVERY',
    READY_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
    OUT_FOR_DELIVERY: 'DELIVERED',
  },
  allowedForward: {
    PENDING: ['PICKED_UP', 'PROCESSING', 'SENT_TO_PLANT'],
    PICKED_UP: ['PROCESSING', 'SENT_TO_PLANT'],
    PROCESSING: ['IRONING', 'READY_FOR_DELIVERY', 'SENT_TO_PLANT'],
    SENT_TO_PLANT: ['IRONING'],
    IRONING: ['READY_FOR_DELIVERY'],
    READY_FOR_DELIVERY: ['OUT_FOR_DELIVERY'],
    OUT_FOR_DELIVERY: ['DELIVERED'],
  },
  allowedBackward: {
    PICKED_UP: ['PENDING'],
    PROCESSING: ['PICKED_UP'],
    IRONING: ['PROCESSING'],
    READY_FOR_DELIVERY: ['IRONING', 'PROCESSING'],
    OUT_FOR_DELIVERY: ['READY_FOR_DELIVERY'],
    CANCELLED: ['PENDING'],
  },
  crmEditableStatuses: ['PENDING', 'PICKED_UP', 'PROCESSING', 'IRONING', 'READY_FOR_DELIVERY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'],
  challanSendableStatuses: ['PICKED_UP', 'PROCESSING'],
  plantLockedStatuses: ['SENT_TO_PLANT'],
  plantReceivedTarget: 'IRONING',
  requiresItems: ['PROCESSING', 'IRONING', 'READY_FOR_DELIVERY', 'OUT_FOR_DELIVERY', 'DELIVERED'],
  directReadyAllowedStatuses: ['PROCESSING', 'IRONING'],
  directReadyTarget: 'READY_FOR_DELIVERY',
  cancellableStatuses: ['PENDING', 'PICKED_UP', 'PROCESSING'],
  deletableStatuses: ['PENDING', 'CANCELLED'],
  deliveredCorrectionTargets: ['READY_FOR_DELIVERY'],
  riderAssignableStatuses: ['PENDING', 'PICKED_UP', 'READY_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
  deliveryViews: {
    pickups: ['PENDING'],
    dispatch: ['READY_FOR_DELIVERY'],
    active: ['PENDING', 'READY_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
    done: ['DELIVERED'],
  },
  deliveryActions: {
    pickupFrom: ['PENDING'],
    pickupTarget: 'PICKED_UP',
    outForDeliveryStatus: 'OUT_FOR_DELIVERY',
    deliverableFrom: ['READY_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
    failedTarget: 'READY_FOR_DELIVERY',
    deliveredTarget: 'DELIVERED',
  },
  pushNotifications: {
    PICKED_UP: { title: 'Clothes Picked Up!', body: 'Your order has been picked up. We are on our way to the plant.' },
    READY_FOR_DELIVERY: { title: 'Ready for Delivery!', body: 'Your order is cleaned and ready. Delivery will be scheduled soon.' },
    OUT_FOR_DELIVERY: { title: 'Out for Delivery!', body: 'Your order is on its way. Expect delivery soon.' },
    DELIVERED: { title: 'Delivered!', body: 'Your order has been delivered. Thank you for choosing Hangers!' },
  },
  liveStatuses: ['PENDING', 'PICKED_UP', 'PROCESSING', 'SENT_TO_PLANT', 'IRONING', 'READY_FOR_DELIVERY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'RETURNED'],
  legacyStatuses: ['WASHING', 'DRYING', 'QC'],
  views: {
    all: {
      label: 'All Orders',
      title: 'All Orders',
      description: 'Complete operational queue across every order status.',
      metric: 'Total queue',
      statuses: ['PENDING', 'PICKED_UP', 'PROCESSING', 'SENT_TO_PLANT', 'IRONING', 'READY_FOR_DELIVERY', 'OUT_FOR_DELIVERY', 'DELIVERED'],
    },
    in_process: {
      label: 'In Process',
      title: 'In-Process Orders',
      description: 'Orders currently received, being processed, at plant, or pending ironing.',
      metric: 'Working queue',
      statuses: ['PICKED_UP', 'PROCESSING', 'SENT_TO_PLANT', 'IRONING'],
    },
    ready: {
      label: 'Ready',
      title: 'Ready Orders',
      description: 'Orders cleaned, packed, and ready for delivery.',
      metric: 'Ready queue',
      statuses: ['READY_FOR_DELIVERY'],
    },
    delivered: {
      label: 'Delivered',
      title: 'Delivered Orders',
      description: 'Completed orders delivered to customers or out for delivery.',
      metric: 'Delivered queue',
      statuses: ['OUT_FOR_DELIVERY', 'DELIVERED'],
    },
    cancelled: {
      label: 'Cancelled / Returns',
      title: 'Cancelled / Return Orders',
      description: 'Cancelled orders and imported return records.',
      metric: 'Closed exceptions',
      statuses: ['CANCELLED', 'RETURNED'],
    },
  },
};
const DELIVERY_MANAGER_ROLES = ['DELIVERY_MANAGER', 'MANAGER', 'SUPER_ADMIN'];
const DELIVERY_PIN_ROLES = ['DELIVERY_MANAGER', 'DELIVERY_RIDER'];
const PLANT_PIN_ROLES = ['PLANT_MANAGER', 'PLANT_STAFF', 'PLANT_QC'];
const DELIVERY_FAIL_REASONS = [
  { value: 'NOT_HOME', label: 'Customer not home' },
  { value: 'REFUSED', label: 'Customer refused' },
  { value: 'WRONG_ADDRESS', label: 'Wrong address' },
  { value: 'CUSTOMER_CANCELLED', label: 'Customer cancelled' },
  { value: 'OTHER', label: 'Other reason' },
];

const STAFF_ROLES = [
  { value: 'SUPER_ADMIN', label: 'Super Admin', pinEligible: false, color: '#92400e', bg: '#fef3c7' },
  { value: 'MANAGER', label: 'Manager', pinEligible: false, color: '#065f46', bg: '#d1fae5' },
  { value: 'COUNTER_STAFF', label: 'Counter Staff', pinEligible: false, color: '#1e40af', bg: '#dbeafe' },
  { value: 'ACCOUNTS', label: 'Accounts', pinEligible: false, color: '#5b21b6', bg: '#ede9fe' },
  { value: 'DELIVERY_MANAGER', label: 'Delivery Manager', pinEligible: true, color: '#9a3412', bg: '#ffedd5' },
  { value: 'DELIVERY_RIDER', label: 'Delivery Rider', pinEligible: true, color: '#0c4a6e', bg: '#e0f2fe' },
  { value: 'PLANT_MANAGER', label: 'Plant Manager', pinEligible: true, color: '#4a1d96', bg: '#f3e8ff' },
  { value: 'PLANT_STAFF', label: 'Plant Staff', pinEligible: true, color: '#1e3a5f', bg: '#e8f0f7' },
  { value: 'PLANT_QC', label: 'Plant QC', pinEligible: true, color: '#14532d', bg: '#dcfce7' },
];

const STAFF_ROLE_VALUES = STAFF_ROLES.map((role) => role.value);
const SERVICE_CODES = [
  'CRM',
  'CUSTOMER_APP',
  'STAFF_APP',
  'DELIVERY',
  'PLANT',
  'FINANCE',
  'MARKETING',
  'REPORTS',
];

const ROLE_PERMISSIONS = {
  SUPER_ADMIN: ['*'],
  MANAGER: [
    'dashboard.view',
    'orders.view', 'orders.create', 'orders.edit', 'orders.update_status',
    'orders.delete',
    'customers.view', 'customers.edit',
    'pricing.view', 'pricing.edit', 'pricing.import',
    'finance.view',
    'reports.view',
    'staff.view',
    'plant.view', 'plant.create_challan',
    'delivery.view', 'delivery.assign',
    'whatsapp.send',
    'print.all',
  ],
  COUNTER_STAFF: [
    'dashboard.view',
    'orders.view', 'orders.create', 'orders.update_status',
    'customers.view', 'customers.edit',
    'pricing.view',
    'print.all',
    'plant.create_challan',
  ],
  ACCOUNTS: [
    'dashboard.view',
    'orders.view',
    'customers.view',
    'pricing.view',
    'finance.view', 'finance.edit',
    'reports.view',
  ],
  DELIVERY_MANAGER: [
    'dashboard.view',
    'orders.view', 'orders.update_status',
    'customers.view',
    'delivery.view', 'delivery.assign', 'delivery.edit',
    'reports.delivery',
  ],
  DELIVERY_RIDER: [
    'delivery.own_orders',
    'orders.update_status',
  ],
  PLANT_MANAGER: [
    'plant.view', 'plant.edit', 'plant.update_stage', 'plant.create_challan',
    'plant.reports',
    'orders.view', 'orders.update_status',
    'staff.plant_view',
  ],
  PLANT_STAFF: [
    'plant.view',
    'plant.scan',
    'plant.update_own_stage',
  ],
  PLANT_QC: [
    'plant.view',
    'plant.scan',
    'plant.quality_check',
    'plant.update_stage',
    'plant.reports_limited',
  ],
};

const ROLE_SERVICE_ACCESS = {
  SUPER_ADMIN: [...SERVICE_CODES],
  MANAGER: ['CRM', 'CUSTOMER_APP', 'STAFF_APP', 'DELIVERY', 'PLANT', 'FINANCE', 'MARKETING', 'REPORTS'],
  COUNTER_STAFF: ['CRM', 'CUSTOMER_APP', 'REPORTS'],
  ACCOUNTS: ['CRM', 'FINANCE', 'REPORTS'],
  DELIVERY_MANAGER: ['CRM', 'DELIVERY', 'REPORTS'],
  DELIVERY_RIDER: ['DELIVERY', 'STAFF_APP'],
  PLANT_MANAGER: ['PLANT', 'STAFF_APP', 'REPORTS'],
  PLANT_STAFF: ['PLANT', 'STAFF_APP'],
  PLANT_QC: ['PLANT', 'STAFF_APP'],
};

const MARKETING_TRIGGERS = [
  { value: 'ORDER_PLACED', label: 'Order Placed' },
  { value: 'ORDER_READY', label: 'Order Ready' },
  { value: 'PAYMENT_DUE', label: 'Payment Due' },
  { value: 'ORDER_DELIVERED', label: 'Order Delivered' },
];

const MARKETING_AUDIENCES = [
  { value: 'ALL', label: 'All' },
  { value: 'VIP', label: 'VIP' },
  { value: 'CORPORATE', label: 'Corporate' },
  { value: 'REGULAR', label: 'Regular' },
  { value: 'NEW', label: 'New' },
  { value: 'INACTIVE', label: 'Inactive' },
];

const ADDRESS_LABELS = [
  { value: 'Home', label: 'Home' },
  { value: 'Work', label: 'Work' },
  { value: 'Other', label: 'Other' },
];

const PAYMENT_METHODS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'UPI', label: 'UPI' },
  { value: 'CARD', label: 'Card' },
  { value: 'RAZORPAY', label: 'Razorpay' },
  { value: 'ONLINE', label: 'Online' },
  { value: 'COD', label: 'COD' },
  { value: 'OTHER', label: 'Other' },
  { value: 'WALLET', label: 'Wallet' },
  { value: 'Pay Later', label: 'Pay Later' },
  { value: 'SPLIT', label: 'Split' },
];

const PAYMENT_METHOD_VALUES = PAYMENT_METHODS.map((method) => method.value);
const CORE_PAYMENT_METHODS = PAYMENT_METHODS.filter((method) => ['CASH', 'UPI', 'CARD'].includes(method.value)).map((method) => method.value);
const PAYMENT_STATUSES = [
  { value: 'UNPAID', label: 'Unpaid', color: '#991b1b', bg: '#fee2e2' },
  { value: 'PARTIAL', label: 'Partial', color: '#92400e', bg: '#fef3c7' },
  { value: 'PAID', label: 'Paid', color: '#166534', bg: '#dcfce7' },
];

const DOCUMENT_TYPES = [
  { value: 'ORDER', label: 'Order' },
  { value: 'QUOTATION', label: 'Quotation' },
];

const QUOTATION_STATUSES = [
  { value: 'DRAFT', label: 'Draft', color: '#5b21b6', bg: '#f5f3ff' },
  { value: 'SENT', label: 'Sent', color: '#1d4ed8', bg: '#eff6ff' },
  { value: 'APPROVED', label: 'Approved', color: '#166534', bg: '#dcfce7' },
  { value: 'EXPIRED', label: 'Expired', color: '#991b1b', bg: '#fee2e2' },
  { value: 'CONVERTED', label: 'Converted', color: '#0f766e', bg: '#f0fdfa' },
];

const CUSTOMER_TAGS = [
  { value: 'REGULAR', label: 'Regular' },
  { value: 'VIP', label: 'VIP' },
  { value: 'CORPORATE', label: 'Corporate' },
  { value: 'NEW', label: 'New' },
  { value: 'INACTIVE', label: 'Inactive' },
];

const LANGUAGES = [
  { value: 'ENGLISH', label: 'English' },
  { value: 'HINDI', label: 'हिन्दी' },
  { value: 'MARATHI', label: 'मराठी' },
];

const DEFAULT_LANGUAGE = 'ENGLISH';
const LANGUAGE_VALUES = LANGUAGES.map((language) => language.value);
const LANGUAGE_CODES = {
  ENGLISH: 'en',
  HINDI: 'hi',
  MARATHI: 'mr',
};

const IRON_SUBSCRIPTION_STATUSES = ['PENDING_REVIEW', 'ACTIVE', 'PAUSED', 'CANCELLED'];
const ACTIVE_IRON_SUB_STATUSES = ['ACTIVE', 'PAUSED'];
const LOCKED_BILL_STATUSES = ['SENT', 'PAID', 'PARTIAL'];
const IRON_SUBSCRIPTION_STATUS_META = [
  { value: 'PENDING_REVIEW', label: 'Application Under Review', shortLabel: 'Pending Review', bg: '#fef3c7', text: '#92400e' },
  { value: 'ACTIVE', label: 'Subscription Active', shortLabel: 'Active', bg: '#dcfce7', text: '#166534' },
  { value: 'PAUSED', label: 'Subscription Paused', shortLabel: 'Paused', bg: '#dbeafe', text: '#1e40af' },
  { value: 'CANCELLED', label: 'Subscription Ended', shortLabel: 'Cancelled', bg: '#fee2e2', text: '#991b1b' },
];

const RETURN_REASONS = [
  { value: 'Stain not removed', label: 'Stain not removed' },
  { value: 'Colour faded', label: 'Colour faded' },
  { value: 'Item damaged', label: 'Item damaged' },
  { value: 'Wrong item returned', label: 'Wrong item returned' },
  { value: 'Item shrunk', label: 'Item shrunk' },
  { value: 'Customer not satisfied', label: 'Customer not satisfied' },
  { value: 'Other', label: 'Other' },
];

const REPORT_TYPES = [
  { value: 'overview', label: 'Overview', group: 'DASHBOARDS' },
  { value: 'orders', label: 'Orders', group: 'DASHBOARDS' },
  { value: 'sales', label: 'Sales Summary', group: 'SALES' },
  { value: 'sales_by_item', label: 'Sales By Item', group: 'SALES' },
  { value: 'sales_by_service', label: 'Sales By Service', group: 'SALES' },
  { value: 'sales_by_date', label: 'Sales By Date', group: 'SALES' },
  { value: 'sales_by_order', label: 'Sales By Order', group: 'SALES' },
  { value: 'sales_by_customer', label: 'Sales By Customer', group: 'SALES' },
  { value: 'payments', label: 'Payment Transactions', group: 'FINANCE' },
  { value: 'pending_payments', label: 'Pending Payments', group: 'FINANCE' },
  { value: 'income', label: 'Income Report', group: 'FINANCE' },
  { value: 'discounts', label: 'Discounts', group: 'FINANCE' },
  { value: 'adjustments', label: 'Adjustments', group: 'FINANCE' },
  { value: 'cash_ups', label: 'Cash Ups', group: 'FINANCE' },
  { value: 'staff_collection', label: 'Staff Collection Report', group: 'FINANCE' },
  { value: 'expenses', label: 'Expenses', group: 'FINANCE' },
  { value: 'customers', label: 'Mobile Customers', group: 'CUSTOMERS' },
  { value: 'customer_vs_sale', label: 'Customer Vs Sale', group: 'CUSTOMERS' },
  { value: 'customer_wallet', label: 'Customer Wallet', group: 'CUSTOMERS' },
  { value: 'cancellations', label: 'Cancellations', group: 'OPERATIONS' },
  { value: 'staff', label: 'Staff Performance', group: 'OPERATIONS' },
  { value: 'garments', label: 'Garment Movement', group: 'CATALOG' },
  { value: 'catalog_vs_sales', label: 'Catalog Vs Sales', group: 'CATALOG' },
  { value: 'loyalty', label: 'Loyalty Points', group: 'OTHERS' },
];

const RECURRING_FREQUENCIES = [
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'BIWEEKLY', label: 'Biweekly' },
  { value: 'MONTHLY', label: 'Monthly' },
];

const WEEKDAY_OPTIONS = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
];

const EXPENSE_CATEGORIES = [
  { value: 'SALARY', label: 'Salary' },
  { value: 'RENT', label: 'Rent' },
  { value: 'SUPPLIES', label: 'Supplies' },
  { value: 'UTILITIES', label: 'Utilities' },
  { value: 'TRANSPORT', label: 'Transport' },
  { value: 'OTHER', label: 'Other' },
];

const DISCOUNT_VALUE_TYPES = [
  { value: 'PERCENT', label: 'Percentage (%)' },
  { value: 'FLAT', label: 'Flat Amount (₹)' },
];

const PLANT_ISSUE_TYPES = [
  { value: 'MISSING_ITEM', label: 'Missing Item', icon: 'help-circle-outline' },
  { value: 'DAMAGE', label: 'Damage Found', icon: 'alert-outline' },
  { value: 'STAIN_NOT_REMOVED', label: 'Stain Not Removed', icon: 'tshirt-crew-outline' },
  { value: 'WRONG_ITEM', label: 'Wrong Item', icon: 'swap-horizontal' },
  { value: 'OTHER', label: 'Other', icon: 'note-text-outline' },
];

const SERVICE_CATEGORY_UI = {
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

const WHATSAPP_TEMPLATES = {
  provider: 'WHATOMATE',
  accountName: 'Hangers',
  invoiceButtonIndex: '0',
  invoiceSlugField: 'orderNumber',
  orderStatus: {
    PENDING: {
      templateName: 'hangers_crm_order_created',
      params: ['customerName', 'orderNumber', 'totalAmount', 'expectedDelivery'],
    },
    PICKED_UP: {
      templateName: 'hangers_crm_order_received',
      params: ['customerName', 'orderNumber'],
    },
    PROCESSING: {
      templateName: 'hangers_crm_order_in_process',
      params: ['customerName', 'orderNumber'],
    },
    SENT_TO_PLANT: {
      templateName: 'hangers_crm_order_sent_to_plant',
      params: ['customerName', 'orderNumber'],
    },
    IRONING: {
      templateName: 'hangers_crm_order_pending_ironing',
      params: ['customerName', 'orderNumber'],
    },
    READY_FOR_DELIVERY: {
      templateName: 'hangers_crm_order_ready',
      params: ['customerName', 'orderNumber', 'balanceDue'],
    },
    OUT_FOR_DELIVERY: {
      templateName: 'hangers_crm_order_out_for_delivery',
      params: ['customerName', 'orderNumber', 'balanceDue'],
    },
    DELIVERED: {
      templateName: 'hangers_crm_order_delivered',
      params: ['customerName', 'orderNumber'],
    },
  },
  paymentReceived: {
    templateName: 'hangers_crm_payment_received',
    params: ['customerName', 'paymentAmount', 'orderNumber', 'paymentMethod', 'balanceDue'],
  },
  dailyIron: {
    logButtonIndex: '0',
    logUpdated: {
      templateName: 'hangers_daily_iron_log_updated',
      params: ['customerName', 'logDate', 'logPieces', 'logServiceName', 'monthToDatePieces', 'monthToDateAmount'],
    },
    monthlyBill: {
      templateName: 'hangers_daily_iron_monthly_bill',
      params: ['customerName', 'billMonth', 'billPieces', 'billAmount', 'balanceDue'],
    },
    paymentReceived: {
      templateName: 'hangers_daily_iron_payment_received',
      params: ['customerName', 'paymentAmount', 'paymentMethod', 'balanceDue'],
    },
  },
};

module.exports = {
  ACTIVE_IRON_SUB_STATUSES,
  ADDRESS_LABELS,
  CORE_PAYMENT_METHODS,
  CUSTOMER_TAGS,
  DEFAULT_LANGUAGE,
  DELIVERY_FAIL_REASONS,
  DELIVERY_MANAGER_ROLES,
  DELIVERY_PIN_ROLES,
  DOCUMENT_TYPES,
  IRON_SUBSCRIPTION_STATUS_META,
  IRON_SUBSCRIPTION_STATUSES,
  LANGUAGES,
  LANGUAGE_CODES,
  LANGUAGE_VALUES,
  LOCKED_BILL_STATUSES,
  MARKETING_AUDIENCES,
  MARKETING_TRIGGERS,
  ORDER_STATUSES,
  ORDER_WORKFLOW,
  ORDER_STATUS_KEYS,
  ORDER_STATUS_LABELS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_VALUES,
  PAYMENT_STATUSES,
  PLANT_PIN_ROLES,
  PLANT_ISSUE_TYPES,
  PLANT_STATUS_KEYS,
  QUOTATION_STATUSES,
  RECURRING_FREQUENCIES,
  REPORT_TYPES,
  RETURN_REASONS,
  ROLE_PERMISSIONS,
  ROLE_SERVICE_ACCESS,
  SERVICE_CODES,
  SERVICE_CATEGORY_UI,
  STAFF_ROLES,
  STAFF_ROLE_VALUES,
  WEEKDAY_OPTIONS,
  EXPENSE_CATEGORIES,
  DISCOUNT_VALUE_TYPES,
  PROMO_BANNERS,
  WHATSAPP_TEMPLATES,
};
