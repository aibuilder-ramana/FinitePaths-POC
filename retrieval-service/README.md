# Retrieval Service

The `retrieval-service` is a Node/Express API that answers the question: **who in my community can help with this need?** It accepts a natural-language request, extracts the user's intent and topics with an LLM, searches a Neo4j expertise graph for matching people the requester is allowed to see, then uses the LLM again to rank those people and explain the matches as warm, human-readable referrals.

## What It Does

At a high level, the service implements an LLM-friendly retrieval layer:

```text
natural-language query -> intent extraction -> privacy-scoped graph query -> LLM ranking
```

For example, a request like "I need help planning Europe travel" can be expanded into travel-related topics such as `Europe`, `Italy`, `France`, or `Switzerland`. The service then looks for people with visible expertise in those topics and returns ranked referrals with short reasons explaining why each person is a good fit.

## Main API

### `POST /api/retrieve`

Request body:

```json
{
  "query": "I need help planning Europe travel",
  "requester_id": "user_03",
  "limit": 5
}
```

Response shape:

```json
{
  "query": "I need help planning Europe travel",
  "intent": {
    "intent": "travel_help",
    "entities": ["Europe"],
    "expanded_entities": ["Europe", "Italy", "France", "Switzerland"]
  },
  "results": [
    {
      "user_id": "user_01",
      "user_name": "Alice Smith",
      "rank": 1,
      "match_strength": "strong",
      "reason": "Alice has done the Italy and France planning loop and can share practical hotel and itinerary tips.",
      "relevant_topics": ["Italy", "France"],
      "expertise_score": 0.82
    }
  ],
  "meta": {
    "candidates_found": 1,
    "duration_ms": 1234
  }
}
```

Required fields:

- `query`: non-empty natural-language request
- `requester_id`: the user asking for help

Optional fields:

- `limit`: maximum number of candidates to retrieve before ranking; defaults to `5`

### `GET /health`

Returns service health and Neo4j connection status:

```json
{
  "status": "ok",
  "service": "retrieval-service",
  "neo4j": "connected",
  "timestamp": "2026-06-17T00:00:00.000Z"
}
```

If Neo4j is unavailable, the status becomes `degraded`.

## How Retrieval Works

1. **Intent extraction**

   `src/services/intentExtractor.js` sends the raw user query to Groq's OpenAI-compatible chat completion API. The model returns structured JSON containing:

   - `intent`: high-level category such as `travel_help`, `healthcare_advice`, or `tech_support`
   - `entities`: topics explicitly mentioned in the query
   - `expanded_entities`: inferred related topics that may improve recall

2. **Visibility lookup**

   `src/services/graphQuerier.js` first finds all `VisibilityScope` nodes available to the requester. A scope is visible when the requester's id appears in `allowed_users`, or when the scope includes `*`.

3. **Topic expansion**

   The service expands candidate topics using two mechanisms:

   - Neo4j topic hierarchy via `Topic` nodes and `CHILD_OF` relationships
   - optional fuzzy topic matches from an embedding service at `EMBEDDING_SERVICE_URL`, defaulting to `http://localhost:3004`

4. **Graph candidate search**

   The service queries `ScopedExpertise` nodes for matching topics within visible scopes. It excludes the requester from results, sorts candidates by expertise score, and collects supporting evidence from visible `Event` nodes connected to matching topics.

5. **LLM ranking and explanation**

   `src/services/llmRanker.js` sends the graph candidates, expertise topics, scores, and evidence snippets back to the LLM. The model returns a ranked JSON array with conversational referral reasons and match strengths.

## Privacy Model

The service is designed around privacy-scoped retrieval. It does not simply search all expertise in the graph. Instead, candidate expertise must belong to a `VisibilityScope` that the requester can access. This lets the graph represent private DMs, group conversations, public/global expertise, or other permission boundaries while keeping retrieval constrained to what the requester is allowed to know.

## Configuration

Create a `.env` file using `.env.example` as a starting point:

```env
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your_password_here
NEO4J_DATABASE=neo4j

GROQ_API_KEY=your_groq_api_key_here
MODEL=llama-3.3-70b-versatile

PORT=3003
```

Optional:

```env
EMBEDDING_SERVICE_URL=http://localhost:3004
```

## Running Locally

Install dependencies:

```bash
npm install
```

Start the service:

```bash
npm start
```

For watch mode during development:

```bash
npm run dev
```

By default, the service runs on:

```text
http://localhost:3003
```

## Important Notes

- The service currently uses Groq through `src/config/groq.js` and Axios.
- `package.json` includes `@anthropic-ai/sdk`, but the current retrieval path does not use Anthropic directly.
- The fuzzy embedding expansion is best-effort. If the embedding service is unavailable or times out, retrieval continues using the LLM-expanded and graph-expanded topics.
- The service returns `500` if the LLM calls or graph query pipeline fail during retrieval.
