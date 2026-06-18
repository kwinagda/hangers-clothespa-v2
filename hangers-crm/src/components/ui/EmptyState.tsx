'use client';

import { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  return (
    <div
      style={{
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        justifyContent: 'center',
        padding:        '48px 24px',
        gap:            16,
        textAlign:      'center',
        color:          '#94a3b8',
      }}
    >
      {icon ? (
        <div style={{ fontSize: '2.5rem', opacity: 0.5 }}>{icon}</div>
      ) : (
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.4 }}>
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
      )}
      <div>
        <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#64748b', marginBottom: 4 }}>{title}</div>
        {description && <div style={{ fontSize: '0.82rem' }}>{description}</div>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
