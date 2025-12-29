const asyncRedis = require('async-redis');
const db = require('../include/db.js');


// Configure a minimal clientSession wrapper using async-redis
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

asyncClient.del("stock_date");
    
    const start2 = '2025-01-01';
    const end2 = '2025-10-20';
const dates2 = iterateDates2(start2, end2);
for (const d of dates2) {
    asyncClient.del("stock_list_" + d);
}

function iterateDates(startDate, endDate) {
  const dates = [];
  let cur = new Date(startDate);
  const end = new Date(endDate);
  while (cur <= end) {
    const yyyy = cur.getFullYear();
    const mm = String(cur.getMonth() + 1).padStart(2, '0');
    const dd = String(cur.getDate()).padStart(2, '0');
    dates.push(`${yyyy}-${mm}-${dd}`);
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function iterateDates2(startDate, endDate) {
  const dates = [];
  let cur = new Date(startDate);
  const end = new Date(endDate);
  while (cur <= end) {
    const yyyy = cur.getFullYear();
    const mm = String(cur.getMonth() + 1).padStart(2, '0');
    const dd = String(cur.getDate()).padStart(2, '0');
    dates.push(`${yyyy}${mm}${dd}`);
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

(async () => {
  try {
    // Change these to desired range
    const start = '2025-01-01';
    const end = '2025-10-20';

    const dates = iterateDates(start, end);
    console.log(`Processing ${dates.length} dates from ${start} to ${end}`);

    for (const d of dates) {
      console.log('Processing', d);
      const res = await db.make_stock_data_for(d);
      console.log(d, res);
      // tiny delay to avoid hammering remote service
      await new Promise(r => setTimeout(r, 200));
    }
  } catch (err) {
    console.error('Range run error:', err);
  } finally {
    try { await asyncClient.quit(); } catch(e){}
  }
})();
