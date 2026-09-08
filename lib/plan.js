import { supabaseAdmin } from './supabase';

/**
 * Subscription plans and what they unlock.
 *
 * The original build guide charged $299/$499 but had no notion of a paid user
 * anywhere in the code — checkout created a session and nothing was ever
 * recorded or gated. This module is the gate.
 */
export const PLANS = {
  free: {
    id: 'free',
    label: 'Free',
    dailyMessages: 5,
    priority: false,
  },
  pro: {
    id: 'pro',
    label: 'Atlas Pro',
    priceCents: 29900,
    dailyMessages: Infinity,
    priority: false,
  },
  elite: {
    id: 'elite',
    label: 'Atlas Elite',
    priceCents: 49900,
    dailyMessages: Infinity,
    priority: true,
  },
};

export function planConfig(plan) {
  return PLANS[plan] || PLANS.free;
}

/** The user's plan, defaulting to 'free' if the row or column is missing. */
export async function getUserPlan(userId) {
  if (!supabaseAdmin || !userId) return 'free';
  try {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('plan')
      .eq('id', userId)
      .maybeSingle();
    if (error || !data) return 'free';
    return data.plan || 'free';
  } catch (error) {
    console.error('[plan] getUserPlan failed:', error?.message || error);
    return 'free';
  }
}

/** Messages the user has sent since local midnight. */
export async function countMessagesToday(userId) {
  if (!supabaseAdmin || !userId) return 0;
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  try {
    const { count, error } = await supabaseAdmin
      .from('conversations')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('role', 'user')
      .gte('created_at', startOfDay.toISOString());
    if (error) return 0;
    return count || 0;
  } catch (error) {
    console.error('[plan] countMessagesToday failed:', error?.message || error);
    return 0;
  }
}

/**
 * Can this user send another message right now?
 * @returns {{ allowed: boolean, plan: string, used: number, limit: number, reason?: string }}
 */
export async function checkMessageQuota(userId) {
  const plan = await getUserPlan(userId);
  const config = planConfig(plan);

  if (config.dailyMessages === Infinity) {
    return { allowed: true, plan, used: 0, limit: Infinity };
  }

  const used = await countMessagesToday(userId);
  const allowed = used < config.dailyMessages;

  return {
    allowed,
    plan,
    used,
    limit: config.dailyMessages,
    reason: allowed
      ? undefined
      : `You have used all ${config.dailyMessages} free messages today. Upgrade to Pro for unlimited access, or come back tomorrow.`,
  };
}

/** Update a user's plan. Called from the Stripe webhook. */
export async function setUserPlan(userId, plan, stripeCustomerId) {
  if (!supabaseAdmin) return { ok: false, error: 'Supabase not configured' };
  if (!PLANS[plan]) return { ok: false, error: `Unknown plan: ${plan}` };

  const patch = { plan, updated_at: new Date().toISOString() };
  if (stripeCustomerId) patch.stripe_customer_id = stripeCustomerId;

  const { error } = await supabaseAdmin.from('users').update(patch).eq('id', userId);
  if (error) {
    console.error('[plan] setUserPlan failed:', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
