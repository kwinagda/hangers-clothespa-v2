'use client';

import { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  breadcrumb?: string[];
}

export function PageHeader({ title, subtitle, actions, breadcrumb }: PageHeaderProps) {
  return (
    <div
      style={{
        display:        'flex',
        justifyContent: 'space-between',
        alignItems:     'flex-start',
        marginBottom:   24,
        gap:            16,
        flexWrap:       'wrap',
      }}
    >
      <div style={{ flex: 1 }}>
        {breadcrumb && breadcrumb.length > 0 && (
          <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginBottom: 4 }}>
            {breadcrumb.join(' / ')}
          </div>
        )}
        <h1
          style={{
            margin:     0,
            fontSize:   '1.4rem',
            fontWeight: 700,
            color:      '#1a3c5e',
            lineHeight: 1.2,
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: '#64748b' }}>{subtitle}</p>
        )}
      </div>
      {actions && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {actions}
        </div>
      )}
    </div>
  );
}
