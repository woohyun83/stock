$(document).ready(function() {
	try{
		bedSocket = io(websocket_host,{withCredentials: true,transports:['websocket'], reconnection:false});
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
		});

		bedSocket.on('disconnect', function(){
			console.log("disconnected");
			intervalID = setInterval(tryReconnect, 2000);
		});
	} catch(err) {
		console.log(err);
	}

	// config 서브밋 버튼을 클릭 할 경우
	$("#configsubmit").click(function(){
		var queryArray = $("#config-form").serializeArray();
		var json = {};
    jQuery.each(queryArray, function() {
        json[this.name] = this.value || '';
    });

		//bedSocket.emit('req_manage_config', json);
  	$.ajax({
  		type: 'POST',
  		url: '/set-config',
  		data: json,
  		dataType: 'json',
  		success: function (data) {
				if(data){
					alert("처리되었습니다.");
					location.reload();
				}else{
					alert("실패하였습니다.");
				}
  		},
  		error: function (o) {
  			console.log(o);
  		}
  	});
	});

	$("#uploadvrsubmit").click(function(){
		var files = $("#file")[0].files;
		uploadFile = files.length;
		if(uploadFile == 0){
			alert("파일을 선택하세요.");
		}else{
			try{
				var file = files[0];
				//버전 추출 실패시 에러로 빠짐
				var version = file.name.substr(file.name.indexOf('.') + 1, file.name.lastIndexOf('.') - file.name.indexOf('.') - 1);

				var stream = ss.createStream();

				ss(bedSocket).emit('req_upload_vr', stream, {version: version});
				ss.createBlobReadStream(file).pipe(stream);
			} catch(err) {
				console.log(err);
				alert("파일명의 마지막은 버전으로 되어야 합니다.\n ex)setup.1.8.16.7.exe");
			}
		}
	});

	// user 서브밋 버튼을 클릭 할 경우
	$("#addusersubmit").click(function(){
		var queryArray = $("#user-form").serializeArray();
		var json = {};
    jQuery.each(queryArray, function() {
        json[this.name] = this.value || '';
    });

		if(!json.userId || !json.userName || !json.userEmail){
			$("#danger").removeClass("d-none");
			$("#message").text(" Enter user information.");
			return;
		}

		bedSocket.emit('req_manage_user', json, 'add');
	});

	// user delete 버튼을 클릭 할 경우
	$("#delusersubmit").click(function(){
		﻿var queryArray = new Array();
		var chkList = document.querySelectorAll('input[name="sel-user"]:checked');
		for(var i = 0; i < chkList.length; i++) {
			var obj = chkList.item(i);
			queryArray.push({
				id : obj.value
			});
		}

		bedSocket.emit('req_manage_user', queryArray, 'del');
	});

	// hl7 서브밋 버튼을 클릭 할 경우
	$("#addhl7submit").click(function(){
		var queryArray = $("#hl7-form").serializeArray();
		var json = {};
    jQuery.each(queryArray, function() {
        json[this.name] = this.value || '';
    });

		if(!json.vr || !json.emr){
			$("#danger").removeClass("d-none");
			$("#message").text(" Enter HL7 information.");
			return;
		}

		bedSocket.emit('req_manage_hl7', json, 'add');
	});

	// hl7 delete 버튼을 클릭 할 경우
	$("#delhl7submit").click(function(){
		﻿var queryArray = new Array();
		var chkList = document.querySelectorAll('input[name="sel-hl7"]:checked');
		for(var i = 0; i < chkList.length; i++) {
			var obj = chkList.item(i);
			queryArray.push({
				vr : obj.value.split("|")[0],
				emr : obj.value.split("|")[1]
			});
		}

		bedSocket.emit('req_manage_hl7', queryArray, 'del');
	});

	// test hl7 서브밋 버튼을 클릭 할 경우
	$("#testhl7submit").click(function(){
		$.ajax({
			type: 'POST',
			url: '/HL7',
			success: function (data) {
				$("#iframe_preview").contents().find("body").html(data.replaceAll(String.fromCharCode(10), "<br/>"));
			},
			error: function (o) {
				console.log(o);
			}
		});
	});

	// user 서브밋 버튼을 클릭 할 경우
	$("#accountsubmit").click(function(){
		var queryArray = $("#account-form").serializeArray();
		var json = {};
    jQuery.each(queryArray, function() {
        json[this.name] = this.value || '';
    });

		if(!json.cur_password){
			$("#danger").removeClass("d-none");
			$("#message").text(" Enter password to save the changed information.");
			return;
		}

		bedSocket.emit('req_manage_account', json);
	});

	//change password 팝업 열기
	$("#change_password").on("click", function(e){
		e.preventDefault();
		$("#changepw-modal").show();
	});

	//change password 팝업 닫기
	$("#close_change_password").on("click", function(e){
		$("#changepw-modal").hide();
		$("#danger_modal").addClass("d-none");
	});

	// password 서브밋 버튼을 클릭 할 경우
	$("#passwordsubmit").click(function(){
		var queryArray = $("#password-form").serializeArray();
		var json = {};
		jQuery.each(queryArray, function() {
			json[this.name] = this.value || '';
		});

		if(!json.mb_password || !json.new_password || !json.confirm_password){
			$("#danger_modal").removeClass("d-none");
			$("#message_modal").text(" Enter Password.");
			return;
		}
		if(json.new_password != json.confirm_password){
			$("#danger_modal").removeClass("d-none");
			$("#message_modal").text(" New Password is different.");
			return;
		}

		bedSocket.emit('req_change_password', json);
	});

	// user 서브밋, delete 결과
	bedSocket.on('res_manage', function(result){
		if(result.result){
			location.reload();
		}else{
			$("#danger").removeClass("d-none");
			$("#message").text(" " + result.msg);
		}
	});

	bedSocket.on('res_upload_vr', function(result){
		if(uploadFile > 0){
			uploadFile--;
			if(uploadFile == 0){
				location.reload();
			}
		}
	});

	// account 서브밋 결과
	bedSocket.on('res_manage_account', function(result){
		$("#danger").removeClass("d-none");
		$("#message").text(" " + result.msg);
	});

	// password 서브밋 결과
	bedSocket.on('res_change_password', function(result){
		$("#danger_modal").removeClass("d-none");
		$("#message_modal").text(" " + result.msg);
	});

	// make 버튼을 클릭 할 경우
	$("#makelottosubmit").click(function(){
		$("#danger").addClass("d-none");
		bedSocket.emit('req_make_lotto');
	});

	// week 클릭 할 경우
	$(".week").click(function(){
		$("#danger").addClass("d-none");

		var queryArray = new Array();
		queryArray.push({
			year : this.id.split("|")[0],
			week : this.id.split("|")[1]
		});

		bedSocket.emit('req_get_lotto', queryArray[0]);
	});

	// lotto 서브밋 결과
	bedSocket.on('res_get_lotto', function(result){
		$("#danger").removeClass("d-none");
		$("#message").text(" " + result.msg);
		if(result.msg == "success"){
			var innerhtml = "<div class='form-group'>" + result.year + "년 " + result.week + "주차</div>";
			innerhtml += "<br />";
			for(var idx in result.lotto_list){
				var game = result.lotto_list[idx];
				
				for(var idx2 in game){
					var flag = "one";
					if(parseInt(game[idx2]) >= 40 ){
						flag = "fourty";
					}else if(parseInt(game[idx2]) >= 30 ){
						flag = "thirty";
					}else if(parseInt(game[idx2]) >= 20 ){
						flag = "twenty";
					}else if(parseInt(game[idx2]) >= 10 ){
						flag = "ten";
					}
					innerhtml += "<div class='lotto " + flag + "'>" + game[idx2] + "</div>";
				}
				innerhtml += "<br />";
			}
			$("#lotto_result").html(innerhtml);
		}
	});

	// lotto 서브밋 결과
	bedSocket.on('res_get_lotto_week', function(result){
		var innerhtml = "";
		innerhtml += "&nbsp;&nbsp;&nbsp;";
		for(var idx in result.week.weeks){
			innerhtml += "<div class='week' style='cursor:pointer' id='" + result.week.year + "|" + result.week.weeks[idx] + "'>" + result.week.weeks[idx] + "</div>";
		}
		$("#lotto_week").html(innerhtml);
	});
});
