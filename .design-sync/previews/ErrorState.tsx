const h = React.createElement;
const ErrorState = (window as any).HangersCRM.ErrorState;

export function WithRetry() {
  return h('div', { style: { background: '#fff', borderRadius: 12, border: '1px solid #e8f0f7', maxWidth: 480 } },
    h(ErrorState, {
      title: 'Failed to load orders',
      message: 'Could not connect to the server. Check your network and try again.',
      onRetry: () => {},
    }),
  );
}

export function NoRetry() {
  return h('div', { style: { background: '#fff', borderRadius: 12, border: '1px solid #e8f0f7', maxWidth: 480 } },
    h(ErrorState, {
      title: 'Something went wrong',
      message: 'An unexpected error occurred while loading data.',
    }),
  );
}
