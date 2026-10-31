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
