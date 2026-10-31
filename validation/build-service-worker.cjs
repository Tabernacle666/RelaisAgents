'use strict';
// Build the single Manifest V3 worker shipped to Edge from reviewed modules.
const fs=require('node:fs'),path=require('node:path');
const dir=path.join(__dirname,'../reveil_agents');
const modules=['conversations.js','github.js','delivery.js','rollover.js','fresh-chat.js','github-worker.js','background.js'];
const content=modules.map(file=>{
 let text=fs.readFileSync(path.join(dir,file),'utf8');
 if(file==='background.js'){
  const statement=/^importScripts\([^\n]+\);\s*\n/m;
  if(!statement.test(text))throw Error('Entrée importScripts manquante dans background.js');
  text=text.replace(statement,'');
 }
 return '// --- '+file+' ---\n'+text.trimEnd();
}).join('\n\n')+'\n';
fs.writeFileSync(path.join(dir,'service-worker.js'),content);
console.log('service-worker.js régénéré depuis '+modules.length+' modules.');
