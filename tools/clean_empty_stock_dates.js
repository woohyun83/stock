const { createClient } = require('redis');

async function main(){
  const client = createClient({ url: 'redis://127.0.0.1:6379' });
  client.on('error', (e)=>console.error('redis error', e));
  await client.connect();

  try{
    const dates = await client.sMembers('stock_date');
    console.log(`Found ${dates.length} dates in stock_date`);

    const removed = [];
    for(const d of dates){
      try{
        const key = 'stock_list_' + d;
        const members = await client.sMembers(key);
        if(!Array.isArray(members) || members.length === 0){
          // remove from index and delete the key
          await client.sRem('stock_date', d);
          try{ await client.del(key); }catch(e){}
          removed.push(d);
          console.log('Removed empty date:', d);
        }
      }catch(e){ console.error('error checking date', d, e && e.message); }
    }

    console.log(`Removed ${removed.length} empty dates.`);
    const remaining = await client.sMembers('stock_date');
    console.log(`Remaining dates in stock_date: ${remaining.length}`);
    if(remaining.length <= 50) console.log('Dates:', remaining.join(', '));
  }finally{
    await client.disconnect();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
