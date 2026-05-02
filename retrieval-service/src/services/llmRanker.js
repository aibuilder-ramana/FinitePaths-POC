const llm = require('../config/groq');

const RANKING_PROMPT = `You are a friend introducing people in a community who can help each other.

Given a user's need and candidates with their expertise topics, write a warm one-sentence referral for each person explaining why they're a good fit — as if you personally know them.

Rules:
- Use only the person's first name (extract from user_name field)
- Be specific to the user's query topic (gardening, travel, cooking, parenting, etc.) — not generic
- Infer real-world knowledge from the expertise topics. For example:
  "raised beds, composting" → "She's been growing vegetables in raised beds for years and knows composting inside out"
  "Amalfi, Positano, Florence" → "He's done the whole Italian coast and has great hotel recs"
  "pediatrician, speech therapy" → "She's navigated all the kids' health stuff and knows the best specialists in town"
- Sound conversational and specific — avoid "has expertise", "knows about X topic", "familiar with"
- Paint a picture: what would this person actually say or do to help? 1–2 sentences, max 150 characters
- match_strength: "strong" (top_score ≥ 0.5), "moderate" (0.3–0.49), "weak" (< 0.3)

Return JSON array, best match first:
[
  {
    "user_id": "...",
    "user_name": "...",
    "rank": 1,
    "match_strength": "strong" | "moderate" | "weak",
    "reason": "warm, specific one-sentence referral",
    "relevant_topics": ["topic1", "topic2"]
  }
]

Return ONLY valid JSON array. No markdown.`;

/**
 * Use LLM to rank graph candidates for the user's query.
 *
 * @param {string} query - Original natural language query
 * @param {string} intent - Extracted intent
 * @param {Array} candidates - Raw candidates from graphQuerier
 * @returns {Array} Ranked candidates with reasons
 */
async function rankCandidates(query, intent, candidates) {
  console.log(`\n🤖 Step 3: LLM ranking ${candidates.length} candidate(s)...`);

  if (candidates.length === 0) {
    return [];
  }

  // Build a compact, LLM-readable representation of each candidate
  const candidateSummaries = candidates.map(c => {
    const topExpertise = (c.expertise_entries || [])
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, 5)
      .map(e => `${e.topic} (score: ${(e.score || 0).toFixed(2)})`);

    const evidenceList = (c.evidence_events || [])
      .filter(e => e && e.event_type)
      .map(e => {
        // Prefer actual message text for richer context; fall back to event type
        if (e.text && e.text.length > 10) return e.text.slice(0, 120);
        const topic = e.topic ? ` about ${e.topic}` : '';
        return `${e.event_type}${topic}`;
      });

    return {
      user_id: c.user_id,
      user_name: c.user_name || c.user_id,
      top_score: (c.top_score || 0).toFixed(3),
      expertise: topExpertise,
      evidence: evidenceList.length > 0 ? evidenceList : ['No direct evidence events in visible scope']
    };
  });

  const payload = {
    user_query: query,
    intent,
    candidates: candidateSummaries
  };

  const response = await llm.chat([
    { role: 'system', content: RANKING_PROMPT },
    { role: 'user', content: JSON.stringify(payload, null, 2) }
  ], 0.1);

  let ranked;
  try {
    let jsonStr = response.trim().replace(/^```json\n?/, '').replace(/\n?```$/, '');
    ranked = JSON.parse(jsonStr);
  } catch {
    const match = response.match(/\[[\s\S]*\]/);
    if (match) {
      ranked = JSON.parse(match[0]);
    } else {
      console.warn('⚠️  LLM ranker returned non-JSON, falling back to score-sorted list');
      return candidates.map((c, i) => ({
        user_id: c.user_id,
        user_name: c.user_name || c.user_id,
        rank: i + 1,
        match_strength: c.top_score >= 0.7 ? 'strong' : c.top_score >= 0.4 ? 'moderate' : 'weak',
        reason: `Expertise score: ${(c.top_score || 0).toFixed(3)}`,
        relevant_topics: (c.expertise_entries || []).map(e => e.topic).slice(0, 3)
      }));
    }
  }

  // Enrich ranked results with original graph scores
  const scoreMap = new Map(candidates.map(c => [c.user_id, c.top_score]));
  const enriched = (Array.isArray(ranked) ? ranked : []).map(r => ({
    ...r,
    expertise_score: scoreMap.get(r.user_id) || 0
  }));

  console.log(`   ✅ LLM ranked ${enriched.length} result(s)`);
  enriched.forEach(r => {
    console.log(`   ${r.rank}. ${r.user_name || r.user_id} — ${r.match_strength}: ${r.reason}`);
  });

  return enriched;
}

module.exports = { rankCandidates };
