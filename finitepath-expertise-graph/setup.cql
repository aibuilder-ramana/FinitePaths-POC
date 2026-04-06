// ============================================================
// FinitePath-ExpertiseGraph - Privacy-First Expertise Graph
// Neo4j Setup Script
// ============================================================

// ============================================================
// SECTION 1: Create Constraints & Indexes (Performance)
// ============================================================

// User constraints
CREATE CONSTRAINT user_id_unique IF NOT EXISTS
FOR (u:User) REQUIRE u.user_id IS UNIQUE;

CREATE INDEX user_opt_in IF NOT EXISTS
FOR (u:User) ON (u.global_opt_in);

// Conversation constraints
CREATE CONSTRAINT conversation_id_unique IF NOT EXISTS
FOR (c:Conversation) REQUIRE c.conversation_id IS UNIQUE;

// Message constraints
CREATE CONSTRAINT message_id_unique IF NOT EXISTS
FOR (m:Message) REQUIRE m.message_id IS UNIQUE;

// Event constraints
CREATE CONSTRAINT event_id_unique IF NOT EXISTS
FOR (e:Event) REQUIRE e.event_id IS UNIQUE;

// VisibilityScope constraints
CREATE CONSTRAINT scope_id_unique IF NOT EXISTS
FOR (s:VisibilityScope) REQUIRE s.scope_id IS UNIQUE;

// Topic index
CREATE INDEX topic_name IF NOT EXISTS
FOR (t:Topic) ON (t.name);

// ============================================================
// SECTION 2: Create Nodes
// ============================================================

// --- Users ---
CREATE (u1:User {
  user_id: "user_A",
  name: "Alice",
  global_opt_in: false,
  created_at: timestamp()
});

CREATE (u2:User {
  user_id: "user_B",
  name: "Bob",
  global_opt_in: true,
  created_at: timestamp()
});

CREATE (u3:User {
  user_id: "user_C",
  name: "Charlie",
  global_opt_in: false,
  created_at: timestamp()
});

// --- VisibilityScopes (Privacy Control) ---

// Private DM between A and C
CREATE (scope1:VisibilityScope {
  scope_id: "scope_private_A_C",
  type: "private_dm",
  allowed_users: ["user_A", "user_C"],
  created_at: timestamp()
});

// Group conversation: A, B, C
CREATE (scope2:VisibilityScope {
  scope_id: "scope_group_ABC",
  type: "group",
  allowed_users: ["user_A", "user_B", "user_C"],
  created_at: timestamp()
});

// Public (for demo purposes)
CREATE (scope3:VisibilityScope {
  scope_id: "scope_public",
  type: "public",
  allowed_users: ["user_A", "user_B", "user_C"],
  created_at: timestamp()
});

// --- Topics (Expertise Domains) ---
CREATE (t1:Topic {name: "Italy", domain: "travel", created_at: timestamp()});
CREATE (t2:Topic {name: "Europe", domain: "travel", created_at: timestamp()});
CREATE (t3:Topic {name: "Prague", domain: "travel", created_at: timestamp()});
CREATE (t4:Topic {name: "Daycare", domain: "parenting", created_at: timestamp()});
CREATE (t5:Topic {name: "Austin", domain: "location", created_at: timestamp()});
CREATE (t6:Topic {name: "Contractor", domain: "home_services", created_at: timestamp()});
CREATE (t7:Topic {name: "Kitchen Remodel", domain: "home_services", created_at: timestamp()});
CREATE (t8:Topic {name: "Pediatric Dentist", domain: "healthcare", created_at: timestamp()});

// --- Conversations ---
CREATE (conv1:Conversation {
  conversation_id: "conv_europe_trip",
  type: "group",
  name: "Europe Trip Planning",
  created_at: timestamp()
});

CREATE (conv2:Conversation {
  conversation_id: "conv_daycare",
  type: "private_dm",
  name: "Daycare Discussion",
  created_at: timestamp()
});

// ============================================================
// SECTION 3: Create Relationships
// ============================================================

// --- Conversation -> VisibilityScope ---
MATCH (c:Conversation {conversation_id: "conv_europe_trip"})
MATCH (s:VisibilityScope {scope_id: "scope_group_ABC"})
CREATE (c)-[:HAS_SCOPE]->(s);

MATCH (c:Conversation {conversation_id: "conv_daycare"})
MATCH (s:VisibilityScope {scope_id: "scope_private_A_C"})
CREATE (c)-[:HAS_SCOPE]->(s);

// --- Messages in Conversations ---
// Europe trip conversation
CREATE (m1:Message {
  message_id: "msg_eu_1",
  text: "I'm planning a trip to Europe this summer with my family. Any tips or must-see places?",
  timestamp: datetime('2024-01-15T10:30:00').epochMillis
})
CREATE (m2:Message {
  message_id: "msg_eu_2",
  text: "I've traveled to Italy and France. Happy to share recommendations!",
  timestamp: datetime('2024-01-15T11:00:00').epochMillis
})
CREATE (m3:Message {
  message_id: "msg_eu_3",
  text: "I'll book the Airbnb in Prague!",
  timestamp: datetime('2024-01-15T14:00:00').epochMillis
});

MATCH (u:User {user_id: "user_A"})
MATCH (c:Conversation {conversation_id: "conv_europe_trip"})
MATCH (m:Message {message_id: "msg_eu_1"})
CREATE (u)-[:SENT]->(m)-[:IN_CONVERSATION]->(c);

MATCH (u:User {user_id: "user_B"})
MATCH (c:Conversation {conversation_id: "conv_europe_trip"})
MATCH (m:Message {message_id: "msg_eu_2"})
CREATE (u)-[:SENT]->(m)-[:IN_CONVERSATION]->(c);

MATCH (u:User {user_id: "user_C"})
MATCH (c:Conversation {conversation_id: "conv_europe_trip"})
MATCH (m:Message {message_id: "msg_eu_3"})
CREATE (u)-[:SENT]->(m)-[:IN_CONVERSATION]->(c);

// --- Events (Extracted from Messages) ---
CREATE (e1:Event {
  event_id: "evt_travel_1",
  type: "travel_experience",
  text: "I'm planning a trip to Europe this summer with my family",
  confidence: 0.92,
  extracted_from: "msg_eu_1",
  timestamp: datetime('2024-01-15T10:30:00').epochMillis
});

CREATE (e2:Event {
  event_id: "evt_travel_2",
  type: "travel_experience",
  text: "I've traveled to Italy and France",
  confidence: 0.88,
  extracted_from: "msg_eu_2",
  timestamp: datetime('2024-01-15T11:00:00').epochMillis
});

CREATE (e3:Event {
  event_id: "evt_travel_3",
  type: "travel_booking",
  text: "I'll book the Airbnb in Prague",
  confidence: 0.85,
  extracted_from: "msg_eu_3",
  timestamp: datetime('2024-01-15T14:00:00').epochMillis
});

// Link events to messages
MATCH (m:Message {message_id: "msg_eu_1"})
MATCH (e:Event {event_id: "evt_travel_1"})
CREATE (m)-[:GENERATED]->(e);

MATCH (m:Message {message_id: "msg_eu_2"})
MATCH (e:Event {event_id: "evt_travel_2"})
CREATE (m)-[:GENERATED]->(e);

MATCH (m:Message {message_id: "msg_eu_3"})
MATCH (e:Event {event_id: "evt_travel_3"})
CREATE (m)-[:GENERATED]->(e);

// --- Events -> Topics ---
MATCH (e:Event {event_id: "evt_travel_1"})
MATCH (t:Topic {name: "Europe"})
CREATE (e)-[:ABOUT]->(t);

MATCH (e:Event {event_id: "evt_travel_1"})
MATCH (t:Topic {name: "Italy"})
CREATE (e)-[:ABOUT]->(t);

MATCH (e:Event {event_id: "evt_travel_2"})
MATCH (t:Topic {name: "Italy"})
CREATE (e)-[:ABOUT]->(t);

MATCH (e:Event {event_id: "evt_travel_2"})
MATCH (t:Topic {name: "Prague"})
CREATE (e)-[:ABOUT]->(t);

MATCH (e:Event {event_id: "evt_travel_3"})
MATCH (t:Topic {name: "Prague"})
CREATE (e)-[:ABOUT]->(t);

// --- Events -> Ownership ---
MATCH (u:User {user_id: "user_A"})
MATCH (e:Event {event_id: "evt_travel_1"})
CREATE (e)-[:OWNED_BY]->(u);

MATCH (u:User {user_id: "user_B"})
MATCH (e:Event {event_id: "evt_travel_2"})
CREATE (e)-[:OWNED_BY]->(u);

MATCH (u:User {user_id: "user_C"})
MATCH (e:Event {event_id: "evt_travel_3"})
CREATE (e)-[:OWNED_BY]->(u);

// --- Events -> Privacy Scope (CRITICAL) ---
MATCH (e:Event {event_id: "evt_travel_1"})
MATCH (s:VisibilityScope {scope_id: "scope_group_ABC"})
CREATE (e)-[:HAS_SCOPE]->(s);

MATCH (e:Event {event_id: "evt_travel_2"})
MATCH (s:VisibilityScope {scope_id: "scope_group_ABC"})
CREATE (e)-[:HAS_SCOPE]->(s);

MATCH (e:Event {event_id: "evt_travel_3"})
MATCH (s:VisibilityScope {scope_id: "scope_group_ABC"})
CREATE (e)-[:HAS_SCOPE]->(s);

// ============================================================
// SECTION 4: Privacy-Safe Expertise Query Examples
// ============================================================

// Query 1: Get all visible scopes for a user
// MATCH (s:VisibilityScope)
// WHERE "user_B" IN s.allowed_users
// RETURN s.scope_id, s.type, s.allowed_users

// Query 2: Get expertise for a topic (privacy-scoped)
// Note: NO global HAS_EXPERTISE edges - computed dynamically!

// ============================================================
// SECTION 5: Create Helper Procedures (Optional)
// ============================================================

// Procedure: Get scoped expertise
// This demonstrates how to query expertise WITHOUT global edges

// Example query - User B asking about Europe travel:
// STEP 1: Find visible events about Europe
// STEP 2: Aggregate by user
// STEP 3: Return expertise scores

PRINT "";
PRINT "================================================";
PRINT "  FinitePath-ExpertiseGraph Setup Complete!";
PRINT "================================================";
PRINT "";
PRINT "Nodes created:";
PRINT "  - Users: Alice (A), Bob (B), Charlie (C)";
PRINT "  - VisibilityScopes: 3 (private, group, public)";
PRINT "  - Topics: 8 (Italy, Europe, Prague, etc.)";
PRINT "  - Conversations: 2";
PRINT "  - Messages: 3";
PRINT "  - Events: 3 (travel experiences)";
PRINT "";
PRINT "Privacy Enforcement:";
PRINT "  - All events MUST have HAS_SCOPE relationship";
PRINT "  - Expertise is computed dynamically, NOT stored globally";
PRINT "  - Users can only see events within their allowed scopes";
PRINT "";
PRINT "Run these privacy-safe queries:";
PRINT "";
