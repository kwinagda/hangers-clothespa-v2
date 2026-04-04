'use client'

type InlineLoaderProps = {
  label?: string
  tone?: 'default' | 'light'
}

export function InlineLoader({ label = 'Loading…', tone = 'default' }: InlineLoaderProps) {
  return (
    <span className={`crm-inline-loader ${tone === 'light' ? 'crm-inline-loader-light' : ''}`}>
      <span className="crm-spinner" />
      <span>{label}</span>
    </span>
  )
}

export function SkeletonLine({ width = '100%', height = 12, style }: { width?: string | number; height?: number; style?: React.CSSProperties }) {
  return (
    <div
      className="crm-skeleton"
      style={{ width, height, borderRadius: 999, ...style }}
    />
  )
}

export function SkeletonCard({ lines = 2 }: { lines?: number }) {
  return (
    <div className="crm-surface crm-skeleton-card">
      <SkeletonLine width="38%" height={10} style={{ marginBottom: 14 }} />
      <SkeletonLine width="55%" height={30} style={{ borderRadius: 14, marginBottom: 12 }} />
      {Array.from({ length: lines }).map((_, index) => (
        <SkeletonLine
          key={index}
          width={index === lines - 1 ? '48%' : '72%'}
          height={10}
          style={{ marginBottom: index === lines - 1 ? 0 : 8 }}
        />
      ))}
    </div>
  )
}

export function TableLoader({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div style={{ padding: 18 }}>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div
          key={rowIndex}
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            gap: 12,
            padding: '14px 0',
            borderBottom: rowIndex === rows - 1 ? 'none' : '1px solid #eef4f8',
          }}
        >
          {Array.from({ length: columns }).map((__, columnIndex) => (
            <SkeletonLine
              key={columnIndex}
              width={columnIndex === 0 ? '72%' : columnIndex === columns - 1 ? '46%' : '58%'}
              height={12}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
