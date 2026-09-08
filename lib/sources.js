/**
 * External data sources shared by the news agent and the morning briefing.
 */

async function timedFetch(url, ms = 5000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Atlas/1.0' },
    });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * DuckDuckGo Instant Answers. Not a news feed — see the note in the news route.
 * Returns [] rather than throwing so callers can degrade.
 */
export async function fetchTopicItems(topic, limit = 3) {
  try {
    const response = await timedFetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(topic)}&format=json&no_html=1`
    );
    if (!response.ok) return [];
    const data = await response.json();

    const items = [];
    if (data.Abstract) items.push({ topic, text: data.Abstract, source: data.AbstractSource });
    if (Array.isArray(data.RelatedTopics)) {
      for (const t of data.RelatedTopics.slice(0, Math.max(limit - 1, 0))) {
        if (t?.Text) items.push({ topic, text: t.Text, source: 'DuckDuckGo' });
      }
    }
    return items;
  } catch (error) {
    if (error?.name !== 'AbortError') {
      console.error('[sources] topic fetch failed:', error?.message || error);
    }
    return [];
  }
}

/**
 * Weather via OpenWeather.
 *
 * OPTIONAL. Without OPENWEATHER_API_KEY this returns null and the briefing simply
 * omits weather. It deliberately does NOT ask the language model to guess the
 * forecast — a model has no way to know today's weather, and inventing it would
 * be exactly the kind of confident fabrication the honesty rules exist to prevent.
 *
 * To enable: free key at https://openweathermap.org/api -> .env.local as
 * OPENWEATHER_API_KEY.
 */
export async function fetchWeather(city) {
  const key = process.env.OPENWEATHER_API_KEY;
  if (!key || !city) return null;

  try {
    const response = await timedFetch(
      `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}` +
        `&units=metric&appid=${key}`
    );
    if (!response.ok) return null;

    const data = await response.json();
    if (!data?.main) return null;

    return {
      city: data.name,
      description: data.weather?.[0]?.description || null,
      temp: Math.round(data.main.temp),
      feelsLike: Math.round(data.main.feels_like),
      high: Math.round(data.main.temp_max),
      low: Math.round(data.main.temp_min),
    };
  } catch (error) {
    if (error?.name !== 'AbortError') {
      console.error('[sources] weather fetch failed:', error?.message || error);
    }
    return null;
  }
}
