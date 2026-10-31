"use strict";
importScripts("conversations.js","github.js","delivery.js","rollover.js","fresh-chat.js","github-worker.js");
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
 const out={mode:'github',githubRepo:s.githubRepo||'https://github.com/Tabernacle666/ConsoleVR',githubBranch:s.githubBranch||'main',githubTabId:s.githubTabId,githubPollSeconds:30};
 for(const role of ['dev','qa','arch']){out[role+'Url']=s[role+'Url']||'';out[role+'Title']=s[role+'Title']||'';}
 out.devFresh=s.devFresh===true;out.qaFresh=s.qaFresh===true; // Architecte jamais renouvelé automatiquement.
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
 if(!['dev','qa'].includes(role)||typeof enabled!=='boolean')throw Error('Seuls Programmeur et Vérificateur disposent de ce réglage.');
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
 const operations={ping:async()=>({ok:true,workerVersion:'1.7.19'}),setRoleFresh:()=>exclusive(()=>setRoleFresh(msg.role,msg.enabled)),save:()=>exclusive(()=>saveSettings(msg.settings)),githubPlan:()=>exclusive(()=>plan(msg.settings)),stop:()=>exclusive(stop),snapshot:async()=>({ok:true,...await chrome.storage.local.get(['settings','runtime','githubState','history','devRollover','freshPending'])}),retryDelivery:()=>exclusive(()=>retrySelectedDelivery(msg)),forcePendingRelay:()=>exclusive(()=>forcePendingRelay(msg)),githubCheck:async()=>{void scheduleGitHubRead(true);return {ok:true};},inspectDev:inspectDevConversation};
 if(!Object.hasOwn(operations,msg?.type)){respond({ok:false,error:'Commande inconnue.'});return false;}
 operations[msg.type]().then(respond).catch(e=>respond({ok:false,error:String(e.message||e)}));return true;
});
async function restore(){const {runtime}=await migrate();await syncAlarms(runtime);}
chrome.runtime.onStartup.addListener(()=>void exclusive(restore));
chrome.runtime.onInstalled.addListener(()=>void exclusive(restore));
