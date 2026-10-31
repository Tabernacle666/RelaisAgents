'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm');
const {harness}=require('./delivery.test.cjs');
(async()=>{
 for(const phase of ['navigation','ready']){
  const h=await harness();
  h.db.settings.devFresh=true;
  h.db.settings.devTitle='Ancien titre de conversation';
  const oldUrl=h.db.settings.devUrl;
  const tab={id:1,url:'https://chatgpt.com/',title:'ChatGPT',status:'complete'};
  const originalGet=h.c.chrome.tabs.get;
  const originalQuery=h.c.chrome.tabs.query;
  const originalExec=h.c.chrome.scripting.executeScript;
  let navs=0,sends=0,appends=0;
  h.c.chrome.tabs.get=async id=>id===1?{...tab}:originalGet(id);
  h.c.chrome.tabs.query=async()=>[...(await originalQuery()).filter(x=>x.id!==1),{...tab}];
  h.c.chrome.tabs.update=async()=>{navs++;throw Error('Ne doit pas rouvrir un nouveau fil');};
  h.c.chrome.scripting.executeScript=async arg=>{
   if(arg.func.name==='chooseHigh')throw Error('Sélecteur GPT-6 High indisponible dans cette version de la page');
   if(arg.func.name==='injectPrompt'){
    assert.equal(arg.target.tabId,1,'onglet rôle inchangé');
    const a=arg.args[2];
    const permit=await h.D.permit(a,tab.url,tab.id);
    assert.equal(permit.ok,true,'autorisation dans le même onglet');
    if(a.fresh){
     sends++;
     tab.url='https://chatgpt.com/c/new-dev-'+phase;
     // ChatGPT peut garder le titre générique pendant plusieurs secondes.
     tab.title='ChatGPT';
    }else{appends++;}
    return [{result:{status:'Clic effectué',detail:'Envoyé'}}];
   }
   return originalExec(arg);
  };
  const snap=h.snapshot('dev','consolevr-1.1.55.61-github-001');
  const job=vm.runInContext('GitHubRelay',h.c).select(snap);
  const F=vm.runInContext('FreshChat',h.c);
  h.db.freshPending={dev:{role:'dev',jobId:F.jobId(h.db.settings,job),activationId:h.db.runtime.activationId,tabId:tab.id,previousUrl:oldUrl,previousTitle:h.db.settings.devTitle,phase,createdAt:Date.now()}};
  await h.poll();
  assert.equal(navs,0,'reprise sans renavigation');
  assert.equal(sends,1,JSON.stringify(h.db.githubState));
  assert.equal(h.db.settings.devUrl,tab.url,'URL /c/ acquise malgré le titre temporaire');
  assert.equal(h.db.settings.devTitle,'','titre provisoire non sauvegardé comme identité');
  assert.deepEqual(Object.keys(h.db.freshPending||{}),[]);
  for(let i=0;i<2;i++)await h.poll();
  assert.equal(sends,1,'aucun doublon sur le même cycle');
  h.db.settings.devFresh=false;
  h.snapshot('dev','consolevr-1.1.55.62-github-001');
  // La demande suivante doit être APPEND, par URL et onglet, sans titre stable.
  await h.poll();
  assert.equal(appends,1,JSON.stringify(h.db.githubState));
  assert.equal(navs,0,'pas de nouvelle navigation après case décochée');
  assert.equal(h.db.githubState.selectedRole,'dev');
  console.log('PASS reprise',phase,'avec titre ChatGPT, modèle non vérifiable, envoi unique, URL canonique et fil persistant.');
 }
})().catch(e=>{console.error(e);process.exitCode=1});
