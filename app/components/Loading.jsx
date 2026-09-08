/**
 * Shared Atlas-styled loading state, used by every route-level loading.jsx.
 * Server component — no interactivity, so no 'use client' needed.
 */
export default function Loading({ label = 'Loading' }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0a0806',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '18px',
        fontFamily: "'Segoe UI', system-ui, sans-serif",
      }}
    >
      <style>{`
        @keyframes atlas-spin { to { transform: rotate(360deg); } }
        @keyframes atlas-pulse { 0%,100% { opacity: 0.35; } 50% { opacity: 1; } }
      `}</style>

      <div style={{ position: 'relative', width: '52px', height: '52px' }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            border: '2px solid rgba(201,168,76,0.15)',
            borderTopColor: '#c9a84c',
            animation: 'atlas-spin 0.9s linear infinite',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: '11px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #c9a84c, #e8c96a)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '13px',
            fontWeight: 900,
            color: '#1a1a1a',
          }}
        >
          A
        </div>
      </div>

      <div
        style={{
          color: 'rgba(240,236,230,0.35)',
          fontSize: '11px',
          letterSpacing: '3px',
          textTransform: 'uppercase',
          animation: 'atlas-pulse 1.6s ease-in-out infinite',
        }}
      >
        {label}
      </div>
    </div>
  );
}
