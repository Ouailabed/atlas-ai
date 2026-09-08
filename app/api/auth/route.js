import { createSupabaseServerClient, getSessionUser, ensureUserRow } from '@/lib/auth';
import { getUserPlan } from '@/lib/plan';
import { guard } from '@/lib/rateLimit';

export const runtime = 'nodejs';

/**
 * Auth endpoint. One route, four actions, to keep the surface small.
 *
 *   POST { action: 'signup', email, password, name }
 *   POST { action: 'login',  email, password }
 *   POST { action: 'logout' }
 *   GET  -> current session
 *
 * Passwords go straight to Supabase Auth and are never stored by this app.
 */
export async function POST(request) {
  const blocked = guard(request);
  if (blocked) return blocked;

  try {
    const body = await request.json().catch(() => ({}));
    const { action } = body;
    const supabase = await createSupabaseServerClient();

    if (action === 'logout') {
      await supabase.auth.signOut();
      return Response.json({ success: true });
    }

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!email || !email.includes('@')) {
      return Response.json({ error: 'A valid email address is required' }, { status: 400 });
    }
    if (!password || password.length < 8) {
      return Response.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    if (action === 'signup') {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name: body.name || null } },
      });

      if (error) return Response.json({ error: error.message }, { status: 400 });

      // With email confirmation on, there is no session until they confirm.
      if (data.user && data.session) {
        await ensureUserRow(data.user);
        return Response.json({
          success: true,
          user: { id: data.user.id, email: data.user.email },
          needsConfirmation: false,
        });
      }

      return Response.json({
        success: true,
        needsConfirmation: true,
        message: 'Check your email to confirm your account, then sign in.',
      });
    }

    if (action === 'login') {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        // Deliberately vague: do not reveal whether the address exists.
        return Response.json({ error: 'Invalid email or password' }, { status: 401 });
      }

      await ensureUserRow(data.user);
      const plan = await getUserPlan(data.user.id);

      return Response.json({
        success: true,
        user: { id: data.user.id, email: data.user.email, plan },
      });
    }

    return Response.json(
      { error: "Invalid action. Use 'signup', 'login' or 'logout'." },
      { status: 400 }
    );
  } catch (error) {
    console.error('[auth] POST:', error);
    return Response.json({ error: 'Authentication failed' }, { status: 500 });
  }
}

export async function GET(request) {
  const blocked = guard(request);
  if (blocked) return blocked;

  try {
    const user = await getSessionUser();
    if (!user) return Response.json({ authenticated: false });

    const plan = await getUserPlan(user.id);
    return Response.json({
      authenticated: true,
      user: { id: user.id, email: user.email, plan },
    });
  } catch (error) {
    console.error('[auth] GET:', error);
    return Response.json({ authenticated: false });
  }
}
