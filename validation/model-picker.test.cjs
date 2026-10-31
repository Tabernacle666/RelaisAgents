'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/../reveil_agents/fresh-chat.js','utf8');
const context={Promise,URL,setTimeout,clearTimeout,getComputedStyle:()=>({visibility:'visible'})};
function node(text,testId,click){return {isConnected:true,innerText:text,textContent:text,getClientRects:()=>[{}],getAttribute(k){return k==='data-testid'?testId:null;},hasAttribute(){return false;},click};}
let stage='closed',clicked=[];
const picker=node('GPT-6','model-picker',()=>{stage=stage==='closed'?'models':'closed';clicked.push('picker')});
const model=node('GPT-6','model-choice',()=>{stage='effort';clicked.push('gpt6')});
const high=node('High','effort-choice',()=>{stage='closed';picker.innerText='GPT-6 High';clicked.push('high')});
const work=node('Work','work-choice',()=>{throw Error('Work ne doit jamais être sélectionné');});
context.document={querySelectorAll(){return [picker,...(stage==='models'?[model,work]:[]),...(stage==='effort'?[high,work]:[])]}};
vm.createContext(context);vm.runInContext(source,context);
(async()=>{
 const success=await vm.runInContext('FreshChat.chooseHigh()',context);
 assert.equal(success.ok,true,success.reason);assert.equal(success.verified,true);assert.deepEqual(clicked,['picker','gpt6','high']);
 // An ambiguous/inaccessible model menu leaves the default GPT-6 High alone,
 // and NEVER clicks Work. A failure to verify is informational, not fatal.
 const other={document:{querySelectorAll:()=>[node('Work','work-tab',()=>{throw Error('ne pas cliquer Work')})]},getComputedStyle:context.getComputedStyle,Promise,URL,setTimeout,clearTimeout};
 vm.createContext(other);vm.runInContext(source,other);const fail=await vm.runInContext('FreshChat.chooseHigh()',other);
 assert.equal(fail.ok,true);assert.equal(fail.verified,false);assert.match(fail.warning,/Sélecteur de modèle introuvable/);
 console.log('PASS sélecteur GPT-6 High si disponible, Work jamais cliqué, menu introuvable = modèle par défaut et envoi autorisé.');
})().catch(e=>{console.error(e);process.exitCode=1});
