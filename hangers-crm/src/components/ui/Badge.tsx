'use client';

// Status-aware badge — renders the right color for every order status and
// payment status without any hardcoded logic in individual pages.
// Colors sourced from master-data.js ORDER_STATUSES definitions.

interface BadgeProps {
  label: string;
  color?: string;     // hex color from master data (e.g. "#22c55e")
  status?: string;    // fallback: auto-map well-known status keys to colors
  size?: 'sm' | 'md';
}

const STATUS_COLORS: Record<string, string> = {
  PENDING:              '#f59e0b',
  PICKED_UP:            '#3b82f6',
  PROCESSING:           '#8b5cf6',
  WASHING:              '#06b6d4',
  DRYING:               '#0ea5e9',
  IRONING:              '#f97316',
  QC:                   '#a855f7',
  READY_FOR_DELIVERY:   '#10b981',
  OUT_FOR_DELIVERY:     '#14b8a6',
  DELIVERED:            '#22c55e',
  CANCELLED:            '#ef4444',
  RETURNED:             '#f43f5e',
  SENT_TO_PLANT:        '#6366f1',
  PAID:                 '#22c55e',
  PARTIAL:              '#f59e0b',
  UNPAID:               '#ef4444',
  ACTIVE:               '#22c55e',
  PENDING_REVIEW:       '#f59e0b',
  PAUSED:               '#94a3b8',
  DRAFT:                '#94a3b8',
  FINALIZED:            '#3b82f6',
};

function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

function lightBg(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},0.12)`;
}

export function Badge({ label, color, status, size = 'md' }: BadgeProps) {
  const resolvedColor = color || (status ? STATUS_COLORS[status] : null) || '#64748b';
  const bg = lightBg(resolvedColor);
  const textSize = size === 'sm' ? '0.65rem' : '0.72rem';

  return (
    <span
      style={{
        display:       'inline-flex',
        alignItems:    'center',
        gap:           4,
        padding:       size === 'sm' ? '2px 8px' : '3px 10px',
        borderRadius:  999,
        fontSize:      textSize,
        fontWeight:    600,
        letterSpacing: '0.02em',
        backgroundColor: bg,
        color:           resolvedColor,
        whiteSpace:    'nowrap',
      }}
    >
      <span
        style={{
          width: 6, height: 6, borderRadius: '50%',
          backgroundColor: resolvedColor, flexShrink: 0,
        }}
      />
      {label}
    </span>
  );
}
