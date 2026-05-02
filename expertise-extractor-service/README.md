# Expertise-Extractor Service

Extracts expertise from semantic events and ingests into Neo4j with privacy-preserving scope binding.

## Features

- **LLM-Powered Topic Normalization**: Maps entities to hierarchical taxonomy
- **Event Weighting**: Calculates signal strength based on type, sentiment, and depth
- **Scope Binding**: Privacy-preserving expertise computation
- **Topic Hierarchy**: Builds knowledge graph with parent-child relationships
- **Scoped Expertise**: Pre-computed expertise scores per user/topic/scope

## Architecture

```
Semantic Events (JSON)
       ↓
[1] Topic Normalization (LLM)
       ↓
[2] Event Weighting
       ↓
[3] Scope Binding (Privacy)
       ↓
[4] Topic Hierarchy (Neo4j)
       ↓
[5] Scoped Expertise Aggregation
       ↓
[6] Expertise Report
```

## Prerequisites

- Node.js 18+
- Neo4j running (with Deju-ExpertiseGraph database)
- Groq API key

## Setup

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your Neo4j and Groq credentials
```

## Usage

```bash
# Run pipeline
npm start
```

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| NEO4J_URI | Neo4j connection URI | bolt://localhost:7687 |
| NEO4J_USER | Neo4j username | neo4j |
| NEO4J_PASSWORD | Neo4j password | (required) |
| GROQ_API_KEY | Groq API key | (required) |
| MODEL | LLM model | llama-3.3-70b-versatile |
| INPUT_PATH | Semantic events input | ./input/semantic-events.json |
| OUTPUT_PATH | Report output | ./output/expertise-report.json |

## Output Format

```json
{
  "generated_at": "2024-01-20T10:00:00Z",
  "pipeline_stats": {
    "events_processed": 8,
    "topics_normalized": 15
  },
  "topic_hierarchy": {
    "Italy": [{"child": "Rome", "category": "Travel"}]
  },
  "scoped_expertise": [
    {
      "user_id": "user_B",
      "topic": "Italy",
      "scope_id": "scope_group_ABC",
      "score": 0.82,
      "evidence_count": 3,
      "contributing_events": ["evt_001", "evt_002"]
    }
  ]
}
```

## Expertise Scoring

Score = (0.3 × frequency_norm) + (0.3 × recency) + (0.2 × confidence) + (0.2 × depth)

Where:
- **frequency_norm**: Log-normalized count of events
- **recency**: Time decay using exp(-0.05 × days)
- **confidence**: Average event confidence
- **depth**: Average weighted depth (actionable events score higher)

## Privacy Enforcement

- All expertise is scope-bound
- Queries filter by user's visible scopes
- No cross-scope joins allowed
- ScopedExpertise nodes store scope_id
