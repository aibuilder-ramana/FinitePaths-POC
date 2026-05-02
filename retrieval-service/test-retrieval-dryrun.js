/**
 * Dry-run test: 10 synthetic user vibes
 *
 * Steps 1 & 3 (LLM) use pre-specified intents and score-based ranking
 * because the Groq key is rate-limited.
 * Step 2 (Neo4j graph query) runs against the live expertise graph.
 *
 * Output: ../e2e-output/retrieval-test-results.json
 */

require('dotenv').config();
const fs    = require('fs');
const path  = require('path');
const neo4j = require('neo4j-driver');
const db    = require('./src/config/neo4j');

const OUTPUT_PATH = path.join(__dirname, '../e2e-output/retrieval-test-results.json');

// ── 10 Synthetic user vibes with pre-specified intents ────────────────────────
const TEST_VIBES = [
  {
    vibe_id: 1,
    scenario: "Europe Travel Planning",
    requester_id: "user_03",
    requester_name: "Ava Lee",
    query: "I need help planning a trip to Europe — any must-see places or travel tips?",
    intent: {
      intent: "travel_help",
      entities: ["Europe"],
      expanded_entities: ["Europe", "Travel", "Spain", "Barcelona", "World"]
    }
  },
  {
    vibe_id: 2,
    scenario: "Restaurant Discovery — Ramen & Asian Food",
    requester_id: "user_08",
    requester_name: "Jackson Brown",
    query: "Looking for the best ramen spots and Asian restaurants in the city",
    intent: {
      intent: "restaurant_recommendation",
      entities: ["Ramen", "Asian food"],
      expanded_entities: ["Ramen", "Restaurant", "Food", "Asia", "BBQ", "Pizza"]
    }
  },
  {
    vibe_id: 3,
    scenario: "Home Improvement — Kitchen Remodel",
    requester_id: "user_06",
    requester_name: "Ethan Hall",
    query: "I'm planning a kitchen remodel and need a reliable contractor recommendation",
    intent: {
      intent: "home_service_recommendation",
      entities: ["Kitchen Remodel", "Contractor"],
      expanded_entities: ["Kitchen Remodel", "Contractor", "Home Contractor", "Home", "Plumber", "Electrician"]
    }
  },
  {
    vibe_id: 4,
    scenario: "Parenting — School & Education",
    requester_id: "user_19",
    requester_name: "Abigail Russell",
    query: "My kid is starting school next year, need advice on schools and education options",
    intent: {
      intent: "parenting_advice",
      entities: ["School", "Education"],
      expanded_entities: ["School", "Education", "Parenting", "Family", "Summer Camp"]
    }
  },
  {
    vibe_id: 5,
    scenario: "Healthcare — Pediatrician",
    requester_id: "user_11",
    requester_name: "Hannah Taylor",
    query: "Looking for a good pediatrician recommendation for my toddler",
    intent: {
      intent: "healthcare_recommendation",
      entities: ["Pediatrician"],
      expanded_entities: ["Pediatrician", "Healthcare", "Medical", "Specialty", "Speech Therapy"]
    }
  },
  {
    vibe_id: 6,
    scenario: "Tech — MacBook & Apple Products",
    requester_id: "user_15",
    requester_name: "Samantha Brooks",
    query: "Should I buy a MacBook for college? Looking for tech advice and recommendations",
    intent: {
      intent: "tech_recommendation",
      entities: ["MacBook"],
      expanded_entities: ["MacBook", "Technology", "Product", "Category", "Electric Vehicle"]
    }
  },
  {
    vibe_id: 7,
    scenario: "Southeast Asia Travel",
    requester_id: "user_04",
    requester_name: "David Kim",
    query: "I want to backpack through Southeast Asia — Vietnam, Thailand, Cambodia. Who has been there?",
    intent: {
      intent: "travel_help",
      entities: ["Vietnam", "Thailand", "Cambodia"],
      expanded_entities: ["Vietnam", "Thailand", "Cambodia", "Asia", "Travel", "World"]
    }
  },
  {
    vibe_id: 8,
    scenario: "Local Food — BBQ & South Lamar",
    requester_id: "user_18",
    requester_name: "William Harris",
    query: "Best BBQ and local restaurants around South Lamar in Austin?",
    intent: {
      intent: "restaurant_recommendation",
      entities: ["BBQ", "South Lamar", "Austin"],
      expanded_entities: ["BBQ", "South Lamar", "Austin", "Lamar", "Restaurant", "Food", "Pizza", "Bakery"]
    }
  },
  {
    vibe_id: 9,
    scenario: "Home Services — Electrician & Plumber",
    requester_id: "user_16",
    requester_name: "Benjamin Lewis",
    query: "My house needs electrical work and possibly plumbing — who knows a good electrician or plumber?",
    intent: {
      intent: "home_service_recommendation",
      entities: ["Electrician", "Plumber"],
      expanded_entities: ["Electrician", "Plumber", "Contractor", "Home Contractor", "Home", "Service"]
    }
  },
  {
    vibe_id: 10,
    scenario: "Parenting — Speech Therapy & Summer Camp",
    requester_id: "user_13",
    requester_name: "Charlotte White",
    query: "Looking for speech therapy options and summer camp recommendations for my 6-year-old",
    intent: {
      intent: "parenting_advice",
      entities: ["Speech Therapy", "Summer Camp"],
      expanded_entities: ["Speech Therapy", "Summer Camp", "Parenting", "Family", "Education", "School", "Pediatrician", "Healthcare"]
    }
  }
];

// ── Step 2: Real Neo4j graph query ────────────────────────────────────────────

async function getVisibleScopes(requesterId) {
  const rows = await db.query(`
    MATCH (s:VisibilityScope)
    WHERE $requesterId IN s.allowed_users OR '*' IN s.allowed_users
    RETURN s.scope_id AS scopeId
  `, { requesterId });
  return rows.map(r => r.scopeId);
}

async function expandTopicsWithHierarchy(topics) {
  if (topics.length === 0) return topics;
  const rows = await db.query(`
    UNWIND $topics AS topicName
    OPTIONAL MATCH (t:Topic {name: topicName})
    OPTIONAL MATCH (t)<-[:CHILD_OF*0..]-(child:Topic)
    WITH topicName, collect(DISTINCT child.name) AS children
    RETURN children + [topicName] AS allTopics
  `, { topics });

  const expanded = new Set(topics);
  for (const row of rows) {
    for (const t of (row.allTopics || [])) { if (t) expanded.add(t); }
  }
  return Array.from(expanded);
}

async function findCandidates(requesterId, expandedTopics, limit = 3) {
  const visibleScopes = await getVisibleScopes(requesterId);
  if (visibleScopes.length === 0) return [];

  const allTopics = await expandTopicsWithHierarchy(expandedTopics);

  const topUsers = await db.query(`
    MATCH (se:ScopedExpertise)
    WHERE se.topic IN $topics
      AND se.scope_id IN $scopeIds
      AND se.user_id <> $requesterId
    WITH se.user_id AS user_id, max(se.score) AS top_score
    ORDER BY top_score DESC
    LIMIT $limit
    RETURN user_id, top_score
  `, { requesterId, topics: allTopics, scopeIds: visibleScopes, limit: neo4j.int(limit) });

  if (topUsers.length === 0) return [];

  const topUserIds  = topUsers.map(r => r.user_id);
  const topScoreMap = new Map(topUsers.map(r => [r.user_id, r.top_score]));

  const detailRows = await db.query(`
    UNWIND $userIds AS uid
    MATCH (u:User {user_id: uid})
    OPTIONAL MATCH (se:ScopedExpertise)
    WHERE se.user_id = uid AND se.topic IN $topics AND se.scope_id IN $scopeIds
    OPTIONAL MATCH (e:Event)-[:OWNED_BY]->(u)
    OPTIONAL MATCH (e)-[:ABOUT]->(t:Topic)
    WHERE t.name IN $topics
    OPTIONAL MATCH (e)-[:HAS_SCOPE]->(s:VisibilityScope)
    WHERE s.scope_id IN $scopeIds
    WITH u.user_id AS user_id,
         u.name    AS user_name,
         collect(DISTINCT {topic: se.topic, score: se.score}) AS expertise_entries,
         collect(DISTINCT {event_type: e.event_type, confidence: e.confidence, topic: t.name})[0..5] AS evidence_events
    RETURN user_id, user_name, expertise_entries, evidence_events
  `, { userIds: topUserIds, topics: allTopics, scopeIds: visibleScopes });

  return detailRows
    .map(r => ({ ...r, top_score: topScoreMap.get(r.user_id) || 0 }))
    .sort((a, b) => b.top_score - a.top_score);
}

// ── Step 3: Score-based ranking (replaces LLM while rate-limited) ─────────────

function scoreBasedRanking(candidates, intent) {
  return candidates.map((c, i) => {
    const matchStrength = c.top_score >= 0.6 ? 'strong' : c.top_score >= 0.4 ? 'moderate' : 'weak';
    const topTopics = (c.expertise_entries || [])
      .filter(e => e.topic && e.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(e => `${e.topic} (${e.score?.toFixed(2)})`);

    const eventTypes = [...new Set(
      (c.evidence_events || []).filter(e => e?.event_type).map(e => e.event_type)
    )];

    const reason = topTopics.length > 0
      ? `Expertise in ${topTopics.join(', ')}${eventTypes.length ? `. Evidence: ${eventTypes.join(', ')}` : ''}`
      : `Expertise score ${c.top_score?.toFixed(3)} — no direct event evidence in visible scope`;

    return {
      user_id:         c.user_id,
      user_name:       c.user_name || c.user_id,
      rank:            i + 1,
      match_strength:  matchStrength,
      expertise_score: Math.round((c.top_score || 0) * 1000) / 1000,
      reason,
      relevant_topics: topTopics.map(t => t.split(' (')[0])
    };
  });
}

// ── Main test runner ──────────────────────────────────────────────────────────

async function runVibe(vibe) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`[${vibe.vibe_id}/10] ${vibe.scenario}`);
  console.log(`Requester : ${vibe.requester_name} (${vibe.requester_id})`);
  console.log(`Query     : "${vibe.query}"`);
  console.log(`Intent    : ${vibe.intent.intent} | entities: [${vibe.intent.entities.join(', ')}]`);

  const startTime = Date.now();
  try {
    // Step 2: Graph query
    const candidates = await findCandidates(
      vibe.requester_id,
      vibe.intent.expanded_entities,
      3
    );

    // Step 3: Rank
    const results = scoreBasedRanking(candidates, vibe.intent.intent);

    const duration = Date.now() - startTime;

    console.log(`  Candidates: ${candidates.length}`);
    results.forEach(r => {
      console.log(`    ${r.rank}. ${r.user_id} — ${r.match_strength} (${r.expertise_score})`);
      console.log(`       ${r.reason}`);
    });

    return {
      vibe_id:        vibe.vibe_id,
      scenario:       vibe.scenario,
      status:         'success',
      input: {
        query:        vibe.query,
        requester_id: vibe.requester_id,
        requester_name: vibe.requester_name,
        limit:        3
      },
      output: {
        intent:  vibe.intent,
        results,
        meta: {
          candidates_found: candidates.length,
          expanded_topic_count: vibe.intent.expanded_entities.length,
          duration_ms: duration,
          llm_steps: "dry_run (Groq rate-limited — score-based ranking used for steps 1 & 3)"
        }
      }
    };
  } catch (err) {
    console.error(`  ❌ Error: ${err.message}`);
    return {
      vibe_id:  vibe.vibe_id,
      scenario: vibe.scenario,
      status:   'error',
      input: { query: vibe.query, requester_id: vibe.requester_id },
      output: { error: err.message }
    };
  }
}

async function main() {
  console.log('🧪 Dry-run: 10 synthetic user vibe tests (real Neo4j, mocked LLM)\n');

  await db.verifyConnection();

  const vibeResults = [];
  for (const vibe of TEST_VIBES) {
    const result = await runVibe(vibe);
    vibeResults.push(result);
  }

  await db.closeConnection();

  const summary = {
    test_run: {
      timestamp:     new Date().toISOString(),
      mode:          "dry_run",
      note:          "Steps 1 & 3 (LLM) are pre-specified/score-based. Step 2 (Neo4j) runs against live expertise graph.",
      total_vibes:   TEST_VIBES.length,
      successful:    vibeResults.filter(r => r.status === 'success').length,
      failed:        vibeResults.filter(r => r.status === 'error').length,
      neo4j_scope:   "scope_group_ABC (allowed_users: ['*'])"
    },
    vibes: vibeResults
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(summary, null, 2));

  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ Dry-run complete`);
  console.log(`   Successful : ${summary.test_run.successful}/${summary.test_run.total_vibes}`);
  console.log(`   Output     : ${OUTPUT_PATH}`);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
