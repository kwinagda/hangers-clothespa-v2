const h = React.createElement;
const PaginationControls = (window as any).HangersCRM.PaginationControls;

export function Default() {
  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 660 } },
    h('div', { style: { background: '#fff', borderRadius: 10, padding: '16px 20px', border: '1px solid #e8f0f7' } },
      h(PaginationControls, {
        page: 2, pageSize: 10, totalItems: 284, itemLabel: 'orders',
        onPageChange: () => {}, onPageSizeChange: () => {},
      }),
    ),
    h('div', { style: { background: '#fff', borderRadius: 10, padding: '16px 20px', border: '1px solid #e8f0f7' } },
      h(PaginationControls, {
        page: 5, pageSize: 20, totalItems: 1284, itemLabel: 'customers',
        onPageChange: () => {}, onPageSizeChange: () => {},
      }),
    ),
  );
}
