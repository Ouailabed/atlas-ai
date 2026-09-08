'use client';

import { useState } from 'react';

const GOLD = '#c9a84c';
const BG = '#0a0806';
const CREAM = '#f0ece6';

const ROLES = [
  'Student',
  'Founder',
  'Freelancer',
  'Trader',
  'Executive',
  'Restaurant Owner',
  'Creator',
  'Other',
];

const PRIORITIES = [
  'Email',
  'Calendar',
  'Job Search',
  'Finance',
  'Research',
  'Writing',
  'News Briefings',
  'All of it',
];

export default function Onboarding() {
  const [screen, setScreen] = useState(0);
  const [direction, setDirection] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [priorities, setPriorities] = useState([]);
  const [city, setCity] = useState('');
  const [challenge, setChallenge] = useState('');

  const screens = [
    {
      question: "What's your name?",
      hint: 'So Atlas knows what to call you.',
      valid: name.trim().length > 0,
    },
    {
      question: 'What best describes you?',
      hint: 'This shapes how Atlas prioritises your day.',
      valid: role !== '',
    },
    {
      question: 'What do you want Atlas to handle first?',
      hint: 'Pick as many as you like.',
      valid: priorities.length > 0,
    },
    {
      question: 'Where are you based?',
      hint: 'City and country — used for timing and local context.',
      valid: city.trim().length > 0,
    },
    {
      question: "What's your biggest challenge right now?",
      hint: 'Be specific. Atlas will remember this.',
      valid: challenge.trim().length > 0,
    },
  ];

  const current = screens[screen];
  const isLast = screen === screens.length - 1;

  const go = (delta) => {
    setDirection(delta);
    setError('');
    setScreen((s) => Math.min(Math.max(s + delta, 0), screens.length - 1));
  };

  const togglePriority = (p) => {
    setPriorities((prev) => {
      if (p === 'All of it') return prev.includes(p) ? [] : ['All of it'];
      const withoutAll = prev.filter((x) => x !== 'All of it');
      return withoutAll.includes(p)
        ? withoutAll.filter((x) => x !== p)
        : [...withoutAll, p];
    });
  };

  const finish = async () => {
    if (saving) return;
    setSaving(true);
    setError('');

    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, role, priorities, city, challenge }),
      });
      const data = await res.json();

      if (res.status === 401) {
        window.location.href = '/login?redirect=/onboarding';
        return;
      }
      if (!res.ok) {
        setError(data.error || 'Could not save your answers.');
        return;
      }

      // Full navigation so middleware re-reads the onboarded flag.
      window.location.href = '/dashboard';
    } catch {
      setError('Could not reach the server.');
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = {
    width: '100%',
    padding: '16px 20px',
    borderRadius: '14px',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.12)',
    color: CREAM,
    fontSize: '17px',
    outline: 'none',
    fontFamily: 'inherit',
  };

  const pill = (active) => ({
    padding: '11px 20px',
    borderRadius: '100px',
    background: active ? `linear-gradient(135deg,${GOLD},#e8c96a)` : 'rgba(255,255,255,0.04)',
    border: `1px solid ${active ? 'transparent' : 'rgba(255,255,255,0.1)'}`,
    color: active ? '#1a1a1a' : 'rgba(240,236,230,0.7)',
    fontSize: '14px',
    fontWeight: active ? 700 : 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.18s ease',
  });

  return (
    <div
      style={{
        minHeight: '100vh',
        background: BG,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "'Segoe UI', system-ui, sans-serif",
      }}
    >
      <style>{`
        * { box-sizing: border-box; }
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(var(--from)); }
          to   { opacity: 1; transform: translateX(0); }
        }
        .screen { animation: slideIn 0.32s cubic-bezier(0.16,1,0.3,1); }
        input:focus, textarea:focus { border-color: rgba(201,168,76,0.5) !important; }
      `}</style>

      {/* progress */}
      <div style={{ padding: '24px 28px 0', maxWidth: '640px', width: '100%', margin: '0 auto' }}>
        <div style={{ display: 'flex', gap: '6px' }}>
          {screens.map((_, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: '3px',
                borderRadius: '2px',
                background: i <= screen ? GOLD : 'rgba(255,255,255,0.08)',
                transition: 'background 0.3s ease',
              }}
            />
          ))}
        </div>
        <div
          style={{
            marginTop: '10px',
            fontSize: '11px',
            letterSpacing: '2px',
            color: 'rgba(240,236,230,0.25)',
            textTransform: 'uppercase',
          }}
        >
          Step {screen + 1} of {screens.length}
        </div>
      </div>

      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '28px',
        }}
      >
        <div
          key={screen}
          className="screen"
          style={{ width: '100%', maxWidth: '580px', '--from': direction > 0 ? '40px' : '-40px' }}
        >
          <h1
            style={{
              color: CREAM,
              fontSize: 'clamp(26px, 5vw, 34px)',
              fontWeight: 300,
              letterSpacing: '-1px',
              margin: 0,
              lineHeight: 1.25,
            }}
          >
            {current.question}
          </h1>
          <p style={{ color: 'rgba(240,236,230,0.35)', fontSize: '15px', margin: '10px 0 30px' }}>
            {current.hint}
          </p>

          {screen === 0 && (
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && current.valid && go(1)}
              placeholder="Your name"
              style={inputStyle}
            />
          )}

          {screen === 1 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              {ROLES.map((r) => (
                <button key={r} onClick={() => setRole(r)} style={pill(role === r)}>
                  {r}
                </button>
              ))}
            </div>
          )}

          {screen === 2 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              {PRIORITIES.map((p) => (
                <button
                  key={p}
                  onClick={() => togglePriority(p)}
                  style={pill(priorities.includes(p))}
                >
                  {p}
                </button>
              ))}
            </div>
          )}

          {screen === 3 && (
            <input
              autoFocus
              value={city}
              onChange={(e) => setCity(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && current.valid && go(1)}
              placeholder="London, UK"
              style={inputStyle}
            />
          )}

          {screen === 4 && (
            <textarea
              autoFocus
              value={challenge}
              onChange={(e) => setChallenge(e.target.value)}
              placeholder="e.g. I'm applying for AI roles but my applications aren't landing interviews"
              rows={4}
              style={{ ...inputStyle, resize: 'none', lineHeight: 1.6 }}
            />
          )}

          {error && (
            <p style={{ color: '#ff6b6b', fontSize: '13px', marginTop: '16px' }}>{error}</p>
          )}

          <div
            style={{
              display: 'flex',
              gap: '12px',
              marginTop: '32px',
              alignItems: 'center',
            }}
          >
            {screen > 0 && (
              <button
                onClick={() => go(-1)}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'rgba(240,236,230,0.45)',
                  padding: '14px 24px',
                  borderRadius: '100px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontFamily: 'inherit',
                }}
              >
                Back
              </button>
            )}

            <button
              onClick={() => (isLast ? finish() : go(1))}
              disabled={!current.valid || saving}
              style={{
                flex: 1,
                padding: '15px 28px',
                borderRadius: '100px',
                background:
                  current.valid && !saving
                    ? `linear-gradient(135deg,${GOLD},#e8c96a)`
                    : 'rgba(255,255,255,0.05)',
                border: 'none',
                color: current.valid && !saving ? '#1a1a1a' : 'rgba(240,236,230,0.25)',
                fontWeight: 700,
                fontSize: '15px',
                cursor: current.valid && !saving ? 'pointer' : 'not-allowed',
                fontFamily: 'inherit',
              }}
            >
              {saving ? 'Setting up…' : isLast ? 'Finish setup' : 'Continue'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
