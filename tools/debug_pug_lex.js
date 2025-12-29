const fs = require('fs');
const pug = require('pug');
const path = require('path');

const p = path.join(__dirname, '..', 'views', 'stock.pug');
const src = fs.readFileSync(p, 'utf8');
try{
  const tokens = pug.lex(src, {filename: p});
  console.log('Tokens:', tokens.length);
}catch(e){
  console.error('Lex error:', e.message);
  if(e.loc){
    const lines = src.split('\n');
    const l = e.loc.line - 1;
    console.error('Error line', e.loc.line, ':', lines[l]);
    console.error('Context:');
    for(let i=Math.max(0,l-3); i<=Math.min(lines.length-1,l+3); i++){
      console.error((i+1)+':', lines[i]);
    }
  }
  process.exit(2);
}
