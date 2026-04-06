# ExtractSemanticEvents Service

A service that uses Groq LLM (GPT OSS 120B model) to extract structured semantic events from chat messages.

## Features

- **LLM-Powered Extraction**: Uses Groq's llama-3.3-70b-versatile model (GPT OSS 120B equivalent)
- **Batch Processing**: Process 20 messages per API call for efficiency
- **Structured Output**: Extracts event types, entities, sentiment, and confidence scores
- **Privacy-Preserving**: All processing done locally, only LLM calls to Groq

## Supported Event Types

- `travel_experience` - Personal travel stories and trip details
- `travel_recommendation` - Place, hotel, restaurant suggestions
- `healthcare_recommendation` - Doctor, hospital, treatment suggestions
- `product_recommendation` - Product suggestions with reviews
- `service_recommendation` - Contractor, service provider recommendations
- `parenting_tip` - Childcare, education, parenting advice
- `home_service_experience` - Home improvement experiences
- `restaurant_recommendation` - Food/dining recommendations
- `tech_recommendation` - Technology product/service suggestions
- `general_knowledge` - Other expertise sharing

## Prerequisites

- Node.js 18+
- Groq API key

## Setup

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your Groq API key (already configured)
```

## Usage

```bash
# Run with sample messages (default)
npm start

# Run with custom input file
npm start -- --file ./input/my-messages.json

# Run with sample messages explicitly
npm start -- --sample
```

## Input Format

Messages should be in JSON format:

```json
[
  {
    "message_id": "msg_001",
    "conversation_id": "conv_001",
    "sender_id": "user_A",
    "text": "I've traveled to Italy and France. Happy to share recommendations!",
    "timestamp": "2024-01-15T11:00:00Z"
  }
]
```

## Output Format

```json
{
  "generated_at": "2024-01-20T10:00:00Z",
  "metadata": {
    "total_events": 15,
    "input_file": "./input/sample-messages.json",
    "batch_size": 20
  },
  "events": [
    {
      "event_id": "evt_uuid",
      "user_id": "user_B",
      "event_type": "travel_experience",
      "entities": ["Italy", "France", "Rome", "Florence", "Colosseum"],
      "attributes": {
        "sentiment": {
          "Italy": "positive",
          "France": "positive"
        },
        "context": "User shares positive travel experience in Italy and France",
        "actionable": false
      },
      "confidence": 0.87,
      "source_message_id": "msg_002",
      "timestamp": "2024-01-15T11:00:00Z"
    }
  ]
}
```

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| GROQ_API_KEY | Groq API key | (required) |
| MODEL | LLM model to use | llama-3.3-70b-versatile |
| BATCH_SIZE | Messages per API call | 20 |
| INPUT_PATH | Input messages file | ./input/messages.json |
| OUTPUT_PATH | Output events file | ./output/semantic-events.json |

## Example Output

```
==================================================
🎯 Semantic Events Extraction Service
   Model: GPT OSS 120B (via Groq API)
==================================================

📂 Loaded 13 messages from: ./input/sample-messages.json

🚀 Starting extraction from 13 messages...
📦 Batch size: 20 messages per API call
📊 Total batches: 1

🔄 Processing batch 1/1 (13 messages)...
   ✅ Extracted 12 events from 13 messages

==================================================
📊 EXTRACTION SUMMARY
==================================================
✅ Total messages processed: 13
✅ Total events extracted: 12
📈 Events per message ratio: 0.92
🔄 API calls made: 1
⏱️  Processing time: 3.45s
==================================================

📋 Event Types Breakdown:
   travel_experience: 4
   restaurant_recommendation: 2
   service_recommendation: 2
   healthcare_recommendation: 2
   parenting_tip: 1
   tech_recommendation: 1

✅ Events saved to: ./output/semantic-events.json

✨ Extraction complete!
```
