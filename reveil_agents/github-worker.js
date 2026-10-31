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
 return {ok:true,head,claims,authorization,delivery,verification,report,master:texts[3],programmerStatus,statusCommit,authorizationCommit,statusSuperseded,deliveryCommit,verificationCommit};
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
 const pairs={dev:['collaboration/architecte/autorisation.json','collaboration/architecte/masterticket.md'],qa:['collaboration/programmeur/livraison.json'],arch:['collaboration/verificateur/verification.json','collaboration/verificateur/rapport.md']};
 const checkpoint=['blocked','continuation'].includes(job.signal);
 const required=checkpoint?['collaboration/programmeur/statut.json']:job.signal==='qa_return'?pairs.arch:pairs[job.role];
 if(!required.every(p=>changed.has(p)))throw Error('Le commit courant ne clôture pas ensemble les fichiers du relais. Republier le relais complet dans un même commit.');
 if(checkpoint){
  if(head!==job.relayCommit)throw Error('Le relais doit viser le commit exact du statut.');
  const raw=await fetch(base+'/raw/'+head+'/collaboration/programmeur/statut.json',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(!raw.ok||canonicalJSON(await raw.json())!==canonicalJSON(job.value))throw Error('Statut figé non conforme au relais ; aucun envoi.');
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
 if(!checkpoint&&(job.role!=='dev'||job.signal==='qa_return'))refs.push(job.value.autorisation_commit_sha);
 if(job.signal==='delivery'&&Number(job.value.tentative)>1){
  refs.push(job.value.retour_qa_commit_sha);
  const raw=await fetch(base+'/raw/'+job.value.retour_qa_commit_sha+'/collaboration/verificateur/verification.json',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(!raw.ok)throw Error('Retour QA de la livraison corrigée inaccessible.');
  const v=await raw.json();
  if(v.cycle_id!==job.value.cycle_id||v.billet!==job.value.billet||v.source_sha!==job.value.base_sha||v.autorisation_commit_sha!==job.value.autorisation_commit_sha||(v.tentative||1)!==job.value.tentative-1||v.destination&&v.destination!=='dev')throw Error('La correction ne prolonge pas le retour QA déclaré.');
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
  g.status=job?'Relais : '+job.role+' · '+job.value.cycle_id:'Attente d’un relais complet / autorisé';g.lastChecked=Date.now();
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
  const correctionEvent=['qa_return','continuation'].includes(job.signal)||GitHubRelay.attempt(job.value)>1;
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
  if(pending&&!FreshChat.isBlank(resolved.tab.url))throw Error('Nouvel onglet de conversation déplacé ; aucun renvoi.');
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
    await appendLog(roleName[job.role],'Nouveau chat dans le même onglet : '+(moved.model?.verified?'GPT-6 High confirmé.':'sélecteur non vérifié ; modèle par défaut conservé.')+(moved.model?.warning?' '+moved.model.warning:''));
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
  if(job.signal==='qa_return')prompt+=' Retour QA figé : '+job.relayCommit+'. Corrige uniquement les constats statiques de collaboration/verificateur/verification.json et rapport.md à ce commit. Le cycle, le billet et l’autorisation '+job.value.autorisation_commit_sha+' restent inchangés. Repars du code vérifié '+job.value.source_sha+' et publie la livraison corrigée avec tentative='+job.value.tentative+', base_sha='+job.value.source_sha+' et retour_qa_commit_sha='+job.relayCommit+'. Aucune demande de blocage ou de morcellement ; aucune intervention de l’Architecte pour ces corrections.';
  if(job.signal==='continuation')prompt+=' Checkpoint de poursuite : '+job.relayCommit+'. Reprends le travail restant du même billet depuis '+job.value.source_sha+' sous l’autorisation '+job.value.autorisation_commit_sha+'. Le statut historique bloque n’autorise plus de morcellement. Conserve le travail et termine réellement le billet ; aucun signal de livraison incomplète. Les tests ConsoleVR restent réservés au créateur selon le gabarit.';
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
  },args:[['Ton rôle : '+rolePaths[job.role]+'.','cycle '+job.value.cycle_id,'billet '+job.value.billet,'source '+job.value.source_sha,...(job.signal==='qa_return'?['Retour QA figé : '+job.relayCommit]:[]),...(job.signal==='continuation'?['Checkpoint de poursuite : '+job.relayCommit]:[]),...(GitHubRelay.attempt(job.value)>1?['Tentative : '+GitHubRelay.attempt(job.value)+'.']:[])],prompt,receipt?.state==='retry']}),8000,'Lecture de l’onglet '+roleName[job.role]);
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
   if(!currentPending||currentPending.tabId!==resolved.tab.id||currentPending.previousUrl!==destination||currentPending.jobId!==FreshChat.jobId(fresh.settings,job)||!FreshChat.isBlank(actual.url)||!fresh.settings[job.role+'Fresh'])throw Error('Nouvelle conversation ou option modifiée pendant la lecture ; aucun envoi.');
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

