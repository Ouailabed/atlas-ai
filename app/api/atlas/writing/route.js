import { chat } from '@/lib/groq';
import { getUserId, unauthorized } from '@/lib/auth';
import { guard } from '@/lib/rateLimit';

export const runtime = 'nodejs';

const WRITING_STYLES = {
  email: 'Professional email. Clear subject line. Concise. Warm but direct.',
  linkedin: 'LinkedIn post. Engaging hook, one real insight, no hashtag spam. 150-250 words.',
  report: 'Business report. Executive summary first, then structured sections.',
  proposal: 'Business proposal: problem, solution, benefits, pricing, call to action.',
  letter: 'Formal letter. Professional and clearly structured.',
  tweet: 'Single post, max 280 characters. Punchy.',
  bio: 'Professional bio, third person, achievement-focused. 100-150 words.',
  essay: 'Structured essay with a clear argument and evidence.',
};

const LENGTHS = {
  short: '50-100 words',
  medium: '150-300 words',
  long: '400-600 words',
};

export async function POST(request) {
  const blocked = guard(request);
  if (blocked) return blocked;

  try {
    const userId = await getUserId();
    if (!userId) return unauthorized();

    const body = await request.json().catch(() => ({}));
    const topic = typeof body.topic === 'string' ? body.topic.trim() : '';
    if (!topic) return Response.json({ error: 'topic is required' }, { status: 400 });

    const type = WRITING_STYLES[body.type] ? body.type : 'email';
    const length = LENGTHS[body.length] ? body.length : 'medium';
    const tone = typeof body.tone === 'string' ? body.tone.slice(0, 50) : 'professional';

    const { ok, content, error } = await chat({
      messages: [
        {
          role: 'system',
          content:
            'You are the Atlas Writing Agent. Produce the content directly with no preamble ' +
            'and no meta-commentary. Do not invent facts, names, figures or credentials — ' +
            'use [ADD: ...] placeholders where the user needs to fill something in.',
        },
        {
          role: 'user',
          content:
            `Write a ${type} about: ${topic}\n` +
            `Context: ${body.context || 'none provided'}\n` +
            `Tone: ${tone}\n` +
            `Length: ${LENGTHS[length]}\n` +
            `Style: ${WRITING_STYLES[type]}`,
        },
      ],
      maxTokens: 1000,
      temperature: 0.7,
    });

    if (!ok) {
      return Response.json({ error: error || 'Writing failed' }, { status: 503 });
    }

    return Response.json({
      content,
      type,
      wordCount: content.trim().split(/\s+/).filter(Boolean).length,
      note: 'This is a draft. Atlas has not sent or published it anywhere.',
    });
  } catch (error) {
    console.error('[writing] POST:', error);
    return Response.json({ error: 'Writing request failed' }, { status: 500 });
  }
}
