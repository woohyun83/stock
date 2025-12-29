const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const { DateTime } = require('luxon');

const cluster = require('cluster');
const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');
const expressSession = require('express-session');
const _connectRedis = require('connect-redis');

let RedisStore;
try {
  if (typeof _connectRedis === 'function') {
    // old/commonjs style: require('connect-redis')(session)
    RedisStore = _connectRedis(expressSession);
  } else if (_connectRedis && typeof _connectRedis.default === 'function') {
    // some builds export a default function
    RedisStore = _connectRedis.default(expressSession);
  } else if (_connectRedis && typeof _connectRedis.default === 'object') {
    // default export is already the store class/object
    RedisStore = _connectRedis.default;
  } else if (_connectRedis && typeof _connectRedis.RedisStore === 'function') {
    // uncommon shape: named export
    RedisStore = _connectRedis.RedisStore;
  } else {
    // fallback: try to use the module itself
    RedisStore = _connectRedis;
  }
} catch (err) {
  console.error('Error initializing connect-redis store adapter:', err);
  RedisStore = null;
}

const app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http, {
  cors: {
    origin: true,
    credentials: true
  }
});

// Setup modern Redis adapter for socket.io using @socket.io/redis-adapter.
// Create separate pub/sub clients and connect them asynchronously.
(async () => {
  try {
    const pubClient = createClient({ url: 'redis://127.0.0.1:6379' });
    const subClient = pubClient.duplicate();

    await pubClient.connect();
    await subClient.connect();

    io.adapter(createAdapter(pubClient, subClient));
  } catch (err) {
    console.error('Error setting up redis adapter for socket.io:', err);
  }
})();

const clientSession = createClient({
  url: 'redis://localhost:6379' // 자신의 Redis 서버 URL
});

clientSession.connect().catch(console.error);

clientSession.exists('websocket_ip', function(err, reply){
  if(reply != 1){
    clientSession.set('websocket_ip', 'localhost');

    var user = new Object();

    user.id = 'admin';
    user.password = 'admin';
    user.name = '관리자';
    user.profile = '관리자';
    user.email = '';
    user.admin_yn = 'Y';
    clientSession.sAdd('user', user.id);
    clientSession.set('user_admin', JSON.stringify(user));
  }
});

let redisStore = null;
if (!RedisStore) {
  console.error('RedisStore not available; continuing without a Redis session store.');
} else {
  // Create the store instance. Some RedisStore implementations are classes
  // (used with `new`) while older ones return a constructor function from
  // which we should create an instance with `new` as well. This should
  // work for the common variants.
  try {
    redisStore = new RedisStore({
      client: clientSession,
      prefix: 'myapp:',
      ttl: 1800
    });
  } catch (err) {
    // If `new` fails, try calling as a factory function
    try {
      redisStore = RedisStore({
        client: clientSession,
        prefix: 'myapp:',
        ttl: 1800
      });
    } catch (err2) {
      console.error('Failed to create RedisStore instance with both `new` and factory call:', err, err2);
      redisStore = null;
    }
  }
}

const config = require('./include/config.js');
const db = require('./include/db.js');
const stock = require('./include/stock.js');
const industry_theme_map = require('./include/industry_theme_map.js');
  
async function get_websocket_port(){
  var port = await clientSession.get('websocket_port');
  if(!port){
    port = "3000";
  }
  return port;
}

async function start_server(){
  industry_theme_map.industry_build(clientSession);
  industry_theme_map.theme_build(clientSession);


  // const fixedMd2 = ['0127','0128','0129','0130','0303','0506','0603','1006','1007','1008']; //2025
  // // const stock_date = await stock.get_stock_date();
  // for(var idx in fixedMd2){
  //   var md = "2025" + fixedMd2[idx];
  //   clientSession.del("stock_list_" + md);
  // }
  // var test = await clientSession.keys('industry_info:' + '*');
  // var test = await clientSession.sMembers('stock_list_' + '20251006');
  // var test = await clientSession.get('industry_map');
  // console.log(test);
  
  // for(var idx in test){
  //   console.log(test[idx]);
  // }

  // clientSession.del("stock_list_20251111");
  
  // clientSession.sRem("stock_date", "20251111");

  // var user = await clientSession.sMembers('user');

  // for(var idx in user){
  //   var userinfo = JSON.parse(await clientSession.get('user_' + user[idx]));
  //   console.log(userinfo);
  // }
}

//CPU개수
var numCPUs = require('os').cpus().length;

//cluster 스케쥴링은 round robin으로 세팅
cluster.schedulingPolicy = cluster.SCHED_RR;

//마스터인 경우 클러스터만 생성하고 클러스터가 죽은 경우에 다시 살림
if (cluster.isMaster) {
	//CPU개수만큼 cluster 생성
	for (var i = 0; i < numCPUs; i++) {
		cluster.fork();
	}
	cluster.on('exit', function(worker, code, signal){
		if(code == 200 || code == 1){
			//발생한 경우가 없어 확인 못 함
			cluster.fork();
		}
	});
  start_server();
} else {
  var session = expressSession({
    secret: 'my key',
    resave: false,
    saveUninitialized:false,
    store: redisStore,
    cookie: {
      httpOnly: true,
      secure: false,
      sameSite: 'lax'
    }
  });  

  app.set('view engine', 'pug');
  app.set('views', path.join(__dirname, 'views'));
  app.use(bodyParser.urlencoded({extended:true}));
  app.use(bodyParser.json());
  const corsOptions = {
    origin: true,
    credentials: true
  };
  app.use(cors(corsOptions));
  app.use('/static', express.static(path.join(__dirname, 'static')));
  app.use(session);

  app.get('/', function(req, res) {
    if(req.session.login){
      req.session.nextpage = '/';
      res.redirect('/stock');
    }else{
      req.session.nextpage = '/';
      res.redirect('/check');
    }
  });
  
  app.route('/check')
  .get(async function(req, res, next){
    if(req.session.login){
      var nextpage = req.session.nextpage;
      if(nextpage == null || nextpage == undefined){
        res.redirect('/');
      }else{
        res.redirect(nextpage);
      }
    }else{
      var show = "";
      if(req.session.login != undefined && !req.session.login){
        show = "show";
      }

      const opts = new Object();

      opts.body_id = 'Home';
      opts.title = 'Home';
      opts.show = show;
      opts.user = new Object();
      opts.websocket_host = await db.get_websocket_host();

      res.render('check', opts);
    }
  })
  .post(async function(req,res){
    var userInfo = await db.login(req.body.mb_id, req.body.mb_password);
    req.session.login = userInfo.result;
    if(userInfo.result){
      req.session.userInfo = userInfo;

      var nextpage = req.session.nextpage;
      if(nextpage == null || nextpage == undefined){
        res.redirect('/');
      }else{
        req.session.nextpage = null;
        res.redirect(nextpage);
      }
    }else{
      res.redirect('/check');
    }
  });

  app.get('/logout', function(req, res) {
    req.session.destroy();
    res.redirect('/check');
  });
    
  app.get('/manage-config', async function(req, res) {
    if(req.session.login){
      const opts = new Object();

      opts.body_id = 'manage-config';
      opts.title = 'manage-config';
      opts.config_menu = 'active';
      opts.user = req.session.userInfo;

      opts.config = await db.get_config();
      opts.vr_exe = "";

      opts.websocket_host = await db.get_websocket_host();

      res.render('manage-config', opts);
    }else{
      req.session.nextpage = '/manage-config';
      res.redirect('/check');
    }
  });
  
  app.post('/set-config', function(req, res) {
    var result = db.set_config(req.body);
    res.send(result);
  });
    
  app.get('/lotto', async function(req, res) {
    if(req.session.login){
      req.session.userInfo = JSON.parse(await clientSession.get('user_' + req.session.userInfo.id));

      const opts = new Object();

      opts.body_id = 'lotto';
      opts.title = 'lotto';
      opts.lotto = 'active';
      opts.user = req.session.userInfo;

      opts.week = await db.get_lotto_week();

      opts.websocket_host = await db.get_websocket_host();

      res.render('lotto', opts);
    }else{
      req.session.nextpage = '/lotto';
      res.redirect('/check');
    }
  });
  
  app.get('/stock', async function(req, res) {
    if(req.session.login){
      req.session.userInfo = JSON.parse(await clientSession.get('user_' + req.session.userInfo.id));

      const opts = new Object();

      opts.body_id = 'stock';
      opts.title = 'stock';
      opts.stock = 'active';
      opts.user = req.session.userInfo;

      opts.dates = await stock.get_stock_date();
      // determine latest date and load its stocks for initial render
      let latestDate = null;
      if (Array.isArray(opts.dates) && opts.dates.length > 0) {
        // pick max (dates stored as YYYYMMDD strings)
        latestDate = opts.dates.sort().slice(-1)[0];
        // use enriched list with previous day's values
        opts.stocks = await stock.get_stock_list_with_prev(latestDate);
      } else {
        opts.stocks = [];
      }

      opts.websocket_host = await db.get_websocket_host();

      res.render('stock', opts);
    }else{
      req.session.nextpage = '/stock';
      res.redirect('/check');
    }
  });

  var server;
  get_websocket_port().then(function(resolvedData) {
    server = http.listen(resolvedData, function(){
      global.__basedir = __dirname;
      global.clientSession = clientSession;

      console.log('http load Success! work process pid : ' + cluster.worker.process.pid);
    });
    // attach error handler so EADDRINUSE and other listen errors are caught and logged
    server.on('error', function(err){
      console.error('HTTP server error on listen:', err && err.stack ? err.stack : err);
      if(err && err.code === 'EADDRINUSE'){
        console.error('Port', resolvedData, 'is already in use. Another process is listening on this port.');
      }
      // exit the worker process so cluster master can decide to restart if desired
      try{ process.exit(1); }catch(e){/*ignore*/}
    });
  });
  
  io.engine.use(session);
  //클러스터인 경우 웹소켓 연결
  io.on('connection', function(socket){
    console.log('user connected: ' + socket.id + ' worker id : ' + cluster.worker.id);
    
    // trigger background job: ensure stock_date has entries from 2025-01-01 to today
    (async () => {
      const lockKey = 'stock_fill_lock_v1';
      const lockTtl = 60 * 10; // 10 minutes
      try{
        // attempt to acquire lock (SET NX EX)
        const acquired = await clientSession.set(lockKey, String(process.pid || '1'), { NX: true, EX: lockTtl });
        if(!acquired){
          console.log('Background stock fill: lock not acquired, skipping on this worker.');
          return;
        }

        const start = '20250101';
        const kst = DateTime.now().setZone('Asia/Seoul');
        let endDateObj = new Date(kst);

        if(kst.hour < 10){
          // before 10:00 KST -> use yesterday
          endDateObj.setDate(endDateObj.getDate() - 1);
          console.log('Background stock fill: KST', kst.toFormat('yyyy-MM-dd HH:mm:ss'), 'before 10:00, using yesterday as end:', endDateObj.toISOString().slice(0,10));
        }else{
          console.log('Background stock fill: KST after 10:00, including today:', kst.toFormat('yyyy-MM-dd'));
        }
        const yyyy = endDateObj.getFullYear();
        const mm = String(endDateObj.getMonth() + 1).padStart(2, '0');
        const dd = String(endDateObj.getDate()).padStart(2, '0');
        const end = `${yyyy}${mm}${dd}`;

        const allDates = await clientSession.sMembers('stock_date');
        const have = new Set((allDates || []).map(d => String(d)));

        // iterate dates from start to end and call make_stock_data_for if missing
        let cur = new Date(start.slice(0,4) + '-' + start.slice(4,6) + '-' + start.slice(6,8));
        const last = new Date(end.slice(0,4) + '-' + end.slice(4,6) + '-' + end.slice(6,8));
        const addedDates = [];
        while(cur <= last){
          const y = cur.getFullYear();
          const m = String(cur.getMonth() + 1).padStart(2, '0');
          const d = String(cur.getDate()).padStart(2, '0');
          const key = `${y}${m}${d}`;
          if(!have.has(key)){
            try{
              const result = await stock.make_stock_data_for(`${y}-${m}-${d}`);
              // record that we added data for this date
              if(result.result){
                addedDates.push(key);
              }
              // small delay to be gentle to KRX
              await new Promise(r => setTimeout(r, 200));
            }catch(e){ console.error('Background make_stock_data_for error for', key, e && e.message); }
          }
          cur.setDate(cur.getDate() + 1);
        }
        // if we added any dates, notify all connected websocket clients so they can refresh
        try{
          if(addedDates.length > 0){
            // try to fetch authoritative date list
            let allDatesLatest = [];
            try{
              allDatesLatest = await stock.get_stock_date();
            }catch(e){
              try{ allDatesLatest = await clientSession.sMembers('stock_date'); }catch(e2){ allDatesLatest = []; }
            }
            io.emit('notify_stock_data_updated', { addedDates: addedDates, allDates: allDatesLatest });
          }
        }catch(e){ console.error('Failed to emit notify_stock_data_updated', e && e.message); }
      }catch(err){ console.error('Background stock fill error:', err && err.message); }
      finally{
        try{ await clientSession.del('stock_fill_lock_v1'); }catch(e){/*ignore*/}
      }
    })();

    socket.on('connect', function(){
      io.to(socket.id).emit('dt', new Date().toGMTString());
    });

    socket.on('disconnect', function(){
      //console.log('user disconnected: ' + socket.id + ' worker id : ' + cluster.worker.id);
    });
    
    socket.on('req_make_lotto', async function() {
      io.to(socket.id).emit('res_get_lotto', await db.make_lotto());
    });
    
    socket.on('req_get_lotto', async function(data) {
      io.to(socket.id).emit('res_get_lotto', await db.get_lotto(data));
    });
    
    // request per-date stock list via websocket: payload may be date string or {date, topN, page, pageSize}
    socket.on('req_stock_data', async function(payload) {
      try{
        let date;
        let topN = '50';
        let page = 1;
        let pageSize = 10;
        if(typeof payload === 'string') date = payload;
        else if(payload && typeof payload === 'object'){
          date = payload.date;
          if(payload.topN !== undefined) topN = payload.topN;
          if(payload.page) page = parseInt(payload.page, 10) || 1;
          if(payload.pageSize) pageSize = parseInt(payload.pageSize, 10) || 10;
        }

        if(!date || !/^\d{8}$/.test(String(date))){
          io.to(socket.id).emit('res_stock_data', { error: 'invalid date' });
          return;
        }

        // load enriched list (with prev day values)
        let list = await stock.get_stock_list_with_prev(String(date));

        // interpret topN as pageSize (items per page). If topN provided and not 'all', it overrides pageSize.
        if(topN !== undefined && topN !== null && topN !== 'all'){
          const maybe = parseInt(String(topN), 10);
          if(!isNaN(maybe) && maybe > 0) pageSize = maybe;
        }

        // Apply market and name filters against the full list before sorting/paging
        if(payload && typeof payload === 'object'){
          if(payload.market && String(payload.market).trim() !== '' && String(payload.market) !== 'all'){
            const mval = String(payload.market).trim();
            list = list.filter(s => (s.market || '').toString() === mval);
          }
          if(payload.name && String(payload.name).trim() !== ''){
            const q = String(payload.name).trim().toLowerCase();
            list = list.filter(s => (s.name || '').toString().toLowerCase().indexOf(q) !== -1);
          }
          // support filtering by explicit list of stock codes (members) - payload.members can be array or comma-separated string
          if(payload.members){
            let codes = payload.members;
            if(typeof codes === 'string') codes = codes.split(',').map(x => x.trim());
            if(Array.isArray(codes) && codes.length > 0){
              const codeSet = new Set(codes.map(c => String(c)));
              list = list.filter(s => codeSet.has(String(s.code)));
            }
          }
        }

        // Support optional server-side sorting by sum of last-5 day-to-day pct increases
        const sortBy5d = payload && payload.sortBy5dSum;
        const sortKey = payload && payload.sortKey;
        const sortDir = payload && payload.sortDir;
        if(sortBy5d){
          // compute pctIncreases5 for all items (store on the object as a temporary field)
          await Promise.all(list.map(async s => {
            try{
              // If we have prevSixDates (trading dates) use baseline = prevSixDates[0]
              if(Array.isArray(prevSixDates) && prevSixDates.length >= 2){
                // fetch history covering baseline..most recent prev date
                const hist = await stock.get_stock_history(s.code, pctStart, pctEnd);
                // build map date->tradeVolume
                const volMap = {};
                (hist || []).forEach(h => { if(h && h.date) volMap[String(h.date)] = Number(h.tradeVolume || 0); });
                const baseline = prevSixDates[0];
                const baselineVol = volMap[baseline] || 0;
                const compareDates = prevSixDates.slice(1); // up to 5 dates
                const arr = [];
                for(const d of compareDates){
                  const v = volMap[d] || 0;
                  if(baselineVol > 0){
                    arr.push(Math.round(((v - baselineVol) / baselineVol) * 100));
                  } else {
                    arr.push(null);
                  }
                }
                if(arr.length === 0){
                  s._pctIncreases5 = null;
                  s._5dSum = Number.NEGATIVE_INFINITY;
                } else {
                  s._pctIncreases5 = arr;
                  // sum only numeric entries
                  s._5dSum = arr.reduce((acc, v) => acc + (typeof v === 'number' && !isNaN(v) ? v : 0), 0);
                }
              } else {
                // fallback to calendar-based consecutive pct change if trading-date info is missing
                let hist = [];
                const start = fmtDateSub(String(date), 6);
                const end = fmtDateSub(String(date), 1);
                hist = await stock.get_stock_history(s.code, start, end);
                const pctList = [];
                for(let i=1;i<hist.length;i++){
                  const prev = hist[i-1].tradeVolume || 0;
                  const cur = hist[i].tradeVolume || 0;
                  if(prev > 0){
                    const pct = ((cur - prev) / prev) * 100;
                    pctList.push(pct);
                  }
                }
                const lastFive = pctList.slice(Math.max(0, pctList.length - 5)).map(v => Math.round(v));
                if(lastFive.length === 0){ s._pctIncreases5 = null; s._5dSum = Number.NEGATIVE_INFINITY; }
                else { s._pctIncreases5 = lastFive; s._5dSum = lastFive.reduce((a,b) => a + b, 0); }
              }
            }catch(e){ s._pctIncreases5 = null; s._5dSum = Number.NEGATIVE_INFINITY; }
          }));
          // sort by 5-day sum descending
          list.sort((a,b) => (b._5dSum || 0) - (a._5dSum || 0));
        } else if(sortKey){
          // generic sort requested by client: sort the entire filtered list by sortKey and sortDir
          const dir = (String(sortDir || 'desc').toLowerCase() === 'asc') ? 1 : -1;
          const normalize = (val) => {
            if(val === null || val === undefined || val === '-') return null;
            // strip percent and commas
            if(typeof val === 'string'){
              const cleaned = val.replace(/%/g,'').replace(/,/g,'');
              const n = Number(cleaned);
              if(!isNaN(n)) return n;
              return val.toString();
            }
            return val;
          };
          list = list.map(s => Object.assign({}, s, { _sortVal: normalize(s[sortKey]) }));
          list.sort((a,b) => {
            const A = a._sortVal;
            const B = b._sortVal;
            const aIsNull = (A === null || A === undefined);
            const bIsNull = (B === null || B === undefined);
            if(aIsNull && bIsNull) return 0;
            if(aIsNull) return 1;
            if(bIsNull) return -1;
            if(typeof A === 'number' && typeof B === 'number') return (A - B) * dir;
            return String(A).localeCompare(String(B)) * dir;
          });
          // cleanup helper field
          list.forEach(s => { delete s._sortVal; });
        } else {
          // sort by pctChange (previous day pct change) descending; treat nulls as smallest
          list = list.map(s => Object.assign({}, s, { _pct: (s.pctChange === null || s.pctChange === undefined) ? Number.NEGATIVE_INFINITY : Number(s.pctChange) }));
          list.sort((a,b) => b._pct - a._pct);
        }

        const totalItems = list.length;
        const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
        if(page < 1) page = 1;
        if(page > totalPages) page = totalPages;

        const startIndex = (page - 1) * pageSize;
        const paged = list.slice(startIndex, startIndex + pageSize);

        // compute avg5dVolumePctChange for each item in the page (reuse precomputed values when available)
        function fmtDateSub(dstr, subDays){
          const y = parseInt(dstr.slice(0,4),10);
          const m = parseInt(dstr.slice(4,6),10) - 1;
          const dd = parseInt(dstr.slice(6,8),10);
          const dt = new Date(y, m, dd);
          dt.setDate(dt.getDate() - subDays);
          const yy = dt.getFullYear();
          const mm2 = String(dt.getMonth() + 1).padStart(2,'0');
          const dd2 = String(dt.getDate()).padStart(2,'0');
          return `${yy}${mm2}${dd2}`;
        }

        // Determine previous trading dates using stock_date set from DB
        let pctStart = null;
        let pctEnd = null;
        try{
          const allDates = await stock.get_stock_date(); // sorted ascending
          // filter dates strictly less than requested date
          const prevDates = (allDates || []).filter(d => typeof d === 'string' && d < String(date)).sort();
          if(prevDates.length > 0){
            // take up to last 6 dates (to compute up to 5 day-to-day pct increases)
            const lastSix = prevDates.slice(Math.max(0, prevDates.length - 6));
            if(lastSix.length > 0){
              pctStart = lastSix[0];
              pctEnd = lastSix[lastSix.length - 1];
            }
          }
        }catch(e){
          pctStart = null; pctEnd = null;
        }

        const enhanced = await Promise.all(paged.map(async s => {
          try{
            // reuse precomputed pctIncreases5 if available (from sortBy5dSum pass)
            if(s._pctIncreases5 !== undefined){
              s.pctIncreases5 = s._pctIncreases5;
            } else {
              let hist = [];
              if(pctStart && pctEnd){
                hist = await stock.get_stock_history(s.code, pctStart, pctEnd);
              } else {
                // fallback: try a small calendar-based range as backup
                const start = fmtDateSub(String(date), 6);
                const end = fmtDateSub(String(date), 1);
                hist = await stock.get_stock_history(s.code, start, end);
              }
              const pctList = [];
              for(let i=1;i<hist.length;i++){
                const prev = hist[i-1].tradeVolume || 0;
                const cur = hist[i].tradeVolume || 0;
                if(prev > 0){
                  const pct = ((cur - prev) / prev) * 100;
                  pctList.push(pct);
                }
              }
              const lastFive = pctList.slice(Math.max(0, pctList.length - 5));
              if(lastFive.length === 0){
                s.pctIncreases5 = null;
              }else{
                s.pctIncreases5 = lastFive.map(v => Math.round(v));
              }
            }
          }catch(e){
            s.pctIncreases5 = null;
          }
          // prefer industry name from industry_info mapping when available
          try{
            const info = await clientSession.hGetAll('industry_info:' + s.code);
            if(info && info.induty_name) s.industry = info.induty_name;
          }catch(e){ /* ignore */ }
          delete s._pct;
          delete s._tv;
          // cleanup temporary fields if present
          // expose numeric avg5d for client-side sorting or display
          if(s._5dSum !== undefined){
            s.avg5d = s._5dSum;
            delete s._5dSum;
          }
          if(s._pctIncreases5 !== undefined){
            // keep pctIncreases5 on s (server may have stored it as _pctIncreases5 earlier)
            if(!s.pctIncreases5 && s._pctIncreases5) s.pctIncreases5 = s._pctIncreases5;
            delete s._pctIncreases5;
          }
          return s;
        }));

        // Build industry aggregation for the requested date using industry_map (industry -> [codes]) when available
        let industryArray = [];
        let themeArray = [];
        try{
          // attempt to load industry_map JSON from Redis
          let industryMapJson = null;
          try{ industryMapJson = await clientSession.get('industry_map'); }catch(e){ industryMapJson = null; }

          if(industryMapJson){
            // parse industry_map and build sums by iterating codes for each industry name
            const industryMapObj = JSON.parse(industryMapJson);
            // build a quick lookup map for current date stocks by code
            const stockByCode = {};
            for(const s of list){ stockByCode[String(s.code)] = s; }

            for(const indName of Object.keys(industryMapObj)){
              const codes = Array.isArray(industryMapObj[indName]) ? industryMapObj[indName] : [];
              let tradeVolumeSum = 0;
              let prevTradeVolumeSum = 0;
              for(const c of codes){
                const codeStr = String(c);
                const s = stockByCode[codeStr];
                if(s){
                  const tv = parseInt(String(s.tradeVolume).replace(/,/g,'')) || 0;
                  const prevTv = parseInt(String(s.prevTradeVolume).replace(/,/g,'')) || 0;
                  tradeVolumeSum += tv;
                  prevTradeVolumeSum += prevTv;
                }
              }
              let pct = null;
              if(prevTradeVolumeSum > 0){ pct = ((tradeVolumeSum - prevTradeVolumeSum) / prevTradeVolumeSum) * 100; pct = Math.round(pct * 100) / 100; }
              industryArray.push({ induty_code: '', induty_name: indName, prevTradeVolume: prevTradeVolumeSum, tradeVolume: tradeVolumeSum, pctChange: pct, members: codes });
            }
            // attempt to also build themeArray from 'theme_map' if present
            try{
              const themeMapJson = await clientSession.get('theme_map');
              if(themeMapJson){
                const themeMapObj = JSON.parse(themeMapJson);
                for(const tName of Object.keys(themeMapObj)){
                  const codes = Array.isArray(themeMapObj[tName]) ? themeMapObj[tName] : [];
                  let tradeVolumeSum = 0;
                  let prevTradeVolumeSum = 0;
                  for(const c of codes){
                    const codeStr = String(c);
                    const s = stockByCode[codeStr];
                    if(s){
                      const tv = parseInt(String(s.tradeVolume).replace(/,/g,'')) || 0;
                      const prevTv = parseInt(String(s.prevTradeVolume).replace(/,/g,'')) || 0;
                      tradeVolumeSum += tv;
                      prevTradeVolumeSum += prevTv;
                    }
                  }
                  let pct = null;
                  if(prevTradeVolumeSum > 0){ pct = ((tradeVolumeSum - prevTradeVolumeSum) / prevTradeVolumeSum) * 100; pct = Math.round(pct * 100) / 100; }
                  themeArray.push({ induty_code: '', induty_name: tName, prevTradeVolume: prevTradeVolumeSum, tradeVolume: tradeVolumeSum, pctChange: pct, members: codes });
                }
              }
            }catch(e){ /* ignore theme map errors */ }
          } else {
            // fallback: build current industry map from stock list and industry_info as before
            const tmp = {};
            for(const s of list){
              const tv = parseInt(String(s.tradeVolume).replace(/,/g,'')) || 0;
              let induty_code = '';
              let induty_name = s.industry || '';
              try{
                const info = await clientSession.hGetAll('industry_info:' + s.code);
                if(info){ if(info.induty_code) induty_code = info.induty_code; if(info.induty_name) induty_name = info.induty_name; }
              }catch(e){ }
              const key = induty_code || induty_name || '__UNKNOWN__';
              if(!tmp[key]) tmp[key] = { induty_code: induty_code || '', induty_name: induty_name || '', tradeVolume: 0, prevTradeVolume: 0 };
              tmp[key].tradeVolume += tv;
              // prevTradeVolume will be aggregated below
            }

            // aggregate prevTradeVolume by scanning prev Stocks (previous date)
            let prevDate = null;
            try{
              const allDates = await stock.get_stock_date();
              const sorted = (allDates || []).filter(d => typeof d === 'string').sort();
              for(let i = sorted.length - 1; i >= 0; i--){ if(sorted[i] < String(date)){ prevDate = sorted[i]; break; } }
            }catch(e){ prevDate = null; }
            if(prevDate){
              const prevStocks = await stock.get_stock_list_by_date(prevDate);
              for(const p of prevStocks){
                const tv = parseInt(String(p.tradeVolume).replace(/,/g,'')) || 0;
                let induty_code = '';
                let induty_name = p.industry || '';
                try{
                  const info = await clientSession.hGetAll('industry_info:' + p.code);
                  if(info){ if(info.induty_code) induty_code = info.induty_code; if(info.induty_name) induty_name = info.induty_name; }
                }catch(e){ }
                const key = induty_code || induty_name || '__UNKNOWN__';
                if(!tmp[key]) tmp[key] = { induty_code: induty_code || '', induty_name: induty_name || '', tradeVolume: 0, prevTradeVolume: 0 };
                tmp[key].prevTradeVolume += tv;
              }
            }

            industryArray = Object.keys(tmp).map(k => {
              const it = tmp[k];
              let pct = null;
              if(it.prevTradeVolume > 0){ pct = ((it.tradeVolume - it.prevTradeVolume) / it.prevTradeVolume) * 100; pct = Math.round(pct * 100) / 100; }
              return { induty_code: it.induty_code, induty_name: it.induty_name, prevTradeVolume: it.prevTradeVolume, tradeVolume: it.tradeVolume, pctChange: pct };
            });
          }

          // sort by pctChange desc (nulls last) — if equal, sort by tradeVolume desc
          industryArray.sort((a,b) => {
            const aPct = a.pctChange === null || a.pctChange === undefined ? Number.NEGATIVE_INFINITY : a.pctChange;
            const bPct = b.pctChange === null || b.pctChange === undefined ? Number.NEGATIVE_INFINITY : b.pctChange;
            if(aPct !== bPct) return bPct - aPct;
            return (b.tradeVolume || 0) - (a.tradeVolume || 0);
          });
        }catch(e){ console.error('industry aggregation error', e && e.message); }

          // include metadata about server-side sorting so client can avoid re-sorting
        const serverSortedBy = sortBy5d ? 'avg5d' : (sortKey || null);
        const serverSortedDir = sortDir || null;
        io.to(socket.id).emit('res_stock_data', { date: String(date), stocks: enhanced, page, pageSize, totalPages, totalItems, sortedBy: serverSortedBy, sortedDir: serverSortedDir, industryList: industryArray, themeList: themeArray });
      }catch(err){
        console.error('WS req_stock_data error:', err && err.message);
        io.to(socket.id).emit('res_stock_data', { error: 'internal', message: err && err.message });
      }
    });

    // request historical series for a stock code via websocket
    // payload may be string code or object { code, start, end }
+    socket.on('req_stock_history', async function(payload) {
      try{
        let code, start, end;
        if(typeof payload === 'string') code = payload;
        else if(payload && typeof payload === 'object'){
          code = payload.code;
          start = payload.start;
          end = payload.end;
        }
        if(!code || typeof code !== 'string'){
          io.to(socket.id).emit('res_stock_history', { error: 'invalid code' });
          return;
        }
        const history = await stock.get_stock_history(code, start, end);
        io.to(socket.id).emit('res_stock_history', { code, history });
      }catch(err){
        console.error('WS req_stock_history error:', err && err.message);
        io.to(socket.id).emit('res_stock_history', { error: 'internal', message: err && err.message });
      } 
    });

    socket.on('req_delete_stock_date', async function(data) {
      var result = await stock.delete_stock_date(data);
      io.to(socket.id).emit('res_delete_stock_date', result);
    });

    // locate stock index/page for current filters so client can navigate to the page containing a code
    socket.on('req_locate_stock', async function(payload){
      try{
        const date = payload && payload.date ? String(payload.date) : null;
        const codeToFind = payload && payload.code ? String(payload.code) : null;
        const pageSize = payload && payload.pageSize ? parseInt(payload.pageSize,10) || 10 : 10;
        const market = payload && payload.market ? String(payload.market) : null;
        const name = payload && payload.name ? String(payload.name) : null;
        const members = payload && payload.members ? payload.members : null;
        const sortKey = payload && payload.sortKey ? payload.sortKey : null;
        const sortDir = payload && payload.sortDir ? payload.sortDir : null;
        const sortBy5d = payload && payload.sortBy5dSum;

        if(!date || !/^[0-9]{8}$/.test(date) || !codeToFind){
          io.to(socket.id).emit('res_locate_stock', { error: 'invalid parameters' });
          return;
        }

        // load list and apply same filtering/sorting as req_stock_data
        let list = await stock.get_stock_list_with_prev(date);
        if(market && market !== 'all') list = list.filter(s => (s.market || '').toString() === market);
        if(name && name.trim() !== ''){
          const q = name.trim().toLowerCase();
          list = list.filter(s => (s.name || '').toString().toLowerCase().indexOf(q) !== -1);
        }
        if(members){
          let codes = members;
          if(typeof codes === 'string') codes = codes.split(',').map(x=>x.trim());
          if(Array.isArray(codes) && codes.length > 0){
            const codeSet = new Set(codes.map(c => String(c)));
            list = list.filter(s => codeSet.has(String(s.code)));
          }
        }

        // sorting: support sortBy5dSum or sortKey similar to req_stock_data
        if(sortBy5d){
          // compute avg5d for each item (best effort)
          await Promise.all(list.map(async s => {
            try{
              // fallback simple computation using calendar history
              const start = (function(dstr, sub){ const y = parseInt(dstr.slice(0,4),10); const m = parseInt(dstr.slice(4,6),10)-1; const dd = parseInt(dstr.slice(6,8),10); const dt = new Date(y,m,dd); dt.setDate(dt.getDate()-sub); const yy = dt.getFullYear(); const mm = String(dt.getMonth()+1).padStart(2,'0'); const dd2 = String(dt.getDate()).padStart(2,'0'); return `${yy}${mm}${dd2}`; })(date,6);
              const end = (function(dstr, sub){ const y = parseInt(dstr.slice(0,4),10); const m = parseInt(dstr.slice(4,6),10)-1; const dd = parseInt(dstr.slice(6,8),10); const dt = new Date(y,m,dd); dt.setDate(dt.getDate()-sub); const yy = dt.getFullYear(); const mm = String(dt.getMonth()+1).padStart(2,'0'); const dd2 = String(dt.getDate()).padStart(2,'0'); return `${yy}${mm}${dd2}`; })(date,1);
              const hist = await stock.get_stock_history(s.code, start, end);
              const pctList = [];
              for(let i=1;i<hist.length;i++){
                const prev = hist[i-1].tradeVolume || 0;
                const cur = hist[i].tradeVolume || 0;
                if(prev > 0) pctList.push(((cur - prev)/prev)*100);
              }
              const lastFive = pctList.slice(Math.max(0,pctList.length-5));
              s._5dSum = lastFive.length ? lastFive.reduce((a,b)=>a+b,0) : Number.NEGATIVE_INFINITY;
            }catch(e){ s._5dSum = Number.NEGATIVE_INFINITY; }
          }));
          list.sort((a,b) => (b._5dSum || 0) - (a._5dSum || 0));
        } else if(sortKey){
          const dir = (String(sortDir || 'desc').toLowerCase() === 'asc') ? 1 : -1;
          const normalize = (val) => {
            if(val === null || val === undefined || val === '-') return null;
            if(typeof val === 'string'){ const cleaned = val.replace(/%/g,'').replace(/,/g,''); const n = Number(cleaned); if(!isNaN(n)) return n; return val.toString(); }
            return val;
          };
          list = list.map(s => Object.assign({}, s, { _sortVal: normalize(s[sortKey]) }));
          list.sort((a,b) => {
            const A = a._sortVal; const B = b._sortVal;
            const aIsNull = (A === null || A === undefined);
            const bIsNull = (B === null || B === undefined);
            if(aIsNull && bIsNull) return 0;
            if(aIsNull) return 1;
            if(bIsNull) return -1;
            if(typeof A === 'number' && typeof B === 'number') return (A - B) * dir;
            return String(A).localeCompare(String(B)) * dir;
          });
        } else {
          // default sort by pctChange desc
          list = list.map(s => Object.assign({}, s, { _pct: (s.pctChange === null || s.pctChange === undefined) ? Number.NEGATIVE_INFINITY : Number(s.pctChange) }));
          list.sort((a,b) => b._pct - a._pct);
        }

        // find index
        const idx = list.findIndex(s => String(s.code) === String(codeToFind));
        if(idx === -1){ io.to(socket.id).emit('res_locate_stock', { found: false }); return; }
        const page = Math.max(1, Math.floor(idx / pageSize) + 1);
        io.to(socket.id).emit('res_locate_stock', { found: true, index: idx, page: page, pageSize: pageSize, totalItems: list.length });
      }catch(err){ console.error('req_locate_stock error', err && err.message); io.to(socket.id).emit('res_locate_stock', { error: err && err.message }); }
    });

    // Watchlist handlers: store a global watchlist as a Redis hash 'watchlist' mapping code->name
    // per-user watchlist: determine userId from session (do not trust client-provided userId)
    socket.on('req_watchlist_get', async function(/*payload*/) {
      try{
        if(socket.request.session.login){
          const key = `watchlist:${socket.request.session.userInfo.id}`;
          const map = await clientSession.hGetAll(key);
          io.to(socket.id).emit('res_watchlist_get', map || {});
        }
      }catch(err){
        console.error('req_watchlist_get error', err && err.message);
        io.to(socket.id).emit('res_watchlist_get', {});
      }
    });

    socket.on('req_watchlist_add', async function(payload) {
      try{        
        if(socket.request.session.login){
          const key = `watchlist:${socket.request.session.userInfo.id}`;
          if(payload && payload.code){
            const code = String(payload.code);
            const name = (payload.name || '').toString();
            await clientSession.hSet(key, code, name);
          }
          const map = await clientSession.hGetAll(key);
          io.to(socket.id).emit('res_watchlist_get', map || {});
        }
      }catch(err){
        console.error('req_watchlist_add error', err && err.message);
        io.to(socket.id).emit('res_watchlist_get', {});
      }
    });

    socket.on('req_watchlist_remove', async function(payload) {
      try{
        if(socket.request.session.login){
          const key = `watchlist:${socket.request.session.userInfo.id}`;
          if(payload && payload.code){
            const code = String(payload.code);
            await clientSession.hDel(key, code);
          }
          const map = await clientSession.hGetAll(key);
          io.to(socket.id).emit('res_watchlist_get', map || {});
        }
      }catch(err){
        console.error('req_watchlist_remove error', err && err.message);
        io.to(socket.id).emit('res_watchlist_get', {});
      }
    });

  });
}
