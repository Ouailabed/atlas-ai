import { chat } from '@/lib/groq';
import { getUserId, unauthorized } from '@/lib/auth';
import { guard } from '@/lib/rateLimit';

export const runtime = 'nodejs';

/**
 * Same caveat as the research agent: DuckDuckGo's Instant Answer API is not a
 * news source and will usually return nothing for a topical query. When it does,
 * the material is often not current. The response labels which path was taken so
 * the UI can be honest about it rather than presenting stale text as "today's news".
 */
async function fetchTopic(topic) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(topic)}&format=json&no_html=1`,
      { signal: controller.signal, headers: { 'User-Agent': 'Atlas/1.0' } }
    ).finally(() => clearTimeout(timeout));

    if (!response.ok) return [];
    const data = await response.json();

    const items = [];
    if (data.Abstract) items.push({ topic, text: data.Abstract, source: data.AbstractSource });
    if (Array.isArray(data.RelatedTopics)) {
      for (const t of data.RelatedTopics.slice(0, 2)) {
        if (t?.Text) items.push({ topic, text: t.Text, source: 'DuckDuckGo' });
      }
    }
    return items;
  } catch (error) {
    if (error?.name !== 'AbortError') {
      console.error('[news] topic fetch failed:', error?.message || error);
    }
    return [];
  }
}

export async function POST(request) {
  const blocked = guard(request);
  if (blocked) return blocked;

  try {
    const userId = await getUserId();
    if (!userId) return unauthorized();

    const body = await request.json().catch(() => ({}));
    const topics = Array.isArray(body.topics) && body.topics.length
      ? body.topics.slice(0, 5).map((t) => String(t).slice(0, 100))
      : ['AI technology', 'UK economy', 'London tech'];

    const items = (await Promise.all(topics.map(fetchTopic))).flat();

    if (items.length === 0) {
      return Response.json({
        briefing:
          'No live news could be retrieved right now. Atlas is not connected to a news ' +
          'provider yet — connecting one (NewsAPI, GDELT or an RSS feed) would make this ' +
          'a real daily briefing.',
        topics,
        stories: 0,
        method: 'unavailable',
      });
    }

    const { ok, content, error } = await chat({
      messages: [
        {
          role: 'system',
          content:
            'You are the Atlas News Agent. Write a briefing under 200 words from the items ' +
            'provided. Sound like a well-informed friend, not a news anchor. Summarise only ' +
            'what is in the items — do not add stories from memory. If the items are thin, ' +
            'say so rather than padding.',
        },
        {
          role: 'user',
          content: `Topics: ${topics.join(', ')}\n\nItems:\n${items
            .map((n, i) => `${i + 1}. [${n.topic}] ${n.text}`)
            .join('\n\n')}`,
        },
      ],
      maxTokens: 400,
      temperature: 0.5,
    });

    if (!ok) {
      return Response.json({ error: error || 'Briefing failed' }, { status: 503 });
    }

    return Response.json({
      briefing: content,
      topics,
      stories: items.length,
      method: 'duckduckgo-instant-answer',
      note: 'Sourced from DuckDuckGo Instant Answers, which is not a live news feed — treat dates and recency with caution.',
    });
  } catch (error) {
    console.error('[news] POST:', error);
    return Response.json({ error: 'News request failed' }, { status: 500 });
  }
}
