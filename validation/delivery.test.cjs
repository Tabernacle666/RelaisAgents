const fs=require('fs'),vm=require('vm'),assert=require('assert'),{webcrypto}=require('crypto');
const dir=__dirname+'/../reveil_agents/';
const clone=x=>JSON.parse(JSON.stringify(x));const sha=n=>String(n).repeat(40);
async function harness(initial){
 let db={settings:{mode:'github',githubRepo:'https://github.com/Tabernacle666/ConsoleVR',githubBranch:'main',githubTabId:9,githubPollSeconds:30,devUrl:'https://chatgpt.com/c/dev',qaUrl:'https://chatgpt.com/c/qa',archUrl:'https://chatgpt.com/c/arch'},runtime:{enabled:true,activationId:'one'}};
 if(initial)db=clone(initial);
 let snap,mode='success',ready=true,emits=[],listener;
 const tabs=()=>[...['dev','qa','arch'].map((r,i)=>({id:i+1,url:db.settings[r+'Url'],title:r})),{id:9,url:db.settings.githubRepo}];
 const c={URL,Date,Promise,crypto:webcrypto,setTimeout,clearTimeout,console,importScripts(){}};
 const assertJson=(value,path='args')=>{if(value===undefined||typeof value==='function'||typeof value==='symbol'||typeof value==='bigint')throw Error('Value is unserializable at '+path);if(Array.isArray(value))value.forEach((x,i)=>assertJson(x,path+'['+i+']'));else if(value&&typeof value==='object')Object.entries(value).forEach(([k,v])=>assertJson(v,path+'.'+k));};
 c.chrome={storage:{local:{async get(keys){if(typeof keys==='string')keys=[keys];return clone(Object.fromEntries(keys.filter(k=>db[k]!==undefined).map(k=>[k,db[k]])));},async set(v){Object.assign(db,clone(v));},async remove(keys){for(const k of keys)delete db[k];}}},tabs:{async get(id){const tab=tabs().find(t=>t.id===id);if(!tab)throw Error('closed');return tab;},async query(){return tabs();}},alarms:{async getAll(){return[]},async create(){},async clear(){},async clearAll(){},onAlarm:{addListener(){}}},runtime:{id:'ext',onMessage:{addListener(fn){listener=fn}},onStartup:{addListener(){}},onInstalled:{addListener(){}}},scripting:{async executeScript({target,func,args}){
  assertJson(args);
  if(func.name==='readGitHubWeb')assert.notStrictEqual(args[2],undefined);
  if(func.name==='readGitHubWeb')return [{result:clone(snap)}];
  if(func.name==='validateRelayWeb')return [{result:{ok:true}}];
  if(func.name==='detectAndMaybeClick')return [{result:{state:'normal'}}];
  if(func.name==='injectPrompt'){
   const a=args[2];const permitted=await vm.runInContext('Delivery',c).permit(a,tabs().find(t=>t.id===target.tabId).url);
   if(!permitted.ok)return [{result:{status:'Différé'}}];
   emits.push({attempt:clone(a),prompt:args[0]});
   if(mode==='timeout')throw Error('Transmission : délai dépassé');
   return [{result:{status:'Clic effectué'}}];
  }
  return [{result:ready}];
 }}};
 vm.createContext(c);for(const file of ['conversations.js','github.js','delivery.js','rollover.js','fresh-chat.js','github-worker.js','background.js'])vm.runInContext(fs.readFileSync(dir+file,'utf8'),c,{filename:file});
 // Manual UI requests should schedule one fresh observation, tested explicitly below.
 vm.runInContext('scheduleGitHubRead=async()=>{}',c);
 function snapshot(role='dev',cycle='consolevr-1.1.55.18-github-002'){
  const a={schema_version:1,cycle_id:cycle,billet:'1.1.55.18',source_sha:sha(1),etat:'termine',ferme:true,decision:'continuer',branche_source:'dev'};
  const l={...a,source_sha:sha(2),base_sha:a.source_sha,autorisation_commit_sha:sha(3)};
  const v={...l,examen:'complet',destination:'arch',resultat:'conforme',nombre_constats:0,constats:[]};
  snap={ok:true,head:sha(4),authorization:a,delivery:role==='dev'?null:l,verification:role==='arch'?v:null,report:'Aucune divergence constatée.',master:cycle,claims:[]};return snap;
 }
 return {c,route:(msg,sender,cb)=>listener(msg,sender,cb),get db(){return db},get emits(){return emits},snapshot,setMode:m=>mode=m,setReady:r=>ready=r,poll:()=>c.githubPoll(),D:vm.runInContext('Delivery',c),async message(msg){return new Promise((resolve,reject)=>listener(msg,{id:'ext'},r=>r.ok?resolve(r):reject(Error(r.error))));}};
}
module.exports={harness};
if(require.main===module)(async()=>{
 // Real select() advances dev -> qa -> arch; six scans cannot repeat any role.
 const h=await harness();
 for(const role of ['dev','qa','arch']){h.snapshot(role);for(let i=0;i<6;i++)await h.poll();assert.equal(h.emits.length,['dev','qa','arch'].indexOf(role)+1);}
 h.snapshot('dev','consolevr-1.1.55.19-github-001');await h.poll();assert.equal(h.emits.length,4);
 // Resume, save, stop/start and GitHub head changes retain the receipt.
 await h.c.plan(h.db.settings);await h.poll();assert.equal(h.emits.length,4);
 await h.c.saveSettings(h.db.settings);await h.poll();assert.equal(h.emits.length,4);
 await h.c.stop();await h.poll();await h.c.plan(h.db.settings);await h.poll();assert.equal(h.emits.length,4);
 // New destination gets exactly one transmission even while the old agent's claim remains.
 const last=h.emits.at(-1);const receipt=await h.D.read(last.attempt.receiptKey);
 const s=h.snapshot('dev','consolevr-1.1.55.19-github-001');s.head=sha(5);s.claims[0]={...s.authorization,role:'dev',prise_id:receipt.priseId,relais_commit_sha:sha(4),etat:'en_cours'};
 h.db.settings.devUrl='https://chatgpt.com/c/new-programmer';await h.poll();assert.equal(h.emits.length,5);for(let i=0;i<6;i++)await h.poll();assert.equal(h.emits.length,5);
 // DOM unavailable/busy before any attempt does not consume the relay.
 const b=await harness();b.snapshot();b.setReady(false);await b.poll();assert.equal(b.emits.length,0);b.setReady(true);await b.poll();assert.equal(b.emits.length,1);
 // Timeout after permission remains uncertain through repeated scans and restart.
 const u=await harness();u.snapshot();u.setMode('timeout');await u.poll();for(let i=0;i<6;i++)await u.poll();assert.equal(u.emits.length,1);
 await u.c.migrate();await u.poll();assert.equal(u.emits.length,1);
 u.setMode('success');let g=u.db.githubState;await u.message({type:'retryDelivery',receiptKey:g.receiptKey,receiptToken:g.receiptToken});await u.poll();assert.equal(u.emits.length,2);for(let i=0;i<6;i++)await u.poll();assert.equal(u.emits.length,2);
 // Atomic reservation and permission: only one caller can authorize a click.
 const q=await harness();const job={role:'dev',value:{cycle_id:'q',billet:'q',source_sha:sha(1)}};const dest=q.db.settings.devUrl,key=q.D.key(q.db.settings,job,dest);
 const entry={token:'t',role:'dev',destination:dest,activationId:'one'};
 const reservations=await Promise.all([q.D.reserve(key,entry),q.D.reserve(key,{...entry,token:'other'})]);assert.equal(reservations.filter(r=>r.allowed).length,1);
 const a={...entry,receiptKey:key,receiptToken:'t'};assert.equal((await q.D.permit(a,dest)).ok,true);assert.equal((await q.D.permit(a,dest)).ok,false);
 await q.D.recoverInterrupted();assert.equal((await q.D.read(key)).state,'uncertain');assert.equal((await q.D.reserve(key,entry)).allowed,false);
 // A retried token revokes an old delayed script; the next cycle is independent.
 let old=await q.D.read(key);await q.D.retry(key,old.token,null);assert.equal((await q.D.permit(a,dest)).ok,false);
 // Fresh worker context, not only browser onStartup: interrupted attempts stay uncertain.
 const fresh=await harness(q.db);assert.equal((await fresh.D.read(key)).state,'retry');
 const hanging=await harness();hanging.snapshot();const hk=hanging.D.key(hanging.db.settings,job,dest);await hanging.D.reserve(hk,entry);const restarted=await harness(hanging.db);assert.equal((await restarted.D.read(hk)).state,'uncertain');
 const persisted=await harness(h.db);persisted.snapshot('dev','consolevr-1.1.55.19-github-001');for(let i=0;i<6;i++)await persisted.poll();assert.equal(persisted.emits.length,0);
 // Actual DOM injector plus the real permit handler: concurrent calls cannot double-click.
 const dom=await harness();const dj={role:'dev',value:{cycle_id:'dom',billet:'dom',source_sha:sha(1)}};
 const dk=dom.D.key(dom.db.settings,dj,dest);await dom.D.reserve(dk,{token:'dom-token',role:'dev',destination:dest,activationId:'one',priseId:'generated'});
 const prefix=`Dépôt repo. Ton rôle : programmeur. Relais figé au commit ${sha(4)}, cycle dom, billet dom, source ${sha(1)}. Suite.`;
 const suffix=' Avant de commencer ton travail, publie sur main collaboration/programmeur/prise_en_charge.json avec ce contenu exact : {"prise_id":"draft-old"}. Puis accomplis l’étape autorisée et publie normalement son résultat et son signal final.';
 let clicks=0,posted=[];
 const editor={value:prefix+suffix,isConnected:true,getClientRects:()=>[{}],closest:()=>null};
 const button={isConnected:true,getClientRects:()=>[{}],getAttribute:()=>null,focus(){},scrollIntoView(){},click(){clicks++;editor.value='';posted=[{innerText:prefix+suffix}];}};
 dom.c.document={querySelector:s=>s.includes('prompt-textarea')?editor:s==='#composer-submit-button'?button:null,querySelectorAll:s=>s.includes('data-message-author-role')?posted:[]};
 dom.c.chrome.runtime.sendMessage=(msg,cb)=>msg.type==='composerPause'?cb({ok:true}):dom.route(msg,{id:'ext',tab:{url:dest}},cb);
 const da={role:'dev',activationId:'one',destination:dest,receiptKey:dk,receiptToken:'dom-token'};
 const first=dom.c.injectPrompt(prefix+suffix,prefix,da);const second=await dom.c.injectPrompt(prefix+suffix,prefix,da);
 assert.equal(second.status,'Transmission en cours');assert.equal((await first).status,'Clic effectué');assert.equal(clicks,1);assert.equal((await dom.D.read(dk)).priseId,'draft-old');
 assert.equal((await dom.c.injectPrompt(prefix+suffix,prefix,da)).status,'Déjà transmis');assert.equal(clicks,1);
 // Old 1.7.3 events migrate conservatively instead of retransmitting on upgrade.
 const l=await harness();l.snapshot();l.db.githubState={events:{['https://github.com/Tabernacle666/ConsoleVR|main|dev|consolevr-1.1.55.18-github-002']:{status:'incertain',destination:l.db.settings.devUrl,time:12}}};await l.poll();assert.equal(l.emits.length,0);assert.equal(l.db.githubState.retryAvailable,true);
 console.log('PASS: 6 scans par rôle = 1 envoi ; transition des 3 rôles ; nouveau cycle ; nouvelle conversation avec ancienne prise ; lecture/reprise/save/redémarrage ; indisponibilité avant envoi ; timeout ; réessai manuel unique ; réservation et permis atomiques ; migration 1.7.3.');
})().catch(e=>{console.error(e);process.exit(1)});
