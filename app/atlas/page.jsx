'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import AtlasNav, { GOLD, BG, CREAM } from '../components/AtlasNav';

const SUGGESTIONS = [
  "What's worth focusing on today?",
  'Find me AI internships in London',
  'I spent £45 on lunch',
  'Research the latest AI tools',
  'Write a LinkedIn post about AI',
  'Remind me to prepare for Thursday',
];

/**
 * Speech synthesis, fixed.
 *
 * Three bugs in the original:
 *   1. speak() fired on the first assistant message, before any user gesture —
 *      browsers block that, and Chrome can wedge the whole queue when it happens.
 *      voiceReady only becomes true after the user sends a message.
 *   2. getVoices() populates asynchronously, so the voice lookup ran against an
 *      empty array on first load and always missed. Now it listens for
 *      voiceschanged.
 *   3. No try/catch anywhere — a throw inside speak() killed the send handler.
 */
function useSpeech() {
  const [supported, setSupported] = useState(false);
  const voicesRef = useRef([]);

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    setSupported(true);

    const loadVoices = () => {
      try {
        voicesRef.current = window.speechSynthesis.getVoices() || [];
      } catch {
        voicesRef.current = [];
      }
    };

    loadVoices();
    window.speechSynthesis.addEventListener?.('voiceschanged', loadVoices);
    return () => {
      window.speechSynthesis.removeEventListener?.('voiceschanged', loadVoices);
      try {
        window.speechSynthesis.cancel();
      } catch {
        /* ignore */
      }
    };
  }, []);

  const speak = useCallback((text) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();

      const clean = String(text)
        .replace(/\*\*/g, '')
        .replace(/\*/g, '')
        .replace(/#{1,6}\s/g, '')
        .replace(/\[ADD:[^\]]*\]/g, '')
        .replace(/\n{2,}/g, '. ')
        .replace(/\n/g, ', ')
        .slice(0, 500);

      if (!clean.trim()) return;

      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.lang = 'en-GB';
      utterance.rate = 0.95;

      const voices = voicesRef.current;
      const preferred =
        voices.find((v) => v.name.includes('Daniel')) ||
        voices.find((v) => v.name.includes('Google UK English')) ||
        voices.find((v) => v.lang === 'en-GB');
      if (preferred) utterance.voice = preferred;

      utterance.onerror = (e) => console.warn('[speech] utterance error:', e?.error);
      window.speechSynthesis.speak(utterance);
    } catch (error) {
      console.warn('[speech] speak failed:', error?.message || error);
    }
  }, []);

  const stop = useCallback(() => {
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* ignore */
    }
  }, []);

  return { supported, speak, stop };
}

export default function AtlasChat() {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content:
        "I'm Atlas.\n\nI can research things, track tasks and expenses, tailor your CV, and draft writing for you. Some capabilities — calendar, travel, trading — aren't connected yet, and I'll tell you plainly when that's the case rather than pretending otherwise.\n\nWhat do you need?",
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const [voiceReady, setVoiceReady] = useState(false);
  const [listening, setListening] = useState(false);
  const [quota, setQuota] = useState(null);

  const endRef = useRef(null);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);

  const { supported: speechSupported, speak, stop } = useSpeech();

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    try {
      const recognition = new SR();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-GB';
      recognition.onresult = (e) => {
        setInput(e.results[0][0].transcript);
        setListening(false);
      };
      recognition.onerror = () => setListening(false);
      recognition.onend = () => setListening(false);
      recognitionRef.current = recognition;
    } catch (error) {
      console.warn('[speech] recognition unavailable:', error?.message);
    }
  }, []);

  const send = async (text) => {
    const message = (text ?? input).trim();
    if (!message || loading) return;

    // A send is a user gesture — speech is now allowed to play.
    setVoiceReady(true);

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: message }]);
    setLoading(true);

    try {
      const res = await fetch('/api/atlas/orchestrator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      const data = await res.json();

      if (res.status === 401) {
        window.location.href = '/login?redirect=/atlas';
        return;
      }

      if (res.status === 402) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: data.error, isQuota: true },
        ]);
        setQuota({ used: data.used, limit: data.limit, plan: data.plan });
        return;
      }

      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: data.error || 'Something went wrong.', isError: true },
        ]);
        return;
      }

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.response,
          agents: data.agentNames,
          agentStatus: data.agentStatus,
          agentKeys: data.agents,
        },
      ]);
      if (data.quota) setQuota(data.quota);

      if (voiceOn && voiceReady) speak(data.response);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Connection error. Please try again.', isError: true },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const toggleVoice = () => {
    const next = !voiceOn;
    setVoiceOn(next);
    if (!next) stop();
  };

  const toggleListening = () => {
    if (!recognitionRef.current) return;
    try {
      if (listening) {
        recognitionRef.current.stop();
        setListening(false);
      } else {
        recognitionRef.current.start();
        setListening(true);
      }
    } catch (error) {
      console.warn('[speech] recognition toggle failed:', error?.message);
      setListening(false);
    }
  };

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
        @keyframes bounce { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-8px)} }
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-thumb{background:rgba(201,168,76,0.2);border-radius:2px}
        textarea{resize:none}
      `}</style>

      <AtlasNav
        active="/atlas"
        subtitle={
          quota && quota.limit !== null && quota.limit !== Infinity
            ? `${quota.used}/${quota.limit} today`
            : 'CONNECTED'
        }
        right={
          speechSupported && (
            <button
              onClick={toggleVoice}
              aria-pressed={voiceOn}
              title={voiceOn ? 'Voice replies are on' : 'Voice replies are off'}
              style={{
                background: voiceOn ? 'rgba(201,168,76,0.15)' : 'transparent',
                border: `1px solid ${voiceOn ? 'rgba(201,168,76,0.5)' : 'rgba(255,255,255,0.08)'}`,
                color: voiceOn ? GOLD : 'rgba(240,236,230,0.35)',
                padding: '7px 14px',
                borderRadius: '100px',
                cursor: 'pointer',
                fontSize: '12px',
                fontFamily: 'inherit',
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
            >
              {voiceOn ? 'VOICE ON' : 'VOICE OFF'}
            </button>
          )
        }
      />

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '28px 20px',
          maxWidth: '820px',
          width: '100%',
          margin: '0 auto',
        }}
      >
        {messages.length === 1 && (
          <div style={{ marginBottom: '28px' }}>
            <div
              style={{
                color: 'rgba(240,236,230,0.2)',
                fontSize: '10px',
                letterSpacing: '3px',
                textTransform: 'uppercase',
                marginBottom: '14px',
                textAlign: 'center',
              }}
            >
              Try asking
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.07)',
                    color: 'rgba(240,236,230,0.55)',
                    padding: '9px 16px',
                    borderRadius: '100px',
                    fontSize: '13px',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
              marginBottom: '16px',
              alignItems: 'flex-end',
              gap: '10px',
            }}
          >
            {m.role !== 'user' && (
              <div
                style={{
                  width: '30px',
                  height: '30px',
                  borderRadius: '50%',
                  background: `linear-gradient(135deg,${GOLD},#e8c96a)`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '11px',
                  fontWeight: 900,
                  color: '#1a1a1a',
                  flexShrink: 0,
                }}
              >
                A
              </div>
            )}
            <div
              style={{
                maxWidth: '78%',
                padding: '13px 17px',
                borderRadius:
                  m.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                background:
                  m.role === 'user'
                    ? '#1a1a1a'
                    : m.isError
                      ? 'rgba(255,107,107,0.08)'
                      : m.isQuota
                        ? 'rgba(201,168,76,0.08)'
                        : 'rgba(255,255,255,0.05)',
                border:
                  m.role === 'user'
                    ? 'none'
                    : `1px solid ${
                        m.isError
                          ? 'rgba(255,107,107,0.25)'
                          : m.isQuota
                            ? 'rgba(201,168,76,0.3)'
                            : 'rgba(255,255,255,0.07)'
                      }`,
                color: m.role === 'user' ? CREAM : '#e8e4de',
                fontSize: '15px',
                lineHeight: 1.65,
                whiteSpace: 'pre-wrap',
              }}
            >
              {m.content}

              {m.isQuota && (
                <div style={{ marginTop: '12px' }}>
                  <Link
                    href="/dashboard"
                    style={{
                      display: 'inline-block',
                      background: `linear-gradient(135deg,${GOLD},#e8c96a)`,
                      color: '#1a1a1a',
                      padding: '8px 18px',
                      borderRadius: '100px',
                      fontSize: '12px',
                      fontWeight: 700,
                      textDecoration: 'none',
                    }}
                  >
                    See plans
                  </Link>
                </div>
              )}

              {m.agents && (
                <div style={{ marginTop: '10px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {m.agentKeys?.map((key, idx) => {
                    const live = m.agentStatus?.[key] === 'live';
                    return (
                      <span
                        key={key}
                        title={live ? 'Connected and working' : 'Not connected yet — advice only'}
                        style={{
                          fontSize: '10px',
                          color: live ? GOLD : 'rgba(240,236,230,0.4)',
                          background: live ? 'rgba(201,168,76,0.08)' : 'rgba(255,255,255,0.03)',
                          border: `1px solid ${
                            live ? 'rgba(201,168,76,0.25)' : 'rgba(255,255,255,0.08)'
                          }`,
                          padding: '2px 9px',
                          borderRadius: '999px',
                          letterSpacing: '0.5px',
                        }}
                      >
                        {live ? '● ' : '○ '}
                        {m.agents[idx]}
                        {!live ? ' (not connected)' : ''}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px', marginBottom: '16px' }}>
            <div
              style={{
                width: '30px',
                height: '30px',
                borderRadius: '50%',
                background: `linear-gradient(135deg,${GOLD},#e8c96a)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '11px',
                fontWeight: 900,
                color: '#1a1a1a',
              }}
            >
              A
            </div>
            <div
              style={{
                padding: '13px 17px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: '18px 18px 18px 4px',
                display: 'flex',
                gap: '5px',
              }}
            >
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  style={{
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    background: GOLD,
                    animation: `bounce 1.2s ${i * 0.2}s infinite`,
                  }}
                />
              ))}
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div
        style={{
          padding: '16px 20px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(10,8,6,0.95)',
          backdropFilter: 'blur(20px)',
        }}
      >
        <div
          style={{
            maxWidth: '820px',
            margin: '0 auto',
            display: 'flex',
            gap: '10px',
            alignItems: 'flex-end',
          }}
        >
          {recognitionRef.current && (
            <button
              onClick={toggleListening}
              title={listening ? 'Stop listening' : 'Speak your message'}
              style={{
                width: '46px',
                height: '46px',
                borderRadius: '50%',
                flexShrink: 0,
                background: listening ? 'rgba(201,168,76,0.2)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${listening ? 'rgba(201,168,76,0.6)' : 'rgba(255,255,255,0.08)'}`,
                color: listening ? GOLD : 'rgba(240,236,230,0.35)',
                cursor: 'pointer',
                fontSize: '16px',
              }}
            >
              🎙
            </button>
          )}

          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={listening ? 'Listening…' : 'Tell Atlas what you need…'}
            rows={1}
            style={{
              flex: 1,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '22px',
              padding: '13px 18px',
              color: CREAM,
              fontSize: '15px',
              outline: 'none',
              fontFamily: 'inherit',
              lineHeight: 1.5,
              maxHeight: '120px',
              overflowY: 'auto',
            }}
          />

          <button
            onClick={() => send()}
            disabled={!input.trim() || loading}
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '50%',
              flexShrink: 0,
              background:
                input.trim() && !loading
                  ? `linear-gradient(135deg,${GOLD},#e8c96a)`
                  : 'rgba(255,255,255,0.03)',
              border: 'none',
              color: input.trim() && !loading ? '#1a1a1a' : 'rgba(240,236,230,0.15)',
              cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
              fontSize: '18px',
            }}
          >
            →
          </button>
        </div>
        <div
          style={{
            textAlign: 'center',
            marginTop: '10px',
            color: 'rgba(240,236,230,0.15)',
            fontSize: '11px',
          }}
        >
          Enter to send · Shift+Enter for a new line
        </div>
      </div>
    </div>
  );
}
