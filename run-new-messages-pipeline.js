/**
 * Pipeline: push new-messages.json through all stages
 *
 *  1. Insert new conversations + messages into Postgres via datastorage-service
 *  2. Extract semantic events (Claude Haiku) → semantic-events.json
 *  3. Extract expertise → Neo4j graph (Claude Haiku for topic normalization)
 *
 * Uses Claude API (not Groq) for both LLM steps.
 * Existing data is preserved — only new messages are added.
 */

require('dotenv').config({ path: './expertise-extractor-service/.env' });

const axios  = require('axios');
const fs     = require('fs');
const path   = require('path');
const { execSync } = require('child_process');

const DATASTORAGE_URL = 'http://localhost:3000';
const NEW_MESSAGES_PATH = path.join(__dirname, 'e2e-output/new-messages.json');

function log(step, msg) {
  console.log(`\n${'─'.repeat(60)}\nSTEP ${step}: ${msg}\n${'─'.repeat(60)}`);
}

// ── Step 1: Insert new conversations + messages into Postgres ─────────────
async function step1_insertMessages() {
  log(1, 'INSERT NEW MESSAGES INTO DATASTORAGE (Postgres)');

  const newMessages = JSON.parse(fs.readFileSync(NEW_MESSAGES_PATH, 'utf8'));
  console.log(`  📂 Loaded ${newMessages.length} new messages`);

  // Derive unique conversations and their participants from the messages
  const convMap = new Map();
  for (const msg of newMessages) {
    if (!convMap.has(msg.conversation_id)) {
      convMap.set(msg.conversation_id, new Set());
    }
    convMap.get(msg.conversation_id).add(msg.sender_id);
  }

  console.log(`  📊 ${convMap.size} new conversations to create`);

  // Create conversations — capture the API-assigned IDs (API ignores provided conversation_id)
  const convIdMap = new Map(); // our UUID → API-assigned UUID
  let convCreated = 0;
  for (const [convId, participants] of convMap) {
    try {
      const res = await axios.post(`${DATASTORAGE_URL}/api/conversations`, {
        name: `Group ${convCreated + 1}`,
        is_group: participants.size > 2,
        participants: Array.from(participants)
      }, { timeout: 5000 });
      convIdMap.set(convId, res.data.data.conversation_id);
      convCreated++;
    } catch (err) {
      console.warn(`  ⚠️  Failed to create conv: ${err.response?.data?.error || err.message}`);
    }
  }
  console.log(`  ✅ Conversations created: ${convCreated}`);

  // Insert messages using the API-assigned conversation IDs
  let msgInserted = 0, msgFailed = 0;
  for (const msg of newMessages) {
    const apiConvId = convIdMap.get(msg.conversation_id);
    if (!apiConvId) { msgFailed++; continue; }
    try {
      await axios.post(`${DATASTORAGE_URL}/api/messages`, {
        conversation_id: apiConvId,
        sender_id:       msg.sender_id,
        text:            msg.text,
        timestamp:       msg.timestamp
      }, { timeout: 5000 });
      msgInserted++;
    } catch (err) {
      msgFailed++;
      if (msgFailed <= 3) console.warn(`  ⚠️  Failed to insert msg: ${err.response?.data?.error || err.message}`);
    }
  }
  console.log(`  ✅ Messages: ${msgInserted} inserted, ${msgFailed} failed`);
  return newMessages;
}

// ── Step 2: Extract semantic events via LLM ───────────────────────────────
async function step2_extractSemanticEvents(messages) {
  log(2, `EXTRACT SEMANTIC EVENTS (${messages.length} msgs → Claude Haiku → semantic-events.json)`);

  const svcDir   = path.join(__dirname, 'extract-semantic-events-service');
  const inputPath  = path.join(svcDir, 'input/messages.json');
  const outputPath = path.join(svcDir, 'output/semantic-events.json');

  // Write new messages as input
  fs.writeFileSync(inputPath, JSON.stringify(messages, null, 2));
  console.log(`  📝 Written ${messages.length} messages to extractor input`);

  // Run extractor
  console.log('  🤖 Running extract-semantic-events-service (Claude Haiku)...');
  execSync('node src/index.js --file ./input/messages.json', {
    cwd: svcDir,
    stdio: 'inherit',
    timeout: 300000,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      INPUT_PATH: './input/messages.json',
      OUTPUT_PATH: './output/semantic-events.json'  // override parent's expertise-extractor OUTPUT_PATH
    }
  });

  const events = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  const eventList = events.events || events;
  console.log(`\n  ✅ Extracted ${eventList.length} semantic events`);
  return eventList;
}

// ── Step 3: Extract expertise → Neo4j ────────────────────────────────────
async function step3_extractExpertise() {
  log(3, 'EXPERTISE EXTRACTOR → NEO4J (Claude Haiku normalization + graph write)');

  const svcDir = path.join(__dirname, 'expertise-extractor-service');
  console.log('  🤖 Running expertise-extractor-service (Claude Haiku)...');

  execSync('node src/index.js', {
    cwd: svcDir,
    stdio: 'inherit',
    timeout: 300000,
    env: { ...process.env }
  });

  const reportPath = path.join(svcDir, 'output/expertise-report.json');
  if (!fs.existsSync(reportPath)) {
    console.warn('  ⚠️  No report file found');
    return null;
  }
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  console.log(`\n  ✅ Expertise extraction complete`);
  console.log(`     Events processed:      ${report.pipeline_stats?.events_processed || '?'}`);
  console.log(`     Topics normalized:     ${report.pipeline_stats?.topics_normalized || '?'}`);
  console.log(`     Expertise nodes:       ${report.scoped_expertise?.length || '?'}`);

  // Show top expertise scores
  const top = (report.scoped_expertise || []).slice(0, 20);
  console.log('\n  Top expertise scores:');
  top.forEach(e => {
    const prop = e.propagatedFrom ? ` ↑ ${e.propagatedFrom}` : '';
    console.log(`    ${String(e.user_id).padEnd(9)} | ${String(e.topic).padEnd(28)} | ${e.score}${prop}`);
  });

  return report;
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n' + '█'.repeat(60));
  console.log('  FINITEPATHS — NEW MESSAGES PIPELINE (Claude API)');
  console.log('█'.repeat(60));

  const t0 = Date.now();

  // Check datastorage is up
  try {
    await axios.get(`${DATASTORAGE_URL}/health`, { timeout: 3000 });
    console.log('\n✅ Datastorage service healthy');
  } catch {
    console.error('\n❌ Start datastorage: cd datastorage-service && npm start');
    process.exit(1);
  }

  const messages    = await step1_insertMessages();
  const events      = await step2_extractSemanticEvents(messages);
  const expertise   = await step3_extractExpertise();

  const duration = ((Date.now() - t0) / 1000).toFixed(1);
  console.log('\n' + '█'.repeat(60));
  console.log('  ✅ PIPELINE COMPLETE');
  console.log('█'.repeat(60));
  console.log(`  Wall time:          ${duration}s`);
  console.log(`  Messages inserted:  ${messages.length}`);
  console.log(`  Semantic events:    ${events.length}`);
  console.log(`  Expertise nodes:    ${expertise?.scoped_expertise?.length || 0}`);
}

main().catch(err => { console.error('\n❌ Fatal:', err.message); process.exit(1); });
