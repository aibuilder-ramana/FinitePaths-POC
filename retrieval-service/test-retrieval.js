/**
 * Test script: 10 synthetic user vibes across different topics
 * Calls the live retrieval service and writes results to e2e-output/retrieval-test-results.json
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const SERVICE_URL = 'http://localhost:3003/api/retrieve';
const OUTPUT_PATH = path.join(__dirname, '../e2e-output/retrieval-test-results.json');

// 10 synthetic user vibes — spread across topics present in the expertise graph
const TEST_VIBES = [
  {
    vibe_id: 1,
    scenario: "Europe Travel Planning",
    requester_id: "user_03",
    requester_name: "Ava Lee",
    query: "I need help planning a trip to Europe — any must-see places or travel tips?"
  },
  {
    vibe_id: 2,
    scenario: "Restaurant Discovery — Ramen & Asian Food",
    requester_id: "user_08",
    requester_name: "Jackson Brown",
    query: "Looking for the best ramen spots and Asian restaurants in the city"
  },
  {
    vibe_id: 3,
    scenario: "Home Improvement — Kitchen Remodel",
    requester_id: "user_06",
    requester_name: "Ethan Hall",
    query: "I'm planning a kitchen remodel and need a reliable contractor recommendation"
  },
  {
    vibe_id: 4,
    scenario: "Parenting — School & Education",
    requester_id: "user_19",
    requester_name: "Abigail Russell",
    query: "My kid is starting school next year, need advice on schools and education options"
  },
  {
    vibe_id: 5,
    scenario: "Healthcare — Pediatrician",
    requester_id: "user_11",
    requester_name: "Hannah Taylor",
    query: "Looking for a good pediatrician recommendation for my toddler"
  },
  {
    vibe_id: 6,
    scenario: "Tech — MacBook & Apple Products",
    requester_id: "user_15",
    requester_name: "Samantha Brooks",
    query: "Should I buy a MacBook for college? Looking for tech advice and recommendations"
  },
  {
    vibe_id: 7,
    scenario: "Southeast Asia Travel",
    requester_id: "user_04",
    requester_name: "David Kim",
    query: "I want to backpack through Southeast Asia — Vietnam, Thailand, Cambodia. Who has been there?"
  },
  {
    vibe_id: 8,
    scenario: "Local Food — BBQ & South Lamar",
    requester_id: "user_18",
    requester_name: "William Harris",
    query: "Best BBQ and local restaurants around South Lamar in Austin?"
  },
  {
    vibe_id: 9,
    scenario: "Home Services — Electrician & Plumber",
    requester_id: "user_16",
    requester_name: "Benjamin Lewis",
    query: "My house needs electrical work and possibly plumbing — who knows a good electrician or plumber?"
  },
  {
    vibe_id: 10,
    scenario: "Parenting — Speech Therapy & Summer Camp",
    requester_id: "user_13",
    requester_name: "Charlotte White",
    query: "Looking for speech therapy options and summer camp recommendations for my 6-year-old"
  }
];

async function runTest(vibe) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`[${vibe.vibe_id}/10] ${vibe.scenario}`);
  console.log(`Requester: ${vibe.requester_name} (${vibe.requester_id})`);
  console.log(`Query: "${vibe.query}"`);

  const startTime = Date.now();
  try {
    const response = await axios.post(SERVICE_URL, {
      query: vibe.query,
      requester_id: vibe.requester_id,
      limit: 3
    }, { timeout: 60000 });

    const duration = Date.now() - startTime;
    const data = response.data;

    console.log(`\n  Intent: ${data.intent?.intent}`);
    console.log(`  Entities: ${data.intent?.entities?.join(', ')}`);
    console.log(`  Expanded: ${data.intent?.expanded_entities?.join(', ')}`);
    console.log(`  Candidates found: ${data.meta?.candidates_found}`);
    console.log(`  Results:`);
    (data.results || []).forEach(r => {
      console.log(`    ${r.rank}. ${r.user_name || r.user_id} — ${r.match_strength}`);
      console.log(`       ${r.reason}`);
    });

    return {
      ...vibe,
      status: 'success',
      input: {
        query: vibe.query,
        requester_id: vibe.requester_id,
        limit: 3
      },
      output: {
        intent: data.intent,
        results: data.results,
        meta: { ...data.meta, test_duration_ms: duration }
      }
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errMsg = error.response?.data?.error || error.message;
    console.error(`  ❌ Error: ${errMsg}`);
    return {
      ...vibe,
      status: 'error',
      input: {
        query: vibe.query,
        requester_id: vibe.requester_id,
        limit: 3
      },
      output: { error: errMsg, test_duration_ms: duration }
    };
  }
}

async function main() {
  console.log('🧪 Running 10 synthetic user vibe tests against retrieval-service...\n');

  const results = [];
  for (const vibe of TEST_VIBES) {
    const result = await runTest(vibe);
    results.push(result);
    // Small pause between calls to avoid rate limiting Groq
    await new Promise(r => setTimeout(r, 1500));
  }

  const summary = {
    test_run: {
      timestamp: new Date().toISOString(),
      service_url: SERVICE_URL,
      total_vibes: TEST_VIBES.length,
      successful: results.filter(r => r.status === 'success').length,
      failed: results.filter(r => r.status === 'error').length
    },
    vibes: results
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(summary, null, 2));

  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ Tests complete`);
  console.log(`   Successful: ${summary.test_run.successful}/${summary.test_run.total_vibes}`);
  console.log(`   Output: ${OUTPUT_PATH}`);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
