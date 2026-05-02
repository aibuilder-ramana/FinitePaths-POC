# Deju Datastorage Service

A REST API service for storing and retrieving chat messages in PostgreSQL.

## Features

- **Immutable Message Store**: Messages are append-only and never modified
- **Normalized Schema**: Clean data model with proper relationships
- **Privacy-Aware**: All endpoints verify user participation
- **Paginated Queries**: Efficient message retrieval with cursor-based pagination

## Prerequisites

- Node.js 18+
- PostgreSQL 15+

## Setup

### 1. Create Database

```bash
createdb deju
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment

```bash
cp .env.example .env
# Edit .env with your PostgreSQL credentials
```

### 4. Run Migrations

```bash
npm run migrate
```

### 5. Start Server

```bash
npm start
# or for development with hot reload:
npm run dev
```

## API Endpoints

### Conversations

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/conversations` | Create conversation |
| GET | `/api/conversations` | List user's conversations |
| GET | `/api/conversations/:id` | Get conversation details |
| POST | `/api/conversations/:id/participants` | Add participant |
| DELETE | `/api/conversations/:id/participants/:userId` | Remove participant |

### Messages

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/messages` | Send message |
| GET | `/api/messages/:id` | Get single message |
| GET | `/api/messages/conversations/:id/messages` | Get messages (paginated) |

## Authentication

Pass `x-user-id` header to identify the requesting user:

```bash
curl -H "x-user-id: user_A" http://localhost:3000/api/conversations
```

## Example Usage

### Create a Conversation

```bash
curl -X POST http://localhost:3000/api/conversations \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Europe Trip Planning",
    "is_group": true,
    "participants": ["user_A", "user_B", "user_C"]
  }'
```

### Send a Message

```bash
curl -X POST http://localhost:3000/api/messages \
  -H "Content-Type: application/json" \
  -d '{
    "conversation_id": "<uuid>",
    "sender_id": "user_A",
    "text": "Any tips for Europe travel?"
  }'
```

## Testing

```bash
npm test
```

## License

MIT
