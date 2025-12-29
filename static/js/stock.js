// Initial stocks passed from server. If the template injected a value (via inline script)
// it will already be available as `initialStocks`. Otherwise use window.__INITIAL_STOCKS
// if the server set it, or default to an empty array.
var initialStocks = (typeof initialStocks !== 'undefined') ? initialStocks : (typeof window !== 'undefined' && window.__INITIAL_STOCKS ? window.__INITIAL_STOCKS : []);

// currently selected stock code (used for highlighting and chart title)
var selectedStockCode = null;

// global sort state
var currentSort = { key: 'pctChange', dir: 'desc' };
// current paging state
var currentPage = 1;
var currentPageSize = 10;
var currentDate = null;
var currentStocks = []; // stocks in the currently rendered page
var currentTotalPages = 1;
var pendingSelectIndex = null; // after page load, select this index within currentStocks
// if the server reports it already sorted the returned page, store here
var serverSortedBy = null;
var serverSortedDir = null;
// current industry filter selected from indutryTable (null = no filter)
var currentIndustry = null;
// when industry row selected, this holds array of stock codes belonging to that industry
var currentIndustryMembers = null;
// sorting state for indutryTable (client-side)
var industrySort = { key: 'tradeVolume', dir: 'desc' };
// currently selected tab mode for indutryWrapper: 'industry' or 'theme'
var industryMode = 'industry';
var lastIndustryList = [];
var lastThemeList = [];
// industry collapsed state: when true show only top 1 visible, when false show ~7 visible
var industryCollapsed = false;

// format numbers with thousand separators, return '-' for null/undefined
function formatNumber(v){
    if(v === null || v === undefined || v === '-') return '-';
    // allow already-formatted strings with commas
    var n = Number(String(v).replace(/,/g, ''));
    if(isNaN(n)) return String(v);
    try{ return n.toLocaleString('ko-KR'); }catch(e){ return String(n); }
}

function applySort(list){
    const arr = list.slice();
    // if server reported it already sorted by the client's currentSort key and dir, skip client-side sorting
    if(serverSortedBy && currentSort && serverSortedBy === currentSort.key){
        if(!currentSort.dir || serverSortedDir === currentSort.dir) return arr;
    }
    const key = currentSort.key;
    const dir = currentSort.dir === 'asc' ? 1 : -1;
    arr.sort((a,b) => {
    const A = a[key];
    const B = b[key];
    // treat empty/undefined/'-' as null and always push nulls to the end
    const aIsNull = (A === null || A === undefined || A === '-');
    const bIsNull = (B === null || B === undefined || B === '-');
    if(aIsNull && bIsNull) return 0;
    if(aIsNull) return 1; // a after b
    if(bIsNull) return -1; // b after a
    // numeric compare if both are numbers
    // allow percent strings like '1,234.56%' by stripping % and commas
    const aNum = Number(String(A).replace(/%/g,'').replace(/,/g,''));
    const bNum = Number(String(B).replace(/%/g,'').replace(/,/g,''));
    if(!isNaN(aNum) && !isNaN(bNum)) return (aNum - bNum) * dir;
    // fallback string compare
    return String(A).localeCompare(String(B)) * dir;
    });
    return arr;
}

function renderTable(stocks){
    var tbody = document.querySelector('#stockTable tbody');
    tbody.innerHTML = '';
    // store current page stocks for navigation
    currentStocks = stocks || [];
    const rows = applySort(stocks);
    rows.forEach(s => {
    var tr = document.createElement('tr');
    // highlight if this code is currently selected
    if(selectedStockCode && selectedStockCode === s.code){
        tr.classList.add('selected-row');
    }
    var pctDisplay = '-';
    if(s.pctChange !== null && s.pctChange !== undefined){
        var pval = Number(String(s.pctChange).replace(/,/g,''));
        if(!isNaN(pval)){
        try{ pctDisplay = pval.toLocaleString('ko-KR', {minimumFractionDigits:2, maximumFractionDigits:2}) + '%'; }
        catch(e){ pctDisplay = pval.toFixed(2) + '%'; }
        }else{
        pctDisplay = String(s.pctChange) + '%';
        }
    }
    var prevTvDisplay = formatNumber(s.prevTradeVolume || 0);
    var tvDisplay = formatNumber(s.tradeVolume || 0);
    var cpDisplay = formatNumber(s.closePrice || 0);
    var pctIncreases5Display = '-';
    if(s.pctIncreases5 !== null && s.pctIncreases5 !== undefined){
        try{
            if(Array.isArray(s.pctIncreases5) && s.pctIncreases5.length > 0){
                // server provides integers for pctIncreases5; display without percent sign
                pctIncreases5Display = s.pctIncreases5.map(v => {
                    const n = parseInt(v,10);
                    return isNaN(n) ? '-' : String(n);
                }).join(', ');
            }else{
                pctIncreases5Display = '-';
            }
        }catch(e){ pctIncreases5Display = '-'; }
    }
    
    // include industry column (use server-provided s.industry when available)
    tr.innerHTML = `<td class="stock-code">${s.code}</td><td class="stock-name">${s.name}</td><td class="stock-market">${s.market}</td><td>${cpDisplay}</td><td>${prevTvDisplay}</td><td>${tvDisplay}</td><td>${pctDisplay}</td><td>${pctIncreases5Display}</td>`;
    // attach click to fetch history for this stock
    tr.style.cursor = 'pointer';
    tr.addEventListener('click', async function(){
        const code = s.code;
        try{
            // update selection state and row highlight
            selectedStockCode = code;
            document.querySelectorAll('#stockTable tbody tr').forEach(r => r.classList.remove('selected-row'));
            tr.classList.add('selected-row');

            // request history via websocket
            bedSocket.emit('req_stock_history', code);
            // wait for single response for this code
            bedSocket.once('res_stock_history', function(msg){
                if(msg.error){ console.error('res_stock_history error', msg); return; }
                const hist = msg.history || [];
                chartFullHistory = hist; // store full history
                chartWindowStartIdx = Math.max(0, hist.length - CHART_MAX_DAYS); // start at end
                
                // get windowed data
                const windowedData = getChartWindow(hist, chartWindowStartIdx);
                const labels = windowedData.labels;
                const volData = windowedData.volData;
                const priceData = windowedData.priceData;

                if(chart) chart.destroy();
                const ctx = document.getElementById('stockChart').getContext('2d');
                // determine stock title from row or fallback to s.name/code
                const stockTitle = (function(){
                    try{ const row = Array.from(document.querySelectorAll('#stockTable tbody tr')).find(r => r.querySelector('.stock-code') && r.querySelector('.stock-code').textContent === code); return row ? (row.querySelector('.stock-name') ? row.querySelector('.stock-market').textContent + " " + row.querySelector('.stock-name').textContent : (s.name || code)) : (s.name || code); }catch(e){ return s.name || code; }
                })();
                // set chart title in DOM
                const chartTitleEl = document.getElementById('chartTitle');
                if(chartTitleEl) chartTitleEl.textContent = stockTitle + ' (' + code + ')';
                
                try{ updateWatchToggleState(); }catch(e){}

                chart = new Chart(ctx, {
                    data: {
                    labels: labels,
                    datasets: [
                        {
                            type: 'bar',
                            label: 'TradeVolume',
                            data: volData,
                            backgroundColor: 'rgba(54, 162, 235, 0.5)',
                            yAxisID: 'y',
                        },
                        {
                            type: 'line',
                            label: 'ClosePrice',
                            data: priceData,
                            borderColor: 'rgba(255,99,132,0.9)',
                            fill: false,
                            yAxisID: 'y1',
                        }
                    ]
                    },
                    options: {
                        responsive: true,
                        interaction: { mode: 'index', intersect: false },
                        stacked: false,
                        plugins: { 
                            legend: { display: true },
                            title: { display: false }
                        },
                        scales: {
                            y: { type: 'linear', display: true, position: 'left', beginAtZero: true },
                            y1: { type: 'linear', display: true, position: 'right', beginAtZero: true, grid: { drawOnChartArea: false }, suggestedMax: getMaxPrice(priceData) * 1.5 }
                        }
                    }
                });

                // reveal chart container and scroll it into view for focus
                const chartContainer = document.querySelector('.chart-container');
                if(chartContainer){
                    chartContainer.classList.add('visible');
                    try{ chartContainer.scrollIntoView({ behavior: 'smooth', block: 'center' }); }catch(e){}
                }
                
                const sel = document.getElementById('watchlistSelect');
                (sel.querySelector(`option[value="${code}"]`)) ? sel.value = code : sel.value = "";
            // close once callback for res_stock_history
            });
        }catch(err){ console.error('history fetch error', err); }
    });
    tbody.appendChild(tr);
    });
}

var chart = null;
// Chart scrolling: store full history and current window start index
var chartFullHistory = []; // full history data from server
var chartWindowStartIdx = 0; // start index for 140-day window
const CHART_MAX_DAYS = 140; // maximum days to display in chart window
// current watchlist mapping code -> name for this user
var currentWatchlist = {};
// when navigating to a page to select a specific code, store pending code
var pendingSelectCode = null;
// programmatic selection helper: select by code, highlight row and load history into chart
function selectStockByCode(code){
    if(!code) return;
    // update selection state
    selectedStockCode = code;
    // update row highlight
    try{
        document.querySelectorAll('#stockTable tbody tr').forEach(r => r.classList.remove('selected-row'));
        const row = Array.from(document.querySelectorAll('#stockTable tbody tr')).find(r => {
            const c = r.querySelector('.stock-code');
            return c && c.textContent === code;
        });
        if(row) row.classList.add('selected-row');
    }catch(e){/*ignore*/}

    // request history via websocket and render same as row click
    try{
        bedSocket.emit('req_stock_history', code);
        bedSocket.once('res_stock_history', function(msg){
            if(msg.error){ console.error('res_stock_history error', msg); return; }
            const hist = msg.history || [];
            chartFullHistory = hist; // store full history for sliding window
            chartWindowStartIdx = Math.max(0, hist.length - CHART_MAX_DAYS); // start at end, show last 240 days
            
            // get windowed data
            const windowedData = getChartWindow(hist, chartWindowStartIdx);
            const labels = windowedData.labels;
            const volData = windowedData.volData;
            const priceData = windowedData.priceData;

            if(chart) chart.destroy();
            const ctx = document.getElementById('stockChart').getContext('2d');

            // determine stock title from currently rendered rows or fallback
            const stockTitle = (function(){
                try{ const row = Array.from(document.querySelectorAll('#stockTable tbody tr')).find(r => r.querySelector('.stock-code') && r.querySelector('.stock-code').textContent === code); return row ? (row.querySelector('.stock-name') ? row.querySelector('.stock-market').textContent + " " + row.querySelector('.stock-name').textContent : code) : code; }catch(e){ return code; }
            })();
            const chartTitleEl = document.getElementById('chartTitle');
            if(chartTitleEl) chartTitleEl.textContent = stockTitle + ' (' + code + ')';

            // update watch toggle visibility/state after chart title updated
            try{ updateWatchToggleState(); }catch(e){}

            chart = new Chart(ctx, {
                data: {
                    labels: labels,
                    datasets: [
                        { type: 'bar', label: 'TradeVolume', data: volData, backgroundColor: 'rgba(54, 162, 235, 0.5)', yAxisID: 'y' },
                        { type: 'line', label: 'ClosePrice', data: priceData, borderColor: 'rgba(255,99,132,0.9)', fill: false, yAxisID: 'y1' }
                    ]
                },
                options: {
                    responsive: true,
                    interaction: { mode: 'index', intersect: false },
                    stacked: false,
                    plugins: { legend: { display: true }, title: { display: false } },
                    scales: { y: { type: 'linear', display: true, position: 'left', beginAtZero: true }, y1: { type: 'linear', display: true, position: 'right', beginAtZero: true, grid: { drawOnChartArea: false }, suggestedMax: getMaxPrice(priceData) * 1.5 } }
                }
            });

            const chartContainer = document.querySelector('.chart-container');
            if(chartContainer){ chartContainer.classList.add('visible'); try{ chartContainer.scrollIntoView({ behavior: 'smooth', block: 'center' }); }catch(e){} }

            const sel = document.getElementById('watchlistSelect');
            (sel.querySelector(`option[value="${code}"]`)) ? sel.value = code : sel.value = "";
        });
    }catch(err){ console.error('history fetch error', err); }
}
// simple debounce helper
function debounce(fn, wait){
    let t = null;
    return function(){
        const args = arguments;
        clearTimeout(t);
        t = setTimeout(() => fn.apply(null, args), wait);
    };
}
function setUIBlocked(blocked) {
    const table = document.getElementById('stockTable');
    const pagination = document.getElementById('stockPagination');
    const topN = document.getElementById('topN');
    const market = document.getElementById('marketFilter');
    const name = document.getElementById('nameFilter');
    if (table) table.style.pointerEvents = blocked ? 'none' : 'auto';
    if (pagination) pagination.style.pointerEvents = blocked ? 'none' : 'auto';
    if (topN) topN.disabled = blocked;
    if (market) market.disabled = blocked;
    if (name) name.disabled = blocked;
    // visual overlay
    const overlayId = 'ui-block-overlay';
    let overlay = document.getElementById(overlayId);
    if (blocked) {
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = overlayId;
            overlay.style.position = 'fixed';
            overlay.style.top = '0';
            overlay.style.left = '0';
            overlay.style.right = '0';
            overlay.style.bottom = '0';
            overlay.style.background = 'rgba(255,255,255,0.6)';
            overlay.style.zIndex = '9999';
            overlay.innerHTML = '<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);">Loading...</div>';
            document.body.appendChild(overlay);
        }
    } else {
        if (overlay) overlay.remove();
    }
}
function renderChart(stocks){
    var ctx = document.getElementById('stockChart').getContext('2d');
    // x-axis: date labels (use current selected date), y-axis: tradeVolume by name
    var labels = stocks.map(s => s.name);
    var data = stocks.map(s => parseInt(String(s.tradeVolume).replace(/,/g, '')) || 0);

    if(chart) chart.destroy();
    chart = new Chart(ctx, {
    type: 'bar',
    data: {
        labels: labels,
        datasets: [{
            label: 'Trade Volume',
            data: data,
            backgroundColor: 'rgba(54, 162, 235, 0.5)'
        }]
    },
    options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { x: { ticks: { maxRotation: 90, autoSkip: true } }, y: { beginAtZero: true } }
    }
    });
}

// render industry summary table (top 10 by pctChange)
function renderIndustryTable(list){
    const tbody = document.querySelector('#indutryTable tbody');
    if(!tbody) return;
    // ensure the induty table wrapper is visible
    try{
        const indutyWrapper = document.querySelector('#indutryTable') ? document.querySelector('#indutryTable').closest('.table-responsive') : null;
        if(indutyWrapper) indutyWrapper.classList.add('visible');
    }catch(e){ /* ignore */ }
    tbody.innerHTML = '';
    if(!Array.isArray(list)) list = [];
    // show complete list (no slicing) but allow wrapper to control visible rows
    // sort copy according to industrySort by default when rendering
    let working = (list || []).slice();
    const ik = industrySort.key || 'pctChange';
    const idir = industrySort.dir === 'asc' ? 1 : -1;
    working.sort((a,b) => {
        const A = a[ik];
        const B = b[ik];
        const aIsNull = (A === null || A === undefined);
        const bIsNull = (B === null || B === undefined);
        if(aIsNull && bIsNull) return 0;
        if(aIsNull) return 1;
        if(bIsNull) return -1;
        const aNum = Number(String(A).replace(/,/g, ''));
        const bNum = Number(String(B).replace(/,/g, ''));
        if(!isNaN(aNum) && !isNaN(bNum)) return (aNum - bNum) * idir;
        return String(A).localeCompare(String(B)) * idir;
    });
    const top = working; // render entire industry list; wrapper CSS controls visible area
    // attach header click handlers for client-side sorting
    try{
        document.querySelectorAll('#indutryTable thead th[data-key]').forEach(th => {
            // idempotent handler: remove previous arrow then add
            th.style.cursor = 'pointer';
            let arrow = th.querySelector('.sort-arrow');
            if(!arrow){ arrow = document.createElement('span'); arrow.className = 'sort-arrow'; arrow.style.marginLeft = '6px'; th.appendChild(arrow); }
            const hk = th.getAttribute('data-key');
            arrow.textContent = (hk === industrySort.key) ? (industrySort.dir === 'asc' ? '▲' : '▼') : '';
            th.onclick = function(){
                if(industrySort.key === hk) industrySort.dir = (industrySort.dir === 'asc') ? 'desc' : 'asc';
                else { industrySort.key = hk; industrySort.dir = 'desc'; }
                // re-render with new sort
                renderIndustryTable(list);
            };
        });
    }catch(e){ /* ignore */ }
    top.forEach(it => {
        const tr = document.createElement('tr');
        const prevTv = formatNumber(it.prevTradeVolume || 0);
        const tv = formatNumber(it.tradeVolume || 0);
        let pct = '-';
        if(it.pctChange !== null && it.pctChange !== undefined){
            try{ pct = Number(it.pctChange).toLocaleString('ko-KR', {minimumFractionDigits:2, maximumFractionDigits:2}) + '%'; }
            catch(e){ pct = (Math.round((it.pctChange||0)*100)/100) + '%'; }
        }
        tr.innerHTML = `<td>${it.induty_name || it.induty_code || ''}</td><td>${prevTv}</td><td>${tv}</td><td>${pct}</td>`;
        // clicking an industry row will filter the stockTable to only the industry's member codes (toggle)
        tr.style.cursor = 'pointer';
        tr.addEventListener('click', function(){
            const selName = (it.induty_name || it.induty_code || '').toString();
            // toggle: if already selected, clear filter and expand
            if(currentIndustry === selName){
                currentIndustry = null;
                currentIndustryMembers = null;
                industryCollapsed = false; // expand when deselected
            } else {
                currentIndustry = selName;
                currentIndustryMembers = Array.isArray(it.members) ? it.members.slice() : (it.members ? String(it.members).split(',').map(x=>x.trim()) : null);
                industryCollapsed = true; // collapse when selected
                document.querySelector('#indutryWrapper').scrollTop = 0;
            }
            // update visual selection on rows
            try{
                Array.from(tbody.querySelectorAll('tr')).forEach(r => r.classList.remove('selected-row'));
                if(currentIndustry) tr.classList.add('selected-row');
            }catch(e){/*ignore*/}
            updateIndustryWrapperUI();
            // determine current date (preserve the user's selected date). Prefer:
            // 1) explicit selected date element, 2) previously stored currentDate, 3) first date element (latest)
            let selEl = document.querySelector('#stock_date .date.selected');
            let date = selEl ? selEl.id : (currentDate || null);
            if(!date){ const firstEl = document.querySelector('#stock_date .date'); if(firstEl) date = firstEl.id; }
            // ensure we remember this date for subsequent requests
            currentDate = date || currentDate;
            requestPageForDate(date, 1, currentPageSize);
        });
        tbody.appendChild(tr);
    });
    // highlight selected industry row if currentIndustry set
    try{
        if(currentIndustry){
            Array.from(tbody.querySelectorAll('tr')).forEach(r => {
                const nameCell = r.querySelector('td');
                if(nameCell && nameCell.textContent === currentIndustry) r.classList.add('selected-row');
            });
        }
    }catch(e){/*ignore*/}
}

function updateIndustryWrapperUI(){
    const wrapper = document.getElementById('indutryWrapper');
    const toggle = document.getElementById('toggleIndustryBtn');
    if(!wrapper) return;
    wrapper.classList.remove('collapsed','expanded');
    if(industryCollapsed){ wrapper.classList.add('collapsed'); if(toggle) toggle.textContent = '▾'; }
    else { wrapper.classList.add('expanded'); if(toggle) toggle.textContent = '▴'; }
}

function applyTopNFilter(stocks){
    var top = document.getElementById('topN').value;
    // normalize pctChange to number for sorting
    var normalized = stocks.map(s => Object.assign({}, s, { _tv: parseInt(String(s.pctChange).replace(/,/g, '')) || 0 }));
    normalized.sort((a,b) => b._tv - a._tv);
    if(top !== 'all'){
        var n = parseInt(top, 10) || normalized.length;
        normalized = normalized.slice(0, n);
    }
    // strip helper field
    return normalized.map(s => { delete s._tv; return s; });
}

// Refresh the bottom date list using the authoritative full list from server (allDates array)
function refreshDateListFromAll(allDates){
    try{
        const container = document.getElementById('stock_date');
        if(!container) return;
        if(!Array.isArray(allDates)) allDates = [];
        // filter valid YYYYMMDD and sort descending for display
        const valid = allDates.filter(x => /^\d{8}$/.test(String(x))).slice();
        valid.sort();
        const rev = valid.slice().reverse();
        // rebuild DOM
        container.innerHTML = '';
        for(const dt of rev){
            const div = document.createElement('div');
            div.className = 'date';
            div.id = dt;
            div.textContent = dt;
            container.appendChild(div);
        }
        // re-wire click handlers and visibility
        document.querySelectorAll('#stock_date .date').forEach(el => {
            el.removeEventListener && el.removeEventListener('click', el._clickHandler);
            const handler = function(){
                var date = this.id; // YYYYMMDD
                // toggle selected class
                document.querySelectorAll('#stock_date .date').forEach(d => d.classList.remove('selected'));
                this.classList.add('selected');
                loadByDate(date);
            };
            el._clickHandler = handler;
            el.addEventListener('click', handler);
        });
        // restore selected class if currentDate set
        if(currentDate){
            const sel = document.getElementById(currentDate);
            if(sel){
                document.querySelectorAll('#stock_date .date').forEach(d => d.classList.remove('selected'));
                sel.classList.add('selected');
            }
        }
        // update collapsed/expanded visibility: infer collapsed state from toggle button text
        try{
            const toggleBtn = document.getElementById('toggleDatesBtn');
            let collapsed = true;
            if(toggleBtn){
                const txt = (toggleBtn.textContent || '').toLowerCase();
                if(txt.indexOf('hide') !== -1) collapsed = false;
            }
            const items = Array.from(container.querySelectorAll('.date'));
            if(collapsed){
                items.forEach((it, idx) => { it.style.display = (idx < 5) ? '' : 'none'; });
            } else {
                items.forEach(it => it.style.display = '');
            }
        }catch(e){}
    }catch(e){ console.error('refreshDateListFromAll error', e); }
}

function loadByDate(date){
    try{
        // remember requested date so other actions (industry filter, navigation) preserve it
        currentDate = date || currentDate;
        // delegate to centralized requester which already applies currentIndustryMembers when present
        requestPageForDate(currentDate, 1, currentPageSize || 10);
    }catch(err){ console.error(err); }
}

    function requestPageForDate(date, page, pageSize){
        const topN = document.getElementById('topN').value;
        const market = document.getElementById('marketFilter') ? document.getElementById('marketFilter').value : 'all';
        const name = document.getElementById('nameFilter') ? document.getElementById('nameFilter').value.trim() : '';
        const sortKey = currentSort ? currentSort.key : null;
        const sortDir = currentSort ? currentSort.dir : null;
        // update local paging state before request
        currentPage = page || 1;
        currentPageSize = pageSize || currentPageSize;
        currentDate = date || currentDate;
        setUIBlocked(true);
        const payload = { date: date, topN: topN, page: page, pageSize: pageSize, market: market, name: name, sortKey: sortKey, sortDir: sortDir };
        // include industry filter when set
        if(currentIndustryMembers && Array.isArray(currentIndustryMembers) && currentIndustryMembers.length > 0){
            payload.members = currentIndustryMembers;
        }
        bedSocket.emit('req_stock_data', payload);
        bedSocket.once('res_stock_data', function(msg){
        try{
            if(msg.error){ console.error('res_stock_data error', msg); return; }
            // store server sorting metadata
            serverSortedBy = msg.sortedBy || null;
            serverSortedDir = msg.sortedDir || null;
            const stocks = msg.stocks || [];
            renderTable(stocks);
            renderChart(stocks);
            lastIndustryList = msg.industryList || [];
            lastThemeList = msg.themeList || [];
            try{ renderIndustryTable(industryMode === 'theme' ? lastThemeList : lastIndustryList); }catch(e){}
            renderPagination(msg.page, msg.pageSize, msg.totalPages, msg.totalItems, date);
            // if a specific code selection is pending, ensure it's selected after rendering
            if(pendingSelectCode){
                try{ selectStockByCode(pendingSelectCode); }catch(e){}
                pendingSelectCode = null;
            }
            // if a selection is pending (e.g., navigation requested next/prev across pages), perform it
            if(pendingSelectIndex !== null){
                try{
                    let idx;
                    if(pendingSelectIndex === 'first') idx = 0;
                    else if(pendingSelectIndex === 'last') idx = (currentStocks.length > 0 ? currentStocks.length - 1 : 0);
                    else idx = pendingSelectIndex;
                    if(Number.isInteger(idx) && currentStocks[idx]){
                        selectStockByCode(currentStocks[idx].code);
                    }
                }catch(e){/*ignore*/}
                pendingSelectIndex = null;
            }
        }finally{
            setUIBlocked(false);
        }
    });
}

function renderPagination(page, pageSize, totalPages, totalItems, date){
    // update globals
    currentTotalPages = totalPages || 1;
    currentPage = page || 1;
    currentPageSize = pageSize || currentPageSize;
    const ul = document.getElementById('stockPagination');
    if(!ul) return;
    ul.innerHTML = '';

    // pages (show up to 7 page buttons centered around current)
    const maxButtons = 7;
    let start = Math.max(1, page - Math.floor(maxButtons/2));
    let end = Math.min(totalPages, start + maxButtons - 1);
    if(end - start < maxButtons - 1) start = Math.max(1, end - maxButtons + 1);
    
    // First
    const firstLi = document.createElement('li'); firstLi.className = 'page-item' + (page == 1 ? ' disabled' : '');
    const firstA = document.createElement('a'); firstA.className = 'page-link'; firstA.href = '#'; firstA.textContent = 'First';
    firstA.addEventListener('click', function(e){ e.preventDefault(); requestPageForDate(date, 1, pageSize); });
    firstLi.appendChild(firstA); ul.appendChild(firstLi);

    // prev
    const prevLi = document.createElement('li'); prevLi.className = 'page-item' + (page <= 1 ? ' disabled' : '');
    const prevA = document.createElement('a'); prevA.className = 'page-link'; prevA.href = '#'; prevA.textContent = 'Previous';
    prevA.addEventListener('click', function(e){ e.preventDefault(); if(page > 1) requestPageForDate(date, page - 1, pageSize); });
    prevLi.appendChild(prevA); ul.appendChild(prevLi);

    for(let p = start; p <= end; p++){
        const li = document.createElement('li'); li.className = 'page-item' + (p == page ? ' active' : '');
        const a = document.createElement('a'); a.className = 'page-link'; a.href = '#'; a.textContent = String(p);
        a.addEventListener('click', function(e){ e.preventDefault();
            requestPageForDate(date, p, pageSize);
        });
        li.appendChild(a); ul.appendChild(li);
    }

    // next
    const nextLi = document.createElement('li'); nextLi.className = 'page-item' + (page >= totalPages ? ' disabled' : '');
    const nextA = document.createElement('a'); nextA.className = 'page-link'; nextA.href = '#'; nextA.textContent = 'Next';
    nextA.addEventListener('click', function(e){ e.preventDefault(); if(page < totalPages) requestPageForDate(date, page + 1, pageSize); });
    nextLi.appendChild(nextA); ul.appendChild(nextLi);
    
    // last
    const lastLi = document.createElement('li'); lastLi.className = 'page-item' + (page == totalPages ? ' disabled' : '');
    const lastA = document.createElement('a'); lastA.className = 'page-link'; lastA.href = '#'; lastA.textContent = 'Last';
    lastA.addEventListener('click', function(e){ e.preventDefault(); requestPageForDate(date, totalPages, pageSize); });
    lastLi.appendChild(lastA); ul.appendChild(lastLi);
}

// wire up date clicks
document.addEventListener('DOMContentLoaded', function(){
    // initial render: if there are dates, request server for the latest date page
    // header click sorting (currentSort) controls sort; default is pctChange desc
    const firstDateEl = document.querySelector('#stock_date .date');
    if(firstDateEl){
        // the template renders dates in reverse (latest first), so pick the first element
        const date = firstDateEl.id;
        // mark selected visually; actual selection class will be set after successful load
        firstDateEl.classList.add('selected');

        // Ensure we only call loadByDate after websocket is connected.
        // bedSocket is created in connect.js; poll briefly if it's not yet defined.
        const tryLoad = () => {
            try{
                if(typeof bedSocket !== 'undefined' && bedSocket){
                    if(bedSocket.connected){
                        loadByDate(date);
                    }else{
                        // wait for connect event once
                        bedSocket.once('connect', function(){ loadByDate(date); });
                    }
                    return true;
                }
            }catch(e){}
            return false;
        };

        if(!tryLoad()){
            // poll until bedSocket is available (short-lived)
            const poll = setInterval(function(){ if(tryLoad()){ clearInterval(poll); } }, 200);
            // safety timeout to stop polling after a while
            setTimeout(function(){ clearInterval(poll); }, 15000);
        }
    }else{
        const initialFiltered = applyTopNFilter(initialStocks);
        renderTable(initialFiltered);
        renderChart(initialFiltered);
    }

    document.querySelectorAll('#stock_date .date').forEach(el => {
        el.addEventListener('click', function(){
            var date = this.id; // YYYYMMDD
            // toggle selected class
            document.querySelectorAll('#stock_date .date').forEach(d => d.classList.remove('selected'));
            this.classList.add('selected');
            loadByDate(date);
        });
    });

    // date list collapse/expand behavior
    const dateContainer = document.getElementById('stock_date');
    const toggleBtn = document.getElementById('toggleDatesBtn');
    let datesCollapsed = true; // default collapsed
    function updateDateVisibility(){
        if(!dateContainer) return;
        const items = Array.from(dateContainer.querySelectorAll('.date'));
        // ensure items are in DOM order (we rendered reversed in Pug)
        if(datesCollapsed){
        items.forEach((it, idx) => { it.style.display = (idx < 5) ? '' : 'none'; });
        if(toggleBtn) toggleBtn.textContent = 'Show dates';
        }else{
        items.forEach(it => it.style.display = '');
        if(toggleBtn) toggleBtn.textContent = 'Hide dates';
        }
    }
    if(toggleBtn){
        toggleBtn.addEventListener('click', function(){ datesCollapsed = !datesCollapsed; updateDateVisibility(); });
    }
    // initialize visibility
    updateDateVisibility();
    
    function deleteDateStock(){
        const selectedEl = document.querySelector('#stock_date .date.selected');
        if(!selectedEl){
            alert('No date selected to delete.');
            return;
        }
        const date = selectedEl.id;
        if(!confirm('Are you sure you want to delete stock data for date ' + date + '? This action cannot be undone.')){
            return;
        }
        setUIBlocked(true);
        bedSocket.emit('req_delete_stock_date', { date: date });
        bedSocket.once('res_delete_stock_date', function(msg){
            try{
                if(msg.error){
                    alert('Error deleting stock data for date ' + date + ': ' + msg.error);
                    console.error('res_delete_stock_date error', msg);
                    return;
                }
                alert('Successfully deleted stock data for date ' + date + '. The page will now reload.');
                // reload the page to reflect changes
                window.location.reload();
            }finally{
                setUIBlocked(false);
            }
        });
    }
    const delDateBtn = document.getElementById('delDateBtn');
    if(delDateBtn){
        delDateBtn.addEventListener('click', function(){ deleteDateStock(); });
    }

    // wire up industry toggle button
    const indToggle = document.getElementById('toggleIndustryBtn');
    if(indToggle){
        indToggle.addEventListener('click', function(){ industryCollapsed = !industryCollapsed; updateIndustryWrapperUI(); });
    }
    // ensure initial state
    updateIndustryWrapperUI();

    // Ensure containers are visible immediately so the page isn't blank while waiting for server
    try{
        const chartContainerInit = document.querySelector('.chart-container');
        const stockWrapperInit = document.querySelector('#stockTable') ? document.querySelector('#stockTable').closest('.table-responsive') : null;
        const indutyWrapperInit = document.querySelector('#indutryTable') ? document.querySelector('#indutryTable').closest('.table-responsive') : null;
        if(chartContainerInit) chartContainerInit.classList.add('visible');
        if(stockWrapperInit) stockWrapperInit.classList.add('visible');
        if(indutyWrapperInit) indutyWrapperInit.classList.add('visible');
    }catch(e){/*ignore*/}

    // header sorting: add arrow span and attach click handlers to table headers
    document.querySelectorAll('#stockTable thead th[data-key]').forEach(th => {
        th.style.cursor = 'pointer';
        const arrow = document.createElement('span');
        arrow.className = 'sort-arrow';
        arrow.style.marginLeft = '6px';
        th.appendChild(arrow);
        th.addEventListener('click', function(){
            const k = this.getAttribute('data-key');
            if(currentSort.key === k){
            currentSort.dir = (currentSort.dir === 'asc') ? 'desc' : 'asc';
            }else{
            currentSort.key = k;
            currentSort.dir = 'desc';
            }
            // update arrow indicators
            document.querySelectorAll('#stockTable thead th[data-key]').forEach(h => {
            const a = h.querySelector('.sort-arrow');
            if(!a) return;
            const hk = h.getAttribute('data-key');
            if(hk === currentSort.key) a.textContent = currentSort.dir === 'asc' ? '▲' : '▼';
            else a.textContent = '';
            });
            // keep the current page if possible; request current page with new sort
            const sel = document.querySelector('#stock_date .date.selected');
            const date = sel ? sel.id : (document.querySelector('#stock_date .date') ? document.querySelector('#stock_date .date').id : null);
            // request same page instead of forcing page 1
            requestPageForDate(date, currentPage, currentPageSize);
        });
    });

    // req_stock_date client-side update temporarily disabled for debugging

    // update when topN changes (re-apply to current displayed date if any)
    function reapplyCurrent(){
        const selectedEl = document.querySelector('#stock_date .date.selected');
        const date = selectedEl ? selectedEl.id : (document.querySelector('#stock_date .date') ? document.querySelector('#stock_date .date').id : null);
        if(date){ loadByDate(date); }
        else {
            // use currentSort for ordering when not loading a specific date
            const cur = applyTopNFilter(applySort(initialStocks));
            renderTable(cur); renderChart(cur);
        }
    }

    document.getElementById('topN').addEventListener('change', reapplyCurrent);
            // wire filter inputs to reload page 1 when changed
    const marketEl = document.getElementById('marketFilter');
    const nameEl = document.getElementById('nameFilter');
    if (marketEl) marketEl.addEventListener('change', () => requestPageForDate(document.querySelector('#stock_date .date.selected') ? document.querySelector('#stock_date .date.selected').id : document.querySelector('#stock_date .date') ? document.querySelector('#stock_date .date').id : null, 1, 10));
    if (nameEl) nameEl.addEventListener('keydown', function(e){
        if(e.key === 'Enter' || e.keyCode === 13){
            const date = document.querySelector('#stock_date .date.selected') ? document.querySelector('#stock_date .date.selected').id : (document.querySelector('#stock_date .date') ? document.querySelector('#stock_date .date').id : null);
            requestPageForDate(date, 1, 10);
        }
    });

    // prev/next chart navigation buttons: select previous/next row in currentStocks
    const prevBtn = document.getElementById('chartPrevBtn');
    const nextBtn = document.getElementById('chartNextBtn');
    function navigateOffset(offset){
        // compute current index in currentStocks
        if(!currentStocks || currentStocks.length === 0) return;
        let idx = currentStocks.findIndex(s => s.code === selectedStockCode);
        if(idx === -1) idx = 0; // if nothing selected, start at first
        const dateEl = document.querySelector('#stock_date .date.selected') || document.querySelector('#stock_date .date');
        const date = dateEl ? dateEl.id : null;
        if(offset < 0){
            // previous
            if(idx + offset >= 0){
                selectStockByCode(currentStocks[idx + offset].code);
            } else if(currentPage > 1){
                // go to previous page and select last item there
                pendingSelectIndex = 'last';
                requestPageForDate(date, currentPage - 1, currentPageSize);
            }
        } else {
            // next
            if(idx + offset <= currentStocks.length - 1){
                selectStockByCode(currentStocks[idx + offset].code);
            } else if(currentPage < currentTotalPages){
                // go to next page and select first item there
                pendingSelectIndex = 'first';
                requestPageForDate(date, currentPage + 1, currentPageSize);
            }
        }
    }
    if(prevBtn) prevBtn.addEventListener('click', function(e){ e.preventDefault(); navigateOffset(-1); });
    if(nextBtn) nextBtn.addEventListener('click', function(e){ e.preventDefault(); navigateOffset(1); });

    // Chart drag-to-scroll: allow user to drag left/right to scroll 240-day window
    let chartDragStart = null;
    const chartCanvas = document.getElementById('stockChart');
    if(chartCanvas){
        chartCanvas.addEventListener('mousedown', function(e){
            if(!chartFullHistory || chartFullHistory.length <= CHART_MAX_DAYS) return; // no scrolling if data fits
            chartDragStart = { x: e.clientX, y: e.clientY, startIdx: chartWindowStartIdx };
            chartCanvas.style.cursor = 'grabbing';
        });

        document.addEventListener('mousemove', function(e){
            if(!chartDragStart) return;
            const deltaX = e.clientX - chartDragStart.x;
            // 50px of drag = 1 day of movement (adjust for sensitivity)
            const daysMove = -Math.round(deltaX / 5);
            if(daysMove === 0) return;
            
            let newIdx = chartDragStart.startIdx + daysMove;
            newIdx = Math.max(0, Math.min(newIdx, chartFullHistory.length - CHART_MAX_DAYS));
            
            if(newIdx !== chartWindowStartIdx){
                chartWindowStartIdx = newIdx;
                updateChart();
            }
        });

        document.addEventListener('mouseup', function(){
            if(chartDragStart){
                chartCanvas.style.cursor = 'grab';
                chartDragStart = null;
            }
        });

        // set initial cursor
        chartCanvas.addEventListener('mouseenter', function(){
            if(chartFullHistory && chartFullHistory.length > CHART_MAX_DAYS){
                chartCanvas.style.cursor = 'grab';
            }
        });
        chartCanvas.addEventListener('mouseleave', function(){
            chartCanvas.style.cursor = 'default';
            if(chartDragStart) chartDragStart = null;
        });
    }

    // 5dChange header click: server-side sort by 5d sum if supported
    const hdr5 = document.getElementById('hdr-5dchange');
    if (hdr5) {
        // avoid adding duplicate handlers
        hdr5.removeEventListener && hdr5.removeEventListener('click', hdr5._handler);
        hdr5._handler = function(){
            const dateEl = document.querySelector('#stock_date .date.selected') || document.querySelector('#stock_date .date');
            const date = dateEl ? dateEl.id : null;
            if(!date) return;
            const topN = document.getElementById('topN').value;
            const market = document.getElementById('marketFilter') ? document.getElementById('marketFilter').value : 'all';
            const name = document.getElementById('nameFilter') ? document.getElementById('nameFilter').value.trim() : '';
            // flip sort direction if already sorting by the 5d pseudo-key
            if(currentSort && currentSort.key === 'avg5d'){
                currentSort.dir = (currentSort.dir === 'asc') ? 'desc' : 'asc';
            } else {
                currentSort = { key: 'avg5d', dir: 'desc' };
            }
            setUIBlocked(true);
            const payload = { date: date, topN: topN, page: 1, pageSize: 10, market: market, name: name, sortBy5dSum: true, sortKey: currentSort.key, sortDir: currentSort.dir };
            bedSocket.emit('req_stock_data', payload);
        };
        hdr5.addEventListener('click', hdr5._handler);
    }

    // Attach chart title click handler for popup
    setTimeout(function(){ 
        const titleEl = document.getElementById('chartTitle');
        if(titleEl){
            titleEl.style.cursor = 'pointer';
            titleEl.addEventListener('click', function(e){
                e.preventDefault();
                e.stopPropagation();
                if(!selectedStockCode){
                    alert('차트에 연결된 종목 코드가 없습니다.');
                    return;
                }
                const name = titleEl.textContent.split('(')[0].trim();
                openChartPopupForCode(selectedStockCode, name);
            });
        }
    }, 100);
});

// wire up industry/theme tab buttons
try{
    const tabIndustry = document.getElementById('tabIndustry');
    const tabTheme = document.getElementById('tabTheme');
    function setTabMode(mode){
        industryMode = mode;
        if(tabIndustry) tabIndustry.classList.toggle('active', mode === 'industry');
        if(tabTheme) tabTheme.classList.toggle('active', mode === 'theme');
        // re-render using the currently stored lists
        if(mode === 'theme') renderIndustryTable(lastThemeList || []);
        else renderIndustryTable(lastIndustryList || []);
    }
    if(tabIndustry) tabIndustry.addEventListener('click', () => setTabMode('industry'));
    if(tabTheme) tabTheme.addEventListener('click', () => setTabMode('theme'));
    // initialize active tab UI
    setTabMode(industryMode);
}catch(e){/*ignore*/}

// Attach listener to server-side notifications about newly added stock dates
(function attachNotifyHandler(){
    const tryAttach = function(){
        try{
            if(typeof bedSocket !== 'undefined' && bedSocket){
                // when server broadcasts that new stock dates were added, refresh current view
                bedSocket.on('notify_stock_data_updated', function(msg){
                    try{
                        // If server provided authoritative allDates, use it to refresh the date list.
                        if(msg && Array.isArray(msg.allDates) && msg.allDates.length > 0){
                            try{ refreshDateListFromAll(msg.allDates); }catch(e){/*ignore*/}
                        }
                        // determine currently-selected date (preserve industry filter). If a current selection exists
                        // and the server also supplied addedDates, compare the most recently added date and prompt.
                        const sel = document.querySelector('#stock_date .date.selected');
                        const selectedDate = sel ? sel.id : (currentDate || null);
                        const newestAdded = (msg && Array.isArray(msg.addedDates) && msg.addedDates.length > 0) ? (msg.addedDates[msg.addedDates.length - 1]) : null;
                        // If there's a selected date and the newest added date is later, ask user to confirm switching
                        if(selectedDate && newestAdded && newestAdded > selectedDate){
                            try{
                                const ok = confirm('새로운 데이터가 ' + newestAdded + '에 추가되었습니다. 최신 날짜로 이동하시겠습니까?');
                                if(ok){
                                    // mark new date as selected in DOM
                                    const newEl = document.getElementById(newestAdded);
                                    if(newEl){ document.querySelectorAll('#stock_date .date').forEach(d => d.classList.remove('selected')); newEl.classList.add('selected'); }
                                    currentDate = newestAdded;
                                    requestPageForDate(newestAdded, 1, currentPageSize || 10);
                                }
                            }catch(e){ console.error('confirm error', e); if(selectedDate) requestPageForDate(selectedDate, 1, currentPageSize || 10); }
                        } else if(selectedDate){
                            // no newer data or no addedDates -> refresh current selection
                            requestPageForDate(selectedDate, 1, currentPageSize || 10);
                        } else if(msg && Array.isArray(msg.allDates) && msg.allDates.length > 0){
                            // no selection; show most recent date from allDates
                            const newest = msg.allDates.slice().sort().slice(-1)[0];
                            if(newest) requestPageForDate(newest, 1, currentPageSize || 10);
                        } else if(newestAdded){
                            // fallback: use newestAdded
                            requestPageForDate(newestAdded, 1, currentPageSize || 10);
                        }
                    }catch(e){ console.error('notify handler error', e); }
                });
                try{ bedSocket.emit('req_watchlist_get'); }catch(e){}
                return true;
            }
        }catch(e){}
        return false;
    };
    if(!tryAttach()){
        const poll = setInterval(function(){ if(tryAttach()){ clearInterval(poll); } }, 250);
        setTimeout(function(){ clearInterval(poll); }, 15000);
    }
})();

// ---------------- Watchlist support ----------------
// helper: get currently selected stock code and name (from currentStocks or table)
function getSelectedStockInfo(){
    let code = selectedStockCode;
    let name = null;
    if(code){
        const found = (currentStocks || []).find(s => String(s.code) === String(code));
        if(found) name = found.name;
    }
    // fallback: try to read displayed chart title
    if(!name){
        try{
            const el = document.getElementById('chartTitle');
            if(el && el.textContent){
                // chartTitle often contains "Name (CODE)" - try to parse
                const t = el.textContent.trim();
                const m = t.match(/^(.*)\s*\(([^\)]+)\)$/);
                if(m){ name = m[1].trim(); if(!code) code = m[2].trim(); }
            }
        }catch(e){}
    }
    return { code: code, name: name };
}

// refresh watchlist select from an object mapping code->name
function refreshWatchlistSelectFromObj(obj){
    try{
        const sel = document.getElementById('watchlistSelect');
        if(!sel) return;
        sel.innerHTML = '';
        // add empty option
        const empty = document.createElement('option'); empty.value = ''; empty.textContent = '- Watchlist -'; sel.appendChild(empty);
        if(!obj) obj = {};
        const entries = Object.keys(obj).map(k => ({ code: k, name: obj[k] }));
        // sort by name
        //entries.sort((a,b) => String(a.name || a.code).localeCompare(String(b.name || b.code)));
        for(const e of entries){
            const o = document.createElement('option'); o.value = String(e.code); o.textContent = (e.name ? e.name + ' (' + e.code + ')' : e.code); sel.appendChild(o);
        }
        // store locally and update toggle button state
        currentWatchlist = obj || {};
        try{ updateWatchToggleState(); }catch(e){}
    }catch(e){ console.error('refreshWatchlistSelectFromObj error', e); }
}

// request server watchlist and populate
function requestWatchlist(){
    try{
        if(typeof bedSocket === 'undefined' || !bedSocket) return;
        // request server to return this session's watchlist (server reads session)
        bedSocket.emit('req_watchlist_get');
    }catch(e){ console.error(e); }
}

// toggle current selection in watchlist (add/remove)
async function toggleWatchlistForCurrent(){
    const info = getSelectedStockInfo();
    if(!info || !info.code){ alert('No stock selected to add/remove from watchlist'); return; }
    try{
        // ask server for this session's watchlist; server determines user from session
        bedSocket.emit('req_watchlist_get');
        bedSocket.once('res_watchlist_get', function(msg){
            try{
                const wl = msg || {};
                if(wl[info.code]){
                    // exists -> remove
                    bedSocket.emit('req_watchlist_remove', { code: info.code });
                } else {
                    // add (provide name if available)
                    bedSocket.emit('req_watchlist_add', { code: info.code, name: info.name || '' });
                }
            }catch(e){ console.error(e); }
        });
    }catch(e){ console.error(e); }
}

// handle selection from watchlist select
function handleWatchlistSelectChange(){
    try{
        const sel = document.getElementById('watchlistSelect');
        if(!sel) return;
        sel.addEventListener('change', function(){
            const code = this.value;
            if(!code) return;
            // Find the page that contains this code given current filters/sort and navigate there
            const date = currentDate || (document.querySelector('#stock_date .date') ? document.querySelector('#stock_date .date').id : null);
            if(!date){ alert('No date available to locate the selected watchlist item'); return; }
            const pageSize = currentPageSize || 10;
            const market = document.getElementById('marketFilter') ? document.getElementById('marketFilter').value : 'all';
            const name = document.getElementById('nameFilter') ? document.getElementById('nameFilter').value.trim() : '';
            const members = (currentIndustryMembers && Array.isArray(currentIndustryMembers) && currentIndustryMembers.length>0) ? currentIndustryMembers : null;
            const sortKey = currentSort ? currentSort.key : null;
            const sortDir = currentSort ? currentSort.dir : null;
            // ask server to locate the page for this code
            bedSocket.emit('req_locate_stock', { code: code, date: date, pageSize: pageSize, market: market, name: name, members: members, sortKey: sortKey, sortDir: sortDir });
            bedSocket.once('res_locate_stock', function(res){
                try{
                    if(res && res.found){
                        pendingSelectCode = String(code);
                        requestPageForDate(date, res.page, pageSize);
                    } else {
                        // fallback: load single member if not found
                        setUIBlocked(true);
                        bedSocket.emit('req_stock_data', { date: date, page: 1, pageSize: 1, members: [code] });
                        bedSocket.once('res_stock_data', function(msg){ try{ if(msg && !msg.error){ const stocks = msg.stocks || []; renderTable(stocks); renderChart(stocks); if(stocks[0]) selectStockByCode(stocks[0].code); } }finally{ setUIBlocked(false); } });
                    }
                }catch(e){ console.error('res_locate_stock handler error', e); }
            });
        });
    }catch(e){ console.error(e); }
}

// listen for watchlist updates from server
function attachWatchlistHandlers(){
    const tryAttach = function(){
        try{
            if(typeof bedSocket !== 'undefined' && bedSocket){
                bedSocket.on('res_watchlist_get', function(msg){ refreshWatchlistSelectFromObj(msg || {}); });

                return true;
            }
        }catch(e){}
        return false;
    };
    if(!tryAttach()){
        const poll = setInterval(function(){ if(tryAttach()){ clearInterval(poll); } }, 250);
        setTimeout(function(){ clearInterval(poll); }, 15000);
    }
}

// wire up watchlist UI on DOM ready
try{
    // watch toggle button
    const wbtn = document.getElementById('watchToggleBtn');
    if(wbtn) wbtn.addEventListener('click', function(e){ e.preventDefault(); toggleWatchlistForCurrent(); });
    // ensure hidden initially until a stock is selected
    try{ if(wbtn) wbtn.style.display = 'none'; }catch(e){}
    handleWatchlistSelectChange();
    attachWatchlistHandlers();
    // initial fetch
    // requestWatchlist();
}catch(e){/*ignore*/}

// update the watch toggle button based on selection and currentWatchlist
function updateWatchToggleState(){
    try{
        const btn = document.getElementById('watchToggleBtn');
        if(!btn) return;
        if(!selectedStockCode){ btn.style.display = 'none'; return; }
        // show button
        btn.style.display = '';
        const exists = currentWatchlist && (typeof currentWatchlist[String(selectedStockCode)] !== 'undefined');
        btn.textContent = exists ? '−' : '+';
    }catch(e){ console.error('updateWatchToggleState error', e); }
}

// Chart 240-day windowing functions
function getChartWindow(hist, startIdx){
    // slice 240 days from startIdx
    if(!hist || hist.length === 0) return { labels: [], volData: [], priceData: [] };
    
    const safeStartIdx = Math.max(0, Math.min(startIdx, hist.length - 1));
    const endIdx = Math.min(safeStartIdx + CHART_MAX_DAYS, hist.length);
    const sliced = hist.slice(safeStartIdx, endIdx);
    
    return {
        labels: sliced.map(h => h.date),
        volData: sliced.map(h => h.tradeVolume),
        priceData: sliced.map(h => (h.closePrice === null || h.closePrice === undefined) ? null : h.closePrice)
    };
}

function getMaxPrice(priceData){
    if(!Array.isArray(priceData) || priceData.length === 0) return 100;
    const validPrices = priceData.filter(p => p !== null && p !== undefined && !isNaN(p));
    if(validPrices.length === 0) return 100;
    const max = Math.max(...validPrices);
    return isNaN(max) ? 100 : max;
}

function updateChart(){
    // re-render chart with current window position
    if(!chartFullHistory || chartFullHistory.length === 0) return;
    
    const windowedData = getChartWindow(chartFullHistory, chartWindowStartIdx);
    if(!chart) return;
    
    chart.data.labels = windowedData.labels;
    chart.data.datasets[0].data = windowedData.volData;
    chart.data.datasets[1].data = windowedData.priceData;
    chart.update();
}

// Chart title popup: open Naver Finance page for the selected code in an iframe-sized popup
function createChartPopup(){
    if(document.getElementById('chartPopup')) return;
    const overlay = document.createElement('div');
    overlay.id = 'chartPopup';
    overlay.style.position = 'fixed';
    overlay.style.top = '50%';
    overlay.style.left = '50%';
    overlay.style.transform = 'translate(-50%,-50%)';
    overlay.style.width = '95%';
    overlay.style.height = '80%';
    overlay.style.background = '#ffffff';
    overlay.style.zIndex = '10000';
    overlay.style.boxShadow = '0 4px 20px rgba(0,0,0,0.4)';
    overlay.style.border = '1px solid #ddd';
    overlay.style.display = 'none';
    overlay.style.flexDirection = 'column';
    overlay.style.overflow = 'hidden';

    overlay.innerHTML = '<div id="chartPopupHeader" style="flex:0 0 40px;display:flex;align-items:center;justify-content:space-between;padding:6px 10px;background:#f7f7f7;border-bottom:1px solid #e6e6e6;font-size:14px;">\n        <div id="chartPopupTitle" style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;\"></div>\n        <div style="flex:0 0 auto;\"><button id="chartPopupClose" style="padding:4px 8px;border:1px solid #ccc;background:#fff;cursor:pointer;">닫기</button></div>\n    </div><iframe id="chartPopupFrame" style="width:100%;height:calc(100% - 40px);border:0;" sandbox=""></iframe>';

    document.body.appendChild(overlay);
    document.getElementById('chartPopupClose').addEventListener('click', closeChartPopup);
    // click outside header/frame (on overlay) closes popup
    overlay.addEventListener('click', function(e){ if(e.target === overlay) closeChartPopup(); });
    // ESC key closes
    document.addEventListener('keydown', function(e){ if(e.key === 'Escape') closeChartPopup(); });
}

function openChartPopupForCode(code, title){
    if(!code) return;
    createChartPopup();
    const overlay = document.getElementById('chartPopup');
    const frame = document.getElementById('chartPopupFrame');
    const ttl = document.getElementById('chartPopupTitle');
    if(ttl) ttl.textContent = title ? (title + ' (' + code + ')') : code;
    if(frame) frame.src = 'https://finance.naver.com/item/main.naver?code=' + encodeURIComponent(code);
    //if(frame) frame.src = 'https://stock.naver.com/domestic/stock/' + encodeURIComponent(code) + '/price';
    //if(frame) frame.src = 'https://www.tossinvest.com/stocks/A' + encodeURIComponent(code) + '/order';
    if(overlay) overlay.style.display = 'block';
}

function closeChartPopup(){
    const overlay = document.getElementById('chartPopup');
    if(!overlay) return;
    const frame = document.getElementById('chartPopupFrame');
    if(frame) try{ frame.src = 'about:blank'; }catch(e){}
    overlay.style.display = 'none';
}


