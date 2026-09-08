import { requireSupabase } from '@/lib/supabase';
import { getSessionUser, getUserId, unauthorized, createSupabaseServerClient } from '@/lib/auth';
import { getUserPlan, countMessagesToday, planConfig } from '@/lib/plan';
import { googleStatus } from '@/lib/google';
import { guard } from '@/lib/rateLimit';

export const runtime = 'nodejs';

const PROFILE_MEMORIES = {
  name: (v) => `The user's name is ${v}`,
  role: (v) => `describes themselves as a ${v}`,
  city: (v) => `based in ${v}`,
  timezone: (v) => `timezone is ${v}`,
};

const TONE_LABELS = ['very formal', 'formal', 'neutral', 'casual', 'very casual'];
const DETAIL_LABELS = ['very brief', 'brief', 'balanced', 'detailed', 'very detailed'];

/** Read current settings for the Settings page. */
export async function GET(request) {
  const blocked = guard(request);
  if (blocked) return blocked;

  try {
    const user = await getSessionUser();
    if (!user) return unauthorized();

    const supabase = requireSupabase();

    const [{ data: profile }, { data: memories }, plan, messagesToday, google] = await Promise.all([
      supabase
        .from('users')
        .select('name, plan, onboarded, briefing_enabled, briefing_hour, created_at')
        .eq('id', user.id)
        .maybeSingle(),
      supabase
        .from('memories')
        .select('id, content, type, tags')
        .eq('user_id', user.id)
        .in('type', ['fact', 'preference'])
        .order('importance', { ascending: false })
        .limit(50),
      getUserPlan(user.id),
      countMessagesToday(user.id),
      googleStatus(user.id),
    ]);

    // Recover profile fields from the memory phrasing written at onboarding.
    const find = (prefix) =>
      (memories || [])
        .find((m) => m.content?.toLowerCase().startsWith(prefix))
        ?.content?.slice(prefix.length)
        .replace(/^[:\s]+/, '')
        .trim() || '';

    const { count: memoryCount } = await supabase
      .from('memories')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    return Response.json({
      email: user.email,
      profile: {
        name: profile?.name || find("the user's name is"),
        role: find('describes themselves as a'),
        city: find('based in'),
        timezone: find('timezone is'),
      },
      preferences: {
        briefingEnabled: profile?.briefing_enabled ?? true,
        briefingHour: profile?.briefing_hour ?? 7,
        tone: find('prefers a') || 'neutral',
        detail: find('prefers') || 'balanced',
      },
      connections: { google },
      plan: {
        id: plan,
        label: planConfig(plan).label,
        messagesToday,
        dailyLimit: planConfig(plan).dailyMessages === Infinity ? null : planConfig(plan).dailyMessages,
      },
      stats: { memories: memoryCount || 0, memberSince: profile?.created_at || null },
    });
  } catch (error) {
    console.error('[settings] GET:', error);
    return Response.json({ error: 'Could not load settings' }, { status: 500 });
  }
}

/** Update profile fields, preferences and personality. */
export async function PATCH(request) {
  const blocked = guard(request);
  if (blocked) return blocked;

  try {
    const userId = await getUserId();
    if (!userId) return unauthorized();

    const supabase = requireSupabase();
    const body = await request.json().catch(() => ({}));

    // --- profile fields, stored as memories so Atlas can use them in context
    if (body.profile) {
      for (const [field, template] of Object.entries(PROFILE_MEMORIES)) {
        const value = body.profile[field];
        if (typeof value !== 'string' || !value.trim()) continue;

        const content = template(value.trim().slice(0, 200));
        const prefix = content.split(' ').slice(0, 3).join(' ').toLowerCase();

        // Replace rather than append, so editing your city does not leave the
        // old one in memory for Atlas to keep quoting back.
        const { data: existing } = await supabase
          .from('memories')
          .select('id, content')
          .eq('user_id', userId)
          .ilike('content', `${prefix}%`)
          .limit(5);

        const match = (existing || []).find((m) =>
          m.content.toLowerCase().startsWith(content.split(' ').slice(0, 3).join(' ').toLowerCase())
        );

        if (match) {
          await supabase.from('memories').update({ content, updated_at: new Date().toISOString() }).eq('id', match.id);
        } else {
          await supabase.from('memories').insert({
            user_id: userId,
            content,
            type: 'fact',
            importance: 9,
            tags: ['profile', field],
          });
        }
      }

      if (body.profile.name) {
        await supabase
          .from('users')
          .update({ name: String(body.profile.name).slice(0, 100), updated_at: new Date().toISOString() })
          .eq('id', userId);
      }
    }

    // --- notification preferences
    const userPatch = {};
    if (typeof body.briefingEnabled === 'boolean') userPatch.briefing_enabled = body.briefingEnabled;
    if (body.briefingHour !== undefined) {
      const hour = Number(body.briefingHour);
      if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
        return Response.json({ error: 'briefingHour must be 0-23' }, { status: 400 });
      }
      userPatch.briefing_hour = hour;
    }
    if (Object.keys(userPatch).length) {
      userPatch.updated_at = new Date().toISOString();
      await supabase.from('users').update(userPatch).eq('id', userId);
    }

    // --- personality sliders, saved as preference memories
    const personality = [];
    if (body.tone !== undefined) {
      const idx = Math.min(Math.max(Number(body.tone) || 0, 0), 4);
      personality.push({ prefix: 'prefers a', content: `prefers a ${TONE_LABELS[idx]} tone from Atlas` });
    }
    if (body.detail !== undefined) {
      const idx = Math.min(Math.max(Number(body.detail) || 0, 0), 4);
      personality.push({ prefix: 'prefers', content: `prefers ${DETAIL_LABELS[idx]} responses` });
    }

    for (const pref of personality) {
      const { data: existing } = await supabase
        .from('memories')
        .select('id')
        .eq('user_id', userId)
        .eq('type', 'preference')
        .ilike('content', `${pref.prefix}%`)
        .limit(1);

      if (existing?.[0]) {
        await supabase.from('memories').update({ content: pref.content }).eq('id', existing[0].id);
      } else {
        await supabase.from('memories').insert({
          user_id: userId,
          content: pref.content,
          type: 'preference',
          importance: 8,
          tags: ['personality'],
        });
      }
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('[settings] PATCH:', error);
    return Response.json({ error: 'Could not save settings' }, { status: 500 });
  }
}

/**
 * Danger zone.
 *   ?target=memories -> wipe every memory
 *   ?target=account  -> wipe all app data and sign out
 *
 * Both require confirm=DELETE in the query string. Destructive and irreversible.
 *
 * NOTE: 'account' removes this app's rows and ends the session. It does NOT
 * delete the Supabase Auth user — that needs the admin API and is intentionally
 * left out so a mis-click cannot destroy the login itself.
 */
export async function DELETE(request) {
  const blocked = guard(request);
  if (blocked) return blocked;

  try {
    const userId = await getUserId();
    if (!userId) return unauthorized();

    const { searchParams } = new URL(request.url);
    const target = searchParams.get('target');

    if (searchParams.get('confirm') !== 'DELETE') {
      return Response.json(
        { error: 'Confirmation required', code: 'CONFIRMATION_REQUIRED' },
        { status: 428 }
      );
    }

    const supabase = requireSupabase();

    if (target === 'memories') {
      const { error } = await supabase.from('memories').delete().eq('user_id', userId);
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ success: true, deleted: 'memories' });
    }

    if (target === 'account') {
      const tables = [
        'memories',
        'conversations',
        'tasks',
        'agent_logs',
        'contacts',
        'transactions',
        'invoices',
        'job_applications',
        'oauth_tokens',
        'briefings',
      ];

      for (const table of tables) {
        const { error } = await supabase.from(table).delete().eq('user_id', userId);
        if (error) console.error(`[settings] delete from ${table}:`, error.message);
      }
      await supabase.from('users').delete().eq('id', userId);

      const authClient = await createSupabaseServerClient();
      await authClient.auth.signOut();

      return Response.json({ success: true, deleted: 'account' });
    }

    return Response.json(
      { error: "Invalid target. Use 'memories' or 'account'." },
      { status: 400 }
    );
  } catch (error) {
    console.error('[settings] DELETE:', error);
    return Response.json({ error: 'Delete failed' }, { status: 500 });
  }
}
