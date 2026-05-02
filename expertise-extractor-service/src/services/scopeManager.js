const db = require('../config/neo4j');

class ScopeManager {
  async initializeScopes(userMappings = {}) {
    console.log('\n🔐 Initializing Visibility Scopes...');

    const scopeConfigs = [
      {
        scope_id: 'scope_private_dm',
        type: 'private_dm',
        description: 'Private direct messages',
        allowed_users: userMappings.private_dm || []
      },
      {
        scope_id: 'scope_group_ABC',
        type: 'group',
        description: 'Group conversation',
        allowed_users: userMappings.group_ABC || ['*']
      },
      {
        scope_id: 'scope_public',
        type: 'public',
        description: 'Public/shared context',
        allowed_users: ['*']
      }
    ];

    await db.query(`
      UNWIND $scopes AS s
      MERGE (vs:VisibilityScope {scope_id: s.scope_id})
      SET vs.type = s.type, vs.allowed_users = s.allowed_users, vs.description = s.description
    `, { scopes: scopeConfigs });

    console.log(`   ✅ Initialized ${scopeConfigs.length} scopes`);
    return scopeConfigs;
  }

  async getScopesForUser(userId) {
    const result = await db.query(`
      MATCH (s:VisibilityScope)
      WHERE $userId IN s.allowed_users OR '*' IN s.allowed_users
      RETURN s.scope_id AS scope_id, s.type AS type, s.allowed_users AS allowed_users
    `, { userId });
    return result.map(r => ({ scopeId: r.scope_id, type: r.type, allowedUsers: r.allowed_users }));
  }

  /**
   * Attach a scope to multiple events in one batch query.
   */
  async attachScopeToEvents(eventIds, scopeId) {
    if (eventIds.length === 0) return;
    await db.query(`
      UNWIND $eventIds AS eid
      MATCH (e:Event {event_id: eid})
      MATCH (s:VisibilityScope {scope_id: $scopeId})
      MERGE (e)-[:HAS_SCOPE]->(s)
    `, { eventIds, scopeId });
  }

  async getAllScopes() {
    return db.query(`
      MATCH (s:VisibilityScope)
      RETURN s.scope_id AS scope_id, s.type AS type, s.allowed_users AS allowed_users
    `);
  }
}

module.exports = new ScopeManager();
