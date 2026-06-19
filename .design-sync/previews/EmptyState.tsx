const h = React.createElement;
const EmptyState = (window as any).HangersCRM.EmptyState;
const Button = (window as any).HangersCRM.Button;

export function WithAction() {
  return h('div', { style: { background: '#fff', borderRadius: 12, border: '1px solid #e8f0f7', maxWidth: 480 } },
    h(EmptyState, {
      title: 'No orders yet',
      description: 'No orders match your current filters. Try adjusting the date range or status.',
      action: h(Button, { size: 'sm' }, '+ Create Order'),
    }),
  );
}

export function NoAction() {
  return h('div', { style: { background: '#fff', borderRadius: 12, border: '1px solid #e8f0f7', maxWidth: 480 } },
    h(EmptyState, {
      title: 'No customers found',
      description: 'Try a different search query or clear the filter.',
    }),
  );
}
