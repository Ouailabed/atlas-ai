'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import AtlasNav, { GOLD, BG, CREAM } from '../components/AtlasNav';

const TONE_LABELS = ['Very formal', 'Formal', 'Neutral', 'Casual', 'Very casual'];
const DETAIL_LABELS = ['Very brief', 'Brief', 'Balanced', 'Detailed', 'Very detailed'];

function Section({ title, description, children }) {
  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '16px',
        padding: '24px',
        marginBottom: '14px',
      }}
    >
      <div
        style={{
          fontSize: '10px',
          letterSpacing: '3px',
          color: GOLD,
          textTransform: 'uppercase',
          fontWeight: 700,
        }}
      >
        {title}
      </div>
      {description && (
        <p style={{ color: 'rgba(240,236,230,0.35)', fontSize: '13px', margin: '8px 0 0' }}>
          {description}
        </p>
      )}
      <div style={{ marginTop: '18px' }}>{children}</div>
    </div>
  );
}

const inputStyle = {
  width: '100%',
  padding: '11px 14px',
  borderRadius: '10px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  color: CREAM,
  fontSize: '14px',
  outline: 'none',
  fontFamily: 'inherit',
};

function Toggle({ on, onChange, label }) {
  return (
    <button
      onClick={() => onChange(!on)}
      role="switch"
      aria-checked={on}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        padding: 0,
        fontFamily: 'inherit',
      }}
    >
      <span
        style={{
          width: '42px',
          height: '24px',
          borderRadius: '100px',
          background: on ? GOLD : 'rgba(255,255,255,0.12)',
          position: 'relative',
          transition: 'background 0.2s',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: '3px',
            left: on ? '21px' : '3px',
            width: '18px',
            height: '18px',
            borderRadius: '50%',
            background: on ? '#1a1a1a' : 'rgba(255,255,255,0.6)',
            transition: 'left 0.2s',
          }}
        />
      </span>
      <span style={{ color: 'rgba(240,236,230,0.75)', fontSize: '14px' }}>{label}</span>
    </button>
  );
}

function Slider({ value, onChange, labels, label }) {
  return (
    <div style={{ marginBottom: '18px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: '8px',
          fontSize: '13px',
        }}
      >
        <span style={{ color: 'rgba(240,236,230,0.55)' }}>{label}</span>
        <span style={{ color: GOLD, fontWeight: 600 }}>{labels[value]}</span>
      </div>
      <input
        type="range"
        min={0}
        max={labels.length - 1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: GOLD, cursor: 'pointer' }}
      />
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '10.5px',
          color: 'rgba(240,236,230,0.25)',
          marginTop: '2px',
        }}
      >
        <span>{labels[0]}</span>
        <span>{labels[labels.length - 1]}</span>
      </div>
    </div>
  );
}

function ConfirmModal({ open, title, body, confirmLabel, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.72)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#141110',
          border: '1px solid rgba(255,107,107,0.3)',
          borderRadius: '18px',
          padding: '28px',
          maxWidth: '420px',
          width: '100%',
        }}
      >
        <h3 style={{ color: CREAM, fontSize: '18px', fontWeight: 500, margin: '0 0 10px' }}>
          {title}
        </h3>
        <p style={{ color: 'rgba(240,236,230,0.5)', fontSize: '14px', lineHeight: 1.6, margin: '0 0 22px' }}>
          {body}
        </p>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1,
              padding: '12px',
              borderRadius: '100px',
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.14)',
              color: 'rgba(240,236,230,0.6)',
              fontSize: '13px',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              flex: 1,
              padding: '12px',
              borderRadius: '100px',
              background: '#dc2626',
              border: 'none',
              color: '#fff',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingsInner() {
  const searchParams = useSearchParams();
  const googleParam = searchParams.get('google');

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [modal, setModal] = useState(null);

  const [profile, setProfile] = useState({ name: '', role: '', city: '', timezone: '' });
  const [briefingEnabled, setBriefingEnabled] = useState(true);
  const [briefingHour, setBriefingHour] = useState(7);
  const [tone, setTone] = useState(2);
  const [detail, setDetail] = useState(2);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/settings');
        if (res.status === 401) {
          window.location.href = '/login?redirect=/settings';
          return;
        }
        const d = await res.json();
        setData(d);
        setProfile({
          name: d.profile?.name || '',
          role: d.profile?.role || '',
          city: d.profile?.city || '',
          timezone: d.profile?.timezone || '',
        });
        setBriefingEnabled(d.preferences?.briefingEnabled ?? true);
        setBriefingHour(d.preferences?.briefingHour ?? 7);

        const toneIdx = TONE_LABELS.findIndex(
          (l) => l.toLowerCase() === (d.preferences?.tone || '').toLowerCase()
        );
        if (toneIdx >= 0) setTone(toneIdx);
        const detailIdx = DETAIL_LABELS.findIndex(
          (l) => l.toLowerCase() === (d.preferences?.detail || '').toLowerCase()
        );
        if (detailIdx >= 0) setDetail(detailIdx);
      } catch {
        setStatus('Could not load settings.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    setStatus('');
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile, briefingEnabled, briefingHour, tone, detail }),
      });
      const d = await res.json();
      setStatus(res.ok ? 'Saved.' : d.error || 'Could not save.');
      setTimeout(() => setStatus(''), 3500);
    } catch {
      setStatus('Could not reach the server.');
    } finally {
      setSaving(false);
    }
  };

  const runDelete = async (target) => {
    setModal(null);
    try {
      const res = await fetch(`/api/settings?target=${target}&confirm=DELETE`, { method: 'DELETE' });
      if (!res.ok) {
        const d = await res.json();
        setStatus(d.error || 'Delete failed.');
        return;
      }
      if (target === 'account') window.location.href = '/login';
      else {
        setStatus('All memories deleted.');
        setData((prev) => (prev ? { ...prev, stats: { ...prev.stats, memories: 0 } } : prev));
      }
    } catch {
      setStatus('Could not reach the server.');
    }
  };

  const upgrade = async (plan) => {
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });
      const d = await res.json();
      if (d.url) window.location.href = d.url;
      else setStatus(d.error || 'Could not start checkout.');
    } catch {
      setStatus('Could not reach the payment service.');
    }
  };

  const google = data?.connections?.google;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: BG,
        color: CREAM,
        fontFamily: "'Segoe UI', system-ui, sans-serif",
      }}
    >
      <style>{`
        * { box-sizing: border-box; }
        input:focus, select:focus { border-color: rgba(201,168,76,0.5) !important; }
        .settings-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        @media (max-width: 700px) { .settings-grid { grid-template-columns: 1fr; } }
      `}</style>

      <AtlasNav active="/settings" subtitle="Settings" />

      <main style={{ padding: '26px 20px 60px', maxWidth: '760px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '26px', fontWeight: 300, margin: '0 0 22px', letterSpacing: '-0.5px' }}>
          Settings
        </h1>

        {googleParam === 'connected' && (
          <div
            style={{
              background: 'rgba(74,222,128,0.1)',
              border: '1px solid rgba(74,222,128,0.3)',
              borderRadius: '12px',
              padding: '12px 16px',
              marginBottom: '14px',
              fontSize: '13px',
              color: '#4ade80',
            }}
          >
            ✓ Google connected. Gmail and Calendar agents are now live.
          </div>
        )}
        {googleParam === 'error' && (
          <div
            style={{
              background: 'rgba(255,107,107,0.1)',
              border: '1px solid rgba(255,107,107,0.3)',
              borderRadius: '12px',
              padding: '12px 16px',
              marginBottom: '14px',
              fontSize: '13px',
              color: '#ff9b9b',
            }}
          >
            Google connection failed ({searchParams.get('reason') || 'unknown'}). Please try again.
          </div>
        )}

        {loading ? (
          <div style={{ color: 'rgba(240,236,230,0.25)', fontSize: '14px' }}>Loading…</div>
        ) : (
          <>
            <Section title="Profile" description="Atlas uses these to personalise everything it does.">
              <div className="settings-grid">
                {[
                  { key: 'name', label: 'Name', placeholder: 'Your name' },
                  { key: 'role', label: 'Role', placeholder: 'Founder, Student, Freelancer…' },
                  { key: 'city', label: 'City', placeholder: 'London, UK' },
                  { key: 'timezone', label: 'Timezone', placeholder: 'Europe/London' },
                ].map((f) => (
                  <div key={f.key}>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '11px',
                        color: 'rgba(240,236,230,0.35)',
                        marginBottom: '6px',
                        letterSpacing: '0.5px',
                      }}
                    >
                      {f.label}
                    </label>
                    <input
                      value={profile[f.key]}
                      onChange={(e) => setProfile({ ...profile, [f.key]: e.target.value })}
                      placeholder={f.placeholder}
                      style={inputStyle}
                    />
                  </div>
                ))}
              </div>
              {data?.email && (
                <p style={{ fontSize: '12px', color: 'rgba(240,236,230,0.28)', marginTop: '14px' }}>
                  Signed in as {data.email}
                </p>
              )}
            </Section>

            <Section
              title="Connected Accounts"
              description="One Google connection powers both the Gmail and Calendar agents."
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  flexWrap: 'wrap',
                  padding: '14px',
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: '12px',
                }}
              >
                <div>
                  <div style={{ fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: google?.connected ? '#4ade80' : 'rgba(255,255,255,0.2)',
                        display: 'inline-block',
                      }}
                    />
                    Google — Gmail &amp; Calendar
                  </div>
                  <div style={{ fontSize: '12px', color: 'rgba(240,236,230,0.35)', marginTop: '4px' }}>
                    {!google?.configured
                      ? 'Not available — GOOGLE_CLIENT_ID/SECRET are not set on this deployment.'
                      : google?.connected
                        ? google.via === 'env'
                          ? 'Connected via the shared development token in .env.local.'
                          : `Connected${google.email ? ` as ${google.email}` : ''}.`
                        : 'Not connected.'}
                  </div>
                </div>

                {google?.configured &&
                  (google.connected && google.via === 'user' ? (
                    <button
                      onClick={async () => {
                        await fetch('/api/auth/google', { method: 'DELETE' });
                        window.location.reload();
                      }}
                      style={{
                        padding: '9px 18px',
                        borderRadius: '100px',
                        background: 'transparent',
                        border: '1px solid rgba(255,107,107,0.35)',
                        color: '#ff9b9b',
                        fontSize: '12.5px',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      Disconnect
                    </button>
                  ) : (
                    <a
                      href="/api/auth/google"
                      style={{
                        padding: '10px 20px',
                        borderRadius: '100px',
                        background: `linear-gradient(135deg,${GOLD},#e8c96a)`,
                        color: '#1a1a1a',
                        fontSize: '12.5px',
                        fontWeight: 700,
                        textDecoration: 'none',
                      }}
                    >
                      Connect
                    </a>
                  ))}
              </div>
            </Section>

            <Section title="Notifications" description="Your morning briefing.">
              <Toggle on={briefingEnabled} onChange={setBriefingEnabled} label="Send me a morning briefing" />
              {briefingEnabled && (
                <div style={{ marginTop: '16px', maxWidth: '220px' }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '11px',
                      color: 'rgba(240,236,230,0.35)',
                      marginBottom: '6px',
                    }}
                  >
                    Preferred hour (UTC)
                  </label>
                  <select
                    value={briefingHour}
                    onChange={(e) => setBriefingHour(Number(e.target.value))}
                    style={{ ...inputStyle, cursor: 'pointer' }}
                  >
                    {Array.from({ length: 24 }, (_, h) => (
                      <option key={h} value={h} style={{ background: '#1a1a1a' }}>
                        {String(h).padStart(2, '0')}:00
                      </option>
                    ))}
                  </select>
                  <p style={{ fontSize: '11.5px', color: 'rgba(240,236,230,0.28)', marginTop: '8px', lineHeight: 1.5 }}>
                    The scheduled job currently runs once at 07:00 UTC on weekdays. This preference
                    is stored and will be honoured when per-user scheduling is added.
                  </p>
                </div>
              )}
            </Section>

            <Section title="Atlas Personality" description="How Atlas talks to you.">
              <Slider value={tone} onChange={setTone} labels={TONE_LABELS} label="Tone" />
              <Slider value={detail} onChange={setDetail} labels={DETAIL_LABELS} label="Detail" />
            </Section>

            <Section title="Plan & Billing">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '12px',
                }}
              >
                <div>
                  <div style={{ fontSize: '20px', fontWeight: 600 }}>{data?.plan?.label || 'Free'}</div>
                  <div style={{ fontSize: '13px', color: 'rgba(240,236,230,0.4)', marginTop: '4px' }}>
                    {data?.plan?.dailyLimit
                      ? `${data.plan.messagesToday} of ${data.plan.dailyLimit} messages used today`
                      : `${data?.plan?.messagesToday ?? 0} messages today · unlimited`}
                  </div>
                  <div style={{ fontSize: '12px', color: 'rgba(240,236,230,0.28)', marginTop: '4px' }}>
                    {data?.stats?.memories ?? 0} memories stored
                  </div>
                </div>
                {data?.plan?.id === 'free' && (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => upgrade('pro')}
                      style={{
                        padding: '11px 20px',
                        borderRadius: '100px',
                        background: `linear-gradient(135deg,${GOLD},#e8c96a)`,
                        border: 'none',
                        color: '#1a1a1a',
                        fontWeight: 700,
                        fontSize: '13px',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      Pro — $299/mo
                    </button>
                    <button
                      onClick={() => upgrade('elite')}
                      style={{
                        padding: '11px 20px',
                        borderRadius: '100px',
                        background: 'transparent',
                        border: `1px solid ${GOLD}`,
                        color: GOLD,
                        fontWeight: 700,
                        fontSize: '13px',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      Elite — $499/mo
                    </button>
                  </div>
                )}
              </div>
            </Section>

            <div
              style={{
                display: 'flex',
                gap: '12px',
                alignItems: 'center',
                marginBottom: '28px',
                flexWrap: 'wrap',
              }}
            >
              <button
                onClick={save}
                disabled={saving}
                style={{
                  padding: '13px 32px',
                  borderRadius: '100px',
                  background: `linear-gradient(135deg,${GOLD},#e8c96a)`,
                  border: 'none',
                  color: '#1a1a1a',
                  fontWeight: 700,
                  fontSize: '14px',
                  cursor: saving ? 'wait' : 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
              {status && (
                <span style={{ fontSize: '13px', color: 'rgba(240,236,230,0.5)' }}>{status}</span>
              )}
            </div>

            <div
              style={{
                background: 'rgba(255,107,107,0.04)',
                border: '1px solid rgba(255,107,107,0.2)',
                borderRadius: '16px',
                padding: '24px',
              }}
            >
              <div
                style={{
                  fontSize: '10px',
                  letterSpacing: '3px',
                  color: '#ff6b6b',
                  textTransform: 'uppercase',
                  fontWeight: 700,
                  marginBottom: '16px',
                }}
              >
                Danger Zone
              </div>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button
                  onClick={() =>
                    setModal({
                      target: 'memories',
                      title: 'Delete all memories?',
                      body: `This permanently removes all ${data?.stats?.memories ?? 0} memories Atlas has about you, including your onboarding answers. Tasks, contacts and invoices are not affected. This cannot be undone.`,
                      confirmLabel: 'Delete memories',
                    })
                  }
                  style={{
                    padding: '11px 20px',
                    borderRadius: '100px',
                    background: 'transparent',
                    border: '1px solid rgba(255,107,107,0.35)',
                    color: '#ff9b9b',
                    fontSize: '13px',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Delete all memories
                </button>
                <button
                  onClick={() =>
                    setModal({
                      target: 'account',
                      title: 'Delete your account data?',
                      body: 'This permanently deletes every memory, conversation, task, contact, invoice and job application, disconnects Google, and signs you out. Your login itself is not removed. This cannot be undone.',
                      confirmLabel: 'Delete everything',
                    })
                  }
                  style={{
                    padding: '11px 20px',
                    borderRadius: '100px',
                    background: 'rgba(220,38,38,0.15)',
                    border: '1px solid rgba(220,38,38,0.4)',
                    color: '#ff9b9b',
                    fontSize: '13px',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Delete account data
                </button>
              </div>
            </div>
          </>
        )}
      </main>

      <ConfirmModal
        open={Boolean(modal)}
        title={modal?.title}
        body={modal?.body}
        confirmLabel={modal?.confirmLabel}
        onConfirm={() => runDelete(modal.target)}
        onCancel={() => setModal(null)}
      />
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: BG }} />}>
      <SettingsInner />
    </Suspense>
  );
}
