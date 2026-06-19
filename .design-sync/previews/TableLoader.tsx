const h = React.createElement;
const TableLoader = (window as any).HangersCRM.TableLoader;

export function Default() {
  return h('div', { style: { background: '#fff', borderRadius: 12, padding: '20px 24px', border: '1px solid #e8f0f7', maxWidth: 720 } },
    h(TableLoader, { rows: 6, columns: 5 }),
  );
}
