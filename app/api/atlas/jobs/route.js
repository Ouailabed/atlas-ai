import { requireSupabase } from '@/lib/supabase';
import { chat } from '@/lib/groq';
import { parseJSON } from '@/lib/parseJSON';
import { getUserId, unauthorized } from '@/lib/auth';
import { guard } from '@/lib/rateLimit';

export const runtime = 'nodejs';

/**
 * Build a profile from stored memories.
 * Restores the build guide's type filter, which the handoff dropped along with
 * its hardcoded "AI graduate, London based" fallback — that fallback would have
 * written every user's CV as if they were the same person.
 */
async function getUserProfile(supabase, userId) {
  const { data, error } = await supabase
    .from('memories')
    .select('content, type')
    .eq('user_id', userId)
    .in('type', ['fact', 'preference', 'goal', 'person', 'event'])
    .order('importance', { ascending: false })
    .limit(25);

  if (error) {
    console.error('[jobs] profile lookup:', error.message);
    return '';
  }
  return (data || []).map((d) => d.content).join('\n');
}

async function tailorCV(profile, jobTitle, jobDescription, originalCV) {
  return chat({
    messages: [
      {
        role: 'user',
        content:
          `Tailor a CV for the role: ${jobTitle}\n\n` +
          `What we know about the candidate:\n${profile || '(nothing on file yet)'}\n\n` +
          `Original CV:\n${originalCV || '(not provided — build one from the profile above)'}\n\n` +
          `Job description:\n${jobDescription || '(not provided)'}\n\n` +
          'Produce an ATS-friendly CV with sections: Personal Statement, Experience, ' +
          'Education, Skills, Projects. Use only information given above — do not invent ' +
          'employers, dates, qualifications or achievements. Where something is missing, ' +
          'leave a clearly marked [ADD: ...] placeholder.',
      },
    ],
    maxTokens: 2000,
    temperature: 0.4,
  });
}

async function writeCoverLetter(profile, jobTitle, company, jobDescription) {
  return chat({
    messages: [
      {
        role: 'user',
        content:
          `Write a cover letter for ${jobTitle} at ${company || 'the company'}.\n\n` +
          `Candidate profile:\n${profile || '(nothing on file yet)'}\n\n` +
          `Job description:\n${jobDescription || '(not provided)'}\n\n` +
          'Roughly 300 words, 3-4 paragraphs. Strong opening that is not ' +
          '"I am writing to apply". Do not invent achievements or experience; use ' +
          '[ADD: ...] placeholders where detail is missing.',
      },
    ],
    maxTokens: 800,
    temperature: 0.6,
  });
}

async function analyseJobFit(profile, jobTitle, jobDescription) {
  const { ok, content } = await chat({
    messages: [
      {
        role: 'user',
        content:
          `Assess candidate fit for ${jobTitle}.\n\n` +
          `Candidate:\n${profile || '(nothing on file yet)'}\n\n` +
          `Job:\n${jobDescription || '(not provided)'}\n\n` +
          'Return JSON with keys: fit_score (0-100), strengths (array of strings), ' +
          'gaps (array of strings), recommendation ("apply" | "maybe" | "skip"), ' +
          'reason (one sentence). Return ONLY the JSON object.',
      },
    ],
    maxTokens: 400,
    temperature: 0.1,
  });

  if (!ok) return null;

  const parsed = parseJSON(content);
  if (!parsed || typeof parsed !== 'object') {
    return {
      fit_score: null,
      strengths: [],
      gaps: [],
      recommendation: 'maybe',
      reason: 'The fit analysis could not be parsed. Try again.',
    };
  }

  return {
    fit_score: Number.isFinite(Number(parsed.fit_score)) ? Number(parsed.fit_score) : null,
    strengths: Array.isArray(parsed.strengths) ? parsed.strengths.slice(0, 10) : [],
    gaps: Array.isArray(parsed.gaps) ? parsed.gaps.slice(0, 10) : [],
    recommendation: ['apply', 'maybe', 'skip'].includes(parsed.recommendation)
      ? parsed.recommendation
      : 'maybe',
    reason: parsed.reason ? String(parsed.reason).slice(0, 500) : '',
  };
}

export async function POST(request) {
  const blocked = guard(request);
  if (blocked) return blocked;

  try {
    const userId = await getUserId();
    if (!userId) return unauthorized();

    const supabase = requireSupabase();
    const body = await request.json().catch(() => ({}));
    const { action, jobTitle, jobDescription, company, originalCV } = body;

    if (!jobTitle && action !== 'analyse') {
      return Response.json({ error: 'jobTitle is required' }, { status: 400 });
    }

    const profile = await getUserProfile(supabase, userId);

    if (action === 'tailor-cv') {
      const { ok, content, error } = await tailorCV(profile, jobTitle, jobDescription, originalCV);
      if (!ok) return Response.json({ error: error || 'CV generation failed' }, { status: 503 });
      return Response.json({ cv: content });
    }

    if (action === 'cover-letter') {
      const { ok, content, error } = await writeCoverLetter(profile, jobTitle, company, jobDescription);
      if (!ok) return Response.json({ error: error || 'Cover letter failed' }, { status: 503 });
      return Response.json({ letter: content });
    }

    if (action === 'analyse') {
      const analysis = await analyseJobFit(profile, jobTitle, jobDescription);
      if (!analysis) return Response.json({ error: 'Analysis failed' }, { status: 503 });
      return Response.json({ analysis });
    }

    // Restored from the build guide; the handoff dropped it.
    if (action === 'full-package') {
      const [cv, letter, analysis] = await Promise.all([
        tailorCV(profile, jobTitle, jobDescription, originalCV),
        writeCoverLetter(profile, jobTitle, company, jobDescription),
        analyseJobFit(profile, jobTitle, jobDescription),
      ]);
      return Response.json({
        cv: cv.ok ? cv.content : null,
        letter: letter.ok ? letter.content : null,
        analysis,
        note: 'Drafts for your review. Atlas has not submitted any application.',
      });
    }

    return Response.json(
      { error: "Invalid action. Use 'tailor-cv', 'cover-letter', 'analyse' or 'full-package'." },
      { status: 400 }
    );
  } catch (error) {
    console.error('[jobs] POST:', error);
    return Response.json({ error: 'Jobs request failed' }, { status: 500 });
  }
}
