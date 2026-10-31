'use strict';
// Durable transport receipts. GitHub remains the authority for work/results.
const Delivery=(()=>{
 let sequence=Promise.resolve();
 const serial=fn=>{const p=sequence.then(fn);sequence=p.catch(()=>{});return p;};
 const key=(s,j,d)=>j.signal==='blocked'?JSON.stringify([s.githubRepo.toLowerCase().replace(/\/$/,''),s.githubBranch,'blocked',j.value.cycle_id,j.relayCommit]):JSON.stringify([s.githubRepo.toLowerCase().replace(/\/$/,''),s.githubBranch,j.role,j.value.cycle_id,j.value.billet,j.value.source_sha.toLowerCase(),...(['qa_return','continuation'].includes(j.signal)||Number(j.value.tentative)>1?[j.signal||'delivery',j.relayCommit||'',j.value.tentative||1]:[]),d]);
 const read=k=>serial(async()=>{const {deliveryReceipts={}}=await chrome.storage.local.get('deliveryReceipts');return deliveryReceipts[k]||null;});
 async function update(k,fn){return serial(async()=>{const data=await chrome.storage.local.get(['deliveryReceipts','settings','runtime','freshPending']);const all=data.deliveryReceipts||{};const result=fn(all[k],data);if(result?.entry){all[k]=result.entry;await chrome.storage.local.set({deliveryReceipts:all});}return result;});}
 const remember=(k,entry)=>update(k,old=>old?{entry:old}:{entry:{...entry,time:Date.now()}});
 const reserve=(k,entry)=>update(k,(old,{runtime:r={}})=>{
  if(!r.enabled||r.activationId!==entry.activationId)return {allowed:false};
  if(old&&old.state!=='retry')return {allowed:false,entry:old};
  const next={...entry,state:'prepared',time:Date.now(),manual:old?.state==='retry',ignoreClaimId:old?.ignoreClaimId||entry.ignoreClaimId||null};
  return {allowed:true,entry:next};
 });
 const permit=(a,senderUrl,senderTabId)=>update(a.receiptKey,(old,{settings:s={},runtime:r={},freshPending={}})=>{
  const common=old&&old.token===a.receiptToken&&old.state==='prepared'&&old.role===a.role&&old.destination===a.destination&&r.enabled&&s.mode==='github'&&r.activationId===a.activationId&&ChatConversations.key(s[a.role+'Url'])===a.destination;
  const pending=freshPending[a.role];
  const standard=!a.fresh&&ChatConversations.key(senderUrl)===a.destination;
  const fresh=a.fresh===true&&['dev','qa'].includes(a.role)&&s[a.role+'Fresh']===true&&pending&&pending.role===a.role&&pending.phase==='ready'&&pending.activationId===a.activationId&&pending.tabId===senderTabId&&pending.previousUrl===a.destination&&pending.jobId===a.jobId&&FreshChat.isBlank(senderUrl)&&FreshChat.isTemporary(senderUrl);
  if(!common||!(standard||fresh))return {ok:false};
  return {ok:true,entry:{...old,state:'committing',priseId:typeof a.actualPriseId==='string'?a.actualPriseId:old.priseId,clickAuthorizedAt:Date.now()}};
 });
 const finish=(k,token,outcome)=>update(k,old=>{
  if(!old||old.token!==token)return {ignored:true};
  // A timeout never licenses a fresh send: the browser may still be executing.
  const sent=['Clic effectué','Déjà transmis'].includes(outcome?.status);
  if(old.state==='sent')return {entry:old};
  return {entry:{...old,state:sent?'sent':'uncertain',detail:outcome?.detail||outcome?.status||'Résultat de transmission inconnu',finishedAt:Date.now()}};
 });
 const retry=(k,token,ignoreClaimId)=>update(k,old=>{
  if(!old||old.token!==token||!['prepared','committing','sent','uncertain'].includes(old.state))throw Error('Ce reçu a changé ; relis son état.');
  return {entry:{...old,state:'retry',token:'retry-'+crypto.randomUUID(),ignoreClaimId:ignoreClaimId||old.ignoreClaimId||null,time:Date.now()}};
 });
 const claimedElsewhere=(priseId,destination)=>serial(async()=>{const {deliveryReceipts={}}=await chrome.storage.local.get('deliveryReceipts');return Object.values(deliveryReceipts).some(e=>e.priseId===priseId&&e.destination!==destination);});
 const bindClaim=(k,priseId)=>update(k,old=>old?{entry:{...old,priseId}}:{ignored:true});
 const retarget=(s,job,oldUrl,newUrl)=>serial(async()=>{
  const oldKey=key(s,job,oldUrl),newKey=key(s,job,newUrl);
  if(oldKey===newKey)return newKey;
  const {deliveryReceipts={}}=await chrome.storage.local.get('deliveryReceipts');
  const prior=deliveryReceipts[oldKey];
  if(!prior){if(deliveryReceipts[newKey])return newKey;throw Error('Reçu de la nouvelle conversation introuvable ; aucun renvoi.');}
  if(deliveryReceipts[newKey])throw Error('La conversation cible possède déjà un reçu ; réaffectation suspendue.');
  deliveryReceipts[newKey]={...prior,destination:newUrl};delete deliveryReceipts[oldKey];
  await chrome.storage.local.set({deliveryReceipts});return newKey;
 });
 const recoverInterrupted=()=>serial(async()=>{const {deliveryReceipts={}}=await chrome.storage.local.get('deliveryReceipts');let changed=false;for(const e of Object.values(deliveryReceipts))if(['prepared','committing'].includes(e.state)){e.state='uncertain';e.detail='Service interrompu pendant une transmission ; aucun réessai automatique.';changed=true;}if(changed)await chrome.storage.local.set({deliveryReceipts});});
 return {key,read,remember,reserve,permit,finish,retry,claimedElsewhere,bindClaim,retarget,recoverInterrupted};
})();
