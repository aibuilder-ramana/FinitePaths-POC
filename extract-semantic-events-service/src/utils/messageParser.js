const fs = require('fs');
const path = require('path');

class MessageParser {
  /**
   * Load messages from a JSON file
   * @param {string} filePath - Path to the messages JSON file
   * @returns {Array} Array of messages
   */
  static loadFromFile(filePath) {
    try {
      const absolutePath = path.resolve(filePath);
      const content = fs.readFileSync(absolutePath, 'utf8');
      const messages = JSON.parse(content);
      
      if (!Array.isArray(messages)) {
        throw new Error('Input file must contain a JSON array of messages');
      }

      // Validate message structure
      const validMessages = messages.filter(msg => {
        return msg.message_id && msg.text;
      });

      if (validMessages.length !== messages.length) {
        console.warn(`⚠️  Filtered out ${messages.length - validMessages.length} invalid messages`);
      }

      return validMessages;
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`File not found: ${filePath}`);
      }
      throw error;
    }
  }

  /**
   * Save events to a JSON file
   * @param {string} filePath - Path to output file
   * @param {Array} events - Array of semantic events
   * @param {Object} metadata - Optional metadata to include
   */
  static saveToFile(filePath, events, metadata = {}) {
    try {
      const absolutePath = path.resolve(filePath);
      
      // Ensure output directory exists
      const dir = path.dirname(absolutePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const output = {
        generated_at: new Date().toISOString(),
        metadata: {
          ...metadata,
          total_events: events.length,
        },
        events: events,
      };

      fs.writeFileSync(absolutePath, JSON.stringify(output, null, 2), 'utf8');
      console.log(`\n✅ Events saved to: ${absolutePath}`);
      
      return absolutePath;
    } catch (error) {
      throw new Error(`Failed to save events: ${error.message}`);
    }
  }

  /**
   * Validate message structure
   */
  static validateMessage(msg) {
    const errors = [];
    
    if (!msg.message_id) errors.push('missing message_id');
    if (!msg.text) errors.push('missing text');
    if (!msg.sender_id) errors.push('missing sender_id (will be set to null)');
    
    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get sample messages for testing
   */
  static getSampleMessages() {
    return [
      {
        message_id: 'msg_001',
        conversation_id: 'conv_europe',
        sender_id: 'user_A',
        text: "I'm planning a trip to Europe this summer with my family. Any tips or must-see places?",
        timestamp: '2024-01-15T10:30:00Z',
      },
      {
        message_id: 'msg_002',
        conversation_id: 'conv_europe',
        sender_id: 'user_B',
        text: "I've traveled to Italy and France. Happy to share recommendations! Italy was amazing - especially Rome and Florence. The Colosseum is a must-see.",
        timestamp: '2024-01-15T11:00:00Z',
      },
      {
        message_id: 'msg_003',
        conversation_id: 'conv_europe',
        sender_id: 'user_C',
        text: "I'll book the Airbnb in Prague! Has anyone been there?",
        timestamp: '2024-01-15T14:00:00Z',
      },
      {
        message_id: 'msg_004',
        conversation_id: 'conv_health',
        sender_id: 'user_A',
        text: "Can anyone suggest a good pediatrician near Downtown Austin for a 2-year-old?",
        timestamp: '2024-01-16T09:00:00Z',
      },
      {
        message_id: 'msg_005',
        conversation_id: 'conv_health',
        sender_id: 'user_D',
        text: "Dr. Kim is the best pediatrician in Austin! My kids actually look forward to dentist visits now. Call Monday morning - they release slots weekly.",
        timestamp: '2024-01-16T09:30:00Z',
      },
      {
        message_id: 'msg_006',
        conversation_id: 'conv_home',
        sender_id: 'user_A',
        text: "Looking for a reliable home contractor for a kitchen remodel. Any recommendations?",
        timestamp: '2024-01-17T10:00:00Z',
      },
      {
        message_id: 'msg_007',
        conversation_id: 'conv_home',
        sender_id: 'user_E',
        text: "Carlos did our kitchen last year. Excellent work, on time, and fair pricing. I can DM you his contact.",
        timestamp: '2024-01-17T10:30:00Z',
      },
      {
        message_id: 'msg_008',
        conversation_id: 'conv_parenting',
        sender_id: 'user_F',
        text: "What's the best way to teach a 6-year-old to read? Apps, books, or tutors?",
        timestamp: '2024-01-18T08:00:00Z',
      },
    ];
  }
}

module.exports = MessageParser;
