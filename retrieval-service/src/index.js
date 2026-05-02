require('dotenv').config();
const express = require('express');
const { verifyConnection, closeConnection } = require('./config/neo4j');
const retrieveRouter = require('./routes/retrieve');

const app = express();
const PORT = process.env.PORT || 3003;

app.use(express.json());

// Allow file:// and any localhost origin (dev only)
app.use((req, res, next) => {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use('/api/retrieve', retrieveRouter);

app.get('/health', async (req, res) => {
  const neo4jOk = await verifyConnection().catch(() => false);
  res.json({
    status: neo4jOk ? 'ok' : 'degraded',
    service: 'retrieval-service',
    neo4j: neo4jOk ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

async function start() {
  console.log('🚀 Starting retrieval-service...');
  await verifyConnection();

  const server = app.listen(PORT, () => {
    console.log(`\n✅ Retrieval service running on http://localhost:${PORT}`);
    console.log(`   POST /api/retrieve  — query the expertise graph`);
    console.log(`   GET  /health        — service health check\n`);
  });

  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down...');
    server.close();
    await closeConnection();
  });
}

start().catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});
