'use client';

import { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: string | number | ReactNode;
  sub?: string;
  trend?: { direction: 'up' | 'down' | 'flat'; label: string };
  icon?: ReactNode;
  loading?: boolean;
}

export function StatCard({ label, value, sub, trend, icon, loading = false }: StatCardProps) {
  return (
    <div
      style={{
        background:   '#fff',
        border:       '1px solid #e8f0f7',
        borderRadius: 16,
        padding:      '20px 24px',
        display:      'flex',
        flexDirection: 'column',
        gap:          8,
        minWidth:     160,
        boxShadow:    '0 1px 4px rgba(26,60,94,0.06)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          {label}
        </span>
        {icon && (
          <span style={{ color: '#94a3b8', display: 'flex' }}>{icon}</span>
        )}
      </div>

      {loading ? (
        <div style={{ height: 36, background: '#f1f5f9', borderRadius: 8, animation: 'pulse 1.5s ease-in-out infinite' }} />
      ) : (
        <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#1a3c5e', lineHeight: 1.1 }}>
          {value}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {trend && (
          <span
            style={{
              fontSize:   '0.7rem',
              fontWeight: 600,
              color:      trend.direction === 'up' ? '#22c55e' : trend.direction === 'down' ? '#ef4444' : '#94a3b8',
            }}
          >
            {trend.direction === 'up' ? '↑' : trend.direction === 'down' ? '↓' : '→'} {trend.label}
          </span>
        )}
        {sub && (
          <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{sub}</span>
        )}
      </div>
    </div>
  );
}
