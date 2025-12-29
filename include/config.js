const websocket_ip = "127.0.0.1";
const websocket_port = "3000";

const password = "1234";

function check_password(mb_password){
  var result = false;
  if(mb_password == password){
    result = true;
  }
  return result;
}

function get_websocket_host(){
  var websocket_host = websocket_ip;

  if(websocket_port){
    websocket_host += ":" + websocket_port;
  }
  return websocket_host;
}

function get_websocket_port(){
  var port = websocket_port;
  if(port == ""){
    port = "3000";
  }
  return port;
}

module.exports = {
  get_websocket_host : get_websocket_host,
  check_password : check_password,
  get_websocket_port : get_websocket_port
};
