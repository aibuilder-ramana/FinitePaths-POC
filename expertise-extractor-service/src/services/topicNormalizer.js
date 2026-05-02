const groq = require('../config/groq');
const db = require('../config/neo4j');

const NORMALIZATION_PROMPT = `You are an expert at normalizing topics into a hierarchical taxonomy.

## Task
For each entity below, determine its proper place in the taxonomy hierarchy.

## Domain Categories
- Travel: World > Continent > Country > Region > City > Landmark
- Healthcare: Medical > Specialty > Condition > Treatment
- Technology: Tech > Category > Product
- Home: Home > Service > Contractor
- Parenting: Family > Parenting > Topic
- Cooking: Cooking > Cuisine > Dish or Technique
- Gardening: Gardening > Type > Plant or Method
- Fitness: Fitness > Discipline > Exercise or Equipment
- Pets: Pets > Animal > Care or Breed
- Finance: Finance > Category > Product or Method
- Entertainment: Entertainment > Medium > Title or Genre
- Music: Music > Genre > Artist or Album
- Food: Food > Category > Item

## Output Format
Return a JSON object where keys are the original entities and values are objects with:
- normalized_name: The canonical name
- category: The domain category
- parent: The immediate parent topic (or null)
- hierarchy_path: Array from root to this entity (max 4 levels)

Return ONLY valid JSON object. No markdown. Be concise.`;

class TopicNormalizer {
  constructor() {
    this.normalizationCache = new Map();
  }

  async normalizeEntities(entities) {
    const uniqueEntities = [...new Set(entities.filter(e => e && typeof e === 'string'))];
    console.log(`\n📚 Normalizing ${uniqueEntities.length} unique entities...`);

    const uncachedEntities = uniqueEntities.filter(e => !this.normalizationCache.has(e));
    
    if (uncachedEntities.length === 0) {
      console.log('   ✅ All entities already cached');
      return this.getNormalizedResults(uniqueEntities);
    }

    // Batch into groups of 25 to avoid hitting output token limits
    const BATCH_SIZE = 25;
    let totalNormalized = 0;
    try {
      for (let i = 0; i < uncachedEntities.length; i += BATCH_SIZE) {
        const batch = uncachedEntities.slice(i, i + BATCH_SIZE);
        const response = await groq.chat([
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: `${NORMALIZATION_PROMPT}\n\nInput: ${JSON.stringify(batch)}\n\nOutput:` }
        ]);

        const normalized = this.parseNormalizationResponse(response);

        for (const [entity, data] of Object.entries(normalized)) {
          this.normalizationCache.set(entity, data);
          if (data.parent && !this.normalizationCache.has(data.parent)) {
            this.normalizationCache.set(data.parent, {
              normalized_name: data.parent,
              category: data.category,
              parent: null,
              hierarchy_path: data.hierarchy_path.slice(0, -1)
            });
          }
        }
        totalNormalized += Object.keys(normalized).length;
      }

      console.log(`   ✅ Normalized ${totalNormalized} entities`);
      return this.getNormalizedResults(uniqueEntities);

    } catch (error) {
      console.error('   ❌ LLM normalization failed:', error.message);
      return this.fallbackNormalize(uniqueEntities);
    }
  }

  parseNormalizationResponse(response) {
    let jsonStr = response.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
    }
    try {
      return JSON.parse(jsonStr);
    } catch (error) {
      const match = jsonStr.match(/\{[\s\S]*\}/);
      if (match) {
        try { return JSON.parse(match[0]); } catch (e) {}
      }
      return {};
    }
  }

  fallbackNormalize(entities) {
    console.log('   🔄 Using fallback normalization...');
    const results = [];
    for (const entity of entities) {
      const data = {
        normalized_name: entity,
        category: this.detectCategory(entity),
        parent: null,
        hierarchy_path: ['General', entity]
      };
      this.normalizationCache.set(entity, data);
      results.push(data);
    }
    return results;
  }

  detectCategory(entity) {
    const lower = entity.toLowerCase();
    if (/doctor|clinic|hospital|health|medical|pediatric|dentist|therapy|nurse/i.test(lower)) return 'Healthcare';
    if (/italy|france|rome|paris|travel|hotel|flight|airbnb|europe|asia|japan|bali/i.test(lower)) return 'Travel';
    if (/contractor|remodel|kitchen|home|roof|paint|plumb|electric/i.test(lower)) return 'Home';
    if (/kid|child|school|parenting|baby|toddler|diaper|breastfeed/i.test(lower)) return 'Parenting';
    if (/laptop|computer|phone|tech|software|app|coding|startup/i.test(lower)) return 'Technology';
    if (/garden|plant|seed|compost|tomato|herb|raised bed|native/i.test(lower)) return 'Gardening';
    if (/recipe|cook|pasta|bake|sourdough|cast iron|cuisine|dish/i.test(lower)) return 'Cooking';
    if (/yoga|pilates|workout|fitness|gym|running|cycling|cardio|strength/i.test(lower)) return 'Fitness';
    if (/dog|cat|pet|puppy|kitten|breed|vet|animal/i.test(lower)) return 'Pets';
    if (/invest|stock|fund|ira|budget|finance|money|roth|savings/i.test(lower)) return 'Finance';
    if (/book|novel|author|read|fiction|memoir|library/i.test(lower)) return 'Entertainment';
    if (/music|song|album|concert|band|artist|spotify|jazz|rock/i.test(lower)) return 'Music';
    return 'General';
  }

  getNormalizedResults(entities) {
    const results = [];
    for (const entity of entities) {
      if (this.normalizationCache.has(entity)) {
        results.push(this.normalizationCache.get(entity));
      } else {
        const data = { normalized_name: entity, category: 'General', parent: null, hierarchy_path: ['General', entity] };
        this.normalizationCache.set(entity, data);
        results.push(data);
      }
    }
    return results;
  }

  async buildTopicHierarchy(normalizations) {
    console.log('\n🏗 Building topic hierarchy in Neo4j...');

    // Collect all nodes and CHILD_OF edges from every hierarchy_path
    const topicNodes = new Map(); // name → category
    const childOfEdges = [];      // { child, parent }

    for (const norm of normalizations) {
      const { hierarchy_path, category } = norm;
      if (!hierarchy_path || hierarchy_path.length === 0) continue;

      for (let i = 0; i < hierarchy_path.length; i++) {
        const name = hierarchy_path[i];
        if (!name || typeof name !== 'string') continue; // skip null/empty
        if (!topicNodes.has(name)) topicNodes.set(name, category);

        // hierarchy_path goes root→leaf, so [i] is CHILD_OF [i-1]
        const parent = hierarchy_path[i - 1];
        if (i > 0 && parent && typeof parent === 'string') {
          childOfEdges.push({ child: name, parent });
        }
      }
    }

    // Batch-create all topic nodes
    if (topicNodes.size > 0) {
      await db.query(`
        UNWIND $nodes AS n
        MERGE (t:Topic {name: n.name})
        SET t.category = n.category, t.normalized = true
      `, { nodes: Array.from(topicNodes.entries()).map(([name, category]) => ({ name, category })) });
    }

    // Batch-create all CHILD_OF edges (deduplicated)
    const uniqueEdges = [...new Map(childOfEdges.map(e => [`${e.child}|${e.parent}`, e])).values()];
    if (uniqueEdges.length > 0) {
      await db.query(`
        UNWIND $edges AS e
        MATCH (child:Topic {name: e.child})
        MATCH (parent:Topic {name: e.parent})
        MERGE (child)-[:CHILD_OF]->(parent)
      `, { edges: uniqueEdges });
    }

    console.log(`   ✅ Created ${topicNodes.size} topic nodes, ${uniqueEdges.length} CHILD_OF edges`);
    return topicNodes;
  }
}

module.exports = new TopicNormalizer();
