const crypto = require('crypto');

// Local date helpers to avoid ESM/CommonJS interop issues with date-fns
function getYear(date){
  return date.getFullYear().toString();
}

function getWeekNumber(d) {
  // ISO week number calculation
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return weekNo.toString();
}

module.exports = {
  get_config : get_config,
  set_config : set_config,
  set_user : set_user,
  set_password : set_password,
  get_websocket_host : get_websocket_host,
  login : login,
  register_bed : register_bed,
  get_vr_cnt : get_vr_cnt,
  get_share_info : get_share_info,
  get_bed_list : get_bed_list,
  get_user_list : get_user_list,
  del_bed : del_bed,
  get_data : get_data,
  get_folder : get_folder,
  make_lotto : make_lotto,
  get_lotto : get_lotto,
  get_lotto_week : get_lotto_week,
  del_all_vr_data : del_all_vr_data,
  log_all_vr_data : log_all_vr_data
};

async function get_config(){
  var result = new Object();
  result.websocket_ip = await clientSession.get('websocket_ip');
  result.websocket_port = await clientSession.get('websocket_port');
  result.filter_url = await clientSession.get('filter_url');
  result.vr_version = await clientSession.get('vr_version');
  return result;
}

function set_config(data){
  var result = false;
  try{
    if(data.websocketIp != undefined) clientSession.set('websocket_ip', data.websocketIp);
    if(data.websocketPort != undefined) clientSession.set("websocket_port", data.websocketPort);
    if(data.filterUrl != undefined) clientSession.set("filter_url", data.filterUrl);

    result = true;
  }catch(err){
    console.log("set_config ERROR", err);
  }
  return result;
}

async function set_user(data, typ){
  var result = new Object();
  try{
    if(typ == "add"){
      var dup_yn = false;
      var user = await clientSession.sMembers('user');
      for(var idx in user){
        if(data.userId == user[idx]){
          dup_yn = true;
          break;
        }
      }
      if(dup_yn){
        result.result = false;
        result.msg = "User ID is duplicated.";
      }else{
        var user = new Object();
        user.id = data.userId;
        user.password = data.userId;
        user.name = data.userName;
        user.profile = data.userProfile;
        user.email = data.userEmail;
        user.admin_yn = "N";

        client.sadd('user', user.id);
        client.set('user_' + data.userId, JSON.stringify(user));

        result.result = true;
        result.msg = "success";
      }
    }else if(typ == "del"){
      for(var idx in data){
        client.expire('user_' + data[idx].id, 0);
        client.srem('user', data[idx].id);
      }

      result.result = true;
      result.msg = "success";
    }else{ //typ == "upd"
      var user = JSON.parse(await clientSession.get('user_' + data.userId));

      if(user){
        if(user.password == data.cur_password){
          user.name = data.userName;
          user.email = data.userEmail;
          user.profile = data.userProfile;

          client.set('user_' + data.userId, JSON.stringify(user));

          result.result = true;
          result.msg = "Your information has been changed.";
        }else{
          result.result = false;
          result.msg = "Password is wrong.";
        }
      }else{
        result.result = false;
        result.msg = "Error";
      }
    }
  }catch(err){
    result.result = false;
    result.msg = "Error";
    console.log("set_user ERROR", err);
  }
  return result;
}

async function set_password(data){
  var result = new Object();
  try{
    var user = JSON.parse(await clientSession.get('user_' + data.id));

    if(user){
      if(user.password == data.mb_password){
        user.password = data.new_password;

        client.set('user_' + data.id, JSON.stringify(user));

        result.result = true;
        result.msg = "Your Password has been changed.";
      }else{
        result.result = false;
        result.msg = "Password is wrong.";
      }
    }else{
      result.result = false;
      result.msg = "Error";
    }
  }catch(err){
    result.result = false;
    result.msg = "Error";
    console.log("set_password ERROR", err);
  }
  return result;
}

async function get_websocket_host(){
  var websocket_host = await clientSession.get('websocket_ip');
  var websocket_port = await clientSession.get('websocket_port');

  if(websocket_port){
    websocket_host += ":" + websocket_port;
  }
  return "http://" + websocket_host;
}

async function get_admin_id(){
  var user = await clientSession.sMembers('user');
  var admin_id = "";
  for(var idx in user){
    var userinfo = JSON.parse(await clientSession.get('user_' + user[idx]));
    if(userinfo.admin_yn == "Y"){
      admin_id = userinfo.id;
    }
  }

  return admin_id;
}

async function login(id, password){
  var userinfo = JSON.parse(await clientSession.get('user_' + id));
  if(userinfo){
    if(password == userinfo.password){
      userinfo.result = true;
      userinfo.msg = id + " : success";
    }else{
      userinfo.result = false;
      userinfo.msg = id + " : wrong password";
    }
  }else{
    userinfo = new Object();
    userinfo.result = false;
    userinfo.msg = id + " : no user";
  }

  return userinfo;
}

async function register_bed(vrcode, rooms){
  var id = "";
  try{
    var defaultgroup = "";
    id = await get_admin_id();
    var vrinfo = JSON.parse(await clientSession.get(vrcode));
    if(vrinfo){
      defaultgroup = vrinfo.defaultgroup;
      id = vrinfo.userid;
    }else{
      var vrcode_data = new Object();
      vrcode_data.vrcode = vrcode;
      vrcode_data.defaultgroup = defaultgroup;
      vrcode_data.userid = id;
      client.set(vrcode, JSON.stringify(vrcode_data));
      client.sadd("vr_list", vrcode);
    }

    for(var idx in rooms){
      if(rooms[idx].roomname){
        var sha = crypto.createHash('sha1');
        sha.update(vrcode + '/' + rooms[idx].roomname);
        var bedid = sha.digest('hex');
  
        var bedidInfo = new Object();
        bedidInfo.bedid = bedid;
        bedidInfo.vrcode = vrcode;
        bedidInfo.bedname = rooms[idx].roomname;
        
        client.sadd("bed_" + vrcode, bedid);
        client.set(bedid, JSON.stringify(bedidInfo));
        
        var share_list = await clientSession.sMembers("share_" + id);
        var dup_chk = true;
        if(share_list){
          for(var idx2 in share_list){
            var share = JSON.parse(share_list[idx2]);
            if(vrcode == share.vrcode && rooms[idx].roomname == share.bedname && id == share.userid){
              dup_chk = false;
            }
          }
        }
  
        if(dup_chk){
          var share = new Object();
          share.viewerid = id;
          share.mode = 0;
          share.userid = id;
          share.bedname = rooms[idx].roomname;
          share.vrcode = vrcode;
          share.group = defaultgroup;
          share.bedid = bedid;
  
          client.sadd("share_" + id, JSON.stringify(share));
        }
      }
    }
  }catch(err){
    console.log("register_bed ERROR", err);
  }
  return id;
}

async function get_vr_cnt(id){
  var vr_list = await clientSession.sMembers("vr_list");
  var vr_cnt = 0;
  for(var idx in vr_list){
    var vrcode = vr_list[idx];
    var vrinfo = JSON.parse(await clientSession.get(vrcode));

    if(vrinfo){
      if(id == vrinfo.userid){
        vr_cnt++;
      }
    }
  }

  return vr_cnt;
}

async function get_share_info(id){
  var share_info = new Object();
  var share_list = new Array();
  var bed_list = await clientSession.sMembers("share_" + id);

  for(var idx in bed_list){
    var bed = JSON.parse(bed_list[idx]);

    share_list.push(bed);
  }
  
  var group_list = await clientSession.sMembers("group_" + id);

  share_info.rooms = share_list;
  share_info.groups = group_list.sort();

  return share_info;
}

async function get_bed_list(userInfo){
  var result = new Object();
  var bed_list = new Array();
  var unnamed_list = new Array();

  var id = "";

  var vr_list = await clientSession.sMembers("vr_list");
  for(var idx in vr_list){
    var vrcode = vr_list[idx];

    var vrinfo = JSON.parse(await clientSession.get(vrcode));
    if(vrinfo){
      if(userInfo){
        //get my vr
        id = userInfo.id;
      }else{
        // all vr
        id = vrinfo.userid;
      }

      if(id == vrinfo.userid){
        var vr_bed_list = await clientSession.sMembers("bed_" + vrcode);
        for(var idx2 in vr_bed_list){
          var bedid = vr_bed_list[idx2];
          
          var bedInfo = JSON.parse(await clientSession.get(bedid));

          bedInfo.group = "";
          
          var share_list = await clientSession.sMembers("share_" + id);
          for(var idx3 in share_list){
            var share = JSON.parse(share_list[idx3]);
            if(id == share.viewerid && bedid == share.bedid){
              bedInfo.group = share.group ? share.group : "";
              break;
            }
          }

          if(bedInfo.bedname){
            bed_list.push(bedInfo);
          }else{
            if(userInfo){
              unnamed_list.push(bedInfo);
            }else{
              bed_list.push(bedInfo);
            }
          }
        }
      }
    }
  }

  result.vrs = bed_list.sort(generateSortFn([{name: 'group'}, {name: 'vrcode'}, {name: 'bedname'}]));
  
  if(userInfo){
    result.unnamed = unnamed_list.sort(generateSortFn([{name: 'group'}, {name: 'vrcode'}, {name: 'bedname'}]));

    var group_list = await clientSession.sMembers("group_" + userInfo.id);
    result.groups = group_list.sort();
  }

  return result;
}

async function get_user_list(){
  var user = await clientSession.sMembers('user');
  var user_list = new Array();
  for(var idx in user){
    var userinfo = JSON.parse(await clientSession.get('user_' + user[idx]));
    user_list.push(userinfo);
  }

  return user_list;
}

async function del_bed(data){
  var vrcode = data.vrcode;
  var bedid = data.bedid;

  var vrinfo = JSON.parse(await clientSession.get(vrcode));

  if(vrinfo){
    client.srem("bed_" + vrcode, bedid);

    var owner_list = await clientSession.sMembers("share_" + vrinfo.userid);

    for(var idx in owner_list){
      var share = JSON.parse(owner_list[idx]);
      if(bedid == share.bedid && vrinfo.userid == share.userid){
        client.srem("share_" + vrinfo.userid, owner_list[idx]);
      }
    }

    var vr_bed_list = await clientSession.sMembers("bed_" + vrcode);
    if(vr_bed_list.length == 0){
      client.expire("bed_" + vrcode, 0);
      client.expire(vrcode, 0);
      client.srem("vr_list", vrcode);
    }
  }
}

async function get_data(req){
  var body = JSON.parse(JSON.stringify(req.body));
  var result;

  switch(body.job){
    case 'get_myvrs' :
      result = await get_bed_list(req.session.userInfo);

      result.viewers = new Object();
      break;

    case 'get_viewers' :
      result = await get_viewers(body);
      break;

    case 'get_sharedvrs' :
      result = await get_sharedvrs(req.session.userInfo);
      break;

    case 'edit_permission' :
      result = await edit_permission(req.session.userInfo, body);
      break;

    case 'set_owner' :
      result = await set_owner(req.session.userInfo, body);
      break;

    case 'del_bed' :
      result = await del_share_bed(req.session.userInfo, body);
      break;

    case 'del_beds' :
      result = await del_share_beds(req.session.userInfo, body);
      break;

    case 'move_vrs' :
      result = await move_vrs(req.session.userInfo, body);
      break;

    case 'share' :
      result = await share_beds(req.session.userInfo, body);
      break;

    case 'add_group' :
      result = await add_group(req.session.userInfo, body);
      break;



  }
  return result;
}

async function get_folder(userInfo, file_folder){
  // var files = dirTree(file_folder);
  // var my_files = new Array();

  // if(userInfo.admin_yn == "Y"){
  //   my_files = files.children;
  //   for(var idx in files.children){
  //     var vrcode_folder = files.children[idx];
  //     for(var idx2 in vrcode_folder.children){
  //       files.children[idx].children[idx2].mode = 2;
  //     }
  //     files.children[idx].mode = 2;
  //   }
  // }else{
  //   for(var idx in files.children){
  //     var vrcode_folder = files.children[idx];
  //     var vrcode = vrcode_folder.name;
  //     var bed_list = await clientSession.sMembers("bed_" + vrcode);
      
  //     for(var idx2 in vrcode_folder.children){
  //       var bedname_folder = vrcode_folder.children[idx2];
  //       var bedname = bedname_folder.name;

  //       for(var idx3 in bed_list){
  //         var bedInfo = JSON.parse(await clientSession.get(bed_list[idx3]));

  //         if(bedInfo){
  //           if(bedname == bedInfo.bedname){
  //             var share_list = await clientSession.sMembers("sharebed_" + bedInfo.bedid);
              
  //             for(var idx4 in share_list){
  //               var share = JSON.parse(share_list[idx4]);
                
  //               if(userInfo.id == share.viewerid){
  //                 files.children[idx].children[idx2].mode = share.mode;
  //                 files.children[idx].mode = share.mode;
  //                 break;
  //               }
  //             }
  //           }
  //         }
  //       }
  //     }
  //   }
  // }

  return files.children;
}

async function del_all_vr_data(){
  var vr_list = await clientSession.sMembers("vr_list");
  var vr_cnt = 0;
  for(var idx in vr_list){
    var vrcode = vr_list[idx];
    var vrinfo = JSON.parse(await clientSession.get(vrcode));

    if(vrinfo){
      var vr_bed_list = await clientSession.sMembers("bed_" + vrcode);
      for(var idx2 in vr_bed_list){
        var bedid = vr_bed_list[idx2];
        
        var share_list = await clientSession.sMembers("sharebed_" + bedid);
        client.expire("sharebed_" + bedid, 0);
        client.expire(bedid, 0);
      }
      client.expire(vrcode, 0);
    }
  }
  client.expire("vr_list", 0);

  var user = await clientSession.sMembers('user');
  for(var idx in user){
    client.expire("group_" + user[idx], 0);
    client.expire("share_" + user[idx], 0);
  }
}

async function log_all_vr_data(){
  var vr_list = await clientSession.sMembers("vr_list");
  console.log("vr_list : " + vr_list);
  for(var idx in vr_list){
    var vrcode = vr_list[idx];
    var vrinfo = JSON.parse(await clientSession.get(vrcode));

    if(vrinfo){
      console.log(vrcode + " : " + JSON.stringify(vrinfo));

      var vr_bed_list = await clientSession.sMembers("bed_" + vrcode);
      console.log("bed_" + vrcode + " : " + vr_bed_list);
      for(var idx2 in vr_bed_list){
        var bedid = vr_bed_list[idx2];

        var bedinfo = await clientSession.get(bedid);

        console.log(bedid + " : " + bedinfo);

        var share_list = await clientSession.sMembers("sharebed_" + bedid);

        console.log("sharebed_" + bedid + " : " + share_list);
      }
    }
  }

  var user = await clientSession.sMembers('user');
  for(var idx in user){
    var group_list = await clientSession.sMembers("group_" + user[idx]);
    if(group_list.length > 0){
      console.log("group_list_" + user[idx] + " : " + group_list);
    }
    
    var share_list = await clientSession.sMembers("share_" + user[idx]);

    if(share_list.length > 0){
      console.log("share_" + user[idx] + " : " + share_list);
    }
  }
}

function generateSortFn(props) {
  return function (a, b) {
      for (var i = 0; i < props.length; i++) {
          var prop = props[i];
          var name = prop.name;
          var reverse = prop.reverse;
          if (a[name] < b[name])
              return reverse ? 1 : -1;
          if (a[name] > b[name])
              return reverse ? -1 : 1;
      }
      return 0;
  };
};

async function get_viewers(body){
  var rsltVal = new Array();
  var bedid = body.bedid;
  var share_list = await clientSession.sMembers("sharebed_" + bedid);

  for(var idx in share_list){
    var share = JSON.parse(share_list[idx]);
    var user = JSON.parse(await clientSession.get('user_' + share.viewerid));
    share.name = user.name;

    rsltVal.push(share);
  }

  return rsltVal;
}

async function get_sharedvrs(userInfo){
  var result = new Object();

  var bed_list = await clientSession.sMembers("share_" + userInfo.id);
  var share_list = new Array();
  
  for(var idx in bed_list){
    var bed = JSON.parse(bed_list[idx]);
    if(bed.mode > 0){
      share_list.push(bed);
    }
  }

  var group_list = await clientSession.sMembers("group_" + userInfo.id);
  
  result.vrs = share_list.sort(generateSortFn([{name: 'group'}, {name: 'vrcode'}, {name: 'bedname'}]));;
  result.groups = group_list.sort();

  return result;
}

async function edit_permission(userInfo, body){
  var vrcode = body.vrcode;
  var bedname = body.bedname;
  var bedid = body.bedid;
  var viewers = body.viewers;
  var new_viewers = body.new_viewers;

  var vrinfo = JSON.parse(await clientSession.get(vrcode));
  if(vrinfo){
    if(userInfo.id == vrinfo.userid){
      for(var id in viewers){
        var share_list = await clientSession.sMembers("share_" + id);
        var groupname = "";

        for(var idx in share_list){
          var share_id = JSON.parse(share_list[idx]);
          if(id == share_id.viewerid && userInfo.id == share_id.userid && bedid == share_id.bedid){
            var share = new Object();
            share.viewerid = id;
            share.mode = share_id.mode;
            share.group = share_id.group;
            
            client.srem("share_" + id, share_list[idx]);
            client.srem("sharebed_" + bedid, JSON.stringify(share));

            groupname = share_id.group;
          }
        }

        if(!viewers[id].delete){
          var mode = viewers[id].permission.reduce((a, b) => parseInt(a) + parseInt(b), 0);

          if(mode > 0){
            var share = new Object();
            share.viewerid = id;
            share.mode = mode;
            share.group = groupname;

            client.sadd("sharebed_" + bedid, JSON.stringify(share));

            share.userid = userInfo.id;
            share.bedname = bedname;
            share.vrcode = "";
            share.bedid = bedid;

            client.sadd("share_" + id, JSON.stringify(share));
          }
        }
      }

      for(var idx in new_viewers){
        var id = "";
        for (key in body) {
          if(key == "viewer_" + idx){
            id = body[key];
          }
        }
        var mode = new_viewers[idx].permission.reduce((a, b) => parseInt(a) + parseInt(b), 0);

        if(mode > 0){
          var share = new Object();
          share.viewerid = id;
          share.mode = mode;
          share.group = "";

          client.sadd("sharebed_" + bedid, JSON.stringify(share));

          share.userid = userInfo.id;
          share.bedname = bedname;
          share.vrcode = "";
          share.bedid = bedid

          client.sadd("share_" + id, JSON.stringify(share));
        }
      }
    }
  }

  return get_viewers(body);
}

async function set_owner(userInfo, body){
  var result = new Object();
  var vrcode = body.vrcode;
  var owner_id = body.viewer;
  try{
    var vrinfo = JSON.parse(await clientSession.get(vrcode));
    if(vrinfo){
      vrinfo.userid = owner_id;
      client.expire(vrcode, 0);
      client.set(vrcode, JSON.stringify(vrinfo));

      var vr_bed_list = await clientSession.sMembers("bed_" + vrcode);
      for(var idx in vr_bed_list){
        var bedname = vr_bed_list[idx];

        var share = new Object();
        share.viewerid = userInfo.id;
        share.mode = 7;

        client.sadd("sharebed_" + bedname, JSON.stringify(share));

        var sharebed_list = await clientSession.sMembers("sharebed_" + bedname);
        for(var idx2 in sharebed_list){
          var sharebed = JSON.parse(sharebed_list[idx2]);
          if(owner_id == sharebed.viewerid){
            client.srem("sharebed_" + bedname, sharebed_list[idx2]);
          }

          var share_list = await clientSession.sMembers("share_" + sharebed.viewerid);
          for(var idx3 in share_list){
            share = JSON.parse(share_list[idx3]);
            if(userInfo.id == share.userid && bedname == share.bedname){
              client.srem("share_" + share.viewerid, share_list[idx3]);

              if(owner_id == share.viewerid){
                share.mode = 0;
                share.userid = owner_id;
                share.vrcode = vrcode;
              }else if(userInfo.id == share.viewerid){
                share.mode = 7;
                share.userid = owner_id;
                share.vrcode = "";
              }else{
                share.userid = owner_id;
                share.vrcode = "";
              }

              client.sadd("share_" + share.viewerid, JSON.stringify(share));
            }
          }
        }
      }

      result.success = 0;
    }
  }catch(err){
    result.success = -1;
    console.log("set_owner ERROR", err);
  }
  return result;
}

async function del_share_bed(userInfo, body){
  var result = new Object();
  var bedid = body.bedid;

  var sharebed_list = await clientSession.sMembers("sharebed_" + bedid);
  for(var idx in sharebed_list){
    var sharebed = JSON.parse(sharebed_list[idx]);
    if(userInfo.id == sharebed.viewerid){
      if(sharebed_list.length == 1){
        client.expire("sharebed_" + bedid, 0);
      }else{
        client.srem("sharebed_" + bedid, sharebed_list[idx]);
      }
    }
  }

  var share_list = await clientSession.sMembers("share_" + userInfo.id);
  for(var idx2 in share_list){
    var share = JSON.parse(share_list[idx2]);
    if(bedid == share.bedid && userInfo.id == share.viewerid){
      client.srem("share_" + share.viewerid, share_list[idx2]);
    }
  }
  result.success = 0;
  return result;
}

async function del_share_beds(userInfo, body){
  var result = new Object();
  var bednames = body.bednames.split(",");
  var bedids = body.bedids.split(",");
  var bed = new Object();

  for(var idx in bedids){
    bed.bedid = bedids[idx];
    bed.bedname = bednames[idx];

    await del_share_bed(userInfo, bed);
  }
  result.success = 0;
  return result;
}

async function move_vrs(userInfo, body){
  var result = new Object();
  var bedids = body.bedids.split(",");
  var share_list = await clientSession.sMembers("share_" + userInfo.id);

  for(var idx in bedids){
    var bedid = bedids[idx];
    console.log(bedid);
    
    var sharebed_list = await clientSession.sMembers("sharebed_" + bedid);

    // if(userInfo.admin_yn == "Y"){
    //   var bedInfo = JSON.parse(await clientSession.get(bedid));
    //   var vrcode = bedInfo.vrcode;
    //   var vrinfo = JSON.parse(await clientSession.get(vrcode));
    //   if(vrinfo){
    //     vrinfo.defaultgroup = body.groupname;
    //     client.set(vrcode, JSON.stringify(vrinfo));
    //   }
    // }
    
    client.sadd('group_' + userInfo.id, body.groupname);
    
    for(var idx2 in sharebed_list){
      var sharebed = JSON.parse(sharebed_list[idx2]);
      
      if(userInfo.id == sharebed.viewerid){
        client.srem("sharebed_" + bedid, sharebed_list[idx2]);
        sharebed.group = body.groupname;
        client.sadd("sharebed_" + bedid, JSON.stringify(sharebed));
      }
    }

    for(var idx2 in share_list){
      var share = JSON.parse(share_list[idx2]);
      if(bedid == share.bedid && userInfo.id == share.viewerid){
        client.srem("share_" + userInfo.id, share_list[idx2]);

        share.group = body.groupname;
        client.sadd("share_" + userInfo.id, JSON.stringify(share));

        break;
      }
    }
  }

  result.success = 0;
  return result;
}

async function share_beds(userInfo, body){
  var result = new Object();
  var ids = body.viewers.split(",");
  var bedids = body.bedids.split(",");
  var bednames = body.bednames.split(",");
  
  for(var idx in ids){
    var id = ids[idx];
  
    for(var idx2 in bedids){
      var bedid = bedids[idx2];
      var bedname = bednames[idx2];
      
      var share = new Object();
      share.viewerid = id;
      share.mode = body.mode;

      client.sadd("sharebed_" + bedid, JSON.stringify(share));

      share.userid = userInfo.id;
      share.bedname = bedname;
      share.vrcode = "";
      share.group = "";
      share.bedid = bedid;

      client.sadd("share_" + id, JSON.stringify(share));
    }
  }

  result.msg = "The following beds are shared to " + body.viewers + " : " + body.bednames + ".";
  return result;
}

async function add_group(userInfo, body){
  var result = new Object();
  
  client.sadd('group_' + userInfo.id, body.groupname);

  result.result = "0";
  return result;
}

async function make_lotto(){
  var result = new Object();
  var param = new Object();
  try{
    var lotto_list = await clientSession.sMembers("lotto_list");
    if(lotto_list.length == 0){
      lotto_list = new Array();
      for(var i=1; i<=45; i++){
        lotto_list.push(i);
        await clientSession.sAdd("lotto_list", ""+i);
      }
    };

    var sel_lotto_list = new Array();
    var year = getYear(new Date());
    var week = getWeekNumber(new Date());
  
    await clientSession.sAdd(year + "_" + week, ""+15);
    await clientSession.sAdd(year + "_" + week, ""+9);
    await clientSession.sAdd(year + "_" + week, ""+14);
    await clientSession.sAdd(year + "_" + week, ""+20);
    await clientSession.sAdd(year + "_" + week, ""+3);
    await clientSession.sAdd(year + "_" + week, ""+26);
    clientSession.sAdd(week + "_1", ""+15);
    clientSession.sAdd(week + "_1", ""+9);
    clientSession.sAdd(week + "_1", ""+14);
    clientSession.sAdd(week + "_1", ""+20);
    clientSession.sAdd(week + "_1", ""+3);
    clientSession.sAdd(week + "_1", ""+26);

    while((sel_lotto_list = await clientSession.sMembers(year + "_" + week)).length < 45){
      var idx = Math.floor(Math.random() * lotto_list.length);
      var number = lotto_list[idx];
      
      var dup = await clientSession.sAdd(year + "_" + week, ""+number);

      if(dup == 1){
        if(sel_lotto_list.length < 6){
          clientSession.sAdd(week + "_1", ""+number);
        }else if(sel_lotto_list.length < 12){
          clientSession.sAdd(week + "_2", ""+number);
        }else if(sel_lotto_list.length < 18){
          clientSession.sAdd(week + "_3", ""+number);
        }else if(sel_lotto_list.length < 24){
          clientSession.sAdd(week + "_4", ""+number);
        }else if(sel_lotto_list.length < 30){
          clientSession.sAdd(week + "_5", ""+number);
        }else if(sel_lotto_list.length < 36){
          clientSession.sAdd(week + "_6", ""+number);
        }else if(sel_lotto_list.length < 42){
          clientSession.sAdd(week + "_7", ""+number);
        }else{
          clientSession.sAdd(week + "_8", ""+number);
        }
      }
    }
    
    // while((sel_lotto_list = await clientSession.sMembers(week + "_8")).length < 6){
    //   var idx = Math.floor(Math.random() * lotto_list.length);
    //   var number = lotto_list[idx];
      
    //   await clientSession.sadd(week + "_8", number);
    // }

    param.year = year;
    param.week = week;

    result = get_lotto(param);

    await clientSession.sAdd(year, ""+week);
  }catch(err){
    result.result = false;
    result.msg = "Error";
    console.log("make_lotto ERROR", err);
  }
  return result;
}

async function get_lotto(data){
  var result = new Object();
  
  var today_lotto_list = new Array();

  today_lotto_list.push(await clientSession.sMembers(data.week + "_1"));
  today_lotto_list.push(await clientSession.sMembers(data.week + "_2"));
  today_lotto_list.push(await clientSession.sMembers(data.week + "_3"));
  today_lotto_list.push(await clientSession.sMembers(data.week + "_4"));
  today_lotto_list.push(await clientSession.sMembers(data.week + "_5"));
  today_lotto_list.push(await clientSession.sMembers(data.week + "_6"));
  today_lotto_list.push(await clientSession.sMembers(data.week + "_7"));
  today_lotto_list.push(await clientSession.sMembers(data.week + "_8"));
  
  result.year = data.year;
  result.week = data.week;

  result.lotto_list = today_lotto_list;
  
  result.result = true;
  result.msg = "success";

  return result;
}

async function get_lotto_week(){
  var result = new Object();
  var year = getYear(new Date());
  var week = getWeekNumber(new Date());

  result.year = year;
  result.week = week;
  result.dup = await clientSession.sIsMember(year, week);

  result.weeks = await clientSession.sMembers(year);

  return result;
}