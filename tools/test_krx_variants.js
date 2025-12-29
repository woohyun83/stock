const axios = require('axios');

async function tryRequest(body){
  const url = 'https://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd';
  try{
    const res = await axios.post(url, new URLSearchParams(body), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': 'http://data.krx.co.kr/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Origin': 'http://data.krx.co.kr',
        'X-Requested-With': 'XMLHttpRequest',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
      },
      timeout: 10000
    });

    const ok = res.status === 200 && res.data && res.data.OutBlock_1 && res.data.OutBlock_1.length > 0;
    console.log('Body:', body, '=> HTTP', res.status, 'OutBlock_1 length:', res.data.OutBlock_1.length, 'ok?', ok);
    return res.data;
  }catch(err){
    if(err.response){
      console.error('HTTP ERROR', err.response.status, 'for body', body);
    }else{
      console.error('Request failed:', err.message, 'for body', body);
    }
  }
}

(async function(){
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth()+1).padStart(2,'0');
  const d = String(today.getDate()).padStart(2,'0');
  const trdDd = `${y}${m}${d}`;

  const bases = [
    { bld: 'dbms/MDC/STAT/standard/MDCSTAT01501', mktId: 'STK', share: '1', csvxls_isNo: 'false' },
    { bld: 'dbms/MDC/STAT/standard/MDCSTAT01501', mktId: 'ALL', share: '1', csvxls_isNo: 'false' },
    { bld: 'dbms/MDC/STAT/standard/MDCSTAT01501', mktId: 'KSQ', share: '1', csvxls_isNo: 'false' },
    { bld: 'dbms/MDC/STAT/standard/MDCSTAT01501', mktId: 'STK', trdDd: trdDd, share: '1', csvxls_isNo: 'false' },
    { bld: 'dbms/MDC/STAT/standard/MDCSTAT01501', mktId: 'ALL', trdDd: trdDd, share: '1', csvxls_isNo: 'false' }
  ];

  for(const body of bases){
    await tryRequest(body);
  }
})();
