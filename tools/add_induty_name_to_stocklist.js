const asyncRedis = require('async-redis');
const asyncClient = asyncRedis.createClient(6379, '127.0.0.1');

// helper wrappers that try multiple common method name variants used in this repo
async function sMembers(key){
  if(typeof asyncClient.sMembers === 'function') return await asyncClient.sMembers(key);
  if(typeof asyncClient.smembers === 'function') return await asyncClient.smembers(key);
  throw new Error('sMembers not supported by redis client');
}
async function sRem(key, member){
  if(typeof asyncClient.sRem === 'function') return await asyncClient.sRem(key, member);
  if(typeof asyncClient.srem === 'function') return await asyncClient.srem(key, member);
  throw new Error('sRem not supported by redis client');
}
async function sAdd(key, member){
  if(typeof asyncClient.sAdd === 'function') return await asyncClient.sAdd(key, member);
  if(typeof asyncClient.sadd === 'function') return await asyncClient.sadd(key, member);
  throw new Error('sAdd not supported by redis client');
}
async function hGetAll(key){
  if(typeof asyncClient.hgetall === 'function') return await asyncClient.hgetall(key);
  if(typeof asyncClient.hGetAll === 'function') return await asyncClient.hGetAll(key);
  throw new Error('hgetall not supported by redis client');
}
async function main(){
  console.log('Starting: add_induty_name_to_stocklist');
  try{
  const dates = await sMembers('stock_date');
    if(!Array.isArray(dates) || dates.length === 0){
      console.log('No stock_date entries found. Nothing to do.');
      process.exit(0);
    }

    let totalUpdated = 0;
    for(const d of dates){
      const key = 'stock_list_' + d;
  const members = await sMembers(key);
      if(!Array.isArray(members) || members.length === 0){
        console.log(`${key}: no members`);
        continue;
      }
      console.log(`${key}: processing ${members.length} members`);
      let updatedCount = 0;
      for(const m of members){
        try{
          const obj = JSON.parse(m);
          const code = obj.code;
          if(!code) continue;
          const info = await hGetAll('industry_info:' + code);
          if(info && info.induty_name){
            // only update when different or missing
            if(obj.induty_name !== info.induty_name){
              obj.induty_name = info.induty_name;
              // remove old member and add updated JSON
              await sRem(key, m);
              await sAdd(key, JSON.stringify(obj));
              updatedCount++;
            }
          } else {
            // optionally, if no industry_info exists but 'industry' field exists, copy it to induty_name (no external lookup)
            if(obj.induty_name === undefined && obj.industry){
              obj.induty_name = obj.industry;
              await sRem(key, m);
              await sAdd(key, JSON.stringify(obj));
              updatedCount++;
            }
          }
        }catch(err){ /* skip parse errors */ }
      }
      console.log(`${key}: updated ${updatedCount} members`);
      totalUpdated += updatedCount;
    }
    console.log(`Done. Total updated entries: ${totalUpdated}`);
    process.exit(0);
  }catch(err){
    console.error('error', err && err.message);
    process.exit(2);
  }
}

main();
