const asyncRedis = require('async-redis');
const db = require('../include/db.js');

// Configure minimal clientSession like run_make_stock_data_range
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

(async () => {
  try{
    console.log('Calling make_stock_data_for for 2025-01-08');
    const res = await db.make_stock_data_for('2025-01-08');
    console.log('Result:', res);
  }catch(err){
    console.error('Test error:', err && err.stack ? err.stack : err);
  }finally{
    try{ await asyncClient.quit(); }catch(e){}
  }
})();
