const neo4j = require('neo4j-driver');
require('dotenv').config();

// Recursively convert neo4j Integer / BigInt to plain JS numbers
function convertValue(v) {
  if (v === null || v === undefined) return v;
  if (neo4j.isInt(v)) return v.toNumber();
  if (typeof v === 'bigint') return Number(v);
  if (Array.isArray(v)) return v.map(convertValue);
  if (typeof v === 'object' && !(v instanceof Date)) {
    const out = {};
    for (const k of Object.keys(v)) out[k] = convertValue(v[k]);
    return out;
  }
  return v;
}
function convertRecord(obj) {
  const out = {};
  for (const k of Object.keys(obj)) out[k] = convertValue(obj[k]);
  return out;
}

const driver = neo4j.driver(
  process.env.NEO4J_URI || 'bolt://localhost:7687',
  neo4j.auth.basic(
    process.env.NEO4J_USER || 'neo4j',
    process.env.NEO4J_PASSWORD
  ),
  {
    maxConnectionPoolSize: 50,
    connectionAcquisitionTimeout: 10000
  }
);

async function verifyConnection() {
  const session = driver.session();
  try {
    await session.run('RETURN 1');
    console.log('✅ Neo4j connection verified');
    return true;
  } catch (error) {
    console.error('❌ Neo4j connection failed:', error.message);
    return false;
  } finally {
    await session.close();
  }
}

async function closeConnection() {
  await driver.close();
}

module.exports = {
  driver,
  session: () => driver.session(),
  verifyConnection,
  closeConnection,
  query: async (cypher, params = {}) => {
    const session = driver.session({ database: process.env.NEO4J_DATABASE || 'neo4j' });
    try {
      const result = await session.run(cypher, params);
      return result.records.map(r => convertRecord(r.toObject()));
    } finally {
      await session.close();
    }
  }
};
