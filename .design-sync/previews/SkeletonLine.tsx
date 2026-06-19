const h = React.createElement;
const SkeletonLine = (window as any).HangersCRM.SkeletonLine;

export function ContentSkeleton() {
  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 480 } },
    h('div', { style: { background: '#fff', borderRadius: 12, padding: '20px 24px', border: '1px solid #e8f0f7', display: 'flex', flexDirection: 'column', gap: 10 } },
      h(SkeletonLine, { width: '55%', height: 22 }),
      h(SkeletonLine, { width: '100%', height: 14 }),
      h(SkeletonLine, { width: '85%', height: 14 }),
      h(SkeletonLine, { width: '40%', height: 14 }),
    ),
    h('div', { style: { background: '#fff', borderRadius: 12, padding: '20px 24px', border: '1px solid #e8f0f7', display: 'flex', flexDirection: 'column', gap: 8 } },
      h(SkeletonLine, { width: '70%', height: 18 }),
      h(SkeletonLine, { width: '100%', height: 12 }),
      h(SkeletonLine, { width: '90%', height: 12 }),
      h(SkeletonLine, { width: '65%', height: 12 }),
    ),
  );
}
