const db = require('../config/neo4j');

// Upward propagation decay per level
const PROPAGATION_DECAY = 0.6;

// Expertise score weights
const WEIGHTS = { frequency: 0.3, recency: 0.3, confidence: 0.2, depth: 0.2 };

function timeDecay(timestamp) {
  if (!timestamp) return 0.5;
  // Accept epoch-ms (number) or ISO string
  const ms = typeof timestamp === 'number' ? timestamp : new Date(timestamp).getTime();
  if (isNaN(ms)) return 0.5;
  const days = (Date.now() - ms) / (1000 * 60 * 60 * 24);
  return Math.exp(-0.05 * days);
}

class ExpertiseAggregator {

  // ─── Scope helpers ────────────────────────────────────────────────

  async getVisibleScopes(userId) {
    const result = await db.query(`
      MATCH (s:VisibilityScope)
      WHERE $userId IN s.allowed_users OR '*' IN s.allowed_users
      RETURN s.scope_id AS scopeId
    `, { userId });
    return result.map(r => r.scopeId);
  }

  // ─── Core aggregation (single-query, no N+1) ─────────────────────

  /**
   * Compute expertise for every user×topic combination within a scope.
   * Single Cypher aggregation — no N+1.
   */
  async computeAllExpertiseInScope(scopeId) {
    const rows = await db.query(`
      MATCH (e:Event)-[:HAS_SCOPE]->(s:VisibilityScope {scope_id: $scopeId})
      MATCH (e)-[:OWNED_BY]->(u:User)
      MATCH (e)-[:ABOUT]->(t:Topic)
      RETURN u.user_id          AS user_id,
             t.name              AS topic,
             count(e)            AS frequency,
             avg(e.confidence)   AS avg_confidence,
             avg(e.final_weight) AS avg_depth,
             min(e.timestamp)    AS earliest_ts,
             max(e.timestamp)    AS latest_ts
    `, { scopeId });

    return rows.map(row => {
      const frequency = typeof row.frequency === 'object'
        ? row.frequency.toNumber?.() ?? Number(row.frequency)
        : Number(row.frequency);

      // Use latest event timestamp for recency (best signal)
      const recency = timeDecay(row.latest_ts || row.earliest_ts);
      const normalizedFreq = Math.min(1, Math.log(frequency + 1) / Math.log(10));

      const score =
        WEIGHTS.frequency  * normalizedFreq +
        WEIGHTS.recency    * recency +
        WEIGHTS.confidence * (row.avg_confidence || 0.5) +
        WEIGHTS.depth      * (row.avg_depth || 0.5);

      return {
        user_id:        row.user_id,
        topic:          row.topic,
        scope_id:       scopeId,
        score:          Math.round(score * 1000) / 1000,
        evidence_count: frequency,
        confidence:     Math.round((row.avg_confidence || 0.5) * 100) / 100,
        last_updated:   new Date().toISOString(),
      };
    });
  }

  // ─── Multi-topic upward propagation ──────────────────────────────

  /**
   * For each computed score, walk up CHILD_OF chain and add
   * decayed contributions to ancestor topics.
   * Returns enriched list including propagated entries.
   */
  applyHierarchyPropagation(expertiseList, childOfMap) {
    // childOfMap: { 'Rome' → 'Italy', 'Italy' → 'Europe', 'Europe' → 'Travel' }
    // Build a lookup: user+scope → topic → score
    const index = new Map(); // key: `${user_id}|${scope_id}|${topic}` → score entry

    for (const entry of expertiseList) {
      index.set(`${entry.user_id}|${entry.scope_id}|${entry.topic}`, entry);
    }

    const propagated = new Map(index); // clone

    // Propagate upward from each direct score
    for (const entry of expertiseList) {
      let currentTopic = entry.topic;
      let decayedScore = entry.score;
      const visited = new Set([currentTopic]); // cycle guard

      while (childOfMap[currentTopic]) {
        const parentTopic = childOfMap[currentTopic];
        if (visited.has(parentTopic)) break; // break on cycle
        visited.add(parentTopic);
        decayedScore *= PROPAGATION_DECAY;

        const parentKey = `${entry.user_id}|${entry.scope_id}|${parentTopic}`;
        if (propagated.has(parentKey)) {
          const existing = propagated.get(parentKey);
          // Add propagated contribution
          const updated = { ...existing, score: Math.round((existing.score + decayedScore) * 1000) / 1000 };
          propagated.set(parentKey, updated);
        } else {
          propagated.set(parentKey, {
            user_id:            entry.user_id,
            topic:              parentTopic,
            scope_id:           entry.scope_id,
            score:              Math.round(decayedScore * 1000) / 1000,
            evidence_count:     entry.evidence_count,
            confidence:         entry.confidence,
            last_updated:       entry.last_updated,
            contributing_events: entry.contributing_events,
            propagated_from:    entry.topic
          });
        }

        currentTopic = parentTopic;
      }
    }

    return Array.from(propagated.values());
  }

  // ─── Persist ScopedExpertise nodes ───────────────────────────────

  async storeScopedExpertiseBatch(expertiseList) {
    if (expertiseList.length === 0) return;
    await db.query(`
      UNWIND $entries AS ex
      MERGE (se:ScopedExpertise {user_id: ex.user_id, topic: ex.topic, scope_id: ex.scope_id})
      SET se.score           = ex.score,
          se.evidence_count  = ex.evidence_count,
          se.confidence      = ex.confidence,
          se.last_updated    = ex.last_updated,
          se.propagated_from = ex.propagated_from
    `, { entries: expertiseList });
  }

  // ─── Full scope update ────────────────────────────────────────────

  async updateAllScopedExpertise(scopeId) {
    console.log(`\n📊 Computing expertise for scope: ${scopeId}...`);

    // Step 1: Compute direct event-based expertise
    const directExpertise = await this.computeAllExpertiseInScope(scopeId);

    if (directExpertise.length === 0) {
      console.log('   ℹ️  No events in scope, skipping.');
      return 0;
    }

    // Step 2: Fetch CHILD_OF hierarchy for propagation
    const childOfRows = await db.query(`
      MATCH (child:Topic)-[:CHILD_OF]->(parent:Topic)
      RETURN child.name AS child, parent.name AS parent
    `);
    const childOfMap = {};
    for (const { child, parent } of childOfRows) {
      childOfMap[child] = parent;
    }

    // Step 3: Propagate upward
    const allExpertise = this.applyHierarchyPropagation(directExpertise, childOfMap);

    // Step 4: Cap scores at 1.0
    for (const e of allExpertise) {
      e.score = Math.min(1.0, Math.round(e.score * 1000) / 1000);
    }

    // Step 5: Persist
    await this.storeScopedExpertiseBatch(allExpertise);

    console.log(`   ✅ Computed ${directExpertise.length} direct + ${allExpertise.length - directExpertise.length} propagated expertise entries`);
    return allExpertise.length;
  }

  // ─── Query APIs ───────────────────────────────────────────────────

  async getUserExpertise(userId) {
    const scopes = await this.getVisibleScopes(userId);
    return db.query(`
      MATCH (se:ScopedExpertise)
      WHERE se.user_id = $userId AND se.scope_id IN $scopeIds
      RETURN se.topic AS topic, se.scope_id AS scopeId, se.score AS score,
             se.evidence_count AS evidenceCount, se.confidence AS confidence,
             se.last_updated AS lastUpdated
      ORDER BY se.score DESC
    `, { userId, scopeIds: scopes });
  }

  async findExpertsForTopic(requesterId, topicName, limit = 10) {
    const scopes = await this.getVisibleScopes(requesterId);

    // Expand topic to itself + all descendants
    const topicResult = await db.query(`
      MATCH (t:Topic {name: $topicName})
      OPTIONAL MATCH (t)<-[:CHILD_OF*0..]-(child:Topic)
      RETURN collect(DISTINCT child.name) + [$topicName] AS allTopics
    `, { topicName });

    const allTopics = topicResult[0]?.allTopics || [topicName];

    const result = await db.query(`
      MATCH (se:ScopedExpertise)
      WHERE se.topic IN $topics
        AND se.scope_id IN $scopeIds
        AND se.user_id <> $requesterId
      RETURN se.user_id AS user_id, se.topic AS topic, se.score AS score,
             se.evidence_count AS evidenceCount, se.scope_id AS scopeId,
             se.propagated_from AS propagatedFrom,
             CASE
               WHEN se.score >= 0.7 THEN 'High'
               WHEN se.score >= 0.4 THEN 'Medium'
               ELSE 'Low'
             END AS confidence_level
      ORDER BY se.score DESC
      LIMIT $limit
    `, { requesterId, topics: allTopics, scopeIds: scopes, limit });

    return result;
  }
}

module.exports = new ExpertiseAggregator();
