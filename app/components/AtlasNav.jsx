'use client';

import Link from 'next/link';

export const GOLD = '#c9a84c';
export const BG = '#0a0806';
export const CREAM = '#f0ece6';

const LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/atlas', label: 'Chat' },
  { href: '/jobs', label: 'Jobs' },
  { href: '/settings', label: 'Settings' },
];

/**
 * Shared header. `active` is the href of the current page.
 * Wraps on narrow screens rather than overflowing.
 */
export default function AtlasNav({ active, subtitle, right }) {
  return (
    <header
      style={{
        padding: '14px 20px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        flexWrap: 'wrap',
        background: 'rgba(10,8,6,0.95)',
        backdropFilter: 'blur(20px)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}
    >
      <Link
        href="/dashboard"
        style={{ display: 'flex', alignItems: 'center', gap: '11px', textDecoration: 'none' }}
      >
        <div
          style={{
            width: '34px',
            height: '34px',
            borderRadius: '50%',
            background: `linear-gradient(135deg,${GOLD},#e8c96a)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 900,
            color: '#1a1a1a',
            flexShrink: 0,
          }}
        >
          A
        </div>
        <div>
          <div style={{ color: CREAM, fontWeight: 700, fontSize: '14px', letterSpacing: '2px' }}>
            ATLAS
          </div>
          {subtitle && (
            <div style={{ color: GOLD, fontSize: '10px', letterSpacing: '1px' }}>{subtitle}</div>
          )}
        </div>
      </Link>

      <nav style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
        {LINKS.map((l) => {
          const isActive = active === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              style={{
                fontSize: '12.5px',
                textDecoration: 'none',
                padding: '7px 13px',
                borderRadius: '100px',
                color: isActive ? GOLD : 'rgba(240,236,230,0.42)',
                background: isActive ? 'rgba(201,168,76,0.1)' : 'transparent',
                border: `1px solid ${isActive ? 'rgba(201,168,76,0.28)' : 'transparent'}`,
              }}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>

      <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
        {right}
      </div>
    </header>
  );
}
