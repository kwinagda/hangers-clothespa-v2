const h = React.createElement;
const Button = (window as any).HangersCRM.Button;

export function AllVariants() {
  return h('div', { style: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', padding: 4 } },
    h(Button, { variant: 'primary' }, 'Book Pickup'),
    h(Button, { variant: 'secondary' }, 'View Details'),
    h(Button, { variant: 'danger' }, 'Cancel Order'),
    h(Button, { variant: 'ghost' }, 'Dismiss'),
  );
}

export function AllSizes() {
  return h('div', { style: { display: 'flex', gap: 10, alignItems: 'center', padding: 4 } },
    h(Button, { size: 'sm' }, 'Small'),
    h(Button, { size: 'md' }, 'Medium'),
    h(Button, { size: 'lg' }, 'Large'),
  );
}

export function States() {
  return h('div', { style: { display: 'flex', gap: 10, padding: 4 } },
    h(Button, { loading: true }, 'Saving…'),
    h(Button, { disabled: true }, 'Disabled'),
    h(Button, { variant: 'secondary', loading: true }, 'Processing…'),
  );
}
