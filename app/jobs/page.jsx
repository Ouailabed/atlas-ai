'use client';

import { useState, useEffect, useCallback } from 'react';
import AtlasNav, { GOLD, BG, CREAM } from '../components/AtlasNav';

const STATUSES = ['applied', 'interview', 'offer', 'rejected'];
const STATUS_COLOR = {
  applied: 'rgba(240,236,230,0.5)',
  interview: '#60a5fa',
  offer: '#4ade80',
  rejected: '#f87171',
};

function Card({ title, children, action }) {
  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '16px',
        padding: '22px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px',
          gap: '10px',
          flexWrap: 'wrap',
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

function CopyButton({ text, label = 'Copy' }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          setCopied(false);
        }
      }}
      style={{
        background: copied ? 'rgba(74,222,128,0.15)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${copied ? 'rgba(74,222,128,0.4)' : 'rgba(255,255,255,0.1)'}`,
        color: copied ? '#4ade80' : 'rgba(240,236,230,0.6)',
        padding: '6px 14px',
        borderRadius: '100px',
        fontSize: '11px',
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      {copied ? '✓ Copied' : label}
    </button>
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

export default function JobsPage() {
  const [cv, setCv] = useState('');
  const [cvSaved, setCvSaved] = useState(false);
  const [cvStatus, setCvStatus] = useState('');

  const [applications, setApplications] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  const [newApp, setNewApp] = useState({ company: '', role: '', status: 'applied', notes: '' });

  const [gen, setGen] = useState({ jobTitle: '', company: '', jobDescription: '' });
  const [generating, setGenerating] = useState(false);
  const [pkg, setPkg] = useState(null);
  const [genError, setGenError] = useState('');

  const loadApplications = useCallback(async () => {
    try {
      const res = await fetch('/api/atlas/job-applications');
      if (res.status === 401) {
        window.location.href = '/login?redirect=/jobs';
        return;
      }
      const data = await res.json();
      setApplications(data.applications || []);
      setSummary(data.summary || null);
    } catch {
      /* surfaced by the empty state */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadApplications();

    // Load any CV already stored as a memory.
    (async () => {
      try {
        const res = await fetch('/api/atlas/memory?type=cv&limit=1');
        const data = await res.json();
        if (data.memories?.[0]?.content) {
          setCv(data.memories[0].content);
          setCvSaved(true);
        }
      } catch {
        /* non-fatal */
      }
    })();
  }, [loadApplications]);

  const saveCv = async () => {
    if (!cv.trim()) return;
    setCvStatus('Saving…');
    try {
      const res = await fetch('/api/atlas/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: cv.trim(), type: 'cv', importance: 10, tags: ['cv'] }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCvStatus(data.error || 'Could not save');
        return;
      }
      setCvSaved(true);
      setCvStatus('Saved — Atlas will use this for every application.');
      setTimeout(() => setCvStatus(''), 4000);
    } catch {
      setCvStatus('Could not reach the server');
    }
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.txt')) {
      setCvStatus('Please upload a .txt file (or paste the text directly).');
      return;
    }
    try {
      setCv(await file.text());
      setCvStatus('Loaded — press Save to store it.');
    } catch {
      setCvStatus('Could not read that file.');
    }
  };

  const addApplication = async () => {
    if (!newApp.company.trim() || !newApp.role.trim()) return;
    try {
      const res = await fetch('/api/atlas/job-applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newApp),
      });
      if (res.ok) {
        setNewApp({ company: '', role: '', status: 'applied', notes: '' });
        loadApplications();
      }
    } catch {
      /* ignore */
    }
  };

  const updateStatus = async (id, status) => {
    setApplications((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
    try {
      await fetch('/api/atlas/job-applications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      loadApplications();
    } catch {
      /* ignore */
    }
  };

  const generatePackage = async () => {
    if (!gen.jobTitle.trim() || generating) return;
    setGenerating(true);
    setGenError('');
    setPkg(null);

    try {
      const res = await fetch('/api/atlas/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'full-package',
          jobTitle: gen.jobTitle,
          company: gen.company,
          jobDescription: gen.jobDescription,
          originalCV: cv || undefined,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setGenError(data.error || 'Generation failed');
        return;
      }
      setPkg(data);
    } catch {
      setGenError('Could not reach the server');
    } finally {
      setGenerating(false);
    }
  };

  const saveGeneratedAsApplication = async () => {
    if (!gen.company.trim() || !gen.jobTitle.trim()) return;
    await fetch('/api/atlas/job-applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company: gen.company,
        role: gen.jobTitle,
        status: 'applied',
        fit_score: pkg?.analysis?.fit_score ?? null,
        notes: pkg?.analysis?.reason || null,
      }),
    });
    loadApplications();
  };

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
        input:focus, textarea:focus, select:focus { border-color: rgba(201,168,76,0.5) !important; }
        .jobs-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .pkg-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        @media (max-width: 860px) {
          .jobs-grid, .pkg-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      <AtlasNav active="/jobs" subtitle="Jobs & CV" />

      <main style={{ padding: '26px 20px', maxWidth: '1200px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '26px', fontWeight: 300, letterSpacing: '-0.5px', margin: '0 0 6px' }}>
          Job search
        </h1>
        <p style={{ color: 'rgba(240,236,230,0.32)', fontSize: '14px', margin: '0 0 24px' }}>
          Everything Atlas generates here is a draft for you to review. It does not submit
          applications on your behalf.
        </p>

        {summary && summary.total > 0 && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
              gap: '12px',
              marginBottom: '20px',
            }}
          >
            {[
              { label: 'Total', value: summary.total, color: CREAM },
              ...STATUSES.map((s) => ({
                label: s,
                value: summary[s] || 0,
                color: STATUS_COLOR[s],
              })),
            ].map((s) => (
              <div
                key={s.label}
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: '14px',
                  padding: '16px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '24px', fontWeight: 800, color: s.color }}>{s.value}</div>
                <div
                  style={{
                    fontSize: '10px',
                    letterSpacing: '1.5px',
                    color: 'rgba(240,236,230,0.3)',
                    textTransform: 'uppercase',
                    marginTop: '3px',
                  }}
                >
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="jobs-grid" style={{ marginBottom: '14px' }}>
          <Card
            title="Your CV"
            action={cvSaved && <span style={{ fontSize: '11px', color: '#4ade80' }}>✓ On file</span>}
          >
            <textarea
              value={cv}
              onChange={(e) => {
                setCv(e.target.value);
                setCvSaved(false);
              }}
              placeholder="Paste your CV text here, or upload a .txt file below."
              rows={9}
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.55, fontSize: '13px' }}
            />
            <div
              style={{
                display: 'flex',
                gap: '10px',
                marginTop: '12px',
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              <button
                onClick={saveCv}
                disabled={!cv.trim()}
                style={{
                  padding: '10px 22px',
                  borderRadius: '100px',
                  background: cv.trim() ? `linear-gradient(135deg,${GOLD},#e8c96a)` : 'rgba(255,255,255,0.05)',
                  border: 'none',
                  color: cv.trim() ? '#1a1a1a' : 'rgba(240,236,230,0.25)',
                  fontWeight: 700,
                  fontSize: '13px',
                  cursor: cv.trim() ? 'pointer' : 'not-allowed',
                  fontFamily: 'inherit',
                }}
              >
                Save CV
              </button>
              <label
                style={{
                  padding: '10px 18px',
                  borderRadius: '100px',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: 'rgba(240,236,230,0.55)',
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                Upload .txt
                <input type="file" accept=".txt,text/plain" onChange={handleFile} style={{ display: 'none' }} />
              </label>
              {cvStatus && (
                <span style={{ fontSize: '12px', color: 'rgba(240,236,230,0.45)' }}>{cvStatus}</span>
              )}
            </div>
          </Card>

          <Card title="Generate Application Package">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <input
                value={gen.jobTitle}
                onChange={(e) => setGen({ ...gen, jobTitle: e.target.value })}
                placeholder="Job title (required)"
                style={inputStyle}
              />
              <input
                value={gen.company}
                onChange={(e) => setGen({ ...gen, company: e.target.value })}
                placeholder="Company"
                style={inputStyle}
              />
              <textarea
                value={gen.jobDescription}
                onChange={(e) => setGen({ ...gen, jobDescription: e.target.value })}
                placeholder="Paste the job description"
                rows={5}
                style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5, fontSize: '13px' }}
              />
              <button
                onClick={generatePackage}
                disabled={!gen.jobTitle.trim() || generating}
                style={{
                  padding: '12px',
                  borderRadius: '100px',
                  background:
                    gen.jobTitle.trim() && !generating
                      ? `linear-gradient(135deg,${GOLD},#e8c96a)`
                      : 'rgba(255,255,255,0.05)',
                  border: 'none',
                  color: gen.jobTitle.trim() && !generating ? '#1a1a1a' : 'rgba(240,236,230,0.25)',
                  fontWeight: 700,
                  fontSize: '13px',
                  cursor: gen.jobTitle.trim() && !generating ? 'pointer' : 'not-allowed',
                  fontFamily: 'inherit',
                }}
              >
                {generating ? 'Generating…' : 'Generate CV + Cover Letter'}
              </button>
              {genError && <p style={{ color: '#ff6b6b', fontSize: '12px', margin: 0 }}>{genError}</p>}
            </div>
          </Card>
        </div>

        {pkg && (
          <div style={{ marginBottom: '14px' }}>
            {pkg.analysis && (
              <Card
                title="Fit Analysis"
                action={
                  <button
                    onClick={saveGeneratedAsApplication}
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      color: 'rgba(240,236,230,0.6)',
                      padding: '6px 14px',
                      borderRadius: '100px',
                      fontSize: '11px',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    + Track this application
                  </button>
                }
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '20px',
                    flexWrap: 'wrap',
                    marginBottom: '14px',
                  }}
                >
                  <div style={{ textAlign: 'center', minWidth: '90px' }}>
                    <div
                      style={{
                        fontSize: '40px',
                        fontWeight: 800,
                        color:
                          pkg.analysis.fit_score >= 70
                            ? '#4ade80'
                            : pkg.analysis.fit_score >= 40
                              ? GOLD
                              : '#f87171',
                      }}
                    >
                      {pkg.analysis.fit_score ?? '—'}
                      {pkg.analysis.fit_score != null && (
                        <span style={{ fontSize: '18px' }}>%</span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: '10px',
                        letterSpacing: '1.5px',
                        color: 'rgba(240,236,230,0.3)',
                        textTransform: 'uppercase',
                      }}
                    >
                      {pkg.analysis.recommendation}
                    </div>
                  </div>
                  <div style={{ flex: 1, minWidth: '220px', fontSize: '14px', color: 'rgba(240,236,230,0.65)', lineHeight: 1.6 }}>
                    {pkg.analysis.reason}
                  </div>
                </div>

                <div className="pkg-grid">
                  <div>
                    <div style={{ fontSize: '11px', color: '#4ade80', letterSpacing: '1.5px', marginBottom: '8px' }}>
                      STRENGTHS
                    </div>
                    {pkg.analysis.strengths?.length ? (
                      pkg.analysis.strengths.map((s, i) => (
                        <div key={i} style={{ fontSize: '13px', color: 'rgba(240,236,230,0.6)', padding: '3px 0' }}>
                          • {s}
                        </div>
                      ))
                    ) : (
                      <div style={{ fontSize: '13px', color: 'rgba(240,236,230,0.25)' }}>None listed</div>
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: '#f87171', letterSpacing: '1.5px', marginBottom: '8px' }}>
                      GAPS
                    </div>
                    {pkg.analysis.gaps?.length ? (
                      pkg.analysis.gaps.map((g, i) => (
                        <div key={i} style={{ fontSize: '13px', color: 'rgba(240,236,230,0.6)', padding: '3px 0' }}>
                          • {g}
                        </div>
                      ))
                    ) : (
                      <div style={{ fontSize: '13px', color: 'rgba(240,236,230,0.25)' }}>None listed</div>
                    )}
                  </div>
                </div>
              </Card>
            )}

            <div className="pkg-grid" style={{ marginTop: '14px' }}>
              {[
                { title: 'Tailored CV', body: pkg.cv },
                { title: 'Cover Letter', body: pkg.letter },
              ].map((doc) => (
                <Card
                  key={doc.title}
                  title={doc.title}
                  action={doc.body && <CopyButton text={doc.body} />}
                >
                  <pre
                    style={{
                      whiteSpace: 'pre-wrap',
                      fontFamily: 'inherit',
                      fontSize: '13px',
                      color: 'rgba(240,236,230,0.7)',
                      lineHeight: 1.6,
                      margin: 0,
                      maxHeight: '440px',
                      overflowY: 'auto',
                    }}
                  >
                    {doc.body || 'Not generated.'}
                  </pre>
                </Card>
              ))}
            </div>
          </div>
        )}

        <Card title="Application Tracker">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: '8px',
              marginBottom: '16px',
            }}
          >
            <input
              value={newApp.company}
              onChange={(e) => setNewApp({ ...newApp, company: e.target.value })}
              placeholder="Company"
              style={inputStyle}
            />
            <input
              value={newApp.role}
              onChange={(e) => setNewApp({ ...newApp, role: e.target.value })}
              placeholder="Role"
              style={inputStyle}
            />
            <input
              value={newApp.notes}
              onChange={(e) => setNewApp({ ...newApp, notes: e.target.value })}
              placeholder="Notes"
              style={inputStyle}
            />
            <button
              onClick={addApplication}
              disabled={!newApp.company.trim() || !newApp.role.trim()}
              style={{
                padding: '11px 18px',
                borderRadius: '10px',
                background:
                  newApp.company.trim() && newApp.role.trim()
                    ? `linear-gradient(135deg,${GOLD},#e8c96a)`
                    : 'rgba(255,255,255,0.05)',
                border: 'none',
                color:
                  newApp.company.trim() && newApp.role.trim()
                    ? '#1a1a1a'
                    : 'rgba(240,236,230,0.25)',
                fontWeight: 700,
                fontSize: '13px',
                cursor:
                  newApp.company.trim() && newApp.role.trim() ? 'pointer' : 'not-allowed',
                fontFamily: 'inherit',
              }}
            >
              + Add
            </button>
          </div>

          {loading ? (
            <div style={{ color: 'rgba(240,236,230,0.2)', fontSize: '14px' }}>Loading…</div>
          ) : applications.length === 0 ? (
            <div
              style={{
                color: 'rgba(240,236,230,0.22)',
                textAlign: 'center',
                padding: '26px',
                fontSize: '14px',
              }}
            >
              No applications tracked yet.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '620px' }}>
                <thead>
                  <tr>
                    {['Company', 'Role', 'Status', 'Applied', 'Fit', 'Notes'].map((h) => (
                      <th
                        key={h}
                        style={{
                          textAlign: 'left',
                          fontSize: '10px',
                          letterSpacing: '1.5px',
                          color: 'rgba(240,236,230,0.28)',
                          textTransform: 'uppercase',
                          padding: '8px 10px 8px 0',
                          borderBottom: '1px solid rgba(255,255,255,0.06)',
                          fontWeight: 600,
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {applications.map((a) => (
                    <tr key={a.id}>
                      <td style={{ padding: '11px 10px 11px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '13.5px' }}>
                        {a.company}
                      </td>
                      <td style={{ padding: '11px 10px 11px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '13.5px', color: 'rgba(240,236,230,0.7)' }}>
                        {a.role}
                      </td>
                      <td style={{ padding: '11px 10px 11px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <select
                          value={a.status}
                          onChange={(e) => updateStatus(a.id, e.target.value)}
                          style={{
                            background: 'rgba(255,255,255,0.04)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '100px',
                            color: STATUS_COLOR[a.status],
                            padding: '4px 10px',
                            fontSize: '12px',
                            fontFamily: 'inherit',
                            cursor: 'pointer',
                          }}
                        >
                          {STATUSES.map((s) => (
                            <option key={s} value={s} style={{ background: '#1a1a1a' }}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={{ padding: '11px 10px 11px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '12.5px', color: 'rgba(240,236,230,0.4)' }}>
                        {a.date_applied}
                      </td>
                      <td style={{ padding: '11px 10px 11px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '12.5px', color: GOLD }}>
                        {a.fit_score != null ? `${a.fit_score}%` : '—'}
                      </td>
                      <td style={{ padding: '11px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '12.5px', color: 'rgba(240,236,230,0.4)', maxWidth: '220px' }}>
                        {a.notes || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </main>
    </div>
  );
}
