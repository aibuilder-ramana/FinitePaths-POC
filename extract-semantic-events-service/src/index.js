require('dotenv').config();
const SemanticExtractor = require('./services/extractor');
const MessageParser = require('./utils/messageParser');

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('🎯 Semantic Events Extraction Service');
  console.log('   Model: GPT OSS 120B (via Groq API)');
  console.log('='.repeat(60) + '\n');

  // Configuration
  const inputPath = process.env.INPUT_PATH || './input/messages.json';
  const outputPath = process.env.OUTPUT_PATH || './output/semantic-events.json';
  const batchSize = parseInt(process.env.BATCH_SIZE) || 20;

  try {
    // Load messages
    let messages;
    
    if (process.argv.includes('--sample')) {
      console.log('📝 Using sample messages for testing...\n');
      messages = MessageParser.getSampleMessages();
    } else if (process.argv.includes('--file')) {
      const filePath = process.argv[process.argv.indexOf('--file') + 1] || inputPath;
      console.log(`📂 Loading messages from: ${filePath}\n`);
      messages = MessageParser.loadFromFile(filePath);
    } else {
      // Try to load from default path, fallback to sample
      try {
        messages = MessageParser.loadFromFile(inputPath);
        console.log(`📂 Loaded ${messages.length} messages from: ${inputPath}\n`);
      } catch (error) {
        console.log('⚠️  No input file found. Using sample messages for demonstration...\n');
        messages = MessageParser.getSampleMessages();
      }
    }

    if (messages.length === 0) {
      console.error('❌ No messages to process');
      process.exit(1);
    }

    // Create extractor
    const extractor = new SemanticExtractor({ batchSize });

    // Extract events
    const events = await extractor.extractFromMessages(messages);

    // Print statistics
    extractor.printStats();

    // Save to file
    const stats = extractor.getStats();
    MessageParser.saveToFile(outputPath, events, {
      input_file: inputPath,
      batch_size: batchSize,
      model: 'llama-3.3-70b-versatile',
      processing_stats: stats,
    });

    console.log('\n✨ Extraction complete!\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (process.env.NODE_ENV === 'development') {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = main;
