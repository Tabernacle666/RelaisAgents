// --- conversations.js ---
"use strict";
// Règles communes au popup et au service worker.
// Seule l'identité visuelle du titre est conservée entre deux conversations.
// Comparaison STRICTE de titres propres : ni masque, ni sous-chaîne, ni tolérance de casse.
globalThis.ChatConversations = (() => {
  const ORIGINS = new Set(["https://chatgpt.com", "https://chat.openai.com"]);
  function key(rawUrl) {
    try {
      const url = new URL(rawUrl);
      if (!ORIGINS.has(url.origin)) return null;
      const path = url.pathname.replace(/\/$/, "");
      if (!/^\/(?:c\/[\w-]+|g\/[^/]+\/c\/[\w-]+)$/.test(path)) return null;
      return url.origin + path;
    } catch (_) { return null; }
  }
  function title(rawTitle) {
    // Le titre visible dans la liste déroulante est la clé de rapprochement.
    // On n'enlève que le préfixe/suffixe de marque du navigateur, comme en v1.3.
    const result = String(rawTitle || "")
      .replace(/^\s*(ChatGPT|OpenAI)\s*[-–—|]\s*/i, "")
      .replace(/\s*[-–—|]\s*(ChatGPT|OpenAI)\s*$/i, "")
      .replace(/\s+/g, " ").trim();
    return result && !["ChatGPT", "OpenAI", "Conversation sans titre"].includes(result) ? result : "";
  }
  function open(tabs) {
    return (tabs || []).filter(t => key(t.url)).map(t => ({
      tab:t, key:key(t.url), title:title(t.title)
    }));
  }
  // L’URL sélectionnée prime. Si elle est absente, le titre exact sert de secours.
  // l'URL explicitement sélectionnée sert UNIQUEMENT à lever l'ambiguïté.
  function resolve(tabs, savedTitle, savedUrl) {
    const candidates = open(tabs);
    const oldKey = key(savedUrl);
    // The user's explicit selection is authoritative, even after a rename
    // or when another conversation still carries the old title.
    const selected=candidates.find(t=>t.key===oldKey);
    if(selected)return {tab:selected.tab,mode:'url-selectionnee'};
    if (savedTitle) {
      const matches = candidates.filter(t => t.title === savedTitle);
      if (matches.length === 1) return {tab:matches[0].tab, mode:"titre"};
      if (matches.length > 1) {
        const explicit = matches.filter(t => t.key === oldKey);
        if (explicit.length === 1) return {tab:explicit[0].tab, mode:"url-explicite"};
        return {error:`Plusieurs onglets portent exactement le titre « ${savedTitle} ». Sélectionne le nouvel onglet dans l'extension ou ferme l'ancien.`};
      }
      return {error:`Aucun onglet ChatGPT ouvert ne porte exactement le titre « ${savedTitle} ». Ouvre cette conversation dans un onglet ; l'ancienne URL ne sera pas réutilisée.`};
    }
    // Compatibilité avec un réglage créé en v1.3.1, avant l'enregistrement des titres.
    const existing = candidates.find(t => t.key === oldKey);
    return existing ? {tab:existing.tab, mode:"ancienne-url", discoveredTitle:existing.title} : {legacyUrl:savedUrl};
  }
  return {key,title,open,resolve};
})();

// --- github.js ---
/* Shared pure relay validation; no network or browser state. */
(function(root){
 const sha=v=>typeof v==='string'&&/^[a-f0-9]{40}$/i.test(v);
 const valid=v=>v&&v.schema_version===1&&typeof v.cycle_id==='string'&&v.cycle_id.length>0&&typeof v.billet==='string'&&sha(v.source_sha);
 const attempt=v=>v?.tentative===undefined?1:(Number.isSafeInteger(v.tentative)&&v.tentative>0?v.tentative:0);
 function verdict(v,report){
  if(!attempt(v))throw Error('Tentative QA invalide.');
  if(typeof report!=='string'||!report.trim())throw Error('Rapport QA nécessaire pour confirmer le verdict.');
  const clean=report.split(/\r?\n/).some(line=>{
   let normalized=line.trim().replace(/^[-*>]\s+/, '').trim();
   if((normalized.startsWith('**')&&normalized.endsWith('**'))||(normalized.startsWith('__')&&normalized.endsWith('__')))normalized=normalized.slice(2,-2).trim();
   return /^(?:(?:Résultat|Resultat)\s*:\s*conforme\.\s*)?Aucune divergence constatée\.$/i.test(normalized);
  });
  const findings=/→|^\s*-\s*Exigence\s*:/m.test(report);
  const explicit=v.destination!==undefined||v.resultat!==undefined||v.nombre_constats!==undefined;
  if(explicit){
   if(!Number.isSafeInteger(v.nombre_constats)||v.nombre_constats<0)throw Error('Nombre de constats QA invalide.');
   if(v.destination==='dev'&&v.resultat==='a_corriger'&&v.nombre_constats>0){
    if(clean)throw Error('Le rapport de conformité contredit les constats QA.');
    if(!Array.isArray(v.constats)||v.constats.length!==v.nombre_constats||v.constats.some(c=>!c||['id','exigence','fichier','symbole','preuve','consequence'].some(k=>typeof c[k]!=='string'||!c[k].trim()))||new Set(v.constats.map(c=>c.id)).size!==v.nombre_constats)throw Error('Constats QA de correction incomplets.');
    return 'correction';
   }
   if(v.destination==='arch'&&v.resultat==='conforme'&&v.nombre_constats===0&&v.examen==='complet'&&clean&&!findings&&(!v.constats||Array.isArray(v.constats)&&v.constats.length===0))return 'architecte';
   throw Error('Routage QA incohérent : un examen complet sans divergence est requis pour l’Architecte.');
  }
  if(v.examen==='complet'&&clean&&!findings)return 'architecte';
  if(findings&&!clean)return 'correction';
  throw Error('Vérification ancienne non concluante : publier un verdict QA explicite avant toute suite.');
 }
 function select(s){
  const a=s.authorization,l=s.delivery,v=s.verification,b=s.programmerStatus;
  if(!valid(a)||a.etat!=='termine'||a.ferme!==true){
   const m=s.mission;
   return valid(m)&&m.etat==='a_instruire'?{role:'arch',signal:'bootstrap',value:m,relayCommit:s.missionCommit||s.head}:null;
  }
  if(!['continuer','corriger','reculer'].includes(a.decision))return null;
  if(a.branche_source!=='main')throw Error('Seule main est autorisée.');
  if(typeof s.master!=='string'||!s.master.includes(a.cycle_id))throw Error('Le masterticket ne porte pas le cycle autorisé.');
  const authorized=!s.authorizationCommit||l?.autorisation_commit_sha===s.authorizationCommit;
  const delivered=authorized&&valid(l)&&l.cycle_id===a.cycle_id&&l.etat==='termine';
  if(!delivered){
   const held=s.blockedHold;
   const current=b?.etat==='bloque'&&b.cycle_id===a.cycle_id?{value:b,relayCommit:s.statusCommit,authorizationCommit:s.authorizationCommit}:held;
   if(current&&current.value.cycle_id===a.cycle_id&&current.authorizationCommit===s.authorizationCommit&&current.value.autorisation_commit_sha===s.authorizationCommit){
    const x=current.value;
    if(!valid(x)||x.role!=='dev'||x.billet!==a.billet||x.base_sha!==a.source_sha||x.branche_source!==a.branche_source||x.livraison!==false||!sha(current.relayCommit))throw Error('Checkpoint de poursuite incompatible avec l’autorisation.');
    return {role:'dev',signal:'continuation',value:x,relayCommit:current.relayCommit,authorizationCommit:s.authorizationCommit};
   }
   return {role:'dev',signal:'authorization',value:a,relayCommit:s.authorizationCommit||s.head};
  }
  const n=attempt(l);
  if(!n||l.billet!==a.billet||!sha(l.autorisation_commit_sha)||l.branche_source!==a.branche_source||
     (n===1&&l.base_sha!==a.source_sha)||(n>1&&(!sha(l.base_sha)||!sha(l.retour_qa_commit_sha))))throw Error('Livraison incompatible avec l’autorisation ou son retour QA.');
  const deliveryJob=()=>({role:'qa',signal:'delivery',value:l,relayCommit:s.deliveryCommit||s.head});
  if(!valid(v)||v.cycle_id!==l.cycle_id||v.etat!=='termine'||attempt(v)>0&&attempt(v)<n)return deliveryJob();
  if(attempt(v)!==n||v.source_sha!==l.source_sha||v.billet!==l.billet||v.autorisation_commit_sha!==l.autorisation_commit_sha||!['complet','incomplet'].includes(v.examen))throw Error('Vérification incompatible avec la livraison.');
  const relayCommit=s.verificationCommit||s.head;
  if(verdict(v,s.report)==='correction')return {role:'dev',signal:'qa_return',value:{...v,tentative_verifiee:n,tentative:n+1,base_sha:l.source_sha,branche_source:l.branche_source},verification:v,relayCommit,authorizationCommit:l.autorisation_commit_sha};
  const d=s.diagnostic;
  // QA conforme ouvre un droit au diagnostic local, jamais une autorisation architecturale.
  if(!valid(d)||d.source_sha!==l.source_sha||d.billet!==l.billet||d.cycle_id!==l.cycle_id||
     attempt(d)!==n||d.verification_commit_sha!==relayCommit||!sha(s.diagnosticCommit))return null;
  if(['echec_compilation','echec_execution'].includes(d.etat))
   return {role:'dev',signal:'diagnostic_return',value:{...d,tentative:n+1,base_sha:l.source_sha,retour_qa_commit_sha:relayCommit,branche_source:'main',autorisation_commit_sha:l.autorisation_commit_sha},relayCommit:s.diagnosticCommit,authorizationCommit:l.autorisation_commit_sha};
  if(d.etat!=='complet'||typeof d.manifest_path!=='string')return null;
  return {role:'arch',signal:'diagnostic',value:d,verification:v,relayCommit:s.diagnosticCommit,authorizationCommit:l.autorisation_commit_sha};
 }
 function waiting(s){
  try{
   const a=s.authorization,l=s.delivery,v=s.verification;
   if(!valid(a)||!valid(l)||!valid(v)||v.etat!=='termine'||v.source_sha!==l.source_sha||v.cycle_id!==l.cycle_id||attempt(v)!==attempt(l))return null;
   if(verdict(v,s.report)!=='architecte')return null;
   if(s.diagnostic?.source_sha===l.source_sha&&s.diagnostic?.verification_commit_sha===s.verificationCommit)return null;
   return {cycle_id:l.cycle_id,billet:l.billet,source_sha:l.source_sha,tentative:attempt(l),verification_commit_sha:s.verificationCommit};
  }catch{return null;}
 }
 function claimMatches(job,c){
  if(!c||c.cycle_id!==job.value.cycle_id||c.billet!==job.value.billet||c.source_sha!==job.value.source_sha||c.role!==job.role||!sha(c.relais_commit_sha)||typeof c.prise_id!=='string')return false;
  if(['qa_return','diagnostic_return','continuation'].includes(job.signal)&&c.relais_commit_sha!==job.relayCommit)return false;
  return attempt(c)===attempt(job.value);
 }
 const api={select,waiting,sha,attempt,verdict,claimMatches};root.GitHubRelay=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);

// --- delivery.js ---
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

// --- rollover.js ---
'use strict';
// Rollover is deliberately restricted to the Programmeur. No speculative URL,
// no injection into a provisional /new chat, and no second click after an
// interrupted transition. ChatGPT's DOM is not a public API.
const DevRollover=(()=>{
 const sameOrigin=(a,b)=>{try{return new URL(a).origin===new URL(b).origin;}catch{return false;}};
 const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 function detectAndMaybeClick(doClick){
  // Read the current visible ChatGPT system banner, not the assistant/user
  // transcript or the global New Chat navigation button. This function must
  // remain self-contained: chrome.scripting.executeScript serializes it.
  const compact=v=>String(v||'').replace(/\s+/g,' ').trim();
  const content=n=>compact(n?.innerText||n?.textContent);
  const exists=n=>!!n&&n.isConnected!==false&&typeof n.getClientRects==='function'&&n.getClientRects().length>0;
  const author=n=>!!n.closest?.('[data-message-author-role="user"], [data-testid="conversation-turn-user"], [contenteditable="true"], [contenteditable="plaintext-only"]');
  // A component may use a <header> inside the red warning. Only navigation
  // landmarks, not all headers, are categorically excluded.
  const navigation=n=>!!n.closest?.('nav,aside,[role="navigation"]');
  const warning=/you.ve reached the maximum length for this conversation|maximum (?:conversation )?length|(?:conversation|chat) (?:has )?reached (?:its |the )?(?:maximum |max )?length|conversation is too long|longueur maximale|limite (?:de longueur|maximale) (?:de |pour )?(?:cette )?(?:conversation|discussion)|(?:conversation|discussion).{0,65}(?:trop longue|atteint.{0,20}(?:maximum|limite))/i;
  const action=/^(?:continue(?:r)? (?:in|dans) (?:a |une |un )?(?:new chat|nouvelle (?:conversation|discussion))|(?:start|commencer|démarrer|demarrer) (?:a |une |un )?(?:new chat|nouvelle (?:conversation|discussion))|(?:nouvelle conversation|new chat))$/i;
  const label=n=>[content(n),compact(n.getAttribute?.('aria-label')),compact(n.getAttribute?.('title')),compact(n.value)].filter(Boolean).some(s=>s.length<=90&&action.test(s));
  const all=selector=>Array.from(document.querySelectorAll(selector));
  const notices=all('p,div,section,span,[role="alert"],[role="status"]')
   .filter(n=>exists(n)&&!author(n)&&!navigation(n)&&content(n).length<=650&&warning.test(content(n)));
  if(!notices.length)return {state:'normal',noticeCount:0,buttonCount:0};
  // Search semantic controls first. Some UI implementations place the text in
  // a child span and the accessible name on the clickable ancestor.
  const controls=new Set(all('button,[role="button"],a[href],input[type="button"],input[type="submit"]')
   .filter(n=>exists(n)&&!author(n)&&!navigation(n)&&!n.disabled&&label(n)));
  for(const n of all('span,div')){
   if(!exists(n)||!label(n))continue;
   const ancestor=n.closest?.('button,[role="button"],a[href]');
   if(ancestor&&exists(ancestor)&&!author(ancestor)&&!navigation(ancestor)&&!ancestor.disabled)controls.add(ancestor);
  }
  const controlArray=Array.from(controls);
  function localCommonContainer(button){
   for(let n=button.parentElement,depth=0;n&&depth<14;n=n.parentElement,depth++){
    if(['BODY','HTML','MAIN'].includes(n.tagName)||navigation(n)||author(n))break;
    if(!exists(n))continue;
    const t=content(n);
    // The notice and the button must be part of a small component, not a
    // giant transcript-level container containing an unrelated CTA.
    if(t.length<=1100&&warning.test(t))return true;
   }
   return false;
  }
  function bounds(n){
   const r=n.getBoundingClientRect?.();
   return r&&[r.left,r.top,r.right,r.bottom].every(Number.isFinite)?r:null;
  }
  function nearby(button){
   const a=bounds(button);
   if(!a)return false;
   return notices.some(n=>{
    const b=bounds(n);
    if(!b)return false;
    // Two separately portaled DOM components can still be inside the same
    // visible red alert. Require a same-line or immediately wrapped CTA.
    const horizontalGap=Math.max(0,a.left-b.right,b.left-a.right);
    const verticalGap=Math.max(0,a.top-b.bottom,b.top-a.bottom);
    const verticalCentres=Math.abs((a.top+a.bottom-b.top-b.bottom)/2);
    return horizontalGap<=350&&verticalGap<=50&&verticalCentres<=110;
   });
  }
  const matches=controlArray.filter(n=>localCommonContainer(n)||nearby(n));
  const detail={noticeCount:notices.length,buttonCount:controlArray.length,associated:matches.length};
  if(matches.length!==1)return {state:'blocked',reason:matches.length?'Plusieurs boutons de continuation possibles.':'Conversation pleine reconnue, mais bouton associé introuvable.',...detail};
  const editor=document.querySelector('#prompt-textarea,[data-testid="composer-input"],form textarea,form [contenteditable="true"],form [contenteditable="plaintext-only"]');
  const draft=compact(editor&&('value' in editor?editor.value:editor.innerText||editor.textContent));
  if(draft)return {state:'blocked',reason:'Brouillon présent dans la conversation pleine ; aucune navigation.',...detail};
  if(!doClick)return {state:'full',...detail};
  matches[0].click();
  return {state:'clicked',...detail};
 }
 async function restore(job,activationId){
  const {devRollover:pending,settings}=await chrome.storage.local.get(['devRollover','settings']);
  if(!pending||ChatConversations.key(settings?.devUrl)!==ChatConversations.key(pending.oldUrl))return null;
  const target=await waitCandidate(pending.oldUrl,pending.oldTabId,pending.knownIds);
  if(!target)throw Error('Relève du Programmeur interrompue : pas d’URL réelle. Aucun clic ni envoi automatique.');
  return commit(pending.oldUrl,target,job,activationId);
 }
 function candidates(tabs,old,oldTabId,knownIds){
  const oldKey=ChatConversations.key(old);
  return tabs.filter(t=>{
   const k=ChatConversations.key(t.url);
   return k&&k!==oldKey&&sameOrigin(t.url,old)&&(t.id===oldTabId||(knownIds&&!knownIds.includes(t.id)&&t.openerTabId===oldTabId));
  });
 }
 async function waitCandidate(old,oldTabId,knownIds){
  for(let i=0;i<24;i++){
   const found=candidates(await chrome.tabs.query({}),old,oldTabId,knownIds);
   if(found.length>1)throw Error('Plusieurs nouvelles conversations possibles ; aucune réaffectation.');
   if(found.length===1)return found[0];
   await delay(500);
  }
  return null;
 }
 async function commit(old,newTab,job,activationId){
  const key=ChatConversations.key(newTab.url);
  if(!key||key===ChatConversations.key(old))throw Error('URL canonique de la nouvelle conversation non obtenue.');
  const data=await chrome.storage.local.get(['settings','runtime','devRollover','conversationHistory']);
  if(!data.runtime?.enabled||data.runtime.activationId!==activationId||ChatConversations.key(data.settings?.devUrl)!==ChatConversations.key(old))
   throw Error('Réglage ou activation changé pendant la relève ; aucune affectation automatique.');
  const title=ChatConversations.title(newTab.title);
  const settings={...data.settings,devUrl:key,devTitle:title};
  const record={role:'dev',cycle:job.value.cycle_id,billet:job.value.billet,previousUrl:old,newUrl:key,rawTabTitle:newTab.title||'',title,changedAt:new Date().toISOString()};
  await chrome.storage.local.set({settings,conversationHistory:[...(data.conversationHistory||[]),record].slice(-100),devRollover:null});
  return {tab:newTab,previousUrl:old,newUrl:key,title};
 }
 async function prepare(tab,job,activationId){
  const old=ChatConversations.key(tab.url);
  const {devRollover:pending}=await chrome.storage.local.get('devRollover');
  if(pending&&ChatConversations.key(pending.oldUrl)===old){
   // Never click twice after an ambiguous interruption or reload.
   const target=await waitCandidate(old,pending.oldTabId,pending.knownIds);
   if(!target)throw Error('Continuation du Programmeur en attente : URL réelle non observable. Aucun nouveau clic ni relais ; vérifier l’onglet Edge.');
   return commit(old,target,job,activationId);
  }
  const check=(await chrome.scripting.executeScript({target:{tabId:tab.id},func:detectAndMaybeClick,args:[false]}))?.[0]?.result;
  if(check?.state==='normal')return null;
  if(check?.state!=='full')throw Error('Programmeur : '+(check?.reason||'Détection de conversation pleine incertaine.')+' Aucun relais.');
  const knownIds=(await chrome.tabs.query({})).map(t=>t.id);
  const state={oldUrl:old,oldTabId:tab.id,knownIds,cycle:job.value.cycle_id,createdAt:Date.now()};
  await chrome.storage.local.set({devRollover:state});
  let clicked;
  try{clicked=(await chrome.scripting.executeScript({target:{tabId:tab.id},func:detectAndMaybeClick,args:[true]}))?.[0]?.result;}
  catch(e){throw Error('Clic de continuation incertain : '+String(e.message||e)+' ; aucun deuxième clic automatique.');}
  if(clicked?.state!=='clicked'){
   await chrome.storage.local.remove('devRollover');
   throw Error('Programmeur : '+(clicked?.reason||'Bouton de continuation disparu.')+' ; aucun relais.');
  }
  const target=await waitCandidate(old,tab.id,knownIds);
  if(!target)throw Error('Continuation ouverte, mais aucune URL /c/ définitive observée. Aucun relais envoyé ; état conservé pour récupération.');
  return commit(old,target,job,activationId);
 }
 async function updateTitleIfReady(tabId,expectedUrl){
  try{
   const tab=await chrome.tabs.get(tabId);
   if(ChatConversations.key(tab.url)!==expectedUrl)return;
   const title=ChatConversations.title(tab.title);
   if(!title)return;
   const {settings,conversationHistory=[]}=await chrome.storage.local.get(['settings','conversationHistory']);
   if(ChatConversations.key(settings?.devUrl)!==expectedUrl||settings.devTitle===title)return;
   const records=conversationHistory.map(x=>x.role==='dev'&&x.newUrl===expectedUrl?{...x,title,rawTabTitle:tab.title}:x);
   await chrome.storage.local.set({settings:{...settings,devTitle:title},conversationHistory:records});
  }catch(_){} // Title is not a delivery criterion; URL is authoritative.
 }
 return {detectAndMaybeClick,prepare,restore,updateTitleIfReady};
})();

// --- fresh-chat.js ---
'use strict';
// Fresh chats are opt-in (Programmeur / Verificateur only).  NEVER open a
// tab or Work. A fresh blank ChatGPT page is valid only through its
// persisted tab ID plus the durable delivery receipt, not through its title.
const FreshChat=(()=>{
 const roles=new Set(['dev','qa']);
 const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
 const urlOrigin=url=>{try{const u=new URL(url);return ['https://chatgpt.com','https://chat.openai.com'].includes(u.origin)?u.origin:null;}catch{return null;}};
 const isBlank=url=>{try{const u=new URL(url);return !!urlOrigin(url)&&(u.pathname==='/'||u.pathname==='/new')&&!u.searchParams.has('work');}catch{return false;}};
 // Confirm temporary mode, not merely a blank normal chat.
 const isTemporary=url=>{try{const u=new URL(url);return !!urlOrigin(url)&&u.searchParams.get('temporary-chat')==='true'&&!/^\/work(?:\/|$)/i.test(u.pathname);}catch{return false;}};
 const jobId=(s,job)=>JSON.stringify([s.githubRepo,s.githubBranch,job.role,job.value.cycle_id,job.value.billet,job.value.source_sha,['blocked','qa_return','continuation'].includes(job.signal)?job.relayCommit:'',...(Number(job.value.tentative)>1?[job.value.tentative]:[])]);
 const state=async role=>(await chrome.storage.local.get('freshPending')).freshPending?.[role]||null;
 async function save(role,pending){const {freshPending={}}=await chrome.storage.local.get('freshPending');if(pending)freshPending[role]=pending;else delete freshPending[role];await chrome.storage.local.set({freshPending});}
 // Browser-page-only function, injected by chrome.scripting.executeScript.
 function oldPageSafe(){
  const editors=Array.from(document.querySelectorAll('#prompt-textarea,[data-testid="composer-input"],.ProseMirror[contenteditable],form textarea,[role="textbox"][contenteditable]'));
  const visible=editors.filter(e=>e.isConnected&&e.getClientRects().length);
  const draft=visible.map(e=>String(e.value??e.innerText??e.textContent??'').trim()).find(Boolean);
  const busy=Array.from(document.querySelectorAll('button[data-testid="stop-button"],button[aria-label]')).some(b=>b.getClientRects().length&&/stop generating|stop response|arrêter la génération|arrêter la réponse/i.test(b.getAttribute('aria-label')||b.getAttribute('data-testid')||''));
  return {ok:visible.length>0&&!draft&&!busy,reason:draft?'Brouillon présent dans l’onglet : aucun remplacement.':busy?'Réponse en cours : aucun remplacement.':!visible.length?'Compositeur précédent introuvable : aucun remplacement.':''};
 }
 // Model selection is best-effort: the user has configured GPT-6 High as
 // the default. A missing/changed picker MUST NOT block delivery. The Work
 // controls stay excluded and the destination URL is validated separately.
 async function chooseHigh(){
  const pause=ms=>new Promise(done=>setTimeout(done,ms));
  const visible=e=>!!e?.isConnected&&!!e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';
  const name=e=>[e.getAttribute?.('aria-label'),e.getAttribute?.('data-testid'),e.getAttribute?.('title'),e.innerText,e.textContent].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
  const never=/\bwork\b|espace de travail|workspace|projets?\b|codex|computer use/i;
  const gpt6=/\bGPT\s*[- ]?6\b/i;
  const high=/\bHigh\b|\bÉlevé\b|\bEleve\b|\bÉtendu\b|\bEtendu\b|réflexion approfondie/i;
  const elements=()=>Array.from(document.querySelectorAll('button,[role="button"],[role="menuitem"],[role="option"],[role="radio"],[role="menuitemradio"]')).filter(visible);
  const triggers=()=>elements().filter(e=>!never.test(name(e))&&(/model|modèle|thinking|réflexion|effort|picker|selector/i.test(name(e))||gpt6.test(name(e))||high.test(name(e))));
  const positive=()=>{
   const nodes=triggers();
   const chosen=e=>e.getAttribute('aria-selected')==='true'||e.getAttribute('aria-checked')==='true'||e.getAttribute('data-state')==='checked';
   const displayed=e=>!['option','menuitem','menuitemradio','radio'].includes(e.getAttribute('role'));
   const model=nodes.some(e=>gpt6.test(name(e))&&(chosen(e)||displayed(e)));
   const effort=nodes.some(e=>high.test(name(e))&&(chosen(e)||displayed(e)));
   return {model,effort};
  };
  const click=async e=>{e.click();await pause(280);};
  // Open model selector in the composer first, never any Work or sidebar entry.
  let choices=elements();
  let modelChosen=false,highChosen=false;
  const picker=choices.find(e=>/model-selector|model-picker|composer.*model|model-switcher/i.test(name(e)))
    ||choices.find(e=>!never.test(name(e))&&gpt6.test(name(e)))
    ||choices.find(e=>!never.test(name(e))&&/^(?:instant|medium|high|extra high|gpt[- ]?6|moyen|élevé)$/i.test((e.innerText||'').trim()));
  if(!picker)return {ok:true,verified:false,warning:'Sélecteur de modèle introuvable : conservation du modèle par défaut (GPT-6 High attendu).'};
  modelChosen=gpt6.test(name(picker));
  await click(picker);
  choices=elements();
  const option=(re)=>choices.find(e=>!never.test(name(e))&&re.test((e.innerText||e.textContent||'').trim())&&e!==picker&&e.getAttribute('aria-expanded')!=='true');
  // Some interfaces have a GPT-6 family submenu; others show only its efforts.
  let modelOption=option(/^GPT\s*[- ]?6(?:\s|$)/i);
  if(modelOption){await click(modelOption);modelChosen=true;choices=elements();}
  let highOption=option(/^(?:High|Élevé|Eleve|Réflexion approfondie)(?:\s|$)/i);
  if(!highOption){
   const select=elements().find(e=>!never.test(name(e))&&/thinking|effort|réflexion/i.test(name(e))&&e!==picker);
   if(select){await click(select);choices=elements();highOption=option(/^(?:High|Élevé|Eleve|Réflexion approfondie)(?:\s|$)/i);}
  }
  if(highOption){await click(highOption);highChosen=true;}
  const now=positive();
  // When the closed picker only displays "High", reopen for GPT-6 evidence.
  if(!now.model&&!modelChosen){
   const button=triggers().find(e=>/model|modèle|picker|GPT/i.test(name(e)));
   if(button){await click(button);const menu=elements().filter(e=>e.getAttribute('role')==='menuitemradio'||e.getAttribute('role')==='option'||e.getAttribute('role')==='menuitem');now.model=menu.some(e=>gpt6.test(name(e))&&(e.getAttribute('aria-checked')==='true'||e.getAttribute('aria-selected')==='true'));button.click();}
  }
  if(!(now.model||modelChosen)||!(now.effort||highChosen))return {ok:true,verified:false,warning:'GPT-6 High non confirmé dans le sélecteur : conservation de la sélection actuelle.'};
  return {ok:true,verified:true};
 }
 async function tabFor(p,job,s,r,allowOldActivation=false){
  if(p.jobId!==jobId(s,job)||(!allowOldActivation&&p.activationId!==r.activationId))throw Error('Nouvelle conversation inachevée sur un autre relais : intervention requise, aucun deuxième démarrage.');
  let tab;
  try{tab=await chrome.tabs.get(p.tabId);}catch{throw Error('Onglet de la nouvelle conversation fermé : aucun nouvel onglet ouvert.');}
  if(!urlOrigin(tab.url))throw Error('Onglet du rôle détourné hors ChatGPT ; aucun relais.');
  return tab;
 }
 // An explicit manual role selection may supersede an unsent blank-chat handoff.
 // Keep the pending record intact if it moved beyond 'ready' or changed mid-read.
 async function abandonReady(role,expected){
  if(!roles.has(role)||!expected||expected.role!==role||expected.phase!=='ready')return false;
  const stored=await chrome.storage.local.get('freshPending'),all=stored.freshPending||{},current=all[role];
  if(!current||current.phase!=='ready'||current.jobId!==expected.jobId||
   current.tabId!==expected.tabId||current.createdAt!==expected.createdAt)return false;
  const next={...all};delete next[role];
  await chrome.storage.local.set({freshPending:next});
  return true;
 }
 async function prepare(tab,s,job,r){
  if(!roles.has(job.role)||!s[job.role+'Fresh'])return null;
  const role=job.role;
  let p=await state(role);
  if(p){
   // Sur une reprise « Démarrer », l'activation change. Adopter le même onglet
   // uniquement s'il n'existe aucun reçu (donc aucun envoi autorisé).
   tab=await tabFor(p,job,s,r,true);
   if(!isBlank(tab.url)||!isTemporary(tab.url))throw Error('Relève '+role+' non temporaire ou onglet déplacé : aucun envoi automatique.');
   if(p.activationId!==r.activationId){
    const key=Delivery.key(s,job,p.previousUrl);
    if(await Delivery.read(key))throw Error('Relève liée à une précédente activation avec reçu : réessai automatique interdit.');
    p={...p,activationId:r.activationId,phase:'navigation'};
    await save(role,p);
   }
  }
  else{
   if(ChatConversations.key(tab.url)!==ChatConversations.key(s[role+'Url']))throw Error('Onglet associé au rôle modifié ; aucune nouvelle conversation.');
   const safe=(await chrome.scripting.executeScript({target:{tabId:tab.id},func:oldPageSafe}))?.[0]?.result;
   if(!safe?.ok)throw Error(role+' : '+(safe?.reason||'État du compositeur précédent inconnu.'));
   const origin=urlOrigin(tab.url);
   if(!origin)throw Error('Origine ChatGPT non reconnue.');
   p={role,jobId:jobId(s,job),activationId:r.activationId,tabId:tab.id,previousUrl:ChatConversations.key(tab.url),previousTitle:s[role+'Title']||'',phase:'navigation',createdAt:Date.now()};
   await save(role,p); // Durable BEFORE we change the existing tab.
   await chrome.tabs.update(tab.id,{url:origin+'/?temporary-chat=true'}); // Temporary Chat, same tab, never Work.
  }
  for(let i=0;i<35;i++){
   tab=await chrome.tabs.get(p.tabId);
   if(isBlank(tab.url)&&isTemporary(tab.url)&&tab.status==='complete')break;
   if(!urlOrigin(tab.url)||(/\/work(?:\/|$)/i).test(new URL(tab.url).pathname))throw Error('Navigation hors ChatGPT standard : aucun relais.');
   await sleep(350);
  }
  if(!isBlank(tab.url)||!isTemporary(tab.url)||tab.status!=='complete')throw Error('Conversation temporaire non confirmée dans l’onglet existant ; aucun envoi normal.');
  // L'interface du sélecteur évolue indépendamment de l'envoi : ne pas
  // transformer son absence ou une erreur d'injection en blocage du relais.
  let model;
  try{model=(await chrome.scripting.executeScript({target:{tabId:p.tabId},func:chooseHigh}))?.[0]?.result;}
  catch(e){model={ok:true,verified:false,warning:'Sélecteur inaccessible ('+String(e?.message||e)+') : modèle par défaut conservé.'};}
  if(!model?.ok)model={ok:true,verified:false,warning:model?.reason||'Modèle non vérifié : sélection par défaut conservée.'};
  // Revalidate the SAME tab, origin and blank page after optional UI actions.
  tab=await chrome.tabs.get(p.tabId);
  if(!isBlank(tab.url)||!isTemporary(tab.url)||tab.status!=='complete')throw Error('Onglet sorti de la conversation temporaire ChatGPT ; aucun envoi.');
  p={...p,phase:'ready'};await save(role,p);
  return {tab,mode:'nouvelle-conversation',pending:p,model};
 }
 async function complete(role,job,s,r,wasSent){
  if(!wasSent)return null;
  const p=await state(role);
  if(!p)return null;
  const initial=await tabFor(p,job,s,r,true);
  if(p.phase==='canonical'&&ChatConversations.key(initial.url)===p.newUrl)
   return {tab:initial,newUrl:p.newUrl,previousUrl:p.previousUrl};
  await save(role,{...p,phase:'await-canonical'});
  for(let i=0;i<36;i++){
   const tab=await chrome.tabs.get(p.tabId);
   const key=ChatConversations.key(tab.url);
   if(key&&key!==p.previousUrl&&isTemporary(tab.url)){
    // Keep the pending record until the receipt is moved AND settings are
    // committed. A restart between these steps can safely recover.
    await save(role,{...p,phase:'canonical',newUrl:key});
    return {tab,newUrl:key,previousUrl:p.previousUrl};
   }
   if(!isBlank(tab.url)||!isTemporary(tab.url))throw Error('Après envoi, onglet sans URL temporaire reconnue ; reçu conservé, aucun second envoi.');
   await sleep(450);
  }
  throw Error('Message envoyé, mais URL /c/ pas encore obtenue. Relève conservée, aucun second envoi.');
 }
 async function commit(role,job,s,r,newUrl){
  const p=await state(role);
  if(!p||p.phase!=='canonical'||p.newUrl!==newUrl)throw Error('Finalisation de nouvelle conversation sans état canonique.');
  const tab=await tabFor(p,job,s,r,true);
  if(ChatConversations.key(tab.url)!==newUrl||!isTemporary(tab.url))throw Error('L’onglet ne porte plus la conversation temporaire finale.');
  const stored=await chrome.storage.local.get(['settings','runtime','freshPending','conversationHistory']);
  if(stored.settings?.[role+'Url']!==p.previousUrl)throw Error('Réglage modifié pendant la relève ; URL nouvelle non réaffectée.');
  const title=ChatConversations.title(tab.title);
  const record={role,cycle:job.value.cycle_id,billet:job.value.billet,previousUrl:p.previousUrl,newUrl,temporary:true,title,rawTabTitle:tab.title||'',changedAt:new Date().toISOString()};
  const next={...stored.freshPending};delete next[role];
  await chrome.storage.local.set({settings:{...stored.settings,[role+'Url']:newUrl,[role+'Title']:title},freshPending:next,conversationHistory:[...(stored.conversationHistory||[]),record].slice(-100)});
  return {tab,newUrl,previousUrl:p.previousUrl};
 }
 return {state,prepare,complete,commit,abandonReady,isBlank,isTemporary,jobId,oldPageSafe,chooseHigh};
})();

// --- github-worker.js ---
const ALARM_GITHUB='reveil_github';
function githubConfig(s){
 if(!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/.test(s.githubRepo||''))throw Error('URL du dépôt GitHub invalide.');
 if(!s.githubBranch||/[\s?#]/.test(s.githubBranch))throw Error('Branche de collaboration invalide.');
 if(!Number.isInteger(s.githubTabId))throw Error('Sélectionne un onglet GitHub authentifié.');
 if(!Number.isInteger(s.githubPollSeconds)||s.githubPollSeconds<30||s.githubPollSeconds>3600)throw Error('Surveillance : 30 à 3600 secondes.');
}
// Runs in the selected GitHub tab; session cookies stay in the browser.
async function readGitHubWeb(repo,branch,blockedHold){
 // Compare JSON values independently of object-key order across Chrome messaging/storage.
 // Arrays retain their order; every field and primitive value remains significant.
 const canonicalJSON=v=>Array.isArray(v)?'['+v.map(canonicalJSON).join(',')+']':v!==null&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonicalJSON(v[k])).join(',')+'}':JSON.stringify(v);
 let stage="authentification";
 try{
 if(location.origin!=='https://github.com'||!document.querySelector('meta[name="user-login"]')?.content)
  throw Error('Onglet GitHub non authentifié. Connecte-toi dans cet onglet.');
 const base=new URL(repo).pathname.replace(/\/$/,'');
 async function page(path){stage=path;const r=await fetch(path,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(!r.ok||new URL(r.url).pathname.startsWith('/login'))throw Error('Lecture GitHub refusée : '+r.status);
  return r.text();}
 const xml=new DOMParser().parseFromString(await page(base+'/commits/'+encodeURIComponent(branch)+'.atom?reveil='+Date.now()),'application/xml');
 const head=xml.querySelector('entry > id')?.textContent?.match(/[a-f0-9]{40}$/i)?.[0];
 if(!head)throw Error('Commit GitHub introuvable (branche, session ou interface).');
 async function file(path,optional=false,ref=head){
  // JSON and Markdown have different HTML viewers. Read the actual bytes instead.
  const rawPath=base+'/raw/'+ref+'/'+path+'?reveil='+Date.now();
  try{
   const response=await fetch(rawPath,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000)});
   if(optional&&response.status===404)return null;
   if(!response.ok)throw Error('HTTP '+response.status);
   const text=await response.text();
   if(new URL(response.url).pathname.startsWith('/login')||/^\s*(?:<!doctype html|<html)/i.test(text))
    throw Error('page HTML reçue à la place du fichier brut (session ou accès)');
   if(path.endsWith('.json')){
    try{JSON.parse(text);}catch{throw Error('contenu brut non JSON');}
   }
   return text;
  }catch(e){throw Error(path+' : lecture brute refusée — '+String(e?.message||e));}
 }
 const paths=['collaboration/architecte/autorisation.json','collaboration/programmeur/livraison.json','collaboration/verificateur/verification.json','collaboration/architecte/masterticket.md'];
 stage='fichiers du relais';
 const texts=await Promise.all(paths.map(path=>file(path)));
 let report=await file('collaboration/verificateur/rapport.md',true);
 const claims=await Promise.all(['programmeur','verificateur','architecte'].map(async role=>{const value=await file('collaboration/'+role+'/prise_en_charge.json',true);return value?JSON.parse(value):null;}));
 const statusText=await file('collaboration/programmeur/statut.json',true);
 const programmerStatus=statusText?JSON.parse(statusText):null;
 const missionText=await file('collaboration/architecte/mission.json',true);
 const diagnosticText=await file('collaboration/diagnostic/retour.json',true);
 const mission=missionText?JSON.parse(missionText):null;
 const diagnostic=diagnosticText?JSON.parse(diagnosticText):null;
 const authorization=JSON.parse(texts[0]);
 async function lastChange(path){
  const historyPath=base+'/commits/'+head+'/'+path;
  try{
   const feed=new DOMParser().parseFromString(await page(historyPath+'.atom?reveil='+Date.now()),'application/xml');
   const sha=feed.querySelector('entry > id')?.textContent?.match(/[a-f0-9]{40}$/i)?.[0];
   if(sha)return sha;
  }catch(_){ /* Some GitHub layouts no longer expose file Atom feeds. */ }
  const history=new DOMParser().parseFromString(await page(historyPath+'?reveil='+Date.now()),'text/html');
  for(const anchor of history.querySelectorAll('a[href]')){
   const href=anchor.getAttribute('href')||'';
   const match=href.match(/\/commit\/([a-f0-9]{40})(?:[?#]|$)/i);
   if(match&&(href.startsWith(base+'/commit/')||href.startsWith('https://github.com'+base+'/commit/')))return match[1];
  }
  for(const script of history.querySelectorAll('script[type="application/json"]')){
   try{
    const parsed=JSON.parse(script.textContent);
    const groups=parsed?.payload?.commitGroups||parsed?.props?.initialPayload?.commitGroups;
    const first=groups?.[0]?.commits?.[0];
    const sha=first?.oid||first?.sha;
    if(/^[a-f0-9]{40}$/i.test(sha||''))return sha;
   }catch(_){}
  }
  throw Error('Dernier commit du fichier introuvable : '+path+' ; aucun envoi.');
 }
 let authorizationCommit=null,statusCommit=null,statusSuperseded=false;
 const blocked=programmerStatus?.etat==='bloque'&&programmerStatus.cycle_id===authorization.cycle_id;
 if(blocked||blockedHold){
  const commits=await Promise.all([lastChange('collaboration/architecte/autorisation.json'),blocked?lastChange('collaboration/programmeur/statut.json'):Promise.resolve(null)]);
  [authorizationCommit,statusCommit]=commits;
  if(blocked){
   const frozen=JSON.parse(await file('collaboration/programmeur/statut.json',false,statusCommit));
   if(canonicalJSON(frozen)!==canonicalJSON(programmerStatus))throw Error('Le statut figé diffère du statut observé ; aucun envoi.');
   const frozenAuthorization=JSON.parse(await file('collaboration/architecte/autorisation.json',false,statusCommit));
   statusSuperseded=canonicalJSON(frozenAuthorization)!==canonicalJSON(authorization);
  }
 }
 // Un retour QA garde SON commit même après publication d’une prise ou
 // d’un checkpoint. La tête générale de main n’identifie pas cet événement.
 if(!authorizationCommit)authorizationCommit=await lastChange('collaboration/architecte/autorisation.json');
 const delivery=JSON.parse(texts[1]),verification=JSON.parse(texts[2]);
 let deliveryCommit=null,verificationCommit=null;
 if(delivery?.etat==='termine'&&delivery.cycle_id===authorization.cycle_id&&delivery.autorisation_commit_sha===authorizationCommit){
  if(verification?.etat==='termine'&&verification.cycle_id===delivery.cycle_id&&verification.source_sha===delivery.source_sha&&(verification.tentative||1)===(delivery.tentative||1)){
   verificationCommit=await lastChange('collaboration/verificateur/verification.json');
   const frozen=JSON.parse(await file('collaboration/verificateur/verification.json',false,verificationCommit));
   if(canonicalJSON(frozen)!==canonicalJSON(verification))throw Error('La vérification figée diffère du signal observé.');
   report=await file('collaboration/verificateur/rapport.md',false,verificationCommit);
  }else deliveryCommit=await lastChange('collaboration/programmeur/livraison.json');
 }
 const missionCommit=(!authorization?.etat&&mission?.etat==='a_instruire')?await lastChange('collaboration/architecte/mission.json'):null;
 const diagnosticCommit=(diagnostic?.etat&&diagnostic?.cycle_id===delivery?.cycle_id&&diagnostic?.source_sha===delivery?.source_sha)?await lastChange('collaboration/diagnostic/retour.json'):null;
 return {ok:true,head,claims,authorization,delivery,verification,report,master:texts[3],mission,missionCommit,diagnostic,diagnosticCommit,programmerStatus,statusCommit,authorizationCommit,statusSuperseded,deliveryCommit,verificationCommit};
 }catch(e){return {ok:false,error:stage+' : '+String(e?.message||e)};}
}
async function validateRelayWeb(repo,head,job){
 // Compare JSON values independently of object-key order across Chrome messaging/storage.
 // Arrays retain their order; every field and primitive value remains significant.
 const canonicalJSON=v=>Array.isArray(v)?'['+v.map(canonicalJSON).join(',')+']':v!==null&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonicalJSON(v[k])).join(',')+'}':JSON.stringify(v);
 try{
 const base=new URL(repo).pathname.replace(/\/$/,'');
 const response=await fetch(base+'/commit/'+head+'.patch',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('Impossible de confirmer le commit du relais.');
 const patch=await response.text();
 const changed=new Set(Array.from(patch.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gm),m=>m[2]));
 const pairs={dev:['collaboration/architecte/autorisation.json'],qa:['collaboration/programmeur/livraison.json'],arch:['collaboration/diagnostic/retour.json']};
 const checkpoint=['blocked','continuation'].includes(job.signal);
 const required=checkpoint?['collaboration/programmeur/statut.json']:job.signal==='bootstrap'?['collaboration/architecte/mission.json','collaboration/architecte/masterticket.md']:job.signal==='qa_return'?['collaboration/verificateur/verification.json','collaboration/verificateur/rapport.md']:job.signal==='diagnostic_return'?['collaboration/diagnostic/retour.json']:pairs[job.role];
 if(!required.every(p=>changed.has(p)))throw Error('Le commit courant ne clôture pas ensemble les fichiers du relais. Republier le relais complet dans un même commit.');
 if(checkpoint){
  if(head!==job.relayCommit)throw Error('Le relais doit viser le commit exact du statut.');
  const raw=await fetch(base+'/raw/'+head+'/collaboration/programmeur/statut.json',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(!raw.ok||canonicalJSON(await raw.json())!==canonicalJSON(job.value))throw Error('Statut figé non conforme au relais ; aucun envoi.');
 }
 if(['bootstrap','diagnostic','diagnostic_return'].includes(job.signal)){
  const path=job.signal==='bootstrap'?'collaboration/architecte/mission.json':'collaboration/diagnostic/retour.json';
  const raw=await fetch(base+'/raw/'+head+'/'+path,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(!raw.ok)throw Error('Preuve GitHub indisponible : '+path);
  const frozen=await raw.json();
  if(job.signal==='diagnostic_return'){
   if(frozen.source_sha!==job.value.source_sha||!['echec_compilation','echec_execution'].includes(frozen.etat))throw Error('Échec de diagnostic non confirmé.');
  }else if(canonicalJSON(frozen)!==canonicalJSON(job.value))throw Error('Preuve du relais modifiée.');
  if(job.signal==='diagnostic'){
   if(!/^diagnostics\/runs\/[0-9_]+\/manifest\.json$/.test(frozen.manifest_path))throw Error('Chemin du manifeste invalide.');
   const m=await fetch(base+'/raw/'+head+'/'+frozen.manifest_path,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000)});
   if(!m.ok)throw Error('Manifeste absent sur GitHub.');
   const manifest=await m.json();
   if(manifest.complete!==true||manifest.source_commit!==frozen.source_sha||manifest.verification_commit_sha!==frozen.verification_commit_sha||
      manifest.cycle_id!==frozen.cycle_id||manifest.billet!==frozen.billet||Number(manifest.tentative)!==Number(frozen.tentative)||
      manifest.run_id!==frozen.run_id||!Array.isArray(manifest.jpeg_files)||manifest.jpeg_files.length<6||manifest.jpeg_files.length>12||
      manifest.errors?.length)throw Error('Diagnostic incomplet, incorrect ou lié à un autre code.');
   for(const name of manifest.jpeg_files){
    if(!/^\d\d_[\w-]+\.jpg$/.test(name))throw Error('Nom de capture invalide.');
    const jpg='diagnostics/runs/'+frozen.run_id+'/screenshots/'+name;
    const im=await fetch(base+'/raw/'+head+'/'+jpg,{method:'HEAD',credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000)});
    if(!im.ok)throw Error('Capture GitHub manquante : '+jpg);
   }
  }
 }
 if(job.signal==='qa_return'){
  const raw=await fetch(base+'/raw/'+head+'/collaboration/verificateur/verification.json',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(!raw.ok||canonicalJSON(await raw.json())!==canonicalJSON(job.verification))throw Error('Retour QA figé non conforme ; aucune correction lancée.');
 }
 if(['delivery','verification','authorization'].includes(job.signal)){
  const path=job.signal==='delivery'?'collaboration/programmeur/livraison.json':job.signal==='verification'?'collaboration/verificateur/verification.json':'collaboration/architecte/autorisation.json';
  const raw=await fetch(base+'/raw/'+head+'/'+path,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(!raw.ok||canonicalJSON(await raw.json())!==canonicalJSON(job.value))throw Error('Le signal figé ne correspond pas aux données du relais.');
 }
 const refs=checkpoint?[job.value.source_sha,job.value.base_sha,job.value.autorisation_commit_sha]:[job.value.source_sha];
 if(!checkpoint&&job.signal!=='bootstrap'&&(job.role!=='dev'||['qa_return','diagnostic_return'].includes(job.signal)))refs.push(job.authorizationCommit||job.value.autorisation_commit_sha);
 if(job.signal==='delivery'&&Number(job.value.tentative)>1){
  refs.push(job.value.retour_qa_commit_sha);
  const raw=await fetch(base+'/raw/'+job.value.retour_qa_commit_sha+'/collaboration/verificateur/verification.json',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(!raw.ok)throw Error('Retour QA de la livraison corrigée inaccessible.');
  const v=await raw.json();
  if(v.cycle_id!==job.value.cycle_id||v.billet!==job.value.billet||v.source_sha!==job.value.base_sha||v.autorisation_commit_sha!==job.value.autorisation_commit_sha||(v.tentative||1)!==job.value.tentative-1 )throw Error('La correction ne prolonge pas la tentative précédente.');
 }
 for(const sha of refs){const r=await fetch(base+'/commit/'+sha,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Commit référencé inaccessible : '+sha);}
 return {ok:true};
 }catch(e){return {ok:false,error:String(e?.message||e)};}
}
let githubBusy=false,githubReadToken=null;
function githubDeadline(work,ms,label){
 let timer;
 return Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label+' : délai dépassé ; lecture abandonnée, reprise disponible.')),ms);})]).finally(()=>clearTimeout(timer));
}
async function scheduleGitHubRead(restart=false){
 if(restart&&githubReadToken)githubReadToken.cancelled=true;
 if(githubBusy&&!restart)return;
 const token={cancelled:false};githubReadToken=token;githubBusy=true;
 try{await githubPoll(token);}finally{if(githubReadToken===token){githubBusy=false;githubReadToken=null;}}
}
async function githubPoll(token={cancelled:false}){
 await deliveryBoot;
 const {settings:s={},runtime:r={},githubState:g={},blockedHolds={}}=await chrome.storage.local.get(['settings','runtime','githubState','blockedHolds']);
 if(!r.enabled||s.mode!=='github'||token.cancelled)return;
 const priorLocal=g.localStatus;
 try {
  const response=await fetch('http://127.0.0.1:42716/status',{cache:'no-store',signal:AbortSignal.timeout(2200)});
  if(response.ok){
   const local=await response.json();
   if(local.schema_version===1&&/^[a-f0-9]{40}$/.test(local.head||'')){
    g.localStatus={...local,connected:true};
    if(priorLocal?.head&&priorLocal.head!==local.head)
     await appendLog('Propriétaire','HEAD local modifié : '+local.head.slice(0,9)+(local.last_head_action?' · '+local.last_head_action:''));
    if(local.diagnostic?.run_id&&
       (priorLocal?.diagnostic?.run_id!==local.diagnostic.run_id||priorLocal?.diagnostic?.etat!==local.diagnostic.etat))
     await appendLog('Propriétaire','Diagnostic '+local.diagnostic.etat+' · '+local.diagnostic.run_id);
   }
  }
 }catch{g.localStatus={connected:false};}
 g.status='Lecture GitHub en cours…';g.lastStarted=Date.now();g.selectedRole=null;g.retryAvailable=false;
 await chrome.storage.local.set({githubState:g});
 const previousStatus=g.status;
 async function recordStatus(){if(g.status!==previousStatus)await appendLog('GitHub',g.status);}
 try{
  githubConfig(s);const tab=await chrome.tabs.get(s.githubTabId);
  if(!tab.url?.startsWith('https://github.com/'))throw Error('L’onglet GitHub choisi est fermé ou a changé de site.');
  const result=await githubDeadline(chrome.scripting.executeScript({target:{tabId:tab.id},func:readGitHubWeb,args:[s.githubRepo,s.githubBranch,blockedHolds[JSON.stringify([s.githubRepo.toLowerCase().replace(/\/$/,''),s.githubBranch])]??null]}),75000,'Lecture de l’onglet GitHub');
  if(token.cancelled)return;
  const frame=result?.[0];const snap=frame?.result;
  if(!snap)throw Error('Injection GitHub sans retour : '+String(frame?.error?.message||frame?.error||'onglet rechargé ou exécution interrompue'));
  if(snap.ok!==true)throw Error(snap.error||'Réponse GitHub invalide.');
  const holdKey=JSON.stringify([s.githubRepo.toLowerCase().replace(/\/$/,''),s.githubBranch]);
  snap.blockedHold=blockedHolds[holdKey]||null;
  const job=GitHubRelay.select(snap);
  const diagnosticWaiting=!job?GitHubRelay.waiting(snap):null;
  // Ancien statut bloqué : poursuivre côté dev, jamais demander un morcellement.
  if(job?.signal==='continuation')blockedHolds[holdKey]={value:job.value,relayCommit:job.relayCommit,authorizationCommit:job.authorizationCommit};
  else if(snap.blockedHold)delete blockedHolds[holdKey];
  if(token.cancelled)return;
  await chrome.storage.local.set({blockedHolds});
  g.head=snap.head;g.selectedRole=job?.role||null;g.cycle=job?.value.cycle_id||null;g.blockage=null;
  g.workflow=job?{signal:job.signal,tentative:GitHubRelay.attempt(job.value)}:null;
  const roleName={dev:'Programmeur',qa:'Vérificateur',arch:'Architecte'};
  if(r.resumeRole&&job&&r.resumeRole!==job.role){
   g.status='Reprise choisie : '+roleName[r.resumeRole]+' ; prochain relais disponible : '+roleName[job.role]+'. Attente du signal requis, aucun autre rôle lancé.';
   g.lastChecked=Date.now();await chrome.storage.local.set({githubState:g});await recordStatus();return;
  }
  g.status=job?'Relais : '+job.role+' · '+job.value.cycle_id:
    diagnosticWaiting?('À TOI : '+(
     g.localStatus?.diagnostic?.source_sha===diagnosticWaiting.source_sha?
      g.localStatus.diagnostic.etat==='demarre'?'diagnostic local en cours': 'diagnostic local terminé, push des preuves attendu':
      'pull puis diagnostic attendus')+' · '+diagnosticWaiting.billet+' · '+diagnosticWaiting.source_sha.slice(0,9)):
    'Attente d’un relais complet / autorisé';g.awaitingDiagnostic=diagnosticWaiting;g.lastChecked=Date.now();
  if(!job){await chrome.storage.local.set({githubState:g});await recordStatus();return;}
  const claim=(snap.claims||[])[{dev:0,qa:1,arch:2}[job.role]];
  const sameClaim=GitHubRelay.claimMatches(job,claim);
  g.claimId=sameClaim?claim.prise_id:null;
  let relayHead=sameClaim?claim.relais_commit_sha:(job.relayCommit||snap.head);
  let rolloverRestored=false;
  if(job.role==='dev'){
   const restored=await DevRollover.restore(job,r.activationId);
   if(restored){rolloverRestored=true;s.devUrl=restored.newUrl;s.devTitle=restored.title;await appendLog('programmeur','Relève récupérée : '+restored.newUrl);}
  }
  const correctionEvent=['qa_return','diagnostic_return','continuation'].includes(job.signal)||GitHubRelay.attempt(job.value)>1;
  const key=[s.githubRepo,s.githubBranch,job.role,job.value.cycle_id,...(correctionEvent?[job.signal,job.value.tentative||1,job.relayCommit]:[])].join('|');
  let pending=job.role==='arch'?null:await FreshChat.state(job.role);
  if(pending&&['ready','await-canonical','canonical'].includes(pending.phase)){
   const prior=await Delivery.read(Delivery.key(s,job,pending.previousUrl))||await Delivery.read(Delivery.key(s,job,pending.newUrl||pending.previousUrl));
   // « ready » peut être persisté juste AVANT la réservation du reçu.
   // Un redémarrage dans cette fenêtre doit poursuivre le premier envoi.
   // Un reçu existant non transmis reste protégé par Delivery (aucun doublon).
   if(!prior&&pending.phase==='ready'){
    await appendLog(roleName[job.role],'Reprise du fil neuf dans le même onglet (aucun reçu précédent).');
   }else if(prior?.state==='sent'){
    const completed=await FreshChat.complete(job.role,job,s,r,true);
   const movedKey=await Delivery.retarget(s,job,pending.previousUrl,completed.newUrl);
   await FreshChat.commit(job.role,job,s,r,completed.newUrl);
   s[job.role+'Url']=completed.newUrl;s[job.role+'Title']=ChatConversations.title(completed.tab.title);
   await appendLog(roleName[job.role],'Nouvelle conversation récupérée : '+completed.newUrl+' ; reçu '+movedKey);
   pending=null;
   }else if(pending.phase!=='ready')throw Error('Nouvelle conversation en attente de vérification : envoi non confirmé, aucun doublon.');
  }
  // Only the explicit emergency button may override a pending fresh handoff.
  const manualState=(await chrome.storage.local.get('freshManualSelection')).freshManualSelection||{};
  const manual=manualState[job.role];
  const manualAdoption=!pending&&manual?.forced===true&&
   manual.repo===s.githubRepo.toLowerCase().replace(/\/$/,'')&&
   manual.branch===s.githubBranch&&manual.role===job.role&&
   manual.cycle===job.value.cycle_id&&manual.signal===job.signal&&
   manual.tentative===GitHubRelay.attempt(job.value)&&
   manual.destination===ChatConversations.key(s[job.role+'Url']);
  let resolved=pending?{tab:await chrome.tabs.get(pending.tabId),mode:'nouvelle-en-attente'}:ChatConversations.resolve(await chrome.tabs.query({}),s[job.role+'Title'],s[job.role+'Url']);
  if(resolved.error||!resolved.tab)throw Error(resolved.error||'Onglet agent absent.');
  if(pending&&(!FreshChat.isBlank(resolved.tab.url)||!FreshChat.isTemporary(resolved.tab.url)))throw Error('Onglet temporaire déplacé ou désactivé ; aucun renvoi.');
  let freshMode=!!pending;
  let destination=pending?pending.previousUrl:ChatConversations.key(resolved.tab.url);
  let receiptKey=Delivery.key(s,job,destination);
  let receipt=await Delivery.read(receiptKey);
  if(job.role==='dev')await DevRollover.updateTitleIfReady(resolved.tab.id,destination);
  const legacy=correctionEvent?null:g.events?.[key];
  // Import attempts from pre-1.7.4 without turning uncertainty into permission.
  if(!receipt&&legacy?.destination===destination&&['transmis','incertain'].includes(legacy.status)){
   receipt=(await Delivery.remember(receiptKey,{token:'legacy-'+legacy.time,state:legacy.status==='transmis'?'sent':'uncertain',role:job.role,cycle:job.value.cycle_id,destination,relayHead,detail:'Tentative importée de la version précédente'})).entry;
  }
  const knownElsewhere=job.signal!=='blocked'&&sameClaim&&await Delivery.claimedElsewhere(claim.prise_id,destination);
  const changedDestination=!!(legacy?.destination&&legacy.destination!==destination);
  const ignoredClaimId=receipt?.ignoreClaimId||((knownElsewhere||changedDestination)&&sameClaim?claim.prise_id:null);
  g.receiptKey=receiptKey;g.receiptToken=receipt?.token||null;g.receiptState=receipt?.state||null;
  if(sameClaim&&claim.etat==='en_cours'&&claim.prise_id!==ignoredClaimId){
   if(!receipt){receipt=(await Delivery.remember(receiptKey,{token:'claim-'+claim.prise_id,state:'sent',role:job.role,cycle:job.value.cycle_id,destination,relayHead,priseId:claim.prise_id,detail:'Prise en charge GitHub observée'})).entry;g.receiptToken=receipt.token;}
   await Delivery.bindClaim(receiptKey,claim.prise_id);
   g.status=roleName[job.role]+' a pris en charge '+job.value.cycle_id+' — attente de son résultat GitHub.';
   g.receiptState='claimed';g.retryAvailable=!!receipt&&['prepared','committing','sent','uncertain'].includes(receipt.state);
   await chrome.storage.local.set({githubState:g});await recordStatus();return;
  }
  if(manualAdoption){
   // Mark just this selected relay receipt for an explicit resend. When there
   // is no receipt, create a one-shot retry so the composer skips its normal
   // already-present detection (the user confirmed duplicate risk).
   if(!receipt){
    receipt=(await Delivery.remember(receiptKey,{
     token:'manual-'+crypto.randomUUID(),state:'uncertain',
     role:job.role,cycle:job.value.cycle_id,destination,relayHead,
     detail:'Renvoi exceptionnel autorisé manuellement'
    })).entry;
   }
   if(receipt.state!=='retry'){
    if(!['prepared','committing','sent','uncertain'].includes(receipt.state))
     throw Error('Un accusé de réception GitHub existe déjà ; renvoi forcé interdit.');
    const result=await Delivery.retry(receiptKey,receipt.token,g.claimId);
    receipt=result.entry;
   }
  }
  if(receipt&&receipt.state!=='retry'){
   g.retryAvailable=['prepared','committing','sent','uncertain'].includes(receipt.state);
   g.status=roleName[job.role]+(receipt.state==='sent'?' : invitation déjà transmise — attente de la prise en charge GitHub.':' : transmission en cours ou incertaine — aucun renvoi automatique. Utilise « Réessayer volontairement » si nécessaire.');
   g.status+=' État : '+receipt.state+'. '+(receipt.detail||'Aucun résultat de transmission enregistré.')+' Destination : '+receipt.destination;
   await chrome.storage.local.set({githubState:g});await recordStatus();return;
  }
  // The programmer alone may outgrow its conversation. Check BEFORE
  // preparing any delivery receipt; a canonical new URL must exist first.
  if(job.role==='dev'&&!receipt&&!rolloverRestored&&!freshMode&&!s.devFresh&&!manualAdoption){
   const moved=await DevRollover.prepare(resolved.tab,job,r.activationId);
   if(moved){
    s.devUrl=moved.newUrl;s.devTitle=moved.title;
    resolved={tab:moved.tab,mode:'rotation-programmeur'};
    destination=moved.newUrl;
    receiptKey=Delivery.key(s,job,destination);
    receipt=await Delivery.read(receiptKey);
    g.receiptKey=receiptKey;g.receiptToken=receipt?.token||null;g.receiptState=receipt?.state||null;
    await appendLog('programmeur','Conversation pleine : relève vers '+destination,'Ancienne : '+moved.previousUrl+' ; titre : '+(moved.title||'(provisoire)'));
    if(receipt&&receipt.state!=='retry'){
     g.status='Programmeur : nouveau fil déjà doté d’un reçu ('+receipt.state+'). Aucun doublon.';
     g.retryAvailable=true;await chrome.storage.local.set({githubState:g});return;
    }
   }
  }
  if(!receipt&&!manualAdoption&&['dev','qa'].includes(job.role)&&s[job.role+'Fresh']){
   const moved=await FreshChat.prepare(resolved.tab,s,job,r);
   if(moved){freshMode=true;pending=moved.pending;resolved={tab:moved.tab,mode:moved.mode};destination=pending.previousUrl;receiptKey=Delivery.key(s,job,destination);receipt=await Delivery.read(receiptKey);
    await appendLog(roleName[job.role],'Chat temporaire dans le même onglet : '+(moved.model?.verified?'GPT-6 High confirmé.':'sélecteur non vérifié ; modèle par défaut conservé.')+(moved.model?.warning?' '+moved.model.warning:''));
   }
  }
  if(receipt?.relayHead)relayHead=receipt.relayHead;
  g.events=g.events||{};
  g.status='Validation du relais pour '+roleName[job.role]+'…';await chrome.storage.local.set({githubState:g});
  const proof=await githubDeadline(chrome.scripting.executeScript({target:{tabId:tab.id},func:validateRelayWeb,args:[s.githubRepo,relayHead,job]}),35000,'Validation du relais');
  if(token.cancelled)return;
  if(proof?.[0]?.result?.ok!==true)throw Error(proof?.[0]?.result?.error||'Validation du commit interrompue ; aucun envoi.');
  const rolePaths={dev:'programmeur',qa:'verificateur',arch:'architecte'};
  let prompt=`Dépôt ${s.githubRepo}. Ton rôle : ${rolePaths[job.role]}. Lis gabarit.md puis uniquement collaboration/${rolePaths[job.role]}/gabarit_${rolePaths[job.role]}.md. Relais figé au commit ${relayHead}, cycle ${job.value.cycle_id}, billet ${job.value.billet}, source ${job.value.source_sha}. Lis les fichiers de ce relais à ce commit et accomplis uniquement l’étape autorisée. Publie le résultat et son signal selon ton gabarit. Ne consulte pas les gabarits des autres rôles.`;
  if(job.signal==='bootstrap')prompt+=' Amorçage : lis mission.json et masterticket.md. Autorise le billet en publiant autorisation.json, sans écrire le moteur.';
   if(job.signal==='diagnostic')prompt+=' Diagnostic complet au commit '+job.relayCommit+' : lis retour.json, manifest, TOUS les JPG, métriques et QA statique ; tu es le seul décideur de l’acceptation, du correctif ou du recul par commit de réversion sur main.';
   if(job.signal==='diagnostic_return')prompt+=' Échec de diagnostic au commit '+job.relayCommit+' : lis le manifest et les journaux, corrige directement sur main, puis renvoie au QA. Aucune intervention de l’Architecte.';
   if(job.signal==='qa_return')prompt+=' Retour QA figé : '+job.relayCommit+'. Corrige uniquement les constats statiques de collaboration/verificateur/verification.json et rapport.md à ce commit. Le cycle, le billet et l’autorisation '+job.value.autorisation_commit_sha+' restent inchangés. Repars du code vérifié '+job.value.source_sha+' et publie la livraison corrigée avec tentative='+job.value.tentative+', base_sha='+job.value.source_sha+' et retour_qa_commit_sha='+job.relayCommit+'. Aucune intervention de l’Architecte pour ces corrections. Commit directement sur main sans confirmation.';
  if(job.signal==='continuation')prompt+=' Checkpoint de poursuite : '+job.relayCommit+'. Reprends le travail restant du même billet depuis '+job.value.source_sha+' sous l’autorisation '+job.value.autorisation_commit_sha+'. Le statut historique bloque n’autorise plus de morcellement. Conserve le travail et termine réellement le billet ; aucun signal de livraison incomplète. Le diagnostic réel est réservé au propriétaire ; commit directement sur main sans confirmation.';
  if(GitHubRelay.attempt(job.value)>1)prompt+=' Tentative : '+GitHubRelay.attempt(job.value)+'.';
  const prise={schema_version:1,role:job.role,cycle_id:job.value.cycle_id,billet:job.value.billet,source_sha:job.value.source_sha,relais_commit_sha:relayHead,prise_id:Date.now()+'-'+Math.random().toString(36).slice(2),etat:'en_cours'};
  if(correctionEvent)prise.tentative=GitHubRelay.attempt(job.value);
  const acknowledgedPrompt=prompt+' Avant de commencer ton travail, publie sur main collaboration/'+rolePaths[job.role]+'/prise_en_charge.json avec ce contenu exact : '+JSON.stringify(prise)+'. Ce signal est un accusé de réception, pas une livraison. Puis accomplis l’étape autorisée et publie normalement son résultat et son signal final.';
  // Missing or busy tabs are observed live, never recorded as a cycle lock.
  g.status='Lecture du compositeur '+roleName[job.role]+'…';await chrome.storage.local.set({githubState:g});
  const ready=await githubDeadline(chrome.scripting.executeScript({target:{tabId:resolved.tab.id},func:(identity,prompt,forceRetry)=>{
   const messages=Array.from(document.querySelectorAll('[data-message-author-role="user"],article[data-testid^="conversation-turn-"]'));
   const delivered=messages.some(node=>{const text=node.innerText||node.textContent||'';return identity.every(part=>text.replace(/\s+/g,' ').trim().includes(part.replace(/\s+/g,' ').trim()));});
   if(delivered&&!forceRetry)return 'deja_transmis';
   const locateEditor=()=>{
    const selectors=['#prompt-textarea','[data-testid="composer-input"]','.ProseMirror[contenteditable]','form [role="textbox"][contenteditable]','form textarea','[role="textbox"][contenteditable]'];
    const editable=e=>e&&(e.isContentEditable||e.tagName==='TEXTAREA'||e.tagName==='INPUT'||'value' in e||['true','plaintext-only',''].includes(e.getAttribute?.('contenteditable')??null));
    for(const selector of selectors){
      const hosts=Array.from(document.querySelectorAll(selector));
      if(!hosts.length){const host=document.querySelector(selector);if(host)hosts.push(host);}
      for(const host of hosts){
        const nested=host.querySelector?.('[contenteditable]:not([contenteditable="false"]),textarea,[role="textbox"]');
        for(const e of [host,nested])
          if(editable(e)&&e.isConnected&&e.getClientRects().length)return e;
      }
    }
    return null;
  };
   const e=locateEditor();
   const draft=(e?.value||e?.innerText||e?.textContent||'').trim();
   const ownDraft=draft.startsWith(prompt+' Avant de commencer ton travail, publie sur main collaboration/')&&draft.endsWith('Puis accomplis l’étape autorisée et publie normalement son résultat et son signal final.');
   if(!e){
    const candidates=Array.from(document.querySelectorAll('[contenteditable],textarea,[role="textbox"]')).slice(0,12).map(n=>({tag:n.tagName,id:n.id||'',role:n.getAttribute('role'),editable:n.getAttribute('contenteditable'),connected:n.isConnected,rects:n.getClientRects().length}));
    return {ok:false,reason:'Aucun éditeur reconnu. Champs observés : '+JSON.stringify(candidates)+' ; page='+location.pathname+' ; visibilité='+document.visibilityState+' ; iframes='+document.querySelectorAll('iframe').length};
   }
   if(draft&&!ownDraft)return {ok:false,reason:'Brouillon distinct présent ('+draft.length+' caractères) ; texte préservé.'};
   const stop=Array.from(document.querySelectorAll('[data-testid="stop-button"],button[aria-label="Stop generating"],button[aria-label="Arrêter la génération"],button[data-testid="stop-generation-button"]')).find(n=>n.isConnected&&n.getClientRects().length&&getComputedStyle(n).visibility!=='hidden');
   if(stop)return {ok:false,reason:'Bouton d’arrêt visible : '+(stop.getAttribute('aria-label')||stop.getAttribute('data-testid'))};
   return {ok:true};
  },args:[['Ton rôle : '+rolePaths[job.role]+'.','cycle '+job.value.cycle_id,'billet '+job.value.billet,'source '+job.value.source_sha,...(job.signal==='qa_return'?['Retour QA figé : '+job.relayCommit]:[]),...(job.signal==='diagnostic_return'?['Échec diagnostic figé : '+job.relayCommit]:[]),...(job.signal==='continuation'?['Checkpoint de poursuite : '+job.relayCommit]:[]),...(GitHubRelay.attempt(job.value)>1?['Tentative : '+GitHubRelay.attempt(job.value)+'.']:[])],prompt,receipt?.state==='retry']}),8000,'Lecture de l’onglet '+roleName[job.role]);
  if(token.cancelled)return;
  if(ready?.[0]?.result==='deja_transmis'){
   const observed=await Delivery.remember(receiptKey,{token:'observed-'+Date.now(),state:'sent',role:job.role,cycle:job.value.cycle_id,destination,relayHead,detail:'Message observé dans la conversation'});g.receiptToken=observed.entry.token;g.receiptState='sent';g.retryAvailable=true;
   g.status=roleName[job.role]+' : relais déjà présent dans la conversation configurée — attente de sa prise en charge ou de son résultat GitHub.';
   await chrome.storage.local.set({githubState:g});await recordStatus();return;
  }
  const composer=ready?.[0]?.result;
  if(composer!==true&&composer?.ok!==true)throw Error(roleName[job.role]+' : '+(composer?.reason||'Lecture du champ sans résultat')+' ; aucun envoi. Relais '+job.value.cycle_id+' conservé.');
  const fresh=await chrome.storage.local.get(['settings','runtime']);
  if(token.cancelled||fresh.settings?.mode!=='github'||!fresh.runtime?.enabled||fresh.runtime.activationId!==r.activationId)return;
  // A successful handoff consumes only the initial resume choice.
  if(fresh.runtime.resumeRole){await chrome.storage.local.set({runtime:{...fresh.runtime,resumeRole:null}});}
  const actual=await chrome.tabs.get(resolved.tab.id);
  if(freshMode){
   const currentPending=await FreshChat.state(job.role);
   if(!currentPending||currentPending.tabId!==resolved.tab.id||currentPending.previousUrl!==destination||currentPending.jobId!==FreshChat.jobId(fresh.settings,job)||!FreshChat.isBlank(actual.url)||!FreshChat.isTemporary(actual.url)||!fresh.settings[job.role+'Fresh'])throw Error('Nouvelle conversation ou option modifiée pendant la lecture ; aucun envoi.');
  }else{
   const currentTarget=ChatConversations.resolve(await chrome.tabs.query({}),fresh.settings[job.role+'Title'],fresh.settings[job.role+'Url']);
   if(!currentTarget.tab||currentTarget.tab.id!==resolved.tab.id||ChatConversations.key(currentTarget.tab.url)!==destination)throw Error('Conversation modifiée pendant la lecture ; aucun envoi.');
   if(ChatConversations.key(actual.url)!==destination)throw Error('Onglet agent déplacé ; aucun envoi.');
  }
  const receiptToken=crypto.randomUUID();
  const reserved=await Delivery.reserve(receiptKey,{token:receiptToken,role:job.role,cycle:job.value.cycle_id,destination,relayHead,priseId:prise.prise_id,activationId:r.activationId,ignoreClaimId:ignoredClaimId});
  if(!reserved.allowed)return;
  if(manualAdoption){
   const x=(await chrome.storage.local.get('freshManualSelection')).freshManualSelection||{};
   if(x[job.role]?.forced&&x[job.role]?.destination===destination&&
      x[job.role]?.cycle===job.value.cycle_id){
    const next={...x};delete next[job.role];
    await chrome.storage.local.set({freshManualSelection:next});
   }
  }
  g.receiptToken=receiptToken;g.receiptState='prepared';g.retryAvailable=false;
  g.status='Transmission à '+roleName[job.role]+' — '+(resolved.tab.title||destination);
  await chrome.storage.local.set({githubState:g});
  let outcome;
  try{
   outcome=(await githubDeadline(chrome.scripting.executeScript({target:{tabId:resolved.tab.id},func:injectPrompt,args:[acknowledgedPrompt,prompt,{role:job.role,activationId:r.activationId,destination,receiptKey,receiptToken,forceRetry:reserved.entry.manual,fresh:freshMode,jobId:freshMode?FreshChat.jobId(s,job):null}]}),30000,'Transmission à '+roleName[job.role]))?.[0]?.result;
  }catch(e){
   await Delivery.finish(receiptKey,receiptToken,{status:'incertain',detail:String(e.message||e)});throw e;
  }
  // Persist even if this reader was superseded while the DOM script ran.
  const finished=await Delivery.finish(receiptKey,receiptToken,outcome);
  if(freshMode&&finished.entry?.state==='sent'){
   const completed=await FreshChat.complete(job.role,job,s,r,true);
   receiptKey=await Delivery.retarget(s,job,pending.previousUrl,completed.newUrl);
   await FreshChat.commit(job.role,job,s,r,completed.newUrl);
   destination=completed.newUrl;
   g.receiptKey=receiptKey;g.receiptToken=finished.entry.token;
   await appendLog(roleName[job.role],'Nouveau fil associé : '+destination);
  }
  if(token.cancelled)return;
  g.receiptState=finished.entry?.state;g.retryAvailable=['sent','uncertain'].includes(g.receiptState);
  g.status=roleName[job.role]+' : '+(outcome?.status||'envoi incertain')+' — '+(g.receiptState==='sent'?'attente de la prise en charge GitHub ; aucun renvoi automatique.':'aucun réessai automatique ; réessai volontaire disponible.');
  if(outcome?.detail)g.status+=' '+outcome.detail;
  await chrome.storage.local.set({githubState:g});await appendLog(rolePaths[job.role],g.status,outcome?.detail||'');
  if(job.role==='dev')await DevRollover.updateTitleIfReady(resolved.tab.id,destination);
 }catch(e){if(token.cancelled)return;g.status='Bloqué : '+String(e.message||e);g.lastChecked=Date.now();await chrome.storage.local.set({githubState:g});await recordStatus();}
}

// --- background.js ---
"use strict";
const conversationKey=ChatConversations.key;
// MV3 can restart the worker without a browser onStartup event.
const deliveryBoot=Delivery.recoverInterrupted();
let sequence=Promise.resolve();
function exclusive(fn){const result=sequence.then(fn);sequence=result.catch(()=>{});return result;}
async function appendLog(who,status,detail=''){
 const {history=[]}=await chrome.storage.local.get('history');
 history.unshift({time:new Date().toISOString(),who,status,detail});
 await chrome.storage.local.set({history:history.slice(0,40)});
}
function cleanSettings(s={}){
 const out={mode:'github',githubRepo:s.githubRepo&&s.githubRepo!=='https://github.com/Tabernacle666/ConsoleVR'?s.githubRepo:'https://github.com/Tabernacle666/CooLabVR',githubBranch:s.githubBranch||'main',githubTabId:s.githubTabId,githubPollSeconds:30};
 for(const role of ['dev','qa','arch']){out[role+'Url']=s[role+'Url']||'';out[role+'Title']=s[role+'Title']||'';}
 out.devFresh=true;out.qaFresh=true; // Chats temporaires requis; architecte permanent.
 return out;
}
function validateSettings(s){githubConfig(s);const keys=['dev','qa','arch'].map(r=>conversationKey(s[r+'Url']));if(keys.some(x=>!x)||new Set(keys).size!==3)throw Error('Sélectionne trois conversations distinctes.');}
async function syncAlarms(runtime){
 for(const alarm of await chrome.alarms.getAll())if(alarm.name!==ALARM_GITHUB||!runtime.enabled)await chrome.alarms.clear(alarm.name);
 if(runtime.enabled)await chrome.alarms.create(ALARM_GITHUB,{periodInMinutes:.5});
}
async function migrate(){
 const data=await chrome.storage.local.get(['settings','runtime','deliveryReceipts']);
 const settings=cleanSettings(data.settings);const runtime={enabled:!!data.runtime?.enabled,activationId:data.runtime?.activationId||'initial'};
 await chrome.storage.local.set({settings,runtime});await chrome.storage.local.remove(['draft','recoveryState']);
 return {settings,runtime};
}
async function setRoleFresh(role,enabled){
 if(!['dev','qa'].includes(role)||enabled!==true)throw Error('Les conversations temporaires sont obligatoires pour Programmeur et QA.');
 const {settings={}}=await chrome.storage.local.get('settings');
 await chrome.storage.local.set({settings:{...settings,[role+'Fresh']:enabled}});
 return {ok:true};
}
async function saveSettings(input){
 const settings=cleanSettings(input);validateSettings(settings);if(githubReadToken)githubReadToken.cancelled=true;
 await chrome.storage.local.set({settings});const {runtime={}}=await chrome.storage.local.get('runtime');
 if(runtime.enabled)void scheduleGitHubRead(true);return {ok:true};
}
async function plan(input){
 const settings=cleanSettings(input);validateSettings(settings);if(githubReadToken)githubReadToken.cancelled=true;
 const {githubState:g={}}=await chrome.storage.local.get('githubState');
 const runtime={enabled:true,activationId:Date.now()+'-'+Math.random()};
 await chrome.storage.local.set({settings,runtime});await syncAlarms(runtime);void scheduleGitHubRead(true);return {ok:true};
}
// Escape hatch for a stuck fresh chat. Only a deliberate popup command
// can discard one ready record and authorize a forced resend of the selected
// CURRENT relay. No ordinary Save, polling or new cycle can invoke this.
async function forcePendingRelay(msg){
 const state=await chrome.storage.local.get(['runtime','settings','githubState','freshPending','freshManualSelection']);
 const {runtime:r={},settings:old={},githubState:g={},freshPending={}}=state;
 if(!r.enabled)throw Error('Le relais GitHub doit être actif.');
 const role=msg.role;
 if(!['dev','qa'].includes(role)||g.selectedRole!==role||!g.cycle)
  throw Error('Le relais actif ne correspond pas au rôle demandé. Relis GitHub.');
 const pending=freshPending[role];
 if(!pending||pending.phase!=='ready'||pending.role!==role)
  throw Error('Aucun nouveau fil ready pour ce rôle ; aucune donnée modifiée.');
 if(msg.pendingJobId!==pending.jobId||msg.pendingTabId!==pending.tabId||
    msg.pendingCreatedAt!==pending.createdAt)
  throw Error('La relève a changé entre-temps : réactualise l’extension.');
 const next=cleanSettings(msg.settings);
 validateSettings(next);
 if(next.githubRepo!==old.githubRepo||next.githubBranch!==old.githubBranch)
  throw Error('Le dépôt ou la branche est différent ; actualise GitHub.');
 const chosen=conversationKey(next[role+'Url']);
 const matches=ChatConversations.open(await chrome.tabs.query({})).filter(t=>t.key===chosen);
 if(!chosen||matches.length!==1)
  throw Error('La conversation choisie doit être ouverte dans un seul onglet ChatGPT.');
 if(g.cycle!==msg.cycle||g.workflow?.signal!==msg.signal||
   g.workflow?.tentative!==msg.tentative)
  throw Error('Le cycle ou la tentative a changé : réactualise avant de forcer.');
 if(githubReadToken)githubReadToken.cancelled=true;
 if(!await FreshChat.abandonReady(role,pending))
  throw Error('Le statut ready a changé : aucun renvoi demandé.');
 const marker={repo:next.githubRepo.toLowerCase().replace(/\/$/,''),branch:next.githubBranch,
  role,cycle:g.cycle,signal:g.workflow.signal,tentative:g.workflow.tentative,
  destination:chosen,forced:true};
 const manual={...(state.freshManualSelection||{}),[role]:marker};
 await chrome.storage.local.set({settings:next,freshManualSelection:manual});
 await appendLog(role==='dev'?'Programmeur':'Vérificateur',
   'Renvoi forcé demandé par le gestionnaire pour '+g.cycle+' vers '+chosen+
   ' ; seul freshPending.'+role+' (ready) a été abandonné. Reçu existant conservé.');
 void scheduleGitHubRead(true);
 return {ok:true,role,cycle:g.cycle,destination:chosen};
}

// Explicit recovery revokes the prior permission before targeting the selected conversation.
async function retrySelectedDelivery(msg){
 const {runtime:r={},githubState:g={},settings:previous={}}=await chrome.storage.local.get(['runtime','githubState','settings']);
 if(!r.enabled)throw Error('Démarre la surveillance avant de demander un réessai.');
 if(g.receiptKey!==msg.receiptKey||g.receiptToken!==msg.receiptToken)throw Error('Le relais affiché a changé ; aucun réessai.');
 const old=await Delivery.read(msg.receiptKey);
 if(!old)throw Error('Reçu introuvable ; relis GitHub.');
 const settings=msg.settings?cleanSettings(msg.settings):previous;
 validateSettings(settings);
 if(settings.githubRepo!==previous.githubRepo||settings.githubBranch!==previous.githubBranch)throw Error('Le dépôt ou la branche a changé ; relis GitHub avant le réessai.');
 const resolved=ChatConversations.resolve(await chrome.tabs.query({}),settings[old.role+'Title'],settings[old.role+'Url']);
 if(!resolved.tab)throw Error(resolved.error||'Onglet agent absent.');
 const destination=ChatConversations.key(resolved.tab.url);
 if(githubReadToken)githubReadToken.cancelled=true;
 // Invalidate any delayed permit for the old destination as well.
 await Delivery.retry(msg.receiptKey,msg.receiptToken,g.claimId);
 const parts=JSON.parse(msg.receiptKey);
 if(parts[2]!=='blocked')parts[parts.length-1]=destination;
 const targetKey=JSON.stringify(parts);
 if(targetKey!==msg.receiptKey){
  let target=await Delivery.read(targetKey);
  if(!target)target=(await Delivery.remember(targetKey,{...old,destination,state:'uncertain',token:crypto.randomUUID()})).entry;
  if(target.state!=='retry')await Delivery.retry(targetKey,target.token,g.claimId);
 }
 await chrome.storage.local.set({settings});
 void scheduleGitHubRead(true);return {ok:true};
}
async function stop(){if(githubReadToken)githubReadToken.cancelled=true;const {runtime={}}=await chrome.storage.local.get('runtime');await chrome.storage.local.set({runtime:{...runtime,enabled:false}});await chrome.alarms.clearAll();return {ok:true};}
async function injectPrompt(message,relayIdentity,attempt) {
  // This is only the lifetime of a running DOM operation, not a cycle lock.
  // Restarting the reader cannot cancel an executeScript already in the tab.
  if(globalThis.__consoleVrComposerActive&&!attempt?.forceRetry)
    return {status:'Transmission en cours',detail:'Un envoi est déjà actif dans cet onglet ; aucun second script lancé.'};
  const active={};globalThis.__consoleVrComposerActive=active;
  const current=()=>globalThis.__consoleVrComposerActive===active;
  try {
  const normalize=s=>String(s||'').replace(/\s+/g,' ').trim();
  const parts=relayIdentity?.match(/cycle ([^,]+), billet ([^,]+), source ([a-f0-9]{40})/i);
  const role=relayIdentity?.match(/Ton rôle : ([^.]+)\./)?.[0];
  const identity=parts&&role?[role,'cycle '+parts[1],'billet '+parts[2],'source '+parts[3]]:[relayIdentity];
  const blockedIdentity=relayIdentity?.match(/Blocage figé : ([a-f0-9]{40})/i);if(blockedIdentity)identity.push('Blocage figé : '+blockedIdentity[1]);
  for(const marker of ['Retour QA figé','Checkpoint de poursuite']){const match=relayIdentity?.match(new RegExp(marker+' : ([a-f0-9]{40})','i'));if(match)identity.push(marker+' : '+match[1]);}
  const roundIdentity=relayIdentity?.match(/Tentative : (\d+)/);if(roundIdentity)identity.push('Tentative : '+roundIdentity[1]+'.');
  const alreadyDelivered=()=>!!relayIdentity&&Array.from(document.querySelectorAll('[data-message-author-role="user"],article[data-testid^="conversation-turn-"]')).some(node=>identity.every(part=>normalize(node.innerText||node.textContent).includes(normalize(part))));
  const permitted=()=>!attempt?Promise.resolve(true):new Promise((resolve,reject)=>{
    chrome.runtime.sendMessage({type:'composerPermit',attempt:{...attempt,actualPriseId:message.match(/"prise_id"\s*:\s*"([^"]+)"/)?.[1]}},response=>{
      const error=chrome.runtime.lastError;
      if(error)reject(Error(error.message));else resolve(current()&&response?.ok===true);
    });
  });
  if(!attempt?.forceRetry&&alreadyDelivered())return {status:"Déjà transmis",detail:"Relais observé dans les messages de cette conversation ; attente GitHub."};
  // N'ajouter jamais un second exemplaire d'un message qui attend encore dans
  // le compositeur. Si le texte est identique, réutiliser le message existant.
  // En cas d'impossibilité d'envoyer, nettoyer seulement notre propre texte.
  // Hidden tabs throttle their own timers. Keep composer waits in the
  // extension worker, which also owns the overall transmission deadline.
  const pause = ms => new Promise((resolve,reject)=>{
    chrome.runtime.sendMessage({type:'composerPause',ms},response=>{
      const error=chrome.runtime.lastError;
      if(error||!response?.ok)reject(Error(error?.message||response?.error||'Attente du compositeur interrompue.'));
      else if(!current())reject(Error('Tentative remplacée par un réessai volontaire.'));
      else resolve();
    });
  });
  const visible = el => !!el && el.isConnected && !!el.getClientRects().length;
  const sameText=(a,b)=>a.replace(/\s+/g,' ').trim()===b.replace(/\s+/g,' ').trim();
  const locateEditor=()=>{
    const selectors=['#prompt-textarea','[data-testid="composer-input"]','.ProseMirror[contenteditable]','form [role="textbox"][contenteditable]','form textarea','[role="textbox"][contenteditable]'];
    const editable=e=>e&&(e.isContentEditable||e.tagName==='TEXTAREA'||e.tagName==='INPUT'||'value' in e||['true','plaintext-only',''].includes(e.getAttribute?.('contenteditable')??null));
    for(const selector of selectors){
      const hosts=Array.from(document.querySelectorAll(selector));
      if(!hosts.length){const host=document.querySelector(selector);if(host)hosts.push(host);}
      for(const host of hosts){
        const nested=host.querySelector?.('[contenteditable]:not([contenteditable="false"]),textarea,[role="textbox"]');
        for(const e of [host,nested])
          if(editable(e)&&e.isConnected&&e.getClientRects().length)return e;
      }
    }
    return null;
  };
  const draftText = el => ("value" in el ? el.value : el.innerText || el.textContent || "").replace(/\r\n/g,"\n").trim();
  message=message.replace(/\r\n/g,"\n").trim();
  const deadline = Date.now()+20_000;
  let editor = null;
  while (Date.now()<deadline) {
    editor = locateEditor();
    if (visible(editor)) break;
    await pause(500);
  }
  if (!visible(editor)) return {status:"Non envoyé",detail:"Aucun éditeur visible et modifiable trouvé : prompt-textarea, composer-input, ProseMirror, textbox ou textarea du formulaire."};

  async function removeExactDraft() {
    if (!visible(editor) || !sameText(draftText(editor),message)) return false;
    editor.focus();
    if ("value" in editor) {
      const proto = editor.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto,"value")?.set;
      if (setter) setter.call(editor,""); else editor.value="";
      editor.dispatchEvent(new Event("input",{bubbles:true}));
    } else {
      // Sélection bornée au compositeur, jamais à la page entière.
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(editor);
      selection.removeAllRanges();
      selection.addRange(range);
      document.execCommand("delete",false);
      selection.removeAllRanges();
    }
    await pause(180);
    return draftText(editor).trim()==="";
  }
  async function blocked(reason) {
    return {status:'Non envoyé',detail:reason+' Message conservé dans le champ si présent ; vérifier puis envoyer manuellement. Le relais sera réévalué depuis GitHub et les messages de cette conversation.'};
  }

  const existing = draftText(editor);
  // A timed-out attempt can leave its own prompt and prise_id in the editor.
  // Reuse it verbatim rather than replacing it with a new receipt identity.
  if(relayIdentity&&existing.startsWith(relayIdentity+' Avant de commencer ton travail, publie sur main collaboration/')&&existing.endsWith('Puis accomplis l’étape autorisée et publie normalement son résultat et son signal final.'))
    message=existing;
  // Un message humain, même presque identique, est absolument préservé.
  if (existing.trim() && !sameText(existing,message))
    return {status:"Différé",detail:"Un autre brouillon existe ; aucune modification ni envoi."};
  const processing = Array.from(document.querySelectorAll('button[data-testid="stop-button"], button[aria-label]'))
    .some(button=>visible(button) && (button.matches('[data-testid="stop-button"]')
      || /stop generating|stop response|arrêter la génération|arrêter la réponse|interrompre/i.test(button.getAttribute("aria-label")||"")));
  if (processing) {
    if (sameText(existing,message)) return blocked("La conversation est encore occupée.");
    return {status:"Différé",detail:"La conversation est encore occupée ; aucun message ajouté."};
  }

  if (!sameText(existing,message)) {
    editor.focus();
    let entered = false;
    if ("value" in editor) {
      const proto = editor.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto,"value")?.set;
      if (setter) setter.call(editor,message); else editor.value=message;
      editor.dispatchEvent(new Event("input",{bubbles:true}));
      entered = sameText(draftText(editor),message);
    } else {
      const inserted = document.execCommand("insertText",false,message);
      await pause(200);
      entered = sameText(draftText(editor),message);
    }
    if (!entered) {
      if (sameText(draftText(editor),message)) return blocked("Insertion non confirmée.");
      return {status:"Non envoyé",detail:"Insertion du message impossible ; aucun autre brouillon modifié."};
    }
  }

  const selectors = [
    '#composer-submit-button',
    '#send-button',
    'button[data-testid="send-button"]',
    'button[data-testid="composer-submit-button"]',
    'button[aria-label="Send prompt"]',
    'button[aria-label="Send message"]',
    'button[aria-label="Envoyer le message"]',
    'button[aria-label="Envoyer un message"]',
    'button[aria-label="Envoyer"]',
    'button[aria-label="Envoyer l’invite"]',
    'button[type="submit"]'
  ];
  let send = null;
  for (let tries=0;tries<16;tries++) {
    // React can replace the composer after insertion: never keep a stale node.
    const currentEditor=locateEditor();
    if(visible(currentEditor))editor=currentEditor;
    // Entre deux lectures, l'utilisateur peut avoir changé le brouillon.
    // Ne jamais cliquer si ce n'est plus exactement notre message.
    if (!sameText(draftText(editor),message))
      return {status:"Différé",detail:"Le champ a changé pendant l'attente ; aucun clic."};
    const form = editor.closest("form");
    for (const selector of selectors) {
      send = (form&&form.querySelector(selector))||document.querySelector(selector);
      if (visible(send)&&!send.disabled&&send.getAttribute("aria-disabled")!=="true") break;
      send=null;
    }
    if (!send&&form) {
      const candidate=form.querySelector('button[type="submit"]');
      if (visible(candidate)&&!candidate.disabled&&candidate.getAttribute("aria-disabled")!=="true") send=candidate;
    }
    if(!send){
      send=Array.from(document.querySelectorAll('button[aria-label]')).find(b=>visible(b)&&!b.disabled&&b.getAttribute('aria-disabled')!=='true'&&/^(send|envoyer)(\s|$)/i.test(b.getAttribute('aria-label')||''))||null;
    }
    if (send) break;
    await pause(250);
  }
  if (!send) {
    if(!sameText(draftText(editor),message))return blocked('Le brouillon a changé.');
    const form=editor.closest('form');
    if(form&&typeof form.requestSubmit==='function'){
      if(!await permitted()||!current())return {status:'Différé',detail:'Sélection ou activation modifiée ; tentative précédente abandonnée avant envoi.'};
      if(!attempt?.forceRetry&&alreadyDelivered())return {status:'Déjà transmis',detail:'Relais déjà présent ; aucun nouvel envoi.'};
      if(!sameText(draftText(editor),message))return blocked('Le brouillon a changé avant soumission.');
      form.requestSubmit();await pause(1350);
      const current=locateEditor();
      if(current&&sameText(draftText(current),message))return blocked('Soumission du formulaire non confirmée.');
      return {status:'Clic effectué',detail:'Formulaire soumis ; compositeur vidé. Réception serveur non vérifiée.'};
    }
    return blocked('Bouton Envoyer introuvable dans la conversation.');
  }
  if (!sameText(draftText(editor),message))
    return {status:"Différé",detail:"Le brouillon a changé avant l'envoi ; aucun clic."};
  send.scrollIntoView({block:'nearest'});
  send.focus({preventScroll:true});
  if(!await permitted()||!current())return {status:'Différé',detail:'Sélection ou activation modifiée ; tentative précédente abandonnée avant envoi.'};
  if(!attempt?.forceRetry&&alreadyDelivered())return {status:"Déjà transmis",detail:"Relais observé juste avant le clic ; aucun second envoi."};
  if(!sameText(draftText(editor),message))return blocked('Le brouillon a changé avant le clic.');
  send.click();
  // Un clic n'est pas nécessairement un envoi : une limite d'utilisation ou une
  // panne peut laisser le texte en place. On le retire s'il est encore présent.
  await pause(1350);
  const afterClick=locateEditor();
  if (afterClick)editor=afterClick;
  if (sameText(draftText(editor),message))
    return blocked("Le clic n'a pas vidé le compositeur ; envoi non confirmé.");
  return {status:"Clic effectué",detail:"Le compositeur s'est vidé après le clic ; réception serveur non vérifiée."};
  } finally {
    if(globalThis.__consoleVrComposerActive===active)delete globalThis.__consoleVrComposerActive;
  }
}


chrome.alarms.onAlarm.addListener(alarm=>{if(alarm.name===ALARM_GITHUB)void scheduleGitHubRead().catch(e=>appendLog('GitHub','Erreur',String(e)));});
chrome.runtime.onMessage.addListener((msg,sender,respond)=>{
 if(msg?.type==='composerPermit'){
  if(sender.id!==chrome.runtime.id){respond({ok:false});return false;}
  Delivery.permit(msg.attempt||{},sender.tab?.url,sender.tab?.id).then(result=>respond({ok:result?.ok===true})).catch(()=>respond({ok:false}));return true;
 }
 if(msg?.type==='composerPause'){
  if(sender.id!==chrome.runtime.id||!Number.isInteger(msg.ms)||msg.ms<0||msg.ms>1500){respond({ok:false,error:'Attente invalide.'});return false;}
  setTimeout(()=>respond({ok:true}),msg.ms);return true;
 }
 async function inspectDevConversation(){
  const {settings={}}=await chrome.storage.local.get('settings');
  const selected=ChatConversations.resolve(await chrome.tabs.query({}),settings.devTitle,settings.devUrl);
  if(!selected.tab)throw Error(selected.error||'Onglet du Programmeur introuvable.');
  const result=await chrome.scripting.executeScript({target:{tabId:selected.tab.id},func:DevRollover.detectAndMaybeClick,args:[false]});
  const state=result?.[0]?.result;
  if(!state?.state)throw Error('Impossible de lire l’avis de limite dans cet onglet.');
  return {ok:true,state:state.state,reason:state.reason||'',noticeCount:state.noticeCount,buttonCount:state.buttonCount,associated:state.associated,url:selected.tab.url,title:selected.tab.title||''};
 }
 const operations={ping:async()=>({ok:true,workerVersion:'1.9.1'}),setRoleFresh:()=>exclusive(()=>setRoleFresh(msg.role,msg.enabled)),save:()=>exclusive(()=>saveSettings(msg.settings)),githubPlan:()=>exclusive(()=>plan(msg.settings)),stop:()=>exclusive(stop),snapshot:async()=>({ok:true,...await chrome.storage.local.get(['settings','runtime','githubState','history','devRollover','freshPending'])}),retryDelivery:()=>exclusive(()=>retrySelectedDelivery(msg)),forcePendingRelay:()=>exclusive(()=>forcePendingRelay(msg)),githubCheck:async()=>{void scheduleGitHubRead(true);return {ok:true};},inspectDev:inspectDevConversation};
 if(!Object.hasOwn(operations,msg?.type)){respond({ok:false,error:'Commande inconnue.'});return false;}
 operations[msg.type]().then(respond).catch(e=>respond({ok:false,error:String(e.message||e)}));return true;
});
async function restore(){const {runtime}=await migrate();await syncAlarms(runtime);}
chrome.runtime.onStartup.addListener(()=>void exclusive(restore));
chrome.runtime.onInstalled.addListener(()=>void exclusive(restore));
