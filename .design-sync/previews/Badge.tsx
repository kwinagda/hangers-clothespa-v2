const h = React.createElement;
const Badge = (window as any).HangersCRM.Badge;

export function OrderStatuses() {
  const statuses: [string, string][] = [
    ['PENDING', 'Pending'], ['PICKED_UP', 'Picked Up'], ['PROCESSING', 'Processing'],
    ['WASHING', 'Washing'], ['DRYING', 'Drying'], ['IRONING', 'Ironing'],
    ['QC', 'Quality Check'], ['READY_FOR_DELIVERY', 'Ready for Delivery'],
    ['OUT_FOR_DELIVERY', 'Out for Delivery'], ['DELIVERED', 'Delivered'], ['CANCELLED', 'Cancelled'],
  ];
  return h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 8, maxWidth: 560, padding: 4 } },
    ...statuses.map(([status, label]) => h(Badge, { key: status, status, label })),
  );
}

export function CustomColor() {
  return h('div', { style: { display: 'flex', gap: 8, padding: 4 } },
    h(Badge, { label: 'VIP', color: '#7c3aed' }),
    h(Badge, { label: 'Express', color: '#0ea5e9' }),
    h(Badge, { label: 'Fragile', color: '#f59e0b' }),
  );
}
