const EVENT_TYPES = {
  TRAVEL_EXPERIENCE: 'travel_experience',
  TRAVEL_RECOMMENDATION: 'travel_recommendation',
  HEALTHCARE_RECOMMENDATION: 'healthcare_recommendation',
  PRODUCT_RECOMMENDATION: 'product_recommendation',
  SERVICE_RECOMMENDATION: 'service_recommendation',
  PARENTING_TIP: 'parenting_tip',
  HOME_SERVICE_EXPERIENCE: 'home_service_experience',
  RESTAURANT_RECOMMENDATION: 'restaurant_recommendation',
  GENERAL_KNOWLEDGE: 'general_knowledge',
  FINANCIAL_ADVICE: 'financial_advice',
  TECH_RECOMMENDATION: 'tech_recommendation',
  EDUCATION_TIP: 'education_tip',
};

const ENTITY_CATEGORIES = {
  PLACE: 'place',
  PERSON: 'person',
  PROVIDER: 'provider',
  PRODUCT: 'product',
  SERVICE: 'service',
  ACTIVITY: 'activity',
  CONDITION: 'condition',
  RESTAURANT: 'restaurant',
  HOTEL: 'hotel',
  SCHOOL: 'school',
  CONTRACTOR: 'contractor',
};

const SENTIMENT_VALUES = ['positive', 'neutral', 'negative', 'neutral_negative'];

const EXTRACTION_PROMPT = `You are an expert at extracting semantic events from conversational messages.

## Task
Extract structured semantic events from the messages below. Each message may contain zero or more events.

## Event Types
- travel_experience: Personal travel stories, trip details
- travel_recommendation: Suggestions for places, hotels, restaurants
- healthcare_recommendation: Doctor, hospital, treatment suggestions
- product_recommendation: Product suggestions with reviews
- service_recommendation: Contractor, service provider recommendations
- parenting_tip: Childcare, education, parenting advice
- home_service_experience: Home improvement experiences
- restaurant_recommendation: Food/dining recommendations
- tech_recommendation: Technology product/service suggestions
- general_knowledge: Other expertise sharing

## Output Format
Return a JSON array of events. Each event must have:
- event_type: One of the event types above
- entities: Array of specific names/places mentioned (cities, people, products, etc.)
- attributes: Object with:
  - sentiment: Object mapping each entity to positive/neutral/negative
  - context: Brief description of what the message is about
  - actionable: Boolean - whether this contains actionable advice/recommendation
- confidence: Number 0-1 indicating extraction confidence
- source_message_id: The message_id from the input
- user_id: The sender_id from the input
- timestamp: The timestamp from the input

If no meaningful event is found in a message, you may either:
1. Skip that message (don't include in output), OR
2. Include it with event_type="general_knowledge" and low confidence

Return ONLY valid JSON array. No markdown, no explanation.`;

module.exports = {
  EVENT_TYPES,
  ENTITY_CATEGORIES,
  SENTIMENT_VALUES,
  EXTRACTION_PROMPT,
};
