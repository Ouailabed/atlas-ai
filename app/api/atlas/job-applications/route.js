import { requireSupabase } from '@/lib/supabase';
import { getUserId, unauthorized } from '@/lib/auth';
import { guard } from '@/lib/rateLimit';

export const runtime = 'nodejs';

const STATUSES = ['applied', 'interview', 'offer', 'rejected'];

export async function GET(request) {
  const blocked = guard(request);
  if (blocked) return blocked;

  try {
    const userId = await getUserId();
    if (!userId) return unauthorized();

    const supabase = requireSupabase();
    const { data, error } = await supabase
      .from('job_applications')
      .select('*')
      .eq('user_id', userId)
      .order('date_applied', { ascending: false });

    if (error) return Response.json({ error: error.message }, { status: 500 });

    const applications = data || [];
    return Response.json({
      applications,
      summary: {
        total: applications.length,
        ...Object.fromEntries(
          STATUSES.map((s) => [s, applications.filter((a) => a.status === s).length])
        ),
      },
    });
  } catch (error) {
    console.error('[job-applications] GET:', error);
    return Response.json({ error: 'Could not load applications' }, { status: 500 });
  }
}

export async function POST(request) {
  const blocked = guard(request);
  if (blocked) return blocked;

  try {
    const userId = await getUserId();
    if (!userId) return unauthorized();

    const supabase = requireSupabase();
    const body = await request.json().catch(() => ({}));

    const company = typeof body.company === 'string' ? body.company.trim().slice(0, 200) : '';
    const role = typeof body.role === 'string' ? body.role.trim().slice(0, 200) : '';

    if (!company) return Response.json({ error: 'company is required' }, { status: 400 });
    if (!role) return Response.json({ error: 'role is required' }, { status: 400 });

    const status = STATUSES.includes(body.status) ? body.status : 'applied';
    const fitScore = Number.isFinite(Number(body.fit_score))
      ? Math.min(100, Math.max(0, Math.round(Number(body.fit_score))))
      : null;

    const { data, error } = await supabase
      .from('job_applications')
      .insert({
        user_id: userId,
        company,
        role,
        status,
        notes: body.notes ? String(body.notes).slice(0, 4000) : null,
        fit_score: fitScore,
        date_applied: /^\d{4}-\d{2}-\d{2}$/.test(body.date_applied || '')
          ? body.date_applied
          : new Date().toISOString().split('T')[0],
      })
      .select()
      .single();

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ application: data });
  } catch (error) {
    console.error('[job-applications] POST:', error);
    return Response.json({ error: 'Could not save application' }, { status: 500 });
  }
}

export async function PATCH(request) {
  const blocked = guard(request);
  if (blocked) return blocked;

  try {
    const userId = await getUserId();
    if (!userId) return unauthorized();

    const supabase = requireSupabase();
    const body = await request.json().catch(() => ({}));
    if (!body.id) return Response.json({ error: 'id is required' }, { status: 400 });

    const patch = {};
    if (body.status) {
      if (!STATUSES.includes(body.status)) {
        return Response.json(
          { error: `status must be one of: ${STATUSES.join(', ')}` },
          { status: 400 }
        );
      }
      patch.status = body.status;
    }
    if (body.notes !== undefined) patch.notes = String(body.notes).slice(0, 4000);
    if (body.company) patch.company = String(body.company).slice(0, 200);
    if (body.role) patch.role = String(body.role).slice(0, 200);

    if (!Object.keys(patch).length) {
      return Response.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('job_applications')
      .update(patch)
      .eq('id', body.id)
      .eq('user_id', userId)
      .select()
      .maybeSingle();

    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (!data) return Response.json({ error: 'Application not found' }, { status: 404 });
    return Response.json({ application: data });
  } catch (error) {
    console.error('[job-applications] PATCH:', error);
    return Response.json({ error: 'Could not update application' }, { status: 500 });
  }
}

export async function DELETE(request) {
  const blocked = guard(request);
  if (blocked) return blocked;

  try {
    const userId = await getUserId();
    if (!userId) return unauthorized();

    const supabase = requireSupabase();
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return Response.json({ error: 'id is required' }, { status: 400 });

    const { error } = await supabase
      .from('job_applications')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ success: true });
  } catch (error) {
    console.error('[job-applications] DELETE:', error);
    return Response.json({ error: 'Could not delete application' }, { status: 500 });
  }
}
