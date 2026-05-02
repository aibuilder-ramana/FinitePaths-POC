const express = require('express');
const { extractIntent } = require('../services/intentExtractor');
const { findCandidates } = require('../services/graphQuerier');
const { rankCandidates } = require('../services/llmRanker');

const router = express.Router();

/**
 * POST /api/retrieve
 *
 * Body:
 *   {
 *     "query":        "I need help planning Europe travel",   // required
 *     "requester_id": "user_03",                              // required
 *     "limit":        5                                       // optional, default 5
 *   }
 *
 * Response:
 *   {
 *     "query":    "...",
 *     "intent":   { intent, entities, expanded_entities },
 *     "results":  [ { user_id, user_name, rank, match_strength, reason, relevant_topics, expertise_score } ],
 *     "meta":     { candidates_found, duration_ms }
 *   }
 */
router.post('/', async (req, res) => {
  const { query, requester_id, limit = 5 } = req.body;

  if (!query || typeof query !== 'string' || query.trim() === '') {
    return res.status(400).json({ error: 'query is required and must be a non-empty string' });
  }
  if (!requester_id || typeof requester_id !== 'string') {
    return res.status(400).json({ error: 'requester_id is required' });
  }

  const startTime = Date.now();
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🔎 Retrieval request from ${requester_id}: "${query}"`);

  try {
    // Step 1: Intent extraction
    const intent = await extractIntent(query.trim());

    // Step 2: Graph query using expanded entities + fuzzy embedding expansion
    const candidates = await findCandidates(requester_id, intent.expanded_entities, limit, query.trim());

    // Step 3: LLM ranking
    const results = await rankCandidates(query.trim(), intent.intent, candidates);

    const duration = Date.now() - startTime;
    console.log(`\n✅ Retrieval complete in ${duration}ms — ${results.length} result(s)\n`);

    return res.json({
      query,
      intent,
      results,
      meta: {
        candidates_found: candidates.length,
        duration_ms: duration
      }
    });
  } catch (error) {
    console.error('❌ Retrieval error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
