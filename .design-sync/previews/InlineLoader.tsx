const h = React.createElement;
const InlineLoader = (window as any).HangersCRM.InlineLoader;

export function DefaultTone() {
  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 340 } },
    h('div', { style: { padding: '14px 18px', background: '#fff', borderRadius: 10, border: '1px solid #e8f0f7' } },
      h(InlineLoader, { label: 'Loading orders…' }),
    ),
    h('div', { style: { padding: '14px 18px', background: '#f4f7fb', borderRadius: 10, border: '1px solid #e8f0f7' } },
      h(InlineLoader, { label: 'Syncing customer data…' }),
    ),
  );
}

export function LightTone() {
  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 340 } },
    h('div', { style: { padding: '14px 18px', background: '#1a3c5e', borderRadius: 10 } },
      h(InlineLoader, { label: 'Processing payment…', tone: 'light' }),
    ),
    h('div', { style: { padding: '14px 18px', background: '#023c62', borderRadius: 10 } },
      h(InlineLoader, { label: 'Saving changes…', tone: 'light' }),
    ),
  );
}
