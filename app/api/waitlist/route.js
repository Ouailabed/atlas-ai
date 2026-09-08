import { requireSupabase } from '@/lib/supabase';
import { guard } from '@/lib/rateLimit';

export const runtime = 'nodejs';

/**
 * Public route — no auth, by design. Rate limited so it cannot be flooded.
 *
 * The original returned `position: Math.floor(Math.random() * 200) + 50` with the
 * comment "fake queue position for now" and showed it to signups as their real
 * place in line. That is a fabricated fact presented to a customer, so it is gone.
 */
export async function POST(request) {
  const blocked = guard(request);
  if (blocked) return blocked;

  try {
    const body = await request.json().catch(() => ({}));

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    // Deliberately permissive but not meaningless.
    // Validate BEFORE touching Supabase, so a bad address returns 400 rather
    // than a 500 from the database client being unconfigured.
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) {
      return Response.json({ error: 'Please enter a valid email address' }, { status: 400 });
    }

    const supabase = requireSupabase();

    const { error } = await supabase.from('waitlist').insert({
      email,
      name: body.name ? String(body.name).slice(0, 200) : null,
      role: body.role ? String(body.role).slice(0, 100) : null,
      source: body.source ? String(body.source).slice(0, 100) : 'landing-page',
    });

    if (error) {
      if (error.code === '23505') {
        return Response.json({
          success: true,
          message: "You're already on the list. We'll email you when spots open.",
        });
      }
      console.error('[waitlist] insert:', error.message);
      return Response.json({ error: 'Could not add you to the list' }, { status: 500 });
    }

    return Response.json({
      success: true,
      message: "You're on the list. We'll email you when spots open.",
    });
  } catch (error) {
    console.error('[waitlist] POST:', error);
    return Response.json({ error: 'Could not add you to the list' }, { status: 500 });
  }
}

export async function GET(request) {
  const blocked = guard(request);
  if (blocked) return blocked;

  try {
    const supabase = requireSupabase();
    const { count, error } = await supabase
      .from('waitlist')
      .select('*', { count: 'exact', head: true });

    if (error) return Response.json({ count: 0 });
    return Response.json({ count: count || 0 });
  } catch {
    return Response.json({ count: 0 });
  }
}
