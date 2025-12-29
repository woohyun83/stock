const asyncRedis = require('async-redis');

// create an async redis client and expose a small wrapper under global.clientSession
const asyncClient = asyncRedis.createClient(6379, '127.0.0.1');

global.clientSession = {
  sAdd: async (k, v) => await asyncClient.sadd(k, v),
  sMembers: async (k) => {
    const members = await asyncClient.smembers(k);
    return members || [];
  },
  del: async (k) => await asyncClient.del(k),
  sIsMember: async (k, v) => await asyncClient.sismember(k, v),
  get: async (k) => await asyncClient.get(k),
  set: async (k, v) => await asyncClient.set(k, v)
};

const db = require('../include/db.js');

(async () => {
  try {
    console.log('Calling get_stock_list()...');
    const list = await db.get_stock_list();
    if (Array.isArray(list)) {
      console.log('Returned array length:', list.length);
      console.log('First 5 items (or fewer):', list.slice(0, 5));
    } else {
      console.log('Returned non-array:', list);
    }
  } catch (err) {
    console.error('Test error:', err);
  } finally {
    try { await asyncClient.quit(); } catch(e){}
  }
})();
