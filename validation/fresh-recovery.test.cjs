'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{webcrypto}=require('node:crypto');
const root=__dirname+'/../reveil_agents/';
const settings={mode:'github',githubRepo:'https://github.com/Tabernacle666/ConsoleVR',githubBranch:'main',devUrl:'https://chatgpt.com/c/dev-before',devTitle:'Programmeur',devFresh:true};
const db={settings,runtime:{enabled:true,activationId:'start'}};
const tab={id:42,url:settings.devUrl,status:'complete',title:'Programmeur'};
let navs=0,highReady=false;
const chrome={storage:{local:{async get(keys){if(typeof keys==='string')keys=[keys];return Object.fromEntries(keys.filter(x=>db[x]!==undefined).map(x=>[x,structuredClone(db[x])]));},async set(obj){Object.assign(db,structuredClone(obj));}}},tabs:{async get(id){assert.equal(id,42);return {...tab};},async update(id,obj){assert.equal(id,42);navs++;tab.url=obj.url;tab.title='ChatGPT';return {...tab};}},scripting:{async executeScript({func}){if(func.name==='oldPageSafe')return[{result:{ok:true}}];if(func.name==='chooseHigh')return[{result:highReady?{ok:true}:{ok:false,reason:'indisponible'}}];throw Error('Injection inattendue '+func.name);}}};
const c={chrome,URL,Date,Promise,crypto:webcrypto,setTimeout,clearTimeout,console};vm.createContext(c);
for(const f of ['conversations.js','fresh-chat.js','delivery.js'])vm.runInContext(fs.readFileSync(root+f,'utf8'),c,{filename:f});
const F=vm.runInContext('FreshChat',c),D=vm.runInContext('Delivery',c);
const job={role:'dev',signal:'authorization',value:{cycle_id:'cycle-1',billet:'billet-1',source_sha:'a'.repeat(40)}};
(async()=>{
 const initial=await F.prepare({...tab},settings,job,db.runtime);
 assert.equal(navs,1);assert.equal(tab.url,'https://chatgpt.com/?temporary-chat=true');assert.equal(tab.title,'ChatGPT','titre provisoire autorisé');
 assert.equal(initial.model.verified,false,'modèle non vérifiable = autorisé');
 assert.equal(initial.pending.phase,'ready');
 // Reprise d'une navigation déjà enregistrée, même si « Démarrer » a changé
 // l'activation et même si l'onglet n'a encore que le titre « ChatGPT ».
 db.freshPending.dev.phase='navigation';
 db.runtime.activationId='restarted';
 highReady=true;
 const prepared=await F.prepare({...tab},settings,job,db.runtime);
 assert.equal(navs,1,'reprise sans deuxième changement de page');assert.equal(prepared.pending.phase,'ready');
 assert.equal(prepared.pending.activationId,'restarted');
 const destination=settings.devUrl,receiptKey=D.key(settings,job,destination),token='test-token';
 await D.reserve(receiptKey,{role:'dev',destination,activationId:db.runtime.activationId,token});
 const attempt={role:'dev',destination,receiptKey,receiptToken:token,activationId:db.runtime.activationId,fresh:true,jobId:F.jobId(settings,job)};
 assert.equal((await D.permit(attempt,tab.url,41)).ok,false,'autre onglet interdit');
 assert.equal((await D.permit(attempt,'https://chatgpt.com/work',42)).ok,false,'Work interdit');
 assert.equal((await D.permit(attempt,'https://chatgpt.com/',42)).ok,false,'chat normal interdit');
 assert.equal((await D.permit(attempt,tab.url,42)).ok,true,'même onglet autorisé une seule fois');
 await D.finish(receiptKey,token,{status:'Clic effectué'});
 tab.url='https://chatgpt.com/c/real-123?temporary-chat=true';tab.title='Le nouveau Programmeur';
 const canonical=await F.complete('dev',job,settings,db.runtime,true);
 assert.equal((await F.state('dev')).phase,'canonical');
 // Simulate a restart after the receipt moved, before settings are finalized.
 await D.retarget(settings,job,destination,canonical.newUrl);
 await D.retarget(settings,job,destination,canonical.newUrl);
 db.runtime.activationId='restart-after-send';
 const restored=await F.complete('dev',job,settings,db.runtime,true);
 await F.commit('dev',job,settings,db.runtime,restored.newUrl);
 assert.equal(db.settings.devUrl,canonical.newUrl);assert.equal(navs,1);
 assert.equal(await F.state('dev'),null);
 assert.equal((await D.read(D.key(settings,job,canonical.newUrl))).state,'sent');
 console.log('PASS onglet titre ChatGPT, modèle non vérifié autorisé, reprise après changement activation, contrôle d’onglet, Work interdit, reçu déplacé, récupération.');
})().catch(e=>{console.error(e);process.exitCode=1});
