const { body, param, query, validationResult } = require('express-validator');
const { ValidationError } = require('../utils/errors');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorDetails = errors.array().map(err => ({
      field: err.path,
      message: err.msg,
    }));
    throw new ValidationError('Validation failed', errorDetails);
  }
  next();
};

// Conversation validations
const createConversation = [
  body('name')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 255 })
    .withMessage('Name must be at most 255 characters'),
  body('is_group')
    .optional()
    .isBoolean()
    .withMessage('is_group must be a boolean'),
  body('participants')
    .isArray({ min: 1 })
    .withMessage('participants must be a non-empty array'),
  body('participants.*')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Each participant must be a non-empty string'),
  validate,
];

const addParticipant = [
  param('id').isUUID().withMessage('Invalid conversation ID'),
  body('user_id')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('user_id is required'),
  validate,
];

// Message validations
const createMessage = [
  body('conversation_id')
    .isUUID()
    .withMessage('Invalid conversation ID'),
  body('sender_id')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('sender_id is required'),
  body('text')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('text is required'),
  body('timestamp')
    .optional()
    .isISO8601()
    .withMessage('timestamp must be a valid ISO8601 date'),
  validate,
];

const getMessages = [
  param('id').isUUID().withMessage('Invalid conversation ID'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('limit must be between 1 and 100'),
  query('before')
    .optional()
    .isISO8601()
    .withMessage('before must be a valid ISO8601 date'),
  validate,
];

const getConversation = [
  param('id').isUUID().withMessage('Invalid conversation ID'),
  validate,
];

module.exports = {
  createConversation,
  addParticipant,
  createMessage,
  getMessages,
  getConversation,
  validate,
};
