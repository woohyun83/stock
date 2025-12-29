const axios = require('axios');
const fs = require('fs');
const AdmZip = require('adm-zip');
const xml2js = require('xml2js');
const asyncRedis = require('async-redis');
const cheerio = require('cheerio');

// --- CONFIG ---
const API_KEY = process.env.DART_API_KEY || '6ed83580ff49a6e212032a4dd5d0b62ef3476eb7';
const DART_CORPCODE_URL = `https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key=${API_KEY}`;
const DART_COMPANY_URL = (corp_code) => `https://opendart.fss.or.kr/api/company.json?crtfc_key=${API_KEY}&corp_code=${corp_code}`;
const KSSC_URL = (induty_code) => `https://kssc.kostat.go.kr:8443/ksscNew_web/kssc/common/ClassificationContentMainTreeListView.do?strCategoryNameCode=001&strCategoryCode=${encodeURIComponent(induty_code)}&strCategoryDegree=11`;

// Redis key prefix
const REDIS_PREFIX = 'industry_info'; // we'll store hashes: industry_info:<stock_code>

// small delay to be polite with external APIs
const SLEEP_MS = 250;

function sleep(ms){ return new Promise(res => setTimeout(res, ms)); }

async function ensureCorpZip(){
  // download corpCode.zip if not present or outdated
  const zipPath = './corpCode.zip';
  if(fs.existsSync('./CORPCODE.xml')){
    console.log('CORPCODE.xml already exists, using existing file');
    return;
  }
  console.log('Downloading corpCode.zip from DART...');
  const res = await axios.get(DART_CORPCODE_URL, { responseType: 'arraybuffer', timeout: 120000 });
  fs.writeFileSync(zipPath, res.data);
  const zip = new AdmZip(zipPath);
  zip.extractAllTo('./', true);
  console.log('Extracted CORPCODE.xml');
}

async function parseCorpCode(){
  const xml = fs.readFileSync('CORPCODE.xml', 'utf8');
  const result = await xml2js.parseStringPromise(xml, { explicitArray: false });
  // result.result.list may be array or object
  let list = result && result.result && result.result.list ? result.result.list : [];
  if(!Array.isArray(list)) list = [list];
  return list;
}

// heuristics to extract industry name from KSSC HTML
function extractIndustryNameFromHtml(html){
  if(!html) return null;
  try{
    const $ = cheerio.load(html);
    // Look for a header '분류명' then get the following td which contains the name
    const th = $('span').filter((i, el) => $(el).text().trim().replace(/\s+/g,'') === '동종업종비교').first();
    if(th && th.length){
      const td = th.next('a');
      if(td && td.length){
        const txt = td.text().trim().replace(/\s+/g,' ');
        // try to extract the Korean segment (분류명) which is usually the first Korean phrase
        const m = txt.match(/[가-힣\s·\-\/\(\)]{2,}/);
        if(m) return m[0].trim();
        return txt;
      }
    }
    // fallback: try to find element with label text '분류명' anywhere and take nearby content
    const labelEl = $("*:contains('동종업종비교')").filter((i,el) => $(el).text().trim().indexOf('동종업종비교') !== -1).first();
    if(labelEl && labelEl.length){
      // take next sibling text
      const nxt = labelEl.next();
      if(nxt && nxt.length){
        const t = nxt.text().trim().replace(/\s+/g,' ');
        const m2 = t.match(/[가-힣\s·\-\/\(\)]{2,}/);
        if(m2) return m2[0].trim();
        return t;
      }
    }
  }catch(e){ /* fallthrough to regex fallback */ }

  // last-resort regex fallback
  let m = html.match(/>([가-힣][^<>]{1,120}?[가-힣])</);
  if(m && m[1]) return m[1].trim();
  return null;
}

async function main(){
  try{
    await ensureCorpZip();
    const list = await parseCorpCode();
    console.log('Total corp entries:', list.length);

    // filter where stock_code length === 6 (string)
    const filtered = list.filter(item => {
      const sc = (item.stock_code || '').toString().trim();
      return sc.length === 6 && /^\d{6}$/.test(sc);
    });
    console.log('Filtered stock_code length==6 count:', filtered.length);

    // connect to Redis using async-redis (promisified client)
    const redisClient = asyncRedis.createClient();
    redisClient.on('error', (e) => console.error('redis error', e));

    // delete existing industry_info:* keys to refresh dataset
    try{
      const existingKeys = await redisClient.keys(`${REDIS_PREFIX}:*`);
      if(existingKeys && existingKeys.length){
        console.log(`Deleting ${existingKeys.length} existing ${REDIS_PREFIX}:* keys...`);
        // batch delete
        for(let i=0;i<existingKeys.length;i+=100){
          const batch = existingKeys.slice(i, i+100);
          await redisClient.del(...batch);
        }
      }
    }catch(e){ console.warn('failed to delete existing keys', e); }

    // cache for induty_code -> induty_name to avoid repeated KSSC calls
    const indutyCache = new Map();

    let processed = 0;
    for(const item of filtered){
      const stock_code = (item.stock_code || '').toString().trim();
      const corp_code = (item.corp_code || '').toString().trim();
      if(!stock_code || !corp_code) continue;

      // check if already stored in redis
      const redisKey = `${REDIS_PREFIX}:${stock_code}`;
      try{
        const exists = await redisClient.exists(redisKey);
        if(exists){
          // skip existing
          processed++;
          continue;
        }
      }catch(e){ console.warn('redis exists check failed', e); }

      // fetch company.json
      let induty_code = null;
      try{
        const resp = await axios.get(DART_COMPANY_URL(corp_code), { timeout: 15000 });
        const data = resp && resp.data ? resp.data : null;
        // possible field names: induty_code, industry_code, indutyCd
        induty_code = data && (data.induty_code || data.industry_code || data.indutyCd || data.induty || data.indutyCode) ? (data.induty_code || data.industry_code || data.indutyCd || data.induty || data.indutyCode) : null;
        if(induty_code && typeof induty_code !== 'string') induty_code = String(induty_code);
      }catch(err){ console.warn(`company.json fetch failed for corp_code=${corp_code}`, err && err.message); }

      let induty_name = null;
      if(induty_code){
        if(indutyCache.has(induty_code)){
          induty_name = indutyCache.get(induty_code);
        }else{
          try{
            const ksscResp = await axios.get(KSSC_URL(induty_code), { timeout: 20000 });
            const html = ksscResp && ksscResp.data ? ksscResp.data : null;
            induty_name = extractIndustryNameFromHtml(html);
            if(induty_name) indutyCache.set(induty_code, induty_name);
            else console.warn('Could not parse industry name for code', induty_code);
          }catch(e){ console.warn('KSSC fetch failed for induty_code', induty_code, e && e.message); }
        }
      }

      // persist to redis as a hash
      const payload = {
        stock_code: stock_code,
        corp_code: corp_code,
        induty_code: induty_code || '',
        induty_name: induty_name || ''
      };
      try{
        await redisClient.hmset(redisKey, payload);
      }catch(e){ console.error('redis hmset error', e); }

      processed++;
      if(processed % 50 === 0) console.log(`processed ${processed}/${filtered.length}`);
      // polite delay
      await sleep(SLEEP_MS);
    }

    console.log('Done. total processed:', processed);
    redisClient.end(true);

    fs.unlinkSync('./corpCode.zip');
    fs.unlinkSync('./CORPCODE.xml');

  }catch(err){ console.error('fatal error', err); }
}

// run
main();

// secondary helper: read back stored industry_info entries and log them
async function main2(){
  try{
    const redisClient = asyncRedis.createClient();
    redisClient.on('error', (e) => console.error('redis error', e));
    console.log('Connected to redis, fetching keys...');
    const pattern = `${REDIS_PREFIX}:*`;
    let keys = [];
    try{
      keys = await redisClient.keys(pattern);
    }catch(e){
      console.error('redis keys error', e);
      redisClient.end(true);
      return;
    }
    console.log(`Found ${keys.length} keys`);
    for(const k of keys){
      try{
        const obj = await redisClient.hgetall(k);
        if(obj){
          console.log(k, obj);
        }else{
          console.log(k, '<empty>');
        }
      }catch(e){ console.warn('hgetall failed for', k, e); }
    }
    redisClient.end(true);
  }catch(err){ console.error('main2 fatal', err); }
}

//main2();