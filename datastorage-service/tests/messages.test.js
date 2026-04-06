const request = require('supertest');

// Mock the database
jest.mock('../src/config/database', () => ({
  query: jest.fn(),
  pool: {
    connect: jest.fn(() => ({
      query: jest.fn(),
      release: jest.fn(),
    })),
  },
}));

const app = require('../src/services/index');
const db = require('../src/config/database');

describe('Messages API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/messages', () => {
    it('should create a message with valid data', async () => {
      const mockMessage = {
        message_id: '123e4567-e89b-12d3-a456-426614174000',
        conversation_id: '123e4567-e89b-12d3-a456-426614174001',
        sender_id: 'user_A',
        text: 'Hello, world!',
        timestamp: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };

      // Mock conversation exists and user is participant
      db.query.mockResolvedValueOnce({ rows: [{ conversation_id: '123e4567-e89b-12d3-a456-426614174001' }] }); // findById
      db.query.mockResolvedValueOnce({ rows: [mockMessage] }); // create

      const res = await request(app)
        .post('/api/messages')
        .send({
          conversation_id: '123e4567-e89b-12d3-a456-426614174001',
          sender_id: 'user_A',
          text: 'Hello, world!',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('should reject message without text', async () => {
      const res = await request(app)
        .post('/api/messages')
        .send({
          conversation_id: '123e4567-e89b-12d3-a456-426614174001',
          sender_id: 'user_A',
        });

      expect(res.status).toBe(400);
    });

    it('should reject message with invalid conversation_id', async () => {
      const res = await request(app)
        .post('/api/messages')
        .send({
          conversation_id: 'invalid-uuid',
          sender_id: 'user_A',
          text: 'Hello',
        });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/messages/:id', () => {
    it('should return 401 without x-user-id header', async () => {
      const res = await request(app)
        .get('/api/messages/123e4567-e89b-12d3-a456-426614174000');

      expect(res.status).toBe(403);
    });
  });
});

describe('Health Check', () => {
  it('should return ok status', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
