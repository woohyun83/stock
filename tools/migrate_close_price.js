const asyncRedis = require('async-redis');
const asyncClient = asyncRedis.createClient(6379, '127.0.0.1');

(async () => {
  try{
    const dates = await asyncClient.smembers('stock_date');
    console.log('Dates found:', dates.length);
    let totalUpdated = 0;
    for(const d of dates){
      const key = 'stock_list_' + d;
      const members = await asyncClient.smembers(key);
      if(!members || members.length === 0) continue;
      for(const m of members){
        try{
          const obj = JSON.parse(m);
          if(obj.colsePrice !== undefined && obj.colsePrice != null){
            obj.closePrice = obj.colsePrice;
            delete obj.colsePrice;
            // replace member: remove old string and add new string
            await asyncClient.srem(key, m);
            await asyncClient.sadd(key, JSON.stringify(obj));
            totalUpdated++;
          }
        }catch(e){ /* ignore parse errors */ }
      }
    }
    console.log('Migration complete. Total updated members:', totalUpdated);
  }catch(err){
    console.error('Migration error:', err);
  }finally{
    try{ await asyncClient.quit(); }catch(e){}
  }
})();
