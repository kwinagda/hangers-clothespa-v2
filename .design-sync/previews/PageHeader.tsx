const h = React.createElement;
const PageHeader = (window as any).HangersCRM.PageHeader;
const Button = (window as any).HangersCRM.Button;

export function WithActions() {
  return h('div', { style: { maxWidth: 720, padding: 4 } },
    h(PageHeader, {
      title: 'Orders',
      subtitle: 'Manage and track all customer laundry orders',
      breadcrumb: ['Dashboard', 'Orders'],
      actions: h('div', { style: { display: 'flex', gap: 8 } },
        h(Button, { variant: 'secondary', size: 'sm' }, 'Export CSV'),
        h(Button, { size: 'sm' }, '+ New Order'),
      ),
    }),
  );
}

export function Simple() {
  return h('div', { style: { maxWidth: 720, padding: 4 } },
    h(PageHeader, {
      title: 'Customers',
      subtitle: '2,841 registered customers',
      breadcrumb: ['Dashboard', 'Customers'],
    }),
  );
}
