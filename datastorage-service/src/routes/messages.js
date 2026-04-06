const express = require('express');
const router = express.Router();
const MessageModel = require('../models/message');
const ConversationModel = require('../models/conversation');
const { NotFoundError, ForbiddenError } = require('../utils/errors');
const { createMessage, getMessages } = require('../middleware/validation');

/**
 * POST /api/messages
 * Send a new message
 */
router.post('/', createMessage, async (req, res, next) => {
  try {
    const { conversation_id, sender_id, text, timestamp } = req.body;

    // Verify conversation exists
    const conversation = await ConversationModel.findById(conversation_id);
    if (!conversation) {
      throw new NotFoundError('Conversation not found');
    }

    // Verify sender is participant
    const isParticipant = await ConversationModel.isParticipant(conversation_id, sender_id);
    if (!isParticipant) {
      throw new ForbiddenError('Sender must be a participant of this conversation');
    }

    const message = await MessageModel.create({
      conversation_id,
      sender_id,
      text,
      timestamp: timestamp ? new Date(timestamp) : new Date(),
    });

    res.status(201).json({
      success: true,
      data: message,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/conversations/:id/messages
 * Get messages for a conversation (paginated)
 */
router.get('/conversations/:id/messages', getMessages, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { limit = 50, before } = req.query;
    const userId = req.headers['x-user-id'];

    // Verify conversation exists
    const conversation = await ConversationModel.findById(id);
    if (!conversation) {
      throw new NotFoundError('Conversation not found');
    }

    // Verify user is participant
    const isParticipant = await ConversationModel.isParticipant(id, userId);
    if (!isParticipant) {
      throw new ForbiddenError('You are not a participant of this conversation');
    }

    const messages = await MessageModel.findByConversation(id, {
      limit: parseInt(limit, 10),
      before: before ? new Date(before) : null,
    });

    const total = await MessageModel.countByConversation(id);

    res.json({
      success: true,
      data: messages,
      pagination: {
        count: messages.length,
        total,
        hasMore: messages.length === parseInt(limit, 10),
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/messages/:id
 * Get single message
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.headers['x-user-id'];

    const message = await MessageModel.findById(id);
    if (!message) {
      throw new NotFoundError('Message not found');
    }

    // Verify user is participant
    const isParticipant = await ConversationModel.isParticipant(message.conversation_id, userId);
    if (!isParticipant) {
      throw new ForbiddenError('You are not a participant of this conversation');
    }

    res.json({
      success: true,
      data: message,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
