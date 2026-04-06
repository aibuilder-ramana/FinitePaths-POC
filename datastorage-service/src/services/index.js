require('dotenv').config();
const express = require('express');
const cors = require('cors');
const conversationRoutes = require('../routes/conversations');
const messageRoutes = require('../routes/messages');
const { AppError, ValidationError } = require('../utils/errors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/conversations', conversationRoutes);
app.use('/api/messages', messageRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not found',
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);

  if (err instanceof ValidationError) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
      errors: err.errors,
    });
  }

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
    });
  }

  // PostgreSQL errors
  if (err.code) {
    switch (err.code) {
      case '23505': // Unique violation
        return res.status(409).json({
          success: false,
          error: 'Resource already exists',
        });
      case '23503': // Foreign key violation
        return res.status(400).json({
          success: false,
          error: 'Referenced resource not found',
        });
      case '22P02': // Invalid UUID
        return res.status(400).json({
          success: false,
          error: 'Invalid ID format',
        });
    }
  }

  // Default error
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message,
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 FinitePaths Datastorage Service`);
  console.log(`   Server running on port ${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/health`);
  console.log(`   API base: http://localhost:${PORT}/api\n`);
});

module.exports = app;
