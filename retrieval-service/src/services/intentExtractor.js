const llm = require('../config/groq');

const INTENT_PROMPT = `You are an intent extraction engine for a people-matching system.

Given a user's natural language query, extract:
1. "intent" — the high-level category of need (e.g. travel_help, healthcare_advice, restaurant_recommendation, parenting_tip, tech_support, home_service, product_recommendation)
2. "entities" — explicit topics mentioned in the query (e.g. ["Europe"])
3. "expanded_entities" — enriched list including specific sub-topics implied by the query (e.g. ["Italy", "France", "Switzerland", "Europe"] for a Europe travel query)

Rules:
- expanded_entities should always include everything in entities plus relevant subtopics
- Keep entities as proper nouns or domain concepts (countries, cities, medical conditions, tech products, etc.)
- Do NOT include vague words like "help", "advice", "planning"
- Return ONLY valid JSON. No explanation, no markdown.

Example input: "I need help planning a Europe trip"
Example output:
{
  "intent": "travel_help",
  "entities": ["Europe"],
  "expanded_entities": ["Europe", "Italy", "France", "Switzerland", "Germany", "Spain", "Amsterdam"]
}`;

/**
 * Extract intent and entities from a raw user query.
 * @param {string} query - Natural language query from the user
 * @returns {{ intent: string, entities: string[], expanded_entities: string[] }}
 */
async function extractIntent(query) {
  console.log(`\n🧠 Step 1: Extracting intent from query: "${query}"`);

  const response = await llm.chat([
    { role: 'system', content: INTENT_PROMPT },
    { role: 'user', content: `Query: "${query}"` }
  ], 0.0);

  let parsed;
  try {
    let jsonStr = response.trim().replace(/^```json\n?/, '').replace(/\n?```$/, '');
    parsed = JSON.parse(jsonStr);
  } catch {
    // Fallback: try to extract JSON object from response
    const match = response.match(/\{[\s\S]*\}/);
    if (match) {
      parsed = JSON.parse(match[0]);
    } else {
      throw new Error(`Intent extractor returned non-JSON: ${response}`);
    }
  }

  const result = {
    intent: parsed.intent || 'general',
    entities: Array.isArray(parsed.entities) ? parsed.entities : [],
    expanded_entities: Array.isArray(parsed.expanded_entities) ? parsed.expanded_entities : parsed.entities || []
  };

  console.log(`   ✅ Intent: ${result.intent}`);
  console.log(`   📌 Entities: ${result.entities.join(', ')}`);
  console.log(`   🔎 Expanded: ${result.expanded_entities.join(', ')}`);

  return result;
}

module.exports = { extractIntent };
