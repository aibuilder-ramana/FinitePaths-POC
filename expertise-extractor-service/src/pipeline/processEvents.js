const fs = require('fs');
const path = require('path');
const topicNormalizer = require('../services/topicNormalizer');
const eventWeighter = require('../services/eventWeighter');
const scopeManager = require('../services/scopeManager');
const expertiseAggregator = require('../services/expertiseAggregator');
const userManager = require('../services/userManager');
const db = require('../config/neo4j');

class EventProcessor {
  constructor() {
    this.stats = { eventsProcessed: 0, topicsNormalized: 0, startTime: null, endTime: null };
  }

  loadSemanticEvents(filePath) {
    try {
      const resolved = path.resolve(__dirname, '../../..', filePath.replace(/^\.\.\//, ''));
      // Support both relative-to-cwd and relative-to-service-root paths
      const candidates = [
        path.resolve(filePath),
        path.resolve(__dirname, '../..', filePath),
        resolved
      ];
      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
          console.log(`   📂 Loading from: ${candidate}`);
          const data = JSON.parse(fs.readFileSync(candidate, 'utf8'));
          return data.events || [];
        }
      }
      console.error(`   ❌ File not found: ${filePath}`);
      return [];
    } catch (error) {
      console.error('Failed to load semantic events:', error.message);
      return [];
    }
  }

  async run(inputPath, outputPath) {
    this.stats.startTime = Date.now();

    console.log('\n' + '='.repeat(60));
    console.log('🎯 Expertise Extractor Pipeline');
    console.log('='.repeat(60));

    // Step 1: Load events
    console.log('\n📥 Step 1: Loading semantic events...');
    const events = this.loadSemanticEvents(inputPath);
    this.stats.eventsProcessed = events.length;
    console.log(`   ✅ Loaded ${events.length} events`);
    if (events.length === 0) return null;

    // Step 2: Initialize scopes
    console.log('\n🔐 Step 2: Initializing scopes...');
    await scopeManager.initializeScopes();
    const scopes = await scopeManager.getAllScopes();
    console.log(`   ✅ ${scopes.length} scopes available`);

    // Step 3: Create users
    const allUserIds = [...new Set(events.map(e => e.user_id).filter(Boolean))];
    await userManager.ensureUsersExist(allUserIds);

    // Step 4: Normalize entities via LLM
    console.log('\n📚 Step 4: Normalizing topics...');
    const allEntities = [...new Set(events.flatMap(e => e.entities || []).filter(Boolean))];
    const normalizedTopics = await topicNormalizer.normalizeEntities(allEntities);
    this.stats.topicsNormalized = normalizedTopics.length;

    // Step 5: Build topic hierarchy in Neo4j
    console.log('\n🏗 Step 5: Building topic hierarchy...');
    await topicNormalizer.buildTopicHierarchy(normalizedTopics);

    // Step 6: Calculate weights
    console.log('\n⚖️  Step 6: Weighting events...');
    const weightedEvents = eventWeighter.processEvents(events);

    // Step 7: Store events in Neo4j (batch)
    console.log('\n💾 Step 7: Storing events...');
    await eventWeighter.storeAllEvents(weightedEvents);

    // Step 8: Attach scope to events (batch)
    // Determine scope per event based on user membership; fall back to group scope
    console.log('\n🔐 Step 8: Binding event scopes...');
    const eventIds = weightedEvents.map(e => e.event_id);
    // For this POC: assign all events to scope_group_ABC (public/group)
    // In production this would come from the conversation's scope
    await scopeManager.attachScopeToEvents(eventIds, 'scope_group_ABC');
    console.log(`   ✅ Bound ${eventIds.length} events to scope_group_ABC`);

    // Step 9: Compute and cache expertise per scope
    console.log('\n📊 Step 9: Computing expertise...');
    for (const scope of scopes) {
      await expertiseAggregator.updateAllScopedExpertise(scope.scope_id);
    }

    // Step 10: Generate report
    console.log('\n📋 Step 10: Generating report...');
    const report = await this.generateReport(weightedEvents, normalizedTopics, scopes);

    if (outputPath) {
      const outDir = path.dirname(path.resolve(outputPath));
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.resolve(outputPath), JSON.stringify(report, null, 2));
      console.log(`   ✅ Report saved to: ${outputPath}`);
    }

    this.stats.endTime = Date.now();
    const duration = ((this.stats.endTime - this.stats.startTime) / 1000).toFixed(2);

    console.log('\n' + '='.repeat(60));
    console.log('✅ PIPELINE COMPLETE');
    console.log('='.repeat(60));
    console.log(`   Events processed:  ${this.stats.eventsProcessed}`);
    console.log(`   Topics normalized: ${this.stats.topicsNormalized}`);
    console.log(`   Scopes:            ${scopes.length}`);
    console.log(`   Duration:          ${duration}s`);
    console.log('='.repeat(60) + '\n');

    return report;
  }

  async generateReport(events, topics, scopes) {
    const report = {
      generated_at: new Date().toISOString(),
      pipeline_stats: {
        events_processed: this.stats.eventsProcessed,
        topics_normalized: this.stats.topicsNormalized
      },
      topic_hierarchy: {},
      scoped_expertise: [],
      event_summary: { total: events.length, by_type: {} }
    };

    // Build hierarchy summary from normalized topics
    for (const topic of topics) {
      if (topic.parent) {
        if (!report.topic_hierarchy[topic.parent]) report.topic_hierarchy[topic.parent] = [];
        report.topic_hierarchy[topic.parent].push({ child: topic.normalized_name, category: topic.category });
      }
    }

    // Event type breakdown
    for (const event of events) {
      const type = event.event_type || 'unknown';
      report.event_summary.by_type[type] = (report.event_summary.by_type[type] || 0) + 1;
    }

    // Collect scoped expertise from cache
    for (const scope of scopes) {
      const rows = await db.query(`
        MATCH (se:ScopedExpertise {scope_id: $scopeId})
        RETURN se.user_id AS user_id, se.topic AS topic,
               se.score AS score, se.evidence_count AS evidenceCount,
               se.confidence AS confidence, se.propagated_from AS propagatedFrom
        ORDER BY se.score DESC
      `, { scopeId: scope.scope_id });

      for (const row of rows) {
        report.scoped_expertise.push({ ...row, scope_type: scope.type });
      }
    }

    report.scoped_expertise.sort((a, b) => b.score - a.score);
    return report;
  }
}

module.exports = EventProcessor;
