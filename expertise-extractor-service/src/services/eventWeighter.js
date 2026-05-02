const db = require('../config/neo4j');

const TYPE_WEIGHTS = {
  'travel_experience': 1.0, 'travel_recommendation': 1.2,
  'healthcare_recommendation': 1.2, 'product_recommendation': 1.1,
  'service_recommendation': 1.2, 'parenting_tip': 1.0,
  'home_service_experience': 1.0, 'restaurant_recommendation': 1.1,
  'tech_recommendation': 1.1, 'general_knowledge': 0.5
};

const SENTIMENT_WEIGHTS = { 'positive': 1.1, 'neutral': 1.0, 'negative': 0.7, 'neutral_negative': 0.5 };

function finalWeight(weight) {
  return Math.min(2.0, Math.max(0, weight));
}

class EventWeighter {
  calculateEventWeight(event) {
    const { event_type, confidence, attributes } = event;
    const typeWeight = TYPE_WEIGHTS[event_type] || 0.8;
    const confidenceWeight = confidence || 0.5;

    let sentimentWeight = 1.0;
    if (attributes?.sentiment) {
      const sentiments = Object.values(attributes.sentiment);
      if (sentiments.length > 0) {
        sentimentWeight = sentiments.reduce((sum, s) => sum + (SENTIMENT_WEIGHTS[s] || 1.0), 0) / sentiments.length;
      }
    }

    const depthWeight = attributes?.actionable ? 1.3 : 0.8;
    const final = finalWeight(confidenceWeight * typeWeight * sentimentWeight * depthWeight);

    return {
      base_weight: confidenceWeight,
      type_weight: typeWeight,
      sentiment_weight: Math.round(sentimentWeight * 100) / 100,
      depth_weight: depthWeight,
      final_weight: Math.round(final * 100) / 100
    };
  }

  processEvents(events) {
    console.log(`\n⚖️  Processing ${events.length} events...`);
    const weightedEvents = events.map(event => ({
      ...event,
      weights: this.calculateEventWeight(event),
      weighted_at: new Date().toISOString()
    }));
    const avgWeight = weightedEvents.reduce((sum, e) => sum + e.weights.final_weight, 0) / weightedEvents.length;
    console.log(`   ✅ Average event weight: ${avgWeight.toFixed(2)}`);
    return weightedEvents;
  }

  async storeAllEvents(weightedEvents) {
    console.log('\n💾 Storing weighted events in Neo4j...');

    // Batch upsert all events in one query
    await db.query(`
      UNWIND $events AS ev
      MERGE (e:Event {event_id: ev.event_id})
      SET e.event_type        = ev.event_type,
          e.user_id           = ev.user_id,
          e.confidence        = ev.confidence,
          e.timestamp         = ev.timestamp,
          e.source_message_id = ev.source_message_id,
          e.source_text       = ev.source_text,
          e.base_weight       = ev.base_weight,
          e.type_weight       = ev.type_weight,
          e.sentiment_weight  = ev.sentiment_weight,
          e.depth_weight      = ev.depth_weight,
          e.final_weight      = ev.final_weight,
          e.weighted_at       = ev.weighted_at
    `, {
      events: weightedEvents.map(ev => ({
        event_id:           ev.event_id,
        event_type:         ev.event_type,
        user_id:            ev.user_id,
        confidence:         ev.confidence,
        timestamp:          ev.timestamp,
        source_message_id:  ev.source_message_id || null,
        source_text:        ev.source_text || null,
        base_weight:        ev.weights.base_weight,
        type_weight:        ev.weights.type_weight,
        sentiment_weight:   ev.weights.sentiment_weight,
        depth_weight:       ev.weights.depth_weight,
        final_weight:       ev.weights.final_weight,
        weighted_at:        ev.weighted_at
      }))
    });

    // Batch OWNED_BY links
    await db.query(`
      UNWIND $pairs AS p
      MATCH (e:Event {event_id: p.event_id})
      MATCH (u:User  {user_id:  p.user_id})
      MERGE (e)-[:OWNED_BY]->(u)
    `, {
      pairs: weightedEvents.map(ev => ({ event_id: ev.event_id, user_id: ev.user_id }))
    });

    // Batch ABOUT links — flatten event × entity pairs
    const aboutPairs = [];
    for (const ev of weightedEvents) {
      for (const entity of (ev.entities || [])) {
        aboutPairs.push({ event_id: ev.event_id, topic_name: entity });
      }
    }
    if (aboutPairs.length > 0) {
      await db.query(`
        UNWIND $pairs AS p
        MATCH (e:Event {event_id: p.event_id})
        MATCH (t:Topic {name: p.topic_name})
        MERGE (e)-[:ABOUT]->(t)
      `, { pairs: aboutPairs });
    }

    console.log(`   ✅ Stored ${weightedEvents.length} weighted events`);
  }
}

module.exports = new EventWeighter();
