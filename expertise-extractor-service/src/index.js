require('dotenv').config();
const EventProcessor = require('./pipeline/processEvents');
const db = require('./config/neo4j');

async function main() {
  console.log('\n🚀 Starting Expertise Extractor Service...\n');

  // Configuration
  const inputPath = process.env.INPUT_PATH || './input/semantic-events.json';
  const outputPath = process.env.OUTPUT_PATH || './output/expertise-report.json';

  // Verify Neo4j connection
  const connected = await db.verifyConnection();
  if (!connected) {
    console.error('❌ Cannot connect to Neo4j. Please ensure Neo4j is running.');
    console.log('   Start Neo4j Desktop and run the database.');
    process.exit(1);
  }

  try {
    // Create processor
    const processor = new EventProcessor();

    // Run pipeline
    const report = await processor.run(inputPath, outputPath);

    if (report) {
      console.log('\n✨ Expertise extraction complete!');
      console.log('\nTop experts found:');
      report.scoped_expertise.slice(0, 5).forEach((exp, i) => {
        console.log(`   ${i + 1}. ${exp.user_id} - ${exp.topic} (score: ${exp.score})`);
      });
    }

  } catch (error) {
    console.error('❌ Pipeline failed:', error);
  } finally {
    await db.closeConnection();
    process.exit(0);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = main;
