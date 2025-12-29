var mv_apiRoot = "/my-vr";
var viewers = [];
var devices, filters;
var selected_beds2 = new Set();
var selected_bedids2 = new Set();
var curr_order = "bedname";
var curr_group = "all";
var curr_devs;
var select_all2 = true;
var get_vrs_job = "get_myvrs";
var orders = {
    "bedname": "SORT_ASC",
    "group": "SORT_DESC"
}

function timeConverter(unixtimestamp){
    if(unixtimestamp == 0) return "long time ago";
    var a = new Date(unixtimestamp * 1000);
    var year = a.getFullYear();
    var month = a.getMonth() + 1;
    var date = a.getDate();
    var hour = a.getHours();
    var min = a.getMinutes();
    var sec = a.getSeconds();
    console.log(month.length);
    var time = year + '-' + (month.toString().length == 1? '0' + month : month) + '-' + (date.toString().length == 1? '0' + date : date) + ' ';
    time += (hour.toString().length == 1? '0' + hour : hour) + ':' + (min.toString().length == 1? '0' + min : min) + ':' + (sec.toString().length == 1? '0' + sec : sec) ;
    return time;
}

function show_sort(order_by){
    var icon = $("#sort_" + order_by);
    if(orders[order_by] == "SORT_ASC"){
        $(icon).removeClass("fa-sort").addClass("fa-sort-up");
    } else {
        $(icon).removeClass("fa-sort").addClass("fa-sort-down");
    }
}

function hide_sort(id){
    $("#" + id).removeClass("fa-sort-up").removeClass("fa-sort-down").addClass("fa-sort");
}

function openTab() {
    $("#group-filter-side-tab").removeClass("show-tab");
    document.getElementById("group-filter-side-tab").style.width = "0";

    edit_vrs(curr_order);
    document.getElementById("add-vr-side-tab").style.width = "410px";
    $("#add-vr-side-tab").addClass("show-tab");
    document.getElementById("web-monitoring").style.marginLeft = "410px";
    wm_onResizeWindow();

    $("#vrname").focus();
}

function closeTab() {
    location.reload();
}

function openGFTab() {
    // $("#add-vr-side-tab").removeClass("show-tab");
    // document.getElementById("add-vr-side-tab").style.width = "0";

    setTimeout(function(){
        document.getElementById("group-filter-side-tab").style.width = "200px";
        $("#group-filter-side-tab").addClass("show-tab");
        document.getElementById("web-monitoring").style.marginLeft = "200px";
        wm_onResizeWindow();
        $("#filter-bed").focus();
    });
}

function closeGFTab() {
    document.getElementById("group-filter-side-tab").style.width = "0";
    $("#group-filter-side-tab").removeClass("show-tab");
    document.getElementById("web-monitoring").style.marginLeft= "0";
    setTimeout(wm_resizeRoomWidth,500);
}

function toggle_viewers(){
    if($(".info").hasClass("d-none")){
        $(".info").removeClass("d-none").css("display", "table-row");
        $("#toggle-info").removeClass("btn-light").addClass("btn-primary");
    } else{
        $(".info").addClass("d-none");
        $("#toggle-info").removeClass("btn-primary").addClass("btn-light");
    }
    filter_group(curr_group);
}

function edit_vrs(order_by="bedname", sort=null, change_order=false){
    event.preventDefault();
    $.ajax({
        url: mv_apiRoot + '/data.php',
        type: 'POST',
        dataType: 'json',
        responseType: 'text',
        data: {'job':get_vrs_job,'order':order_by,'sort':(sort==null?orders[order_by]:sort)},
        success: function(result) {
            var is_unspecified = false;
            var ghtml = "<option value='all' selected>All</option>";
            var gfhtml = "<option value='all' selected>Group</option>";
            for(var i in result.groups){
                var group = result.groups[i];
                ghtml += "<option value='" + group + "'>" + group + "</option>";
                gfhtml += "<option value='" + group + "'>" + group + "</option>";
            }
            ghtml += "<option value='Unspecified'>Unspecified</option>";
            ghtml += "<option value='other'>Add group</option>";
            gfhtml += "<option value='Unspecified'>Unspecified</option>";
            gfhtml += "<option value='Unnamed'>Unnamed</option>";
            $("#groupname").html(ghtml);
            $("#groupfilter").html(gfhtml);
            var is_dark = Cookies.get('WebMonitoring_expanded')? " dark":"";
            var html = "";
            if(get_vrs_job == "get_sharedvrs"){
                for(var i in result.vrs){
                    var vr = result.vrs[i];
                    if(vr.group == "") is_unspecified = true;
                    html += "<tr id='" + vr.bedname + "' bedname='" + vr.bedname + "' bedid='" + vr.bedid + "' class='bed " + vr.bedid + " " + (vr.group==""?"Unspecified":vr.group) + is_dark + "'>"
                    // bedname
                    html += "<td style='text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;' title='" + vr.bedname + "'>";
                    html += "<div class='custom-control custom-checkbox' style='margin-top: -1px;'>";
                    html += "<input type='checkbox' class='custom-control-input' id='sel-" + vr.bedid + "' onchange='select_bed2(\""+ vr.bedname +"\",\""+ vr.bedid +"\")'>";
                    html += "<label class='custom-control-label' for='sel-" + vr.bedid + "'></label>";
                    html += "</div>" + vr.bedname + "</td>";
                    html += "<td></td>";
                    html += "<td style='text-align:right;'>";
                    // if(!wm_preventDel) html += "<a class='text-secondary pr-2' onclick='del_bed(\"" + vr.bedname + "\",\"" + vr.bedid + "\",true,false)' title='Delete bed'><i class='far fa-trash-alt' style='width:10.5px'></i></a>";
                    html += "<a class='text-secondary pr-2' onclick='del_bed(\"" + vr.bedid + "\",\"" + vr.bedname + "\")' title='Delete bed'><i class='far fa-trash-alt' style='width:10.5px'></i></a>";
                    html += "</td></tr>";
                }
            } else {
                for(var i in result.vrs){
                    var vr = result.vrs[i];
                    if(vr.group == "") is_unspecified = true;
                    html += "<tr id='" + vr.bedname + "' bedname='" + vr.bedname + "' bedid='" + vr.bedid + "' class='bed bed-" + vr.vrcode + " " + vr.bedid + " " + (vr.group==""?"Unspecified":vr.group.replace(/\s/g, '')) + is_dark + "'>";
                    // bedname
                    html += "<td style='text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;' title='" + vr.bedname + "'><div class='custom-control custom-checkbox' style='margin-top: -1px;'><input type='checkbox' class='custom-control-input' id='sel-" + vr.bedid + "' onchange='select_bed2(\""+ vr.bedname +"\",\""+ vr.bedid +"\")'><label class='custom-control-label' for='sel-" + vr.bedid + "'></label></div>" + vr.bedname + "</td>";
                    // vrcode
                    html += "<td title='uploaded "+ vr.utime +"'>" + vr.vrcode + "<a class='text-secondary pl-1' onclick='copy_to_clipboard(\"" + vr.vrcode + "\")'><i class='far fa-copy'></i></a></td>";
                    // menu
                    html += "<td style='text-align:right;'><a class='text-secondary pr-1' onclick='edit_permissions(\"" + vr.bedname + "\",\""+ vr.bedid +"\",\"" + vr.vrcode + "\")'><i class='fas fa-user-plus'></i></a>";
                    html += "<a class='text-secondary pr-2' onclick='del_bed_by_cmd(\"" + vr.bedname + "\",\"" + vr.bedid + "\",\"" + vr.vrcode + "\")' title='Delete Bed'><i class='far fa-trash-alt' style='width:10.5px'></i></a></td></tr>";
                    var display_info = $("#toggle-info").hasClass("btn-light")? "d-none ":"";
                    vr.group = vr.group.replace(/\s/g, '');
                    if(vr.info){
                        vrinfo = vr.info.trim().replaceAll("\n\n", "<br>");
                        html += "<tr class='info " + display_info + (vr.group==""?"Unspecified":vr.group) + "'>";
                        html += "<td colspan=3 style='text-align:left;'>&emsp;&emsp;<div class='d-inline-block align-top mr-1'><font color='#DAA2DC' style='font-weight:bold'>INFO</font> ";
                        html += "<a class='text-secondary pl-1' onclick='copy_to_clipboard(" + JSON.stringify(vr.info.trim()) + ")'><i class='far fa-copy'></i></a></div>";
                        html += "<div class='d-inline-block'>" + vrinfo + "</div></td>";
                    }
                    var viewers = result.viewers[vr.bedid];
                    if(viewers){
                        for(var mode in viewers){
                            html += "<tr class='info " + display_info + (vr.group==""?"Unspecified":vr.group) + "'>";
                            html += "<td colspan=3 style='text-align:left;'>";
                            html += "<div class='ml-4'>";
                            var smode = mode.replace("V", "<font color='#66ff66' style='font-weight:bold'>V</font>")
                                    .replace("D", "<font color='#fcba03' style='font-weight:bold'>D</font>")
                                    .replace("M", "<font color='#9999ff' style='font-weight:bold'>M</font>");
                            html += smode + " " + viewers[mode].join(", ") + "<br>";
                            html += "</div></td>";
                        }
                    }
                    var devices = vr.devs;
                    if(devices && devices.length > 0){
                        html += "<tr class='info " + display_info + (vr.group==""?"Unspecified":vr.group) + "'>";
                        html += "<td colspan=3 style='text-align:left;'>&emsp;&emsp;<font color='#00ffff' style='font-weight:bold'>D</font> ";
                        html += devices.join(", ") + "</td>";
                    }
                    var filters = vr.filts;
                    if(filters && filters.length > 0){
                        html += "<tr class='info " + display_info + (vr.group==""?"Unspecified":vr.group) + "'>";
                        html += "<td colspan=3 style='text-align:left;'>&emsp;&emsp;<font color='#ff00ff' style='font-weight:bold'>F</font> ";
                        html += filters.join(", ") + "</td>";
                    }
                }
            }
            if(result.unnamed !== undefined){
                for(var i in result.unnamed){
                    var vr = result.unnamed[i];
                    if(vr.group == "") is_unspecified = true;
                    html += "<tr id='" + vr.vrcode + "' class='" + (vr.group == ""?((vr.group=="" || vr.group === undefined)?"Unspecified":vr.group):vr.group) + " Unnamed" + is_dark + "'>";
                    html += "<td style='text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'>Unnamed</td>";
                    html += "<td title='uploaded "+ vr.utime +"'>" + vr.vrcode + "<a class='text-secondary pl-1' onclick='copy_to_clipboard(\"" + vr.vrcode + "\")'><i class='far fa-copy'></i></a></td>";
                    html += "<td style='text-align:right'>";
                    html += "<a class='pr-2 text-secondary' onclick='delete_vr(\"" + vr.vrcode + "\")' title='Unregister VR'><i class='far fa-trash-alt'></i></a></td></tr>";
                }
            }

            $("#vrs").html(html);
            if(sort) orders[order_by] = sort;

            if(change_order) {
                if(orders[order_by] == "SORT_ASC") orders[order_by] = "SORT_DESC";
                else orders[order_by] = "SORT_ASC";
            }
            curr_order = order_by;
            $("#groupfilter").val(curr_group).change();

            if(!is_unspecified) $("#groupfilter option[value='Unspecified']").remove();
            if(result.unnamed === undefined || result.unnamed.length <= 0) $("#groupfilter option[value='Unnamed']").remove();
        }
    });
}

/**
 * "Add VR Code", "Change Group" Modal에서 새로운 그룹추가 옵션을 선택했을 때
 * 새로운 그룹 이름을 입력하는 input 나타냄
 *
 * @param {Element} option
 * @param {String} id
 */
 function add_newgroup(option, id){
    var inp = $("#" + id);
    if(option.value === "add") inp.removeClass("d-none");
    else{
        if(!inp.hasClass("d-none")) inp.addClass("d-none");
    }
    if(id == "add-new-group") $("#move-btn").prop("disabled", false);
    if(id == "cg-add-group") $("#cg-move-btn").prop("disabled", false);
}

/**
 * "Edit Group" Modal display
 *
 * @param {String} groupname
 */
function edit_group(groupname){
    //groupname = groupname.replace(" ", "\\ ");
    $('#prev-groupname').val(groupname);
    $('#new-groupname').val(groupname);
    $('#edit-group').modal('show');
}

/**
 * "Change Group" Modal display
 */
 function change_group(){
    // 선택된 방 이름 리스트 "Change Group" Modal에 Display
    var list = selected_beds2.size > 0? [...selected_beds2]:[];
    var list_id = selected_bedids2.size > 0? [...selected_bedids2]:[];
    $("#selected-beds2").html(list.sort().join());
    $("#selected-bedids2").val(list_id.sort().join());
    $('#change-group').modal('show');
}

function move_bed(groupname, bedname, owner){
    if(groupname.length > 0) {
        $('select#cg-groupname option[value="' + groupname + '"]').prop('selected', true);
    }
    $("#cg-bedname").html(bedname);
    $("#cg-shared-bedname").val(bedname);
    $("#cg-shared-owner").val(owner);
    $('#cg-shared').modal('show');
}

function edit_permissions(bedname, bedid, vrcode){
    $("#p-bedname").html(bedname);
    $("#addp-bedname").val(bedname);
    $("#editp-bedname").val(bedname);
    $("#editp-vrcode").val(vrcode);
    $("#editp-bedid").val(bedid);
    $.ajax({
        url: mv_apiRoot + '/data.php',
        type: 'POST',
        dataType: 'json',
        responseType: 'text',
        data: {'job':'get_viewers', 'bedname': bedname, 'bedid': bedid},
        success: function(result) {
            var html = "";
            result.forEach(function(viewer){
                html += "<tr id='" + viewer.viewerid + "' style='height:39px'>";
                html += "<td>" + viewer.name + " <span class='text-secondary' style='font-size:12px;'>(" + viewer.viewerid + ")</span></td>";
                viewer.mode *= 1;
                // view
                html += "<td class='text-center'><input name='viewers[" + viewer.viewerid + "][permission][]' type='checkbox' style='margin-top:4px' onchange='toggle_editp(\"" + viewer.viewerid + "\", this)' " + ((viewer.mode & 1) == 1? "checked": "") + " value='1'></div></td>";
                // download
                html += "<td class='text-center'><input name='viewers[" + viewer.viewerid + "][permission][]' type='checkbox' style='margin-top:4px' onchange='toggle_editp(\"" + viewer.viewerid + "\", this)' " + ((viewer.mode & 2) == 2? "checked": "") + " value='2'></div></td>";
                // manage
                html += "<td class='text-center'><input name='viewers[" + viewer.viewerid + "][permission][]' type='checkbox' style='margin-top:4px' onchange='toggle_editp(\"" + viewer.viewerid + "\", this)' " + ((viewer.mode & 4) == 4? "checked": "") + " value='4'></div></td>";
                // own
                //html += "<td class='text-center'><input name='viewers[" + viewer.viewerid + "][permission][]' type='checkbox' style='margin-top:4px' onchange='toggle_editp(\"" + viewer.viewerid + "\", this)' value='0'></div></td>";
                html += "<td><a class='text-secondary' onclick='del_viewer(\"" + viewer.viewerid + "\",\"" + bedname + "\")'><i class='fa fa-times'></i></a><input type='hidden' id='d-" + viewer.viewerid + "' name='viewers[" + viewer.viewerid + "][delete]'></td></tr>";
            });
            html += "<tr style='height:39px'><td colspan=6 class='text-center text-primary hover-light' onclick='add_viewer_form()' style='cursor:pointer'><i class='fa fa-plus' aria-hidden='true'></i> Add User</td></tr>";
            viewers = result;
            $("#viewers").html(html);
            $("#reset-editp").attr("onclick", "reset_editp(\"" + bedname + "\")");
        }
    });
    $("#editp-alert").addClass("d-none");
    $("#editp-btns").removeClass("d-inline-block").addClass("d-none");
    $(".close-modal").show();
    $("#edit-permissions").modal("show");
}

/**
 * "Add Viewer" Modal display
 */
 function add_viewer(){
    // 선택된 방 이름 리스트 "Add Viewer" Modal에 Display
    $("#selected-beds").html([...selected_beds2].sort().join());
    $("#selected-bedids").val([...selected_bedids2].sort().join());
    $("#share-beds").modal("show");
}

function share_vr(bedname){
    $("#selected-beds").html(bedname);
    $("#share-beds").modal("show");
}

function del_viewer(viewerid){
    $("#editp-alert").removeClass("d-none");
    $("#editp-btns").removeClass("d-none").addClass("d-inline-block");
    $(".close-modal").hide();
    var inp = "del";
    if(confirm("Do you want to delete all permissions granted to " + viewerid + "?")){
        inp += "-all";
    }
    $("#d-" + viewerid).val(inp);
    $("#" + viewerid).css({
        color:"#868e96",
        cursor:"not-allowed"
    }).find("select").prop("disabled", true);
    $("#" + viewerid).find("a").hide();
}

function add_viewer_form(){
    var add_id = $("#edit-permission").find(".add-viewer").length;
    var html = "";
    html += "<tr class='add-viewer' id='add-viewer-" + add_id + "' style='height:39px'>";
    html += "<td><input type='text' class='form-control' name='viewer_" + add_id + "' placeholder='User ID' style='font-size:12px;' required></td>";
    // view
    html += "<td class='text-center'><input name='new_viewers[" + add_id + "][permission][]' id='m-view-" + add_id + "' type='checkbox' style='margin-top:4px' value='1'></div></td>";
    // download
    html += "<td class='text-center'><input name='new_viewers[" + add_id + "][permission][]' id='m-download-" + add_id + "' type='checkbox' style='margin-top:4px' value='2'></div></td>";
    // manage
    html += "<td class='text-center'><input name='new_viewers[" + add_id + "][permission][]' id='m-manage-" + add_id + "' onchange='auto_select(\"" + add_id + "\", this.value)' type='checkbox' style='margin-top:4px' value='4'></div></td>";
    // own
    //html += "<td class='text-center'><input name='new_viewers[" + add_id + "][permission][]' type='checkbox' style='margin-top:4px' value='0'></div></td>";
    html += "<td><a class='text-secondary' onclick='$(\"#add-viewer-" + add_id + "\").remove()'><i class='fa fa-times'></i></a></td></tr>";
    $("#viewers").find("tr:last").before(html);

    $("#editp-alert").removeClass("d-none");
    $("#editp-btns").removeClass("d-none").addClass("d-inline-block");
    $(".close-modal").hide();
}

function auto_select(add_id, val){
    if(val == "4") $("#m-view-" + add_id).prop("checked", true);
}

function toggle_editp(viewer, elem){
    var val = elem.value;
    if(val == "0"){
        if(confirm("You might lose the ability to change share settings. Are you sure you want to set " + viewer + " as a new owner?")){
            var bedname = $("#editp-bedname").val();
            var vrcode = $("#editp-vrcode").val();
            var post = {"job":"set_owner", "viewer":viewer, "bedname": bedname, "vrcode":vrcode};
            $.ajax({
                type: 'POST',
                url: mv_apiRoot + '/data.php',
                data: post,
                responseType: 'text',
                dataType: 'json',
                success: function(result){
                    location.reload();
                },
                error: function(xhr, status, error){
                    console.log('SET_OWNER', xhr);
                }
            });
        } else {
            $(elem).prop("checked", false);
        }
    } else {
        $("#editp-alert").removeClass("d-none");
        $("#editp-btns").removeClass("d-none").addClass("d-inline-block");
        $(".close-modal").hide();
    }
}

function reset_editp(bedname){
    event.preventDefault();
    var html = "";
    viewers.forEach(function(viewer){
        html += "<tr id='" + viewer.viewerid + "' style='height:39px'>";
        html += "<td>" + viewer.name + " <span class='text-secondary' style='font-size:12px;'>(" + viewer.viewerid + ")</span></td>";
        viewer.mode *= 1;
        // view
        html += "<td class='text-center'><input name='viewers[" + viewer.viewerid + "][permission][]' type='checkbox' style='margin-top:4px' onchange='toggle_editp(\"" + viewer.viewerid + "\", this)' " + ((viewer.mode & 1) == 1? "checked": "") + " value='1'></div></td>";
        // download
        html += "<td class='text-center'><input name='viewers[" + viewer.viewerid + "][permission][]' type='checkbox' style='margin-top:4px' onchange='toggle_editp(\"" + viewer.viewerid + "\", this)' " + ((viewer.mode & 2) == 2? "checked": "") + " value='2'></div></td>";
        // manage
        html += "<td class='text-center'><input name='viewers[" + viewer.viewerid + "][permission][]' type='checkbox' style='margin-top:4px' onchange='toggle_editp(\"" + viewer.viewerid + "\", this)' " + ((viewer.mode & 4) == 4? "checked": "") + " value='4'></div></td>";
        // own
        //html += "<td class='text-center'><input name='viewers[" + viewer.viewerid + "][permission][]' type='checkbox' style='margin-top:4px' onchange='toggle_editp(\"" + viewer.viewerid + "\", this)' value='0'></div></td>";
        html += "<td><a class='text-secondary' onclick='del_viewer(\"" + viewer.viewerid + "\",\"" + bedname + "\")'><i class='fa fa-times'></i></a><input type='hidden' id='d-" + viewer.viewerid + "' name='viewers[" + viewer.viewerid + "][delete]'></td></tr>";
    })
    $("#viewers").html(html);
    $("#editp-alert").addClass("d-none");
    $("#editp-btns").removeClass("d-inline-block").addClass("d-none");
    $(".close-modal").show();
}

function submit_form(form_id, modal_id){
    $("#" + form_id).submit();
    if(modal_id) $("#" + modal_id).modal('hide');
}

function filter_vrs(val){
    get_vrs_job = val;
    if(val == "get_myvrs"){
        $("#toggle-info").removeClass("d-none");
        $("#vr_menu").find("a").removeClass("d-none")
    }else{ // val == "shared"
        $("#toggle-info").addClass("d-none");
        $("#btn-edit-filt").addClass("d-none");
        $("#btn-share").addClass("d-none");
    }
    selected_beds2.clear();
    selected_bedids2.clear();
    edit_vrs(curr_order);
}

function filter_group(group){
    $("#sel-all-bed").prop("checked", false);
    group = group.replace(/\s/g, '');
    select_all2 = true;
    curr_group = group;
    if(group == "all"){
        $("#newvr").show();
        $("#vrs").find("tr").show();
        return;
    }
    $("#vrs").find("tr").hide();
    $("#newvr").show();
    $("." + $.escapeSelector(group)).show();
}

function select_bed2(bedname, bedid){
    if(selected_bedids2.has(bedid)){
        selected_beds2.delete(bedname);
        selected_bedids2.delete(bedid);
        $("#sel-all-bed").prop("checked", false);
        select_all2 = true;
	}else{
        selected_beds2.add(bedname);
        selected_bedids2.add(bedid);
    }
    toggle_btns()
}

function select_all_beds2(){
    if(select_all2){
		$(".bed:visible").each(function(){
            selected_beds2.add($(this).attr("bedname"));
            selected_bedids2.add($(this).attr("bedid"));
            $(this).find("input[type='checkbox']").prop("checked", true);
		});
    }else{
        selected_beds2.clear();
        selected_bedids2.clear();
        $("input[type='checkbox']").prop("checked", false);
    }
    select_all2 = !select_all2;
    toggle_btns()
}

/**
 * 해당 VR에서 룸삭제
 *
 * @param {String} bedname
 */
 function del_bed(bedid, bedname){
    event.preventDefault();
    var msg = 'Are you sure to delete bed ' + bedname + '?\nPlease be noted that the same bed will be added automatically if it has real time biosignals.';
    if(confirm(msg)){
  		var post = {job: "del_bed", bedid:bedid, bedname:bedname};
  		$.ajax({
          type: 'POST',
          url: mv_apiRoot + '/data.php',
          data: post,
          success: function(result, status, xhr) {
			   $("#" + bedid).remove();
               $("." + bedid).remove();
               $(".viewer-" + bedid).remove();
          },
          error: function(xhr, status, error) {
              console.log('DELETE_ROOM', status);
          }
      });
    }
}

/**
 * 선택된 VR(s) 웹모니터링에서 삭제
 */
 function del_beds(){
    event.preventDefault();
    var list = selected_beds2.size > 0? [...selected_beds2]:[];
    var list_id = selected_bedids2.size > 0? [...selected_bedids2]:[];
    var msg = 'Please type \"delete\" to make sure you want to delete the following: \n' + list.sort().join();
    if(prompt(msg) == "delete"){
        var post = {'job': 'del_beds'};
        if(get_vrs_job == "get_myvrs"){
          post['bednames'] = [...selected_beds2].join();
          post['bedids'] = [...selected_bedids2].join();

          bedSocket.emit('req_cmd', post);
        }else{
          post['bednames'] = [...selected_beds2].join();
          post['bedids'] = [...selected_bedids2].join();

          $.ajax({
              type: 'POST',
              url: mv_apiRoot + '/data.php',
              data: post,
              success: function(result, status, xhr) {
                 //location.reload();
                 //edit_vrs(curr_order);
                 for(var i in list_id){
                    $("#" + list_id[i]).remove();
                    $("." + list_id[i]).remove();
                    $(".viewer-" + list_id[i]).remove();
                 }
                 selected_beds2.clear();
                 selected_bedids2.clear();
                 toggle_btns();
              },
              error: function(xhr, status, error) {
                  console.log('DELETE_VR', status);
              }
          });
        }
    }
}

function del_bed_by_cmd(bedname, bedid, vrcode){
    event.preventDefault();
    var msg = 'Please type \"delete\" to make sure you want to delete bed ' + bedname + '. The bed will be deleted from VitalRecorder as long as it is online.';
    if(prompt(msg) == "delete"){
		var post = {job: "del_bed", vrcode:vrcode, bedid:bedid, bedname:bedname};

    bedSocket.emit('req_cmd', post);
        // $.ajax({
        //     type: 'POST',
        //     url: mv_apiRoot + '/cmd.php',
        //     data: post,
        //     success: function(result, status, xhr) {
        //         $("#" + bedid).remove();
        //         $("." + bedid).remove();
        //         $(".viewer-" + bedid).remove();
        //     },
        //     error: function(xhr, status, error) {
        //         console.log('DELETE_BED', status);
        //     }
        // });
    }
}

function toggle_btns(){
    if(selected_beds2.size > 0){
        $("#btn-edit-group").removeClass("disabled");
        $("#btn-del-vrs").removeClass("disabled");
        $("#btn-edit-filt").removeClass("disabled");
        $("#btn-share").removeClass("disabled");
    } else {
        $("#btn-edit-group").addClass("disabled");
        $("#btn-del-vrs").addClass("disabled");
        $("#btn-edit-filt").addClass("disabled");
        $("#btn-share").addClass("disabled");
    }
}

function add_newport(select){
    var port = select.value;
    if(port == "other"){
        $(select).parent().parent().find("input").prop("type", "text");
    } else{
        $(select).parent().parent().find("input").prop("type", "hidden");
    }
}

/**
 * Get selected device's default name
 *
 * @param {Element} form
 * @param {String} device_type
 */
 function get_device_name(form, device_type){
    var device = devices.find(dev => {
        return dev.type === device_type;
    });
    if(device !== undefined){
        $(form).find("input")[0].value = device.name;
    }
    var port = $(form).find("select")[1];
    var ycable = $(form).find("input")[2];
    if(device_type.toLowerCase() == "demo"){
        $(port).prop({required:false,disabled:true}).val("");
        $(ycable).prop({disabled:true});
    }else{
        $(port).prop({required:true,disabled:false});
        $(ycable).prop({disabled:false});
    }
}

/**
 * Settings Button onclick function
 *
 * @param {String} vrcode
 * @param {String} bedid
 * @param {String} bedname
 */
 function render_dev_settings_form(bedname, bedid, vrcode){
    event.stopPropagation();
    event.preventDefault();
    $("#dev-setting-title").html("Device Settings (" + bedname + ")");
    $("[name=dev-setting-vrcode]").val(vrcode);
    $("[name=dev-setting-bedid]").val(bedid);
    $("[name=dev-setting-bedname]").val(bedname);
    $.ajax({
        type: 'POST',
        url: '/vr_devs',
        data: {'bedid':bedid},
        dataType: 'json',
        success: function(result, status, xhr) {
            curr_devs = result;
            $(".dev-list").remove();
            //$(".filt-list").remove();
            if(result.length > 0){
                result.forEach(function(dev){
                    if(dev.port.indexOf("USB") > -1) dev.port = dev.port.substring(3);
                    add_device_form(dev.type, dev.name, dev.port, dev.ycable);
                });
            } else add_device_form();

            $("#dev-setting").modal("show");
        },
        error: function(xhr, status, error) {
            console.log('REQUEST_VR_DEV', status);
        }
    });
}

function set_filter(){
    $("#filt-selected-beds").html([...selected_beds2].sort().join());
    $("#filt-bed-list").removeClass("d-none");
    $("#filt-setting-title").html("Filter Settings");
    $("#filt-setting").modal("show");
}

/**
 * Settings Button onclick function
 *
 * @param {String} vrcode
 * @param {String} bedid
 * @param {String} bedname
 */
 function render_filt_settings_form(bedname, bedid, vrcode){
    event.stopPropagation();
    event.preventDefault();
    $("#filt-setting-title").html("Filter Settings (" + bedname + ")");
    $("[name=filt-setting-bedid]").val(bedid);
    $("[name=filt-setting-bedname]").val(bedname);
    $.ajax({
        type: 'POST',
        url: '/vr_filts',
        data: {'bedid':bedid},
        dataType: 'json',
        success: function(result, status, xhr) {
            if(result.length > 0){
                result.forEach(function(filt){
                    //add_filter_form(filt.modname, filt.name);
                    $(":checkbox[value='" + filt.modname + "']").prop("checked", true);
                });
            } //else add_filter_form();

            $("#filt-setting").modal("show");
        },
        error: function(xhr, status, error) {
            console.log('REQUEST_VR_FILT', status);
        }
    });
}

/**
 * Add device form
 */
 function add_device_form(type="", name="", port="", ycable=false){
    var form = $("#dev-list").find("tr");
    var device_id = form.length - 1;
    var new_form = $(form[0]).clone();
    $(new_form).prop("id", "device-form-" + device_id);
    $(new_form).removeClass("d-none").addClass("dev-list");
    var selects = $(new_form).find("select");
    $(selects).prop("required", true);
    $(selects[0]).attr("name", "devices[" + device_id + "][type]")
        .attr("onchange", "get_device_name($('#device-form-" + device_id + "'), $(this).val())")
        .val(type);
    var inputs = $(new_form).find("input");
    $(inputs).prop("required", true);
    $(inputs[0]).attr("name", "devices[" + device_id + "][name]").val(name);
    $(selects[1]).attr("name", "devices[" + device_id + "][port]");
    if(type.toLowerCase() == "demo"){
        $(selects[1]).prop({"required":false,"disabled":true});
    }
    $(inputs[1]).attr("name", "devices[" + device_id + "][port_other]");
    $(inputs[1]).prop("required", false);
    if(port.length > 0 && $("[name=device-port] option[value=" + port + "]").length > 0){
        $(selects[1]).val(port);
    }
    else if(port.length > 0 && $("[name=device-port] option[value=" + port + "]").length == 0){
        $(selects[1]).val("other");
        $(inputs[1]).prop({"type": "text"}).val(port);
    }
    ycable = ycable == "1"? true:false;
    $(inputs[2]).attr("name", "devices[" + device_id + "][ycable]")
        .prop({"checked":ycable, "required":false});
    if(ycable) $(inputs[2]).attr("value", "1");
    else $(inputs[2]).attr("value", "0");
    $($(new_form).find("td.dev-btns")[0]).append("<a onclick='del_device_form(\"device-form-" + device_id + "\")' style='color:red;vertical-align:-webkit-baseline-middle'><i class='fa fa-lg fa-times-circle'></i></a>");
    $("#dev-list").append(new_form);
    if(device_id >= devices.length) $(".add-device").css("display", "none");
}

/**
 * Delete a row of device forms from add device modal
 *
 * @param {String} id
 */
 function del_device_form(id){
    var type = $("select[name='devices[" + id.substr(12) + "][type]']").val();
    if(confirm("Are you sure you want to delete " + type + "?")){
        $("#"+id).remove();
        if($(".device-form").length <= 1) add_device_form();
    }
}

function add_event(bedname, bedid, vrcode){
    var room = wm_rooms[bedid];
    if(room.dtEnd + 60 < room.dtplayer){
        alert(bedname + " offline. Cannot add an event remotely.");
        return;
    }
    $("#add-event-title").html("Add Event (" + bedname + ")");
    $("#add-evt-dt").val(Math.floor(Date.now() / 1000));
    $("#add-evt-vrcode").val(vrcode);
    $("#add-event").modal("show");
}

function update_vr_preloader(vrcode){
    $("#wm-rooms").find("a.update-vr-" + vrcode).addClass("disabled");
    $("#wm-rooms").find("a.restart-vr-" + vrcode).addClass("disabled");
    $("#wm-rooms").find("a.reboot-vr-" + vrcode).addClass("disabled");
    $("#update-stat-" + vrcode).html("<small>Upgrading VR...<span class='spinner-border spinner-border-sm' role='status' aria-hidden='true' style='vertical-align:baseline'></span><span class='sr-only'>Loading...</span></small>");
}

function update_setInterval(vrcode){
    var post = {'job': "is_updated", 'vrcode':vrcode};
    var cnt_update_request = 0;
    var interval = setInterval(function() {
        $.ajax({
            type: 'POST',
            url: mv_apiRoot + '/cmd.php',
            dataType: 'json',
            responseType: 'text',
            data: post,
            success: function(result, status, xhr) {
                if(result.success){
                    setTimeout(function(){Cookies.remove("update-" + vrcode)});
                    clearInterval(interval);
                    $("#update-stat-" + vrcode).html("");
                }
                if(cnt_update_request > 8){
                    clearInterval(interval);
                    $("#update-stat-" + vrcode).html("");
                }
                cnt_update_request += 1;
            },error:function(xhr){console.log(xhr)}
        });
    }, 5000);
}

function update_vr(bedname, bedid, vrcode){
    if(confirm("Upgrade VR " + vrname + " remotely?")){
        var post = {'job':'update_vr','vrcode':vrcode};
        update_vr_preloader(vrcode, true);
        bedSocket.emit('req_cmd', post);
    }
}

function restart_vr_preloader(bedname, bedid, vrcode){
    $("#wm-rooms").find("a.update-vr-" + vrcode).addClass("disabled");
    $("#wm-rooms").find("a.restart-vr-" + vrcode).addClass("disabled");
    $("#wm-rooms").find("a.reboot-vr-" + vrcode).addClass("disabled");
    $("#update-stat-" + vrcode).html("<small>Restarting VR...<span class='spinner-border spinner-border-sm' role='status' aria-hidden='true' style='vertical-align:baseline'></span><span class='sr-only'>Loading...</span></small>");
}

function restart_setInterval(vrcode, bedid){
    var post = {'job': "is_restarted", 'vrcode':vrcode, 'bedid':bedid};
    var cnt_restart_request = 0;
    var interval = setInterval(function() {
        $.ajax({
            type: 'POST',
            url: mv_apiRoot + '/cmd.php',
            dataType: 'json',
            responseType: 'text',
            data: post,
            success: function(result, status, xhr) {
                if(result.success){
                    setTimeout(function(){Cookies.remove("restart-" + vrcode)});
                    clearInterval(interval);
                    $("#update-stat-" + vrcode).html("");
                }
                if(cnt_restart_request > 8){
                    clearInterval(interval);
                    $("#update-stat-" + vrcode).html("");
                }
                cnt_restart_request += 1;
            },error:function(xhr){console.log(xhr)}
        });
    }, 5000);
}

function restart_vr(vrcode, vrname){
    if(confirm("Restart VR " + vrname + " remotely?")){
        var post = {'job':'restart_vr','vrcode':vrcode};
        restart_vr_preloader(vrcode, true);
        bedSocket.emit('req_cmd', post);
    }
}

function reboot_vr_preloader(vrcode){
    $("#wm-rooms").find("a.update-vr-" + vrcode).addClass("disabled");
    $("#wm-rooms").find("a.restart-vr-" + vrcode).addClass("disabled");
    $("#wm-rooms").find("a.reboot-vr-" + vrcode).addClass("disabled");
    $("#update-stat-" + vrcode).html("<small>Rebooting...<span class='spinner-border spinner-border-sm' role='status' aria-hidden='true' style='vertical-align:baseline'></span><span class='sr-only'>Loading...</span></small>");
}

function reboot_setInterval(vrcode, bedid){
    var post = {'job': "is_rebooted", 'vrcode':vrcode, 'bedid':bedid};
    var cnt_reboot_request = 0;
    var interval = setInterval(function() {
        $.ajax({
            type: 'POST',
            url: mv_apiRoot + '/cmd.php',
            dataType: 'json',
            responseType: 'text',
            data: post,
            success: function(result, status, xhr) {
                if(result.success){
                    setTimeout(function(){Cookies.remove("reboot-" + vrcode)});
                    clearInterval(interval);
                    $("#update-stat-" + vrcode).html("");
                }
                if(cnt_reboot_request > 8){
                    clearInterval(interval);
                    $("#update-stat-" + vrcode).html("");
                }
                cnt_reboot_request += 1;
            },error:function(xhr){console.log(xhr)}
        });
    }, 5000);
}

function reboot_vr(vrcode, vrname){
    if(confirm("Reboot VR " + vrname + " remotely?")){
        var post = {'job':'reboot_vr','vrcode':vrcode};
        reboot_vr_preloader(vrcode, true);
        bedSocket.emit('req_cmd', post);
    }
}

function toggle_add_viewer(){
    if($("#m-view").is(":checked") || $("#m-download").is(":checked") || $("#m-manage").is(":checked"))
        $("#add-viewer").removeClass("d-none");
    else{
        $("#viewerid").val("");
        $("#add-viewer").addClass("d-none");
    }

    if($("#m-manage").is(":checked")) $("#m-view").attr("checked", true);
}


// Author:  Jacek Becela
// Source:  http://gist.github.com/399624
// License: MIT

jQuery.fn.single_double_click = function(single_click_callback, double_click_callback, timeout) {
    return this.each(function(){
      var clicks = 0, self = this;
      jQuery(this).click(function(event){
        clicks++;
        if (clicks == 1) {
          setTimeout(function(){
            if(clicks == 1) {
              single_click_callback.call(self, event);
            } else {
              double_click_callback.call(self, event);
            }
            clicks = 0;
          }, timeout || 300);
        }
      });
    });
}
$(document).ready(function(e) {
    $('#share-beds').on('shown.bs.modal', function () {
        $('#viewerid').trigger('focus');
    });

    $('#edit-group').on('shown.bs.modal', function () {
        $('#new-groupname').trigger('focus');
    });

    $('#add-event').on('shown.bs.modal', function () {
        $('#evt').trigger('focus');
    });

    $("#add-evt").on('submit', function(e){
        e.preventDefault();
        var dt = $("#add-evt-dt").val();
        var vrcode = $("#add-evt-vrcode").val();
        var evt = $("#evt").val();
        var post = {'job':'add_evt', 'vrcode': vrcode, 'dt':dt, 'msg':evt};
        bedSocket.emit('req_cmd', post);

        $("#add-evt").trigger("reset");
        $("#add-event").modal("hide");
    });

    $('#form-dev-setting').on('submit', function(e){
        e.preventDefault();
        $("#dev-setting").modal("hide");
        var input = $(this).serializeArray();
        var new_devs = {};
        $.each(input, function(i, field){
            if(field.name.indexOf("devices") > -1){
                var i = parseInt(field.name.substr(8));
                var name = "";
                if(field.name.indexOf("name") > -1) name = "name";
                if(field.name.indexOf("type") > -1) name = "type";
                if(field.name.indexOf("ycable") > -1) name = "ycable";
                if(field.name.indexOf("port")  > -1 || field.name.indexOf("port_other") > -1){
                    if(field.value == "") return;
                    name = "port";
                }
                if(!(i in new_devs)) new_devs[i] = {};
                new_devs[i][name] = field.value;
            }
        });
        var is_diff = false;
        if(curr_devs.length != Object.keys(new_devs).length) is_diff = true;
        else {
            for(var i in curr_devs){
                var dev = curr_devs[i];
                var match = false;
                for(var i in new_devs){
                    var dcmp = new_devs[i];
                    if(dcmp.name == dev.name){
                        match = true;
                        if(dcmp.ycable === undefined) dcmp.ycable = "0";
                        else dcmp.ycable = "1";
                        for(var v in dcmp){
                            if(dcmp[v] != dev[v]){
                                is_diff = true;
                                break;
                            }
                        }
                        break;
                    }
                }
                if(!match){
                    is_diff = true;
                    break;
                }
            }
        }

        if(is_diff){
            var post = $(this).serialize();
            bedSocket.emit('req_cmd', post);
        }
    });

    $('#form-filt-setting').on('submit', function(e){
        e.preventDefault();
        $("#filt-setting").modal("hide");
        if($("input[name='filt-setting-bedid']").val().length > 0){
            bedSocket.emit('req_cmd', $(this).serialize());
        } else {
            var filters = [];
            $("input:checkbox[name='filters[]']:checked").each(function(){
                filters.push($(this).val());
            });

            var post = {'job':'edit_filts', 'bednames': $("#filt-selected-beds").html(), 'filters':filters.join()};
            bedSocket.emit('req_cmd', post);

            // $.ajax({
            //     url: mv_apiRoot + '/cmd.php',
            //     type: 'POST',
            //     dataType: 'json',
            //     responseType: 'text',
            //     data: {'job':'edit_filts', 'bednames': $("#filt-selected-beds").html(), 'filters':filters.join()},
            //     success: function(result) {
            //         console.log(result);
            //         $("#filt-selected-beds").html("");
            //         $("#filt-bed-list").addClass("d-none");
            //         $("#form-filt-setting").trigger("reset");
            //         if($("#add-vr-side-tab").hasClass("show-tab")) edit_vrs(curr_order);
            //         selected_beds2.clear();
            //     },
            //     error: function(xhr, status, error) {
            //         console.log('VR_SETTING', status);
            //     }
            // });
        }
    });

    $('#share-view').on('submit', function(e){
        e.preventDefault();
        var mode = 0;
        if($("#m-view").is(":checked")) mode += 1;
        if($("#m-download").is(":checked")) mode += 2;
        if($("#m-manage").is(":checked")) mode += 4;
        var post = {'job':'share','mode':mode,'bednames':$("#selected-beds").html(),'bedids':$("#selected-bedids").val()};
        post.viewers = $('#viewerid').val().replace(/ /g,'');
        if(post.viewers.length > 0){
            $.ajax({
                url: mv_apiRoot + '/data.php',
                type: 'POST',
                dataType: 'json',
                responseType: 'text',
                data: post,
                success: function(result) {
                    if(result.msg) alert(result.msg);
                    if($("#add-vr-side-tab").hasClass("show-tab")){
                        edit_vrs(curr_order);
                        $("#share-beds").removeClass("show");
                        $("#share-view").trigger("reset");
                        $("#add-viewer").addClass("d-none");
                        selected_beds2.clear();
                        selected_bedids2.clear();
                    } else location.reload();
                },
                error: function(xhr, status, error) {
                    console.log('SHARE_VIEW', status);
                }
            });
        }
    });

    $("#add-grp").on('submit', function(e){
        e.preventDefault();
        var groupname = $("#grpname").val();
        $.ajax({
            url: mv_apiRoot + '/data.php',
            type: 'POST',
            dataType: 'json',	
            responseType: 'text',	
            data: {'job':'add_group', 'groupname': groupname},
            success: function(result) {
                location.reload();
            },
            error: function(xhr, status, error) {
                console.log('ADD_GROUP', status);
            }
        });
    });
    
    $('#group-edit').on('submit', function(e){
        e.preventDefault();
        var groupname = $("#prev-groupname").val();
        var new_groupname = $("#new-groupname").val();
        $.ajax({
            url: mv_apiRoot + '/data.php',
            type: 'POST',
            dataType: 'json',
            responseType: 'text',
            data: {'job':'edit_group', 'groupname': groupname, 'new_name':new_groupname},
            success: function(result) {
                location.reload();
            },
            error: function(xhr, status, error) {
                console.log('EDIT_GROUP', status);
            }
        });
    });

    $('#move-vrs').on('submit', function(e){
        e.preventDefault();
        var post = {'job': "move_vrs", 'bednames':$("#selected-beds2").html(), 'bedids':$("#selected-bedids2").val()};
        var groupname = ($("#group-name").val()).trim();
        var new_groupname = "";
        if(!$("#add-new-group").hasClass("d-none")){
            new_groupname = ($("#new-group-name").val()).trim();
            groupname = new_groupname;
        }
        post['groupname'] = groupname;
        $.ajax({
            type: 'POST',
            url: mv_apiRoot + '/data.php',
            dataType: 'json',
            responseType: 'text',
            data: post,
            success: function(result) {
                $("#change-group").modal("hide");
                $("#move-vrs").trigger("reset");
                edit_vrs(curr_order);
                selected_beds2.clear();
                selected_bedids2.clear();
                toggle_btns();
            },
            error: function(xhr, status, error) {
                console.log('MOVE_VRS', status);
            }
        });
    });

    $('#cg-shared-vr').on('submit', function(e){
        e.preventDefault();
        var post = {'job': "move_bed"};
        post["bedname"] = $("#cg-shared-bedname").val();
        post["owner"] = $("#cg-shared-owner").val();
        var groupname = $("#cg-groupname").val();
        var new_groupname = "";
        if(!$("#cg-add-group").hasClass("d-none")){
            new_groupname = ($("#cg-new-group").val()).trim();
            groupname = new_groupname;
        }
        post['groupname'] = groupname;
        $.ajax({
            type: 'POST',
            url: mv_apiRoot + '/data.php',
            dataType: 'json',
            responseType: 'text',
            data: post,
            success: function(result) {
                location.reload();
            },
            error: function(xhr, status, error) {
                console.log('MOVE_VRS', status);
            }
        });
    });

    $('#edit-permission').on('submit', function(e){
        e.preventDefault()
        //console.log($(this).serializeArray());
        var bedname = $("#editp-bedname").val();
        $.ajax({
            type: 'POST',
            url: mv_apiRoot + '/data.php',
            data: $(this).serialize(),
            responseType: 'text',
            dataType: 'json',
            success: function(result){
                viewers = result;
                reset_editp(bedname);
                if($("#add-vr-side-tab").hasClass("show-tab")) edit_vrs(curr_order);
            },
            error: function(xhr, status, error){
                console.log('DEL_VIEW', xhr);
            }
        });
    });

    $('#log-vr-btn').on('click', function(e){
        e.preventDefault();
        //console.log($(this).serializeArray());
    		var post = {job: "log_data"};
        bedSocket.emit('req_cmd', post);
    });

    $('#del-vr-btn').on('click', function(e){
        e.preventDefault();
        //console.log($(this).serializeArray());
    		var post = {job: "del_data"};
        bedSocket.emit('req_cmd', post);
    });

    if(admin_yn == "N"){
      get_vrs_job = "get_sharedvrs";
      $('#vrfilter option:eq(1)').attr('selected', 'selected');
    }

});
