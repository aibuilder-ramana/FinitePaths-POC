const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class ConversationModel {
  /**
   * Create a new conversation
   * @param {Object} data - { name, is_group, participants[] }
   * @returns {Object} created conversation with participants
   */
  static async create(data) {
    const { name = null, is_group = false, participants = [] } = data;
    
    const client = await db.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Create conversation
      const convResult = await client.query(
        `INSERT INTO conversations (name, is_group)
         VALUES ($1, $2)
         RETURNING *`,
        [name, is_group]
      );
      
      const conversation = convResult.rows[0];

      // Add participants
      if (participants.length > 0) {
        const participantValues = participants.map((user_id, idx) => 
          `($${idx + 1}, $${participants.length + 1})`
        ).join(', ');
        
        const participantParams = [...participants, conversation.conversation_id];
        
        await client.query(
          `INSERT INTO conversation_participants (user_id, conversation_id)
           VALUES ${participantValues}
           ON CONFLICT (conversation_id, user_id) DO NOTHING`,
          participantParams
        );
      }

      await client.query('COMMIT');

      // Fetch conversation with participants
      return await this.findById(conversation.conversation_id);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Find conversation by ID
   */
  static async findById(conversationId) {
    const convResult = await db.query(
      'SELECT * FROM conversations WHERE conversation_id = $1',
      [conversationId]
    );

    if (convResult.rows.length === 0) {
      return null;
    }

    const conversation = convResult.rows[0];

    // Get participants
    const participantsResult = await db.query(
      `SELECT cp.*, u.name as user_name
       FROM conversation_participants cp
       LEFT JOIN users u ON cp.user_id = u.user_id
       WHERE cp.conversation_id = $1
       ORDER BY cp.joined_at`,
      [conversationId]
    );

    return {
      ...conversation,
      participants: participantsResult.rows
    };
  }

  /**
   * Find conversations for a user
   */
  static async findByUser(userId) {
    const result = await db.query(
      `SELECT c.*, 
              array_agg(cp.user_id) FILTER (WHERE cp.user_id IS NOT NULL) as participant_ids,
              COUNT(m.message_id) as message_count
       FROM conversations c
       JOIN conversation_participants cp ON c.conversation_id = cp.conversation_id
       LEFT JOIN messages m ON c.conversation_id = m.conversation_id
       WHERE cp.user_id = $1
       GROUP BY c.conversation_id
       ORDER BY c.updated_at DESC`,
      [userId]
    );

    return result.rows;
  }

  /**
   * Add participant to conversation
   */
  static async addParticipant(conversationId, userId) {
    const result = await db.query(
      `INSERT INTO conversation_participants (conversation_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT (conversation_id, user_id) DO NOTHING
       RETURNING *`,
      [conversationId, userId]
    );
    return result.rows[0];
  }

  /**
   * Remove participant from conversation
   */
  static async removeParticipant(conversationId, userId) {
    await db.query(
      `DELETE FROM conversation_participants
       WHERE conversation_id = $1 AND user_id = $2`,
      [conversationId, userId]
    );
  }

  /**
   * Check if user is participant
   */
  static async isParticipant(conversationId, userId) {
    const result = await db.query(
      `SELECT 1 FROM conversation_participants
       WHERE conversation_id = $1 AND user_id = $2`,
      [conversationId, userId]
    );
    return result.rows.length > 0;
  }
}

module.exports = ConversationModel;
