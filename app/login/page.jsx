'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

const GOLD = '#c9a84c';
const BG = '#0a0806';
const CREAM = '#f0ece6';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || '/dashboard';

  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  const submit = async (e) => {
    e?.preventDefault();
    if (loading) return;

    setLoading(true);
    setMessage('');
    setIsError(false);

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: mode, email, password, name }),
      });
      const data = await res.json();

      if (!res.ok) {
        setIsError(true);
        setMessage(data.error || 'Something went wrong');
        return;
      }

      if (data.needsConfirmation) {
        setMessage(data.message || 'Check your email to confirm your account.');
        return;
      }

      // Full navigation so middleware sees the new session cookie.
      window.location.href = redirect;
    } catch {
      setIsError(true);
      setMessage('Could not reach the server. Check your connection.');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    padding: '14px 18px',
    borderRadius: '12px',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: CREAM,
    fontSize: '15px',
    outline: 'none',
    fontFamily: 'inherit',
    width: '100%',
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: BG,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        fontFamily: "'Segoe UI', system-ui, sans-serif",
      }}
    >
      <form
        onSubmit={submit}
        style={{
          width: '100%',
          maxWidth: '420px',
          padding: '40px',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '24px',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: `linear-gradient(135deg, ${GOLD}, #e8c96a)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '22px',
              fontWeight: 900,
              color: '#1a1a1a',
              margin: '0 auto 16px',
            }}
          >
            A
          </div>
          <h1 style={{ color: CREAM, fontSize: '24px', fontWeight: 300, letterSpacing: '-0.5px' }}>
            {mode === 'login' ? 'Welcome back' : 'Create your account'}
          </h1>
          <p style={{ color: 'rgba(240,236,230,0.4)', fontSize: '14px', marginTop: '8px' }}>
            {mode === 'login'
              ? 'Sign in to Atlas'
              : 'Free plan includes 5 messages a day'}
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {mode === 'signup' && (
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name (optional)"
              autoComplete="name"
              style={inputStyle}
            />
          )}

          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email address"
            autoComplete="email"
            required
            style={inputStyle}
          />

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === 'signup' ? 'Password (min 8 characters)' : 'Password'}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            required
            minLength={8}
            style={inputStyle}
          />

          {message && (
            <p
              style={{
                color: isError ? '#ff6b6b' : GOLD,
                fontSize: '13px',
                textAlign: 'center',
                lineHeight: 1.5,
                margin: 0,
              }}
            >
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !email || password.length < 8}
            style={{
              padding: '16px',
              background:
                loading || !email || password.length < 8
                  ? 'rgba(255,255,255,0.06)'
                  : `linear-gradient(135deg, ${GOLD}, #e8c96a)`,
              border: 'none',
              borderRadius: '12px',
              color: loading || !email || password.length < 8 ? 'rgba(240,236,230,0.3)' : '#1a1a1a',
              fontWeight: 700,
              fontSize: '14px',
              letterSpacing: '1px',
              cursor: loading || !email || password.length < 8 ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>

          <button
            type="button"
            onClick={() => {
              setMode(mode === 'login' ? 'signup' : 'login');
              setMessage('');
              setIsError(false);
            }}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(240,236,230,0.4)',
              fontSize: '13px',
              cursor: 'pointer',
              fontFamily: 'inherit',
              padding: '4px',
            }}
          >
            {mode === 'login'
              ? "Don't have an account? Sign up"
              : 'Already have an account? Sign in'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function LoginPage() {
  // useSearchParams needs a Suspense boundary in the App Router.
  return (
    <Suspense
      fallback={<div style={{ minHeight: '100vh', background: BG }} />}
    >
      <LoginForm />
    </Suspense>
  );
}
