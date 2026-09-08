/**
 * The Atlas agent registry.
 *
 * `status` is the single source of truth for what Atlas may claim to have done:
 *   'implemented' — a real API route exists and performs the action.
 *   'planned'     — no integration exists. Atlas may advise and draft, but must
 *                   NOT claim to have executed anything.
 *
 * Getting this wrong is the most expensive bug in the product: an assistant that
 * says "I've emailed them" when no email was sent is worse than no assistant.
 */

export const AGENTS = {
  // ---- implemented: these have real routes that do real work ----------------
  memory: {
    name: 'Memory Agent',
    status: 'implemented',
    description: 'Stores and recalls long-term facts about you',
    triggers: ['remember', 'forget', 'forgot', 'recall', 'do you know', 'what do you know'],
  },
  tasks: {
    name: 'Tasks Agent',
    status: 'implemented',
    description: 'Captures, prioritises and tracks your todos',
    // Deliberately no 'to do' — it matches "want to do", "have to do", "going to do".
    triggers: ['task', 'tasks', 'todo', 'reminder', 'remind me', 'need to', 'deadline'],
  },
  research: {
    name: 'Research Agent',
    status: 'implemented',
    description: 'Searches the web and summarises findings',
    triggers: ['research', 'look up', 'search for', 'find out', 'what is', 'what are', 'how do i', 'how to', 'tell me about'],
  },
  finance: {
    name: 'Finance Agent',
    status: 'implemented',
    description: 'Tracks income, expenses and invoices',
    triggers: ['spent', 'spend', 'budget', 'expense', 'income', 'invoice', 'finances', 'money', 'paid', 'cost'],
  },
  jobs: {
    name: 'Jobs Agent',
    status: 'implemented',
    description: 'Tailors your CV, writes cover letters, analyses job fit',
    triggers: ['job', 'jobs', 'vacancy', 'application', 'apply', 'cv', 'resume', 'cover letter', 'career', 'internship'],
  },
  news: {
    name: 'News Agent',
    status: 'implemented',
    description: 'Builds a daily briefing on topics you care about',
    triggers: ['news', 'briefing', 'headlines'],
  },
  writing: {
    name: 'Writing Agent',
    status: 'implemented',
    description: 'Drafts emails, posts, reports and letters',
    triggers: ['write', 'draft', 'compose', 'rewrite', 'proofread', 'linkedin post', 'blog post'],
  },
  coach: {
    name: 'Coach Agent',
    status: 'implemented',
    description: 'Talks through goals, habits and decisions',
    triggers: ['goal', 'habit', 'improve', 'advice', 'should i', 'help me decide', 'motivate'],
  },
  // Email is implemented but only *live* when Gmail OAuth is configured.
  // isAgentLive() downgrades it to planned when the credentials are absent.
  email: {
    name: 'Email Agent',
    status: 'implemented',
    requiresEnv: ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN'],
    description: 'Reads your inbox and drafts replies (sending always needs your approval)',
    triggers: ['email', 'emails', 'inbox', 'reply to', 'unread', 'gmail'],
  },

  calendar: {
    name: 'Calendar Agent',
    status: 'implemented',
    requiresEnv: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
    description: 'Reads your schedule and drafts events (creating always needs your approval)',
    triggers: ['calendar', 'meeting', 'schedule', 'appointment', 'book a call', 'agenda', 'free slot', 'availability'],
  },
  contacts: {
    name: 'Contacts Agent',
    status: 'implemented',
    description: 'Remembers people, companies and your relationship to them',
    triggers: ['contact', 'contacts', 'who is', 'phone number', 'my client', 'add note about'],
  },
  invoice: {
    name: 'Invoice Agent',
    status: 'implemented',
    description: 'Raises invoices, tracks what is unpaid and drafts chasers',
    triggers: ['invoice', 'bill', 'chase payment', 'unpaid', 'overdue'],
  },

  // ---- planned: NO integration exists. Advice only. -------------------------
  whatsapp: {
    name: 'WhatsApp Agent',
    status: 'planned',
    needs: 'the WhatsApp Business API',
    description: 'Manages your messages',
    triggers: ['whatsapp', 'text them', 'message them'],
  },
  travel: {
    name: 'Travel Agent',
    status: 'planned',
    needs: 'a flight and hotel booking provider',
    description: 'Books flights and hotels',
    triggers: ['flight', 'flights', 'hotel', 'travel', 'trip', 'holiday'],
  },
  trading: {
    name: 'Trading Agent',
    status: 'planned',
    needs: 'a brokerage or market-data API',
    description: 'Monitors markets and portfolios',
    triggers: ['stock', 'stocks', 'crypto', 'bitcoin', 'portfolio', 'market', 'trade'],
  },
  health: {
    name: 'Health Agent',
    status: 'planned',
    needs: 'Apple Health or Google Fit',
    description: 'Tracks habits and wellbeing',
    triggers: ['health', 'exercise', 'workout', 'sleep', 'diet', 'nutrition'],
  },
  shopping: {
    name: 'Shopping Agent',
    status: 'planned',
    needs: 'a retail price API',
    description: 'Finds deals',
    triggers: ['buy', 'shopping', 'deal', 'discount', 'cheapest'],
  },
  legal: {
    name: 'Legal Agent',
    status: 'planned',
    needs: 'document upload and review tooling',
    description: 'Reviews contracts and flags risks',
    triggers: ['contract', 'legal', 'agreement', 'clause'],
  },
  social: {
    name: 'Social Agent',
    status: 'planned',
    needs: 'LinkedIn or X API access',
    description: 'Manages your social presence',
    triggers: ['linkedin', 'twitter', 'instagram', 'social media'],
  },
  code: {
    name: 'Code Agent',
    status: 'planned',
    needs: 'a repository connection',
    description: 'Reviews and writes code',
    triggers: ['code', 'bug', 'repo', 'pull request', 'refactor'],
  },
};

export const IMPLEMENTED_AGENTS = Object.keys(AGENTS).filter(
  (k) => AGENTS[k].status === 'implemented'
);
export const PLANNED_AGENTS = Object.keys(AGENTS).filter(
  (k) => AGENTS[k].status === 'planned'
);

/**
 * An agent is "live" if it is implemented AND its required env vars are set.
 * Email is implemented in code but useless without Gmail OAuth, so without
 * those credentials it is treated as planned and Atlas will not claim to send.
 */
export function isAgentLive(key) {
  const agent = AGENTS[key];
  if (!agent || agent.status !== 'implemented') return false;
  if (!agent.requiresEnv) return true;
  return agent.requiresEnv.every((v) => Boolean(process.env[v]));
}

export function liveAgents() {
  return IMPLEMENTED_AGENTS.filter(isAgentLive);
}

export function plannedAgents() {
  const downgraded = IMPLEMENTED_AGENTS.filter((k) => !isAgentLive(k));
  return [...PLANNED_AGENTS, ...downgraded];
}

// Precompiled word-boundary matchers.
//
// The original used message.includes(trigger), so 'do' matched "window" and
// "don't", 'time' matched "sometimes", and most messages activated half the
// roster. \b anchors each trigger to real word edges.
const TRIGGER_PATTERNS = Object.fromEntries(
  Object.entries(AGENTS).map(([key, agent]) => [
    key,
    agent.triggers.map((t) => {
      const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Trailing `s?` so a singular trigger still matches its plural —
      // \bmeeting\b alone missed "what meetings do I have". The leading \b
      // keeps the stem anchored, so this does not reintroduce the substring
      // false positives (\bdo s?\b still cannot match "window").
      return new RegExp(`\\b${escaped}s?\\b`, 'i');
    }),
  ])
);

export function routeToAgents(message) {
  if (!message) return ['coach'];
  const activated = [];

  for (const [key, patterns] of Object.entries(TRIGGER_PATTERNS)) {
    if (patterns.some((re) => re.test(message))) activated.push(key);
  }

  // Memory is always in play — it supplies context for every reply.
  if (!activated.includes('memory')) activated.push('memory');

  // If memory was the only match, nothing specific was detected: fall back to coach.
  if (activated.length === 1) activated.push('coach');

  return activated;
}
