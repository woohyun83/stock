const asyncRedis = require('async-redis');
const axios = require('axios');
const cheerio = require('cheerio');
const asyncClient = asyncRedis.createClient(6379, '127.0.0.1');
const iconv = require('iconv-lite');

async function build() {
  try {
    const map = {}; // industry_name -> [codes]

    for(let no=1; no<=999; no++){
      await fetchIndustryName(no);
    }
    
    function extractIndustryNameFromHtml(html){
      if(!html) return null;
      try{
        const $ = cheerio.load(html);

        let title = ($("title").first().text() || "").trim();
        let industryTitle = null;
        if (title) {
          industryTitle = title.split(":")[0].trim();
        }

        if(industryTitle){
          if (!map[industryTitle]) map[industryTitle] = [];

          $("td.name a").each((_, el) => {
            const href = $(el).attr("href");
            const match = href.match(/code=([a-zA-Z0-9]{6})/);
            if (match) map[industryTitle].push(match[1]);
          });
        }

      }catch(e){ }

      return null;
    }

    // fetch industry name for a single stock code via Naver (with timeout)
    async function fetchIndustryName(no){
      const url = `https://finance.naver.com/sise/sise_group_detail.naver?type=upjong&no=${no}`;
      try{
        const res = await axios.get(url, { responseType: "arraybuffer", headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 8000 });
        const buffer = Buffer.from(res.data);
        const html = iconv.decode(buffer, "MS949");
        const name = extractIndustryNameFromHtml(html);
        return name;
      }catch(e){
        console.error("axios 요청 에러:", e.code || e.message);
        return null;
      }
    }

    // persist industry_map as a single JSON value under key 'industry_map'
    const themeFields = Object.keys(map);
    if (themeFields.length === 0) {
      console.log('No industry to save');
      return;
    }

    try{
      await asyncClient.set('industry_map', JSON.stringify(map));
      console.log('Saved industry_map JSON with', themeFields.length, 'entries (key: industry_map)');
    }catch(e){
      console.error('Error saving industry_map JSON', e && e.message);
    }
  } catch (err) {
    console.error('build_industry_map error:', err && err.message);
  }
}

async function build2() {
  try {
    const map = {}; // theme_name -> [codes]

    for(let no=1; no<=999; no++){
      await fetchThemeName(no);
    }
    
    function extractThemeNameFromHtml(html){
      if(!html) return null;
      try{
        const $ = cheerio.load(html);
        const themeTitle = $("strong.info_title").first().text().trim();

        if(themeTitle){
          if (!map[themeTitle]) map[themeTitle] = [];

          $("td.name a").each((_, el) => {
            const href = $(el).attr("href");
            const match = href.match(/code=(\d{6})/);
            if (match) map[themeTitle].push(match[1]);
          });
        }

      }catch(e){ }

      return null;
    }

    // fetch theme name for a single stock code via Naver (with timeout)
    async function fetchThemeName(no){
      const url = `https://finance.naver.com/sise/sise_group_detail.naver?type=theme&no=${no}`;
      try{
        const res = await axios.get(url, { responseType: "arraybuffer", headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 8000 });
        const buffer = Buffer.from(res.data);
        const html = iconv.decode(buffer, "MS949");
        const name = extractThemeNameFromHtml(html);
        return name;
      }catch(e){
        console.error("axios 요청 에러:", e.code || e.message);
        return null;
      }
    }

    // persist theme_map as a single JSON value under key 'theme_map'
    const themeFields = Object.keys(map);
    if (themeFields.length === 0) {
      console.log('No theme to save');
      return;
    }

    try{
      await asyncClient.set('theme_map', JSON.stringify(map));
      console.log('Saved theme_map JSON with', themeFields.length, 'entries (key: theme_map)');
    }catch(e){
      console.error('Error saving theme_map JSON', e && e.message);
    }
  } catch (err) {
    console.error('build_theme_map error:', err && err.message);
  }
}

build();

build2();