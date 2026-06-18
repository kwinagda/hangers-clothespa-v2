'use client';

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({
  title = 'Something went wrong',
  message = 'Could not load data. Please try again.',
  onRetry,
}: ErrorStateProps) {
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
      }}
    >
      <div style={{ color: '#ef4444', fontSize: '2rem' }}>⚠</div>
      <div>
        <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1e293b', marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: '0.82rem', color: '#64748b' }}>{message}</div>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            background:    '#1a3c5e',
            color:         '#fff',
            border:        'none',
            borderRadius:  8,
            padding:       '8px 20px',
            fontSize:      '0.82rem',
            fontWeight:    600,
            cursor:        'pointer',
          }}
        >
          Retry
        </button>
      )}
    </div>
  );
}
