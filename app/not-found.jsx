import Link from 'next/link';

export const metadata = { title: 'Not found — Atlas' };

export default function NotFound() {
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
      <div style={{ maxWidth: '440px' }}>
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
        <h1 style={{ fontSize: '52px', fontWeight: 200, letterSpacing: '-2px', margin: 0 }}>404</h1>
        <p
          style={{
            color: 'rgba(240,236,230,0.45)',
            fontSize: '15px',
            lineHeight: 1.7,
            margin: '12px 0 28px',
          }}
        >
          That page doesn&apos;t exist. It may have moved, or the link may be wrong.
        </p>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link
            href="/dashboard"
            style={{
              padding: '12px 26px',
              borderRadius: '100px',
              background: 'linear-gradient(135deg, #c9a84c, #e8c96a)',
              color: '#1a1a1a',
              fontWeight: 700,
              fontSize: '13.5px',
              textDecoration: 'none',
            }}
          >
            Go to dashboard
          </Link>
          <Link
            href="/"
            style={{
              padding: '12px 26px',
              borderRadius: '100px',
              border: '1px solid rgba(255,255,255,0.12)',
              color: 'rgba(240,236,230,0.55)',
              fontSize: '13.5px',
              textDecoration: 'none',
            }}
          >
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
