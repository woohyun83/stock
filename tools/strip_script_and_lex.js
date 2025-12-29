const fs = require('fs');
const path = require('path');
const lexer = require('pug-lexer');

const p = path.join(__dirname, '..', 'views', 'stock.pug');
const src = fs.readFileSync(p, 'utf8');
const lines = src.split('\n');

let outLines = [];
let i = 0;
while(i < lines.length){
  const line = lines[i];
  if(line.trim().startsWith('script.')){
    // keep the script. line but replace following indented lines with a single placeholder
    outLines.push(line);
    i++;
    // capture indentation of next line if any
    while(i < lines.length && (lines[i].startsWith('    ') || lines[i].trim() === '')){
      // skip
      i++;
    }
    continue;
  } else {
    outLines.push(line);
    i++;
  }
}

const stripped = outLines.join('\n');
try{
  lexer(stripped, {filename: 'stock.pug'});
  console.log('pug-lexer OK on stripped file');
}catch(e){
  console.error('lexer error on stripped file:', e && e.message);
}
