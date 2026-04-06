const { v4: uuidv4 } = require('uuid');
const groq = require('../config/groq');
const { EXTRACTION_PROMPT } = require('./eventTypes');

class SemanticExtractor {
  constructor(options = {}) {
    this.batchSize = options.batchSize || parseInt(process.env.BATCH_SIZE) || 20;
    this.events = [];
    this.stats = {
      totalMessages: 0,
      messagesWithEvents: 0,
      apiCalls: 0,
      startTime: null,
      endTime: null,
    };
  }

  /**
   * Extract semantic events from a batch of messages
   * @param {Array} messages - Array of message objects
   * @returns {Array} Extracted semantic events
   */
  async extractFromMessages(messages) {
    this.stats.startTime = Date.now();
    this.stats.totalMessages = messages.length;

    console.log(`\n🚀 Starting extraction from ${messages.length} messages...`);
    console.log(`📦 Batch size: ${this.batchSize} messages per API call`);

    // Split messages into batches
    const batches = this.chunkArray(messages, this.batchSize);
    console.log(`📊 Total batches: ${batches.length}`);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`\n🔄 Processing batch ${i + 1}/${batches.length} (${batch.length} messages)...`);

      try {
        const batchEvents = await this.processBatch(batch);
        this.events.push(...batchEvents);
        this.stats.messagesWithEvents += batch.filter(m =>
          batchEvents.some(e => e.source_message_id === m.message_id)
        ).length;
        this.stats.apiCalls++;
        // Pace requests: 2s between batches to avoid rate limits
        if (i + this.batchSize < batches.length * this.batchSize) {
          await new Promise(r => setTimeout(r, 2000));
        }
      } catch (error) {
        console.error(`❌ Error processing batch ${i + 1}:`, error.message);
        // Continue with next batch
      }
    }

    this.stats.endTime = Date.now();

    return this.events;
  }

  /**
   * Process a single batch of messages
   */
  async processBatch(batch) {
    // Format messages for the prompt
    const messagesText = batch.map((msg, idx) => 
      `[${idx + 1}] message_id: ${msg.message_id}, user_id: ${msg.sender_id}, timestamp: ${msg.timestamp}\n    text: "${msg.text.replace(/"/g, '\\"')}"`
    ).join('\n\n');

    const fullPrompt = `${EXTRACTION_PROMPT}

## Input Messages:
${messagesText}

## Output (JSON array):`;

    // Call Groq API
    const response = await groq.chat([
      { role: 'system', content: 'You are a helpful assistant that extracts semantic events from messages.' },
      { role: 'user', content: fullPrompt }
    ]);

    // Parse JSON response
    const events = this.parseEventsResponse(response, batch);
    console.log(`   ✅ Extracted ${events.length} events from ${batch.length} messages`);

    return events;
  }

  /**
   * Parse the LLM response into structured events
   */
  parseEventsResponse(response, batch) {
    let events = [];
    
    // Try to extract JSON from the response
    let jsonStr = response.trim();
    
    // Remove markdown code blocks if present
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```json\n?/, '').replace(/\n?```$/, '');
    }
    
    try {
      events = JSON.parse(jsonStr);
    } catch (error) {
      // Try to find JSON array in the response
      const jsonMatch = jsonStr.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        try {
          events = JSON.parse(jsonMatch[0]);
        } catch (e) {
          console.warn('⚠️  Could not parse LLM response as JSON');
          return [];
        }
      } else {
        console.warn('⚠️  Could not extract JSON from LLM response');
        return [];
      }
    }

    // Ensure events is an array
    if (!Array.isArray(events)) {
      events = [events];
    }

    // Assign event_id and validate
    return events.map(event => ({
      event_id: uuidv4(),
      user_id: event.user_id || null,
      event_type: event.event_type || 'general_knowledge',
      entities: Array.isArray(event.entities) ? event.entities : [],
      attributes: {
        sentiment: event.attributes?.sentiment || {},
        context: event.attributes?.context || '',
        actionable: event.attributes?.actionable ?? false,
        ...event.attributes,
      },
      confidence: typeof event.confidence === 'number' ? Math.round(event.confidence * 100) / 100 : 0.5,
      source_message_id: event.source_message_id || null,
      timestamp: event.timestamp || null,
    })).filter(e => e.event_type); // Filter out events without event_type
  }

  /**
   * Split array into chunks
   */
  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Get extraction statistics
   */
  getStats() {
    const duration = this.stats.endTime 
      ? ((this.stats.endTime - this.stats.startTime) / 1000).toFixed(2)
      : ((Date.now() - this.stats.startTime) / 1000).toFixed(2);

    return {
      totalMessages: this.stats.totalMessages,
      totalEventsExtracted: this.events.length,
      messagesWithEvents: this.stats.messagesWithEvents,
      apiCalls: this.stats.apiCalls,
      durationSeconds: parseFloat(duration),
      eventsPerMessage: this.stats.totalMessages > 0 
        ? (this.events.length / this.stats.totalMessages).toFixed(2)
        : 0,
    };
  }

  /**
   * Print statistics summary
   */
  printStats() {
    const stats = this.getStats();
    
    console.log('\n' + '='.repeat(50));
    console.log('📊 EXTRACTION SUMMARY');
    console.log('='.repeat(50));
    console.log(`✅ Total messages processed: ${stats.totalMessages}`);
    console.log(`✅ Total events extracted: ${stats.totalEventsExtracted}`);
    console.log(`📈 Events per message ratio: ${stats.eventsPerMessage}`);
    console.log(`🔄 API calls made: ${stats.apiCalls}`);
    console.log(`⏱️  Processing time: ${stats.durationSeconds}s`);
    console.log('='.repeat(50));
    
    // Event type breakdown
    const typeBreakdown = {};
    this.events.forEach(e => {
      typeBreakdown[e.event_type] = (typeBreakdown[e.event_type] || 0) + 1;
    });
    
    console.log('\n📋 Event Types Breakdown:');
    Object.entries(typeBreakdown)
      .sort((a, b) => b[1] - a[1])
      .forEach(([type, count]) => {
        console.log(`   ${type}: ${count}`);
      });
    
    console.log('');
  }
}

module.exports = SemanticExtractor;
