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
