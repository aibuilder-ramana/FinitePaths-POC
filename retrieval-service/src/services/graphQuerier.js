const db    = require('../config/neo4j');
const { int } = db;
const http  = require('http');

const EMBEDDING_SERVICE_URL = process.env.EMBEDDING_SERVICE_URL || 'http://localhost:3004';

/**
 * Call the embedding service to get fuzzy-matched topic names for a query.
 * Returns top topic names (score >= threshold) from the vector index.
 */
async function fuzzyExpandTopics(queryText, threshold = 0.35) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ text: queryText, collection: 'topics', n_results: 10 });
    const url = new URL('/search', EMBEDDING_SERVICE_URL);
    const req = http.request({
      hostname: url.hostname,
      port: url.port || 3004,
      path: url.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const topics = (parsed.results || [])
            .filter(r => r.score >= threshold)
            .map(r => r.id);
          resolve(topics);
        } catch { resolve([]); }
      });
    });
    req.on('error', () => resolve([]));
    req.setTimeout(3000, () => { req.destroy(); resolve([]); });
    req.write(body);
    req.end();
  });
}

/**
 * Get all scopes visible to the requesting user (privacy enforcement).
 */
async function getVisibleScopes(requesterId) {
  const rows = await db.query(`
    MATCH (s:VisibilityScope)
    WHERE $requesterId IN s.allowed_users OR '*' IN s.allowed_users
    RETURN s.scope_id AS scopeId
  `, { requesterId });
  return rows.map(r => r.scopeId);
}

/**
 * For each topic, expand to include the topic itself plus any descendants
 * in the CHILD_OF hierarchy (e.g. "Europe" → ["Europe", "France", "Italy", ...]).
 */
async function expandTopicsWithHierarchy(topics) {
  if (topics.length === 0) return [];

  // Use WITH to bring topicName into aggregation scope (avoids implicit grouping error)
  const rows = await db.query(`
    UNWIND $topics AS topicName
    OPTIONAL MATCH (t:Topic) WHERE toLower(t.name) = toLower(topicName)
    OPTIONAL MATCH (t)<-[:CHILD_OF*0..]-(child:Topic)
    WITH topicName, collect(DISTINCT child.name) AS children
    RETURN children + [topicName] AS allTopics
  `, { topics });

  const expanded = new Set();
  for (const row of rows) {
    for (const t of row.allTopics || []) {
      if (t) expanded.add(t);
    }
  }
  // Also include the original topics directly (in case no Topic nodes exist yet)
  for (const t of topics) expanded.add(t);

  return Array.from(expanded);
}

/**
 * Query the expertise graph for candidates matching the given topics,
 * scoped to what the requester can see.
 *
 * Returns candidates with:
 * - user_id, user_name
 * - best matching topic + score
 * - evidence snippets (event text/type for LLM ranking)
 */
async function findCandidates(requesterId, topics, limit = 5, queryText = '') {
  console.log(`\n🔍 Step 2: Querying expertise graph for topics: [${topics.join(', ')}]`);

  const visibleScopes = await getVisibleScopes(requesterId);

  if (visibleScopes.length === 0) {
    console.log('   ⚠️  No visible scopes for requester — returning empty');
    return [];
  }

  // Fuzzy topic expansion via embedding service
  const rawText = queryText || topics.join(' ');
  const fuzzyTopics = await fuzzyExpandTopics(rawText);
  if (fuzzyTopics.length > 0) {
    console.log(`   🔮 Fuzzy embedding matches: [${fuzzyTopics.join(', ')}]`);
  }
  const allInputTopics = [...new Set([...topics, ...fuzzyTopics])];

  const expandedTopics = await expandTopicsWithHierarchy(allInputTopics);
  console.log(`   📊 Expanded to ${expandedTopics.length} topics (with hierarchy)`);

  // Step A: Find top-N users by max expertise score for the matching topics
  const topUsers = await db.query(`
    MATCH (se:ScopedExpertise)
    WHERE any(t IN $topics WHERE toLower(se.topic) = toLower(t))
      AND se.scope_id IN $scopeIds
      AND se.user_id <> $requesterId
    WITH se.user_id AS user_id, max(se.score) AS top_score
    ORDER BY top_score DESC
    LIMIT $limit
    RETURN user_id, top_score
  `, { requesterId, topics: expandedTopics, scopeIds: visibleScopes, limit: int(limit) });

  if (topUsers.length === 0) {
    console.log('   ℹ️  No candidates found in expertise graph');
    return [];
  }

  const topUserIds = topUsers.map(r => r.user_id);
  const topScoreMap = new Map(topUsers.map(r => [r.user_id, r.top_score]));

  // Step B: For each candidate, gather expertise entries + evidence events
  const detailRows = await db.query(`
    UNWIND $userIds AS uid
    MATCH (u:User {user_id: uid})
    OPTIONAL MATCH (se:ScopedExpertise)
    WHERE se.user_id = uid AND any(t IN $topics WHERE toLower(se.topic) = toLower(t)) AND se.scope_id IN $scopeIds
    OPTIONAL MATCH (e:Event)-[:OWNED_BY]->(u)
    OPTIONAL MATCH (e)-[:ABOUT]->(t:Topic)
    WHERE any(tp IN $topics WHERE toLower(t.name) = toLower(tp))
    OPTIONAL MATCH (e)-[:HAS_SCOPE]->(s:VisibilityScope)
    WHERE s.scope_id IN $scopeIds
    WITH u.user_id AS user_id,
         u.name    AS user_name,
         collect(DISTINCT {topic: se.topic, score: se.score}) AS expertise_entries,
         collect(DISTINCT {event_type: e.event_type, confidence: e.confidence, topic: t.name, source_message_id: e.source_message_id, text: e.source_text})[0..5] AS evidence_events
    RETURN user_id, user_name, expertise_entries, evidence_events
  `, { userIds: topUserIds, topics: expandedTopics, scopeIds: visibleScopes });

  // Merge top_score back in and sort
  const rows = detailRows.map(r => ({
    ...r,
    top_score: topScoreMap.get(r.user_id) || 0
  })).sort((a, b) => b.top_score - a.top_score);

  console.log(`   ✅ Found ${rows.length} candidate(s)`);
  return rows;
}

module.exports = { findCandidates };
