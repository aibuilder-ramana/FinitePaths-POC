const express = require('express');
const router = express.Router();
const ConversationModel = require('../models/conversation');
const MessageModel = require('../models/message');
const { NotFoundError, ForbiddenError } = require('../utils/errors');
const {
  createConversation,
  addParticipant,
  getConversation,
  getMessages,
} = require('../middleware/validation');

/**
 * POST /api/conversations
 * Create a new conversation
 */
router.post('/', createConversation, async (req, res, next) => {
  try {
    const { name, is_group, participants } = req.body;
    
    const conversation = await ConversationModel.create({
      name,
      is_group,
      participants,
    });

    res.status(201).json({
      success: true,
      data: conversation,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/conversations
 * List conversations for a user
 */
router.get('/', async (req, res, next) => {
  try {
    const userId = req.headers['x-user-id'];
    
    if (!userId) {
      throw new ForbiddenError('x-user-id header is required');
    }

    const conversations = await ConversationModel.findByUser(userId);

    res.json({
      success: true,
      data: conversations,
      count: conversations.length,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/conversations/:id
 * Get conversation details
 */
router.get('/:id', getConversation, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.headers['x-user-id'];

    const conversation = await ConversationModel.findById(id);
    
    if (!conversation) {
      throw new NotFoundError('Conversation not found');
    }

    // Check if user is participant
    const isParticipant = await ConversationModel.isParticipant(id, userId);
    if (!isParticipant) {
      throw new ForbiddenError('You are not a participant of this conversation');
    }

    res.json({
      success: true,
      data: conversation,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/conversations/:id/participants
 * Add participant to conversation
 */
router.post('/:id/participants', addParticipant, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { user_id } = req.body;

    const conversation = await ConversationModel.findById(id);
    if (!conversation) {
      throw new NotFoundError('Conversation not found');
    }

    const participant = await ConversationModel.addParticipant(id, user_id);

    res.status(201).json({
      success: true,
      data: participant,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/conversations/:id/participants/:userId
 * Remove participant from conversation
 */
router.delete('/:id/participants/:userId', async (req, res, next) => {
  try {
    const { id, userId } = req.params;

    const conversation = await ConversationModel.findById(id);
    if (!conversation) {
      throw new NotFoundError('Conversation not found');
    }

    await ConversationModel.removeParticipant(id, userId);

    res.json({
      success: true,
      message: 'Participant removed',
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
