const db = require('../config/database');

class MessageModel {
  /**
   * Create a new message (immutable - append only)
   * @param {Object} data - { conversation_id, sender_id, text, timestamp }
   * @returns {Object} created message
   */
  static async create(data) {
    const { conversation_id, sender_id, text, timestamp } = data;

    const result = await db.query(
      `INSERT INTO messages (conversation_id, sender_id, text, timestamp)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [conversation_id, sender_id, text, timestamp || new Date()]
    );

    return result.rows[0];
  }

  /**
   * Find message by ID
   */
  static async findById(messageId) {
    const result = await db.query(
      'SELECT * FROM messages WHERE message_id = $1',
      [messageId]
    );
    return result.rows[0] || null;
  }

  /**
   * Get messages for a conversation (paginated)
   * @param {string} conversationId
   * @param {Object} options - { limit: 50, before: timestamp }
   */
  static async findByConversation(conversationId, options = {}) {
    const { limit = 50, before = null } = options;

    let query = `
      SELECT m.*, u.name as sender_name
      FROM messages m
      LEFT JOIN users u ON m.sender_id = u.user_id
      WHERE m.conversation_id = $1
    `;
    const params = [conversationId];

    if (before) {
      query += ` AND m.timestamp < $2`;
      params.push(before);
    }

    query += `
      ORDER BY m.timestamp DESC
      LIMIT $${params.length + 1}
    `;
    params.push(limit);

    const result = await db.query(query, params);
    return result.rows.reverse(); // Return in chronological order
  }

  /**
   * Get message count for conversation
   */
  static async countByConversation(conversationId) {
    const result = await db.query(
      'SELECT COUNT(*) as count FROM messages WHERE conversation_id = $1',
      [conversationId]
    );
    return parseInt(result.rows[0].count, 10);
  }

  /**
   * Get recent messages across all user's conversations
   */
  static async findRecentByUser(userId, limit = 20) {
    const result = await db.query(
      `SELECT m.*, c.name as conversation_name
       FROM messages m
       JOIN conversations c ON m.conversation_id = c.conversation_id
       JOIN conversation_participants cp ON c.conversation_id = cp.conversation_id
       WHERE cp.user_id = $1
       ORDER BY m.timestamp DESC
       LIMIT $2`,
      [userId, limit]
    );
    return result.rows;
  }

  /**
   * Search messages in conversation
   */
  static async search(conversationId, searchText, options = {}) {
    const { limit = 50, offset = 0 } = options;

    const result = await db.query(
      `SELECT m.*, u.name as sender_name
       FROM messages m
       LEFT JOIN users u ON m.sender_id = u.user_id
       WHERE m.conversation_id = $1
         AND m.text ILIKE '%' || $2 || '%'
       ORDER BY m.timestamp DESC
       LIMIT $3 OFFSET $4`,
      [conversationId, searchText, limit, offset]
    );

    return result.rows;
  }
}

module.exports = MessageModel;
