'use strict';
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {harness}=require('./delivery.test.cjs');
const sha=x=>String(x).repeat(40);
const chosen='https://chatgpt.com/c/selected-dev-103';
async function setup(){
 const h=await harness();
 h.db.settings.devFresh=true;
 const snap=h.snapshot('dev','consolevr-1.1.55.103-github-001');
 const job=vm.runInContext('GitHubRelay',h.c).select(snap);
 const old=h.db.settings.devUrl;
 const F=vm.runInContext('FreshChat',h.c);
 h.db.freshPending={dev:{role:'dev',jobId:F.jobId(h.db.settings,job),activationId:h.db.runtime.activationId,
  tabId:1,previousUrl:old,previousTitle:'Ancien Programmeur',phase:'ready',createdAt:Date.now()-12000}};
 return {h,F,job,old};
}
(async()=>{
 // Manual choice of an existing /c/ takes over pending fresh without opening a new tab.
 {
  const {h}=await setup();
  h.db.settings.devUrl=chosen;h.db.settings.devTitle='Programmeur choisi';
  await h.poll();
  assert.equal(h.emits.length,1,JSON.stringify(h.db.githubState));
  assert.equal(h.emits[0].attempt.destination,chosen);
  assert.equal(h.emits[0].attempt.fresh,false);
  assert.deepEqual(Object.keys(h.db.freshPending),[]);
  await h.poll();assert.equal(h.emits.length,1,'aucun doublon au prochain contrôle');
 }
 // Unchecking Fresh and saving the previous conversation also cancels an unsent ready.
 {
  const {h}=await setup();
  h.db.settings.devFresh=false;
  await h.poll();
  assert.equal(h.emits.length,1,JSON.stringify(h.db.githubState));
  assert.deepEqual(Object.keys(h.db.freshPending),[]);
 }
 // Merely moving the tab without saving an explicit new destination is NOT consent.
 {
  const {h}=await setup();
  const actual=h.c.chrome.tabs.get;
  h.c.chrome.tabs.get=async id=>id===1?{id,url:chosen,title:'Programmeur choisi',status:'complete'}:actual(id);
  await h.poll();
  assert.equal(h.emits.length,0);
  assert.equal(h.db.freshPending.dev.phase,'ready');
  assert.match(h.db.githubState.status,/déplacé/);
 }
 // Once a receipt exists, changing settings cannot erase the transaction or send twice.
 {
  const {h,job,old}=await setup();
  const key=h.D.key(h.db.settings,job,old);
  await h.D.reserve(key,{token:'existing-103',role:'dev',destination:old,activationId:h.db.runtime.activationId});
  await h.D.finish(key,'existing-103',{status:'Clic effectué'});
  h.db.settings.devUrl=chosen;h.db.settings.devTitle='Programmeur choisi';
  await h.poll();
  assert.equal(h.emits.length,0);
  assert.ok(h.db.freshPending.dev,'le reçu envoyé interdit l’abandon du pending');
  assert.equal((await h.D.read(key)).state,'sent');
 }
 console.log('PASS réaffectation manuelle, sélection sans nouveau fil, consentement explicite et aucune duplication.');
})().catch(e=>{console.error(e);process.exitCode=1});
