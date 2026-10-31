'use strict';
const assert=require('node:assert/strict');
const {harness}=require('./delivery.test.cjs');
(async()=>{
 const h=await harness();
 const oldGet=h.c.chrome.tabs.get,oldQuery=h.c.chrome.tabs.query,oldExecute=h.c.chrome.scripting.executeScript;
 const qaTab={id:2,url:h.db.settings.qaUrl,title:'Vérificateur',status:'complete'};
 const updates=[],requests=[],modelChecks=[];
 h.c.chrome.tabs.get=async id=>id===2?qaTab:oldGet(id);
 h.c.chrome.tabs.query=async()=>[...(await oldQuery()).filter(t=>t.id!==2),qaTab];
 h.c.chrome.tabs.update=async(id,props)=>{assert.equal(id,2,'même onglet QA');assert.deepEqual(Object.keys(props),['url']);assert.match(props.url,/^https:\/\/chatgpt\.com\/$/);updates.push(props.url);qaTab.url=props.url;return qaTab;};
 h.c.chrome.scripting.executeScript=async x=>{
  if(x.func.name==='oldPageSafe')return [{result:{ok:true}}];
  if(x.func.name==='chooseHigh'){modelChecks.push(x.target.tabId);return [{result:{ok:true}}];}
  if(x.func.name==='injectPrompt'&&x.args[2].fresh){
   const attempt=x.args[2];
   assert.equal(attempt.role,'qa');
   assert.equal(attempt.fresh,true);
   assert.equal((await h.D.permit(attempt,qaTab.url,qaTab.id)).ok,true,'permis lié au même onglet');
   requests.push(attempt);
   qaTab.url='https://chatgpt.com/c/qa-new-'+requests.length;
   qaTab.title='Vérificateur, nouveau fil '+requests.length;
   return [{result:{status:'Clic effectué',detail:'Injecté'}}];
  }
  return oldExecute(x);
 };
 // Checkboxes are independent, immediately persistent, Architecte forbidden.
 await h.message({type:'setRoleFresh',role:'qa',enabled:true});
 assert.equal(h.db.settings.qaFresh,true);
 assert.equal(h.db.settings.devFresh,undefined);
 await assert.rejects(h.message({type:'setRoleFresh',role:'arch',enabled:true}),/Seuls Programmeur/);
 h.snapshot('qa','consolevr-qa-fresh-001');
 await h.poll();
 assert.equal(requests.length,1,JSON.stringify(h.db.githubState));
 assert.equal(updates.length,1);assert.deepEqual(modelChecks,[2]);
 assert.equal(h.db.settings.qaUrl,'https://chatgpt.com/c/qa-new-1');
 assert.equal(Object.keys(h.db.freshPending||{}).length,0);
 for(let i=0;i<5;i++)await h.poll();
 assert.equal(requests.length,1);assert.equal(updates.length,1,'aucune nouvelle ouverture du même billet');
 // The checkbox OFF appends to the current conversation, without a new navigation.
 await h.message({type:'setRoleFresh',role:'qa',enabled:false});
 h.snapshot('qa','consolevr-qa-continu-002');
 await h.poll();
 assert.equal(requests.length,1);
 assert.equal(h.emits.length,1,JSON.stringify(h.db.githubState));
 assert.equal(h.emits[0].attempt.destination,'https://chatgpt.com/c/qa-new-1');
 assert.equal(updates.length,1);
 // Re-enable midstream: next new request starts another chat in the SAME tab.
 await h.message({type:'setRoleFresh',role:'qa',enabled:true});
 h.snapshot('qa','consolevr-qa-fresh-003');await h.poll();
 assert.equal(requests.length,2,JSON.stringify(h.db.githubState));
 assert.equal(updates.length,2);
 assert.equal(h.db.settings.qaUrl,'https://chatgpt.com/c/qa-new-2');
 const last=requests.at(-1);
 assert.equal((await h.D.permit(last,'https://chatgpt.com/',qaTab.id)).ok,false,'reçu déjà consommé');
 assert.equal((await h.D.permit({...last,receiptToken:'faux'},'https://chatgpt.com/',qaTab.id)).ok,false);
 console.log('PASS options live QA, Architecte exclu, même onglet, GPT-6 High contrôlé avant envoi, destination canonique, déduplication, case désactivée = append, réactivation = nouveau fil.');
})().catch(e=>{console.error(e);process.exitCode=1;});
