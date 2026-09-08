'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import AtlasNav, { GOLD, BG, CREAM } from '../components/AtlasNav';

function Card({ title, children, action, accent }) {
  return (
    <div
      style={{
        background: accent ? 'rgba(201,168,76,0.045)' : 'rgba(255,255,255,0.02)',
        border: `1px solid ${accent ? 'rgba(201,168,76,0.22)' : 'rgba(255,255,255,0.06)'}`,
        borderRadius: '16px',
        padding: '22px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
          flexWrap: 'wrap',
          marginBottom: '16px',
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
        {action}
      </div>
      {children}
    </div>
  );
}

const empty = (text) => (
  <div
    style={{
      color: 'rgba(240,236,230,0.22)',
      textAlign: 'center',
      padding: '22px',
      fontSize: '13.5px',
    }}
  >
    {text}
  </div>
);

export default function Dashboard() {
  const [tasks, setTasks] = useState([]);
  const [memories, setMemories] = useState([]);
  const [finance, setFinance] = useState(null);
  const [invoices, setInvoices] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [agents, setAgents] = useState(null);
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState([]);

  const [briefing, setBriefing] = useState(null);
  const [briefingLoading, setBriefingLoading] = useState(true);
  const [briefingError, setBriefingError] = useState('');

  const [ask, setAsk] = useState('');
  const [asking, setAsking] = useState(false);
  const [askReply, setAskReply] = useState(null);
  const askRef = useRef(null);

  const get = useCallback(async (url, label) => {
    try {
      const res = await fetch(url);
      if (res.status === 401) {
        window.location.href = '/login?redirect=/dashboard';
        return null;
      }
      const data = await res.json();
      return res.ok ? data : { __error: data.error || `${label} failed` };
    } catch {
      return { __error: `${label} is unreachable` };
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [t, m, f, inv, c, conv, ag, a] = await Promise.all([
        get('/api/atlas/tasks', 'Tasks'),
        get('/api/atlas/memory?limit=6', 'Memories'),
        get('/api/atlas/finance', 'Finance'),
        get('/api/atlas/invoice', 'Invoices'),
        get('/api/atlas/contacts?limit=200', 'Contacts'),
        get('/api/atlas/conversations?limit=10', 'Conversations'),
        get('/api/atlas/agents', 'Agents'),
        get('/api/auth', 'Account'),
      ]);

      if (cancelled) return;

      const found = [];
      const take = (result, setter, key) => {
        if (!result) return;
        if (result.__error) found.push(result.__error);
        else setter(key ? result[key] || [] : result);
      };

      take(t, setTasks, 'tasks');
      take(m, setMemories, 'memories');
      take(f, setFinance);
      take(inv, setInvoices);
      take(c, setContacts, 'contacts');
      take(conv, setConversations, 'conversations');
      if (ag && !ag.__error) setAgents(ag);
      if (a && !a.__error) setAccount(a);

      setErrors(found);
      setLoading(false);
    })();

    // The briefing is slower (it calls the model), so it loads independently
    // rather than holding up the rest of the dashboard.
    (async () => {
      const b = await get('/api/atlas/briefing', 'Briefing');
      if (cancelled || !b) return;
      if (b.__error) setBriefingError(b.__error);
      else setBriefing(b);
      setBriefingLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [get]);

  const completeTask = async (id) => {
    const previous = tasks;
    setTasks((prev) => prev.filter((t) => t.id !== id));
    try {
      const res = await fetch('/api/atlas/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'done' }),
      });
      if (!res.ok) setTasks(previous);
    } catch {
      setTasks(previous);
    }
  };

  const refreshBriefing = async () => {
    setBriefingLoading(true);
    setBriefingError('');
    try {
      const res = await fetch('/api/atlas/briefing', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) setBriefingError(data.error || 'Could not refresh');
      else setBriefing(data);
    } catch {
      setBriefingError('Could not reach the server');
    } finally {
      setBriefingLoading(false);
    }
  };

  const sendAsk = async () => {
    const message = ask.trim();
    if (!message || asking) return;

    setAsking(true);
    setAskReply(null);
    try {
      const res = await fetch('/api/atlas/orchestrator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      const data = await res.json();

      if (res.status === 401) {
        window.location.href = '/login?redirect=/dashboard';
        return;
      }
      setAskReply(
        res.ok
          ? { text: data.response, agents: data.agentNames, status: data.agentStatus, keys: data.agents }
          : { text: data.error || 'Something went wrong.', isError: true }
      );
      if (res.ok) setAsk('');
    } catch {
      setAskReply({ text: 'Could not reach the server.', isError: true });
    } finally {
      setAsking(false);
      askRef.current?.focus();
    }
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const urgent = tasks.filter((t) => t.priority >= 8).length;
  const plan = account?.user?.plan || 'free';
  const name = account?.user?.email?.split('@')[0];

  const stats = [
    {
      label: 'Pending Tasks',
      value: loading ? '—' : tasks.length,
      sub: urgent > 0 ? `${urgent} urgent` : 'All clear',
    },
    { label: 'Memories', value: loading ? '—' : memories.length, sub: 'Long-term' },
    { label: 'Contacts', value: loading ? '—' : contacts.length, sub: 'People tracked' },
    {
      label: 'Net (30 days)',
      value: finance?.summary ? `£${Math.round(finance.summary.net)}` : '—',
      sub: invoices?.summary?.unpaid
        ? `${invoices.summary.unpaid} unpaid`
        : 'No unpaid invoices',
    },
    {
      label: 'Connected Agents',
      value: agents ? agents.counts.live : '—',
      sub: agents ? `${agents.counts.planned} not connected` : 'Checking…',
    },
  ];

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
        .stat-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; }
        .main-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        textarea:focus, input:focus { border-color: rgba(201,168,76,0.5) !important; }
        @media (max-width: 1000px) { .stat-grid { grid-template-columns: repeat(3, 1fr); } }
        @media (max-width: 780px) {
          .main-grid { grid-template-columns: 1fr; }
          .stat-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 420px) { .stat-grid { grid-template-columns: 1fr 1fr; } }
      `}</style>

      <AtlasNav
        active="/dashboard"
        subtitle={`${plan.toUpperCase()} PLAN`}
        right={
          <button
            onClick={async () => {
              await fetch('/api/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'logout' }),
              });
              window.location.href = '/login';
            }}
            style={{
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'rgba(240,236,230,0.4)',
              padding: '8px 16px',
              borderRadius: '100px',
              fontSize: '12px',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Sign out
          </button>
        }
      />

      <main style={{ padding: '26px 20px 40px', maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ marginBottom: '22px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 300, letterSpacing: '-1px', margin: 0 }}>
            {greeting}
            {name ? `, ${name}` : ''}.
          </h1>
          <p style={{ color: 'rgba(240,236,230,0.3)', fontSize: '14px', marginTop: '6px' }}>
            {new Date().toLocaleDateString('en-GB', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>

        {errors.length > 0 && (
          <div
            style={{
              background: 'rgba(255,107,107,0.08)',
              border: '1px solid rgba(255,107,107,0.25)',
              borderRadius: '12px',
              padding: '13px 17px',
              marginBottom: '16px',
              fontSize: '13px',
              color: '#ffb3b3',
            }}
          >
            {errors.map((e, i) => (
              <div key={i}>{e}</div>
            ))}
          </div>
        )}

        {/* ---- morning briefing ---- */}
        <div style={{ marginBottom: '16px' }}>
          <Card
            title="Morning Briefing"
            accent
            action={
              <button
                onClick={refreshBriefing}
                disabled={briefingLoading}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(201,168,76,0.3)',
                  color: GOLD,
                  padding: '5px 13px',
                  borderRadius: '100px',
                  fontSize: '11px',
                  cursor: briefingLoading ? 'wait' : 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {briefingLoading ? '…' : 'Refresh'}
              </button>
            }
          >
            {briefingLoading ? (
              <div style={{ color: 'rgba(240,236,230,0.3)', fontSize: '14px' }}>
                Putting your briefing together…
              </div>
            ) : briefingError ? (
              <div style={{ color: 'rgba(255,179,179,0.8)', fontSize: '13.5px' }}>{briefingError}</div>
            ) : briefing?.content ? (
              <div
                style={{
                  fontSize: '15px',
                  lineHeight: 1.75,
                  color: 'rgba(240,236,230,0.82)',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {briefing.content}
              </div>
            ) : (
              empty('No briefing available.')
            )}
          </Card>
        </div>

        {/* ---- stats ---- */}
        <div className="stat-grid" style={{ marginBottom: '16px' }}>
          {stats.map((s) => (
            <div
              key={s.label}
              style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: '14px',
                padding: '18px 14px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '27px', fontWeight: 800, letterSpacing: '-1px', color: CREAM }}>
                {s.value}
              </div>
              <div
                style={{
                  fontSize: '9.5px',
                  letterSpacing: '1.5px',
                  color: 'rgba(240,236,230,0.25)',
                  textTransform: 'uppercase',
                  marginTop: '4px',
                }}
              >
                {s.label}
              </div>
              <div style={{ fontSize: '10.5px', color: GOLD, marginTop: '5px' }}>{s.sub}</div>
            </div>
          ))}
        </div>

        <div className="main-grid">
          <Card
            title="Active Tasks"
            action={
              <Link href="/atlas" style={{ color: GOLD, fontSize: '11px', textDecoration: 'none' }}>
                + Add via Atlas
              </Link>
            }
          >
            {loading
              ? empty('Loading…')
              : tasks.length === 0
                ? empty('No pending tasks. Tell Atlas what needs doing.')
                : tasks.slice(0, 6).map((t) => (
                    <div
                      key={t.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '11px 0',
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                      }}
                    >
                      <button
                        onClick={() => completeTask(t.id)}
                        aria-label={`Mark "${t.title}" done`}
                        style={{
                          width: '19px',
                          height: '19px',
                          borderRadius: '50%',
                          border: `1px solid ${t.priority >= 8 ? GOLD : 'rgba(255,255,255,0.15)'}`,
                          background: 'transparent',
                          cursor: 'pointer',
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13.5px', color: CREAM }}>{t.title}</div>
                        {t.due_date && (
                          <div style={{ fontSize: '11px', color: GOLD, marginTop: '2px' }}>
                            Due {new Date(t.due_date).toLocaleDateString('en-GB')}
                          </div>
                        )}
                      </div>
                      {t.priority >= 8 && (
                        <span
                          style={{
                            fontSize: '9px',
                            color: GOLD,
                            background: 'rgba(201,168,76,0.1)',
                            padding: '2px 8px',
                            borderRadius: '999px',
                          }}
                        >
                          URGENT
                        </span>
                      )}
                    </div>
                  ))}
          </Card>

          <Card title="Invoices">
            {!invoices ? (
              empty('Loading…')
            ) : invoices.invoices?.length === 0 ? (
              empty('No invoices yet. Try "invoice Sarah £2000 for the website".')
            ) : (
              <>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1fr',
                    gap: '10px',
                    textAlign: 'center',
                    marginBottom: '14px',
                  }}
                >
                  {[
                    { label: 'Unpaid', value: invoices.summary.unpaid, color: GOLD },
                    { label: 'Overdue', value: invoices.summary.overdue, color: '#f87171' },
                    {
                      label: 'Value',
                      value: `£${Math.round(invoices.summary.unpaidValue)}`,
                      color: CREAM,
                    },
                  ].map((s) => (
                    <div key={s.label}>
                      <div style={{ fontSize: '19px', fontWeight: 700, color: s.color }}>{s.value}</div>
                      <div
                        style={{
                          fontSize: '9.5px',
                          color: 'rgba(240,236,230,0.25)',
                          letterSpacing: '1px',
                          textTransform: 'uppercase',
                          marginTop: '2px',
                        }}
                      >
                        {s.label}
                      </div>
                    </div>
                  ))}
                </div>
                {invoices.invoices.slice(0, 4).map((inv) => (
                  <div
                    key={inv.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '9px 0',
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '13px', color: CREAM }}>{inv.client_name}</div>
                      {inv.due_date && (
                        <div
                          style={{
                            fontSize: '10.5px',
                            color: inv.overdue ? '#f87171' : 'rgba(240,236,230,0.3)',
                            marginTop: '2px',
                          }}
                        >
                          {inv.overdue ? 'Overdue ' : 'Due '}
                          {inv.due_date}
                        </div>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: '13px',
                        fontWeight: 600,
                        color: inv.status === 'paid' ? '#4ade80' : GOLD,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      £{Number(inv.amount).toFixed(0)}
                    </div>
                  </div>
                ))}
              </>
            )}
          </Card>

          <Card title="What Atlas Knows">
            {loading
              ? empty('Loading…')
              : memories.length === 0
                ? empty('No memories yet. Talk to Atlas to build your profile.')
                : memories.map((m) => (
                    <div
                      key={m.id}
                      style={{
                        display: 'flex',
                        gap: '10px',
                        alignItems: 'flex-start',
                        padding: '9px 0',
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '9px',
                          color: GOLD,
                          background: 'rgba(201,168,76,0.08)',
                          padding: '3px 8px',
                          borderRadius: '999px',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {m.type}
                      </span>
                      <div style={{ fontSize: '12.5px', color: 'rgba(240,236,230,0.65)', lineHeight: 1.5 }}>
                        {m.content}
                      </div>
                    </div>
                  ))}
          </Card>

          <Card title="Agent Status">
            {!agents ? (
              empty('Loading…')
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                {[
                  ...agents.live.map((a) => ({ ...a, live: true })),
                  ...agents.planned.map((a) => ({ ...a, live: false })),
                ].map((a) => (
                  <div
                    key={a.key}
                    style={{ display: 'flex', alignItems: 'center', gap: '9px', fontSize: '12.5px' }}
                  >
                    <span
                      style={{
                        width: '7px',
                        height: '7px',
                        borderRadius: '50%',
                        background: a.live ? '#4ade80' : 'rgba(255,255,255,0.18)',
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ color: a.live ? 'rgba(240,236,230,0.75)' : 'rgba(240,236,230,0.35)' }}>
                      {a.name}
                    </span>
                    {!a.live && (
                      <span style={{ color: 'rgba(240,236,230,0.2)', fontSize: '11px', marginLeft: 'auto' }}>
                        needs {a.needs}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card
            title="Recent Conversations"
            action={
              <Link href="/atlas" style={{ color: GOLD, fontSize: '11px', textDecoration: 'none' }}>
                Open chat
              </Link>
            }
          >
            {loading
              ? empty('Loading…')
              : conversations.length === 0
                ? empty('No conversations yet.')
                : conversations.slice(0, 5).map((c) => (
                    <div
                      key={c.id}
                      style={{ padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                    >
                      <div
                        style={{
                          fontSize: '9.5px',
                          letterSpacing: '1px',
                          color: c.role === 'user' ? 'rgba(240,236,230,0.3)' : GOLD,
                          textTransform: 'uppercase',
                          marginBottom: '3px',
                        }}
                      >
                        {c.role === 'user' ? 'You' : 'Atlas'}
                      </div>
                      <div
                        style={{
                          fontSize: '12.5px',
                          color: 'rgba(240,236,230,0.6)',
                          lineHeight: 1.5,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {c.content}
                      </div>
                    </div>
                  ))}
          </Card>

          {finance?.summary && (
            <Card title="Finance">
              <div
                style={{
                  fontSize: '13.5px',
                  color: 'rgba(240,236,230,0.6)',
                  lineHeight: 1.7,
                  marginBottom: '16px',
                }}
              >
                {finance.insight}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', textAlign: 'center' }}>
                {[
                  { label: 'Income', value: finance.summary.income, color: '#4ade80' },
                  { label: 'Expenses', value: finance.summary.expenses, color: '#f87171' },
                  { label: 'Net', value: finance.summary.net, color: GOLD },
                ].map((s) => (
                  <div key={s.label}>
                    <div style={{ fontSize: '19px', fontWeight: 700, color: s.color }}>
                      £{Math.round(s.value)}
                    </div>
                    <div
                      style={{
                        fontSize: '9.5px',
                        color: 'rgba(240,236,230,0.25)',
                        letterSpacing: '1px',
                        marginTop: '3px',
                        textTransform: 'uppercase',
                      }}
                    >
                      {s.label}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* ---- quick ask ---- */}
        <div style={{ marginTop: '16px' }}>
          <Card title="Quick Ask Atlas">
            {askReply && (
              <div
                style={{
                  background: askReply.isError ? 'rgba(255,107,107,0.07)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${askReply.isError ? 'rgba(255,107,107,0.22)' : 'rgba(255,255,255,0.07)'}`,
                  borderRadius: '12px',
                  padding: '14px 16px',
                  marginBottom: '12px',
                  fontSize: '14px',
                  lineHeight: 1.7,
                  color: askReply.isError ? '#ffb3b3' : 'rgba(240,236,230,0.8)',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {askReply.text}
                {askReply.keys && (
                  <div style={{ marginTop: '10px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {askReply.keys.map((k, i) => {
                      const live = askReply.status?.[k] === 'live';
                      return (
                        <span
                          key={k}
                          style={{
                            fontSize: '10px',
                            color: live ? GOLD : 'rgba(240,236,230,0.35)',
                            background: live ? 'rgba(201,168,76,0.08)' : 'rgba(255,255,255,0.03)',
                            border: `1px solid ${live ? 'rgba(201,168,76,0.22)' : 'rgba(255,255,255,0.07)'}`,
                            padding: '2px 9px',
                            borderRadius: '999px',
                          }}
                        >
                          {live ? '● ' : '○ '}
                          {askReply.agents?.[i]}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
              <textarea
                ref={askRef}
                value={ask}
                onChange={(e) => setAsk(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendAsk();
                  }
                }}
                rows={1}
                placeholder="Ask Atlas anything without leaving the dashboard…"
                style={{
                  flex: 1,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '20px',
                  padding: '12px 17px',
                  color: CREAM,
                  fontSize: '14px',
                  outline: 'none',
                  fontFamily: 'inherit',
                  resize: 'none',
                  lineHeight: 1.5,
                  maxHeight: '110px',
                }}
              />
              <button
                onClick={sendAsk}
                disabled={!ask.trim() || asking}
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  flexShrink: 0,
                  background:
                    ask.trim() && !asking
                      ? `linear-gradient(135deg,${GOLD},#e8c96a)`
                      : 'rgba(255,255,255,0.03)',
                  border: 'none',
                  color: ask.trim() && !asking ? '#1a1a1a' : 'rgba(240,236,230,0.15)',
                  cursor: ask.trim() && !asking ? 'pointer' : 'not-allowed',
                  fontSize: '17px',
                }}
              >
                {asking ? '·' : '→'}
              </button>
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}
