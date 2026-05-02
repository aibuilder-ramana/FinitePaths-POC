const db = require('../config/neo4j');

const USER_NAMES = {
  user_01: 'Emily Chen',     user_02: 'Liam Patel',      user_03: 'Ava Martinez',
  user_04: 'Noah Johnson',   user_05: 'Sophia Davis',    user_06: 'Ethan Wilson',
  user_07: 'Isabella Brown', user_08: 'Mason Taylor',    user_09: 'Mia Anderson',
  user_10: 'James Thomas',   user_11: 'Amelia White',    user_12: 'Oliver Harris',
  user_13: 'Charlotte Clark',user_14: 'Elijah Lewis',    user_15: 'Abigail Lee',
  user_16: 'Benjamin Walker',user_17: 'Harper Hall',     user_18: 'Lucas Allen',
  user_19: 'Evelyn Young',   user_20: 'Henry King',
};

class UserManager {
  async ensureUsersExist(users) {
    console.log('\n👤 Creating/verifying users...');
    const uniqueUsers = [...new Set(users)];

    for (const userId of uniqueUsers) {
      const name = USER_NAMES[userId] || userId.replace('user_', 'User ');
      await db.query(`
        MERGE (u:User {user_id: $userId})
        SET u.name = $name
      `, { userId, name });
    }

    console.log(`   ✅ ${uniqueUsers.length} users ready`);
    return uniqueUsers;
  }

  async getAllUsers() {
    const result = await db.query('MATCH (u:User) RETURN u.user_id as user_id');
    return result.map(r => r.user_id);
  }
}

module.exports = new UserManager();
