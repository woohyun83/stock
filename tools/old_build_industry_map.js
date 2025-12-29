const asyncRedis = require('async-redis');
const axios = require('axios');
const cheerio = require('cheerio');
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

const db = require('../include/db.js');


async function get_stock_list_by_date(dateStr) {
  // dateStr expected in YYYYMMDD format
  const key = "stock_list_" + dateStr;
  try {
    const members = await sMembers(key);
    if (!Array.isArray(members)) return [];
    return members.map(m => {
      try { return JSON.parse(m); } catch(e) { return m; }
    });
  } catch (err) {
    console.error('get_stock_list_by_date error:', err.message);
    return [];
  }
}

async function build() {
  try {
    console.log('Scanning for industry_info:* keys...');
    const keys = await get_stock_list_by_date('20251028');
    console.log('Found', keys.length, 'industry_info keys');

    // console.log('Scanning for industry_info:* keys...');
    // const keys = await asyncClient.keys('industry_info:*');
    // console.log('Found', keys.length, 'industry_info keys');

    const map = {}; // induty_name -> [codes]
    let processed = 0;

    // helper to extract industry name from Naver HTML
    function extractIndustryNameFromHtml(html){
      if(!html) return null;
      try{
        const $ = cheerio.load(html);
        const a = $('h4.h_sub.sub_tit7 em a').first();
        if(a && a.length){
          const name = a.text().trim();
          if(name) return name;
        }

        const emWithLabel = $('h4.h_sub.sub_tit7 em').filter((i,el)=> $(el).text().indexOf('업종명') !== -1).first();
        if(emWithLabel && emWithLabel.length){
          const link = $(emWithLabel).find('a').first();
          if(link && link.length){
            const name2 = link.text().trim();
            if(name2) return name2;
          }
        }

        const th = $('th').filter((i, el) => $(el).text().trim().replace(/\s+/g,'') === '업종명').first();
        if(th && th.length){
          const td = th.next('td');
          if(td && td.length){
            const txt = td.text().trim().replace(/\s+/g,' ');
            const m = txt.match(/[가-힣\s·\-\/\(\)]{2,}/);
            if(m) return m[0].trim();
            return txt;
          }
        }
      }catch(e){ }

      return null;
    }

    // fetch industry name for a single stock code via Naver (with timeout)
    async function fetchIndustryName(code){
      const url = `https://finance.naver.com/item/main.nhn?code=${code}`;
      try{
        const res = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 8000 });
        const html = res.data;
        const name = extractIndustryNameFromHtml(html);
        return name;
      }catch(e){
        return null;
      }
    }

    // process keys in limited concurrency batches to avoid hammering Naver
    const CONCURRENCY = parseInt(process.env.CONCURRENCY || '8');
    const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT) : null; // optional limit for testing
    const workKeys = LIMIT ? keys.slice(0, LIMIT) : keys;

    for (let i = 0; i < workKeys.length; i += CONCURRENCY) {
      const batch = workKeys.slice(i, i + CONCURRENCY);
      const jobs = batch.map(async (k) => {
        try {
          const code = k.code;
          if(!code) return;

          // fetch industry name from Naver
          const name = await fetchIndustryName(code);
          if(!name) return;

          if (!map[name]) map[name] = [];
          map[name].push(code);

          processed++;
        } catch (e) {
          console.error('Error processing', k, e && e.message);
        }
      });

      await Promise.all(jobs);
      // small polite delay between batches
      await new Promise(r => setTimeout(r, 200));
    }

    // persist industry_map as a single JSON value under key 'industry_map'
    const industryFields = Object.keys(map);
    if (industryFields.length === 0) {
      console.log('No industries to save');
      return;
    }

    try{
      await asyncClient.set('industry_map', JSON.stringify(map));
      console.log('Saved industry_map JSON with', industryFields.length, 'entries (key: industry_map)');
    }catch(e){
      console.error('Error saving industry_map JSON', e && e.message);
    }

    console.log('Set', processed, 'reverse lookup keys (industry_for_stock:<code>)');
  } catch (err) {
    console.error('build_industry_map error:', err && err.message);
  }
}

build();
