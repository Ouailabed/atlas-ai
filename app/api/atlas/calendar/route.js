/**
 * ATLAS CALENDAR AGENT — Google Calendar via OAuth2
 * ============================================================================
 *
 * SETUP — one OAuth setup covers BOTH Calendar and Gmail
 * ----------------------------------------------------------------------------
 * If you already did the Gmail setup, you only need steps 3 and 5 below.
 *
 * 1. https://console.cloud.google.com -> create/select your project.
 *
 * 2. Enable BOTH APIs:
 *    APIs & Services -> Library -> enable "Gmail API" and "Google Calendar API".
 *
 * 3. OAuth consent screen -> External -> add your own email under "Test users".
 *    Add these scopes:
 *      .../auth/gmail.readonly   .../auth/gmail.compose   .../auth/gmail.send
 *      .../auth/calendar         .../auth/userinfo.email
 *
 * 4. Credentials -> Create Credentials -> OAuth client ID -> Web application.
 *    Authorised redirect URI — use YOUR app's callback, not the playground:
 *      http://localhost:3000/api/auth/google/callback
 *      https://your-domain.com/api/auth/google/callback   (add for production)
 *
 * 5. Put the client id/secret in .env.local:
 *      GOOGLE_CLIENT_ID=...
 *      GOOGLE_CLIENT_SECRET=...
 *
 * Then click "Connect" on /settings. That stores a refresh token against your
 * user row, so each customer connects their own calendar rather than sharing one.
 *
 * GOOGLE_REFRESH_TOKEN in .env.local still works as a single-account fallback
 * for local development.
 *
 * SAFETY
 * ----------------------------------------------------------------------------
 * 'create' and 'delete' require confirm:true. Without it the route returns a
 * 428 with a preview of exactly what would be created or removed, so the user
 * sees the details before anything touches their calendar. The orchestrator
 * never sets confirm — only a deliberate UI action does.
 * ============================================================================
 */

import { authorisedClient, calendarFor } from '@/lib/google';
import { getUserId, unauthorized } from '@/lib/auth';
import { guard } from '@/lib/rateLimit';

export const runtime = 'nodejs';

function notConnected(result) {
  return Response.json(
    {
      error:
        result.reason === 'GOOGLE_NOT_CONFIGURED'
          ? 'Google Calendar is not configured on this deployment.'
          : 'Your Google account is not connected yet.',
      code: result.reason,
      detail: result.detail,
      help: 'Connect it on /settings, or see the setup guide at the top of app/api/atlas/calendar/route.js',
    },
    { status: 503 }
  );
}

function formatEvent(e) {
  return {
    id: e.id,
    title: e.summary || '(no title)',
    description: e.description || null,
    location: e.location || null,
    start: e.start?.dateTime || e.start?.date || null,
    end: e.end?.dateTime || e.end?.date || null,
    allDay: Boolean(e.start?.date && !e.start?.dateTime),
    attendees: (e.attendees || []).map((a) => a.email),
    link: e.htmlLink || null,
  };
}

/**
 * Find the first gap of `durationMins` inside working hours over the next
 * `days` days. Deliberately simple: 09:00-18:00 local, skips weekends.
 */
function findSlot(events, durationMins, days) {
  const durationMs = durationMins * 60 * 1000;
  const busy = events
    .filter((e) => e.start?.dateTime && e.end?.dateTime)
    .map((e) => ({ start: new Date(e.start.dateTime), end: new Date(e.end.dateTime) }))
    .sort((a, b) => a.start - b.start);

  const now = new Date();

  for (let d = 0; d < days; d += 1) {
    const day = new Date(now);
    day.setDate(day.getDate() + d);

    const weekday = day.getDay();
    if (weekday === 0 || weekday === 6) continue; // skip weekends

    const dayStart = new Date(day);
    dayStart.setHours(9, 0, 0, 0);
    const dayEnd = new Date(day);
    dayEnd.setHours(18, 0, 0, 0);

    // Never propose a slot in the past.
    let cursor = dayStart < now ? new Date(Math.ceil(now.getTime() / 900000) * 900000) : dayStart;
    if (cursor >= dayEnd) continue;

    const dayBusy = busy.filter((b) => b.end > cursor && b.start < dayEnd);

    for (const block of dayBusy) {
      if (block.start.getTime() - cursor.getTime() >= durationMs) {
        return { start: cursor.toISOString(), end: new Date(cursor.getTime() + durationMs).toISOString() };
      }
      if (block.end > cursor) cursor = new Date(block.end);
    }

    if (dayEnd.getTime() - cursor.getTime() >= durationMs) {
      return { start: cursor.toISOString(), end: new Date(cursor.getTime() + durationMs).toISOString() };
    }
  }

  return null;
}

export async function POST(request) {
  const blocked = guard(request);
  if (blocked) return blocked;

  try {
    const userId = await getUserId();
    if (!userId) return unauthorized();

    const auth = await authorisedClient(userId);
    if (!auth.ok) return notConnected(auth);

    const calendar = calendarFor(auth.auth);
    const body = await request.json().catch(() => ({}));
    const { action } = body;

    // ---- list next 7 days --------------------------------------------------
    if (action === 'list') {
      const days = Math.min(Number(body.days) || 7, 60);
      const timeMin = new Date().toISOString();
      const timeMax = new Date(Date.now() + days * 86400000).toISOString();

      const { data } = await calendar.events.list({
        calendarId: 'primary',
        timeMin,
        timeMax,
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 50,
      });

      return Response.json({
        events: (data.items || []).map(formatEvent),
        range: { from: timeMin, to: timeMax, days },
      });
    }

    // ---- find an open slot -------------------------------------------------
    if (action === 'find-slot') {
      const duration = Math.min(Math.max(Number(body.duration) || 30, 15), 480);
      const days = Math.min(Number(body.days) || 5, 14);

      const { data } = await calendar.events.list({
        calendarId: 'primary',
        timeMin: new Date().toISOString(),
        timeMax: new Date(Date.now() + days * 86400000).toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 100,
      });

      const slot = findSlot(data.items || [], duration, days);

      return Response.json({
        slot,
        durationMins: duration,
        searchedDays: days,
        note: slot
          ? 'Working hours assumed to be 09:00-18:00, weekdays only.'
          : `No free ${duration}-minute slot found in the next ${days} weekdays between 09:00 and 18:00.`,
      });
    }

    // ---- create (confirmation required) ------------------------------------
    if (action === 'create') {
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      if (!title) return Response.json({ error: 'title is required' }, { status: 400 });
      if (!body.start) return Response.json({ error: 'start is required (ISO 8601)' }, { status: 400 });

      const start = new Date(body.start);
      if (Number.isNaN(start.getTime())) {
        return Response.json({ error: 'start is not a valid date' }, { status: 400 });
      }

      const durationMins = Math.min(Math.max(Number(body.duration) || 60, 5), 1440);
      const end = body.end ? new Date(body.end) : new Date(start.getTime() + durationMins * 60000);

      const preview = {
        title,
        start: start.toISOString(),
        end: end.toISOString(),
        durationMins: Math.round((end - start) / 60000),
        description: body.description || null,
        location: body.location || null,
        attendees: Array.isArray(body.attendees) ? body.attendees : [],
      };

      // Show first, write second. Nothing reaches the calendar without this flag.
      if (body.confirm !== true) {
        return Response.json(
          {
            requiresConfirmation: true,
            code: 'CONFIRMATION_REQUIRED',
            preview,
            note: 'Nothing has been created. Review these details and resend with confirm: true.',
          },
          { status: 428 }
        );
      }

      const { data } = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: {
          summary: preview.title,
          description: preview.description || undefined,
          location: preview.location || undefined,
          start: { dateTime: preview.start },
          end: { dateTime: preview.end },
          attendees: preview.attendees.length
            ? preview.attendees.map((email) => ({ email }))
            : undefined,
        },
      });

      return Response.json({ created: true, event: formatEvent(data) });
    }

    // ---- delete (confirmation required) ------------------------------------
    if (action === 'delete') {
      if (!body.id) return Response.json({ error: 'id is required' }, { status: 400 });

      if (body.confirm !== true) {
        let preview = null;
        try {
          const { data } = await calendar.events.get({ calendarId: 'primary', eventId: body.id });
          preview = formatEvent(data);
        } catch {
          return Response.json({ error: 'Event not found' }, { status: 404 });
        }
        return Response.json(
          {
            requiresConfirmation: true,
            code: 'CONFIRMATION_REQUIRED',
            preview,
            note: 'Nothing has been deleted. Resend with confirm: true to remove this event.',
          },
          { status: 428 }
        );
      }

      await calendar.events.delete({ calendarId: 'primary', eventId: body.id });
      return Response.json({ deleted: true, id: body.id });
    }

    return Response.json(
      { error: "Invalid action. Use 'list', 'create', 'delete' or 'find-slot'." },
      { status: 400 }
    );
  } catch (error) {
    console.error('[calendar] unhandled:', error?.message || error);
    const status = error?.code === 401 || error?.code === 403 ? 401 : 500;
    return Response.json(
      {
        error:
          status === 401
            ? 'Google rejected the credentials. Reconnect your account in Settings.'
            : 'Calendar request failed.',
        detail: error?.message,
      },
      { status }
    );
  }
}

export async function GET(request) {
  const blocked = guard(request);
  if (blocked) return blocked;

  const userId = await getUserId();
  if (!userId) return unauthorized();

  const auth = await authorisedClient(userId);
  return Response.json({
    connected: auth.ok,
    source: auth.source || null,
    reason: auth.ok ? null : auth.reason,
    actions: ['list', 'create', 'delete', 'find-slot'],
  });
}
