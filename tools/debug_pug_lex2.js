const fs = require('fs');
const path = require('path');
try{
  const lexer = require('pug-lexer');
  const src = fs.readFileSync(path.join(__dirname, '..', 'views', 'stock.pug'), 'utf8');
  try{
    const tokens = lexer(src, {filename: 'stock.pug'});
    console.log('tokens', tokens.length);
  }catch(e){
    console.error('lexer error:', e.message);
    if(e.loc){
      const lines = src.split('\n');
      const l = e.loc.line - 1;
      console.error('Error line', e.loc.line, ':', lines[l]);
      console.error('Context:');
      for(let i=Math.max(0,l-5); i<=Math.min(lines.length-1,l+5); i++){
        console.error((i+1)+':', lines[i]);
      }
    }
  }
}catch(e){
  console.error('failed to load pug-lexer', e && e.message);
}
