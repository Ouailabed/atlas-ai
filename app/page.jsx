"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ── PERSISTENT CANVAS ENGINE ─────────────────────────────────────────────────
function useCanvas() {
  const canvasRef = useRef(null);
  const stateRef = useRef({
    particles: [],
    nodes: [],
    connections: [],
    mouse: { x: -9999, y: -9999 },
    time: 0,
    width: 0,
    height: 0,
    animId: null,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const S = stateRef.current;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = document.documentElement.scrollHeight;
      S.width = canvas.width;
      S.height = canvas.height;
      init();
    };

    const init = () => {
      // Particles
      S.particles = Array.from({ length: 180 }, () => ({
        x: Math.random() * S.width,
        y: Math.random() * S.height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r: Math.random() * 1.5 + 0.3,
        opacity: Math.random() * 0.4 + 0.1,
        color: ["#00e5ff", "#7c3aed", "#14f195"][Math.floor(Math.random() * 3)],
        originalX: 0,
        originalY: 0,
      }));
      S.particles.forEach(p => { p.originalX = p.x; p.originalY = p.y; });

      // Neural nodes
      S.nodes = Array.from({ length: 40 }, () => ({
        x: Math.random() * S.width,
        y: Math.random() * S.height,
        vx: (Math.random() - 0.5) * 0.15,
        vy: (Math.random() - 0.5) * 0.15,
        r: Math.random() * 3 + 1,
        pulse: Math.random() * Math.PI * 2,
        pulseSpeed: 0.02 + Math.random() * 0.03,
      }));
    };

    const onMouseMove = (e) => {
      S.mouse.x = e.clientX;
      S.mouse.y = e.clientY + window.scrollY;
    };

    const draw = () => {
      S.time += 0.008;
      ctx.clearRect(0, 0, S.width, S.height);

      // Background gradient
      const grad = ctx.createRadialGradient(
        S.width * 0.5, S.height * 0.15, 0,
        S.width * 0.5, S.height * 0.15, S.width * 0.7
      );
      grad.addColorStop(0, "rgba(0,229,255,0.025)");
      grad.addColorStop(0.5, "rgba(124,58,237,0.015)");
      grad.addColorStop(1, "rgba(3,7,18,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, S.width, S.height);

      // Neural network nodes
      S.nodes.forEach(n => {
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 0 || n.x > S.width) n.vx *= -1;
        if (n.y < 0 || n.y > S.height) n.vy *= -1;
        n.pulse += n.pulseSpeed;
        const glow = 0.3 + Math.sin(n.pulse) * 0.2;

        // Draw node
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,229,255,${glow})`;
        ctx.fill();

        // Glow ring
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r * 3, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(0,229,255,${glow * 0.15})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      });

      // Neural connections
      S.nodes.forEach((a, i) => {
        S.nodes.slice(i + 1).forEach(b => {
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 200) {
            const alpha = (1 - dist / 200) * 0.12;
            // Animated data pulse
            const pulsePos = (S.time * 0.5) % 1;
            const px = a.x + (b.x - a.x) * pulsePos;
            const py = a.y + (b.y - a.y) * pulsePos;

            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = `rgba(0,229,255,${alpha})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();

            // Data pulse dot
            if (dist < 150) {
              ctx.beginPath();
              ctx.arc(px, py, 1.5, 0, Math.PI * 2);
              ctx.fillStyle = `rgba(0,229,255,${alpha * 3})`;
              ctx.fill();
            }
          }
        });
      });

      // Particles with mouse gravity
      S.particles.forEach(p => {
        // Mouse gravity
        const mdx = S.mouse.x - p.x;
        const mdy = S.mouse.y - p.y;
        const mdist = Math.sqrt(mdx * mdx + mdy * mdy);
        if (mdist < 150) {
          const force = (150 - mdist) / 150;
          p.vx += (mdx / mdist) * force * 0.08;
          p.vy += (mdy / mdist) * force * 0.08;
        }

        // Damping
        p.vx *= 0.97;
        p.vy *= 0.97;

        // Base movement
        p.x += p.vx + Math.sin(S.time + p.r) * 0.2;
        p.y += p.vy + Math.cos(S.time * 0.7 + p.r) * 0.15;

        // Wrap
        if (p.x < -10) p.x = S.width + 10;
        if (p.x > S.width + 10) p.x = -10;
        if (p.y < -10) p.y = S.height + 10;
        if (p.y > S.height + 10) p.y = -10;

        // Draw
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color.replace(")", `,${p.opacity})`).replace("rgb", "rgba").replace("#00e5ff", "rgba(0,229,255,").replace("#7c3aed", "rgba(124,58,237,").replace("#14f195", "rgba(20,241,149,");

        // Simpler approach
        const c = p.color === "#00e5ff" ? `rgba(0,229,255,${p.opacity})` :
                  p.color === "#7c3aed" ? `rgba(124,58,237,${p.opacity})` :
                  `rgba(20,241,149,${p.opacity})`;
        ctx.fillStyle = c;
        ctx.fill();

        // Connect nearby particles
        S.particles.forEach(b => {
          const dx = p.x - b.x;
          const dy = p.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 80 && dist > 0) {
            const alpha = (1 - dist / 80) * 0.15;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = `rgba(0,229,255,${alpha})`;
            ctx.lineWidth = 0.3;
            ctx.stroke();
          }
        });
      });

      // Breathe effect — subtle radial pulse
      const breathe = 0.5 + Math.sin(S.time * 0.5) * 0.5;
      const bgrad = ctx.createRadialGradient(
        S.width * 0.5, window.scrollY + window.innerHeight * 0.4, 0,
        S.width * 0.5, window.scrollY + window.innerHeight * 0.4, 300 + breathe * 100
      );
      bgrad.addColorStop(0, `rgba(0,229,255,${0.03 * breathe})`);
      bgrad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = bgrad;
      ctx.fillRect(0, 0, S.width, S.height);

      S.animId = requestAnimationFrame(draw);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("resize", resize);
    resize();
    draw();

    return () => {
      cancelAnimationFrame(S.animId);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return canvasRef;
}

// ── TYPEWRITER ────────────────────────────────────────────────────────────────
function useTypewriter(phrases, speed = 60) {
  const [display, setDisplay] = useState("");
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (done) return;
    const current = phrases[phraseIdx];

    const timeout = setTimeout(() => {
      if (!deleting) {
        if (charIdx < current.length) {
          setDisplay(current.slice(0, charIdx + 1));
          setCharIdx(c => c + 1);
        } else {
          if (phraseIdx === phrases.length - 1) { setDone(true); return; }
          setTimeout(() => setDeleting(true), 1200);
        }
      } else {
        if (charIdx > 0) {
          setDisplay(current.slice(0, charIdx - 1));
          setCharIdx(c => c - 1);
        } else {
          setDeleting(false);
          setPhraseIdx(i => i + 1);
        }
      }
    }, deleting ? 30 : speed);

    return () => clearTimeout(timeout);
  }, [charIdx, deleting, phraseIdx, done, phrases, speed]);

  return { display, done };
}

// ── AI CONVERSATION SIMULATOR ─────────────────────────────────────────────────
const conversations = {
  0: [ // Student
    { role: "user", text: "Find me AI internships in London" },
    { role: "odin", text: "Found 14 matches. Top pick: DeepMind Research Intern, £28k. Rewriting your CV now..." },
    { role: "odin", text: "✓ CV optimised for DeepMind. Cover letter generated. Submit?" },
    { role: "user", text: "Yes, submit all 14" },
    { role: "odin", text: "✓ 14 applications submitted. First interview likely within 72 hours." },
  ],
  1: [ // Freelancer
    { role: "user", text: "Chase up client payment from 2 weeks ago" },
    { role: "odin", text: "Found invoice #247 — £3,200 overdue. Drafting professional follow-up..." },
    { role: "odin", text: "Email sent to client. Also: 3 new project leads match your profile." },
  ],
  2: [ // Trader
    { role: "user", text: "Morning briefing" },
    { role: "odin", text: "BTC +4.2% overnight. ETH breaking resistance at $3,450. Your portfolio: +£840." },
    { role: "odin", text: "Fed meeting at 2PM — historically causes 2.3% volatility. Reduce exposure?" },
  ],
  3: [ // Restaurant
    { role: "user", text: "What's happening today?" },
    { role: "odin", text: "Vegetable supplier delayed until 4PM. 3 dishes affected. Notifying kitchen now." },
    { role: "odin", text: "✓ Chef notified. Backup supplier ordered. 97% capacity for lunch service." },
  ],
  4: [ // Executive
    { role: "user", text: "Prepare for my 3PM board meeting" },
    { role: "odin", text: "Pulling Q2 data, team KPIs, and competitor analysis..." },
    { role: "odin", text: "✓ 12-slide briefing ready. Key risk: Q3 runway 18% below target." },
  ],
};

export default function Home() {
  const canvasRef = useCanvas();
  const [activeProfile, setActiveProfile] = useState(0);
  const [visibleMessages, setVisibleMessages] = useState([]);
  const [showAIMessage, setShowAIMessage] = useState(false);
  const [scrollY, setScrollY] = useState(0);

  const headlines = [
    "Runs Your Life",
    "Never Sleeps",
    "Knows Your Calendar",
    "Finds You Jobs",
    "Runs Your Life",
  ];
  const { display: headline, done: headlineDone } = useTypewriter(headlines, 55);

  // Simulate conversation
  useEffect(() => {
    setVisibleMessages([]);
    const msgs = conversations[activeProfile];
    msgs.forEach((msg, i) => {
      setTimeout(() => {
        setVisibleMessages(prev => [...prev, msg]);
      }, i * 900);
    });
  }, [activeProfile]);

  // AI notices you after 20s
  useEffect(() => {
    const timer = setTimeout(() => setShowAIMessage(true), 20000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const profiles = [
    { icon: "🎓", label: "Student" },
    { icon: "💻", label: "Freelancer" },
    { icon: "📈", label: "Trader" },
    { icon: "🍽️", label: "Restaurant" },
    { icon: "👔", label: "Executive" },
  ];

  const features = [
    { icon: "🎙️", title: "Voice-First AI", desc: "Talk naturally. Odin understands context, tone, and intent like a real human.", color: "#00e5ff" },
    { icon: "📧", title: "Email Intelligence", desc: "Reads, prioritises, drafts and sends emails. Flags what matters. Ignores what doesn't.", color: "#7c3aed" },
    { icon: "📅", title: "Calendar Mastery", desc: "Books meetings, blocks focus time, detects conflicts, optimises your week.", color: "#14f195" },
    { icon: "💼", title: "Job Applications", desc: "Finds roles, rewrites your CV for each one, submits while you sleep.", color: "#00e5ff" },
    { icon: "📊", title: "Finance Monitor", desc: "Tracks wallets, spending, and portfolios 24/7. Alerts before problems.", color: "#7c3aed" },
    { icon: "⚡", title: "Autonomous Chains", desc: "One command. Ten automatic actions. True autonomy, finally.", color: "#14f195" },
  ];

  return (
    <main style={{ background: "#030712", color: "white", fontFamily: "'Segoe UI', sans-serif", overflowX: "hidden", position: "relative" }}>

      {/* PERSISTENT CANVAS — behind everything */}
      <canvas ref={canvasRef} style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", zIndex: 0, pointerEvents: "none" }} />

      {/* AI NOTICES YOU */}
      <AnimatePresence>
        {showAIMessage && (
          <motion.div
            initial={{ opacity: 0, y: 20, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: 20, x: "-50%" }}
            style={{ position: "fixed", bottom: "32px", left: "50%", zIndex: 1000, background: "rgba(0,229,255,0.08)", border: "1px solid rgba(0,229,255,0.25)", borderRadius: "999px", padding: "14px 32px", backdropFilter: "blur(20px)", display: "flex", alignItems: "center", gap: "12px", cursor: "pointer" }}
            onClick={() => setShowAIMessage(false)}>
            <motion.div animate={{ scale: [1, 1.3, 1] }} transition={{ duration: 1.5, repeat: Infinity }}
              style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#00e5ff" }} />
            <span style={{ color: "#00e5ff", fontSize: "14px", fontWeight: "600" }}>
              You've been exploring for a while. Ready to start?
            </span>
            <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "12px" }}>✕</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div style={{ position: "relative", zIndex: 1 }}>

        {/* ── NAV ── */}
        <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 72px", position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, backdropFilter: "blur(24px)", background: "rgba(3,7,18,0.75)", borderBottom: "1px solid rgba(0,229,255,0.05)" }}>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
            style={{ fontSize: "16px", fontWeight: "900", letterSpacing: "10px", background: "linear-gradient(90deg, #00e5ff, #7c3aed, #14f195)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            ODIN
          </motion.div>
          <div style={{ display: "flex", gap: "48px" }}>
            {["Features", "Who it's for", "Pricing"].map((item, i) => (
              <motion.a key={item} initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 + i * 0.1 }}
                href="#" style={{ color: "rgba(255,255,255,0.35)", textDecoration: "none", fontSize: "12px", letterSpacing: "2px", textTransform: "uppercase", transition: "color 0.2s" }}
                onMouseEnter={e => e.target.style.color = "#00e5ff"}
                onMouseLeave={e => e.target.style.color = "rgba(255,255,255,0.35)"}>
                {item}
              </motion.a>
            ))}
          </div>
          <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }}
            style={{ background: "transparent", color: "#00e5ff", border: "1px solid rgba(0,229,255,0.3)", padding: "10px 28px", borderRadius: "6px", cursor: "pointer", fontWeight: "700", fontSize: "12px", letterSpacing: "3px", transition: "all 0.3s" }}
            whileHover={{ background: "rgba(0,229,255,0.08)", boxShadow: "0 0 30px rgba(0,229,255,0.2)" }}>
            GET ACCESS
          </motion.button>
        </nav>

        {/* ── HERO ── */}
        <section style={{ minHeight: "100vh", display: "flex", alignItems: "center", padding: "0 72px", paddingTop: "80px", position: "relative" }}>

          {/* LEFT — Text */}
          <div style={{ flex: 1, maxWidth: "620px" }}>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
              style={{ display: "inline-flex", alignItems: "center", gap: "10px", background: "rgba(0,229,255,0.05)", border: "1px solid rgba(0,229,255,0.12)", borderRadius: "999px", padding: "8px 20px", marginBottom: "40px" }}>
              <motion.span animate={{ opacity: [1, 0.2, 1] }} transition={{ duration: 1.5, repeat: Infinity }}
                style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#00e5ff", display: "inline-block" }} />
              <span style={{ color: "#00e5ff", fontSize: "11px", letterSpacing: "3px", textTransform: "uppercase" }}>Private Beta · Limited Access</span>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
              <div style={{ fontSize: "clamp(52px, 7vw, 88px)", fontWeight: "900", lineHeight: "1.04", letterSpacing: "-3px", marginBottom: "28px" }}>
                <div style={{ color: "white" }}>The AI That</div>
                <div style={{ background: "linear-gradient(135deg, #00e5ff 0%, #7c3aed 50%, #14f195 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", minHeight: "1.1em", filter: "drop-shadow(0 0 40px rgba(0,229,255,0.4))" }}>
                  {headline}
                  <motion.span animate={{ opacity: [1, 0] }} transition={{ duration: 0.5, repeat: Infinity }} style={{ color: "#00e5ff" }}>|</motion.span>
                </div>
              </div>
            </motion.div>

            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}
              style={{ fontSize: "18px", color: "rgba(203,213,225,0.55)", maxWidth: "480px", lineHeight: "1.9", marginBottom: "52px", fontWeight: "300" }}>
              Odin is a fully autonomous AI operating system. Voice-first. Always on. It handles your emails, calendar, jobs, finances, and decisions — while you live your life.
            </motion.p>

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1 }}
              style={{ display: "flex", gap: "16px", flexWrap: "wrap", marginBottom: "32px" }}>
              <motion.button whileHover={{ scale: 1.04, boxShadow: "0 0 60px rgba(0,229,255,0.4)" }} whileTap={{ scale: 0.97 }}
                style={{ background: "linear-gradient(135deg, #00e5ff, #7c3aed)", color: "white", border: "none", padding: "17px 48px", borderRadius: "8px", fontSize: "14px", cursor: "pointer", fontWeight: "800", letterSpacing: "3px", boxShadow: "0 0 40px rgba(0,229,255,0.2)" }}>
                JOIN WAITLIST
              </motion.button>
              <motion.button whileHover={{ borderColor: "rgba(255,255,255,0.2)", color: "white" }} whileTap={{ scale: 0.97 }}
                style={{ background: "rgba(255,255,255,0.02)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.07)", padding: "17px 44px", borderRadius: "8px", fontSize: "14px", cursor: "pointer", backdropFilter: "blur(10px)", letterSpacing: "1px", transition: "all 0.3s" }}>
                ▶ Watch Demo
              </motion.button>
            </motion.div>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }}
              style={{ color: "rgba(255,255,255,0.12)", fontSize: "11px", letterSpacing: "3px", textTransform: "uppercase" }}>
              No credit card · Limited beta spots
            </motion.p>
          </div>

          {/* RIGHT — Live AI Demo */}
          <motion.div initial={{ opacity: 0, x: 60 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.8, duration: 0.9 }}
            style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center" }}>
            <div style={{ width: "100%", maxWidth: "460px" }}>

              {/* Profile selector */}
              <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
                {profiles.map((p, i) => (
                  <button key={p.label} onClick={() => setActiveProfile(i)}
                    style={{ background: activeProfile === i ? "rgba(0,229,255,0.12)" : "rgba(255,255,255,0.03)", border: `1px solid ${activeProfile === i ? "rgba(0,229,255,0.4)" : "rgba(255,255,255,0.06)"}`, borderRadius: "8px", padding: "8px 14px", color: activeProfile === i ? "#00e5ff" : "rgba(255,255,255,0.4)", fontSize: "12px", cursor: "pointer", transition: "all 0.2s", fontWeight: activeProfile === i ? "700" : "400" }}>
                    {p.icon} {p.label}
                  </button>
                ))}
              </div>

              {/* Chat window */}
              <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(0,229,255,0.1)", borderRadius: "16px", padding: "24px", backdropFilter: "blur(30px)", boxShadow: "0 0 80px rgba(0,229,255,0.05), inset 0 1px 0 rgba(255,255,255,0.05)", minHeight: "280px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px", paddingBottom: "16px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                  <motion.div animate={{ scale: [1, 1.2, 1], boxShadow: ["0 0 0 0 rgba(0,229,255,0.4)", "0 0 0 8px rgba(0,229,255,0)", "0 0 0 0 rgba(0,229,255,0)"] }} transition={{ duration: 2, repeat: Infinity }}
                    style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#00e5ff" }} />
                  <span style={{ color: "rgba(255,255,255,0.5)", fontSize: "12px", letterSpacing: "2px" }}>ODIN · ACTIVE</span>
                </div>

                <AnimatePresence mode="popLayout">
                  {visibleMessages.map((msg, i) => (
                    <motion.div key={`${activeProfile}-${i}`}
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ duration: 0.3 }}
                      style={{ marginBottom: "12px", display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
                      <div style={{
                        maxWidth: "85%",
                        padding: "10px 16px",
                        borderRadius: msg.role === "user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                        background: msg.role === "user" ? "rgba(124,58,237,0.2)" : "rgba(0,229,255,0.07)",
                        border: `1px solid ${msg.role === "user" ? "rgba(124,58,237,0.3)" : "rgba(0,229,255,0.15)"}`,
                        color: msg.role === "user" ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.9)",
                        fontSize: "13px",
                        lineHeight: "1.5",
                      }}>
                        {msg.text}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>

          {/* Scroll indicator */}
          <motion.div animate={{ y: [0, 10, 0] }} transition={{ duration: 2, repeat: Infinity }}
            style={{ position: "absolute", bottom: "40px", left: "50%", transform: "translateX(-50%)", display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", color: "rgba(255,255,255,0.12)", fontSize: "10px", letterSpacing: "3px" }}>
            <span>SCROLL</span>
            <div style={{ width: "1px", height: "48px", background: "linear-gradient(to bottom, rgba(0,229,255,0.4), transparent)" }} />
          </motion.div>
        </section>

        {/* ── STATS ── */}
        <section style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", borderTop: "1px solid rgba(0,229,255,0.05)", borderBottom: "1px solid rgba(0,229,255,0.05)", background: "rgba(0,0,0,0.4)", backdropFilter: "blur(30px)" }}>
          {[
            { num: "2–4hrs", label: "Saved Every Day" },
            { num: "$300", label: "Starting / Month" },
            { num: "100+", label: "AI Automations" },
            { num: "24/7", label: "Always Working" },
          ].map((s, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
              style={{ textAlign: "center", padding: "56px 72px", borderRight: i < 3 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
              <div style={{ fontSize: "52px", fontWeight: "900", background: "linear-gradient(135deg, #00e5ff, #7c3aed)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", filter: "drop-shadow(0 0 20px rgba(0,229,255,0.3))" }}>{s.num}</div>
              <div style={{ color: "rgba(255,255,255,0.25)", marginTop: "8px", fontSize: "11px", letterSpacing: "4px", textTransform: "uppercase" }}>{s.label}</div>
            </motion.div>
          ))}
        </section>

        {/* ── FEATURES ── */}
        <section style={{ padding: "160px 72px", maxWidth: "1280px", margin: "0 auto" }}>
          <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <p style={{ color: "#00e5ff", textAlign: "center", letterSpacing: "6px", fontSize: "11px", textTransform: "uppercase", marginBottom: "16px" }}>CAPABILITIES</p>
            <h2 style={{ fontSize: "clamp(40px, 5vw, 64px)", fontWeight: "900", textAlign: "center", marginBottom: "100px", letterSpacing: "-2px" }}>
              Everything.<br />
              <span style={{ background: "linear-gradient(135deg, #00e5ff, #7c3aed)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Automated.</span>
            </h2>
          </motion.div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: "2px", borderRadius: "24px", overflow: "hidden", border: "1px solid rgba(0,229,255,0.06)" }}>
            {features.map((f, i) => (
              <motion.div key={i}
                initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }} transition={{ delay: i * 0.08 }}
                style={{ background: "#070d1b", padding: "48px", position: "relative", overflow: "hidden", cursor: "default", transition: "background 0.4s" }}
                onMouseEnter={e => e.currentTarget.style.background = "#0d1628"}
                onMouseLeave={e => e.currentTarget.style.background = "#070d1b"}>
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "1px", background: `linear-gradient(90deg, transparent, ${f.color}50, transparent)` }} />
                <div style={{ fontSize: "40px", marginBottom: "24px" }}>{f.icon}</div>
                <div style={{ width: "24px", height: "2px", background: f.color, marginBottom: "20px", borderRadius: "2px" }} />
                <h3 style={{ fontSize: "20px", fontWeight: "700", marginBottom: "14px", color: "rgba(255,255,255,0.9)" }}>{f.title}</h3>
                <p style={{ color: "rgba(203,213,225,0.4)", lineHeight: "1.8", fontSize: "14px" }}>{f.desc}</p>
                <div style={{ position: "absolute", bottom: "-30px", right: "-30px", width: "100px", height: "100px", background: `radial-gradient(circle, ${f.color}12 0%, transparent 70%)`, borderRadius: "50%" }} />
              </motion.div>
            ))}
          </div>
        </section>

        {/* ── LIVE DEMO SECTION ── */}
        <section style={{ padding: "160px 72px", position: "relative" }}>
          <div style={{ maxWidth: "1100px", margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "80px", alignItems: "center" }}>
            <motion.div initial={{ opacity: 0, x: -40 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.8 }}>
              <p style={{ color: "#14f195", letterSpacing: "6px", fontSize: "11px", textTransform: "uppercase", marginBottom: "16px" }}>SEE IT WORK</p>
              <h2 style={{ fontSize: "clamp(36px, 4vw, 52px)", fontWeight: "900", marginBottom: "24px", letterSpacing: "-2px", lineHeight: "1.1" }}>
                Watch Odin<br />
                <span style={{ background: "linear-gradient(135deg, #14f195, #00e5ff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>work in real time</span>
              </h2>
              <p style={{ color: "rgba(203,213,225,0.45)", lineHeight: "1.8", fontSize: "16px", marginBottom: "40px" }}>
                Every profile gets a completely different experience. Select your role and watch Odin handle real tasks — live, right now.
              </p>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {profiles.map((p, i) => (
                  <motion.button key={p.label} onClick={() => setActiveProfile(i)}
                    whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                    style={{ background: activeProfile === i ? "rgba(20,241,149,0.1)" : "rgba(255,255,255,0.02)", border: `1px solid ${activeProfile === i ? "rgba(20,241,149,0.4)" : "rgba(255,255,255,0.06)"}`, borderRadius: "8px", padding: "10px 18px", color: activeProfile === i ? "#14f195" : "rgba(255,255,255,0.45)", fontSize: "13px", cursor: "pointer", transition: "all 0.2s", fontWeight: activeProfile === i ? "700" : "400" }}>
                    {p.icon} {p.label}
                  </motion.button>
                ))}
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, x: 40 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.8 }}>
              <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(20,241,149,0.1)", borderRadius: "20px", padding: "28px", backdropFilter: "blur(30px)", boxShadow: "0 0 80px rgba(20,241,149,0.04)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "24px", paddingBottom: "16px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                  <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 2, repeat: Infinity }}
                    style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#14f195" }} />
                  <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "11px", letterSpacing: "2px" }}>ODIN · {profiles[activeProfile].label.toUpperCase()} MODE</span>
                </div>

                <AnimatePresence mode="popLayout">
                  {visibleMessages.map((msg, i) => (
                    <motion.div key={`demo-${activeProfile}-${i}`}
                      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      transition={{ duration: 0.4 }}
                      style={{ marginBottom: "14px", display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
                      {msg.role === "odin" && (
                        <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: "linear-gradient(135deg, #00e5ff, #7c3aed)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", marginRight: "10px", flexShrink: 0, alignSelf: "flex-end" }}>⚡</div>
                      )}
                      <div style={{ maxWidth: "80%", padding: "12px 18px", borderRadius: msg.role === "user" ? "14px 14px 2px 14px" : "14px 14px 14px 2px", background: msg.role === "user" ? "rgba(124,58,237,0.15)" : "rgba(20,241,149,0.06)", border: `1px solid ${msg.role === "user" ? "rgba(124,58,237,0.25)" : "rgba(20,241,149,0.15)"}`, color: "rgba(255,255,255,0.85)", fontSize: "13px", lineHeight: "1.6" }}>
                        {msg.text}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </motion.div>
          </div>
        </section>

        {/* ── PRICING ── */}
        <section style={{ padding: "160px 72px", maxWidth: "960px", margin: "0 auto" }}>
          <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <p style={{ color: "#7c3aed", textAlign: "center", letterSpacing: "6px", fontSize: "11px", textTransform: "uppercase", marginBottom: "16px" }}>PRICING</p>
            <h2 style={{ fontSize: "clamp(40px, 5vw, 64px)", fontWeight: "900", textAlign: "center", marginBottom: "16px", letterSpacing: "-2px" }}>Less Than a VA.</h2>
            <p style={{ color: "rgba(203,213,225,0.35)", textAlign: "center", marginBottom: "80px", fontSize: "17px" }}>Human assistants cost $2,000/mo. Odin starts at $299.</p>
          </motion.div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "24px" }}>
            {[
              { name: "PRO", price: "$299", color: "#7c3aed", features: ["Voice AI assistant", "Email & calendar automation", "Job application system", "CV optimisation per role", "5,000 AI actions / month"], highlight: false },
              { name: "ELITE", price: "$499", color: "#00e5ff", features: ["Everything in Pro", "Finance & crypto vault", "Wallet monitoring & alerts", "Unlimited AI actions", "Priority support"], highlight: true },
            ].map((plan, i) => (
              <motion.div key={plan.name}
                initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }} transition={{ delay: i * 0.15 }}
                whileHover={{ y: -10, boxShadow: `0 30px 80px rgba(0,229,255,0.1)` }}
                style={{ background: plan.highlight ? "linear-gradient(135deg, rgba(0,229,255,0.05), rgba(124,58,237,0.08))" : "rgba(255,255,255,0.02)", border: `1px solid ${plan.highlight ? "rgba(0,229,255,0.2)" : "rgba(255,255,255,0.05)"}`, borderRadius: "20px", padding: "56px 48px", position: "relative", overflow: "hidden", backdropFilter: "blur(20px)", transition: "all 0.4s" }}>
                {plan.highlight && <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", background: "linear-gradient(90deg, #7c3aed, #00e5ff)", borderRadius: "0 0 12px 12px", padding: "7px 24px", fontSize: "10px", fontWeight: "800", letterSpacing: "3px", whiteSpace: "nowrap" }}>MOST POPULAR</div>}
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "1px", background: `linear-gradient(90deg, transparent, ${plan.color}, transparent)` }} />
                <div style={{ fontSize: "11px", letterSpacing: "5px", color: "rgba(255,255,255,0.2)", marginBottom: "24px", marginTop: plan.highlight ? "24px" : "0" }}>{plan.name}</div>
                <div style={{ fontSize: "72px", fontWeight: "900", lineHeight: 1, marginBottom: "4px", background: `linear-gradient(135deg, white, ${plan.color})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", filter: `drop-shadow(0 0 20px ${plan.color}60)` }}>{plan.price}</div>
                <div style={{ color: "rgba(255,255,255,0.15)", fontSize: "12px", marginBottom: "48px", letterSpacing: "3px" }}>PER MONTH</div>
                <ul style={{ listStyle: "none", padding: 0, marginBottom: "48px" }}>
                  {plan.features.map(f => (
                    <li key={f} style={{ color: "rgba(203,213,225,0.5)", marginBottom: "18px", fontSize: "14px", display: "flex", alignItems: "center", gap: "14px" }}>
                      <span style={{ color: plan.color }}>✓</span> {f}
                    </li>
                  ))}
                </ul>
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  style={{ width: "100%", background: plan.highlight ? "linear-gradient(135deg, #7c3aed, #00e5ff)" : "transparent", color: "white", border: `1px solid ${plan.highlight ? "transparent" : "rgba(255,255,255,0.08)"}`, padding: "18px", borderRadius: "10px", fontSize: "13px", cursor: "pointer", fontWeight: "800", letterSpacing: "3px", boxShadow: plan.highlight ? "0 0 40px rgba(0,229,255,0.2)" : "none" }}>
                  GET STARTED
                </motion.button>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ── CTA ── */}
        <section style={{ textAlign: "center", padding: "160px 48px", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at center, rgba(0,229,255,0.04) 0%, transparent 60%)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "1px", background: "linear-gradient(90deg, transparent, rgba(0,229,255,0.3), transparent)" }} />
          <motion.div initial={{ opacity: 0, y: 50 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.9 }}>
            <p style={{ color: "rgba(255,255,255,0.15)", letterSpacing: "6px", fontSize: "11px", textTransform: "uppercase", marginBottom: "32px" }}>THE FUTURE IS NOW</p>
            <h2 style={{ fontSize: "clamp(48px, 8vw, 96px)", fontWeight: "900", marginBottom: "28px", letterSpacing: "-4px", lineHeight: "1.02" }}>
              Stop managing.<br />
              <span style={{ background: "linear-gradient(135deg, #00e5ff 0%, #7c3aed 50%, #14f195 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", filter: "drop-shadow(0 0 40px rgba(0,229,255,0.4))" }}>
                Start living.
              </span>
            </h2>
            <p style={{ color: "rgba(203,213,225,0.25)", fontSize: "17px", marginBottom: "60px" }}>Join the waitlist. Be first when Odin launches.</p>
            <motion.button whileHover={{ scale: 1.04, boxShadow: "0 0 80px rgba(0,229,255,0.5)" }} whileTap={{ scale: 0.97 }}
              style={{ background: "linear-gradient(135deg, #00e5ff, #7c3aed)", color: "white", border: "none", padding: "22px 80px", borderRadius: "10px", fontSize: "16px", cursor: "pointer", fontWeight: "800", letterSpacing: "4px", boxShadow: "0 0 50px rgba(0,229,255,0.25)" }}>
              JOIN FREE WAITLIST
            </motion.button>
            <p style={{ color: "rgba(255,255,255,0.1)", marginTop: "24px", fontSize: "11px", letterSpacing: "2px" }}>NO CREDIT CARD REQUIRED</p>
          </motion.div>
        </section>

        {/* ── FOOTER ── */}
        <footer style={{ textAlign: "center", padding: "40px", color: "rgba(255,255,255,0.1)", borderTop: "1px solid rgba(0,229,255,0.05)", fontSize: "11px", letterSpacing: "3px", textTransform: "uppercase" }}>
          © 2026 Odin AI · Built by Ouail Abed · All Rights Reserved
        </footer>

      </div>
    </main>
  );
}