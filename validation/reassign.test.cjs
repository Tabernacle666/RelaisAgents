const assert=require('assert'),{harness}=require('./delivery.test.cjs');
(async()=>{
 for(const state of ['prepared','committing','uncertain','sent']){
  const h=await harness();h.snapshot('dev','consolevr-1.1.55.32-github-001');await h.poll();
  const g={...h.db.githubState},oldKey=g.receiptKey,old={...h.db.deliveryReceipts[oldKey]};
  h.db.deliveryReceipts[oldKey].state=state;
  const selected={...h.db.settings,devUrl:'https://chatgpt.com/c/new-programmer'};
  const query=h.c.chrome.tabs.query;h.c.chrome.tabs.query=async()=>[...await query(),{id:88,url:selected.devUrl,title:'new-programmer'}];
  await h.message({type:'retryDelivery',receiptKey:oldKey,receiptToken:g.receiptToken,settings:selected});
  await h.poll();assert.equal(h.emits.length,2,state);
  assert.equal(h.emits[1].attempt.destination,selected.devUrl);
  assert.equal((await h.D.permit({receiptKey:oldKey,receiptToken:old.token,role:'dev',destination:old.destination,activationId:'one'},old.destination)).ok,false);
  for(let i=0;i<6;i++)await h.poll();assert.equal(h.emits.length,2,state+' duplicate');
 }
 const h=await harness();h.snapshot();await h.poll();let g=h.db.githubState;
 h.db.deliveryReceipts[g.receiptKey].state='committing';await h.poll();g=h.db.githubState;assert.equal(g.retryAvailable,true);
 await h.message({type:'retryDelivery',receiptKey:g.receiptKey,receiptToken:g.receiptToken,settings:h.db.settings});await h.poll();assert.equal(h.emits.length,2);
 console.log('PASS reprise explicite des états prepared/committing/uncertain/sent vers la nouvelle sélection, ancien permis révoqué, six lectures sans répétition et reprise même destination.');
})().catch(e=>{console.error(e);process.exit(1)});
