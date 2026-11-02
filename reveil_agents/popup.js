"use strict";
const $=id=>document.getElementById(id);
let shownReceipt=null;
let pendingForce=null;
$('version').textContent=chrome.runtime.getManifest().version;
async function send(type,args={}){return new Promise((resolve,reject)=>{const deadline=setTimeout(()=>reject(Error('Service indisponible. Recharge l’extension.')),12000);chrome.runtime.sendMessage({type,...args},r=>{clearTimeout(deadline);if(chrome.runtime.lastError)return reject(Error(chrome.runtime.lastError.message));if(!r?.ok)return reject(Error(r?.error||'Service sans réponse'));resolve(r);});});}
function selection(){const s={mode:'github',githubRepo:$('githubRepo').value.trim().replace(/\/$/,''),githubBranch:$('githubBranch').value.trim(),githubTabId:Number($('githubTabId').value)};for(const r of ['dev','qa','arch']){s[r+'Url']=$(r+'Url').value;s[r+'Title']=$(r+'Url').selectedOptions[0]?.dataset.title||'';}s.devFresh=$('devFresh').checked;s.qaFresh=$('qaFresh').checked;return s;}
async function loadTabs(s={}){
 const tabs=await chrome.tabs.query({});
 for(const role of ['dev','qa','arch']){const el=$(role+'Url');el.replaceChildren(new Option('Choisir une conversation…',''));for(const t of ChatConversations.open(tabs)){const o=new Option(t.title||t.tab.url,t.tab.url);o.dataset.title=t.title;el.add(o);}if(s[role+'Url']&&!Array.from(el.options).some(o=>o.value===s[role+'Url'])){const o=new Option((s[role+'Title']||'Conversation du rôle')+' — transition dans l’onglet',s[role+'Url']);o.dataset.title=s[role+'Title']||'';el.add(o);}el.value=s[role+'Url']||'';}
 const el=$('githubTabId');el.replaceChildren(new Option('Choisir GitHub…',''));for(const t of tabs)if(t.url?.startsWith('https://github.com/'))el.add(new Option(t.title||t.url,String(t.id)));el.value=String(s.githubTabId||'');
}
async function refresh(){const d=await send('snapshot');const g=d.githubState||{};shownReceipt=g.receiptKey&&g.receiptToken?{receiptKey:g.receiptKey,receiptToken:g.receiptToken}:null;$('retryDelivery').disabled=!d.runtime?.enabled||!g.retryAvailable||!shownReceipt;
const pending=d.freshPending?.[g.selectedRole];
pendingForce=d.runtime?.enabled&&['dev','qa'].includes(g.selectedRole)&&pending?.phase==='ready'&&g.cycle&&g.workflow?
 {role:g.selectedRole,cycle:g.cycle,signal:g.workflow.signal,tentative:g.workflow.tentative,
 pendingJobId:pending.jobId,pendingTabId:pending.tabId,pendingCreatedAt:pending.createdAt}:null;
$('forcePendingRelay').disabled=!pendingForce;$('status').textContent=(d.runtime?.enabled?'ACTIF':'ARRÊTÉ')+' — GitHub\n'+(g.status||'En attente de lecture')+'\nRelais : '+(g.selectedRole||'aucun')+' · '+(g.cycle||'')+(g.blockage?'\nProgrammeur bloqué · statut '+g.blockage.commit.slice(0,8)+' · checkpoint '+g.blockage.checkpoint.slice(0,8):'')+(g.localStatus?.connected?'\nLocal : '+g.localStatus.head?.slice(0,9)+' · '+(g.localStatus.last_head_action||'HEAD connu'):'\nLocal : passerelle non démarrée (local_relay.bat)')+(d.devRollover?'\nRelève Programmeur : en attente d’une URL /c/ définitive.':'')+(Object.values(d.freshPending||{}).length?'\nNouveau fil en attente : '+Object.values(d.freshPending).map(p=>p.role+' ('+p.phase+')').join(', '):'');$('log').textContent=(d.history||[]).map(x=>new Date(x.time).toLocaleTimeString('fr-CA')+' '+x.who+' — '+x.status).join('\n')||'Aucune activité';}
async function operate(type){try{await send(type,{settings:selection()});$('feedback').textContent=type==='save'?'Sélection enregistrée.':'Relais GitHub démarré.';await refresh();}catch(e){$('feedback').textContent=e.message;}}
$('forcePendingRelay').onclick=async()=>{
 if(!pendingForce)return;
 const request={...pendingForce,settings:selection()};
 const url=request.settings[request.role+'Url'];
 if(!url){$('feedback').textContent='Sélectionne une conversation cible.';return;}
 if(!window.confirm('Forcer le renvoi de '+request.cycle+' vers '+url+
  '\n\nLe message peut déjà avoir été transmis. Un doublon est possible. Continuer ?'))return;
 $('forcePendingRelay').disabled=true;
 try{
  const result=await send('forcePendingRelay',request);
  $('feedback').textContent='Renvoi manuel demandé pour '+result.cycle+' vers '+result.destination+'.';
 }catch(e){$('feedback').textContent='Renvoi non exécuté : '+e.message;}
 await refresh();
};
$('retryDelivery').onclick=async()=>{if(!shownReceipt)return;const receipt={...shownReceipt};$('retryDelivery').disabled=true;try{await send('retryDelivery',{...receipt,settings:selection()});$('feedback').textContent='Réessai volontaire demandé pour ce relais uniquement.';await refresh();}catch(e){$('feedback').textContent=e.message;}};
for(const role of ['dev','qa'])$(role+'Fresh').addEventListener('change',async()=>{const enabled=$(role+'Fresh').checked;try{await send('setRoleFresh',{role,enabled});$('feedback').textContent=(role==='dev'?'Programmeur':'Vérificateur')+' : '+(enabled?'chat temporaire au prochain relais.':'continuer le fil courant au prochain relais.');}catch(e){$(role+'Fresh').checked=!enabled;$('feedback').textContent=e.message;}});
$('save').onclick=()=>operate('save');$('start').onclick=()=>operate('githubPlan');$('stop').onclick=async()=>{try{await send('stop');await refresh();}catch(e){$('feedback').textContent=e.message;}};$('inspectDev').onclick=async()=>{try{const r=await send('inspectDev');$('feedback').textContent='Inspection du Programmeur (sans clic) : '+({full:'conversation pleine, bouton reconnu',blocked:'conversation pleine, relève bloquée',normal:'aucune limite reconnue'}[r.state]||r.state)+(r.reason?' — '+r.reason:'')+(r.noticeCount!==undefined?' · avis : '+r.noticeCount+', boutons : '+r.buttonCount+', associés : '+r.associated:'');}catch(e){$('feedback').textContent='Inspection impossible : '+e.message;}};
$('githubCheck').onclick=async()=>{try{await send('githubCheck');await refresh();}catch(e){$('feedback').textContent=e.message;}};$('refreshTabs').onclick=()=>loadTabs(selection());
$('openDashboard').onclick=()=>chrome.tabs.create({url:chrome.runtime.getURL('dashboard.html')});
(async()=>{const d=await send('snapshot');const s=d.settings||{};await loadTabs(s);$('devFresh').checked=s.devFresh===true;$('qaFresh').checked=s.qaFresh===true;$('githubRepo').value=s.githubRepo||'https://github.com/Tabernacle666/CooLabVR';$('githubBranch').value=s.githubBranch||'main';await refresh();})().catch(e=>$('feedback').textContent=e.message);
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.settings){const s=changes.settings.newValue||{};$('devFresh').checked=s.devFresh===true;$('qaFresh').checked=s.qaFresh===true;void loadTabs(s).catch(()=>{});}if(area==='local'&&(changes.githubState||changes.runtime||changes.history))void refresh().catch(()=>{});});
