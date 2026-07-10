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
            fontFamily: 'var(--crm-font-display)',
            fontSize:   26,
            fontWeight: 800,
            color:      '#023c62',
            lineHeight: 1.2,
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <p style={{ margin: '6px 0 0', fontSize: 13.5, color: '#6b7fa3', lineHeight: 1.5 }}>{subtitle}</p>
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
