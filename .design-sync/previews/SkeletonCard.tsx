const h = React.createElement;
const SkeletonCard = (window as any).HangersCRM.SkeletonCard;

export function GridLayout() {
  return h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 580 } },
    h(SkeletonCard, { lines: 2 }),
    h(SkeletonCard, { lines: 3 }),
    h(SkeletonCard, { lines: 2 }),
    h(SkeletonCard, { lines: 4 }),
  );
}
