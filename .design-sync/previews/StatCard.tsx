const h = React.createElement;
const StatCard = (window as any).HangersCRM.StatCard;

export function KPIGrid() {
  return h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, maxWidth: 700 } },
    h(StatCard, { label: 'Total Orders', value: '1,284', sub: 'This month', trend: { direction: 'up', label: '+12%' } }),
    h(StatCard, { label: 'Revenue', value: '₹48,320', sub: 'vs ₹42,100', trend: { direction: 'up', label: '+14.8%' } }),
    h(StatCard, { label: 'Cancelled', value: '23', sub: 'Last 30 days', trend: { direction: 'down', label: '-3' } }),
    h(StatCard, { label: 'Pending Pickup', value: '8', sub: 'Awaiting rider', trend: { direction: 'flat', label: 'No change' } }),
    h(StatCard, { label: 'In Processing', value: '156', sub: 'Currently active' }),
    h(StatCard, { label: 'Delivered Today', value: '34', sub: 'On time', trend: { direction: 'up', label: '+5 vs yesterday' } }),
  );
}

export function LoadingState() {
  return h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, maxWidth: 700 } },
    h(StatCard, { label: 'Total Orders', value: 0, loading: true }),
    h(StatCard, { label: 'Revenue', value: 0, loading: true }),
    h(StatCard, { label: 'Active Customers', value: 0, loading: true }),
  );
}
