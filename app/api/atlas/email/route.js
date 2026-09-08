/**
 * ATLAS EMAIL AGENT — Gmail via OAuth2
 * ============================================================================
 *
 * SETUP — how to get the three credentials this needs
 * ----------------------------------------------------------------------------
 * 1. Go to https://console.cloud.google.com and create a project (e.g. "atlas-ai").
 *
 * 2. Enable the Gmail API:
 *    APIs & Services -> Library -> search "Gmail API" -> Enable.
 *
 * 3. Configure the consent screen:
 *    APIs & Services -> OAuth consent screen -> External -> fill in app name and
 *    your email. Under "Test users" add your own Gmail address. You can stay in
 *    "Testing" mode for personal use; publishing requires Google verification
 *    because the Gmail scopes below are classed as sensitive.
 *
 * 4. Create credentials:
 *    APIs & Services -> Credentials -> Create Credentials -> OAuth client ID ->
 *    Application type "Web application".
 *    Under "Authorised redirect URIs" add:  https://developers.google.com/oauthplayground
 *    Copy the Client ID and Client Secret.
 *
 * 5. Get a refresh token:
 *    Open https://developers.google.com/oauthplayground
 *    -> gear icon (top right) -> tick "Use your own OAuth credentials"
 *    -> paste your Client ID and Client Secret
 *    -> in the left panel enter these scopes:
 *         https://www.googleapis.com/auth/gmail.readonly
 *         https://www.googleapis.com/auth/gmail.compose
 *         https://www.googleapis.com/auth/gmail.send
 *    -> "Authorize APIs", sign in, allow
 *    -> "Exchange authorization code for tokens"
 *    -> copy the **refresh token**.
 *
 * 6. Put all three in .env.local and restart the dev server:
 *      GMAIL_CLIENT_ID=...
 *      GMAIL_CLIENT_SECRET=...
 *      GMAIL_REFRESH_TOKEN=...
 *
 * Until those exist this route returns 503 and lib/agents.js reports the Email
 * Agent as "planned", so Atlas will not claim it can send mail.
 *
 * SAFETY
 * ----------------------------------------------------------------------------
 * 'send' requires an explicit confirm:true from the client, which the UI only
 * sets after the user has read the draft and pressed Send. Atlas itself cannot
 * trigger a send — the orchestrator can only produce drafts.
 * ============================================================================
 */

import { google } from 'googleapis';
import { chat } from '@/lib/groq';
import { getUserId, unauthorized } from '@/lib/auth';
import { guard } from '@/lib/rateLimit';

export const runtime = 'nodejs';

const REQUIRED = ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN'];

function gmailConfigured() {
  return REQUIRED.every((k) => Boolean(process.env[k]));
}

function getGmailClient() {
  const oauth2 = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    'https://developers.google.com/oauthplayground'
  );
  oauth2.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
  return google.gmail({ version: 'v1', auth: oauth2 });
}

function headerValue(headers, name) {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';
}

/** Walk the MIME tree for the first text/plain part. */
function extractBody(payload) {
  if (!payload) return '';
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf8');
  }
  for (const part of payload.parts || []) {
    if (part.mimeType === 'text/plain' && part.body?.data) {
      return Buffer.from(part.body.data, 'base64').toString('utf8');
    }
  }
  for (const part of payload.parts || []) {
    const nested = extractBody(part);
    if (nested) return nested;
  }
  return '';
}

function buildRawMessage({ to, subject, body, cc, bcc }) {
  const lines = [
    `To: ${to}`,
    cc ? `Cc: ${cc}` : null,
    bcc ? `Bcc: ${bcc}` : null,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    body,
  ].filter(Boolean);

  return Buffer.from(lines.join('\r\n'))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function POST(request) {
  const blocked = guard(request);
  if (blocked) return blocked;

  try {
    const userId = await getUserId();
    if (!userId) return unauthorized();

    if (!gmailConfigured()) {
      const missing = REQUIRED.filter((k) => !process.env[k]);
      return Response.json(
        {
          error: 'Gmail is not connected.',
          code: 'GMAIL_NOT_CONFIGURED',
          missing,
          help: 'See the setup guide at the top of app/api/atlas/email/route.js',
        },
        { status: 503 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { action } = body;
    const gmail = getGmailClient();

    // ---- list inbox --------------------------------------------------------
    if (action === 'list') {
      const max = Math.min(Number(body.maxResults) || 10, 50);
      const { data } = await gmail.users.messages.list({
        userId: 'me',
        maxResults: max,
        q: body.query || 'in:inbox',
      });

      const messages = await Promise.all(
        (data.messages || []).map(async (m) => {
          const { data: full } = await gmail.users.messages.get({
            userId: 'me',
            id: m.id,
            format: 'metadata',
            metadataHeaders: ['From', 'Subject', 'Date'],
          });
          const headers = full.payload?.headers || [];
          return {
            id: full.id,
            threadId: full.threadId,
            from: headerValue(headers, 'From'),
            subject: headerValue(headers, 'Subject'),
            date: headerValue(headers, 'Date'),
            snippet: full.snippet,
            unread: (full.labelIds || []).includes('UNREAD'),
          };
        })
      );

      return Response.json({ messages, count: messages.length });
    }

    // ---- read one ----------------------------------------------------------
    if (action === 'read') {
      if (!body.id) return Response.json({ error: 'id is required' }, { status: 400 });

      const { data } = await gmail.users.messages.get({
        userId: 'me',
        id: body.id,
        format: 'full',
      });
      const headers = data.payload?.headers || [];

      return Response.json({
        message: {
          id: data.id,
          threadId: data.threadId,
          from: headerValue(headers, 'From'),
          to: headerValue(headers, 'To'),
          subject: headerValue(headers, 'Subject'),
          date: headerValue(headers, 'Date'),
          body: extractBody(data.payload).slice(0, 20000),
        },
      });
    }

    // ---- draft (optionally AI-written) -------------------------------------
    if (action === 'draft') {
      const to = typeof body.to === 'string' ? body.to.trim() : '';
      if (!to) return Response.json({ error: 'to is required' }, { status: 400 });

      let subject = body.subject || '';
      let text = body.body || '';

      // If only an instruction was given, have the model write it.
      if (!text && body.instruction) {
        const { ok, content } = await chat({
          messages: [
            {
              role: 'system',
              content:
                'Write the email body only. No preamble, no subject line, no commentary. ' +
                'Do not invent facts — use [ADD: ...] placeholders where detail is missing.',
            },
            {
              role: 'user',
              content:
                `Write an email to ${to}.\nInstruction: ${body.instruction}\n` +
                `Context: ${body.context || 'none'}\nTone: ${body.tone || 'professional'}`,
            },
          ],
          maxTokens: 700,
          temperature: 0.6,
        });
        if (!ok) return Response.json({ error: 'Draft generation failed' }, { status: 503 });
        text = content;
      }

      if (!text) {
        return Response.json({ error: 'body or instruction is required' }, { status: 400 });
      }

      if (!subject && body.instruction) {
        const { ok, content } = await chat({
          messages: [
            { role: 'user', content: `Write only a short email subject line for: ${body.instruction}` },
          ],
          maxTokens: 30,
          temperature: 0.4,
        });
        subject = ok ? content.replace(/^["']|["']$/g, '').trim().slice(0, 200) : '(no subject)';
      }

      // Saved to Gmail Drafts — visible to the user, NOT sent.
      const { data } = await gmail.users.drafts.create({
        userId: 'me',
        requestBody: { message: { raw: buildRawMessage({ to, subject, body: text, cc: body.cc }) } },
      });

      return Response.json({
        draft: { id: data.id, messageId: data.message?.id, to, subject, body: text },
        requiresApproval: true,
        note: 'Saved to your Gmail drafts. Nothing has been sent — review it, then press Send to deliver.',
      });
    }

    // ---- send (explicit approval required) ---------------------------------
    if (action === 'send') {
      // The guard rail: no confirm flag, no send. The orchestrator never sets this.
      if (body.confirm !== true) {
        return Response.json(
          {
            error: 'Sending requires explicit confirmation.',
            code: 'CONFIRMATION_REQUIRED',
            note: 'Re-send this request with confirm: true only after the user has reviewed the draft.',
          },
          { status: 428 }
        );
      }

      const to = typeof body.to === 'string' ? body.to.trim() : '';
      if (!to) return Response.json({ error: 'to is required' }, { status: 400 });
      if (!body.body) return Response.json({ error: 'body is required' }, { status: 400 });

      const { data } = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: buildRawMessage({
            to,
            subject: body.subject || '(no subject)',
            body: body.body,
            cc: body.cc,
            bcc: body.bcc,
          }),
        },
      });

      // If this came from a draft, clean the draft up.
      if (body.draftId) {
        await gmail.users.drafts.delete({ userId: 'me', id: body.draftId }).catch(() => {});
      }

      return Response.json({ sent: true, id: data.id, threadId: data.threadId });
    }

    return Response.json(
      { error: "Invalid action. Use 'list', 'read', 'draft' or 'send'." },
      { status: 400 }
    );
  } catch (error) {
    console.error('[email] unhandled:', error?.message || error);

    const status = error?.code === 401 || error?.code === 403 ? 401 : 500;
    return Response.json(
      {
        error:
          status === 401
            ? 'Gmail rejected the credentials. The refresh token may have expired — generate a new one.'
            : 'Email request failed.',
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

  return Response.json({
    configured: gmailConfigured(),
    missing: REQUIRED.filter((k) => !process.env[k]),
    actions: ['list', 'read', 'draft', 'send'],
  });
}
