import { chat } from '@/lib/groq';
import { getUserId, unauthorized } from '@/lib/auth';
import { guard } from '@/lib/rateLimit';

export const runtime = 'nodejs';

/**
 * DuckDuckGo's Instant Answer API is NOT a web search engine.
 *
 * It only returns an Abstract for entities it has a knowledge-panel style entry
 * for (mostly Wikipedia topics). For the large majority of real questions it
 * returns an empty payload. The original code treated it as a search backend
 * and summarised nothing.
 *
 * The build guide also told you to `npm install duckduckgo-search`, then never
 * imported it — that package is a Python-ecosystem name and does not work this
 * way in Node. No package is used here; this is a plain fetch.
 *
 * Strategy now: try DDG, and if it yields nothing usable, answer directly from
 * the model's own knowledge and say so via the `method` field.
 */
async function searchDuckDuckGo(query) {
  try {
    const url =
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}` +
      '&format=json&no_html=1&skip_disambig=1';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Atlas/1.0' },
    }).finally(() => clearTimeout(timeout));

    if (!response.ok) return [];

    const data = await response.json();
    const results = [];

    if (data.Abstract) {
      results.push({
        title: data.AbstractSource || 'Summary',
        snippet: data.Abstract,
        url: data.AbstractURL || null,
      });
    }

    if (Array.isArray(data.RelatedTopics)) {
      for (const topic of data.RelatedTopics.slice(0, 4)) {
        if (topic?.Text) {
          results.push({
            title:
              topic.FirstURL?.split('/').pop()?.replace(/_/g, ' ') || 'Related',
            snippet: topic.Text,
            url: topic.FirstURL || null,
          });
        }
      }
    }

    return results;
  } catch (error) {
    if (error?.name !== 'AbortError') {
      console.error('[research] DDG lookup failed:', error?.message || error);
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
    const query = typeof body.query === 'string' ? body.query.trim() : '';
    if (!query) return Response.json({ error: 'query is required' }, { status: 400 });

    const results = await searchDuckDuckGo(query);

    // Fallback path: no Abstract and no RelatedTopics -> straight to model knowledge.
    if (results.length === 0) {
      const { ok, content, error } = await chat({
        messages: [
          {
            role: 'system',
            content:
              'You are the Atlas Research Agent. Answer accurately and concisely from your own ' +
              'knowledge. If the question needs information more recent than your training data, ' +
              'or you are not confident, say so plainly rather than guessing.',
          },
          { role: 'user', content: query },
        ],
        maxTokens: 800,
        temperature: 0.3,
      });

      if (!ok) {
        return Response.json(
          { error: 'Research is temporarily unavailable.', detail: error },
          { status: 503 }
        );
      }

      return Response.json({
        summary: content,
        sources: [],
        method: 'model-knowledge',
        note: 'No live search results were available, so this comes from the model’s training data and may be out of date.',
      });
    }

    const context = results
      .map((r, i) => `[${i + 1}] ${r.title}\n${r.snippet}`)
      .join('\n\n');

    const { ok, content, error } = await chat({
      messages: [
        {
          role: 'system',
          content:
            'You are the Atlas Research Agent. Synthesise the search results into a clear, ' +
            `direct briefing that answers the question: "${query}". Be concise. ` +
            'If the results do not actually answer the question, say so.',
        },
        { role: 'user', content: `Search results:\n\n${context}` },
      ],
      maxTokens: 600,
      temperature: 0.3,
    });

    if (!ok) {
      return Response.json(
        { error: 'Research is temporarily unavailable.', detail: error },
        { status: 503 }
      );
    }

    return Response.json({
      summary: content,
      // Objects, not bare strings — the handoff had flattened these to titles.
      sources: results.map((r) => ({ title: r.title, url: r.url })),
      method: 'web-search',
    });
  } catch (error) {
    console.error('[research] unhandled:', error);
    return Response.json({ error: 'Research request failed' }, { status: 500 });
  }
}
