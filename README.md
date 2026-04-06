# FinitePaths-POC

Proof of Concept projects for FinitePaths application.

## Projects

### 1. FinitePath-ExpertiseGraph
Privacy-first expertise graph using Neo4j.

**Location:** `finitepath-expertise-graph/`

**Setup:**
1. Open Neo4j Desktop
2. Create new database: `FinitePath-ExpertiseGraph`
3. Run `finitepath-expertise-graph/setup.cql` in Neo4j Browser
4. Run example queries from `finitepath-expertise-graph/queries.cql`

### 2. Datastorage Service
REST API service for storing chat messages in PostgreSQL.

**Location:** `datastorage-service/`

**Setup:**
1. Create PostgreSQL database: `finitepaths`
2. Install dependencies: `npm install`
3. Configure environment: `cp .env.example .env`
4. Run migrations: `npm run migrate`
5. Start server: `npm start`

**API Endpoints:**
- `POST /api/conversations` - Create conversation
- `GET /api/conversations` - List user's conversations
- `POST /api/messages` - Send message
- `GET /api/messages/conversations/:id/messages` - Get messages (paginated)

**Documentation:** `datastorage-service/README.md`

## Getting Started

1. Install prerequisites (Node.js, PostgreSQL, Neo4j)
2. Set up each service following the instructions in their respective READMEs
