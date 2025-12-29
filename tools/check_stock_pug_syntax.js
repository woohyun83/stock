const fs = require('fs');
const path = require('path');
const pug = require('pug');
const vm = require('vm');

const pugPath = path.join(__dirname, '..', 'views', 'stock.pug');
const locals = {
  stocks: [],
  dates: ['20251020','20251019'],
  websocket_host: 'http://localhost:3000',
  user: { id: 'test', admin_yn: 'Y', name: 'test' },
  file_menu: '',
  config_menu: '',
  user_menu: ''
};

try{
  const html = pug.renderFile(pugPath, locals);
  // extract all <script>...</script> contents
  const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  let idx = 0;
  while((m = scriptRegex.exec(html)) !== null){
    idx++;
    const js = m[1];
    try{
      // try compiling in a VM script to detect syntax errors
      new vm.Script(js, { filename: `stock.pug:script#${idx}` });
      console.log(`script#${idx}: OK`);
    }catch(e){
      console.error(`script#${idx}: SYNTAX ERROR`);
      console.error(e && e.stack);
      process.exitCode = 2;
    }
  }
  if(idx === 0){
    console.log('no <script> tags found in rendered HTML');
  }
}catch(err){
  console.error('Error rendering pug:', err && err.stack);
  process.exitCode = 1;
}
