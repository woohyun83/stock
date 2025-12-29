/*
시간 관련
=========
모든 wave의 prev 샘플 하나가 1픽셀이 되도록 변경
보통의 art 나 pleth 등 웨이브는 샘플 1개가 1픽셀이 되면 화면상의 wave 길이 canvas_width - PAR_WIDTH (par box 너비) = 640px가 640샘플이 써져야하므로 (1px=1샘플) 6.4초가 display의 시간폭 (웨이브 트랙의 우측끝부터 좌측끝 시간차)이 된다.
co2 의 경우 샘플 1개가 1픽셀이 되면 보여지는 시간이 4배 길어짐
즉, display 상에 보여질 wave의 길이가 가변이 되어버리는데 따라서 이 시간 길이를 get_display_time_length 에서 받아와야한다.

속도 관련
=========
웨이브 샘플이 보관되는 prev 는 자주 복사가 일어나므로 속도를 위해 Float32Array를 사용한다.
Float32Array는 push, concat, splice 함수가 없다. 매번 재할당하고 복사해서 사용해야한다. 그러나 매우 빠르므로 걱정 안해도 됨

vrver 관련
===========
압축과 파싱은 속도에 거의 영향이 없기 때문에 모든 통신은 json을 통해 클라이언트와 서버쪽에서 전부 parsing 할 것 임
vr version 또한 POST를 통해 보내고 PHP 에서 twig을 통해 뿌려주는 방식이 아니라 json 으로 주고 받는 룸 데이터에 넘김
따라서 vr 업데이트 시 실시간으로 반영 됨
과거 데이터를 돌려 볼 때 해당 데이터 내에 vrver가 저장되어있음
*/
var wm_apiRoot = 'https://Hyunmnb.net/web-monitoring';
var wm_cols = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];	// 칼럼 갯수 선택 옵션
var wm_layoutColumns = 0;						// 현재 선택된 칼럼 갯수
var wm_single_bedid = null; 					// 한 방을 크게 볼 때 그 방의 룸코드
var wm_rooms = {}; 								// 모든 방 데이터
var wm_localClockDiffToServer = 0;
var wm_domRooms = null;
var selected_groups = new Set();				// 현재 선택된 그룹
// var bedSocket;
// var intervalID = null;
var txtTime = "";
var fastForward = 0;

var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

var queryString = location.search.replace(/^.*?\=/, '');
if (queryString.indexOf("guide") == 0) {
	document.querySelector('footer').style.display = 'none';
}

//var vver_latest = null; // 최신 vr 버전
const STANDARD_SAMPLE_RATE = 100;
const MAX_NETWORK_LATENCY = 2;

var img_top_patient = document.getElementById('img-top-patient');

var wm_groups = [
	{'fgColor': '#00FF00','wav': 'ECG_WAV', 'paramLayout': 'TWO', 'param': ['ECG_HR', 'ECG_ST'], 'name': 'ECG'},
	{'fgColor': '#FF0000','wav': 'IABP_WAV', 'paramLayout': 'BP','param': ['IABP_SBP','IABP_DBP','IABP_MBP'], 'name': 'ART'},
	{'fgColor': '#82CEFC','wav': 'PLETH_WAV', 'paramLayout': 'TWO', 'param': ['PLETH_SPO2', 'PLETH_HR'],'name': 'PLETH' },
	{'fgColor': '#FAA804','wav': 'CVP_WAV', 'paramLayout': 'ONE', 'param': ['CVP_CVP'], 'name': 'CVP'},
	{'fgColor': '#DAA2DC','wav': 'EEG_WAV','paramLayout': 'TWO','param': ['EEG_BIS','EEG_SEF'], 'name': 'EEG'},
	{'fgColor': '#FAA804','paramLayout': 'TWO','param': ['AGENT_CONC','AGENT_NAME'],'name': 'AGENT'},
	{'fgColor': '#FAA804','paramLayout': 'TWO','param': ['AGENT1_CONC','AGENT1_NAME'],'name': 'AGENT1'},
	{'fgColor': '#FAA804','paramLayout': 'TWO','param': ['AGENT2_CONC','AGENT2_NAME'],'name': 'AGENT2'},
	{'fgColor': '#FAA804','paramLayout': 'TWO','param': ['AGENT3_CONC','AGENT3_NAME'],'name': 'AGENT3'},
	{'fgColor': '#FAA804','paramLayout': 'TWO','param': ['AGENT4_CONC','AGENT4_NAME'],'name': 'AGENT4'},
	{'fgColor': '#FAA804','paramLayout': 'TWO','param': ['AGENT5_CONC','AGENT5_NAME'],'name': 'AGENT5'},
	{'fgColor': '#9ACE34','paramLayout': 'TWO','param': ['DRUG_CE','DRUG_NAME'],'name': 'DRUG'},
	{'fgColor': '#9ACE34','paramLayout': 'TWO','param': ['DRUG1_CE','DRUG1_NAME'],'name': 'DRUG1'},
	{'fgColor': '#9ACE34','paramLayout': 'TWO','param': ['DRUG2_CE','DRUG2_NAME'],'name': 'DRUG2'},
	{'fgColor': '#9ACE34','paramLayout': 'TWO','param': ['DRUG3_CE','DRUG3_NAME'],'name': 'DRUG3'},
	{'fgColor': '#9ACE34','paramLayout': 'TWO','param': ['DRUG4_CE','DRUG4_NAME'],'name': 'DRUG4'},
	{'fgColor': '#9ACE34','paramLayout': 'TWO','param': ['DRUG5_CE','DRUG5_NAME'],'name': 'DRUG5'},
	{'fgColor': '#FFFF00','wav': 'CO2_WAV','paramLayout': 'TWO','param': ['CO2_CONC','CO2_RR'],'name': 'CO2'},
	{'fgColor': '#FFFFFF','paramLayout': 'VNT','name':'VNT','param': ['TV','RESP_RR','PIP','PEEP'],},
	{'fgColor': '#F08080','paramLayout': 'VNT','name':'NMT', 'param': ['TOF_RATIO','TOF_CNT','PTC_CNT'],},
	{'fgColor': '#FFFFFF','paramLayout': 'BP','param': ['NIBP_SBP','NIBP_DBP','NIBP_MBP'],'name': 'NIBP'},
	{'fgColor': '#DAA2DC','wav':'EEGL_WAV','paramLayout': 'TWO','param': ['PSI','EEG_SEFL', 'EEG_SEFR'],'name': 'MASIMO'},
	{'fgColor': '#FF0000','paramLayout': 'TWO','param': ['SPHB','PVI'],},
	{'fgColor': '#FFC0CB','paramLayout': 'TWO','param': ['CO','SVV'],'name': 'CARTIC'},
	{'fgColor': '#FFFFFF','paramLayout': 'LR','param': ['STO2_L','STO2_R'],'name': 'STO2'},
	{'fgColor': '#828284','paramLayout': 'TWO','param': ['FLUID_RATE','FLUID_TOTAL'],'name': 'FLUID'},
	{'fgColor': '#D2B48C','paramLayout': 'ONE','param': ['BT']},
	{'fgColor': '#FF0000','wav': 'PAP_WAV','paramLayout': 'BP','param': ['PAP_SBP','PAP_DBP', 'PAP_MBP'],'name': 'PAP'},
	{'fgColor': '#FF0000','wav': 'FEM_WAV','paramLayout': 'BP','param': ['FEM_SBP', 'FEM_DBP', 'FEM_MBP'],'name': 'FEM'},
	{'fgColor': '#00FF00','wav': 'SKNA_WAV','paramLayout': 'ONE',	'param': ['ASKNA'],	'name': 'SKNA'	},
	{'fgColor': '#FFFFFF','wav': 'ICP_WAV','paramLayout': 'TWO','param': ['ICP','CPP']},
	{'fgColor': '#FF7F51','paramLayout': 'TWO','param': ['ANIM','ANII']},
	{'fgColor': '#99d9ea','paramLayout': 'TWO','param': ['FILT1_1','FILT1_2']},
	{'fgColor': '#C8BFE7','paramLayout': 'TWO','param': ['FILT2_1','FILT2_2']},
	{'fgColor': '#EFE4B0','paramLayout': 'TWO','param': ['FILT3_1','FILT3_2']},
	{'fgColor': '#FFAEC9','paramLayout': 'TWO','param': ['FILT4_1','FILT4_2']},
];

var montype_groupids = {};

// Parameter Box Size
const PAR_WIDTH = 160;
const PAR_HEIGHT = 80;

var wm_paramLayouts = {
	'ONE': [{name: {baseline: 'top',x: 5, y: 5,}, value: {fontsize: 40, align: 'right', x: PAR_WIDTH - 5, y: PAR_HEIGHT - 10,}}],
	'TWO': [
		{name: {baseline: 'top',x: 5, y: 5,}, value: {fontsize: 40, align: 'right', x: PAR_WIDTH - 5, y: 42}},
		{name: {baseline: 'bottom', x: 5, y: PAR_HEIGHT - 4,}, value: {fontsize: 24, align: 'right', x: PAR_WIDTH - 5, y: PAR_HEIGHT - 8,}}
	],
	'LR': [
		{name: {baseline: 'top', x: 5, y: 5}, value: {fontsize: 40, align: 'left', x: 5, y: PAR_HEIGHT - 10,}},
		{name: {align: 'right', baseline: 'top', x: PAR_WIDTH - 3, y: 4,},value: {fontsize: 40, align: 'right', x: PAR_WIDTH - 5, y: PAR_HEIGHT - 10,}}
	],
	'BP': [
		{name: {baseline: 'top', x: 5, y: 5}, value: {fontsize: 38, align: 'right', x: PAR_WIDTH - 5, y: 37,}},
		{value: {fontsize: 38, align: 'right', x: PAR_WIDTH - 5, y: PAR_HEIGHT - 8,}}
	],
	'VNT': [
		{name: {baseline: 'top',x: 5, y: 5,}, value: {fontsize: 38, align: 'right', x: PAR_WIDTH - 45, y: 37,}},// top-left
		{value: {fontsize: 30, align: 'right', x: PAR_WIDTH - 5, y: 37,}}, // top-right
		{value: {fontsize: 24, align: 'right', x: PAR_WIDTH - 5, y: PAR_HEIGHT - 8,}}// bot-left
	]
};

var wm_trend = {
	vital:{
		// 동맥압: 붉은색
		"ART_SBP": {name: "ART", color: "#FF0000", type:"bar"},
		"ART_DBP": {color: "#FF0000", type:"bar"},
		// 비침습혈압: 흰색 투명도 50%
		"NIBP_SBP": {name: "NIBP", color: "rgba(255, 255, 255, .5)", type:"bar"},
		"NIBP_DBP": {color: "rgba(255, 255, 255, .5)", type:"bar"},
		"HR": {name: "HR", color: "#00FF00", type:"line"},
		"PLETH_SPO2": {name: "SpO2", color: "#82CEFC", type:"line"},
		"BT": {name: "Temp", color: "#D2B48C", type:"line"},
		"BIS": {name: "iEEG", color: "#DAA2DC", type:"line"},
		"PSI": {color: "#DAA2DC", type:"line"},
	},
	ane:{
		"DESF": {name: "DES", color: "#2296E6", type:"bar"},
		"SEVO": {name: "SEVO", color: "#FFA500", type:"bar"},
		"PROP": {name: "PPF", color: "#FFFFFF", type:"bar"},
		"REMI": {name: "RFTN", color: "rgba(154, 206, 52, .5)", type:"bar"},
	},
	filt:{
		"filters.abp_hpi": {name: "HPI", color: "#00FFFF", type:"bar"},
		"ART_MBP": {name: "MAP", color: "#FF0000", type:"line"},
	}
}

var isMobile = {
	Android: function() {
		return navigator.userAgent.match(/Android/i);
	},
	BlackBerry: function() {
		return navigator.userAgent.match(/BlackBerry/i);
	},
	iOS: function() {
		return navigator.userAgent.match(/iPhone|iPad|iPod/i);
	},
	Opera: function() {
		return navigator.userAgent.match(/Opera Mini/i);
	},
	Windows: function() {
		return navigator.userAgent.match(/IEMobile/i) || navigator.userAgent.match(/WPDesktop/i);
	},
	any: function() {
		return (isMobile.Android() || isMobile.BlackBerry() || isMobile.iOS() || isMobile.Opera() || isMobile.Windows());
	}
}
var wm_isMobile = isMobile.any();

function isIE() {
	var agent = navigator.userAgent.toLowerCase();
	return ((navigator.appName == 'Netscape' && agent.indexOf('trident') != -1) ||  (agent.indexOf("msie") != -1));
}

var VIEW_HEIGHT = Math.max(document.documentElement.clientHeight, window.innerHeight);
$(window).resize( function() {
	VIEW_HEIGHT = Math.max(document.documentElement.clientHeight, window.innerHeight);
} );

function show_log(bedid){
	var room = wm_rooms[bedid];
	if(room.log_window === undefined || !room.log_window){
		room.log_window = window.open("", room.bedname + " Logs");
		room.log_window.document.title = room.bedname + " Logs";
		room.log_window.addEventListener("keydown", function(e){
			if(e.keyCode == 32){
				e.preventDefault();
				room.log_window = null;
			}
		});
		room.log_window.addEventListener("beforeunload", function(){
			room.log_window = null;
		});
	}
}

// element가 브라우저의 현재 스크롤 위치를 벗어나있으면 false를 리턴
function check_visible(elm) {
	if(!$(elm).parent().is(":visible")) return false;
	var rect = elm.getBoundingClientRect();
	return !(rect.bottom < 0 || rect.top >= VIEW_HEIGHT);
}

// 서버 현재시각
function wm_serverNow() {
	return Date.now() / 1000 - wm_localClockDiffToServer;
}

// 화면에 현재 시간 표시
function currentTime() {
	var clock = document.getElementById('rt-clock');
	var today = new Date();
	var y = today.getFullYear();
	var d = today.getDate();
	var m = today.getMonth();
	var hh = today.getHours();
	var mm = today.getMinutes();
	var ss = today.getSeconds();
	mm = checkTime(mm);
	ss = checkTime(ss);
	if(clock){
		let fontsize = Math.sqrt(window.innerWidth) / 2;
		clock.innerHTML = "<font style='font-size:" + parseInt(fontsize) +"px'>" + d + " " + months[m] + " " + y + "</font> <font style='font-size:"+parseInt(fontsize*1.3)+"px'>" + hh + ":" + mm + ":" + ss + "</font>";
	}
}

// 한 자리 숫자 앞에 0을 붙여줌 (시간 표시할 때 쓰임)
function checkTime(i) {
	if (i < 10) {i = "0" + i};  // add zero in front of numbers < 10
	return i;
}


function toggleFullScreen() {
	var doc = document;
	var docEl = doc.documentElement;

	var requestFullScreen = docEl.requestFullscreen || docEl.mozRequestFullScreen || docEl.webkitRequestFullScreen || docEl.msRequestFullscreen;
	var cancelFullScreen = doc.exitFullscreen || doc.mozCancelFullScreen || doc.webkitExitFullscreen || doc.msExitFullscreen;

  	if(!doc.fullscreenElement && !doc.mozFullScreenElement && !doc.webkitFullscreenElement && !doc.msFullscreenElement) {
    	requestFullScreen.call(docEl);
  	} else {
    	cancelFullScreen.call(doc);
  	}
}

 // 우상단의 뷰포트 확장/축소 버튼 눌렀을 때의 동작
function wm_expandWindow() {
	var domExpandButton = document.getElementById('wm-expand');
	var domIcon = domExpandButton.getElementsByTagName('i')[0];
	var domColumn = document.getElementsByClassName('sel-col')[0];
	var domMonitor = document.getElementById('sel-user');
	var domContent = document.getElementById('content');
	var domNavBar = document.getElementsByClassName('navbar')[0];
	var domHeader = document.getElementsByTagName('header')[0];
	var domCallout = domContent.getElementsByClassName('bd-callout')[0];
	var roomStatus = document.getElementById('room-status');

	if (domIcon.classList.contains('fa-expand-alt')) { // 화면 확장
		if (document.fullscreenEnabled) { // full screen api supported
			toggleFullScreen();
		}
		$("#wm-rooms").css("max-height", "calc(100vh - 60px)");
		$("#wm-rooms").css("overflow-y", "scroll");
		$("#wm-rooms").css("overflow-x", "hidden");
		$("#content").css("padding-top", "15px");
		$(".sidetab").css({"background-color":"#262626", "color":"white"});
		$(".sidetab .closebtn").css("color","white");
		$(".sidetab th").css({"background-color":"#262626", "color":"white"});
		$(".bed").addClass("dark");
		document.body.style.backgroundColor = "black";
		roomStatus.style.color = "white";
		document.getElementById('rt-clock').style.color = "white";
		$("#group-filter-btn").removeClass('btn-light').addClass('btn-gray');
		$("#toolbar").css({"background-color":"black", "top": 0});
		domIcon.classList.remove('fa-expand-alt');
		domIcon.classList.add('fa-compress-alt');
		domIcon.parentNode.classList.remove('btn-light');
		domIcon.parentNode.classList.add('btn-gray');
		$("#wm-refresh").toggleClass('btn-light btn-gray');
		$("#add-vr-btn").toggleClass('btn-light btn-gray');
		$("#edit-group-btn").hide();
		$("#btn-sel-all").hide();
		$("#btn-user-list").hide();
		$("#show-inactive-btn").hide();
		domColumn.classList.add('sel-dark');
		if(domMonitor !== null) domMonitor.classList.add('sel-dark');
		domNavBar.classList.add('d-none');
		domHeader.classList.add('d-none');
		if (domCallout) {
			domCallout.classList.add('d-none');
		}
		wm_changeLayoutColumns(wm_layoutColumns);
		Cookies.set('WebMonitoring_expanded', '1');
	} else { // 원래대로
		if (document.fullscreenEnabled) { // full screen api supported
			document.exitFullscreen();
		}
		$("#wm-rooms").css("max-height", "");
		$("#wm-rooms").css("overflow-y", "");
		$("#wm-rooms").css("overflow-x", "");
		$("#content").css("padding-top", "100px");
		$(".sidetab").css({"background-color":"", "color":""});
		$(".sidetab .closebtn").css("color","");
		$(".sidetab th").css({"background-color":"", "color":""});
		$(".bed").removeClass("dark");
		document.body.style.backgroundColor = "white";
		roomStatus.style.color = "black";
		document.getElementById('rt-clock').style.color = "black";
		$("#group-filter-btn").removeClass('btn-dark').addClass('btn-light');
		$("#toolbar").css({"background-color":"white", "top": "92px"});
		domIcon.classList.remove('fa-compress-alt');
		domIcon.classList.add('fa-expand-alt');
		domIcon.parentNode.classList.remove('btn-gray');
		domIcon.parentNode.classList.add('btn-light');
		$("#wm-refresh").toggleClass('btn-gray btn-light');
		$("#add-vr-btn").toggleClass('btn-gray btn-light');
		$("#edit-group-btn").show();
		$("#btn-sel-all").show();
		$("#btn-user-list").show();
		$("#show-inactive-btn").show();
		domColumn.classList.remove('sel-dark');
		if(domMonitor !== null) domMonitor.classList.remove('sel-dark');
		domNavBar.classList.remove('d-none');
		domHeader.classList.remove('d-none');
		if (domCallout) {
			domCallout.classList.remove('d-none');
		}
		Cookies.remove('WebMonitoring_expanded');
	}
	wm_onResizeWindow();
}

function wm_resizeRoomHeight(){
	var rooms = $(".wm-room");
	var start = 0;
	var column_cnt = 0;
	var max_height = 240;
	rooms.each(function(index){
		// 같은 행에 보이는 방들 중 max_height을 구한다
		if($(this).css("display") != "none"){
			column_cnt++;
			room_height = $(this).find("canvas").height();
			if(room_height > max_height) max_height = room_height;
		}

		// 같은 행에 있는 방들의 높이를 max_height으로 맞춰준다
		if((column_cnt > 0 && column_cnt % wm_layoutColumns == 0) || index == rooms.length - 1){
			for(var j = start; j <= index; j++){
				$(rooms[j]).css("min-height", max_height + 22);
			}
			start = index + 1;
			column_cnt = 0;
			max_height = 240;
		}
	});
}

function wm_resizeRoomWidth(){
	wm_updateLayoutButtons(wm_cols.indexOf(parseInt(wm_layoutColumns)));

	if (!wm_domRooms) {
		wm_domRooms = document.getElementsByClassName('wm-rooms')[0];
	}

	for (var bedid in wm_rooms) {
		var room = wm_rooms[bedid];
		if(bedid == wm_single_bedid){ // 한방만 볼 때
			room.domRoot.style.width = document.documentElement.clientWidth + 'px';//((document.documentElement.clientHeight > document.documentElement.clientWidth? document.documentElement.clientWidth:document.documentElement.clientHeight) + 100) + 'px';
			$(room.domCanvas).css("width", window.innerWidth - 20);
			$(room.domCanvas).css("height", window.innerHeight - 20);

			// canvas의 크기를 변경
			room.domCanvas.width = window.innerWidth - 20;
			room.domCanvas.height = window.innerHeight - 20;
			room.domControl.style.width = Math.floor((window.innerWidth - 20) - 9) + 'px';
		} else{ // 여러방 볼 때
			room.domRoot.style.width = parseInt(wm_domRooms.clientWidth / wm_layoutColumns) + 'px';
			room.domControl.style.display = 'none';
			room.domCanvas.style.width = '100%'; // 여기에 마법이 있다. 이렇게 하면 height 는 알아서 바뀐다.
			room.domCanvas.style.height = '';
		}
		//if (room.bedname == "R5") console.log('wm_changelayout', room.domCanvas.style.width, room.domCanvas.style.height, room.domCanvas.width, room.domCanvas.height, room.domCanvas.clientWidth, room.domCanvas.clientHeight);
	}
}

// 12345 버튼을 눌렀을 때의 동작
function wm_changeLayoutColumns(n, remember) {
	wm_layoutColumns = n;

	wm_resizeRoomWidth();
	wm_resizeRoomHeight();

	if (remember) {
		Cookies.set('WebMonitoring_layoutColumns', n.toString());
	}
}

function show_edit(btn){
	$("#" + $.escapeSelector(btn)).show();
}

function hide_edit(btn){
	$("#" + $.escapeSelector(btn)).hide();
}

function wm_selAllGroup(){
	var sel_all_group = $("#sel-all-group").prop('checked');
	if(sel_all_group){
		selected_groups = new Set();
		$("#group-filter-side-tab").find("input[type='checkbox']").each(function(){
			if($(this).prop("id") == "sel-all-group") return;
			$(this).prop("checked", sel_all_group);
			selected_groups.add(this.id);
		});
	} else {
		$("#group-filter-side-tab").find("input[type='checkbox']").each(function(){
			$(this).prop("checked", sel_all_group);
			selected_groups.delete(this.id);
		});
	}
	wm_changeCurrentFilter();
}

function wm_selGroup(group){
	if($(group).prop("checked")) {
		selected_groups.add(group.id);
	} else{
		selected_groups.delete(group.id);
		$("#sel-all-group").prop('checked', false);
	}
	wm_changeCurrentFilter();
}

 // 수술방 필터 버튼 (ALL, A, B, C, ...) 을 눌렀을 때의 동작
function wm_changeCurrentFilter() {
	if(selected_groups.size <= 0){
		for (var bedid in wm_rooms) {
			var room = wm_rooms[bedid];
			room.domRoot.style.display = 'inline-block';
		}
		$("#edit-group-btn").addClass("disabled");
	} else {
		for (var bedid in wm_rooms) {
			var room = wm_rooms[bedid];
			if (selected_groups.has(room.groupname)) room.domRoot.style.display = 'inline-block';
			else room.domRoot.style.display = 'none';
		}
	}

	wm_changeLayoutColumns(wm_layoutColumns);
	Cookies.set('WebMonitoring_currentFilter', [...selected_groups].join());

	update_room_visibility(); // 그룹 조건이 변경되었으므로 방 보여짐 여부를 업데이트
}

 // 브라우저 창크기 바뀔 때마다 실행됨
function wm_onResizeWindow() {
	wm_changeLayoutColumns(wm_layoutColumns);
}

 // 12345 버튼 갱신
function wm_updateLayoutButtons(i) {
	var domLayout = document.getElementsByClassName('wm-layout')[0];
	var domSelect = domLayout.getElementsByClassName('sel-col')[0];
	domSelect.selectedIndex = i;
}

 // 12345 버튼 초기화
function wm_initLayoutButtons() {
	var domLayout = document.getElementsByClassName('wm-layout')[0];
	var domSelect = domLayout.getElementsByClassName('sel-col')[0];
	domSelect.addEventListener('change', function(){
		wm_changeLayoutColumns(domSelect.options[domSelect.selectedIndex].value, true, true);
	});
}

 // 수술방 필터 버튼 (ALL, A, B, C, ...) 갱신
function wm_updateFilterButtons(i) {
	var domLayout = document.getElementsByClassName('wm-filter')[0];
	var domSelect = domLayout.getElementsByClassName('sel-group')[0];
	domSelect.selectedIndex = i;
}

 // 수술방 필터 버튼 (ALL, A, B, C, ...) 초기화
function wm_initFilterButtons() {
	var domLayout = document.getElementsByClassName('wm-filter')[0];
	var domSelect = domLayout.getElementsByClassName('sel-group')[0];
	domSelect.addEventListener('change', function(){
		wm_changeCurrentFilter(domSelect.options[domSelect.selectedIndex].value, true);
	});
}

 // 방 화면을 더블 클릭하거나 해당 방 화면 우상단 버튼 클릭 시 동작
function wm_onClickRoom(bedid) {
	let room = wm_rooms[bedid];
	var bed = $("#" + bedid);
	if (wm_single_bedid === bedid) { // 확대 보기에서 여럿보기 전환
		wm_single_bedid = null;
		$(bed.domPlaySpeed).val(1).change();
		$(bed).attr("title", $(bed).attr("tmp_title"));
		$(bed).removeAttr("tmp_title");

		$('#single-mode').modal('hide').contents().unwrap();
		// 아이폰 Display 조정 필요: Body 전체 PADDING
		// 확대 시, 전체화면 PADDING을 없애므로 원상복귀시켜준다.
		if(isMobile.iOS()){
			$("#web-monitoring #content .container-fluid").css('padding-right','15px');
			$("#web-monitoring #content .container-fluid").css('padding-left','15px');
		}
		if(room.isNavigating) room.onClickNavigateLast();
		$(room.domMenu).removeClass("d-none");
		room.domRoot.style.width = ($(wm_domRooms).innerWidth() / wm_layoutColumns) + 'px';
		room.domRoot.style.height = '';
		room.domCanvas.style.width = '100%';
		room.domCanvas.style.height = '';
		$("body").css("cursor", "");
		$("#exit-" + bedid).removeClass("d-inline-block").addClass("d-none");
		$("#del-bed-" + bedid).removeClass("d-none");
		wm_changeLayoutColumns(wm_layoutColumns);
	} else { // 여럿 보기에서 확대 보기 전환
		wm_single_bedid = bedid;

		$(bed).attr("tmp_title", $(bed).attr("title"));
		$(bed).attr("title","");
		room.domRoot.style.width = window.innerWidth + 'px';//((document.documentElement.clientHeight > document.documentElement.clientWidth? document.documentElement.clientWidth:document.documentElement.clientHeight) + 100) + 'px';
		room.domRoot.style.height = window.innerHeight + 'px';
		$(room.domMenu).addClass("d-none");
		room.domControl.style.display = 'block';
		room.domControl.style.width = Math.floor((window.innerWidth - 20) - 9) + 'px';
		$('#'+bedid).wrap("<div id='single-mode' class='wm-expanded modal fade' role='dialog' data-backdrop='false'></div>");

		room.domCanvas.width = window.innerWidth - 20;
		room.domCanvas.height = window.innerHeight - 20;
		room.domCanvas.style.width = (window.innerWidth - 20) + 'px';
		room.domCanvas.style.height = (window.innerHeight - 20) + 'px';
		$("#exit-" + bedid).removeClass("d-none").addClass("d-inline-block");
		$("#del-bed-" + bedid).addClass("d-none");
		// 아이폰 Display 조정 필요: Z-INDEX와 Body 전체 PADDING
		if(isMobile.iOS()){
			$("#single-mode").css("z-index", 1050);
			$("#web-monitoring #content .container-fluid").css('padding','0');
		}
		$("#single-mode").modal("show");
	}
}

// 방 모니터 mouseover
function wm_showMenu(bedid){
	if(wm_single_bedid || !wm_isMember) return;
	var room = wm_rooms[bedid];
	if(room.domViewerMenu != undefined){
		if($(room.domViewerMenu).hasClass("d-none")){
			for(bedid in wm_rooms){
				if(wm_rooms[bedid].domViewerMenu != undefined) $(wm_rooms[bedid].domViewerMenu).addClass("d-none");
			}
			$(room.domViewerMenu).removeClass("d-none");
			$(room.domViewerMenu).addClass("d-inline-block");
		}
	}
}

// 방 모니터 mouseout
function wm_hideMenu(bedid){
	if(wm_single_bedid || !wm_isMember) return;
	var room = wm_rooms[bedid];
	if(room.domViewerMenu != undefined){
		if($(room.domViewerMenu).hasClass("d-inline-block")){
			$(room.domViewerMenu).removeClass("d-inline-block");
			$(room.domViewerMenu).addClass("d-none");
		}
	}
}

function wm_formatValue(value, type) {
	if (type === 'str') {
		if (value.length > 4) {
			value = value.slice(0, 4);
		}
		return value;
	}
	if (typeof value === 'str') {
		value = parseFloat(value);
	}
	if (Math.abs(value) >= 100) {
		return value.toFixed(0);
	} else if (value - Math.floor(value) < 0.05) {
		return value.toFixed(0);
	} else {
		return value.toFixed(1);
	}
}

function formatDate(time, milli) {
	if(milli){
		return time.getDate() + " " + months[time.getMonth()] + " " + time.getHours() + ":" + checkTime(time.getMinutes()) + ":" + checkTime(time.getSeconds()) + "." + time.getMilliseconds();
	}
	return time.getDate() + " " + months[time.getMonth()] + " " + time.getHours() + ":" + checkTime(time.getMinutes()) + ":" + checkTime(time.getSeconds());
}

function setPlaySpeed(val){
	val = parseInt(val);
	if(val == 1) fastForward = 0;
	else{
		fastForward = (val - 1) / 60.0;
	}
}

// 룸 정보 저장 클래스 선언
function wm_room(bedid) {
	// 현재 플레이어의 재생 대상 시각 (서버시간 기준)
	this.dtplayer = wm_serverNow();
	this.isVisible = false;

	// VR의 서버 대비 시차
	// vr 시간이 큰 값이면 (늦으면) 양수
	// vr 에서 기록한 시각에 이 값을 빼면 모든 시간이 서버 시간으로 바뀐다
	this.VRClockDiffToServer = null;

	// (시간 내비게이션 상태일 때) 실시간 모드에 비해 얼마나 이전 시각을 재생하는지. 주로 음수.
	// 이 값이 고정된 상태에서 play 가 되어야 하기 때문에 필요하다.
	this.navigationTimeDiffToRealtime = 0;

	// lastData는 모든 마지막 데이터를 포함
	// 트랙 데이터들은 lastData에 머지되며, list의 앞쪽 데이터들에게서는 제거한 상태로 계속 유지업뎃한다.
	this.lastData = null;

	// 해당 montype의 첫 트랙을 저장
	this.montype_trks = {};
	this.groupid_trks = {};

	// 내가 가지고 있는 마지막 데이터의 도착 시각
	// 이전에는 그냥 dt 였으나 의미가 모호하여 변경함
	this.dtlast = 0;

	this.isNavigating = false;
	this.isSliding = false;
	this.isPaused = false;
	this.bedid = bedid;
	this.bedname = '';

	// 가장 최신 방 높이 (캔바스 모든 트랙 높이의 합)
	this.room_height = 0;
	this.filters = [];

	// initialization codes below
	this.domRoot = document.getElementById(this.bedid);
	if($(this.domRoot).find(".context-menu").length > 0){
		this.domMenu = $(this.domRoot).find(".context-menu")[0];
		this.domViewerMenu = $("#" + this.bedid + " .wm-info")[0];
	} else this.domViewerMenu = $("#" + this.bedid + " .wm-viewer-menu")[0];
	this.domExpand = this.domRoot.getElementsByClassName('fa-window-maximize')[0];
	this.domControl = this.domRoot.getElementsByClassName('wm-control')[0];
	this.domCanvas = this.domRoot.getElementsByTagName('canvas')[0];
	$(this.domRoot)
		.contextmenu(function(){
			event.preventDefault();
			$(".context-menu").removeClass("show").hide();
			var menu = $(this).find(".context-menu");
			if(menu.length > 0){
				var bed_pos = $(this).offset();
				$(menu).css({
					display: "block",
					top: event.y + $(window).scrollTop() - bed_pos.top,
					left: event.x - bed_pos.left
				}).addClass("show");
			}
		})
		.hover(wm_showMenu.bind(null, this.bedid), wm_hideMenu.bind(null, this.bedid))
		.single_double_click(function(e){},function(e){wm_onClickRoom(this.id)});
	this.domBtnPause = this.domRoot.getElementsByClassName('wm-pause')[0];
	this.domBtnPause.onclick = this.onClickPause.bind(this);
	this.domBtnResume = this.domRoot.getElementsByClassName('wm-resume')[0];
	this.domBtnResume.onclick = this.onClickResume.bind(this);
	this.domPlaySpeed = this.domRoot.getElementsByClassName('play-speed')[0];
	this.domBtnPrev = this.domRoot.getElementsByClassName('wm-prev')[0];
	this.domBtnPrev.onclick = this.onClickNavigatePrev.bind(this);
	this.domBtnNext = this.domRoot.getElementsByClassName('wm-next')[0];
	this.domBtnNext.onclick = this.onClickNavigateNext.bind(this);
	this.domBtnFirst = this.domRoot.getElementsByClassName('wm-first')[0];
	this.domBtnFirst.disabled = false;
	this.domBtnFirst.onclick = this.onClickNavigateFirst.bind(this);
	this.domBtnLast = this.domRoot.getElementsByClassName('wm-last')[0];
	this.domBtnLast.onclick = this.onClickNavigateLast.bind(this);
	this.domTxtTime = this.domRoot.getElementsByClassName('wm-time')[0];
	this.domSlider = this.domRoot.getElementsByClassName('wm-slider')[0].getElementsByTagName('input')[0];
	this.domSlider.style.background = '#d3d3d3';

	var that = this;
	this.domSlider.onchange = function() {
		if(that.domSlider.value > 0) {
			that.onClickNavigateLast();
			return;
		}
		that.sliderLastChangedAt = Date.now();
		that.navigate(wm_serverNow() + parseFloat(that.domSlider.value));
		that.isSliding = false;
	};

	this.domSlider.oninput = function() {
		if(that.domSlider.value > 0) {
			that.onClickNavigateLast();
			return;
		}
		var time = new Date(new Date().getTime() + parseFloat(that.domSlider.value) * 1000);
		var msg = wm_isMobile? "<br>":"";
		msg += formatDate(time).substr(-8);
		that.domTxtTime.innerHTML = msg;
		that.domTxtTime.style.color = 'white';
		that.sliderLastChangedAt = Date.now();
		that.isSliding = true;
	};

	// back buffer
	this.ctx = document.createElement('canvas').getContext('2d');
}

wm_room.prototype.onClickPause = function() {
	this.isNavigating = true;
	this.isPaused = true;
	this.domBtnPause.style.display = 'none';
	this.domBtnResume.style.display = 'inline-block';
	this.domBtnLast.disabled = false;
	this.domBtnFirst.disabled = false;
};

wm_room.prototype.onClickResume = function() {
	this.isNavigating = true;
	this.isPaused = false;
	this.navigationTimeDiffToRealtime = this.dtplayer - wm_serverNow();
	this.domBtnPause.style.display = 'inline-block';
	this.domBtnResume.style.display = 'none';
	this.domBtnLast.disabled = false;
	this.domBtnFirst.disabled = false;
};

// 모든 prev 데이터는 자신의 srate 로 되어있다.
// display의 시간은 waveform 폭을 standard_sample_Rate (100hz)로 나눈 값이다
wm_room.prototype.get_display_time_length = function() {
	return (this.domCanvas.width - PAR_WIDTH) / STANDARD_SAMPLE_RATE;
}

wm_room.prototype.onClickNavigatePrev = function() {
	this.navigate(this.dtplayer - this.get_display_time_length());
};

wm_room.prototype.onClickNavigateNext = function() {
	this.navigate(Math.min(this.dtplayer + this.get_display_time_length(), wm_serverNow()));
};

// case의 처음으로 이동
wm_room.prototype.onClickNavigateFirst = function(){
	this.domBtnFirst.disabled = true;
	this.navigate(Math.max(Math.round(Date.now() / 1000) - 7200, this.dtcase - this.VRClockDiffToServer));
}

// 마지막으로 이동
wm_room.prototype.onClickNavigateLast = function() {
	this.domSlider.value = 0;
	this.onClickResume();
	this.domBtnLast.disabled = true;
	this.isNavigating = false;
	this.navigationTimeDiffToRealtime = 0;
	//this.dtplayer = wm_serverNow() - this.display_latency;
	this.populateRoomData(0);
	$(this.domPlaySpeed).val(1).change();
};

// 특정 위치로 점프
wm_room.prototype.navigate = function(targetDt) {
	var diff = targetDt - wm_serverNow();
	this.domSlider.value = diff;
	var currtime = new Date(targetDt * 1000);
	var msg = wm_isMobile? "<br>":"";
	msg += formatDate(currtime);
	this.domTxtTime.innerHTML = msg;
	this.domTxtTime.style.color = 'white';
	this.sliderLastChangedAt = Date.now();

	this.onClickPause();
	this.dtplayer = targetDt;
	this.navigationTimeDiffToRealtime = this.dtplayer - wm_serverNow();

	if (this.lastData &&
		this.dtplayer - this.get_display_time_length() - MAX_NETWORK_LATENCY > this.dtStart && this.dtplayer + this.get_display_time_length() + MAX_NETWORK_LATENCY < this.dtEnd) {
		// 목표 재생위치 전후로 데이터 여유가 있으면 그냥 그리고
	} else {
		// 목표 재생위치 전후로 데이터 여유가 없으면 서버 api콜 하면서 데이터를 다시 채움
		this.populateRoomData(targetDt);
	}
};

wm_room.prototype.pushFilterData = function(filtData){
	if(!filtData || filtData.length <= 0 || !this.lastData) return;

	for (let i in filtData) { // 이번에 받은 트랙들에 대하여
		var data = filtData[i];
		let newTrack = data;
		let oldtrack = null; // 이전 데이터에 해당 트랙이 있었는지?
		for (let j in this.lastData.trks) {
			let trk = this.lastData.trks[j];
			if (newTrack.id == trk.id && newTrack.type == trk.type) {
				oldtrack = trk;
				let tempList = newTrack.recs.concat(oldtrack.recs);
				tempList.sort(function(a,b) {return a.dt - b.dt}); // dt asc 로 정렬
				const MAX_REC = 60;
				if (tempList.length > MAX_REC) {
					tempList.splice(0, tempList.length - MAX_REC);
				}
				newTrack.recs = tempList;
				this.lastData.trks[j] = newTrack;
				break;
			}
		}

		if (!oldtrack) this.lastData.trks.push(newTrack);
	}


	// 마지막 데이터를 기준으로 montype별 트랙 및 groupid 별 트랙을 모음
	this.groupid_trks = {};
	this.montype_trks = {};

	for (let i in this.lastData.trks) {
		let trk = this.lastData.trks[i];
		if (!this.montype_trks[trk.montype]) this.montype_trks[trk.montype] = trk;
		var groupId = montype_groupids[trk.montype];
		if (groupId) {
			if (!this.groupid_trks[groupId]) {
				this.groupid_trks[groupId] = [];
			}
			this.groupid_trks[groupId].push(trk);
		}
	}

	//console.log(this.lastData.trks);
}

// array buffer concat
function concat(a, b) {
	let ret = new Float32Array(a.length + b.length);
	ret.set(a);
	ret.set(b, a.length);
	return ret
}

function prev_to_val(t){
	var newRec = t.recs[0];
	var prev = newRec.prev;
	t.recs[0].val = new Float32Array(prev.length);
	if(t.mindisp === undefined) t.mindisp = 1;
	if(t.maxdisp === undefined) t.maxdisp = 99;
	for(var idx = 0; idx < prev.length; idx++){
		if(prev[idx] == 0) continue;
		t.recs[0].val[idx] = prev[idx] * (t.maxdisp - t.mindisp) / 99 + t.mindisp;
	}
}

// 트랙 데이터들은 맨 마지막 data(=lastData)로 머지해서 몰아준다.
wm_room.prototype.pushData = function(newData) {
	if (!newData) return;
	if (!newData.trks) return;

	// 같은 데이터는 다시 파싱하지 않음
	if (this.lastData && this.lastData.bedid === newData.bedid && this.lastData.seqid === newData.seqid) return;
	if(this.lastData && this.lastData.dtstart == newData.dtstart && this.lastData.dtend == newData.dtend) return;

	// 내가 가진 마지막 데이터
	this.dtlast = newData.dtserver || newData.dtend;

	// 처음 도착 시 VRClockDiffToServer를 세팅
	if (newData.dtend && newData.dtserver && this.VRClockDiffToServer === null) {
		// vr 상에서 데이터를 마지막 생성해서 보낸 시각이 현재 시각이 되도록 세팅
		this.VRClockDiffToServer = newData.dtend - newData.dtserver;
	}

	//if (this.bedname == "R8") console.log(newData);

	if (!this.lastData || this.lastData.bedid != newData.bedid || newData.dtend < this.lastData.dtend || newData.dtstart > this.lastData.dtend + 10) { // just overwrite
		this.lastData = newData;
		this.dtStart = newData.dtstart - this.VRClockDiffToServer;
		this.dtEnd = newData.dtend - this.VRClockDiffToServer;
		this.dtcase = newData.dtcase;

		//console.log("reset", this.bedname);
	} else if (newData.trks && this.lastData.trks) {
		for (let i in newData.trks) { // 이번에 받은 트랙들에 대하여
			let newTrack = newData.trks[i];
			let oldtrack = null; // 이전 데이터에 해당 트랙이 있었는지?
			for (let j in this.lastData.trks) {
				let trk = this.lastData.trks[j];
				if (newTrack.id == trk.id && newTrack.srate == trk.srate && newTrack.type == trk.type) {
					oldtrack = trk;
					break;
				}
			}

			if (oldtrack) { // 이전 데이터에 해당 트랙이 있었으면 이번 데이터로 복사해 온다.
				if (newTrack.type === 'wav' && newTrack.recs && newTrack.recs.length > 0 && oldtrack.recs && oldtrack.recs.length > 0) {
					// prev만 넘어올 때 val 생성
					if(oldtrack.recs[0].val === undefined) prev_to_val(oldtrack);
					if(newTrack.recs[0].val === undefined) prev_to_val(newTrack);

					var oldRec = oldtrack.recs[0];
					var newRec = newTrack.recs[0];
					//console.log(oldRec);
					// Float32Array 버전
					if (Array.isArray(oldRec.val)) oldRec.val = new Float32Array(oldRec.val);
					if (Array.isArray(newRec.val)) newRec.val = new Float32Array(newRec.val);

					// 7초 단위에서 이것을 따라잡지 않으면 조금씩 샘플이 어긋나면서 QRS wave가 2개 나오는등 이음새 부분에서 반복 패턴이 보여짐
					let newlen = Math.round((newRec.dt - oldRec.dt) * newTrack.srate);
					if (newlen < oldRec.val.length) { // 겹치면? 뒤를 자름
						// 데이터는 5초마다 보내는데 7초 데이터를 포함하고 있으므로 항상 2초 정도의 데이터를 자르게 된다.
						oldRec.val = oldRec.val.slice(0, newlen);
					} else if (newlen > oldRec.val.length) { // 부족하면 여유있게 할당하고 0으로 채운 뒤 복사
						let temp = new Float32Array(newlen);
						temp.set(oldRec.val);
						oldRec.val = temp;
					}

					// 남은 것을 이어붙임
					newRec.val = concat(oldRec.val, newRec.val);
					newRec.dt = oldRec.dt;

					delete oldRec;
					// 만일 최종 길이가 현재 보여짐 길이 이상이면? 앞쪽 것을 날림
					const MAX_PREV = (this.get_display_time_length() + this.display_latency) * STANDARD_SAMPLE_RATE * 10;
					if (newRec.val.length > MAX_PREV) {
						let oldlen = newRec.val.length;
						let num_del = parseInt(newRec.val.length - MAX_PREV);
						newRec.val = newRec.val.slice(num_del);
						newRec.dt += (oldlen - newRec.val.length) / newTrack.srate;
					}
				} else if (newTrack.type != 'wav') {
					// 시간 순서대로 두 트랙의 레코드들을 merge 함
					let tempList = newTrack.recs.concat(oldtrack.recs);
					tempList.sort(function(a,b) {return a.dt - b.dt}); // dt asc 로 정렬
					const MAX_REC = 60;
					if (tempList.length > MAX_REC) {
						tempList.splice(0, tempList.length - MAX_REC);
					}
					newTrack.recs = tempList;
				}
			}
		}

		//for(var trk of this.lastData.trks){
		for(var idx in this.lastData.trks){
			var trk = this.lastData.trks[idx];
			if(trk.montype.indexOf("FILT") > -1 && newData.trks.filter(t => t.montype === trk.montype).length <= 0) {
				newData.trks.push(trk);
				//console.log(trk);
			}
		}

		this.dtEnd = Math.max(this.dtEnd, newData.dtend - this.VRClockDiffToServer);
		this.dtStart = Math.max(this.dtStart, this.dtplayer - 60, this.dtEnd - 60);
		this.dtEnd = Math.max(this.dtStart, this.dtEnd);
	}

	if (!newData) return;

	// 마지막 데이터를 기준으로 montype별 트랙 및 groupid 별 트랙을 모음
	this.groupid_trks = {};
	this.montype_trks = {};
	if (newData.trks) {
		for (let i in newData.trks) {
			let trk = newData.trks[i];
			if (!this.montype_trks[trk.montype]) this.montype_trks[trk.montype] = trk;
			var groupId = montype_groupids[trk.montype];
			if (groupId) {
				if (!this.groupid_trks[groupId]) {
					this.groupid_trks[groupId] = [];
				}
				this.groupid_trks[groupId].push(trk);
			}
		}
	}

	this.lastData = newData;
}

function check_status(){
	var bedids = Object.keys(wm_rooms);
	if(bedSocket.connected)	bedSocket.emit('req_bed_status', bedids.join());
}

function update_room_visibility() {
	if (wm_single_bedid) return;

	let total = 0;
	let active = 0;

	for (let bedid in wm_rooms) {
		let room = wm_rooms[bedid];

		if(selected_groups.has(room.groupname) || selected_groups.size <= 0){
			total ++;
			if(room.ptcon > 0) {
				active ++;
			}
		} else $(room.domRoot).css('display', 'none');
	}

	var room_status = document.getElementById("room-status");
	if(room_status) room_status.innerHTML = "<font color='red'>" + active + "</font>/" + total + " beds";
};

function roundedRect(ctx, x, y, width, height, radius=0) {
	ctx.beginPath();
	ctx.moveTo(x, y + radius);
	ctx.lineTo(x, y + height - radius);
	ctx.arcTo(x, y + height, x + radius, y + height, radius);
	ctx.lineTo(x + width - radius, y + height);
	ctx.arcTo(x + width, y + height, x + width, y + height-radius, radius);
	ctx.lineTo(x + width, y + radius);
	ctx.arcTo(x + width, y, x + width - radius, y, radius);
	ctx.lineTo(x + radius, y);
	ctx.arcTo(x, y, x, y + radius, radius);
}

wm_room.prototype.draw_title = function(ctx, data, rcx, canvas_width) {
	// 방이름을 씀
	ctx.font = '40px arial';
	ctx.fillStyle = '#ffffff';
	ctx.textAlign = 'left';
	ctx.textBaseline = 'alphabetic';

	var bedname = this.bedname.substring(0,11);

	// VR 버전을 체크하여 minor update 이면 . 을 major update 이면 ! 를 추가
	/* if (data && data.vrver) {
		var latest = vver_latest.replace(/\./g, "").padEnd(10, '0');
		var vrver = data.vrver.replace(/\./g, "").padEnd(10, '0');
		if (latest > vrver) bedname += ".";
	} */

	ctx.fillText(bedname, rcx + 4, 45);
	let px = rcx + ctx.measureText(bedname).width + 22;

	if (!data || this.dtEnd + 60 < this.dtplayer) {
		this.lastData = null;
		ctx.fillStyle = 'red';
		ctx.textAlign = 'left';
		ctx.fillText('NO DATA', px, 45);
		$(this.domMenu).find("a.update-vr-" + this.shareid).addClass("disabled");
		$(this.domMenu).find("a.restart-vr-" + this.shareid).addClass("disabled");
		$(this.domMenu).find("a.reboot-vr-" + this.shareid).addClass("disabled");
		$(this.domMenu).find("a.dev-setting-" + this.shareid).addClass("disabled");
		return false;
	} else {
		$(this.domMenu).find("a.update-vr-" + this.shareid).removeClass("disabled");
		$(this.domMenu).find("a.restart-vr-" + this.shareid).removeClass("disabled");
		$(this.domMenu).find("a.reboot-vr-" + this.shareid).removeClass("disabled");
		$(this.domMenu).find("a.dev-setting-" + this.shareid).removeClass("disabled");
	}

	if (this.isNavigating) { // single mode
		if (Date.now() - (this.sliderLastChangedAt || 0) > 1000) {
			var currtime = new Date(Date.now() - (wm_serverNow() - this.dtplayer) * 1000);
			var msg = wm_isMobile? "<br>":"";
			msg += formatDate(currtime);
			this.domTxtTime.innerHTML = msg;
			this.domTxtTime.style.color = '#bbbbbb';
		}
	} else if (!this.isSliding){
		var realtime = new Date(Date.now() - this.display_latency * 1000);
		var msg = formatDate(realtime);
		this.domTxtTime.innerHTML = msg;
		this.domTxtTime.style.color = '#bbbbbb';
	}

	if (this.ptcon) { // 환자 연결됨 상태를 그림
		ctx.drawImage(img_top_patient, (rcx + canvas_width) / 2 - 75, 5, 18, 27);
	}

	if (data) {
		var caseTime = Math.floor(Math.max(0, this.dtplayer - this.dtcase + this.VRClockDiffToServer));
		if(this.dtcase > 0) {
			var s = caseTime % 60;
			var m = Math.floor(caseTime / 60) % 60;
			var h = Math.floor(caseTime / 3600) % 24;
			var d = Math.floor(caseTime / 86400);
			var text = s + 's';
			if(m > 0 || h > 0 || d > 0) text = m + 'm ' + text;
			if(h > 0 || d > 0) text = h + 'h ' + text;
			if(d > 0) text =  d + 'd ' + text;
			ctx.font = 'bold 24px arial';
			ctx.fillStyle = data.recording ? 'red' : 'white';
			ctx.textAlign = 'left';
			ctx.textBaseline = 'alphabetic';
			ctx.fillText(text, (rcx + canvas_width) / 2 - 50, 29);
		}

		if (data.devs) { // 장비 목록을 그림
			ctx.font = '15px arial';
			ctx.textAlign = 'left';
			ctx.textBaseline = 'alphabetic';
			for (let i in data.devs) {
				let dev = data.devs[i];
				if (dev.stauts === 'on' || dev.status === 'on') {
					ctx.fillStyle = '#348ec7'; //'#50c878';
				} else {
					ctx.fillStyle = 'red';
				}
				roundedRect(ctx, px, 36, 12, 12, 3);
				ctx.fill();

				px += 17;

				ctx.fillStyle = 'white';
				ctx.fillText(dev.name.substr(0,7), px, 48);
				px += ctx.measureText(dev.name.substr(0,7)).width + 13;
			}
		}

		if(data.filts) {
			// for (let filt of data.filts) {
			for(var idx in data.filts){
				var filt = data.filts[idx];
				ctx.fillStyle = '#c388c3';

				roundedRect(ctx, px, 36, 12, 12, 3);
				ctx.fill();

				px += 17;

				ctx.fillStyle = 'white';
				ctx.fillText(filt.name.substr(0,7), px, 48);
				px += ctx.measureText(filt.name.substr(0,7)).width + 13;
			}
		}
	}

	if(wm_serverNow() - data.dtapp >= 120){
		$(this.domMenu).find("a.update-vr-" + this.shareid).removeClass("disabled");
		$(this.domMenu).find("a.restart-vr-" + this.shareid).removeClass("disabled");
		$(this.domMenu).find("a.reboot-vr-" + this.shareid).removeClass("disabled");
	}else{
		$(this.domMenu).find("a.update-vr-" + this.shareid).addClass("disabled");
		$(this.domMenu).find("a.restart-vr-" + this.shareid).addClass("disabled");
		$(this.domMenu).find("a.reboot-vr-" + this.shareid).addClass("disabled");
	}

	return true;
}
wm_room.prototype.draw_track = function(ctx, track, rcx, rcy, wav_width, rch) {
	// 웨이브 트랙을 그림
	if (track && track.srate && track.recs && track.recs.length) {
		var rec = track.recs[0];
		if (rec.val && rec.val.length) { // waveform 선을 이어서 그림
			ctx.beginPath();

			// 7초 혹은 28초
			let lastx = rcx; //0;
			let py = 0;
			let is_first = true;

			// 픽셀값을 정수로 해야 anti-aliasing이 안먹으면서 속도가 빨라진다.
			// anti-aliasing을 안쓸거면 비트맵 drawing에서 1픽셀 미만은 무의미

			// dtPlayer 는 서버 시각 기준
			// rec.dt 는 vr 시간 기준
			let idx = 0;
			let px = rcx + wav_width - parseInt((this.dtplayer - (rec.dt - this.VRClockDiffToServer) - this.display_latency) * track.srate); // 레코드 시간 (br 시간)을 서버 시간으로 변경 -> 픽셀로 변환
			if (px < rcx) {
				idx = -parseInt(px - rcx);
				px = rcx;
			}

			let vals = rec.val;
			if(vals === undefined) return;
			for (let l = vals.length; idx < l; px ++, idx ++) { // 모든 prev 데이터는 자신의 srate 로 되어있다.
				let value = vals[idx];
				if (value == 0) continue;

				value = (value - track.mindisp) / (track.maxdisp - track.mindisp);
				if (px > rcx + wav_width) break; // 우측 끝을 넘어가면 그리기 종료

				py = rcy + rch - value * rch; // y높이가 아주 정확하지는 않지만 이정도면 충분하다.
				if(py < rcy) py = rcy;
				if(py > rcy + rch) py = rcy + rch;
				if (is_first) {
					if (px < rcx + 10) {
						ctx.moveTo(rcx, py);
						ctx.lineTo(px, py);
					} else {
						ctx.moveTo(px, py);
					}
					is_first = false;
				} else {
					if (px - lastx > rcx + 10) {
						ctx.stroke();

						ctx.beginPath();
						ctx.moveTo(px, py);
					} else {
						ctx.lineTo(px, py);
					}
				}

				lastx = px;
			}

			if (!is_first && px > rcx + wav_width - 10) {
				ctx.lineTo(rcx + wav_width, py);
			}

			ctx.stroke();

			// 맨 우측에서 뛰어다니는 흰 사각형을 그림
			if (!is_first) {
				if (px > rcx + wav_width - 4) {
					ctx.fillStyle = 'white';
					ctx.fillRect(rcx + wav_width - 4, py - 2, 4, 4);
				}
			}
		}
	}
}

// html5 canvas 그리기
wm_room.prototype.draw = function() {
	let ctx = this.domCanvas.getContext('2d');

	let canvas_width = 800;

	if(wm_single_bedid) { // 한 방 만 크게 볼 때
		if (wm_single_bedid !== this.bedid) return;
		canvas_width = window.innerWidth;
	}

	// 모바일일 경우 캔버스 크기가 115 정도로 매우 작아진다. 이 경우 실제로는 2배 크게 그려서 축호한다.
	let MOBILE_SCALE = 1;
	if (ctx.canvas.clientWidth < 250) { // 그림의 최소 폭 확보
		MOBILE_SCALE = 250 / ctx.canvas.clientWidth;
	}

	if (ctx.canvas.clientHeight != parseInt(ctx.canvas.clientWidth * this.room_height / canvas_width) ) { // 트랙 변경으로 방 높이가 변경되었으면?
		ctx.canvas.height = parseFloat(ctx.canvas.clientWidth * this.room_height / canvas_width) * MOBILE_SCALE; // 이렇게 canvas의 height를 조절하면 자동으로 clientHeight가 조정된다.
	}

	this.domCanvas.clientWidth = this.domCanvas.clientWidth.toFixed(2);
	this.domCanvas.clientHeight = this.domCanvas.clientHeight.toFixed(2);

	if (ctx.width != this.domCanvas.clientWidth * MOBILE_SCALE) {
		ctx.width = this.domCanvas.clientWidth * MOBILE_SCALE;
	}
	if (ctx.height != this.domCanvas.clientHeight * MOBILE_SCALE) {
		ctx.height = this.domCanvas.clientHeight * MOBILE_SCALE;
	}
	if (ctx.canvas.width != this.domCanvas.clientWidth * MOBILE_SCALE) {
		ctx.canvas.width = this.domCanvas.clientWidth * MOBILE_SCALE;
	}
	if (ctx.canvas.height != this.domCanvas.clientHeight * MOBILE_SCALE) {
		ctx.canvas.height = this.domCanvas.clientHeight * MOBILE_SCALE;
	}

	ctx.fillStyle = '#000000';
	ctx.fillRect(0, 0, ctx.width, ctx.height);

	ctx.save();
	ctx.scale(ctx.width / canvas_width, ctx.width / canvas_width);

	let data = this.lastData;

	// 현재 트랙의 사각형 영역
	let rcx = 0;
	let rcy = 60;
	const wav_width = (wm_single_bedid? canvas_width : canvas_width) - PAR_WIDTH;

	if (!this.draw_title(ctx, data, rcx, canvas_width)) {
		this.room_height = 60;
		ctx.restore();
		return;
	}

	let graphLineWidth = 2.5;
	// draw wav groups first
	let isTrackDrawn = new Set();
	for (var groupid in wm_groups) {
		var group = wm_groups[groupid];
		if (!group.wav) continue;

		//var tracks = this.groupid_trks[groupid];
		var wavname = group.name;

		let wavtrack = this.montype_trks[group.wav];
		if (!wavtrack) continue;

		if (wavtrack && wavtrack.srate && wavtrack.recs && wavtrack.recs.length) {
			isTrackDrawn.add(wavtrack.id);
			wavname = wavtrack.name;
		}

		// 웨이브 우측 박스를 그림
		if (!this.draw_par_box(group, isTrackDrawn, ctx, rcx + wav_width, rcy)) {
			// 우측 박스가 없을 경우
			if (wavname != "ECG_II" && wavname != "PLETH" && wavname != "ECG") continue;
		}

		let isART = (wavtrack.montype === 'IABP_WAV');
		if (isART) rch = PAR_HEIGHT * 1.5;
		else rch = PAR_HEIGHT;

		ctx.lineWidth = graphLineWidth;
		ctx.strokeStyle = group.fgColor;
		this.draw_track(ctx, wavtrack, rcx, rcy, wav_width, rch);

		// 트랙의 테두리를 그림
		ctx.lineWidth = 0.5;
		ctx.strokeStyle = '#808080';
		ctx.beginPath();
		ctx.moveTo(rcx, rcy + rch);
		ctx.lineTo(rcx + wav_width, rcy + rch);
		ctx.stroke();

		if (isART) { // 동맥 압력일 경우 눈금을 그림
			ctx.beginPath();
			ctx.strokeStyle = '#c8c8c8';
			ctx.setLineDash([5, 15]);
			ctx.lineWidth = graphLineWidth;

			ctx.font = '12px Arial';
			ctx.fillStyle = 'white';
			ctx.textAlign = 'right';
			ctx.textBaseline = 'top';
			ctx.fillText('160', canvas_width - PAR_WIDTH - 3, rcy + 3);

			let ly = rcy + rch / 3;
			ctx.moveTo(rcx, ly);
			ctx.lineTo(canvas_width - PAR_WIDTH - graphLineWidth * 15, ly);

			ctx.textBaseline = 'middle';
			ctx.fillText('120', canvas_width - PAR_WIDTH - 3, ly);

			ly = rcy + rch * 2 / 3;
			ctx.moveTo(rcx, ly);
			ctx.lineTo(canvas_width - PAR_WIDTH - graphLineWidth * 15, ly);

			ctx.fillText('80', canvas_width - PAR_WIDTH - 3, ly);

			ctx.textBaseline = 'bottom';
			ctx.fillText('40', canvas_width - PAR_WIDTH - 3, rcy + rch - 3);

			ctx.stroke();
			ctx.setLineDash([]);
		}

		ctx.font = '14px Arial';
		ctx.fillStyle = 'white';
		ctx.textAlign = 'left';
		ctx.textBaseline = 'top';
		ctx.fillText(wavname, rcx + 3, rcy + 4);

		rcy += rch;
	}

	// draw events
	let has_evt = (data.evts && data.evts.length);
	if (has_evt) {
		this.draw_par_box(null, null, ctx, wav_width, rcy);
		var cnt = 0;
		ctx.font = '14px arial';
		ctx.textAlign = 'left';
		ctx.textBaseline = 'alphabetic';

		for (let eventIdx = data.evts.length - 1; eventIdx >= 0; eventIdx -= 1) {
			let rec = data.evts[eventIdx];
			ctx.fillStyle = '#4EB8C9';

			var date = new Date(rec.dt * 1000);
			var hours = date.getHours();
			var minutes = ("0" + date.getMinutes()).substr(-2);
			var formattedTime = hours + ':' + minutes;

			ctx.fillText(hours + ':' + minutes, rcx + wav_width + 3, rcy + 20 + cnt * 20);
			ctx.fillStyle = 'white';
			ctx.fillText(rec.val, rcx + wav_width + 45, rcy + 20 + cnt * 20);
			cnt += 1;
		}
	}

	// draw non-wave groups
	rcx = 0;
	let is_first_line = true;
	//let max_rcx = has_evt? (canvas_width - PAR_WIDTH * 2) : (canvas_width - PAR_WIDTH);
	for (var groupid in wm_groups) {
		var group = wm_groups[groupid];

		let wavtrack = this.montype_trks[group.wav];
		if(wavtrack && wavtrack.recs && wavtrack.recs.length > 0) {
			continue; // wave 트랙이 있음 -> 위에서 그렸음
		}

		if(!this.draw_par_box(group, isTrackDrawn, ctx, rcx, rcy)) continue;

		rcx += PAR_WIDTH;
		if (rcx > canvas_width - PAR_WIDTH * 2) {
			rcx = 0;
			rcy += PAR_HEIGHT;
			// 모바일일 경우를 제외하고 확대모드일 때만 세줄이상 허용
			if (!is_first_line && !wm_single_bedid && !wm_isMobile) break;
			// 확대모드일 때 파라미터 박스가 캔버스 높이를 넘어가지 않는 이상 허용
			if (wm_single_bedid && rcy + PAR_HEIGHT > ctx.height) break;
			is_first_line = false;
		}
	}

	if(wm_single_bedid != this.bedid) { // 여러방 볼 때 --> 높이가 변할 수 있음
		if (rcx) rcy += PAR_HEIGHT;

		if (this.room_height != rcy) {
			// 다음번 그리기 위해 canvas 크기를 변경해 놓음
			this.room_height = rcy;
		}
	}

	ctx.restore();
};

wm_room.prototype.draw_par_box = function(group, isTrackDrawn, ctx, startX, startY) {
	let valueExists = false;

	if (!group) return false;
	if (!group.param) return false;

	var layout = wm_paramLayouts[group.paramLayout];
	var nameValueArray = [];
	if (!layout) return false;

	// 해당 그룹의 파라미터값들을 모음
	for (let i in group.param) {
		let montype = group.param[i];
		var track = this.montype_trks[montype];
		if (track && track.recs) {
			isTrackDrawn.add(track.id);
			var value = undefined;
			// 가장 최신 데이터부터
			for (var recIdx = track.recs.length - 1; recIdx >= 0; recIdx -= 1) {
				var rec = track.recs[recIdx];
				var dt = rec.dt - this.VRClockDiffToServer; // 각 측정값(레코드)의 서버 시각
				// 현재 보여짐 시각보다 5분 전 측정값이면 찾기 종료
				if (dt < this.dtplayer - 300) break;
				// 미래의 측정값이어도 표시하지 않음
				if (dt > this.dtplayer && rec.val) continue;
				// 값이 존재하지 않아도 표시하지 않음
				if (rec.val !== undefined && rec.val !== null) {
					value = rec.val;
					break;
				}
			}
			if (value !== undefined) {
				value = wm_formatValue(value, track.type);
				nameValueArray.push({ name: track.name, value: value });
				valueExists = true;
			} else {
				nameValueArray.push({ name: track.name, value: '' });
			}
		}
	}

	if (!valueExists) {
		return false;
	}

	if (group.name){
		var name = group.name;
		if(name.substring(0, 5) === 'AGENT' && nameValueArray.length > 1){
			if(nameValueArray[1].value.toUpperCase() === 'DESF'){
				nameValueArray[1].value = 'DES';
			} else if(nameValueArray[1].value.toUpperCase() === 'ISOF'){
				nameValueArray[1].value = 'ISO';
			} else if(nameValueArray[1].value.toUpperCase() === 'ENFL'){
				nameValueArray[1].value = 'ENF';
			}
		}
	}

	if(group.name === 'MASIMO' && nameValueArray.length > 2) {
		nameValueArray[1].name = 'SEF';
		nameValueArray[1].value = nameValueArray[1].value ? Math.round(nameValueArray[1].value) : '';
		nameValueArray[1].value = nameValueArray[2].value ? nameValueArray[1].value + '/' + Math.round(nameValueArray[2].value) : nameValueArray[1].value;
		nameValueArray.pop();
	}

	if (group.paramLayout === 'BP' && nameValueArray.length > 2) {
		nameValueArray[0].name = group.name || '';
		nameValueArray[0].value = (nameValueArray[0].value ? Math.round(nameValueArray[0].value) : ' ') + (nameValueArray[1].value ? ('/' + Math.round(nameValueArray[1].value)) : ' ');
		nameValueArray[2].value = nameValueArray[2].value ? Math.round(nameValueArray[2].value) : '';
		nameValueArray[1] = nameValueArray[2];
		nameValueArray.pop();
	} else if (nameValueArray.length > 0 && !nameValueArray[0].name) {
		nameValueArray[0].name = group.name || '';
	}

	if (group.paramLayout === 'VNT') {
		nameValueArray[0].name = group.name;
		if (nameValueArray.length === 4) {
			nameValueArray[0].value = nameValueArray[0].value ? Math.round(nameValueArray[0].value) : '';
			nameValueArray[1].value = nameValueArray[1].value ? Math.round(nameValueArray[1].value) : '';
			nameValueArray[2].value = nameValueArray[2].value ? Math.round(nameValueArray[2].value) : '';
			nameValueArray[2].value = nameValueArray[3].value ? nameValueArray[2].value + ' (' + Math.round(nameValueArray[3].value) + ')' : nameValueArray[2].value + '	 ';
			nameValueArray.pop();
		}
	}

	for (var idx = 0; idx < layout.length && idx < nameValueArray.length; idx ++) {
		var layoutElem = layout[idx];
		if (layoutElem.value && layoutElem) {
			ctx.font = layoutElem.value.fontsize + 'px arial';
			ctx.fillStyle = group.fgColor;
			if(nameValueArray[0].name == "HPI") ctx.fillStyle = "#00FFFF"
			if(group.name && group.name.substring(0, 5) === 'AGENT' && nameValueArray.length > 1){
				if(nameValueArray[1].value === 'DES'){
					ctx.fillStyle = '#2296E6';
				} else if(nameValueArray[1].value === 'ISO'){
					ctx.fillStyle = '#DDA0DD';
				} else if(nameValueArray[1].value === 'ENF'){
					ctx.fillStyle = '#FF0000';
				}
			}
			ctx.textAlign = layoutElem.value.align || 'left';
			ctx.textBaseline = layoutElem.value.baseline || 'alphabetic';
			ctx.fillText(nameValueArray[idx].value, startX + layoutElem.value.x, startY + layoutElem.value.y);
		}

		if (layoutElem.name) {
			ctx.font = '14px arial';
			ctx.fillStyle = 'white';
			//ctx.textAlign = layoutElem.name.align || 'left';
			ctx.textAlign = layoutElem.name.align || 'left';
			ctx.textBaseline = layoutElem.name.baseline || 'alphabetic';
			var str = nameValueArray[idx].name;
			var measuredWidth = ctx.measureText(str).width;
			var maxWidth = 75;
			if (measuredWidth > maxWidth) {
				ctx.save();
				ctx.scale(maxWidth / measuredWidth, 1);
				ctx.fillText(str, (startX + layoutElem.name.x) * measuredWidth / maxWidth, startY + layoutElem.name.y);
				ctx.restore();
			} else {
				ctx.fillText(str, startX + layoutElem.name.x, startY + layoutElem.name.y);
			}
		}
	}

	// draw border
	ctx.strokeStyle = '#808080';
	ctx.lineWidth = 0.5;
	var height = group.name == "ART"? PAR_HEIGHT * 1.5 : PAR_HEIGHT;
	roundedRect(ctx, startX, startY, PAR_WIDTH, height);//, 6);
	ctx.stroke();

	// 귀를 그림
	if (group.param[0] && group.param[0].substring(0, 4) == 'FILT') { // the triangle
		ctx.beginPath();
		ctx.moveTo(startX + PAR_WIDTH, startY);
		ctx.lineTo(startX + PAR_WIDTH - 12, startY);
		ctx.lineTo(startX + PAR_WIDTH, startY + 12);
		ctx.fillStyle = "#c8c8c8";
		ctx.fill();
	}

	return true;
};

wm_room.prototype.populateRoomData = function(targetDt) {
	this.lastData = null;
	this.dtStart = 0;
	this.dtEnd = 0;
	this.ptcon = 0;

	if(!targetDt) {
		this.dtlast = 0;
		this.dtplayer = wm_serverNow() - this.display_latency;
	} else {
		this.dtlast = targetDt - this.get_display_time_length() - this.display_latency;
		this.dtplayer = targetDt;
	}

	request_room_data();
};

// 주기적으로 방 데이터를 최신 데이터로 업데이트 한다.
var was_first = true; // 첫 데이터 요청인지?
function request_room_data() {
	let post = {}; // bedid: dt
	let room_data_len = 1; // 1일 경우 멀티모드, 0 보다 클 경우 싱글모드이고 값이 return 받아야할 데이터의 갯수
	if (wm_single_bedid) { // 싱글 모드 일 때
		let room = wm_rooms[wm_single_bedid];
		room_data_len = Math.ceil((room.get_display_time_length() + room.display_latency) / room.display_latency);
		if(room.is_websocket && !room.isNavigating) return;
		// 현재 보여지는 위치의 다음을 요청
		if (room.dtlast < room.dtplayer) post[wm_single_bedid] = room.dtlast;
		else return;
	} else { // 여러 방 볼 때
		for (let bedid in wm_rooms) {
			let room = wm_rooms[bedid];
			if(room.is_websocket && room.dtlast > 0) continue;
			if((!selected_groups.has(room.groupname) && selected_groups.size > 0) || !check_visible(room.domCanvas)) continue;
			// 내가 가지고 있는 마지막 것을 넘기면 그 다음 것을 보내 줄것임
			post[bedid] = room.dtlast;
			// 마지막으로 데이터 요청한지 10초 (server upload interval + default display latency) 지났으면 최신 데이터 요청
			if(room.dtplayer - room.dtlast >= room.display_latency * 2) post[bedid] = null;
		}
	}
	if(Object.keys(post).length <= 0) return;

	// 최초 및 이후 업데이트 위한 데이터 요청
	// 모든 방 데이터를 한번에 요청한다
	bedSocket.emit('req_prev_data', JSON.stringify(post), room_data_len);
}

// 브라우저에서 지원하는 반복적 호출 함수
var update_frame = (function () {
	return window.requestAnimationFrame ||
		window.webkitRequestAnimationFrame ||
		window.mozRequestAnimationFrame ||
		window.oRequestAnimationFrame ||
		function (callback) {
			return window.setTimeout(callback, 1000 / 60); // shoot for 60 fps
		};
})();

var last_render = 0;
function redraw_rooms() {
	update_frame(redraw_rooms);

	let now = Date.now();
	let diff = now - last_render;
	if (diff > 30) { // 30 FPS
		this.last_render = now;
	} else {
		return;
	}

	for (let bedid in wm_rooms) {
		if(wm_single_bedid && wm_single_bedid !== bedid) continue;

		let room = wm_rooms[bedid];

		// 안보여지는 창은 업데이트 하지 않음
		if (room.domRoot.style.display == 'none') continue;
		if (!check_visible(room.domCanvas)) continue;

		if (!room.isPaused) { // 시간을 진행 시킴
			if (room.isNavigating) {
				room.dtplayer = wm_serverNow() + room.navigationTimeDiffToRealtime;
				room.navigationTimeDiffToRealtime += fastForward;
				if(room.dtplayer >= wm_serverNow() - room.display_latency) $(room.domPlaySpeed).val(1).change();
			} else {
				room.dtplayer = wm_serverNow() - room.display_latency;
			}
		}

		// 이 방을 그림
		room.draw();
	}
}

function join_rooms(){
	if(!bedSocket.connected) return;
	for(var bedid in wm_rooms){
		var room = wm_rooms[bedid];
		if(room.is_websocket && !room.isVisible && check_visible(room.domCanvas)){
			bedSocket.emit('join_bed', bedid);
			room.isVisible = true;
		}
	}
}

function display_txtTime(){
	if(wm_single_bedid){
		var room = wm_rooms[wm_single_bedid];
		var domtxtTimeX = $(room.domRoot).find(".wm-timeX")[0];
		domtxtTimeX.innerHTML = (txtTime.length > 0? "Rewind to ":"") + txtTime;
	}
	setTimeout(display_txtTime, 100);
}

function rewrite_room_title(bedid, vrver){
	var room = wm_rooms[bedid];
	$("#" + bedid).attr("title", room.bedname + " (" + room.shareid + ") " + vrver);
	room.vrver = vrver;
}

// 화면 그리기를 시작
update_frame(redraw_rooms);

$(document).ready(function() {
	var domRooms = document.getElementsByClassName('wm-room');
	var is_unspecified = false;
	for (let i in domRooms) {
		let domRoom = domRooms[i];
		if(!domRoom) continue;
		var bedid = domRoom.id;
		if(!bedid) continue;
		var room = new wm_room(bedid);
		room.bedname = domRoom.getAttribute('name');
		room.groupname = domRoom.getAttribute('group');
		if(room.groupname == ""){
			room.groupname = "Unspecified";
			is_unspecified = true;
		}
		room.shareid = domRoom.getAttribute('shareid'); // vrcode
		room.is_websocket = parseInt(domRoom.getAttribute('websocket'));
		room.display_latency = parseInt(domRoom.getAttribute('latency'));
		room.dtplayer -= room.display_latency;
		wm_rooms[room.bedid] = room;
	}

	if(!is_unspecified){
		$("#groupfilter option[value='Unspecified']").remove();
		$(".group-Unspecified").remove();
	}

	// 20분마다 세션 새로고침
	setInterval(function() {
		$.ajax({
			url: '/refresh_session',
			cache: false
		});
	}, 20 * 60 * 1000);

	// 시계 표시를 업데이트
	if(!wm_isMobile) setInterval(currentTime.bind(null), 500);
	setInterval(wm_resizeRoomHeight, 1000);

	// montype_groupids 값을 만듬
	for (var groupid in wm_groups) {
		var group = wm_groups[groupid];
		for (let i in group.param) {
			let montype = group.param[i];
			montype_groupids[montype] = groupid;
		}
		if (group.wav) {
			montype_groupids[group.wav] = groupid;
		}
	}

	wm_isMember = document.getElementById('wm-member').innerHTML === '1';
	//vver_latest = document.getElementById('vver_latest').value;

	var serverNow = parseFloat(document.getElementById('wm-now').innerHTML);
	wm_localClockDiffToServer = Date.now() / 1000 - (serverNow + 0.5);

	document.addEventListener("keydown", function(e) {
		// Esc
		if(e.keyCode == 27 && wm_single_bedid){
			wm_onClickRoom(wm_single_bedid);
		}
		// Enter
		if(e.keyCode == 13 && wm_single_bedid){
			var room = wm_rooms[wm_single_bedid];
			if(room.shareid !== undefined) add_event(room.bedname, room.bedid, room.shareid);
		}
	});

	document.addEventListener("click", function(e){
		$(".context-menu").removeClass("show").hide();
		if(e.clientX > 200 && $("#group-filter-side-tab").hasClass("show-tab")) closeGFTab();
	});

	$(window).scroll(function() {
		if($(window).scrollTop() == 0) $("#toolbar").css("padding-top", 0);
		else $("#toolbar").css("padding-top", "5px");
	});

	if($(".wm-room").length > 0){
		wm_layoutColumns = Math.min(wm_isMember ? (wm_isMobile ? 3 : 5) : 1, domRooms.length);
		wm_initLayoutButtons();
		var cookiesCurrentFilter = Cookies.get('WebMonitoring_currentFilter');
		if (cookiesCurrentFilter) {
			// 2020-03-02 이형철
			// 존재하지 않는 group 이 쿠키에 구워져 있을 때 선택도 안되고 웹모니터링 방이 안뜨는 버그 수정
			cookiesCurrentFilter.split(",").forEach(function(filter){
				if($("#"+$.escapeSelector(filter)).length > 0){
					selected_groups.add(filter);
					$("#"+$.escapeSelector(filter)).prop("checked", true);
				}
			});
		}
		var cookiesLayoutColumns = Cookies.get('WebMonitoring_layoutColumns');
		if (cookiesLayoutColumns) {
			wm_layoutColumns = parseInt(cookiesLayoutColumns);
		}
		wm_changeCurrentFilter();
		wm_changeLayoutColumns(wm_layoutColumns, true);
		window.addEventListener('resize', wm_onResizeWindow);
		if(Cookies.get('WebMonitoring_expanded')){
			//setTimeout(wm_expandWindow);
			$("#wm-expand").click();
		}
		if(Cookies.get('WebMonitoring_patientOn')){
			var domPatient = document.getElementById('wm-ptlabel');
			if (Cookies.get('WebMonitoring_expanded')) {
				domPatient.classList.remove("btn-gray");
				domPatient.classList.add("btn-light2");
			} else{
				domPatient.classList.remove("btn-light");
				domPatient.classList.add("btn-primary");
			}
		}
		display_txtTime();

		try{
			bedSocket = io(websocket_host,{transports:['websocket'], reconnection:false, forceNew:true});
			// Reconnects on disconnection
			var attempts = 0;
			var tryReconnect = function(){
				if(attempts >= 30){
					clearInterval(intervalID);
					console.log("Cannot connect to websocket server");
				}
				if (bedSocket.connected == false){
					attempts += 1;
					console.log("reconnecting...");
					bedSocket.connect();
				}
			}

			var intervalID = null;
			if(!bedSocket.connected) setInterval(tryReconnect, 2000);

			bedSocket.on('connect', function () {
				clearInterval(intervalID);
				intervalID = null;
				attempts = 0;
				console.log("connected");
				for(var bedid in wm_rooms){
					//console.log(bedid);
					bedSocket.emit('join_bed', bedid);
				}
			})

			bedSocket.on('disconnect', function(){
				console.log("disconnected");
				intervalID = setInterval(tryReconnect, 2000);
			});

			bedSocket.on('recv_data', function(msg){
				//console.log("receive data");
				msg = pako.inflate(msg, {to: 'string'});
				var data = JSON.parse(msg);
				var bedid = Object.keys(data)[0];
				var room = wm_rooms[bedid];
				if(!check_visible(room.domCanvas)){
					bedSocket.emit('leave_bed', bedid);
					room.isVisible = false;
					return;
				}
				if(wm_single_bedid == bedid && room.isNavigating) return;
				room.dtcase = data[bedid].dtcase || 0;
				room.dtserver = data[bedid].dtserver;
				room.ptcon = parseInt(data[bedid].ptcon) || 0;
				if(data[bedid].vrver != room.vrver){
					rewrite_room_title(room.bedid, data[bedid].vrver);
				}
				room.pushData(data[bedid]);
				if(room.log_window){
					room.log_window.document.body.insertAdjacentHTML('afterbegin', JSON.stringify(data[bedid]));
				}
				//if(room.bedname == "test") console.log(bedid, data[bedid]);
			});

			bedSocket.on('recv_filter', function(msg){
				msg = pako.inflate(msg, {to: 'string'});
				var data = JSON.parse(msg); // bedid: data (arr), filter (str), outputs (arr)
				var bedid = Object.keys(data)[0];
				data = data[bedid];
				var room = wm_rooms[bedid];
				var filt_data = [];
				data.outputs.forEach(function(value, i){
					if(i < 2){
						if(room.filters.indexOf(data.filter) < 0) room.filters.push(data.filter);
						var fid = room.filters.indexOf(data.filter) + 1;
						value['id'] = fid * 2 + i + 1;
						value['montype'] = "FILT" + (fid + 1) + "_" + (i + 1);
						value['recs'] = data.data[i];
						filt_data.push(value);
					}
				})
				//console.log(filt_data);
				room.pushFilterData(filt_data);
			});

			bedSocket.on('edit_bed', function(cmds){
				console.log(cmds);
			});

			bedSocket.on('register_bed', function(newbeds){
				console.log(newbeds);
				$.ajax({
					type: 'POST',
					url: 'https://Hyunmnb.net/my-vr/data.php',
					dataType: 'json',
					responseType: 'text',
					data: {job: "register_beds", newbeds:newbeds},
					success: function(result) {
						location.reload();
					},
					error: function(xhr, status, error) {
						console.log('REGISTER_VRCODE', status);
					}
				});
			});

			bedSocket.on('res_json', function(devices_json, filters_json){
				devices = devices_json;
				filters = filters_json;
			});

			bedSocket.on('res_bed_status', function(result){
				for(var idx in result){
					var bed = result[idx];
						var room = wm_rooms[bed.bedid];
						room.ptcon = parseInt(bed.ptcon * 1);
					}
			});

			bedSocket.on('res_prev_data', function(msg){
				msg = pako.inflate(msg, {to: 'string'});
				var data = JSON.parse(msg);
				if(Object.keys(data).length <= 0) return;
				for(let bedid in data){
					let room = wm_rooms[bedid];
					let room_data = data[bedid];
					room_data.forEach(function(rdata){
						rdata = JSON.parse(rdata);
						if (!wm_single_bedid && rdata.dtend && rdata.dtserver) {
							if (Math.abs(room.VRClockDiffToServer - (rdata.dtend - room.dtserver)) > room.dtend - room.dtstart) {
								console.log('VRClockDiffToServer updated', room.bedname, room.VRClockDiffToServer, rdata.dt - room.dtserver);
								room.VRClockDiffToServer = rdata.dtend - room.dtserver;
							}
						}
						room.dtcase = rdata.dtcase || 0;
						room.ptcon = parseInt(rdata.ptcon) || 0;
						room.pushData(rdata);
					});
				}

				if (wm_single_bedid) { // 싱글 모드 일 때
					let room = wm_rooms[wm_single_bedid];
					// 데이터를 더 받아와야하면?
					if (room.dtlast < room.dtplayer)
						request_room_data();
				} else if (was_first) { // 첫 요청이면 한번 더 요청해야 우측 데이터가 다 찬다
					was_first = false;
					request_room_data();
				}

				update_room_visibility(); // 새 데이터가 도착했으므로 방 보여짐 상태를 업데이트
			});

			bedSocket.on('res_cmd', function(data){
				//console.log(data);
				var data = JSON.parse(data);
				switch(data.job){
				case 'update_vr' :
						$("#wm-rooms").find("a.update-vr-" + data.vrcode).removeClass("disabled");
						$("#wm-rooms").find("a.restart-vr-" + data.vrcode).removeClass("disabled");
						$("#wm-rooms").find("a.reboot-vr-" + data.vrcode).removeClass("disabled");
						$("#update-stat-" + data.vrcode).html("");
					break;
				case 'del_bed' :
					$("#" + data.bedid).remove();
          $("." + data.bedid).remove();
          $(".viewer-" + data.bedid).remove();
					break;
				case 'del_beds' :
					edit_vrs(curr_order);
					selected_beds2.clear();
					toggle_btns();
					break;

				case 'restart_vr' :
						$("#wm-rooms").find("a.update-vr-" + data.vrcode).removeClass("disabled");
						$("#wm-rooms").find("a.restart-vr-" + data.vrcode).removeClass("disabled");
						$("#wm-rooms").find("a.reboot-vr-" + data.vrcode).removeClass("disabled");
						$("#update-stat-" + data.vrcode).html("");
					break;
				case 'reboot_vr' :
						$("#wm-rooms").find("a.update-vr-" + data.vrcode).removeClass("disabled");
						$("#wm-rooms").find("a.restart-vr-" + data.vrcode).removeClass("disabled");
						$("#wm-rooms").find("a.reboot-vr-" + data.vrcode).removeClass("disabled");
						$("#update-stat-" + data.vrcode).html("");
					break;
				}
			});

			window.setInterval(join_rooms.bind(null), 1000);
		} catch(err) {
			console.log(err);
		}

		bedSocket.emit('req_json');

		// 최신 데이터를 업데이트 한다.
		request_room_data();
		check_status();
		setInterval(check_status, 5000);
		window.setInterval(request_room_data, 2000);
	}

	$('#register').on('submit', function(e){
		var vrcode = ($("#vrcode").val()).trim();
		var groupname = ($("#groupname").val()).trim();
		if(groupname === "all") groupname = "";
		if(groupname === "other"){
			groupname = ($("#new_group").val()).trim();
		}
		if(!document.getElementById("add_newG").classList.contains("d-none")){
			var newname = ($("#new_Gname").val()).trim();
			if(newname !== "") groupname = newname;
		}
		var today = new Date();
		var date = today.getFullYear()+'-'+(today.getMonth()+1)+'-'+today.getDate();
		date += ' '+today.getHours()+':'+today.getMinutes()+':'+today.getSeconds();
		$.ajax({
			type: 'POST',
			url: 'https://Hyunmnb.net/my-vr/data.php',
			data: {job: "add_vr", vrcode:vrcode, groupname:groupname, mtime:date},
			success: function(result) {
				if(result.msg) alert(result.msg);
				location.reload();
			},
			error: function(xhr, status, error) {
				console.log('REGISTER_VRCODE', status);
			}
		});
	});

	if(wm_isMobile){
		$("#tabs").css("font-size", 13 + "px");
	    $("#tabs").css("padding-left", ".7rem");
	    $(".nav-link").css("padding", ".5rem .7rem");
		$("#edit-group-btn").remove();
		$("#show-inactive-btn").remove();
		$("#left-btn-group").remove();
		$("#btn-user-list").remove();
		$("#add-vr-btn").remove();
		$("#plus-vr-btn").remove();
		$("#wm-refresh").remove();
		$(".wm-layout").addClass("mb-2");
		$(".wm-time").css("margin", "0");
		$(".wm-timeX").css("margin", "0");
		$(".wm-room").css("-webkit-touch-callout", "none")
			.css("-webkit-user-select", "none")
			.css("-khtml-user-select", "none")
			.css("-moz-user-select", "none")
			.css("-ms-user-select", "none")
			.css("user-select", "none");
	}

	var footer =  $('.page-footer')[0];
	if (footer) {
		$('.page-footer').fadeIn();
		var hideFooter = function() { $('.page-footer').fadeOut(); }
		footer.onclick = hideFooter;
		document.addEventListener('scroll', hideFooter);
		setTimeout(hideFooter, 5 * 1000);
	}
});

if (isIE()) {
	document.getElementsByTagName('footer')[0].style.display = 'none';
}
