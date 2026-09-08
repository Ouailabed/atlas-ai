import { AGENTS, liveAgents, plannedAgents } from '@/lib/agents';
import { guard } from '@/lib/rateLimit';

export const runtime = 'nodejs';

/**
 * Which agents are actually connected right now.
 *
 * Computed from the registry plus the environment, so the UI can never drift
 * out of sync with reality — the whole point of the honesty work. Email counts
 * as live only when Gmail OAuth is configured.
 *
 * Public: it exposes no user data, only what this deployment can do.
 */
export async function GET(request) {
  const blocked = guard(request);
  if (blocked) return blocked;

  try {
    const live = liveAgents();
    const planned = plannedAgents();

    return Response.json({
      live: live.map((k) => ({ key: k, name: AGENTS[k].name, description: AGENTS[k].description })),
      planned: planned.map((k) => ({
        key: k,
        name: AGENTS[k].name,
        needs: AGENTS[k].needs || 'configuration',
      })),
      counts: { live: live.length, planned: planned.length, total: Object.keys(AGENTS).length },
    });
  } catch (error) {
    console.error('[agents] GET:', error);
    return Response.json({ error: 'Could not read agent status' }, { status: 500 });
  }
}
