const axios = require('axios');

module.exports = {
  get_stock_date : get_stock_date,
  get_stock_list_by_date: get_stock_list_by_date,
  get_stock_list_with_prev: get_stock_list_with_prev,
  make_stock_data_for: make_stock_data_for,
  get_stock_history: get_stock_history,
  isTradingDay : isTradingDay,
  delete_stock_date : delete_stock_date
};

async function get_stock_date() {
  try{
	const dates = await clientSession.sMembers("stock_date");
	if(!Array.isArray(dates) || dates.length === 0) return [];

	// filter to dates that actually have members in stock_list_<date>
	const checks = await Promise.all(dates.map(async d => {
	  try{
		const members = await clientSession.sMembers('stock_list_' + d);
		return (Array.isArray(members) && members.length > 0) ? d : null;
	  }catch(e){ return null; }
	}));

	const filtered = checks.filter(Boolean).sort();
	return filtered;
  }catch(err){
	console.error('get_stock_date error:', err && err.message);
	return [];
  }
}

async function get_stock_list_by_date(dateStr) {
  // dateStr expected in YYYYMMDD format
  const key = "stock_list_" + dateStr;
  try {
	const members = await clientSession.sMembers(key);
	if (!Array.isArray(members)) return [];
	return members.map(m => {
	  try { return JSON.parse(m); } catch(e) { return m; }
	});
  } catch (err) {
	console.error('get_stock_list_by_date error:', err.message);
	return [];
  }
}

// Return stock list for date with previous trading day's tradeVolume and pct change
async function get_stock_list_with_prev(dateStr) {
  try{
	// load current date stocks
	const curr = await get_stock_list_by_date(dateStr);

  // load all available dates (only those with data) and find the previous trading date < dateStr
  const allDates = await get_stock_date();
	if(!Array.isArray(allDates) || allDates.length === 0) {
	  // attach nulls and return
	  return curr.map(s => Object.assign({}, s, { prevTradeVolume: 0, pctChange: null }));
	}

	const sorted = allDates.filter(d => typeof d === 'string').sort();
	// find index of dateStr
	const idx = sorted.indexOf(dateStr);
	let prevDate = null;
	if(idx > 0) prevDate = sorted[idx - 1];
	else {
	  // if not found or is first, try to find the greatest date < dateStr
	  for(let i = sorted.length - 1; i >= 0; i--) {
		if(sorted[i] < dateStr){ prevDate = sorted[i]; break; }
	  }
	}

	let prevMap = {};
	if(prevDate){
	  const prevList = await get_stock_list_by_date(prevDate);
	  for(const p of prevList){
		try{
		  const code = p.code;
		  const tv = parseInt(String(p.tradeVolume).replace(/,/g,'')) || 0;
		  prevMap[code] = tv;
		}catch(e){ }
	  }
	}

	// attach prevTradeVolume and pctChange
	const result = curr.map(s => {
	  const curTv = parseInt(String(s.tradeVolume).replace(/,/g,'')) || 0;
	  const prevTv = prevMap[s.code] !== undefined ? prevMap[s.code] : 0;
	  let pct = null;
	  if(prevTv === 0){
		pct = null;
	  }else{
		pct = ((curTv - prevTv) / prevTv) * 100;
		pct = Math.round(pct * 100) / 100; // 2 decimal
	  }
	  return Object.assign({}, s, { prevTradeVolume: prevTv, pctChange: pct });
	});

	return result;
  }catch(err){
	console.error('get_stock_list_with_prev error:', err && err.message);
	return [];
  }
}

// return array of { date: 'YYYYMMDD', tradeVolume: number } for the given code
async function get_stock_history(code, startDate, endDate) {
  try{
	const dates = await clientSession.sMembers('stock_date');
	if(!Array.isArray(dates) || dates.length === 0) return [];

	// filter dates by optional start/end (both in YYYYMMDD)
	let filteredDates = dates.sort();
	if(startDate) filteredDates = filteredDates.filter(d => d >= startDate);
	if(endDate) filteredDates = filteredDates.filter(d => d <= endDate);

	const history = [];
	for(const d of filteredDates){
	  const members = await clientSession.sMembers('stock_list_' + d);
	  if(!Array.isArray(members)) continue;
	  for(const m of members){
		try{
		  const obj = JSON.parse(m);
		  if(obj.code == code || obj.name == code){
			const tv = parseInt(String(obj.tradeVolume).replace(/,/g, '')) || 0;
			// support both correct and misspelled close price fields
			const closeRaw = obj.closePrice || obj.colsePrice || obj.TDD_CLSPRC || obj.tdd_clsprc;
			let cp = null;
			if(closeRaw !== undefined && closeRaw !== null && String(closeRaw).toString().trim() !== ''){
			  // remove commas and possibly handle percent or other characters
			  const num = String(closeRaw).replace(/,/g, '');
			  const f = parseFloat(num);
			  cp = isNaN(f) ? null : f;
			}
			history.push({ date: d, tradeVolume: tv, closePrice: cp });
			break;
		  }
		}catch(e){ }
	  }
	}
	return history;
  }catch(err){
	console.error('get_stock_history error:', err.message);
	return [];
  }
}

async function isTradingDay(dateStr) {
  const date = new Date(dateStr);
  const day = date.getDay();

  // 주말 제외
  if (day === 0 || day === 6) return false;

  // 휴장일 목록 불러오기
  const year = date.getFullYear();
  const url = "https://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd";
  const params = new URLSearchParams({
	bld: "dbms/MDC/STAT/standard/MDCSTAT00301",
	search_bas_yy: year.toString(),
	share: "1",
	csvxls_isNo: "false"
  });

  const headers = {
	"Content-Type": "application/x-www-form-urlencoded",
	"Referer": "https://data.krx.co.kr/",
	"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
	"Accept": "application/json, text/javascript, */*; q=0.01",
	"Origin": "https://data.krx.co.kr",
	"X-Requested-With": "XMLHttpRequest",
  };

  // helper that performs request with timeout and returns parsed holiday list or null on error
  async function fetchHolidays() {
	try {
	  const res = await axios.post(url, params, { headers, timeout: 5000 });
	  // KRX sometimes returns data under different keys; handle defensively
	  const out = res.data?.output || res.data?.OutBlock_1 || res.data?.OutBlock;
	  if (!out) return null;

	  // normalize to array of strings YYYYMMDD
	  const holidays = [];
	  if(Array.isArray(out)){
		for(const item of out){
		  if(!item) continue;
		  if(typeof item === 'string'){
			holidays.push(item.replace(/-/g, ''));
			continue;
		  }
		  // try several possible property names
		  const val = item.clndr_hldy_dt || item.CLNDR_HLDY_DT || item.clndr_hldy_dt_ymd || item.CLNDR_HLDY_DT_YMD || item.hldy_dt || item.HLDY_DT || item.base_dt || item.CLNDR_HLDY_DT || '';
		  if(val) holidays.push(String(val).replace(/-/g, ''));
		}
	  }
	  return holidays.filter(Boolean);
	} catch (err) {
	  // if we see a 403 or other network error, return null so the caller can decide
	  return null;
	}
  }

  // try once, if null then retry one more time
  let holidays = await fetchHolidays();
  if (holidays === null) {
	// small backoff
	await new Promise(r => setTimeout(r, 300));
	holidays = await fetchHolidays();
  }

  // if still null, fail safe: assume not trading day to avoid incorrect writes
  if (!Array.isArray(holidays)) return false;

  // also include some fixed-date national holidays (month-day) which KRX may omit
  const fixedMd1 = ['0101','0301','0501','0505','0606','0815','1003','1009','1225']; // New Year, Independence Movement, Children's, Memorial, Liberation, National Foundation, Hangeul, Christmas
  const fixedMd2 = ['0127','0128','0129','0130','0303','0506','0603','1006','1007','1008']; //2025
  const fixedMd = fixedMd1.concat(fixedMd2);
  const yyyyMdYear = date.getFullYear();
  for(const md of fixedMd){
	holidays.push(String(yyyyMdYear) + md);
  }

  // merge any overrides from Redis set 'stock_holiday_overrides' (YYYYMMDD)
  try{
	const overrides = await clientSession.sMembers('stock_holiday_overrides');
	if(Array.isArray(overrides) && overrides.length > 0){
	  for(const o of overrides) holidays.push(String(o));
	}
  }catch(e){ /* ignore */ }

  const uniq = Array.from(new Set(holidays));
  const dateKey = dateStr.replace(/-/g, "");

  // if in holiday list, return false (not trading day)
  return !uniq.includes(dateKey);
}

// create stock data for a specific date string 'YYYY-MM-DD'
async function make_stock_data_for(dateStr) {
  var result = new Object();

  // validate dateStr
  const date = new Date(dateStr);
  if (isNaN(date)) {
    result.result = false;
    result.msg = 'Invalid date';
    return result;
  }

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const trdDd = `${yyyy}${mm}${dd}`;

  var boolTradingDay = await isTradingDay(`${yyyy}-${mm}-${dd}`);

  if (!boolTradingDay) {
    result.result = false;
    result.msg = 'Not a trading day';
    return result;
  }

  const url = "https://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd";
  // request both markets: STK (KOSPI) and KSQ (KOSDAQ)
  const markets = ['STK', 'KSQ'];
  const bodyBase = {
    bld: "dbms/MDC/STAT/standard/MDCSTAT01501",
    trdDd: trdDd,
    share: "1",
    csvxls_isNo: "false",
  };

  try {
    // // load industry_map JSON once and build reverse lookup in-memory
    // let codeToIndustry = null;
    // try{
    //   const mapJson = await clientSession.get('industry_map');
    //   if(mapJson){
    //     const industryMap = JSON.parse(mapJson);
    //     codeToIndustry = {};
    //     for(const indName of Object.keys(industryMap)){
    //       const arr = industryMap[indName];
    //       if(Array.isArray(arr)){
    //         for(const c of arr){ codeToIndustry[String(c)] = indName; }
    //       }
    //     }
    //   }
    // }catch(e){ /* ignore map read errors */ }


    // For date-based fetch, aggregate results from both markets
    let combined = [];
    for (const mkt of markets) {
      const body = Object.assign({}, bodyBase, { mktId: mkt });
      try{
        const r = await axios.post(url, new URLSearchParams(body), {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Referer": "https://data.krx.co.kr/",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "Origin": "https://data.krx.co.kr",
            "X-Requested-With": "XMLHttpRequest",
          },
          timeout: 60000
        });
        const out = r.data?.OutBlock_1 || [];
        for(const item of out){
          combined.push({
            code: item.ISU_SRT_CD,
            name: item.ISU_ABBRV,
            industry: item.SECT_TP_NM || "-",
            market: item.MKT_NM || (mkt === 'STK' ? 'KOSPI' : 'KOSDAQ'),
            tradeVolume: item.ACC_TRDVOL,
            closePrice: item.TDD_CLSPRC
          });
        }
      }catch(e){
        console.error('make_stock_data_for market fetch error', mkt, e && e.message);
      }
    }

    // dedupe by code (keep last seen)
    const map = {};
    for(const s of combined){ map[s.code] = s; }
    const uniqueStocks = Object.keys(map).map(k => map[k]);

    if (uniqueStocks.length > 0) {
      // enrich each stock with induty_name (from industry_info:<code>) when available
      // try{
      //   // load industry_map JSON once and build reverse lookup in-memory
      //   let codeToIndustry = null;
      //   try{
      //     const mapJson = await clientSession.get('industry_map');
      //     if(mapJson){
      //       const industryMap = JSON.parse(mapJson);
      //       codeToIndustry = {};
      //       for(const indName of Object.keys(industryMap)){
      //         const arr = industryMap[indName];
      //         if(Array.isArray(arr)){
      //           for(const c of arr){ codeToIndustry[String(c)] = indName; }
      //         }
      //       }
      //     }
      //   }catch(e){ /* ignore map read errors */ }

      //   for(const s of uniqueStocks){
      //     try{
      //       const code = s.code;
      //       if(code){
      //         if(codeToIndustry && codeToIndustry[code]){
      //           s.industry = codeToIndustry[code];
      //           s.induty_name = codeToIndustry[code];
      //           continue;
      //         }

      //         // fallback to reading industry_info hash
      //         const info = await clientSession.hGetAll('industry_info:' + code);
      //         if(info && info.induty_name){
      //           s.induty_name = info.induty_name;
      //           if(!s.industry) s.industry = info.induty_name;
      //         } else if(!s.induty_name && s.industry){
      //           s.induty_name = s.industry;
      //         }
      //       }
      //     }catch(e){ /* ignore per-stock errors */ }
      //   }
      // }catch(e){ console.error('make_stock_data_for enrich induty_name error', e && e.message); }

      await Promise.all(uniqueStocks.map(s => clientSession.sAdd("stock_list_" + trdDd, JSON.stringify(s))));
        
      await clientSession.sAdd("stock_date", trdDd);

      result.result = true;
      result.msg = `saved ${uniqueStocks.length} stocks for ${trdDd}`;
    }
    else
    {
      result.result = false;
      result.msg = 'No stock data found for the date';
    }
  } catch (err) {
    result.result = false;
    result.msg = "Error";
    console.error(`make_stock_data_for(${dateStr}) error:`, err.message);
  }

  return result;
}

async function delete_stock_date(data) {
  try{
    await clientSession.sRem('stock_date', data.date);
    await clientSession.del('stock_list_' + data.date);
    return { result: true, msg: `Deleted stock data for date ${data.date}` };
  }catch(e){
    console.error('delete_stock_date error for', data.date, e && e.message);
    return { result: false, msg: `Error deleting stock data for date ${data.date}` };
  }
}