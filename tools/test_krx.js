const axios = require('axios');
const cheerio = require('cheerio');

// (async function(){
//   const url = 'https://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd';
//   const body = {
//     bld: 'dbms/MDC/STAT/standard/MDCSTAT01501',
//     mktId: 'STK',
//     share: '1',
//     csvxls_isNo: 'false'
//   };

//   try{
//     const res = await axios.post(url, new URLSearchParams(body), {
//       headers: {
//         'Content-Type': 'application/x-www-form-urlencoded',
//         'Referer': 'http://data.krx.co.kr/',
//         'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
//         'Accept': 'application/json, text/javascript, */*; q=0.01',
//         'Origin': 'http://data.krx.co.kr',
//         'X-Requested-With': 'XMLHttpRequest',
//         'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
//       },
//       timeout: 10000
//     });

//     console.log('HTTP', res.status);
//     if(res.data && typeof res.data === 'object'){
//       console.log('Response keys:', Object.keys(res.data));
//       if(res.data.OutBlock_1){
//         console.log('OutBlock_1 length:', res.data.OutBlock_1.length);
//         console.log('Sample:', res.data.OutBlock_1.slice(0,3));
//       }else{
//         console.log('No OutBlock_1. Full response (truncated 2000 chars):');
//         const s = JSON.stringify(res.data);
//         console.log(s.substring(0,2000));
//       }
//     }else{
//       console.log('Non-JSON response length:', String(res.data).length);
//       console.log(String(res.data).substring(0,2000));
//     }
//   }catch(err){
//     if(err.response){
//       console.error('HTTP ERROR', err.response.status);
//       console.error('Headers:', err.response.headers);
//       try{ console.error('Body:', JSON.stringify(err.response.data).substring(0,2000)); }catch(e){ console.error('Body (raw):', String(err.response.data).substring(0,2000)); }
//     }else{
//       console.error('Request failed:', err.message);
//     }
//   }
// })();

async function getNaverSector(stockCode) {
  const url = `https://finance.naver.com/item/main.nhn?code=${stockCode}`;
  const res = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });

  const html = res.data;
  // First try structured extraction for the specific header used on Naver pages
  try{
    const $ = cheerio.load(html);
    // Primary: look for h4.h_sub.sub_tit7 em a (the example given)
    const a = $('h4.h_sub.sub_tit7 em a').first();
    if(a && a.length){
      const name = a.text().trim();
      if(name) return name;
    }

    // Secondary: look for the string '업종명' and find the following link text
    const emWithLabel = $('h4.h_sub.sub_tit7 em').filter((i,el)=> $(el).text().indexOf('업종명') !== -1).first();
    if(emWithLabel && emWithLabel.length){
      const link = $(emWithLabel).find('a').first();
      if(link && link.length){
        const name2 = link.text().trim();
        if(name2) return name2;
      }
    }

    // Third: fallback to generic extractor
    const fallback = extractIndustryNameFromHtml(html);
    if(fallback) return fallback;
  }catch(e){
    // ignore and use regex fallback
  }

  // regex fallback: look for '(업종명' followed by an <a>..</a>
  const m = html.match(/업종명\s*[:：]?[^<]*<a[^>]*>([^<]{2,120}?)<\/a>/i);
  if(m && m[1]) return m[1].trim();

  return null;
}

(async () => {
  try{
    const sector = await getNaverSector("005930");
    console.log("삼성전자 업종:", sector);
  }catch(err){
    console.error('Error fetching sector:', err && err.message ? err.message : err);
  }
})();


function extractIndustryNameFromHtml(html){
  if(!html) return null;
  try{
    const $ = cheerio.load(html);
    // Look for a header '업종명' then get the following td which contains the name
    const th = $('th').filter((i, el) => $(el).text().trim().replace(/\s+/g,'') === '업종명').first();
    if(th && th.length){
      const td = th.next('td');
      if(td && td.length){
        const txt = td.text().trim().replace(/\s+/g,' ');
        // try to extract the Korean segment (업종명) which is usually the first Korean phrase
        const m = txt.match(/[가-힣\s·\-\/\(\)]{2,}/);
        if(m) return m[0].trim();
        return txt;
      }
    }
    // fallback: try to find element with label text '업종명' anywhere and take nearby content
    const labelEl = $("*:contains('업종명')").filter((i,el) => $(el).text().trim().indexOf('업종명') !== -1).first();
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