// ============================================================
// Privacy-Safe Expertise Query Examples
// Deju-ExpertiseGraph
// ============================================================

// ============================================================
// QUERY 1: Get All Visible Scopes for a User
// ============================================================
MATCH (s:VisibilityScope)
WHERE "user_B" IN s.allowed_users
RETURN s.scope_id AS scope_id, 
       s.type AS type, 
       s.allowed_users AS allowed_users;


// ============================================================
// QUERY 2: Get Events Visible to User (Scoped)
// ============================================================
// User B asks: "What events about Europe travel am I allowed to see?"
MATCH (e:Event)-[:HAS_SCOPE]->(s:VisibilityScope)
WHERE "user_B" IN s.allowed_users
MATCH (e)-[:ABOUT]->(t:Topic {name: "Europe"})
MATCH (e)-[:OWNED_BY]->(u:User)
RETURN e.event_id AS event_id,
       e.text AS event_text,
       e.confidence AS confidence,
       u.name AS owner,
       s.type AS scope_type;


// ============================================================
// QUERY 3: Compute Scoped Expertise (Dynamic - NO Global Edges!)
// ============================================================
// User B asks: "Who knows about Europe travel?" (PRIVACY-SAFE)
MATCH (e:Event)-[:ABOUT]->(t:Topic)
MATCH (e)-[:OWNED_BY]->(u:User)
MATCH (e)-[:HAS_SCOPE]->(s:VisibilityScope)
WHERE "user_B" IN s.allowed_users
  AND t.name IN ["Europe", "Italy", "Prague"]
WITH u, t, COUNT(e) AS evidence_count, AVG(e.confidence) AS avg_confidence
RETURN u.user_id AS user_id,
       u.name AS name,
       COLLECT(t.name) AS topics,
       evidence_count,
       ROUND(avg_confidence * 100) / 100 AS expertise_score
ORDER BY expertise_score DESC;


// ============================================================
// QUERY 4: Privacy Violation Check
// ============================================================
// Verify that global HAS_EXPERTISE edges DON'T exist
// (This is intentional - prevents leakage)
MATCH (u:User)-[e:HAS_EXPERTISE]->(t:Topic)
RETURN u.user_id, t.name, e.score
ORDER BY u.user_id;

// Expected result: EMPTY (no global expertise edges!)


// ============================================================
// QUERY 5: Add New Event with Mandatory Scope
// ============================================================
// SAFE PATTERN - Always bind event to scope
CREATE (e:Event {
  event_id: "evt_new_experience",
  type: "recommendation",
  text: "I highly recommend the hotel near the Colosseum",
  confidence: 0.95,
  timestamp: timestamp()
})
WITH e
MATCH (u:User {user_id: "user_A"})
MATCH (m:Message {message_id: "msg_eu_1"})
MATCH (t:Topic {name: "Italy"})
MATCH (s:VisibilityScope {scope_id: "scope_group_ABC"})
CREATE (u)-[:SENT]->(m)-[:GENERATED]->(e)
CREATE (e)-[:ABOUT]->(t)
CREATE (e)-[:OWNED_BY]->(u)
CREATE (e)-[:HAS_SCOPE]->(s)
RETURN e, u, t, s;


// ============================================================
// QUERY 6: Scope Intersection Check (Advanced)
// ============================================================
// When aggregating from multiple events, ensure ALL are visible
MATCH (u:User {user_id: "user_B"})
MATCH (e:Event)-[:ABOUT]->(t:Topic {name: "Italy"})
MATCH (e)-[:HAS_SCOPE]->(s:VisibilityScope)
// Only include if requester is in ALL contributing event scopes
WHERE ALL(scope_id IN COLLECT(s.scope_id) 
      WHERE "user_B" IN (s.allowed_users))
WITH u, COUNT(e) AS visible_events, AVG(e.confidence) AS score
RETURN u.user_id, visible_events, ROUND(score * 100) / 100 AS expertise_score;


// ============================================================
// QUERY 7: Find Mutual Connections with Expertise
// ============================================================
// User A wants to find who B and C can ask about Italy
MATCH (requester:User {user_id: "user_A"})
MATCH (e:Event)-[:ABOUT]->(t:Topic {name: "Italy"})
MATCH (expert:User)-[:OWNED_BY]->(e)
MATCH (e)-[:HAS_SCOPE]->(s:VisibilityScope)
WHERE "user_A" IN s.allowed_users
  AND expert.user_id <> "user_A"
WITH expert, COUNT(e) AS evidence, AVG(e.confidence) AS score
WHERE evidence >= 1
RETURN expert.user_id AS expert_id,
       expert.name AS expert_name,
       evidence,
       ROUND(score * 100) / 100 AS expertise_score
ORDER BY expertise_score DESC;


// ============================================================
// QUERY 8: Get Topic Network (Domain Graph)
// ============================================================
// Understand topic relationships
MATCH (t1:Topic)-[r:ABOUT]-(e:Event)-[:ABOUT]-(t2:Topic)
WHERE t1 <> t2
WITH t1, t2, COUNT(e) AS shared_events
RETURN t1.name AS topic_1,
       t2.name AS topic_2,
       shared_events
ORDER BY shared_events DESC
LIMIT 20;


// ============================================================
// QUERY 9: Privacy Audit - What Can User X See?
// ============================================================
// Comprehensive visibility audit
PARAM { requester_id: "user_B" }

MATCH (e:Event)-[:HAS_SCOPE]->(s:VisibilityScope)
WHERE $requester_id IN s.allowed_users
MATCH (e)-[:OWNED_BY]->(u:User)
MATCH (e)-[:ABOUT]->(t:Topic)
RETURN e.event_id AS event_id,
       e.type AS event_type,
       u.name AS owner,
       COLLECT(t.name) AS topics,
       s.type AS scope_type,
       e.confidence AS confidence
ORDER BY s.type, e.timestamp DESC;


// ============================================================
// QUERY 10: Suggested Experts for Topic (Scoped)
// ============================================================
PARAM { requester_id: "user_A", topic_name: "Europe", min_evidence: 1 }

MATCH (requester:User {user_id: $requester_id})
MATCH (e:Event)-[:ABOUT]->(t:Topic {name: $topic_name})
MATCH (expert:User)-[:OWNED_BY]->(e)
MATCH (e)-[:HAS_SCOPE]->(s:VisibilityScope)
WHERE $requester_id IN s.allowed_users
  AND expert.user_id <> $requester_id
WITH expert, COUNT(e) AS evidence_count, AVG(e.confidence) AS score
WHERE evidence_count >= $min_evidence
RETURN expert.user_id AS expert_id,
       expert.name AS expert_name,
       evidence_count,
       ROUND(score * 100) / 100 AS expertise_score,
       CASE 
         WHEN score >= 0.9 THEN "High"
         WHEN score >= 0.7 THEN "Medium"
         ELSE "Low"
       END AS confidence_level
ORDER BY expertise_score DESC;
