const ORDER_STATUSES = [
  { key: 'PENDING', label: 'Pending', customerLabel: 'Pickup Pending', plantLabel: 'Order Placed', icon: 'clipboard-text-outline', crmEditable: true, plantManaged: false, customerBucket: 'active', customerTrackVisible: true },
  { key: 'PICKED_UP', label: 'Picked Up', customerLabel: 'Picked Up', plantLabel: 'Picked Up', icon: 'car-outline', crmEditable: true, plantManaged: false, customerBucket: 'active', customerTrackVisible: true, plantTimeline: true },
  { key: 'PROCESSING', label: 'Processing', customerLabel: 'At Plant', plantLabel: 'At Plant', icon: 'factory', crmEditable: false, plantManaged: true, customerBucket: 'active', customerTrackVisible: true, plantTimeline: true, plantQueue: true, plantSelectable: true, plantDashKey: 'processing' },
  { key: 'WASHING', label: 'Washing', customerLabel: 'Washing', plantLabel: 'Being Cleaned', icon: 'water-outline', crmEditable: false, plantManaged: true, customerBucket: 'active', customerTrackVisible: true, plantTimeline: true, plantQueue: true, plantSelectable: true, plantDashKey: 'washing' },
  { key: 'DRYING', label: 'Drying', customerLabel: 'Drying', plantLabel: 'Drying', icon: 'weather-sunny', crmEditable: false, plantManaged: true, customerBucket: 'active', customerTrackVisible: true, plantTimeline: true, plantQueue: true, plantSelectable: true, plantDashKey: 'drying' },
  { key: 'IRONING', label: 'Ironing', customerLabel: 'Ironing', plantLabel: 'Ironing', icon: 'iron', crmEditable: false, plantManaged: true, customerBucket: 'active', customerTrackVisible: true, plantTimeline: true, plantQueue: true, plantSelectable: true, plantDashKey: 'ironing' },
  { key: 'QC', label: 'QC Check', customerLabel: 'QC Check', plantLabel: 'Quality Check', icon: 'magnify', crmEditable: false, plantManaged: true, customerBucket: 'active', customerTrackVisible: true, plantTimeline: true, plantQueue: true, plantSelectable: true, plantDashKey: 'qc' },
  { key: 'READY_FOR_DELIVERY', label: 'Ready for Delivery', customerLabel: 'Ready for Delivery', plantLabel: 'Ready', icon: 'package-variant-closed', crmEditable: false, plantManaged: true, customerBucket: 'active', customerTrackVisible: true, plantTimeline: true, plantQueue: true, plantSelectable: true, plantDashKey: 'ready' },
  { key: 'OUT_FOR_DELIVERY', label: 'Out for Delivery', customerLabel: 'Out for Delivery', plantLabel: 'Out for Delivery', icon: 'motorbike', crmEditable: true, plantManaged: false, customerBucket: 'active', customerTrackVisible: true },
  { key: 'DELIVERED', label: 'Delivered', customerLabel: 'Delivered', plantLabel: 'Delivered', icon: 'check-decagram-outline', crmEditable: true, plantManaged: false, customerBucket: 'completed', customerTrackVisible: true },
  { key: 'CANCELLED', label: 'Cancelled', customerLabel: 'Cancelled', plantLabel: 'Cancelled', icon: 'close-circle-outline', crmEditable: true, plantManaged: false, customerBucket: 'completed', customerTrackVisible: false },
  { key: 'SENT_TO_PLANT', label: 'Sent to Plant', customerLabel: 'Sent to Plant', plantLabel: 'Sent to Plant', icon: 'truck-fast-outline', crmEditable: false, plantManaged: true, customerBucket: 'active', customerTrackVisible: false },
  { key: 'RETURNED', label: 'Returned', customerLabel: 'Returned', plantLabel: 'Returned', icon: 'backup-restore', crmEditable: false, plantManaged: false, customerBucket: 'completed', customerTrackVisible: false },
];

const ORDER_STATUS_KEYS = ORDER_STATUSES.map((status) => status.key);
const ORDER_STATUS_LABELS = ORDER_STATUSES.reduce((acc, status) => {
  acc[status.key] = status.plantLabel || status.label;
  return acc;
}, {});
const PLANT_STATUS_KEYS = ORDER_STATUSES.filter((status) => status.plantManaged).map((status) => status.key);
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
  { value: 'SUPER_ADMIN', label: 'Super Admin', pinEligible: false },
  { value: 'MANAGER', label: 'Manager', pinEligible: false },
  { value: 'COUNTER_STAFF', label: 'Counter Staff', pinEligible: false },
  { value: 'ACCOUNTS', label: 'Accounts', pinEligible: false },
  { value: 'DELIVERY_MANAGER', label: 'Delivery Manager', pinEligible: true },
  { value: 'DELIVERY_RIDER', label: 'Delivery Rider', pinEligible: true },
  { value: 'PLANT_MANAGER', label: 'Plant Manager', pinEligible: true },
  { value: 'PLANT_STAFF', label: 'Plant Staff', pinEligible: true },
  { value: 'PLANT_QC', label: 'Plant QC', pinEligible: true },
];

const STAFF_ROLE_VALUES = STAFF_ROLES.map((role) => role.value);

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
  { value: 'UNPAID', label: 'Unpaid' },
  { value: 'PARTIAL', label: 'Partial' },
  { value: 'PAID', label: 'Paid' },
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
  { value: 'sales', label: 'Sales' },
  { value: 'orders', label: 'Orders' },
  { value: 'customers', label: 'Customers' },
  { value: 'payments', label: 'Payments' },
  { value: 'expenses', label: 'Expenses' },
  { value: 'staff', label: 'Staff' },
  { value: 'garments', label: 'Garments' },
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

const PLANT_PARTNERS = [
  { value: 'WADREX', label: 'Wadrex' },
  { value: 'MAMTA', label: 'Mamta' },
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

module.exports = {
  ACTIVE_IRON_SUB_STATUSES,
  ADDRESS_LABELS,
  CORE_PAYMENT_METHODS,
  CUSTOMER_TAGS,
  DEFAULT_LANGUAGE,
  DELIVERY_FAIL_REASONS,
  DELIVERY_MANAGER_ROLES,
  DELIVERY_PIN_ROLES,
  IRON_SUBSCRIPTION_STATUS_META,
  IRON_SUBSCRIPTION_STATUSES,
  LANGUAGES,
  LANGUAGE_CODES,
  LANGUAGE_VALUES,
  LOCKED_BILL_STATUSES,
  MARKETING_AUDIENCES,
  MARKETING_TRIGGERS,
  ORDER_STATUSES,
  ORDER_STATUS_KEYS,
  ORDER_STATUS_LABELS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_VALUES,
  PAYMENT_STATUSES,
  PLANT_PIN_ROLES,
  PLANT_PARTNERS,
  PLANT_ISSUE_TYPES,
  PLANT_STATUS_KEYS,
  RECURRING_FREQUENCIES,
  REPORT_TYPES,
  RETURN_REASONS,
  ROLE_PERMISSIONS,
  STAFF_ROLES,
  STAFF_ROLE_VALUES,
  WEEKDAY_OPTIONS,
  EXPENSE_CATEGORIES,
  DISCOUNT_VALUE_TYPES,
};
