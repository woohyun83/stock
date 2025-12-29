const fs = require('fs');
const path = require('path');
const pug = require('pug');

const p = path.join(__dirname, '..', 'views', 'stock.pug');
const src = fs.readFileSync(p, 'utf8');
const lines = src.split('\n');

let lo = 1, hi = lines.length, bad = -1;
while(lo <= hi){
  const mid = Math.floor((lo+hi)/2);
  const chunk = lines.slice(0, mid).join('\n');
  try{
    pug.lex(chunk, {filename: p});
    // good prefix
    lo = mid + 1;
  }catch(e){
    bad = mid;
    hi = mid - 1;
  }
}

if(bad === -1) console.log('No error found during prefix scan');
else{
  console.log('First failing line:', bad);
  const contextStart = Math.max(0, bad-5);
  const contextEnd = Math.min(lines.length, bad+5);
  for(let i=contextStart;i<contextEnd;i++){
    console.log((i+1)+':', lines[i]);
  }
}
