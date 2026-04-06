# FinitePaths-POC

Proof of Concept project for FinitePaths application.

## Projects

### FinitePath-ExpertiseGraph
Privacy-first expertise graph using Neo4j.

**Location:** `finitepath-expertise-graph/`

**Setup:**
1. Open Neo4j Desktop
2. Create new database: `FinitePath-ExpertiseGraph`
3. Run `finitepath-expertise-graph/setup.cql` in Neo4j Browser
4. Run example queries from `finitepath-expertise-graph/queries.cql`

**Key Features:**
- Privacy-scoped events (no global knowledge leakage)
- Dynamic expertise computation
- VisibilityScope nodes enforce access control
- Evidence-backed knowledge with provenance

**Schema:**
- User, Conversation, Message, Event, Topic, VisibilityScope nodes
- All edges carry privacy context via HAS_SCOPE relationships
- NO global HAS_EXPERTISE edges (computed dynamically only)

## Getting Started

1. Install Neo4j Desktop from https://neo4j.com/download/
2. Create a new database named `FinitePath-ExpertiseGraph`
3. Run the setup script to populate sample data
4. Explore privacy-safe query patterns

## Documentation

See individual project folders for detailed documentation.
