'use client';

import { useEffect } from 'react';

/**
 * Root error boundary. Must be a client component and must accept
 * { error, reset } — that is the Next.js App Router contract.
 */
export default function Error({ error, reset }) {
  useEffect(() => {
    console.error('[atlas] unhandled UI error:', error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0a0806',
        color: '#f0ece6',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        fontFamily: "'Segoe UI', system-ui, sans-serif",
        textAlign: 'center',
      }}
    >
      <div style={{ maxWidth: '460px' }}>
        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #c9a84c, #e8c96a)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '22px',
            fontWeight: 900,
            color: '#1a1a1a',
            margin: '0 auto 24px',
          }}
        >
          A
        </div>
        <h1 style={{ fontSize: '24px', fontWeight: 300, letterSpacing: '-0.5px', margin: 0 }}>
          Something broke
        </h1>
        <p
          style={{
            color: 'rgba(240,236,230,0.45)',
            fontSize: '14.5px',
            lineHeight: 1.7,
            margin: '12px 0 6px',
          }}
        >
          Atlas hit an unexpected error. Your data is safe.
        </p>
        {error?.digest && (
          <p style={{ color: 'rgba(240,236,230,0.22)', fontSize: '11.5px', margin: '0 0 26px' }}>
            Reference: {error.digest}
          </p>
        )}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={reset}
            style={{
              padding: '12px 26px',
              borderRadius: '100px',
              background: 'linear-gradient(135deg, #c9a84c, #e8c96a)',
              border: 'none',
              color: '#1a1a1a',
              fontWeight: 700,
              fontSize: '13.5px',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Try again
          </button>
          <a
            href="/dashboard"
            style={{
              padding: '12px 26px',
              borderRadius: '100px',
              border: '1px solid rgba(255,255,255,0.12)',
              color: 'rgba(240,236,230,0.55)',
              fontSize: '13.5px',
              textDecoration: 'none',
            }}
          >
            Back to dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
